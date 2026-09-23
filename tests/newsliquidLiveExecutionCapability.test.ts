/**
 * Level 1 focused tests for the live Newsliquid ("OpenNews Twitter Search")
 * OKX x402 wiring: adapter request shaping, normalizeResponse validation,
 * resource class, purpose-scope validation, and the execution-capability
 * gate. Fixture/offline only — NO network call, NO payment, NO signing.
 */
import { describe, test } from "node:test";
import assert from "node:assert/strict";

import {
  newsliquidAdapter,
  NEWSLIQUID_ENDPOINT_URL,
  NEWSLIQUID_ENDPOINT_METHOD,
} from "../lib/providers/newsliquid";
import type { NewsliquidRawResponse } from "../lib/providers/newsliquid";
import { getAdapter } from "../lib/providers/registry";
import {
  NEWSLIQUID_PROVIDER_ID,
  NEWSLIQUID_SERVICE_ID,
  NEWSLIQUID_OFFERING_ID,
  NEWSLIQUID_FULFILLMENT_SCOPE,
  NEWSLIQUID_SUPPORTED_PURPOSE_KIND,
  resolveSupportedPurposeKind,
} from "../lib/payment/newsliquidProduct";
import {
  M3_PRODUCT_SERVICE_ID,
  M3_SUPPORTED_PURPOSE_KIND,
} from "../lib/payment/m3FounderNarrativeProduct";
import {
  hasConfiguredExternalExecutionPath,
  externalOfferingAcceptsPurpose,
} from "../lib/providers/executionCapability";
import {
  EXTERNAL_SOCIAL_INTELLIGENCE_PURPOSE_KIND,
  FOUNDER_MESSAGING_QUALITATIVE_PURPOSE_KIND,
  GOVERNED_PURPOSE_KINDS,
} from "../lib/workforce/catalog";
import type { MarketOffering } from "../lib/market/discovery";
import type { ResourceNeed } from "../lib/objective/resourceNeed";

function makeOffering(overrides?: Partial<MarketOffering>): MarketOffering {
  return {
    offeringId: NEWSLIQUID_OFFERING_ID,
    providerId: NEWSLIQUID_PROVIDER_ID,
    serviceId: NEWSLIQUID_SERVICE_ID,
    name: "OpenNews Twitter Search",
    description: "Live social intelligence search",
    price: { amount: "0.002", asset: "USDT0", unit: "per_use" },
    source: { kind: "snapshot", retrievedAt: 1_700_000_000_000 },
    compatibleResourceClasses: ["proprietary_data"],
    ...overrides,
  };
}

function makeNeed(overrides?: Partial<ResourceNeed>): ResourceNeed {
  return {
    id: "need_live_001",
    objectiveKey: "obj_live",
    workItemId: "wi_001",
    requirementKey: null,
    resourceClass: "proprietary_data",
    purpose: "current live social sentiment about our product launch",
    reasonOwnedInsufficient: "no access to real-time social data",
    status: "buy_pending",
    proposedByRunId: "run_001",
    createdAt: 1_700_000_000_000,
    updatedAt: 1_700_000_000_000,
    dedupeKey: "abc123",
    ...overrides,
  };
}

