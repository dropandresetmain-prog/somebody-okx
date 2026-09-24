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

import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";

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

for (const name of ["OPENROUTER_API_KEY", "AI_GATEWAY_API_KEY"]) {
  if (!source[name]) {
    console.error(`[okx-prepare] Missing ${name} in ${envFile}. Value is required but will never be printed.`);
    process.exit(2);
  }
}

const desired = {
  LIVE_AI_ENABLED: "true",
  AI_PROVIDER: "openrouter",
  AI_MODEL: "nex-agi/nex-n2.5-mini:free",
  JEV_OPTION_SELECTION_ENABLED: "true",
  SOMEBODY_EXECUTION_MODE: "testnet_demo",
  M4_M3_EXECUTION_ENABLED: "true",
  OPENROUTER_API_KEY: source.OPENROUTER_API_KEY,
  AI_GATEWAY_API_KEY: source.AI_GATEWAY_API_KEY,
};

const npx = process.platform === "win32" ? "npx.cmd" : "npx";

function run(args, input) {
  const result = spawnSync(npx, args, {
    cwd: process.cwd(),
    encoding: "utf8",
    input,
    stdio: ["pipe", "pipe", "pipe"],
    env: process.env,
  });
  if (result.status !== 0) {
    const detail = (result.stderr || result.stdout || "").trim();
    console.error(`[okx-prepare] Command failed: npx ${args.join(" ")}`);
    if (detail) console.error(detail);
    process.exit(result.status ?? 1);
  }
  return result.stdout;
}

console.log(`[okx-prepare] Target: local Convex at ${convexUrl}`);
console.log("[okx-prepare] Syncing required Testnet demo runtime flags + secret names...");

for (const [name, value] of Object.entries(desired)) {
  // Omit the value from argv so secrets never land in shell/process history.
  run(["convex", "env", "set", "--deployment", "local", name], `${value}\n`);
  console.log(`[okx-prepare] set ${name}`);
}

const names = run(["convex", "env", "list", "--names-only", "--deployment", "local"]);
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
console.log("  AI_MODEL=nex-agi/nex-n2.5-mini:free");
console.log("  LIVE_AI_ENABLED=true");
console.log("  M4_M3_EXECUTION_ENABLED=true");
console.log("  OPENROUTER_API_KEY=present");
console.log("  AI_GATEWAY_API_KEY=present");
console.log("[okx-prepare] Restart Convex + Next after this command before creating a fresh Objective.");
