// Portability gate regression: the worker-facing update_company_artifact contract must
// tell every model that `content` REPLACES the whole artifact (applyArtifactChange does
// exactly that). Without it, serial per-requirement workers overwrote each other's
// sections and the final artifact lost the diagnosis (gate runs luna-1..3).
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { applyArtifactChange } from "../lib/objective/artifact";

const src = readFileSync(new URL("../lib/worker/runtime.ts", import.meta.url), "utf8");

test("worker contract states artifact content is a full replacement to be carried forward", () => {
  const hits = src.match(/COMPLETE new text/g) ?? [];
  assert.ok(hits.length >= 2, "prompt lines must state content is the COMPLETE new text");
  assert.match(src, /REPLACES the current version entirely/);
  assert.match(src, /including parts written for other Requirements/);
});

test("applyArtifactChange really replaces content (the semantic the contract describes)", () => {
  const artifact = { key: "k", label: "l", objectiveKey: "o", version: 1, content: "A\nB", history: [], updatedAt: 1 } as never;
  const next = applyArtifactChange(artifact, { content: "C", changeNote: "n", runId: "r", at: 2 } as never) as { content: string };
  assert.equal(next.content, "C");
});
