// M4 × M3 INTEGRATION SEAM — focused tests (P1–P10).
//
// CLOUD INTEGRATION PROOF / SIMULATED FINANCIAL EXECUTION.
//
// These tests prove the application-owned seam between the closed M4 management
// engine and the frozen accepted M3 buyer rail. They call the REAL integration
// code (`lib/management/m3BuyerRail.ts`) and the REAL M3 functions it drives
// (parse402Challenge / createPurchase / prepareApprovedPurchase → preparePayment
// /bindTermsToApproval / executeApprovedPayment / lifecycle.transition) and the
// REAL M4 kernels (createIntentFromAuthorization / advanceIntent / applyRailEvent
// / planWakeForRailEvent / mayHandOffExternally / attemptRequirementSatisfaction).
//
// The ONLY fakes are at the injected dependency boundary M3 itself defines:
//   - a deterministic fake PaymentExecutor (kind: "test_scaffold"), labelled and
//     NEVER marked live; it does not sign, submit, or move money;
//   - synthetic 402 challenge fixtures;
//   - deterministic settlement / provider-readback fakes.
// No live payment, no wallet, no signing, no blockchain, no provider call.
//
// The M3 state machine is NOT reimplemented here — the tests drive it through
// the seam and assert the resulting M3 PurchaseRecord state + M4 intent state.

import test from "node:test";
import assert from "node:assert/strict";

import {
  handoffIntentToM3,
  observePurchase,
  runPurchaseLifecycle,
  purchaseIdentityFromIntent,
  purchaseRecordFromIntent,
  m3BuyerRailAdapter,
  type M3BuyerRailDeps,
} from "../lib/management/m3BuyerRail";
import { createIntentFromAuthorization } from "../lib/management/intents";
import {
  optionIdFor,
  withEligibility,
  eligibilityInputFor,
  buildExternalOption,
  EMPTY_FACTS,
  type EligibilityFacts,
} from "../lib/management/options";
import { attemptRequirementSatisfaction, type ProofFacts } from "../lib/management/requirements";
import type {
  AuthorizationResult,
  ExecutionIntent,
  GroundedOption,
  Requirement,
} from "../lib/management/types";
import { CP2_REQUIREMENT_FIELDS } from "./helpers/cp2Requirement";
import type {
  PaymentExecutor,
  PaymentSubmissionResult,
  SettlementReader,
  PaidRequestSender,
  RailConfig,
} from "../lib/payment/types";

// ── deterministic constants ──────────────────────────────────────────────────

const at0 = 1950000000000;
const OBJECTIVE = "obj_integration";
const REQ_KEY = "acquire_market_intel";

// A synthetic X Layer Testnet 402 challenge (eip155:1952), modelled on the
// recorded live Mock Merchant shape. This is a FIXTURE, not a live challenge.
const TESTNET = "eip155:1952";
const ASSET = "0xcb8bf24c6ce16ad21d707c9505421a17f2bec79d";
const PAYTO = "0x3509655ad99effc7f3f74205482b1cb337ca08f7";
const RESOURCE = "/api/v1/pay/mock-merchant/resource";
const AMOUNT = "10000"; // 0.01 USDT0 atomic units

// The wire shape of one `accepts[]` entry. x402 v2 uses `amount` (the parser
// also accepts the legacy `maxAmountRequired`, but never both in disagreement).
type ChallengeEntryOverride = {
  scheme?: string;
  network?: string;
  asset?: string;
  amount?: string;
  payTo?: string;
  resource?: string;
  maxTimeoutSeconds?: number;
};

function syntheticChallenge(overrides: ChallengeEntryOverride = {}): unknown {
  return {
    x402Version: 2,
    resource: { url: RESOURCE },
    accepts: [
      {
        scheme: "exact",
        network: TESTNET,
        asset: ASSET,
        amount: AMOUNT,
        payTo: PAYTO,
        resource: RESOURCE,
        maxTimeoutSeconds: 60,
        extra: { name: "USDT0_TEST", version: "1" },
        ...overrides,
      },
    ],
  };
}

const RAIL_CONFIG: RailConfig = { allowedNetworks: [TESTNET], maxSpend: AMOUNT };

// ── build a REAL authorized BUY intent through M4 code ───────────────────────

const eligibilityFacts: EligibilityFacts = {
  requiredResourceClasses: ["proprietary_data"],
  controlledResourceClasses: [],
  deadlineAt: null,
  now: at0,
  estimatedMinutes: null,
  requiresMandatoryProof: false,
  proofAvailable: true,
  workerAvailable: null,
  spendAuthorityUsd: 10,
  budgetRemainingUsd: 100,
};

function eligibleBuyOption(priceUsd = 4): GroundedOption {
  const option = buildExternalOption({
    requirementKey: REQ_KEY,
    contractRevision: 1,
    offeringId: "reg_offer_integration",
    providerId: "prov_okx_mock",
    serviceId: "svc_mock_merchant",
    resourceClass: "proprietary_data",
    priceUsd,
    priceProvenance: "provider_quote",
    registryVerified: true,
    compatibleResourceClass: true,
    executionPathConfigured: true,
    purposeScopeCompatible: true,
    facts: {
      ...EMPTY_FACTS,
      externalPriceUsd: {
        value: priceUsd,
        provenance: "provider_quote" as const,
        sourceRef: "reg_offer_integration",
        observedAt: at0,
        confidence: "high" as const,
      },
    },
  });
  return withEligibility([option], (o) => eligibilityInputFor(o, eligibilityFacts))[0];
}

// A REAL authorization carrying a bound founder spend approval (A4 discipline).
function authorizedBuy(spendApprovalId: string | null, priceUsd = 4): AuthorizationResult {
  return {
    kind: "authorized",
    decisionId: "dec_integration_1",
    requirementKey: REQ_KEY,
    contractRevision: 1,
    strategy: "BUY",
    optionId: optionIdFor({
      requirementKey: REQ_KEY,
      contractRevision: 1,
      kind: "external",
      target: "external:reg_offer_integration",
    }),
    authorizedAt: at0,
    spendApprovalId,
  };
}

