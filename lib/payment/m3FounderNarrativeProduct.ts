/**
 * Controlled X Layer TESTNET merchant product: founder_narrative_pulse.
 *
 * Purpose-bounded synthetic proprietary-data research for Somebody's canonical
 * founder-messaging question. Not a general fake internet. Not live Twitter /
 * NewsLiquid / conversion / causal data.
 */

import type { ExternalResourceEvidence, ExternalResourceResult } from "../providers/types";
import type { MarketOffering } from "../market/discovery";
import type { ResourceNeed } from "../objective/resourceNeed";

export const M3_PRODUCT_ID = "founder_narrative_pulse" as const;
export const M3_PRODUCT_RESOURCE_CLASS = "proprietary_data" as const;
export const M3_PRODUCT_PROVENANCE = "synthetic_test_provider" as const;
export const M3_PRODUCT_PROVIDER_ID = "somebody_controlled_test" as const;
export const M3_PRODUCT_SERVICE_ID = "founder_narrative_pulse" as const;
export const M3_PRODUCT_OFFERING_ID =
  "somebody_controlled_test:founder_narrative_pulse" as const;

/** Single typed purpose scope this product is authorized to fulfill. */
export const M3_SUPPORTED_PURPOSE_KIND =
  "founder_messaging_qualitative" as const;

export type M3SupportedPurposeKind = typeof M3_SUPPORTED_PURPOSE_KIND;

export const M3_PRODUCT_LIMITATION =
  "Controlled synthetic TESTNET evidence from the Somebody founder_narrative_pulse product. NOT live Twitter, NewsLiquid, customer analytics, or conversion measurement. Does not claim causal attribution or measured conversion uplift.";

/**
 * Stable synthetic research content. Useful for founder-messaging work;
 * explicitly not live platform data.
 */
export const M3_FOUNDER_NARRATIVE_FINDINGS: readonly string[] = [
  "Solo / one-person-company founders describe pain as constantly switching between selling, researching, following up, and doing the actual work.",
  "\"AI manager\" may be interpreted as another dashboard or advisor unless the copy clearly communicates execution and accountability.",
  "Generic \"automate your workflows\" wording reads broad and tool-like.",
  "Concrete outcome and accountability language is easier to understand than generic automation language.",
  "Users value one accountable system that notices missing capability, gets what it needs, and returns with finished work.",
] as const;

export const M3_FOUNDER_NARRATIVE_IMPLICATIONS: readonly string[] = [
  "Lead with founder outcome and accountability, then explain make-versus-buy capability underneath.",
  "Avoid positioning Somebody as another workflow-automation tool if the intended meaning is owned execution.",
] as const;

export type M3MerchantProductRequest = {
  resourceClass: string | null;
  productId: string | null;
  serviceId: string | null;
  offeringId: string | null;
  purpose: string | null;
  purposeKind: string | null;
  requestId: string | null;
};

export type M3ProtectedSuccessResult = {
  ok: true;
  productId: typeof M3_PRODUCT_ID;
  resourceClass: typeof M3_PRODUCT_RESOURCE_CLASS;
  provenance: typeof M3_PRODUCT_PROVENANCE;
  limitation: typeof M3_PRODUCT_LIMITATION;
  purposeKind: M3SupportedPurposeKind;
  purpose: string;
  requestId: string | null;
  offeringId: string | null;
  serviceId: typeof M3_PRODUCT_SERVICE_ID;
  providerId: typeof M3_PRODUCT_PROVIDER_ID;
  evidence: Array<{
    label: string;
    text: string;
    observedAt: number;
  }>;
  payload: {
    findings: string[];
    messagingImplications: string[];
  };
  /** Human-readable content suitable for ExternalAcquisitionResult.content. */
  content: string;
};

export type M3ProtectedErrorCode =
  | "unsupported_product_scope"
  | "incomplete_product_request"
  | "payment_required";

export type M3ProtectedErrorResult = {
  ok: false;
  error: M3ProtectedErrorCode;
  detail: string;
};

export type M3ProtectedResult = M3ProtectedSuccessResult | M3ProtectedErrorResult;

