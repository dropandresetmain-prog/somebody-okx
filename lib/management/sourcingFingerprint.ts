/**
 * Deterministic sourcing-epoch fingerprint.
 *
 * A sourcing decision (MAKE-vs-BUY for one Requirement) is reused when the
 * material decision-state fingerprint is unchanged. A new material fingerprint
 * opens a new sourcing epoch (and may call Jev again when 2+ options eligible).
 *
 * Deliberately EXCLUDES:
 *   - UI refresh / liveness heartbeats
 *   - payment lifecycle advancing on an already-selected BUY
 *   - founder granting approval for the exact already-selected option
 *   - identical state replay
 */

import { sha256Hex } from "./sha256";

export type SourcingFingerprintInput = {
  requirementKey: string;
  contractRevision: number;
  requirementRevision: number;
  requiredResourceClasses: readonly string[];
  /** Accepted NEEDS_INPUT / validated ResourceNeed identity for this req. */
  validatedNeedIdentity: readonly string[];
  /** MAKE attempt outcomes / exhausted slots that reopen sourcing. */
  makeAttemptState: string;
  workerAttemptSlotsRemaining: number | null;
  /** Verified acquisition identity for this req+revision. */
  verifiedAcquisitionIdentity: readonly string[];
  /** Semantic/final review reopen marker when present. */
  reviewReopenIdentity: string | null;
  /** Material market option availability/terms (offeringId:price:eligible bit). */
  marketOptionIdentity: readonly string[];
};

export function computeSourcingFingerprint(
  input: SourcingFingerprintInput,
): string {
  const parts = [
    input.requirementKey,
    String(input.contractRevision),
    String(input.requirementRevision),
    [...input.requiredResourceClasses].map((c) => c.toLowerCase()).sort().join(","),
    [...input.validatedNeedIdentity].sort().join("|"),
    input.makeAttemptState,
    input.workerAttemptSlotsRemaining == null
      ? "na"
      : String(input.workerAttemptSlotsRemaining),
    [...input.verifiedAcquisitionIdentity].sort().join("|"),
    input.reviewReopenIdentity ?? "none",
    [...input.marketOptionIdentity].sort().join("|"),
  ];
  return sha256Hex(parts.join("\u0000")).slice(0, 32);
}

/**
 * Infer the sourcing-epoch trigger from material facts that changed.
 * Defaults to requirement_ready when no stronger signal is present.
 */
export function inferSourcingTrigger(input: {
  hasValidatedNeed: boolean;
  makeFailed: boolean;
  attemptsExhausted: boolean;
  acquisitionVerified: boolean;
  reviewReopen: boolean;
}): import("./sourcingDecision").SourcingDecisionTrigger {
  if (input.reviewReopen) return "review_reopen";
  if (input.acquisitionVerified) return "acquisition_verified";
  if (input.attemptsExhausted) return "attempts_exhausted";
  if (input.makeFailed) return "make_failed";
  if (input.hasValidatedNeed) return "needs_input";
  return "requirement_ready";
}