// Build the intent through the REAL M4 creation path. `mode` controls whether
// the intent is born hand-offable (m3_available_bounded + approval) or resting.
function makeIntent(opts: {
  spendApprovalId: string | null;
  mode?: "m3_unavailable" | "m3_available_bounded" | "external_disabled";
  priceUsd?: number;
  contractRevision?: number;
} = { spendApprovalId: "appr_founder_integration_1" }): ExecutionIntent {
  const mode = opts.mode ?? "m3_available_bounded";
  const priceUsd = opts.priceUsd ?? 4;
  const option = eligibleBuyOption(priceUsd);
  const authorization = { ...authorizedBuy(opts.spendApprovalId, priceUsd), contractRevision: opts.contractRevision ?? 1 };
  const built = createIntentFromAuthorization({
    objectiveKey: OBJECTIVE,
    authorization,
    option,
    at: at0,
    mode,
  });
  assert.equal(built.ok, true, built.ok ? "" : built.reason);
  if (!built.ok) throw new Error("intent fixture invalid");
  return built.intent;
}

// ── deterministic fake M3 dependencies ───────────────────────────────────────

// A deterministic fake executor. kind is "test_scaffold" so it can never be
// mistaken for production; the note is labelled SIMULATED. It performs NO
// signing, submission, or money movement — it returns a deterministic tx hash.
function fakeExecutor(behavior: {
  submitted?: boolean;
  txHash?: string;
  throwName?: string;
  ambiguousResult?: boolean;
} = {}): PaymentExecutor {
  const submitted = behavior.submitted ?? true;
  const txHash = behavior.txHash ?? "0xsimulatedtxhash0000000000000000000000000000000000000000000000000001";
  return {
    kind: "test_scaffold" as const,
    async executeApprovedPayment(): Promise<PaymentSubmissionResult> {
      if (behavior.throwName) {
        const err = new Error("simulated executor failure");
        err.name = behavior.throwName;
        throw err;
      }
      if (!submitted) {
        return {
          submitted: false,
          note: "SIMULATED test_scaffold — executor reported no submission",
          safeResponse: behavior.ambiguousResult
            ? { ok: null, exitCode: null, data: null }
            : { ok: false, exitCode: 1, data: { error: "pre-submission rejection" } },
        };
      }
      return {
        submitted: true,
        transactionHash: txHash,
        note: "SIMULATED test_scaffold — NOT a live payment; no signing or blockchain submission occurred",
      };
    },
  };
}

// Deterministic settlement reader driven by a settable map.
function fakeSettlementReader(): SettlementReader & {
  setSettled(txHash: string, settled: boolean, settledAt?: number): void;
} {
  const settlements = new Map<string, { settled: boolean; settledAt?: number }>();
  return {
    setSettled(txHash, settled, settledAt) {
      settlements.set(txHash, { settled, settledAt });
    },
    async readSettlement(txHash) {
      return settlements.get(txHash) ?? { settled: false };
    },
  };
}

// Deterministic provider paid-response sender.
function fakePaidSender(): PaidRequestSender & {
  setResult(resource: string, success: boolean, result?: unknown): void;
} {
  const results = new Map<string, { success: boolean; result?: unknown }>();
  return {
    setResult(resource, success, result) {
      results.set(resource, { success, result });
    },
    async sendWithPayment(resource) {
      const preset = results.get(resource);
      if (preset) return preset;
      return { success: false }; // default: provider result not yet retrievable
    },
  };
}

// Build the full injected dep set. Every fake is deterministic and labelled.
function makeDeps(opts: {
  challenge?: unknown;
  executor?: PaymentExecutor;
  settlement?: SettlementReader;
  paid?: PaidRequestSender;
  buildApproval?: M3BuyerRailDeps["buildApproval"];
  verifyResult?: M3BuyerRailDeps["verifyResult"];
  mode?: M3BuyerRailDeps["mode"];
} = {}): M3BuyerRailDeps {
  return {
    executor: opts.executor ?? fakeExecutor(),
    fetchLiveChallenge: async () => opts.challenge ?? syntheticChallenge(),
    settlementReader: opts.settlement ?? fakeSettlementReader(),
    paidRequestSender: opts.paid ?? fakePaidSender(),
    // The approval factory binds M3's PaymentApproval to the LIVE terms + the
    // founder approval identity carried on the intent. This is where M4's
    // authorization becomes an explicit M3 payment approval — never implied.
    buildApproval:
      opts.buildApproval ??
      (({ intent, liveTerms, approvalId }) =>
        approvalId
          ? {
              approver: "founder",
              approvalId,
              approvedMaxAmount: liveTerms.maxAmountRequired,
              approvedNetwork: liveTerms.network,
              approvedAsset: liveTerms.asset,
              approvedPayTo: liveTerms.payTo,
              approvedAt: at0,
            }
          : null),
    verifyResult:
      opts.verifyResult ??
      (() => ({ verified: true, verificationProof: "simulated-protected-result-contract-ok" })),
    railConfig: RAIL_CONFIG,
    mode: opts.mode ?? "m3_available_bounded",
    now: () => at0,
  };
}

// ── P1 — no grant ⇒ approval_required, no M3 execution, no executable purchase ─

