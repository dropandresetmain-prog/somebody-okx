/**
 * Newsliquid ("OpenNews Twitter Search") product / fulfillment-scope
 * declaration — the REAL live OKX x402 mainnet provider (X Layer, network
 * eip155:196), confirmed live via an unauthenticated GET returning a
 * spec-compliant 402 PAYMENT-REQUIRED challenge.
 *
 * Mirrors the m3FounderNarrativeProduct.ts contract (same exported
 * shape/function signatures) so lib/providers/executionCapability.ts can use
 * this product the same way it uses the M3 controlled-test-merchant product.
 * Distinct from M3: Newsliquid is a real external provider, not a
 * Somebody-controlled test merchant, and its purpose scope is
 * EXTERNAL_SOCIAL_INTELLIGENCE_PURPOSE_KIND (live platform data), never
 * FOUNDER_MESSAGING_QUALITATIVE_PURPOSE_KIND (synthetic qualitative research).
 *
 * This file declares FULFILLMENT SCOPE and validates REQUESTED PURPOSE. It
 * performs no network I/O and does not sign, send, or execute any payment.
 */

import { EXTERNAL_SOCIAL_INTELLIGENCE_PURPOSE_KIND } from "../workforce/catalog";

export const NEWSLIQUID_PROVIDER_ID = "2135" as const;
export const NEWSLIQUID_SERVICE_ID = "newsliquid_twitter_search" as const;
export const NEWSLIQUID_OFFERING_ID =
  "2135:newsliquid_twitter_search" as const;
export const NEWSLIQUID_RESOURCE_CLASS = "proprietary_data" as const;

/**
 * Adapter fulfillment declaration for this product's single purpose kind.
 * References the application-owned catalog vocabulary; does not own that
 * vocabulary and does not grant application request authority.
 */
export const NEWSLIQUID_SUPPORTED_PURPOSE_KIND =
  EXTERNAL_SOCIAL_INTELLIGENCE_PURPOSE_KIND;

export type NewsliquidSupportedPurposeKind =
  typeof NEWSLIQUID_SUPPORTED_PURPOSE_KIND;

/**
 * Adapter-owned structured fulfillment scope for newsliquid_twitter_search.
 * This — not model or worker prose — is the fulfillment authority: the exact
 * governed ResourceClass the product may supply and the exact typed purpose
 * kinds it may fulfill. Grounding, execution capability, and acquisition
 * writeback all verify against this declaration.
 */
export const NEWSLIQUID_FULFILLMENT_SCOPE = {
  serviceId: NEWSLIQUID_SERVICE_ID,
  resourceClasses: [NEWSLIQUID_RESOURCE_CLASS] as const,
  purposeKinds: [NEWSLIQUID_SUPPORTED_PURPOSE_KIND] as const,
} as const;

export const NEWSLIQUID_PURPOSE_MAX_LENGTH = 500;
export function normalizeNewsliquidPurpose(
  purpose: string | null | undefined,
): string {
  return (purpose ?? "").trim().slice(0, NEWSLIQUID_PURPOSE_MAX_LENGTH).trim();
}

export type NewsliquidMerchantProductRequest = {
  resourceClass: string | null;
  serviceId: string | null;
  offeringId: string | null;
  purpose: string | null;
  purposeKind: string | null;
  requestId: string | null;
};

export type NewsliquidProtectedErrorCode =
  | "unsupported_product_scope"
  | "incomplete_product_request"
  | "payment_required";

/**
 * Deterministic, NEGATION-AWARE out-of-scope claim detection, mirroring the
 * M3 product's contract. Prose can only REFUSE: an affirmative claim of
 * delivery this product does not sell is out of scope even under a correct
 * kind; negated phrasing ("do not infer causal uplift") is a disclaimer.
 */
const OUT_OF_SCOPE_CLAIM_PHRASES: readonly string[] = [
  "conversion rate",
  "conversion uplift",
  "a/b test",
  "causal",
  "attribution",
  "statistically significant",
  "p-value",
  "synthetic",
  "simulated",
  "customer analytics",
  "revenue forecast",
  "price of bitcoin",
  "financial market",
  "stock price",
];

const NEGATION_CUE =
  /(?:\b(?:not|no|nor|never|without|cannot|can'?t|avoid\w*|exclude\w*|disclaim\w*|refrain\w*|lack\w*)\b|free of)/;

export function affirmativelyClaimsOutOfScopePhrase(
  loweredPurpose: string,
): string | null {
  for (const phrase of OUT_OF_SCOPE_CLAIM_PHRASES) {
    let searchFrom = 0;
    for (;;) {
      const at = loweredPurpose.indexOf(phrase, searchFrom);
      if (at === -1) break;
      searchFrom = at + phrase.length;
      let clauseStart = 0;
      for (const separator of [".", ";", "!", "?", "\n", ",", "—"]) {
        const idx = loweredPurpose.lastIndexOf(separator, at - 1);
        if (idx + 1 > clauseStart) clauseStart = idx + 1;
      }
      const clause = loweredPurpose.slice(clauseStart, at);
      if (NEGATION_CUE.test(clause)) continue; // disclaimer context, not claim
      return phrase;
    }
  }
  return null;
}

/**
 * Deterministic purpose compatibility for this product, mirroring
 * m3FounderNarrativeProduct.ts's resolveSupportedPurposeKind contract exactly
 * (same fail-closed semantics): authority is the STRUCTURED purpose kind
 * only. A request with no typed kind is incomplete — free text is
 * descriptive context and is never scraped for "in-scope" keywords. Prose
 * can only REFUSE.
 */
export function resolveSupportedPurposeKind(
  request: NewsliquidMerchantProductRequest,
):
  | { ok: true; purposeKind: NewsliquidSupportedPurposeKind; purpose: string }
  | { ok: false; error: NewsliquidProtectedErrorCode; detail: string } {
  const purpose = normalizeNewsliquidPurpose(request.purpose);
  if (!purpose) {
    return {
      ok: false,
      error: "incomplete_product_request",
      detail:
        "newsliquid_twitter_search requires a bounded purpose describing the live social-intelligence research question",
    };
  }

  const explicitKind = request.purposeKind?.trim() ?? "";
  if (explicitKind && explicitKind !== NEWSLIQUID_SUPPORTED_PURPOSE_KIND) {
    return {
      ok: false,
      error: "unsupported_product_scope",
      detail: `purposeKind ${explicitKind.slice(0, 120)} is outside external_social_intelligence scope`,
    };
  }

  const claim = affirmativelyClaimsOutOfScopePhrase(purpose.toLowerCase());
  if (claim) {
    return {
      ok: false,
      error: "unsupported_product_scope",
      detail: `requested purpose requires ${claim}, which newsliquid_twitter_search does not sell`,
    };
  }

  // No structured kind: incomplete. Prose is never scraped for acceptance.
  if (!explicitKind) {
    return {
      ok: false,
      error: "incomplete_product_request",
      detail:
        "newsliquid_twitter_search requires a structured purposeKind; free-text purpose is descriptive context, not scope authority",
    };
  }

  return { ok: true, purposeKind: NEWSLIQUID_SUPPORTED_PURPOSE_KIND, purpose };
}
