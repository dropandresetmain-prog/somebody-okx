// Deterministic reliability scenario harness (M1-F).
//
// This is NOT another unit test with extra steps. It is a driver: scenarios
// declare a seeded world, then the SYSTEM runs — management passes, the
// begin→propose→apply chains, watchdogs and timers fire because they were
// scheduled, and clocks advance only when a scenario says so. A scenario may
// never wake a stranded Objective by hand; the whole point is to prove nothing
// gets stranded.
//
// What the driver can OBSERVE about continuation (all durable, none faked):
//   - unconsumed wakeEvents  → a pending scheduled continuation exists (the
//     timer/reopen/decision planners append their wake row BEFORE scheduling,
//     so an armed timer is visible here);
//   - reservations carrying `expiresAt` → running work with a BOUNDED expiry,
//     whose watchdog may only clear that exact requestId;
//   - a live worker run whose lease has not lapsed → running work bounded by
//     the lease-expiry fence;
//   - explicit terminal/blocked control states → the fourth allowed resting
//     place: the engine said out loud that it cannot continue by itself.
//
// Anything else that is nonterminal and has NONE of those is a strand, and
// `expectContinuation` fails with the state and the missing alternatives.

import { convexTest } from "convex-test";
import schema from "../../convex/schema";
import type { Id } from "../../convex/_generated/dataModel";
import type {
  Assignment,
  ExecutionIntent,
  WakeEvent,
} from "../../lib/management/types";
import type { ObjectiveRecord } from "../../lib/objective/types";

/** The module map every reliability scenario shares (production wiring). */
export const reliabilityModules = {
  "../../convex/schema.ts": () => import("../../convex/schema"),
  "../../convex/objectiveValidators.ts": () => import("../../convex/objectiveValidators"),
  "../../convex/managementValidators.ts": () => import("../../convex/managementValidators"),
  "../../convex/workforceGuards.ts": () => import("../../convex/workforceGuards"),
  "../../convex/objectives.ts": () => import("../../convex/objectives"),
  "../../convex/objectiveRunner.ts": () => import("../../convex/objectiveRunner"),
  "../../convex/management.ts": () => import("../../convex/management"),
  "../../convex/internal/workforce.ts": () => import("../../convex/internal/workforce"),
  "../../convex/_generated/api.d.ts": () => import("../../convex/_generated/api"),
  "../../convex/_generated/server.d.ts": () => import("../../convex/_generated/server"),
  "../../convex/_generated/dataModel.d.ts": () => import("../../convex/_generated/dataModel"),
};

export type ScenarioBackend = ReturnType<typeof convexTest>;

/** States where resting with no continuation is CORRECT: terminal, or the
 * engine's own explicit "I cannot continue alone" verdicts. */
export const QUIESCENT_OK_STATES = new Set<string>([
  "completed",
  "failed",
  "escalated",
  "blocked",
  "recovery_required",
  // Awaiting a founder/human answer is an externally resolvable wait; the
  // scenario asserts the wait is NAMED (pending approval) before accepting it.
  "awaiting_user",
]);

export type ContinuationAudit = {
  objectiveState: string;
  /** Unconsumed wakes: each one is a scheduled continuation the loop will act on. */
  outstandingWakes: Array<{ eventId: string; reason: string; refId: string }>;
  /** Live reservations and whether they carry a bounded expiry. */
  reservations: Array<{
    kind: "decision" | "finalAssessment" | "interpretation";
    requestId: string;
    expiresAt: number | null;
  }>;
  /** Runs still holding a lease that has not lapsed. */
  liveRuns: Array<{ runId: string; leaseUntil: number }>;
  /** Assignments/intents still in flight (externally resolvable waits). */
  inFlightWork: Array<{ kind: "assignment" | "intent"; id: string; state: string }>;
  /** A named founder/external wait the objective is parked on. */
  externalWait: { kind: "approval" | "founder_question"; ref: string } | null;
};

