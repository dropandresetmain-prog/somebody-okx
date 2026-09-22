// V1 PRODUCT COMMANDS — thin governed adapters over existing engine authority.
//
// This milestone wires ONLY Create Objective. Other command shapes in
// app/product/contracts.ts remain reserved and unwired.

import { v } from "convex/values";
import { mutation } from "./_generated/server";
import type { ProductCommandResult } from "../app/product/contracts";
import {
  createReceivedObjective,
  normalizeObjectiveRequest,
} from "./objectiveCreate";

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

function reject(
  code: "validation_error" | "not_allowed" | "temporarily_unavailable",
  message: string,
): ProductCommandResult {
  return { accepted: false, error: { code, message } };
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
