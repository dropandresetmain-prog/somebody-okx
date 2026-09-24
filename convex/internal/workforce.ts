// M4 Internal workforce mutations — storage layer only.
// Business rules live in lib/management/*; this file performs atomic
// check-then-mutate using those pure functions.

"use strict";

import { v } from "convex/values";
import { internal } from "../_generated/api";
import { internalMutation, internalQuery } from "../_generated/server";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import type { Id } from "../_generated/dataModel";
import {
  vWorkerRecord,
  vVerifiedAssignmentRecord,
  vWakeEvent,
  vObjectiveBudget,
  vFounderSpendGrant,
} from "../managementValidators";
import { canAcceptReservation } from "../workforceGuards";
import { validateCapabilitySpec } from "../../lib/management/capability";
import { readSomebodyExecutionMode } from "../../lib/execution/executionMode";
import { resolveExperimentMaxElapsedMs } from "../../lib/management/experimentBudget";
import {
  createBudget,
  trySpendWorkerCreation,
  trySpendDecision,
  tryStartAssignment,
  finishAssignment,
  tryRequirementAttempt,
  tryIntentRetry,
  tryCommitSpend,
  trySpendModelCall,
  recordModelCalls,
  recordProgress,
} from "../../lib/management/budget";
import type { WorkerRecord, ObjectiveBudget, WakeEvent } from "../../lib/management/types";
import { projectWorkerOutput } from "../../lib/management/decisionPass";
import { verifiedAcquisitionCoversNeed } from "../../lib/objective/inputDiagnosis";
import { scopedCoveredResourceClasses } from "../../lib/objective/inputAvailability";
import { validatedRequestedPurposeKind, type ResourceNeed } from "../../lib/objective/resourceNeed";
import type { ExternalAcquisitionResult } from "../../lib/objective/types";

// Row shapes for the storage layer. `FounderSpendGrant` is the persisted
// founder authority record (R3 A4); it lives here because nothing in
// lib/management/* may read storage.
export type FounderSpendGrant = {
  approvalId: string;
  objectiveKey: string;
  limitUsd: number;
  grantedAt: number;
  revokedAt: number | null;
  note: string;
};

type WorkerRow = { _id: Id<"workers">; workerKey: string; data: WorkerRecord };
type BudgetRow = { _id: Id<"objectiveBudgets">; objectiveKey: string; data: ObjectiveBudget };
type GrantRow = { _id: Id<"founderSpendGrants">; objectiveKey: string; data: FounderSpendGrant };

// ── Worker CRUD ──────────────────────────────────────────────────────────────

// Upsert a worker by key. On update, NEVER widen lifecycle from suspended/retired
// back to available implicitly — the caller must explicitly set lifecycle.
export const upsertWorker = internalMutation({
  args: {
    workerKey: v.string(),
    data: vWorkerRecord,
    at: v.number(),
  },
  returns: v.object({ created: v.boolean() }),
  handler: async (ctx, args): Promise<{ created: boolean }> => {
    const existing = await ctx.db
      .query("workers")
      .withIndex("by_workerKey", (q) => q.eq("workerKey", args.workerKey))
      .unique();

    if (existing) {
      // Storage stays rule-free: lifecycle transitions are the caller's responsibility.
      await ctx.db.patch(existing._id, {
        data: { ...args.data, updatedAt: args.at },
      });
      return { created: false };
    }

    await ctx.db.insert("workers", {
      workerKey: args.workerKey,
      data: { ...args.data, createdAt: args.at, updatedAt: args.at },
    });
    return { created: true };
  },
});

// List workers by keys. Missing keys are omitted (not errors).
export const listWorkers = internalQuery({
  args: { workerKeys: v.optional(v.array(v.string())) },
  returns: v.array(vWorkerRecord),
  handler: async (ctx, args): Promise<WorkerRecord[]> => {
    if (!args.workerKeys || args.workerKeys.length === 0) {
      // Return all workers
      const rows = await ctx.db.query("workers").collect();
      return rows.map((row: WorkerRow) => row.data);
    }

    const results: WorkerRecord[] = [];
    for (const key of args.workerKeys) {
      const row = await ctx.db
        .query("workers")
        .withIndex("by_workerKey", (q) => q.eq("workerKey", key))
        .unique();
      if (row) results.push((row as WorkerRow).data);
    }
    return results;
  },
});

// Count workers created by a specific objective.
export const countObjectiveWorkers = internalQuery({
  args: { objectiveKey: v.string() },
  returns: v.number(),
  handler: async (ctx, args): Promise<number> => {
    const rows = await ctx.db.query("workers").collect();
    return rows.filter((row: WorkerRow) => row.data.createdByObjective === args.objectiveKey).length;
  },
});

// ── Reservation ──────────────────────────────────────────────────────────────

// Reserve a worker for an assignment. Fencing: only free workers or replay of
// the same assignmentId succeed. Returns typed reason on failure.
export const reserveWorker = internalMutation({
  args: {
    workerKey: v.string(),
    objectiveKey: v.string(),
    requirementKey: v.union(v.string(), v.null()),
    assignmentId: v.string(),
    heldUntil: v.number(),
    at: v.number(),
  },
  returns: v.object({
    ok: v.boolean(),
    reason: v.optional(v.string()),
    replayed: v.optional(v.boolean()),
  }),
  handler: async (ctx, args) => {
    const row = await ctx.db
      .query("workers")
      .withIndex("by_workerKey", (q) => q.eq("workerKey", args.workerKey))
      .unique();

    if (!row) {
      return { ok: false, reason: "worker_missing" };
    }

    const worker = (row as WorkerRow).data;

    // Check if this is an idempotent replay
    if (
      worker.reservedBy &&
      worker.reservedBy.assignmentId === args.assignmentId &&
      worker.lifecycle === "assigned"
    ) {
      return { ok: true, replayed: true };
    }

    // Check if worker can accept reservation (replay of the same assignmentId
    // is handled by the guard itself; the early return above stays as the
    // fast path).
    const check = canAcceptReservation(worker, args.assignmentId, args.at);
    if (!check.ok) {
      return { ok: false, reason: check.reason };
    }

    // Reserve
    const updated: WorkerRecord = {
      ...worker,
      lifecycle: "assigned",
      reservedBy: {
        objectiveKey: args.objectiveKey,
        requirementKey: args.requirementKey,
        assignmentId: args.assignmentId,
        heldUntil: args.heldUntil,
      },
      updatedAt: args.at,
    };

    await ctx.db.patch(row._id, { data: updated });
    return { ok: true };
  },
});