/** Structurally-typed view of the convex-test run context. The repo's test
 * files have a known pre-existing class of `withIndex` typing errors against
 * the generated DataModel; this helper opts into a local structural cast so
 * new code does not add to that count. Runtime behaviour is identical. */
type LooseIndex = (indexName: string, fn: (q: {
  field: (name: string) => unknown;
  eq: (a: unknown, b: unknown) => unknown;
}) => unknown) => {
  collect(): Promise<Array<{ data: unknown; _id: unknown }>>;
  unique(): Promise<{ data: unknown; _id: unknown } | null>;
};
type LooseDb = {
  query: (tableName: string) => {
    withIndex: LooseIndex;
    filter: (fn: (q: unknown) => unknown) => { collect(): Promise<Array<{ data: unknown }>> };
  };
};
type LooseCtx = { db: LooseDb };

/** Read the durable continuation facts for one objective. Pure observation —
 * it writes nothing and schedules nothing. */
export async function auditContinuation(
  t: ScenarioBackend,
  objectiveKey: string,
  now: number,
): Promise<ContinuationAudit> {
  return t.run(async (rawCtx) => {
    const ctx = rawCtx as unknown as LooseCtx;
    const row = await ctx.db
      .query("objectives")
      .withIndex("by_key", (q) => q.eq("key", objectiveKey))
      .unique();
    const data = (row as { data: ObjectiveRecord & { management: Record<string, unknown> } } | null)
      ?.data;
    if (!data) {
      return {
        objectiveState: "MISSING_ROW",
        outstandingWakes: [],
        reservations: [],
        liveRuns: [],
        inFlightWork: [],
        externalWait: null,
      };
    }
    const mgmt = (data.management ?? {}) as Record<string, unknown>;

    const wakeRows = await ctx.db
      .query("wakeEvents")
      .withIndex("by_objective", (q) => q.eq("objectiveKey", objectiveKey))
      .collect();
    const outstandingWakes = (wakeRows as unknown as Array<{ data: WakeEvent }>)
      .filter((w) => w.data.consumedAt === null)
      .map((w) => ({
        eventId: w.data.eventId,
        reason: w.data.reason,
        refId: w.data.refId,
      }));

    const reservations: ContinuationAudit["reservations"] = [];
    const pendingDecision = mgmt.pendingDecision as
      | { requestId?: string; expiresAt?: number }
      | null
      | undefined;
    if (pendingDecision?.requestId)
      reservations.push({
        kind: "decision",
        requestId: pendingDecision.requestId,
        expiresAt: typeof pendingDecision.expiresAt === "number" ? pendingDecision.expiresAt : null,
      });
    const pendingAssessment = mgmt.pendingFinalAssessment as
      | { requestId?: string; expiresAt?: number }
      | null
      | undefined;
    if (pendingAssessment?.requestId)
      reservations.push({
        kind: "finalAssessment",
        requestId: pendingAssessment.requestId,
        expiresAt:
          typeof pendingAssessment.expiresAt === "number" ? pendingAssessment.expiresAt : null,
      });
    if (mgmt.interpretationStatus === "pending")
      reservations.push({
        kind: "interpretation",
        requestId: String(mgmt.interpretationRequestId ?? "?"),
        // The interpretation cursor's bound is the watchdog armed alongside it;
        // status "pending" alone is NOT a bounded expiry.
        expiresAt: null,
      });

    const liveRuns: ContinuationAudit["liveRuns"] = [];
    for (const wi of data.workItems ?? []) {
      for (const run of wi.runs ?? []) {
        if (run.status === "running" && run.leaseUntil > now)
          liveRuns.push({ runId: run.id, leaseUntil: run.leaseUntil });
      }
    }
    if (data.run && data.run.status === "running" && data.run.leaseUntil > now)
      liveRuns.push({ runId: data.run.id, leaseUntil: data.run.leaseUntil });

    const inFlightWork: ContinuationAudit["inFlightWork"] = [];
    const assignments = await ctx.db
      .query("assignments")
      .withIndex("by_objective", (q) => q.eq("objectiveKey", objectiveKey))
      .collect();
    for (const a of assignments as unknown as Array<{ data: Assignment }>) {
      if (
        a.data.state === "dispatched" ||
        a.data.state === "running" ||
        a.data.state === "result_submitted"
      )
        inFlightWork.push({ kind: "assignment", id: a.data.assignmentId, state: a.data.state });
    }
    const intents = await ctx.db
      .query("executionIntents")
      .withIndex("by_objective", (q) => q.eq("objectiveKey", objectiveKey))
      .collect();
    for (const i of intents as unknown as Array<{ data: ExecutionIntent }>) {
      // verified/failed are the intent's terminal states in this state machine.
      if (i.data.state !== "verified" && i.data.state !== "failed")
        inFlightWork.push({ kind: "intent", id: i.data.intentId, state: i.data.state });
    }

    const notes = (mgmt.controlNotes ?? []) as Array<Record<string, unknown>>;
    let externalWait: ContinuationAudit["externalWait"] = null;
    for (let k = notes.length - 1; k >= 0; k -= 1) {
      const n = notes[k];
      if (n.type === "pending_approval") {
        externalWait = { kind: "approval", ref: String(n.question ?? "").slice(0, 120) };
        break;
      }
      if (n.type === "founder_question" || n.type === "ambiguity") {
        externalWait = { kind: "founder_question", ref: String(n.question ?? "").slice(0, 120) };
        break;
      }
    }

    return {
      objectiveState: String(data.state),
      outstandingWakes,
      reservations,
      liveRuns,
      inFlightWork,
      externalWait,
    };
  });
}

