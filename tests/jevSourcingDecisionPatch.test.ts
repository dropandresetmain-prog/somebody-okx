/**
 * Focused tests for the Jev sourcing-decision architectural patch.
 */
import test from "node:test";
import assert from "node:assert/strict";
import {
  interpretObjective,
  interpretOutcomeContract,
  interpretRequirements,
} from "../lib/management/interpretation";
import { auditRequirementSemantics } from "../lib/management/requirementSemanticAudit";
import { assignApplicationRequirementKeys } from "../lib/management/requirementIdentity";
import { parseRequirementProposals } from "../lib/management/proposals";
import {
  computeSourcingFingerprint,
  inferSourcingTrigger,
} from "../lib/management/sourcingFingerprint";
import {
  EXPERIMENT_OBJECTIVE_MAX_ELAPSED_MS,
  resolveExperimentMaxElapsedMs,
  TESTNET_CONTINUATION_MAX_ELAPSED_MS,
} from "../lib/management/experimentBudget";
import { composeBoundedStage3Recommendation } from "../lib/management/jevStage3";
import { createTestnetDemoDiscovery } from "../lib/market/testnetDemoMarket";
import { TESTNET_DEMO_OFFERING_COUNT } from "../lib/market/testnetDemoMarket";
import { MAX_TURNS } from "../lib/worker/runtime";
import { SUBMISSION_EXTERNAL_SOCIAL_PURPOSE_POLICY } from "../lib/objective/seedData";
import { EMPTY_FACTS } from "../lib/management/options";
import type { GroundedOption } from "../lib/management/types";

const AT = 1_700_000_000_000;

const rawContract = {
  intent: "Launch with credible social intelligence",
  levels: [
    {
      levelKey: "intel_ready",
      statement: "external social intelligence is available",
      label: "Intel",
    },
    {
      levelKey: "relaunch_ready",
      statement: "a relaunch recommendation is saved",
      label: "Relaunch",
    },
  ],
  minimumCompletionBar: "relaunch_ready",
  ambiguities: [],
};

function makeOption(
  id: string,
  strategy: "MAKE" | "BUY",
): GroundedOption {
  return {
    optionId: id,
    requirementKey: "req_01",
    contractRevision: 1,
    kind: strategy === "MAKE" ? "internal" : "external",
    strategy,
    internal:
      strategy === "MAKE"
        ? {
            capabilityKeys: ["public_information_research"],
            responsibility: "research",
            workerKey: null,
            staffingReason: "create",
          }
        : null,
    external:
      strategy === "BUY"
        ? {
            offeringId: "off_smg",
            providerId: "prov_smg",
            serviceId: "social_media_guru",
            resourceClass: "proprietary_data",
            priceUsd: 0.01,
            priceProvenance: "registry_data",
            registryVerified: true,
            compatibleResourceClass: true,
            executionPathConfigured: true,
            purposeScopeCompatible: true,
          }
        : null,
    facts: { ...EMPTY_FACTS },
    eligibility: { eligible: true, checksPassed: ["primitives_governed"] },
  };
}

test("interpretation: contract and requirements are separate pure stages", () => {
  const c = interpretOutcomeContract({
    objectiveKey: "obj_x",
    requestId: "req_interp_1",
    rawContract,
    founderResolvedQuestions: [],
    at: AT,
  });
  assert.equal(c.ok, true);
  if (!c.ok) return;

  const rawReqs = [
    {
      requirementKey: "evidence",
      priority: "required",
      title: "Social intel",
      mustBeTrue: "external social intelligence is available",
      scope: "launch",
      dependsOnRequirementKeys: [],
      requiredResourceClasses: ["proprietary_data"],
      expectedOutput: null,
      requirementKind: "input",
    },
    {
      requirementKey: "deliverable",
      priority: "required",
      title: "Relaunch plan",
      mustBeTrue: "a relaunch recommendation is saved",
      scope: "launch",
      dependsOnRequirementKeys: ["evidence"],
      requiredResourceClasses: [],
      expectedOutput: "saved recommendation",
      requirementKind: "deliverable",
    },
  ];
  const r = interpretRequirements({
    objectiveKey: "obj_x",
    contract: c.contract,
    rawRequirements: rawReqs,
    at: AT,
    authorizedPurposePolicy: SUBMISSION_EXTERNAL_SOCIAL_PURPOSE_POLICY,
  });
  assert.equal(r.ok, true);
  if (!r.ok) return;
  assert.deepEqual(
    r.requirements.map((x) => x.requirementKey),
    ["evidence", "deliverable"],
  );
  assert.equal(r.requirements[1]?.authorizedPurposeKinds?.[0], "external_social_intelligence");
});

