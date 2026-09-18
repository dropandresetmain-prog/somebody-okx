import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { createPurchase } from "../lib/payment/purchase";
import { prepareApprovedPurchase } from "../lib/payment/supervisedPurchase";

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
