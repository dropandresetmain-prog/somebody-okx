// M6.1 Blocks 1–2 — serial manager–execution protocol (m61_serial_v1).
//
// Focused production-seam proofs for the serial MAKE/BUY loop:
//   no compound HYBRID, post-acquisition redecide, artifact mutation only when
//   proofs demand it, scoped acquisition consume, purpose-scoped needs,
//   stale/duplicate refuse, historical INPUT_BLOCKED ≠ yield, completion gate
//   recomputes, denied budget/offerings stop truthfully, and a thin
//   interpret→decide→authorize→dispatch chain without seeded outcomes.
//
// Does NOT declare Gate 1 live PASS.
import test, { mock, after as afterAll } from "node:test";
import assert from "node:assert/strict";
import { convexTest } from "convex-test";
import schema from "../convex/schema";
import {
  applyInterpretation,
  applyDecision,
  runManagementPass,
} from "../convex/management";
import { initBudget, putContract, putIntent, putRequirement } from "../convex/internal/workforce";
import { readWorkerObservation, updateCompanyArtifact } from "../convex/objectives";
import { buildOutcomeContract, buildRequirement } from "../lib/management/contract";
import { runManagerialDecisionPass } from "../lib/management/decision";
import type { GroundingContext, RegistryOffering } from "../lib/management/decision";
import { evaluateCompletionGate } from "../lib/management/completion";
import { NO_PROOF_FACTS } from "../lib/management/requirements";
import {
  reduceManagementState,
  type ReducerFacts,
} from "../lib/management/reducer";
import {
  assignmentRequiresArtifactMutation,
  isSerialInputRequirement,
  M61_SERIAL_V1,
} from "../lib/management/executionProtocol";
import { optionIdFor, factValue } from "../lib/management/options";
import type { EligibilityFacts } from "../lib/management/options";
import {
  verifiedAcquisitionCoversNeed,
  validatedMissingClassesAfterAcquisitions,
} from "../lib/objective/inputDiagnosis";
import {
  createResourceNeed,
  computeNeedDedupeKey,
} from "../lib/objective/resourceNeed";
import { createWorkContract, createWorkerSpec } from "../lib/workforce";
import { CP2_DECISION_PASS_FIELDS, CP2_REQUIREMENT_FIELDS } from "./helpers/cp2Requirement";
import type {
  Assignment,
  CompletionProposal,
  EconomicFacts,
  ExecutionIntent,
  OutcomeContract,
  Requirement,
  WorkerRecord,
} from "../lib/management/types";
import type { ExternalAcquisitionResult, ObjectiveRecord } from "../lib/objective/types";

const modules = {
  "../convex/schema.ts": () => import("../convex/schema"),
  "../convex/objectiveValidators.ts": () => import("../convex/objectiveValidators"),
  "../convex/managementValidators.ts": () => import("../convex/managementValidators"),
  "../convex/workforceGuards.ts": () => import("../convex/workforceGuards"),
  "../convex/objectives.ts": () => import("../convex/objectives"),
  "../convex/objectiveRunner.ts": () => import("../convex/objectiveRunner"),
  "../convex/internal/workforce.ts": () => import("../convex/internal/workforce"),
  "../convex/management.ts": () => import("../convex/management"),
  "../convex/_generated/api.d.ts": () => import("../convex/_generated/api"),
  "../convex/_generated/server.d.ts": () => import("../convex/_generated/server"),
  "../convex/_generated/dataModel.d.ts": () => import("../convex/_generated/dataModel"),
};

mock.timers.enable({ apis: ["setTimeout"] });
afterAll(() => mock.timers.reset());

const now = 1_976_000_000_000;
const REQ = "req_serial";

type Backend = ReturnType<typeof convexTest>;
type Handler = { _handler: (c: unknown, a: Record<string, unknown>) => Promise<unknown> };

// ── Shared decision-pass fixtures (mirrors managementDecision.test.ts) ───────

const contractResult = buildOutcomeContract({
  objectiveKey: "obj_serial_dec",
  contractId: "contract_serial_dec",
  revision: 1,
  parsed: {
    intent: "serial manager loop",
    levels: [{ levelKey: "goal", order: 1, statement: "goal holds", label: "Goal" }],
    minimumCompletionBar: "goal",
    ambiguities: [],
  },
  requestId: "req_serial_dec",
  founderResolvedQuestions: [],
  at: now,
});
assert.equal(contractResult.ok, true);
const decContract = contractResult.ok
  ? contractResult.contract
  : (() => {
      throw new Error("contract");
    })();

function worker(overrides: Partial<WorkerRecord> = {}): WorkerRecord {
  return {
    workerKey: "worker_growth_launch_operations",
    displayName: "Ops generalist",
    capabilityKeys: ["growth_launch_operations"],
    dynamicCapabilities: [],
    responsibility: "run growth operations",
    lifecycle: "available",
    reservedBy: null,
    verifiedAssignments: [],
    contextRefs: ["launch_page"],
    createdByObjective: null,
    createdAt: now - 1000,
    updatedAt: now - 1000,
    ...overrides,
  };
}

const internalFacts: EconomicFacts = {
  scope: null,
  expectedQuality: null,
  setupMinutes: null,
  queueMinutes: null,
  executionMinutes: factValue(30, "measured", "high", "obs_internal", now),
  verificationMinutes: null,
  internalCostUsd: factValue(0.4, "measured", "high", "obs_internal", now),
  externalPriceUsd: null,
  reliability: null,
  availability: factValue("free", "measured", "high", "obs_internal", now),
  reuseValue: null,
  externalAdvantage: null,
};

function offering(overrides: Partial<RegistryOffering> = {}): RegistryOffering {
  return {
    offeringId: "off_market_research_sprint",
    providerId: "prov_research_co",
    serviceId: "svc_research_sprint",
    resourceClass: "public_web",
    priceUsd: 1.5,
    priceProvenance: "provider_quote",
    registryVerified: true,
    compatibleResourceClass: true,
    ...overrides,
  };
}

function offeringFacts(priceUsd: number | null): EconomicFacts {
  return {
    scope: null,
    expectedQuality:
      priceUsd !== null ? factValue("comparable", "provider_quote", "medium", "quote_1", now) : null,
    setupMinutes: factValue(0, "provider_quote", "medium", "quote_1", now),
    queueMinutes: factValue(10, "provider_quote", "medium", "quote_1", now),
    executionMinutes: factValue(90, "provider_quote", "medium", "quote_1", now),
    verificationMinutes: null,
    internalCostUsd: null,
    externalPriceUsd:
      priceUsd !== null ? factValue(priceUsd, "provider_quote", "high", "quote_1", now) : null,
    reliability: factValue("proven_once", "registry_data", "medium", "registry_1", now),
    availability: factValue("free", "provider_quote", "medium", "quote_1", now),
    reuseValue: null,
    externalAdvantage: factValue("speed", "provider_quote", "medium", "quote_1", now),
  };
}

