/**
 * Neutral Pareto-style dominance audit over the FULL eligible set.
 * Null/missing facts are excluded — never treated as zero or worse.
 */
import type { EconomicFacts, FactValue, GroundedOption } from "../../types";
import type { ReferenceLabelKind } from "./types";

export type ComparedDimension =
  | "known_cost_usd"
  | "known_total_minutes"
  | "reliability"
  | "expected_quality"
  | "availability"
  | "reuse_value";

export type DimensionComparison = {
  dimension: ComparedDimension;
  a: string;
  b: string;
  aValue: string;
  bValue: string;
  relation: "a_better" | "b_better" | "tie" | "incomparable";
};

export type DominanceVerdict = {
  dominatorOptionId: string | null;
  /** Options not Pareto-dominated by any other on known dimensions. */
  paretoFront: string[];
  pairwiseNotes: string[];
  dimensionMatrix: DimensionComparison[];
};

const RELIABILITY_RANK: Record<string, number> = {
  unproven: 0,
  proven_once: 1,
  proven_repeatedly: 2,
};
const QUALITY_RANK: Record<string, number> = {
  below_internal: 0,
  unknown: 1,
  comparable: 2,
  above_internal: 3,
};
const AVAILABILITY_RANK: Record<string, number> = {
  unavailable: 0,
  busy: 1,
  free: 2,
};
const REUSE_RANK: Record<string, number> = {
  none: 0,
  some: 1,
  high: 2,
};

function factNum(f: FactValue<number> | null | undefined): number | null {
  if (!f || typeof f.value !== "number") return null;
  return f.value;
}

export function knownCostUsd(option: GroundedOption): number | null {
  const internal = factNum(option.facts.internalCostUsd);
  if (internal !== null) return internal;
  const external = factNum(option.facts.externalPriceUsd);
  if (external !== null) return external;
  if (option.external?.priceUsd != null) return option.external.priceUsd;
  return null;
}

/** Sum only components that are known; null if no time component is known. */
export function knownTotalMinutes(option: GroundedOption): number | null {
  const parts = [
    factNum(option.facts.setupMinutes),
    factNum(option.facts.queueMinutes),
    factNum(option.facts.executionMinutes),
    factNum(option.facts.verificationMinutes),
  ];
  const known = parts.filter((p): p is number => p !== null);
  if (known.length === 0) return null;
  return known.reduce((s, n) => s + n, 0);
}

function rankCompare(
  a: string | null,
  b: string | null,
  rank: Record<string, number>,
): "a_better" | "b_better" | "tie" | "incomparable" {
  if (a === null || b === null) return "incomparable";
  const ra = rank[a];
  const rb = rank[b];
  if (ra === undefined || rb === undefined) return "incomparable";
  if (ra > rb) return "a_better";
  if (rb > ra) return "b_better";
  return "tie";
}

function numericCompare(
  a: number | null,
  b: number | null,
  lowerIsBetter: boolean,
): "a_better" | "b_better" | "tie" | "incomparable" {
  if (a === null || b === null) return "incomparable";
  if (a === b) return "tie";
  if (lowerIsBetter) return a < b ? "a_better" : "b_better";
  return a > b ? "a_better" : "b_better";
}

function compareOptions(a: GroundedOption, b: GroundedOption): DimensionComparison[] {
  const rows: DimensionComparison[] = [];
  const push = (
    dimension: ComparedDimension,
    relation: DimensionComparison["relation"],
    aValue: string,
    bValue: string,
  ) => {
    rows.push({
      dimension,
      a: a.optionId,
      b: b.optionId,
      aValue,
      bValue,
      relation,
    });
  };

  push(
    "known_cost_usd",
    numericCompare(knownCostUsd(a), knownCostUsd(b), true),
    String(knownCostUsd(a) ?? "null"),
    String(knownCostUsd(b) ?? "null"),
  );
  push(
    "known_total_minutes",
    numericCompare(knownTotalMinutes(a), knownTotalMinutes(b), true),
    String(knownTotalMinutes(a) ?? "null"),
    String(knownTotalMinutes(b) ?? "null"),
  );
  push(
    "reliability",
    rankCompare(a.facts.reliability?.value ?? null, b.facts.reliability?.value ?? null, RELIABILITY_RANK),
    a.facts.reliability?.value ?? "null",
    b.facts.reliability?.value ?? "null",
  );
  push(
    "expected_quality",
    rankCompare(
      a.facts.expectedQuality?.value ?? null,
      b.facts.expectedQuality?.value ?? null,
      QUALITY_RANK,
    ),
    a.facts.expectedQuality?.value ?? "null",
    b.facts.expectedQuality?.value ?? "null",
  );
  push(
    "availability",
    rankCompare(a.facts.availability?.value ?? null, b.facts.availability?.value ?? null, AVAILABILITY_RANK),
    a.facts.availability?.value ?? "null",
    b.facts.availability?.value ?? "null",
  );
  push(
    "reuse_value",
    rankCompare(a.facts.reuseValue?.value ?? null, b.facts.reuseValue?.value ?? null, REUSE_RANK),
    a.facts.reuseValue?.value ?? "null",
    b.facts.reuseValue?.value ?? "null",
  );
  return rows;
}

