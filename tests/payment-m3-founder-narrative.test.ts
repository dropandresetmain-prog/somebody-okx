/**
 * Focused tests for the controlled founder_narrative_pulse TESTNET merchant product.
 * No Objective creation, no Luna, no live payment.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";

import type { FacilitatorClient } from "@okxweb3/x402-core/server";
import { parse402Challenge, decodePaymentRequiredHeader } from "../lib/payment/challenge";
import {
  createM3SellerApp,
  M3_SELLER_AMOUNT,
  M3_SELLER_ASSET,
  M3_SELLER_NETWORK,
  M3_SELLER_PATH,
  verifyM3ProtectedResult,
} from "../lib/payment/m3Seller";
import {
  buildM3MerchantRequestHeaders,
  buildM3ProtectedSuccess,
  evaluateM3ProductFulfillment,
  M3_FOUNDER_NARRATIVE_FINDINGS,
  M3_PRODUCT_ID,
  M3_PRODUCT_OFFERING_ID,
  M3_PRODUCT_PROVENANCE,
  M3_PRODUCT_RESOURCE_CLASS,
  M3_SUPPORTED_PURPOSE_KIND,
  normalizeM3FounderNarrativeResult,
} from "../lib/payment/m3FounderNarrativeProduct";
import { getAdapter } from "../lib/providers/registry";
import { CANONICAL_SOCIAL_INTELLIGENCE_NEED } from "../lib/objective/seedData";
import { VERIFIED_SERVICE_REGISTRY } from "../lib/market/registryData";
import { SNAPSHOT_OFFERINGS } from "../lib/market/snapshotData";

const RECEIVER = "0x1111111111111111111111111111111111111111";
const TX = `0x${"ab".repeat(32)}`;
const env = {
  NODE_ENV: "test",
  M3_SELLER_RECEIVER_ADDRESS: RECEIVER,
  OKX_API_KEY: "test-api-key",
  OKX_SECRET_KEY: "test-secret-key",
  OKX_API_PASSPHRASE: "test-passphrase",
} as const;

const facilitator: FacilitatorClient = {
  getSupported: async () => ({
    kinds: [{ x402Version: 2, scheme: "exact", network: M3_SELLER_NETWORK }],
    extensions: [],
    signers: {},
  }),
  verify: async () => ({ isValid: true, payer: RECEIVER }),
  settle: async () => ({
    success: true,
    status: "success" as const,
    transaction: TX,
    network: M3_SELLER_NETWORK,
  }),
};

const SUPPORTED_PURPOSE = CANONICAL_SOCIAL_INTELLIGENCE_NEED.purpose;

function supportedHeaders(): Record<string, string> {
  return buildM3MerchantRequestHeaders({
    resourceClass: M3_PRODUCT_RESOURCE_CLASS,
    productId: M3_PRODUCT_ID,
    serviceId: M3_PRODUCT_ID,
    offeringId: M3_PRODUCT_OFFERING_ID,
    purpose: SUPPORTED_PURPOSE,
    purposeKind: M3_SUPPORTED_PURPOSE_KIND,
    requestId: "req_test_1",
  });
}

function request(port: number, headers: Record<string, string> = {}, path = M3_SELLER_PATH): Promise<{
  status: number;
  headers: http.IncomingHttpHeaders;
  body: string;
}> {
  return new Promise((resolve, reject) => {
    const req = http.get({ host: "127.0.0.1", port, path, headers }, (res) => {
      const chunks: Buffer[] = [];
      res.on("data", (chunk: Buffer) => chunks.push(chunk));
      res.on("end", () => {
        resolve({ status: res.statusCode ?? 0, headers: res.headers, body: Buffer.concat(chunks).toString("utf8") });
      });
    });
    req.on("error", reject);
  });
}

describe("founder_narrative_pulse merchant product", () => {
  it("rejects the legacy paid-ping shape and accepts the synthetic product contract", () => {
    assert.equal(verifyM3ProtectedResult({
      ok: true,
      message: "Somebody M3 payment verified",
      resource: "m3-paid-ping",
    }), false);

    const success = buildM3ProtectedSuccess({
      purpose: SUPPORTED_PURPOSE,
      purposeKind: M3_SUPPORTED_PURPOSE_KIND,
      requestId: "r1",
      offeringId: M3_PRODUCT_OFFERING_ID,
      observedAt: 1,
    });
    assert.equal(verifyM3ProtectedResult(success), true);
    assert.equal(success.provenance, M3_PRODUCT_PROVENANCE);
    assert.match(success.limitation, /NOT live/);
    assert.ok(success.content.includes("switching between selling"));
  });

  it("fulfills only proprietary_data + founder_narrative_pulse + in-scope purpose", () => {
    const ok = evaluateM3ProductFulfillment({
      resourceClass: "proprietary_data",
      productId: M3_PRODUCT_ID,
      serviceId: M3_PRODUCT_ID,
      offeringId: M3_PRODUCT_OFFERING_ID,
      purpose: SUPPORTED_PURPOSE,
      purposeKind: M3_SUPPORTED_PURPOSE_KIND,
      requestId: "r1",
    });
    assert.equal(ok.ok, true);

    const wrongClass = evaluateM3ProductFulfillment({
      resourceClass: "privileged_access",
      productId: M3_PRODUCT_ID,
      serviceId: M3_PRODUCT_ID,
      offeringId: null,
      purpose: SUPPORTED_PURPOSE,
      purposeKind: M3_SUPPORTED_PURPOSE_KIND,
      requestId: "r2",
    });
    assert.equal(wrongClass.ok, false);
    if (!wrongClass.ok) assert.equal(wrongClass.error, "unsupported_product_scope");

    const quantitative = evaluateM3ProductFulfillment({
      resourceClass: "proprietary_data",
      productId: M3_PRODUCT_ID,
      serviceId: M3_PRODUCT_ID,
      offeringId: null,
      purpose: "Measure conversion uplift and causal attribution from the relaunch A/B test",
      purposeKind: null,
      requestId: "r3",
    });
    assert.equal(quantitative.ok, false);
    if (!quantitative.ok) assert.equal(quantitative.error, "unsupported_product_scope");

    const classOnly = evaluateM3ProductFulfillment({
      resourceClass: "proprietary_data",
      productId: null,
      serviceId: null,
      offeringId: null,
      purpose: SUPPORTED_PURPOSE,
      purposeKind: M3_SUPPORTED_PURPOSE_KIND,
      requestId: "r4",
    });
    assert.equal(classOnly.ok, false);
    if (!classOnly.ok) assert.equal(classOnly.error, "unsupported_product_scope");
  });

  it("keeps unpaid x402 challenge on eip155:1952 with configured receiver", async () => {
    const seller = createM3SellerApp({ env, facilitatorClient: facilitator });
    await seller.initialize();
    const server = seller.app.listen(0, "127.0.0.1");
    try {
      await new Promise<void>((resolve) => server.once("listening", () => resolve()));
      const address = server.address();
      assert.ok(address && typeof address === "object");
      const response = await request(address.port);
      assert.equal(response.status, 402);
      const encoded = response.headers["payment-required"];
      assert.equal(typeof encoded, "string");
      const challenge = decodePaymentRequiredHeader(encoded as string);
      const [terms] = parse402Challenge(challenge);
      assert.ok(terms);
      assert.equal(terms.network, M3_SELLER_NETWORK);
      assert.equal(terms.network, "eip155:1952");
      assert.notEqual(terms.network, "eip155:196");
      assert.equal(terms.asset, M3_SELLER_ASSET);
      assert.equal(terms.maxAmountRequired, M3_SELLER_AMOUNT);
      assert.equal(terms.payTo, RECEIVER);
      assert.equal(terms.resource, M3_SELLER_PATH);
      assert.equal(response.body.includes("test-secret-key"), false);
      assert.equal(JSON.stringify(challenge).includes("test-secret-key"), false);
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });

  it("post-payment product path returns synthetic evidence and normalizes for providers", () => {
    // This is the handler body after x402 middleware has verified payment.
    const result = evaluateM3ProductFulfillment({
      resourceClass: M3_PRODUCT_RESOURCE_CLASS,
      productId: M3_PRODUCT_ID,
      serviceId: M3_PRODUCT_ID,
      offeringId: M3_PRODUCT_OFFERING_ID,
      purpose: SUPPORTED_PURPOSE,
      purposeKind: M3_SUPPORTED_PURPOSE_KIND,
      requestId: "req_paid_1",
    });
    assert.equal(result.ok, true);
    assert.equal(verifyM3ProtectedResult(result), true);
    if (!result.ok) return;
    assert.equal(result.provenance, M3_PRODUCT_PROVENANCE);
    assert.ok(result.content.includes("AI manager"));
    for (const finding of M3_FOUNDER_NARRATIVE_FINDINGS) {
      assert.ok(result.content.includes(finding.slice(0, 40)));
    }
    const normalized = normalizeM3FounderNarrativeResult(result, {
      offeringId: M3_PRODUCT_OFFERING_ID,
      serviceId: M3_PRODUCT_ID,
      idempotencyKey: "idem_1",
    });
    assert.equal(normalized.resourceClass, "proprietary_data");
    assert.equal(normalized.provenance.providerId, "somebody_controlled_test");
    assert.ok(normalized.evidence.length >= 3);
  });

  it("unpaid request still receives x402 challenge even with product headers present", async () => {
    const seller = createM3SellerApp({ env, facilitatorClient: facilitator });
    await seller.initialize();
    const server = seller.app.listen(0, "127.0.0.1");
    try {
      await new Promise<void>((resolve) => server.once("listening", () => resolve()));
      const address = server.address();
      assert.ok(address && typeof address === "object");
      const response = await request(address.port, supportedHeaders());
      assert.equal(response.status, 402);
      assert.equal(typeof response.headers["payment-required"], "string");
      const body = JSON.parse(response.body) as { ok?: boolean; error?: string };
      assert.equal(body.ok, false);
      assert.equal(body.error, "payment_required");
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });

  it("provider registry exposes the controlled adapter and market data names the product", () => {
    const adapter = getAdapter("somebody_controlled_test");
    assert.ok(adapter);
    const success = buildM3ProtectedSuccess({
      purpose: SUPPORTED_PURPOSE,
      purposeKind: M3_SUPPORTED_PURPOSE_KIND,
      requestId: "r1",
      offeringId: M3_PRODUCT_OFFERING_ID,
      observedAt: 42,
    });
    const normalized = adapter!.normalizeResponse(success);
    assert.equal(normalized.resourceClass, "proprietary_data");
    assert.equal(normalized.provenance.providerId, "somebody_controlled_test");

    assert.ok(VERIFIED_SERVICE_REGISTRY.some((e) => e.serviceId === "founder_narrative_pulse"));
    assert.ok(SNAPSHOT_OFFERINGS.some((o) => o.serviceId === "founder_narrative_pulse"));
  });
});
