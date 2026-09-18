import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  acceptExecutionQuoteForPayment,
  confirmPreviewPaymentTerms,
  describeFounderApproval,
  EXECUTION_QUOTE_MAX_AGE_MS,
  paymentTermsFingerprint,
  PaymentTermsMutationError,
  StaleExecutionQuoteError,
  ConfirmationPurchaseMismatchError,
  type ExecutionQuote,
  type PreviewQuote,
} from "../lib/payment/onchainOsExecutor";
import type { NormalizedChallengeTerms } from "../lib/payment/types";
import { createPurchase } from "../lib/payment/purchase";
import {
  authorizeFreshExecutionQuote,
  confirmApprovedPurchaseTerms,
  prepareApprovedPurchase,
} from "../lib/payment/supervisedPurchase";

const terms: NormalizedChallengeTerms = {
  scheme: "exact",
  network: "eip155:1952",
  asset: "0xcb8bf24c6ce16ad21d707c9505421a17f2bec79d",
  maxAmountRequired: "10000",
  payTo: "0x3509655ad99effc7f3f74205482b1cb337ca08f7",
  resource: "/api/v1/pay/mock-merchant/resource",
  eip712: { name: "USDC_TEST", version: "1" },
  maxTimeoutSeconds: 60,
};

const challenge = {
  x402Version: 2,
  accepts: [{
    scheme: terms.scheme,
    network: terms.network,
    asset: terms.asset,
    maxAmountRequired: terms.maxAmountRequired,
    payTo: terms.payTo,
    resource: terms.resource,
    maxTimeoutSeconds: terms.maxTimeoutSeconds,
    extra: { name: terms.eip712.name, version: terms.eip712.version },
  }],
};

const approval = {
  approver: "founder",
  approvalId: "approval-m3-1",
  approvedMaxAmount: "10000",
  approvedNetwork: terms.network,
  approvedAsset: terms.asset,
  approvedPayTo: terms.payTo,
  approvedAt: 1,
};

function quote(paymentId: string, acquiredAt: number, override: Partial<NormalizedChallengeTerms> = {}): PreviewQuote {
  return {
    paymentId,
    selectedIndex: 0,
    acquiredAt,
    terms: { ...terms, ...override, eip712: override.eip712 ?? terms.eip712 },
  };
}

const input = {
  intentId: "intent-m3-1",
  scheme: terms.scheme,
  network: terms.network,
  asset: terms.asset,
  amount: terms.maxAmountRequired,
  payTo: terms.payTo,
  resource: terms.resource,
  eip712Name: terms.eip712.name,
  eip712Version: terms.eip712.version,
  maxTimeoutSeconds: terms.maxTimeoutSeconds,
  approvalId: "approval-m3-1",
};

describe("Founder approval surface", () => {
  it("renders the required confirmation surface without secrets", () => {
    const summary = describeFounderApproval({
      intentId: "intent-m3-1",
      terms,
      approval: {
        approver: "founder",
        approvalId: "approval-m3-1",
        approvedMaxAmount: "10000",
        approvedNetwork: terms.network,
        approvedAsset: terms.asset,
        approvedPayTo: terms.payTo,
        approvedAt: 1,
      },
      boundAt: 1,
      state: "ready_to_sign",
    }, "purchase-m3-1");
    assert.match(summary, /TESTNET/);
    assert.match(summary, /exact transaction terms/);
    assert.match(summary, /purchase id: purchase-m3-1/);
    assert.ok(!summary.toLowerCase().includes("private"));
  });
});

