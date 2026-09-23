// M4 × M3 INTEGRATION SEAM — the buyer-rail adapter.
//
// This file is the ONE place where the closed M4 management engine meets the
// frozen accepted M3 buyer rail. It exists to satisfy the central rule of the
// integration: connect M4's authorized ExecutionIntent to M3's purchase/payment
// lifecycle WITHOUT creating a second payment architecture and WITHOUT blurring
// state ownership.
//
// ── Ownership boundary this file respects (never collapses) ──────────────────
//
//   M4 OWNS (management/business truth):
//     ExecutionIntent + its stable identity, objective/requirement/contract
//     revision, the business-level external need, wake/replan, Requirement
//     satisfaction, Objective completion. M4 observes M3 and records the
//     BUSINESS consequence — it never re-decides payment.
//
//   M3 OWNS (financial execution truth):
//     PurchaseRecord, live x402 challenge interpretation, exact payment terms,
//     explicit payment approval binding, the READY_TO_SIGN boundary, wallet/TEE
//     execution, submission, settlement, uncertainty, reconciliation, the
//     provider paid-response lifecycle, and payment/result verification.
//
//   EXTERNAL SYSTEMS OWN:
//     actual blockchain truth and actual provider truth. This file NEVER infers
//     either from local state — settlement and provider result are injected
//     observations (SettlementReader / PaidRequestSender), exactly as M3
//     designed them.
//
// ── Two machines, one seam ───────────────────────────────────────────────────
//   This file does NOT reimplement the M3 payment state machine and does NOT
//   collapse it into M4's. It drives the REAL M3 functions (`parse402Challenge`,
//   `createPurchase`, `prepareApprovedPurchase` → `preparePayment`/
//   `bindTermsToApproval`, `executeApprovedPayment`, `lifecycle.transition`) and
//   maps each meaningful M3 PaymentState change onto an M4 ExternalRailEvent
//   (and therefore a deduped wake) through M4's OWN intent machine
//   (`advanceIntent`/`applyRailEvent`/`planWakeForRailEvent`).
//
//   M3 PaymentState:  prepared → awaiting_approval → approved →
//                     payment_attempted → submitted → settled →
//                     result_received → verified | failed | uncertain |
//                     reconciliation_required
//   M4 IntentState:   authorized → handed_off → result_recorded → verified |
//                     failed | reconciliation_required   (+ awaiting_m3 rest)
//
//   M4 never adopts M3's enum and never invents signed/confirmed/finalized.
//   submitted ≠ settled ≠ result_received ≠ verified stays true: each is a
//   distinct observation, produced at a distinct time, by a distinct wake.
//
// ── Shape: the seam is a small resumable state observer ──────────────────────
//   `handoffIntentToM3`  : authority → purchase → live challenge → approval →
//                          prepare/READY_TO_SIGN → execute → submitted → M4
//                          `handed_off`. It STOPS at the hand-off boundary: M4
//                          truthfully reflects that it delegated execution and a
//                          submission exists, and claims nothing more.
//   `observePurchase`    : resume from the persisted PurchaseRecord and observe
//                          the NEXT facts — settlement, provider result,
//                          verification — advancing M3 and mapping to M4 events.
//                          Idempotent and resumable: called once per relevant
//                          wake; a fact not yet observable is a REST, not a
//                          failure and not a retry.
//   `runPurchaseLifecycle`: convenience that hands off then observes to a
//                          terminal/resting state (used by the production-style
//                          simulated trace; the focused tests drive the steps).
//
// ── Runtime boundary / no live payment ───────────────────────────────────────
//   This file is NODE-runtime application code for the supervised LOCAL lane,
//   NOT a Convex function and NOT bundled at esbuild platform:browser. It
//   transitively imports `node:child_process` via supervisedPurchase.ts →
//   onchainOsExecutor.ts (which spawns `onchainos payment pay`). It therefore
//   MUST NOT be imported from convex/*.ts: those import only the pure M4
//   kernels (intents / authorization / requirements / graph / decision). The
//   hand-off is I/O, so it is driven from a Node process (as scripts/m3-live-
//   purchase.ts already does), which reads the durable ExecutionIntent +
//   M3 PurchaseRecord, calls this seam, then writes the resulting M4 events back.
//
//   It performs no I/O of its OWN: the live 402 challenge, settlement readback,
//   provider paid-response, the PaymentExecutor, and the verification decision
//   are ALL injected. In cloud tests the executor is a deterministic fake
//   (kind "test_scaffold") and every artifact is labelled; in the supervised
//   LOCAL lane it is M3's `OfficialSignOnlyReplayExecutor`. Nothing here can
//   sign, submit, or move money on its own, and a fake result is never marked
//   live.

import { parse402Challenge } from "../payment/challenge";
import { createPurchase } from "../payment/purchase";
import { prepareApprovedPurchase } from "../payment/supervisedPurchase";
import { executeApprovedPayment, type PreparedPayment } from "../payment/buyerRail";
import { transition, initial } from "../payment/lifecycle";
import type {
  PaymentApproval,
  PaymentExecutor,
  PaymentState,
  PaymentContext,
  PurchaseRecord,
  RailConfig,
  SettlementObservation,
  SettlementReader,
  PaidRequestSender,
  PaymentSubmissionResult,
} from "../payment/types";
import {
  advanceIntent,
  applyRailEvent,
  planWakeForRailEvent,
  type BuyerRailPort,
} from "./intents";
import { mayHandOffExternally, type ExternalAuthorityMode } from "./authorization";
import { hash24 } from "./sha256";
import type { ExecutionIntent, ExecutionIntentState, WakeReason } from "./types";

