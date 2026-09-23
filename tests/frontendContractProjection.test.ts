// Level 1 — pure truth tables for the V1 product projection.
// SSOT: docs/product/FRONTEND_CONTRACTS.md. No Convex, no clock, no models.

import test from "node:test";
import assert from "node:assert/strict";
import type { ActivityItem } from "../app/product/contracts";
import {
  deriveInternState,
  deriveObjectiveFacts,
  deriveViewRevision,
  groupObjectiveSummaries,
  projectAcquisitions,
  projectActivity,
  projectDeliverables,
  projectObjectiveSummary,
  projectObjectiveWorkspace,
  projectProgress,
  projectStartCapabilities,
  type ProductAcquisitionResult,
  type ProductArtifact,
  type ProductAssignment,
  type ProductDecision,
  type ProductIntent,
  type ProductObjectiveRow,
  type ProductRequirement,
  type ProductSource,
} from "../lib/product/frontendProjection";

const NOW = 1_820_000_000_000;
const KEY = "obj_1";

function objective(over: Partial<ProductObjectiveRow> = {}): ProductObjectiveRow {
  return {
    key: KEY,
    request: "Our launch isn't working. Fix it and relaunch today.",
    createdAt: NOW - 100_000,
    updatedAt: NOW - 1000,
    state: "executing",
    result: null,
    workItems: [],
    companyArtifacts: [],
    acquisitionResults: [],
    resourceNeeds: [],
    finalSemanticAssessment: null,
    controlNotes: [],
    pendingFinalAssessmentRevision: null,
    interpretationStatus: null,
    ...over,
  };
}

function req(key: string, over: Partial<ProductRequirement> = {}): ProductRequirement {
  return {
    requirementKey: key,
    contractRevision: 1,
    priority: "required",
    title: `Title ${key}`,
    mustBeTrue: `${key} must be true`,
    scope: `scope ${key}`,
    dependsOnRequirementKeys: [],
    state: "active",
    resolution: null,
    blockedReason: null,
    waiver: null,
    updatedAt: NOW - 5000,
    ...over,
  };
}

const satisfied = (key: string, rev = 1, over: Partial<ProductRequirement> = {}) =>
  req(key, { state: "satisfied", resolution: { contractRevision: rev, acceptedAt: NOW - 3000 }, contractRevision: rev, ...over });

function assignment(id: string, requirementKey: string, over: Partial<ProductAssignment> = {}): ProductAssignment {
  return {
    assignmentId: id,
    workerKey: "w1",
    requirementKey,
    decisionId: `dec_${id}`,
    contractRevision: 1,
    kind: "internal_make",
    state: "running",
    runId: `run_${id}`,
    resultSummary: null,
    inputEvidenceIds: [],
    targetArtifactKey: null,
    createdAt: NOW - 20_000,
    updatedAt: NOW - 10_000,
    ...over,
  };
}

function decision(id: string, requirementKey: string, over: Partial<ProductDecision> = {}): ProductDecision {
  return {
    decisionId: id,
    requirementKey,
    contractRevision: 1,
    kind: "satisfaction_strategy",
    strategy: "MAKE",
    optionId: null,
    authorization: { kind: "authorized" },
    rationale: null,
    strongestAlternativeId: null,
    coarsePlanSummary: "{}",
    at: NOW - 30_000,
    ...over,
  };
}

function gate(accepted: boolean, rev = 1, at = NOW - 500): ProductDecision {
  return decision(`gate_${KEY}_r${rev}`, "", {
    kind: "completion_proposal",
    strategy: null,
    contractRevision: rev,
    authorization: { kind: "refused" },
    coarsePlanSummary: JSON.stringify({ gateVerdict: { accepted } }),
    at,
  });
}

function intent(id: string, over: Partial<ProductIntent> = {}): ProductIntent {
  return {
    intentId: id,
    requirementKey: "r1",
    decisionId: `dec_${id}`,
    contractRevision: 1,
    kind: "external_acquisition",
    target: { providerId: "prov", serviceId: "svc", offeringId: "off", resourceClass: "market_data" },
    terms: { priceUsd: 2, priceProvenance: "provider_quote" },
    state: "authorized",
    resultEvidenceId: null,
    createdAt: NOW - 40_000,
    updatedAt: NOW - 39_000,
    ...over,
  };
}

function acqResult(intentId: string, evidenceId: string, over: Partial<ProductAcquisitionResult> = {}): ProductAcquisitionResult {
  return {
    intentId,
    resultEvidenceId: evidenceId,
    provenance: "simulation",
    providerId: "prov",
    serviceId: "svc",
    content: "acquired content",
    recordedAt: NOW - 35_000,
    verifiedAt: NOW - 34_000,
    ...over,
  };
}

function source(over: Partial<ProductSource> = {}): ProductSource {
  return {
    objective: objective(),
    contracts: [{ contractId: "c1", revision: 1, intent: "Ship a working launch", createdAt: NOW - 90_000 }],
    requirements: [req("r1")],
    assignments: [],
    decisions: [],
    intents: [],
    workers: [{ workerKey: "w1", displayName: "Ada", responsibility: "Fix launch", lifecycle: "assigned", verifiedAssignments: [] }],
    evidence: [],
    ...over,
  };
}

const opts = { now: NOW };
const LEGAL = {
  approval: [{ id: "approve", type: "approve" as const, label: "Approve" }],
  clarification: [{ id: "answer", type: "provide_input" as const, label: "Answer", requiresText: true }],
  reconciliation: [{ id: "ack", type: "acknowledge" as const, label: "Reconcile" }],
};
const status = (s: ProductSource, attentionActions?: Parameters<typeof deriveObjectiveFacts>[1]) => deriveObjectiveFacts(s, attentionActions).status;

function buyOptionSummary(optionId: string, priceUsd: number, strategy = "BUY") {
  return JSON.stringify({
    original: strategy,
    extra: {
      options: [
        {
          optionId,
          strategy,
          external: {
            offeringId: "off_1",
            providerId: "prov",
            priceUsd,
            priceSource: "provider_quote",
            registryVerified: true,
            compatibleResourceClass: true,
            executionPathConfigured: true,
            purposeScopeCompatible: true,
          },
        },
      ],
    },
  });
}

