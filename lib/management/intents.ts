// CP6 — the external seam: AuthorizedExecutionIntent creation, the M3 buyer
// rail boundary, and the provider-result/verification → wake flow.
//
// Hard boundaries this file must keep:
//   - An intent exists ONLY as the residue of a DETERMINISTIC authorization
//     (authorization.ts). A refusal or an approval_required never mints one,
//     and this module never re-decides anything.
//   - M3 owns payment. This file does not model purchase states
//     (submitted/uncertain/settled/…): it tracks only Somebody's OWN intent
//     lifecycle. The mock rail below is labelled MOCK/FIXTURE end to end and
//     cannot be confused with M3 success — the truthful resting state while
//     M3/R2 is unavailable is `awaiting_m3` + a boundaryNote, not a fake ack.
//   - Identities are derived, never invented: the same authorized decision
//     replayed through a duplicate wake rebuilds byte-identical intent ids and
//     idempotency keys, so the buyer rail can reject a double-submit and M4
//     can never grow a twin intent.
//   - Provider claims are DATA. A rail "success" moves the intent to
//     result_recorded; only an application verifier moves it to verified —
//     the same model-proposes/application-authorizes rule as everywhere else.

import { mayHandOffExternally, type ExternalAuthorityMode } from "./authorization";
import { hash24, identityMaterial } from "./sha256";
import type {
  AuthorizationResult,
  ExecutionIntent,
  ExecutionIntentState,
  GroundedOption,
  WakeReason,
} from "./types";

// ── deterministic identities ─────────────────────────────────────────────────

// One logical effect = one intent, forever. The key is the AUTHORIZED DECISION
// identity (requirement + revision + option), not a timestamp or a random.
export function deriveIntentId(input: {
  objectiveKey: string;
  requirementKey: string;
  contractRevision: number;
  optionId: string;
}): string {
  return `int_${hash24(
    identityMaterial([input.objectiveKey, input.requirementKey, String(input.contractRevision), input.optionId]),
  )}`;
}

export function deriveIdempotencyKey(input: {
  objectiveKey: string;
  requirementKey: string;
  contractRevision: number;
  optionId: string;
}): string {
  return `idem_${hash24(
    identityMaterial([input.objectiveKey, input.requirementKey, String(input.contractRevision), input.optionId]),
  )}`;
}

// ── creation from an authorization (the ONLY way an intent is born) ──────────

export type IntentCreationResult =
  | { ok: true; intent: ExecutionIntent }
  | { ok: false; reason: string };

export function createIntentFromAuthorization(input: {
  objectiveKey: string;
  authorization: AuthorizationResult;
  option: GroundedOption;
  at: number;
  mode: ExternalAuthorityMode;
}): IntentCreationResult {
  const { authorization, option } = input;
  if (authorization.kind !== "authorized")
    return { ok: false, reason: `authorization is ${authorization.kind}; only an authorized decision creates an intent` };
  if (authorization.strategy !== "BUY" && authorization.strategy !== "HYBRID")
    return { ok: false, reason: `strategy ${authorization.strategy} has no external effect to intend` };
  if (option.kind === "internal" || !option.external)
    return { ok: false, reason: "authorized option carries no concrete external offering" };
  if (authorization.optionId !== option.optionId)
    return { ok: false, reason: "option does not match the authorized optionId" };
  if (!option.eligibility.eligible)
    return { ok: false, reason: "ineligible options may never become effects" };

  const intentId = deriveIntentId({
    objectiveKey: input.objectiveKey,
    requirementKey: authorization.requirementKey,
    contractRevision: authorization.contractRevision,
    optionId: option.optionId,
  });
  const idempotencyKey = deriveIdempotencyKey({
    objectiveKey: input.objectiveKey,
    requirementKey: authorization.requirementKey,
    contractRevision: authorization.contractRevision,
    optionId: option.optionId,
  });
  // The very first state already encodes the boundary: with no hand-off
  // permission the intent rests in awaiting_m3 — recorded, visible, honest.
  //
  // R3 A4 — the founder approval record travels with the intent. A monetary
  // external effect is only handoff-able once that approval identity is bound,
  // and requiresApproval/approvalId are derived from it instead of being
  // hard-coded to false/null (which is exactly how an unapproved BUY used to
  // reach the rail looking fully authorized).
  const priceUsd = option.external.priceUsd;
  const monetary = priceUsd !== null && priceUsd > 0;
  const spendApprovalId = authorization.spendApprovalId ?? null;
  const mayHandOff = mayHandOffExternally(authorization.strategy, input.mode, {
    spendApprovalId,
    priceUsd,
  });
  const intent: ExecutionIntent = {
    intentId,
    idempotencyKey,
    objectiveKey: input.objectiveKey,
    requirementKey: authorization.requirementKey,
    contractRevision: authorization.contractRevision,
    decisionId: authorization.decisionId,
    // M4 intends ACQUISITIONS only — an effect that changes the external world
    // beyond buying is out of scope until a governed effect vocabulary exists.
    kind: "external_acquisition",
    strategy: authorization.strategy,
    target: {
      offeringId: option.external.offeringId,
      providerId: option.external.providerId,
      serviceId: option.external.serviceId,
      resourceClass: option.external.resourceClass,
      endpointRef: null,
    },
    terms: {
      priceUsd,
      priceProvenance: option.external.priceSource,
      // Monetary and unapproved ⇒ still flagged, even though authorization.ts
      // fails that case closed upstream. Belt and braces, never a silent false.
      requiresApproval: monetary && spendApprovalId === null,
      approvalId: spendApprovalId,
    },
    state: mayHandOff ? "authorized" : "awaiting_m3",
    attempts: 0,
    lastEventId: null,
    resultEvidenceId: null,
    verificationEvidenceId: null,
    boundaryNote: mayHandOff
      ? "intent authorized under m3_available_bounded with founder approval "
        + `${spendApprovalId}; hand-off attempted by the caller`
      : monetary && spendApprovalId === null
        ? "M4 did NOT hand this off: no founder approval record is bound, so no payment may be attempted"
        : "M4 stopped at the buyer-rail boundary: M3/R2 payment authority is not available, so this intent is RECORDED and waits — no payment was attempted or made",
    createdAt: input.at,
    updatedAt: input.at,
  };
  return { ok: true, intent };
}