// ── Intent ↔ Purchase identity mapping ───────────────────────────────────────
//
// The integration contract fixes this mapping. Identity is DERIVED from the
// stable ExecutionIntent identity, never regenerated: a retry or a replayed wake
// rebuilds byte-identical purchase identity, so M3's idempotency (and its
// durable execution-authority ledger) collapse a double-submit into ONE logical
// purchase. This is the whole reason M4 must not mint a second identity.
//
//   PurchaseRecord.id             = ExecutionIntent.intentId
//   PurchaseRecord.objectiveKey   = ExecutionIntent.objectiveKey
//   PurchaseRecord.resourceNeedId = ExecutionIntent.requirementKey
//   PurchaseRecord.offeringId     = ExecutionIntent.target.offeringId
//   PurchaseRecord.idempotencyKey = ExecutionIntent.idempotencyKey
//
// `offeringId` falls back to the intent identity only when an intent carries no
// concrete offering (which createIntentFromAuthorization already refuses for a
// monetary external acquisition); the fallback keeps the mapping total without
// ever aliasing two distinct logical purchases.

export type PurchaseIdentity = {
  id: string;
  objectiveKey: string;
  resourceNeedId: string;
  offeringId: string;
  idempotencyKey: string;
};

export function purchaseIdentityFromIntent(
  intent: ExecutionIntent,
): PurchaseIdentity {
  return {
    id: intent.intentId,
    objectiveKey: intent.objectiveKey,
    resourceNeedId: intent.requirementKey,
    offeringId: intent.target.offeringId ?? intent.intentId,
    idempotencyKey: intent.idempotencyKey,
  };
}

// Build (or rebuild) the M3 PurchaseRecord for an intent. PURE and idempotent:
// the same intent always produces the same purchase identity in `prepared`.
export function purchaseRecordFromIntent(
  intent: ExecutionIntent,
  at: number,
): PurchaseRecord {
  const identity = purchaseIdentityFromIntent(intent);
  return createPurchase({ ...identity, at });
}

// ── Injected dependencies (the DI boundary the integration requires) ─────────

/**
 * Fetch the LIVE 402 challenge for the intent's selected offering/resource.
 * This is the authoritative source of network/asset/atomic amount/recipient/
 * resource/scheme/timeout/signing-domain. An M4 quote may NEVER override it:
 * preparePayment/bindTermsToApproval compare the live terms against the
 * approval bounds and refuse if the challenge exceeds them.
 */
export type LiveChallengeFetcher = (input: {
  intent: ExecutionIntent;
  offeringId: string;
  endpointRef: string | null;
}) => Promise<unknown>;

/**
 * Derive M3's explicit `PaymentApproval` from the founder authority bound on the
 * intent PLUS the live challenge terms. M4 authorization is NOT itself M3
 * payment approval: this factory is where the founder's explicit approved
 * authority becomes an M3 approval bound to the live economic terms. The live
 * terms must fit inside the founder-authorized bounds; preparePayment enforces
 * that. A null return means no explicit approval exists → the purchase must not
 * proceed to execution (fail closed).
 */
export type PaymentApprovalFactory = (input: {
  intent: ExecutionIntent;
  liveTerms: {
    scheme: string;
    network: string;
    asset: string;
    payTo: string;
    resource: string;
    maxAmountRequired: string;
  };
  approvalId: string | null;
}) => PaymentApproval | null;

/**
 * Decide whether an independently-received provider result verifies. This is
 * M3's protected-result verification seam; the decision is injected so tests can
 * drive a deterministic verifier and production can bind the real M3 protected-
 * result contract. The proof string it returns is M3's verification proof.
 */
export type ResultVerifier = (input: {
  intent: ExecutionIntent;
  purchase: PurchaseRecord;
  result: unknown;
}) => { verified: boolean; verificationProof: string };

export type M3BuyerRailDeps = {
  executor: PaymentExecutor;
  fetchLiveChallenge: LiveChallengeFetcher;
  settlementReader: SettlementReader;
  paidRequestSender: PaidRequestSender;
  buildApproval: PaymentApprovalFactory;
  verifyResult: ResultVerifier;
  railConfig: RailConfig;
  mode: ExternalAuthorityMode;
  now?: () => number;
};

// ── Hand-off / observation result: M3 truth + the M4 events that follow ──────

export type HandoffEvent = {
  reason: WakeReason;
  dedupeKey: string;
  // The M3 PaymentState that produced this event, for the caller's audit trail.
  m3State: PaymentState;
};

export type SeamResult = {
  // True once a submission exists and M4 has truthfully recorded the hand-off.
  handedOff: boolean;
  // The M3 PurchaseRecord reached (null when no purchase was created, e.g. no
  // authority). M3 owns this object; the caller persists/reads it as M3 truth.
  purchase: PurchaseRecord | null;
  // The M4 intent after applying every event M3's lifecycle produced, IN ORDER.
  // The caller persists this and fires the matching wakes. M4 owns this object.
  intent: ExecutionIntent;
  // The M4 lifecycle events derived from observing M3, in order, each with its
  // deduped wake identity. The caller appends these as WakeEvents.
  events: HandoffEvent[];
  detail: string;
  // True only when M3 reported an ambiguous/uncertain PAYMENT execution
  // (possible submission, missing/ambiguous response). The caller must NOT retry.
  reconciliationRequired: boolean;
  // The raw submission result from the executor, for audit (never treated as
  // live settlement or live provider truth by itself).
  submission: PaymentSubmissionResult | null;
  // The M3 payment lifecycle state reached, for the caller's audit trail.
  m3State: PaymentState | null;
  // True when the seam made no forward progress this call and is resting,
  // waiting for a later wake to observe the next fact (e.g. settlement not yet
  // observable, provider result not yet retrievable). A rest is NOT a failure.
  resting: boolean;
  // True when the lifecycle reached a terminal M3 state (verified | failed).
  terminal: boolean;
};

