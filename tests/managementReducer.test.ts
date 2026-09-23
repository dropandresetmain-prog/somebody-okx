// Control-state reducer: every terminal is typed, every quiescent state
// refuses model-invoking actions (Cutoff-2 groundwork).
import test from "node:test";
import assert from "node:assert/strict";
import {
  isCoherentHold,
  reduceManagementState,
  type ReducerFacts,
} from "../lib/management/reducer";
import { isQuiescent } from "../lib/management/types";
import type {
  Assignment,
  ExecutionIntent,
  GroundedOption,
  OutcomeContract,
  Requirement,
} from "../lib/management/types";
import { CP2_REQUIREMENT_FIELDS } from "./helpers/cp2Requirement";

const at = 1700000000000;

const contract: OutcomeContract = {
  contractId: "contract_launch",
  objectiveKey: "obj_launch",
  revision: 1,
  intent: "ship the page",
  levels: [{ levelKey: "page_live", order: 1, statement: "live", label: "Live" }],
  minimumCompletionBar: "page_live",
  ambiguities: [],
  createdBy: "somebody",
  createdFromRequestId: "req_1",
  createdAt: at,
};

function requirement(overrides: Partial<Requirement> = {}): Requirement {
  return {
    requirementKey: "page_live",
    objectiveKey: "obj_launch",
    contractId: "contract_launch",
    contractRevision: 1,
    priority: "required",
    title: "page live",
    mustBeTrue: "x",
    scope: "x",
    ...CP2_REQUIREMENT_FIELDS,
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

function eligibleOption(requirementKey: string): GroundedOption {
  return {
    optionId: "opt_x",
    requirementKey,
    contractRevision: 1,
    kind: "internal",
    strategy: "MAKE",
    internal: { capabilityKeys: [], responsibility: "", workerKey: "w", staffingReason: "", primitives: [] },
    external: null,
    facts: {
      scope: null, expectedQuality: null, setupMinutes: null, queueMinutes: null,
      executionMinutes: null, verificationMinutes: null, internalCostUsd: null,
      externalPriceUsd: null, reliability: null, availability: null, reuseValue: null,
      externalAdvantage: null,
    },
    eligibility: { eligible: true, checksPassed: ["primitives_governed"] },
  };
}

function ineligibleOption(requirementKey: string): GroundedOption {
  return {
    ...eligibleOption(requirementKey),
    eligibility: { eligible: false, reasons: ["capability_not_governed"], detail: "no governed path" },
  };
}

function base(overrides: Partial<ReducerFacts> = {}): ReducerFacts {
  return {
    contract,
    currentContractRevision: 1,
    requirements: [requirement()],
    groundedByRequirement: new Map([["page_live", [eligibleOption("page_live")]]]),
    assignments: [],
    intents: [],
    budgetVerdict: { ok: true },
    pendingApproval: null,
    completionProposal: null,
    at,
    ...overrides,
  };
}

test("no contract → planning with plan_contract action", () => {
  const r = reduceManagementState(base({ contract: null }));
  assert.equal(r.state, "planning");
  assert.equal(r.action.kind, "plan_contract");
});

test("budget ceiling wins over everything and maps to its typed state", () => {
  const r = reduceManagementState(
    base({ budgetVerdict: { ok: false, limit: "maxNoProgressCycles", detail: "3 cycles", state: "escalated" } }),
  );
  assert.equal(r.state, "escalated");
  assert.ok(isQuiescent(r.state));
  assert.ok(isCoherentHold(r));
});

test("worker attempt ceiling on an authorized MAKE routes to decide, not dispatch", () => {
  const r = reduceManagementState(
    base({
      requirements: [requirement({ requirementKey: "page_live", strategy: "MAKE" })],
      workerAttemptBudget: {
        attemptsByRequirement: { page_live: 3 },
        maxWorkerAttemptsPerRequirement: 3,
      },
    }),
  );
  assert.equal(r.action.kind, "decide_requirement");
  assert.equal(r.action.requirementKey, "page_live");
});

test("material ambiguity outranks executable work → approval_required/ask_founder", () => {
  const r = reduceManagementState(
    base({
      contract: {
        ...contract,
        ambiguities: [
          { question: "spend money?", materiality: "material", resolution: "?", resolvedBy: "founder", requiresFounderApproval: true },
        ],
      },
    }),
  );
  assert.equal(r.state, "approval_required");
  assert.deepEqual(r.action, { kind: "ask_founder", question: "spend money?" });
  assert.ok(isCoherentHold(r), "ask_founder must be a coherent hold, not a crash");
});

test("Cutoff-2 sweep includes material ask_founder as a coherent quiescent hold", () => {
  const r = reduceManagementState(
    base({
      contract: {
        ...contract,
        ambiguities: [
          {
            question: "irreversible external commitment?",
            materiality: "material",
            resolution: "founder must decide",
            resolvedBy: "founder",
            requiresFounderApproval: true,
          },
        ],
      },
    }),
  );
  assert.equal(r.state, "approval_required");
  assert.equal(r.action.kind, "ask_founder");
  assert.ok(isCoherentHold(r));
});

test("pending founder approval parks the loop on await_wake, never a model call", () => {
  const r = reduceManagementState(base({ pendingApproval: { question: "approve $5 buy?" } }));
  assert.equal(r.state, "approval_required");
  assert.equal(r.action.kind, "await_wake");
  assert.ok(isCoherentHold(r));
});

test("all required resolved → propose_completion (Somebody proposes; gate decides)", () => {
  const satisfied = requirement({ state: "satisfied", resolution: { resolutionId: "res", acceptedDecisionId: null, acceptedAssignmentId: null, acceptedIntentId: null, proofRefs: [], contractRevision: 1, acceptedAt: at } });
  const r = reduceManagementState(base({ requirements: [satisfied] }));
  assert.equal(r.action.kind, "propose_completion");
  assert.notEqual(r.state, "completed"); // the reducer NEVER completes anything itself
});

test("accepted gate verdict is the ONLY route to completed", () => {
  const satisfied = requirement({ state: "satisfied", resolution: { resolutionId: "res", acceptedDecisionId: null, acceptedAssignmentId: null, acceptedIntentId: null, proofRefs: [], contractRevision: 1, acceptedAt: at } });
  const r = reduceManagementState(
    base({
      requirements: [satisfied],
      completionProposal: {
        accepted: true,
        objectiveState: "completed",
        satisfiedRequired: ["page_live"],
        disclosedPendingSupporting: [],
        levelsAboveBarPending: [],
      },
    }),
  );
  assert.equal(r.state, "completed");
});

test("gate rejection with no open required (stale proof) → recovery_required, not a propose loop", () => {
  const satisfied = requirement({ state: "satisfied", resolution: { resolutionId: "res", acceptedDecisionId: null, acceptedAssignmentId: null, acceptedIntentId: null, proofRefs: [], contractRevision: 0, acceptedAt: at } });
  const r = reduceManagementState(
    base({
      requirements: [satisfied],
      completionProposal: { accepted: false, objectiveState: "executing", unmet: ["proof stale"] },
    }),
  );
  assert.equal(r.state, "recovery_required");
});

test("no eligible path anywhere + a blocked requirement → blocked awaiting recovery_event", () => {
  const r = reduceManagementState(
    base({
      requirements: [requirement({ state: "blocked", blockedReason: "registry down" })],
      // grounded this revision, and grounding found nothing executable
      groundedByRequirement: new Map([["page_live", [ineligibleOption("page_live")]]]),
    }),
  );
  assert.equal(r.state, "blocked");
  assert.deepEqual(r.action, { kind: "await_wake", reason: "recovery_event" });
});

test("no eligible path but nothing blocked → waiting on timeout wake", () => {
  const r = reduceManagementState(
    base({ groundedByRequirement: new Map([["page_live", [ineligibleOption("page_live")]]]) }),
  );
  assert.equal(r.state, "waiting");
  assert.equal(r.action.kind, "await_wake");
});

test("a never-grounded requirement is DECISION WORK, not a dead end", () => {
  const r = reduceManagementState(base({ groundedByRequirement: new Map() }));
  assert.equal(r.state, "executing");
  assert.deepEqual(r.action, { kind: "decide_requirement", requirementKey: "page_live" });
});

test("empty options[] is NOT grounded — still decision work (retryable proposal failure)", () => {
  const r = reduceManagementState(
    base({ groundedByRequirement: new Map([["page_live", []]]) }),
  );
  assert.equal(r.state, "executing");
  assert.deepEqual(r.action, { kind: "decide_requirement", requirementKey: "page_live" });
});

test("empty options[] at refusal ceiling → recovery_required (not waiting forever)", () => {
  const r = reduceManagementState(
    base({
      groundedByRequirement: new Map([["page_live", []]]),
      decisionRefusalAttempts: { page_live: 3 },
      beginDecisionCeiling: 3,
    }),
  );
  assert.equal(r.state, "recovery_required");
  assert.equal(r.action.kind, "hold");
});

test("eligible candidate persisted by a REFUSED decision at the refusal ceiling → recovery_required (never wedged executing)", () => {
  // Portability gate regression: the begin step declines at the ceiling, so the
  // reducer must not keep scheduling decide_requirement for it.
  const r = reduceManagementState(
    base({
      groundedByRequirement: new Map([["page_live", [eligibleOption("page_live")]]]),
      decisionRefusalAttempts: { page_live: 3 },
      beginDecisionCeiling: 3,
    }),
  );
  assert.equal(r.state, "recovery_required");
  assert.equal(r.action.kind, "hold");
  assert.ok(isCoherentHold(r));
});

test("eligible candidate below the refusal ceiling is still decision work", () => {
  const r = reduceManagementState(
    base({
      groundedByRequirement: new Map([["page_live", [eligibleOption("page_live")]]]),
      decisionRefusalAttempts: { page_live: 2 },
      beginDecisionCeiling: 3,
    }),
  );
  assert.equal(r.state, "executing");
  assert.deepEqual(r.action, { kind: "decide_requirement", requirementKey: "page_live" });
});

test("one blocked requirement never stops a solvable sibling", () => {
  const r = reduceManagementState(
    base({
      requirements: [
        requirement({ requirementKey: "blocked_one", state: "blocked", blockedReason: "no path" }),
        requirement({ requirementKey: "solvable_one" }),
      ],
      groundedByRequirement: new Map([
        ["blocked_one", [ineligibleOption("blocked_one")]],
        ["solvable_one", [eligibleOption("solvable_one")]],
      ]),
    }),
  );
  assert.equal(r.state, "executing");
  assert.deepEqual(r.action, { kind: "decide_requirement", requirementKey: "solvable_one" });
});

test("work in flight → await_wake; awaiting_m3 intent reads waiting_for_resource", () => {
  const running: Assignment = {
    assignmentId: "asg_1", objectiveKey: "obj_launch", requirementKey: "page_live",
    contractRevision: 1, decisionId: "dec_1", workerKey: "w", kind: "internal_make",
    state: "running", attempt: 1, runId: "run_1",
    workContract: undefined as unknown as Assignment["workContract"],
    resultSummary: null, idempotencyScope: "scope", createdAt: at, updatedAt: at,
  };
  const r = reduceManagementState(base({ assignments: [running] }));
  assert.equal(r.state, "executing");
  assert.equal(r.action.kind, "await_wake");

  const intent: ExecutionIntent = {
    intentId: "int_1", idempotencyKey: "idem_1", objectiveKey: "obj_launch",
    requirementKey: "page_live", contractRevision: 1, decisionId: "dec_1",
    kind: "external_acquisition", strategy: "BUY",
    target: { offeringId: "off", providerId: "p", serviceId: "s", resourceClass: "public_web", endpointRef: null },
    terms: { priceUsd: 1.5, priceProvenance: "provider_quote", requiresApproval: false, approvalId: null },
    state: "awaiting_m3", attempts: 0, lastEventId: null, resultEvidenceId: null,
    verificationEvidenceId: null, boundaryNote: "M3 rail unavailable", createdAt: at, updatedAt: at,
  };
  const r2 = reduceManagementState(base({ intents: [intent] }));
  assert.equal(r2.state, "waiting_for_resource");
  assert.ok(isQuiescent(r2.state));
  assert.ok(isCoherentHold(r2));
});

test("stable decision order: required before supporting, then key order — not insertion order", () => {
  const r = reduceManagementState(
    base({
      requirements: [
        requirement({ requirementKey: "zz_support", priority: "supporting" }),
        requirement({ requirementKey: "aa_required" }),
      ],
      groundedByRequirement: new Map([
        ["zz_support", [eligibleOption("zz_support")]],
        ["aa_required", [eligibleOption("aa_required")]],
      ]),
    }),
  );
  assert.deepEqual(r.action, { kind: "decide_requirement", requirementKey: "aa_required" });
});

test("stale contract in facts vs current revision → recovery_required (never acts on old truth)", () => {
  const r = reduceManagementState(base({ currentContractRevision: 2 }));
  assert.equal(r.state, "recovery_required");
});

test("Cutoff-2 sweep: every reachable state is a ManagementState literal and quiescent ones hold coherently", () => {
  const scenarios: ReducerFacts[] = [
    base({ contract: null }),
    base({ budgetVerdict: { ok: false, limit: "x", detail: "d", state: "recovery_required" } }),
    base({ pendingApproval: { question: "q" } }),
    base({
      contract: {
        ...contract,
        ambiguities: [
          {
            question: "spend?",
            materiality: "material",
            resolution: "founder",
            resolvedBy: "founder",
            requiresFounderApproval: true,
          },
        ],
      },
    }),
    base({ groundedByRequirement: new Map() }),
    base({ requirements: [requirement({ state: "blocked", blockedReason: "b" })], groundedByRequirement: new Map([["page_live", [ineligibleOption("page_live")]]]) }),
    base(),
  ];
  const legal = new Set(["received","planning","ready_to_execute","executing","waiting_for_resource","completed","failed","waiting","approval_required","blocked","escalated","recovery_required"]);
  for (const facts of scenarios) {
    const r = reduceManagementState(facts);
    assert.ok(legal.has(r.state), `state ${r.state} not a legal ManagementState`);
    if (isQuiescent(r.state)) assert.ok(isCoherentHold(r), `quiescent ${r.state} carries active action ${r.action.kind}`);
  }
});