const HEADER_RESOURCE_CLASS = "x-somebody-resource-class";
const HEADER_PRODUCT_ID = "x-somebody-product-id";
const HEADER_SERVICE_ID = "x-somebody-service-id";
const HEADER_OFFERING_ID = "x-somebody-offering-id";
const HEADER_PURPOSE = "x-somebody-purpose";
const HEADER_PURPOSE_KIND = "x-somebody-purpose-kind";
const HEADER_REQUEST_ID = "x-somebody-request-id";

function firstString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function headerValue(
  headers: { get(name: string): string | null | undefined },
  name: string,
): string | null {
  return firstString(headers.get(name) ?? headers.get(name.toLowerCase()) ?? null);
}

/**
 * Extract the minimal product request from HTTP headers and/or query params.
 * Secrets and Objective state are intentionally not part of this contract.
 */
export function readM3MerchantProductRequest(input: {
  headers?: { get(name: string): string | null | undefined };
  query?: Record<string, unknown>;
}): M3MerchantProductRequest {
  const q = input.query ?? {};
  const h = input.headers;
  return {
    resourceClass:
      (h ? headerValue(h, HEADER_RESOURCE_CLASS) : null) ??
      firstString(q.resourceClass),
    productId:
      (h ? headerValue(h, HEADER_PRODUCT_ID) : null) ??
      firstString(q.productId),
    serviceId:
      (h ? headerValue(h, HEADER_SERVICE_ID) : null) ??
      firstString(q.serviceId),
    offeringId:
      (h ? headerValue(h, HEADER_OFFERING_ID) : null) ??
      firstString(q.offeringId),
    purpose:
      (h ? headerValue(h, HEADER_PURPOSE) : null) ??
      firstString(q.purpose),
    purposeKind:
      (h ? headerValue(h, HEADER_PURPOSE_KIND) : null) ??
      firstString(q.purposeKind),
    requestId:
      (h ? headerValue(h, HEADER_REQUEST_ID) : null) ??
      firstString(q.requestId),
  };
}

/**
 * Build the merchant request headers from fields already available on an
 * authorized intent / normalized provider request. No secrets.
 */
export function buildM3MerchantRequestHeaders(input: {
  resourceClass: string | null | undefined;
  productId?: string | null;
  serviceId: string | null | undefined;
  offeringId: string | null | undefined;
  purpose: string | null | undefined;
  purposeKind?: string | null;
  requestId: string | null | undefined;
}): Record<string, string> {
  const headers: Record<string, string> = {};
  if (input.resourceClass) headers[HEADER_RESOURCE_CLASS] = input.resourceClass;
  if (input.productId) headers[HEADER_PRODUCT_ID] = input.productId;
  else if (input.serviceId === M3_PRODUCT_SERVICE_ID) {
    headers[HEADER_PRODUCT_ID] = M3_PRODUCT_ID;
  }
  if (input.serviceId) headers[HEADER_SERVICE_ID] = input.serviceId;
  if (input.offeringId) headers[HEADER_OFFERING_ID] = input.offeringId;
  if (input.purpose) headers[HEADER_PURPOSE] = input.purpose.slice(0, 500);
  if (input.purposeKind) headers[HEADER_PURPOSE_KIND] = input.purposeKind;
  if (input.requestId) headers[HEADER_REQUEST_ID] = input.requestId;
  return headers;
}

/**
 * Deterministic purpose compatibility for this product.
 *
 * Authority is the typed purpose kind + product/resource identity — not a
 * broad keyword scrape. Free-text purpose is required for traceability and is
 * checked only with a fail-closed out-of-scope gate.
 */
