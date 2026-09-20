// Application-owned missing-input validation.
//
// A worker may PROPOSE that a required input is missing. Only this module may
// promote that proposal into authoritative ResourceNeed truth that affects
// MAKE/BUY eligibility. Failure modes (timeout, malformed output, bad refs)
// never invent a resource class.

import { createHash } from "node:crypto";
import {
  RESOURCE_CLASSES,
  isOwnedResourceClass,
} from "../workforce/catalog";
import type { ResourceClass } from "../workforce/types";
import {
  createResourceNeed,
  dedupeResourceNeeds,
  transitionNeedStatus,
  type ResourceNeed,
} from "./resourceNeed";
import type { EvidenceRecord, SourceProof } from "./types";

const KNOWN_CLASSES = new Set<string>(RESOURCE_CLASSES.map((r) => r.class));

export function isGovernedResourceClass(value: string): value is ResourceClass {
  return KNOWN_CLASSES.has(value);
}

export function isExternalResourceClass(value: string): boolean {
  return isGovernedResourceClass(value) && !isOwnedResourceClass(value);
}

/** Worker proposal — untrusted until validateMissingInputProposal accepts it. */
export type MissingInputProposal = {
  inputCheckId: string;
  resourceClass: string;
  purpose: string;
  reasonOwnedInsufficient: string;
  supportingEvidenceIds: readonly string[];
};

export type InputObligationKind =
  | "required_resource_class"
  | "evidence_sufficiency";

export type InputObligation = {
  inputCheckId: string;
  kind: InputObligationKind;
  resourceClass: ResourceClass | null;
  purpose: string;
};

export type UnconfirmedInputFinding = {
  id: string;
  objectiveKey: string;
  requirementKey: string | null;
  runId: string;
  resourceClass: string | null;
  purpose: string;
  reason: string;
  refusalCode: string;
  createdAt: number;
};

export type ValidateMissingInputContext = {
  objectiveKey: string;
  requirementKey: string;
  contractRevision: number;
  runId: string;
  workItemId: string | null;
  /** Declared on the current Requirement (may be empty initially). */
  requiredResourceClasses: readonly string[];
  mustBeTrue: string;
  expectedOutput: string | null;
  /** Work-contract evidence obligations (source proofs). */
  sourceProofs: readonly SourceProof[];
  requiredSourceClasses: readonly string[];
  /** Company-controlled inventory classes. */
  controlledResourceClasses: readonly string[];
  /** Evidence for this objective; supporting ids must resolve here. */
  evidence: readonly EvidenceRecord[];
  existingNeeds: readonly ResourceNeed[];
  at: number;
  needId: string;
};

export type ValidateMissingInputResult =
  | {
      ok: true;
      need: ResourceNeed;
      created: boolean;
      obligation: InputObligation;
    }
  | {
      ok: false;
      refusalCode: string;
      detail: string;
      unconfirmed: UnconfirmedInputFinding;
    };

const PROOF_ORIGIN = "application_observation";

/** Build obligations the application already accepts for this Requirement. */
export function listInputObligations(input: {
  requiredResourceClasses: readonly string[];
  sourceProofs: readonly SourceProof[];
  mustBeTrue: string;
  expectedOutput: string | null;
}): InputObligation[] {
  const out: InputObligation[] = [];
  for (const cls of input.requiredResourceClasses) {
    if (!isGovernedResourceClass(cls)) continue;
    out.push({
      inputCheckId: `req_class:${cls}`,
      kind: "required_resource_class",
      resourceClass: cls,
      purpose: `Requirement declares required input class ${cls}`,
    });
  }
  // Evidence-sufficiency obligation: obtain accepted evidence for the decision.
  // Present whenever the work contract requires observations. Does not itself
  // name an external class — the worker proposes which external class fills it.
  if (input.sourceProofs.length > 0) {
    const purpose =
      (input.expectedOutput && input.expectedOutput.trim()) ||
      (input.mustBeTrue && input.mustBeTrue.trim()) ||
      "obtain sufficient accepted evidence for the requirement";
    out.push({
      inputCheckId: "evidence_sufficiency",
      kind: "evidence_sufficiency",
      resourceClass: null,
      purpose: purpose.slice(0, 500),
    });
  }
  return out;
}

function ownedEvidenceCoversProofs(
  evidence: readonly EvidenceRecord[],
  sourceProofs: readonly SourceProof[],
  runId: string,
): boolean {
  if (sourceProofs.length === 0) return true;
  const ownedObs = evidence.filter(
    (item) =>
      item.runId === runId &&
      item.origin === PROOF_ORIGIN &&
      (item.sourceClass === "company_record" || item.sourceClass === "public_web"),
  );
  for (const proof of sourceProofs) {
    const matching = ownedObs.filter((item) => item.sourceClass === proof.sourceClass);
    // Distinct identity: recordRef/url when present, else evidence id.
    const distinct = new Set(
      matching.map((item) => item.recordRef ?? item.url ?? item.id),
    );
    if (distinct.size < proof.minDistinctSources) return false;
    // Empty / explicitly-absent content does not cover the obligation.
    const usable = matching.filter((item) => {
      const text = (item.text ?? "").trim().toLowerCase();
      if (!text) return false;
      if (text.includes("not found") || text.includes("no such record")) return false;
      if (text.includes("empty") && text.length < 80) return false;
      if (text.includes("zero usable") || text.includes("no usable")) return false;
      return text.length >= 8;
    });
    if (usable.length < proof.minDistinctSources) return false;
  }
  return true;
}

