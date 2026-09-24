// Focused source-text check: the final semantic assessment instruction (in
// convex/objectiveRunner.ts::proposeFinalSemanticAssessment) must explicitly
// make founder-facing usability part of meetsMinimumBar, not merely
// "proof-bearing text exists". Mirrors the source-text-check pattern already
// used in tests/finalReportPdf.test.ts ("no LLM/model imports").
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(here, "../convex/objectiveRunner.ts"), "utf8");

// Isolate the assessment `system` instruction block so this test fails loudly
// if it is ever moved/renamed, rather than silently matching unrelated text.
function extractSystemInstruction(source: string): string {
  const fnMarker = "export const proposeFinalSemanticAssessment";
  const fnStart = source.indexOf(fnMarker);
  assert.ok(fnStart >= 0, "expected to find proposeFinalSemanticAssessment");
  const marker = "const system = [";
  const start = source.indexOf(marker, fnStart);
  assert.ok(start >= 0, "expected to find the final assessment `system` instruction array");
  const end = source.indexOf('].join(" ");', start);
  assert.ok(end >= 0, "expected the `system` instruction array to be closed with ].join(\" \")");
  return source.slice(start, end);
}

test("final semantic assessment instruction rejects scaffold/placeholder/draft-status survivals", () => {
  const instruction = extractSystemInstruction(src);
  assert.match(instruction, /ACTUAL usable/i);
  assert.match(instruction, /founder-facing deliverable/i);
  assert.match(instruction, /scaffold/i);
  assert.match(instruction, /placeholder/i);
  assert.match(instruction, /draft seed/i);
  assert.match(instruction, /review-only/i);
  assert.match(instruction, /worker notes\/checklists/i);
  assert.match(instruction, /raw evidence IDs dominating/i);
  assert.match(instruction, /defensive caveats/i);
  assert.match(instruction, /still missing/i);
});

test("final semantic assessment instruction still protects honest limitation/provenance disclosure", () => {
  const instruction = extractSystemInstruction(src);
  assert.match(instruction, /Do NOT reject merely because/i);
  assert.match(instruction, /synthetic\/test/i);
  assert.match(instruction, /evidence provenance/i);
  assert.match(instruction, /honest limitation inside an otherwise complete, usable deliverable is acceptable/i);
});

test("final semantic assessment instruction stays grounded in the locked contract/requirement/artifact/evidence, not an invented criterion", () => {
  const instruction = extractSystemInstruction(src);
  assert.match(instruction, /locked Outcome Contract/i);
  assert.match(instruction, /deliverable Requirement/i);
  assert.match(instruction, /never invent a success criterion/i);
});
