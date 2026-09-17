import { v } from "convex/values";
const nullableNumber = v.union(v.number(), v.null());
const nullableString = v.union(v.string(), v.null());
export const quote = v.object({
  unitCents: v.optional(v.number()),
  setupCents: v.optional(v.number()),
  deliveryCents: v.optional(v.number()),
  taxCents: v.optional(v.number()),
  quantity: v.optional(v.number()),
  moq: v.optional(v.number()),
  stock: v.optional(v.number()),
  deliveryAt: v.optional(v.number()),
  branded: v.optional(v.boolean()),
  currency: v.optional(v.string()),
});
export const provenance = v.object({
  provider: v.union(
    v.literal("fixture"),
    v.literal("web"),
    v.literal("gmail"),
    v.literal("whatsapp"),
    v.literal("instagram"),
  ),
  channel: v.union(
    v.literal("Web"),
    v.literal("Gmail"),
    v.literal("WhatsApp"),
    v.literal("Instagram"),
  ),
  observationId: v.string(),
  parentId: v.optional(v.string()),
  url: v.optional(v.string()),
  observedAt: v.number(),
  retrievedAt: v.optional(v.number()),
  sourceLabel: v.optional(v.string()),
});
export const effect = v.object({
  key: v.string(),
  kind: v.union(
    v.literal("rfq"),
    v.literal("clarification"),
    v.literal("confirmation"),
    v.literal("rejection"),
    v.literal("purchase_order"),
  ),
  targetId: v.string(),
  endpointRef: v.string(),
  payload: v.string(),
  gated: v.boolean(),
  approvalVersion: nullableNumber,
  status: v.union(
    v.literal("pending"),
    v.literal("attempted"),
    v.literal("unverified"),
    v.literal("verified"),
  ),
  attempts: v.number(),
  receiptId: nullableString,
  verifiedAt: nullableNumber,
});
const evaluation = v.object({
  status: v.union(
    v.literal("waiting"),
    v.literal("needs_clarification"),
    v.literal("eligible"),
    v.literal("ineligible"),
  ),
  missing: v.array(v.string()),
  conflicts: v.array(v.string()),
  reasons: v.array(v.string()),
  requiredQuantity: v.optional(nullableNumber),
  orderQuantity: v.optional(nullableNumber),
  totalCents: nullableNumber,
  quote,
  currentEvidenceIds: v.array(v.string()),
  supersededEvidenceIds: v.array(v.string()),
  supersededClaims: v.optional(
    v.array(v.object({ evidenceId: v.string(), fields: v.array(v.string()) })),
  ),
});
const ranking = v.object({
  evidenceVersion: v.number(),
  rankedVendorIds: v.array(v.string()),
  topVendorId: nullableString,
  noViableOption: v.boolean(),
  incompleteVendorIds: v.array(v.string()),
});
export const mission = v.object({
  key: v.string(),
  title: v.string(),
  request: v.string(),
  createdAt: v.number(),
  updatedAt: v.number(),
  state: v.union(
    v.literal("clarifying"),
    v.literal("sourcing"),
    v.literal("awaiting_approval"),
    v.literal("approved"),
    v.literal("verifying"),
    v.literal("blocked"),
    v.literal("complete"),
  ),
  requirements: v.object({
    quantity: nullableNumber,
    budgetCents: nullableNumber,
    deadlineAt: nullableNumber,
    branded: v.union(v.boolean(), v.null()),
  }),
  question: nullableString,
  activity: v.string(),
  evidenceVersion: v.number(),
  accountingEndpointRef: v.optional(v.string()),
  recommendationCounter: v.number(),
  vendors: v.array(
    v.object({
      id: v.string(),
      name: v.string(),
      channel: v.union(
        v.literal("Web"),
        v.literal("Gmail"),
        v.literal("WhatsApp"),
        v.literal("Instagram"),
      ),
      product: v.string(),
      endpointRef: v.string(),
      contacted: v.optional(v.boolean()),
      communication: v.optional(
        v.union(
          v.literal("none"),
          v.literal("pending"),
          v.literal("attempted"),
          v.literal("unverified"),
          v.literal("verified"),
        ),
      ),
      evaluation,
    }),
  ),
  evidence: v.array(
    v.object({
      id: v.string(),
      vendorId: v.string(),
      source: v.string(),
      authority: v.union(v.literal("catalogue"), v.literal("vendor")),
      revision: v.number(),
      observedAt: v.number(),
      text: v.string(),
      claims: quote,
      provenance: v.optional(provenance),
    }),
  ),
  effects: v.array(effect),
  recommendation: v.union(
    v.object({
      vendorId: v.string(),
      version: v.number(),
      evidenceVersion: v.number(),
      totalCents: v.number(),
      orderQuantity: v.optional(v.number()),
      rationale: v.string(),
    }),
    v.null(),
  ),
  ranking: v.optional(ranking),
  noViableOption: v.optional(
    v.union(
      v.object({
        evidenceVersion: v.number(),
        reason: v.string(),
      }),
      v.null(),
    ),
  ),
  approvals: v.array(
    v.object({
      version: v.number(),
      recommendationVersion: v.number(),
      evidenceVersion: v.number(),
      vendorId: v.string(),
      decision: v.union(v.literal("approved"), v.literal("rejected")),
      at: v.number(),
    }),
  ),
  run: v.union(
    v.object({
      id: v.string(),
      status: v.union(
        v.literal("running"),
        v.literal("stopped"),
        v.literal("failed"),
      ),
      startedAt: v.number(),
      leaseUntil: v.number(),
      model: v.string(),
      toolCalls: v.number(),
      summary: v.string(),
    }),
    v.null(),
  ),
});
export const event = v.object({
  at: v.number(),
  kind: v.union(
    v.literal("agent"),
    v.literal("evidence"),
    v.literal("decision"),
    v.literal("effect"),
    v.literal("system"),
  ),
  text: v.string(),
});
export const receipt = v.object({
  key: v.string(),
  endpointRef: v.string(),
  payload: v.string(),
  createdAt: v.number(),
});
