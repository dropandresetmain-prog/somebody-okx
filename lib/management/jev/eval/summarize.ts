import { percentile } from "./classify";
import type { EvalCase, EvalSummary, JevRunRecord } from "./types";

export function buildEvalSummary(
  cases: EvalCase[],
  results: JevRunRecord[],
  meta: { startingSha: string; branch: string },
): EvalSummary {
  const multi = results.filter((r) => r.caseShape !== "ONE_CANDIDATE");
  const single = results.filter((r) => r.caseShape === "ONE_CANDIDATE");
  const latencies = results.map((r) => r.latencyMs).sort((a, b) => a - b);

  const multiCandidateByReference: EvalSummary["multiCandidateByReference"] = {};
  for (const r of multi) {
    const key = r.referenceKind;
    multiCandidateByReference[key] ??= { total: 0, jevMatchesReference: 0, confidentlyWrong: 0 };
    multiCandidateByReference[key].total += 1;
    if (r.matchesReference === true) multiCandidateByReference[key].jevMatchesReference += 1;
    if (r.confidentlyWrong) multiCandidateByReference[key].confidentlyWrong += 1;
  }

  const incumbentComparisons = {} as EvalSummary["incumbentComparisons"];
  for (const r of results) {
    incumbentComparisons[r.incumbentComparison] =
      (incumbentComparisons[r.incumbentComparison] ?? 0) + 1;
  }

  const failuresByClass: Record<string, number> = {};
  for (const r of results) {
    if (!r.failureClass) continue;
    failuresByClass[r.failureClass] = (failuresByClass[r.failureClass] ?? 0) + 1;
  }

  const tokens = results.reduce(
    (acc, r) => ({
      input: acc.input + (r.usage.inputTokens ?? 0),
      output: acc.output + (r.usage.outputTokens ?? 0),
      total: acc.total + (r.usage.totalTokens ?? 0),
    }),
    { input: 0, output: 0, total: 0 },
  );
  const marketCostUsd = results.reduce((sum, r) => sum + (r.marketCostUsd ?? 0), 0);

  const confidentlyWrongCount = results.filter((r) => r.confidentlyWrong).length;
  const multiWithReference = multi.filter((r) => r.expectedOptionId !== null);
  const multiMatchRate =
    multiWithReference.length === 0
      ? null
      : multiWithReference.filter((r) => r.matchesReference === true).length /
        multiWithReference.length;

  let verdict: EvalSummary["verdict"] = "MORE_EVIDENCE_REQUIRED";
  let j4RoutingNote =
    "Shadow eval incomplete or inconclusive; keep Jev gate OFF and expand REAL multi-option corpus.";

  if (
    multi.length >= 5 &&
    confidentlyWrongCount === 0 &&
    (multiMatchRate === null || multiMatchRate >= 0.5)
  ) {
    verdict = "PROCEED_TO_J4";
    j4RoutingNote =
      "Optional Stage-3: gate ON with fail-closed fallback to incumbent recommend path when Jev unavailable/invalid; never silent unconstrained selection.";
  } else if (confidentlyWrongCount >= 3) {
    verdict = "DO_NOT_ACTIVATE";
    j4RoutingNote = "Confident wrong pattern on multi-option cases; do not wire routing until state shaping or model changes.";
  }

  return {
    startingSha: meta.startingSha,
    branch: meta.branch,
    generatedAt: new Date().toISOString(),
    caseCounts: {
      total: cases.length,
      real: cases.filter((c) => c.corpusSource === "REAL").length,
      realDerivedVariant: cases.filter((c) => c.corpusSource === "REAL_DERIVED_VARIANT").length,
      oneCandidate: cases.filter((c) => c.caseShape === "ONE_CANDIDATE").length,
      multiClear: cases.filter((c) => c.caseShape === "MULTI_CANDIDATE_CLEAR").length,
      multiAmbiguous: cases.filter((c) => c.caseShape === "MULTI_CANDIDATE_AMBIGUOUS").length,
    },
    multiCandidateByReference,
    singleCandidateControl: {
      total: single.length,
      validSelection: single.filter((r) => r.jevKind === "selected").length,
      bridgeOk: single.filter((r) => r.bridgeOk).length,
    },
    incumbentComparisons,
    latencyMs: {
      median: percentile(latencies, 50),
      p95: percentile(latencies, 95),
      max: latencies[latencies.length - 1] ?? 0,
    },
    tokens,
    marketCostUsd,
    failuresByClass,
    verdict,
    j4RoutingNote,
  };
}

export function renderSummaryMarkdown(summary: EvalSummary, results: JevRunRecord[]): string {
  const confidentWrong = results.filter((r) => r.confidentlyWrong);
  const lines = [
    "# Jev V7 shadow evaluation (J3)",
    "",
    `Generated: ${summary.generatedAt}`,
    `Branch: \`${summary.branch}\``,
    `Starting SHA: \`${summary.startingSha}\``,
    "",
    "## Verdict",
    "",
    `**${summary.verdict}**`,
    "",
    summary.j4RoutingNote,
    "",
    "## Corpus",
    "",
    `- Total cases: ${summary.caseCounts.total}`,
    `- REAL: ${summary.caseCounts.real} · REAL_DERIVED_VARIANT: ${summary.caseCounts.realDerivedVariant}`,
    `- ONE_CANDIDATE: ${summary.caseCounts.oneCandidate}`,
    `- MULTI_CANDIDATE_CLEAR: ${summary.caseCounts.multiClear}`,
    `- MULTI_CANDIDATE_AMBIGUOUS: ${summary.caseCounts.multiAmbiguous}`,
    "",
    "## Multi-candidate by reference kind",
    "",
    ...Object.entries(summary.multiCandidateByReference).map(
      ([k, v]) =>
        `- ${k}: ${v.jevMatchesReference}/${v.total} match labeled expectation; confidently wrong: ${v.confidentlyWrong}`,
    ),
    "",
    "## Single-candidate control",
    "",
    `- Valid Jev selection: ${summary.singleCandidateControl.validSelection}/${summary.singleCandidateControl.total}`,
    `- Bridge OK: ${summary.singleCandidateControl.bridgeOk}/${summary.singleCandidateControl.total}`,
    "",
    "## Latency / cost",
    "",
    `- Median ${summary.latencyMs.median}ms · p95 ${summary.latencyMs.p95}ms · max ${summary.latencyMs.max}ms`,
    `- Tokens (sum): in ${summary.tokens.input} · out ${summary.tokens.output} · total ${summary.tokens.total}`,
    `- marketCost (sum): ${summary.marketCostUsd}`,
    "",
    "## Confidently wrong",
    "",
    confidentWrong.length === 0
      ? "None."
      : confidentWrong.map((r) => `- ${r.caseId}: chose ${r.jevOptionId} (top=${r.topProbability})`).join("\n"),
    "",
    "## Failure classification",
    "",
    ...Object.entries(summary.failuresByClass).map(([k, n]) => `- ${k}: ${n}`),
    "",
  ];
  return lines.join("\n");
}
