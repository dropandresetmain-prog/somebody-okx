/** Concrete, Node-only local composition. Construction performs no payment I/O. */
import { decodePaymentRequiredHeader } from "./challenge";
import { FilePaymentExecutionAuthority, resolvePaymentExecutionLedgerPath } from "./executionAuthority";
import { m3AuthorizedRequestFromIntent, parseM3ProtectedSuccess } from "./m3FounderNarrativeProduct";
import {
  parseSocialMediaGuruProtectedSuccess,
  socialMediaGuruAuthorizedRequestFromIntent,
  SOCIAL_MEDIA_GURU_SERVICE_ID,
} from "./socialMediaGuruProduct";
import { purchaseIdentityFromIntent } from "../management/m3BuyerRail";
import { FileFounderConfirmationLedger, resolveFounderConfirmationLedgerPath, createSupervisedSubmit } from "./supervisedDriverAdapter";
import { createXLayerJsonRpcTransport, readAndVerifyXLayerSettlement, XLAYER_TESTNET_NETWORK } from "./xlayerSettlement";
import { withAcquisitionRecording } from "./acquisitionRecordReplay";
import type { PurchaseRecord, SettlementObservation } from "./types";
import type { M3BuyerRailDeps } from "../management/m3BuyerRail";
import type { M3ProductionDriverDeps } from "../management/m3ProductionDriver";
import type { XLayerSettlementVerification } from "./xlayerSettlement";
import type { ExecutionIntent } from "../management/types";
import {
  allowedNetworksForExecutionMode,
  isFinancialSigningEnabled,
  readSomebodyExecutionMode,
} from "../execution/executionMode";

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
 * PURE production verification (V7 review R2). A result verifies only when:
 * 1. the purchase IS this intent's purchase — every field of the
 *    authoritative purchaseIdentityFromIntent mapping matches;
 * 2. the intent carries complete, adapter-declared authority for the target
 *    controlled Testnet product;
 * 3. the result passes the strict protected-result shape; and
 * 4. the result's provider/service/offering/resource class/request id/purpose
 *    kind/normalized purpose equal that authorized request exactly.
 */