describe("Newsliquid live-rail adapter wiring", () => {
  test("requestShape returns the confirmed-live endpoint/method plus backward-compatible fields", () => {
    const req = newsliquidAdapter.requestShape({
      offering: makeOffering(),
      need: makeNeed(),
    }) as {
      endpoint: string;
      url: string;
      method: string;
      params: { topic: string; offeringId: string };
    };
    assert.equal(req.url, NEWSLIQUID_ENDPOINT_URL);
    assert.equal(req.url, "https://x402.6551.io/okx/twitter_search");
    assert.equal(req.method, NEWSLIQUID_ENDPOINT_METHOD);
    assert.equal(req.method, "POST");
    // backward-compatible relative endpoint retained
    assert.equal(req.endpoint, "twitter_search");
    assert.equal(req.params.topic, makeNeed().purpose);
  });

  test("normalizeResponse accepts a well-formed fixture", () => {
    const fixture: NewsliquidRawResponse = {
      results: [
        {
          text: "great launch",
          author: "someone",
          engagement: 12,
          url: "https://x.com/someone/status/1",
          createdAt: "2026-09-20T00:00:00.000Z",
        },
      ],
    };
    const result = newsliquidAdapter.normalizeResponse(fixture);
    assert.equal(result.resourceClass, "proprietary_data");
    assert.equal(result.evidence.length, 1);
  });

  test("normalizeResponse rejects a malformed response (missing/wrong-typed fields), never coerces", () => {
    assert.throws(() => newsliquidAdapter.normalizeResponse(null));
    assert.throws(() => newsliquidAdapter.normalizeResponse({}));
    assert.throws(() => newsliquidAdapter.normalizeResponse({ results: "not-an-array" }));
    assert.throws(() =>
      newsliquidAdapter.normalizeResponse({
        results: [{ text: "ok", author: "x" /* missing engagement/url/createdAt */ }],
      }),
    );
    assert.throws(() =>
      newsliquidAdapter.normalizeResponse({
        results: [{ text: "ok", author: "x", engagement: "not-a-number", url: "u", createdAt: "2026-01-01T00:00:00.000Z" }],
      }),
    );
  });

  test("registry.getAdapter resolves the live providerId (2135) to the newsliquid adapter", () => {
    const adapter = getAdapter(NEWSLIQUID_PROVIDER_ID);
    assert.ok(adapter);
    assert.equal(adapter, newsliquidAdapter);
  });
});

describe("Newsliquid product fulfillment scope", () => {
  test("resource class is proprietary_data only", () => {
    assert.deepEqual(NEWSLIQUID_FULFILLMENT_SCOPE.resourceClasses, ["proprietary_data"]);
  });

  test("the adapter declares only a governed purpose kind (one taxonomy, no second vocabulary)", () => {
    for (const kind of NEWSLIQUID_FULFILLMENT_SCOPE.purposeKinds) {
      assert.ok(GOVERNED_PURPOSE_KINDS.includes(kind));
    }
    assert.equal(NEWSLIQUID_SUPPORTED_PURPOSE_KIND, EXTERNAL_SOCIAL_INTELLIGENCE_PURPOSE_KIND);
  });

  test("resolveSupportedPurposeKind accepts a bounded purpose with the correct structured kind", () => {
    const resolved = resolveSupportedPurposeKind({
      resourceClass: "proprietary_data",
      serviceId: NEWSLIQUID_SERVICE_ID,
      offeringId: NEWSLIQUID_OFFERING_ID,
      purpose: "How do target users describe the launch on X right now?",
      purposeKind: EXTERNAL_SOCIAL_INTELLIGENCE_PURPOSE_KIND,
      requestId: "req_1",
    });
    assert.equal(resolved.ok, true);
  });

  test("resolveSupportedPurposeKind fails closed for the M3 synthetic kind (cross-contamination check)", () => {
    const resolved = resolveSupportedPurposeKind({
      resourceClass: "proprietary_data",
      serviceId: NEWSLIQUID_SERVICE_ID,
      offeringId: NEWSLIQUID_OFFERING_ID,
      purpose: "some purpose",
      purposeKind: FOUNDER_MESSAGING_QUALITATIVE_PURPOSE_KIND,
      requestId: "req_1",
    });
    assert.equal(resolved.ok, false);
  });

  test("resolveSupportedPurposeKind fails closed for no structured kind, and for an affirmative out-of-scope claim", () => {
    const noKind = resolveSupportedPurposeKind({
      resourceClass: "proprietary_data",
      serviceId: NEWSLIQUID_SERVICE_ID,
      offeringId: NEWSLIQUID_OFFERING_ID,
      purpose: "some purpose",
      purposeKind: null,
      requestId: "req_1",
    });
    assert.equal(noKind.ok, false);

    const claim = resolveSupportedPurposeKind({
      resourceClass: "proprietary_data",
      serviceId: NEWSLIQUID_SERVICE_ID,
      offeringId: NEWSLIQUID_OFFERING_ID,
      purpose: "give me a statistically significant causal conversion uplift report",
      purposeKind: EXTERNAL_SOCIAL_INTELLIGENCE_PURPOSE_KIND,
      requestId: "req_1",
    });
    assert.equal(claim.ok, false);
  });
});

