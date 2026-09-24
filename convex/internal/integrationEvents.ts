import { v } from "convex/values";
import { internalMutation } from "../_generated/server";
import {
  appendIntegrationEvent,
  founderMerchantLabelFromOfferingName,
  integrationEventId,
  type IntegrationAction,
  type IntegrationId,
  type PersistedIntegrationEvent,
} from "../../lib/integration/persistedEvents";

const vIntegrationId = v.union(
  v.literal("okx_marketplace"),
  v.literal("okx_agentic_wallet"),
  v.literal("okx_x402"),
  v.literal("x_layer_testnet"),
);

const vIntegrationAction = v.union(
  v.literal("market_search"),
  v.literal("payment_preparing"),
  v.literal("payment_verifying"),
  v.literal("transaction_submitted"),
  v.literal("settlement_confirmed"),
);

const vAmount = v.object({
  amount: v.string(),
  currency: v.string(),
});

async function patchObjectiveEvents(
  ctx: { db: import("../_generated/server").MutationCtx["db"] },
  objectiveKey: string,
  event: PersistedIntegrationEvent,
  at: number,
): Promise<boolean> {
  const row = await ctx.db
    .query("objectives")
    .withIndex("by_key", (q) => q.eq("key", objectiveKey))
    .unique();
  if (!row) return false;
  const data = row.data as Record<string, unknown>;
  const existing = data.integrationEvents as PersistedIntegrationEvent[] | undefined;
  const next = appendIntegrationEvent(existing, event);
  if (next.length === (existing?.length ?? 0)) return false;
  await ctx.db.patch(row._id, {
    data: { ...data, integrationEvents: next, updatedAt: at },
  } as never);
  return true;
}

export const recordMarketSearch = internalMutation({
  args: {
    objectiveKey: v.string(),
    requirementKey: v.string(),
    epochKey: v.string(),
    resourceNeed: v.string(),
    offeringNames: v.array(v.string()),
    at: v.number(),
  },
  returns: v.object({ recorded: v.boolean(), eventId: v.string() }),
  handler: async (ctx, args) => {
    const eventId = integrationEventId({
      integrationId: "okx_marketplace",
      action: "market_search",
      objectiveKey: args.objectiveKey,
      epochKey: args.epochKey,
    });
    const event: PersistedIntegrationEvent = {
      id: eventId,
      objectiveKey: args.objectiveKey,
      integrationId: "okx_marketplace",
      action: "market_search",
      requirementKey: args.requirementKey,
      occurredAt: args.at,
      resourceNeed: args.resourceNeed,
      candidateLabels: args.offeringNames.map(founderMerchantLabelFromOfferingName),
    };
    const recorded = await patchObjectiveEvents(ctx, args.objectiveKey, event, args.at);
    return { recorded, eventId };
  },
});

export const recordPaymentPreparing = internalMutation({
  args: {
    objectiveKey: v.string(),
    intentId: v.string(),
    merchantLabel: v.string(),
    amount: vAmount,
    networkLabel: v.string(),
    at: v.number(),
  },
  returns: v.object({ recorded: v.boolean(), eventId: v.string() }),
  handler: async (ctx, args) => {
    const eventId = integrationEventId({
      integrationId: "okx_agentic_wallet",
      action: "payment_preparing",
      objectiveKey: args.objectiveKey,
      epochKey: args.intentId,
      intentId: args.intentId,
    });
    const event: PersistedIntegrationEvent = {
      id: eventId,
      objectiveKey: args.objectiveKey,
      integrationId: "okx_agentic_wallet",
      action: "payment_preparing",
      intentId: args.intentId,
      occurredAt: args.at,
      merchantLabel: args.merchantLabel,
      amount: args.amount,
      networkLabel: args.networkLabel,
    };
    const recorded = await patchObjectiveEvents(ctx, args.objectiveKey, event, args.at);
    return { recorded, eventId };
  },
});

export const recordXLayerFact = internalMutation({
  args: {
    objectiveKey: v.string(),
    intentId: v.string(),
    action: v.union(v.literal("transaction_submitted"), v.literal("settlement_confirmed")),
    amount: v.optional(vAmount),
    merchantLabel: v.optional(v.string()),
    txHash: v.string(),
    explorerUrl: v.optional(v.union(v.string(), v.null())),
    at: v.number(),
  },
  returns: v.object({ recorded: v.boolean(), eventId: v.string() }),
  handler: async (ctx, args) => {
    const eventId = integrationEventId({
      integrationId: "x_layer_testnet",
      action: args.action,
      objectiveKey: args.objectiveKey,
      epochKey: `${args.intentId}:${args.txHash.toLowerCase()}`,
      intentId: args.intentId,
    });
    const event: PersistedIntegrationEvent = {
      id: eventId,
      objectiveKey: args.objectiveKey,
      integrationId: "x_layer_testnet",
      action: args.action,
      intentId: args.intentId,
      occurredAt: args.at,
      txHash: args.txHash,
      explorerUrl: args.explorerUrl ?? null,
      ...(args.amount ? { amount: args.amount } : {}),
      ...(args.merchantLabel ? { merchantLabel: args.merchantLabel } : {}),
    };
    const recorded = await patchObjectiveEvents(ctx, args.objectiveKey, event, args.at);
    return { recorded, eventId };
  },
});

export const recordGeneric = internalMutation({
  args: {
    objectiveKey: v.string(),
    integrationId: vIntegrationId,
    action: vIntegrationAction,
    epochKey: v.string(),
    intentId: v.optional(v.string()),
    requirementKey: v.optional(v.string()),
    resourceNeed: v.optional(v.string()),
    candidateLabels: v.optional(v.array(v.string())),
    merchantLabel: v.optional(v.string()),
    amount: v.optional(vAmount),
    networkLabel: v.optional(v.string()),
    txHash: v.optional(v.string()),
    explorerUrl: v.optional(v.union(v.string(), v.null())),
    at: v.number(),
  },
  returns: v.object({ recorded: v.boolean(), eventId: v.string() }),
  handler: async (ctx, args) => {
    const eventId = integrationEventId({
      integrationId: args.integrationId as IntegrationId,
      action: args.action as IntegrationAction,
      objectiveKey: args.objectiveKey,
      epochKey: args.epochKey,
      intentId: args.intentId ?? null,
    });
    const event: PersistedIntegrationEvent = {
      id: eventId,
      objectiveKey: args.objectiveKey,
      integrationId: args.integrationId as IntegrationId,
      action: args.action as IntegrationAction,
      occurredAt: args.at,
      intentId: args.intentId ?? null,
      requirementKey: args.requirementKey ?? null,
      resourceNeed: args.resourceNeed ?? null,
      candidateLabels: args.candidateLabels,
      merchantLabel: args.merchantLabel ?? null,
      amount: args.amount ?? null,
      networkLabel: args.networkLabel ?? null,
      txHash: args.txHash ?? null,
      explorerUrl: args.explorerUrl ?? null,
    };
    const recorded = await patchObjectiveEvents(ctx, args.objectiveKey, event, args.at);
    return { recorded, eventId };
  },
});
