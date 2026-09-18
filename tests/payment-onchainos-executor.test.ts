import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  describeFounderApproval,
  OfficialOnchainosPaymentExecutor,
  OfficialPaymentAmbiguousError,
} from "../lib/payment/onchainOsExecutor";
import type { NormalizedChallengeTerms } from "../lib/payment/types";

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

describe("Official Onchain OS payment executor", () => {
  it("uses the pre-quoted exact payment id and retains only safe receipt metadata", async () => {
    let args: string[] = [];
    const executor = new OfficialOnchainosPaymentExecutor(
      { paymentId: "pay_quoted_1", selectedIndex: 0, terms },
      { confirmationId: "founder-confirmation-1", confirmedAt: 1 },
      async (command) => {
        args = command;
        return {
          ok: true,
          stderr: "",
          exitCode: 0,
          stdout: JSON.stringify({
            ok: true,
            data: {
              receipt: { txHash: "0xabc123" },
              authorization_header: "must-not-be-returned",
            },
          }),
        };
      },
    );

    const result = await executor.executeApprovedPayment(input);
    assert.deepEqual(args, ["payment", "pay", "--payment-id", "pay_quoted_1", "--selected-index", "0", "--yes"]);
    assert.equal(result.submitted, true);
    assert.equal(result.transactionHash, "0xabc123");
    assert.equal(result.paymentPayloadRef, "pay_quoted_1");
    assert.ok(!JSON.stringify(result).includes("authorization_header"));
  });

  it("refuses mainnet, changed terms, and a missing confirmation before invoking the CLI", async () => {
    let invoked = false;
    const runner = async () => {
      invoked = true;
      return { ok: true, stdout: "{}", stderr: "", exitCode: 0 };
    };
    const mainnet = new OfficialOnchainosPaymentExecutor(
      { paymentId: "pay_quoted_1", selectedIndex: 0, terms: { ...terms, network: "eip155:196" } },
      { confirmationId: "founder-confirmation-1", confirmedAt: 1 },
      runner,
    );
    await assert.rejects(() => mainnet.executeApprovedPayment({ ...input, network: "eip155:196" }), /X Layer Testnet/);

    const changedRecipient = new OfficialOnchainosPaymentExecutor(
      { paymentId: "pay_quoted_1", selectedIndex: 0, terms },
      { confirmationId: "founder-confirmation-1", confirmedAt: 1 },
      runner,
    );
    await assert.rejects(() => changedRecipient.executeApprovedPayment({ ...input, payTo: "0x0000000000000000000000000000000000000000" }), /quoted payTo/);
    await assert.rejects(() => changedRecipient.executeApprovedPayment({ ...input, eip712Name: "MUTATED" }), /EIP-712 domain/);
    assert.equal(invoked, false);
  });

  it("turns a non-clean command or receipt-less response into reconciliation, never a retry", async () => {
    const executor = new OfficialOnchainosPaymentExecutor(
      { paymentId: "pay_quoted_1", selectedIndex: 0, terms },
      { confirmationId: "founder-confirmation-1", confirmedAt: 1 },
      async () => ({ ok: false, stdout: "", stderr: "timeout", exitCode: null }),
    );
    await assert.rejects(
      () => executor.executeApprovedPayment(input),
      (error: unknown) => error instanceof OfficialPaymentAmbiguousError && error.paymentId === "pay_quoted_1",
    );

    const pending = new OfficialOnchainosPaymentExecutor(
      { paymentId: "pay_quoted_2", selectedIndex: 0, terms },
      { confirmationId: "founder-confirmation-1", confirmedAt: 1 },
      async () => ({
        ok: true,
        stderr: "",
        exitCode: 0,
        stdout: JSON.stringify({
          ok: true,
          data: { ok: false, status: "pending", txHash: null, decodedReceipt: null },
        }),
      }),
    );
    await assert.rejects(
      () => pending.executeApprovedPayment(input),
      (error: unknown) => error instanceof OfficialPaymentAmbiguousError && error.paymentId === "pay_quoted_2",
    );
  });

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
    assert.match(summary, /purchase id: purchase-m3-1/);
    assert.ok(!summary.toLowerCase().includes("private"));
  });
});
