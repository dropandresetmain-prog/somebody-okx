// Narrow public bridge for the LOCAL Node-only M4×M3 driver. It never imports
// the Node buyer rail: Convex remains the authority for M4 transitions/wakes.
import { v } from "convex/values";
import { query, mutation } from "./_generated/server";
import { internal } from "./_generated/api";
import { advanceIntent, applyRailEvent } from "../lib/management/intents";
import { canonicalM3DriverFact, type M3DriverFact } from "../lib/management/m3DriverFacts";
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

function hex(bytes: Uint8Array): string {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function constantTimeEqual(left: string, right: string): boolean {
  let difference = left.length ^ right.length;
  const length = Math.max(left.length, right.length);
  for (let index = 0; index < length; index += 1) {
    difference |= (left.charCodeAt(index) || 0) ^ (right.charCodeAt(index) || 0);
  }
  return difference === 0;
}

/** A bearer token opens the bridge; a distinct M3-held key attests one exact
 * observed financial fact. The public bridge must never treat a token alone as
 * proof of settlement, provider result, or verification. */
async function assertFactAttestation(fact: M3DriverFact, attestation: string): Promise<void> {
  const key = process.env.M4_M3_FACT_ATTESTATION_KEY;
  if (!key) throw new Error("M4×M3 fact attestation key is not configured");
  if (key === process.env.M4_M3_DRIVER_TOKEN) {
    throw new Error("M4×M3 fact attestation key must be distinct from the bridge bearer token");
  }
  const cryptoKey = await crypto.subtle.importKey("raw", new TextEncoder().encode(key), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const signature = await crypto.subtle.sign("HMAC", cryptoKey, new TextEncoder().encode(canonicalM3DriverFact(fact)));
  if (!constantTimeEqual(hex(new Uint8Array(signature)), attestation)) throw new Error("M4×M3 fact attestation is invalid");
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
    attestation: v.string(),
    driverToken: v.string(),
  },
  returns: v.object({ changed: v.boolean(), duplicate: v.boolean(), state: v.string(), stale: v.boolean() }),
  handler: async (ctx, args) => {
    authorize(args.driverToken);
    await assertFactAttestation({
      intentId: args.intentId, expectedUpdatedAt: args.expectedUpdatedAt,
      eventKind: args.eventKind, eventId: args.eventId, dedupeKey: args.dedupeKey,
      evidenceId: args.evidenceId ?? null, note: args.note, at: args.at,
    }, args.attestation);
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
    // The executor was gated against a current revision before it became
    // reachable. A later revision may not erase a submitted financial fact;
    // it remains reconcilable, while the existing proof kernels keep it from
    // satisfying the newer requirement.

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