test("P1: BUY with no founder spend grant is not handed off and creates no executable purchase", async () => {
  // An intent with NO bound approval. M4's createIntentFromAuthorization under
  // m3_available_bounded still records it, but terms.approvalId is null and
  // requiresApproval is true, so mayHandOffExternally fails closed.
  const intent = makeIntent({ spendApprovalId: null });
  assert.equal(intent.terms.approvalId, null);
  assert.equal(intent.terms.requiresApproval, true);

  const executor = fakeExecutor();
  let executed = false;
  const spyingExecutor: PaymentExecutor = {
    kind: "test_scaffold",
    async executeApprovedPayment(input) {
      executed = true;
      return executor.executeApprovedPayment(input);
    },
  };
  const result = await handoffIntentToM3(intent, makeDeps({ executor: spyingExecutor }));

  assert.equal(result.handedOff, false, "must NOT hand off without a grant");
  assert.equal(result.purchase, null, "no PurchaseRecord may be created without authority");
  assert.equal(executed, false, "the M3 executor must NEVER be reached");
  // An unapproved monetary BUY is born fail-closed in awaiting_m3 (intents.ts),
  // and the refused hand-off returns it UNCHANGED — it rests, it is not failed.
  assert.equal(result.intent.state, "awaiting_m3", "intent rests in awaiting_m3, not failed");
  assert.equal(result.intent.state, intent.state, "the intent is returned unchanged");
  assert.match(result.detail, /no founder spend approval is bound/i);
});

test("P1b: external_disabled mode never hands off even with an approval bound", async () => {
  const intent = makeIntent({ spendApprovalId: "appr_x", mode: "external_disabled" });
  // Under external_disabled the intent is born in awaiting_m3 (not hand-offable).
  const result = await handoffIntentToM3(intent, makeDeps({ mode: "external_disabled" }));
  assert.equal(result.handedOff, false);
  assert.equal(result.purchase, null);
});

// ── P2 — one intent, one purchase; replay is idempotent ──────────────────────

test("P2: one authorized intent yields exactly one stable PurchaseRecord; replay rebuilds the identical identity", async () => {
  const intent = makeIntent({ spendApprovalId: "appr_founder_integration_1" });

  const first = purchaseRecordFromIntent(intent, at0);
  const replay = purchaseRecordFromIntent(intent, at0 + 5000); // later timestamp

  // Identity is derived from the intent, never regenerated on replay.
  assert.equal(first.id, intent.intentId);
  assert.equal(first.idempotencyKey, intent.idempotencyKey);
  assert.equal(first.objectiveKey, intent.objectiveKey);
  assert.equal(first.resourceNeedId, intent.requirementKey);
  assert.equal(first.offeringId, intent.target.offeringId);
  assert.equal(replay.id, first.id, "replay must rebuild the SAME purchase id");
  assert.equal(replay.idempotencyKey, first.idempotencyKey, "replay must rebuild the SAME idempotency key");

  const identity = purchaseIdentityFromIntent(intent);
  assert.equal(identity.id, intent.intentId);
  assert.equal(identity.resourceNeedId, intent.requirementKey);

  // Handing off twice (a double wake) reaches the SAME logical purchase and the
  // SAME submission; the second call is not a second spend in this seam because
  // M3's own durable execution-authority ledger enforces one attempt per
  // purchase id (proven by M3's payment-execution-authority tests). Here we
  // assert the seam produces one stable purchase identity + one tx.
  const settlement = fakeSettlementReader();
  const deps = makeDeps({ settlement });
  const a = await handoffIntentToM3(intent, deps);
  const b = await handoffIntentToM3(intent, deps);
  assert.equal(a.purchase?.id, b.purchase?.id, "same logical purchase across replay");
  assert.equal(a.submission?.transactionHash, b.submission?.transactionHash, "same deterministic submission");
});

// ── P3 — submitted is NOT settled / acquired / satisfied ─────────────────────

test("P3: M3 submitted ⇒ M4 handed_off only; not settled, not acquired, not satisfied", async () => {
  const intent = makeIntent({ spendApprovalId: "appr_founder_integration_1" });
  const settlement = fakeSettlementReader(); // never marked settled
  const result = await handoffIntentToM3(intent, makeDeps({ settlement }));

  assert.equal(result.handedOff, true);
  assert.equal(result.m3State, "submitted", "M3 is at submitted");
  assert.equal(result.purchase?.state, "submitted");
  assert.equal(result.intent.state, "handed_off", "M4 records the hand-off, nothing more");
  assert.equal(result.intent.resultEvidenceId, null, "no provider result yet");
  assert.equal(result.intent.verificationEvidenceId, null, "no verification yet");
  assert.equal(result.terminal, false);
  assert.match(result.detail, /submitted ≠ settled ≠ acquired/);

  // Observing with settlement still not present is a REST, not a failure.
  const observed = await observePurchase(result.intent, result.purchase!, makeDeps({ settlement }));
  assert.equal(observed.m3State, "submitted");
  assert.equal(observed.resting, true);
  assert.equal(observed.reconciliationRequired, false);
  assert.equal(observed.intent.state, "handed_off");
});

// ── P4 — settled is NOT verified result; waits for provider result; no repay ─

test("P4: M3 settled with no provider result yet ⇒ M4 rests at settled; no repayment", async () => {
  const intent = makeIntent({ spendApprovalId: "appr_founder_integration_1" });
  const txHash = "0xsimulatedtxhash0000000000000000000000000000000000000000000000000001";
  const settlement = fakeSettlementReader();
  settlement.setSettled(txHash, true, at0 + 1000);
  const paid = fakePaidSender(); // no result set ⇒ not retrievable yet
  const executor = fakeExecutor({ txHash });

  const handoff = await handoffIntentToM3(intent, makeDeps({ settlement, paid, executor }));
  assert.equal(handoff.m3State, "submitted");

  // ONE observation advances exactly one fact: submitted → settled.
  const settledStep = await observePurchase(handoff.intent, handoff.purchase!, makeDeps({ settlement, paid, executor }));
  assert.equal(settledStep.m3State, "settled", "M3 advanced to settled");
  assert.equal(settledStep.purchase?.state, "settled");
  assert.equal(settledStep.intent.state, "handed_off", "M4 has NOT recorded a result yet");
  assert.equal(settledStep.intent.resultEvidenceId, null, "settled ≠ result_received");

  // A SECOND observation tries to retrieve the provider result, finds none yet,
  // and RESTS at settled — it does NOT repay and does NOT fail.
  const observed = await observePurchase(settledStep.intent, settledStep.purchase!, makeDeps({ settlement, paid, executor }));
  assert.equal(observed.m3State, "settled", "still settled — result not retrievable yet");
  assert.equal(observed.intent.state, "handed_off", "M4 still has NOT recorded a result");
  assert.equal(observed.intent.resultEvidenceId, null, "settled ≠ result_received");
  assert.equal(observed.resting, true, "rests waiting for the provider_result wake");
  assert.equal(observed.reconciliationRequired, false, "a settled payment is NOT ambiguous");
  assert.equal(observed.terminal, false);
  assert.match(observed.detail, /do NOT repay/i);
});