/**
 * HAND-OFF: take an authorized M4 ExecutionIntent to the M3 buyer-rail boundary
 * and stop at `submitted` (M4 `handed_off`).
 *
 *   1. Fail closed on authority. `mayHandOffExternally` (M4) must be true:
 *      strategy BUY/HYBRID, mode m3_available_bounded, and — for a monetary
 *      intent — a bound founder approval record. No authority ⇒ NO purchase is
 *      created and NOTHING is handed off (the intent rests, unchanged). (P1)
 *
 *   2. Fetch the LIVE 402 challenge (injected) and normalize it with M3's real
 *      `parse402Challenge` (authoritative network/asset/amount/recipient/
 *      resource/scheme/timeout/domain). Derive the explicit M3 `PaymentApproval`
 *      from the founder authority + those live terms. No approval ⇒ fail closed.
 *
 *   3. Create ONE M3 PurchaseRecord from the intent's stable identity
 *      (M3 `createPurchase`). Replays rebuild the identical record. (P2)
 *
 *   4. `prepareApprovedPurchase` (M3): validate the live terms against the
 *      approval bounds and the rail config, and bind terms+approval. Stops at
 *      READY_TO_SIGN. The live challenge is authoritative; an M4 quote never
 *      overrides it (a mismatch throws and is refused before signing).
 *
 *   5. `executeApprovedPayment` (M3) via the injected executor → submission.
 *      M3 lifecycle: approved → payment_attempted → submitted. M4 → handed_off.
 *
 *   6. Ambiguity during execution (possible submission + missing/ambiguous
 *      response) ⇒ M3 uncertain ⇒ M4 reconciliation_required. NEVER a retry. (P7)
 *
 * This function does NOT write to Convex; it returns the intent + events + M3
 * purchase for the caller to persist and wake on. It stops at the hand-off
 * boundary: submitted ≠ settled ≠ acquired, and M4 claims nothing beyond the
 * truthful hand-off. Later facts are observed by `observePurchase`.
 */
