/**
 * Read-only extraction of persisted managerial decision grounding from local Convex SQLite.
 * Expects coarsePlanSummary.extra.options (full GroundedOption[]).
 *
 * Usage:
 *   node scripts/jev-v7-shadow/extract-convex-corpus.mjs [path-to-sqlite]
 */
import { execSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

const defaultDb = path.resolve(
  process.cwd(),
  "..",
  "somebody-okx",
  ".convex",
  "local",
  "default",
  "convex_local_backend.sqlite3",
);
const dbPath = process.argv[2] ? path.resolve(process.argv[2]) : defaultDb;

const sql =
  "SELECT json_value FROM documents WHERE deleted=0 AND json_value LIKE '%\"coarsePlanSummary\"%' AND json_value LIKE '%\"requirementKey\"%';";

const raw = execSync(`sqlite3 "${dbPath}" "${sql.replace(/"/g, '""')}"`, {
  encoding: "utf8",
  maxBuffer: 64 * 1024 * 1024,
});

const lines = raw.split(/\r?\n/).filter(Boolean);
const cases = [];
let idx = 0;

for (const line of lines) {
  let row;
  try {
    row = JSON.parse(line);
  } catch {
    continue;
  }
  const data = row.data;
  if (!data?.coarsePlanSummary) continue;
  let parsed;
  try {
    parsed = JSON.parse(data.coarsePlanSummary);
  } catch {
    continue;
  }
  const options = parsed?.extra?.options;
  if (!Array.isArray(options) || options.length === 0) continue;
  const eligible = options.filter((o) => o?.eligibility?.eligible === true);
  if (eligible.length === 0) continue;

  const requirementKey = data.requirementKey ?? eligible[0]?.requirementKey ?? "unknown";
  const caseId = `convex_${data.decisionId ?? idx}`;
  idx += 1;

  cases.push({
    caseId,
    corpusSource: "REAL",
    provenance: `convex local sqlite managerialDecisions row ${data.decisionId ?? caseId}`,
    caseShape:
      eligible.length === 1
        ? "ONE_CANDIDATE"
        : "MULTI_CANDIDATE_AMBIGUOUS",
    reference: {
      kind: "ACCEPTED_RUNTIME_OUTCOME",
      expectedOptionId:
        typeof data.selectedOptionId === "string" ? data.selectedOptionId : null,
      notes: "Incumbent selectedOptionId from persisted decision row when present.",
    },
    requirement: {
      requirementKey,
      title: data.requirementTitle ?? requirementKey,
      mustBeTrue: data.mustBeTrue ?? "requirement satisfied",
      scope: data.scope ?? "",
      expectedOutput: data.expectedOutput ?? null,
      requiredResourceClasses: data.requiredResourceClasses ?? [],
    },
    contractRevision: data.contractRevision ?? eligible[0]?.contractRevision ?? 1,
    eligible,
    incumbent:
      typeof data.selectedOptionId === "string"
        ? {
            selectedOptionId: data.selectedOptionId,
            strategy: data.strategy ?? null,
            rationaleSnippet: typeof parsed.original === "string" ? parsed.original.slice(0, 120) : null,
            source: "convex managerialDecisions",
          }
        : undefined,
    factsSummary: eligible
      .map((o) => `${o.optionId?.slice(0, 12)}:${o.strategy}/${o.kind}`)
      .join("; "),
  });
}

const outDir = path.resolve(process.cwd(), "docs/work/jev-v7-shadow");
mkdirSync(outDir, { recursive: true });
const outPath = path.join(outDir, "convex-corpus.json");
writeFileSync(outPath, JSON.stringify(cases, null, 2));
console.error(`[extract-convex-corpus] wrote ${cases.length} case(s) → ${outPath}`);
