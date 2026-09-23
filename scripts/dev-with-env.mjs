// Runs `next dev` with Convex/env vars taken from an explicit file instead of
// Next's default `.env.local` autoload. Used only for the non-default cloud
// dev path (`npm run dev:cloud`) — routine `npm run dev` / `dev:local` needs
// no wrapper because `.env.local` already IS the local-Convex file Next loads.
//
// Usage: node scripts/dev-with-env.mjs <envFile>
import { readFileSync } from "fs";
import { spawn } from "child_process";

const envFile = process.argv[2];
if (!envFile) {
  console.error("usage: node scripts/dev-with-env.mjs <envFile>");
  process.exit(2);
}

const text = readFileSync(envFile, "utf8");
const overrides = {};
for (const line of text.split(/\r?\n/)) {
  const m = line.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*)$/);
  if (!m) continue;
  overrides[m[1]] = m[2].trim().replace(/^["']|["']$/g, "");
}

console.log(`[dev-with-env] Next.js dev server targeting env file: ${envFile}`);
console.log(`[dev-with-env] NEXT_PUBLIC_CONVEX_URL=${overrides.NEXT_PUBLIC_CONVEX_URL ?? "(unset)"}`);

// Values set here take priority over Next's own `.env.local` autoload,
// because @next/env does not overwrite variables already present in
// process.env of the process it starts in.
const child = spawn("npx", ["next", "dev", "--hostname", "127.0.0.1"], {
  stdio: "inherit",
  shell: true,
  env: { ...process.env, ...overrides },
});
child.on("exit", (code) => process.exit(code ?? 0));
