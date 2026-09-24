// Outcome Contract + Requirement construction and revision semantics.
//
// The model proposes SEMANTICS; this module is the only thing that can turn
// them into governed Requirements with attachable proof methods (locked
// decision 5). Proof attachment is strategy-derived and application-owned:
// a model cannot choose a weaker proof kind, cannot mark its own requirement
// "supporting" to dodge a gate (that downgrade guard lives in proposals.ts),
// and cannot attach a proof method that does not exist.

import { validateCapabilitySpec } from "./capability";
import { isSatisfactionStrategy } from "./types";
import { isGovernedPurposeKind, isGovernedResourceClass } from "../workforce/catalog";
import type { ProofFacts } from "./requirements";
import type { ParsedOutcomeContract, ParsedRequirementProposal } from "./proposals";
import type {
  AuthorizedPurposePolicy,
  OutcomeContract,
  OutcomeLevel,
  ProofSpec,
  Requirement,
  SatisfactionStrategy,
} from "./types";

const ID_PATTERN = /^[a-z][a-z0-9_]{1,79}$/;

export type ContractBuildInput = {
  objectiveKey: string;
  contractId: string;
  revision: number;
  parsed: ParsedOutcomeContract;
  requestId: string; // stable idempotency identity for this interpretation
  founderResolvedQuestions: readonly string[]; // questions the founder actually answered
  at: number;
};

export type ContractBuildResult =
  | { ok: true; contract: OutcomeContract }
  | { ok: false; errors: string[] };

export function buildOutcomeContract(input: ContractBuildInput): ContractBuildResult {
  const { parsed } = input;
  const errors: string[] = [];
  if (!ID_PATTERN.test(input.contractId)) errors.push("contractId is not a bounded identifier");
  if (!input.objectiveKey.trim()) errors.push("objectiveKey missing");
  if (input.revision < 1) errors.push("contract revision must be ≥ 1");

  const levels: OutcomeLevel[] = [];
  const keys = new Set<string>();
  parsed.levels.forEach((level, index) => {
    if (!ID_PATTERN.test(level.levelKey)) errors.push(`levelKey ${level.levelKey} not bounded`);
    if (keys.has(level.levelKey)) errors.push(`duplicate levelKey ${level.levelKey}`);
    keys.add(level.levelKey);
    if (!level.statement.trim()) errors.push(`level ${level.levelKey} has no statement`);
    levels.push({ ...level, order: index + 1 });
  });
  if (!keys.has(parsed.minimumCompletionBar))
    errors.push("minimum completion bar does not reference a declared level");

  // A material ambiguity the founder has NOT resolved keeps its approval flag.
  const resolved = new Set(input.founderResolvedQuestions);
  const ambiguities = parsed.ambiguities.map((ambiguity) =>
    resolved.has(ambiguity.question)
      ? { ...ambiguity, resolvedBy: "founder" as const, requiresFounderApproval: false }
      : ambiguity,
  );

  if (errors.length) return { ok: false, errors };
  return {
    ok: true,
    contract: {
      contractId: input.contractId,
      objectiveKey: input.objectiveKey,
      revision: input.revision,
      intent: parsed.intent,
      levels,
      minimumCompletionBar: parsed.minimumCompletionBar,
      ambiguities,
      createdBy: "somebody",
      createdFromRequestId: input.requestId,
      createdAt: input.at,
    },
  };
}

export function unresolvedMaterialAmbiguity(
  contract: OutcomeContract,
): string | null {
  const material = contract.ambiguities.find(
    (ambiguity) => ambiguity.materiality === "material" && !ambiguity.requiresFounderApproval === false,
  );
  return material ? material.question : null;
}

// ── Requirement mapping ──────────────────────────────────────────────────────

export type RequirementBuildInput = {
  objectiveKey: string;
  contract: OutcomeContract;
  proposed: ParsedRequirementProposal;
  // Application-side knowledge for proof attachment: which artifact key (if
  // any) this objective mutates, and the strategy the application would bind.
  artifactKeyForInternalProof: string | null;
  /**
   * V7 review R4 final correction — carried forward from the CURRENT
   * persisted Requirement row (never from `proposed`/interpretation output):
   * a decision-pass rebuild must not silently drop already-authorized
   * purpose scope. Absent/empty = still no purpose scope authorized.
   */
  authorizedPurposeKinds?: readonly string[];
  at: number;
};

