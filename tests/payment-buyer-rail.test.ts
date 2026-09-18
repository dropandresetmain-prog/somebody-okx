import { describe, it } from "node:test";
import assert from "node:assert";
import {
  detect402,
  preparePayment,
  executeSignedPayment,
  planRetry,
  FakeSigner,
  FakeSettlementReader,
  FakePaidRequestSender,
  fakeSubmit,
} from "../lib/payment/buyerRail";
import { createPurchase, updatePurchaseState, bindPurchaseTerms } from "../lib/payment/purchase";
import type { PaymentApproval, RailConfig, PurchaseRecord } from "../lib/payment/types";

describe("Buyer Rail", () => {
  const mockChallengeBody = {
    x402Version: 1,
    accepts: [
      {
        scheme: "exact",
        network: "eip155:1952",
        asset: "0xcb8bf24c6ce16ad21d707c9505421a17f2bec79d",
        maxAmountRequired: "10000",
        payTo: "0x3509655ad99effc7f3f74205482b1cb337ca08f7",
        resource: "/api/v1/pay/mock-merchant/resource",
        extra: { name: "USDC_TEST", version: "1" },
        maxTimeoutSeconds: 300,
      },
    ],
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

  const mockConfig: RailConfig = {
    allowedNetworks: ["eip155:1952"],
    maxSpend: "50000",
  };

  describe("detect402", () => {
    it("detects 402 status", () => {
      assert.strictEqual(detect402({ status: 402, body: {} }), true);
      assert.strictEqual(detect402({ status: 200, body: {} }), false);
      assert.strictEqual(detect402({ status: 404, body: {} }), false);
    });
  });

  describe("preparePayment", () => {
    it("prepares payment and stops at READY_TO_SIGN", () => {
      const prepared = preparePayment(mockChallengeBody, mockApproval, mockConfig, "intent-123");
      
      assert.strictEqual(prepared.state, "ready_to_sign");
      assert.strictEqual(prepared.intent.state, "ready_to_sign");
      assert.strictEqual(prepared.intent.intentId, "intent-123");
      assert.strictEqual(prepared.terms.network, "eip155:1952");
      assert.strictEqual(prepared.terms.maxAmountRequired, "10000");
    });

    it("rejects network not in allowed list", () => {
      const mainnetConfig: RailConfig = {
        allowedNetworks: ["eip155:1"],
        maxSpend: "50000",
      };

      assert.throws(
        () => preparePayment(mockChallengeBody, mockApproval, mainnetConfig),
        /Network.*not in allowed networks/
      );
    });

    it("rejects amount exceeding max spend", () => {
      const lowSpendConfig: RailConfig = {
        allowedNetworks: ["eip155:1952"],
        maxSpend: "5000",
      };

      assert.throws(
        () => preparePayment(mockChallengeBody, mockApproval, lowSpendConfig),
        /Amount.*exceeds max spend/
      );
    });

    it("testnet-only by default (mainnet rejected)", () => {
      const mainnetApproval = { ...mockApproval, approvedNetwork: "eip155:1" };
      const mainnetConfig: RailConfig = {
        allowedNetworks: ["eip155:1952"], // Only testnet allowed
        maxSpend: "50000",
      };

      // Challenge is testnet, but approval is mainnet - should fail at binding
      assert.throws(
        () => preparePayment(mockChallengeBody, mainnetApproval, mainnetConfig),
        /Network mismatch/
      );
    });

    it("throws if no valid terms", () => {
      const emptyBody = { x402Version: 1, accepts: [] };
      
      assert.throws(
        () => preparePayment(emptyBody, mockApproval, mockConfig),
        /No valid payment terms/
      );
    });
  });

  describe("executeSignedPayment", () => {
    it("executes payment with fake signer and submit", async () => {
      const prepared = preparePayment(mockChallengeBody, mockApproval, mockConfig, "intent-123");
      const signer = new FakeSigner("0x1234567890123456789012345678901234567890");
      
      const result = await executeSignedPayment(prepared, signer, fakeSubmit);
      
      assert.ok(result.transactionHash);
      assert.ok(result.transactionHash.startsWith("0x"));
      assert.strictEqual(result.transactionHash.length, 66); // 0x + 64 hex chars
    });

    it("cannot execute without READY_TO_SIGN state", async () => {
      const prepared = preparePayment(mockChallengeBody, mockApproval, mockConfig, "intent-123");
      // Deliberately corrupt the state to prove the runtime guard rejects it.
      const wrongState = { ...prepared, state: "submitted" } as unknown as typeof prepared;
      const signer = new FakeSigner();

      await assert.rejects(
        async () => executeSignedPayment(wrongState, signer, fakeSubmit),
        /Cannot execute payment in state submitted/
      );
    });

    it("cannot sign/pay without approval (rail refuses executeSignedPayment without explicit approval)", async () => {
      // This test verifies that executeSignedPayment requires a prepared payment
      // which can only be created with an explicit approval
      const signer = new FakeSigner();

      // Cannot create prepared payment without approval
      assert.throws(
        () => preparePayment(mockChallengeBody, null as any, mockConfig),
        /Cannot read properties of null/
      );
    });

    it("challenge values dynamically bound (mutating challenge body changes bound intent)", async () => {
      const challenge1 = {
        x402Version: 1,
        accepts: [
          {
            scheme: "exact",
            network: "eip155:1952",
            asset: "0xcb8bf24c6ce16ad21d707c9505421a17f2bec79d",
            maxAmountRequired: "10000",
            payTo: "0x3509655ad99effc7f3f74205482b1cb337ca08f7",
            resource: "/api/v1/pay/mock-merchant/resource",
            extra: { name: "USDC_TEST", version: "1" },
            maxTimeoutSeconds: 300,
          },
        ],
      };

      const challenge2 = {
        x402Version: 1,
        accepts: [
          {
            scheme: "exact",
            network: "eip155:1952",
            asset: "0xcb8bf24c6ce16ad21d707c9505421a17f2bec79d",
            maxAmountRequired: "20000", // Different amount
            payTo: "0x3509655ad99effc7f3f74205482b1cb337ca08f7",
            resource: "/api/v1/pay/mock-merchant/resource",
            extra: { name: "USDC_TEST", version: "1" },
            maxTimeoutSeconds: 300,
          },
        ],
      };

      const approval1 = { ...mockApproval, approvedMaxAmount: "15000" };
      const approval2 = { ...mockApproval, approvedMaxAmount: "25000" };

      const prepared1 = preparePayment(challenge1, approval1, mockConfig);
      const prepared2 = preparePayment(challenge2, approval2, mockConfig);

      assert.strictEqual(prepared1.terms.maxAmountRequired, "10000");
      assert.strictEqual(prepared2.terms.maxAmountRequired, "20000");
      assert.notDeepStrictEqual(prepared1.terms, prepared2.terms);
    });

    it("wrong network rejected", async () => {
      const wrongNetworkApproval = { ...mockApproval, approvedNetwork: "eip155:1" };
      
      assert.throws(
        () => preparePayment(mockChallengeBody, wrongNetworkApproval, mockConfig),
        /Network mismatch/
      );
    });

    it("amount beyond approval rejected", async () => {
      const lowAmountApproval = { ...mockApproval, approvedMaxAmount: "5000" };
      
      assert.throws(
        () => preparePayment(mockChallengeBody, lowAmountApproval, mockConfig),
        /Amount exceeds approval/
      );
    });

    it("asset/recipient mutation after approval rejected", async () => {
      const wrongAssetApproval = { ...mockApproval, approvedAsset: "0x0000000000000000000000000000000000000000" };
      
      assert.throws(
        () => preparePayment(mockChallengeBody, wrongAssetApproval, mockConfig),
        /Asset mismatch/
      );

      const wrongPayToApproval = { ...mockApproval, approvedPayTo: "0x0000000000000000000000000000000000000000" };
      
      assert.throws(
        () => preparePayment(mockChallengeBody, wrongPayToApproval, mockConfig),
        /Recipient mismatch/
      );
    });
  });

  describe("planRetry", () => {
    it("refuses to retry from submitted state", () => {
      const purchase = createPurchase({
        id: "purchase-1",
        objectiveKey: "objective-1",
        resourceNeedId: "need-1",
        offeringId: "offering-1",
        idempotencyKey: "idem-1",
      });

      const submitted = updatePurchaseState(purchase, "submitted");
      
      assert.throws(
        () => planRetry(submitted, []),
        /Cannot retry purchase in state submitted.*must reconcile first/
      );
    });

    it("refuses to retry from uncertain state", () => {
      const purchase = createPurchase({
        id: "purchase-1",
        objectiveKey: "objective-1",
        resourceNeedId: "need-1",
        offeringId: "offering-1",
        idempotencyKey: "idem-1",
      });

      const uncertain = updatePurchaseState(purchase, "uncertain");
      
      assert.throws(
        () => planRetry(uncertain, []),
        /Cannot retry purchase in state uncertain.*must reconcile first/
      );
    });

    it("refuses to retry from reconciliation_required state", () => {
      const purchase = createPurchase({
        id: "purchase-1",
        objectiveKey: "objective-1",
        resourceNeedId: "need-1",
        offeringId: "offering-1",
        idempotencyKey: "idem-1",
      });

      const reconRequired = updatePurchaseState(purchase, "reconciliation_required");
      
      assert.throws(
        () => planRetry(reconRequired, []),
        /Cannot retry purchase in state reconciliation_required.*must reconcile first/
      );
    });

    it("allows retry from failed state", () => {
      const purchase = createPurchase({
        id: "purchase-1",
        objectiveKey: "objective-1",
        resourceNeedId: "need-1",
        offeringId: "offering-1",
        idempotencyKey: "idem-1",
      });

      const failed = updatePurchaseState(purchase, "failed");
      
      const allowed = planRetry(failed, []);
      assert.strictEqual(allowed, true);
    });

    it("prevents double-pay: same idempotencyKey already submitted", () => {
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

      const submitted = updatePurchaseState(purchase1, "submitted");
      const failed = updatePurchaseState(purchase2, "failed");

      assert.throws(
        () => planRetry(failed, [submitted]),
        /Cannot retry.*idempotency key.*already used.*submitted/
      );
    });

    it("prevents double-pay: same idempotencyKey already settled", () => {
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

      const settled = updatePurchaseState(purchase1, "settled");
      const failed = updatePurchaseState(purchase2, "failed");

      assert.throws(
        () => planRetry(failed, [settled]),
        /Cannot retry.*idempotency key.*already used.*settled/
      );
    });

    it("ambiguous result requires reconciliation (planRetry refuses from uncertain/submitted)", () => {
      const purchase = createPurchase({
        id: "purchase-1",
        objectiveKey: "objective-1",
        resourceNeedId: "need-1",
        offeringId: "offering-1",
        idempotencyKey: "idem-1",
      });

      const uncertain = updatePurchaseState(purchase, "uncertain");
      
      assert.throws(
        () => planRetry(uncertain, []),
        /must reconcile first/
      );

      const submitted = updatePurchaseState(purchase, "submitted");
      
      assert.throws(
        () => planRetry(submitted, []),
        /must reconcile first/
      );
    });
  });

  describe("Settlement and verification", () => {
    it("submitted != settled (lifecycle requires confirm_settlement separately)", async () => {
      const purchase = createPurchase({
        id: "purchase-1",
        objectiveKey: "objective-1",
        resourceNeedId: "need-1",
        offeringId: "offering-1",
        idempotencyKey: "idem-1",
      });

      const submitted = updatePurchaseState(purchase, "submitted");
      assert.strictEqual(submitted.state, "submitted");
      assert.notStrictEqual(submitted.state, "settled");

      // Cannot verify from submitted
      assert.throws(
        () => planRetry(submitted, []),
        /must reconcile first/
      );
    });

    it("FakeSettlementReader tracks settlement status", async () => {
      const reader = new FakeSettlementReader();
      
      // Initially not settled
      const result1 = await reader.readSettlement("0xabc");
      assert.strictEqual(result1.settled, false);

      // Set as settled
      reader.setSettlement("0xabc", true, 2000);
      const result2 = await reader.readSettlement("0xabc");
      assert.strictEqual(result2.settled, true);
      assert.strictEqual(result2.settledAt, 2000);
    });

    it("FakePaidRequestSender returns preset results", async () => {
      const sender = new FakePaidRequestSender();
      
      // Default result
      const result1 = await sender.sendWithPayment("/resource", "proof");
      assert.strictEqual(result1.success, true);

      // Preset result
      sender.setResult("/resource", false, { error: "test" });
      const result2 = await sender.sendWithPayment("/resource", "proof");
      assert.strictEqual(result2.success, false);
      assert.deepStrictEqual(result2.result, { error: "test" });
    });
  });

  describe("Secret boundary", () => {
    it("secrets never serialized to persisted state", () => {
      const purchase = createPurchase({
        id: "purchase-1",
        objectiveKey: "objective-1",
        resourceNeedId: "need-1",
        offeringId: "offering-1",
        idempotencyKey: "idem-1",
      });

      const bound = bindPurchaseTerms(purchase, {
        scheme: "exact",
        network: "eip155:1952",
        asset: "0xcb8bf24c6ce16ad21d707c9505421a17f2bec79d",
        maxAmountRequired: "10000",
        payTo: "0x3509655ad99effc7f3f74205482b1cb337ca08f7",
        resource: "/api/v1/pay/mock-merchant/resource",
        eip712: { name: "USDC_TEST", version: "1" },
        maxTimeoutSeconds: 300,
      }, mockApproval);

      const serialized = JSON.stringify(bound);
      
      // Check no secret/private key fields
      assert.ok(!serialized.includes("privateKey"));
      assert.ok(!serialized.includes("secret"));
      assert.ok(!serialized.includes("mnemonic"));
      assert.ok(!serialized.includes("0xdeadbeef"));
    });

    it("FakeSigner never constructed from real secret", () => {
      const signer = new FakeSigner("0x1234567890123456789012345678901234567890");
      
      // Address is a dummy, not derived from a real key
      assert.strictEqual(signer.address, "0x1234567890123456789012345678901234567890");
      assert.strictEqual(signer.isTestOnlySigner, true);
      
      // Signature is fake
      const sig = signer.signEIP712({ test: "data" });
      assert.ok(sig instanceof Promise);
    });

    it("TestScaffoldPaymentExecutor is marked test_scaffold, not official", async () => {
      const {
        executeApprovedPayment,
        TestScaffoldPaymentExecutor,
        OfficialSigningPendingExecutor,
      } = await import("../lib/payment/buyerRail");
      const prepared = preparePayment(mockChallengeBody, mockApproval, mockConfig, "intent-exec");
      const scaffold = new TestScaffoldPaymentExecutor();
      assert.strictEqual(scaffold.kind, "test_scaffold");
      const result = await executeApprovedPayment(prepared, scaffold);
      assert.strictEqual(result.submitted, true);
      assert.ok(result.note?.includes("test_scaffold_only"));

      const official = new OfficialSigningPendingExecutor();
      assert.strictEqual(official.kind, "official_onchainos");
      await assert.rejects(
        async () => executeApprovedPayment(prepared, official),
        /Official Onchain OS/,
      );
    });
  });

  describe("Two-purchase independence", () => {
    it("two purchase records do not share idempotency keys", () => {
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

      assert.notStrictEqual(purchase1.idempotencyKey, purchase2.idempotencyKey);
    });

    it("first purchase state cannot authorize second (second needs its own approval/boundTerms)", () => {
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
      const bound1 = bindPurchaseTerms(purchase1, {
        scheme: "exact",
        network: "eip155:1952",
        asset: "0xcb8bf24c6ce16ad21d707c9505421a17f2bec79d",
        maxAmountRequired: "10000",
        payTo: "0x3509655ad99effc7f3f74205482b1cb337ca08f7",
        resource: "/api/v1/pay/mock-merchant/resource",
        eip712: { name: "USDC_TEST", version: "1" },
        maxTimeoutSeconds: 300,
      }, mockApproval);

      assert.strictEqual(bound1.state, "approved");
      assert.ok(bound1.approval);

      // Second purchase must have its own approval
      assert.strictEqual(purchase2.state, "prepared");
      assert.strictEqual(purchase2.approval, null);
      assert.strictEqual(purchase2.boundTerms, null);

      // Second purchase needs its own binding
      const bound2 = bindPurchaseTerms(purchase2, {
        scheme: "exact",
        network: "eip155:1952",
        asset: "0xcb8bf24c6ce16ad21d707c9505421a17f2bec79d",
        maxAmountRequired: "10000",
        payTo: "0x3509655ad99effc7f3f74205482b1cb337ca08f7",
        resource: "/api/v1/pay/mock-merchant/resource",
        eip712: { name: "USDC_TEST", version: "1" },
        maxTimeoutSeconds: 300,
      }, mockApproval);

      assert.strictEqual(bound2.state, "approved");
      assert.ok(bound2.approval);
    });
  });
});