// ── P5 — result received ⇒ M4 result_recorded; still not verified/satisfied ──

test("P5: provider result retrieved ⇒ M3 result_received ⇒ M4 result_recorded + provider_result wake; not yet verified", async () => {
  const intent = makeIntent({ spendApprovalId: "appr_founder_integration_1" });
  const txHash = "0xsimulatedtxhash0000000000000000000000000000000000000000000000000002";
  const settlement = fakeSettlementReader();
  settlement.setSettled(txHash, true, at0 + 1000);
  const paid = fakePaidSender();
  paid.setResult(RESOURCE, true, { rows: 42, source: "mock_merchant", simulated: true });
  // A verifier that is NOT yet ready to pass — proves result receipt is a
  // distinct fact from verification.
  const deps = makeDeps({
    settlement,
    paid,
    executor: fakeExecutor({ txHash }),
    verifyResult: () => ({ verified: false, verificationProof: "pending-independent-check" }),
  });

  const handoff = await handoffIntentToM3(intent, deps);
  const settled = await observePurchase(handoff.intent, handoff.purchase!, deps);
  assert.equal(settled.m3State, "settled");

  const received = await observePurchase(settled.intent, settled.purchase!, deps);
  assert.equal(received.m3State, "result_received", "M3 at result_received");
  assert.equal(received.purchase?.state, "result_received");
  assert.equal(received.intent.state, "result_recorded", "M4 recorded the result");
  assert.ok(received.intent.resultEvidenceId, "result evidence ref persisted");
  assert.equal(received.intent.verificationEvidenceId, null, "verification has NOT happened");
  // A provider_result wake was emitted, deduped by event identity.
  const providerWake = received.events.find((e) => e.reason === "provider_result");
  assert.ok(providerWake, "a provider_result wake must be emitted");
  assert.equal(providerWake!.m3State, "result_received");
});

// ── P6 — verified ⇒ M4 intent verified + evidence refs + wake; reassessment ──

test("P6: independent verification succeeds ⇒ M3 verified ⇒ M4 intent verified + evidence refs + deduped wake; Requirement can be reassessed", async () => {
  const intent = makeIntent({ spendApprovalId: "appr_founder_integration_1" });
  const txHash = "0xsimulatedtxhash0000000000000000000000000000000000000000000000000003";
  const settlement = fakeSettlementReader();
  settlement.setSettled(txHash, true, at0 + 1000);
  const paid = fakePaidSender();
  paid.setResult(RESOURCE, true, { rows: 42, source: "mock_merchant", simulated: true });
  const deps = makeDeps({
    settlement,
    paid,
    executor: fakeExecutor({ txHash }),
    verifyResult: () => ({ verified: true, verificationProof: "simulated-erc20-transfer-readback-match" }),
  });

  const handoff = await handoffIntentToM3(intent, deps);
  const settled = await observePurchase(handoff.intent, handoff.purchase!, deps);
  const received = await observePurchase(settled.intent, settled.purchase!, deps);
  const verified = await observePurchase(received.intent, received.purchase!, deps);

  assert.equal(verified.m3State, "verified", "M3 at verified");
  assert.equal(verified.purchase?.state, "verified");
  assert.equal(verified.purchase?.verified, true);
  assert.equal(verified.intent.state, "verified", "M4 intent verified");
  assert.ok(verified.intent.resultEvidenceId, "result evidence ref bound");
  assert.ok(verified.intent.verificationEvidenceId, "verification evidence ref bound");
  assert.equal(verified.terminal, true);
  const verifyWake = verified.events.find((e) => e.reason === "verification_result");
  assert.ok(verifyWake, "a verification_result wake must be emitted");

  // Somebody can now reassess Requirement satisfaction against a
  // verified_external_result proof keyed by this intent, at the CURRENT revision.
  const requirement = buildVerifiedExternalRequirement(1, verified.intent.intentId);
  const facts: ProofFacts = {
    artifactVersions: {},
    applicationObservationIds: [],
    verifiedIntentIds: [verified.intent.intentId],
    founderConfirmationRefs: [],
  };
  const attempt = attemptRequirementSatisfaction({
    requirement,
    event: { kind: "external_result_verified", intentId: verified.intent.intentId, contractRevision: 1 },
    facts,
    resolutionId: "res_integration_1",
    acceptedDecisionId: "dec_integration_1",
    acceptedAssignmentId: null,
    acceptedIntentId: verified.intent.intentId,
    proofRefs: [verified.intent.verificationEvidenceId!],
    currentContractRevision: 1,
    at: at0,
  });
  assert.equal(attempt.satisfied, true, "a verified external result at the current revision satisfies the requirement");
});

// ── P7 — lost response / ambiguous submission ⇒ reconciliation, no retry ─────