// Governed proof kinds, and the strategy classes that may attach them. A BUY
// that names an artifact proof would be a way to fake satisfaction with a
// purchase that never happened; a MAKE may not claim external verification it
// did not perform. These tables encode the shape of that guard.
const PROOF_KINDS = [
  "company_artifact_version",
  "application_observation",
  "verified_external_result",
  "verified_external_effect",
  "founder_confirmation",
] as const;

// ── Semantic requirements: what must be true, before how it will be satisfied ─

// R3 A1 — a Requirement MUST be creatable without a satisfaction strategy.
//
// The interpretation step knows WHAT the founder needs; it does not yet know
// whether Somebody will make it, buy it, or wait. Attaching proof obligations at
// interpretation time would have to invent a strategy to choose them, which is
// exactly the "model decides authority" failure M4 exists to prevent — and it is
// why an Objective could never enter the engine at all before CP8: the only
// requirement builder demanded an attachable strategy proof.
//
// So the shape is: semantic Requirement (proofs: [], strategy: null, state
// "active") → grounded decision binds a strategy → the authorized strategy
// attaches its governed proofs → strategy-specific proof params bind at
// execution time. A proof-less requirement can NEVER be satisfied and can NEVER
// pass the completion gate (enforced in requirements.ts and completion.ts, and
// proved by tests there) — "not yet resolvable" is not "free to complete".
export function buildSemanticRequirement(input: {
  objectiveKey: string;
  contract: OutcomeContract;
  proposed: ParsedRequirementProposal;
  at: number;
}): { requirement: Requirement } | { errors: string[] } {
  const errors: string[] = [];
  const { proposed, contract } = input;
  if (!ID_PATTERN.test(proposed.requirementKey))
    errors.push(`requirementKey ${proposed.requirementKey} not bounded`);
  if (errors.length) return { errors };
  return {
    requirement: {
      requirementKey: proposed.requirementKey,
      objectiveKey: input.objectiveKey,
      contractId: contract.contractId,
      contractRevision: contract.revision,
      priority: proposed.priority,
      title: proposed.title,
      mustBeTrue: proposed.mustBeTrue,
      scope: proposed.scope,
      dependsOnRequirementKeys: [...(proposed.dependsOnRequirementKeys ?? [])],
      requiredResourceClasses: [...(proposed.requiredResourceClasses ?? [])],
      expectedOutput: proposed.expectedOutput ?? null,
      ...(proposed.requirementKind
        ? { requirementKind: proposed.requirementKind }
        : {}),
      proofs: [],
      state: "active",
      strategy: null,
      resolution: null,
      blockedReason: null,
      waiver: null,
      revision: 1,
      createdAt: input.at,
      updatedAt: input.at,
    },
  };
}

/**
 * V7 review R4 final scope-origin correction — binds an APPLICATION-OWNED
 * purpose-scope policy onto the ONE newly-interpreted Requirement it
 * structurally targets.
 *
 * The policy pre-exists interpretation (written only by Objective setup, e.g.
 * setupCanonicalDemoObjective) and is NEVER derived from interpretation/model
 * output, Requirement prose, or a worker's proposed purposeKind. Matching
 * uses only `requirementKind` — a value interpretation itself coerces into a
 * small governed enum (parseRequirementProposals), never free text.
 *
 * Fails closed: an ungoverned purposeKind, or zero / more than one
 * structurally-matching Requirement in this interpretation batch, grants
 * nothing rather than guessing which row was meant.
 *
 * The same policy may also carry `requiredResourceClasses` — an additive,
 * APPLICATION-OWNED statement that the targeted Requirement genuinely needs
 * those inputs. (The Testnet submission policy deliberately does not use it:
 * its `proprietary_data` gap must be discovered at runtime, not pre-declared.)
 * This only ADDS to `Requirement.requiredResourceClasses`; it never removes
 * an already-declared need, and ungoverned classes are dropped rather than
 * grants being widened silently. It does not choose MAKE or BUY — the normal
 * eligibility (`input_not_owned`) and Jev pipeline still decide that from
 * this fact plus `CURRENT_RESOURCE_INVENTORY`.
 */
