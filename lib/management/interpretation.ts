// R3 A1 — Objective → Outcome Contract → Requirements: the ENTRY the engine
// never had.
//
// Staged cognition (sourcing patch):
//   Call 1 — Outcome Contract only (intent / levels / bar / ambiguities)
//   Application validation (buildOutcomeContract owns ids/timestamps)
//   Call 2 — Requirement decomposition (semantic rows only)
//   Application semantic audit (+ optional ONE Requirements-only repair)
//
// Deliberately absent here: any authority over permissions, spend, or
// completion. The model names WHAT must be true; stage-4 authorization names how
// it may be satisfied, and only the completion gate says whether it is.
//
// Ambiguity handling is preserved, not bypassed: a MATERIAL ambiguity the founder
// has not resolved keeps `requiresFounderApproval: true`, so the reducer parks the
// Objective in approval_required instead of acting on a guess (locked decision 1).

import {
  bindAuthorizedPurposePolicy,
  buildOutcomeContract,
  buildSemanticRequirement,
} from "./contract";
import { assignApplicationRequirementKeys } from "./requirementIdentity";
import {
  auditRequirementSemantics,
  formatSemanticAuditFailure,
} from "./requirementSemanticAudit";
import {
  parseOutcomeContractProposal,
  parseRequirementProposals,
} from "./proposals";
import type { AuthorizedPurposePolicy, Requirement } from "./types";
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
  // When a founder spend grant is already bound, meta-questions about the grant
  // itself (amount / whether further approval is needed within the grant) are
  // not material — they are ordinary working assumptions Somebody may own.
  // Serial path: prefer factual spendLimitUsd disclosure instead of keyword
  // demotion (legacy demotion retained when serialManagerProtocol is false).
  spendGrantPresent?: boolean;
  spendLimitUsd?: number | null;
  serialManagerProtocol?: boolean;
  /**
   * V7 review R4 final scope-origin correction — the CURRENT Objective's
   * application-owned purpose-scope policy (Objective.management, set only by
   * setup code such as setupCanonicalDemoObjective). Never sourced from
   * `rawContract`/`rawRequirements` (model output). Absent = no purpose scope
   * authorized for any Requirement produced by this interpretation.
   */
  authorizedPurposePolicy?: AuthorizedPurposePolicy | null;
};

/**
 * Models often re-ask about the already-bound spend grant as a "material"
 * ambiguity. That parks the Objective forever (no production founder-answer
 * seam). When a grant is present, demote those grant-meta questions only.
 */
export function isSpendGrantMetaAmbiguity(question: string): boolean {
  const q = question.toLowerCase();
  if (!/(spend|grant|budget|limit|authority|approval|usd|payment)/.test(q)) {
    return false;
  }
  return (
    /approved spend limit|spend limit amount|founder.?grant|spend grant/.test(q) ||
    /beyond (the )?(bounded )?founder grant/.test(q) ||
    /further approval|additional approval|another approval/.test(q) ||
    /what is the approved/.test(q) ||
    /how much.*(spend|budget|limit|grant)/.test(q) ||
    /on what is it spent/.test(q)
  );
}

export type InterpretationResult =
  | {
      ok: true;
      contract: OutcomeContract;
      requirements: Requirement[];
      // Typed, non-fatal notes the read model can show — e.g. an ordinary
      // ambiguity Somebody resolved itself.
      notes: string[];
    }
  | {
      ok: false;
      errors: string[];
      /** When set, Call 2 may be repaired once without re-running Call 1. */
      repairableSemanticFailure?: string;
    };

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

/**
 * Call-1 only: parse + build the Outcome Contract. Application owns identity.
 * Does not touch Requirements.
 */
