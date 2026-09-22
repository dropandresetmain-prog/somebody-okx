// Shared product policy: when is a founder spend approval legally actionable?
//
// BOTH the product read projection and submitAttentionActionV1 must use this
// helper (or a demonstrably equivalent call). Do not re-implement "show Approve"
// and "accept Approve" in separate code paths — that is high-risk drift.
//
// This is NOT payment. A legal candidate means: persist a bounded
// FounderSpendGrant and wake the manager. M3 remains the payment authority.

import type { AttentionActionView } from "../../app/product/contracts";
import type { ProductDecision, StatusSource } from "./frontendProjection";

/** Stable product action id for this milestone. Only spend approval is wired. */
export const APPROVE_SPEND_ACTION_ID = "approve_spend";

export type SpendApprovalCandidate = {
  objectiveId: string;
  decisionId: string;
  attentionId: string;
  attentionRevision: string;
  requirementKey: string;
  contractRevision: number;
  authorizationReason: "spend_authority_required";
  question: string;
  selectedOptionId: string;
  /** Authoritative bound from the selected grounded option's persisted price. */
  priceUsd: number;
  pendingApprovalAt: number;
  pendingApprovalQuestion: string;
  action: AttentionActionView;
};

type DecodedGroundedOption = {
  optionId: string;
  strategy: string | null;
  priceUsd: number | null;
};

function latestBy<T>(items: T[], at: (item: T) => number, id: (item: T) => string): T | null {
  let best: T | null = null;
  for (const item of items) {
    if (best === null || at(item) > at(best) || (at(item) === at(best) && id(item) > id(best))) {
      best = item;
    }
  }
  return best;
}

function currentStrategyDecisions(source: StatusSource, revision: number): ProductDecision[] {
  return source.decisions.filter(
    (row) =>
      row.contractRevision === revision &&
      (row.kind === "satisfaction_strategy" || row.kind === "escalation"),
  );
}

function latestDecisionByRequirement(decisions: ProductDecision[]): Map<string, ProductDecision> {
  const map = new Map<string, ProductDecision>();
  for (const decision of decisions) {
    const existing = map.get(decision.requirementKey);
    if (
      !existing ||
      decision.at > existing.at ||
      (decision.at === existing.at && decision.decisionId > existing.decisionId)
    ) {
      map.set(decision.requirementKey, decision);
    }
  }
  return map;
}

/** Display-safe USD decimal string (no silent upward rounding). */
export function formatSpendUsd(priceUsd: number): string {
  return priceUsd.toFixed(2);
}

export function spendApprovalActionLabel(priceUsd: number): string {
  return `Approve $${formatSpendUsd(priceUsd)} limit`;
}

/**
 * Deterministic founder approval / grant identity for a specific attention
 * source revision. Stable across accidental replay of the same action.
 */
export function spendGrantApprovalId(decisionId: string, decisionAt: number): string {
  return `product-spend:${decisionId}:${decisionAt}`;
}

function decodeSelectedOption(
  coarsePlanSummary: string,
  selectedOptionId: string,
): DecodedGroundedOption | null {
  try {
    const parsed = JSON.parse(coarsePlanSummary) as {
      extra?: { options?: Array<Record<string, unknown>> };
    };
    const options = parsed.extra?.options ?? [];
    const raw = options.find((row) => String(row.optionId ?? "") === selectedOptionId);
    if (!raw) return null;
    const external = raw.external as { priceUsd?: unknown } | null | undefined;
    const priceUsd =
      external && typeof external.priceUsd === "number" && Number.isFinite(external.priceUsd)
        ? external.priceUsd
        : null;
    return {
      optionId: selectedOptionId,
      strategy: typeof raw.strategy === "string" ? raw.strategy : null,
      priceUsd,
    };
  } catch {
    return null;
  }
}

function findMatchingPendingApproval(
  source: StatusSource,
  question: string,
  decisionAt: number,
): { at: number; question: string } | null {
  const pending = source.objective.controlNotes.filter((row) => row.type === "pending_approval");
  if (pending.length === 0) return null;

  const exact = pending.find(
    (note) => String(note.question ?? "") === question && Number(note.at ?? 0) === decisionAt,
  );
  if (exact) {
    return { at: Number(exact.at ?? decisionAt), question: String(exact.question ?? "") };
  }

  // Historical notes may not share the exact decision timestamp; when exactly
  // one note carries the same question, treat it as the matching pending row.
  const byQuestion = pending.filter((note) => String(note.question ?? "") === question);
  if (byQuestion.length === 1) {
    const note = byQuestion[0];
    return { at: Number(note.at ?? decisionAt), question: String(note.question ?? "") };
  }

  return null;
}

/**
 * Identify the currently actionable spend approval, or null.
 *
 * Fail-closed: every precondition must hold. Unsupported approval reasons
 * (material_ambiguity, waiver, external_effect) never yield a candidate.
 */
export function deriveSpendApprovalCandidate(source: StatusSource): SpendApprovalCandidate | null {
  const contract =
    [...source.contracts].sort((a, b) => b.revision - a.revision || (a.contractId < b.contractId ? -1 : 1))[0] ??
    null;
  if (!contract) return null;
  const revision = contract.revision;

  const activeKeys = new Set(
    source.requirements
      .filter((req) => req.contractRevision === revision && req.state === "active")
      .map((req) => req.requirementKey),
  );
  if (activeKeys.size === 0) return null;

  const latest = latestDecisionByRequirement(currentStrategyDecisions(source, revision));
  const spendApprovals = [...latest.values()].filter(
    (row) =>
      activeKeys.has(row.requirementKey) &&
      row.authorization.kind === "approval_required" &&
      row.authorization.reason === "spend_authority_required",
  );
  const approval = latestBy(spendApprovals, (row) => row.at, (row) => row.decisionId);
  if (!approval || approval.authorization.kind !== "approval_required") return null;
  if (approval.authorization.reason !== "spend_authority_required") return null;

  const selectedOptionId = approval.optionId;
  if (!selectedOptionId) return null;

  const option = decodeSelectedOption(approval.coarsePlanSummary, selectedOptionId);
  if (!option) return null;
  if (option.strategy !== "BUY" && option.strategy !== "HYBRID") return null;
  if (option.priceUsd === null || !(option.priceUsd > 0)) return null;

  const pending = findMatchingPendingApproval(
    source,
    approval.authorization.question,
    approval.at,
  );
  if (!pending) return null;

  const priceUsd = option.priceUsd;
  return {
    objectiveId: source.objective.key,
    decisionId: approval.decisionId,
    attentionId: approval.decisionId,
    attentionRevision: `${approval.decisionId}:${approval.at}`,
    requirementKey: approval.requirementKey,
    contractRevision: revision,
    authorizationReason: "spend_authority_required",
    question: approval.authorization.question,
    selectedOptionId,
    priceUsd,
    pendingApprovalAt: pending.at,
    pendingApprovalQuestion: pending.question,
    action: {
      id: APPROVE_SPEND_ACTION_ID,
      type: "approve",
      label: spendApprovalActionLabel(priceUsd),
    },
  };
}
