// Independent Objective completion gate.
//
// Somebody may only PROPOSE completion. This module decides, against:
//   - the CURRENT Outcome Contract revision;
//   - the minimum completion bar;
//   - every required Requirement;
//   - the required verification proof for each;
//   - unresolved mandatory effects/resources.
//
// It is deliberately separate from requirement resolution (requirements.ts),
// assignment verification, and the worker runtime. "The run stopped", "the
// worker said done" and "the artifact looks good" are not inputs here.
//
// Supporting requirements may remain incomplete, but the verdict MUST disclose
// them — a completed Objective that silently dropped supporting work is a
// truthfulness failure, so the disclosure is part of the accepted shape.

import { openRequired } from "./requirements";
import type {
  CompletionProposal,
  CompletionVerdict,
  ManagementState,
  OutcomeContract,
  Requirement,
} from "./types";

export type CompletionGateInput = {
  proposal: CompletionProposal;
  contract: OutcomeContract;
  currentContractRevision: number;
  requirements: readonly Requirement[];
  // Proof facts the application verified for the CURRENT revision.
  satisfiedProofKeys: ReadonlyMap<string, string[]>; // requirementKey → proofKeys satisfied
  unresolvedEffectIds: readonly string[]; // required external effects not verified
  unresolvedResourceIds: readonly string[]; // required acquisitions unresolved
  at: number;
};

export function evaluateCompletionGate(
  input: CompletionGateInput,
): CompletionVerdict {
  const { proposal, contract, currentContractRevision, requirements } = input;
  const unmet: string[] = [];

  // 1. The proposal must target the contract revision that is actually current.
  if (proposal.contractId !== contract.contractId)
    return reject(["proposal references a different Outcome Contract"], "blocked", input);
  if (proposal.contractRevision !== currentContractRevision)
    return reject(
      [
        `proposal is against contract revision ${proposal.contractRevision}; current revision is ${currentContractRevision}`,
      ],
      "blocked",
      input,
    );

  // 2. The claimed level must exist and be at or above the minimum bar.
  const claimed = contract.levels.find((level) => level.levelKey === proposal.claimedLevelKey);
  const bar = contract.levels.find((level) => level.levelKey === contract.minimumCompletionBar);
  if (!bar)
    return reject(["Outcome Contract declares no resolvable minimum completion bar"], "recovery_required", input);
  if (!claimed)
    return reject([`claimed outcome level ${proposal.claimedLevelKey} is not in the current contract`], "blocked", input);
  if (claimed.order < bar.order)
    return reject(
      [
        `claimed level "${claimed.label}" (L${claimed.order}) is below the minimum completion bar "${bar.label}" (L${bar.order})`,
      ],
      "executing",
      input,
    );

  // 3. Every required Requirement must be satisfied or validly waived.
  const open = openRequired(requirements);
  for (const requirement of open)
    unmet.push(
      `required requirement ${requirement.requirementKey} is ${requirement.state}${requirement.blockedReason ? ` (${requirement.blockedReason})` : ""}`,
    );

  // 4. Required proof must be present and current, not merely "looks good".
  for (const requirement of requirements) {
    if (requirement.priority !== "required") continue;
    if (requirement.state === "waived" || requirement.state === "superseded") continue;
    const satisfiedProofs = new Set(satisfiedProofKeysFor(input, requirement.requirementKey));
    for (const proof of requirement.proofs) {
      if (!satisfiedProofs.has(proof.proofKey))
        unmet.push(
          `requirement ${requirement.requirementKey} proof ${proof.proofKey} (${proof.proofKind}) is missing or stale`,
        );
    }
    // A satisfied requirement must carry a resolution bound to the CURRENT revision.
    if (
      requirement.state === "satisfied" &&
      requirement.resolution &&
      requirement.resolution.contractRevision !== currentContractRevision
    )
      unmet.push(
        `requirement ${requirement.requirementKey} was satisfied against revision ${requirement.resolution.contractRevision}, not the current ${currentContractRevision}`,
      );
  }

  // 5. Unresolved mandatory effects/resources block completion.
  for (const effectId of input.unresolvedEffectIds)
    unmet.push(`required external effect ${effectId} is not independently verified`);
  for (const resourceId of input.unresolvedResourceIds)
    unmet.push(`required resource acquisition ${resourceId} is unresolved`);

  if (unmet.length) {
    const anyBlocked = blockedAny(requirements);
    return reject(unmet, anyBlocked ? "blocked" : "executing", input);
  }

  // 6. Accept, with truthful disclosure of what is NOT done.
  const pendingSupporting = requirements
    .filter((requirement) => requirement.priority === "supporting")
    .filter(
      (requirement) =>
        requirement.state !== "satisfied" &&
        requirement.state !== "waived" &&
        requirement.state !== "superseded",
    )
    .map((requirement) => `${requirement.requirementKey}: ${requirement.title}`);

  const levelsAboveBar = contract.levels
    .filter((level) => level.order > bar.order)
    .map((level) => `${level.levelKey} (${level.label})`);

  return {
    accepted: true,
    objectiveState: "completed",
    satisfiedRequired: requirements
      .filter((requirement) => requirement.priority === "required")
      .map((requirement) => requirement.requirementKey),
    disclosedPendingSupporting: pendingSupporting,
    levelsAboveBarPending: levelsAboveBar,
  };
}

function satisfiedProofKeysFor(
  input: CompletionGateInput,
  requirementKey: string,
): string[] {
  return input.satisfiedProofKeys.get(requirementKey) ?? [];
}

function blockedAny(requirements: readonly Requirement[]): boolean {
  return requirements.some(
    (requirement) => requirement.priority === "required" && requirement.state === "blocked",
  );
}

function reject(
  unmet: string[],
  state: ManagementState,
  input: CompletionGateInput,
): CompletionVerdict {
  void input;
  return { accepted: false, objectiveState: state, unmet };
}

// Convenience used by the ledger/UI truthfulness checks: the pending-supporting
// list the accept branch discloses.
export function disclosedPendingSupportingOf(
  verdict: CompletionVerdict,
): string[] {
  return verdict.accepted ? verdict.disclosedPendingSupporting : [];
}
