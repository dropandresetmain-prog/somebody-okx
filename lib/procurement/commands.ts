import { z } from "zod";
const vendorId = z
  .string()
  .trim()
  .min(1)
  .max(64)
  .regex(/^[a-zA-Z0-9_-]+$/);
const text = z.string().trim().min(1).max(1500);
const quoteClaims = z
  .object({
    unitCents: z.number().int().optional(),
    setupCents: z.number().int().optional(),
    deliveryCents: z.number().int().optional(),
    taxCents: z.number().int().optional(),
    quantity: z.number().int().optional(),
    moq: z.number().int().optional(),
    stock: z.number().int().optional(),
    deliveryAt: z.number().int().optional(),
    branded: z.boolean().optional(),
    currency: z.string().optional(),
  })
  .strict();
const provenance = z
  .object({
    provider: z.enum(["fixture", "web", "gmail", "whatsapp", "instagram"]),
    channel: z.enum(["Web", "Gmail", "WhatsApp", "Instagram"]),
    observationId: z.string().trim().min(1).max(200),
    parentId: z.string().trim().min(1).max(200).optional(),
    url: z.string().trim().max(2000).optional(),
    observedAt: z.number().int().positive(),
    retrievedAt: z.number().int().positive().optional(),
    sourceLabel: z.string().trim().min(1).max(200).optional(),
  })
  .strict();
const evidenceInput = z
  .object({
    vendorId,
    source: text,
    authority: z.enum(["catalogue", "vendor"]),
    revision: z.number().int().min(1),
    observedAt: z.number().int().positive(),
    text,
    claims: quoteClaims,
    provenance,
  })
  .strict();
export const agentCommandSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("ask_requirements"), question: text }).strict(),
  z.object({ type: z.literal("request_quote"), vendorId }).strict(),
  z
    .object({ type: z.literal("clarify_quote"), vendorId, question: text })
    .strict(),
  z
    .object({ type: z.literal("recommend"), vendorId, rationale: text })
    .strict(),
  z
    .object({ type: z.literal("record_no_viable_option"), reason: text })
    .strict(),
  z.object({ type: z.literal("execute_effect"), effectKey: text }).strict(),
  z.object({ type: z.literal("verify_effect"), effectKey: text }).strict(),
  z.object({ type: z.literal("complete_mission") }).strict(),
]);
export const commandSchema = z.union([
  agentCommandSchema,
  z.discriminatedUnion("type", [
    z
      .object({
        type: z.literal("create"),
        key: z.string().regex(/^[a-zA-Z0-9-]{1,80}$/),
        request: text,
      })
      .strict(),
    z
      .object({
        type: z.literal("answer_requirements"),
        quantity: z.number().int().min(1).max(1000),
        budgetCents: z.number().int().positive().max(10000000),
        deadlineAt: z.number().int().positive(),
        branded: z.boolean(),
      })
      .strict(),
    z
      .object({
        type: z.literal("approve"),
        recommendationVersion: z.number().int().positive(),
      })
      .strict(),
    z
      .object({
        type: z.literal("reject"),
        recommendationVersion: z.number().int().positive(),
      })
      .strict(),
    z
      .object({
        type: z.literal("ingest_external_evidence"),
        evidence: evidenceInput,
      })
      .strict(),
    z
      .object({
        type: z.literal("ingest_fixture_observation"),
        vendorId,
        stage: z.enum(["initial", "clarification", "update"]),
      })
      .strict(),
    z.object({ type: z.literal("run_agent") }).strict(),
  ]),
]);
