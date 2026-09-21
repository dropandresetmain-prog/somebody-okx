// Application-owned missing-input validation.
//
// A worker may PROPOSE that a required input is missing. Only this module may
// promote that proposal into authoritative ResourceNeed truth that affects
// MAKE/BUY eligibility. Failure modes (timeout, malformed output, bad refs)
// never invent a resource class.

import { sha256Hex } from "../management/sha256";
import {
  RESOURCE_CLASSES,
  isOwnedResourceClass,
} from "../workforce/catalog";
import type { ResourceClass } from "../workforce/types";
import {
  checkInputAvailability,
  isInvalidRequestObservation,
  isNotAvailableObservation,
  type ScopedAcquisitionCoverage,
} from "./inputAvailability";
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
  /**
   * Serial semantic adequacy gap: owned sources were inspected but are
   * insufficient for the business question. Does NOT require a NOT_AVAILABLE
   * token. Literal missing access continues to use availability checks.
   */
  semanticAdequacyGap?: boolean;
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

/**
 * Verified acquisition identity that a worker may cite when explaining what
 * acquired evidence does or does not establish. Distinct from:
 * - permitted worker input (loaded package / inputEvidenceIds);
 * - proof that satisfies a Requirement (completion gate).
 * Citation never implies requirement satisfaction.
 */
