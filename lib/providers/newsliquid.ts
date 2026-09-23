/**
 * Newsliquid provider adapter.
 *
 * Normalises purchased social-evidence search results (e.g. OpenNews Twitter Search)
 * into the generic ExternalResourceResult contract.
 *
 * NO paid calls, NO network, NO founder credentials. Fixture/offline only.
 */

import type { MarketOffering } from "../market/discovery";
import type { ResourceNeed } from "../objective/resourceNeed";
import type {
  ExternalResourceResult,
  ExternalResourceEvidence,
  ProviderAdapter,
} from "./types";

/**
 * REAL live endpoint for the Newsliquid ("OpenNews Twitter Search") x402
 * skill on the OKX rail — confirmed live via an unauthenticated GET that
 * returned a spec-compliant HTTP 402 PAYMENT-REQUIRED challenge (header
 * PAYMENT-REQUIRED, base64 JSON, x402Version 2, network eip155:196 = X Layer
 * MAINNET). This module performs NO network call at import time or otherwise;
 * it only declares the shape a caller would need to invoke the live rail.
 */
export const NEWSLIQUID_ENDPOINT_URL =
  "https://x402.6551.io/okx/twitter_search" as const;
export const NEWSLIQUID_ENDPOINT_METHOD = "POST" as const;

/**
 * Assumed raw-response shape from the Newsliquid search endpoint.
 * Each entry represents a piece of social content returned by the provider.
 *
 * BEST-EFFORT / UNVERIFIED: this shape has never been observed from a real
 * paid response (only the unauthenticated 402 challenge has been confirmed
 * live). It is a reasonable guess pending a real paid call, which this task
 * explicitly must not make. normalizeResponse validates structurally and
 * throws on mismatch rather than silently coercing an unknown shape.
 */
export type NewsliquidRawResult = {
  text: string;
  author: string;
  engagement: number;
  url: string;
  createdAt: string; // ISO-8601
};

export type NewsliquidRawResponse = {
  results: NewsliquidRawResult[];
};

/**
 * Build the request parameters for a Newsliquid search from the resource need.
 * The keyword/topic is derived from the need's purpose — no hardcoded conclusions.
 *
 * `endpoint`/`params` are kept for backward compatibility with the existing
 * fixture-only contract; `url`/`method` are the fields a live buyer-rail
 * caller needs to actually address the confirmed-live endpoint. Building this
 * shape performs no network I/O and signs/sends nothing.
 */
function buildRequestParams(input: {
  offering: MarketOffering;
  need: ResourceNeed;
}): {
  endpoint: string;
  url: typeof NEWSLIQUID_ENDPOINT_URL;
  method: typeof NEWSLIQUID_ENDPOINT_METHOD;
  params: {
    offeringId: string;
    serviceId: string;
    topic: string;
    limit: number;
  };
} {
  return {
    endpoint: "twitter_search",
    url: NEWSLIQUID_ENDPOINT_URL,
    method: NEWSLIQUID_ENDPOINT_METHOD,
    params: {
      offeringId: input.offering.offeringId,
      serviceId: input.offering.serviceId,
      topic: input.need.purpose,
      limit: 10,
    },
  };
}

/**
 * Normalise a raw Newsliquid response into the generic ExternalResourceResult.
 * Throws if the raw shape is invalid.
 */
function isValidRawResult(item: unknown): item is NewsliquidRawResult {
  if (!item || typeof item !== "object") return false;
  const r = item as Partial<NewsliquidRawResult>;
  if (typeof r.text !== "string" || r.text.length === 0) return false;
  if (typeof r.author !== "string" || r.author.length === 0) return false;
  if (typeof r.engagement !== "number" || !Number.isFinite(r.engagement)) return false;
  if (typeof r.url !== "string" || r.url.length === 0) return false;
  if (typeof r.createdAt !== "string" || Number.isNaN(new Date(r.createdAt).getTime())) return false;
  return true;
}

function normalizeResponse(
  raw: unknown,
  ctx?: {
    offeringId?: string;
    serviceId?: string;
    idempotencyKey?: string;
  },
): ExternalResourceResult {
  // BEST-EFFORT / UNVERIFIED shape (see NewsliquidRawResponse doc comment):
  // this structural check is defensive — it validates shape and throws on
  // mismatch, and it never silently coerces an unrecognized response into
  // this guessed shape.
  const resp = raw as NewsliquidRawResponse;
  if (!resp || !Array.isArray(resp.results)) {
    throw new Error("newsliquid: invalid raw response — expected { results: [...] }");
  }
  if (!resp.results.every(isValidRawResult)) {
    throw new Error(
      "newsliquid: invalid raw response — one or more results entries did not match the expected (best-effort, unverified) shape { text, author, engagement, url, createdAt }",
    );
  }

  const evidence: ExternalResourceEvidence[] = resp.results.map((item) => ({
    label: `social_post:${item.author}`,
    text: item.text,
    url: item.url,
    observedAt: new Date(item.createdAt).getTime(),
  }));

  return {
    offeringId: ctx?.offeringId ?? "",
    resourceClass: "proprietary_data",
    payload: resp.results,
    evidence,
    retrievedAt: Date.now(),
    provenance: {
      providerId: "newsliquid",
      serviceId: ctx?.serviceId ?? "",
      idempotencyKey: ctx?.idempotencyKey ?? "",
    },
  };
}

export const newsliquidAdapter: ProviderAdapter = {
  providerId: "newsliquid",
  requestShape(input) {
    return buildRequestParams(input);
  },
  normalizeResponse(raw: unknown) {
    return normalizeResponse(raw);
  },
  verificationStrategy:
    "Each evidence entry carries a source url, timestamp (observedAt), and author handle. " +
    "Verification: independently fetch each url and confirm the text content matches, " +
    "the timestamp is consistent, and the author handle is genuine. Cross-check engagement " +
    "metrics against the platform's public counters where available.",
};
