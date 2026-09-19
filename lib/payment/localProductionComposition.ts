/** Concrete, Node-only local composition. Construction performs no payment I/O. */
import path from "node:path";
import { decodePaymentRequiredHeader } from "./challenge";
import { FilePaymentExecutionAuthority, resolvePaymentExecutionLedgerPath } from "./executionAuthority";
import { verifyM3ProtectedResult } from "./m3Seller";
import { FileFounderConfirmationLedger, resolveFounderConfirmationLedgerPath, createSupervisedSubmit } from "./supervisedDriverAdapter";
import { createXLayerJsonRpcTransport, readAndVerifyXLayerSettlement, XLAYER_TESTNET_NETWORK } from "./xlayerSettlement";
import type { PurchaseRecord } from "./types";
import type { M3BuyerRailDeps } from "../management/m3BuyerRail";
import type { M3ProductionDriverDeps } from "../management/m3ProductionDriver";

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required for the local M3 production composition`);
  return value;
}

async function fetchChallenge(endpoint: string): Promise<unknown> {
  const response = await fetch(endpoint, { redirect: "manual", signal: AbortSignal.timeout(20_000) });
  if (response.status !== 402) throw new Error(`expected HTTP 402 challenge, got ${response.status}`);
  const encoded = response.headers.get("PAYMENT-REQUIRED");
  return encoded ? decodePaymentRequiredHeader(encoded) : response.json();
}

/**
 * Builds every real local dependency without fetching, signing, submitting, or
 * replaying. The execute gate remains false unless a future supervised command
 * explicitly sets M4_M3_EXECUTION_ENABLED=true after founder confirmation.
 */
export function createLocalProductionComposition(applicationRoot: string): Pick<M3ProductionDriverDeps, "rail" | "railForPurchase" | "supervisedSubmit" | "executionAuthorized"> {
  const merchantEndpoint = process.env.M3_MERCHANT_URL ?? "http://127.0.0.1:4021/m3/paid-ping";
  const payer = required("M3_BUYER_ADDRESS");
  const authority = new FilePaymentExecutionAuthority(resolvePaymentExecutionLedgerPath(applicationRoot));
  const confirmations = new FileFounderConfirmationLedger(resolveFounderConfirmationLedgerPath(applicationRoot));
  const config = { allowedNetworks: [XLAYER_TESTNET_NETWORK], maxSpend: process.env.M3_MAX_SPEND ?? "10000" };
  const settlementReaderForPurchase = (purchase: PurchaseRecord): M3BuyerRailDeps["settlementReader"] => ({
    async readSettlement(transactionHash) {
      if (!purchase.boundTerms) throw new Error("durable purchase has no bound terms");
      const attempt = authority.getAttemptForPurchase(purchase.id);
      if (!attempt?.transactionHash || attempt.transactionHash.toLowerCase() !== transactionHash.toLowerCase()) return { settled: false };
      const binding = authority.getSettlementBinding(attempt.attemptId, purchase.id, transactionHash);
      const authorization = authority.getAuthorizationIdentity(attempt.attemptId);
      const result = await readAndVerifyXLayerSettlement(createXLayerJsonRpcTransport(), {
        purchaseId: purchase.id, executionAttemptId: attempt.attemptId, executionBinding: binding, executionClaimedAt: attempt.claimedAt, authorization,
        network: purchase.boundTerms.network, transactionHash, asset: purchase.boundTerms.asset, amount: purchase.boundTerms.maxAmountRequired, payTo: purchase.boundTerms.payTo, payer,
      });
      return result.state === "settled" ? { settled: true, settledAt: Date.now() } : { settled: false };
    },
  });
  const paidRequestSender: M3BuyerRailDeps["paidRequestSender"] = {
    // The ordinary official replay result is staged durably with the purchase.
    // If it is absent, this safe reader refuses rather than issuing a second
    // signed request; an operator can reconcile the provider out-of-band.
    async sendWithPayment() { return { success: false }; },
  };
  const verifyResult: M3BuyerRailDeps["verifyResult"] = ({ result, purchase }) => ({
    verified: verifyM3ProtectedResult(result),
    verificationProof: verifyM3ProtectedResult(result) ? `m3-protected-result:${purchase.id}` : "m3-protected-result-rejected",
  });
  const submit = createSupervisedSubmit({ confirmations, merchantEndpoint, fetchChallenge: () => fetchChallenge(merchantEndpoint), executionAuthority: authority, settlementReaderForPurchase, paidRequestSender, verifyResult, railConfig: config });
  const railForPurchase = (purchase: PurchaseRecord): M3BuyerRailDeps => ({
    mode: "m3_available_bounded", railConfig: config, executor: { kind: "official_onchainos", async executeApprovedPayment() { throw new Error("observation rail cannot execute"); } },
    fetchLiveChallenge: async () => fetchChallenge(merchantEndpoint), buildApproval: () => null,
    settlementReader: settlementReaderForPurchase(purchase), paidRequestSender, verifyResult,
  });
  return {
    rail: railForPurchase({ id: "unavailable", objectiveKey: "", resourceNeedId: "", offeringId: "", idempotencyKey: "", state: "prepared", boundTerms: null, approval: null, receipt: null, result: null, verified: false, createdAt: 0, updatedAt: 0 }),
    railForPurchase,
    supervisedSubmit: submit,
    executionAuthorized: process.env.M4_M3_EXECUTION_ENABLED === "true",
  };
}