/** A Pareto-dominates B on known dimensions (lower cost/time better; higher rank better). */
export function optionDominates(a: GroundedOption, b: GroundedOption): {
  dominates: boolean;
  strictWin: boolean;
  comparisons: DimensionComparison[];
} {
  const comparisons = compareOptions(a, b);
  let strictWin = false;
  for (const c of comparisons) {
    if (c.relation === "incomparable") continue;
    if (c.relation === "b_better") return { dominates: false, strictWin: false, comparisons };
    if (c.relation === "a_better") strictWin = true;
  }
  return { dominates: strictWin, strictWin, comparisons };
}

export function auditDominance(eligible: readonly GroundedOption[]): DominanceVerdict {
  const pairwiseNotes: string[] = [];
  const dimensionMatrix: DimensionComparison[] = [];
  for (let i = 0; i < eligible.length; i++) {
    for (let j = i + 1; j < eligible.length; j++) {
      const { comparisons } = optionDominates(eligible[i]!, eligible[j]!);
      dimensionMatrix.push(...comparisons);
    }
  }

  const paretoFront: string[] = [];
  for (const candidate of eligible) {
    let dominated = false;
    for (const other of eligible) {
      if (other.optionId === candidate.optionId) continue;
      const { dominates } = optionDominates(other, candidate);
      if (dominates) {
        dominated = true;
        pairwiseNotes.push(`${other.optionId} Pareto-dominates ${candidate.optionId} on known facts`);
        break;
      }
    }
    if (!dominated) paretoFront.push(candidate.optionId);
  }

  let dominatorOptionId: string | null = null;
  if (paretoFront.length === 1) {
    const only = paretoFront[0]!;
    const beatsAll = eligible.every((o) => {
      if (o.optionId === only) return true;
      return optionDominates(
        eligible.find((x) => x.optionId === only)!,
        o,
      ).dominates;
    });
    if (beatsAll) dominatorOptionId = only;
  }

  return { dominatorOptionId, paretoFront, pairwiseNotes, dimensionMatrix };
}

export type CorrectedReference = {
  originalKind: ReferenceLabelKind;
  originalExpected: string | null;
  correctedKind: ReferenceLabelKind;
  correctedExpected: string | null;
  audit: DominanceVerdict;
  rationale: string;
};

export function correctReferenceLabel(
  eligible: readonly GroundedOption[],
  original: { kind: ReferenceLabelKind; expectedOptionId: string | null; notes: string },
): CorrectedReference {
  const audit = auditDominance(eligible);

  if (eligible.length <= 1) {
    return {
      originalKind: original.kind,
      originalExpected: original.expectedOptionId,
      correctedKind: original.kind,
      correctedExpected: original.expectedOptionId,
      audit,
      rationale: "Single-candidate boundary; dominance audit not applicable.",
    };
  }

  if (original.kind === "HUMAN_REVIEW" || original.kind === "AMBIGUOUS") {
    return {
      originalKind: original.kind,
      originalExpected: original.expectedOptionId,
      correctedKind: original.kind,
      correctedExpected: original.expectedOptionId,
      audit,
      rationale: "Preserved subjective/ambiguous J3 label.",
    };
  }

  if (audit.dominatorOptionId) {
    const ok =
      original.expectedOptionId === null || original.expectedOptionId === audit.dominatorOptionId;
    return {
      originalKind: original.kind,
      originalExpected: original.expectedOptionId,
      correctedKind: "DETERMINISTIC_DOMINANCE",
      correctedExpected: audit.dominatorOptionId,
      audit,
      rationale: ok
        ? "Full-set Pareto dominator on known dimensions matches label."
        : `J3 expected ${original.expectedOptionId} but full-set dominator is ${audit.dominatorOptionId}.`,
    };
  }

  return {
    originalKind: original.kind,
    originalExpected: original.expectedOptionId,
    correctedKind: audit.paretoFront.length > 1 ? "HUMAN_REVIEW" : "AMBIGUOUS",
    correctedExpected: null,
    audit,
    rationale:
      original.kind === "DETERMINISTIC_DOMINANCE"
        ? "No option Pareto-dominates entire eligible set on known facts; deterministic label not defensible."
        : "No single dominator.",
  };
}
