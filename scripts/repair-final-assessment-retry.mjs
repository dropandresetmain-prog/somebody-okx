/**
 * Supervised recovery after a false final-assessment block: reset assessment
 * budget so the completion gate can run one fresh final semantic assessment
 * (e.g. after an assessor-scope fix). Does not change requirements or artifacts.
 *
 * Usage: node scripts/repair-final-assessment-retry.mjs <objectiveKey> [--env-file=.env.local]
 */
import { spawnSync } from "node:child_process";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { loadGateEnv } from "./gate/envFile.mjs";

const { args, get } = loadGateEnv(process.argv.slice(2));
const objectiveKey = args[0];
if (!objectiveKey) {
  console.error("usage: node scripts/repair-final-assessment-retry.mjs <objectiveKey>");
  process.exit(2);
}

const applicationRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const convexMain = join(applicationRoot, "node_modules", "convex", "bin", "main.js");

const payload = JSON.stringify({ objectiveKey, at: Date.now() });
const result = spawnSync(
  process.execPath,
  [convexMain, "run", "--env-file", ".env.local", "management:repairFinalAssessmentRetry", payload],
  { cwd: applicationRoot, encoding: "utf8", shell: false },
);
if (result.status !== 0) {
  console.error(result.stderr || result.stdout || "convex run failed");
  process.exit(result.status ?? 1);
}

console.log(result.stdout.trim() || JSON.stringify({ ok: true, objectiveKey }));
