// Requirement semantics — the resolution model that replaces "ResourceNeed as
// the universal outcome model".
//
// THE CENTRAL RULE ENFORCED HERE: nothing short of an accepted, proof-bearing
// resolution may move a Requirement to "satisfied". Specifically:
//
//   provider candidate rejection  ≠ satisfied
//   MAKE decision                 ≠ satisfied
//   BUY proposal rejection        ≠ satisfied
//   worker run completion         ≠ satisfied
//   assignment verification       ≠ satisfied  (it is a prerequisite, checked here)
//
// Each of those is a distinct event kind that this module deliberately refuses
// to treat as satisfaction. Tests assert the refusals.

import type {
  ProofSpec,
  Requirement,
  RequirementResolution,
  RequirementState,
} from "./types";

// What happened in the world. The application reports observations; this module
// decides whether any of them resolves a requirement.
export type RequirementEvent =
  | { kind: "candidate_rejected"; offeringId: string }
  | { kind: "strategy_authorized"; strategy: string; decisionId: string }
  | { kind: "buy_proposal_rejected"; reason: string }
  | { kind: "assignment_run_finished"; assignmentId: string; runStopped: boolean }
  | { kind: "assignment_verified"; assignmentId: string; contractRevision: number }
  | { kind: "external_result_verified"; intentId: string; contractRevision: number }
  | { kind: "founder_confirmation"; proofRef: string; contractRevision: number }
  | { kind: "artifact_changed"; artifactKey: string; version: number; contractRevision: number };

// Events that can NEVER satisfy anything, kept as data so the refusal is
// explicit and testable rather than a missing branch.
const NEVER_SATISFIES: readonly RequirementEvent["kind"][] = [
  "candidate_rejected",
  "strategy_authorized",
  "buy_proposal_rejected",
  "assignment_run_finished",
];

export function canNeverSatisfy(event: RequirementEvent): boolean {
  return NEVER_SATISFIES.includes(event.kind);
}

export type SatisfactionAttempt =
  | { satisfied: true; requirement: Requirement; resolution: RequirementResolution }
  | { satisfied: false; requirement: Requirement; reason: string };

// Proof is checked against facts the application already verified, passed in by
// the caller. This module never fetches and never trusts a model claim.
//
// R3 A5 — identity vocabulary: an application observation has TWO public
// identities — its evidence id and its stable source identity (`sourceId`).
// A proof param may name either and both are checkable against the same
// persisted row. What may NEVER satisfy is a name matching no
// application-verified row, no matter who wrote the claim.
export type ProofFacts = {
  // artifactKey → highest version persisted by an accepted run
  artifactVersions: Record<string, number>;
  // BOTH the evidence ids and the source ids of rows the application recorded
  // as origin=application_observation (the A5 note above)
  applicationObservationIds: readonly string[];
  // intent ids whose external result/effect is independently verified
  verifiedIntentIds: readonly string[];
  // founder confirmations recorded, by proof ref
  founderConfirmationRefs: readonly string[];
};

// The facts a requirement is judged against when the caller has scoped NONE.
// Empty facts satisfy nothing (every governed proof demands a named, persisted
// fact), so a missing scope fails the gate CLOSED — R3 A5's rule that absence
// of evidence is never evidence of absence-of-obligation.
export const NO_PROOF_FACTS: ProofFacts = {
  artifactVersions: {},
  applicationObservationIds: [],
  verifiedIntentIds: [],
  founderConfirmationRefs: [],
};

export function missingProofs(
  proofs: readonly ProofSpec[],
  facts: ProofFacts,
  event: { contractRevision: number; proofRefs: readonly string[] },
): string[] {
  const missing: string[] = [];
  for (const proof of proofs) {
    switch (proof.proofKind) {
      case "company_artifact_version": {
        const key = String(proof.params.artifactKey ?? "");
        const required = Number(proof.params.minVersion ?? NaN);
        const actual = facts.artifactVersions[key] ?? 0;
        if (!key || !Number.isFinite(required) || actual < required)
          missing.push(`${proof.proofKey}: artifact ${key || "(unnamed)"} at v${actual} < required v${required}`);
        break;
      }
      case "application_observation": {
        const want = String(proof.params.sourceId ?? proof.params.evidenceId ?? "");
        if (!want || !facts.applicationObservationIds.includes(want))
          missing.push(`${proof.proofKey}: no application observation for ${want || "(unspecified source)"}`);
        break;
      }
      case "verified_external_result":
      case "verified_external_effect": {
        const intent = String(proof.params.intentId ?? "");
        if (!intent || !facts.verifiedIntentIds.includes(intent))
          missing.push(`${proof.proofKey}: external ${proof.proofKind === "verified_external_effect" ? "effect" : "result"} ${intent || "(unspecified)"} not independently verified`);
        break;
      }
      case "founder_confirmation": {
        const ref = String(proof.params.confirmationRef ?? "");
        if (!ref || !facts.founderConfirmationRefs.includes(ref))
          missing.push(`${proof.proofKey}: founder confirmation ${ref || "(unspecified)"} not recorded`);
        break;
      }
      default: {
        const exhaustive: never = proof.proofKind;
        missing.push(`${proof.proofKey}: unknown proof kind ${String(exhaustive)}`);
      }
    }
  }
  // R3 A5: a proof is satisfied ONLY by an application-verified fact, never by
  // a name someone wrote down. `event.proofRefs` is a record of what the
  // resolution cited, not an input to this decision — if a referenced id is
  // real, it is in `facts` already; if it is not, the reference proves nothing.
  void event;
  return missing;
}

