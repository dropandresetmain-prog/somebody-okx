/**
 * Assemble the J3 shadow corpus (REAL decision-pass boundaries + optional Convex rows).
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import {
  buildScenarioCorpus,
  derivePriceSwapVariant,
} from "../../lib/management/jev/eval/corpusScenarios";
import type { EvalCase } from "../../lib/management/jev/eval/types";
import { caseShapeFor } from "../../lib/management/jev/eval/classify";

const outDir = path.resolve(process.cwd(), "docs/work/jev-v7-shadow");
mkdirSync(outDir, { recursive: true });

async function main() {
  const scenarioCases = await buildScenarioCorpus();
  const convexPath = path.join(outDir, "convex-corpus.json");
  let convexCases: EvalCase[] = [];
  try {
    convexCases = JSON.parse(readFileSync(convexPath, "utf8")) as EvalCase[];
  } catch {
    console.error("[build-corpus] no convex-corpus.json — run extract-convex-corpus.mjs if local Convex has decisions");
  }

  const byId = new Map<string, EvalCase>();
  for (const c of [...scenarioCases, ...convexCases]) {
    byId.set(c.caseId, c);
  }

  const twoExternal = scenarioCases.find((c) => c.caseId === "v7_cp2_two_external_providers_price_dominance");
  if (twoExternal) {
    const variant = derivePriceSwapVariant(twoExternal, "v7_derived_price_swap_two_external");
    if (variant) {
      variant.caseShape = caseShapeFor(variant.eligible.length, variant.reference.kind);
      byId.set(variant.caseId, variant);
    }
  }

  const cases = [...byId.values()];
  writeFileSync(path.join(outDir, "cases.json"), JSON.stringify(cases, null, 2));
  console.error(`[build-corpus] wrote ${cases.length} cases → ${path.join(outDir, "cases.json")}`);
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
