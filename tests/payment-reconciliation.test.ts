import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { closeExpiredAuthorization } from "../lib/payment/reconciliation";

describe("expired payment authorization reconciliation", () => {
  const evidence = {
    validBefore: 100,
    observedAt: 101,
    directBalanceUnchanged: true,
    noOutgoingTransaction: true,
    noSettlementObserved: true,
  };

  it("formally closes only an expired, unsettled authorization", () => {
    assert.deepEqual(closeExpiredAuthorization(evidence), {
      classification: "EXPIRED_UNSETTLED",
      authorization: "expired",
      settlement: "not observed",
      outgoingTransfer: "not observed",
    });
  });

  it("refuses closure before expiry or with any settlement evidence", () => {
    assert.throws(
      () => closeExpiredAuthorization({ ...evidence, observedAt: 100 }),
      /not safely expired/,
    );
    assert.throws(
      () => closeExpiredAuthorization({ ...evidence, directBalanceUnchanged: false }),
      /no-settlement evidence/,
    );
    assert.throws(
      () => closeExpiredAuthorization({ ...evidence, noOutgoingTransaction: false }),
      /no-settlement evidence/,
    );
    assert.throws(
      () => closeExpiredAuthorization({ ...evidence, noSettlementObserved: false }),
      /no-settlement evidence/,
    );
  });
});