// The only function allowed to set "satisfied". Returns the updated requirement
// or a typed refusal; it never throws for a merely-unhappy outcome.
export function attemptRequirementSatisfaction(input: {
  requirement: Requirement;
  event: RequirementEvent;
  facts: ProofFacts;
  resolutionId: string;
  acceptedDecisionId: string | null;
  acceptedAssignmentId: string | null;
  acceptedIntentId: string | null;
  proofRefs: readonly string[];
  currentContractRevision: number;
  at: number;
}): SatisfactionAttempt {
  const { requirement, event } = input;

  if (canNeverSatisfy(event))
    return {
      satisfied: false,
      requirement,
      reason: `${event.kind} is not requirement satisfaction (requirement ${requirement.requirementKey} stays ${requirement.state})`,
    };

  const eventRevision = "contractRevision" in event ? event.contractRevision : null;
  if (eventRevision === null)
    return { satisfied: false, requirement, reason: `${event.kind} carries no contract revision` };

  // Stale-truth guard: proof accepted against an older Outcome Contract revision
  // cannot satisfy the current one.
  if (eventRevision !== input.currentContractRevision)
    return {
      satisfied: false,
      requirement,
      reason: `stale contract revision: proof is against r${eventRevision}, current is r${input.currentContractRevision}`,
    };

  if (requirement.state === "satisfied")
    return {
      satisfied: false,
      requirement,
      reason: `requirement ${requirement.requirementKey} already satisfied (idempotent no-op)`,
    };

  if (requirement.state === "superseded" || requirement.state === "waived")
    return {
      satisfied: false,
      requirement,
      reason: `requirement ${requirement.requirementKey} is ${requirement.state}; a resolved requirement is not re-satisfied`,
    };

  const missing = missingProofs(requirement.proofs, input.facts, {
    contractRevision: eventRevision,
    proofRefs: input.proofRefs,
  });
  if (missing.length > 0)
    return {
      satisfied: false,
      requirement,
      reason: `required proof missing: ${missing.join("; ")}`,
    };

  const resolution: RequirementResolution = {
    resolutionId: input.resolutionId,
    acceptedDecisionId: input.acceptedDecisionId,
    acceptedAssignmentId: input.acceptedAssignmentId,
    acceptedIntentId: input.acceptedIntentId,
    proofRefs: [...input.proofRefs],
    contractRevision: input.currentContractRevision,
    acceptedAt: input.at,
  };
  return {
    satisfied: true,
    resolution,
    requirement: {
      ...requirement,
      state: "satisfied",
      resolution,
      blockedReason: null,
      updatedAt: input.at,
    },
  };
}

// Legal requirement transitions. Anything else is a typed refusal.
const LEGAL: Record<RequirementState, readonly RequirementState[]> = {
  active: ["satisfied", "blocked", "superseded", "waived"],
  blocked: ["active", "satisfied", "superseded", "waived"],
  satisfied: ["superseded"],
  superseded: [],
  waived: ["superseded"],
};

export function transitionRequirementState(
  requirement: Requirement,
  next: RequirementState,
  at: number,
  opts: { authorizedWaiverReason?: string | null; blockedReason?: string | null } = {},
): { ok: true; requirement: Requirement } | { ok: false; reason: string } {
  if (!LEGAL[requirement.state].includes(next))
    return {
      ok: false,
      reason: `illegal requirement transition: ${requirement.state} -> ${next}`,
    };
  if (next === "waived") {
    // A waiver is never self-granted: only an authorized founder reason accepts.
    if (!opts.authorizedWaiverReason?.trim())
      return { ok: false, reason: "waived requires an explicit authorized reason" };
    return {
      ok: true,
      requirement: {
        ...requirement,
        state: "waived",
        waiver: { reason: opts.authorizedWaiverReason, authorizedBy: "founder", at },
        updatedAt: at,
      },
    };
  }
  if (next === "blocked") {
    if (!opts.blockedReason?.trim())
      return { ok: false, reason: "blocked requires a reason" };
    return {
      ok: true,
      requirement: { ...requirement, state: "blocked", blockedReason: opts.blockedReason, updatedAt: at },
    };
  }
  return { ok: true, requirement: { ...requirement, state: next, updatedAt: at } };
}

// ── Requirement-set queries used by the completion gate and read model ──────

export function openRequired(requirements: readonly Requirement[]): Requirement[] {
  return requirements.filter(
    (r) => r.priority === "required" && r.state !== "satisfied" && r.state !== "waived" && r.state !== "superseded",
  );
}

export function pendingSupporting(requirements: readonly Requirement[]): Requirement[] {
  return requirements.filter(
    (r) => r.priority === "supporting" && r.state !== "satisfied" && r.state !== "waived" && r.state !== "superseded",
  );
}

export function blockedRequirements(requirements: readonly Requirement[]): Requirement[] {
  return requirements.filter((r) => r.state === "blocked");
}
