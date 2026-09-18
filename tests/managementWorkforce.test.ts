// Pure guards tests for workforce reservation logic.
// Tests the deterministic guards without Convex runtime.

import test from "node:test";
import assert from "node:assert/strict";
import {
  isReservationFree,
  convexReservable,
  canAcceptReservation,
} from "../convex/workforceGuards";
import type { WorkerRecord } from "../lib/management/types";

const now = 1800000000000;

function worker(overrides: Partial<WorkerRecord> = {}): WorkerRecord {
  return {
    workerKey: "worker_test",
    displayName: "Test Worker",
    capabilityKeys: ["public_information_research"],
    dynamicCapabilities: [],
    responsibility: "Test responsibility",
    lifecycle: "available",
    reservedBy: null,
    verifiedAssignments: [],
    contextRefs: [],
    createdByObjective: null,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

// ── isReservationFree ────────────────────────────────────────────────────────

test("isReservationFree: available worker is free", () => {
  const w = worker({ lifecycle: "available" });
  assert.equal(isReservationFree(w, now), true);
});

test("isReservationFree: assigned worker with expired lease is free", () => {
  const w = worker({
    lifecycle: "assigned",
    reservedBy: {
      objectiveKey: "obj_1",
      requirementKey: "req_1",
      assignmentId: "assign_1",
      heldUntil: now - 1000, // expired
    },
  });
  assert.equal(isReservationFree(w, now), true);
});

test("isReservationFree: assigned worker with active lease is NOT free", () => {
  const w = worker({
    lifecycle: "assigned",
    reservedBy: {
      objectiveKey: "obj_1",
      requirementKey: "req_1",
      assignmentId: "assign_1",
      heldUntil: now + 10000, // active
    },
  });
  assert.equal(isReservationFree(w, now), false);
});

test("isReservationFree: suspended worker is NOT free", () => {
  const w = worker({ lifecycle: "suspended" });
  assert.equal(isReservationFree(w, now), false);
});

test("isReservationFree: retired worker is NOT free", () => {
  const w = worker({ lifecycle: "retired" });
  assert.equal(isReservationFree(w, now), false);
});

// ── convexReservable ─────────────────────────────────────────────────────────

test("convexReservable: available worker returns ok", () => {
  const w = worker({ lifecycle: "available" });
  const result = convexReservable(w, now);
  assert.equal(result.ok, true);
});

test("convexReservable: suspended worker returns worker_suspended", () => {
  const w = worker({ lifecycle: "suspended" });
  const result = convexReservable(w, now);
  assert.equal(result.ok, false);
  assert.equal(result.reason, "worker_suspended");
});

test("convexReservable: retired worker returns worker_retired", () => {
  const w = worker({ lifecycle: "retired" });
  const result = convexReservable(w, now);
  assert.equal(result.ok, false);
  assert.equal(result.reason, "worker_retired");
});

test("convexReservable: assigned worker with active lease returns worker_reserved", () => {
  const w = worker({
    lifecycle: "assigned",
    reservedBy: {
      objectiveKey: "obj_1",
      requirementKey: "req_1",
      assignmentId: "assign_1",
      heldUntil: now + 10000,
    },
  });
  const result = convexReservable(w, now);
  assert.equal(result.ok, false);
  assert.equal(result.reason, "worker_reserved");
});

test("convexReservable: assigned worker with expired lease returns ok", () => {
  const w = worker({
    lifecycle: "assigned",
    reservedBy: {
      objectiveKey: "obj_1",
      requirementKey: "req_1",
      assignmentId: "assign_1",
      heldUntil: now - 1000,
    },
  });
  const result = convexReservable(w, now);
  assert.equal(result.ok, true);
});

// ── canAcceptReservation ─────────────────────────────────────────────────────

test("canAcceptReservation: free worker can accept", () => {
  const w = worker({ lifecycle: "available" });
  const result = canAcceptReservation(w, "assign_1", now);
  assert.equal(result.ok, true);
});

test("canAcceptReservation: worker reserved by same assignmentId returns ok (replay)", () => {
  const w = worker({
    lifecycle: "assigned",
    reservedBy: {
      objectiveKey: "obj_1",
      requirementKey: "req_1",
      assignmentId: "assign_1",
      heldUntil: now + 10000,
    },
  });
  const result = canAcceptReservation(w, "assign_1", now);
  assert.equal(result.ok, true);
});

test("canAcceptReservation: worker reserved by different assignmentId returns worker_reserved", () => {
  const w = worker({
    lifecycle: "assigned",
    reservedBy: {
      objectiveKey: "obj_1",
      requirementKey: "req_1",
      assignmentId: "assign_1",
      heldUntil: now + 10000,
    },
  });
  const result = canAcceptReservation(w, "assign_2", now);
  assert.equal(result.ok, false);
  assert.equal(result.reason, "worker_reserved");
});

test("canAcceptReservation: suspended worker returns worker_suspended", () => {
  const w = worker({ lifecycle: "suspended" });
  const result = canAcceptReservation(w, "assign_1", now);
  assert.equal(result.ok, false);
  assert.equal(result.reason, "worker_suspended");
});

test("canAcceptReservation: retired worker returns worker_retired", () => {
  const w = worker({ lifecycle: "retired" });
  const result = canAcceptReservation(w, "assign_1", now);
  assert.equal(result.ok, false);
  assert.equal(result.reason, "worker_retired");
});
