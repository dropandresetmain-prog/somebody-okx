import OpenAI from "openai";
import type { Quote } from "../procurement/types";
import {
  sanitizePartialQuote,
  type ClaimExtractionContext,
  type ClaimExtractionResult,
  normalizeSupplierClaims,
  resolveTimeZone,
  stripClaimsTrailer,
} from "./claims";

function modelConfig(env: Record<string, string | undefined>) {
  const provider = env.AI_PROVIDER ?? "openrouter";
  if (provider !== "openrouter" && provider !== "openai") return null;
  const apiKey =
    provider === "openrouter" ? env.OPENROUTER_API_KEY : env.OPENAI_API_KEY;
  const model = env.AI_MODEL;
  if (!apiKey?.trim() || !model?.trim()) return null;
  return {
    provider,
    apiKey: apiKey.trim(),
    model: model.trim(),
    baseURL:
      provider === "openrouter" ? "https://openrouter.ai/api/v1" : undefined,
  };
}

/**
 * Bounded structured extraction via the existing OpenRouter/OpenAI stack.
 * Returns only schema-valid Partial<Quote> fields; inventing is instructed against
 * and sanitized again after parse.
 */
export async function extractClaimsViaModel(
  text: string,
  context: ClaimExtractionContext,
  env: Record<string, string | undefined> = process.env,
): Promise<Partial<Quote>> {
  const config = modelConfig(env);
  if (!config) throw new Error("Model credentials are not configured");

  const client = new OpenAI({
    apiKey: config.apiKey,
    baseURL: config.baseURL,
  });
  const timeZone = resolveTimeZone(context.timeZone, env);
  const deadlineHint = context.deadlineAt
    ? `Mission hard deadline epoch ms: ${context.deadlineAt} (${new Date(context.deadlineAt).toISOString()}).`
    : "Mission deadline is unknown.";
  const completion = await client.chat.completions.create({
    model: config.model,
    temperature: 0,
    response_format: { type: "json_object" },
    messages: [
      {
        role: "system",
        content: `You extract procurement quote claims from a supplier chat message for Somebody.
Return JSON only with any of these optional keys: unitCents, setupCents, deliveryCents, taxCents, quantity, moq, stock, deliveryAt, branded, currency.
Rules:
- Include a field only when the supplier message explicitly supports it.
- Money fields are integer cents (e.g. $18 → 1800).
- deliveryAt is epoch milliseconds (UTC instant). Interpret weekday/time phrases such as "Thursday morning" or "Friday afternoon" in the procurement timezone ${timeZone} (not UTC wall clock). Example: Thursday morning in Asia/Singapore is 09:00+08:00 that Thursday.
- branded is boolean only when branding/logo/printing availability is stated.
- currency is a 3-letter code only when named (SGD, USD, …). Do not invent SGD from "$" alone.
- Never invent zero fees, stock, MOQ, delivery dates, branding, quantity, or currency.
- If nothing can be extracted, return {}.
Procurement timezone: ${timeZone}.
${deadlineHint}
Message source time epoch ms: ${context.referenceAt}.`,
      },
      { role: "user", content: text.slice(0, 1500) },
    ],
  });
  const content = completion.choices[0]?.message?.content?.trim() ?? "{}";
  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch {
    throw new Error("Model returned non-JSON claim payload");
  }
  return sanitizePartialQuote(parsed);
}

/**
 * Live normalize: trailer → model (when configured) → natural-language fallback.
 * Empty claims are preserved (no fabrication).
 */
export async function normalizeSupplierClaimsLive(
  text: string,
  context: ClaimExtractionContext,
  env: Record<string, string | undefined> = process.env,
): Promise<ClaimExtractionResult> {
  const scoped: ClaimExtractionContext = {
    ...context,
    timeZone: resolveTimeZone(context.timeZone, env),
  };
  const sync = normalizeSupplierClaims(text, scoped);
  if (sync.path === "trailer") return sync;

  const display = stripClaimsTrailer(text.trim()).slice(0, 1500) || text.trim().slice(0, 1500);
  if (!modelConfig(env)) return sync;

  try {
    const claims = await extractClaimsViaModel(display, scoped, env);
    if (Object.keys(claims).length > 0)
      return { claims, path: "model", text: display };
    // Model found nothing — keep deterministic NL result (may also be empty).
    return sync;
  } catch {
    return sync;
  }
}
