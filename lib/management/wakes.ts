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

// Pure: derive the durable wake for "this objective now has an Outcome
// Contract and Requirements" (R3 A1 — the entry point the engine never had).
//
// Identity is the INTERPRETATION, not the moment: replaying the same
// interpretation request rebuilds a byte-identical eventId/dedupeKey, so
// appendWakeEvent's by_dedupe collapses it and the management loop starts once.
// `reason: "objective_submitted"` is the existing WakeReason for exactly this.
export function planWakeForInterpretation(input: {
  objectiveKey: string;
  contractId: string;
  at: number;
}): ResourceRequestWakePlan {
  const dedupeKey = `interpret:${input.objectiveKey}:${input.contractId}`;
  const eventId = `wake_in_${hash24(dedupeKey)}`;
  return {
    eventId,
    dedupeKey,
    reason: "objective_submitted",
    event: {
      eventId,
      objectiveKey: input.objectiveKey,
      reason: "objective_submitted",
      // Pointer to the contract row the pass will reload — never the payload.
      refKind: "contract",
      refId: input.contractId,
      summary: `objective interpreted: contract ${input.contractId} with its requirements persisted`,
      at: input.at,
      consumedAt: null,
    },
  };
}

// R3 CP-4 — DECISION-APPLIED WAKE.
//
// The decision pass is split begin → propose(action) → apply(mutation) exactly
// like interpretation, so an authorized decision no longer lives inside the
// same synchronous pass that produced it: applyDecision persists the authorized
// decision row and must WAKE the management loop to dispatch on it. Identity is
// the DECISION, not the moment: replaying applyDecision for the same decision
// rebuilds a byte-identical eventId/dedupeKey, so appendWakeEvent's by_dedupe
// collapses it and the loop dispatches once. The wake is a POINTER to the
// decision row; it never carries the payload and never grants authority — the
// reducer re-reads business state (latestAuthorizedDecision) every pass.
export function planWakeForDecision(input: {
  objectiveKey: string;
  managerDecisionId: string;
  authorized: boolean;
  at: number;
}): ResourceRequestWakePlan {
  const reason: WakeReason = "decision_applied";
  const dedupeKey = `decision:${input.objectiveKey}:${input.managerDecisionId}`;
  const eventId = `wake_dc_${hash24(dedupeKey)}`;
  return {
    eventId,
    dedupeKey,
    reason,
    event: {
      eventId,
      objectiveKey: input.objectiveKey,
      reason,
      // Pointer to the decision row the next pass reloads — never the payload.
      refKind: "objective",
      refId: input.managerDecisionId,
      summary: input.authorized
        ? `managerial decision ${input.managerDecisionId} authorized and persisted; dispatch may proceed`
        : `managerial decision ${input.managerDecisionId} persisted without authorization`,
      at: input.at,
      consumedAt: null,
    },
  };
}

// A dispatch that could not be honoured needs no new machinery: the reducer
// re-reads business state every pass, `settle` counts a pass that produced
// nothing as NO progress, and the persisted no-progress ceiling escalates the
// objective. Adding a second failure counter here would duplicate budget.ts.

// R3 A3 — TIMER WAKES.
//
// A quiescent objective may legitimately need ONE bounded deadline (a lease
// watchdog, or "check whether this resource exists yet"). The identity rules
// that make this safe instead of the old zero-delay self-wake loop:
//   - the delay is supplied by the caller and must be non-zero;
//   - one logical condition is one `timerKey`, and the adapter may only arm a
//     timer for a condition that has no UNCONSUMED timer row (so at most one is
//     outstanding at any time);
//   - arming the next one is `sequence`-numbered, so identities stay stable and
//     bounded while a genuinely repeating deadline remains possible;
//   - the reason is `timeout`, which the graph classifies as a SELF wake: it
//     never counts as material progress, so repeated timers walk the objective
//     into the persisted no-progress ceiling rather than spinning forever.
export function planWakeForTimer(input: {
  objectiveKey: string;
  timerKey: string;
  sequence: number;
  at: number;
}): ResourceRequestWakePlan {
  const dedupeKey = `timer:${input.timerKey}:${input.sequence}`;
  const eventId = `wake_tm_${hash24(dedupeKey)}`;
  return {
    eventId,
    dedupeKey,
    reason: "timeout",
    event: {
      eventId,
      objectiveKey: input.objectiveKey,
      reason: "timeout",
      // The timerKey names the LOGICAL CONDITION, so the pass can tell which
      // deadline expired instead of guessing from a timestamp.
      refKind: "objective",
      refId: input.timerKey,
      summary: `bounded timer #${input.sequence} for ${input.timerKey} elapsed`,
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