/** Full legal spend-approval fixture (shared policy preconditions). */
function spendApprovalSource(priceUsd = 6.8, over: Partial<ProductSource> = {}): ProductSource {
  const question = "No founder spend limit is set. Approve a bounded spend limit?";
  const at = NOW - 30_000;
  const base = source({
    objective: objective({
      controlNotes: [{ type: "pending_approval", question, at }],
    }),
    decisions: [
      decision("d1", "r1", {
        strategy: "BUY",
        optionId: "opt_buy",
        authorization: { kind: "approval_required", question, reason: "spend_authority_required" },
        coarsePlanSummary: buyOptionSummary("opt_buy", priceUsd),
        at,
      }),
    ],
  });
  return { ...base, ...over, objective: over.objective ?? base.objective, decisions: over.decisions ?? base.decisions };
}

// ── Objective status ─────────────────────────────────────────────────────────

test("status: completed needs row completed AND accepted gate for the current revision", () => {
  const done = source({ objective: objective({ state: "completed" }), requirements: [satisfied("r1")], decisions: [gate(true)] });
  assert.equal(status(done), "completed");
  const noGate = source({ objective: objective({ state: "completed" }), requirements: [satisfied("r1")] });
  assert.equal(status(noGate), "verifying", "completed row without gate is never product-completed");
  const rejected = source({ objective: objective({ state: "completed" }), requirements: [satisfied("r1")], decisions: [gate(false)] });
  assert.notEqual(status(rejected), "completed");
  const staleGate = source({
    objective: objective({ state: "completed" }),
    contracts: [{ contractId: "c1", revision: 2, intent: "x", createdAt: 1 }],
    requirements: [satisfied("r1", 2)],
    decisions: [gate(true, 1)],
  });
  assert.notEqual(status(staleGate), "completed", "a prior-revision gate cannot complete the current revision");
});

const pendingApproval = () =>
  source({
    decisions: [
      decision("d1", "r1", { strategy: "BUY", authorization: { kind: "approval_required", question: "Spend $5?", reason: "spend_authority_required" } }),
    ],
  });

test("status: pending approval with NO legal action is waiting, never needs_you", () => {
  const facts = deriveObjectiveFacts(pendingApproval());
  assert.equal(facts.status, "waiting");
  assert.equal(facts.attention, null, "no fabricated action means no Attention");
  assert.equal(facts.pendingFounder?.attention.id, "d1");
  const view = projectObjectiveWorkspace(pendingApproval(), opts);
  assert.equal(view.attention, null);
  assert.equal(view.somebodyNow.state, "waiting");
  assert.equal(byType(view.activity, "founder_action_required").length, 0);
});

test("status: legal spend approval via shared policy → needs_you", () => {
  const facts = deriveObjectiveFacts(spendApprovalSource(6.8));
  assert.equal(facts.status, "needs_you");
  assert.equal(facts.attention?.attention.type, "approval");
  assert.equal(facts.attention?.attention.actions.length, 1);
  assert.equal(facts.attention?.attention.actions[0]?.id, "approve_spend");
  assert.equal(facts.attention?.attention.actions[0]?.label, "Approve $6.80 limit");
  assert.deepEqual(facts.attention?.attention.context?.amount, { amount: "6.80", currency: "USD" });
  assert.equal(facts.attention?.attention.id, "d1");
  assert.equal(facts.pendingFounder, null);
  // Injected approval actions cannot bypass the shared spend policy.
  assert.equal(
    deriveObjectiveFacts(pendingApproval(), { attentionActions: { approval: LEGAL.approval } }).status,
    "waiting",
  );
});

test("status: approval resolved by a later decision no longer needs_you", () => {
  const s = source({
    decisions: [
      decision("d1", "r1", { authorization: { kind: "approval_required", question: "q", reason: "spend_authority_required" }, at: NOW - 30_000 }),
      decision("d2", "r1", { at: NOW - 20_000 }),
    ],
  });
  assert.equal(status(s), "working");
});

test("status: reconciliation without a legal action is blocked; with one it is needs_you", () => {
  const s = source({ intents: [intent("i1", { state: "reconciliation_required" })] });
  const without = deriveObjectiveFacts(s);
  assert.equal(without.status, "blocked");
  assert.equal(without.attention, null);
  const withAction = deriveObjectiveFacts(s, { attentionActions: { reconciliation: [{ id: "a", type: "acknowledge", label: "Reconcile" }] } });
  assert.equal(withAction.status, "needs_you");
  assert.equal(withAction.attention?.attention.type, "reconciliation");
  assert.equal(withAction.attention?.attention.id, "i1");
});

test("status: blocked required requirement, failed and recovery states → blocked, no attention", () => {
  const blockedReq = source({ requirements: [req("r1", { state: "blocked", blockedReason: "no input" })] });
  assert.equal(status(blockedReq), "blocked");
  assert.equal(deriveObjectiveFacts(blockedReq).attention, null);
  assert.equal(status(source({ objective: objective({ state: "failed" }) })), "blocked");
  assert.equal(status(source({ objective: objective({ controlNotes: [{ type: "control_state", state: "recovery_required", summary: "s", at: 1 }] }) })), "blocked");
  assert.equal(status(source({ objective: objective({ controlNotes: [{ type: "control_state", state: "escalated", summary: "s", at: 1 }] }) })), "blocked", "escalated without an ask decision has no legal founder path");
});

test("status: ASK_FOUNDER escalation → needs_you only with a legal action, else waiting", () => {
  const s = source({
    objective: objective({ controlNotes: [{ type: "control_state", state: "escalated", summary: "s", at: 1 }] }),
    decisions: [decision("d_ask", "r1", { strategy: "ASK_FOUNDER", rationale: "Which market?" })],
  });
  const withAction = deriveObjectiveFacts(s, { attentionActions: LEGAL });
  assert.equal(withAction.status, "needs_you");
  assert.equal(withAction.attention?.attention.type, "clarification");
  const without = deriveObjectiveFacts(s);
  assert.equal(without.status, "waiting");
  assert.equal(without.attention, null);
});

test("status: external provider wait → waiting; live BUY authorized intent in current revision", () => {
  assert.equal(status(source({ intents: [intent("i1", { state: "handed_off" })] })), "waiting");
  assert.equal(status(source({ intents: [intent("i1", { state: "awaiting_m3" })] })), "waiting");
  assert.equal(status(source({ objective: objective({ state: "waiting_for_resource" }) })), "waiting");
  const stale = source({
    contracts: [{ contractId: "c1", revision: 2, intent: "x", createdAt: 1 }],
    requirements: [req("r1", { contractRevision: 2 })],
    intents: [intent("i1", { state: "handed_off", contractRevision: 1 })],
  });
  assert.equal(status(stale), "working", "a prior-revision in-flight intent is not a current wait");
});