// Release a worker reservation. Only the assignment that holds the reservation
// can release it (fencing).
export const releaseWorker = internalMutation({
  args: {
    workerKey: v.string(),
    assignmentId: v.string(),
    at: v.number(),
  },
  returns: v.object({
    ok: v.boolean(),
    reason: v.optional(v.string()),
  }),
  handler: async (ctx, args) => {
    const row = await ctx.db
      .query("workers")
      .withIndex("by_workerKey", (q) => q.eq("workerKey", args.workerKey))
      .unique();

    if (!row) {
      return { ok: false, reason: "worker_missing" };
    }

    const worker = (row as WorkerRow).data;

    // Fencing: only the assignment that holds the reservation can release it
    if (!worker.reservedBy || worker.reservedBy.assignmentId !== args.assignmentId) {
      return { ok: false, reason: "reservation_owner_mismatch" };
    }

    // Release: return to available lifecycle
    const updated: WorkerRecord = {
      ...worker,
      lifecycle: "available",
      reservedBy: null,
      updatedAt: args.at,
    };

    await ctx.db.patch(row._id, { data: updated });
    return { ok: true };
  },
});

// ── Verified assignment history ──────────────────────────────────────────────

// Append a verified assignment record to a worker's history. Truncates oldest
// beyond cap (default 20).
export const recordVerifiedAssignment = internalMutation({
  args: {
    workerKey: v.string(),
    record: vVerifiedAssignmentRecord,
    maxHistory: v.optional(v.number()),
    at: v.number(),
  },
  returns: v.object({ ok: v.boolean() }),
  handler: async (ctx, args) => {
    const row = await ctx.db
      .query("workers")
      .withIndex("by_workerKey", (q) => q.eq("workerKey", args.workerKey))
      .unique();

    if (!row) {
      return { ok: false };
    }

    const worker = (row as WorkerRow).data;
    const maxHistory = args.maxHistory ?? 20;
    const history = [...worker.verifiedAssignments, args.record];

    // Truncate oldest beyond cap
    const truncated = history.length > maxHistory
      ? history.slice(history.length - maxHistory)
      : history;

    const updated: WorkerRecord = {
      ...worker,
      verifiedAssignments: truncated,
      updatedAt: args.at,
    };

    await ctx.db.patch(row._id, { data: updated });
    return { ok: true };
  },
});

// Set worker lifecycle state.
export const setWorkerLifecycle = internalMutation({
  args: {
    workerKey: v.string(),
    lifecycle: v.union(
      v.literal("available"),
      v.literal("assigned"),
      v.literal("suspended"),
      v.literal("retired"),
    ),
    at: v.number(),
  },
  returns: v.object({ ok: v.boolean() }),
  handler: async (ctx, args) => {
    const row = await ctx.db
      .query("workers")
      .withIndex("by_workerKey", (q) => q.eq("workerKey", args.workerKey))
      .unique();

    if (!row) {
      return { ok: false };
    }

    const worker = (row as WorkerRow).data;
    const updated: WorkerRecord = {
      ...worker,
      lifecycle: args.lifecycle,
      updatedAt: args.at,
    };

    await ctx.db.patch(row._id, { data: updated });
    return { ok: true };
  },
});

// ── Dynamic capabilities ─────────────────────────────────────────────────────

// Add a dynamic capability to a worker. Validates the spec using the pure
// validateCapabilitySpec function. On failure, returns the validation error
// without writing anything.
export const addDynamicCapability = internalMutation({
  args: {
    workerKey: v.string(),
    proposedSpec: v.any(),
    at: v.number(),
  },
  returns: v.union(
    v.object({ ok: v.literal(true) }),
    v.object({ ok: v.literal(false), validation: v.any() }),
  ),
  handler: async (ctx, args) => {
    // Validate using pure function
    const validation = validateCapabilitySpec(args.proposedSpec);
    if (!validation.ok) {
      return { ok: false as const, validation };
    }

    const row = await ctx.db
      .query("workers")
      .withIndex("by_workerKey", (q) => q.eq("workerKey", args.workerKey))
      .unique();

    if (!row) {
      return { ok: false as const, validation: { blocker: "worker not found" } };
    }

    const worker = (row as WorkerRow).data;

    // Check if capability with same key already exists
    const existing = worker.dynamicCapabilities.find(
      (cap) => cap.key === validation.spec.key,
    );
    if (existing) {
      // Idempotent: already present
      return { ok: true as const };
    }

    // Append
    const updated: WorkerRecord = {
      ...worker,
      dynamicCapabilities: [...worker.dynamicCapabilities, validation.spec],
      updatedAt: args.at,
    };

    await ctx.db.patch(row._id, { data: updated });
    return { ok: true as const };
  },
});

// ── Wake events ──────────────────────────────────────────────────────────────

// Append a wake event. Deduplicates by dedupeKey.
export const appendWakeEvent = internalMutation({
  args: {
    eventId: v.string(),
    objectiveKey: v.string(),
    dedupeKey: v.string(),
    data: vWakeEvent,
  },
  returns: v.union(
    v.object({ ok: v.literal(true) }),
    v.object({ ok: v.literal(false), duplicate: v.literal(true), existingEventId: v.string() }),
  ),
  handler: async (ctx, args) => {
    // Check for duplicate by dedupeKey
    const existing = await ctx.db
      .query("wakeEvents")
      .withIndex("by_dedupe", (q) => q.eq("dedupeKey", args.dedupeKey))
      .unique();

    if (existing) {
      const existingEventId = (existing as { eventId: string }).eventId;
      return { ok: false as const, duplicate: true as const, existingEventId };
    }

    await ctx.db.insert("wakeEvents", {
      eventId: args.eventId,
      objectiveKey: args.objectiveKey,
      dedupeKey: args.dedupeKey,
      data: args.data,
    });

    return { ok: true as const };
  },
});