export async function handoffIntentToM3(
  intent: ExecutionIntent,
  deps: M3BuyerRailDeps,
): Promise<SeamResult> {
  const now = deps.now ?? (() => Date.now());
  const events: HandoffEvent[] = [];

  // Step 1 — authority gate (fail closed). A monetary intent with no bound
  // founder approval never reaches the rail, and no PurchaseRecord is created.
  if (
    !mayHandOffExternally(intent.strategy, deps.mode, {
      spendApprovalId: intent.terms.approvalId,
      priceUsd: intent.terms.priceUsd,
    })
  ) {
    return {
      handedOff: false,
      purchase: null,
      intent,
      events,
      reconciliationRequired: false,
      submission: null,
      m3State: null,
      resting: true,
      terminal: false,
      detail:
        "M4 did not hand off: no founder spend approval is bound (or external authority is not m3_available_bounded), so no M3 purchase was created and no payment may be attempted",
    };
  }

  // Step 2 — live challenge (AUTHORITATIVE) then the explicit M3 approval bound
  // to those live terms. An M4 quote (intent.terms.priceUsd) is NEVER used to
  // set the transaction terms; it only bounded the authorization upstream.
  let challengeBody: unknown;
  try {
    challengeBody = await deps.fetchLiveChallenge({
      intent,
      offeringId: intent.target.offeringId ?? intent.intentId,
      endpointRef: intent.target.endpointRef,
    });
  } catch (err) {
    // A challenge we cannot even fetch is a pre-submission failure: nothing was
    // signed or submitted, so this is source-proven failure, not ambiguity.
    return failSeam(intent, null, events, now(),
      `live 402 challenge could not be fetched: ${describe(err)} — pre-submission failure, no payment attempted`);
  }

  let liveTerms;
  try {
    const parsed = parse402Challenge(challengeBody);
    // M3 only authorizes exact fixed-price payments (buyerRail.preparePayment
    // selects scheme === "exact"); mirror that selection so the approval binds
    // to the same terms prepareApprovedPurchase will validate.
    const exact = parsed.find((t) => t.scheme === "exact") ?? parsed[0];
    if (!exact) throw new Error("no payment terms in the live 402 challenge");
    liveTerms = exact;
  } catch (err) {
    return failSeam(intent, null, events, now(),
      `live 402 challenge could not be normalized: ${describe(err)} — pre-submission failure, no payment attempted`);
  }

  const approval = deps.buildApproval({
    intent,
    liveTerms: {
      scheme: liveTerms.scheme,
      network: liveTerms.network,
      asset: liveTerms.asset,
      payTo: liveTerms.payTo,
      resource: liveTerms.resource,
      maxAmountRequired: liveTerms.maxAmountRequired,
    },
    approvalId: intent.terms.approvalId,
  });

  // Step 3 — ONE purchase, identity derived from the intent (idempotent).
  const purchase = purchaseRecordFromIntent(intent, now());

  if (!approval) {
    // No explicit M3 approval could be derived from the founder authority and
    // the live terms. Fail closed: purchase exists but is NOT executed.
    return {
      handedOff: false,
      purchase,
      intent,
      events,
      reconciliationRequired: false,
      submission: null,
      m3State: "prepared",
      resting: true,
      terminal: false,
      detail:
        "no explicit M3 PaymentApproval could be bound to the live challenge terms; purchase created but NOT executed (fail closed)",
    };
  }

  // Step 4 — prepare + bind (M3), authoritative validation of live terms
  // against the approval bounds and rail config. Stops at READY_TO_SIGN.
  let prepared;
  let boundPurchase: PurchaseRecord;
  try {
    const bound = prepareApprovedPurchase({
      purchase,
      approval,
      challengeBody,
      config: deps.railConfig,
      intentId: intent.intentId,
      at: now(),
    });
    boundPurchase = bound.purchase; // carries boundTerms + approval, state "approved"
    prepared = bound.prepared;
  } catch (err) {
    // Live terms outside the founder-approved bounds or rail policy (wrong
    // network/asset/recipient, amount above the bound or the rail max, mainnet).
    // Refused BEFORE signing — no payment attempted, source-proven.
    return failSeam(intent, purchase, events, now(),
      `live challenge terms are outside the founder-approved bounds or rail policy: ${describe(err)} — refused before signing, no payment attempted`);
  }

  // Drive M3's REAL lifecycle machine in parallel with the purchase record so
  // the submitted/settled/result/verified states are produced by M3's own
  // machine (we do NOT reimplement it). Start from M3's `initial()`.
  let lc = initial(); // { state: "prepared", context: {} }
  lc = driveLifecycle(lc, { type: "request_approval", requestedBy: "m4-integration", reason: "monetary external acquisition" });
  lc = driveLifecycle(lc, { type: "grant_approval", grantedBy: approval.approver, approvalId: approval.approvalId });
  lc = driveLifecycle(lc, { type: "attempt_payment", paymentId: boundPurchase.id });

  // Step 5 — execute via the injected executor (M3): READY_TO_SIGN → submission.
  let submission: PaymentSubmissionResult;
  try {
    submission = await executeApprovedPayment(prepared, deps.executor);
  } catch (err) {
    // The executor threw. Whether this is a clean pre-submission failure or an
    // ambiguity depends on M3's error contract: an ambiguous error (or anything
    // not clearly pre-submission) means the payment MAY have reached the
    // merchant, so it routes to reconciliation and is NEVER retried here. (P7)
    if (isAmbiguous(err)) {
      return reconcileSeam(intent, boundPurchase, events, now(),
        `payment execution is ambiguous (possible submission): ${describe(err)} — reconciliation required, no retry`);
    }
    return failSeam(intent, boundPurchase, events, now(),
      `payment execution failed before submission: ${describe(err)} — no payment landed`);
  }

  if (!submission.submitted || !submission.transactionHash) {
    // Executor reported no submission. If it flagged ambiguity, reconcile; else
    // this is a source-proven pre-submission failure.
    if (isAmbiguousResult(submission)) {
      return reconcileSeam(intent, boundPurchase, events, now(),
        `payment submission is ambiguous (no transaction hash): ${describe(submission.note ?? submission.safeResponse)} — reconciliation required, no retry`);
    }
    return failSeam(intent, boundPurchase, events, now(),
      `payment was not submitted: ${describe(submission.note ?? "executor returned submitted=false")} — no payment landed`);
  }

  // M3 lifecycle: submitted. This is the FIRST point the intent becomes
  // `handed_off` in M4 — truthfully reflecting that execution was delegated and
  // a submission exists. submitted ≠ settled ≠ acquired: M4 records nothing
  // beyond the hand-off here and STOPS. (P3)
  lc = driveLifecycle(lc, { type: "submit_payment", transactionHash: submission.transactionHash });
  const handedOff = advanceIntent(intent, "handed_off", now(), {
    eventId: `evt_handoff_${submission.transactionHash}`,
    note: `handed to M3 buyer rail; submitted tx ${submission.transactionHash} (submitted ≠ settled ≠ acquired)`,
  });
  const handedOffIntent = handedOff.ok ? handedOff.intent : intent;
  const submittedPurchase: PurchaseRecord = {
    ...boundPurchase,
    state: lc.state,
    receipt: { transactionHash: submission.transactionHash },
    ...(submission.safeResponse?.data?.result !== undefined ? { stagedProviderResult: submission.safeResponse.data.result } : {}),
  };

  return {
    handedOff: true,
    purchase: submittedPurchase,
    intent: handedOffIntent,
    events,
    reconciliationRequired: false,
    submission,
    m3State: lc.state,
    resting: true, // waiting for the settlement/result observations
    terminal: false,
    detail: `M3 submitted tx ${submission.transactionHash}; M4 intent handed_off — awaiting settlement/result observations (submitted ≠ settled ≠ acquired)`,
  };
}

/**
 * Supervised variant for the production driver. Unlike the historic hand-off,
 * it consumes the already durable M3-approved purchase rather than rebuilding
 * it from a new challenge. The caller must durably record `payment_attempted`
 * before this function reaches the executor; a restart thereafter is therefore
 * reconciliation/observation only, never a new execution attempt.
 */