describe("executionCapability — Newsliquid live mainnet boundary", () => {
  test("hasConfiguredExternalExecutionPath is true for the live Newsliquid provider/service pair", () => {
    assert.equal(
      hasConfiguredExternalExecutionPath({
        providerId: NEWSLIQUID_PROVIDER_ID,
        serviceId: NEWSLIQUID_SERVICE_ID,
      }),
      true,
    );
  });

  test("hasConfiguredExternalExecutionPath is false for an unregistered provider/service pair", () => {
    assert.equal(
      hasConfiguredExternalExecutionPath({ providerId: NEWSLIQUID_PROVIDER_ID, serviceId: "not_a_real_service" }),
      false,
    );
  });

  test("externalOfferingAcceptsPurpose accepts external_social_intelligence for Newsliquid", () => {
    assert.equal(
      externalOfferingAcceptsPurpose({
        serviceId: NEWSLIQUID_SERVICE_ID,
        purpose: "How do target users describe the launch on X right now?",
        purposeKind: EXTERNAL_SOCIAL_INTELLIGENCE_PURPOSE_KIND,
        resourceClass: "proprietary_data",
      }),
      true,
    );
  });

  test("externalOfferingAcceptsPurpose rejects everything else for Newsliquid, including the M3 kind, no kind, and wrong resource class", () => {
    assert.equal(
      externalOfferingAcceptsPurpose({
        serviceId: NEWSLIQUID_SERVICE_ID,
        purpose: "purpose",
        purposeKind: FOUNDER_MESSAGING_QUALITATIVE_PURPOSE_KIND,
        resourceClass: "proprietary_data",
      }),
      false,
      "M3 synthetic kind must not authorize the live Newsliquid product",
    );
    assert.equal(
      externalOfferingAcceptsPurpose({
        serviceId: NEWSLIQUID_SERVICE_ID,
        purpose: "purpose",
        purposeKind: null,
        resourceClass: "proprietary_data",
      }),
      false,
    );
    assert.equal(
      externalOfferingAcceptsPurpose({
        serviceId: NEWSLIQUID_SERVICE_ID,
        purpose: "purpose",
        purposeKind: EXTERNAL_SOCIAL_INTELLIGENCE_PURPOSE_KIND,
        resourceClass: "privileged_access",
      }),
      false,
    );
  });

  test("M3 controlled-test-merchant path is unaffected (regression): still fail-closed on the Newsliquid kind and still accepts its own kind", () => {
    assert.equal(
      externalOfferingAcceptsPurpose({
        serviceId: M3_PRODUCT_SERVICE_ID,
        purpose: "purpose",
        purposeKind: EXTERNAL_SOCIAL_INTELLIGENCE_PURPOSE_KIND,
        resourceClass: "proprietary_data",
      }),
      false,
      "the live Newsliquid kind must not authorize the M3 synthetic product",
    );
    assert.equal(
      externalOfferingAcceptsPurpose({
        serviceId: M3_PRODUCT_SERVICE_ID,
        purpose: "qualitative founder messaging research",
        purposeKind: M3_SUPPORTED_PURPOSE_KIND,
        resourceClass: "proprietary_data",
      }),
      true,
    );
  });

  test("unrelated service ids keep the existing permissive fallthrough (no behavior change outside this task's scope)", () => {
    assert.equal(
      externalOfferingAcceptsPurpose({
        serviceId: "some_unrelated_service",
        purpose: null,
        purposeKind: null,
        resourceClass: null,
      }),
      true,
    );
  });
});