test("status: verifying when a result is delivered, an assessment is pending, or all required work is complete", () => {
  assert.equal(status(source({ assignments: [assignment("a1", "r1", { state: "result_submitted" })] })), "verifying");
  assert.equal(status(source({ objective: objective({ pendingFinalAssessmentRevision: 1 }) })), "verifying");
  assert.equal(status(source({ requirements: [satisfied("r1")] })), "verifying");
  assert.equal(status(source({ intents: [intent("i1", { state: "result_recorded", resultEvidenceId: "e1" })] })), "verifying");
});

test("status: starting before the contract exists; refused interpretation is blocked", () => {
  assert.equal(status(source({ contracts: [], requirements: [] })), "starting");
  assert.equal(
    status(source({ contracts: [], requirements: [], objective: objective({ interpretationStatus: "refused" }) })),
    "blocked",
  );
});

test("status: normal execution → working", () => {
  assert.equal(status(source({ assignments: [assignment("a1", "r1")] })), "working");
});

test("status precedence: needs_you beats blocked/waiting/verifying; blocked beats waiting; waiting beats verifying", () => {
  const both = spendApprovalSource(6.8, {
    requirements: [req("r1"), req("r2", { state: "blocked" })],
    intents: [intent("i1", { state: "handed_off", requirementKey: "r2" })],
  });
  assert.equal(status(both), "needs_you");
  const incompleteSpend = source({
    decisions: [decision("d1", "r1", { authorization: { kind: "approval_required", question: "q", reason: "spend_authority_required" } })],
    requirements: [req("r1"), req("r2", { state: "blocked" })],
    intents: [intent("i1", { state: "handed_off", requirementKey: "r2" })],
  });
  assert.equal(status(incompleteSpend), "blocked", "without a legal spend action the blocked requirement decides");
  const blockedAndWaiting = source({
    requirements: [req("r1"), req("r2", { state: "blocked" })],
    intents: [intent("i1", { state: "handed_off" })],
  });
  assert.equal(status(blockedAndWaiting), "blocked");
  const waitingAndVerifying = source({
    intents: [intent("i1", { state: "handed_off" })],
    assignments: [assignment("a1", "r1", { state: "result_submitted" })],
  });
  assert.equal(status(waitingAndVerifying), "waiting");
  // completed beats everything when the gate accepted
  const completedAll = spendApprovalSource(6.8, {
    objective: objective({
      state: "completed",
      controlNotes: [{ type: "pending_approval", question: "No founder spend limit is set. Approve a bounded spend limit?", at: NOW - 30_000 }],
    }),
    requirements: [satisfied("r1"), req("r2", { state: "blocked", priority: "supporting" })],
    decisions: [
      gate(true),
      decision("d1", "r1", {
        strategy: "BUY",
        optionId: "opt_buy",
        authorization: {
          kind: "approval_required",
          question: "No founder spend limit is set. Approve a bounded spend limit?",
          reason: "spend_authority_required",
        },
        coarsePlanSummary: buyOptionSummary("opt_buy", 6.8),
        at: NOW - 30_000,
      }),
    ],
  });
  assert.equal(status(completedAll), "completed");
});

// ── Checkpoints ──────────────────────────────────────────────────────────────

test("checkpoints: current revision, required only, superseded omitted, ids include revision", () => {
  const s = source({
    contracts: [{ contractId: "c1", revision: 2, intent: "x", createdAt: 1 }],
    requirements: [
      req("old", { contractRevision: 1 }),
      req("a", { contractRevision: 2 }),
      req("sup", { contractRevision: 2, priority: "supporting" }),
      req("gone", { contractRevision: 2, state: "superseded" }),
    ],
  });
  const progress = projectProgress(s, deriveObjectiveFacts(s));
  assert.deepEqual(progress.checkpoints.map((c) => c.id), ["checkpoint:req:2:a"]);
});

test("checkpoints: a stale resolution from an older revision never yields complete", () => {
  const s = source({
    contracts: [{ contractId: "c1", revision: 2, intent: "x", createdAt: 1 }],
    requirements: [req("a", { contractRevision: 2, state: "satisfied", resolution: { contractRevision: 1, acceptedAt: 1 } })],
  });
  const progress = projectProgress(s, deriveObjectiveFacts(s));
  assert.notEqual(progress.checkpoints[0].state, "complete");
  const bare = source({ requirements: [req("a", { state: "satisfied", resolution: null })] });
  assert.notEqual(projectProgress(bare, deriveObjectiveFacts(bare)).checkpoints[0].state, "complete", "satisfied with no resolution fails closed");
});

test("checkpoints: dependency order with key tie-breaker", () => {
  const s = source({
    requirements: [
      req("c", { dependsOnRequirementKeys: ["b"] }),
      req("b", { dependsOnRequirementKeys: ["z"] }),
      req("z"),
      req("a"),
    ],
  });
  const order = projectProgress(s, deriveObjectiveFacts(s)).checkpoints.map((c) => c.id.split(":").pop());
  assert.deepEqual(order, ["a", "z", "b", "c"]);
});

test("checkpoints: state mapping complete / blocked / active / pending", () => {
  const s = source({
    requirements: [
      satisfied("a"),
      req("b", { state: "blocked", blockedReason: "why" }),
      req("c"),
      req("d", { priority: "required", state: "waived", waiver: { authorizedBy: "founder", at: 1 } }),
    ],
    assignments: [assignment("as1", "c")],
  });
  const byId = Object.fromEntries(projectProgress(s, deriveObjectiveFacts(s)).checkpoints.map((c) => [c.id.split(":").pop(), c.state]));
  assert.deepEqual(byId, { a: "complete", b: "blocked", c: "active", d: "complete" });
});

test("checkpoints: first unresolved executable requirement is active when nothing owns work; dependents stay pending", () => {
  const s = source({ requirements: [req("a"), req("b", { dependsOnRequirementKeys: ["a"] })] });
  const states = projectProgress(s, deriveObjectiveFacts(s)).checkpoints.map((c) => c.state);
  assert.deepEqual(states, ["active", "pending"]);
});