function baseEligibilityFacts(overrides: Partial<EligibilityFacts> = {}): EligibilityFacts {
  return {
    requiredResourceClasses: [
      "llm_reasoning",
      "public_web",
      "ordinary_compute",
      "company_records",
      "company_tools",
    ],
    controlledResourceClasses: [
      "llm_reasoning",
      "public_web",
      "ordinary_compute",
      "company_records",
      "company_tools",
    ],
    deadlineAt: null,
    now,
    estimatedMinutes: null,
    requiresMandatoryProof: false,
    proofAvailable: true,
    workerAvailable: null,
    spendAuthorityUsd: 25,
    budgetRemainingUsd: 50,
    ...overrides,
  };
}

function staffingRequest(inventory: readonly WorkerRecord[], overrides = {}) {
  return {
    objectiveKey: "obj_serial_dec",
    requirementKey: "page_live",
    requiredCapabilityKeys: ["growth_launch_operations"],
    requiredPermissions: ["update_company_artifact"],
    expectedHoldMs: 60 * 60 * 1000,
    now,
    neededContextRefs: ["launch_page"],
    parallelismNeeded: 1,
    specializationNeeded: false,
    inventory,
    creationAllowed: true,
    ...overrides,
  };
}

function pass(overrides: Partial<Parameters<typeof runManagerialDecisionPass>[0]>) {
  return runManagerialDecisionPass({
    objectiveKey: "obj_serial_dec",
    contract: decContract,
    currentContractRevision: 1,
    requirementKey: "page_live",
    requirementTitle: "Landing page is live",
    mustBeTrue: "the page is reachable",
    priority: "required",
    artifactKeyForInternalProof: "launch_page",
    staffing: staffingRequest([worker()]),
    grounding: {
      discovered: [],
      internalFacts,
      factsForOffering: () => offeringFacts(1.5),
    },
    eligibilityFacts: baseEligibilityFacts(),
    recommend: async () => ({}),
    at: now,
    decisionId: "dec_serial_1",
    spendAuthorityUsd: 25,
    spendApprovalId: "appr_serial_1",
    externalAuthority: "m3_available_bounded",
    waiverRequested: false,
    ...CP2_DECISION_PASS_FIELDS,
    ...overrides,
  });
}

const bothHalvesGrounding: GroundingContext = {
  discovered: [offering()],
  internalFacts,
  factsForOffering: () => offeringFacts(1.5),
};

// ── 1–2. HYBRID park vs legacy ───────────────────────────────────────────────

test("serialManagerProtocol=true: HYBRID is not grounded when both halves exist", async () => {
  const result = await pass({
    serialManagerProtocol: true,
    grounding: bothHalvesGrounding,
    recommend: async (eligible) => {
      assert.equal(
        eligible.some((o) => o.kind === "hybrid" || o.strategy === "HYBRID"),
        false,
        "HYBRID must not be offered on serial path",
      );
      const make = eligible.find((o) => o.kind === "internal" && o.eligibility.eligible);
      assert.ok(make, "MAKE half still eligible");
      return {
        requirementKey: "page_live",
        contractRevision: 1,
        selectedOptionId: make!.optionId,
        rationale: "serial MAKE only",
      };
    },
  });
  assert.equal(result.options.some((o) => o.strategy === "HYBRID" || o.kind === "hybrid"), false);
  assert.equal(result.authorization.kind, "authorized");
  if (result.authorization.kind === "authorized") {
    assert.equal(result.authorization.strategy, "MAKE");
  }
});

test("legacy path (serialManagerProtocol absent/false): HYBRID still grounded", async () => {
  let hybridId = "";
  const result = await pass({
    serialManagerProtocol: false,
    grounding: bothHalvesGrounding,
    recommend: async (eligible) => {
      const hybrid = eligible.find((o) => o.kind === "hybrid");
      assert.ok(hybrid, "legacy path must still form HYBRID");
      hybridId = hybrid!.optionId;
      return {
        requirementKey: "page_live",
        contractRevision: 1,
        selectedOptionId: hybridId,
        rationale: "legacy compound HYBRID",
      };
    },
  });
  assert.ok(result.options.some((o) => o.strategy === "HYBRID"));
  assert.equal(result.authorization.kind, "authorized");
  if (result.authorization.kind === "authorized") {
    assert.equal(result.authorization.strategy, "HYBRID");
  }
});

// ── 3. Post-acquisition release → decide_requirement ─────────────────────────

function serialContract(key: string): OutcomeContract {
  const built = buildOutcomeContract({
    objectiveKey: key,
    contractId: `contract_${key}`,
    revision: 1,
    parsed: {
      intent: "relaunch after acquisition",
      levels: [
        {
          levelKey: "artifact",
          order: 1,
          statement: "artifact advanced with acquired evidence",
          label: "Artifact",
        },
      ],
      minimumCompletionBar: "artifact",
      ambiguities: [],
    },
    requestId: "serial_postacq",
    founderResolvedQuestions: [],
    at: now,
  });
  assert.ok(built.ok);
  if (!built.ok) throw new Error("contract");
  return built.contract;
}

function nonInputOnlyRequirement(key: string, contract: OutcomeContract): Requirement {
  return {
    requirementKey: REQ,
    objectiveKey: key,
    contractId: contract.contractId,
    contractRevision: 1,
    priority: "required",
    title: "Artifact advanced after acquisition",
    mustBeTrue: "company artifact reflects verified acquisition",
    scope: "owned then external if needed",
    ...CP2_REQUIREMENT_FIELDS,
    dependsOnRequirementKeys: [],
    requiredResourceClasses: ["proprietary_data"],
    expectedOutput: "artifact version bump",
    proofs: [
      {
        proofKey: "artifact_v2",
        description: "artifact advanced",
        proofKind: "company_artifact_version",
        params: { artifactKey: "launch/page-message", minVersion: 2 },
      },
      {
        proofKey: "obs",
        description: "observation",
        proofKind: "application_observation",
        params: {},
      },
    ],
    state: "active",
    // Cleared after releaseSerialAcquisitionForReassessment
    strategy: null,
    resolution: null,
    blockedReason: null,
    waiver: null,
    revision: 1,
    createdAt: now,
    updatedAt: now,
  };
}

function verifiedBuyIntent(key: string): ExecutionIntent {
  return {
    intentId: `int_${key}`,
    idempotencyKey: `idem_${key}`,
    objectiveKey: key,
    requirementKey: REQ,
    contractRevision: 1,
    decisionId: `dec_${key}`,
    kind: "external_acquisition",
    strategy: "BUY",
    target: {
      offeringId: "2135:newsliquid_twitter_search",
      providerId: "2135",
      serviceId: "newsliquid_twitter_search",
      resourceClass: "proprietary_data",
      endpointRef: null,
    },
    terms: {
      priceUsd: 2,
      priceProvenance: "provider_quote",
      requiresApproval: true,
      approvalId: `grant_${key}`,
    },
    state: "verified",
    attempts: 1,
    lastEventId: "evt_v",
    resultEvidenceId: `sim_result_${key}`,
    verificationEvidenceId: `sim_verification_${key}`,
    boundaryNote: "verified simulation",
    createdAt: now - 5_000,
    updatedAt: now,
  };
}