test("P7: ambiguous execution (possible submission, missing response) ⇒ reconciliation_required; never retried", async () => {
  const intent = makeIntent({ spendApprovalId: "appr_founder_integration_1" });
  // The executor throws an AMBIGUOUS error (M3's OfficialPaymentAmbiguousError
  // contract): the payment may have reached the merchant.
  const deps = makeDeps({ executor: fakeExecutor({ throwName: "OfficialPaymentAmbiguousError" }) });
  const result = await handoffIntentToM3(intent, deps);

  assert.equal(result.reconciliationRequired, true);
  assert.equal(result.intent.state, "reconciliation_required");
  assert.equal(result.purchase?.state, "reconciliation_required");
  assert.equal(result.m3State, "reconciliation_required");
  const reconWake = result.events.find((e) => e.reason === "recovery_event");
  assert.ok(reconWake, "a recovery_event wake must be emitted for reconciliation");
  assert.match(result.detail, /no retry/i);

  // Observing a reconciliation_required purchase is a no-op: it does NOT retry.
  const observed = await observePurchase(result.intent, result.purchase!, deps);
  assert.equal(observed.reconciliationRequired, true);
  assert.equal(observed.m3State, "reconciliation_required");
  assert.equal(observed.intent.state, "reconciliation_required");
});

test("P7b: submitted=false with an ambiguous safe response ⇒ reconciliation_required, not ordinary failure", async () => {
  const intent = makeIntent({ spendApprovalId: "appr_founder_integration_1" });
  const deps = makeDeps({ executor: fakeExecutor({ submitted: false, ambiguousResult: true }) });
  const result = await handoffIntentToM3(intent, deps);
  assert.equal(result.reconciliationRequired, true, "an unknown-outcome submission is ambiguous");
  assert.equal(result.intent.state, "reconciliation_required");
});

test("P7c: a source-proven pre-submission failure is failed, NOT reconciliation", async () => {
  const intent = makeIntent({ spendApprovalId: "appr_founder_integration_1" });
  const deps = makeDeps({ executor: fakeExecutor({ submitted: false, ambiguousResult: false }) });
  const result = await handoffIntentToM3(intent, deps);
  assert.equal(result.reconciliationRequired, false);
  assert.equal(result.intent.state, "failed", "a proven pre-submission failure is an ordinary failure");
  assert.equal(result.purchase?.state, "failed");
});

// ── P8 — retry only after authoritative reconciliation proves it safe ────────

test("P8: the seam never auto-retries; a reconciled purchase stays put until M3's retry authority opens a new attempt", async () => {
  const intent = makeIntent({ spendApprovalId: "appr_founder_integration_1" });
  const deps = makeDeps({ executor: fakeExecutor({ throwName: "OfficialPaymentAmbiguousError" }) });
  const recon = await handoffIntentToM3(intent, deps);
  assert.equal(recon.intent.state, "reconciliation_required");

  // Re-observing never re-attempts payment; it is a no-op rest.
  const again = await observePurchase(recon.intent, recon.purchase!, deps);
  assert.equal(again.reconciliationRequired, true);
  assert.equal(again.intent.state, "reconciliation_required");
  // M3's planRetry is the ONLY gate that can open a retry. Prove the gate:
  // a reconciliation_required record is never directly retryable …
  const { planRetry } = await import("../lib/payment/buyerRail");
  assert.throws(
    () => planRetry(recon.purchase!, [], undefined),
    /must reconcile first/i,
    "M3 refuses to retry an ambiguous/reconciliation_required purchase",
  );
  // … a reconciled-but-failed record still refuses WITHOUT explicit proof …
  assert.throws(
    () => planRetry({ ...recon.purchase!, state: "failed" }, [], undefined),
    /without reconciliation proof/i,
    "M3 refuses to retry a failed purchase until reconciliation proof exists",
  );
  // … and only opens once reconciliation proof is supplied AND no competing
  // purchase with the same idempotency key already landed (double-pay guard).
  const reconciled = { ...recon.purchase!, state: "failed" as const };
  assert.equal(
    planRetry(reconciled, [], "recon-proof-xyz"),
    true,
    "after reconciliation proof, M3 — not the seam — may open a new attempt",
  );
  assert.throws(
    () =>
      planRetry(
        reconciled,
        [{ ...reconciled, id: "other_purchase", state: "settled" }],
        "recon-proof-xyz",
      ),
    /already used/i,
    "M3 blocks a retry that would double-pay an idempotency key that already settled",
  );
});

// ── P9 — stale revision: old result cannot satisfy a newer Requirement ───────

test("P9: a provider result verified against an OLD contract revision cannot satisfy a NEWER Requirement revision", async () => {
  // Intent bound to contract revision 1.
  const intent = makeIntent({ spendApprovalId: "appr_founder_integration_1", contractRevision: 1 });
  assert.equal(intent.contractRevision, 1);
  const txHash = "0xsimulatedtxhash0000000000000000000000000000000000000000000000000009";
  const settlement = fakeSettlementReader();
  settlement.setSettled(txHash, true, at0 + 1000);
  const paid = fakePaidSender();
  paid.setResult(RESOURCE, true, { rows: 7, simulated: true });
  const deps = makeDeps({ settlement, paid, executor: fakeExecutor({ txHash }) });

  const handoff = await handoffIntentToM3(intent, deps);
  const settled = await observePurchase(handoff.intent, handoff.purchase!, deps);
  const received = await observePurchase(settled.intent, settled.purchase!, deps);
  const verified = await observePurchase(received.intent, received.purchase!, deps);
  assert.equal(verified.intent.state, "verified");

  // The Objective/Requirement is REVISED to revision 2 while/after the payment.
  // The verified result was accepted against revision 1; it must NOT satisfy a
  // revision-2 requirement. attemptRequirementSatisfaction fails closed.
  const requirementR2 = buildVerifiedExternalRequirement(2, verified.intent.intentId);
  const facts: ProofFacts = {
    artifactVersions: {},
    applicationObservationIds: [],
    verifiedIntentIds: [verified.intent.intentId],
    founderConfirmationRefs: [],
  };
  const stale = attemptRequirementSatisfaction({
    requirement: requirementR2,
    event: { kind: "external_result_verified", intentId: verified.intent.intentId, contractRevision: 1 },
    facts,
    resolutionId: "res_integration_2",
    acceptedDecisionId: "dec_integration_1",
    acceptedAssignmentId: null,
    acceptedIntentId: verified.intent.intentId,
    proofRefs: [verified.intent.verificationEvidenceId!],
    currentContractRevision: 2, // the objective moved on
    at: at0,
  });
  assert.equal(stale.satisfied, false, "a stale-revision result must NOT satisfy the newer revision");
  assert.match(stale.reason, /stale contract revision/i);
});

