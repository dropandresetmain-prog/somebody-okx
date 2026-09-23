/** Safe preview preparation: bind current M4 authority to one live M3 quote. */
import { mayHandOffExternally } from "../management/authorization";
import type { ExecutionIntent } from "../management/types";
import { buildQuoteFromChallenge } from "./onchainOsExecutor";
import { prepareApprovedPurchase } from "./supervisedPurchase";
import type { PaymentApproval, PurchaseRecord, RailConfig } from "./types";
import type { PreviewLedger, StoredPreviewQuote } from "./previewLedger";

function approvalFor(intent: ExecutionIntent, terms: StoredPreviewQuote["terms"], at: number): PaymentApproval {
  if (!mayHandOffExternally(intent.strategy, "m3_available_bounded", {
    spendApprovalId: intent.terms.approvalId,
    priceUsd: intent.terms.priceUsd,
  })) {
    throw new Error("M4 founder spend approval is missing or does not permit external acquisition");
  }
  if (!intent.terms.approvalId) throw new Error("M4 founder spend approval identity is required");
  return {
    approver: "founder",
    approvalId: intent.terms.approvalId,
    approvedMaxAmount: terms.maxAmountRequired,
    approvedNetwork: terms.network,
    approvedAsset: terms.asset,
    approvedPayTo: terms.payTo,
    approvedAt: at,
  };
}

/**
 * Fetching a preview is non-financial. It nevertheless converts one current
 * M4 approval identity into a durable M3 payment approval bound to exact live
 * terms; it never invokes an executor or stores a signing payload.
 */
export function prepareFounderVisiblePreview(input: {
  intent: ExecutionIntent;
  purchase: PurchaseRecord;
  challengeBody: unknown;
  railConfig: RailConfig;
  previews: PreviewLedger;
  at: number;
}): { purchase: PurchaseRecord; preview: StoredPreviewQuote } {
  if (input.intent.state !== "awaiting_m3" && input.intent.state !== "authorized") {
    throw new Error(
      `M4 intent is ${input.intent.state}, not authorized or awaiting_m3`,
    );
  }
  if (input.purchase.id !== input.intent.intentId || input.purchase.idempotencyKey !== input.intent.idempotencyKey) {
    throw new Error("purchase identity does not match the exact persisted execution intent");
  }
  if (input.purchase.state !== "prepared" && input.purchase.state !== "awaiting_approval") {
    throw new Error(`cannot acquire a new preview for M3 purchase already ${input.purchase.state}`);
  }
  const preview = buildQuoteFromChallenge(input.challengeBody, `preview_${input.purchase.id}_${input.at}`, input.at);
  const approval = approvalFor(input.intent, preview.terms, input.at);
  const bound = prepareApprovedPurchase({
    purchase: input.purchase,
    approval,
    challengeBody: input.challengeBody,
    config: input.railConfig,
    intentId: input.intent.intentId,
    at: input.at,
  }).purchase;
  const stored: StoredPreviewQuote = {
    paymentId: preview.paymentId,
    selectedIndex: preview.selectedIndex,
    terms: preview.terms,
    acquiredAt: preview.acquiredAt,
    normalization: preview.normalization,
  };
  return { purchase: bound, preview: input.previews.put(bound.id, stored) };
}