export function bindAuthorizedPurposePolicy(
  requirements: readonly Requirement[],
  policy: AuthorizedPurposePolicy | null | undefined,
): Requirement[] {
  if (!policy) return [...requirements];
  if (!isGovernedPurposeKind(policy.purposeKind)) return [...requirements];
  const matches = requirements.filter(
    (requirement) => requirement.requirementKind === policy.targetRequirementKind,
  );
  if (matches.length !== 1) return [...requirements];
  const target = matches[0]!;
  const additionalResourceClasses = [
    ...new Set((policy.requiredResourceClasses ?? []).filter(isGovernedResourceClass)),
  ];
  return requirements.map((requirement) =>
    requirement === target
      ? {
          ...requirement,
          authorizedPurposeKinds: [policy.purposeKind],
          ...(additionalResourceClasses.length
            ? {
                requiredResourceClasses: [
                  ...new Set([
                    ...requirement.requiredResourceClasses,
                    ...additionalResourceClasses,
                  ]),
                ],
              }
            : {}),
        }
      : requirement,
  );
}

export function buildRequirement(
  input: RequirementBuildInput,
  strategy: SatisfactionStrategy | null,
): { requirement: Requirement } | { errors: string[] } {
  const errors: string[] = [];
  const { proposed, contract } = input;
  if (!ID_PATTERN.test(proposed.requirementKey)) errors.push(`requirementKey ${proposed.requirementKey} not bounded`);
  if (strategy !== null && !isSatisfactionStrategy(strategy))
    errors.push(`unknown strategy ${String(strategy)}`);
  if (errors.length) return { errors };

  const proofs: ProofSpec[] = attachGovernedProofs(proposed, contract, strategy, input.artifactKeyForInternalProof);
  if (!proofs.length)
    errors.push(`requirement ${proposed.requirementKey} has no attachable governed proof method`);
  if (errors.length) return { errors };
  return {
    requirement: {
      requirementKey: proposed.requirementKey,
      objectiveKey: input.objectiveKey,
      contractId: contract.contractId,
      contractRevision: contract.revision,
      priority: proposed.priority,
      title: proposed.title,
      mustBeTrue: proposed.mustBeTrue,
      scope: proposed.scope,
      dependsOnRequirementKeys: [...(proposed.dependsOnRequirementKeys ?? [])],
      requiredResourceClasses: [...(proposed.requiredResourceClasses ?? [])],
      ...(input.authorizedPurposeKinds && input.authorizedPurposeKinds.length > 0
        ? { authorizedPurposeKinds: [...input.authorizedPurposeKinds] }
        : {}),
      expectedOutput: proposed.expectedOutput ?? null,
      ...(proposed.requirementKind
        ? { requirementKind: proposed.requirementKind }
        : {}),
      proofs,
      state: "active",
      strategy,
      resolution: null,
      blockedReason: null,
      waiver: null,
      revision: 1,
      createdAt: input.at,
      updatedAt: input.at,
    },
  };
}

// Requirement.requiredResourceClasses is the wide MAKE-input vocabulary
// (company_records, public_web, llm_reasoning, ordinary_compute,
// company_tools, ...); only the two that name an OBSERVABLE evidence source
// translate onto the narrow application_observation proof source-class
// vocabulary. llm_reasoning/ordinary_compute/company_tools are real MAKE
// inputs but never evidence sources, so they translate to nothing — this is
// the application-owned mapping the source-proof fix relies on, never a
// model-authored label.
const OBSERVABLE_SOURCE_CLASS_ORDER = ["company_record", "public_web"] as const;
const RESOURCE_CLASS_TO_PROOF_SOURCE_CLASS: Record<
  string,
  (typeof OBSERVABLE_SOURCE_CLASS_ORDER)[number]
> = {
  company_records: "company_record",
  public_web: "public_web",
};

