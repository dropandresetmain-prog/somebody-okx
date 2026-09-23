// Item H — financial/result truth in the M3 payment seam (no signing, no
// payment, no merchant invocation anywhere in this file).
//
// Defect 1 (settlement flattening): the production composition collapsed the
// exact-settlement readback's four states into a boolean, so an OBSERVED
// reverted receipt (status 0x0 = proven non-settlement) and an OBSERVED
// mismatch both looked identical to "not yet" and the rail rested forever at
// `submitted`. The observation is now a typed four-state surface, and the rail
// must record reverted/mismatch as loud reconciliation evidence — never as
// pending, never as a settled success, never authorizing blind repayment.
//
// Defect 2 (unbound result verification): the production verifier shape-checked
// the protected result only, so a well-formed result issued for a DIFFERENT
// request would verify against this purchase. The verifier now binds the result
// to this intent's exact normalized request identity.
import test from "node:test";
import assert from "node:assert/strict";

import {
  mapXLayerVerificationToObservation,
  verifyProductionM3Result,
} from "../lib/payment/localProductionComposition";
import { observePurchase } from "../lib/management/m3BuyerRail";
import { transition } from "../lib/payment/lifecycle";
import { buildM3ProtectedSuccess } from "../lib/payment/m3FounderNarrativeProduct";
import type { M3BuyerRailDeps } from "../lib/management/m3BuyerRail";
import type { ExecutionIntent } from "../lib/management/types";
import type { PaymentContext, PurchaseRecord } from "../lib/payment/types";

const at = 2_000_000_000_000;
const TX = `0x${"a".repeat(64)}`;

const intent: ExecutionIntent = {
  intentId: "int_h_truth", idempotencyKey: "idem_h_truth", objectiveKey: "obj_h",
  requirementKey: "req_h", contractRevision: 1, decisionId: "dec_h", kind: "external_acquisition",
  strategy: "BUY",
  target: { offeringId: "somebody_controlled_test:founder_narrative_pulse", providerId: "somebody_controlled_test", serviceId: "founder_narrative_pulse", resourceClass: "proprietary_data", endpointRef: null },
  terms: { priceUsd: 4, priceProvenance: "provider_quote", requiresApproval: true, approvalId: "approval_h" },
  state: "handed_off", attempts: 1, lastEventId: null, resultEvidenceId: null, verificationEvidenceId: null,
  boundaryNote: "submitted; awaiting settlement observation", createdAt: at, updatedAt: at,
  purpose: "Qualitative read on founder messaging resonance for the one-person-company narrative.",
  // V7 review R4: the bound need's application-validated requested scope.
  requestedPurposeKind: "founder_messaging_qualitative",
};

const submittedPurchase: PurchaseRecord = {
  id: intent.intentId, objectiveKey: intent.objectiveKey, resourceNeedId: intent.requirementKey,
  offeringId: intent.target.offeringId!, idempotencyKey: intent.idempotencyKey,
  state: "submitted",
  boundTerms: {
    scheme: "exact", network: "eip155:1952", asset: "0x9e29b3aada05bf2d2c827af80bd28dc0b9b4fb0c",
    maxAmountRequired: "10000", payTo: "0x0000000000000000000000000000000000000123",
    resource: "/m3/paid-ping", eip712: { name: "USDT0", version: "1" }, maxTimeoutSeconds: 60,
  },
  approval: { approver: "founder", approvalId: "approval_h", approvedAt: at, approvedMaxAmount: "10000", approvedNetwork: "eip155:1952", approvedAsset: "0x9e29b3aada05bf2d2c827af80bd28dc0b9b4fb0c", approvedPayTo: "0x0000000000000000000000000000000000000123" },
  receipt: { transactionHash: TX }, stagedProviderResult: undefined, result: null, verified: false,
  createdAt: at, updatedAt: at,
};

function railDeps(settlement: M3BuyerRailDeps["settlementReader"]): M3BuyerRailDeps {
  const unavailable = async (): Promise<never> => { throw new Error("H focused tests must not invoke payment/provider I/O"); };
  return {
    mode: "m3_available_bounded", now: () => at,
    railConfig: { allowedNetworks: ["eip155:1952"], maxSpend: "10000" },
    executor: { kind: "test_scaffold", async executeApprovedPayment() { throw new Error("no execution from an observation rail"); } },
    fetchLiveChallenge: unavailable, buildApproval: () => null,
    settlementReader: settlement,
    paidRequestSender: { sendWithPayment: unavailable },
    verifyResult: () => ({ verified: false, verificationProof: "unused" }),
  };
}

// ── 1. The composition mapping is a lossless 1:1 four-state carrier ──────────