// ── intent lifecycle: a SMALL monotone state machine, NOT a payment machine ──

const LEGAL_INTENT_TRANSITIONS: Record<ExecutionIntentState, readonly ExecutionIntentState[]> = {
  authorized: ["handed_off", "awaiting_m3", "failed", "reconciliation_required"],
  awaiting_m3: ["handed_off", "failed", "reconciliation_required"], // M3 arriving later resumes it
  handed_off: ["result_recorded", "failed", "reconciliation_required"],
  result_recorded: ["verified", "failed", "reconciliation_required"],
  verified: [],
  failed: [], // a retry is a NEW attempt on the same identity, decided by budget
  reconciliation_required: ["result_recorded", "failed", "verified"], // only human/verifier evidence exits it
};

export type IntentTransition =
  | { ok: true; intent: ExecutionIntent }
  | { ok: false; reason: string };

export function advanceIntent(
  intent: ExecutionIntent,
  next: ExecutionIntentState,
  at: number,
  event: { eventId: string; note?: string; resultEvidenceId?: string; verificationEvidenceId?: string } | null,
): IntentTransition {
  if (!LEGAL_INTENT_TRANSITIONS[intent.state].includes(next))
    return { ok: false, reason: `illegal intent transition: ${intent.state} -> ${next}` };
  // An external event may never be applied twice — the cursor pins that.
  if (event && intent.lastEventId === event.eventId)
    return { ok: false, reason: `event ${event.eventId} already applied to intent ${intent.intentId}` };
  if ((next === "verified" || next === "result_recorded") && !event)
    return { ok: false, reason: `${next} requires the external event that carries it` };
  return {
    ok: true,
    intent: {
      ...intent,
      state: next,
      attempts: next === "handed_off" ? intent.attempts + 1 : intent.attempts,
      lastEventId: event ? event.eventId : intent.lastEventId,
      ...(event?.resultEvidenceId ? { resultEvidenceId: event.resultEvidenceId } : {}),
      ...(event?.verificationEvidenceId ? { verificationEvidenceId: event.verificationEvidenceId } : {}),
      boundaryNote: event?.note ?? intent.boundaryNote,
      updatedAt: at,
    },
  };
}

// ── buyer rail boundary: one narrow port, one MOCK implementation ─────────────

// The application implements this port by calling the REAL M3 buyer rail.
// Nothing in this file can sign, submit, or move money.
export type BuyerRailPort = {
  describe(): string;
  submitForPurchase(intent: ExecutionIntent): Promise<
    | { accepted: true; railRef: string }
    | { accepted: false; reason: string }
  >;
};

// MOCK/FIXTURE ONLY. Clearly not M3: it never sees a wallet, a network, or a
// price it could pay. It exists so the wake plumbing around the boundary can
// be tested end-to-end. Every artifact it produces carries "mock" in it.
export function mockBuyerRailFixture(fixtures: Record<string, { railRef: string }>): BuyerRailPort {
  return {
    describe: () => "MOCK/FIXTURE buyer rail — exercises the boundary only; performs NO payment; NOT M3",
    async submitForPurchase(intent) {
      const hit = fixtures[intent.target.offeringId ?? ""];
      return hit
        ? { accepted: true, railRef: `mock:${hit.railRef}` }
        : { accepted: false, reason: "mock fixture has no entry for this offering — the real M3 rail is the only production path" };
    },
  };
}