export async function handoffApprovedPurchaseToM3(input: {
  intent: ExecutionIntent;
  purchase: PurchaseRecord;
  deps: M3BuyerRailDeps;
  persistPaymentAttempt: (purchase: PurchaseRecord) => Promise<void>;
}): Promise<SeamResult> {
  const { intent, deps } = input;
  const now = deps.now ?? (() => Date.now());
  const events: HandoffEvent[] = [];
  const identity = purchaseIdentityFromIntent(intent);
  if (
    input.purchase.id !== identity.id || input.purchase.objectiveKey !== identity.objectiveKey
    || input.purchase.resourceNeedId !== identity.resourceNeedId || input.purchase.offeringId !== identity.offeringId
    || input.purchase.idempotencyKey !== identity.idempotencyKey
  ) throw new Error("durable M3 purchase identity does not match the persisted M4 intent");
  if (!mayHandOffExternally(intent.strategy, deps.mode, { spendApprovalId: intent.terms.approvalId, priceUsd: intent.terms.priceUsd })) {
    return { handedOff: false, purchase: input.purchase, intent, events, reconciliationRequired: false, submission: null, m3State: input.purchase.state, resting: true, terminal: false, detail: "M4 founder authority no longer permits M3 execution" };
  }
  if (input.purchase.state !== "approved" || !input.purchase.boundTerms || !input.purchase.approval) {
    throw new Error(`supervised execution requires a durable approved M3 purchase, got ${input.purchase.state}`);
  }
  if (intent.terms.approvalId !== input.purchase.approval.approvalId) throw new Error("M4 founder approval identity does not match the durable M3 approval");
  const prepared: PreparedPayment = {
    intent: { intentId: intent.intentId, terms: input.purchase.boundTerms, approval: input.purchase.approval, boundAt: input.purchase.updatedAt, state: "ready_to_sign" },
    terms: input.purchase.boundTerms, purchaseId: input.purchase.id, idempotencyKey: input.purchase.idempotencyKey, state: "ready_to_sign",
  };
  let lifecycle = initial();
  lifecycle = driveLifecycle(lifecycle, { type: "request_approval", requestedBy: "m4-production-driver", reason: "durable supervised purchase" });
  lifecycle = driveLifecycle(lifecycle, { type: "grant_approval", grantedBy: input.purchase.approval.approver, approvalId: input.purchase.approval.approvalId });
  lifecycle = driveLifecycle(lifecycle, { type: "attempt_payment", paymentId: input.purchase.id });
  const attempted: PurchaseRecord = { ...input.purchase, state: lifecycle.state, updatedAt: now() };
  try {
    await input.persistPaymentAttempt(attempted);
  } catch (error) {
    return failSeam(intent, input.purchase, events, now(), `payment attempt could not be durably recorded before executor invocation: ${describe(error)}`);
  }
  let submission: PaymentSubmissionResult;
  try {
    submission = await executeApprovedPayment(prepared, deps.executor);
  } catch (error) {
    if (isAmbiguous(error)) return reconcileSeam(intent, attempted, events, now(), `payment execution is ambiguous (possible submission): ${describe(error)} — reconciliation required, no retry`);
    return failSeam(intent, attempted, events, now(), `payment execution failed before submission: ${describe(error)} — no payment landed`);
  }
  if (!submission.submitted || !submission.transactionHash) {
    if (isAmbiguousResult(submission)) return reconcileSeam(intent, attempted, events, now(), `payment submission is ambiguous (no transaction hash): ${describe(submission.note ?? submission.safeResponse)} — reconciliation required, no retry`);
    return failSeam(intent, attempted, events, now(), `payment was not submitted: ${describe(submission.note ?? "executor returned submitted=false")} — no payment landed`);
  }
  lifecycle = driveLifecycle(lifecycle, { type: "submit_payment", transactionHash: submission.transactionHash });
  const moved = advanceIntent(intent, "handed_off", now(), { eventId: `evt_handoff_${submission.transactionHash}`, note: `handed to M3 buyer rail; submitted tx ${submission.transactionHash} (submitted ≠ settled ≠ acquired)` });
  const submittedPurchase: PurchaseRecord = { ...attempted, state: lifecycle.state, receipt: { transactionHash: submission.transactionHash }, ...(submission.safeResponse?.data?.result !== undefined ? { stagedProviderResult: submission.safeResponse.data.result } : {}), updatedAt: now() };
  return { handedOff: true, purchase: submittedPurchase, intent: moved.ok ? moved.intent : intent, events, reconciliationRequired: false, submission, m3State: lifecycle.state, resting: true, terminal: false, detail: `M3 submitted tx ${submission.transactionHash}; M4 intent handed_off — awaiting settlement/result observations (submitted ≠ settled ≠ acquired)` };
}

/**
 * OBSERVE: resume from a persisted M3 PurchaseRecord + M4 intent and observe the
 * next facts, advancing M3's lifecycle and mapping each meaningful change to an
 * M4 event/wake. Idempotent and resumable: call once per relevant wake. A fact
 * that is not yet observable is a REST (not a failure, not a retry).
 *
 *   submitted        → read settlement. Not settled ⇒ REST at handed_off (P3).
 *                      Settled ⇒ M3 settled; still NOT acquired/satisfied (P4).
 *   settled          → retrieve provider paid response. Not retrievable ⇒ REST
 *                      at settled (payment landed; do NOT repay; wait for the
 *                      provider_result wake) (P4). Retrievable ⇒ M3
 *                      result_received ⇒ M4 `provider_result` ⇒ result_recorded
 *                      + deduped wake. Receipt separated from verification (P5).
 *   result_received  → verify. Verified ⇒ M3 verified ⇒ M4 `verification_result`
 *                      ⇒ intent verified (result + verification evidence refs)
 *                      + deduped wake (P6). Rejected ⇒ M4 intent failed
 *                      (source-proven by the application verifier; no repay).
 *
 * A PAYMENT ambiguity (never a settled-purchase result gap) routes to
 * reconciliation_required; the seam never retries. (P7/P8)
 */
