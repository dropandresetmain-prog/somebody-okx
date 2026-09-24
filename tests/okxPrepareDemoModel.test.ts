// Final demo preparation (npm run okx:prepare:local) selects the founder-chosen
// GPT-family model on OpenRouter. Static read of the script — it is never run
// against a real env file here.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const script = readFileSync(new URL("../scripts/prepare-okx-demo.mjs", import.meta.url), "utf8");
const pkg = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8")) as {
  scripts: Record<string, string>;
};

test("okx:prepare:local runs prepare-okx-demo.mjs", () => {
  assert.match(pkg.scripts["okx:prepare:local"] ?? "", /scripts\/prepare-okx-demo\.mjs/);
});

test("prepare-okx-demo sets AI_MODEL=openai/gpt-6-luna on AI_PROVIDER=openrouter", () => {
  assert.match(script, /AI_PROVIDER:\s*"openrouter"/);
  const models = [...script.matchAll(/AI_MODEL:\s*"([^"]+)"/g)].map((m) => m[1]);
  assert.deepEqual(models, ["openai/gpt-6-luna"]);
  assert.doesNotMatch(script, /nex-agi\//);
});