// ── P10 — duplicate result/wake is deduped; no duplicate purchase/satisfaction ─

test("P10: replaying the same provider/verification events yields one logical result, deduped wakes, no duplicate satisfaction", async () => {
  const intent = makeIntent({ spendApprovalId: "appr_founder_integration_1" });
  const txHash = "0xsimulatedtxhash000000000000000000000000000000000000000000000000000a";
  const settlement = fakeSettlementReader();
  settlement.setSettled(txHash, true, at0 + 1000);
  const paid = fakePaidSender();
  paid.setResult(RESOURCE, true, { rows: 1, simulated: true });
  const deps = makeDeps({ settlement, paid, executor: fakeExecutor({ txHash }) });

  const handoff = await handoffIntentToM3(intent, deps);
  const settled = await observePurchase(handoff.intent, handoff.purchase!, deps);
  const received = await observePurchase(settled.intent, settled.purchase!, deps);
  const verified = await observePurchase(received.intent, received.purchase!, deps);
  assert.equal(verified.intent.state, "verified");

  // Re-observing a verified purchase is a no-op: no second result, no new wake.
  const replay1 = await observePurchase(verified.intent, verified.purchase!, deps);
  assert.equal(replay1.intent.state, "verified");
  assert.equal(replay1.events.length, 0, "no duplicate wake on replay of a terminal purchase");
  assert.equal(replay1.terminal, true);

  // The wake dedupe keys are event-identity based, so delivering the same
  // provider event twice maps to the SAME dedupeKey (appendWakeEvent collapses).
  const providerKeys = received.events.filter((e) => e.reason === "provider_result").map((e) => e.dedupeKey);
  assert.equal(providerKeys.length, 1);
  const replayProvider = await observePurchase(settled.intent, settled.purchase!, deps);
  const replayKeys = replayProvider.events.filter((e) => e.reason === "provider_result").map((e) => e.dedupeKey);
  assert.deepEqual(replayKeys, providerKeys, "the same provider event rebuilds the same dedupe key");

  // Requirement satisfaction is idempotent: a second attempt on an already
  // satisfied requirement is a no-op refusal, never a duplicate resolution.
  const requirement = buildVerifiedExternalRequirement(1, verified.intent.intentId);
  const facts: ProofFacts = {
    artifactVersions: {},
    applicationObservationIds: [],
    verifiedIntentIds: [verified.intent.intentId],
    founderConfirmationRefs: [],
  };
  const first = attemptRequirementSatisfaction({
    requirement,
    event: { kind: "external_result_verified", intentId: verified.intent.intentId, contractRevision: 1 },
    facts,
    resolutionId: "res_integration_10",
    acceptedDecisionId: "dec_integration_1",
    acceptedAssignmentId: null,
    acceptedIntentId: verified.intent.intentId,
    proofRefs: [verified.intent.verificationEvidenceId!],
    currentContractRevision: 1,
    at: at0,
  });
  assert.equal(first.satisfied, true);
  const second = attemptRequirementSatisfaction({
    requirement: first.requirement, // already satisfied
    event: { kind: "external_result_verified", intentId: verified.intent.intentId, contractRevision: 1 },
    facts,
    resolutionId: "res_integration_10_dup",
    acceptedDecisionId: "dec_integration_1",
    acceptedAssignmentId: null,
    acceptedIntentId: verified.intent.intentId,
    proofRefs: [verified.intent.verificationEvidenceId!],
    currentContractRevision: 1,
    at: at0,
  });
  assert.equal(second.satisfied, false, "a satisfied requirement is not re-satisfied");
  assert.match(second.reason, /already satisfied/i);
});

// ── Additional seam-integrity proofs ─────────────────────────────────────────

test("SEAM: the live 402 challenge is authoritative — an M4 quote never overrides live terms; out-of-bound amount is refused before signing", async () => {
  // The M4 intent quoted $4, but the LIVE challenge demands an amount above the
  // rail's max spend. preparePayment (inside prepareApprovedPurchase) must refuse
  // BEFORE signing — the live challenge wins, the M4 quote is irrelevant.
  const intent = makeIntent({ spendApprovalId: "appr_founder_integration_1", priceUsd: 4 });
  // Override the x402 v2 wire `amount` field (NOT the legacy `maxAmountRequired`
  // — supplying both in disagreement makes M3 reject the entry outright). The
  // live challenge now demands 99999999 atomic units, far above the rail max.
  const bigChallenge = syntheticChallenge({ amount: "99999999" });
  // Rail max stays at 10000 while the live challenge demands 99999999.
  const tightDeps: M3BuyerRailDeps = {
    ...makeDeps({ challenge: bigChallenge }),
    railConfig: { allowedNetworks: [TESTNET], maxSpend: AMOUNT },
  };
  const result = await handoffIntentToM3(intent, tightDeps);
  assert.equal(result.handedOff, false);
  assert.equal(result.intent.state, "failed", "refused before signing");
  assert.match(result.detail, /outside the founder-approved bounds or rail policy/i);
});

