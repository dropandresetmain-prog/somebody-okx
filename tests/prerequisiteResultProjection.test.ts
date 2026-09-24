// Focused regression coverage for the prerequisite-result propagation fix:
// accepted conclusions from satisfied prerequisite Requirements must reach
// their dependent worker (and the manager) through ONE canonical projection
// (projectPrerequisiteResults / projectAcceptedOutputSnapshot), never a
// second interpretation and never derived from prose/UI events/stale runs.
import test from "node:test";
import assert from "node:assert/strict";
import {
  projectPrerequisiteResults,
  projectAcceptedOutputSnapshot,
  type AcceptedOutputSnapshot,
} from "../lib/management/decisionPass";

const ACCEPTED_A: AcceptedOutputSnapshot = {
  runId: "run_a",
  terminal: "DELIVERED",
  summary: "owned/public evidence inspected; audience claims unsupported",
  fit: "sufficient for messaging, not for audience sizing",
  unknowns: ["engagement rate unknown"],
  recommendedNextAction: "flag audience gap to launch plan worker",
  acceptedAt: 1000,
};

function requirementRow(overrides: Partial<{
  requirementKey: string;
  contractRevision: number;
  state: string;
  resolution: { proofRefs?: string[] } | null;
}> = {}) {
  return {
    requirementKey: "req_a",
    contractRevision: 1,
    state: "satisfied",
    resolution: { proofRefs: ["ev_1"] },
    ...overrides,
  };
}

function assignmentRow(overrides: Partial<{
  requirementKey: string;
  contractRevision: number;
  state: string;
  acceptedOutput: AcceptedOutputSnapshot | null;
}> = {}) {
  return {
    requirementKey: "req_a",
    contractRevision: 1,
    state: "verified",
    acceptedOutput: ACCEPTED_A,
    ...overrides,
  };
}

test("1: accepted output from a satisfied dependency is visible to the dependent Requirement", () => {
  const facts = projectPrerequisiteResults({
    dependsOnRequirementKeys: ["req_a"],
    currentContractRevision: 1,
    requirementRows: [requirementRow()],
    assignmentRows: [assignmentRow()],
  });
  assert.equal(facts.length, 1);
  assert.equal(facts[0]!.requirementKey, "req_a");
  assert.equal(facts[0]!.summary, ACCEPTED_A.summary);
  assert.equal(facts[0]!.fit, ACCEPTED_A.fit);
  assert.deepEqual(facts[0]!.unknowns, ACCEPTED_A.unknowns);
  assert.equal(facts[0]!.recommendedNextAction, ACCEPTED_A.recommendedNextAction);
  assert.deepEqual(facts[0]!.findings, [ACCEPTED_A.summary]);
});

test("2: an unrelated Requirement not listed in dependsOnRequirementKeys is not visible", () => {
  const facts = projectPrerequisiteResults({
    dependsOnRequirementKeys: ["req_a"],
    currentContractRevision: 1,
    requirementRows: [
      requirementRow(),
      requirementRow({ requirementKey: "req_unrelated", state: "satisfied" }),
    ],
    assignmentRows: [
      assignmentRow(),
      assignmentRow({ requirementKey: "req_unrelated", acceptedOutput: { ...ACCEPTED_A, summary: "UNRELATED" } }),
    ],
  });
  assert.deepEqual(facts.map((f) => f.requirementKey), ["req_a"]);
  assert.ok(!facts.some((f) => f.summary.includes("UNRELATED")));
});

test("3: prerequisite output bound to a different (stale) contract revision is not visible", () => {
  const facts = projectPrerequisiteResults({
    dependsOnRequirementKeys: ["req_a"],
    currentContractRevision: 2,
    requirementRows: [requirementRow({ contractRevision: 1 })], // stale revision only
    assignmentRows: [assignmentRow({ contractRevision: 1 })],
  });
  assert.deepEqual(facts, []);
});

test("3b: prerequisite output whose assignment is bound to a different revision than the current one is not visible even if the requirement row itself is current", () => {
  const facts = projectPrerequisiteResults({
    dependsOnRequirementKeys: ["req_a"],
    currentContractRevision: 2,
    requirementRows: [requirementRow({ contractRevision: 2 })],
    assignmentRows: [assignmentRow({ contractRevision: 1 })], // stale assignment
  });
  assert.equal(facts.length, 1);
  assert.equal(facts[0]!.summary, "", "no matching-revision accepted output — never fabricated");
});

