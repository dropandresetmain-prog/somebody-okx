/**
 * Offline Jev shadow eval — production-shaped J2 pipeline, no live manager routing.
 *
 * Usage:
 *   npx tsx scripts/jev-v7-shadow/run-shadow-eval.ts [--env-file=.env.local] [--smoke] [--dry-run]
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";
import type { EvalCase } from "../../lib/management/jev/eval/types";
import { runJevEvalCase } from "../../lib/management/jev/eval/runPipeline";
import { buildEvalSummary, renderSummaryMarkdown } from "../../lib/management/jev/eval/summarize";

function loadEnv(argv: string[]) {
  let envFile = ".env.local";
  for (const a of argv) if (a.startsWith("--env-file=")) envFile = a.slice("--env-file=".length);
  try {
    const text = readFileSync(envFile, "utf8");
    const m = text.match(/^\s*AI_GATEWAY_API_KEY\s*=\s*(.+)$/m);
    if (m) process.env.AI_GATEWAY_API_KEY = m[1].trim().replace(/^["']|["']$/g, "");
  } catch {
    // optional for --dry-run
  }
}

function gitSha(): string {
  try {
    return execSync("git rev-parse HEAD", { encoding: "utf8" }).trim();
  } catch {
    return "unknown";
  }
}

function gitBranch(): string {
  try {
    return execSync("git branch --show-current", { encoding: "utf8" }).trim();
  } catch {
    return "unknown";
  }
}

async function main() {
  const argv = process.argv.slice(2);
  const smoke = argv.includes("--smoke");
  const dryRun = argv.includes("--dry-run");
  if (!dryRun) loadEnv(argv);

  const outDir = path.resolve(process.cwd(), "docs/work/jev-v7-shadow");
  mkdirSync(outDir, { recursive: true });
  const casesPath = path.join(outDir, "cases.json");
  const cases = JSON.parse(readFileSync(casesPath, "utf8")) as EvalCase[];
  const selected = smoke ? cases.filter((c) => c.eligible.length > 1).slice(0, 1) : cases;

  const results = [];
  for (const caseRow of selected) {
    console.error(`[run-shadow-eval] ${caseRow.caseId} (${caseRow.eligible.length} eligible)`);
    const { record } = await runJevEvalCase(caseRow, { dryRun });
    results.push(record);
  }

  const summary = buildEvalSummary(cases, results, {
    startingSha: "5ff9d2c5392a64cdbe60ebf8839ee2ab61b53891",
    branch: gitBranch(),
  });
  summary.generatedAt = new Date().toISOString();

  writeFileSync(path.join(outDir, "results.json"), JSON.stringify({ summary, results }, null, 2));
  writeFileSync(path.join(outDir, "SUMMARY.md"), renderSummaryMarkdown(summary, results));

  console.log(JSON.stringify({ summary, resultCount: results.length }, null, 2));
  if (results.some((r) => r.jevKind === "unavailable" && r.detail !== "dry-run")) {
    process.exitCode = 1;
  }
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