export function verifyProductionM3Result(input: {
  intent: ExecutionIntent;
  purchase: PurchaseRecord;
  result: unknown;
}): { verified: boolean; verificationProof: string } {
  const { intent, purchase, result } = input;
  const expected = purchaseIdentityFromIntent(intent);
  const identity: string[] = [];
  for (const field of ["id", "objectiveKey", "resourceNeedId", "offeringId", "idempotencyKey"] as const) {
    if (purchase[field] !== expected[field]) identity.push(`purchase.${field} is not this intent's ${field}`);
  }
  if (identity.length > 0) {
    return { verified: false, verificationProof: `m3-purchase-intent-binding-rejected: ${identity.join("; ")}` };
  }

  const serviceId = intent.target?.serviceId?.trim() ?? "";
  if (serviceId === SOCIAL_MEDIA_GURU_SERVICE_ID) {
    const authorized = socialMediaGuruAuthorizedRequestFromIntent(intent);
    if (!authorized.ok) {
      return { verified: false, verificationProof: `m3-intent-authority-rejected: ${authorized.reason}` };
    }
    const parsed = parseSocialMediaGuruProtectedSuccess(result);
    if (!parsed) {
      return { verified: false, verificationProof: "m3-protected-result-rejected" };
    }
    const request = authorized.request;
    const bindings: string[] = [];
    const bind = (field: string, actual: unknown, wanted: string) => {
      if (actual !== wanted) bindings.push(`${field} ${String(actual ?? "null").slice(0, 120)} is not the authorized ${wanted.slice(0, 120)}`);
    };
    bind("requestId", parsed.requestId, request.requestId);
    bind("providerId", parsed.providerId, request.providerId);
    bind("serviceId", parsed.serviceId, request.serviceId);
    bind("offeringId", parsed.offeringId, request.offeringId);
    bind("resourceClass", parsed.resourceClass, request.resourceClass);
    bind("purposeKind", parsed.purposeKind, request.purposeKind);
    if (parsed.purpose !== request.purpose) bindings.push("purpose is not the authorized normalized purpose");
    if (bindings.length > 0) {
      return { verified: false, verificationProof: `m3-result-binding-rejected: ${bindings.join("; ")}` };
    }
    return { verified: true, verificationProof: `m3-protected-result:${purchase.id}+request-bound:${request.requestId}` };
  }

  const authorized = m3AuthorizedRequestFromIntent(intent);
  if (!authorized.ok) {
    return { verified: false, verificationProof: `m3-intent-authority-rejected: ${authorized.reason}` };
  }
  const parsed = parseM3ProtectedSuccess(result);
  if (!parsed) {
    return { verified: false, verificationProof: "m3-protected-result-rejected" };
  }
  const request = authorized.request;
  const bindings: string[] = [];
  const bind = (field: string, actual: unknown, wanted: string) => {
    if (actual !== wanted) bindings.push(`${field} ${String(actual ?? "null").slice(0, 120)} is not the authorized ${wanted.slice(0, 120)}`);
  };
  bind("requestId", parsed.requestId, request.requestId);
  bind("providerId", parsed.providerId, request.providerId);
  bind("serviceId", parsed.serviceId, request.serviceId);
  bind("offeringId", parsed.offeringId, request.offeringId);
  bind("resourceClass", parsed.resourceClass, request.resourceClass);
  bind("purposeKind", parsed.purposeKind, request.purposeKind);
  if (parsed.purpose !== request.purpose) bindings.push("purpose is not the authorized normalized purpose");
  if (bindings.length > 0) {
    return { verified: false, verificationProof: `m3-result-binding-rejected: ${bindings.join("; ")}` };
  }
  return { verified: true, verificationProof: `m3-protected-result:${purchase.id}+request-bound:${request.requestId}` };
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
  const mode = readSomebodyExecutionMode();
  const allowedNetworks = allowedNetworksForExecutionMode(mode);
  // Preview/inspect may still target the controlled Testnet merchant when the
  // mode has not opened any executable networks; discovery stays read-only.
  const previewNetworks =
    allowedNetworks.length > 0 ? allowedNetworks : [XLAYER_TESTNET_NETWORK];
  const merchantEndpoint =
    process.env.M3_MERCHANT_URL?.trim() ||
    (mode === "testnet_demo"
      ? "http://127.0.0.1:4021/m3/social-media-guru"
      : "http://127.0.0.1:4021/m3/paid-ping");
  return {
    merchantEndpoint,
    railConfig: { allowedNetworks: previewNetworks, maxSpend: process.env.M3_MAX_SPEND ?? "10000" },
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
 * replaying. The execute gate remains false unless SOMEBODY_EXECUTION_MODE
 * permits Testnet signing AND a supervised command explicitly sets
 * M4_M3_EXECUTION_ENABLED=true after founder confirmation.
 */
export function createLocalProductionComposition(applicationRoot: string): Pick<M3ProductionDriverDeps, "rail" | "railForPurchase" | "supervisedSubmit" | "executionAuthorized"> {
  const mode = readSomebodyExecutionMode();
  const preview = createLocalPreviewComposition(applicationRoot);
  const { merchantEndpoint, confirmations } = preview;
  const payer = required("M3_BUYER_ADDRESS");
  const authority = new FilePaymentExecutionAuthority(resolvePaymentExecutionLedgerPath(applicationRoot));
  // Signing-capable rail networks come ONLY from execution mode — never widen
  // to Mainnet under testnet_demo, even if a Mainnet offering is otherwise valid.
  const signingNetworks = allowedNetworksForExecutionMode(mode);
  const config = {
    ...preview.railConfig,
    allowedNetworks: signingNetworks.length > 0 ? signingNetworks : preview.railConfig.allowedNetworks,
  };
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
  // Opt-in (M2-I): when M3_VERIFIED_ACQUISITION_RECORD_DIR is an absolute path,
  // a verified observation is durably recorded. Disabled by default, in which
  // case this is a pure passthrough and the rail behaves exactly as before.
  const verifyResult: M3BuyerRailDeps["verifyResult"] = withAcquisitionRecording(verifyProductionM3Result);
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
    executionAuthorized: isFinancialSigningEnabled(mode, {
      supervisedExecutionEnabled: process.env.M4_M3_EXECUTION_ENABLED === "true",
    }),
  };
}