// Mark wake events as consumed. Only touches events where consumedAt is null
// (idempotent).
export const markWakeConsumed = internalMutation({
  args: {
    eventIds: v.array(v.string()),
    at: v.number(),
  },
  returns: v.object({ ok: v.boolean(), marked: v.number() }),
  handler: async (ctx, args) => {
    let marked = 0;

    for (const eventId of args.eventIds) {
      const row = await ctx.db
        .query("wakeEvents")
        .withIndex("by_eventId", (q) => q.eq("eventId", eventId))
        .unique();

      if (!row) continue;

      const data = (row as { data: WakeEvent }).data;
      if (data.consumedAt !== null) continue;

      await ctx.db.patch(row._id, {
        data: { ...data, consumedAt: args.at },
      });
      marked++;
    }

    return { ok: true, marked };
  },
});

// ── Budget ───────────────────────────────────────────────────────────────────

// Initialize a budget for an objective. Idempotent: returns existing if present.
export const initBudget = internalMutation({
  args: {
    objectiveKey: v.string(),
    at: v.number(),
  },
  returns: vObjectiveBudget,
  handler: async (ctx, args): Promise<ObjectiveBudget> => {
    const existing = await ctx.db
      .query("objectiveBudgets")
      .withIndex("by_objectiveKey", (q) => q.eq("objectiveKey", args.objectiveKey))
      .unique();

    if (existing) {
      return (existing as BudgetRow).data;
    }

    const experimentElapsed = resolveExperimentMaxElapsedMs();
    const limits =
      experimentElapsed != null ? { maxElapsedMs: experimentElapsed } : {};
    const budget = createBudget(args.objectiveKey, Date.now(), limits);
    await ctx.db.insert("objectiveBudgets", {
      objectiveKey: args.objectiveKey,
      data: budget,
    });

    return budget;
  },
});

/** Renew wall-clock elapsed budget window for a long-running founder session. */
export const resetRequirementWorkerAttempts = internalMutation({
  args: {
    objectiveKey: v.string(),
    requirementKey: v.string(),
  },
  returns: vObjectiveBudget,
  handler: async (ctx, args): Promise<ObjectiveBudget> => {
    const row = await ctx.db
      .query("objectiveBudgets")
      .withIndex("by_objectiveKey", (q) => q.eq("objectiveKey", args.objectiveKey))
      .unique();
    if (!row) throw new Error("budget row missing");
    const current = (row as BudgetRow).data;
    const attempts = { ...current.used.attemptsByRequirement };
    delete attempts[args.requirementKey];
    const next: ObjectiveBudget = {
      ...current,
      used: { ...current.used, attemptsByRequirement: attempts },
    };
    await ctx.db.patch(row._id, { data: next });
    return next;
  },
});

export const renewContinuationBudget = internalMutation({
  args: {
    objectiveKey: v.string(),
    at: v.number(),
  },
  returns: vObjectiveBudget,
  handler: async (ctx, args): Promise<ObjectiveBudget> => {
    const row = await ctx.db
      .query("objectiveBudgets")
      .withIndex("by_objectiveKey", (q) => q.eq("objectiveKey", args.objectiveKey))
      .unique();
    if (!row) {
      const experimentElapsed = resolveExperimentMaxElapsedMs();
      const budget = createBudget(args.objectiveKey, args.at, {
        ...(experimentElapsed != null ? { maxElapsedMs: experimentElapsed } : {}),
      });
      await ctx.db.insert("objectiveBudgets", { objectiveKey: args.objectiveKey, data: budget });
      return budget;
    }
    const current = (row as BudgetRow).data;
    const experimentElapsed = resolveExperimentMaxElapsedMs();
    const next: ObjectiveBudget = {
      ...current,
      startedAt: args.at,
      lastProgressAt: args.at,
      limits: {
        ...current.limits,
        maxElapsedMs:
          experimentElapsed != null
            ? experimentElapsed
            : current.limits.maxElapsedMs,
      },
      used: { ...current.used, noProgressCycles: 0 },
    };
    await ctx.db.patch(row._id, { data: next });
    return next;
  },
});

