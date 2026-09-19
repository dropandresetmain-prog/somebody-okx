// Narrow public bridge for the LOCAL Node-only M4×M3 driver. It never imports
// the Node buyer rail: Convex remains the authority for M4 transitions/wakes.
import { v } from "convex/values";
import { query, mutation } from "./_generated/server";
import { internal } from "./_generated/api";
import { advanceIntent, applyRailEvent } from "../lib/management/intents";
import { vExecutionIntent } from "./managementValidators";
import type { ExecutionIntent, WakeEvent, WakeReason } from "../lib/management/types";

const vDriverEvent = v.union(
  v.literal("submitted"),
  v.literal("provider_result"),
  v.literal("verification_passed"),
  v.literal("verification_failed"),
  v.literal("pre_submission_failed"),
  v.literal("reconciliation_required"),
);

function authorize(driverToken: string): void {
  const expected = process.env.M4_M3_DRIVER_TOKEN;
  if (!expected || driverToken !== expected) throw new Error("M4×M3 local driver is not authorized");
}

/** Reads one exact durable effect and its current M4 business context. */
export const snapshot = query({
  args: { intentId: v.string(), driverToken: v.string() },
  returns: v.union(v.null(), v.object({
    intent: vExecutionIntent,
    objectiveExists: v.boolean(),
    contractCurrent: v.boolean(),
    requirementCurrent: v.boolean(),
  })),
  handler: async (ctx, args) => {
    authorize(args.driverToken);
    const row = await ctx.db.query("executionIntents")
      .withIndex("by_intentId", (q) => q.eq("intentId", args.intentId)).unique();
    if (!row) return null;
    const intent = row.data as ExecutionIntent;
    const objective = await ctx.db.query("objectives")
      .withIndex("by_key", (q) => q.eq("key", intent.objectiveKey)).unique();
    const contract = await ctx.db.query("outcomeContracts")
      .withIndex("by_objectiveRevision", (q) => q.eq("objectiveKey", intent.objectiveKey))
      .order("desc").first();
    const requirement = await ctx.db.query("requirements")
      .withIndex("by_objectiveRequirement", (q) => q.eq("objectiveKey", intent.objectiveKey).eq("requirementKey", intent.requirementKey))
      .unique();
    return {
      intent,
      objectiveExists: objective !== null,
      contractCurrent: contract?.revision === intent.contractRevision,
      requirementCurrent: (requirement?.data as { contractRevision?: number } | undefined)?.contractRevision === intent.contractRevision,
    };
  },
});

/**
 * Applies only a named M3 fact through M4's existing intent kernel. The local
 * driver cannot submit an arbitrary `verified` row. A stale intent may record
 * financial/recovery truth, but a stale submission is refused and the normal
 * management pass cannot satisfy a newer requirement from this old intent.
 */
export const apply = mutation({
  args: {
    intentId: v.string(),
    expectedUpdatedAt: v.number(),
    eventKind: vDriverEvent,
    eventId: v.string(),
    dedupeKey: v.string(),
    evidenceId: v.optional(v.string()),
    note: v.string(),
    at: v.number(),
    driverToken: v.string(),
  },
  returns: v.object({ changed: v.boolean(), duplicate: v.boolean(), state: v.string(), stale: v.boolean() }),
  handler: async (ctx, args) => {
    authorize(args.driverToken);
    const row = await ctx.db.query("executionIntents")
      .withIndex("by_intentId", (q) => q.eq("intentId", args.intentId)).unique();
    if (!row) throw new Error(`execution intent not found: ${args.intentId}`);
    const intent = row.data as ExecutionIntent;
    if (intent.updatedAt !== args.expectedUpdatedAt) throw new Error("stale driver write refused; reload the intent");
    if (!args.dedupeKey.startsWith(`intent:${intent.intentId}:`)) throw new Error("invalid M4 wake dedupe key");

    const contract = await ctx.db.query("outcomeContracts")
      .withIndex("by_objectiveRevision", (q) => q.eq("objectiveKey", intent.objectiveKey))
      .order("desc").first();
    const requirement = await ctx.db.query("requirements")
      .withIndex("by_objectiveRequirement", (q) => q.eq("objectiveKey", intent.objectiveKey).eq("requirementKey", intent.requirementKey))
      .unique();
    const stale = contract?.revision !== intent.contractRevision
      || (requirement?.data as { contractRevision?: number } | undefined)?.contractRevision !== intent.contractRevision;
    if (args.eventKind === "submitted" && stale) throw new Error("stale intent may not begin M3 execution");

    let moved;
    let reason: WakeReason | null = null;
    switch (args.eventKind) {
      case "submitted":
        moved = advanceIntent(intent, "handed_off", args.at, { eventId: args.eventId, note: args.note });
        break;
      case "provider_result":
        if (!args.evidenceId) throw new Error("provider result requires evidence identity");
        moved = applyRailEvent(intent, { kind: "provider_result", intentId: intent.intentId, eventId: args.eventId, resultEvidenceId: args.evidenceId, at: args.at });
        reason = "provider_result";
        break;
      case "verification_passed":
        if (!args.evidenceId) throw new Error("verification requires evidence identity");
        moved = applyRailEvent(intent, { kind: "verification_result", intentId: intent.intentId, eventId: args.eventId, verified: true, verificationEvidenceId: args.evidenceId, at: args.at });
        reason = "verification_result";
        break;
      case "verification_failed":
        moved = applyRailEvent(intent, { kind: "verification_result", intentId: intent.intentId, eventId: args.eventId, verified: false, verificationEvidenceId: args.evidenceId ?? "verification_rejected", at: args.at });
        reason = "recovery_event";
        break;
      case "pre_submission_failed":
        moved = applyRailEvent(intent, { kind: "rail_failure", intentId: intent.intentId, eventId: args.eventId, reason: args.note, at: args.at });
        reason = "recovery_event";
        break;
      case "reconciliation_required":
        moved = advanceIntent(intent, "reconciliation_required", args.at, { eventId: args.eventId, note: args.note });
        reason = "recovery_event";
        break;
    }
    if (!moved.ok) {
      // Re-delivery after a completed transition is an idempotent no-op; an
      // unrelated illegal state move still fails closed rather than overwriting.
      if (intent.lastEventId === args.eventId) return { changed: false, duplicate: true, state: intent.state, stale };
      throw new Error(moved.reason);
    }
    await ctx.db.patch(row._id, { data: moved.intent });
    if (reason) {
      const existingWake = await ctx.db.query("wakeEvents")
        .withIndex("by_dedupe", (q) => q.eq("dedupeKey", args.dedupeKey)).unique();
      if (!existingWake) {
        const wake: WakeEvent = {
          eventId: `wake_${args.eventId}`,
          objectiveKey: intent.objectiveKey,
          reason,
          refKind: "intent",
          refId: intent.intentId,
          summary: args.note.slice(0, 900),
          at: args.at,
          consumedAt: null,
        };
        await ctx.db.insert("wakeEvents", { eventId: wake.eventId, objectiveKey: wake.objectiveKey, dedupeKey: args.dedupeKey, data: wake });
        await ctx.scheduler.runAfter(0, internal.management.runManagementPass, { objectiveKey: intent.objectiveKey, reason });
      }
    }
    return { changed: true, duplicate: false, state: moved.intent.state, stale };
  },
});
