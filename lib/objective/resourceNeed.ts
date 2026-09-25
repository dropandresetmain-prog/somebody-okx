import { sha256Hex } from "../management/sha256";
import type { ExecutionIntent } from "../management/types";
import type { ResourceClass } from "../workforce/types";
import { isGovernedPurposeKind, purposeKindAppliesToClass } from "../workforce/catalog";
import type {
  SourcingDecision,
  SourcingReasonCode,
  ApprovedProviderPath,
  SourcingAuthorizingResult,
} from "../sourcing/types";

// ─── §1 ResourceNeed ──────────────────────────────────────────────────────────

export type ResourceNeedStatus =
  | "proposed"
  | "active"
  | "sourcing"
  | "buy_pending"
  | "fulfilled"
  | "rejected";

export type ResourceNeed = {
  id: string;
  objectiveKey: string;
  workItemId: string | null;
  /** M4: scoped to the Requirement the worker was serving; null for legacy M2. */
  requirementKey: string | null;
  resourceClass: ResourceClass;
  purpose: string;
  reasonOwnedInsufficient: string;
  status: ResourceNeedStatus;
  proposedByRunId: string | null;
  createdAt: number;
  updatedAt: number;
  dedupeKey: string;
  /** Contract revision when the application validated this gap (optional for legacy). */
  contractRevision?: number | null;
  /** Obligation identity the gap was validated against. */
  inputCheckId?: string | null;
  /** Application observation ids that support the gap claim. */
  supportingEvidenceIds?: string[];
  /** Set to "application" only after validateMissingInputProposal accepts. */
  validationAuthority?: "application" | "unconfirmed" | null;
  /**
   * V7 review R4 — APPLICATION-VALIDATED structured requested scope. Set only
   * by validateMissingInputProposal after the proposed kind passed governed-
   * vocabulary membership and class applicability. Null/absent = no validated
   * scope: purpose-scoped offerings are then NOT compatible (fail closed).
   * The free-text `purpose` stays descriptive context and never substitutes.
   */
  requestedScope?: ResourceNeedRequestedScope | null;
};

export type ResourceNeedRequestedScope = {
  purposeKind: string;
  authority: "application";
};

/**
 * The requested scope kind a stored need may contribute to grounding and
 * intent binding, or null. Re-checks the stored row (persisted data is not
 * trusted by type assertion): application-validated need, application-owned
 * scope, governed kind, applicable to the need's class.
 */
export function validatedRequestedPurposeKind(need: {
  resourceClass?: unknown;
  validationAuthority?: unknown;
  requestedScope?: unknown;
}): string | null {
  if (need.validationAuthority !== "application") return null;
  const scope = need.requestedScope as { purposeKind?: unknown; authority?: unknown } | null | undefined;
  if (!scope || scope.authority !== "application") return null;
  const kind = scope.purposeKind;
  if (!isGovernedPurposeKind(kind)) return null;
  if (typeof need.resourceClass !== "string" || !purposeKindAppliesToClass(kind, need.resourceClass)) return null;
  return kind;
}

/**
 * Purpose kind to bind onto an ExecutionIntent at BUY dispatch. Mirrors
 * deriveExternalSourcingContext: a need's validated scope wins; a validated
 * need with no scope may borrow the Objective policy when it applies to the
 * class; manager-initiated BUY (no need) may bind policy scope when it
 * applies to the authorized offering's resource class.
 */
export function resolvePurposeKindForIntentBinding(input: {
  need: ResourceNeed | null;
  objectivePolicyPurposeKind: string | null;
  resourceClass: string | null;
}): string | null {
  const resourceClass = input.need?.resourceClass ?? input.resourceClass;
  if (typeof resourceClass !== "string" || !resourceClass) return null;

  if (input.need) {
    const fromScope = validatedRequestedPurposeKind(input.need);
    if (fromScope) return fromScope;
    const scopeRejected =
      input.need.requestedScope != null && validatedRequestedPurposeKind(input.need) === null;
    if (scopeRejected) return null;
  }

  const policyKind = input.objectivePolicyPurposeKind;
  if (
    policyKind &&
    isGovernedPurposeKind(policyKind) &&
    purposeKindAppliesToClass(policyKind, resourceClass)
  ) {
    return policyKind;
  }
  return null;
}

