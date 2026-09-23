// Assignment-specific WorkContract adapted from the inherited
// CoreWorkerContract. The inherited completion rule required at least one
// externally verified effect; legitimate evidence-only MAKE work must be able
// to complete from persisted observations plus the structured result, without
// inventing a fake external effect. External effects remain supported for the
// future BUY path (requiredVerifiedEffectKeys) but are optional here.

import type {
  ActivityResult,
  EvidenceRecord,
  SourceClass,
  SourceProof,
  WorkContract,
  WorkerSpec,
} from "./types";
import {
  isInvalidRequestObservation,
  isNotAvailableObservation,
} from "./inputAvailability";

// Normalize a public URL to a stable identity: lowercase scheme+host, strip
// www. prefix, drop fragment, strip trailing slash, keep query. Returns "" for
// unparseable URLs. Pure function, no network, no dependencies.
export function normalizePublicUrl(url: string): string {
  if (!url) return "";
  try {
    const parsed = new URL(url);
    // Lowercase scheme and host
    parsed.protocol = parsed.protocol.toLowerCase();
    parsed.hostname = parsed.hostname.toLowerCase();
    // Strip www. prefix
    if (parsed.hostname.startsWith("www.")) {
      parsed.hostname = parsed.hostname.slice(4);
    }
    // Drop fragment
    parsed.hash = "";
    // Reconstruct without fragment
    let normalized = parsed.toString();
    // Strip trailing slash
    if (normalized.endsWith("/")) {
      normalized = normalized.slice(0, -1);
    }
    return normalized;
  } catch {
    return "";
  }
}

// Compute stable source identity for proof counting. Returns "" for missing
// identity, which must never satisfy proof.
export function sourceIdentity(input: {
  sourceClass: SourceClass;
  url?: string;
  recordRef?: string;
}): string {
  if (input.sourceClass === "company_record") {
    const ref = input.recordRef?.trim();
    return ref ? `record:${ref}` : "";
  }
  if (input.sourceClass === "public_web") {
    const normalized = normalizePublicUrl(input.url ?? "");
    return normalized ? `url:${normalized}` : "";
  }
  return "";
}

export function createWorkContract(input: {
  assignment: string;
  idempotencyScope: string;
  worker: WorkerSpec;
  sourceProofs: SourceProof[];
  resultRequirements?: Partial<WorkContract["resultRequirements"]>;
  /** Serial: exact verified acquisition evidence IDs this action may consume. */
  inputEvidenceIds?: string[];
  /** Serial: exact artifact key this writing action may mutate. */
  targetArtifactKey?: string | null;
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
  if (!input.sourceProofs.length)
    throw new Error("A work contract requires at least one source proof");
  
  // Derive requiredSourceClasses and minObservations from sourceProofs
  const requiredSourceClasses = Array.from(
    new Set(input.sourceProofs.map((proof) => proof.sourceClass))
  );
  const minObservations = input.sourceProofs.reduce(
    (sum, proof) => sum + proof.minDistinctSources,
    0
  );

  // Serial contracts persist inputEvidenceIds and/or targetArtifactKey. Align
  // resultRequirements with the serial submit_result schema: empty risks /
  // unknowns arrays are valid when warranted; missing arrays are not.
  const serialEnvelope =
    input.inputEvidenceIds !== undefined ||
    input.targetArtifactKey !== undefined;

  return {
    assignment,
    idempotencyScope: input.idempotencyScope,
    workerKey: input.worker.workerKey,
    capabilityKeys: input.worker.capabilityKeys,
    allowedToolPermissions: [...input.worker.allowedToolPermissions],
    requiredSourceClasses,
    minObservations,
    sourceProofs: [...input.sourceProofs],
    requiredVerifiedEffectKeys: [],
    approvalVersion: null,
    resultRequirements: {
      summary: true,
      fit: true,
      risks: true,
      unknowns: true,
      recommendedNextAction: true,
      ...(serialEnvelope ? { allowEmptyRisksUnknowns: true } : {}),
      ...input.resultRequirements,
    },
    ...(input.inputEvidenceIds !== undefined
      ? { inputEvidenceIds: [...input.inputEvidenceIds] }
      : {}),
    ...(input.targetArtifactKey !== undefined
      ? { targetArtifactKey: input.targetArtifactKey }
      : {}),
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
//
// Blocker A fix: only application_observation evidence counts toward proof.
// Blocker B fix: count distinct sourceId values per sourceClass, not raw rows.
export function evaluateCompletion(input: {
  contract: WorkContract;
  evidence: EvidenceRecord[];
  result: ActivityResult | null;
  verifiedEffects?: { key: string; status: string }[];
  /** When set, only a structured result submitted by THIS run counts. A prior
   * run's result may remain on the objective as context but cannot complete. */
  currentRunId?: string;
}): CompletionCheck {
  const unmet: string[] = [];
  const { contract, evidence } = input;

  // Bind active results to run identity: an unbound or foreign runId is not
  // this run's submission, even if the objective still holds the old payload.
  const result =
    input.currentRunId &&
    (!input.result || input.result.runId !== input.currentRunId)
      ? null
      : input.result;

  // Filter to application observations only (Blocker A). Coverage/absence
  // diagnostics are application facts but never satisfy source proofs.
  const applicationObservations = evidence.filter(
    (item) =>
      item.origin === "application_observation" &&
      !isNotAvailableObservation(item) &&
      !isInvalidRequestObservation(item),
  );

  // Check each source proof requirement (Blocker B)
  for (const proof of contract.sourceProofs) {
    const distinctSourceIds = new Set<string>();
    for (const item of applicationObservations) {
      if (item.sourceClass === proof.sourceClass && item.sourceId) {
        distinctSourceIds.add(item.sourceId);
      }
    }
    const count = distinctSourceIds.size;
    if (count < proof.minDistinctSources) {
      unmet.push(
        `${proof.sourceClass}: found ${count} distinct source(s), required ${proof.minDistinctSources}`
      );
    }
  }

  if (contract.resultRequirements.summary && !result?.summary?.trim())
    unmet.push("Structured result missing a summary");
  if (contract.resultRequirements.fit && !result?.fit?.trim())
    unmet.push("Structured result missing the fit assessment");
  if (contract.resultRequirements.risks) {
    if (!Array.isArray(result?.risks)) {
      unmet.push("Structured result missing risks");
    } else if (
      result.risks.length === 0 &&
      !contract.resultRequirements.allowEmptyRisksUnknowns
    ) {
      unmet.push("Structured result missing risks");
    }
  }
  if (contract.resultRequirements.unknowns) {
    if (!Array.isArray(result?.unknowns)) {
      unmet.push("Structured result missing unknowns");
    } else if (
      result.unknowns.length === 0 &&
      !contract.resultRequirements.allowEmptyRisksUnknowns
    ) {
      unmet.push("Structured result missing unknowns");
    }
  }
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
