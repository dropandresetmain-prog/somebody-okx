// Narrow public bridge for the LOCAL Node-only M4×M3 driver. It never imports
// the Node buyer rail: Convex remains the authority for M4 transitions/wakes.
import { v } from "convex/values";
import { query, mutation } from "./_generated/server";
import { internal } from "./_generated/api";
import { advanceIntent, applyRailEvent } from "../lib/management/intents";
import { canonicalM3DriverFact, type M3DriverFact } from "../lib/management/m3DriverFacts";
import { vExecutionIntent } from "./managementValidators";
import type { ExecutionIntent, WakeEvent, WakeReason } from "../lib/management/types";
import type { FounderSpendGrant } from "./internal/workforce";
import type {
  ExternalAcquisitionResult,
  ObjectiveRecord,
} from "../lib/objective/types";
import { CANONICAL_SIMULATED_SOCIAL_RESULT } from "../lib/objective/seedData";
import { sha256Hex } from "../lib/management/sha256";

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

function authorizeDemoOperator(operatorToken: string): void {
  const expected = process.env.SOMEBODY_DEMO_OPERATOR_TOKEN;
  if (!expected || !constantTimeEqual(operatorToken, expected)) {
    throw new Error("M1 simulation operator is not authorized");
  }
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
    founderSpendApprovalCurrent: v.boolean(),
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
    const approvalId = intent.terms.approvalId;
    const grantRow = approvalId === null ? null : await ctx.db.query("founderSpendGrants")
      .withIndex("by_approvalId", (q) => q.eq("approvalId", approvalId))
      .unique();
    const grant = grantRow?.data as FounderSpendGrant | undefined;
    // A live grant is a pre-submission authority only. Its exact stable id,
    // Objective, revocation state, and dollar limit must still cover this
    // intent; a different active grant can never substitute for it.
    const founderSpendApprovalCurrent = approvalId === null
      ? intent.terms.priceUsd === null || intent.terms.priceUsd <= 0
      : grant?.approvalId === approvalId
        && grant.objectiveKey === intent.objectiveKey
        && grant.revokedAt === null
        && intent.terms.priceUsd !== null
        && grant.limitUsd >= intent.terms.priceUsd;
    return {
      intent,
      objectiveExists: objective !== null,
      contractCurrent: contract?.revision === intent.contractRevision,
      requirementCurrent: (requirement?.data as { contractRevision?: number } | undefined)?.contractRevision === intent.contractRevision,
      founderSpendApprovalCurrent,
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


// Operator-only lookup for the one current M1 simulation candidate. This is
// setup/inspection tooling, not product authority; it cannot mutate an intent.
export const simulationCandidate = query({
  args: {
    objectiveKey: v.string(),
    operatorToken: v.string(),
  },
  returns: v.union(
    v.null(),
    v.object({
      intentId: v.string(),
      providerId: v.union(v.string(), v.null()),
      serviceId: v.union(v.string(), v.null()),
      offeringId: v.union(v.string(), v.null()),
      resourceClass: v.union(v.string(), v.null()),
      state: v.string(),
      priceUsd: v.union(v.number(), v.null()),
    }),
  ),
  handler: async (ctx, args) => {
    authorizeDemoOperator(args.operatorToken);
    const rows = await ctx.db
      .query("executionIntents")
      .withIndex("by_objective", (q) => q.eq("objectiveKey", args.objectiveKey))
      .collect();
    const candidates = rows
      .map((row) => row.data as ExecutionIntent)
      .filter(
        (intent) =>
          intent.state === "authorized" &&
          intent.kind === "external_acquisition" &&
          intent.target.resourceClass ===
            CANONICAL_SIMULATED_SOCIAL_RESULT.resourceClass,
      )
      .sort(
        (left, right) =>
          left.createdAt - right.createdAt ||
          left.intentId.localeCompare(right.intentId),
      );
    const intent = candidates[0];
    if (!intent) return null;
    return {
      intentId: intent.intentId,
      providerId: intent.target.providerId,
      serviceId: intent.target.serviceId,
      offeringId: intent.target.offeringId,
      resourceClass: intent.target.resourceClass,
      state: intent.state,
      priceUsd: intent.terms.priceUsd,
    };
  },
});

/**
 * M1 ONLY — deterministic simulated external acquisition boundary.
 *
 * This mutation never imports/calls M3, never signs, never submits a transaction,
 * never touches a provider, and never writes payment/settlement truth. It accepts
 * only an already-authorized M4 intent, applies the same legal M4 intent state
 * transitions a real rail would cause, persists one clearly-labelled simulated
 * result, and wakes the normal management loop.
 */
export const simulateVerifiedAcquisition = mutation({
  args: {
    intentId: v.string(),
    operatorToken: v.string(),
  },
  returns: v.object({
    changed: v.boolean(),
    duplicate: v.boolean(),
    state: v.string(),
    resultEvidenceId: v.string(),
    responseHash: v.string(),
    provenance: v.literal("simulation"),
  }),
  handler: async (ctx, args) => {
    authorizeDemoOperator(args.operatorToken);

    const row = await ctx.db
      .query("executionIntents")
      .withIndex("by_intentId", (q) => q.eq("intentId", args.intentId))
      .unique();
    if (!row) throw new Error(`execution intent not found: ${args.intentId}`);
    const intent = row.data as ExecutionIntent;

    if (intent.target.resourceClass !== CANONICAL_SIMULATED_SOCIAL_RESULT.resourceClass) {
      throw new Error(
        `M1 simulation fixture only satisfies ${CANONICAL_SIMULATED_SOCIAL_RESULT.resourceClass}; intent requests ${intent.target.resourceClass ?? "none"}`,
      );
    }

    const objectiveRow = await ctx.db
      .query("objectives")
      .withIndex("by_key", (q) => q.eq("key", intent.objectiveKey))
      .unique();
    if (!objectiveRow) throw new Error("objective missing for simulation intent");
    const objective = objectiveRow.data as ObjectiveRecord;

    const responseContent = CANONICAL_SIMULATED_SOCIAL_RESULT.content;
    const responseHash = sha256Hex(responseContent);
    const identity = sha256Hex(
      [intent.intentId, responseHash, "m1-simulation"].join("\u0000"),
    ).slice(0, 24);
    const resultEvidenceId = `sim_result_${identity}`;
    const verificationEvidenceId = `sim_verify_${identity}`;

    const existingResult = (objective.acquisitionResults ?? []).find(
      (result) =>
        result.intentId === intent.intentId &&
        result.resultEvidenceId === resultEvidenceId &&
        result.provenance === "simulation",
    );
    if (intent.state === "verified" && existingResult) {
      return {
        changed: false,
        duplicate: true,
        state: intent.state,
        resultEvidenceId,
        responseHash,
        provenance: "simulation" as const,
      };
    }
    if (intent.state !== "authorized") {
      throw new Error(
        `M1 simulation requires an authorized, not-yet-executed M4 intent; found ${intent.state}`,
      );
    }

    // Refuse stale business authority even though this boundary spends no money.
    const contract = await ctx.db
      .query("outcomeContracts")
      .withIndex("by_objectiveRevision", (q) =>
        q.eq("objectiveKey", intent.objectiveKey),
      )
      .order("desc")
      .first();
    const requirement = await ctx.db
      .query("requirements")
      .withIndex("by_objectiveRequirement", (q) =>
        q
          .eq("objectiveKey", intent.objectiveKey)
          .eq("requirementKey", intent.requirementKey),
      )
      .unique();
    if (
      contract?.revision !== intent.contractRevision ||
      (requirement?.data as { contractRevision?: number } | undefined)
        ?.contractRevision !== intent.contractRevision
    ) {
      throw new Error("M1 simulation refuses a stale acquisition intent");
    }

    if ((intent.terms.priceUsd ?? 0) > 0) {
      const approvalId = intent.terms.approvalId;
      if (!approvalId) {
        throw new Error("M1 simulation refuses priced intent without founder approval");
      }
      const grantRow = await ctx.db
        .query("founderSpendGrants")
        .withIndex("by_approvalId", (q) => q.eq("approvalId", approvalId))
        .unique();
      const grant = grantRow?.data as FounderSpendGrant | undefined;
      if (
        !grant ||
        grant.objectiveKey !== intent.objectiveKey ||
        grant.revokedAt !== null ||
        grant.limitUsd < (intent.terms.priceUsd ?? 0)
      ) {
        throw new Error("M1 simulation refuses intent whose founder spend grant is no longer current");
      }
    }

    const now = Date.now();
    const submitted = advanceIntent(intent, "handed_off", now, {
      eventId: `sim_submit_${identity}`,
      note:
        "SIMULATION ONLY: external boundary accepted; no wallet, payment, provider, or transaction was touched",
    });
    if (!submitted.ok) throw new Error(submitted.reason);

    const resultRecorded = applyRailEvent(submitted.intent, {
      kind: "provider_result",
      intentId: intent.intentId,
      eventId: `sim_provider_${identity}`,
      resultEvidenceId,
      at: now,
    });
    if (!resultRecorded.ok) throw new Error(resultRecorded.reason);

    const verified = applyRailEvent(resultRecorded.intent, {
      kind: "verification_result",
      intentId: intent.intentId,
      eventId: `sim_verification_${identity}`,
      verified: true,
      verificationEvidenceId,
      at: now,
    });
    if (!verified.ok) throw new Error(verified.reason);

    const acquisition: ExternalAcquisitionResult = {
      intentId: intent.intentId,
      requirementKey: intent.requirementKey,
      contractRevision: intent.contractRevision,
      resultEvidenceId,
      provenance: "simulation",
      providerId: intent.target.providerId,
      serviceId: intent.target.serviceId,
      offeringId: intent.target.offeringId,
      resourceClass: intent.target.resourceClass,
      content: responseContent,
      responseHash,
      recordedAt: now,
      verifiedAt: now,
    };

    await ctx.db.patch(row._id, { data: verified.intent });
    await ctx.db.patch(objectiveRow._id, {
      data: {
        ...objective,
        acquisitionResults: [
          ...(objective.acquisitionResults ?? []).filter(
            (result) => result.intentId !== intent.intentId,
          ),
          acquisition,
        ],
        activity:
          "SIMULATION: verified external acquisition result entered company state; Somebody is replanning.",
        updatedAt: now,
      },
    });

    await ctx.db.insert("objectiveEvents", {
      objectiveKey: intent.objectiveKey,
      data: {
        at: now,
        kind: "evidence",
        text:
          `SIMULATION ONLY — verified external result ${resultEvidenceId} recorded from ${intent.target.providerId ?? "provider"} / ${intent.target.serviceId ?? "service"}; no live provider or payment occurred.`,
      },
    });

    const dedupeKey = `intent:${intent.intentId}:simulation_verified:${identity}`;
    const existingWake = await ctx.db
      .query("wakeEvents")
      .withIndex("by_dedupe", (q) => q.eq("dedupeKey", dedupeKey))
      .unique();
    if (!existingWake) {
      const wake: WakeEvent = {
        eventId: `wake_sim_${identity}`,
        objectiveKey: intent.objectiveKey,
        reason: "verification_result",
        refKind: "intent",
        refId: intent.intentId,
        summary:
          "SIMULATION ONLY: verified provider result available; resume normal M4 management.",
        at: now,
        consumedAt: null,
      };
      await ctx.db.insert("wakeEvents", {
        eventId: wake.eventId,
        objectiveKey: wake.objectiveKey,
        dedupeKey,
        data: wake,
      });
      await ctx.scheduler.runAfter(0, internal.management.runManagementPass, {
        objectiveKey: intent.objectiveKey,
        reason: "verification_result",
      });
    }

    return {
      changed: true,
      duplicate: false,
      state: verified.intent.state,
      resultEvidenceId,
      responseHash,
      provenance: "simulation" as const,
    };
  },
});
