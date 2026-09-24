// One-command local OKX demo runtime preparation.
//
// This exists because Next's .env.local and a local Convex deployment have
// separate environment stores. Editing .env.local alone does NOT change what
// Convex actions see.
//
// Safety:
// - local Convex only (127.0.0.1 target required)
// - never prints secret values
// - X Layer/mainnet execution policy remains enforced by runtime code
// - only the explicit hackathon Testnet flags below are written
//
// Usage:
//   npm run okx:prepare:local
//   node scripts/prepare-okx-demo.mjs .env.local

import { readFileSync, existsSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { join } from "node:path";

const envFile = process.argv[2] ?? ".env.local";

function readEnv(path) {
  const out = {};
  const raw = readFileSync(path, "utf8");
  for (const line of raw.split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*)$/);
    if (!match) continue;
    let value = match[2].trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    out[match[1]] = value;
  }
  return out;
}

const source = readEnv(envFile);
const convexUrl = source.NEXT_PUBLIC_CONVEX_URL ?? "";
if (!/^http:\/\/(127\.0\.0\.1|localhost):\d+\/?$/i.test(convexUrl)) {
  console.error(
    `[okx-prepare] Refusing to mutate Convex env: ${envFile} does not target a loopback local deployment (NEXT_PUBLIC_CONVEX_URL=${convexUrl || "(unset)"}).`,
  );
  process.exit(2);
}

const requiredSecrets = [
  "OPENROUTER_API_KEY",
  "AI_GATEWAY_API_KEY",
  "M4_M3_DRIVER_TOKEN",
  "M4_M3_FACT_ATTESTATION_KEY",
];
for (const name of requiredSecrets) {
  if (!source[name]) {
    console.error(`[okx-prepare] Missing ${name} in ${envFile}. Value is required but will never be printed.`);
    process.exit(2);
  }
}
if (source.M4_M3_DRIVER_TOKEN === source.M4_M3_FACT_ATTESTATION_KEY) {
  console.error(
    "[okx-prepare] M4_M3_FACT_ATTESTATION_KEY must be distinct from M4_M3_DRIVER_TOKEN.",
  );
  process.exit(2);
}

const desired = {
  LIVE_AI_ENABLED: "true",
  AI_PROVIDER: "openrouter",
  AI_MODEL: "openai/gpt-6-luna",
  JEV_OPTION_SELECTION_ENABLED: "true",
  SOMEBODY_EXECUTION_MODE: "testnet_demo",
  M4_M3_EXECUTION_ENABLED: "true",
  OPENROUTER_API_KEY: source.OPENROUTER_API_KEY,
  AI_GATEWAY_API_KEY: source.AI_GATEWAY_API_KEY,
  // Bridge tokens for the Node M4×M3 driver ↔ Convex m3Driver / integrationEventsDriver.
  M4_M3_DRIVER_TOKEN: source.M4_M3_DRIVER_TOKEN,
  M4_M3_FACT_ATTESTATION_KEY: source.M4_M3_FACT_ATTESTATION_KEY,
};

// Prefer the local Convex CLI entrypoint so Windows does not need npx.cmd +
// shell:true (stdin to batch wrappers is unreliable; args+shell is insecure).
const convexMain = join(process.cwd(), "node_modules", "convex", "bin", "main.js");
if (!existsSync(convexMain)) {
  console.error(`[okx-prepare] Missing local Convex CLI at ${convexMain}. Run npm install.`);
  process.exit(2);
}

function run(convexArgs, input) {
  const result = spawnSync(process.execPath, [convexMain, ...convexArgs], {
    cwd: process.cwd(),
    encoding: "utf8",
    input,
    stdio: ["pipe", "pipe", "pipe"],
    env: process.env,
    shell: false,
  });
  if (result.status !== 0) {
    const detail = (result.stderr || result.stdout || "").trim();
    console.error(`[okx-prepare] Command failed: node convex ${convexArgs.join(" ")}`);
    if (detail) console.error(detail);
    if (result.error) console.error(String(result.error));
    process.exit(result.status ?? 1);
  }
  return result.stdout;
}

console.log(`[okx-prepare] Target: local Convex at ${convexUrl}`);
console.log("[okx-prepare] Syncing required Testnet demo runtime flags + secret names...");

for (const [name, value] of Object.entries(desired)) {
  // Omit the value from argv so secrets never land in shell/process history.
  run(["env", "set", "--deployment", "local", name], `${value}\n`);
  console.log(`[okx-prepare] set ${name}`);
}

const names = run(["env", "list", "--names-only", "--deployment", "local"]);
const present = new Set(
  names
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean),
);

const missing = Object.keys(desired).filter((name) => !present.has(name));
if (missing.length) {
  console.error(`[okx-prepare] Verification failed; missing names: ${missing.join(", ")}`);
  process.exit(1);
}

console.log("[okx-prepare] READY");
console.log("[okx-prepare] Convex runtime:");
console.log("  SOMEBODY_EXECUTION_MODE=testnet_demo");
console.log("  JEV_OPTION_SELECTION_ENABLED=true");
console.log("  AI_PROVIDER=openrouter");
console.log("  AI_MODEL=openai/gpt-6-luna");
console.log("  LIVE_AI_ENABLED=true");
console.log("  M4_M3_EXECUTION_ENABLED=true");
console.log("  OPENROUTER_API_KEY=present");
console.log("  AI_GATEWAY_API_KEY=present");
console.log("  M4_M3_DRIVER_TOKEN=present");
console.log("  M4_M3_FACT_ATTESTATION_KEY=present");
console.log("[okx-prepare] Restart Convex + Next after this command before creating a fresh Objective.");
console.log("[okx-prepare] Also keep `npm run m3:seller` running before any paid BUY.");
