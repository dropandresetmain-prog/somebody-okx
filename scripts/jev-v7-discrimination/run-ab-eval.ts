/**
 * A/B Jev discrimination eval: baseline vs neutral rubric.
 *
 * npx tsx scripts/jev-v7-discrimination/run-ab-eval.ts --env-file=../somebody-okx/.env.local
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";
import type { EvalCase } from "../../lib/management/jev/eval/types";
import { runAbSelection, type AbRunRow } from "../../lib/management/jev/eval/abEval";
import { correctReferenceLabel } from "../../lib/management/jev/eval/dominanceAudit";
import { decideJ31Verdict } from "../../lib/management/jev/eval/discriminationVerdict";

function loadEnv(argv: string[]) {
  let envFile = ".env.local";
  for (const a of argv) if (a.startsWith("--env-file=")) envFile = a.slice("--env-file=".length);
  const text = readFileSync(envFile, "utf8");
  const m = text.match(/^\s*AI_GATEWAY_API_KEY\s*=\s*(.+)$/m);
  if (!m) throw new Error(`AI_GATEWAY_API_KEY missing in ${envFile}`);
  process.env.AI_GATEWAY_API_KEY = m[1].trim().replace(/^["']|["']$/g, "");
}

function correctedExpected(c: EvalCase): string | null {
  return correctReferenceLabel(c.eligible, c.reference).correctedExpected;
}

async function main() {
  const argv = process.argv.slice(2);
  const smoke = argv.includes("--smoke");
  loadEnv(argv);

  const outDir = path.resolve(process.cwd(), "docs/work/jev-v7-discrimination");
  const corpus = JSON.parse(
    readFileSync(path.join(outDir, "eval-corpus.json"), "utf8"),
  ) as EvalCase[];
  const selected = smoke ? corpus.filter((c) => c.corpusSource === "REAL_DERIVED_VARIANT").slice(0, 2) : corpus;

  const baseline: AbRunRow[] = [];
  const neutral: AbRunRow[] = [];

  for (const caseRow of selected) {
    const expected = correctedExpected(caseRow);
    console.error(`[ab-eval] baseline ${caseRow.caseId}`);
    baseline.push(await runAbSelection(caseRow, "baseline", expected));
    console.error(`[ab-eval] neutral ${caseRow.caseId}`);
    neutral.push(await runAbSelection(caseRow, "neutral", expected));
  }

  const sha = execSync("git rev-parse HEAD", { encoding: "utf8" }).trim();
  const decision = decideJ31Verdict(baseline, neutral);
  const payload = {
    generatedAt: new Date().toISOString(),
    startingSha: "6f04e94",
    headSha: sha,
    verdict: decision.verdict,
    verdictNote: decision.note,
    baseline,
    neutral,
  };
  mkdirSync(outDir, { recursive: true });
  writeFileSync(path.join(outDir, "ab-results.json"), JSON.stringify(payload, null, 2));
  writeFileSync(path.join(outDir, "SUMMARY.md"), renderSummary(payload, corpus));
  console.log(JSON.stringify({ cases: selected.length, baselineRuns: baseline.length }, null, 2));
}

function renderSummary(
  payload: {
    baseline: AbRunRow[];
    neutral: AbRunRow[];
    generatedAt: string;
    headSha: string;
    verdict: string;
    verdictNote: string;
  },
  corpus: EvalCase[],
): string {
  const clean = (rows: AbRunRow[]) =>
    rows.filter((r) => r.correctedExpected !== null && r.corpusSource === "REAL_DERIVED_VARIANT");
  const amb = (rows: AbRunRow[]) =>
    rows.filter((r) => r.correctedExpected === null);

  const matchRate = (rows: AbRunRow[]) => {
    const scored = rows.filter((r) => r.matchesCorrected !== null);
    if (scored.length === 0) return "n/a";
    const ok = scored.filter((r) => r.matchesCorrected).length;
    return `${ok}/${scored.length}`;
  };

  const confidentWrong = (rows: AbRunRow[]) =>
    rows.filter((r) => r.confidentlyWrong).map((r) => `${r.caseId} (${r.rubric})`).join(", ") || "none";

  const tokens = (rows: AbRunRow[]) =>
    rows.reduce((s, r) => s + (r.usage.totalTokens ?? 0), 0);

  const lat = (rows: AbRunRow[]) => {
    const xs = rows.map((r) => r.latencyMs).sort((a, b) => a - b);
    return xs.length ? xs[Math.floor(xs.length / 2)] : 0;
  };

  const realMulti = corpus.filter(
    (c) => c.corpusSource === "REAL" && c.eligible.length > 1,
  ).length;
  const derived = corpus.filter((c) => c.corpusSource === "REAL_DERIVED_VARIANT").length;

  return `# Jev V7 discrimination eval (J3.1)

Generated: ${payload.generatedAt}
HEAD: \`${payload.headSha}\` (from J3 \`6f04e94\`)

## Verdict

**${payload.verdict}**

${payload.verdictNote}

## Corpus

- Real multi-option (corrected labels): ${realMulti}
- REAL_DERIVED_VARIANT discrimination: ${derived}

## Clean dominance (derived variants only)

| Rubric | Match corrected expected |
|--------|-------------------------|
| baseline | ${matchRate(clean(payload.baseline))} |
| neutral | ${matchRate(clean(payload.neutral))} |

Confidently wrong (clean): baseline ${confidentWrong(clean(payload.baseline))}; neutral ${confidentWrong(clean(payload.neutral))}

## Ambiguous / null expected

| Rubric | cases |
|--------|-------|
| baseline | ${amb(payload.baseline).length} |
| neutral | ${amb(payload.neutral).length} |

## MAKE-bias note

Compare \`disc_make_strictly_inferior\` vs \`disc_make_strictly_superior\` and real \`v7_cp2_two_external_providers_price_dominance\` in ab-results.json.

## HYBRID

See \`disc_hybrid_present_observation\` — reported separately, no target rate.

## Latency / tokens (all runs)

- Baseline median ms: ${lat(payload.baseline)} · tokens: ${tokens(payload.baseline)}
- Neutral median ms: ${lat(payload.neutral)} · tokens: ${tokens(payload.neutral)}
`;
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
