import { describe, it } from "node:test";
import assert from "node:assert";
import {
  createPurchase,
  assertIdempotencyDistinct,
  updatePurchaseState,
  bindPurchaseTerms,
  recordPurchaseReceipt,
  recordPurchaseResult,
  verifyPurchase,
} from "../lib/payment/purchase";
import type { NormalizedChallengeTerms, PaymentApproval } from "../lib/payment/types";

describe("Purchase Record Management", () => {
  const mockTerms: NormalizedChallengeTerms = {
    scheme: "exact",
    network: "eip155:1952",
    asset: "0xcb8bf24c6ce16ad21d707c9505421a17f2bec79d",
    maxAmountRequired: "10000",
    payTo: "0x3509655ad99effc7f3f74205482b1cb337ca08f7",
    resource: "/api/v1/pay/mock-merchant/resource",
    eip712: { name: "USDC_TEST", version: "1" },
    maxTimeoutSeconds: 300,
  };

  const mockApproval: PaymentApproval = {
    approver: "test-approver",
    approvedMaxAmount: "20000",
    approvedNetwork: "eip155:1952",
    approvedAsset: "0xcb8bf24c6ce16ad21d707c9505421a17f2bec79d",
    approvedPayTo: "0x3509655ad99effc7f3f74205482b1cb337ca08f7",
    approvalId: "approval-123",
    approvedAt: 1000,
  };

  describe("createPurchase", () => {
    it("creates a new purchase in prepared state", () => {
      const purchase = createPurchase({
        id: "purchase-1",
        objectiveKey: "objective-1",
        resourceNeedId: "need-1",
        offeringId: "offering-1",
        idempotencyKey: "idem-1",
        at: 1000,
      });

      assert.strictEqual(purchase.id, "purchase-1");
      assert.strictEqual(purchase.objectiveKey, "objective-1");
      assert.strictEqual(purchase.resourceNeedId, "need-1");
      assert.strictEqual(purchase.offeringId, "offering-1");
      assert.strictEqual(purchase.idempotencyKey, "idem-1");
      assert.strictEqual(purchase.state, "prepared");
      assert.strictEqual(purchase.boundTerms, null);
      assert.strictEqual(purchase.approval, null);
      assert.strictEqual(purchase.receipt, null);
      assert.strictEqual(purchase.result, null);
      assert.strictEqual(purchase.verified, false);
      assert.strictEqual(purchase.createdAt, 1000);
      assert.strictEqual(purchase.updatedAt, 1000);
    });

    it("defaults timestamps to 0", () => {
      const purchase = createPurchase({
        id: "purchase-1",
        objectiveKey: "objective-1",
        resourceNeedId: "need-1",
        offeringId: "offering-1",
        idempotencyKey: "idem-1",
      });

      assert.strictEqual(purchase.createdAt, 0);
      assert.strictEqual(purchase.updatedAt, 0);
    });
  });

  describe("assertIdempotencyDistinct", () => {
    it("passes for distinct idempotency keys", () => {
      const purchase1 = createPurchase({
        id: "purchase-1",
        objectiveKey: "objective-1",
        resourceNeedId: "need-1",
        offeringId: "offering-1",
        idempotencyKey: "idem-1",
      });

      const purchase2 = createPurchase({
        id: "purchase-2",
        objectiveKey: "objective-1",
        resourceNeedId: "need-2",
        offeringId: "offering-2",
        idempotencyKey: "idem-2",
      });

      // Should not throw
      assertIdempotencyDistinct(purchase1, purchase2);
    });

    it("throws for duplicate idempotency keys", () => {
      const purchase1 = createPurchase({
        id: "purchase-1",
        objectiveKey: "objective-1",
        resourceNeedId: "need-1",
        offeringId: "offering-1",
        idempotencyKey: "idem-same",
      });

      const purchase2 = createPurchase({
        id: "purchase-2",
        objectiveKey: "objective-1",
        resourceNeedId: "need-2",
        offeringId: "offering-2",
        idempotencyKey: "idem-same",
      });

      assert.throws(
        () => assertIdempotencyDistinct(purchase1, purchase2),
        /Idempotency collision/
      );
    });

    it("two purchases under same objective must have different keys", () => {
      const purchase1 = createPurchase({
        id: "purchase-1",
        objectiveKey: "objective-1",
        resourceNeedId: "need-1",
        offeringId: "offering-1",
        idempotencyKey: "idem-1",
      });

      const purchase2 = createPurchase({
        id: "purchase-2",
        objectiveKey: "objective-1",
        resourceNeedId: "need-2",
        offeringId: "offering-2",
        idempotencyKey: "idem-2",
      });

      // Should not throw
      assertIdempotencyDistinct(purchase1, purchase2);
      assert.strictEqual(purchase1.objectiveKey, purchase2.objectiveKey);
      assert.notStrictEqual(purchase1.idempotencyKey, purchase2.idempotencyKey);
    });
  });

  describe("updatePurchaseState", () => {
    it("updates state and timestamp", () => {
      const purchase = createPurchase({
        id: "purchase-1",
        objectiveKey: "objective-1",
        resourceNeedId: "need-1",
        offeringId: "offering-1",
        idempotencyKey: "idem-1",
        at: 1000,
      });

      const updated = updatePurchaseState(purchase, "approved", 2000);
      assert.strictEqual(updated.state, "approved");
      assert.strictEqual(updated.updatedAt, 2000);
      assert.strictEqual(purchase.state, "prepared"); // Original unchanged
    });
  });

  describe("bindPurchaseTerms", () => {
    it("binds terms and approval to prepared purchase", () => {
      const purchase = createPurchase({
        id: "purchase-1",
        objectiveKey: "objective-1",
        resourceNeedId: "need-1",
        offeringId: "offering-1",
        idempotencyKey: "idem-1",
        at: 1000,
      });

      const bound = bindPurchaseTerms(purchase, mockTerms, mockApproval, 2000);
      assert.strictEqual(bound.state, "approved");
      assert.deepStrictEqual(bound.boundTerms, mockTerms);
      assert.deepStrictEqual(bound.approval, mockApproval);
      assert.strictEqual(bound.updatedAt, 2000);
    });

    it("binds terms to awaiting_approval purchase", () => {
      const purchase = createPurchase({
        id: "purchase-1",
        objectiveKey: "objective-1",
        resourceNeedId: "need-1",
        offeringId: "offering-1",
        idempotencyKey: "idem-1",
      });

      const awaitingApproval = updatePurchaseState(purchase, "awaiting_approval");
      const bound = bindPurchaseTerms(awaitingApproval, mockTerms, mockApproval);
      assert.strictEqual(bound.state, "approved");
    });

    it("throws if purchase not in bindable state", () => {
      const purchase = createPurchase({
        id: "purchase-1",
        objectiveKey: "objective-1",
        resourceNeedId: "need-1",
        offeringId: "offering-1",
        idempotencyKey: "idem-1",
      });

      const approved = bindPurchaseTerms(purchase, mockTerms, mockApproval);
      
      assert.throws(
        () => bindPurchaseTerms(approved, mockTerms, mockApproval),
        /Cannot bind terms.*state approved/
      );
    });

    it("first purchase state cannot authorize second purchase", () => {
      const purchase1 = createPurchase({
        id: "purchase-1",
        objectiveKey: "objective-1",
        resourceNeedId: "need-1",
        offeringId: "offering-1",
        idempotencyKey: "idem-1",
      });

      const purchase2 = createPurchase({
        id: "purchase-2",
        objectiveKey: "objective-1",
        resourceNeedId: "need-2",
        offeringId: "offering-2",
        idempotencyKey: "idem-2",
      });

      // Bind first purchase
      const bound1 = bindPurchaseTerms(purchase1, mockTerms, mockApproval);
      assert.strictEqual(bound1.state, "approved");

      // Second purchase must have its own approval
      assert.strictEqual(purchase2.state, "prepared");
      assert.strictEqual(purchase2.approval, null);

      // Bind second purchase with its own approval
      const bound2 = bindPurchaseTerms(purchase2, mockTerms, mockApproval);
      assert.strictEqual(bound2.state, "approved");
      assert.deepStrictEqual(bound2.approval, mockApproval);
    });
  });

  describe("recordPurchaseReceipt", () => {
    it("records transaction hash", () => {
      const purchase = createPurchase({
        id: "purchase-1",
        objectiveKey: "objective-1",
        resourceNeedId: "need-1",
        offeringId: "offering-1",
        idempotencyKey: "idem-1",
      });

      const withReceipt = recordPurchaseReceipt(purchase, "0xabc123", 2000, 3000);
      assert.deepStrictEqual(withReceipt.receipt, {
        transactionHash: "0xabc123",
        settledAt: 2000,
      });
      assert.strictEqual(withReceipt.updatedAt, 3000);
    });
  });

  describe("recordPurchaseResult", () => {
    it("records result data", () => {
      const purchase = createPurchase({
        id: "purchase-1",
        objectiveKey: "objective-1",
        resourceNeedId: "need-1",
        offeringId: "offering-1",
        idempotencyKey: "idem-1",
      });

      const withResult = recordPurchaseResult(purchase, { data: "test" }, 2000);
      assert.deepStrictEqual(withResult.result, { data: "test" });
      assert.strictEqual(withResult.updatedAt, 2000);
    });
  });

  describe("verifyPurchase", () => {
    it("marks purchase as verified", () => {
      const purchase = createPurchase({
        id: "purchase-1",
        objectiveKey: "objective-1",
        resourceNeedId: "need-1",
        offeringId: "offering-1",
        idempotencyKey: "idem-1",
      });

      const verified = verifyPurchase(purchase, 2000);
      assert.strictEqual(verified.verified, true);
      assert.strictEqual(verified.updatedAt, 2000);
    });
  });
});
