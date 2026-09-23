import type { GroundedOption } from "../../types";
import { knownTotalMinutes } from "./dominanceAudit";

export type DataQualityIssue = {
  optionId: string;
  kind: "DATA_QUALITY";
  code: "external_advantage_speed_vs_timing" | "external_advantage_other_unverified";
  detail: string;
  /** Application does not define field precedence in code; documented as ambiguous. */
  authoritativeField: "none_documented" | "explicit_timing_facts";
};

/**
 * V7 does not document precedence between `externalAdvantage` and measured
 * timing facts in decision.ts/options.ts. Flag contradictions; do not pick a winner.
 */
export function auditOptionDataQuality(
  option: GroundedOption,
  competitors: readonly GroundedOption[],
): DataQualityIssue[] {
  const issues: DataQualityIssue[] = [];
  const adv = option.facts.externalAdvantage?.value;
  if (adv === "speed") {
    const selfMinutes = knownTotalMinutes(option);
    if (selfMinutes !== null) {
      for (const other of competitors) {
        if (other.optionId === option.optionId) continue;
        const otherMinutes = knownTotalMinutes(other);
        if (otherMinutes !== null && selfMinutes > otherMinutes) {
          issues.push({
            optionId: option.optionId,
            kind: "DATA_QUALITY",
            code: "external_advantage_speed_vs_timing",
            detail:
              `externalAdvantage=speed but known total minutes ${selfMinutes} > competitor ${other.optionId} ${otherMinutes}.`,
            authoritativeField: "none_documented",
          });
        }
      }
    }
  }
  return issues;
}

export function auditEligibleDataQuality(eligible: readonly GroundedOption[]): DataQualityIssue[] {
  const all: DataQualityIssue[] = [];
  for (const option of eligible) {
    all.push(...auditOptionDataQuality(option, eligible));
  }
  return all;
}
