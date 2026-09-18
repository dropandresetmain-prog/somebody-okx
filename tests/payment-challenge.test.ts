import { describe, it } from "node:test";
import assert from "node:assert";
import { parse402Challenge, bindTermsToApproval } from "../lib/payment/challenge";
import type { PaymentApproval } from "../lib/payment/types";

describe("402 Challenge Parsing and Binding", () => {
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

  describe("parse402Challenge", () => {
    it("parses valid challenge body", () => {
      const terms = parse402Challenge(mockChallengeBody);
      assert.strictEqual(terms.length, 1);
      assert.strictEqual(terms[0].scheme, "exact");
      assert.strictEqual(terms[0].network, "eip155:1952");
      assert.strictEqual(terms[0].asset, "0xcb8bf24c6ce16ad21d707c9505421a17f2bec79d");
      assert.strictEqual(terms[0].maxAmountRequired, "10000");
      assert.strictEqual(terms[0].payTo, "0x3509655ad99effc7f3f74205482b1cb337ca08f7");
      assert.strictEqual(terms[0].resource, "/api/v1/pay/mock-merchant/resource");
      assert.strictEqual(terms[0].eip712.name, "USDC_TEST");
      assert.strictEqual(terms[0].eip712.version, "1");
      assert.strictEqual(terms[0].maxTimeoutSeconds, 300);
    });

    it("normalizes the current x402 v2 amount field", () => {
      const currentWireShape = {
        x402Version: 2,
        accepts: [{
          ...mockChallengeBody.accepts[0],
          amount: "10000",
          maxAmountRequired: undefined,
        }],
      };
      const terms = parse402Challenge(currentWireShape);
      assert.strictEqual(terms.length, 1);
      assert.strictEqual(terms[0].maxAmountRequired, "10000");
    });

    it("rejects an entry when amount aliases conflict", () => {
      const conflicting = {
        x402Version: 2,
        accepts: [{
          ...mockChallengeBody.accepts[0],
          amount: "9999",
          maxAmountRequired: "10000",
        }],
      };
      assert.deepStrictEqual(parse402Challenge(conflicting), []);
    });

    it("throws if x402Version missing", () => {
      const invalidBody = { accepts: mockChallengeBody.accepts };
      assert.throws(
        () => parse402Challenge(invalidBody),
        /Challenge must include x402Version/
      );
    });

    it("throws if accepts not array", () => {
      const invalidBody = { x402Version: 1, accepts: "not-an-array" };
      assert.throws(
        () => parse402Challenge(invalidBody),
        /Challenge must include accepts as an array/
      );
    });

    it("skips malformed entries", () => {
      const bodyWithMalformed = {
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
          {
            scheme: "exact",
            // Missing network
            asset: "0xcb8bf24c6ce16ad21d707c9505421a17f2bec79d",
            maxAmountRequired: "10000",
            payTo: "0x3509655ad99effc7f3f74205482b1cb337ca08f7",
            resource: "/api/v1/pay/mock-merchant/resource",
            extra: { name: "USDC_TEST", version: "1" },
            maxTimeoutSeconds: 300,
          },
        ],
      };
      const terms = parse402Challenge(bodyWithMalformed);
      assert.strictEqual(terms.length, 1); // Only valid entry
    });

    it("returns empty array if all entries malformed", () => {
      const bodyWithAllMalformed = {
        x402Version: 1,
        accepts: [
          { scheme: "exact" }, // Missing required fields
        ],
      };
      const terms = parse402Challenge(bodyWithAllMalformed);
      assert.strictEqual(terms.length, 0);
    });
  });

  describe("bindTermsToApproval", () => {
    it("binds valid terms to approval", () => {
      const terms = parse402Challenge(mockChallengeBody)[0];
      const intent = bindTermsToApproval(terms, mockApproval, "intent-123", 1000);
      
      assert.strictEqual(intent.intentId, "intent-123");
      assert.strictEqual(intent.state, "ready_to_sign");
      assert.strictEqual(intent.boundAt, 1000);
      assert.deepStrictEqual(intent.terms, terms);
      assert.deepStrictEqual(intent.approval, mockApproval);
    });

    it("rejects network mismatch", () => {
      const terms = parse402Challenge(mockChallengeBody)[0];
      const wrongNetworkApproval = { ...mockApproval, approvedNetwork: "eip155:1" };
      
      assert.throws(
        () => bindTermsToApproval(terms, wrongNetworkApproval),
        /Network mismatch/
      );
    });

    it("rejects asset mismatch", () => {
      const terms = parse402Challenge(mockChallengeBody)[0];
      const wrongAssetApproval = { ...mockApproval, approvedAsset: "0x0000000000000000000000000000000000000000" };
      
      assert.throws(
        () => bindTermsToApproval(terms, wrongAssetApproval),
        /Asset mismatch/
      );
    });

    it("rejects payTo mismatch", () => {
      const terms = parse402Challenge(mockChallengeBody)[0];
      const wrongPayToApproval = { ...mockApproval, approvedPayTo: "0x0000000000000000000000000000000000000000" };
      
      assert.throws(
        () => bindTermsToApproval(terms, wrongPayToApproval),
        /Recipient mismatch/
      );
    });

    it("rejects amount exceeding approval", () => {
      const terms = parse402Challenge(mockChallengeBody)[0];
      const lowAmountApproval = { ...mockApproval, approvedMaxAmount: "5000" };
      
      assert.throws(
        () => bindTermsToApproval(terms, lowAmountApproval),
        /Amount exceeds approval/
      );
    });

    it("accepts amount within approval", () => {
      const terms = parse402Challenge(mockChallengeBody)[0];
      const highAmountApproval = { ...mockApproval, approvedMaxAmount: "50000" };
      
      const intent = bindTermsToApproval(terms, highAmountApproval);
      assert.strictEqual(intent.state, "ready_to_sign");
    });

    it("compares atomic amounts exactly beyond JavaScript safe integers", () => {
      const terms = {
        ...parse402Challenge(mockChallengeBody)[0],
        maxAmountRequired: "9007199254740993",
      };
      const approval = { ...mockApproval, approvedMaxAmount: "9007199254740992" };
      assert.throws(() => bindTermsToApproval(terms, approval), /Amount exceeds approval/);
    });

    it("rejects non-atomic amount formats", () => {
      const terms = {
        ...parse402Challenge(mockChallengeBody)[0],
        maxAmountRequired: "0.01",
      };
      assert.throws(() => bindTermsToApproval(terms, mockApproval), /atomic units/);
    });

    it("dynamically binds challenge values", () => {
      // Test that mutating the challenge body changes the bound intent
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

      const terms1 = parse402Challenge(challenge1)[0];
      const terms2 = parse402Challenge(challenge2)[0];

      const approval1 = { ...mockApproval, approvedMaxAmount: "15000" };
      const approval2 = { ...mockApproval, approvedMaxAmount: "25000" };

      const intent1 = bindTermsToApproval(terms1, approval1);
      const intent2 = bindTermsToApproval(terms2, approval2);

      assert.strictEqual(intent1.terms.maxAmountRequired, "10000");
      assert.strictEqual(intent2.terms.maxAmountRequired, "20000");
      assert.notDeepStrictEqual(intent1.terms, intent2.terms);
    });
  });
});