describe("PreviewQuote vs ExecutionQuote confirmation gate", () => {
  it("allows confirmation to survive quote replacement when material terms match", () => {
    const preview = quote("pay_preview_a", 1);
    const confirmation = confirmPreviewPaymentTerms({
      confirmationId: "conf-1",
      confirmedAt: 2,
      purchaseId: "purchase-a",
      preview,
    });
    const execution: ExecutionQuote = quote("pay_execution_b", 3);
    const accepted = acceptExecutionQuoteForPayment({
      confirmation,
      purchaseId: "purchase-a",
      execution,
      now: 10,
    });
    assert.equal(accepted.paymentId, "pay_execution_b");
    assert.notEqual(preview.paymentId, execution.paymentId);
    assert.equal(paymentTermsFingerprint(preview.terms), paymentTermsFingerprint(execution.terms));
  });

  it("rejects material mutations before payment for each economic field", () => {
    const preview = quote("pay_preview_a", 1);
    const confirmation = confirmPreviewPaymentTerms({
      confirmationId: "conf-1",
      confirmedAt: 2,
      purchaseId: "purchase-a",
      preview,
    });
    const mutations: Array<Partial<NormalizedChallengeTerms>> = [
      { maxAmountRequired: "20000" },
      { asset: "0x0000000000000000000000000000000000000001" },
      { payTo: "0x0000000000000000000000000000000000000002" },
      { network: "eip155:1" },
      { resource: "/other-resource" },
      { eip712: { name: "OTHER", version: "1" } },
      { eip712: { name: "USDC_TEST", version: "2" } },
    ];
    for (const mutation of mutations) {
      const execution = quote("pay_execution_mutated", 3, mutation);
      assert.throws(
        () => acceptExecutionQuoteForPayment({
          confirmation,
          purchaseId: "purchase-a",
          execution,
          now: 10,
        }),
        (error: unknown) => error instanceof PaymentTermsMutationError,
      );
    }
  });

  it("treats a changed local paymentId as acceptable when terms match", () => {
    const confirmation = confirmPreviewPaymentTerms({
      confirmationId: "conf-1",
      confirmedAt: 2,
      purchaseId: "purchase-a",
      preview: quote("pay_preview_a", 1),
    });
    const execution = quote("pay_totally_different_id", 3);
    const accepted = acceptExecutionQuoteForPayment({
      confirmation,
      purchaseId: "purchase-a",
      execution,
      now: 5,
    });
    assert.equal(accepted.paymentId, "pay_totally_different_id");
  });

  it("refuses a stale execution quote before invoking the payment executor", async () => {
    const confirmation = confirmPreviewPaymentTerms({
      confirmationId: "conf-1",
      confirmedAt: 2,
      purchaseId: "purchase-a",
      preview: quote("pay_preview_a", 1),
    });
    const stale = quote("pay_execution_stale", 1);
    assert.throws(
      () => acceptExecutionQuoteForPayment({
        confirmation,
        purchaseId: "purchase-a",
        execution: stale,
        now: 1 + EXECUTION_QUOTE_MAX_AGE_MS + 1,
      }),
      (error: unknown) => error instanceof StaleExecutionQuoteError,
    );

  });

  it("does not reuse confirmation across purchase identities", () => {
    const confirmation = confirmPreviewPaymentTerms({
      confirmationId: "conf-1",
      confirmedAt: 2,
      purchaseId: "purchase-a",
      preview: quote("pay_preview_a", 1),
    });
    assert.throws(
      () => acceptExecutionQuoteForPayment({
        confirmation,
        purchaseId: "purchase-b",
        execution: quote("pay_execution_b", 3),
        now: 10,
      }),
      (error: unknown) => error instanceof ConfirmationPurchaseMismatchError,
    );
  });

  it("supervised purchase confirmation binds terms and accepts a fresh matching execution quote", () => {
    const prepared = prepareApprovedPurchase({
      purchase: createPurchase({
        id: "purchase-m3-1",
        objectiveKey: "objective-m3",
        resourceNeedId: "need-mock-merchant",
        offeringId: "okx-mock-merchant",
        idempotencyKey: "idem-m3-1",
        at: 1,
      }),
      approval,
      challengeBody: challenge,
      config: { allowedNetworks: ["eip155:1952"], maxSpend: "10000" },
      intentId: "intent-m3-1",
      at: 2,
    });
    const preview = quote("pay_preview_local", 3);
    const confirmation = confirmApprovedPurchaseTerms({
      purchase: prepared.purchase,
      preview,
      confirmationId: "founder-conf-1",
      confirmedAt: 4,
    });
    assert.equal(confirmation.purchaseId, "purchase-m3-1");
    assert.equal(confirmation.confirmedTermsFingerprint, paymentTermsFingerprint(terms));

    const execution = quote("pay_execution_local", 5);
    const accepted = authorizeFreshExecutionQuote({
      purchase: prepared.purchase,
      confirmation,
      execution,
      now: 10,
    });
    assert.equal(accepted.paymentId, "pay_execution_local");
  });
});