test("4: failed/refused/unconfirmed assignment output is not visible (only state:'verified' with acceptedOutput counts)", () => {
  const facts = projectPrerequisiteResults({
    dependsOnRequirementKeys: ["req_a"],
    currentContractRevision: 1,
    requirementRows: [requirementRow()],
    assignmentRows: [
      assignmentRow({ state: "failed", acceptedOutput: null }),
      assignmentRow({ state: "result_submitted", acceptedOutput: null }),
    ],
  });
  assert.equal(facts.length, 1);
  assert.equal(facts[0]!.summary, "", "no verified assignment carries accepted output — stays empty, never fabricated");
  assert.deepEqual(facts[0]!.findings, []);
});

test("4b: a Requirement that is not yet satisfied/waived is excluded even if an assignment happens to carry acceptedOutput", () => {
  const facts = projectPrerequisiteResults({
    dependsOnRequirementKeys: ["req_a"],
    currentContractRevision: 1,
    requirementRows: [requirementRow({ state: "active" })],
    assignmentRows: [assignmentRow()],
  });
  assert.deepEqual(facts, []);
});

test("waived dependencies are treated the same as satisfied", () => {
  const facts = projectPrerequisiteResults({
    dependsOnRequirementKeys: ["req_a"],
    currentContractRevision: 1,
    requirementRows: [requirementRow({ state: "waived" })],
    assignmentRows: [assignmentRow()],
  });
  assert.equal(facts.length, 1);
  assert.equal(facts[0]!.state, "waived");
});

// ── projectAcceptedOutputSnapshot: the durable per-assignment snapshot source ─

test("projectAcceptedOutputSnapshot: accepts DELIVERED output matching the assignment's own runId", () => {
  const snap = projectAcceptedOutputSnapshot({
    runId: "run_x",
    serialProtocol: true,
    result: {
      runId: "run_x",
      summary: "did the work",
      fit: "good fit",
      recommendedNextAction: "ship it",
      unknowns: ["u1", "u2"],
    },
    acceptedTerminal: {
      runId: "run_x",
      terminal: "DELIVERED",
      acceptedAt: 555,
      outcome: "accepted",
    },
  });
  assert.ok(snap);
  assert.equal(snap!.runId, "run_x");
  assert.equal(snap!.terminal, "DELIVERED");
  assert.equal(snap!.summary, "did the work");
  assert.deepEqual(snap!.unknowns, ["u1", "u2"]);
  assert.equal(snap!.acceptedAt, 555);
});

test("projectAcceptedOutputSnapshot: refuses a stale/different run's result (never carries a different run's output)", () => {
  const snap = projectAcceptedOutputSnapshot({
    runId: "run_current",
    serialProtocol: true,
    result: {
      runId: "run_OLD",
      summary: "stale run output",
      fit: "n/a",
      recommendedNextAction: "n/a",
      unknowns: [],
    },
    acceptedTerminal: {
      runId: "run_OLD",
      terminal: "DELIVERED",
      acceptedAt: 1,
      outcome: "accepted",
    },
  });
  assert.equal(snap, null);
});

test("projectAcceptedOutputSnapshot: refuses when the durable terminal record has no matching accepted terminal (unconfirmed/refused result)", () => {
  const snap = projectAcceptedOutputSnapshot({
    runId: "run_x",
    serialProtocol: true,
    result: {
      runId: "run_x",
      summary: "claimed done but never accepted",
      fit: "n/a",
      recommendedNextAction: "n/a",
    },
    acceptedTerminal: null,
  });
  assert.equal(snap, null);
});

test("projectAcceptedOutputSnapshot: NEEDS_INPUT terminals are never snapshotted as prerequisite deliverable output", () => {
  const snap = projectAcceptedOutputSnapshot({
    runId: "run_x",
    serialProtocol: true,
    result: { runId: "run_x", summary: "gap", fit: "n/a", recommendedNextAction: "n/a" },
    acceptedTerminal: { runId: "run_x", terminal: "NEEDS_INPUT", acceptedAt: 1, outcome: "accepted" },
  });
  assert.equal(snap, null);
});

test("projectAcceptedOutputSnapshot: returns null with no runId", () => {
  const snap = projectAcceptedOutputSnapshot({
    runId: null,
    serialProtocol: true,
    result: null,
    acceptedTerminal: null,
  });
  assert.equal(snap, null);
});
