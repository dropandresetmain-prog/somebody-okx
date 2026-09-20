// M6.1 CP2 — causal pipeline: dependsOn, resource needs, decision reads.
import test from "node:test";
import assert from "node:assert/strict";
import { parseRequirementProposals } from "../lib/management/proposals";
import { reduceManagementState, type ReducerFacts } from "../lib/management/reducer";
import { buildDecisionPassInput } from "../lib/management/decisionPass";
import type { DecisionPassReads } from "../lib/management/decisionPass";
import { buildOutcomeContract } from "../lib/management/contract";
import {
  createResourceNeed,
  dedupeResourceNeeds,
} from "../lib/objective/resourceNeed";
import type { OutcomeContract, Requirement } from "../lib/management/types";
import { cp2ParsedRequirement } from "./helpers/cp2Requirement";

const at = 1700000000000;

const researchContract: OutcomeContract = (() => {
  const built = buildOutcomeContract({
    objectiveKey: "obj_research_report",
    contractId: "contract_research",
    revision: 1,
    parsed: {
      intent: "produce a sourced research report on a market topic",
      levels: [
        {
          levelKey: "evidence_gathered",
          order: 1,
          statement: "credible external evidence is on record",
          label: "Evidence",
        },
        {
          levelKey: "report_delivered",
          order: 2,
          statement: "a bounded report artifact exists",
          label: "Report",
        },
      ],
      minimumCompletionBar: "report_delivered",
      ambiguities: [],
    },
    requestId: "req_research",
    founderResolvedQuestions: [],
    at,
  });
  assert.equal(built.ok, true);
  if (!built.ok) throw new Error("fixture contract");
  return built.contract;
})();

function researchRequirement(overrides: Partial<Requirement> = {}): Requirement {
  return {
    requirementKey: "req_01",
    objectiveKey: "obj_research_report",
    contractId: researchContract.contractId,
    contractRevision: 1,
    priority: "required",
    title: "External evidence is available",
    mustBeTrue: "licensed market data supports the topic",
    scope: "third-party dataset",
    dependsOnRequirementKeys: [],
    requiredResourceClasses: ["proprietary_data"],
    expectedOutput: "dataset access or equivalent evidence",
    proofs: [],
    state: "active",
    strategy: null,
    resolution: null,
    blockedReason: null,
    waiver: null,
    revision: 1,
    createdAt: at,
    updatedAt: at,
    ...overrides,
  };
}

test("parseRequirementProposals accepts dependsOn and requiredResourceClasses", () => {
  const parsed = parseRequirementProposals([
    {
      requirementKey: "req_01",
      priority: "required",
      title: "Evidence",
      mustBeTrue: "data exists",
      scope: "inputs",
      dependsOnRequirementKeys: [],
      requiredResourceClasses: ["proprietary_data"],
      expectedOutput: "dataset",
    },
    {
      requirementKey: "req_02",
      priority: "required",
      title: "Report",
      mustBeTrue: "report artifact exists",
      scope: "deliverable",
      dependsOnRequirementKeys: ["req_01"],
      requiredResourceClasses: [],
      expectedOutput: "report v1",
    },
  ]);
  assert.equal(parsed.ok, true);
  if (!parsed.ok) return;
  assert.deepEqual(parsed.value[1].dependsOnRequirementKeys, ["req_01"]);
  assert.deepEqual(parsed.value[0].requiredResourceClasses, ["proprietary_data"]);
});

test("parseRequirementProposals rejects unknown dependsOn key", () => {
  const parsed = parseRequirementProposals([
    {
      requirementKey: "req_02",
      priority: "required",
      title: "Report",
      mustBeTrue: "report exists",
      scope: "x",
      dependsOnRequirementKeys: ["req_missing"],
      requiredResourceClasses: [],
      expectedOutput: null,
    },
    {
      requirementKey: "req_01",
      priority: "required",
      title: "Evidence",
      mustBeTrue: "data exists",
      scope: "x",
      dependsOnRequirementKeys: [],
      requiredResourceClasses: [],
      expectedOutput: null,
    },
  ]);
  assert.equal(parsed.ok, false);
  if (parsed.ok) return;
  assert.ok(parsed.errors.some((e) => e.includes("unknown key req_missing")));
});