test("SEAM: a wrong-network (mainnet) live challenge is refused by M3 rail policy", async () => {
  const intent = makeIntent({ spendApprovalId: "appr_founder_integration_1" });
  const mainnetChallenge = syntheticChallenge({ network: "eip155:1" });
  // The approval factory binds to whatever network the challenge names, but the
  // rail config only allows the testnet, so preparePayment refuses.
  const deps = makeDeps({ challenge: mainnetChallenge });
  const result = await handoffIntentToM3(intent, deps);
  assert.equal(result.handedOff, false);
  assert.match(result.detail, /outside the founder-approved bounds or rail policy/i);
});

test("SEAM: verification rejection ⇒ M4 intent failed (payment settled, result did not verify); no repayment", async () => {
  const intent = makeIntent({ spendApprovalId: "appr_founder_integration_1" });
  const txHash = "0xsimulatedtxhash000000000000000000000000000000000000000000000000000b";
  const settlement = fakeSettlementReader();
  settlement.setSettled(txHash, true, at0 + 1000);
  const paid = fakePaidSender();
  paid.setResult(RESOURCE, true, { rows: 0, simulated: true });
  const deps = makeDeps({
    settlement,
    paid,
    executor: fakeExecutor({ txHash }),
    verifyResult: () => ({ verified: false, verificationProof: "erc20-transfer-readback-mismatch" }),
  });
  const handoff = await handoffIntentToM3(intent, deps);
  const settled = await observePurchase(handoff.intent, handoff.purchase!, deps);
  const received = await observePurchase(settled.intent, settled.purchase!, deps);
  const rejected = await observePurchase(received.intent, received.purchase!, deps);
  assert.equal(rejected.intent.state, "failed");
  assert.equal(rejected.purchase?.verified, false);
  assert.equal(rejected.reconciliationRequired, false, "a rejected result is not payment ambiguity");
  assert.match(rejected.detail, /REJECTED/i);
});

test("SEAM: the BuyerRailPort adapter drives the real M3 rail and reports acceptance only on a real submission", async () => {
  const intent = makeIntent({ spendApprovalId: "appr_founder_integration_1" });
  const txHash = "0xsimulatedtxhash000000000000000000000000000000000000000000000000000c";
  const adapter = m3BuyerRailAdapter(makeDeps({ executor: fakeExecutor({ txHash }) }));
  assert.match(adapter.describe(), /NOT a mock/i);
  const ack = await adapter.submitForPurchase(intent);
  assert.equal(ack.accepted, true);
  if (ack.accepted) assert.equal(ack.railRef, `m3:${txHash}`);

  // With no approval bound, the port refuses (accepted:false) — fail closed.
  const noGrant = makeIntent({ spendApprovalId: null });
  const refused = await adapter.submitForPurchase(noGrant);
  assert.equal(refused.accepted, false);
});

// ── CP4 — production-style whole-loop trace (one authorized intent → verified
//    → Requirement satisfied), driven end-to-end through the REAL seam. ────────
//
// CLOUD INTEGRATION PROOF / SIMULATED FINANCIAL EXECUTION.
//
// This is the production-shaped cut-off trace: it runs the same code path the
// supervised LOCAL lane will run, with the ONLY difference that the injected
// PaymentExecutor / settlement / provider / verifier are deterministic fakes
// (kind "test_scaffold", every artifact labelled SIMULATED). No signing, no
// wallet, no blockchain, no live provider, no money. It proves the full ordered
// pipeline: authorized intent → hand-off → submitted → settled → result_received
// → verified → Somebody re-evaluates → Requirement satisfied, with each M3 fact
// observed in a DISTINCT step (never collapsed) and each M4 consequence carrying
// a deduped wake.

test("CP4 CLOUD INTEGRATION PROOF / SIMULATED FINANCIAL EXECUTION: authorized intent → M3 hand-off → submitted → settled → result_received → verified → Somebody satisfied", async () => {
  const intent = makeIntent({ spendApprovalId: "appr_founder_integration_cp4" });
  const txHash = "0xsimulatedtxhash00000000000000000000000000000000000000000000000000cp4";
  const settlement = fakeSettlementReader();
  settlement.setSettled(txHash, true, at0 + 1000);
  const paid = fakePaidSender();
  paid.setResult(RESOURCE, true, { rows: 128, source: "mock_merchant", simulated: true });
  const deps = makeDeps({
    settlement,
    paid,
    executor: fakeExecutor({ txHash }),
    verifyResult: () => ({ verified: true, verificationProof: "simulated-erc20-transfer-readback-match" }),
  });

  // Drive the whole lifecycle through the production convenience driver. Each
  // observation advances exactly one M3 fact; runPurchaseLifecycle keeps
  // observing while the lifecycle keeps advancing and is not terminal.
  const { final, trail, observations } = await runPurchaseLifecycle(intent, deps, { maxObservations: 8 });

  // ── the ordered M3 pipeline reached verified, one distinct fact per step ──
  assert.equal(final.m3State, "verified", "M3 pipeline reached verified");
  assert.equal(final.purchase?.state, "verified", "the M3 PurchaseRecord is verified");
  assert.equal(final.purchase?.verified, true, "verification proof bound on the M3 record");
  assert.equal(final.terminal, true, "the lifecycle is terminal");
  assert.equal(final.reconciliationRequired, false, "a clean verified loop needs no reconciliation");
  assert.equal(observations, 3, "submitted→settled→result_received→verified is THREE distinct observations (no collapse)");

  // ── the ordered M4 pipeline reached verified with both evidence refs ──────
  assert.equal(final.intent.state, "verified", "M4 intent verified");
  assert.equal(final.intent.intentId, intent.intentId, "identity is stable end to end (never regenerated)");
  assert.ok(final.intent.resultEvidenceId, "result evidence ref persisted");
  assert.ok(final.intent.verificationEvidenceId, "verification evidence ref persisted");
  // M4 attempts incremented exactly once (one hand-off), proving one logical
  // purchase despite three observations.
  assert.equal(final.intent.attempts, 1, "exactly one hand-off attempt across the whole loop");

  // ── the deduped wake trail maps each M3 fact to its M4 wake reason ────────
  const reasons = trail.map((e) => e.reason);
  assert.deepEqual(
    reasons,
    ["provider_result", "verification_result"],
    "the trail carries exactly the provider_result then verification_result wakes (hand-off itself is the state move, not a rail event)",
  );
  const dedupeKeys = trail.map((e) => e.dedupeKey);
  assert.equal(new Set(dedupeKeys).size, dedupeKeys.length, "every wake is uniquely keyed (deduped)");

  // ── Somebody re-evaluates: the verified result satisfies the Requirement ──
  const requirement = buildVerifiedExternalRequirement(1, final.intent.intentId);
  const facts: ProofFacts = {
    artifactVersions: {},
    applicationObservationIds: [],
    verifiedIntentIds: [final.intent.intentId],
    founderConfirmationRefs: [],
  };
  const satisfied = attemptRequirementSatisfaction({
    requirement,
    event: { kind: "external_result_verified", intentId: final.intent.intentId, contractRevision: 1 },
    facts,
    resolutionId: "res_integration_cp4",
    acceptedDecisionId: "dec_integration_1",
    acceptedAssignmentId: null,
    acceptedIntentId: final.intent.intentId,
    proofRefs: [final.intent.verificationEvidenceId!],
    currentContractRevision: 1,
    at: at0,
  });
  assert.equal(satisfied.satisfied, true, "Somebody re-evaluates and the Requirement is satisfied by the verified external result");
  assert.equal(satisfied.requirement?.state, "satisfied", "the Requirement row is now satisfied");

  // ── nothing here was ever live: the only executor was a labelled scaffold,
  //    the terminal observation carries NO payment submission (observation never
  //    re-submits), and the provider result itself is flagged simulated. ──────
  assert.equal(deps.executor.kind, "test_scaffold", "the only executor used was a deterministic SIMULATED scaffold");
  assert.equal(final.submission, null, "a verification observation performs no payment submission");
  assert.equal((final.purchase?.result as { simulated?: boolean } | undefined)?.simulated, true, "the provider result is explicitly labelled simulated");
});