// Hand-off attempt. The caller has ALREADY persisted the intent; this decides
// whether the rail is contacted and advances the state through LEGAL moves.
export async function attemptHandoff(
  intent: ExecutionIntent,
  rail: BuyerRailPort,
  mode: ExternalAuthorityMode,
  at: number,
): Promise<{ intent: ExecutionIntent; handedOff: boolean; detail: string }> {
  // Defence in depth (R3 A4): even if a row reached `authorized` some other
  // way, the hand-off itself re-reads the approval bound on the intent. No
  // founder approval record ⇒ no payment attempt, ever.
  if (
    !mayHandOffExternally(intent.strategy, mode, {
      spendApprovalId: intent.terms.approvalId,
      priceUsd: intent.terms.priceUsd,
    })
  ) {
    // No hand-off permission: the intent rests (or stays) in awaiting_m3.
    if (intent.state === "awaiting_m3")
      return { intent, handedOff: false, detail: intent.boundaryNote };
    const resting = advanceIntent(intent, "awaiting_m3", at, null);
    return resting.ok
      ? { intent: resting.intent, handedOff: false, detail: resting.intent.boundaryNote }
      : { intent, handedOff: false, detail: resting.reason };
  }
  if (intent.state === "handed_off" || intent.state === "result_recorded" || intent.state === "verified")
    return { intent, handedOff: true, detail: "already past hand-off; a replayed wake never resubmits" };
  if (intent.state !== "authorized" && intent.state !== "awaiting_m3")
    return { intent, handedOff: false, detail: `state ${intent.state} is not hand-offable` };
  const ack = await rail.submitForPurchase(intent);
  if (!ack.accepted)
    return { intent, handedOff: false, detail: ack.reason };
  const moved = advanceIntent(intent, "handed_off", at, { eventId: `evt_handoff_${ack.railRef}`, note: `handed to ${rail.describe()}; railRef ${ack.railRef}` });
  return moved.ok
    ? { intent: moved.intent, handedOff: true, detail: `handed off as ${ack.railRef}` }
    : { intent, handedOff: false, detail: moved.reason };
}

// ── external events → wake payload (Convex side is appendWakeEvent + graph) ──

export type ExternalRailEvent =
  | { kind: "provider_result"; intentId: string; eventId: string; resultEvidenceId: string; at: number }
  | { kind: "verification_result"; intentId: string; eventId: string; verified: boolean; verificationEvidenceId: string; at: number }
  | { kind: "rail_failure"; intentId: string; eventId: string; reason: string; at: number };

export type IntentWakePlan =
  | { ok: true; intentId: string; wakeReason: WakeReason; dedupeKey: string }
  | { ok: false; reason: string };

// Pure routing: given an event, which wake reason re-enters the graph, under
// which dedupe key. dedupeKey is event-identity based, so a provider that
// delivers the same webhook twice wakes Somebody exactly once.
export function planWakeForRailEvent(event: ExternalRailEvent): IntentWakePlan {
  switch (event.kind) {
    case "provider_result":
      return { ok: true, intentId: event.intentId, wakeReason: "provider_result", dedupeKey: `intent:${event.intentId}:provider_result:${event.eventId}` };
    case "verification_result":
      return { ok: true, intentId: event.intentId, wakeReason: "verification_result", dedupeKey: `intent:${event.intentId}:verification_result:${event.eventId}` };
    case "rail_failure":
      return { ok: true, intentId: event.intentId, wakeReason: "recovery_event", dedupeKey: `intent:${event.intentId}:rail_failure:${event.eventId}` };
  }
}

// Apply a rail event to an intent through the small state machine. The result
// is what the Convex-side handler persists (putIntent by intentId) BEFORE the
// matching wake fires.
export function applyRailEvent(
  intent: ExecutionIntent,
  event: ExternalRailEvent,
): IntentTransition {
  const eventId = event.eventId;
  switch (event.kind) {
    case "provider_result":
      return advanceIntent(intent, "result_recorded", event.at, {
        eventId,
        resultEvidenceId: event.resultEvidenceId,
        note: "provider result recorded; NOT yet verified — verification is a separate application event",
      });
    case "verification_result":
      return event.verified
        ? advanceIntent(intent, "verified", event.at, {
            eventId,
            verificationEvidenceId: event.verificationEvidenceId,
            note: "independently verified by the application verifier",
          })
        : advanceIntent(intent, "failed", event.at, {
            eventId,
            note: "verification rejected the provider result",
          });
    case "rail_failure":
      return advanceIntent(intent, "failed", event.at, { eventId, note: `rail failure: ${event.reason}` });
  }
}