/** Attach bounded purpose + requestedPurposeKind to a dispatched BUY intent. */
export function bindExecutionIntentPurposeScope(input: {
  intent: ExecutionIntent;
  matchingNeed: ResourceNeed | null;
  objectivePolicyPurposeKind: string | null;
  fallbackPurposeText: string | null;
}): ExecutionIntent {
  const requestedPurposeKind = resolvePurposeKindForIntentBinding({
    need: input.matchingNeed,
    objectivePolicyPurposeKind: input.objectivePolicyPurposeKind,
    resourceClass: input.intent.target.resourceClass,
  });
  const purposeFromNeed = input.matchingNeed?.purpose?.trim().slice(0, 500) ?? "";
  const fallbackPurpose = (input.fallbackPurposeText ?? "").trim().slice(0, 500);
  const purpose = purposeFromNeed || fallbackPurpose;

  if (input.matchingNeed) {
    return {
      ...input.intent,
      needDedupeKey: input.matchingNeed.dedupeKey,
      resourceNeedId: input.matchingNeed.id,
      ...(purpose ? { purpose } : {}),
      ...(requestedPurposeKind ? { requestedPurposeKind } : {}),
    };
  }

  if (!requestedPurposeKind && !purpose) return input.intent;
  return {
    ...input.intent,
    ...(purpose ? { purpose } : {}),
    ...(requestedPurposeKind ? { requestedPurposeKind } : {}),
  };
}

// ─── Dedupe key ───────────────────────────────────────────────────────────────

function normalize(s: string): string {
  return s.toLowerCase().trim().replace(/\s+/g, " ");
}

export function computeNeedDedupeKey(input: {
  objectiveKey: string;
  resourceClass: string;
  purpose: string;
  requirementKey?: string | null;
  /** Validated requested scope kind; a different scope is a different need. */
  purposeKind?: string | null;
}): string {
  const payload =
    normalize(input.objectiveKey) +
    "\u0000" +
    normalize(input.resourceClass) +
    "\u0000" +
    normalize(input.purpose) +
    "\u0000" +
    normalize(input.requirementKey ?? "") +
    // Appended only when present so legacy (scope-less) keys are unchanged.
    (input.purposeKind ? "\u0000scope:" + normalize(input.purposeKind) : "");
  return sha256Hex(payload);
}

// ─── Factory ──────────────────────────────────────────────────────────────────

export type CreateResourceNeedInput = {
  id: string;
  objectiveKey: string;
  workItemId?: string | null;
  requirementKey?: string | null;
  resourceClass: ResourceClass;
  purpose: string;
  reasonOwnedInsufficient: string;
  proposedByRunId?: string | null;
  at: number;
  status?: ResourceNeedStatus;
  contractRevision?: number | null;
  inputCheckId?: string | null;
  supportingEvidenceIds?: readonly string[];
  validationAuthority?: "application" | "unconfirmed" | null;
  requestedScope?: ResourceNeedRequestedScope | null;
};

export function createResourceNeed(input: CreateResourceNeedInput): ResourceNeed {
  const dedupeKey = computeNeedDedupeKey({
    objectiveKey: input.objectiveKey,
    resourceClass: input.resourceClass,
    purpose: input.purpose,
    requirementKey: input.requirementKey ?? null,
    purposeKind: input.requestedScope?.purposeKind ?? null,
  });
  return {
    id: input.id,
    objectiveKey: input.objectiveKey,
    workItemId: input.workItemId ?? null,
    requirementKey: input.requirementKey ?? null,
    resourceClass: input.resourceClass,
    purpose: input.purpose,
    reasonOwnedInsufficient: input.reasonOwnedInsufficient,
    status: input.status ?? "proposed",
    proposedByRunId: input.proposedByRunId ?? null,
    createdAt: input.at,
    updatedAt: input.at,
    dedupeKey,
    contractRevision: input.contractRevision ?? null,
    inputCheckId: input.inputCheckId ?? null,
    supportingEvidenceIds: input.supportingEvidenceIds
      ? [...input.supportingEvidenceIds]
      : [],
    validationAuthority: input.validationAuthority ?? null,
    ...(input.requestedScope
      ? {
          requestedScope: {
            purposeKind: input.requestedScope.purposeKind,
            authority: "application" as const,
          },
        }
      : {}),
  };
}

