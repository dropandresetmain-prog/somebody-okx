// Overlapping management-graph invocations must not cross Objective deps.
// A sequential two-Objective test is NOT enough — this forces A to pause
// inside a node while B runs to completion on the same compiled graph.

import test from "node:test";
import assert from "node:assert/strict";
import { buildManagementGraph, type ManagementPorts } from "../lib/management/graph";
import type { GraphState, ManagementState } from "../lib/management/types";

function emptyState(objectiveKey: string): GraphState {
  return {
    objectiveKey,
    contractRevision: null,
    focusRequirementKey: null,
    managerDecisionId: null,
    pendingIntentId: null,
    wakeReason: null,
    wakeEventIds: [],
    continuation: {},
    lastNode: null,
    pass: 0,
  };
}

function portsFor(
  expectedKey: string,
  log: string[],
  pause?: { signalEntered: () => void; wait: Promise<void> },
): ManagementPorts {
  const assertKey = (objectiveKey: string, op: string) => {
    assert.equal(objectiveKey, expectedKey, `${op} crossed into ${objectiveKey} (expected ${expectedKey})`);
    log.push(`${op}:${objectiveKey}`);
  };
  return {
    async loadContract(objectiveKey) {
      assertKey(objectiveKey, "loadContract");
      return { contract: null, currentContractRevision: 0 };
    },
    async loadRequirements(objectiveKey) {
      assertKey(objectiveKey, "loadRequirements");
      return [];
    },
    async loadGrounded(objectiveKey) {
      assertKey(objectiveKey, "loadGrounded");
      return new Map();
    },
    async loadDecisionRefusalAttempts(objectiveKey) {
      assertKey(objectiveKey, "loadDecisionRefusalAttempts");
      return {};
    },
    async loadAssignments(objectiveKey) {
      assertKey(objectiveKey, "loadAssignments");
      return [];
    },
    async loadIntents(objectiveKey) {
      assertKey(objectiveKey, "loadIntents");
      return [];
    },
    async loadBudgetVerdict(objectiveKey) {
      assertKey(objectiveKey, "loadBudgetVerdict");
      return { ok: true };
    },
    async loadObjectiveBudget(objectiveKey) {
      assertKey(objectiveKey, "loadObjectiveBudget");
      return null;
    },
    async loadPendingApproval(objectiveKey) {
      assertKey(objectiveKey, "loadPendingApproval");
      return null;
    },
    async loadCompletionVerdict(objectiveKey) {
      assertKey(objectiveKey, "loadCompletionVerdict");
      return null;
    },
    async loadWakeEvents(objectiveKey) {
      assertKey(objectiveKey, "loadWakeEvents");
      if (pause) {
        pause.signalEntered();
        await pause.wait;
      }
      return [];
    },
    async consumeWakeEvents(objectiveKey) {
      assertKey(objectiveKey, "consumeWakeEvents");
    },
    async spendDecisionCall(objectiveKey) {
      assertKey(objectiveKey, "spendDecisionCall");
    },
    async runDecisionPass(state) {
      assert.equal(state.objectiveKey, expectedKey);
      log.push(`runDecisionPass:${state.objectiveKey}`);
      return null;
    },
    async persistDecision() {
      throw new Error(`persistDecision must not run for ${expectedKey}`);
    },
    async recordSatisfactionAttempt(state) {
      assert.equal(state.objectiveKey, expectedKey);
      return false;
    },
    async proposeCompletion(proposal) {
      assert.equal(proposal.objectiveKey, expectedKey);
      throw new Error("proposeCompletion unexpected");
    },
    async writeObjectiveState(objectiveKey, state: ManagementState) {
      assertKey(objectiveKey, `writeObjectiveState:${state}`);
    },
    async scheduleTimer(objectiveKey) {
      assertKey(objectiveKey, "scheduleTimer");
      return false;
    },
    async recordPassProgress(objectiveKey) {
      assertKey(objectiveKey, "recordPassProgress");
    },
    async dispatchRequirement(state) {
      assert.equal(state.objectiveKey, expectedKey);
      return null;
    },
  };
}

test("concurrent overlapping invokes keep GraphDeps invocation-local (no cross-Objective ports)", async () => {
  let releaseA!: () => void;
  const aPaused = new Promise<void>((resolve) => {
    releaseA = resolve;
  });
  let aEnteredResolve!: () => void;
  const aEntered = new Promise<void>((resolve) => {
    aEnteredResolve = resolve;
  });

  const logA: string[] = [];
  const logB: string[] = [];
  const portsA = portsFor("obj_A", logA, { signalEntered: aEnteredResolve, wait: aPaused });
  const portsB = portsFor("obj_B", logB);

  // Same compiled topology for both — the bug was module-global active deps.
  const graphA = buildManagementGraph({ ports: portsA, now: () => 1_900_000_000_000 });
  const graphB = buildManagementGraph({ ports: portsB, now: () => 1_900_000_000_001 });

  const invokeA = graphA.invoke(emptyState("obj_A"));
  await aEntered; // A is inside observe with ports A, paused

  const resultB = await graphB.invoke(emptyState("obj_B"));
  assert.equal(resultB.final.objectiveKey, "obj_B");
  assert.ok(logB.some((entry) => entry.includes("obj_B")));
  assert.ok(logB.every((entry) => !entry.includes("obj_A")), `B log leaked A: ${logB.join(",")}`);
  assert.ok(
    logA.every((entry) => !entry.includes("obj_B")),
    `A log already saw B while paused: ${logA.join(",")}`,
  );

  releaseA();
  const resultA = await invokeA;
  assert.equal(resultA.final.objectiveKey, "obj_A");
  assert.ok(logA.every((entry) => !entry.includes("obj_B")), `A resumed onto B deps: ${logA.join(",")}`);
  assert.ok(logB.every((entry) => !entry.includes("obj_A")), `B later polluted by A: ${logB.join(",")}`);
  assert.ok(logA.some((entry) => entry.startsWith("loadWakeEvents:obj_A")));
  assert.ok(logA.some((entry) => entry.startsWith("loadContract:obj_A")));
  assert.ok(logB.some((entry) => entry.startsWith("loadWakeEvents:obj_B")));
});