test("serial post-acq: cleared strategy + verified BUY + non-input-only → decide_requirement", () => {
  const key = "obj_serial_postacq";
  const contract = serialContract(key);
  const requirement = nonInputOnlyRequirement(key, contract);
  const intent = verifiedBuyIntent(key);
  const facts: ReducerFacts = {
    contract,
    currentContractRevision: 1,
    requirements: [requirement],
    groundedByRequirement: new Map(),
    assignments: [],
    intents: [intent],
    budgetVerdict: { ok: true },
    pendingApproval: null,
    completionProposal: null,
    at: now,
  };
  const r = reduceManagementState(facts);
  assert.equal(r.action.kind, "decide_requirement");
  assert.equal(
    (r.action as { requirementKey: string }).requirementKey,
    REQ,
  );
});

test("isSerialInputRequirement: explicit kind beats proof shape", () => {
  assert.equal(
    isSerialInputRequirement({
      requirementKind: "deliverable",
      proofs: [{ proofKind: "verified_external_result" }],
    }),
    false,
    "deliverable with only external-result proofs is NOT input",
  );
  assert.equal(
    isSerialInputRequirement({
      requirementKind: "input",
      proofs: [{ proofKind: "application_observation" }],
    }),
    true,
  );
  // Legacy omit → proof-derived
  assert.equal(
    isSerialInputRequirement({
      proofs: [{ proofKind: "verified_external_result" }],
    }),
    true,
  );
  assert.equal(
    isSerialInputRequirement({
      proofs: [
        { proofKind: "verified_external_result" },
        { proofKind: "application_observation" },
      ],
    }),
    false,
  );
});

/**
 * Production seam: real serial DELIVERABLE requirement → authorize BUY →
 * verified acquisition → runManagementPass. Strategy must clear for
 * reassessment; Requirement must NOT become satisfied. Does not pre-clear
 * strategy (the circular isInputOnlyRequirement bug).
 */
test("production seam: serial DELIVERABLE + verified BUY → release for redecide, not satisfied", async () => {
  const t = convexTest(schema, modules);
  const key = "obj_serial_buy_deliverable";
  const reqKey = "req_relaunch";
  const artifactKey = "launch/page-message";

  await t.mutation(async (ctx) => {
    await ctx.db.insert("objectives", {
      key,
      data: {
        key,
        request: "Diagnose weak launch messaging and prepare a better relaunch",
        createdAt: now,
        updatedAt: now,
        state: "executing",
        activity: "BUY authorized for deliverable",
        plan: null,
        workItems: [],
        run: null,
        result: null,
        companyArtifacts: [
          {
            key: artifactKey,
            version: 1,
            content: "seed headline",
            history: [],
          },
        ],
        acquisitionResults: [
          {
            intentId: `int_${key}`,
            requirementKey: reqKey,
            contractRevision: 1,
            resultEvidenceId: `sim_result_${key}`,
            provenance: "simulation",
            providerId: "2135",
            serviceId: "newsliquid_twitter_search",
            offeringId: "2135:newsliquid_twitter_search",
            resourceClass: "proprietary_data",
            content: "SIMULATED audience messaging evidence",
            responseHash: "hash_deliverable",
            recordedAt: now,
            verifiedAt: now,
          },
        ],
        management: {
          contractId: null,
          controlNotes: [],
          executionProtocol: M61_SERIAL_V1,
        },
      } as never,
    });
  });
  await t.mutation(async (ctx) =>
    (initBudget as unknown as Handler)._handler(ctx, { objectiveKey: key, at: now }),
  );

  // Interpret with explicit deliverable kind (production parse path).
  const interpreted = (await t.mutation(async (ctx) =>
    (applyInterpretation as unknown as Handler)._handler(ctx, {
      objectiveKey: key,
      requestId: `interpret_${key}`,
      rawContract: {
        intent: "deliver a relaunch recommendation",
        levels: [
          {
            levelKey: "relaunch",
            order: 1,
            statement: "a saved relaunch recommendation is on record",
            label: "Relaunch",
          },
        ],
        minimumCompletionBar: "relaunch",
        ambiguities: [],
      },
      rawRequirements: [
        {
          requirementKey: reqKey,
          priority: "required",
          title: "Relaunch recommendation delivered",
          mustBeTrue: "a versioned relaunch recommendation artifact is saved",
          scope: "founder-facing deliverable",
          expectedOutput: "saved relaunch recommendation",
          requirementKind: "deliverable",
          requiredResourceClasses: ["proprietary_data"],
        },
      ],
      founderResolvedQuestions: [],
      at: now,
    }),
  )) as { ok: boolean; errors?: string[] };
  assert.equal(interpreted.ok, true, interpreted.errors?.join("; "));

  const afterInterpret = await t.query(async (ctx) => {
    const rows = await ctx.db
      .query("requirements")
      .withIndex("by_objectiveKey", (q) => q.eq("objectiveKey", key))
      .collect();
    return rows.map((r) => (r as { data: Requirement }).data);
  });
  assert.equal(afterInterpret[0]!.requirementKind, "deliverable");
  assert.equal(afterInterpret[0]!.strategy, null);
  assert.deepEqual(afterInterpret[0]!.proofs, []);

  // Authorize BUY via production buildRequirement (strategy bound, proofs from kind).
  const contractRow = await t.query(async (ctx) => {
    const rows = await ctx.db
      .query("outcomeContracts")
      .withIndex("by_objective", (q) => q.eq("objectiveKey", key))
      .collect();
    return (rows[0] as { data: OutcomeContract }).data;
  });
  const bound = buildRequirement(
    {
      objectiveKey: key,
      contract: contractRow,
      proposed: {
        requirementKey: reqKey,
        priority: "required",
        title: "Relaunch recommendation delivered",
        mustBeTrue: "a versioned relaunch recommendation artifact is saved",
        scope: "founder-facing deliverable",
        dependsOnRequirementKeys: [],
        requiredResourceClasses: ["proprietary_data"],
        expectedOutput: "saved relaunch recommendation",
        requirementKind: "deliverable",
      },
      artifactKeyForInternalProof: artifactKey,
      at: now,
    },
    "BUY",
  );
  assert.ok("requirement" in bound);
  if (!("requirement" in bound)) return;
  // Critical: BUY on deliverable must NOT collapse to input-only proofs.
  assert.equal(isSerialInputRequirement(bound.requirement), false);
  assert.ok(
    bound.requirement.proofs.some((p) => p.proofKind === "company_artifact_version"),
  );
  assert.ok(
    !bound.requirement.proofs.every(
      (p) =>
        p.proofKind === "verified_external_result" ||
        p.proofKind === "verified_external_effect",
    ),
  );

  // Persist BUY-bound requirement WITHOUT clearing strategy (production state
  // right after authorize, before releaseSerialAcquisitionForReassessment).
  await t.mutation(async (ctx) =>
    (putRequirement as unknown as Handler)._handler(ctx, {
      objectiveKey: key,
      requirementKey: reqKey,
      data: { ...bound.requirement, strategy: "BUY" },
      currentContractRevision: 1,
    }),
  );

  await t.mutation(async (ctx) =>
    (putIntent as unknown as Handler)._handler(ctx, {
      intentId: `int_${key}`,
      objectiveKey: key,
      idempotencyKey: `idem_${key}`,
      data: {
        intentId: `int_${key}`,
        idempotencyKey: `idem_${key}`,
        objectiveKey: key,
        requirementKey: reqKey,
        contractRevision: 1,
        decisionId: `dec_${key}`,
        kind: "external_acquisition",
        strategy: "BUY",
        target: {
          offeringId: "2135:newsliquid_twitter_search",
          providerId: "2135",
          serviceId: "newsliquid_twitter_search",
          resourceClass: "proprietary_data",
          endpointRef: null,
        },
        terms: {
          priceUsd: 2,
          priceProvenance: "provider_quote",
          requiresApproval: true,
          approvalId: `grant_${key}`,
        },
        state: "verified",
        attempts: 1,
        lastEventId: "evt_v",
        resultEvidenceId: `sim_result_${key}`,
        verificationEvidenceId: `sim_verification_${key}`,
        boundaryNote: "verified simulation",
        createdAt: now - 5_000,
        updatedAt: now,
      },
    }),
  );

  // Confirm strategy still BUY before the production pass (not pre-cleared).
  const beforePass = await t.query(async (ctx) => {
    const row = await ctx.db
      .query("requirements")
      .withIndex("by_objectiveRequirement", (q) =>
        q.eq("objectiveKey", key).eq("requirementKey", reqKey),
      )
      .unique();
    return (row as { data: Requirement }).data;
  });
  assert.equal(beforePass.strategy, "BUY");
  assert.equal(beforePass.state, "active");
  assert.equal(beforePass.requirementKind, "deliverable");

  const outcome = (await t.mutation(async (ctx) =>
    (runManagementPass as unknown as Handler)._handler(ctx, {
      objectiveKey: key,
      reason: "verification_result",
    }),
  )) as { objectiveState: string; summary: string };

  const afterPass = await t.query(async (ctx) => {
    const row = await ctx.db
      .query("requirements")
      .withIndex("by_objectiveRequirement", (q) =>
        q.eq("objectiveKey", key).eq("requirementKey", reqKey),
      )
      .unique();
    return (row as { data: Requirement }).data;
  });

  assert.equal(afterPass.state, "active", "deliverable must stay open");
  assert.equal(afterPass.resolution, null, "BUY receipt must not satisfy");
  assert.equal(
    afterPass.strategy,
    null,
    "serial deliverable must clear BUY for reassessment",
  );
  assert.ok(
    afterPass.proofs.some((p) => p.proofKind === "company_artifact_version"),
    "deliverable proofs must remain",
  );
  // Pass should route toward decide (or settle with decide pending) — not
  // treat the requirement as done.
  assert.notEqual(afterPass.state, "satisfied");
  void outcome;
});