test("H1: the readback mapping carries settled/pending/reverted/mismatch 1:1 and never flattens", () => {
  assert.deepEqual(
    mapXLayerVerificationToObservation({ state: "settled", transactionHash: TX, blockNumber: "0x10", transferLogIndex: 2 }, at + 5),
    { settled: true, observation: "settled", settledAt: at + 5 },
  );
  assert.deepEqual(
    mapXLayerVerificationToObservation({ state: "pending", transactionHash: TX }, at + 5),
    { settled: false, observation: "pending" },
  );
  assert.deepEqual(
    mapXLayerVerificationToObservation({ state: "reverted", transactionHash: TX, blockNumber: "0x11" }, at + 5),
    { settled: false, observation: "reverted", transactionHash: TX, blockNumber: "0x11" },
  );
  assert.deepEqual(
    mapXLayerVerificationToObservation({ state: "mismatch", transactionHash: TX, reason: "receipt status is neither successful nor reverted" }, at + 5),
    { settled: false, observation: "mismatch", reason: "receipt status is neither successful nor reverted" },
  );
  // A reverted observation is NOT equal to a pending observation on any field
  // the rail reads — this is exactly the flattening the old boolean destroyed.
  const reverted = mapXLayerVerificationToObservation({ state: "reverted", transactionHash: TX }, at);
  const pending = mapXLayerVerificationToObservation({ state: "pending", transactionHash: TX }, at);
  assert.notDeepEqual(reverted, pending);
  assert.equal("observation" in reverted && reverted.observation, "reverted");
});

// ── 2. Reverted receipt: loud reconciliation, never rest-as-pending ──────────

test("H2: an observed reverted receipt records reconciliation_required with the revert proof and never rests as pending", async () => {
  const deps = railDeps({
    async readSettlement() { return { settled: false, observation: "reverted", transactionHash: TX, blockNumber: "0x11" }; },
  });
  const observed = await observePurchase(intent, submittedPurchase, deps);
  assert.equal(observed.purchase?.state, "reconciliation_required", "a proven non-settlement cannot stay at submitted");
  assert.equal(observed.m3State, "reconciliation_required");
  assert.equal(observed.reconciliationRequired, true);
  assert.equal(observed.resting, true, "reconciliation rests — the rail stops and waits for authority");
  assert.equal(observed.terminal, false, "reconciliation is not a payment failure verdict");
  assert.equal(observed.intent.state, "reconciliation_required");
  assert.match(observed.detail, /OBSERVED a reverted receipt/);
  assert.match(observed.detail, /NOT pending/);
  assert.match(observed.detail, /no blind repayment/i);
  assert.ok(observed.detail.includes(TX), "the tx hash is named in the durable detail");
  assert.ok(observed.events.some((e) => e.reason === "recovery_event"), "a recovery wake is emitted for reconciliation");
});

test("H2b: an observed mismatch is recorded as reconciliation, never as 'not yet'", async () => {
  const deps = railDeps({
    async readSettlement() { return { settled: false, observation: "mismatch", reason: "receipt transactionHash does not match requested hash" }; },
  });
  const observed = await observePurchase(intent, submittedPurchase, deps);
  assert.equal(observed.purchase?.state, "reconciliation_required");
  assert.equal(observed.reconciliationRequired, true);
  assert.match(observed.detail, /OBSERVED a mismatch/);
  assert.ok(observed.detail.includes("receipt transactionHash does not match requested hash"), "the mismatch reason is carried verbatim");
  assert.match(observed.detail, /NOT pending/);
});

test("H2c: explicit pending still rests at submitted, and the old boolean-only readers keep their exact prior behavior", async () => {
  // Explicit pending — truthful REST, unchanged.
  const explicit = await observePurchase(intent, submittedPurchase, railDeps({
    async readSettlement() { return { settled: false, observation: "pending" }; },
  }));
  assert.equal(explicit.m3State, "submitted");
  assert.equal(explicit.resting, true);
  assert.equal(explicit.reconciliationRequired, false);
  assert.match(explicit.detail, /settlement not yet observed/);
  // Legacy boolean-only readers (FakeSettlementReader, driver fakes) cannot
  // classify; the rail must treat them exactly as before, NOT as terminal.
  for (const legacy of [{ settled: false }, { settled: false, settledAt: undefined }] as const) {
    const result = await observePurchase(intent, submittedPurchase, railDeps({ async readSettlement() { return legacy; } }));
    assert.equal(result.m3State, "submitted", `legacy ${JSON.stringify(legacy)} must rest, not reconcile`);
    assert.equal(result.reconciliationRequired, false);
  }
  // A legacy settled:true observation still advances exactly one fact.
  const advanced = await observePurchase(intent, submittedPurchase, railDeps({
    async readSettlement() { return { settled: true, settledAt: at + 1000 }; },
  }));
  assert.equal(advanced.m3State, "settled");
  assert.equal(advanced.purchase?.receipt?.settledAt, at + 1000);
});

