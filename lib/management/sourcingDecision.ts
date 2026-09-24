/**
 * First-class SOURCING_DECISION semantics persisted on satisfaction_strategy
 * rows via coarsePlanSummary.extra.sourcingDecision (additive).
 *
 * Compatibility: ManagerialDecision.kind remains "satisfaction_strategy".
 * Probabilities stay evaluation/debug evidence — never founder product state.
 */

export type SourcingSelectionSource =
  | "jev"
  | "sole_eligible"
  | "incumbent_fallback";

export type SourcingDecisionTrigger =
  | "requirement_ready"
  | "needs_input"
  | "make_failed"
  | "attempts_exhausted"
  | "acquisition_verified"
  | "review_reopen";

export type SourcingDecisionExtra = {
  selectionSource: SourcingSelectionSource;
  trigger: SourcingDecisionTrigger;
  /** Material decision-state fingerprint for this sourcing epoch. */
  sourcingFingerprint?: string;
  /** Optional operational telemetry (J4.1) — never authority. */
  telemetry?: SourcingDecisionTelemetry;
};

export type SourcingDecisionTelemetry = {
  jevCallAttempted: boolean;
  eligibleOptionCount: number;
  result:
    | "selected"
    | "sole_eligible"
    | "technical_failure"
    | "bridge_failure"
    | "no_candidates"
    | "skipped_same_fingerprint"
    | "incumbent_fallback";
  latencyMs?: number;
  selectedOptionId?: string | null;
  technicalFallbackUsed?: boolean;
  failureDetail?: string;
};

export function isSourcingSelectionSource(
  value: unknown,
): value is SourcingSelectionSource {
  return (
    value === "jev" || value === "sole_eligible" || value === "incumbent_fallback"
  );
}

export function isSourcingDecisionTrigger(
  value: unknown,
): value is SourcingDecisionTrigger {
  return (
    value === "requirement_ready" ||
    value === "needs_input" ||
    value === "make_failed" ||
    value === "attempts_exhausted" ||
    value === "acquisition_verified" ||
    value === "review_reopen"
  );
}
