// Pure run-lifecycle guards for the M1 Convex objective runtime.
//
// R1 Blocker E: run finalization and lease fencing were not actually enforced.
// `finishRun` only compared run ids, and `assertActiveRun` only compared id +
// status, so a run whose lease had lapsed (or one that had already been
// finalized) could still write and still flip a failed objective to completed.
//
// These decisions are kept as pure functions with no Convex imports so the
// fencing rules themselves are unit-testable without a deployment, and so the
// runtime (`convex/objectives.ts`) stays thin.

import type { ObjectiveState, WorkerRun } from "./types";

// Worker lease window, and the live execution budget inside it.
// The runner must abort strictly before the lease lapses so that the only
// writer left holding a live lease is the run that is still authoritative.
export const LEASE_MS = 300_000;
export const EXECUTION_TIMEOUT_MS = 270_000;

// Guard the budget relationship at module load, so a mis-tuned constant fails
// at the source rather than producing a run that finalizes after its fence.
export function assertLeaseBudget(): void {
  if (!(EXECUTION_TIMEOUT_MS > 0 && EXECUTION_TIMEOUT_MS < LEASE_MS))
    throw new Error(
      "Worker execution timeout must be strictly shorter than the lease",
    );
}
assertLeaseBudget();

// The single definition of "this run may still act". Every durable write from
// a worker goes through it: identity, liveness and lease must all hold.
export type WriteFence = { ok: true } | { ok: false; reason: string };

export function fenceRunWrite(input: {
  run: WorkerRun | null | undefined;
  runId: string;
  now: number;
}): WriteFence {
  const { run, runId, now } = input;
  if (!run)
    return { ok: false, reason: `Objective has no run to write as ${runId}` };
  if (run.id !== runId)
    return {
      ok: false,
      reason: `Run ${runId} is not the active run; ${run.id} replaced it`,
    };
  if (run.status !== "running")
    return {
      ok: false,
      reason: `Run ${runId} is ${run.status}, not running`,
    };
  if (run.leaseUntil <= now)
    return {
      ok: false,
      reason: `Run ${runId} lease expired at ${run.leaseUntil}`,
    };
  return { ok: true };
}

export function isRunActive(input: {
  run: WorkerRun | null | undefined;
  runId: string;
  now: number;
}): boolean {
  return fenceRunWrite(input).ok;
}

export type FinalizationDecision =
  | { kind: "finalize" }
  // Deterministic no-op: the caller must not patch completion state, and the
  // answer it returns reflects durable truth rather than this call's intent.
  | { kind: "no-op"; reason: string; completed: boolean };

// Finalization is only allowed by the live, lease-holding run. Everything else
// — a replaced run, an expired run, or a second call after finalization — is a
// harmless no-op that reports the objective's already-persisted state. Partial
// failure can therefore never be turned into success by a late writer.
export function decideFinalization(input: {
  run: WorkerRun | null | undefined;
  runId: string;
  now: number;
  state: ObjectiveState;
}): FinalizationDecision {
  const fence = fenceRunWrite(input);
  if (fence.ok) return { kind: "finalize" };
  return {
    kind: "no-op",
    reason: fence.reason,
    completed: input.state === "completed",
  };
}
