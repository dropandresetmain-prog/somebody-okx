// V1 PRODUCT COMMANDS — thin governed adapters over existing engine authority.
//
// Wired:
//   - createObjectiveV1
//   - submitAttentionActionV1 (spend approval ONLY)
//
// Other command shapes in app/product/contracts.ts remain reserved / unwired.

import { v } from "convex/values";
import { mutation, type MutationCtx } from "./_generated/server";
import { internal } from "./_generated/api";
import type { ProductCommandResult } from "../app/product/contracts";
import {
  createReceivedObjective,
  normalizeObjectiveRequest,
} from "./objectiveCreate";
import {
  APPROVE_SPEND_ACTION_ID,
  deriveSpendApprovalCandidate,
  formatSpendUsd,
  spendGrantApprovalId,
} from "../lib/product/spendApprovalPolicy";
import type { StatusSource } from "../lib/product/frontendProjection";
import {
  normalizeAssignment,
  normalizeContract,
  normalizeDecision,
  normalizeIntent,
  normalizeObjective,
  normalizeRequirement,
} from "../lib/product/sourceAdapter";

const vMoneyView = v.object({
  amount: v.string(),
  currency: v.string(),
});

const vCreateObjectiveArgs = {
  request: v.string(),
  contextRefs: v.optional(v.array(v.string())),
  advanced: v.optional(
    v.object({
      spendLimit: v.optional(vMoneyView),
      deadline: v.optional(v.string()),
      externalEffectPolicy: v.optional(v.string()),
    }),
  ),
};

const vSubmitAttentionActionArgs = {
  objectiveId: v.string(),
  attentionId: v.string(),
  attentionRevision: v.string(),
  actionId: v.string(),
  text: v.optional(v.string()),
};

const vProductCommandResult = v.union(
  v.object({
    accepted: v.literal(true),
    commandId: v.string(),
    objectiveId: v.string(),
  }),
  v.object({
    accepted: v.literal(false),
    error: v.object({
      code: v.union(
        v.literal("validation_error"),
        v.literal("not_allowed"),
        v.literal("stale_view"),
        v.literal("conflict"),
        v.literal("temporarily_unavailable"),
        v.literal("reconciliation_required"),
      ),
      message: v.string(),
    }),
  }),
);

type RejectCode =
  | "validation_error"
  | "not_allowed"
  | "stale_view"
  | "temporarily_unavailable";

function reject(code: RejectCode, message: string): ProductCommandResult {
  return { accepted: false, error: { code, message } };
}

type AnyRow = { _id: unknown; [k: string]: unknown };
type Loose = Record<string, unknown>;
const dataOf = (row: unknown): Loose => ((row as AnyRow).data ?? {}) as Loose;

async function loadStatusSourceForCommand(
  ctx: MutationCtx,
  objectiveRow: unknown,
): Promise<StatusSource> {
  const objective = normalizeObjective(dataOf(objectiveRow));
  const key = objective.key;
  const [contractRows, requirementRows, assignmentRows, decisionRows, intentRows] =
    await Promise.all([
      ctx.db.query("outcomeContracts").withIndex("by_objective", (q) => q.eq("objectiveKey", key)).collect(),
      ctx.db.query("requirements").withIndex("by_objectiveKey", (q) => q.eq("objectiveKey", key)).collect(),
      ctx.db.query("assignments").withIndex("by_objective", (q) => q.eq("objectiveKey", key)).collect(),
      ctx.db.query("managerialDecisions").withIndex("by_objectiveKey", (q) => q.eq("objectiveKey", key)).collect(),
      ctx.db.query("executionIntents").withIndex("by_objective", (q) => q.eq("objectiveKey", key)).collect(),
    ]);
  return {
    objective,
    contracts: contractRows.map((row) => normalizeContract(dataOf(row))),
    requirements: requirementRows.map((row) => normalizeRequirement(dataOf(row))),
    assignments: assignmentRows.map((row) => normalizeAssignment(dataOf(row))),
    decisions: decisionRows.map((row) => normalizeDecision(dataOf(row))),
    intents: intentRows.map((row) => normalizeIntent(dataOf(row))),
  };
}