export function interpretOutcomeContract(input: {
  objectiveKey: string;
  requestId: string;
  rawContract: unknown;
  founderResolvedQuestions: readonly string[];
  at: number;
  spendGrantPresent?: boolean;
  spendLimitUsd?: number | null;
  serialManagerProtocol?: boolean;
}):
  | { ok: true; contract: OutcomeContract; notes: string[] }
  | { ok: false; errors: string[] } {
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
  let contract = contractResult.contract;

  if (input.spendGrantPresent) {
    if (input.serialManagerProtocol !== true) {
      let demoted = 0;
      const ambiguities = contract.ambiguities.map((ambiguity) => {
        if (
          ambiguity.materiality === "material" &&
          ambiguity.requiresFounderApproval &&
          isSpendGrantMetaAmbiguity(ambiguity.question)
        ) {
          demoted += 1;
          return {
            ...ambiguity,
            materiality: "ordinary" as const,
            requiresFounderApproval: false,
            resolvedBy: "somebody" as const,
            resolution:
              ambiguity.resolution?.trim() ||
              "A bounded founder spend grant is already bound; spend within that grant needs no further founder question.",
          };
        }
        return ambiguity;
      });
      if (demoted > 0) {
        contract = { ...contract, ambiguities };
        notes.push(
          `demoted ${demoted} spend-grant meta ambiguity/ambiguities to ordinary (grant already bound)`,
        );
      }
    } else if (typeof input.spendLimitUsd === "number") {
      notes.push(
        `serial spend bound disclosed as factual context: USD ${input.spendLimitUsd}`,
      );
    }
  }

  return { ok: true, contract, notes };
}

/**
 * Call-2 only: parse Requirements against a VALIDATED contract, assign
 * application-owned keys, audit semantics, bind purpose policy.
 */
export function interpretRequirements(input: {
  objectiveKey: string;
  contract: OutcomeContract;
  rawRequirements: unknown;
  at: number;
  authorizedPurposePolicy?: AuthorizedPurposePolicy | null;
}): InterpretationResult {
  const errors: string[] = [];
  const notes: string[] = [];

  const parsedRequirements = parseRequirementProposals(input.rawRequirements);
  if (!parsedRequirements.ok)
    return { ok: false, errors: parsedRequirements.errors.map((e) => `requirements: ${e}`) };

  const keyed = assignApplicationRequirementKeys(parsedRequirements.value);

  let requirements: Requirement[] = [];
  for (const proposed of keyed) {
    const built = buildSemanticRequirement({
      objectiveKey: input.objectiveKey,
      contract: input.contract,
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

  const audit = auditRequirementSemantics({
    requirements,
    authorizedPurposePolicy: input.authorizedPurposePolicy,
  });
  if (!audit.ok) {
    const detail = formatSemanticAuditFailure(audit.issues);
    return {
      ok: false,
      errors: audit.issues.map((issue) => `semantic: ${issue.code}: ${issue.detail}`),
      repairableSemanticFailure: detail,
    };
  }

  requirements = bindAuthorizedPurposePolicy(
    requirements,
    input.authorizedPurposePolicy,
  );

  const required = requirements.filter((requirement) => requirement.priority === "required");
  if (required.length === 0)
    return {
      ok: false,
      errors: ["interpretation produced no required requirement; an objective needs a gate"],
    };

  const unresolvedMaterial = input.contract.ambiguities.filter(
    (ambiguity) => ambiguity.materiality === "material" && ambiguity.requiresFounderApproval,
  );
  if (unresolvedMaterial.length)
    notes.push(
      `${unresolvedMaterial.length} material ambiguity/ambiguities left for the founder; the engine will not act on them`,
    );

  return { ok: true, contract: input.contract, requirements, notes };
}

export function interpretObjective(input: InterpretationInput): InterpretationResult {
  const contractResult = interpretOutcomeContract({
    objectiveKey: input.objectiveKey,
    requestId: input.requestId,
    rawContract: input.rawContract,
    founderResolvedQuestions: input.founderResolvedQuestions,
    at: input.at,
    spendGrantPresent: input.spendGrantPresent,
    spendLimitUsd: input.spendLimitUsd,
    serialManagerProtocol: input.serialManagerProtocol,
  });
  if (!contractResult.ok) return contractResult;

  const reqResult = interpretRequirements({
    objectiveKey: input.objectiveKey,
    contract: contractResult.contract,
    rawRequirements: input.rawRequirements,
    at: input.at,
    authorizedPurposePolicy: input.authorizedPurposePolicy,
  });
  if (!reqResult.ok) return reqResult;

  return {
    ok: true,
    contract: contractResult.contract,
    requirements: reqResult.requirements,
    notes: [...contractResult.notes, ...reqResult.notes],
  };
}

// The durable wake identity for "this objective now has a contract" — used by
// the interpretation mutation to wake the management loop exactly once per
// interpretation, however many times the write is replayed.
export function interpretationDedupeKey(objectiveKey: string, contractId: string): string {
  return `interpret:${objectiveKey}:${contractId}`;
}