export type CiteableAcquisition = {
  resultEvidenceId: string;
  requirementKey: string;
  contractRevision: number;
  resourceClass: string;
  verifiedAt?: number | null;
  needDedupeKey?: string | null;
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
  /** Verified acquisitions that may already cover this obligation. */
  acquisitions?: readonly ScopedAcquisitionCoverage[];
  /**
   * Same-Objective acquisitions that may be cited by resultEvidenceId.
   * Caller must only include rows belonging to this Objective.
   */
  citeableAcquisitions?: readonly CiteableAcquisition[];
  /**
   * When an array (including empty), serial linkage is required: cited
   * acquisition ids must appear here. When null/undefined, legacy callers
   * may cite any id present in citeableAcquisitions.
   */
  linkedInputEvidenceIds?: readonly string[] | null;
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
      (item.sourceClass === "company_record" || item.sourceClass === "public_web") &&
      !isNotAvailableObservation(item) &&
      !isInvalidRequestObservation(item),
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

  // evidence_sufficiency: application owns the ResourceNeed purpose from the
  // Requirement/Outcome Contract (mustBeTrue / expectedOutput). Worker free-text
  // may refine diagnostics but must not become a stronger mandatory success
  // condition or a new eligibility/dedupe identity.
  const workerPurpose = purpose;
  let authoritativePurpose = workerPurpose;
  let authoritativeReason = reasonOwnedInsufficient;
  if (obligation.kind === "evidence_sufficiency") {
    authoritativePurpose = obligation.purpose;
    if (
      workerPurpose.length > 0 &&
      workerPurpose.toLowerCase() !== authoritativePurpose.toLowerCase()
    ) {
      authoritativeReason =
        `${authoritativeReason} | Worker-proposed question (non-authoritative for eligibility): ${workerPurpose}`.slice(
          0,
          500,
        );
    }
  }

  // Already-covered Requirement-scoped obligation must not reacquire —
  // but only when the SAME question/purpose is already answered. Same resource
  // class alone must not suppress a different validated question.
  if (
    obligationAlreadyCovered({
      requirementKey: ctx.requirementKey,
      contractRevision: ctx.contractRevision,
      resourceClass,
      purpose: authoritativePurpose,
      existingNeeds: ctx.existingNeeds,
      acquisitions: ctx.acquisitions ?? [],
    })
  ) {
    return refuse(
      "already_covered",
      `requirement ${ctx.requirementKey} already has verified coverage for this question (${resourceClass})`,
    );
  }

  // Supporting evidence: same-run application observations, OR linked verified
  // acquisitions from this Objective (citeable identity — not Requirement proof).
  const evidenceById = new Map(ctx.evidence.map((e) => [e.id, e]));
  const citeableById = new Map(
    (ctx.citeableAcquisitions ?? []).map((a) => [a.resultEvidenceId, a]),
  );
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
    if (item) {
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
      // Invalid lookups are never scarcity evidence.
      if (isInvalidRequestObservation(item))
        return refuse(
          "invalid_reference_evidence",
          `supporting evidence ${id} is INVALID_REQUEST, not NOT_AVAILABLE`,
        );
      continue;
    }

    const acquisition = citeableById.get(id);
    if (!acquisition)
      return refuse(
        "foreign_evidence",
        `supporting evidence ${id} is not in this objective context`,
      );
    if (acquisition.verifiedAt == null)
      return refuse(
        "unverified_acquisition",
        `supporting evidence ${id} is an unverified acquisition`,
      );
    if (acquisition.contractRevision !== ctx.contractRevision)
      return refuse(
        "wrong_contract_revision",
        `supporting evidence ${id} belongs to contract revision ${acquisition.contractRevision}, not ${ctx.contractRevision}`,
      );
    // Serial linkage required when the action declares inputEvidenceIds.
    if (ctx.linkedInputEvidenceIds !== undefined && ctx.linkedInputEvidenceIds !== null) {
      if (!ctx.linkedInputEvidenceIds.includes(id))
        return refuse(
          "foreign_evidence",
          `supporting evidence ${id} is not linked to this action (inputEvidenceIds)`,
        );
    }
  }

  // Authoritative literal scarcity requires at least one NOT_AVAILABLE check.
  // Serial semantic adequacy gaps may cite inspected application observations
  // and/or linked verified acquisitions without manufacturing a NOT_AVAILABLE token.
  const semanticGap = proposal.semanticAdequacyGap === true;
  const notAvailableSupport = supportingIds.filter((id) => {
    const item = evidenceById.get(id);
    return item ? isNotAvailableObservation(item) : false;
  });
  if (!semanticGap && notAvailableSupport.length === 0)
    return refuse(
      "missing_not_available_evidence",
      "validated gaps require supportingEvidenceIds from a governed NOT_AVAILABLE input check",
    );

  // Semantic gap + linked verified acquisition of the proposed class already on
  // this action: additional confidence is optional, not a new mandatory success
  // condition. Distinct required questions without such a link remain admissible.
  if (
    semanticGap &&
    obligation.kind === "evidence_sufficiency" &&
    hasLinkedVerifiedAcquisitionOfClass(ctx, resourceClass)
  ) {
    return refuse(
      "optional_unknown_not_mandatory",
      "a linked verified acquisition of this class is already available for this action; residual uncertainty must be disclosed as unknowns and must not create a new mandatory ResourceNeed",
    );
  }

  // Live coverage must still be NOT_AVAILABLE for literal scarcity.
  // Semantic adequacy may proceed when sources were inspected (AVAILABLE/UNREAD
  // handled below) but are argued insufficient for the question.
  const liveObligations = listInputObligations({
    requiredResourceClasses: ctx.requiredResourceClasses,
    sourceProofs: ctx.sourceProofs,
    mustBeTrue: ctx.mustBeTrue,
    expectedOutput: ctx.expectedOutput,
  });
  const live = checkInputAvailability({
    inputCheckId: obligation.inputCheckId,
    obligations: liveObligations,
    sourceProofs: ctx.sourceProofs,
    controlledResourceClasses: ctx.controlledResourceClasses,
    evidence: ctx.evidence,
    runId: ctx.runId,
    requirementKey: ctx.requirementKey,
    contractRevision: ctx.contractRevision,
    acquisitions: ctx.acquisitions ?? [],
  });
  if (!semanticGap) {
    if (live.status === "AVAILABLE")
      return refuse(
        "owned_evidence_sufficient",
        "owned/accepted evidence already covers the work-contract proofs",
      );
    if (live.status === "UNREAD")
      return refuse(
        "owned_inputs_unread",
        "owned catalog inputs exist but have not been inspected yet; unread is not scarcity",
      );
    if (live.status !== "NOT_AVAILABLE")
      return refuse(
        "coverage_not_scarce",
        `live coverage status ${live.status} does not authorize a missing-input gap`,
      );
  } else {
    // Semantic gap: refuse if literally unread (must inspect first) or if
    // verified coverage already exists for this scoped class.
    if (live.status === "UNREAD")
      return refuse(
        "owned_inputs_unread",
        "owned catalog inputs exist but have not been inspected yet; unread cannot ground a semantic gap",
      );
  }

  const proposed = createResourceNeed({
    id: ctx.needId,
    objectiveKey: ctx.objectiveKey,
    workItemId: ctx.workItemId,
    requirementKey: ctx.requirementKey,
    resourceClass,
    purpose: authoritativePurpose.slice(0, 500),
    reasonOwnedInsufficient: authoritativeReason.slice(0, 500),
    proposedByRunId: ctx.runId,
    at: ctx.at,
    status: "proposed",
    contractRevision: ctx.contractRevision,
    inputCheckId: obligation.inputCheckId,
    supportingEvidenceIds: supportingIds,
    validationAuthority: "application",
  });

  const { need: deduped, created } = dedupeResourceNeeds(ctx.existingNeeds, proposed);

  // Fulfilled / already-covered dedupe hit → refuse reacquisition.
  if (!created && deduped.status === "fulfilled") {
    return refuse(
      "already_covered",
      `equivalent ResourceNeed ${deduped.id} is already fulfilled for this obligation`,
    );
  }

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
      purpose: authoritativePurpose.slice(0, 500),
      reasonOwnedInsufficient: authoritativeReason.slice(0, 500),
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

