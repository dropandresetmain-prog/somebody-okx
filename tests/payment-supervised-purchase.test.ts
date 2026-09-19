import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { createPurchase } from "../lib/payment/purchase";
import {
  prepareApprovedPurchase,
  preflightApprovedPurchaseAssetDomain,
} from "../lib/payment/supervisedPurchase";
import { AssetDomainMismatchError } from "../lib/payment/assetDomain";
import type { JsonRpcTransport } from "../lib/payment/xlayerSettlement";

const challenge = {
  x402Version: 2,
  accepts: [{
    scheme: "exact",
    network: "eip155:1952",
    asset: "0xcb8bf24c6ce16ad21d707c9505421a17f2bec79d",
    maxAmountRequired: "10000",
    payTo: "0x3509655ad99effc7f3f74205482b1cb337ca08f7",
    resource: "/api/v1/pay/mock-merchant/resource",
    maxTimeoutSeconds: 60,
    extra: { name: "USDC_TEST", version: "1" },
  }],
};

describe("supervised purchase preparation", () => {
  it("binds exactly one purchase to the live exact terms and reaches ready_to_sign", () => {
    const prepared = prepareApprovedPurchase({
      purchase: createPurchase({
        id: "purchase-m3-1",
        objectiveKey: "objective-m3",
        resourceNeedId: "need-mock-merchant",
        offeringId: "okx-mock-merchant",
        idempotencyKey: "idem-m3-1",
        at: 1,
      }),
      approval: {
        approver: "founder",
        approvalId: "approval-m3-1",
        approvedMaxAmount: "10000",
        approvedNetwork: "eip155:1952",
        approvedAsset: "0xcb8bf24c6ce16ad21d707c9505421a17f2bec79d",
        approvedPayTo: "0x3509655ad99effc7f3f74205482b1cb337ca08f7",
        approvedAt: 1,
      },
      challengeBody: challenge,
      config: { allowedNetworks: ["eip155:1952"], maxSpend: "10000" },
      intentId: "intent-m3-1",
      at: 2,
    });

    assert.equal(prepared.purchase.state, "approved");
    assert.equal(prepared.prepared.state, "ready_to_sign");
    assert.equal(prepared.prepared.intent.terms.asset, challenge.accepts[0].asset);
    assert.equal(prepared.purchase.idempotencyKey, "idem-m3-1");
  });
});

/**
 * Recorded live X Layer Testnet responses for the merchant's advertised asset.
 * The token's real EIP-712 domain version is "2"; the challenge above says "1".
 */
const liveTokenRpc: JsonRpcTransport = async (method, params) => {
  assert.equal(method, "eth_call");
  const { data } = params[0] as { data: string };
  switch (data) {
    case "0x06fdde03":
    case "0x95d89b41":
      return "0x0000000000000000000000000000000000000000000000000000000000000020"
        + "0000000000000000000000000000000000000000000000000000000000000009"
        + "555344435f544553540000000000000000000000000000000000000000000000";
    case "0x313ce567":
      return "0x0000000000000000000000000000000000000000000000000000000000000006";
    case "0x54fd4d50":
      return "0x0000000000000000000000000000000000000000000000000000000000000020"
        + "0000000000000000000000000000000000000000000000000000000000000001"
        + "3200000000000000000000000000000000000000000000000000000000000000";
    case "0x3644e515":
      return "0x7513e76c6d38c7986bcfe857d0e0772d5050d9db65ef5a941d1e15859baef959";
    default:
      throw new Error("execution reverted");
  }
};

describe("supervised purchase asset-domain preflight", () => {
  function readyToSign() {
    return prepareApprovedPurchase({
      purchase: createPurchase({
        id: "purchase-m3-domain",
        objectiveKey: "objective-m3",
        resourceNeedId: "need-mock-merchant",
        offeringId: "okx-mock-merchant",
        idempotencyKey: "idem-m3-domain",
        at: 1,
      }),
      approval: {
        approver: "founder",
        approvalId: "approval-m3-domain",
        approvedMaxAmount: "10000",
        approvedNetwork: "eip155:1952",
        approvedAsset: "0xcb8bf24c6ce16ad21d707c9505421a17f2bec79d",
        approvedPayTo: "0x3509655ad99effc7f3f74205482b1cb337ca08f7",
        approvedAt: 1,
      },
      challengeBody: challenge,
      config: { allowedNetworks: ["eip155:1952"], maxSpend: "10000" },
      intentId: "intent-m3-domain",
      at: 2,
    });
  }

  it("does NOT block the official TEE path, which ignores the challenge extra domain", async () => {
    // `onchainos payment pay` posts asset+chain to gen-msg-hash and signs the
    // domainHash the backend returns; extra.name/extra.version never reach the
    // signature. A divergence is a smell, not proof of rejection, so blocking
    // here would refuse a payment that can actually settle.
    const { prepared } = readyToSign();
    const verdict = await preflightApprovedPurchaseAssetDomain(liveTokenRpc, prepared, {
      decimals: 6,
    });
    assert.equal(verdict.state, "incompatible");
    assert.match(verdict.reasons.join(" "), /domain version mismatch/);
  });

  it("blocks under strict enforcement, which is the locally-signed pay-local path", async () => {
    const { prepared } = readyToSign();
    await assert.rejects(
      () =>
        preflightApprovedPurchaseAssetDomain(liveTokenRpc, prepared, {
          decimals: 6,
          enforcement: "strict",
        }),
      (error: unknown) => {
        assert.ok(error instanceof AssetDomainMismatchError);
        assert.match(error.message, /Refusing to sign/);
        assert.match(error.reasons.join(" "), /domain version mismatch/);
        return true;
      },
    );
  });
});
