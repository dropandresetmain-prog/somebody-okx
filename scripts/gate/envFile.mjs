// Shared env-file + CLI-flag resolution for scripts/gate/*.mjs.
//
// Default target is LOCAL Convex (.env.local) — routine gate runs should not
// touch cloud Database I/O. Pass --env-file=.env.cloud.local to explicitly
// target the cloud dev deployment (see docs/DEVELOPMENT.md).
import { readFileSync } from "fs";

export function loadGateEnv(argv) {
  const args = [];
  let envFile = ".env.local";
  for (const a of argv) {
    if (a.startsWith("--env-file=")) envFile = a.slice("--env-file=".length);
    else args.push(a);
  }
  const text = readFileSync(envFile, "utf8");
  const get = (n) => {
    const m = text.match(new RegExp(`^\\s*${n}\\s*=\\s*(.+)$`, "m"));
    if (!m) throw new Error(`${n} missing in ${envFile}`);
    return m[1].trim().replace(/^["']|["']$/g, "");
  };
  console.error(`[env] target=${envFile}`);
  return { envFile, args, get };
}
