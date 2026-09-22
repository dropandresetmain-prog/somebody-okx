// Shared fingerprint oracle for reliability tests.
//
// The decision-input fingerprint is a pure function of a requirement's scoped
// management facts. Production derives it through `decisionFingerprintFacts`
// (convex/management.ts runDecisionPass); tests derive the EXPECTED value
// through this same collector. If the two ever disagree, the disagreement is a
// real defect, not a stale hardcoded hash — that is the point of the oracle.
//
// `overrides` exist for as-if reasoning: to persist "the fingerprint the last
// real decision saw", a test can compute the current state with the facts that
// have arrived since removed (e.g. an acquisition that landed later).
import {
  decisionFingerprintFacts,
  decisionWorkerAvailability,
} from "../../lib/objective/inputDiagnosis";
import type { ResourceNeed } from "../../lib/objective/resourceNeed";
import type { ExternalAcquisitionResult, ObjectiveRecord } from "../../lib/objective/types";
import type {
  Assignment,
  ExecutionIntent,
  ObjectiveBudget,
  Requirement,
} from "../../lib/management/types";

export type FingerprintWorld = {
  requirement: Requirement;
  currentContractRevision: number;
  allRequirements: readonly Requirement[];
  resourceNeeds: readonly ResourceNeed[];
  acquisitions: readonly ExternalAcquisitionResult[];
  intents: readonly ExecutionIntent[];
  assignments: readonly Assignment[];
  spendAuthorityUsd: number | null;
  budget: ObjectiveBudget | null;
  workers: readonly { lifecycle: string; reservedBy: { objectiveKey: string } | null }[];
  objectiveKey: string;
};

export function expectedFingerprintFromWorld(
  world: FingerprintWorld,
  overrides: Partial<FingerprintWorld> = {},
): string {
  const w = { ...world, ...overrides };
  return decisionFingerprintFacts({
    requirement: w.requirement,
    currentContractRevision: w.currentContractRevision,
    allRequirements: w.allRequirements,
    resourceNeeds: w.resourceNeeds,
    acquisitions: w.acquisitions,
    intents: w.intents,
    assignments: w.assignments,
    spendAuthorityUsd: w.spendAuthorityUsd,
    budget: w.budget,
    workerAvailability: decisionWorkerAvailability({
      strategy: w.requirement.strategy,
      objectiveKey: w.objectiveKey,
      workers: w.workers,
    }),
  });
}

/** Rows an objective data column may carry, as typed by the seed helpers. */
export type ObjectiveDataForFingerprint = ObjectiveRecord & {
  management: Record<string, unknown>;
};