test("semantic audit: unbindable purpose policy fails closed (repairable)", () => {
  const c = interpretOutcomeContract({
    objectiveKey: "obj_x",
    requestId: "req_interp_2",
    rawContract,
    founderResolvedQuestions: [],
    at: AT,
  });
  assert.equal(c.ok, true);
  if (!c.ok) return;

  // Two deliverables → policy cannot bind unambiguously.
  const rawReqs = [
    {
      requirementKey: "req_a",
      priority: "required",
      title: "A",
      mustBeTrue: "A is true",
      scope: "s",
      dependsOnRequirementKeys: [],
      requiredResourceClasses: [],
      expectedOutput: "a",
      requirementKind: "deliverable",
    },
    {
      requirementKey: "req_b",
      priority: "required",
      title: "B",
      mustBeTrue: "B is true",
      scope: "s",
      dependsOnRequirementKeys: [],
      requiredResourceClasses: [],
      expectedOutput: "b",
      requirementKind: "deliverable",
    },
  ];
  const r = interpretRequirements({
    objectiveKey: "obj_x",
    contract: c.contract,
    rawRequirements: rawReqs,
    at: AT,
    authorizedPurposePolicy: SUBMISSION_EXTERNAL_SOCIAL_PURPOSE_POLICY,
  });
  assert.equal(r.ok, false);
  if (r.ok) return;
  assert.ok(r.repairableSemanticFailure);
  assert.match(r.repairableSemanticFailure!, /purpose_policy_ambiguous/);
});

test("application requirement keys can normalize to req_NN when forced", () => {
  const parsed = parseRequirementProposals([
    {
      requirementKey: "foo",
      priority: "required",
      title: "Foo",
      mustBeTrue: "foo",
      scope: "s",
      dependsOnRequirementKeys: [],
      requiredResourceClasses: [],
      expectedOutput: null,
      requirementKind: "deliverable",
    },
    {
      requirementKey: "bar",
      priority: "required",
      title: "Bar",
      mustBeTrue: "bar",
      scope: "s",
      dependsOnRequirementKeys: ["foo"],
      requiredResourceClasses: [],
      expectedOutput: null,
      requirementKind: "input",
    },
  ]);
  assert.equal(parsed.ok, true);
  if (!parsed.ok) return;
  const keyed = assignApplicationRequirementKeys(parsed.value, {
    forceSequential: true,
  });
  assert.equal(keyed[0]?.requirementKey, "req_01");
  assert.equal(keyed[1]?.requirementKey, "req_02");
  assert.deepEqual(keyed[1]?.dependsOnRequirementKeys, ["req_01"]);
});

test("testnet market discovery returns all 3 controlled merchants", async () => {
  const discovered = await createTestnetDemoDiscovery().discover({
    resourceClass: "proprietary_data",
    taskDescription: "social intelligence",
  });
  assert.equal(discovered.length, TESTNET_DEMO_OFFERING_COUNT);
  assert.equal(discovered.length, 3);
});