test("reducer blocks decide on dependent requirement until prerequisite satisfied", () => {
  const prereq = researchRequirement({
    requirementKey: "req_01",
    state: "active",
  });
  const dependent = researchRequirement({
    requirementKey: "req_02",
    title: "Report delivered",
    mustBeTrue: "report artifact version >= 2",
    dependsOnRequirementKeys: ["req_01"],
    requiredResourceClasses: [],
    expectedOutput: "research_report artifact",
  });
  const facts: ReducerFacts = {
    contract: researchContract,
    currentContractRevision: 1,
    requirements: [prereq, dependent],
    groundedByRequirement: new Map(),
    assignments: [],
    intents: [],
    budgetVerdict: { ok: true },
    pendingApproval: null,
    completionProposal: null,
    at,
  };
  const blockedOnDep = reduceManagementState(facts);
  if (blockedOnDep.action.kind === "decide_requirement") {
    assert.notEqual(
      blockedOnDep.action.requirementKey,
      "req_02",
      "dependent req_02 must not be decided while req_01 is unsatisfied",
    );
  }

  const satisfiedPrereq = { ...prereq, state: "satisfied" as const };
  const ready = reduceManagementState({
    ...facts,
    requirements: [satisfiedPrereq, dependent],
  });
  assert.equal(ready.action.kind, "decide_requirement");
  if (ready.action.kind === "decide_requirement") {
    assert.equal(ready.action.requirementKey, "req_02");
  }
});

test("buildDecisionPassInput merges open resource need into eligibility requiredResourceClasses", async () => {
  const requirement = researchRequirement();
  const reads: DecisionPassReads = {
    contract: researchContract,
    currentContractRevision: 1,
    requirement,
    inventory: [],
    creationAllowed: true,
    budget: null,
    grant: null,
    openResourceNeeds: [
      {
        needId: "need_1",
        resourceClass: "proprietary_data",
        purpose: "market dataset for topic",
        reasonOwnedInsufficient: "not in company_records",
        status: "proposed",
      },
    ],
    prerequisiteResults: [],
    at,
    decisionId: "dec_cp2_reads",
  };
  const built = await buildDecisionPassInput(
    reads,
    {
      strategy: "BUY",
      desiredCapabilities: ["public_information_research"],
      needsExternalResourceClass: "proprietary_data",
      notes: null,
    },
    async () => null,
  );
  assert.equal(built.ok, true);
  if (!built.ok) return;
  assert.ok(
    built.input.eligibilityFacts.requiredResourceClasses.includes("proprietary_data"),
  );
});

test("dedupeResourceNeeds returns created:false for same objective+req+class+purpose", () => {
  const existing = createResourceNeed({
    id: "need_a",
    objectiveKey: "obj_research_report",
    requirementKey: "req_01",
    resourceClass: "proprietary_data",
    purpose: "market dataset",
    reasonOwnedInsufficient: "not owned",
    at,
  });
  const proposed = createResourceNeed({
    id: "need_b",
    objectiveKey: "obj_research_report",
    requirementKey: "req_01",
    resourceClass: "proprietary_data",
    purpose: "market dataset",
    reasonOwnedInsufficient: "still not owned",
    at: at + 1,
  });
  const result = dedupeResourceNeeds([existing], proposed);
  assert.equal(result.created, false);
  assert.equal(result.need.id, "need_a");
});

test("createResourceNeed stays proposed and does not imply acquisition authority", () => {
  const need = createResourceNeed({
    id: "need_cp2",
    objectiveKey: "obj_research_report",
    requirementKey: "req_01",
    resourceClass: "proprietary_data",
    purpose: "topic dataset",
    reasonOwnedInsufficient: "not in inventory",
    at,
  });
  assert.equal(need.status, "proposed");
  assert.equal(need.requirementKey, "req_01");
  const payload = JSON.stringify(need);
  assert.ok(!payload.includes("buy_pending"));
  assert.ok(!payload.includes("intent"));
});

test("research objective fixture uses generic dependsOn + requiredResourceClasses", () => {
  const proposals = parseRequirementProposals([
    cp2ParsedRequirement({
      requirementKey: "req_01",
      priority: "required",
      title: "Evidence gathered",
      mustBeTrue: "credible licensed data is on record",
      scope: "external inputs",
      requiredResourceClasses: ["proprietary_data"],
      expectedOutput: "dataset or equivalent evidence",
    }),
    cp2ParsedRequirement({
      requirementKey: "req_02",
      priority: "required",
      title: "Report artifact exists",
      mustBeTrue: "research_report artifact version >= 1",
      scope: "company artifact",
      dependsOnRequirementKeys: ["req_01"],
      expectedOutput: "research_report v1",
    }),
  ]);
  assert.equal(proposals.ok, true);
  if (!proposals.ok) return;
  const dependent = proposals.value.find((r) => r.requirementKey === "req_02");
  assert.ok(dependent);
  assert.deepEqual(dependent!.dependsOnRequirementKeys, ["req_01"]);
  assert.deepEqual(proposals.value[0].requiredResourceClasses, ["proprietary_data"]);
});
