/**
 * Provider-adapter tests — fixture-driven, offline, no network, no credentials.
 *
 * All fixtures are SIMULATED — they do not represent real provider transactions.
 */

import { describe, test } from "node:test";
import assert from "node:assert/strict";

import { newsliquidAdapter } from "../lib/providers/newsliquid";
import type { NewsliquidRawResponse } from "../lib/providers/newsliquid";
import { xbirdAdapter, planReadbackVerification } from "../lib/providers/xbird";
import type { XbirdPublishReceipt } from "../lib/providers/xbird";
import { getAdapter, normalizeExternalResult } from "../lib/providers/registry";
import type { MarketOffering } from "../lib/market/discovery";
import type { ResourceNeed } from "../lib/objective/resourceNeed";

// ─── Shared fixture helpers ────────────────────────────────────────────────────

function makeOffering(overrides?: Partial<MarketOffering>): MarketOffering {
  return {
    offeringId: "newsliquid:opennews_twitter_search",
    providerId: "newsliquid",
    serviceId: "opennews_twitter_search",
    name: "OpenNews Twitter Search",
    description: "Social intelligence search",
    price: { amount: "0.002", asset: "USDT", unit: "per_use" },
    source: { kind: "snapshot", retrievedAt: 1_700_000_000_000 },
    compatibleResourceClasses: ["proprietary_data"],
    ...overrides,
  };
}

function makeNeed(overrides?: Partial<ResourceNeed>): ResourceNeed {
  return {
    id: "need_001",
    objectiveKey: "obj_launch_fix",
    workItemId: "wi_001",
    requirementKey: null,
    resourceClass: "proprietary_data",
    purpose: "current social sentiment about our product launch",
    reasonOwnedInsufficient: "no access to real-time social data",
    status: "buy_pending",
    proposedByRunId: "run_001",
    createdAt: 1_700_000_000_000,
    updatedAt: 1_700_000_000_000,
    dedupeKey: "abc123",
    ...overrides,
  };
}

// ─── SIMULATED fixtures ────────────────────────────────────────────────────────

// SIMULATED Newsliquid response — not a real provider transaction.
const SIMULATED_NEWSLIQUID_RESPONSE: NewsliquidRawResponse = {
  results: [
    {
      text: "just tried the new product launch, pretty impressed with the UX",
      author: "techreviewer42",
      engagement: 150,
      url: "https://x.com/techreviewer42/status/100001",
      createdAt: "2026-09-15T10:30:00.000Z",
    },
    {
      text: "the new positioning really resonates with our team",
      author: "startupfounder",
      engagement: 87,
      url: "https://x.com/startupfounder/status/100002",
      createdAt: "2026-09-15T11:45:00.000Z",
    },
  ],
};

// SIMULATED xbird publish receipt — not a real provider transaction.
const SIMULATED_XBIRD_RECEIPT: XbirdPublishReceipt = {
  id: "post_98765",
  text: "We're relaunching today with a new approach. Link in bio.",
  url: "https://x.com/somebody_co/status/98765",
  createdAt: "2026-09-16T14:00:00.000Z",
};

// ─── Tests ─────────────────────────────────────────────────────────────────────

describe("Newsliquid adapter", () => {
  test("normalizeResponse maps fixture to ExternalResourceResult with correct shape", () => {
    const result = newsliquidAdapter.normalizeResponse(SIMULATED_NEWSLIQUID_RESPONSE);

    // resourceClass
    assert.equal(result.resourceClass, "proprietary_data");

    // evidence entries carry url + text + observedAt
    assert.equal(result.evidence.length, 2);
    assert.ok(result.evidence[0].url);
    assert.ok(result.evidence[0].text.length > 0);
    assert.ok(typeof result.evidence[0].observedAt === "number");
    assert.ok(result.evidence[1].url);

    // provenance
    assert.equal(result.provenance.providerId, "newsliquid");
    assert.equal(typeof result.provenance.serviceId, "string");
    assert.equal(typeof result.provenance.idempotencyKey, "string");

    // payload reflects fixture input (not a hardcoded conclusion)
    const payload = result.payload as Array<{ text: string }>;
    assert.equal(payload.length, 2);
    assert.equal(payload[0].text, SIMULATED_NEWSLIQUID_RESPONSE.results[0].text);
  });

  test("payload reflects fixture input — changing fixture changes evidence", () => {
    const altResponse: NewsliquidRawResponse = {
      results: [
        {
          text: "completely different content",
          author: "otheruser",
          engagement: 10,
          url: "https://x.com/otheruser/status/999",
          createdAt: "2026-09-14T08:00:00.000Z",
        },
      ],
    };
    const result = newsliquidAdapter.normalizeResponse(altResponse);
    const payload = result.payload as Array<{ text: string }>;
    assert.equal(payload[0].text, "completely different content");
    assert.equal(result.evidence[0].text, "completely different content");
    assert.equal(result.evidence[0].url, "https://x.com/otheruser/status/999");
  });

  test("requestShape produces a request referencing need purpose without hardcoded conclusions", () => {
    const req = newsliquidAdapter.requestShape({
      offering: makeOffering(),
      need: makeNeed(),
    }) as { endpoint: string; params: { topic: string; offeringId: string } };

    assert.equal(req.endpoint, "twitter_search");
    assert.equal(req.params.topic, "current social sentiment about our product launch");
    assert.equal(req.params.offeringId, "newsliquid:opennews_twitter_search");
    // Must NOT contain provider-approval or spend authority
    const serialized = JSON.stringify(req);
    assert.ok(!serialized.includes("approved"));
    assert.ok(!serialized.includes("spend"));
  });
});

