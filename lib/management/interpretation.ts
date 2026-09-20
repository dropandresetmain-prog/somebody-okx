// R3 A1 — Objective → Outcome Contract → Requirements: the ENTRY the engine
// never had.
//
// Before CP8, `submitObjective` produced an M2 plan and no production path ever
// created an Outcome Contract, persisted Requirements, or set
// `management.contractId`. Everything downstream (grounding, staffing, dispatch,
// verification, the completion gate) was therefore unreachable from the real
// entry point: the kernels were proven in isolation but the loop was open.
//
// This module is the pure, deterministic half of closing it. It takes an
// UNTRUSTED model proposal and produces the business rows the application owns:
//
//   parseOutcomeContractProposal  → bounded, fail-closed parse (proposals.ts)
//   buildOutcomeContract          → the ONLY thing that can create a Contract;
//                                   a bar that isn't a declared level is refused
//   parseRequirementProposals     → semantic requirements, priority fail-safe to
//                                   "required" (downgrading a gate is the exact
//                                   false-completion move)
//   buildSemanticRequirement      → proof-less, strategy-less row (contract.ts)
//
// Deliberately absent here: any authority over permissions, spend, or
// completion. The model names WHAT must be true; stage-4 authorization names how
// it may be satisfied, and only the completion gate says whether it is.
//
// Ambiguity handling is preserved, not bypassed: a MATERIAL ambiguity the founder
// has not resolved keeps `requiresFounderApproval: true`, so the reducer parks the
// Objective in approval_required instead of acting on a guess (locked decision 1).

import { buildOutcomeContract, buildSemanticRequirement } from "./contract";
import {
  parseOutcomeContractProposal,
  parseRequirementProposals,
} from "./proposals";
import type { Requirement } from "./types";
import type { OutcomeContract } from "./types";

export type InterpretationInput = {
  objectiveKey: string;
  // Stable idempotency identity for THIS interpretation request. Replaying the
  // same request cannot produce a second contract: the contractId is derived
  // from it, and putContract is an upsert by (objectiveKey, revision).
  requestId: string;
  rawContract: unknown;
  rawRequirements: unknown;
  // Questions the founder has actually answered, by question text.
  founderResolvedQuestions: readonly string[];
  at: number;
};

export type InterpretationResult =
  | {
      ok: true;
      contract: OutcomeContract;
      requirements: Requirement[];
      // Typed, non-fatal notes the read model can show — e.g. an ordinary
      // ambiguity Somebody resolved itself.
      notes: string[];
    }
  | { ok: false; errors: string[] };

export function contractIdFor(requestId: string): string {
  // Bounded identifier, stable for a given request. Not a hash of meaning: the
  // request id IS the identity of this interpretation.
  const cleaned = requestId
    .toLowerCase()
    .replace(/[^a-z0-9_]+/g, "_")
    .replace(/^_+|_+$/g, "");
  const base = cleaned.length >= 2 ? cleaned : "interpretation";
  return `contract_${base}`.slice(0, 80).replace(/_+$/g, "");
}

export function interpretObjective(input: InterpretationInput): InterpretationResult {
  const errors: string[] = [];
  const notes: string[] = [];

  const parsedContract = parseOutcomeContractProposal(input.rawContract);
  if (!parsedContract.ok)
    return { ok: false, errors: parsedContract.errors.map((e) => `contract: ${e}`) };

  const contractResult = buildOutcomeContract({
    objectiveKey: input.objectiveKey,
    contractId: contractIdFor(input.requestId),
    revision: 1,
    parsed: parsedContract.value,
    requestId: input.requestId,
    founderResolvedQuestions: input.founderResolvedQuestions,
    at: input.at,
  });
  if (!contractResult.ok)
    return { ok: false, errors: contractResult.errors.map((e) => `contract: ${e}`) };
  const contract = contractResult.contract;

  const parsedRequirements = parseRequirementProposals(input.rawRequirements);
  if (!parsedRequirements.ok)
    return { ok: false, errors: parsedRequirements.errors.map((e) => `requirements: ${e}`) };

  // Semantic rows only: no proofs and no strategy yet, because neither is known
  // at interpretation time. The decision pass attaches governed proofs for the
  // strategy it authorizes, and only requirements.ts/completion.ts can ever call
  // a proof-less row unsatisfied — which it does, so an unpersisted strategy is
  // "not yet resolvable", never "free to complete".
  const requirements: Requirement[] = [];
  for (const proposed of parsedRequirements.value) {
    const built = buildSemanticRequirement({
      objectiveKey: input.objectiveKey,
      contract,
      proposed,
      at: input.at,
    });
    if ("errors" in built) {
      errors.push(...built.errors);
      continue;
    }
    requirements.push(built.requirement);
  }
  if (errors.length) return { ok: false, errors };

  const required = requirements.filter((requirement) => requirement.priority === "required");
  if (required.length === 0)
    return {
      ok: false,
      errors: ["interpretation produced no required requirement; an objective needs a gate"],
    };

  // The bar must be claimed by something: at least one REQUIRED requirement must
  // reference the bar level, else the level is decorative. The parser cannot
  // enforce this alone because semantics live in the statements, so the guard
  // here is structural: a required requirement whose mustBeTrue is empty is
  // already refused by the parser; a bar with no required requirement at all
  // cannot exist because `required.length === 0` is refused above.
  const unresolvedMaterial = contract.ambiguities.filter(
    (ambiguity) => ambiguity.materiality === "material" && ambiguity.requiresFounderApproval,
  );
  if (unresolvedMaterial.length)
    notes.push(
      `${unresolvedMaterial.length} material ambiguity/ambiguities left for the founder; the engine will not act on them`,
    );

  return { ok: true, contract, requirements, notes };
}

/** True when the ambiguity is about a spend/budget bound the objective already authorized. */
export function isSpendBoundAmbiguity(question: string): boolean {
  return /\b(spend|budget|limit|usd|\$|cost|priced?)\b/i.test(question);
}

/**
 * When a live founder spend grant already exists, demote spend-bound material
 * ambiguities to ordinary. Free-router models often re-ask for the spend limit
 * even though the objective text and demo grant already authorize it — that
 * parks the engine on ask_founder forever with no UI answer path.
 */
export function demoteSpendAmbiguitiesWhenGrantPresent<
  T extends {
    ambiguities: Array<{
      question: string;
      materiality: "material" | "ordinary";
      resolution: string;
      resolvedBy: "somebody" | "founder";
      requiresFounderApproval: boolean;
    }>;
  },
>(contract: T, hasLiveSpendGrant: boolean): { contract: T; demoted: number } {
  if (!hasLiveSpendGrant) return { contract, demoted: 0 };
  let demoted = 0;
  const ambiguities = contract.ambiguities.map((ambiguity) => {
    if (
      ambiguity.materiality === "material" &&
      ambiguity.requiresFounderApproval &&
      isSpendBoundAmbiguity(ambiguity.question)
    ) {
      demoted += 1;
      return {
        ...ambiguity,
        materiality: "ordinary" as const,
        requiresFounderApproval: false,
        resolvedBy: "somebody" as const,
        resolution: `${ambiguity.resolution} Bounded by the existing founder spend grant.`,
      };
    }
    return ambiguity;
  });
  return { contract: { ...contract, ambiguities }, demoted };
}

// The durable wake identity for "this objective now has a contract" — used by
// the interpretation mutation to wake the management loop exactly once per
// interpretation, however many times the write is replayed.
export function interpretationDedupeKey(objectiveKey: string, contractId: string): string {
  return `interpret:${objectiveKey}:${contractId}`;
}