test(">5 required requirements → first 4 plus one deterministic aggregate", () => {
  const keys = ["k1", "k2", "k3", "k4", "k5", "k6", "k7"];
  const build = (over: Record<string, Partial<ProductRequirement>> = {}) =>
    source({ requirements: keys.map((k) => req(k, over[k] ?? {})) });
  const s = build();
  const cps = projectProgress(s, deriveObjectiveFacts(s)).checkpoints;
  assert.equal(cps.length, 5);
  assert.equal(cps[4].label, "Complete remaining required work");
  assert.match(cps[4].id, /^checkpoint:remaining:1:[0-9a-f]{12}$/);
  assert.equal(cps[4].id, projectProgress(build(), deriveObjectiveFacts(build())).checkpoints[4].id, "aggregate id is stable");
  const blocked = build({ k6: { state: "blocked" } });
  assert.equal(projectProgress(blocked, deriveObjectiveFacts(blocked)).checkpoints[4].state, "blocked");
  const allDone = source({ requirements: keys.map((k) => satisfied(k)) });
  assert.equal(projectProgress(allDone, deriveObjectiveFacts(allDone)).checkpoints[4].state, "complete");
  const oneCp = source({ requirements: [req("only")] });
  assert.equal(projectProgress(oneCp, deriveObjectiveFacts(oneCp)).checkpoints.length, 1, "no padding to reach two");
});

// ── Intern ───────────────────────────────────────────────────────────────────

const obj = (over: Partial<ProductObjectiveRow> = {}) => objective(over);
const runItem = (status: "running" | "stopped" | "failed", leaseUntil: number, wiState = "running") =>
  ({ id: "wi1", state: wiState, runs: [{ id: "run_a1", status, startedAt: NOW - 9000, leaseUntil }] });

test("intern: idle / assigned / working / waiting / done", () => {
  assert.equal(deriveInternState(null, obj(), 1, NOW), "idle");
  const a = assignment("a1", "r1", { state: "dispatched" });
  assert.equal(deriveInternState(a, obj(), 1, NOW), "assigned");
  assert.equal(deriveInternState(assignment("a1", "r1"), obj({ workItems: [runItem("running", NOW + 60_000)] }), 1, NOW), "working");
  assert.equal(deriveInternState(assignment("a1", "r1"), obj({ workItems: [runItem("running", NOW + 60_000, "waiting_for_resource")] }), 1, NOW), "waiting");
  assert.equal(deriveInternState(assignment("a1", "r1", { state: "verified" }), obj(), 1, NOW), "done");
});

test("intern: expired lease is not working", () => {
  assert.equal(deriveInternState(assignment("a1", "r1"), obj({ workItems: [runItem("running", NOW - 1)] }), 1, NOW), "assigned");
});

test("intern: result_submitted, failed, superseded, stale revision are NOT done", () => {
  for (const state of ["result_submitted", "failed", "superseded"] as const) {
    assert.notEqual(deriveInternState(assignment("a1", "r1", { state }), obj(), 1, NOW), "done", state);
  }
  assert.notEqual(deriveInternState(assignment("a1", "r1", { state: "verified", contractRevision: 1 }), obj(), 2, NOW), "done");
});

test("intern done does not satisfy the requirement or complete the objective", () => {
  const s = source({ assignments: [assignment("a1", "r1", { state: "verified", resultSummary: "did it" })] });
  const view = projectObjectiveWorkspace(s, opts);
  assert.equal(view.currentWork?.intern?.state, "done");
  assert.equal(view.progress.checkpoints[0].state, "active", "requirement is still unresolved");
  assert.notEqual(view.objective.status, "completed");
});

test("currentWork priority: live assignment > active intent > wait/ask > just-verified", () => {
  const a = assignment("a1", "r1");
  const i = intent("i1", { state: "handed_off" });
  const both = projectObjectiveWorkspace(source({ assignments: [a], intents: [i], objective: obj({ workItems: [runItem("running", NOW + 60_000)] }) }), opts);
  assert.equal(both.currentWork?.id, "a1");
  assert.equal(both.currentWork?.approach, "MAKE");
  assert.equal(both.currentWork?.status, "working");
  const intentOnly = projectObjectiveWorkspace(source({ intents: [i] }), opts);
  assert.equal(intentOnly.currentWork?.id, "i1");
  assert.equal(intentOnly.currentWork?.approach, "BUY");
  const waitOnly = projectObjectiveWorkspace(source({ decisions: [decision("dw", "r1", { strategy: "WAIT" })] }), opts);
  assert.equal(waitOnly.currentWork?.id, "dw");
  assert.equal(waitOnly.currentWork?.approach, "WAIT");
  const verified = projectObjectiveWorkspace(source({ assignments: [assignment("a9", "r1", { state: "verified" })] }), opts);
  assert.equal(verified.currentWork?.status, "done");
  assert.equal(projectObjectiveWorkspace(source(), opts).currentWork, null);
});

test("currentWork never exposes HYBRID", () => {
  const hybrid = projectObjectiveWorkspace(
    source({ assignments: [assignment("a1", "r1", { kind: "internal_component_of_hybrid" })], decisions: [decision("dec_a1", "r1", { strategy: "HYBRID" })] }),
    opts,
  );
  assert.equal(hybrid.currentWork?.approach, "MAKE");
  assert.ok(!JSON.stringify(hybrid).includes("HYBRID"));
});

// ── Activity ─────────────────────────────────────────────────────────────────

const ids = (items: { id: string }[]) => items.map((i) => i.id);
const byType = (items: ActivityItem[], type: string) => items.filter((i) => i.type === type);

function acquisitionScenario() {
  const art: ProductArtifact = {
    key: "page",
    label: "Launch page",
    content: "v2 content",
    version: 2,
    updatedAt: NOW - 1000,
    history: [
      { version: 1, content: "v1 content", changedByRunId: "run_a1", changedAt: NOW - 60_000, changeNote: "initial" },
      { version: 2, content: "v2 content", changedByRunId: "run_a2", changedAt: NOW - 1000, changeNote: "used acquired data", usedAcquisitionEvidenceIds: ["ev_acq"] },
    ],
  };
  return source({
    objective: objective({
      acquisitionResults: [acqResult("i1", "ev_acq")],
      companyArtifacts: [art],
      workItems: [
        { id: "wi1", state: "completed", runs: [{ id: "run_a1", status: "stopped", startedAt: NOW - 61_000, leaseUntil: NOW }] },
        { id: "wi2", state: "running", runs: [{ id: "run_a2", status: "running", startedAt: NOW - 5000, leaseUntil: NOW + 60_000 }] },
      ],
    }),
    intents: [intent("i1", { state: "verified", resultEvidenceId: "ev_acq" })],
    assignments: [
      assignment("a1", "r1", { state: "verified", runId: "run_a1", resultSummary: "first pass", targetArtifactKey: "page", createdAt: NOW - 70_000, updatedAt: NOW - 50_000 }),
      assignment("a2", "r1", { runId: "run_a2", inputEvidenceIds: ["ev_acq"], targetArtifactKey: "page", createdAt: NOW - 6000 }),
    ],
  });
}

