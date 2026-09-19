// Wake planning for worker-originated signals.
//
// The external rail has planWakeForRailEvent (intents.ts). This is the WORKER
// side: when a bounded That Guy run calls request_resource, the resource need
// is persisted by application code and Somebody must be WOKEN to replan
// (locked decision 9: "Workers request capability/resource; Somebody resolves").
// The request is DATA that wakes the manager; it never authorizes a purchase,
// a provider, or a spend — those remain Somebody's decision pass (CP2) plus the
// M3 buyer rail (sole payment authority).
//
// Identity discipline mirrors intents.ts: eventId is the dedupe identity and
// dedupeKey is derived from stable event facts, so a redelivered resource
// request (same run + resource class + purpose) wakes Somebody exactly once.
// The Convex side is appendWakeEvent (by_dedupe) → the graph's observe node.

import { hash24 } from "./sha256";
import type { WakeEvent, WakeReason } from "./types";

export type ResourceRequestWakeInput = {
  objectiveKey: string;
  runId: string;
  resourceClass: string;
  purpose: string;
  // The persisted need id, used as the wake ref so Somebody can read the truth
  // the worker proposed (the wake carries a POINTER, never the payload).
  needId: string;
  at: number;
};

export type ResourceRequestWakePlan = {
  eventId: string;
  dedupeKey: string;
  reason: WakeReason;
  event: WakeEvent;
};

// Same hash discipline as intents.ts (sha256 hex, 24 chars, via ./sha256 —
// runtime-safe, see that file). Not random: a replayed request rebuilds a
// byte-identical eventId.

export type WorkerResultWakeInput = {
  objectiveKey: string;
  runId: string;
  // Whether the run failed. A finished run is NEVER a satisfied requirement
  // (requirements.ts refuses assignment_run_finished as satisfaction); this
  // wake only tells Somebody the run reached a terminal state so the engine can
  // run its verify→propose→gate path. Completion stays the gate's decision.
  failed: boolean;
  // The spine's own completion verdict, carried as DATA in the summary only.
  // The independent gate re-derives completion from Requirements; this never
  // authorizes it.
  spineCompleted: boolean;
  at: number;
};

// Pure: derive the wake plan for a worker run reaching a terminal state.
export function planWakeForWorkerResult(
  input: WorkerResultWakeInput,
): ResourceRequestWakePlan {
  const reason: WakeReason = input.failed ? "worker_failure" : "worker_result";
  const dedupeKey = `worker_result:${input.objectiveKey}:${input.runId}:${reason}`;
  const eventId = `wake_wr_${hash24(dedupeKey)}`;
  return {
    eventId,
    dedupeKey,
    reason,
    event: {
      eventId,
      objectiveKey: input.objectiveKey,
      reason,
      // Pointer to the run that finished; the engine reads its evidence.
      refKind: "objective",
      refId: input.runId,
      summary: input.failed
        ? `worker run ${input.runId} failed`
        : `worker run ${input.runId} finished (spine completion=${input.spineCompleted}); gate re-decides`,
      at: input.at,
      consumedAt: null,
    },
  };
}

// Pure: derive the wake plan for a worker resource request. Deterministic in
// its inputs so a replay builds a byte-identical eventId/dedupeKey.
export function planWakeForResourceRequest(
  input: ResourceRequestWakeInput,
): ResourceRequestWakePlan {
  // The run may legitimately request the same resource class twice with
  // different purposes; both are distinct requests. Identity is run + class +
  // purpose so a genuinely duplicate delivery collapses and distinct needs do
  // not.
  const dedupeKey = `resource_request:${input.objectiveKey}:${input.runId}:${input.resourceClass}:${input.purpose}`;
  const eventId = `wake_rr_${hash24(dedupeKey)}`;
  return {
    eventId,
    dedupeKey,
    reason: "worker_resource_request",
    event: {
      eventId,
      objectiveKey: input.objectiveKey,
      reason: "worker_resource_request",
      // Pointer to the persisted resource need the worker proposed. Somebody
      // reads the need itself; the wake is only the signal that it exists.
      refKind: "requirement",
      refId: input.needId,
      summary: `worker requested ${input.resourceClass}: ${input.purpose}`,
      at: input.at,
      consumedAt: null,
    },
  };
}
