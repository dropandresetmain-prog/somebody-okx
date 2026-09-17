// Assignment-specific WorkContract adapted from the inherited
// CoreWorkerContract. The inherited completion rule required at least one
// externally verified effect; legitimate evidence-only MAKE work must be able
// to complete from persisted observations plus the structured result, without
// inventing a fake external effect. External effects remain supported for the
// future BUY path (requiredVerifiedEffectKeys) but are optional here.

import type {
  ActivityResult,
  EvidenceRecord,
  WorkContract,
  WorkerSpec,
} from "./types";

export function createWorkContract(input: {
  assignment: string;
  idempotencyScope: string;
  worker: WorkerSpec;
  requiredSourceClasses: WorkContract["requiredSourceClasses"];
  minObservations: number;
  resultRequirements?: Partial<WorkContract["resultRequirements"]>;
}): WorkContract {
  const assignment = input.assignment.trim();
  if (!assignment)
    throw new Error("A work contract requires a bounded assignment");
  if (!input.idempotencyScope.trim())
    throw new Error("A work contract requires a stable idempotency scope");
  if (!input.worker.capabilityKeys.length)
    throw new Error("A work contract requires a validated worker");
  // Deny by default: only permissions the worker's capability envelope grants,
  // and never the reserved external-spend permission.
  if (
    input.worker.allowedToolPermissions.includes("authorize_external_spend")
  )
    throw new Error("WorkContract cannot bind external spend authority");
  if (!input.requiredSourceClasses.length)
    throw new Error("A work contract requires at least one required source class");
  if (input.minObservations < input.requiredSourceClasses.length)
    throw new Error(
      "minObservations must cover every required source class",
    );
  return {
    assignment,
    idempotencyScope: input.idempotencyScope,
    workerKey: input.worker.workerKey,
    capabilityKeys: input.worker.capabilityKeys,
    allowedToolPermissions: [...input.worker.allowedToolPermissions],
    requiredSourceClasses: input.requiredSourceClasses,
    minObservations: input.minObservations,
    requiredVerifiedEffectKeys: [],
    approvalVersion: null,
    resultRequirements: {
      summary: true,
      fit: true,
      risks: true,
      unknowns: true,
      recommendedNextAction: true,
      ...input.resultRequirements,
    },
  };
}

export type CompletionCheck = {
  complete: boolean;
  unmet: string[];
};

// Application-owned completion policy. The model's claim to be finished is
// never sufficient: proof comes from persisted evidence and the structured
// result. Effects, when a contract ever requires them, stay governed by the
// inherited attempted → unverified → verified lifecycle.
export function evaluateCompletion(input: {
  contract: WorkContract;
  evidence: EvidenceRecord[];
  result: ActivityResult | null;
  verifiedEffects?: { key: string; status: string }[];
}): CompletionCheck {
  const unmet: string[] = [];
  const { contract, evidence, result } = input;

  for (const sourceClass of contract.requiredSourceClasses)
    if (!evidence.some((item) => item.sourceClass === sourceClass))
      unmet.push(`No observation recorded from ${sourceClass}`);

  if (evidence.length < contract.minObservations)
    unmet.push(
      `Only ${evidence.length} of ${contract.minObservations} required observations recorded`,
    );

  if (contract.resultRequirements.summary && !result?.summary?.trim())
    unmet.push("Structured result missing a summary");
  if (contract.resultRequirements.fit && !result?.fit?.trim())
    unmet.push("Structured result missing the fit assessment");
  if (
    contract.resultRequirements.risks &&
    !(result?.risks?.length)
  )
    unmet.push("Structured result missing risks");
  if (
    contract.resultRequirements.unknowns &&
    !(result?.unknowns?.length)
  )
    unmet.push("Structured result missing unknowns");
  if (
    contract.resultRequirements.recommendedNextAction &&
    !result?.recommendedNextAction?.trim()
  )
    unmet.push("Structured result missing a recommended next action");

  for (const key of contract.requiredVerifiedEffectKeys) {
    const effect = input.verifiedEffects?.find(
      (candidate) => candidate.key === key,
    );
    if (effect?.status !== "verified")
      unmet.push(`Required effect ${key} is not independently verified`);
  }

  return { complete: unmet.length === 0, unmet };
}