// ── 4. assignmentRequiresArtifactMutation ────────────────────────────────────

test("assignmentRequiresArtifactMutation: serial vs legacy vs proof kinds", () => {
  assert.equal(
    assignmentRequiresArtifactMutation({
      allowedToolPermissions: ["update_company_artifact", "submit_result"],
      proofKinds: ["application_observation"],
      serialProtocol: true,
    }),
    false,
    "serial + no company_artifact_version → false",
  );
  assert.equal(
    assignmentRequiresArtifactMutation({
      allowedToolPermissions: ["update_company_artifact", "submit_result"],
      proofKinds: ["company_artifact_version", "application_observation"],
      serialProtocol: true,
    }),
    true,
    "serial + company_artifact_version → true",
  );
  assert.equal(
    assignmentRequiresArtifactMutation({
      allowedToolPermissions: ["update_company_artifact"],
      proofKinds: ["application_observation"],
      serialProtocol: false,
    }),
    true,
    "legacy + permission → true",
  );
  assert.equal(
    assignmentRequiresArtifactMutation({
      allowedToolPermissions: ["submit_result"],
      proofKinds: ["company_artifact_version"],
      serialProtocol: true,
    }),
    false,
    "no update permission → false",
  );
});

// ── 5. Wrong-scope / unverified acquisition cannot cover ─────────────────────

test("acquisition consume: wrong scope / unverified cannot cover need", () => {
  const need = createResourceNeed({
    id: "need_scope",
    objectiveKey: "obj_scope",
    workItemId: "wi_1",
    requirementKey: REQ,
    resourceClass: "proprietary_data",
    purpose: "current-launch messaging evidence",
    reasonOwnedInsufficient: "owned catalog insufficient",
    proposedByRunId: "run_1",
    at: now,
    status: "active",
    contractRevision: 1,
    inputCheckId: "evidence_sufficiency",
    supportingEvidenceIds: ["ev_gap"],
    validationAuthority: "application",
  });
  const matching: ExternalAcquisitionResult = {
    intentId: "int_ok",
    requirementKey: REQ,
    contractRevision: 1,
    resultEvidenceId: "sim_ok",
    provenance: "simulation",
    providerId: "2135",
    serviceId: "newsliquid_twitter_search",
    offeringId: "2135:newsliquid_twitter_search",
    resourceClass: "proprietary_data",
    content: "ok",
    responseHash: "abc",
    recordedAt: now,
    verifiedAt: now,
  };
  assert.equal(verifiedAcquisitionCoversNeed(need, matching), true);
  assert.equal(
    verifiedAcquisitionCoversNeed(need, { ...matching, requirementKey: "req_other" }),
    false,
  );
  assert.equal(
    verifiedAcquisitionCoversNeed(need, { ...matching, contractRevision: 99 }),
    false,
  );
  assert.equal(
    verifiedAcquisitionCoversNeed(need, { ...matching, resourceClass: "compute" }),
    false,
  );
  assert.equal(
    verifiedAcquisitionCoversNeed(need, {
      ...matching,
      verifiedAt: null as unknown as number,
    }),
    false,
  );
  assert.deepEqual(
    validatedMissingClassesAfterAcquisitions(
      [need],
      REQ,
      [{ ...matching, requirementKey: "req_other" }],
    ),
    ["proprietary_data"],
  );
});

// ── 6. Purpose/question scoped — same class does not collapse ────────────────

test("two purposes same resource class do not collapse (dedupe + coverage scope)", () => {
  const key = "obj_purpose";
  const a = createResourceNeed({
    id: "need_a",
    objectiveKey: key,
    requirementKey: REQ,
    resourceClass: "proprietary_data",
    purpose: "What messaging resonates with early adopters?",
    reasonOwnedInsufficient: "no owned social evidence",
    at: now,
    status: "active",
    contractRevision: 1,
    inputCheckId: "q_adopters",
    validationAuthority: "application",
  });
  const b = createResourceNeed({
    id: "need_b",
    objectiveKey: key,
    requirementKey: REQ,
    resourceClass: "proprietary_data",
    purpose: "What competitor pricing is visible on X?",
    reasonOwnedInsufficient: "no owned pricing scrape",
    at: now,
    status: "active",
    contractRevision: 1,
    inputCheckId: "q_pricing",
    validationAuthority: "application",
  });
  assert.notEqual(a.dedupeKey, b.dedupeKey);
  assert.notEqual(
    computeNeedDedupeKey({
      objectiveKey: key,
      resourceClass: "proprietary_data",
      purpose: a.purpose,
      requirementKey: REQ,
    }),
    computeNeedDedupeKey({
      objectiveKey: key,
      resourceClass: "proprietary_data",
      purpose: b.purpose,
      requirementKey: REQ,
    }),
  );
  // Acquisition scoped to requirement+revision+class covers the class gap,
  // but distinct purposes remain distinct need rows (ids / dedupe keys).
  const acq = {
    requirementKey: REQ,
    contractRevision: 1,
    resourceClass: "proprietary_data",
    verifiedAt: now,
  };
  assert.equal(verifiedAcquisitionCoversNeed(a, acq), true);
  assert.equal(verifiedAcquisitionCoversNeed(b, acq), true);
  assert.notEqual(a.id, b.id);
  assert.notEqual(a.inputCheckId, b.inputCheckId);
});