export type ContinuationFailure = {
  ok: false;
  reason: string;
  audit: ContinuationAudit;
};

/**
 * The invariant every scenario must satisfy at every resting point:
 *
 *   a NONTERMINAL state must have at least one of
 *     (a) running work with a BOUNDED expiry (live lease or expiring reservation),
 *     (b) a scheduled continuation (an outstanding wake),
 *     (c) an externally resolvable wait (in-flight intent/assignment or a named
 *         approval/founder question),
 *     (d) an explicit blocked / recovery / escalated / completed verdict.
 *
 * A reservation WITHOUT a bound does not satisfy (a) — that is the exact hole
 * request-bound expiry closed. Pass `require: "bounded"` to fail on it.
 */
export function checkContinuation(
  audit: ContinuationAudit,
  now: number,
  opts: { requireBoundedReservations?: boolean } = {},
): { ok: true } | ContinuationFailure {
  const state = audit.objectiveState;
  if (QUIESCENT_OK_STATES.has(state)) return { ok: true };
  if (state === "MISSING_ROW")
    return { ok: false, reason: "objective row missing", audit };

  const boundedRunning =
    audit.liveRuns.length > 0 ||
    (audit.reservations.length > 0 &&
      audit.reservations.every((r) => r.expiresAt !== null && r.expiresAt > now));
  const scheduled = audit.outstandingWakes.length > 0;
  const external =
    audit.inFlightWork.length > 0 ||
    audit.externalWait !== null ||
    // a reservation is itself a promise that a callback (apply/clear) will land
    audit.reservations.length > 0;

  if (opts.requireBoundedReservations) {
    const unbounded = audit.reservations.filter((r) => r.expiresAt === null);
    if (unbounded.length > 0)
      return {
        ok: false,
        reason: `unbounded reservation(s): ${unbounded.map((r) => `${r.kind}:${r.requestId}`).join(", ")}`,
        audit,
      };
  }

  if (boundedRunning || scheduled || external) return { ok: true };
  return {
    ok: false,
    reason:
      `NONTERMINAL STRAND: state "${state}" has no live bounded work, no outstanding wake, ` +
      `no in-flight/external wait, and is not an explicit blocked/recovery verdict`,
    audit,
  };
}

/** Typed cast helper so scenarios read rows the way production does. */
export type AnyRow = { data: Record<string, unknown> };
export type RowId = Id<"objectives">;
