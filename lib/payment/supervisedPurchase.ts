/** Bind one live challenge and one explicit approval to one purchase identity. */

import { bindPurchaseTerms } from "./purchase";
import { preparePayment, type PreparedPayment } from "./buyerRail";
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