/** Deterministically ordered, deduplicated observable source classes a Requirement explicitly requires. */
function observableSourceClassesRequired(
  requiredResourceClasses: readonly string[],
): Array<(typeof OBSERVABLE_SOURCE_CLASS_ORDER)[number]> {
  const required = new Set(
    requiredResourceClasses
      .map((resourceClass) => RESOURCE_CLASS_TO_PROOF_SOURCE_CLASS[resourceClass])
      .filter((sourceClass): sourceClass is (typeof OBSERVABLE_SOURCE_CLASS_ORDER)[number] => sourceClass !== undefined),
  );
  return OBSERVABLE_SOURCE_CLASS_ORDER.filter((sourceClass) => required.has(sourceClass));
}

/**
 * One application_observation ProofSpec per explicitly required observable
 * source class, each carrying its class in `params.sourceClass` so the class
 * survives dispatch, binding and Requirement-level recomputation. When the
 * Requirement names no observable class, falls back to the single generic
 * proof (params: {}) so pre-existing behavior is unchanged.
 */
function observationProofs(requiredResourceClasses: readonly string[]): ProofSpec[] {
  const classes = observableSourceClassesRequired(requiredResourceClasses);
  if (classes.length === 0) {
    return [
      {
        proofKey: "observation",
        description: "at least one application-recorded observation supports the requirement",
        proofKind: "application_observation",
        params: {},
      },
    ];
  }
  return classes.map((sourceClass) => ({
    proofKey: `observation_${sourceClass}`,
    description: `at least one application-recorded ${sourceClass} observation supports the requirement`,
    proofKind: "application_observation",
    params: { sourceClass },
  }));
}

function attachGovernedProofs(
  proposed: ParsedRequirementProposal,
  contract: OutcomeContract,
  strategy: SatisfactionStrategy | null,
  artifactKey: string | null,
): ProofSpec[] {
  // Explicit semantic kind owns proof attachment for serial rows.
  // Strategy must not redefine what the founder asked to receive.
  if (proposed.requirementKind === "deliverable") {
    return attachDeliverableProofs(proposed, artifactKey);
  }
  if (proposed.requirementKind === "input") {
    return attachInputProofs(proposed, strategy);
  }

  // Legacy (kind omitted from older callers): strategy-derived proofs.
  const proofs: ProofSpec[] = [];
  if (strategy === "BUY" || strategy === "HYBRID") {
    proofs.push({
      proofKey: "external_result",
      description: `acquired external result for ${proposed.title} persisted and verified`,
      proofKind: "verified_external_result",
      params: {},
    });
  }
  if (strategy === "MAKE" || strategy === "HYBRID") {
    if (artifactKey && proposed.expectedOutput) {
      proofs.push({
        proofKey: "artifact_change",
        description: `controlled company artifact ${artifactKey} advanced by an accepted run`,
        proofKind: "company_artifact_version",
        params: { artifactKey, minVersion: 2 },
      });
    }
    proofs.push(...observationProofs(proposed.requiredResourceClasses ?? []));
  }
  if (strategy === "ASK_FOUNDER") {
    proofs.push({
      proofKey: "founder_answer",
      description: "founder answer recorded against this requirement",
      proofKind: "founder_confirmation",
      params: {},
    });
  }
  void contract;
  return proofs;
}

/** Founder-facing deliverable proofs — independent of MAKE vs BUY selection. */
function attachDeliverableProofs(
  proposed: ParsedRequirementProposal,
  artifactKey: string | null,
): ProofSpec[] {
  const proofs: ProofSpec[] = [];
  if (artifactKey && proposed.expectedOutput) {
    proofs.push({
      proofKey: "artifact_change",
      description: `controlled company artifact ${artifactKey} advanced by an accepted run`,
      proofKind: "company_artifact_version",
      params: { artifactKey, minVersion: 2 },
    });
  }
  proofs.push(...observationProofs(proposed.requiredResourceClasses ?? []));
  return proofs;
}

/** Explicit input requirements may be satisfied by a scoped verified acquisition. */
function attachInputProofs(
  proposed: ParsedRequirementProposal,
  strategy: SatisfactionStrategy | null,
): ProofSpec[] {
  const proofs: ProofSpec[] = [];
  if (strategy === "BUY" || strategy === "HYBRID" || strategy === null) {
    proofs.push({
      proofKey: "external_result",
      description: `acquired external result for ${proposed.title} persisted and verified`,
      proofKind: "verified_external_result",
      params: {},
    });
  }
  if (strategy === "MAKE") {
    proofs.push(...observationProofs(proposed.requiredResourceClasses ?? []));
  }
  if (strategy === "ASK_FOUNDER") {
    proofs.push({
      proofKey: "founder_answer",
      description: "founder answer recorded against this requirement",
      proofKind: "founder_confirmation",
      params: {},
    });
  }
  return proofs;
}