// ── 7. Duplicate wake / stale revision refuse ────────────────────────────────

test("stale contract revision refuses the decision pass", async () => {
  const result = await pass({
    serialManagerProtocol: true,
    grounding: bothHalvesGrounding,
    currentContractRevision: 2,
    recommend: async (eligible) => ({
      requirementKey: "page_live",
      contractRevision: 2,
      selectedOptionId: eligible[0]?.optionId ?? "opt_none",
      rationale: "stale pass",
    }),
  });
  assert.equal(result.authorization.kind, "refused");
  if (result.authorization.kind !== "refused") return;
  assert.ok(
    result.authorization.detail.includes("stale") ||
      result.authorization.detail.includes("revision"),
  );
  assert.equal(result.boundRequirement, null);
});

test("applyDecision against moved contract revision returns ok:false stale", async () => {
  const t = convexTest(schema, modules);
  const key = "obj_serial_stale";
  const reqKey = "req_stale";

  await t.mutation(async (ctx) => {
    await ctx.db.insert("objectives", {
      key,
      data: {
        key,
        request: "stale revision refuse",
        createdAt: now,
        updatedAt: now,
        state: "received",
        activity: "new",
        plan: null,
        workItems: [],
        run: null,
        result: null,
        management: { contractId: null, controlNotes: [] },
      } as never,
    });
  });
  await t.mutation(async (ctx) =>
    (initBudget as unknown as Handler)._handler(ctx, { objectiveKey: key, at: now }),
  );

  const interpreted = (await t.mutation(async (ctx) =>
    (applyInterpretation as unknown as Handler)._handler(ctx, {
      objectiveKey: key,
      requestId: `interpret_${key}`,
      rawContract: {
        intent: "stale revision refuse",
        levels: [{ levelKey: "goal", order: 1, statement: "goal", label: "Goal" }],
        minimumCompletionBar: "goal",
        ambiguities: [],
      },
      rawRequirements: [
        {
          requirementKey: reqKey,
          priority: "required",
          title: "Observation recorded",
          mustBeTrue: "an application observation supports the statement",
          scope: "one governed observation",
        },
      ],
      founderResolvedQuestions: [],
      at: now,
    }),
  )) as { ok: boolean };
  assert.equal(interpreted.ok, true);

  await t.mutation(async (ctx) =>
    (runManagementPass as unknown as Handler)._handler(ctx, {
      objectiveKey: key,
      reason: "objective_submitted",
    }),
  );

  const obj = await t.query(async (ctx) => {
    const row = await ctx.db
      .query("objectives")
      .withIndex("by_key", (q) => q.eq("key", key))
      .unique();
    return (row as { data: ObjectiveRecord & { management: Record<string, unknown> } }).data;
  });
  const pending = obj.management?.pendingDecision as {
    requestId: string;
    requirementKey: string;
    contractRevision: number;
  } | null;
  assert.ok(pending);

  const contractId = String(obj.management?.contractId ?? "");
  assert.ok(contractId, "interpreted contractId required");

  // Move the live Outcome Contract to revision 2 (stale-downsert against pending r1).
  const rev2 = buildOutcomeContract({
    objectiveKey: key,
    contractId,
    revision: 2,
    parsed: {
      intent: "stale revision refuse",
      levels: [{ levelKey: "goal", order: 1, statement: "goal", label: "Goal" }],
      minimumCompletionBar: "goal",
      ambiguities: [],
    },
    requestId: `interpret_${key}_r2`,
    founderResolvedQuestions: [],
    at: now,
  });
  assert.ok(rev2.ok);
  if (!rev2.ok) throw new Error("rev2 contract");
  await t.mutation(async (ctx) =>
    (putContract as unknown as Handler)._handler(ctx, {
      objectiveKey: key,
      contractId: rev2.contract.contractId,
      revision: 2,
      data: rev2.contract,
    }),
  );

  const capabilityKeys = ["public_information_research"];
  const optionId = optionIdFor({
    requirementKey: reqKey,
    contractRevision: 1,
    kind: "internal",
    target: `internal:${[...capabilityKeys].sort().join("+")}:new`,
  });
  const apply = (await t.mutation(async (ctx) =>
    (applyDecision as unknown as Handler)._handler(ctx, {
      objectiveKey: key,
      requestId: pending!.requestId,
      rawStrategyProposal: {
        strategy: "MAKE",
        desiredCapabilities: capabilityKeys,
        needsExternalResourceClass: null,
        notes: null,
      },
      rawRecommendation: {
        requirementKey: reqKey,
        contractRevision: 1,
        selectedOptionId: optionId,
        rationale: "should refuse stale",
        materialAssumptions: [],
        changeMyMindEvidence: [],
      },
      at: now,
    }),
  )) as { ok: boolean; reason?: string };
  assert.equal(apply.ok, false);
  assert.ok(
    String(apply.reason ?? "").toLowerCase().includes("stale") ||
      String(apply.reason ?? "").toLowerCase().includes("revision"),
    `expected stale/revision refuse, got: ${apply.reason}`,
  );
});

// ── 8. Historical INPUT_BLOCKED does not set yieldReason without gap ─────────

test("historical INPUT_BLOCKED alone does not set yieldReason (no current gap)", async () => {
  const t = convexTest(schema, modules);
  const key = "obj_serial_yield";
  const runId = "run_serial_yield";
  const contract = createWorkContract({
    assignment: "Bounded serial MAKE",
    idempotencyScope: `${key}:scope`,
    worker: createWorkerSpec(["public_information_research", "company_records_lookup"]),
    sourceProofs: [{ sourceClass: "company_record", minDistinctSources: 1 }],
  });

  await t.run(async (ctx) => {
    await ctx.db.insert("objectives", {
      key,
      data: {
        key,
        request: "yield reason isolation",
        createdAt: now,
        updatedAt: now,
        state: "executing",
        activity: "resumed after acquisition",
        plan: null,
        workItems: [
          {
            id: "wi:asg_serial",
            objectiveKey: key,
            title: "Evidence",
            assignment: contract.assignment,
            workerKey: contract.workerKey,
            state: "running",
            contract: {
              ...contract,
              allowedToolPermissions: [
                ...contract.allowedToolPermissions,
                "update_company_artifact",
              ],
            },
            runs: [
              {
                id: runId,
                workItemId: "wi:asg_serial",
                status: "running",
                startedAt: now,
                leaseUntil: now + 60_000,
                model: "mock",
                modelSelectionReason: "test",
                toolCalls: 0,
                summary: "",
              },
            ],
          },
        ],
        run: {
          id: runId,
          workItemId: "wi:asg_serial",
          status: "running",
          startedAt: now,
          leaseUntil: now + 60_000,
          model: "mock",
          modelSelectionReason: "test",
          toolCalls: 0,
          summary: "",
        },
        result: null,
        resourceNeeds: [],
        acquisitionResults: [],
        lastDeliveryFailureClass: "INPUT_BLOCKED",
        management: {
          contractId: `contract_${key}`,
          executionProtocol: M61_SERIAL_V1,
          currentContractRevision: 1,
          interpretationStatus: "done",
          decisionAttempts: {},
          controlNotes: [],
        },
      } as ObjectiveRecord & { management: Record<string, unknown> },
    });
    await ctx.db.insert("evidence", {
      objectiveKey: key,
      evidenceId: "ev_owned",
      data: {
        sourceClass: "company_record",
        label: "owned",
        text: "usable owned record",
        recordRef: "company/profile",
        observedAt: now,
        recordedBy: "app",
        runId,
        origin: "application_observation",
        sourceId: "record:company/profile",
      },
    });
  });

  const observation = (await t.run(async (ctx) =>
    (readWorkerObservation as unknown as Handler)._handler(ctx, {
      objectiveKey: key,
      runId,
    }),
  )) as { yieldReason: string | null };
  assert.equal(
    observation.yieldReason,
    null,
    "historical INPUT_BLOCKED must not set yieldReason without a current gap",
  );
});

