/** Concrete, Node-only local composition. Construction performs no payment I/O. */
import { decodePaymentRequiredHeader } from "./challenge";
import { FilePaymentExecutionAuthority, resolvePaymentExecutionLedgerPath } from "./executionAuthority";
import {
  M3_PRODUCT_OFFERING_ID,
  M3_PRODUCT_SERVICE_ID,
  verifyM3ProtectedResult,
} from "./m3FounderNarrativeProduct";
import { FileFounderConfirmationLedger, resolveFounderConfirmationLedgerPath, createSupervisedSubmit } from "./supervisedDriverAdapter";
import { createXLayerJsonRpcTransport, readAndVerifyXLayerSettlement, XLAYER_TESTNET_NETWORK } from "./xlayerSettlement";
import type { PurchaseRecord, SettlementObservation } from "./types";
import type { M3BuyerRailDeps } from "../management/m3BuyerRail";
import type { M3ProductionDriverDeps } from "../management/m3ProductionDriver";
import type { XLayerSettlementVerification } from "./xlayerSettlement";
import type { ExecutionIntent } from "../management/types";

/**
 * PURE 1:1 mapping from the exact-settlement readback's four states onto the
 * rail's settlement observation. `reverted`/`mismatch` are OBSERVED terminal
 * facts and are carried through unchanged — never flattened into a boolean
 * that the rail could only read as "not yet".
 */
export function mapXLayerVerificationToObservation(
  result: XLayerSettlementVerification,
  settledAt: number,
): SettlementObservation {
  if (result.state === "settled") return { settled: true, observation: "settled", settledAt };
  if (result.state === "pending") return { settled: false, observation: "pending" };
  if (result.state === "reverted") {
    return { settled: false, observation: "reverted", transactionHash: result.transactionHash, ...(result.blockNumber !== undefined ? { blockNumber: result.blockNumber } : {}) };
  }
  return { settled: false, observation: "mismatch", reason: result.reason, ...(result.blockNumber !== undefined ? { blockNumber: result.blockNumber } : {}) };
}

/**
 * PURE production verification: protected-result shape truth AND binding to
 * THIS intent's exact normalized request identity (requestId = the derived
 * purchase/intent id, offeringId/serviceId = what the merchant request headers
 * for THIS intent carried). A well-formed result issued for a different
 * request never verifies. Purpose text is descriptive context, not authority.
 */
export function verifyProductionM3Result(input: {
  intent: ExecutionIntent;
  purchase: PurchaseRecord;
  result: unknown;
}): { verified: boolean; verificationProof: string } {
  const { intent, purchase, result } = input;
  if (!verifyM3ProtectedResult(result)) {
    return { verified: false, verificationProof: "m3-protected-result-rejected" };
  }
  const expectedOfferingId = intent.target.offeringId ?? M3_PRODUCT_OFFERING_ID;
  const bindings: string[] = [];
  if (result.requestId !== purchase.id) bindings.push(`requestId ${result.requestId ?? "null"} is not this purchase ${purchase.id}`);
  if (result.offeringId !== expectedOfferingId) bindings.push(`offeringId ${result.offeringId ?? "null"} is not the bound offering ${expectedOfferingId}`);
  if (result.serviceId !== M3_PRODUCT_SERVICE_ID) bindings.push(`serviceId ${result.serviceId} is not ${M3_PRODUCT_SERVICE_ID}`);
  if (bindings.length > 0) {
    return { verified: false, verificationProof: `m3-result-binding-rejected: ${bindings.join("; ")}` };
  }
  return { verified: true, verificationProof: `m3-protected-result:${purchase.id}+request-bound:${result.requestId}` };
}

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required for the local M3 production composition`);
  return value;
}

/** Node-only, non-financial dependencies for preview and confirmation commands. */
export function createLocalPreviewComposition(applicationRoot: string): {
  merchantEndpoint: string;
  railConfig: M3BuyerRailDeps["railConfig"];
  fetchChallenge: () => Promise<unknown>;
  confirmations: FileFounderConfirmationLedger;
} {
  const merchantEndpoint = process.env.M3_MERCHANT_URL ?? "http://127.0.0.1:4021/m3/paid-ping";
  return {
    merchantEndpoint,
    railConfig: { allowedNetworks: [XLAYER_TESTNET_NETWORK], maxSpend: process.env.M3_MAX_SPEND ?? "10000" },
    fetchChallenge: () => fetchChallenge(merchantEndpoint),
    confirmations: new FileFounderConfirmationLedger(resolveFounderConfirmationLedgerPath(applicationRoot)),
  };
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
  const preview = createLocalPreviewComposition(applicationRoot);
  const { merchantEndpoint, confirmations } = preview;
  const payer = required("M3_BUYER_ADDRESS");
  const authority = new FilePaymentExecutionAuthority(resolvePaymentExecutionLedgerPath(applicationRoot));
  const config = preview.railConfig;
  const settlementReaderForPurchase = (purchase: PurchaseRecord): M3BuyerRailDeps["settlementReader"] => ({
    async readSettlement(transactionHash) {
      if (!purchase.boundTerms) throw new Error("durable purchase has no bound terms");
      const attempt = authority.getAttemptForPurchase(purchase.id);
      if (!attempt?.transactionHash || attempt.transactionHash.toLowerCase() !== transactionHash.toLowerCase()) {
        // No durable submission for THIS tx: nothing was observed either way.
        // This is genuinely "not yet / not attributable" — an explicit pending
        // observation, never a fabricated boolean.
        return { settled: false, observation: "pending" };
      }
      const binding = authority.getSettlementBinding(attempt.attemptId, purchase.id, transactionHash);
      const authorization = authority.getAuthorizationIdentity(attempt.attemptId);
      const result = await readAndVerifyXLayerSettlement(createXLayerJsonRpcTransport(), {
        purchaseId: purchase.id, executionAttemptId: attempt.attemptId, executionBinding: binding, executionClaimedAt: attempt.claimedAt, authorization,
        network: purchase.boundTerms.network, transactionHash, asset: purchase.boundTerms.asset, amount: purchase.boundTerms.maxAmountRequired, payTo: purchase.boundTerms.payTo, payer,
      });
      // Carry the four-state readback truth 1:1 — reverted/mismatch are never
      // flattened into a boolean the rail could only read as "not yet".
      return mapXLayerVerificationToObservation(result, Date.now());
    },
  });
  const paidRequestSender: M3BuyerRailDeps["paidRequestSender"] = {
    // The ordinary official replay result is staged durably with the purchase.
    // If it is absent, this safe reader refuses rather than issuing a second
    // signed request; an operator can reconcile the provider out-of-band.
    async sendWithPayment() { return { success: false }; },
  };
  const verifyResult: M3BuyerRailDeps["verifyResult"] = verifyProductionM3Result;
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