describe("xbird adapter", () => {
  test("normalizeResponse maps publish receipt fixture", () => {
    const result = xbirdAdapter.normalizeResponse(SIMULATED_XBIRD_RECEIPT);

    assert.equal(result.resourceClass, "privileged_access");
    assert.equal(result.evidence.length, 1);
    assert.equal(result.evidence[0].url, SIMULATED_XBIRD_RECEIPT.url);
    assert.equal(result.evidence[0].text, SIMULATED_XBIRD_RECEIPT.text);
    assert.equal(result.provenance.providerId, "xbird");
  });

  test("NO secret (authToken/ct0) appears anywhere in serialized result", () => {
    const fakeAuthToken = "SUPER_SECRET_AUTH_TOKEN_12345";
    const fakeCt0 = "SUPER_SECRET_CT0_67890";

    // Even if we accidentally include credentials in the receipt, they must
    // not leak into the normalised result.
    const receiptWithSecrets = {
      ...SIMULATED_XBIRD_RECEIPT,
      _internalNote: `authToken=${fakeAuthToken} ct0=${fakeCt0}`,
    };

    const result = xbirdAdapter.normalizeResponse(receiptWithSecrets);
    const serialized = JSON.stringify(result);

    assert.ok(
      !serialized.includes(fakeAuthToken),
      "authToken must NOT appear in serialized result",
    );
    assert.ok(
      !serialized.includes(fakeCt0),
      "ct0 must NOT appear in serialized result",
    );
  });

  test("planReadbackVerification returns a descriptor referencing post id/url", () => {
    const descriptor = planReadbackVerification(SIMULATED_XBIRD_RECEIPT);

    assert.equal(descriptor.method, "GET");
    assert.equal(descriptor.params.postId, SIMULATED_XBIRD_RECEIPT.id);
    assert.equal(descriptor.params.url, SIMULATED_XBIRD_RECEIPT.url);
    assert.ok(descriptor.expectedOutcome.length > 0);
  });

  test("requestShape produces a publish request referencing need purpose without embedding credentials", () => {
    const req = xbirdAdapter.requestShape({
      offering: makeOffering({
        offeringId: "xbird:twitter_x_api",
        providerId: "xbird",
        serviceId: "twitter_x_api",
        compatibleResourceClasses: ["privileged_access"],
      }),
      need: makeNeed({ purpose: "publish our relaunch announcement" }),
    }) as { endpoint: string; body: { text: string; credentialsRef: string } };

    assert.equal(req.endpoint, "post/create");
    assert.equal(req.body.text, "publish our relaunch announcement");
    assert.equal(req.body.credentialsRef, "BYOA_LOCAL");
    // Must NOT contain actual credential values
    const serialized = JSON.stringify(req);
    assert.ok(!serialized.includes("authToken="));
    assert.ok(!serialized.includes("ct0="));
    // Must NOT contain provider-approval or spend authority
    assert.ok(!serialized.includes("approved"));
    assert.ok(!serialized.includes("spend"));
  });
});

describe("Registry", () => {
  test("getAdapter returns newsliquid adapter", () => {
    const adapter = getAdapter("newsliquid");
    assert.ok(adapter);
    assert.equal(adapter.providerId, "newsliquid");
  });

  test("getAdapter returns xbird adapter", () => {
    const adapter = getAdapter("xbird");
    assert.ok(adapter);
    assert.equal(adapter.providerId, "xbird");
  });

  test("getAdapter returns null for unknown provider", () => {
    const adapter = getAdapter("nonexistent_provider");
    assert.equal(adapter, null);
  });

  test("normalizeExternalResult delegates to adapter", () => {
    const adapter = getAdapter("newsliquid");
    assert.ok(adapter);
    const result = normalizeExternalResult(adapter, SIMULATED_NEWSLIQUID_RESPONSE);
    assert.equal(result.resourceClass, "proprietary_data");
    assert.equal(result.evidence.length, 2);
  });
});