test("H2d: the lifecycle itself refuses to read a revert as a settlement (reverted never reaches settled through M3's machine)", () => {
  const ctx: PaymentContext = { approvalId: "approval_h", transactionHash: TX };
  const rejected = transition("submitted", { type: "confirm_settlement", settlementProof: "forged" }, ctx);
  assert.ok(rejected.success, "confirm_settlement is legal from submitted — provenance is the reader's burden");
  const reported = transition("submitted", { type: "report_failure", failureReason: "settlement reverted on-chain: receipt status 0x0" }, ctx);
  assert.ok(reported.success);
  if (reported.success) {
    assert.equal(reported.state, "reconciliation_required", "post-submission failure evidence reconciles; it never silently re-spends");
    assert.match(reported.context.failureReason ?? "", /reverted/);
    assert.equal(reported.context.transactionHash, TX, "the submission identity is preserved for reconciliation");
  }
});

// ── 3. Result verification binds to THIS intent's exact request ─────────────

test("H3: a well-formed protected result bound to this purchase/intent verifies with a binding proof", () => {
  const result = buildM3ProtectedSuccess({
    purpose: intent.purpose ?? "", purposeKind: "founder_messaging_qualitative",
    requestId: intent.intentId, offeringId: intent.target.offeringId,
  });
  const verified = verifyProductionM3Result({ intent, purchase: submittedPurchase, result });
  assert.equal(verified.verified, true);
  assert.match(verified.verificationProof, /m3-protected-result:int_h_truth\+request-bound:int_h_truth/);
});

test("H3b: the same well-formed result issued for a DIFFERENT request refuses verification", () => {
  const crossBound = buildM3ProtectedSuccess({
    purpose: "Identical valid qualitative purpose prose.", purposeKind: "founder_messaging_qualitative",
    requestId: "int_some_other_purchase", offeringId: intent.target.offeringId,
  });
  const rejected = verifyProductionM3Result({ intent, purchase: submittedPurchase, result: crossBound });
  assert.equal(rejected.verified, false, "shape truth alone must never verify a foreign request's result");
  assert.match(rejected.verificationProof, /m3-result-binding-rejected/);
  assert.ok(rejected.verificationProof.includes("int_some_other_purchase"), "the proof names the mismatching requestId");
});

test("H3c: null identity and offering drift refuse verification; a bare intent is never bound through the demo-offering fallback", () => {
  const nullIdentity = buildM3ProtectedSuccess({
    purpose: intent.purpose ?? "", purposeKind: "founder_messaging_qualitative", requestId: null, offeringId: null,
  });
  const nullRejected = verifyProductionM3Result({ intent, purchase: submittedPurchase, result: nullIdentity });
  assert.equal(nullRejected.verified, false);
  assert.match(nullRejected.verificationProof, /requestId null is not the authorized int_h_truth/);
  assert.match(nullRejected.verificationProof, /offeringId null is not the authorized/);

  const offeringDrift = buildM3ProtectedSuccess({
    purpose: intent.purpose ?? "", purposeKind: "founder_messaging_qualitative",
    requestId: intent.intentId, offeringId: "someone_elses:offering",
  });
  const driftRejected = verifyProductionM3Result({ intent, purchase: submittedPurchase, result: offeringDrift });
  assert.equal(driftRejected.verified, false);
  assert.match(driftRejected.verificationProof, /offeringId someone_elses:offering is not the authorized/);

  // V7 review R2: an intent with no concrete offering carries INCOMPLETE
  // authority. It is never completed by substituting the canonical demo
  // offering — neither a null echo nor a demo-offering echo verifies, and
  // (see R2 tests) no merchant request is even built for it.
  const bareIntent: ExecutionIntent = { ...intent, target: { ...intent.target, offeringId: null } };
  const barePurchase: PurchaseRecord = { ...submittedPurchase, offeringId: bareIntent.intentId };
  const unattributed = buildM3ProtectedSuccess({
    purpose: intent.purpose ?? "", purposeKind: "founder_messaging_qualitative",
    requestId: intent.intentId, offeringId: null,
  });
  assert.equal(verifyProductionM3Result({ intent: bareIntent, purchase: barePurchase, result: unattributed }).verified, false);
  const fallbackBound = buildM3ProtectedSuccess({
    purpose: intent.purpose ?? "", purposeKind: "founder_messaging_qualitative",
    requestId: intent.intentId, offeringId: "somebody_controlled_test:founder_narrative_pulse",
  });
  const fallbackRejected = verifyProductionM3Result({ intent: bareIntent, purchase: barePurchase, result: fallbackBound });
  assert.equal(fallbackRejected.verified, false);
  assert.match(fallbackRejected.verificationProof, /m3-intent-authority-rejected: .*no offeringId/);
});

test("H3d: a malformed or foreign result still fails the shape gate before any binding is claimed", () => {
  for (const junk of [null, undefined, "ok", {}, { ok: false }, { ok: true, productId: "paid_ping" }]) {
    const rejected = verifyProductionM3Result({ intent, purchase: submittedPurchase, result: junk });
    assert.equal(rejected.verified, false);
    assert.equal(rejected.verificationProof, "m3-protected-result-rejected");
  }
});