// M2 / F10 — record model invocations our application boundary ACTUALLY made
// (strategy, recommendation, interpretation, final assessment, structural repair).
// Usage is a fact: recorded even past the ceiling; the ceiling gates new work.
// Creates the budget row if the call happened before management initialized it.
export const recordManagementModelCalls = internalMutation({
  args: {
    objectiveKey: v.string(),
    count: v.number(),
    at: v.number(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    if (!Number.isFinite(args.count) || args.count <= 0) return null;
    const row = await ctx.db
      .query("objectiveBudgets")
      .withIndex("by_objectiveKey", (q) => q.eq("objectiveKey", args.objectiveKey))
      .unique();
    if (!row) {
      await ctx.db.insert("objectiveBudgets", {
        objectiveKey: args.objectiveKey,
        data: recordModelCalls(createBudget(args.objectiveKey, args.at), args.count),
      });
      return null;
    }
    await ctx.db.patch(row._id, {
      data: recordModelCalls((row as BudgetRow).data, args.count),
    });
    return null;
  },
});

// Read a budget.
export const readBudget = internalQuery({
  args: { objectiveKey: v.string() },
  returns: v.union(vObjectiveBudget, v.null()),
  handler: async (ctx, args): Promise<ObjectiveBudget | null> => {
    const row = await ctx.db
      .query("objectiveBudgets")
      .withIndex("by_objectiveKey", (q) => q.eq("objectiveKey", args.objectiveKey))
      .unique();

    if (!row) return null;
    return (row as BudgetRow).data;
  },
});

// Apply a budget spend. Uses pure helpers from lib/management/budget.
export const applyBudgetSpend = internalMutation({
  args: {
    objectiveKey: v.string(),
    spend: v.object({
      kind: v.union(
        v.literal("worker_creation"),
        v.literal("decision"),
        v.literal("model_call"),
        v.literal("assignment_start"),
        v.literal("assignment_finish"),
        v.literal("requirement_attempt"),
        v.literal("intent_retry"),
        v.literal("spend_commit"),
      ),
      requirementKey: v.union(v.string(), v.null()),
      intentId: v.union(v.string(), v.null()),
      amountUsd: v.optional(v.number()),
      at: v.number(),
    }),
  },
  returns: v.object({
    ok: v.boolean(),
    budget: v.union(vObjectiveBudget, v.null()),
    verdict: v.optional(v.any()),
  }),
  handler: async (ctx, args) => {
    const row = await ctx.db
      .query("objectiveBudgets")
      .withIndex("by_objectiveKey", (q) => q.eq("objectiveKey", args.objectiveKey))
      .unique();

    if (!row) {
      return { ok: false, budget: null, verdict: { limit: "budget_not_initialized" } };
    }

    let budget = (row as BudgetRow).data;
    const { kind, requirementKey, intentId, amountUsd } = args.spend;

    // Use pure helpers — no budget arithmetic here
    let result;
    switch (kind) {
      case "worker_creation":
        result = trySpendWorkerCreation(budget);
        break;
      case "decision":
        result = trySpendDecision(budget);
        break;
      case "assignment_start":
        result = tryStartAssignment(budget);
        break;
      case "assignment_finish":
        // finishAssignment always succeeds (returns budget, not SpendResult)
        budget = finishAssignment(budget);
        await ctx.db.patch(row._id, { data: budget });
        return { ok: true, budget };
      case "requirement_attempt":
        if (!requirementKey) {
          return { ok: false, budget, verdict: { limit: "requirementKey_required" } };
        }
        result = tryRequirementAttempt(budget, requirementKey);
        break;
      case "intent_retry":
        if (!intentId) {
          return { ok: false, budget, verdict: { limit: "intentId_required" } };
        }
        result = tryIntentRetry(budget, intentId);
        break;
      case "spend_commit":
        if (amountUsd === undefined) {
          return { ok: false, budget, verdict: { limit: "amountUsd_required" } };
        }
        result = tryCommitSpend(budget, amountUsd);
        break;
      case "model_call":
        // Separate ceiling from managerial decisions (60 vs 40) — the pure
        // kernel owns both counters and they must not be conflated.
        result = trySpendModelCall(budget);
        break;
      default: {
        const exhaustive: never = kind;
        return { ok: false, budget, verdict: { limit: `unknown_spend_kind_${exhaustive}` } };
      }
    }

    if (!result.ok) {
      return { ok: false, budget, verdict: result.verdict };
    }

    // Write back the mutated budget
    await ctx.db.patch(row._id, { data: result.budget });
    return { ok: true, budget: result.budget };
  },
});

// R3 A3 — persisted no-progress accounting for ONE completed management pass.
// The graph decides `progressed` from facts (material wake / authorization bound
// / effect created / resolution accepted); this mutation only applies the pure
// kernel's accounting so the FINITE ceiling is reachable from storage. Without
// it, `maxNoProgressCycles` could never trigger and a self-rescheduling loop
// would run forever. Idempotent-init: a managed objective always has a budget
// row by the time a pass settles, but a missing row must not throw.
export const applyPassProgress = internalMutation({
  args: {
    objectiveKey: v.string(),
    progressed: v.boolean(),
    at: v.number(),
  },
  returns: vObjectiveBudget,
  handler: async (ctx, args): Promise<ObjectiveBudget> => {
    const row = await ctx.db
      .query("objectiveBudgets")
      .withIndex("by_objectiveKey", (q) => q.eq("objectiveKey", args.objectiveKey))
      .unique();

    const budget = row
      ? (row as BudgetRow).data
      : createBudget(args.objectiveKey, args.at);
    const next = recordProgress(budget, args.progressed, args.at);

    if (row) await ctx.db.patch(row._id, { data: next });
    else
      await ctx.db.insert("objectiveBudgets", {
        objectiveKey: args.objectiveKey,
        data: next,
      });
    return next;
  },
});

// ── Dispatch reads (R3 A2) ──────────────────────────────────────────────────
//
// The dispatcher must be able to ask "does this logical effect already exist?"
// BEFORE it writes, because the upserts below REPLACE a row — which is correct
// for an identical replay and wrong for a row that has already moved on (an
// intent that reached `handed_off`, or an assignment already `running`, must
// never be reset to its creation state by a redelivered wake).

type AssignmentRow = { _id: Id<"assignments">; assignmentId: string; objectiveKey: string; data: unknown };
type IntentRow = { _id: Id<"executionIntents">; intentId: string; objectiveKey: string; idempotencyKey: string; data: unknown };

export const findAssignment = internalQuery({
  args: { objectiveKey: v.string(), assignmentId: v.string() },
  returns: v.any(),
  handler: async (ctx, args): Promise<unknown> => {
    const row = await ctx.db
      .query("assignments")
      .withIndex("by_assignmentId", (q) => q.eq("assignmentId", args.assignmentId))
      .unique();
    if (!row) return null;
    const typed = row as AssignmentRow;
    // Identity is objective-scoped: a row from another objective is a collision,
    // not a match.
    if (typed.objectiveKey !== args.objectiveKey) return null;
    return typed.data;
  },
});

/** Thin list of assignment payloads for assessment grounding / action scope. */
export const listAssignmentsForObjective = internalQuery({
  args: { objectiveKey: v.string() },
  returns: v.array(v.any()),
  handler: async (ctx, args): Promise<unknown[]> => {
    const rows = await ctx.db
      .query("assignments")
      .withIndex("by_objective", (q) => q.eq("objectiveKey", args.objectiveKey))
      .collect();
    return rows.map((row) => (row as AssignmentRow).data);
  },
});

export const findIntent = internalQuery({
  args: { objectiveKey: v.string(), intentId: v.string() },
  returns: v.any(),
  handler: async (ctx, args): Promise<unknown> => {
    const row = await ctx.db
      .query("executionIntents")
      .withIndex("by_intentId", (q) => q.eq("intentId", args.intentId))
      .unique();
    if (!row) return null;
    const typed = row as IntentRow;
    if (typed.objectiveKey !== args.objectiveKey) return null;
    return typed.data;
  },
});

// The authorization a dispatch is allowed to act on: the newest AUTHORIZED
// decision for this requirement at this revision. Read-only — the dispatcher
// never re-decides, and a decision from another revision is not a licence.
export const latestAuthorizedDecision = internalQuery({
  args: {
    objectiveKey: v.string(),
    requirementKey: v.string(),
    contractRevision: v.number(),
  },
  returns: v.any(),
  handler: async (ctx, args): Promise<unknown> => {
    const rows = await ctx.db
      .query("managerialDecisions")
      .withIndex("by_objectiveKey", (q) => q.eq("objectiveKey", args.objectiveKey))
      .collect();
    const matching = rows
      .map((row) => (row as { data: AnyDecisionData }).data)
      .filter(
        (data) =>
          data.requirementKey === args.requirementKey &&
          data.contractRevision === args.contractRevision &&
          data.kind === "satisfaction_strategy" &&
          (data.authorization as { kind?: string } | undefined)?.kind === "authorized",
      )
      .sort((a, b) => b.at - a.at || String(b.decisionId).localeCompare(String(a.decisionId)));
    return matching[0] ?? null;
  },
});

type AnyDecisionData = {
  requirementKey: string;
  contractRevision: number;
  kind: string;
  authorization: unknown;
  at: number;
  decisionId: string;
};

// R3 CP-4 — one bundled fresh read of everything the decision pass needs, so the
// proposeDecision ACTION and the applyDecision MUTATION see IDENTICAL truth and
// cannot drift. It is a pure read (no effects): latest contract + its revision,
// the requirements at that revision, the live worker inventory, the objective's
// budget and creation allowance, and the founder spend grant (null = no
// authority). Both callers cast this into lib/management/decisionPass's
// DecisionPassReads; keeping the reads in ONE query is what makes the action's
// eligible-option preview and the mutation's reauthorization agree.
export const readDecisionContext = internalQuery({
  args: { objectiveKey: v.string(), requirementKey: v.string() },
  returns: v.any(),
  handler: async (ctx, args): Promise<unknown> => {
    const contractRows = await ctx.db
      .query("outcomeContracts")
      .withIndex("by_objective", (q) => q.eq("objectiveKey", args.objectiveKey))
      .collect();
    if (contractRows.length === 0) return null;
    const latestContract = contractRows.reduce((max, row) =>
      (row as { revision: number }).revision > (max as { revision: number }).revision ? row : max,
    );
    const currentContractRevision = (latestContract as { revision: number }).revision;
    const contract = (latestContract as { data: unknown }).data;

    const requirementRows = await ctx.db
      .query("requirements")
      .withIndex("by_objectiveRequirement", (q) =>
        q.eq("objectiveKey", args.objectiveKey).eq("requirementKey", args.requirementKey),
      )
      .collect();
    const requirement =
      requirementRows
        .map((row) => (row as { data: { contractRevision: number } }).data)
        .find((data) => data.contractRevision === currentContractRevision) ?? null;
    if (!requirement) return null;

    const inventory = (await ctx.runQuery(internal.internal.workforce.listWorkers, {})) as WorkerRecord[];
    const workerCount = (await ctx.runQuery(internal.internal.workforce.countObjectiveWorkers, {
      objectiveKey: args.objectiveKey,
    })) as number;
    const budget = (await ctx.runQuery(internal.internal.workforce.readBudget, {
      objectiveKey: args.objectiveKey,
    })) as ObjectiveBudget | null;
    const creationAllowed = budget ? workerCount < budget.limits.maxWorkersCreated : true;
    const grant = (await ctx.runQuery(internal.internal.workforce.activeSpendGrant, {
      objectiveKey: args.objectiveKey,
    })) as FounderSpendGrant | null;
    // M6.1: the objective's actual controlled artifact (if any), so the decision
    // pass can bind internal proof to real owned state instead of nothing.
    const objectiveRow = await ctx.db
      .query("objectives")
      .withIndex("by_key", (q) => q.eq("key", args.objectiveKey))
      .unique();
    const objectiveData = objectiveRow?.data as
      | {
          companyArtifacts?: Array<{ key?: string; version?: number; content?: string }>;
          resourceNeeds?: ResourceNeed[];
          acquisitionResults?: ExternalAcquisitionResult[];
          management?: {
            executionProtocol?: string | null;
            lastFinalAssessmentCritique?: string;
          };
          result?: {
            summary?: string;
            fit?: string;
            recommendedNextAction?: string;
            unknowns?: string[];
            runId?: string;
          } | null;
          finalSemanticAssessment?: {
            rationale?: string;
            meetsMinimumBar?: boolean;
          } | null;
          acceptedTerminal?: import("../../lib/objective/types").ObjectiveRecord["acceptedTerminal"];
          lastUnconfirmedTerminal?: import("../../lib/objective/types").ObjectiveRecord["lastUnconfirmedTerminal"];
        }
      | undefined;

    const requirementData = requirement as unknown as {
      dependsOnRequirementKeys?: string[];
      requiredResourceClasses?: string[];
      expectedOutput?: string | null;
      requirementKey: string;
      requirementKind?: "deliverable" | "input" | null;
      proofs?: Array<{ proofKind?: string; params?: { artifactKey?: string } }>;
    };
    // Exact governed artifact from the semantic deliverable proof — never
    // silently the first companyArtifacts entry when a different target is named.
    const proofArtifactKey =
      (requirementData.proofs ?? [])
        .map((p) =>
          p.proofKind === "company_artifact_version"
            ? String(p.params?.artifactKey ?? "").trim()
            : "",
        )
        .find((k) => k.length > 0) ?? null;
    const artifacts = objectiveData?.companyArtifacts ?? [];
    const artifactKeyForInternalProof =
      (proofArtifactKey &&
      artifacts.some((a) => a.key === proofArtifactKey)
        ? proofArtifactKey
        : null) ??
      artifacts.find(
        (artifact) => typeof artifact.key === "string" && artifact.key.length > 0,
      )?.key ??
      null;
    const dependsOn = Array.isArray(requirementData.dependsOnRequirementKeys)
      ? requirementData.dependsOnRequirementKeys
      : [];

    const openStatuses = new Set(["proposed", "active", "sourcing", "buy_pending"]);
    const acquisitions = objectiveData?.acquisitionResults ?? [];
    const openResourceNeeds = (objectiveData?.resourceNeeds ?? [])
      .filter(
        (need) =>
          need &&
          openStatuses.has(String(need.status ?? "")) &&
          (need.requirementKey === args.requirementKey ||
            // Legacy needs without requirementKey still surface objective-wide
            // until scoped; prefer exact match when present.
            (need.requirementKey == null && typeof need.resourceClass === "string")),
      )
      .filter((need) =>
        need.requirementKey === args.requirementKey || need.requirementKey == null,
      )
      // Scoped verified acquisition = coverage, not an open gap.
      .filter(
        (need) =>
          !acquisitions.some((acquisition) =>
            verifiedAcquisitionCoversNeed(need, acquisition),
          ),
      )
      .slice(0, 8)
      .map((need) => {
        const status = String(need.status ?? "proposed");
        const scoped = need.requirementKey === args.requirementKey;
        const raw = need as {
          validationAuthority?: string | null;
          inputCheckId?: string | null;
          contractRevision?: number | null;
        };
        const authority = raw.validationAuthority;
        // Authoritative eligibility binding: application-validated + active+ +
        // requirement-scoped. Proposed / unconfirmed / unscoped never bind.
        const validated =
          scoped &&
          (status === "active" || status === "sourcing" || status === "buy_pending") &&
          (authority === "application" ||
            // Legacy active+ rows written before validationAuthority existed.
            authority == null ||
            authority === undefined);
        return {
          needId: String(need.id ?? ""),
          resourceClass: String(need.resourceClass ?? ""),
          purpose: String(need.purpose ?? "").slice(0, 400),
          reasonOwnedInsufficient: String(need.reasonOwnedInsufficient ?? "").slice(0, 400),
          status,
          validated: Boolean(validated),
          inputCheckId:
            typeof raw.inputCheckId === "string" ? raw.inputCheckId : null,
          contractRevision:
            typeof raw.contractRevision === "number" ? raw.contractRevision : null,
          dedupeKey:
            typeof need.dedupeKey === "string" ? need.dedupeKey : null,
          // V7 review R4: only an application-validated requested scope
          // travels to grounding; anything else is "no scope" (fail closed).
          requestedPurposeKind: validatedRequestedPurposeKind(need),
        };
      })
      .filter((need) => need.needId && need.resourceClass);

    // Class-level coverage only when every open need of that class is
    // purpose-covered (needDedupeKey). Same class ≠ same answered question.
    const openNeedsForReq = (objectiveData?.resourceNeeds ?? []).filter(
      (need) =>
        need &&
        need.requirementKey === args.requirementKey &&
        openStatuses.has(String(need.status ?? "")),
    );
    const acquisitionsWithNeed = acquisitions.map((a) => ({
      requirementKey: a.requirementKey,
      contractRevision: a.contractRevision,
      resourceClass: a.resourceClass ?? "unknown",
      verifiedAt: a.verifiedAt,
      needDedupeKey: a.needDedupeKey ?? null,
    }));
    const classCoveredRaw = scopedCoveredResourceClasses({
      requirementKey: args.requirementKey,
      contractRevision: currentContractRevision,
      acquisitions: acquisitionsWithNeed,
    });
    const scopedCovered = classCoveredRaw.filter((resourceClass) => {
      const openSameClass = openNeedsForReq.filter(
        (need) => need.resourceClass === resourceClass,
      );
      if (openSameClass.length === 0) return true;
      return openSameClass.every((need) =>
        acquisitionsWithNeed.some((acquisition) =>
          verifiedAcquisitionCoversNeed(need, acquisition),
        ),
      );
    });

    // Accepted prerequisite results: satisfied/waived dependsOn keys with
    // bounded proof refs + any current objective result unknowns (DATA).
    const prerequisiteResults: Array<{
      requirementKey: string;
      state: string;
      proofRefs: string[];
      findings: string[];
      unknowns: string[];
    }> = [];
    if (dependsOn.length) {
      const allReqRows = await ctx.db
        .query("requirements")
        .withIndex("by_objectiveKey", (q) => q.eq("objectiveKey", args.objectiveKey))
        .collect();
      for (const depKey of dependsOn.slice(0, 8)) {
        const dep =
          allReqRows
            .map((row) => (row as { data: Record<string, unknown> }).data)
            .find(
              (data) =>
                data.requirementKey === depKey &&
                data.contractRevision === currentContractRevision,
            ) ?? null;
        if (!dep) continue;
        const state = String(dep.state ?? "");
        if (state !== "satisfied" && state !== "waived") continue;
        const resolution = dep.resolution as { proofRefs?: string[] } | null;
        prerequisiteResults.push({
          requirementKey: depKey,
          state,
          proofRefs: Array.isArray(resolution?.proofRefs)
            ? resolution!.proofRefs!.slice(0, 8).map(String)
            : [],
          findings: [],
          unknowns: Array.isArray(objectiveData?.result?.unknowns)
            ? objectiveData!.result!.unknowns!.slice(0, 6).map(String)
            : [],
        });
      }
    }

    const TEXT_CAP = 1500;
    const truncate = (s: string) =>
      s.length <= TEXT_CAP
        ? { text: s, truncated: false as const }
        : { text: s.slice(0, TEXT_CAP), truncated: true as const };

    // Acceptance comes from the application's durable terminal record, not from
    // the presence (or prose) of a stored result. Refused/failed output stays
    // visible only as an explicit non-authoritative diagnostic.
    const { latestAcceptedWorkerOutput, latestWorkerDiagnostic } =
      projectWorkerOutput({
        serialProtocol:
          objectiveData?.management?.executionProtocol === "m61_serial_v1",
        result: (objectiveData?.result ?? null) as never,
        acceptedTerminal: objectiveData?.acceptedTerminal ?? null,
        lastUnconfirmedTerminal: objectiveData?.lastUnconfirmedTerminal ?? null,
        summaryCap: TEXT_CAP,
      });

    // M2/F9: the manager must see the same verified acquisitions a MAKE worker
    // will be linked to — this requirement's own AND its declared prerequisites'
    // (resolveSerialMakeActionScope uses the same dependency set). Own first; each
    // row carries its origin requirementKey so scope stays explicit. Nothing
    // outside that dependency set is ever surfaced.
    const acquisitionScopeKeys = new Set<string>([args.requirementKey, ...dependsOn]);
    const scopedVerifiedAcquisitions = acquisitions
      .filter(
        (a) =>
          a.verifiedAt != null &&
          acquisitionScopeKeys.has(a.requirementKey) &&
          a.contractRevision === currentContractRevision,
      )
      .sort(
        (a, b) =>
          Number(b.requirementKey === args.requirementKey) -
          Number(a.requirementKey === args.requirementKey),
      )
      .slice(0, 4)
      .map((a) => {
        const body = truncate(String(a.content ?? ""));
        return {
          resultEvidenceId: a.resultEvidenceId,
          requirementKey: a.requirementKey,
          resourceClass: a.resourceClass ?? "unknown",
          content: body.text,
          needDedupeKey: a.needDedupeKey ?? null,
          truncated: body.truncated,
        };
      });

    const controlledArt = artifactKeyForInternalProof
      ? (objectiveData?.companyArtifacts ?? []).find(
          (a) => a.key === artifactKeyForInternalProof,
        )
      : null;
    const artBody = controlledArt
      ? truncate(String((controlledArt as { content?: string }).content ?? ""))
      : null;

    const openGap = openResourceNeeds.find((n) => n.validated === true) ?? null;
    const critique =
      typeof (objectiveData as { management?: { lastFinalAssessmentCritique?: string } })
        ?.management?.lastFinalAssessmentCritique === "string"
        ? String(
            (objectiveData as { management: { lastFinalAssessmentCritique: string } })
              .management.lastFinalAssessmentCritique,
          ).slice(0, 800)
        : null;

    const managerResultPackage = {
      latestAcceptedWorkerOutput,
      latestWorkerDiagnostic,
      scopedVerifiedAcquisitions,
      currentControlledArtifact: controlledArt
        ? {
            key: String(controlledArt.key),
            version: Number((controlledArt as { version?: number }).version ?? 0),
            content: artBody!.text,
            truncated: artBody!.truncated,
          }
        : null,
      priorActionResult: latestAcceptedWorkerOutput
        ? {
            runId: latestAcceptedWorkerOutput.runId,
            summary: latestAcceptedWorkerOutput.summary,
          }
        : null,
      semanticEvidenceGap: openGap
        ? {
            needId: openGap.needId,
            dedupeKey: openGap.dedupeKey ?? null,
            purpose: openGap.purpose,
            resourceClass: openGap.resourceClass,
            status: openGap.status,
          }
        : null,
      finalReviewCritique: critique,
      provenanceEvidenceIds: [
        ...scopedVerifiedAcquisitions.map((a) => a.resultEvidenceId),
      ].slice(0, 12),
    };

    return {
      contract,
      currentContractRevision,
      requirement: {
        ...requirement,
        dependsOnRequirementKeys: dependsOn,
        requiredResourceClasses: Array.isArray(requirementData.requiredResourceClasses)
          ? requirementData.requiredResourceClasses
          : [],
        expectedOutput:
          typeof requirementData.expectedOutput === "string"
            ? requirementData.expectedOutput
            : null,
        ...(requirementData.requirementKind
          ? { requirementKind: requirementData.requirementKind }
          : {}),
      },
      inventory,
      creationAllowed,
      budget,
      grant: grant ? { limitUsd: grant.limitUsd, approvalId: grant.approvalId } : null,
      artifactKeyForInternalProof,
      openResourceNeeds,
      prerequisiteResults,
      scopedCoveredResourceClasses: scopedCovered,
      serialManagerProtocol:
        objectiveData?.management?.executionProtocol === "m61_serial_v1",
      managerResultPackage,
    };
  },
});

// ── Timer bookkeeping (R3 A3) ───────────────────────────────────────────────
//
// "At most one outstanding timer per logical condition" is a storage fact, so
// the storage layer answers it. A timer wake is any wake row whose dedupeKey
// belongs to `timerKey`; OUTSTANDING means not yet consumed by a pass.

export const timerState = internalQuery({
  args: { objectiveKey: v.string(), timerKey: v.string() },
  returns: v.object({ outstanding: v.boolean(), armed: v.number() }),
  handler: async (ctx, args): Promise<{ outstanding: boolean; armed: number }> => {
    const rows = await ctx.db
      .query("wakeEvents")
      .withIndex("by_objective", (q) => q.eq("objectiveKey", args.objectiveKey))
      .collect();
    const prefix = `timer:${args.timerKey}:`;
    const mine = rows.filter((row) => ((row as { dedupeKey: string }).dedupeKey ?? "").startsWith(prefix));
    const outstanding = mine.some(
      (row) => ((row as { data: WakeEvent }).data.consumedAt ?? null) === null,
    );
    return { outstanding, armed: mine.length };
  },
});

// ── Generic upserts ──────────────────────────────────────────────────────────

// Put an outcome contract. Idempotent replace by (objectiveKey, contractId, revision).
export const putContract = internalMutation({
  args: {
    objectiveKey: v.string(),
    contractId: v.string(),
    revision: v.number(),
    data: v.any(),
  },
  returns: v.object({ ok: v.boolean() }),
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("outcomeContracts")
      .withIndex("by_objectiveRevision", (q) =>
        q.eq("objectiveKey", args.objectiveKey).eq("revision", args.revision),
      )
      .unique();

    if (existing) {
      await ctx.db.patch(existing._id, { data: args.data });
    } else {
      await ctx.db.insert("outcomeContracts", {
        objectiveKey: args.objectiveKey,
        contractId: args.contractId,
        revision: args.revision,
        data: args.data,
      });
    }

    return { ok: true };
  },
});