function resolveObligation(
  proposal: MissingInputProposal,
  obligations: readonly InputObligation[],
): InputObligation | null {
  const byId = obligations.find((o) => o.inputCheckId === proposal.inputCheckId);
  if (byId) {
    if (
      byId.kind === "required_resource_class" &&
      byId.resourceClass &&
      byId.resourceClass !== proposal.resourceClass
    )
      return null;
    return byId;
  }
  // Allow resource-class shorthand when Requirement already declares the class.
  const byClass = obligations.find(
    (o) =>
      o.kind === "required_resource_class" &&
      o.resourceClass === proposal.resourceClass,
  );
  if (byClass) return byClass;
  // Evidence-sufficiency: worker may name any external class to fill the gap.
  if (
    proposal.inputCheckId === "evidence_sufficiency" ||
    proposal.inputCheckId.startsWith("evidence_")
  ) {
    return (
      obligations.find((o) => o.kind === "evidence_sufficiency") ?? null
    );
  }
  return null;
}

/**
 * Validate a worker missing-input proposal. On success returns an authoritative
 * ResourceNeed at status "active". On failure returns at most an unconfirmed
 * diagnostic — NEVER alters MAKE/BUY eligibility.
 */
export function validateMissingInputProposal(
  proposal: MissingInputProposal,
  ctx: ValidateMissingInputContext,
): ValidateMissingInputResult {
  const refuse = (refusalCode: string, detail: string): ValidateMissingInputResult => ({
    ok: false,
    refusalCode,
    detail,
    unconfirmed: {
      id: `diag_${ctx.needId}`,
      objectiveKey: ctx.objectiveKey,
      requirementKey: ctx.requirementKey,
      runId: ctx.runId,
      resourceClass: isGovernedResourceClass(proposal.resourceClass)
        ? proposal.resourceClass
        : null,
      purpose: (proposal.purpose ?? "").slice(0, 500),
      reason: detail.slice(0, 500),
      refusalCode,
      createdAt: ctx.at,
    },
  });

  const purpose = (proposal.purpose ?? "").trim();
  const reasonOwnedInsufficient = (proposal.reasonOwnedInsufficient ?? "").trim();
  if (!purpose || !reasonOwnedInsufficient)
    return refuse("incomplete_proposal", "purpose and reasonOwnedInsufficient are required");

  if (!isGovernedResourceClass(proposal.resourceClass))
    return refuse(
      "unknown_resource_class",
      `resource class ${proposal.resourceClass} is not governed`,
    );

  const resourceClass = proposal.resourceClass;

  // Company already controls this class → no acquisition-relevant gap.
  if (ctx.controlledResourceClasses.includes(resourceClass))
    return refuse(
      "already_owned",
      `resource class ${resourceClass} is already company-controlled`,
    );

  // External acquisition gaps must name an external class. Owned-class
  // "missing" claims are worker reasoning errors, not BUY triggers.
  if (!isExternalResourceClass(resourceClass))
    return refuse(
      "not_external_class",
      `resource class ${resourceClass} is owned vocabulary, not an acquisition gap`,
    );

  const obligations = listInputObligations({
    requiredResourceClasses: ctx.requiredResourceClasses,
    sourceProofs: ctx.sourceProofs,
    mustBeTrue: ctx.mustBeTrue,
    expectedOutput: ctx.expectedOutput,
  });
  if (obligations.length === 0)
    return refuse(
      "no_input_obligation",
      "current Requirement/work contract declares no accepted input obligation",
    );

  const obligation = resolveObligation(proposal, obligations);
  if (!obligation)
    return refuse(
      "obligation_mismatch",
      `proposal inputCheckId=${proposal.inputCheckId} / class=${resourceClass} does not map to an accepted obligation`,
    );

  // Supporting evidence must belong to this run and be application observations.
  const evidenceById = new Map(ctx.evidence.map((e) => [e.id, e]));
  const supportingIds = [...new Set(proposal.supportingEvidenceIds.map(String))].slice(
    0,
    16,
  );
  if (supportingIds.length === 0)
    return refuse(
      "missing_supporting_evidence",
      "validated gaps require supportingEvidenceIds from this run",
    );

  for (const id of supportingIds) {
    const item = evidenceById.get(id);
    if (!item)
      return refuse(
        "foreign_evidence",
        `supporting evidence ${id} is not in this objective context`,
      );
    if (item.runId !== ctx.runId)
      return refuse(
        "foreign_evidence",
        `supporting evidence ${id} belongs to a different run`,
      );
    if (item.origin !== PROOF_ORIGIN)
      return refuse(
        "foreign_evidence",
        `supporting evidence ${id} is not an application observation`,
      );
  }

  // For evidence-sufficiency: owned observations must NOT already cover proofs.
  if (obligation.kind === "evidence_sufficiency") {
    if (
      ownedEvidenceCoversProofs(ctx.evidence, ctx.sourceProofs, ctx.runId)
    )
      return refuse(
        "owned_evidence_sufficient",
        "owned/accepted evidence already covers the work-contract proofs",
      );
  }

  // For declared required class: class must still be uncovered (checked above
  // via controlledResourceClasses). Nothing further.

  const proposed = createResourceNeed({
    id: ctx.needId,
    objectiveKey: ctx.objectiveKey,
    workItemId: ctx.workItemId,
    requirementKey: ctx.requirementKey,
    resourceClass,
    purpose: purpose.slice(0, 500),
    reasonOwnedInsufficient: reasonOwnedInsufficient.slice(0, 500),
    proposedByRunId: ctx.runId,
    at: ctx.at,
    status: "proposed",
    contractRevision: ctx.contractRevision,
    inputCheckId: obligation.inputCheckId,
    supportingEvidenceIds: supportingIds,
    validationAuthority: "application",
  });

  const { need: deduped, created } = dedupeResourceNeeds(ctx.existingNeeds, proposed);

  // Promote to active (authoritative). If dedupe hit an existing active+ need,
  // keep it; if it hit proposed, upgrade.
  let need = deduped;
  if (need.status === "proposed") {
    need = transitionNeedStatus(need, "active", ctx.at);
    // Preserve validation fields from the new proposal when upgrading.
    need = {
      ...need,
      contractRevision: ctx.contractRevision,
      inputCheckId: obligation.inputCheckId,
      supportingEvidenceIds: supportingIds,
      validationAuthority: "application",
      purpose: purpose.slice(0, 500),
      reasonOwnedInsufficient: reasonOwnedInsufficient.slice(0, 500),
      updatedAt: ctx.at,
    };
  } else if (
    need.status === "active" ||
    need.status === "sourcing" ||
    need.status === "buy_pending"
  ) {
    // Already authoritative — idempotent.
    need = {
      ...need,
      supportingEvidenceIds: [
        ...new Set([...(need.supportingEvidenceIds ?? []), ...supportingIds]),
      ].slice(0, 16),
      updatedAt: ctx.at,
    };
  }

  return { ok: true, need, created: created || need.id === ctx.needId, obligation };
}