// ── 9. Forged satisfied / missing artifact cannot pass completion gate ───────

test("forged satisfied + missing artifact proof cannot pass completion gate", () => {
  const key = "obj_serial_gate";
  const built = buildOutcomeContract({
    objectiveKey: key,
    contractId: `contract_${key}`,
    revision: 1,
    parsed: {
      intent: "prove gate recomputes on serial path",
      levels: [{ levelKey: "goal", order: 1, statement: "goal", label: "Goal" }],
      minimumCompletionBar: "goal",
      ambiguities: [],
    },
    requestId: "gate_serial",
    founderResolvedQuestions: [],
    at: now,
  });
  assert.ok(built.ok);
  if (!built.ok) throw new Error("contract");
  const contract = built.contract;

  const forged: Requirement = {
    requirementKey: REQ,
    objectiveKey: key,
    contractId: contract.contractId,
    contractRevision: 1,
    priority: "required",
    title: "Artifact delivered",
    mustBeTrue: "company artifact version advanced",
    scope: "artifact",
    ...CP2_REQUIREMENT_FIELDS,
    proofs: [
      {
        proofKey: "artifact",
        description: "artifact version",
        proofKind: "company_artifact_version",
        params: { artifactKey: "launch/page-message", minVersion: 2 },
      },
    ],
    state: "satisfied",
    strategy: "MAKE",
    resolution: {
      resolutionId: "res_forged",
      acceptedDecisionId: null,
      acceptedAssignmentId: null,
      acceptedIntentId: null,
      proofRefs: ["ghost_artifact"],
      contractRevision: 1,
      acceptedAt: now,
    },
    blockedReason: null,
    waiver: null,
    revision: 1,
    createdAt: now,
    updatedAt: now,
  };

  const proposal: CompletionProposal = {
    proposalId: "prop_forged",
    objectiveKey: key,
    contractId: contract.contractId,
    contractRevision: 1,
    claimedLevelKey: "goal",
    rationale: "forged satisfied claim",
    proposedAt: now,
  };

  const verdict = evaluateCompletionGate({
    proposal,
    contract,
    currentContractRevision: 1,
    requirements: [forged],
    factsByRequirementKey: new Map([[REQ, NO_PROOF_FACTS]]),
    unresolvedEffectIds: [],
    unresolvedResourceIds: [],
    at: now,
  });
  assert.equal(verdict.accepted, false);
  if (verdict.accepted) return;
  assert.ok(
    verdict.unmet.some(
      (line) =>
        line.includes("recomputed") ||
        line.includes("artifact") ||
        line.includes("company_artifact"),
    ),
    verdict.unmet.join("; "),
  );
});

// ── 10. Denied budget / no offering stops truthfully ─────────────────────────

test("denied budget refuses BUY; no offering refuses without inventing MAKE/HYBRID", async () => {
  const overBudget = await pass({
    serialManagerProtocol: true,
    grounding: bothHalvesGrounding,
    eligibilityFacts: baseEligibilityFacts({ budgetRemainingUsd: 0 }),
    recommend: async (eligible) => {
      const buy = eligible.find((o) => o.kind === "external" && o.eligibility.eligible);
      assert.equal(buy, undefined, "BUY must be ineligible when budget is zero");
      const make = eligible.find((o) => o.kind === "internal" && o.eligibility.eligible);
      assert.ok(make);
      return {
        requirementKey: "page_live",
        contractRevision: 1,
        selectedOptionId: make!.optionId,
        rationale: "fall back to MAKE",
      };
    },
  });
  assert.equal(overBudget.options.some((o) => o.strategy === "HYBRID"), false);
  // BUY options may exist but must not be eligible.
  for (const o of overBudget.options.filter((x) => x.kind === "external")) {
    assert.equal(o.eligibility.eligible, false);
  }

  const noOffer = await pass({
    serialManagerProtocol: true,
    staffing: staffingRequest([], { creationAllowed: false }),
    grounding: {
      discovered: [],
      internalFacts,
      factsForOffering: () => offeringFacts(1.5),
    },
    recommend: async () => {
      throw new Error("model must not be consulted when nothing is eligible");
    },
  });
  assert.equal(noOffer.authorization.kind, "refused");
  if (noOffer.authorization.kind !== "refused") return;
  assert.ok(noOffer.authorization.detail.includes("no grounded option is currently eligible"));
  assert.equal(noOffer.boundRequirement, null);
  assert.equal(noOffer.options.some((o) => o.strategy === "HYBRID"), false);
});

// ── Integration: interpret → decide → authorize → dispatch (serial) ──────────