test("activity: stable IDs and no duplicate events for duplicate state", () => {
  const s = acquisitionScenario();
  const facts = deriveObjectiveFacts(s);
  const first = projectActivity(s, facts, NOW);
  const second = projectActivity({ ...s, assignments: [...s.assignments, ...s.assignments], intents: [...s.intents, ...s.intents] }, facts, NOW);
  assert.deepEqual(ids(first), ids(second));
  assert.equal(new Set(ids(first)).size, first.length);
  assert.deepEqual(ids(first), ids(projectActivity(s, facts, NOW)));
});

test("activity: acquisition lifecycle and explicit causality", () => {
  const s = acquisitionScenario();
  const items = projectActivity(s, deriveObjectiveFacts(s), NOW);
  assert.equal(byType(items, "acquisition_started").length, 1);
  assert.equal(byType(items, "external_result_received").length, 1);
  assert.equal(byType(items, "acquisition_submitted").length, 0, "M3 submission is never inferred");
  const verified = byType(items, "external_result_verified")[0];
  assert.equal(verified.id, "activity:external_result_verified:ev_acq");
  assert.equal(verified.provenance, "simulation");
  const resumed = byType(items, "work_resumed")[0] as { causedByActivityId?: string; id: string };
  assert.equal(resumed.id, "activity:work_resumed:run_a2");
  assert.equal(resumed.causedByActivityId, verified.id);
  const changed = byType(items, "artifact_changed")[0] as { causedByActivityId?: string; related?: { evidenceIds?: string[] }; payload?: { before?: string; after?: string } };
  assert.equal(changed.causedByActivityId, verified.id);
  assert.deepEqual(changed.related?.evidenceIds, ["ev_acq"]);
  assert.equal(changed.payload?.before, "v1 content");
  assert.equal(byType(items, "artifact_changed").length, 1, "v1 creation is not a change");
});

test("activity: no causal line from timestamp adjacency or multiple sources", () => {
  const s = acquisitionScenario();
  // Adjacent in time but not cited: no causality.
  const uncited = { ...s, assignments: s.assignments.map((a) => ({ ...a, inputEvidenceIds: [] })) };
  const uncitedItems = projectActivity(uncited, deriveObjectiveFacts(uncited), NOW);
  assert.equal(byType(uncitedItems, "work_resumed").length, 0);
  // Two evidence causes: list them, omit the single causal line.
  const two = acquisitionScenario();
  two.objective.acquisitionResults.push(acqResult("i2", "ev_two"));
  two.intents.push(intent("i2", { state: "verified", resultEvidenceId: "ev_two" }));
  two.objective.companyArtifacts[0].history[1].usedAcquisitionEvidenceIds = ["ev_acq", "ev_two"];
  two.assignments[1].inputEvidenceIds = ["ev_acq", "ev_two"];
  const twoItems = projectActivity(two, deriveObjectiveFacts(two), NOW);
  const changed = byType(twoItems, "artifact_changed")[0] as { causedByActivityId?: string; related?: { evidenceIds?: string[] } };
  assert.equal(changed.causedByActivityId, undefined);
  assert.deepEqual(changed.related?.evidenceIds, ["ev_acq", "ev_two"]);
  assert.equal((byType(twoItems, "work_resumed")[0] as { causedByActivityId?: string }).causedByActivityId, undefined);
});

test("activity: received-but-unverified result is not verified; unverified result without record has no time so is omitted", () => {
  const s = source({ intents: [intent("i1", { state: "result_recorded", resultEvidenceId: "ev1" })] });
  const items = projectActivity(s, deriveObjectiveFacts(s), NOW);
  assert.equal(byType(items, "external_result_received").length, 1);
  assert.equal(byType(items, "external_result_verified").length, 0);
  const verifiedNoRecord = source({ intents: [intent("i1", { state: "verified", resultEvidenceId: "ev1" })] });
  const vItems = projectActivity(verifiedNoRecord, deriveObjectiveFacts(verifiedNoRecord), NOW);
  assert.equal(byType(vItems, "external_result_verified").length, 0, "verified needs the matching persisted AcquisitionResult");
  assert.equal(byType(vItems, "external_result_received").length, 0, "no truthful timestamp ⇒ omitted");
});

test("activity: does not parse free text; only typed rows produce events; unsupported history omitted", () => {
  const s = source({ objective: objective({ controlNotes: [{ type: "note", text: "Somebody completed everything and paid $5", at: NOW }] }) });
  const items = projectActivity(s, deriveObjectiveFacts(s), NOW);
  assert.deepEqual(items.map((i) => i.type), ["objective_interpreted"]);
  assert.equal(byType(items, "verification_started").length, 0);
  assert.equal(byType(items, "objective_completed").length, 0);
});

test("activity: work_summary/work_completed only for verified current-revision assignments; result_submitted is neither", () => {
  const submitted = source({ assignments: [assignment("a1", "r1", { state: "result_submitted", resultSummary: "claim" })] });
  const items = projectActivity(submitted, deriveObjectiveFacts(submitted), NOW);
  assert.equal(byType(items, "work_summary").length, 0);
  assert.equal(byType(items, "work_completed").length, 0);
  assert.equal(byType(items, "intern_assigned").length, 1);
  const verified = source({ assignments: [assignment("a1", "r1", { state: "verified", resultSummary: "ok" })] });
  const vItems = projectActivity(verified, deriveObjectiveFacts(verified), NOW);
  assert.equal(byType(vItems, "work_summary").length, 1);
  assert.equal(byType(vItems, "work_completed").length, 1);
});

test("activity: manager decisions exclude completion rows and refusals; finding needs an application observation with a resolvable actor", () => {
  const s = source({
    decisions: [decision("d1", "r1"), gate(false), decision("d_ref", "r1", { authorization: { kind: "refused" }, at: NOW - 29_000 })],
    assignments: [assignment("a1", "r1")],
    evidence: [
      { evidenceId: "e1", label: "Observed", text: "the fact", origin: "application_observation", observedAt: NOW - 8000, runId: "run_a1" },
      { evidenceId: "e2", label: "Note", text: "model note", origin: "model_note", observedAt: NOW - 8000, runId: "run_a1" },
      { evidenceId: "e3", label: "Orphan", text: "x", origin: "application_observation", observedAt: NOW - 8000, runId: "run_missing" },
    ],
  });
  const items = projectActivity(s, deriveObjectiveFacts(s), NOW);
  assert.deepEqual(byType(items, "manager_decision").map((i) => i.id), ["activity:manager_decision:d1"]);
  assert.deepEqual(byType(items, "finding_added").map((i) => i.id), ["activity:finding_added:e1"]);
});