/**
 * True when this serial action already has a linked verified acquisition of
 * the proposed class. Residual semantic uncertainty is then optional for
 * completion rather than a new mandatory ResourceNeed. Legacy callers that
 * omit linkedInputEvidenceIds are unaffected.
 */
function hasLinkedVerifiedAcquisitionOfClass(
  ctx: ValidateMissingInputContext,
  resourceClass: string,
): boolean {
  const linked = ctx.linkedInputEvidenceIds;
  if (linked === undefined || linked === null) return false;
  for (const acquisition of ctx.citeableAcquisitions ?? []) {
    if (acquisition.verifiedAt == null) continue;
    if (acquisition.contractRevision !== ctx.contractRevision) continue;
    if (acquisition.resourceClass !== resourceClass) continue;
    if (!linked.includes(acquisition.resultEvidenceId)) continue;
    return true;
  }
  return false;
}

/**
 * Current unresolved validated gap — never inferred from historical
 * lastDeliveryFailureClass alone.
 */
export function currentUnresolvedValidatedGap(
  needs: readonly ResourceNeed[],
  acquisitions: readonly {
    requirementKey: string;
    contractRevision: number;
    resourceClass: string | null;
    verifiedAt?: number | null;
  }[] = [],
  opts: { runId?: string | null } = {},
): ResourceNeed | null {
  for (const need of needs) {
    if (!isValidatedInputGap(need)) continue;
    if (opts.runId != null && need.proposedByRunId !== opts.runId) continue;
    if (acquisitions.some((acquisition) => verifiedAcquisitionCoversNeed(need, acquisition))) {
      continue;
    }
    return need;
  }
  return null;
}