/**
 * Product Command: Create Objective (V1).
 *
 * Accepts only `request`. Unsupported optional fields (contextRefs / advanced)
 * are explicitly rejected as not_allowed — they must not silently activate.
 *
 * On success: Objective persistence was accepted. Does NOT claim interpretation,
 * contract creation, work start, or completion.
 */
export const createObjectiveV1 = mutation({
  args: vCreateObjectiveArgs,
  returns: vProductCommandResult,
  handler: async (ctx, args): Promise<ProductCommandResult> => {
    if (args.contextRefs !== undefined) {
      return reject(
        "not_allowed",
        "Context references are not supported on create yet.",
      );
    }
    if (args.advanced !== undefined) {
      return reject(
        "not_allowed",
        "Advanced create options are not supported yet.",
      );
    }

    const normalized = normalizeObjectiveRequest(args.request);
    if (!normalized.ok) {
      return reject("validation_error", normalized.message);
    }

    try {
      const { key } = await createReceivedObjective(ctx, normalized.request);
      return {
        accepted: true,
        commandId: `create:${key}`,
        objectiveId: key,
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : "Objective creation failed";
      // Unexpected persistence/scheduler failures: surface as temporary, not a
      // stack dump. Do not invent a second Objective on retry.
      console.error("createObjectiveV1 failed:", message);
      return reject(
        "temporarily_unavailable",
        "Objective creation is unavailable right now. Try again in a moment.",
      );
    }
  },
});

/**
 * Product Command: Submit Attention Action (V1) — SPEND APPROVAL ONLY.
 *
 * Accepts SubmitAttentionActionCommand. Validates against the shared
 * deriveSpendApprovalCandidate policy, persists a bounded FounderSpendGrant,
 * resolves the exact pending_approval note, writes approval_resolved wake,
 * and schedules the normal management pass.
 *
 * Does NOT: execute payment, create an ExecutionIntent, mark a Requirement
 * satisfied, or support any other attention family.
 */
export const submitAttentionActionV1 = mutation({
  args: vSubmitAttentionActionArgs,
  returns: vProductCommandResult,
  handler: async (ctx, args): Promise<ProductCommandResult> => {
    const objectiveId = typeof args.objectiveId === "string" ? args.objectiveId.trim() : "";
    const attentionId = typeof args.attentionId === "string" ? args.attentionId.trim() : "";
    const attentionRevision =
      typeof args.attentionRevision === "string" ? args.attentionRevision.trim() : "";
    const actionId = typeof args.actionId === "string" ? args.actionId.trim() : "";

    if (!objectiveId || !attentionId || !attentionRevision || !actionId) {
      return reject(
        "validation_error",
        "objectiveId, attentionId, attentionRevision, and actionId are required.",
      );
    }
    if (args.text !== undefined) {
      return reject(
        "not_allowed",
        "Free-text attention responses are not supported yet.",
      );
    }
    if (actionId !== APPROVE_SPEND_ACTION_ID) {
      return reject(
        "not_allowed",
        "Only bounded spend approval is supported for attention actions right now.",
      );
    }

    const objectiveRow = await ctx.db
      .query("objectives")
      .withIndex("by_key", (q) => q.eq("key", objectiveId))
      .unique();
    if (!objectiveRow) {
      return reject("stale_view", "This objective is no longer available.");
    }

    let source: StatusSource;
    try {
      source = await loadStatusSourceForCommand(ctx, objectiveRow);
    } catch (err) {
      const message = err instanceof Error ? err.message : "load failed";
      console.error("submitAttentionActionV1 load failed:", message);
      return reject(
        "temporarily_unavailable",
        "Spend approval is unavailable right now. Try again in a moment.",
      );
    }

    const candidate = deriveSpendApprovalCandidate(source);
    if (!candidate) {
      // Distinguish unsupported current approvals from stale/already-resolved.
      const contract =
        [...source.contracts].sort((a, b) => b.revision - a.revision)[0] ?? null;
      const revision = contract?.revision ?? null;
      if (revision !== null) {
        const activeKeys = new Set(
          source.requirements
            .filter((req) => req.contractRevision === revision && req.state === "active")
            .map((req) => req.requirementKey),
        );
        const currentApproval = source.decisions
          .filter(
            (row) =>
              row.contractRevision === revision &&
              (row.kind === "satisfaction_strategy" || row.kind === "escalation") &&
              activeKeys.has(row.requirementKey) &&
              row.authorization.kind === "approval_required",
          )
          .sort(
            (a, b) =>
              b.at - a.at || (a.decisionId < b.decisionId ? 1 : a.decisionId > b.decisionId ? -1 : 0),
          )[0];
        if (
          currentApproval &&
          currentApproval.decisionId === attentionId &&
          `${currentApproval.decisionId}:${currentApproval.at}` === attentionRevision &&
          currentApproval.authorization.kind === "approval_required" &&
          currentApproval.authorization.reason !== "spend_authority_required"
        ) {
          return reject(
            "not_allowed",
            "This approval type is not actionable from the product surface yet.",
          );
        }
      }
      return reject(
        "stale_view",
        "This approval is no longer current. Refresh and try again if Somebody still needs you.",
      );
    }

    if (
      candidate.attentionId !== attentionId ||
      candidate.attentionRevision !== attentionRevision
    ) {
      return reject(
        "stale_view",
        "This approval is no longer current. Refresh and try again if Somebody still needs you.",
      );
    }

    const at = Date.now();
    const decisionAt = Number(candidate.attentionRevision.split(":").slice(-1)[0] ?? 0);
    const approvalId = spendGrantApprovalId(candidate.decisionId, decisionAt);
    const amountLabel = formatSpendUsd(candidate.priceUsd);
    const commandId = `attention:${APPROVE_SPEND_ACTION_ID}:${approvalId}`;

    try {
      // 1. Persist bounded founder spend grant (deterministic approvalId).
      await ctx.runMutation(internal.internal.workforce.putSpendGrant, {
        approvalId,
        objectiveKey: objectiveId,
        limitUsd: candidate.priceUsd,
        at,
        note: `Founder approved bounded spend from Product Attention ${candidate.decisionId}`,
      });

      // 2. Resolve ONLY the matching pending_approval note.
      const row = await ctx.db
        .query("objectives")
        .withIndex("by_key", (q) => q.eq("key", objectiveId))
        .unique();
      if (!row) {
        return reject("stale_view", "This objective is no longer available.");
      }
      const data = (row as AnyRow).data as Record<string, unknown>;
      const mgmt = (data.management ?? {}) as Record<string, unknown>;
      const notes = [...((mgmt.controlNotes ?? []) as Array<Record<string, unknown>>)];
      let removed = false;
      const nextNotes = notes.filter((note) => {
        if (note.type !== "pending_approval") return true;
        const matches =
          String(note.question ?? "") === candidate.pendingApprovalQuestion &&
          Number(note.at ?? 0) === candidate.pendingApprovalAt;
        if (!removed && matches) {
          removed = true;
          return false;
        }
        return true;
      });
      if (!removed) {
        // Race / replay: pending note already cleared — treat as stale.
        return reject(
          "stale_view",
          "This approval is no longer current. Refresh and try again if Somebody still needs you.",
        );
      }
      await ctx.db.patch(row._id as never, {
        data: {
          ...data,
          updatedAt: at,
          management: {
            ...mgmt,
            contractId: (mgmt.contractId as string | null) ?? null,
            controlNotes: nextNotes,
          },
        },
      } as never);

      // 3. Durable approval_resolved wake (dedupe by grant identity).
      const eventId = `wake:approval_resolved:${approvalId}`;
      const dedupeKey = `approval_resolved:${approvalId}`;
      await ctx.runMutation(internal.internal.workforce.appendWakeEvent, {
        eventId,
        objectiveKey: objectiveId,
        dedupeKey,
        data: {
          eventId,
          objectiveKey: objectiveId,
          reason: "approval_resolved",
          refKind: "approval",
          refId: approvalId,
          summary: `Founder granted bounded spend authority of USD ${amountLabel}.`,
          at,
          consumedAt: null,
        },
      });

      // 4. Resume through the existing manager — no direct payment / intent.
      await ctx.scheduler.runAfter(0, internal.management.runManagementPass, {
        objectiveKey: objectiveId,
        reason: "approval_resolved",
      });

      return {
        accepted: true,
        commandId,
        objectiveId,
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : "spend approval failed";
      console.error("submitAttentionActionV1 failed:", message);
      return reject(
        "temporarily_unavailable",
        "Spend approval is unavailable right now. Try again in a moment.",
      );
    }
  },
});