// Rebind a requirement's declared observation proof to a concrete application
// observation id once the run that produced it is known. Caller-provided ids
// must already be verified application observations.
export function bindProofParams(
  requirement: Requirement,
  bindings: Record<string, Record<string, string | number>>,
  at: number,
): Requirement {
  let changed = false;
  const proofs = requirement.proofs.map((proof) => {
    const patch = bindings[proof.proofKey];
    if (!patch) return proof;
    changed = true;
    return { ...proof, params: { ...proof.params, ...patch } };
  });
  return changed ? { ...requirement, proofs, updatedAt: at } : requirement;
}

// R3 A5 — "strategy-specific proof params bind at execution time" made real,
// and bound ONLY from application-verified facts. An unbound obligation
// (`application_observation` without a named source, `verified_external_*`
// without a named intent, `founder_confirmation` without a recorded ref) is
// re-pointed at the smallest, deterministically-ordered id the facts actually
// contain. This invents nothing: with no facts there is no binding and the
// obligation stays unmet. It narrows nothing either — a proof already bound
// to a concrete source keeps that binding, so a caller cannot "re-bind" an
// unsatisfied proof onto fresher evidence to fake the bar.
export function bindExecutedProofParams(
  requirement: Requirement,
  facts: ProofFacts,
  at: number,
): Requirement {
  const bindings: Record<string, Record<string, string | number>> = {};
  const observations = [...new Set(facts.applicationObservationIds)].sort();
  const verifiedResults = [...new Set(facts.verifiedExternalResultIntentIds ?? facts.verifiedIntentIds)].sort();
  const verifiedEffects = [...new Set(facts.verifiedExternalEffectIntentIds ?? [])].sort();
  const confirmations = [...new Set(facts.founderConfirmationRefs)].sort();
  for (const proof of requirement.proofs) {
    switch (proof.proofKind) {
      case "application_observation": {
        if (proof.params.sourceId || proof.params.evidenceId) break;
        const requiredClass = proof.params.sourceClass;
        // A proof carrying explicit source intent binds ONLY an observation
        // application-verified as that class — a company_record observation
        // can never satisfy a public_web proof merely because its id exists.
        const candidate =
          requiredClass === "company_record" || requiredClass === "public_web"
            ? observations.find((id) => facts.applicationObservationSourceClasses?.[id] === requiredClass)
            : observations[0];
        if (candidate) bindings[proof.proofKey] = { sourceId: candidate };
        break;
      }
      case "verified_external_result": {
        if (!proof.params.intentId && verifiedResults.length > 0)
          bindings[proof.proofKey] = { intentId: verifiedResults[0] };
        break;
      }
      case "verified_external_effect": {
        if (!proof.params.intentId && verifiedEffects.length > 0)
          bindings[proof.proofKey] = { intentId: verifiedEffects[0] };
        break;
      }
      case "founder_confirmation": {
        if (!proof.params.confirmationRef && confirmations.length > 0)
          bindings[proof.proofKey] = { confirmationRef: confirmations[0] };
        break;
      }
      case "company_artifact_version":
        // artifactKey/minVersion are interpretation-time governance, never
        // execution facts — there is nothing to bind and nothing to relax.
        break;
    }
  }
  return bindProofParams(requirement, bindings, at);
}

// A new contract revision supersedes requirements that cannot carry forward:
// anything not already satisfied or resolved becomes superseded so stale proof
// can never gate or satisfy the new revision.
export function supersedeForRevision(
  requirements: readonly Requirement[],
  at: number,
): Requirement[] {
  return requirements.map((requirement) =>
    requirement.state === "satisfied" ||
    requirement.state === "superseded" ||
    requirement.state === "waived"
      ? requirement
      : { ...requirement, state: "superseded" as const, updatedAt: at },
  );
}

export { PROOF_KINDS, validateCapabilitySpec };