export function resolveSupportedPurposeKind(
  request: M3MerchantProductRequest,
):
  | { ok: true; purposeKind: M3SupportedPurposeKind; purpose: string }
  | { ok: false; error: M3ProtectedErrorCode; detail: string } {
  const purpose = request.purpose?.trim() ?? "";
  if (!purpose) {
    return {
      ok: false,
      error: "incomplete_product_request",
      detail:
        "founder_narrative_pulse requires a bounded purpose describing the qualitative founder-messaging research question",
    };
  }

  const explicitKind = request.purposeKind?.trim() ?? "";
  if (explicitKind && explicitKind !== M3_SUPPORTED_PURPOSE_KIND) {
    return {
      ok: false,
      error: "unsupported_product_scope",
      detail: `purposeKind ${explicitKind} is outside founder_messaging_qualitative scope`,
    };
  }

  const lowered = purpose.toLowerCase();
  const outOfScopeSignals = [
    "conversion rate",
    "conversion uplift",
    "a/b test",
    "causal",
    "attribution",
    "statistically significant",
    "p-value",
    "live twitter",
    "twitter firehose",
    "newsliquid",
    "customer analytics",
    "revenue forecast",
    "price of bitcoin",
    "financial market",
    "stock price",
  ];
  for (const signal of outOfScopeSignals) {
    if (lowered.includes(signal)) {
      return {
        ok: false,
        error: "unsupported_product_scope",
        detail: `requested purpose requires ${signal}, which founder_narrative_pulse does not sell`,
      };
    }
  }

  // Typed kind present and matching, or omitted with purpose that did not trip
  // the fail-closed out-of-scope gate and targets this product's declared
  // qualitative founder-messaging research scope via in-scope signals.
  if (explicitKind === M3_SUPPORTED_PURPOSE_KIND) {
    return { ok: true, purposeKind: M3_SUPPORTED_PURPOSE_KIND, purpose: purpose.slice(0, 500) };
  }

  const inScopeSignals = [
    "founder",
    "one-person",
    "one person",
    "solo",
    "messaging",
    "message",
    "launch",
    "positioning",
    "workflow",
    "somebody",
    "language",
    "perception",
    "clarity",
  ];
  const inScope = inScopeSignals.some((signal) => lowered.includes(signal));
  if (!inScope) {
    return {
      ok: false,
      error: "unsupported_product_scope",
      detail:
        "purpose is not inside founder_narrative_pulse qualitative founder-messaging research scope",
    };
  }

  return { ok: true, purposeKind: M3_SUPPORTED_PURPOSE_KIND, purpose: purpose.slice(0, 500) };
}

export function evaluateM3ProductFulfillment(
  request: M3MerchantProductRequest,
): M3ProtectedResult {
  const targetsProduct =
    request.productId === M3_PRODUCT_ID ||
    request.serviceId === M3_PRODUCT_SERVICE_ID ||
    request.offeringId === M3_PRODUCT_OFFERING_ID;

  if (!request.resourceClass && !targetsProduct && !request.purpose && !request.purposeKind) {
    return {
      ok: false,
      error: "incomplete_product_request",
      detail:
        "paid founder_narrative_pulse requests must identify resourceClass, product/service, and bounded purpose",
    };
  }

  if (request.resourceClass && request.resourceClass !== M3_PRODUCT_RESOURCE_CLASS) {
    return {
      ok: false,
      error: "unsupported_product_scope",
      detail: `resourceClass ${request.resourceClass} is not sold by founder_narrative_pulse (proprietary_data only)`,
    };
  }

  if (!request.resourceClass) {
    return {
      ok: false,
      error: "incomplete_product_request",
      detail: "resourceClass is required and must be proprietary_data",
    };
  }

  if (!targetsProduct) {
    return {
      ok: false,
      error: "unsupported_product_scope",
      detail:
        "request does not target founder_narrative_pulse (productId/serviceId/offeringId mismatch)",
    };
  }

  // Never fulfill solely because resourceClass happens to be proprietary_data.
  const purpose = resolveSupportedPurposeKind(request);
  if (!purpose.ok) {
    return { ok: false, error: purpose.error, detail: purpose.detail };
  }

  return buildM3ProtectedSuccess({
    purpose: purpose.purpose,
    purposeKind: purpose.purposeKind,
    requestId: request.requestId,
    offeringId: request.offeringId,
  });
}

export function buildM3ProtectedSuccess(input: {
  purpose: string;
  purposeKind: M3SupportedPurposeKind;
  requestId: string | null;
  offeringId: string | null;
  observedAt?: number;
}): M3ProtectedSuccessResult {
  const observedAt = input.observedAt ?? Date.now();
  const evidence = M3_FOUNDER_NARRATIVE_FINDINGS.map((text, index) => ({
    label: `founder_narrative_finding_${index + 1}`,
    text,
    observedAt,
  }));
  const content = [
    "SYNTHETIC proprietary founder-messaging evidence — controlled test provider; no live platform was queried.",
    M3_PRODUCT_LIMITATION,
    "Observed audience-language patterns for one-person-company founders:",
    ...M3_FOUNDER_NARRATIVE_FINDINGS.map((line) => `- ${line}`),
    "Messaging implications:",
    ...M3_FOUNDER_NARRATIVE_IMPLICATIONS.map((line) => `- ${line}`),
    `Requested purpose: ${input.purpose}`,
  ].join("\n");

  return {
    ok: true,
    productId: M3_PRODUCT_ID,
    resourceClass: M3_PRODUCT_RESOURCE_CLASS,
    provenance: M3_PRODUCT_PROVENANCE,
    limitation: M3_PRODUCT_LIMITATION,
    purposeKind: input.purposeKind,
    purpose: input.purpose,
    requestId: input.requestId,
    offeringId: input.offeringId,
    serviceId: M3_PRODUCT_SERVICE_ID,
    providerId: M3_PRODUCT_PROVIDER_ID,
    evidence,
    payload: {
      findings: [...M3_FOUNDER_NARRATIVE_FINDINGS],
      messagingImplications: [...M3_FOUNDER_NARRATIVE_IMPLICATIONS],
    },
    content,
  };
}