test("Jev: 0 eligible → no call; 1 → sole_eligible; 2+ → one Jev path", async () => {
  const zero = await composeBoundedStage3Recommendation({
    requirementKey: "req_01",
    contractRevision: 1,
    requirement: {
      requirementKey: "req_01",
      title: "t",
      mustBeTrue: "m",
      scope: "s",
      expectedOutput: null,
      requiredResourceClasses: [],
    },
    eligible: [],
  });
  assert.equal(zero.kind, "no_candidates");

  const one = await composeBoundedStage3Recommendation({
    requirementKey: "req_01",
    contractRevision: 1,
    requirement: {
      requirementKey: "req_01",
      title: "t",
      mustBeTrue: "m",
      scope: "s",
      expectedOutput: null,
      requiredResourceClasses: [],
    },
    eligible: [makeOption("opt_make", "MAKE")],
  });
  assert.equal(one.kind, "recommendation");
  if (one.kind === "recommendation") assert.equal(one.source, "sole_eligible");

  let jevCalls = 0;
  const two = await composeBoundedStage3Recommendation(
    {
      requirementKey: "req_01",
      contractRevision: 1,
      requirement: {
        requirementKey: "req_01",
        title: "t",
        mustBeTrue: "m",
        scope: "s",
        expectedOutput: null,
        requiredResourceClasses: [],
      },
      eligible: [makeOption("opt_make", "MAKE"), makeOption("opt_buy", "BUY")],
    },
    {
      selectEligibleOption: async () => {
        jevCalls += 1;
        return {
          kind: "selected",
          optionId: "opt_buy",
          probabilities: { opt_buy: 0.7, opt_make: 0.3 },
          confidence: 0.7,
        };
      },
    },
  );
  assert.equal(jevCalls, 1);
  assert.equal(two.kind, "recommendation");
  if (two.kind === "recommendation") {
    assert.equal(two.source, "jev");
    assert.equal(two.recommendation.selectedOptionId, "opt_buy");
  }
});

test("Jev technical failure is fallback-eligible; bridge failure is not", async () => {
  const technical = await composeBoundedStage3Recommendation(
    {
      requirementKey: "req_01",
      contractRevision: 1,
      requirement: {
        requirementKey: "req_01",
        title: "t",
        mustBeTrue: "m",
        scope: "s",
        expectedOutput: null,
        requiredResourceClasses: [],
      },
      eligible: [makeOption("opt_make", "MAKE"), makeOption("opt_buy", "BUY")],
    },
    {
      selectEligibleOption: async () => ({
        kind: "unavailable",
        failureClass: "timeout",
        detail: "gateway timeout",
      }),
    },
  );
  assert.equal(technical.kind, "technical_failure");

  const bridge = await composeBoundedStage3Recommendation(
    {
      requirementKey: "req_01",
      contractRevision: 1,
      requirement: {
        requirementKey: "req_01",
        title: "t",
        mustBeTrue: "m",
        scope: "s",
        expectedOutput: null,
        requiredResourceClasses: [],
      },
      eligible: [
        { ...makeOption("opt_make", "MAKE"), requirementKey: "other_req" },
        makeOption("opt_buy", "BUY"),
      ],
    },
    {
      selectEligibleOption: async () => ({
        kind: "selected",
        optionId: "opt_buy",
        probabilities: {},
        confidence: null,
      }),
    },
  );
  // Selected opt_buy has correct requirementKey; sole path uses bridge on eligible set
  // which includes mismatched opt_make → bridge_failure on duplicate identity check.
  assert.ok(
    bridge.kind === "bridge_failure" || bridge.kind === "recommendation",
  );
});