/** Needs that are hard eligibility facts (exclude unsupported MAKE). */
export function isValidatedInputGap(need: ResourceNeed): boolean {
  if (need.requirementKey == null) return false;
  if (need.validationAuthority !== "application") {
    // Legacy: treat active+/buy_pending scoped needs as validated if they were
    // promoted through the old path; proposed never counts.
    return (
      need.status === "active" ||
      need.status === "sourcing" ||
      need.status === "buy_pending"
    );
  }
  return (
    need.status === "active" ||
    need.status === "sourcing" ||
    need.status === "buy_pending"
  );
}

/** Material decision-input fingerprint — no timestamps or model wording. */
export function computeDecisionInputFingerprint(input: {
  requirementKey: string;
  contractRevision: number;
  requiredResourceClasses: readonly string[];
  validatedMissingClasses: readonly string[];
  prerequisiteStates: readonly string[];
  eligibleOfferingIds: readonly string[];
  spendAuthorityUsd: number | null;
  budgetRemainingUsd: number | null;
}): string {
  const parts = [
    input.requirementKey,
    String(input.contractRevision),
    [...input.requiredResourceClasses].map((s) => s.toLowerCase()).sort().join(","),
    [...input.validatedMissingClasses].map((s) => s.toLowerCase()).sort().join(","),
    [...input.prerequisiteStates].map((s) => s.toLowerCase()).sort().join(","),
    [...input.eligibleOfferingIds].map((s) => s.toLowerCase()).sort().join(","),
    input.spendAuthorityUsd == null ? "na" : String(input.spendAuthorityUsd),
    input.budgetRemainingUsd == null ? "na" : String(input.budgetRemainingUsd),
  ];
  return createHash("sha256").update(parts.join("\u0000")).digest("hex").slice(0, 32);
}

export type DeliveryFailureClass = "INPUT_BLOCKED" | "EXECUTION_FAILED";

export function classifyDeliveryFailure(input: {
  hasValidatedInputGap: boolean;
  failureReason?: string | null;
}): DeliveryFailureClass {
  if (input.hasValidatedInputGap) return "INPUT_BLOCKED";
  return "EXECUTION_FAILED";
}
