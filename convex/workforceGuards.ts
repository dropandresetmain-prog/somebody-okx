// Pure guards for worker reservation logic.
// These are deterministic checks with no side effects, used by Convex mutations
// to enforce reservation rules atomically.

import type { WorkerRecord } from "../lib/management/types";

// A worker is reservation-free if:
//   - lifecycle is "available" (never reserved), OR
//   - lifecycle is "assigned" but the reservation lease has lapsed (heldUntil <= now)
// Suspended/retired workers are never reservable.
export function isReservationFree(
  worker: WorkerRecord,
  now: number,
): boolean {
  if (worker.lifecycle === "suspended" || worker.lifecycle === "retired")
    return false;
  if (worker.lifecycle === "available") return true;
  // "assigned" is available again once its reservation lease has lapsed.
  if (!worker.reservedBy) return true;
  return worker.reservedBy.heldUntil <= now;
}

// Convex-side reservation guard: returns a typed reason for refusal.
// Mirrors isReservationFree but provides diagnostic reasons.
export function convexReservable(
  worker: WorkerRecord,
  now: number,
): { ok: true } | { ok: false; reason: string } {
  if (worker.lifecycle === "suspended")
    return { ok: false, reason: "worker_suspended" };
  if (worker.lifecycle === "retired")
    return { ok: false, reason: "worker_retired" };
  if (worker.lifecycle === "available") return { ok: true };
  // "assigned" with lapsed lease is available
  if (!worker.reservedBy) return { ok: true };
  if (worker.reservedBy.heldUntil <= now) return { ok: true };
  return { ok: false, reason: "worker_reserved" };
}

// Check if a worker can accept a new reservation for a specific assignment.
// Returns true if the worker is free OR already reserved by the SAME assignmentId
// (idempotent replay).
export function canAcceptReservation(
  worker: WorkerRecord,
  assignmentId: string,
  now: number,
): { ok: true } | { ok: false; reason: string } {
  // Idempotent replay: already reserved by this assignment
  if (
    worker.reservedBy &&
    worker.reservedBy.assignmentId === assignmentId &&
    worker.lifecycle === "assigned"
  ) {
    return { ok: true };
  }
  return convexReservable(worker, now);
}