// Put a requirement. Idempotent replace by (objectiveKey, requirementKey).
// Stale downsert protection: refuses when data.contractRevision < currentContractRevision
// AND existing row state is "satisfied" (protect satisfied rows from stale downserts).
export const putRequirement = internalMutation({
  args: {
    objectiveKey: v.string(),
    requirementKey: v.string(),
    data: v.any(),
    currentContractRevision: v.optional(v.number()),
  },
  returns: v.object({ ok: v.boolean(), reason: v.optional(v.string()) }),
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("requirements")
      .withIndex("by_objectiveRequirement", (q) =>
        q.eq("objectiveKey", args.objectiveKey).eq("requirementKey", args.requirementKey),
      )
      .unique();

    if (existing) {
      const existingData = (existing as { data: { state: string; contractRevision: number } }).data;

      // Stale downsert protection: storage-currency check, not business policy
      if (
        args.currentContractRevision !== undefined &&
        args.data.contractRevision < args.currentContractRevision &&
        existingData.state === "satisfied"
      ) {
        return {
          ok: false,
          reason: "stale_downsert_rejected: satisfied requirement cannot be overwritten by older revision",
        };
      }

      await ctx.db.patch(existing._id, { data: args.data });
    } else {
      await ctx.db.insert("requirements", {
        objectiveKey: args.objectiveKey,
        requirementKey: args.requirementKey,
        data: args.data,
      });
    }

    return { ok: true };
  },
});