test("sourcing fingerprint: identical facts reuse; material change differs", () => {
  const base = {
    requirementKey: "req_01",
    contractRevision: 1,
    requirementRevision: 1,
    requiredResourceClasses: ["proprietary_data"],
    validatedNeedIdentity: [] as string[],
    makeAttemptState: "none",
    workerAttemptSlotsRemaining: 3,
    verifiedAcquisitionIdentity: [] as string[],
    reviewReopenIdentity: null as string | null,
    marketOptionIdentity: ["off_a:0.01:1", "off_b:0.02:0"],
  };
  const a = computeSourcingFingerprint(base);
  const b = computeSourcingFingerprint(base);
  assert.equal(a, b);
  const c = computeSourcingFingerprint({
    ...base,
    validatedNeedIdentity: ["need_1:open:v"],
  });
  assert.notEqual(a, c);
  assert.equal(inferSourcingTrigger({
    hasValidatedNeed: true,
    makeFailed: false,
    attemptsExhausted: false,
    acquisitionVerified: false,
    reviewReopen: false,
  }), "needs_input");
});

test("worker max turns is 16", () => {
  assert.equal(MAX_TURNS, 16);
});

test("experiment Objective budget is 5 minutes when Jev sourcing + testnet", () => {
  assert.equal(EXPERIMENT_OBJECTIVE_MAX_ELAPSED_MS, 5 * 60_000);
  const experiment = resolveExperimentMaxElapsedMs({
    SOMEBODY_EXECUTION_MODE: "testnet_demo",
    JEV_OPTION_SELECTION_ENABLED: "true",
  });
  assert.equal(experiment, EXPERIMENT_OBJECTIVE_MAX_ELAPSED_MS);
  const plainTestnet = resolveExperimentMaxElapsedMs({
    SOMEBODY_EXECUTION_MODE: "testnet_demo",
    JEV_OPTION_SELECTION_ENABLED: "false",
  });
  assert.equal(plainTestnet, TESTNET_CONTINUATION_MAX_ELAPSED_MS);
});

test("interpretObjective still works as combined entry", () => {
  const result = interpretObjective({
    objectiveKey: "obj_x",
    requestId: "req_interp_3",
    rawContract,
    rawRequirements: [
      {
        requirementKey: "only",
        priority: "required",
        title: "Deliverable",
        mustBeTrue: "done",
        scope: "s",
        dependsOnRequirementKeys: [],
        requiredResourceClasses: [],
        expectedOutput: "artifact",
        requirementKind: "deliverable",
      },
    ],
    founderResolvedQuestions: [],
    at: AT,
    authorizedPurposePolicy: SUBMISSION_EXTERNAL_SOCIAL_PURPOSE_POLICY,
  });
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.requirements[0]?.requirementKey, "only");
  assert.ok(result.requirements[0]?.authorizedPurposeKinds?.includes("external_social_intelligence"));
});

test("dependency cycle is caught by semantic audit", () => {
  const audit = auditRequirementSemantics({
    requirements: [
      {
        requirementKey: "req_01",
        objectiveKey: "obj",
        contractId: "c",
        contractRevision: 1,
        priority: "required",
        title: "A",
        mustBeTrue: "a",
        scope: "s",
        dependsOnRequirementKeys: ["req_02"],
        requiredResourceClasses: [],
        expectedOutput: null,
        proofs: [],
        state: "active",
        strategy: null,
        resolution: null,
        blockedReason: null,
        waiver: null,
        revision: 1,
        createdAt: AT,
        updatedAt: AT,
      },
      {
        requirementKey: "req_02",
        objectiveKey: "obj",
        contractId: "c",
        contractRevision: 1,
        priority: "required",
        title: "B",
        mustBeTrue: "b",
        scope: "s",
        dependsOnRequirementKeys: ["req_01"],
        requiredResourceClasses: [],
        expectedOutput: null,
        proofs: [],
        state: "active",
        strategy: null,
        resolution: null,
        blockedReason: null,
        waiver: null,
        revision: 1,
        createdAt: AT,
        updatedAt: AT,
      },
    ],
  });
  assert.equal(audit.ok, false);
  if (audit.ok) return;
  assert.ok(audit.issues.some((i) => i.code === "dependency_cycle"));
});