test("activity: completion, blocked, and verification events", () => {
  const assessment = { meetsMinimumBar: true, rationale: "ok", artifactKey: "page", artifactVersion: 2, evidenceRefs: [], assumptionsUnknowns: ["u"], recommendedNextAction: "ship", assessedAt: NOW - 700, contractRevision: 1 };
  const done = acquisitionScenario();
  done.objective.state = "completed";
  done.objective.result = { summary: "Delivered", completedAt: NOW - 400 };
  done.objective.finalSemanticAssessment = assessment;
  done.requirements = [satisfied("r1")];
  done.decisions = [gate(true)];
  const items = projectActivity(done, deriveObjectiveFacts(done), NOW);
  assert.equal(byType(items, "objective_completed").length, 1);
  assert.equal(byType(items, "verification_completed").length, 1);
  const blocked = source({ objective: objective({ state: "failed" }) });
  assert.equal(byType(projectActivity(blocked, deriveObjectiveFacts(blocked), NOW), "objective_blocked").length, 1);
  const stale = { ...done, contracts: [{ contractId: "c1", revision: 2, intent: "x", createdAt: 1 }] };
  assert.equal(byType(projectActivity(stale, deriveObjectiveFacts(stale), NOW), "verification_completed").length, 0, "stale assessment is not projected as current");
});

// ── Deliverables ─────────────────────────────────────────────────────────────

function artifact(key: string, version: number, content = "content"): ProductArtifact {
  return {
    key,
    label: key,
    content,
    version,
    updatedAt: NOW - 100,
    history: Array.from({ length: version }, (_, i) => ({ version: i + 1, content, changedByRunId: "run_a1", changedAt: NOW - 1000 + i, changeNote: i === 0 ? "initial" : `change ${i + 1}` })),
  };
}
const assess = (over: Record<string, unknown> = {}) => ({
  meetsMinimumBar: true, rationale: "r", artifactKey: "page", artifactVersion: 2, evidenceRefs: ["e1"],
  assumptionsUnknowns: ["unknown one"], recommendedNextAction: "next", assessedAt: NOW - 700, contractRevision: 1, ...over,
});

test("deliverables: only governed artifacts appear", () => {
  const s = source({
    objective: objective({ companyArtifacts: [artifact("page", 2), artifact("scratch", 1)] }),
    assignments: [assignment("a1", "r1", { targetArtifactKey: "page" })],
  });
  const list = projectDeliverables(s, deriveObjectiveFacts(s));
  assert.deepEqual(list.map((d) => d.id), [`deliverable:${KEY}:page`]);
  assert.equal(list[0].status, "current");
  assert.equal(list[0].version, 2);
  assert.equal(list[0].content, "content");
});

test("deliverables: assessment-bound artifact is primary; other current targets are draft; older-revision targets superseded", () => {
  const s = source({
    contracts: [{ contractId: "c1", revision: 2, intent: "x", createdAt: 1 }],
    requirements: [req("r1", { contractRevision: 2 })],
    objective: objective({ companyArtifacts: [artifact("page", 2), artifact("side", 1), artifact("legacy", 1)], finalSemanticAssessment: assess({ contractRevision: 2 }) }),
    assignments: [
      assignment("a1", "r1", { contractRevision: 2, targetArtifactKey: "side" }),
      assignment("a0", "r1", { contractRevision: 1, targetArtifactKey: "legacy" }),
    ],
  });
  const st = Object.fromEntries(projectDeliverables(s, deriveObjectiveFacts(s)).map((d) => [d.id.split(":").pop(), d.status]));
  assert.deepEqual(st, { page: "current", side: "draft", legacy: "superseded" });
});

test("deliverables: positive assessment alone is not verified; accepted completion + exact assessment is", () => {
  const base = () =>
    source({
      objective: objective({ state: "completed", companyArtifacts: [artifact("page", 2)], finalSemanticAssessment: assess(), result: { summary: "s", completedAt: NOW } }),
      requirements: [satisfied("r1")],
      assignments: [assignment("a1", "r1", { state: "verified", targetArtifactKey: "page" })],
      evidence: [{ evidenceId: "e1", label: "Ev", text: "t", origin: "application_observation", observedAt: 1, runId: "run_a1" }],
    });
  const noGate = base();
  assert.equal(projectDeliverables(noGate, deriveObjectiveFacts(noGate))[0].status, "current");
  const verified = { ...base(), decisions: [gate(true)] };
  const [d] = projectDeliverables(verified, deriveObjectiveFacts(verified));
  assert.equal(d.status, "verified");
  assert.deepEqual(d.unknowns, ["unknown one"]);
  assert.equal(d.recommendedNextMove, "next");
  assert.deepEqual(d.evidenceRefs, [{ id: "e1", label: "Ev" }]);
  const negative = { ...verified, objective: { ...verified.objective, finalSemanticAssessment: assess({ meetsMinimumBar: false }) } };
  assert.equal(projectDeliverables(negative, deriveObjectiveFacts(negative))[0].status, "current");
});

test("deliverables: stale assessment (version or revision) is ignored and its metadata not reused", () => {
  const stale = (over: Record<string, unknown>) => {
    const s = source({
      objective: objective({ state: "completed", companyArtifacts: [artifact("page", 3)], finalSemanticAssessment: assess(over) }),
      requirements: [satisfied("r1")],
      assignments: [assignment("a1", "r1", { targetArtifactKey: "page" })],
      decisions: [gate(true)],
    });
    return projectDeliverables(s, deriveObjectiveFacts(s))[0];
  };
  const versionStale = stale({ artifactVersion: 2 });
  assert.notEqual(versionStale.status, "verified");
  assert.equal(versionStale.recommendedNextMove, undefined);
  assert.equal(versionStale.unknowns, undefined);
});

// ── Acquisitions ─────────────────────────────────────────────────────────────