/** Requirement-scoped obligation already satisfied for THIS question/purpose. */
export function obligationAlreadyCovered(input: {
  requirementKey: string;
  contractRevision: number;
  resourceClass: string;
  /** Purpose/question of the NEW proposal — distinguishes same-class needs. */
  purpose?: string | null;
  needDedupeKey?: string | null;
  existingNeeds: readonly ResourceNeed[];
  acquisitions: readonly ScopedAcquisitionCoverage[];
}): boolean {
  const purposeNorm = (input.purpose ?? "").trim().toLowerCase();
  const proposalDedupe = input.needDedupeKey ?? null;
  const hasQuestionIdentity = purposeNorm.length > 0 || proposalDedupe != null;

  const sameQuestionAs = (need: ResourceNeed): boolean => {
    if (proposalDedupe != null && need.dedupeKey === proposalDedupe) return true;
    if (
      purposeNorm.length > 0 &&
      need.purpose.trim().toLowerCase() === purposeNorm
    ) {
      return true;
    }
    return false;
  };

  for (const need of input.existingNeeds) {
    if (need.requirementKey !== input.requirementKey) continue;
    if (need.resourceClass !== input.resourceClass) continue;
    if (
      need.contractRevision != null &&
      need.contractRevision !== input.contractRevision
    ) {
      continue;
    }
    if (hasQuestionIdentity && !sameQuestionAs(need)) continue;

    if (need.status === "fulfilled") {
      if (!hasQuestionIdentity || sameQuestionAs(need)) return true;
      continue;
    }
    if (
      (need.status === "active" ||
        need.status === "sourcing" ||
        need.status === "buy_pending") &&
      input.acquisitions.some((acquisition) =>
        verifiedAcquisitionCoversNeed(need, acquisition),
      )
    ) {
      return true;
    }
  }

  // Distinct question identity: never cover from bare class acquisition alone.
  if (hasQuestionIdentity) return false;

  // Legacy callers with no purpose: class-level acquisition may cover.
  return input.acquisitions.some(
    (acquisition) =>
      acquisition.verifiedAt != null &&
      acquisition.requirementKey === input.requirementKey &&
      acquisition.contractRevision === input.contractRevision &&
      acquisition.resourceClass === input.resourceClass,
  );
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

/**
 * Scoped coverage: a verified acquisition supplies one need only when
 * requirement, contract revision (when the need recorded one), resource
 * class, AND purpose identity (needDedupeKey) all match.
 * Same class alone never covers a different question/purpose.
 */
export function verifiedAcquisitionCoversNeed(
  need: ResourceNeed,
  acquisition: {
    requirementKey: string;
    contractRevision: number;
    resourceClass: string | null;
    verifiedAt?: number | null;
    needDedupeKey?: string | null;
  },
): boolean {
  if (acquisition.verifiedAt == null) return false;
  if (need.requirementKey == null) return false;
  if (need.requirementKey !== acquisition.requirementKey) return false;
  if (
    need.contractRevision != null &&
    need.contractRevision !== acquisition.contractRevision
  ) {
    return false;
  }
  if (!acquisition.resourceClass) return false;
  if (need.resourceClass !== acquisition.resourceClass) return false;
  // Purpose identity: when the need has a dedupeKey, the acquisition must
  // carry the matching key. Missing acquisition identity fails closed.
  if (need.dedupeKey) {
    if (!acquisition.needDedupeKey) return false;
    if (acquisition.needDedupeKey !== need.dedupeKey) return false;
  }
  return true;
}

/** Validated gap classes still missing after applying scoped verified acquisitions. */
export function validatedMissingClassesAfterAcquisitions(
  needs: readonly ResourceNeed[],
  requirementKey: string,
  acquisitions: readonly {
    requirementKey: string;
    contractRevision: number;
    resourceClass: string | null;
    verifiedAt?: number | null;
  }[],
): string[] {
  return needs
    .filter(
      (need) =>
        need.requirementKey === requirementKey && isValidatedInputGap(need),
    )
    .filter(
      (need) =>
        !acquisitions.some((acquisition) =>
          verifiedAcquisitionCoversNeed(need, acquisition),
        ),
    )
    .map((need) => need.resourceClass);
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
  return sha256Hex(parts.join("\u0000")).slice(0, 32);
}

export type DeliveryFailureClass = "INPUT_BLOCKED" | "EXECUTION_FAILED";

export function classifyDeliveryFailure(input: {
  hasValidatedInputGap: boolean;
  failureReason?: string | null;
}): DeliveryFailureClass {
  if (input.hasValidatedInputGap) return "INPUT_BLOCKED";
  return "EXECUTION_FAILED";
}