// Put a managerial decision. Idempotent replace by decisionId.
export const putDecision = internalMutation({
  args: {
    objectiveKey: v.string(),
    decisionId: v.string(),
    data: v.any(),
  },
  returns: v.object({ ok: v.boolean() }),
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("managerialDecisions")
      .withIndex("by_decisionId", (q) => q.eq("decisionId", args.decisionId))
      .unique();

    if (existing) {
      await ctx.db.patch(existing._id, { data: args.data });
    } else {
      await ctx.db.insert("managerialDecisions", {
        objectiveKey: args.objectiveKey,
        decisionId: args.decisionId,
        data: args.data,
      });
    }

    return { ok: true };
  },
});

// Put an assignment. Idempotent replace by assignmentId.
export const putAssignment = internalMutation({
  args: {
    assignmentId: v.string(),
    objectiveKey: v.string(),
    data: v.any(),
  },
  returns: v.object({ ok: v.boolean() }),
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("assignments")
      .withIndex("by_assignmentId", (q) => q.eq("assignmentId", args.assignmentId))
      .unique();

    if (existing) {
      await ctx.db.patch(existing._id, { data: args.data });
    } else {
      await ctx.db.insert("assignments", {
        assignmentId: args.assignmentId,
        objectiveKey: args.objectiveKey,
        data: args.data,
      });
    }

    return { ok: true };
  },
});