test("CP4 negative: the whole-loop trace never satisfies a Requirement when the injected verifier rejects the provider result", async () => {
  const intent = makeIntent({ spendApprovalId: "appr_founder_integration_cp4neg" });
  const txHash = "0xsimulatedtxhash00000000000000000000000000000000000000000000000000cneg";
  const settlement = fakeSettlementReader();
  settlement.setSettled(txHash, true, at0 + 1000);
  const paid = fakePaidSender();
  paid.setResult(RESOURCE, true, { rows: 0, simulated: true });
  const deps = makeDeps({
    settlement,
    paid,
    executor: fakeExecutor({ txHash }),
    verifyResult: () => ({ verified: false, verificationProof: "erc20-transfer-readback-mismatch" }),
  });

  const { final, observations } = await runPurchaseLifecycle(intent, deps, { maxObservations: 8 });
  // The loop stops at the rejected verification: M3 failed, M4 intent failed,
  // no Requirement may be satisfied by an unverified result, and nothing is
  // repaid (payment settled; only the RESULT failed to verify).
  assert.equal(final.m3State, "failed", "M3 record failed on rejected verification");
  assert.equal(final.intent.state, "failed", "M4 intent failed");
  assert.equal(final.purchase?.verified, false, "the result never verified");
  assert.equal(final.reconciliationRequired, false, "a rejected RESULT is not payment ambiguity — no reconciliation");
  assert.equal(observations, 3, "settled then result_received then the rejecting verification = three observations");

  const requirement = buildVerifiedExternalRequirement(1, final.intent.intentId);
  const facts: ProofFacts = {
    artifactVersions: {},
    applicationObservationIds: [],
    verifiedIntentIds: [], // nothing verified
    founderConfirmationRefs: [],
  };
  const unsatisfied = attemptRequirementSatisfaction({
    requirement,
    event: { kind: "external_result_verified", intentId: final.intent.intentId, contractRevision: 1 },
    facts,
    resolutionId: "res_integration_cp4neg",
    acceptedDecisionId: "dec_integration_1",
    acceptedAssignmentId: null,
    acceptedIntentId: final.intent.intentId,
    proofRefs: [],
    currentContractRevision: 1,
    at: at0,
  });
  assert.equal(unsatisfied.satisfied, false, "an unverified/rejected result cannot satisfy the Requirement");
});

// ── helpers ──────────────────────────────────────────────────────────────────

// Build a Requirement fixture whose proof is a verified_external_result bound to
// a specific intent id, at the given contract revision. `missingProofs` matches
// `proof.params.intentId` against `facts.verifiedIntentIds`, so the proof param
// must name the real intent for satisfaction to be possible. This is a test
// fixture (the production requirement is built by M4's contract builder); the
// satisfaction DECISION is made by the real `attemptRequirementSatisfaction`.
function buildVerifiedExternalRequirement(contractRevision: number, intentId: string): Requirement {
  return {
    requirementKey: REQ_KEY,
    objectiveKey: OBJECTIVE,
    contractId: `contract_${OBJECTIVE}`,
    contractRevision,
    priority: "required",
    title: "Acquire the market intel via a verified external result",
    mustBeTrue: "the provider result is persisted and independently verified",
    scope: "external acquisition",
    proofs: [
      {
        proofKey: "proof_external_verified",
        description: "provider result independently verified",
        proofKind: "verified_external_result",
        params: { intentId },
      },
    ],
    state: "active",
    strategy: "BUY",
    resolution: null,
    blockedReason: null,
    waiver: null,
    revision: 1,
    createdAt: at0,
    updatedAt: at0,
    ...CP2_REQUIREMENT_FIELDS,
  };
}