test("integration: founder request → interpret(m61_serial_v1) → authorize MAKE → dispatch (no seeded outcomes)", async () => {
  const t = convexTest(schema, modules);
  const key = "obj_serial_chain";
  const reqKey = "req_chain";

  // Bare founder-like objective — no decisions, proofs, or completed results.
  await t.mutation(async (ctx) => {
    await ctx.db.insert("objectives", {
      key,
      data: {
        key,
        request:
          "Produce a sourced relaunch recommendation for our product messaging",
        createdAt: now,
        updatedAt: now,
        state: "received",
        activity: "new",
        plan: null,
        workItems: [],
        run: null,
        result: null,
        management: { contractId: null, controlNotes: [] },
      } as never,
    });
  });
  await t.mutation(async (ctx) =>
    (initBudget as unknown as Handler)._handler(ctx, { objectiveKey: key, at: now }),
  );

  const interpreted = (await t.mutation(async (ctx) =>
    (applyInterpretation as unknown as Handler)._handler(ctx, {
      objectiveKey: key,
      requestId: `interpret_${key}`,
      rawContract: {
        intent: "produce a sourced relaunch recommendation",
        levels: [
          {
            levelKey: "recommendation",
            order: 1,
            statement: "a sourced relaunch recommendation is on record",
            label: "Recommendation",
          },
        ],
        minimumCompletionBar: "recommendation",
        ambiguities: [],
      },
      rawRequirements: [
        {
          requirementKey: reqKey,
          priority: "required",
          title: "Sourced recommendation recorded",
          mustBeTrue: "an application observation supports the relaunch recommendation",
          scope: "one governed observation",
        },
      ],
      founderResolvedQuestions: [],
      at: now,
    }),
  )) as { ok: boolean; contractId?: string; errors?: string[] };
  assert.equal(interpreted.ok, true, interpreted.errors?.join("; "));

  const afterInterpret = await t.query(async (ctx) => {
    const row = await ctx.db
      .query("objectives")
      .withIndex("by_key", (q) => q.eq("key", key))
      .unique();
    return (row as { data: ObjectiveRecord & { management: Record<string, unknown> } }).data;
  });
  assert.equal(afterInterpret.management?.executionProtocol, M61_SERIAL_V1);
  assert.ok(afterInterpret.management?.contractId);
  // No fabricated satisfaction / proofs / results.
  assert.equal(afterInterpret.result, null);
  const reqsBefore = await t.query(async (ctx) => {
    const rows = await ctx.db
      .query("requirements")
      .withIndex("by_objectiveKey", (q) => q.eq("objectiveKey", key))
      .collect();
    return rows.map((r) => (r as { data: Requirement }).data);
  });
  assert.equal(reqsBefore.length, 1);
  assert.equal(reqsBefore[0]!.state, "active");
  assert.equal(reqsBefore[0]!.strategy, null);
  assert.deepEqual(reqsBefore[0]!.proofs, []);

  await t.mutation(async (ctx) =>
    (runManagementPass as unknown as Handler)._handler(ctx, {
      objectiveKey: key,
      reason: "objective_submitted",
    }),
  );

  const pendingObj = await t.query(async (ctx) => {
    const row = await ctx.db
      .query("objectives")
      .withIndex("by_key", (q) => q.eq("key", key))
      .unique();
    return (row as { data: { management: { pendingDecision: { requestId: string; requirementKey: string; contractRevision: number } | null } } }).data;
  });
  const pending = pendingObj.management.pendingDecision;
  assert.ok(pending, "pendingDecision reserved");
  assert.equal(pending!.requirementKey, reqKey);

  // Deterministic recommend: MAKE only — serial path must not require HYBRID.
  const capabilityKeys = ["public_information_research"];
  const expectedOptionId = optionIdFor({
    requirementKey: reqKey,
    contractRevision: 1,
    kind: "internal",
    target: `internal:${[...capabilityKeys].sort().join("+")}:new`,
  });

  const apply = (await t.mutation(async (ctx) =>
    (applyDecision as unknown as Handler)._handler(ctx, {
      objectiveKey: key,
      requestId: pending!.requestId,
      rawStrategyProposal: {
        strategy: "MAKE",
        desiredCapabilities: capabilityKeys,
        needsExternalResourceClass: null,
        notes: null,
      },
      rawRecommendation: {
        requirementKey: reqKey,
        contractRevision: 1,
        selectedOptionId: expectedOptionId,
        rationale: "serial MAKE authorization for sourced observation",
        materialAssumptions: [],
        changeMyMindEvidence: [],
      },
      at: now,
    }),
  )) as { ok: boolean; authorized?: boolean; strategy?: string | null; reason?: string };
  assert.equal(apply.ok, true, apply.reason);
  assert.equal(apply.authorized, true);
  assert.equal(apply.strategy, "MAKE");
  assert.notEqual(apply.strategy, "HYBRID");

  const afterAuth = await t.query(async (ctx) => {
    const rows = await ctx.db
      .query("requirements")
      .withIndex("by_objectiveKey", (q) => q.eq("objectiveKey", key))
      .collect();
    return rows.map((r) => (r as { data: Requirement }).data);
  });
  assert.equal(afterAuth[0]!.strategy, "MAKE");
  assert.ok(afterAuth[0]!.proofs.length > 0);

  await t.mutation(async (ctx) =>
    (runManagementPass as unknown as Handler)._handler(ctx, {
      objectiveKey: key,
      reason: "decision_applied",
    }),
  );

  const assignments = await t.query(async (ctx) => {
    const rows = await ctx.db
      .query("assignments")
      .withIndex("by_objective", (q) => q.eq("objectiveKey", key))
      .collect();
    return rows.map((r) => (r as { data: Assignment }).data);
  });
  assert.equal(assignments.length, 1, "one internal assignment dispatched");
  assert.ok(
    assignments[0]!.state === "running" || assignments[0]!.state === "dispatched",
    `unexpected assignment state ${assignments[0]!.state}`,
  );
  assert.ok(assignments[0]!.runId);

  const intents = await t.query(async (ctx) => {
    const rows = await ctx.db
      .query("executionIntents")
      .withIndex("by_objective", (q) => q.eq("objectiveKey", key))
      .collect();
    return rows;
  });
  assert.equal(intents.length, 0, "serial MAKE must not mint a HYBRID/BUY intent");

  const finalObj = await t.query(async (ctx) => {
    const row = await ctx.db
      .query("objectives")
      .withIndex("by_key", (q) => q.eq("key", key))
      .unique();
    return (row as { data: ObjectiveRecord & { management: Record<string, unknown> } }).data;
  });
  assert.equal(finalObj.management?.executionProtocol, M61_SERIAL_V1);
  assert.equal(finalObj.result, null, "must not fabricate a completed result");
});

// ── Action-scoped acquisition + exact artifact target ────────────────────────

