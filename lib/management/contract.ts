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
import type { ParsedOutcomeContract, ParsedRequirementProposal } from "./proposals";
import type {
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

function attachGovernedProofs(
  proposed: ParsedRequirementProposal,
  contract: OutcomeContract,
  strategy: SatisfactionStrategy | null,
  artifactKey: string | null,
): ProofSpec[] {
  // Strategy-derived proof, application-owned. The bar level is always
  // reflected in a real proof method, never in the model's prose.
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
    if (artifactKey) {
      proofs.push({
        proofKey: "artifact_change",
        description: `controlled company artifact ${artifactKey} advanced by an accepted run`,
        proofKind: "company_artifact_version",
        params: { artifactKey, minVersion: 2 },
      });
    }
    proofs.push({
      proofKey: "observation",
      description: "at least one application-recorded observation supports the requirement",
      proofKind: "application_observation",
      params: {},
    });
  }
  if (strategy === "ASK_FOUNDER") {
    proofs.push({
      proofKey: "founder_answer",
      description: "founder answer recorded against this requirement",
      proofKind: "founder_confirmation",
      params: {},
    });
  }
  // WAIT / BLOCK attach no proof: they cannot be satisfied by work, only by a
  // later strategy decision or an authorized waiver.
  void contract;
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