export async function observePurchase(
  intent: ExecutionIntent,
  purchase: PurchaseRecord,
  deps: M3BuyerRailDeps,
): Promise<SeamResult> {
  const now = deps.now ?? (() => Date.now());
  const events: HandoffEvent[] = [];
  let currentIntent = intent;
  let currentPurchase = purchase;
  // Reconstruct M3's lifecycle position from the persisted purchase state so we
  // keep driving M3's REAL machine rather than a parallel one.
  let lc: { state: PaymentState; context: PaymentContext } = {
    state: purchase.state,
    context: {
      approvalId: purchase.approval?.approvalId,
      transactionHash: purchase.receipt?.transactionHash,
      settlementProof:
        purchase.state === "settled" || purchase.state === "result_received" || purchase.state === "verified"
          ? `settlement@${purchase.receipt?.settledAt ?? 0}`
          : undefined,
      resultData: purchase.result ?? undefined,
    },
  };
  const transactionHash = purchase.receipt?.transactionHash ?? null;

  // Terminal / non-observable states: nothing to do, no retry, no repayment.
  if (
    purchase.state === "verified" ||
    purchase.state === "failed" ||
    purchase.state === "reconciliation_required" ||
    purchase.state === "uncertain"
  ) {
    return {
      handedOff: true,
      purchase: currentPurchase,
      intent: currentIntent,
      events,
      reconciliationRequired: purchase.state === "reconciliation_required" || purchase.state === "uncertain",
      submission: null,
      m3State: purchase.state,
      resting: purchase.state !== "verified" && purchase.state !== "failed",
      terminal: purchase.state === "verified" || purchase.state === "failed",
      detail: `M3 purchase already in ${purchase.state}; observation is a no-op (no retry, no repayment)`,
    };
  }

  // submitted → observe settlement.
  if (purchase.state === "submitted") {
    if (!transactionHash) {
      return reconcileSeam(currentIntent, currentPurchase, events, now(),
        "submitted purchase has no transaction hash to reconcile against — reconciliation required, no retry");
    }
    const settlement = await deps.settlementReader.readSettlement(transactionHash);
    if (!settlement.settled) {
      // An observed revert is DIRECT proof of non-settlement and must never be
      // flattened into "not yet". Record it through M3's real machine (report_failure
      // from `submitted` is a legal transition into reconciliation_required: proven
      // non-settlement still cannot authorize blind repayment without reconciliation)
      // and stop loudly — never rest forever at submitted on terminal evidence.
      if ("observation" in settlement && settlement.observation === "reverted") {
        lc = driveLifecycle(lc, {
          type: "report_failure",
          failureReason: `settlement reverted on-chain: tx ${transactionHash} receipt status 0x0 (proven non-settlement)`,
        });
        return reconcileSeam(currentIntent, { ...currentPurchase, state: lc.state }, events, now(),
          `M3 settlement readback OBSERVED a reverted receipt for tx ${transactionHash} (block ${settlement.blockNumber ?? "unknown"}) — proven non-settlement, NOT pending; recorded at reconciliation_required, no blind repayment, no rest-as-pending`);
      }
      // An observed mismatch (malformed receipt, wrong hash, status neither 0x0
      // nor 0x1, missing provenance/transfer evidence) contradicts the expected
      // settlement. It is NOT "not yet" either: route to reconciliation, never rest.
      if ("observation" in settlement && settlement.observation === "mismatch") {
        lc = driveLifecycle(lc, {
          type: "report_failure",
          failureReason: `settlement readback mismatch: ${settlement.reason}`,
        });
        return reconcileSeam(currentIntent, { ...currentPurchase, state: lc.state }, events, now(),
          `M3 settlement readback OBSERVED a mismatch for tx ${transactionHash}: ${settlement.reason} — settlement cannot be confirmed or disproven, NOT pending; recorded at reconciliation_required, no blind repayment`);
      }
      // Genuinely pending (explicit observation, or a legacy boolean-only reader
      // that cannot classify): truthful REST. submitted ≠ settled; M4 stays handed_off.
      return {
        handedOff: true,
        purchase: currentPurchase,
        intent: currentIntent,
        events,
        reconciliationRequired: false,
        submission: null,
        m3State: "submitted",
        resting: true,
        terminal: false,
        detail: `M3 submitted tx ${transactionHash}; settlement not yet observed — M4 rests at handed_off (submitted ≠ settled ≠ acquired)`,
      };
    }
    lc = driveLifecycle(lc, { type: "confirm_settlement", settlementProof: `settlement@${settlement.settledAt ?? now()}` });
    currentPurchase = {
      ...currentPurchase,
      state: lc.state,
      receipt: { transactionHash, settledAt: settlement.settledAt },
    };
    // SETTLEMENT is ONE distinct fact. Stop here and return: settled ≠
    // result_received. M4 records NO business consequence yet (still not
    // acquired, still not satisfied); a later provider_result wake drives the
    // next observation. Advancing further in this same call would collapse
    // submitted ≠ settled ≠ result_received ≠ verified. (P3/P4)
    return {
      handedOff: true,
      purchase: currentPurchase,
      intent: currentIntent,
      events,
      reconciliationRequired: false,
      submission: null,
      m3State: lc.state,
      resting: true,
      terminal: false,
      detail: `M3 settled tx ${transactionHash}; M4 records no business consequence yet — settled ≠ result_received ≠ verified (awaiting provider_result)`,
    };
  }

  // settled → retrieve the provider paid response (ONE step).
  if (purchase.state === "settled") {
    const resource = purchase.boundTerms?.resource;
    if (!resource || !transactionHash) {
      return reconcileSeam(currentIntent, currentPurchase, events, now(),
        "settled purchase is missing bound resource/transaction needed to retrieve the provider result — reconciliation required, no retry");
    }
    // The official signed replay may already have returned a safe protected
    // response. It is staged durably with the submitted purchase, but becomes
    // an M3 `result_received` fact only after independent settlement. This
    // avoids a second signed replay after process restart.
    const paid = currentPurchase.stagedProviderResult !== undefined
      ? { success: true, result: currentPurchase.stagedProviderResult }
      : await deps.paidRequestSender.sendWithPayment(resource, transactionHash);
    if (!paid.success || paid.result === undefined) {
      // Payment DID settle, so this is a gap in RESULT retrieval, NOT payment
      // ambiguity. Truthful REST at settled: do NOT repay, wait for the
      // provider_result wake. (P4 — settled is not verified result.)
      return {
        handedOff: true,
        purchase: currentPurchase,
        intent: currentIntent,
        events,
        reconciliationRequired: false,
        submission: null,
        m3State: "settled",
        resting: true,
        terminal: false,
        detail: `M3 settled but the provider paid-response is not yet retrievable — M4 rests at settled (payment landed; do NOT repay; awaiting provider_result)`,
      };
    }
    lc = driveLifecycle(lc, { type: "receive_result", resultData: paid.result });
    currentPurchase = { ...currentPurchase, state: lc.state, result: paid.result };
    const resultEvidenceId = `ev_result_${hash24(`${intent.intentId}:${transactionHash}`)}`;
    const providerEvent = {
      kind: "provider_result" as const,
      intentId: intent.intentId,
      eventId: resultEvidenceId,
      resultEvidenceId,
      at: now(),
    };
    const recorded = applyRailEvent(currentIntent, providerEvent);
    if (recorded.ok) currentIntent = recorded.intent;
    const providerWake = planWakeForRailEvent(providerEvent);
    if (providerWake.ok)
      events.push({ reason: providerWake.wakeReason, dedupeKey: providerWake.dedupeKey, m3State: "result_received" });
    // RESULT RECEIPT is ONE distinct fact; verification is a SEPARATE later
    // step. Return now — do NOT verify in this call. (P5)
    return {
      handedOff: true,
      purchase: currentPurchase,
      intent: currentIntent,
      events,
      reconciliationRequired: false,
      submission: null,
      m3State: lc.state,
      resting: true,
      terminal: false,
      detail: `M3 result_received: provider result recorded (result ${resultEvidenceId}); M4 intent result_recorded — NOT yet verified (verification is a separate step)`,
    };
  }

  // result_received → verify (ONE step, terminal).
  if (purchase.state === "result_received") {
    const verification = deps.verifyResult({ intent, purchase: currentPurchase, result: currentPurchase.result });
    const verificationEvidenceId = `ev_verify_${hash24(`${intent.intentId}:${verification.verificationProof}`)}`;
    const verifyEvent = {
      kind: "verification_result" as const,
      intentId: intent.intentId,
      eventId: verificationEvidenceId,
      verified: verification.verified,
      verificationEvidenceId,
      at: now(),
    };
    const verifiedTransition = applyRailEvent(currentIntent, verifyEvent);
    if (verifiedTransition.ok) currentIntent = verifiedTransition.intent;
    const verifyWake = planWakeForRailEvent(verifyEvent);
    if (verifyWake.ok)
      events.push({ reason: verifyWake.wakeReason, dedupeKey: verifyWake.dedupeKey, m3State: "verified" });

    if (verification.verified) {
      lc = driveLifecycle(lc, { type: "verify_result", verificationProof: verification.verificationProof });
      currentPurchase = { ...currentPurchase, state: lc.state, verified: true };
      return {
        handedOff: true,
        purchase: currentPurchase,
        intent: currentIntent,
        events,
        reconciliationRequired: false,
        submission: null,
        m3State: lc.state,
        resting: false,
        terminal: true,
        detail: `M3 verified: result independently verified (${verification.verificationProof}); M4 intent verified with result ${currentIntent.resultEvidenceId} + verification ${currentIntent.verificationEvidenceId} evidence refs — Somebody may reassess Requirement satisfaction`,
      };
    }
    // Verification rejected the provider result ⇒ M4 intent failed (source-proven
    // by the application verifier). Payment settled; this is a rejected RESULT,
    // not payment ambiguity. No repayment.
    currentPurchase = { ...currentPurchase, state: "failed", verified: false };
    return {
      handedOff: true,
      purchase: currentPurchase,
      intent: currentIntent,
      events,
      reconciliationRequired: false,
      submission: null,
      m3State: "failed",
      resting: false,
      terminal: true,
      detail: `M3 verification REJECTED the provider result (${verification.verificationProof}); M4 intent failed — payment settled but the acquired result did not verify`,
    };
  }

  // prepared / awaiting_approval / approved / payment_attempted reached here only
  // if the caller observes a purchase that never submitted: nothing to advance.
  return {
    handedOff: false,
    purchase: currentPurchase,
    intent: currentIntent,
    events,
    reconciliationRequired: false,
    submission: null,
    m3State: currentPurchase.state,
    resting: true,
    terminal: false,
    detail: `M3 purchase is at ${currentPurchase.state}; no further fact is observable yet — rest, no retry`,
  };
}

