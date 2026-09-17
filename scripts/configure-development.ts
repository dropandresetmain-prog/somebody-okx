import { readFileSync, appendFileSync } from "node:fs";
import { randomBytes } from "node:crypto";
import { spawnSync } from "node:child_process";

const deployment = "acrobatic-swan-765";
process.loadEnvFile(".env.local");
function cli(args: string[], input?: string) {
  const result = spawnSync(
    process.execPath,
    ["node_modules/convex/bin/main.js", ...args, "--deployment", deployment],
    { encoding: "utf8", input },
  );
  if (result.status !== 0)
    throw new Error(
      `Convex command failed: ${args.slice(0, 2).join(" ")} (output withheld to protect secrets)`,
    );
  return result.stdout;
}
const health = JSON.parse(cli(["run", "health:status"]));
if (health.deploymentName !== deployment || !health.probeWritesEnabled)
  throw new Error("Development health verification failed");
console.log(
  `Verified Development ${deployment}: reads, writes, schema and bounded fixtures allowed.`,
);
let token = process.env.DEVELOPMENT_ACCESS_TOKEN;
if (!token) {
  token = randomBytes(32).toString("hex");
  const existing = readFileSync(".env.local", "utf8");
  if (/^DEVELOPMENT_ACCESS_TOKEN=/m.test(existing))
    throw new Error(
      "Remove the empty token assignment before generating a token",
    );
  appendFileSync(".env.local", `\nDEVELOPMENT_ACCESS_TOKEN=${token}\n`);
}
cli(["env", "set", "DEVELOPMENT_ACCESS_TOKEN"], token);
if (process.argv.includes("--enable-live")) {
  if (!process.env.OPENROUTER_API_KEY)
    throw new Error("OPENROUTER_API_KEY missing in .env.local");
  cli(["env", "set", "OPENROUTER_API_KEY"], process.env.OPENROUTER_API_KEY);
  cli(["env", "set", "AI_PROVIDER", "openrouter"]);
  cli(["env", "set", "AI_MODEL", process.env.AI_MODEL || "openrouter/free"]);
  cli(["env", "set", "LIVE_AI_ENABLED", "true"]);
  console.log(
    "Live OpenRouter enabled deliberately on Development; keys were not printed.",
  );
} else if (process.argv.includes("--disable-live")) {
  cli(["env", "set", "LIVE_AI_ENABLED", "false"]);
  console.log("Live AI disabled; fixture controls remain available.");
} else
  console.log(
    "Development access configured; existing live AI setting preserved.",
  );
