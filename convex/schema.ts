import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";
import { mission, event, receipt } from "./validators";

export default defineSchema({
  // A bounded mission aggregate makes evidence, decisions and effects atomic.
  missions: defineTable({ key: v.string(), data: mission }).index("by_key", [
    "key",
  ]),
  missionEvents: defineTable({ missionKey: v.string(), data: event }).index(
    "by_missionKey",
    ["missionKey"],
  ),
  // Independent fixture transport state. Never an external provider success claim.
  fixtureReceipts: defineTable(receipt).index("by_key", ["key"]),
  // Unipile WhatsApp / Instagram outbound receipts (provider message identity).
  unipileReceipts: defineTable({
    key: v.string(),
    endpointRef: v.string(),
    payload: v.string(),
    provider: v.union(v.literal("whatsapp"), v.literal("instagram")),
    accountId: v.string(),
    chatId: v.string(),
    providerMessageId: v.string(),
    text: v.string(),
    createdAt: v.number(),
  })
    .index("by_key", ["key"])
    .index("by_providerMessageId", ["providerMessageId"]),
  // Inbound webhook dedupe / audit. Evidence still flows through ingest_external_evidence.
  unipileInbound: defineTable({
    providerMessageId: v.string(),
    provider: v.union(v.literal("whatsapp"), v.literal("instagram")),
    accountId: v.string(),
    chatId: v.string(),
    observedAt: v.number(),
    receivedAt: v.number(),
    status: v.union(
      v.literal("ignored_own"),
      v.literal("rejected"),
      v.literal("duplicate"),
      v.literal("ingested"),
    ),
    reason: v.string(),
    missionKey: v.optional(v.string()),
  }).index("by_providerMessageId", ["providerMessageId"]),
  healthProbes: defineTable({
    deploymentName: v.string(),
    note: v.string(),
    createdAt: v.number(),
  }),
});