export function verifyM3ProtectedResult(value: unknown): value is M3ProtectedSuccessResult {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const result = value as Record<string, unknown>;
  if (result.ok !== true) return false;
  if (result.productId !== M3_PRODUCT_ID) return false;
  if (result.resourceClass !== M3_PRODUCT_RESOURCE_CLASS) return false;
  if (result.provenance !== M3_PRODUCT_PROVENANCE) return false;
  if (result.purposeKind !== M3_SUPPORTED_PURPOSE_KIND) return false;
  if (typeof result.purpose !== "string" || result.purpose.trim().length === 0) return false;
  if (typeof result.content !== "string" || result.content.trim().length === 0) return false;
  if (typeof result.limitation !== "string" || !result.limitation.includes("NOT live")) return false;
  if (!Array.isArray(result.evidence) || result.evidence.length === 0) return false;
  const payload = result.payload as { findings?: unknown } | undefined;
  if (!payload || !Array.isArray(payload.findings) || payload.findings.length === 0) return false;
  // Reject silent legacy ping shape if somehow mixed in.
  if (result.resource === "m3-paid-ping") return false;
  return true;
}

/**
 * Normalize a successful protected merchant result into ExternalResourceResult
 * for the existing provider normalization / acquisition path.
 */
export function normalizeM3FounderNarrativeResult(
  raw: unknown,
  ctx?: {
    offeringId?: string;
    serviceId?: string;
    idempotencyKey?: string;
  },
): ExternalResourceResult {
  if (!verifyM3ProtectedResult(raw)) {
    throw new Error(
      "m3 founder_narrative_pulse: invalid protected result — expected verified synthetic product payload",
    );
  }
  const evidence: ExternalResourceEvidence[] = raw.evidence.map((item) => ({
    label: item.label,
    text: item.text,
    observedAt: item.observedAt,
  }));
  return {
    offeringId: ctx?.offeringId ?? raw.offeringId ?? M3_PRODUCT_OFFERING_ID,
    resourceClass: M3_PRODUCT_RESOURCE_CLASS,
    payload: {
      ...raw.payload,
      content: raw.content,
      limitation: raw.limitation,
      provenance: raw.provenance,
      purpose: raw.purpose,
      purposeKind: raw.purposeKind,
    },
    evidence,
    retrievedAt: Date.now(),
    provenance: {
      providerId: M3_PRODUCT_PROVIDER_ID,
      serviceId: ctx?.serviceId ?? raw.serviceId,
      idempotencyKey: ctx?.idempotencyKey ?? raw.requestId ?? "",
    },
  };
}

/** Provider-adapter request shape — purpose reaches the merchant here. */
export function buildM3FounderNarrativeRequest(input: {
  offering: MarketOffering;
  need: ResourceNeed;
}): {
  productId: typeof M3_PRODUCT_ID;
  resourceClass: typeof M3_PRODUCT_RESOURCE_CLASS;
  purposeKind: typeof M3_SUPPORTED_PURPOSE_KIND;
  purpose: string;
  offeringId: string;
  serviceId: string;
  requestId: string;
} {
  return {
    productId: M3_PRODUCT_ID,
    resourceClass: M3_PRODUCT_RESOURCE_CLASS,
    purposeKind: M3_SUPPORTED_PURPOSE_KIND,
    purpose: input.need.purpose.slice(0, 500),
    offeringId: input.offering.offeringId,
    serviceId: input.offering.serviceId,
    requestId: input.need.id,
  };
}
