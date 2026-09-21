// Narrow public bridge for the LOCAL Node-only M4×M3 driver. It never imports
// the Node buyer rail: Convex remains the authority for M4 transitions/wakes.
import { v } from "convex/values";
import { query, mutation } from "./_generated/server";
import { internal } from "./_generated/api";
import { advanceIntent, applyRailEvent } from "../lib/management/intents";
import { canonicalM3DriverFact, type M3DriverFact } from "../lib/management/m3DriverFacts";
import { sha256Hex } from "../lib/management/sha256";
import {
  CANONICAL_SIMULATED_SOCIAL_RESULT,
} from "../lib/objective/seedData";
import type { ExternalAcquisitionResult } from "../lib/objective/types";
import { assertAttestedLiveAcquisitionContent } from "../lib/payment/liveAcquisitionContent";
import { vExecutionIntent } from "./managementValidators";
import type { ExecutionIntent, WakeEvent, WakeReason } from "../lib/management/types";
import type { FounderSpendGrant } from "./internal/workforce";

const vDriverEvent = v.union(
  v.literal("submitted"),
  v.literal("provider_result"),
  v.literal("verification_passed"),
  v.literal("verification_failed"),
  v.literal("pre_submission_failed"),
  v.literal("reconciliation_required"),
);

// M6.1-only demo operator gate. Same constant-time discipline as fact
// attestation: token equality is never decided with a short-circuit compare.
function assertDemoOperator(token: string): void {
  const expected = process.env.SOMEBODY_DEMO_OPERATOR_TOKEN;
  if (!expected || token.length !== expected.length) {
    throw new Error("demo operator is not authorized");
  }
  let difference = 0;
  for (let index = 0; index < expected.length; index += 1) {
    difference |= token.charCodeAt(index) ^ expected.charCodeAt(index);
  }
  if (difference !== 0) throw new Error("demo operator is not authorized");
}

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
    /**
     * SHA-256 of normalized acquisition content. Bound into the attestation.
     * Required (non-null) only when verification_passed carries live writeback.
     */
    acquisitionContentHash: v.optional(v.union(v.string(), v.null())),
    /** Normalized human-usable content; must hash to acquisitionContentHash. */
    acquisitionContent: v.optional(v.string()),
    attestation: v.string(),
    driverToken: v.string(),
  },
  returns: v.object({ changed: v.boolean(), duplicate: v.boolean(), state: v.string(), stale: v.boolean() }),
  handler: async (ctx, args) => {
    authorize(args.driverToken);
    const acquisitionContentHash = args.acquisitionContentHash ?? null;
    await assertFactAttestation({
      intentId: args.intentId, expectedUpdatedAt: args.expectedUpdatedAt,
      eventKind: args.eventKind, eventId: args.eventId, dedupeKey: args.dedupeKey,
      evidenceId: args.evidenceId ?? null, note: args.note, at: args.at,
      acquisitionContentHash,
    }, args.attestation);
    if (args.eventKind !== "verification_passed" && acquisitionContentHash !== null) {
      throw new Error("acquisition content hash is only valid on verification_passed");
    }
    if (args.eventKind !== "verification_passed" && args.acquisitionContent) {
      throw new Error("acquisition content is only valid on verification_passed");
    }
    const row = await ctx.db.query("executionIntents")
      .withIndex("by_intentId", (q) => q.eq("intentId", args.intentId)).unique();
    if (!row) throw new Error(`execution intent not found: ${args.intentId}`);
    const intent = row.data as ExecutionIntent;
    if (!args.dedupeKey.startsWith(`intent:${intent.intentId}:`)) throw new Error("invalid M4 wake dedupe key");

    const contract = await ctx.db.query("outcomeContracts")
      .withIndex("by_objectiveRevision", (q) => q.eq("objectiveKey", intent.objectiveKey))
      .order("desc").first();
    const requirement = await ctx.db.query("requirements")
      .withIndex("by_objectiveRequirement", (q) => q.eq("objectiveKey", intent.objectiveKey).eq("requirementKey", intent.requirementKey))
      .unique();
    const stale = contract?.revision !== intent.contractRevision
      || (requirement?.data as { contractRevision?: number } | undefined)?.contractRevision !== intent.contractRevision;

    // Exact event re-delivery is an idempotent no-op even when the caller still
    // holds a pre-transition expectedUpdatedAt (lost-ack / outbox replay).
    if (intent.lastEventId === args.eventId) {
      return { changed: false, duplicate: true, state: intent.state, stale };
    }
    if (intent.updatedAt !== args.expectedUpdatedAt) throw new Error("stale driver write refused; reload the intent");
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

    // Live acquisition writeback: only after independent verification_passed,
    // with attested content hash. Submission / provider_result alone never
    // create verified worker-consumable acquisition truth.
    if (
      args.eventKind === "verification_passed" &&
      acquisitionContentHash !== null &&
      moved.intent.state === "verified"
    ) {
      const content = args.acquisitionContent;
      if (typeof content !== "string") {
        throw new Error("verification_passed with content hash requires acquisitionContent");
      }
      assertAttestedLiveAcquisitionContent(content, acquisitionContentHash);
      const resultEvidenceId = moved.intent.resultEvidenceId;
      if (!resultEvidenceId) {
        throw new Error("verified intent missing resultEvidenceId for acquisition writeback");
      }
      const objectiveRows = await ctx.db.query("objectives")
        .withIndex("by_key", (q) => q.eq("key", intent.objectiveKey)).collect();
      const objectiveRow = objectiveRows[0];
      if (!objectiveRow) throw new Error(`objective not found: ${intent.objectiveKey}`);
      const record = objectiveRow.data as {
        key: string;
        acquisitionResults?: ExternalAcquisitionResult[];
        updatedAt: number;
        [key: string]: unknown;
      };
      const existingForIntent = (record.acquisitionResults ?? []).find(
        (existing) => existing.intentId === intent.intentId,
      );
      if (
        existingForIntent &&
        existingForIntent.resultEvidenceId !== resultEvidenceId
      ) {
        throw new Error(
          "conflicting live acquisition result for an already-recorded intent",
        );
      }
      if (
        !existingForIntent ||
        existingForIntent.resultEvidenceId !== resultEvidenceId ||
        existingForIntent.responseHash !== acquisitionContentHash
      ) {
        const result: ExternalAcquisitionResult = {
          intentId: intent.intentId,
          requirementKey: intent.requirementKey,
          contractRevision: intent.contractRevision,
          resultEvidenceId,
          // Transport: live M3 TESTNET path. Content text still labels
          // synthetic_test_provider (asserted above).
          provenance: "live",
          providerId: intent.target.providerId ?? "unknown",
          serviceId: intent.target.serviceId ?? "unknown",
          offeringId: intent.target.offeringId ?? "unknown",
          resourceClass: intent.target.resourceClass ?? "unknown",
          content,
          responseHash: acquisitionContentHash,
          recordedAt: args.at,
          verifiedAt: args.at,
          ...(intent.needDedupeKey
            ? { needDedupeKey: intent.needDedupeKey }
            : {}),
          ...(intent.resourceNeedId
            ? { resourceNeedId: intent.resourceNeedId }
            : {}),
        };
        const acquisitions = (record.acquisitionResults ?? []).filter(
          (existing) => existing.intentId !== intent.intentId,
        );
        await ctx.db.patch(objectiveRow._id, {
          data: {
            ...record,
            acquisitionResults: [...acquisitions, result],
            updatedAt: args.at,
          },
        } as never);
      }
    }

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

// ── M6.1 deterministic acquisition simulation (external boundary) ────────────
//
// The ONLY sanctioned place where a provider result enters M4 without M3
// contacting a real provider. It is a demo operator mutation, not a code path:
// the operator supplies the canonical simulated fixture, and this mutation then
// drives the SAME intent kernel the live M3 rail drives — handed_off →
// provider_result → verification_result — while persisting provenance that
// says SIMULATION in durable truth. No wallet, key, signature or rail call
// exists anywhere behind this seam.

// Read-only candidate discovery for the operator: the current authorized
// external_acquisition intent for a SPECIFIC objective whose target resource
// class matches the simulated fixture. Never picks "oldest across the database".
export const simulationCandidate = query({
  args: {
    operatorToken: v.string(),
    objectiveKey: v.string(),
  },
  returns: v.union(
    v.null(),
    v.object({
      intentId: v.string(),
      objectiveKey: v.string(),
      requirementKey: v.string(),
      contractRevision: v.number(),
      strategy: v.string(),
      providerId: v.union(v.string(), v.null()),
      serviceId: v.union(v.string(), v.null()),
      resourceClass: v.union(v.string(), v.null()),
      priceUsd: v.union(v.number(), v.null()),
      approvalId: v.union(v.string(), v.null()),
      state: v.string(),
      updatedAt: v.number(),
    }),
  ),
  handler: async (ctx, args) => {
    assertDemoOperator(args.operatorToken);
    if (!args.objectiveKey.trim()) return null;
    const rows = await ctx.db
      .query("executionIntents")
      .withIndex("by_objective", (q) => q.eq("objectiveKey", args.objectiveKey))
      .collect();
    const candidates = rows
      .map((row) => row.data as ExecutionIntent)
      .filter(
        (intent) =>
          intent.objectiveKey === args.objectiveKey &&
          intent.kind === "external_acquisition" &&
          intent.state === "authorized" &&
          intent.target.resourceClass ===
            CANONICAL_SIMULATED_SOCIAL_RESULT.resourceClass,
      )
      // Current intent for this objective: most recently updated authorized row.
      .sort((left, right) => right.updatedAt - left.updatedAt);
    const intent = candidates[0];
    if (!intent) return null;
    return {
      intentId: intent.intentId,
      objectiveKey: intent.objectiveKey,
      requirementKey: intent.requirementKey,
      contractRevision: intent.contractRevision,
      strategy: intent.strategy,
      providerId: intent.target.providerId,
      serviceId: intent.target.serviceId,
      resourceClass: intent.target.resourceClass,
      priceUsd: intent.terms.priceUsd,
      approvalId: intent.terms.approvalId,
      state: intent.state,
      updatedAt: intent.updatedAt,
    };
  },
});

/**
 * Records the canonical SIMULATED provider result against the oldest matching
 * authorized intent and advances it through the real intent kernel to
 * `verified`, then wakes the engine through the normal path.
 *
 * Fail-closed properties:
 *  - operator-gated; unknown token refuses;
 *  - the intent must be `authorized` and its contract/requirement revisions
 *    must still be current — stale intents are never simulated over;
 *  - the intent's resource class must match the fixture exactly;
 *  - a priced intent requires a live founder grant bound to it (same
 *    objective, unrevoked, limit ≥ price) — the same authority check the
 *    pre-submission gate applies;
 *  - result identity is derived, so re-running on a new intent produces a
 *    distinct evidence id while re-running on the SAME verified intent with
 *    the same content returns the same id (idempotent duplicate).
 */
export const simulateVerifiedAcquisition = mutation({
  args: {
    operatorToken: v.string(),
    intentId: v.string(),
  },
  returns: v.object({
    verified: v.boolean(),
    duplicate: v.boolean(),
    resultEvidenceId: v.string(),
    intentState: v.string(),
  }),
  handler: async (ctx, args) => {
    assertDemoOperator(args.operatorToken);
    const now = Date.now();
    const row = await ctx.db.query("executionIntents")
      .withIndex("by_intentId", (q) => q.eq("intentId", args.intentId)).unique();
    if (!row) throw new Error(`execution intent not found: ${args.intentId}`);
    let intent = row.data as ExecutionIntent;

    // Idempotent duplicate: same intent already verified with the same
    // simulated result identity → report, change nothing.
    const content = CANONICAL_SIMULATED_SOCIAL_RESULT.content;
    const responseHash = sha256Hex(content);
    const identity = sha256Hex(
      [intent.intentId, responseHash, "m6-1-simulation"].join("\u0000"),
    ).slice(0, 24);
    const resultEvidenceId = `sim_result_${identity}`;
    if (intent.state === "verified") {
      if (intent.resultEvidenceId === resultEvidenceId) {
        return { verified: true, duplicate: true, resultEvidenceId, intentState: intent.state };
      }
      throw new Error("intent is already verified with a different result");
    }
    if (intent.state !== "authorized") {
      throw new Error(`intent ${args.intentId} is ${intent.state}, expected authorized`);
    }
    // Revision currency: a stale intent must not be simulated over, exactly as
    // the live rail refuses stale submissions.
    const contract = await ctx.db.query("outcomeContracts")
      .withIndex("by_objectiveRevision", (q) => q.eq("objectiveKey", intent.objectiveKey))
      .order("desc").first();
    const requirement = await ctx.db.query("requirements")
      .withIndex("by_objectiveRequirement", (q) => q.eq("objectiveKey", intent.objectiveKey).eq("requirementKey", intent.requirementKey))
      .unique();
    if (contract?.revision !== intent.contractRevision
      || (requirement?.data as { contractRevision?: number } | undefined)?.contractRevision !== intent.contractRevision) {
      throw new Error("intent is stale: contract or requirement revision has moved on");
    }
    if (intent.target.resourceClass !== CANONICAL_SIMULATED_SOCIAL_RESULT.resourceClass) {
      throw new Error("intent target resource class does not match the simulated fixture");
    }
    // Spend authority: a priced intent must still be covered by a live grant.
    const priceUsd = intent.terms.priceUsd;
    if (priceUsd !== null && priceUsd > 0) {
      const approvalId = intent.terms.approvalId;
      const grantRow = approvalId === null ? null : await ctx.db.query("founderSpendGrants")
        .withIndex("by_approvalId", (q) => q.eq("approvalId", approvalId)).unique();
      const grant = grantRow?.data as FounderSpendGrant | undefined;
      if (!grant
        || grant.objectiveKey !== intent.objectiveKey
        || grant.revokedAt !== null
        || grant.limitUsd < priceUsd) {
        throw new Error("priced intent is not covered by a live founder spend grant");
      }
    }

    // Drive the SAME kernel the live rail drives: handoff, provider result,
    // independent verification. Event ids are derived, so a replay of the same
    // simulation is a kernel-level duplicate, not a second effect.
    const handoffEventId = `sim_event_${identity}_handoff`;
    const handedOff = advanceIntent(intent, "handed_off", now, {
      eventId: handoffEventId,
      note: "SIMULATION: handed off at the external boundary (no rail call)",
    });
    if (!handedOff.ok) throw new Error(`simulation handoff refused: ${handedOff.reason}`);
    intent = handedOff.intent;
    await ctx.db.patch(row._id, { data: intent });

    const providerEventId = `sim_event_${identity}_provider`;
    const providerResult = applyRailEvent(intent, {
      kind: "provider_result",
      intentId: intent.intentId,
      eventId: providerEventId,
      resultEvidenceId,
      at: now,
    });
    if (!providerResult.ok) throw new Error(`simulation provider result refused: ${providerResult.reason}`);
    intent = providerResult.intent;
    await ctx.db.patch(row._id, { data: intent });

    const verificationEventId = `sim_event_${identity}_verification`;
    const verification = applyRailEvent(intent, {
      kind: "verification_result",
      intentId: intent.intentId,
      eventId: verificationEventId,
      verified: true,
      verificationEvidenceId: `sim_verification_${identity}`,
      at: now,
    });
    if (!verification.ok) throw new Error(`simulation verification refused: ${verification.reason}`);
    intent = verification.intent;
    await ctx.db.patch(row._id, { data: intent });

    // Persist the simulated acquisition result on the objective so the worker
    // read port and the M5 read model can present it truthfully as a
    // simulation. One result per intent; a re-run replaces only its own row.
    const objectiveRows = await ctx.db.query("objectives")
      .withIndex("by_key", (q) => q.eq("key", intent.objectiveKey)).collect();
    const objectiveRow = objectiveRows[0];
    if (!objectiveRow) throw new Error(`objective not found: ${intent.objectiveKey}`);
    const record = objectiveRow.data as {
      key: string;
      acquisitionResults?: ExternalAcquisitionResult[];
      updatedAt: number;
      [key: string]: unknown;
    };
    const result: ExternalAcquisitionResult = {
      intentId: intent.intentId,
      requirementKey: intent.requirementKey,
      contractRevision: intent.contractRevision,
      resultEvidenceId,
      provenance: "simulation",
      providerId: intent.target.providerId ?? "unknown",
      serviceId: intent.target.serviceId ?? "unknown",
      offeringId: intent.target.offeringId ?? "unknown",
      resourceClass: intent.target.resourceClass ?? "unknown",
      content,
      responseHash,
      recordedAt: now,
      verifiedAt: now,
      ...(intent.needDedupeKey
        ? { needDedupeKey: intent.needDedupeKey }
        : {}),
      ...(intent.resourceNeedId
        ? { resourceNeedId: intent.resourceNeedId }
        : {}),
    };
    const acquisitions = (record.acquisitionResults ?? []).filter(
      (existing) => existing.intentId !== intent.intentId,
    );
    // The objectives table stores free-form aggregate data; the patch keeps the
    // whole record and swaps only the acquisition set (same pattern as
    // beginInterpretation's management patch).
    await ctx.db.patch(objectiveRow._id, {
      data: {
        ...record,
        acquisitionResults: [...acquisitions, result],
        updatedAt: now,
      },
    } as never);
    await ctx.db.insert("objectiveEvents", {
      objectiveKey: intent.objectiveKey,
      data: {
        at: now,
        kind: "system" as const,
        text: `SIMULATION: external acquisition verified at the simulated boundary for intent ${intent.intentId} (evidence ${resultEvidenceId}); no provider was contacted and no payment occurred.`,
      },
    });

    // Wake Somebody through the normal path: verification_result on the intent.
    const dedupeKey = `intent:${intent.intentId}:simulation_verified:${identity}`;
    const existingWake = await ctx.db.query("wakeEvents")
      .withIndex("by_dedupe", (q) => q.eq("dedupeKey", dedupeKey)).unique();
    if (!existingWake) {
      const wake: WakeEvent = {
        eventId: `wake_sim_${identity}`,
        objectiveKey: intent.objectiveKey,
        reason: "verification_result" as WakeReason,
        refKind: "intent",
        refId: intent.intentId,
        summary: "SIMULATION: verified external acquisition result recorded at the simulated boundary.",
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
        reason: wake.reason,
      });
    }
    return { verified: true, duplicate: false, resultEvidenceId, intentState: intent.state };
  },
});