/**
 * Convenience: hand off, then observe repeatedly until the lifecycle is terminal
 * or rests with no further progress. Used by the production-style simulated
 * trace; the focused tests drive `handoffIntentToM3` / `observePurchase` step by
 * step so each state (submitted / settled / result_received / verified) is
 * asserted distinctly. Bounded by `maxObservations` so a non-advancing rest can
 * never loop forever. Returns the LAST SeamResult plus the full event trail.
 */
export async function runPurchaseLifecycle(
  intent: ExecutionIntent,
  deps: M3BuyerRailDeps,
  opts: { maxObservations?: number } = {},
): Promise<{ final: SeamResult; trail: HandoffEvent[]; observations: number }> {
  const maxObservations = opts.maxObservations ?? 8;
  const trail: HandoffEvent[] = [];
  let result = await handoffIntentToM3(intent, deps);
  trail.push(...result.events);
  let observations = 0;
  // Only keep observing while a purchase exists, we are not terminal, and the
  // last step actually advanced (resting with no new events means "wait for a
  // real wake", which in this convenience driver we stop at).
  while (
    result.purchase &&
    !result.terminal &&
    !result.reconciliationRequired &&
    observations < maxObservations
  ) {
    const before = result.m3State;
    const next = await observePurchase(result.intent, result.purchase, deps);
    observations += 1;
    trail.push(...next.events);
    const advanced = next.m3State !== before || next.events.length > 0;
    result = next;
    if (!advanced) break; // resting: no further fact observable in this driver
  }
  return { final: result, trail, observations };
}

