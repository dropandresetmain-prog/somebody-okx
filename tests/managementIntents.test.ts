// CP6 — the external seam, tested as shipped: an intent can ONLY be born from
// a deterministic authorization; identities are replay-stable; the mock buyer
// rail is unmistakably mock; M3-unavailable rests truthfully in awaiting_m3;
// provider events flow result → verification → wake, and a "success" claim is
// DATA until the application verifier says otherwise.
import test from "node:test";
import assert from "node:assert/strict";
import {
  applyRailEvent,
  attemptHandoff,
  createIntentFromAuthorization,
  deriveIdempotencyKey,
  deriveIntentId,
  mockBuyerRailFixture,
  planWakeForRailEvent,
  advanceIntent,
  type ExternalRailEvent,
} from "../lib/management/intents";
import { optionIdFor, withEligibility, eligibilityInputFor, buildExternalOption, EMPTY_FACTS, type EligibilityFacts } from "../lib/management/options";
import type { AuthorizationResult, ExecutionIntent, GroundedOption } from "../lib/management/types";

const at0 = 1700000000000;

const facts: EligibilityFacts = {
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

function eligibleBuyOption(): GroundedOption {
  const option = buildExternalOption({
    requirementKey: "social_intel",
    contractRevision: 1,
    offeringId: "reg_offer_1",
    providerId: "prov_x",
    serviceId: "svc_x",
    resourceClass: "proprietary_data",
    priceUsd: 4,
    priceProvenance: "provider_quote",
    registryVerified: true,
    compatibleResourceClass: true,
    facts: {
      ...EMPTY_FACTS,
      externalPriceUsd: { value: 4, provenance: "provider_quote" as const, sourceRef: "reg_offer_1", observedAt: at0, confidence: "high" as const },
    },
  });
  return withEligibility([option], (o) => eligibilityInputFor(o, facts))[0];
}

const authorized: AuthorizationResult = {
  kind: "authorized",
  decisionId: "dec_1",
  requirementKey: "social_intel",
  contractRevision: 1,
  strategy: "BUY",
  optionId: optionIdFor({ requirementKey: "social_intel", contractRevision: 1, kind: "external", target: "external:reg_offer_1" }),
  authorizedAt: at0,
};

function intent(mode: "m3_unavailable" | "m3_available_bounded" = "m3_unavailable"): ExecutionIntent {
  const built = createIntentFromAuthorization({
    objectiveKey: "obj_x", authorization: authorized, option: eligibleBuyOption(), at: at0, mode,
  });
  assert.equal(built.ok, true, built.ok ? "" : built.reason);
  if (!built.ok) throw new Error();
  return built.intent;
}

// ── only an authorization mints an intent ───────────────────────────────────

test("a refusal or approval_required never creates an intent; an authorized BUY always does", () => {
  const refusal = createIntentFromAuthorization({
    objectiveKey: "obj_x",
    authorization: { kind: "refused", requirementKey: "social_intel", contractRevision: 1, reasons: ["budget_exceeded"], detail: "over budget" },
    option: eligibleBuyOption(), at: at0, mode: "m3_available_bounded",
  });
  assert.equal(refusal.ok, false);
  const ask = createIntentFromAuthorization({
    objectiveKey: "obj_x",
    authorization: { kind: "approval_required", requirementKey: "social_intel", contractRevision: 1, question: "approve?", reason: "spend_authority_required" },
    option: eligibleBuyOption(), at: at0, mode: "m3_available_bounded",
  });
  assert.equal(ask.ok, false);
  // MAKE authorizations have no external effect to intend
  const make = createIntentFromAuthorization({
    objectiveKey: "obj_x",
    authorization: { ...authorized, strategy: "MAKE", optionId: "opt_internal" },
    option: eligibleBuyOption(), at: at0, mode: "m3_available_bounded",
  });
  assert.equal(make.ok, false);
  assert.match(make.ok ? "" : make.reason, /no external effect/);
});

test("an intent cannot reference an option the authorization did not authorize, nor an ineligible option", () => {
  const mismatch = createIntentFromAuthorization({
    objectiveKey: "obj_x", authorization: authorized,
    option: { ...eligibleBuyOption(), optionId: "opt_other" }, at: at0, mode: "m3_available_bounded",
  });
  assert.equal(mismatch.ok, false);
  assert.match(mismatch.ok ? "" : mismatch.reason, /does not match/);
  const ineligible = { ...eligibleBuyOption(), eligibility: { eligible: false as const, reasons: ["budget_exceeded" as const], detail: "x" } };
  const bad = createIntentFromAuthorization({
    objectiveKey: "obj_x", authorization: { ...authorized, optionId: ineligible.optionId }, option: ineligible, at: at0, mode: "m3_available_bounded",
  });
  assert.equal(bad.ok, false);
  assert.match(bad.ok ? "" : bad.reason, /ineligible/);
});

// ── replay-stable identity ───────────────────────────────────────────────────

test("the same authorized decision replayed builds byte-identical intentId + idempotencyKey — no twin intents", () => {
  const a = intent();
  const b = intent();
  assert.equal(a.intentId, b.intentId);
  assert.equal(a.idempotencyKey, b.idempotencyKey);
  assert.equal(a.intentId, deriveIntentId({ objectiveKey: "obj_x", requirementKey: "social_intel", contractRevision: 1, optionId: authorized.optionId }));
  assert.equal(a.idempotencyKey, deriveIdempotencyKey({ objectiveKey: "obj_x", requirementKey: "social_intel", contractRevision: 1, optionId: authorized.optionId }));
});

// ── the M3 boundary, stated truthfully ───────────────────────────────────────

test("m3_unavailable: the intent is BORN in awaiting_m3 with a boundary note — nothing hidden, nothing claimed", () => {
  const waiting = intent("m3_unavailable");
  assert.equal(waiting.state, "awaiting_m3");
  assert.match(waiting.boundaryNote, /no payment was attempted or made/);
  assert.equal(waiting.attempts, 0);
});

test("m3_available_bounded + MOCK rail: hand-off marks the rail mock in every trace and moves exactly one state", async () => {
  const rail = mockBuyerRailFixture({ reg_offer_1: { railRef: "fix_1" } });
  assert.match(rail.describe(), /MOCK\/FIXTURE/);
  assert.match(rail.describe(), /NOT M3/);
  const result = await attemptHandoff(intent("m3_available_bounded"), rail, "m3_available_bounded", at0 + 1);
  assert.equal(result.handedOff, true);
  assert.equal(result.intent.state, "handed_off");
  assert.equal(result.intent.attempts, 1);
  assert.match(result.intent.boundaryNote, /MOCK\/FIXTURE/);
  assert.match(result.detail, /mock:fix_1/);
});

test("a replayed hand-off NEVER resubmits, and external_disabled never contacts any rail", async () => {
  let calls = 0;
  const counting = mockBuyerRailFixture({ reg_offer_1: { railRef: "fix_1" } });
  const rail = {
    describe: counting.describe,
    async submitForPurchase(i: ExecutionIntent) { calls += 1; return counting.submitForPurchase(i); },
  };
  const base = intent("m3_available_bounded");
  const first = await attemptHandoff(base, rail, "m3_available_bounded", at0);
  const again = await attemptHandoff(first.intent, rail, "m3_available_bounded", at0 + 1);
  assert.equal(calls, 1, "exactly one submit per logical effect");
  assert.equal(again.handedOff, true);
  assert.equal(again.intent.attempts, 1, "attempts did not double-count");
  const disabled = await attemptHandoff({ ...base, state: "authorized" }, rail, "external_disabled" as const, at0 + 2);
  assert.equal(calls, 1, "external_disabled contacted nothing");
  assert.equal(disabled.handedOff, false);
});

test("a rail that refuses leaves the intent authorized with the refusal as detail — never a fake success", async () => {
  const rail = mockBuyerRailFixture({}); // no fixtures at all
  const result = await attemptHandoff(intent("m3_available_bounded"), rail, "m3_available_bounded", at0);
  assert.equal(result.handedOff, false);
  assert.equal(result.intent.state, "authorized");
  assert.match(result.detail, /real M3 rail is the only production path/);
});

// ── provider result / verification events: data first, verified after ────────

test("provider result is DATA (result_recorded); only an application verification event reaches verified", async () => {
  const rail = mockBuyerRailFixture({ reg_offer_1: { railRef: "fix_1" } });
  const { intent: handed } = await attemptHandoff(intent("m3_available_bounded"), rail, "m3_available_bounded", at0);
  const resultEvent: ExternalRailEvent = { kind: "provider_result", intentId: handed.intentId, eventId: "evt_r1", resultEvidenceId: "ev_r1", at: at0 + 10 };
  const recorded = applyRailEvent(handed, resultEvent);
  assert.equal(recorded.ok, true);
  if (!recorded.ok) return;
  assert.equal(recorded.intent.state, "result_recorded");
  assert.equal(recorded.intent.resultEvidenceId, "ev_r1");
  assert.match(recorded.intent.boundaryNote, /NOT yet verified/);
  const verification: ExternalRailEvent = { kind: "verification_result", intentId: handed.intentId, eventId: "evt_v1", verified: true, verificationEvidenceId: "ev_v1", at: at0 + 20 };
  const verified = applyRailEvent(recorded.intent, verification);
  assert.equal(verified.ok, true);
  if (verified.ok) assert.equal(verified.intent.state, "verified");
});

test("a REJECTED verification cannot verify; a replayed event id is refused; verified is terminal", () => {
  const handed = { ...intent("m3_available_bounded"), state: "handed_off" as const };
  const recorded = applyRailEvent(handed, { kind: "provider_result", intentId: handed.intentId, eventId: "evt_r1", resultEvidenceId: "ev_r1", at: at0 });
  assert.ok(recorded.ok);
  const rejected = applyRailEvent(recorded.intent, { kind: "verification_result", intentId: handed.intentId, eventId: "evt_v2", verified: false, verificationEvidenceId: "ev_v2", at: at0 + 1 });
  assert.equal(rejected.ok, true);
  if (rejected.ok) assert.equal(rejected.intent.state, "failed");
  // event-cursor guard: a legal transition carrying an ALREADY-APPLIED event
  // id is refused (reconciliation → result_recorded is legal, the cursor is not)
  const reconciled = { ...recorded.intent, state: "reconciliation_required" as const, lastEventId: "evt_r1" };
  const replay = applyRailEvent(reconciled, { kind: "provider_result", intentId: handed.intentId, eventId: "evt_r1", resultEvidenceId: "ev_r1", at: at0 + 5 });
  assert.equal(replay.ok, false);
  assert.match(replay.ok ? "" : replay.reason, /already applied/);
  // a genuinely NEW event does exit reconciliation
  assert.equal(applyRailEvent(reconciled, { kind: "provider_result", intentId: handed.intentId, eventId: "evt_r2", resultEvidenceId: "ev_r2", at: at0 + 6 }).ok, true);
  // verified is terminal
  const done = { ...recorded.intent, state: "verified" as const };
  assert.equal(advanceIntent(done, "failed", at0 + 2, null).ok, false);
});

test("illegal skips are refused: authorized→verified, awaiting_m3→result_recorded", () => {
  const base = intent("m3_available_bounded");
  assert.equal(advanceIntent({ ...base, state: "authorized" }, "verified", at0, { eventId: "e1" }).ok, false);
  assert.equal(advanceIntent(base, "result_recorded", at0, { eventId: "e2", resultEvidenceId: "x" }).ok, false);
});

// ── wake routing: event-identity dedupe, exactly-once wake per event ─────────

test("rail events route to typed wake reasons with event-scoped dedupe keys", () => {
  const plans = [
    planWakeForRailEvent({ kind: "provider_result", intentId: "int_a", eventId: "evt_1", resultEvidenceId: "ev", at: at0 }),
    planWakeForRailEvent({ kind: "verification_result", intentId: "int_a", eventId: "evt_2", verified: true, verificationEvidenceId: "ev", at: at0 }),
    planWakeForRailEvent({ kind: "rail_failure", intentId: "int_a", eventId: "evt_3", reason: "boom", at: at0 }),
  ];
  assert.deepEqual(plans.map((p) => (p.ok ? p.wakeReason : p.ok)), ["provider_result", "verification_result", "recovery_event"]);
  const keys = plans.map((p) => (p.ok ? p.dedupeKey : ""));
  assert.equal(new Set(keys).size, 3, "each event wakes Somebody exactly once, under its own identity");
  // identical redelivery ⇒ identical dedupeKey ⇒ appendWakeEvent returns duplicate
  const same = planWakeForRailEvent({ kind: "provider_result", intentId: "int_a", eventId: "evt_1", resultEvidenceId: "ev", at: at0 });
  assert.equal(same.ok && same.dedupeKey, keys[0]);
});