test("acquisition: result_received vs verified; verified needs the matching persisted result", () => {
  const rec = source({ intents: [intent("i1", { state: "result_recorded", resultEvidenceId: "e1" })], objective: objective({ acquisitionResults: [acqResult("i1", "e1")] }) });
  assert.equal(projectAcquisitions(rec, deriveObjectiveFacts(rec), {})[0].status, "result_received");
  const ver = source({ intents: [intent("i1", { state: "verified", resultEvidenceId: "e1" })], objective: objective({ acquisitionResults: [acqResult("i1", "e1")] }) });
  const [v] = projectAcquisitions(ver, deriveObjectiveFacts(ver), {});
  assert.equal(v.status, "verified");
  assert.equal(v.resultSummary, "acquired content");
  const mismatch = source({ intents: [intent("i1", { state: "verified", resultEvidenceId: "e1" })], objective: objective({ acquisitionResults: [acqResult("i1", "OTHER")] }) });
  assert.equal(projectAcquisitions(mismatch, deriveObjectiveFacts(mismatch), {})[0].status, "result_received");
});

test("acquisition: verified does not satisfy the requirement or imply completion", () => {
  const s = source({ intents: [intent("i1", { state: "verified", resultEvidenceId: "e1" })], objective: objective({ acquisitionResults: [acqResult("i1", "e1")] }) });
  const view = projectObjectiveWorkspace(s, opts);
  assert.equal(view.acquisitions[0].status, "verified");
  assert.equal(view.progress.checkpoints[0].state, "active");
  assert.notEqual(view.objective.status, "completed");
});

test("acquisition: provenance preserved when result-backed; absent (never invented) before a result", () => {
  for (const p of ["live", "simulation", "recorded_replay"] as const) {
    const s = source({ intents: [intent("i1", { state: "verified", resultEvidenceId: "e1" })], objective: objective({ acquisitionResults: [acqResult("i1", "e1", { provenance: p })] }) });
    const [a] = projectAcquisitions(s, deriveObjectiveFacts(s), { transactionFacts: { i1: { status: "confirmed", label: "Confirmed", txHash: "0xabc" } } });
    assert.equal(a.status, "verified");
    assert.equal(a.provenance, p, "exact persisted provenance");
    if (p === "live") {
      assert.equal(a.transaction?.txHash, "0xabc");
      assert.deepEqual(a.amount, { amount: "2.00", currency: "USD" });
    } else {
      assert.equal(a.transaction, undefined, `${p} has no transaction fact`);
      assert.equal(a.amount, undefined);
    }
  }
  const received = source({ intents: [intent("i1", { state: "result_recorded", resultEvidenceId: "e1" })], objective: objective({ acquisitionResults: [acqResult("i1", "e1", { provenance: "recorded_replay" })] }) });
  assert.equal(projectAcquisitions(received, deriveObjectiveFacts(received), {})[0].provenance, "recorded_replay");
  const pre = source({ intents: [intent("i1", { state: "handed_off" })] });
  const [p] = projectAcquisitions(pre, deriveObjectiveFacts(pre), {});
  assert.equal(p.status, "in_progress");
  assert.equal("provenance" in p, false, "pre-result: key absent, not null/live/simulation/unknown");
  assert.equal("transaction" in p, false, "handed_off never implies a transaction");
  const proposed = source({ decisions: [decision("dbuy", "r1", { strategy: "BUY" })] });
  assert.equal("provenance" in projectAcquisitions(proposed, deriveObjectiveFacts(proposed), {})[0], false);
  const noRecord = source({ intents: [intent("i1", { state: "verified", resultEvidenceId: "e1" })] });
  const [nr] = projectAcquisitions(noRecord, deriveObjectiveFacts(noRecord), {});
  assert.notEqual(nr.status, "verified");
  assert.equal("provenance" in nr, false);
});

test("acquisition: failed, reconciliation, proposed and needs_approval mapping", () => {
  assert.equal(projectAcquisitions(source({ intents: [intent("i1", { state: "failed" })] }), deriveObjectiveFacts(source()), {})[0].status, "failed");
  assert.equal(projectAcquisitions(source({ intents: [intent("i1", { state: "reconciliation_required" })] }), deriveObjectiveFacts(source()), {})[0].status, "reconciliation_required");
  const proposed = source({ decisions: [decision("dbuy", "r1", { strategy: "BUY" })] });
  assert.equal(projectAcquisitions(proposed, deriveObjectiveFacts(proposed), {})[0].status, "proposed");
  const needs = source({ decisions: [decision("dbuy", "r1", { strategy: "BUY", authorization: { kind: "approval_required", question: "q", reason: "spend_authority_required" } })] });
  assert.equal(projectAcquisitions(needs, deriveObjectiveFacts(needs), {})[0].status, "needs_approval");
});

// ── Attention ────────────────────────────────────────────────────────────────

test("attention: priority reconciliation > approval > clarification (legal actions only)", () => {
  const question = "No founder spend limit is set. Approve a bounded spend limit?";
  const at = NOW - 10_000;
  const approval = decision("d_appr", "r1", {
    strategy: "BUY",
    optionId: "opt_buy",
    authorization: { kind: "approval_required", question, reason: "spend_authority_required" },
    coarsePlanSummary: buyOptionSummary("opt_buy", 5),
    at,
  });
  const ask = decision("d_ask", "r2", { strategy: "ASK_FOUNDER", at: NOW - 5000 });
  const s = source({
    objective: objective({ controlNotes: [{ type: "pending_approval", question, at }] }),
    requirements: [req("r1"), req("r2")],
    decisions: [ask, approval],
    intents: [intent("i1", { state: "reconciliation_required" })],
  });
  assert.equal(deriveObjectiveFacts(s, { attentionActions: { reconciliation: LEGAL.reconciliation } }).attention?.attention.type, "reconciliation");
  assert.equal(deriveObjectiveFacts(s).attention?.attention.type, "approval");
  assert.equal(deriveObjectiveFacts(s, { attentionActions: { clarification: LEGAL.clarification } }).attention?.attention.type, "approval", "spend approval beats clarification when both are legal");
  const noSpend = source({
    requirements: [req("r1"), req("r2")],
    decisions: [ask, decision("d_appr", "r1", { authorization: { kind: "approval_required", question: "q", reason: "spend_authority_required" }, at })],
    intents: [intent("i1", { state: "reconciliation_required" })],
  });
  assert.equal(
    deriveObjectiveFacts(noSpend, { attentionActions: { clarification: LEGAL.clarification } }).attention?.attention.type,
    "clarification",
    "a higher-priority non-actionable source does not hide an actionable one",
  );
  assert.equal(deriveObjectiveFacts(noSpend).attention, null);
});

test("attention: spend actions come only from the shared policy", () => {
  assert.equal(deriveObjectiveFacts(pendingApproval()).attention, null);
  // Injected approval actions are ignored — only deriveSpendApprovalCandidate arms buttons.
  assert.equal(
    deriveObjectiveFacts(pendingApproval(), { attentionActions: { approval: LEGAL.approval } }).attention,
    null,
  );
  const legal = deriveObjectiveFacts(spendApprovalSource(6.8));
  assert.equal(legal.attention?.attention.actions[0]?.id, "approve_spend");
});

