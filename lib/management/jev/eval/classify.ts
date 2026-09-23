import type { GroundedOption } from "../../types";
import type {
  CaseShape,
  EvalCase,
  FailureClass,
  IncumbentComparison,
  JevRunRecord,
  ReferenceLabelKind,
} from "./types";

export function caseShapeFor(eligibleCount: number, referenceKind: ReferenceLabelKind): CaseShape {
  if (eligibleCount <= 1) return "ONE_CANDIDATE";
  if (referenceKind === "AMBIGUOUS" || referenceKind === "HUMAN_REVIEW") {
    return "MULTI_CANDIDATE_AMBIGUOUS";
  }
  return "MULTI_CANDIDATE_CLEAR";
}

export function summarizeFacts(eligible: readonly GroundedOption[]): string {
  return eligible
    .map((o) => {
      const price =
        o.external?.priceUsd ??
        o.facts.externalPriceUsd?.value ??
        o.facts.internalCostUsd?.value ??
        null;
      return `${o.optionId.slice(0, 12)}:${o.strategy}/${o.kind} price=${price}`;
    })
    .join("; ");
}

export function probabilityMargin(probabilities: Record<string, number>, choice: string | null): {
  top: number | null;
  runnerUp: number | null;
  margin: number | null;
} {
  const entries = Object.entries(probabilities).sort((a, b) => b[1] - a[1]);
  if (entries.length === 0) return { top: null, runnerUp: null, margin: null };
  const top = entries[0]![1];
  const runnerUp = entries.length > 1 ? entries[1]![1] : null;
  const margin = runnerUp === null ? top : top - runnerUp;
  return { top, runnerUp, margin };
}

export function isConfidentlyWrong(
  record: Pick<JevRunRecord, "matchesReference" | "topProbability" | "margin" | "caseShape">,
): boolean {
  if (record.caseShape === "ONE_CANDIDATE") return false;
  if (record.matchesReference !== false) return false;
  const top = record.topProbability ?? 0;
  const margin = record.margin ?? 0;
  return top >= 0.65 && margin >= 0.2;
}

export function compareToIncumbent(
  referenceExpected: string | null,
  jevId: string | null,
  incumbentId: string | null,
  referenceKind: ReferenceLabelKind,
): IncumbentComparison {
  if (!incumbentId) return "no_incumbent";
  const jevMatchesRef =
    referenceExpected !== null && jevId !== null && jevId === referenceExpected;
  const incMatchesRef =
    referenceExpected !== null && incumbentId === referenceExpected;
  if (referenceKind === "AMBIGUOUS" || referenceKind === "HUMAN_REVIEW") {
    if (jevId === incumbentId) return "agreement_without_independent_truth";
    return "ambiguous_disagreement";
  }
  if (jevMatchesRef && incMatchesRef) return "both_correct";
  if (jevMatchesRef && !incMatchesRef) return "jev_only_correct";
  if (!jevMatchesRef && incMatchesRef) return "incumbent_only_correct";
  if (!jevMatchesRef && !incMatchesRef) return "both_wrong";
  return "agreement_without_independent_truth";
}

export function classifyFailure(
  caseRow: EvalCase,
  record: JevRunRecord,
): FailureClass | null {
  if (record.jevKind !== "selected" || record.matchesReference !== false) return null;
  if (caseRow.reference.kind === "AMBIGUOUS") return "GROUND_TRUTH_AMBIGUOUS";
  if (record.jevKind === "invalid_response" || record.jevKind === "unavailable") {
    return "MODEL_LIMITATION";
  }
  if (caseRow.eligible.some((o) => o.facts.internalCostUsd === null && o.facts.externalPriceUsd === null)) {
    return "MISSING_FACT";
  }
  return "MODEL_LIMITATION";
}

export function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1);
  return sorted[Math.max(0, idx)]!;
}
