import { v } from "convex/values";
import { mutation } from "./_generated/server";
import { internal } from "./_generated/api";

function authorize(driverToken: string): void {
  const expected = process.env.M4_M3_DRIVER_TOKEN;
  if (!expected || driverToken !== expected) throw new Error("M4×M3 local driver is not authorized");
}

export const recordPaymentPreparingFromDriver = mutation({
  args: {
    driverToken: v.string(),
    objectiveKey: v.string(),
    intentId: v.string(),
    merchantLabel: v.string(),
    amount: v.object({ amount: v.string(), currency: v.string() }),
    networkLabel: v.string(),
    at: v.number(),
  },
  returns: v.object({ recorded: v.boolean() }),
  handler: async (ctx, args): Promise<{ recorded: boolean }> => {
    authorize(args.driverToken);
    const result: { recorded: boolean } = await ctx.runMutation(
      internal.internal.integrationEvents.recordPaymentPreparing,
      {
      objectiveKey: args.objectiveKey,
      intentId: args.intentId,
      merchantLabel: args.merchantLabel,
      amount: args.amount,
      networkLabel: args.networkLabel,
      at: args.at,
      },
    );
    return { recorded: result.recorded };
  },
});

export const recordSettlementFromDriver = mutation({
  args: {
    driverToken: v.string(),
    objectiveKey: v.string(),
    intentId: v.string(),
    txHash: v.string(),
    amount: v.optional(v.object({ amount: v.string(), currency: v.string() })),
    at: v.number(),
  },
  returns: v.object({ recorded: v.boolean() }),
  handler: async (ctx, args): Promise<{ recorded: boolean }> => {
    authorize(args.driverToken);
    const result: { recorded: boolean; eventId: string } = await ctx.runMutation(
      internal.internal.integrationEvents.recordXLayerFact,
      {
      objectiveKey: args.objectiveKey,
      intentId: args.intentId,
      action: "settlement_confirmed",
      txHash: args.txHash,
      amount: args.amount,
      at: args.at,
      },
    );
    return { recorded: result.recorded };
  },
});
