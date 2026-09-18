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
 * Run this after `prepareApprovedPurchase` and BEFORE constructing the payment
 * executor. It proves that the EIP-712 domain the 402 challenge tells us to
 * sign actually matches the deployed token. A mismatch here is terminal for the
 * attempt: the resulting signature would be unverifiable by the asset, so the
 * facilitator could never settle it and the merchant would keep returning 402
 * with no funds moved and no transaction to reconcile.
 *
 * Throws `AssetDomainMismatchError` on a proven mismatch. Returns the verdict
 * otherwise so an `unverifiable` result is recorded rather than assumed safe.
 */
export async function preflightApprovedPurchaseAssetDomain(
  rpc: JsonRpcTransport,
  prepared: PreparedPayment,
  decimals?: number,
): Promise<AssetDomainVerdict> {
  return assertAssetDomainCompatible(rpc, prepared.terms.asset, {
    name: prepared.terms.eip712.name,
    version: prepared.terms.eip712.version,
    decimals,
  });
}
