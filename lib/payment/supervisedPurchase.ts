/** Bind one live challenge and one explicit approval to one purchase identity. */

import { bindPurchaseTerms } from "./purchase";
import { preparePayment, type PreparedPayment } from "./buyerRail";
import {
  acceptExecutionQuoteForPayment,
  confirmPreviewPaymentTerms,
  paymentTermsEqual,
  type ExecutionQuote,
  type FounderPaymentConfirmation,
  type OfficialQuotedPayment,
  type PreviewQuote,
} from "./onchainOsExecutor";
import {
  assertAssetDomainCompatible,
  readAssetDomainFacts,
  verifyAssetDomain,
  type AssetDomainVerdict,
} from "./assetDomain";
import type { JsonRpcTransport } from "./xlayerSettlement";
import type { PaymentApproval, PurchaseRecord, RailConfig } from "./types";

export type ReadyToSignPurchase = {
  purchase: PurchaseRecord;
  prepared: PreparedPayment;
};

/**
 * This is the application-owned boundary immediately before wallet signing.
 * It has no I/O and cannot authorize a different PurchaseRecord later.
 */
export function prepareApprovedPurchase(input: {
  purchase: PurchaseRecord;
  approval: PaymentApproval;
  challengeBody: unknown;
  config: RailConfig;
  intentId: string;
  at: number;
}): ReadyToSignPurchase {
  const prepared = preparePayment(
    input.challengeBody,
    input.approval,
    input.config,
    input.intentId,
  );
  return {
    purchase: bindPurchaseTerms(
      input.purchase,
      prepared.terms,
      input.approval,
      input.at,
    ),
    prepared,
  };
}

/**
 * Bind founder confirmation to preview economic terms for one purchase.
 * The local preview paymentId is intentionally not treated as authority.
 */
export function confirmApprovedPurchaseTerms(input: {
  purchase: PurchaseRecord;
  preview: PreviewQuote;
  confirmationId: string;
  confirmedAt: number;
}): FounderPaymentConfirmation {
  if (!input.purchase.boundTerms || !input.purchase.approval) {
    throw new Error("Purchase must be approved with bound terms before confirmation");
  }
  if (!paymentTermsEqual(input.purchase.boundTerms, input.preview.terms)) {
    throw new Error("Preview quote terms no longer match the approved purchase terms");
  }
  return confirmPreviewPaymentTerms({
    confirmationId: input.confirmationId,
    confirmedAt: input.confirmedAt,
    purchaseId: input.purchase.id,
    preview: input.preview,
  });
}

/**
 * After confirmation: accept a fresh ExecutionQuote only when material terms
 * still match. Local paymentId may differ from the preview handle.
 */
export function authorizeFreshExecutionQuote(input: {
  purchase: PurchaseRecord;
  confirmation: FounderPaymentConfirmation;
  execution: ExecutionQuote;
  now: number;
}): OfficialQuotedPayment {
  if (!input.purchase.boundTerms || !input.purchase.approval) {
    throw new Error("Purchase must remain approved before execution");
  }
  if (!paymentTermsEqual(input.purchase.boundTerms, input.execution.terms)) {
    throw new Error("Execution quote terms no longer match the approved purchase terms");
  }
  return acceptExecutionQuoteForPayment({
    confirmation: input.confirmation,
    purchaseId: input.purchase.id,
    execution: input.execution,
    now: input.now,
  });
}

/**
 * Read-only asset-domain preflight for an approved, ready-to-sign purchase.
 *
 * Enforcement deliberately depends on WHO builds the EIP-712 domain:
 *
 * - `"advisory"` (default) is for the official TEE path (`onchainos payment
 *   pay`). That path does NOT read the challenge's `extra.name` / `extra.version`
 *   at all: it posts the asset address and chain to the backend's `gen-msg-hash`
 *   and signs the `domainHash` the backend returns. A divergence between the
 *   challenge's advertised `extra` and the deployed token is therefore a real
 *   integration smell and worth recording, but it does NOT prove the signature
 *   will be rejected. Blocking on it here would refuse payments that can
 *   actually settle.
 *
 * - `"strict"` is for any path where WE supply the domain — notably
 *   `payment pay-local`, which reads `extra.name` / `extra.version` verbatim.
 *   There a mismatch is fatal: the signature is unverifiable by the token, the
 *   facilitator cannot settle, and the merchant keeps returning 402 with no
 *   funds moved.
 *
 * Never silently upgrade advisory to strict: the enforcement mode must track
 * the signing path actually in use.
 */
export async function preflightApprovedPurchaseAssetDomain(
  rpc: JsonRpcTransport,
  prepared: PreparedPayment,
  options: { decimals?: number; enforcement?: "advisory" | "strict" } = {},
): Promise<AssetDomainVerdict> {
  const expected = {
    name: prepared.terms.eip712.name,
    version: prepared.terms.eip712.version,
    decimals: options.decimals,
  };
  if (options.enforcement === "strict") {
    return assertAssetDomainCompatible(rpc, prepared.terms.asset, expected);
  }
  const facts = await readAssetDomainFacts(rpc, prepared.terms.asset);
  return verifyAssetDomain(facts, expected);
}
