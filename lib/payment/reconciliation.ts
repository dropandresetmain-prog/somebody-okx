/** Read-only evidence gate for closing an expired authorization. */

export type ExpiredAuthorizationEvidence = {
  validBefore: number;
  observedAt: number;
  directBalanceUnchanged: boolean;
  noOutgoingTransaction: boolean;
  noSettlementObserved: boolean;
};

export type ExpiredAuthorizationClosure = {
  classification: "EXPIRED_UNSETTLED";
  authorization: "expired";
  settlement: "not observed";
  outgoingTransfer: "not observed";
};

/**
 * Close an old authorization only after its validity window and all three
 * no-settlement observations are established. Any contrary evidence fails
 * closed so the caller cannot authorize a fresh payment.
 */
export function closeExpiredAuthorization(
  evidence: ExpiredAuthorizationEvidence,
): ExpiredAuthorizationClosure {
  if (!Number.isFinite(evidence.validBefore) || !Number.isFinite(evidence.observedAt)) {
    throw new Error("Authorization expiry evidence must contain finite timestamps");
  }
  if (evidence.observedAt <= evidence.validBefore) {
    throw new Error("Authorization is not safely expired");
  }
  if (
    !evidence.directBalanceUnchanged ||
    !evidence.noOutgoingTransaction ||
    !evidence.noSettlementObserved
  ) {
    throw new Error("Cannot close authorization without no-settlement evidence");
  }
  return {
    classification: "EXPIRED_UNSETTLED",
    authorization: "expired",
    settlement: "not observed",
    outgoingTransfer: "not observed",
  };
}