test("invariant: needs_you always implies attention with at least one legal action", () => {
  const scenarios: ProductSource[] = [
    pendingApproval(),
    spendApprovalSource(6.8),
    source({ intents: [intent("i1", { state: "reconciliation_required" })] }),
    source({ objective: objective({ controlNotes: [{ type: "control_state", state: "escalated", summary: "s", at: 1 }] }), decisions: [decision("d_ask", "r1", { strategy: "ASK_FOUNDER" })] }),
    source({ requirements: [req("r1", { state: "blocked" })] }),
    source({ objective: objective({ state: "failed" }) }),
    source({ objective: objective({ state: "approval_required", controlNotes: [{ type: "pending_approval", question: "q", at: 5 }] }) }),
  ];
  for (const adapter of [undefined, { attentionActions: LEGAL }, { attentionActions: { approval: LEGAL.approval } }, { attentionActions: { reconciliation: LEGAL.reconciliation, clarification: LEGAL.clarification } }]) {
    for (const s of scenarios) {
      const view = projectObjectiveWorkspace(s, { now: NOW, ...(adapter ?? {}) });
      if (view.objective.status === "needs_you") {
        assert.ok(view.attention && view.attention.actions.length > 0);
        assert.equal(view.somebodyNow.state, "needs_you");
      }
      if (view.attention) assert.ok(view.attention.actions.length > 0, "Attention is never non-actionable");
      assert.equal(projectObjectiveSummary(s, adapter ?? {}).hasAttention, view.attention !== null);
    }
  }
  // Legacy note-only approval stays non-actionable (no decision/option price).
  const note = scenarios[6];
  assert.equal(status(note), "waiting");
  assert.equal(status(note, { attentionActions: { approval: LEGAL.approval } }), "waiting");
});

test("attention: a blocker without a legal command is status blocked with attention null; availableActions empty", () => {
  const s = source({ requirements: [req("r1", { state: "blocked", blockedReason: "provider unavailable" })] });
  const view = projectObjectiveWorkspace(s, opts);
  assert.equal(view.objective.status, "blocked");
  assert.equal(view.attention, null);
  assert.deepEqual(view.availableActions, []);
  assert.match(view.somebodyNow.detail, /provider unavailable/);
});

// ── Somebody Now / envelope / list / capabilities ────────────────────────────

test("somebodyNow state follows product status", () => {
  const cases: Array<[ProductSource, string]> = [
    [source({ contracts: [], requirements: [] }), "interpreting"],
    [source({ assignments: [assignment("a1", "r1")] }), "working"],
    [source({ intents: [intent("i1", { state: "handed_off" })] }), "waiting"],
    [source({ decisions: [decision("d1", "r1", { authorization: { kind: "approval_required", question: "Spend?", reason: "spend_authority_required" } })] }), "waiting"],
    [source({ requirements: [satisfied("r1")] }), "verifying"],
    [source({ objective: objective({ state: "completed", result: { summary: "All done", completedAt: NOW } }), requirements: [satisfied("r1")], decisions: [gate(true)] }), "completed"],
    [source({ objective: objective({ state: "failed" }) }), "blocked"],
  ];
  for (const [s, expected] of cases) assert.equal(projectObjectiveWorkspace(s, opts).somebodyNow.state, expected);
  assert.equal(projectObjectiveWorkspace(spendApprovalSource(6.8), opts).somebodyNow.state, "needs_you");
});

test("workspace leaks no raw engine arrays or states", () => {
  const view = projectObjectiveWorkspace(acquisitionScenario(), opts);
  assert.deepEqual(Object.keys(view).sort(), ["acquisitions", "activity", "attention", "availableActions", "currentWork", "deliverables", "objective", "progress", "somebodyNow"]);
  const text = JSON.stringify(view);
  for (const leak of ["result_submitted", "awaiting_m3", "handed_off", "dependsOnRequirementKeys", "workContract", "coarsePlanSummary"]) {
    assert.ok(!text.includes(leak), `leaked ${leak}`);
  }
});

test("viewRevision is deterministic and sensitive to source changes", () => {
  const a = projectObjectiveWorkspace(acquisitionScenario(), opts);
  const b = projectObjectiveWorkspace(acquisitionScenario(), { now: NOW });
  assert.equal(deriveViewRevision(a), deriveViewRevision(b));
  const changed = acquisitionScenario();
  changed.requirements = [satisfied("r1")];
  assert.notEqual(deriveViewRevision(projectObjectiveWorkspace(changed, opts)), deriveViewRevision(a));
});

test("list: grouping and stable sort (updatedAt DESC, id tie-break)", () => {
  const mk = (key: string, updatedAt: number, s: Partial<ProductSource> = {}) => {
    const base = source(s);
    return projectObjectiveSummary({
      ...base,
      objective: { ...(s.objective ?? base.objective), key, updatedAt },
    });
  };
  const spend = spendApprovalSource(6.8);
  const list = groupObjectiveSummaries([
    mk("b", 100),
    mk("a", 100),
    mk("c", 300),
    mk("done", 50, { objective: objective({ state: "completed" }), requirements: [satisfied("r1")], decisions: [gate(true)] }),
    mk("ask", 10, {
      objective: spend.objective,
      decisions: spend.decisions,
    }),
    mk("blk", 400, { objective: objective({ state: "failed" }) }),
  ]);
  assert.deepEqual(list.inProgress.map((r) => r.id), ["blk", "c", "a", "b"]);
  assert.deepEqual(list.needsYou.map((r) => r.id), ["ask"]);
  assert.deepEqual(list.done.map((r) => r.id), ["done"]);
  assert.equal(list.needsYou[0].hasAttention, true);
  assert.equal(list.inProgress[0].status, "blocked");
  assert.deepEqual(Object.keys(list.done[0]).sort(), ["hasAttention", "id", "status", "statusLabel", "title", "updatedAt"]);
});

test("start capabilities advertise wired Create Objective only", () => {
  const caps = projectStartCapabilities();
  assert.equal(caps.canCreateObjective, true, "createObjectiveV1 is wired");
  assert.equal(caps.advanced.spendLimit, false, "spend limit is not on the product command");
  assert.deepEqual(caps, {
    canCreateObjective: true,
    supportsContextRefs: false,
    supportsAttachments: false,
    advanced: { spendLimit: false, deadline: false, externalEffectPolicy: false },
  });
});
