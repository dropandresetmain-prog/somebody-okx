import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { correctReferenceLabel } from "../../lib/management/jev/eval/dominanceAudit";
import { auditEligibleDataQuality } from "../../lib/management/jev/eval/dataQuality";
import { buildDiscriminationVariants } from "../../lib/management/jev/eval/discriminationVariants";
import type { EvalCase } from "../../lib/management/jev/eval/types";

const outDir = path.resolve(process.cwd(), "docs/work/jev-v7-discrimination");
mkdirSync(outDir, { recursive: true });

const j3Cases = JSON.parse(
  readFileSync(path.resolve(process.cwd(), "docs/work/jev-v7-shadow/cases.json"), "utf8"),
) as EvalCase[];

const multi = j3Cases.filter(
  (c) => c.caseShape === "MULTI_CANDIDATE_CLEAR" || c.caseShape === "MULTI_CANDIDATE_AMBIGUOUS",
);

const labelAudits = multi.map((c) => {
  const corrected = correctReferenceLabel(c.eligible, c.reference);
  const dataQuality = auditEligibleDataQuality(c.eligible);
  return {
    caseId: c.caseId,
    corpusSource: c.corpusSource,
    original: {
      kind: c.reference.kind,
      expectedOptionId: c.reference.expectedOptionId,
      notes: c.reference.notes,
    },
    corrected: {
      kind: corrected.correctedKind,
      expectedOptionId: corrected.correctedExpected,
      rationale: corrected.rationale,
      paretoFront: corrected.audit.paretoFront,
      dominatorOptionId: corrected.audit.dominatorOptionId,
    },
    dataQualityIssues: dataQuality,
    pairwiseDominanceNotes: corrected.audit.pairwiseNotes,
  };
});

const variants = buildDiscriminationVariants(j3Cases.filter((c) => c.corpusSource === "REAL"));

const correctedCases: EvalCase[] = j3Cases.map((c) => {
  const audit = labelAudits.find((a) => a.caseId === c.caseId);
  if (!audit) return c;
  return {
    ...c,
    reference: {
      kind: audit.corrected.kind as EvalCase["reference"]["kind"],
      expectedOptionId: audit.corrected.expectedOptionId,
      notes: `[J3.1 corrected] ${audit.corrected.rationale}`,
    },
    caseShape:
      c.eligible.length <= 1
        ? "ONE_CANDIDATE"
        : audit.corrected.kind === "DETERMINISTIC_DOMINANCE"
          ? "MULTI_CANDIDATE_CLEAR"
          : "MULTI_CANDIDATE_AMBIGUOUS",
  };
});

writeFileSync(path.join(outDir, "label-audit.json"), JSON.stringify(labelAudits, null, 2));
writeFileSync(
  path.join(outDir, "corrected-real-cases.json"),
  JSON.stringify(correctedCases, null, 2),
);
writeFileSync(
  path.join(outDir, "discrimination-cases.json"),
  JSON.stringify(variants, null, 2),
);
writeFileSync(
  path.join(outDir, "eval-corpus.json"),
  JSON.stringify([...correctedCases.filter((c) => c.eligible.length > 1), ...variants], null, 2),
);

console.error(
  `[build-audit] multi audits=${labelAudits.length} variants=${variants.length} → ${outDir}`,
);