// Put an execution intent. Idempotent replace by intentId.
export const putIntent = internalMutation({
  args: {
    intentId: v.string(),
    objectiveKey: v.string(),
    idempotencyKey: v.string(),
    data: v.any(),
  },
  returns: v.object({ ok: v.boolean() }),
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("executionIntents")
      .withIndex("by_intentId", (q) => q.eq("intentId", args.intentId))
      .unique();

    if (existing) {
      await ctx.db.patch(existing._id, { data: args.data });
    } else {
      await ctx.db.insert("executionIntents", {
        intentId: args.intentId,
        objectiveKey: args.objectiveKey,
        idempotencyKey: args.idempotencyKey,
        data: args.data,
      });
    }

    return { ok: true };
  },
});

// ── Founder spend authority (R3 A4) ─────────────────────────────────────────
//
// Storage only — the rule lives in lib/management/authorization.ts. The point
// of these two functions is that a spend bound has to be a RECORD with an
// identity, because "the founder never said no" is not authority: the
// authorization kernel needs a `spendApprovalId` to name on a monetary intent,
// and the hand-off predicate refuses a monetary intent that cannot name one.

export const putSpendGrant = internalMutation({
  args: {
    approvalId: v.string(),
    objectiveKey: v.string(),
    limitUsd: v.number(),
    at: v.number(),
    note: v.string(),
  },
  returns: vFounderSpendGrant,
  handler: async (ctx, args): Promise<FounderSpendGrant> => {
    if (!(args.limitUsd > 0))
      throw new Error("a spend grant must bound a positive amount");
    const existing = await ctx.db
      .query("founderSpendGrants")
      .withIndex("by_approvalId", (q) => q.eq("approvalId", args.approvalId))
      .unique();
    // An existing approvalId keeps its bound: a replayed grant must not widen
    // what the founder permitted. Raising a limit is a NEW grant with a new id,
    // so both grants stay auditable.
    const grant: FounderSpendGrant = {
      approvalId: args.approvalId,
      objectiveKey: args.objectiveKey,
      limitUsd: existing ? (existing as GrantRow).data.limitUsd : args.limitUsd,
      grantedAt: existing ? ((existing as GrantRow).data.grantedAt as number) : args.at,
      revokedAt: existing ? ((existing as GrantRow).data.revokedAt as number | null) : null,
      note: args.note,
    };
    if (existing) await ctx.db.patch(existing._id, { data: grant });
    else
      await ctx.db.insert("founderSpendGrants", {
        approvalId: grant.approvalId,
        objectiveKey: args.objectiveKey,
        data: grant,
      });
    return grant;
  },
});

