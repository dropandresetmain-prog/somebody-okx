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
 * Assumed raw-response shape from the Newsliquid search endpoint.
 * Each entry represents a piece of social content returned by the provider.
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
 */
function buildRequestParams(input: {
  offering: MarketOffering;
  need: ResourceNeed;
}): {
  endpoint: string;
  params: {
    offeringId: string;
    serviceId: string;
    topic: string;
    limit: number;
  };
} {
  return {
    endpoint: "twitter_search",
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
function normalizeResponse(
  raw: unknown,
  ctx?: {
    offeringId?: string;
    serviceId?: string;
    idempotencyKey?: string;
  },
): ExternalResourceResult {
  const resp = raw as NewsliquidRawResponse;
  if (!resp || !Array.isArray(resp.results)) {
    throw new Error("newsliquid: invalid raw response — expected { results: [...] }");
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