// ─── Dedupe helper ────────────────────────────────────────────────────────────

export function dedupeResourceNeeds(
  existing: readonly ResourceNeed[],
  proposed: ResourceNeed,
): { need: ResourceNeed; created: boolean } {
  for (const e of existing) {
    if (e.dedupeKey === proposed.dedupeKey) {
      // Fulfilled needs still match: do not mint a second need for the same
      // obligation identity. Callers must refuse reacquisition separately.
      if (e.status !== "rejected") {
        return { need: e, created: false };
      }
    }
  }
  return { need: proposed, created: true };
}

// ─── Status transition ────────────────────────────────────────────────────────

const LEGAL_TRANSITIONS: Record<ResourceNeedStatus, readonly ResourceNeedStatus[]> = {
  proposed: ["active", "rejected"],
  // A verified acquisition may fulfill a validated gap without the buy_pending
  // hop (HYBRID/BUY already authorized the external half separately).
  active: ["sourcing", "fulfilled", "rejected"],
  sourcing: ["buy_pending", "fulfilled", "rejected"],
  buy_pending: ["fulfilled"],
  fulfilled: [],
  rejected: [],
};

export function transitionNeedStatus(
  need: ResourceNeed,
  next: ResourceNeedStatus,
  at: number,
): ResourceNeed {
  const allowed = LEGAL_TRANSITIONS[need.status];
  if (!allowed.includes(next)) {
    throw new Error(
      `illegal status transition: ${need.status} -> ${next}`,
    );
  }
  return { ...need, status: next, updatedAt: at };
}

// ─── §2 SourcingDecisionRecord ────────────────────────────────────────────────

export type SourcingDecisionRecord = {
  id: string;
  resourceNeedId: string;
  objectiveKey: string;
  decision: SourcingDecision;
  reasonCode: SourcingReasonCode;
  satisfied: ResourceClass[];
  missing: ResourceClass[];
  approvedProviderPaths: ApprovedProviderPath[];
  selectedOfferingId: string | null;
  rejectedOfferingIds: string[];
  decidedAt: number;
};

function sortDedupe<T extends string>(arr: readonly T[]): T[] {
  return [...new Set(arr)].sort() as T[];
}

function sortDedupeProviderPaths(arr: readonly ApprovedProviderPath[]): ApprovedProviderPath[] {
  const seen = new Set<string>();
  const out: ApprovedProviderPath[] = [];
  for (const p of arr) {
    const key = `${p.forResourceClass}\u0000${p.pathId}`;
    if (!seen.has(key)) {
      seen.add(key);
      out.push(p);
    }
  }
  return out.sort((a, b) => {
    if (a.forResourceClass !== b.forResourceClass) {
      return a.forResourceClass < b.forResourceClass ? -1 : 1;
    }
    return a.pathId < b.pathId ? -1 : a.pathId > b.pathId ? 1 : 0;
  });
}

export function buildDecisionRecord(input: {
  id: string;
  need: ResourceNeed;
  result: SourcingAuthorizingResult;
  selectedOfferingId: string | null;
  rejectedOfferingIds: readonly string[];
  decidedAt: number;
}): SourcingDecisionRecord {
  return {
    id: input.id,
    resourceNeedId: input.need.id,
    objectiveKey: input.need.objectiveKey,
    decision: input.result.decision,
    reasonCode: input.result.reasonCode,
    satisfied: sortDedupe([...input.result.satisfiedResourceClasses]),
    missing: sortDedupe([...input.result.missingResourceClasses]),
    approvedProviderPaths: sortDedupeProviderPaths(input.result.approvedProviderPaths),
    selectedOfferingId: input.selectedOfferingId,
    rejectedOfferingIds: sortDedupe([...input.rejectedOfferingIds]),
    decidedAt: input.decidedAt,
  };
}
