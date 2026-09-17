import { v } from "convex/values";
import { internalMutation, internalQuery } from "./_generated/server";
import { assertDevelopment } from "./environment";
import { hydrateMission } from "../lib/procurement/fixtures";
import type { Mission } from "../lib/procurement/types";

const receiptValidator = v.object({
  id: v.string(),
  key: v.string(),
  endpointRef: v.string(),
  payload: v.string(),
  provider: v.union(v.literal("whatsapp"), v.literal("instagram")),
  accountId: v.string(),
  chatId: v.string(),
  providerMessageId: v.string(),
  text: v.string(),
  createdAt: v.number(),
});

export const getReceipt = internalQuery({
  args: { effectKey: v.string() },
  returns: v.union(receiptValidator, v.null()),
  handler: async (ctx, args) => {
    const row = await ctx.db
      .query("unipileReceipts")
      .withIndex("by_key", (q) => q.eq("key", args.effectKey))
      .unique();
    if (!row) return null;
    return {
      id: row._id,
      key: row.key,
      endpointRef: row.endpointRef,
      payload: row.payload,
      provider: row.provider,
      accountId: row.accountId,
      chatId: row.chatId,
      providerMessageId: row.providerMessageId,
      text: row.text,
      createdAt: row.createdAt,
    };
  },
});

export const seenInbound = internalQuery({
  args: { providerMessageId: v.string() },
  returns: v.boolean(),
  handler: async (ctx, args) => {
    const row = await ctx.db
      .query("unipileInbound")
      .withIndex("by_providerMessageId", (q) =>
        q.eq("providerMessageId", args.providerMessageId),
      )
      .unique();
    return row !== null;
  },
});

export const findVendorMission = internalQuery({
  args: { endpointRef: v.string() },
  returns: v.union(
    v.object({ key: v.string(), vendorId: v.string() }),
    v.null(),
  ),
  handler: async (ctx, args) => {
    const rows = await ctx.db.query("missions").order("desc").take(40);
    for (const row of rows) {
      const mission = hydrateMission(row.data as Mission);
      if (mission.state === "complete") continue;
      const vendor = mission.vendors.find(
        (item) => item.endpointRef === args.endpointRef,
      );
      if (vendor) return { key: mission.key, vendorId: vendor.id };
    }
    return null;
  },
});

export const recordInbound = internalMutation({
  args: {
    providerMessageId: v.string(),
    provider: v.union(v.literal("whatsapp"), v.literal("instagram")),
    accountId: v.string(),
    chatId: v.string(),
    observedAt: v.number(),
    status: v.union(
      v.literal("ignored_own"),
      v.literal("rejected"),
      v.literal("duplicate"),
      v.literal("ingested"),
    ),
    reason: v.string(),
    missionKey: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    assertDevelopment();
    const existing = await ctx.db
      .query("unipileInbound")
      .withIndex("by_providerMessageId", (q) =>
        q.eq("providerMessageId", args.providerMessageId),
      )
      .unique();
    if (existing) return null;
    await ctx.db.insert("unipileInbound", {
      providerMessageId: args.providerMessageId,
      provider: args.provider,
      accountId: args.accountId,
      chatId: args.chatId,
      observedAt: args.observedAt,
      receivedAt: Date.now(),
      status: args.status,
      reason: args.reason,
      missionKey: args.missionKey,
    });
    return null;
  },
});

export const storeReceipt = internalMutation({
  args: {
    key: v.string(),
    endpointRef: v.string(),
    payload: v.string(),
    provider: v.union(v.literal("whatsapp"), v.literal("instagram")),
    accountId: v.string(),
    chatId: v.string(),
    providerMessageId: v.string(),
    text: v.string(),
  },
  returns: v.string(),
  handler: async (ctx, args) => {
    assertDevelopment();
    const previous = await ctx.db
      .query("unipileReceipts")
      .withIndex("by_key", (q) => q.eq("key", args.key))
      .unique();
    if (previous) return previous._id;
    return await ctx.db.insert("unipileReceipts", {
      ...args,
      createdAt: Date.now(),
    });
  },
});
