import type { AbRunRow } from "./abEval";

export type J31Verdict =
  | "READY_FOR_J4_DISABLED_INTEGRATION"
  | "MORE_DISCRIMINATION_EVIDENCE"
  | "MODEL_NOT_SUITABLE";

export function decideJ31Verdict(baseline: AbRunRow[], neutral: AbRunRow[]): {
  verdict: J31Verdict;
  note: string;
} {
  const cleanDerived = (rows: AbRunRow[]) =>
    rows.filter(
      (r) =>
        r.corpusSource === "REAL_DERIVED_VARIANT" && r.correctedExpected !== null,
    );
  const scored = (rows: AbRunRow[]) =>
    cleanDerived(rows).filter((r) => r.matchesCorrected !== null);
  const rate = (rows: AbRunRow[]) => {
    const s = scored(rows);
    if (s.length === 0) return 0;
    return s.filter((r) => r.matchesCorrected).length / s.length;
  };

  const confidentWrongClean = [...baseline, ...neutral].filter(
    (r) => r.confidentlyWrong && r.corpusSource === "REAL_DERIVED_VARIANT",
  );

  const baseRate = rate(baseline);
  const neutralRate = rate(neutral);

  if (confidentWrongClean.length > 0) {
    return {
      verdict: "MORE_DISCRIMINATION_EVIDENCE",
      note: `Confident wrong on clean derived dominance after label correction: ${confidentWrongClean.map((r) => r.caseId).join(", ")}`,
    };
  }

  if (baseRate >= 0.75 && neutralRate >= 0.75 && scored(baseline).length >= 5) {
    return {
      verdict: "READY_FOR_J4_DISABLED_INTEGRATION",
      note:
        "Clean derived dominance cases pass under both rubrics; proceed to J4 composition behind default-OFF gate only.",
    };
  }

  if (baseRate < 0.4 && neutralRate < 0.4) {
    return {
      verdict: "MODEL_NOT_SUITABLE",
      note: "Both rubrics fail clean dominance discrimination consistently.",
    };
  }

  return {
    verdict: "MORE_DISCRIMINATION_EVIDENCE",
    note: `Derived clean match rates baseline=${baseRate.toFixed(2)} neutral=${neutralRate.toFixed(2)}; expand corpus or refine state before J4.`,
  };
}