test("serial: observation exposes only linked acquisitions; unrelated verified is excluded", async () => {
  const t = convexTest(schema, modules);
  const key = "obj_serial_scoped_acq";
  const runId = "run_scoped";
  const linkedId = "sim_linked";
  const unrelatedId = "sim_unrelated";
  const artifactKey = "launch/page-message";

  const workContract = createWorkContract({
    assignment: "Revise launch message using linked acquisition",
    idempotencyScope: `${key}:scoped`,
    worker: createWorkerSpec([
      "public_information_research",
      "company_records_lookup",
      "growth_launch_operations",
    ]),
    sourceProofs: [{ sourceClass: "company_record", minDistinctSources: 1 }],
    inputEvidenceIds: [linkedId],
    targetArtifactKey: artifactKey,
  });

  await t.mutation(async (ctx) => {
    await ctx.db.insert("objectives", {
      key,
      data: {
        key,
        request: "revise message",
        createdAt: now,
        updatedAt: now,
        state: "executing",
        activity: "running",
        plan: null,
        workItems: [
          {
            id: "wi_1",
            objectiveKey: key,
            title: "revise",
            assignment: workContract.assignment,
            workerKey: workContract.workerKey,
            state: "running",
            contract: workContract,
            runs: [
              {
                id: runId,
                workItemId: "wi_1",
                status: "running",
                startedAt: now,
                leaseUntil: now + 60_000,
                model: "mock",
                modelSelectionReason: "test",
                toolCalls: 0,
                summary: "",
              },
            ],
          },
        ],
        run: {
          id: runId,
          workItemId: "wi_1",
          status: "running",
          startedAt: now,
          leaseUntil: now + 60_000,
          model: "mock",
          modelSelectionReason: "test",
          toolCalls: 0,
          summary: "",
        },
        result: null,
        companyArtifacts: [
          { key: artifactKey, version: 1, content: "seed A", history: [] },
          { key: "other/artifact", version: 1, content: "seed B", history: [] },
        ],
        acquisitionResults: [
          {
            intentId: "int_linked",
            requirementKey: REQ,
            contractRevision: 1,
            resultEvidenceId: linkedId,
            provenance: "simulation",
            providerId: "2135",
            serviceId: "newsliquid_twitter_search",
            offeringId: "2135:newsliquid_twitter_search",
            resourceClass: "proprietary_data",
            content: "LINKED finding text",
            responseHash: "h1",
            recordedAt: now,
            verifiedAt: now,
          },
          {
            intentId: "int_unrelated",
            requirementKey: "req_other",
            contractRevision: 1,
            resultEvidenceId: unrelatedId,
            provenance: "simulation",
            providerId: "2135",
            serviceId: "newsliquid_twitter_search",
            offeringId: "2135:newsliquid_twitter_search",
            resourceClass: "proprietary_data",
            content: "UNRELATED finding text",
            responseHash: "h2",
            recordedAt: now,
            verifiedAt: now,
          },
        ],
        management: {
          contractId: "contract_scoped",
          executionProtocol: M61_SERIAL_V1,
        },
      } as never,
    });
    await (putIntent as unknown as Handler)._handler(ctx, {
      intentId: "int_linked",
      objectiveKey: key,
      idempotencyKey: "idem_linked",
      data: {
        ...verifiedBuyIntent(key),
        intentId: "int_linked",
        idempotencyKey: "idem_linked",
        requirementKey: REQ,
        resultEvidenceId: linkedId,
        state: "verified",
      },
    });
    await (putIntent as unknown as Handler)._handler(ctx, {
      intentId: "int_unrelated",
      objectiveKey: key,
      idempotencyKey: "idem_unrelated",
      data: {
        ...verifiedBuyIntent(key),
        intentId: "int_unrelated",
        idempotencyKey: "idem_unrelated",
        requirementKey: "req_other",
        resultEvidenceId: unrelatedId,
        state: "verified",
      },
    });
  });

  const obs = (await t.query(async (ctx) =>
    (readWorkerObservation as unknown as Handler)._handler(ctx, {
      objectiveKey: key,
      runId,
    }),
  )) as {
    acquiredInputs: Array<{ resultEvidenceId: string }>;
    loadedInputPackage: {
      linkedAcquisitions: Array<{ resultEvidenceId: string }>;
      targetArtifact: { key: string; version: number } | null;
      inputEvidenceIds: string[];
      companyRecords: Array<{ ref: string }>;
    };
  };
  assert.deepEqual(
    obs.acquiredInputs.map((a) => a.resultEvidenceId),
    [linkedId],
  );
  assert.ok(!obs.acquiredInputs.some((a) => a.resultEvidenceId === unrelatedId));
  assert.deepEqual(obs.loadedInputPackage.inputEvidenceIds, [linkedId]);
  assert.equal(obs.loadedInputPackage.targetArtifact?.key, artifactKey);
  assert.ok(obs.loadedInputPackage.companyRecords.length > 0);

  // Unrelated evidence id refused even though verified on Objective.
  await assert.rejects(
    () =>
      t.mutation(async (ctx) =>
        (updateCompanyArtifact as unknown as Handler)._handler(ctx, {
          objectiveKey: key,
          runId,
          content: "new content",
          changeNote: "cite unrelated",
          usedAcquisitionEvidenceIds: [unrelatedId],
        }),
      ),
    /not linked to this action/,
  );

  // Correct link + exact target key succeeds (not artifacts[0] by accident).
  const updated = (await t.mutation(async (ctx) =>
    (updateCompanyArtifact as unknown as Handler)._handler(ctx, {
      objectiveKey: key,
      runId,
      content: "revised with LINKED finding text",
      changeNote: "use linked acquisition",
      usedAcquisitionEvidenceIds: [linkedId],
    }),
  )) as { key: string; version: number };
  assert.equal(updated.key, artifactKey);
  assert.equal(updated.version, 2);

  const after = await t.query(async (ctx) => {
    const row = await ctx.db
      .query("objectives")
      .withIndex("by_key", (q) => q.eq("key", key))
      .unique();
    return (row as { data: ObjectiveRecord }).data.companyArtifacts ?? [];
  });
  assert.equal(after.find((a) => a.key === artifactKey)?.version, 2);
  assert.equal(after.find((a) => a.key === "other/artifact")?.version, 1);

  // Empty claim list with linked IDs present must NOT force cite (no silent
  // force from unrelated Objective acquisitions either).
  const key2 = "obj_serial_no_force_cite";
  const run2 = "run_noforce";
  const wc2 = createWorkContract({
    assignment: "analysis only revise without acquisition use",
    idempotencyScope: `${key2}:nf`,
    worker: createWorkerSpec(["growth_launch_operations", "company_records_lookup"]),
    sourceProofs: [{ sourceClass: "company_record", minDistinctSources: 1 }],
    inputEvidenceIds: [],
    targetArtifactKey: artifactKey,
  });
  await t.mutation(async (ctx) => {
    await ctx.db.insert("objectives", {
      key: key2,
      data: {
        key: key2,
        request: "revise",
        createdAt: now,
        updatedAt: now,
        state: "executing",
        activity: "running",
        plan: null,
        workItems: [
          {
            id: "wi_2",
            objectiveKey: key2,
            title: "t",
            assignment: wc2.assignment,
            workerKey: wc2.workerKey,
            state: "running",
            contract: wc2,
            runs: [
              {
                id: run2,
                workItemId: "wi_2",
                status: "running",
                startedAt: now,
                leaseUntil: now + 60_000,
                model: "mock",
                modelSelectionReason: "test",
                toolCalls: 0,
                summary: "",
              },
            ],
          },
        ],
        run: {
          id: run2,
          workItemId: "wi_2",
          status: "running",
          startedAt: now,
          leaseUntil: now + 60_000,
          model: "mock",
          modelSelectionReason: "test",
          toolCalls: 0,
          summary: "",
        },
        result: null,
        companyArtifacts: [
          { key: artifactKey, version: 1, content: "seed", history: [] },
        ],
        acquisitionResults: [
          {
            intentId: "int_elsewhere",
            requirementKey: "req_elsewhere",
            contractRevision: 1,
            resultEvidenceId: "sim_elsewhere",
            provenance: "simulation",
            providerId: "2135",
            serviceId: "x",
            offeringId: "x",
            resourceClass: "proprietary_data",
            content: "elsewhere",
            responseHash: "hx",
            recordedAt: now,
            verifiedAt: now,
          },
        ],
        management: {
          contractId: "c2",
          executionProtocol: M61_SERIAL_V1,
        },
      } as never,
    });
    await (putIntent as unknown as Handler)._handler(ctx, {
      intentId: "int_elsewhere",
      objectiveKey: key2,
      idempotencyKey: "idem_elsewhere",
      data: {
        ...verifiedBuyIntent(key2),
        intentId: "int_elsewhere",
        requirementKey: "req_elsewhere",
        resultEvidenceId: "sim_elsewhere",
        state: "verified",
      },
    });
  });
  const noForce = (await t.mutation(async (ctx) =>
    (updateCompanyArtifact as unknown as Handler)._handler(ctx, {
      objectiveKey: key2,
      runId: run2,
      content: "internal revision without acquisition",
      changeNote: "no acquisition used",
    }),
  )) as { key: string; version: number };
  assert.equal(noForce.version, 2);
});
