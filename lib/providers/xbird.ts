/**
 * xbird provider adapter.
 *
 * Covers publish + read-back for the xbird Twitter/X automation service.
 * BYOA credentials (authToken + ct0) stay LOCAL and are NEVER included in
 * the returned ExternalResourceResult or provenance (secret boundary).
 *
 * NO paid calls, NO network, NO founder credentials. Fixture/offline only.
 *
 * ─── Remote vs local MCP mode tradeoff ───────────────────────────────────────
 * Remote mode: the publish request is sent to xbird's hosted server which
 *   proxies the X API call. Simpler integration but credentials transit the
 *   xbird server (even if encrypted).
 * Local mode: Twitter calls execute locally via the xbird MCP client; the
 *   xbird server only verifies x402 payment. Credentials never leave the
 *   local environment. More secure but requires local MCP runtime setup.
 * Recommendation: prefer local mode for production; remote mode acceptable
 *   for development/testing with ephemeral credentials.
 */

import type { MarketOffering } from "../market/discovery";
import type { ResourceNeed } from "../objective/resourceNeed";
import type {
  ExternalResourceResult,
  ProviderAdapter,
} from "./types";

/**
 * Assumed raw publish receipt shape from xbird.
 */
export type XbirdPublishReceipt = {
  id: string;
  text: string;
  url: string;
  createdAt: string; // ISO-8601
};

/**
 * Descriptor returned by planReadbackVerification — describes the read-back
 * request that should be made to independently confirm the post exists.
 * This is a pure description, NOT an executed request.
 */
export type ReadbackVerificationDescriptor = {
  method: "GET";
  endpoint: string;
  params: { postId: string; url: string };
  expectedOutcome: string;
};

/**
 * Build the publish request shape.
 *
 * IMPORTANT: BYOA credentials (authToken, ct0) are supplied at call-time by the
 * application layer and MUST NOT appear in the returned request shape, the
 * normalised result, or any persisted state.
 */
function buildPublishRequest(input: {
  offering: MarketOffering;
  need: ResourceNeed;
}): {
  endpoint: string;
  method: "POST";
  body: {
    offeringId: string;
    serviceId: string;
    text: string;
    /** Credentials are referenced by placeholder only — never embedded. */
    credentialsRef: "BYOA_LOCAL";
  };
} {
  return {
    endpoint: "post/create",
    method: "POST",
    body: {
      offeringId: input.offering.offeringId,
      serviceId: input.offering.serviceId,
      text: input.need.purpose,
      credentialsRef: "BYOA_LOCAL",
    },
  };
}

/**
 * Normalise a raw xbird publish receipt into ExternalResourceResult.
 *
 * SECRET BOUNDARY: this function MUST NOT receive, reference, or embed
 * authToken or ct0 credentials. They stay in the application's secure
 * environment and never enter the result.
 */
function normalizePublishReceipt(
  raw: unknown,
  ctx?: {
    offeringId?: string;
    serviceId?: string;
    idempotencyKey?: string;
  },
): ExternalResourceResult {
  const receipt = raw as XbirdPublishReceipt;
  if (!receipt || typeof receipt.id !== "string" || typeof receipt.text !== "string") {
    throw new Error("xbird: invalid publish receipt — expected { id, text, url, createdAt }");
  }

  return {
    offeringId: ctx?.offeringId ?? "",
    resourceClass: "privileged_access",
    payload: {
      postId: receipt.id,
      text: receipt.text,
      url: receipt.url,
      createdAt: receipt.createdAt,
    },
    evidence: [
      {
        label: "published_post",
        text: receipt.text,
        url: receipt.url,
        observedAt: new Date(receipt.createdAt).getTime(),
      },
    ],
    retrievedAt: Date.now(),
    provenance: {
      providerId: "xbird",
      serviceId: ctx?.serviceId ?? "",
      idempotencyKey: ctx?.idempotencyKey ?? "",
    },
  };
}

/**
 * Pure helper: plan the read-back verification for a published post.
 * Returns a descriptor of the verification request — does NOT execute it.
 */
export function planReadbackVerification(
  receipt: XbirdPublishReceipt,
): ReadbackVerificationDescriptor {
  return {
    method: "GET",
    endpoint: "post/read",
    params: { postId: receipt.id, url: receipt.url },
    expectedOutcome:
      "The post with the given id should be retrievable and its text should match the receipt.",
  };
}

export const xbirdAdapter: ProviderAdapter = {
  providerId: "xbird",
  requestShape(input) {
    return buildPublishRequest(input);
  },
  normalizeResponse(raw: unknown) {
    return normalizePublishReceipt(raw);
  },
  verificationStrategy:
    "Independent read-back of the published post by id/url to confirm it exists " +
    "and its content matches the receipt. Use planReadbackVerification() to obtain " +
    "the read-back request descriptor. The post should be publicly retrievable via " +
    "the X platform or xbird's read endpoint.",
};