// ── BuyerRailPort adapter ────────────────────────────────────────────────────
//
// Implements M4's existing narrow `BuyerRailPort` so the intent hand-off in
// intents.ts can drive the REAL M3 rail. `submitForPurchase` performs the
// hand-off above and reports acceptance (a submission exists). The richer
// SeamResult (intent + events + purchase) is available via `handoff()` /
// `observe()`; the port is the minimal surface M4's own `attemptHandoff` expects.

export function m3BuyerRailAdapter(
  deps: M3BuyerRailDeps,
): BuyerRailPort & {
  handoff(intent: ExecutionIntent): Promise<SeamResult>;
  observe(intent: ExecutionIntent, purchase: PurchaseRecord): Promise<SeamResult>;
} {
  return {
    describe: () =>
      "M3 buyer rail adapter (real M3 purchase/lifecycle/executor; injected wallet/TEE) — application-owned seam, NOT a mock",
    async submitForPurchase(intent) {
      const attempt = await handoffIntentToM3(intent, deps);
      return attempt.handedOff && attempt.submission?.transactionHash
        ? { accepted: true as const, railRef: `m3:${attempt.submission.transactionHash}` }
        : { accepted: false as const, reason: attempt.detail };
    },
    handoff: (intent) => handoffIntentToM3(intent, deps),
    observe: (intent, purchase) => observePurchase(intent, purchase, deps),
  };
}

// ── internal helpers ─────────────────────────────────────────────────────────

// Drive M3's REAL lifecycle machine, tolerating an illegal transition by
// leaving state unchanged (M3 returns a typed rejection; we never throw here —
// the purchase record and the M4 intent are the durable truth, and an unexpected
// lifecycle rejection must not abort an otherwise-valid observation).
function driveLifecycle(
  current: { state: PaymentState; context: PaymentContext },
  event: Parameters<typeof transition>[1],
): { state: PaymentState; context: PaymentContext } {
  const result = transition(current.state, event, current.context);
  return result.success
    ? { state: result.state, context: result.context }
    : current;
}

function failSeam(
  intent: ExecutionIntent,
  purchase: PurchaseRecord | null,
  events: HandoffEvent[],
  at: number,
  detail: string,
): SeamResult {
  const eventId = `ev_fail_${hash24(`${intent.intentId}:${detail}`)}`;
  const failed = applyRailEvent(intent, {
    kind: "rail_failure",
    intentId: intent.intentId,
    eventId,
    reason: detail,
    at,
  });
  const failedIntent = failed.ok ? failed.intent : intent;
  const wake = planWakeForRailEvent({
    kind: "rail_failure",
    intentId: intent.intentId,
    eventId,
    reason: detail,
    at,
  });
  if (wake.ok) events.push({ reason: wake.wakeReason, dedupeKey: wake.dedupeKey, m3State: "failed" });
  return {
    handedOff: false,
    // A source-proven pre-submission failure means no money moved, so the M3
    // record is terminal `failed` (never left dangling at prepared/approved).
    // When no purchase was ever created (challenge fetch/normalize failed) it
    // stays null — nothing to mark.
    purchase: purchase ? { ...purchase, state: "failed" } : null,
    intent: failedIntent,
    events,
    reconciliationRequired: false,
    submission: null,
    m3State: "failed",
    resting: false,
    terminal: true,
    detail,
  };
}

function reconcileSeam(
  intent: ExecutionIntent,
  purchase: PurchaseRecord,
  events: HandoffEvent[],
  at: number,
  detail: string,
): SeamResult {
  // M4 intent → reconciliation_required. This is the ONLY exit for an ambiguous
  // PAYMENT execution: read blockchain/provider/payment truth later; never retry
  // here. authorized/awaiting_m3/handed_off → reconciliation_required are all
  // legal moves in M4's transition table.
  const target: ExecutionIntentState = "reconciliation_required";
  const moved = advanceIntent(intent, target, at, {
    eventId: `ev_recon_${hash24(`${intent.intentId}:${detail}`)}`,
    note: detail,
  });
  const reconIntent = moved.ok ? moved.intent : intent;
  const dedupeKey = `intent:${intent.intentId}:reconciliation_required:${hash24(detail)}`;
  events.push({ reason: "recovery_event", dedupeKey, m3State: "reconciliation_required" });
  return {
    handedOff: true,
    purchase: { ...purchase, state: "reconciliation_required" },
    intent: reconIntent,
    events,
    reconciliationRequired: true,
    submission: null,
    m3State: "reconciliation_required",
    resting: true,
    terminal: false,
    detail,
  };
}

// An executor error is ambiguous when M3 says so explicitly, or when it is not a
// clearly pre-submission failure. Anything ambiguous routes to reconciliation.
function isAmbiguous(err: unknown): boolean {
  const name = (err as { name?: string })?.name ?? "";
  if (name === "OfficialPaymentAmbiguousError") return true;
  if (name === "PaymentExecutionAlreadyClaimedError") return true; // a prior attempt exists ⇒ reconcile
  if (name === "OfficialPaymentPreSubmissionError") return false; // M3 proved pre-submission
  const msg = describe(err).toLowerCase();
  return !msg.includes("before submission") && !msg.includes("pre-submission");
}

function isAmbiguousResult(result: PaymentSubmissionResult): boolean {
  if (result.submitted) return false;
  // No submission reported: ambiguous only if the safe response hints the
  // process may have reached the merchant (exit code null / unknown status).
  const safe = result.safeResponse;
  if (!safe) return false;
  return safe.exitCode === null || safe.ok === null;
}

function describe(value: unknown): string {
  if (value instanceof Error) return `${value.name}: ${value.message}`;
  if (typeof value === "string") return value;
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}
