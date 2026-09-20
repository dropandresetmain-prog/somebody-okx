import { createHash } from "node:crypto";
import type { ResourceClass } from "../workforce/types";
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
};

// ─── Dedupe key ───────────────────────────────────────────────────────────────

function normalize(s: string): string {
  return s.toLowerCase().trim().replace(/\s+/g, " ");
}

export function computeNeedDedupeKey(input: {
  objectiveKey: string;
  resourceClass: string;
  purpose: string;
  requirementKey?: string | null;
}): string {
  const payload =
    normalize(input.objectiveKey) +
    "\u0000" +
    normalize(input.resourceClass) +
    "\u0000" +
    normalize(input.purpose) +
    "\u0000" +
    normalize(input.requirementKey ?? "");
  return createHash("sha256").update(payload).digest("hex");
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
};

export function createResourceNeed(input: CreateResourceNeedInput): ResourceNeed {
  const dedupeKey = computeNeedDedupeKey({
    objectiveKey: input.objectiveKey,
    resourceClass: input.resourceClass,
    purpose: input.purpose,
    requirementKey: input.requirementKey ?? null,
  });
  return {
    id: input.id,
    objectiveKey: input.objectiveKey,
    workItemId: input.workItemId ?? null,
    requirementKey: input.requirementKey ?? null,
    resourceClass: input.resourceClass,
    purpose: input.purpose,
    reasonOwnedInsufficient: input.reasonOwnedInsufficient,
    status: "proposed",
    proposedByRunId: input.proposedByRunId ?? null,
    createdAt: input.at,
    updatedAt: input.at,
    dedupeKey,
  };
}

// ─── Dedupe helper ────────────────────────────────────────────────────────────

export function dedupeResourceNeeds(
  existing: readonly ResourceNeed[],
  proposed: ResourceNeed,
): { need: ResourceNeed; created: boolean } {
  for (const e of existing) {
    if (e.dedupeKey === proposed.dedupeKey) {
      if (e.status !== "rejected" && e.status !== "fulfilled") {
        return { need: e, created: false };
      }
    }
  }
  return { need: proposed, created: true };
}

// ─── Status transition ────────────────────────────────────────────────────────

const LEGAL_TRANSITIONS: Record<ResourceNeedStatus, readonly ResourceNeedStatus[]> = {
  proposed: ["active", "rejected"],
  active: ["sourcing", "rejected"],
  sourcing: ["buy_pending", "rejected"],
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
