// Independent Objective completion gate.
//
// Somebody may only PROPOSE completion. This module decides, against:
//   - the CURRENT Outcome Contract revision;
//   - the minimum completion bar;
//   - every required Requirement;
//   - the required verification proof for each, RECOMPUTED from fresh
//     application facts (R3 A5 — see below);
//   - unresolved mandatory effects/resources.
//
// It is deliberately separate from requirement resolution (requirements.ts),
// assignment verification, and the worker runtime. "The run stopped", "the
// worker said done" and "the artifact looks good" are not inputs here.
//
// R3 A5 — the gate NEVER trusts a persisted satisfaction claim. A row that
// reads `state: "satisfied"` (with or without a resolution) proves nothing:
// whatever wrote it could have forged it. The gate instead re-derives every
// required proof obligation against fresh, requirement-scoped facts supplied
// by the caller (`factsByRequirementKey`). The persisted claim only has to be
// CONSISTENT with the recomputation; it can never substitute for it.
//
// Supporting requirements may remain incomplete, but the verdict MUST disclose
// them — a completed Objective that silently dropped supporting work is a
// truthfulness failure, so the disclosure is part of the accepted shape.

import { missingProofs, NO_PROOF_FACTS, openRequired } from "./requirements";
import type { ProofFacts } from "./requirements";
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
  // FRESH application facts the caller loaded and scoped to the current
  // revision, per requirement (R3 A5). A requirement with no entry is judged
  // against NO facts at all — missing scoping fails closed, never open.
  factsByRequirementKey: ReadonlyMap<string, ProofFacts>;
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

  // 3. Every required Requirement must be satisfied or validly waived — and
  //    "satisfied" is only ever ACCEPTED by this gate, never asserted by a
  //    persisted row (rule 4 below does the accepting). A stale or missing
  //    resolution cannot carry a required row across the bar.
  const open = openRequired(requirements);
  for (const requirement of open)
    unmet.push(
      `required requirement ${requirement.requirementKey} is ${requirement.state}${requirement.blockedReason ? ` (${requirement.blockedReason})` : ""}`,
    );

  // 4. R3 A5 — proof is RECOMPUTED, not believed. For every required row
  //    (open or satisfied), each declared proof obligation is re-checked
  //    against fresh facts the caller scoped to THIS revision. The persisted
  //    resolution is never consulted for what the proofs are — it is a claim
  //    about the past, and this gate decides in the present. A row that
  //    claims `satisfied` while its proofs do not recompute is a
  //    false-completion attempt and is refused out loud.
  for (const requirement of requirements) {
    if (requirement.priority !== "required") continue;
    if (requirement.state === "waived" || requirement.state === "superseded") {
      // A waiver is a persisted CLAIM too: it must name the founder reason it
      // was authorized under, or it is a self-granted exemption.
      if (requirement.state === "waived" && !requirement.waiver?.reason?.trim())
        unmet.push(
          `requirement ${requirement.requirementKey} claims waived with no authorized waiver record`,
        );
      continue;
    }
    const facts = input.factsByRequirementKey.get(requirement.requirementKey) ?? NO_PROOF_FACTS;
    if (requirement.proofs.length === 0) {
      // A row that declares NO governed proof cannot be satisfied by anything,
      // and a row claiming `satisfied` with nothing to check is exactly what a
      // forged write looks like. Recomputation on an empty obligation list
      // would trivially "pass", so the emptiness itself is the unmet fact.
      unmet.push(
        `requirement ${requirement.requirementKey} declares no governed proof — nothing can satisfy it, and a "satisfied" claim on it is refused`,
      );
      continue;
    }
    const missing = missingProofs(requirement.proofs, facts, {
      contractRevision: currentContractRevision,
      proofRefs: requirement.resolution?.proofRefs ?? [],
    });
    for (const gap of missing)
      unmet.push(
        `requirement ${requirement.requirementKey} proof ${gap} against the CURRENT revision (recomputed, not read from the persisted resolution)`,
      );
    // A row that claims satisfaction must name the accepted resolution the
    // recomputation rides on. Proof recomputing cleanly with no resolution
    // record means someone wrote `satisfied` around the kernel.
    if (requirement.state === "satisfied" && !requirement.resolution)
      unmet.push(
        `requirement ${requirement.requirementKey} claims satisfied with no resolution record to check against`,
      );
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