export const revokeSpendGrant = internalMutation({
  args: { approvalId: v.string(), at: v.number() },
  returns: v.union(vFounderSpendGrant, v.null()),
  handler: async (ctx, args): Promise<FounderSpendGrant | null> => {
    const existing = await ctx.db
      .query("founderSpendGrants")
      .withIndex("by_approvalId", (q) => q.eq("approvalId", args.approvalId))
      .unique();
    if (!existing) return null;
    const row = existing as GrantRow;
    if (row.data.revokedAt !== null) return row.data;
    const grant: FounderSpendGrant = { ...row.data, revokedAt: args.at };
    await ctx.db.patch(row._id, { data: grant });
    return grant;
  },
});

// The LIVE grant for an objective, if any. `null` means no authority, and the
// kernel treats that as fail-closed — never as unlimited. Revoked grants are
// excluded here so a stale record cannot authorize a new effect.
export const activeSpendGrant = internalQuery({
  args: { objectiveKey: v.string() },
  returns: v.union(vFounderSpendGrant, v.null()),
  handler: async (ctx, args): Promise<FounderSpendGrant | null> => {
    const rows = await ctx.db
      .query("founderSpendGrants")
      .withIndex("by_objective", (q) => q.eq("objectiveKey", args.objectiveKey))
      .collect();
    const live = rows
      .map((row) => (row as GrantRow).data)
      .filter((grant) => grant.revokedAt === null);
    if (live.length === 0) return null;
    // Deterministic when several live grants exist: the largest bound wins,
    // tie-broken by id, so the pass is not order-dependent.
    return live.reduce((max, grant) =>
      grant.limitUsd > max.limitUsd ||
      (grant.limitUsd === max.limitUsd && grant.approvalId < max.approvalId)
        ? grant
        : max,
    );
  },
});
