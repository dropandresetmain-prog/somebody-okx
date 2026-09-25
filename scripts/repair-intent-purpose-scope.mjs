/**
 * One-shot repair: bind requestedPurposeKind + purpose on an existing BUY intent
 * using the same rules as dispatchExternal (Objective policy + Requirement text).
 *
 * Usage: node scripts/repair-intent-purpose-scope.mjs <intentId> [--env-file=.env.local]
 */
import { spawnSync } from "node:child_process";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { ConvexHttpClient } from "convex/browser";
import { loadGateEnv } from "./gate/envFile.mjs";
import { api } from "../convex/_generated/api.js";
import { bindExecutionIntentPurposeScope } from "../lib/objective/resourceNeed.ts";
import { isGovernedPurposeKind } from "../lib/workforce/catalog.ts";

const { args, get } = loadGateEnv(process.argv.slice(2));
const intentId = args[0];
if (!intentId) {
  console.error("usage: node scripts/repair-intent-purpose-scope.mjs <intentId>");
  process.exit(2);
}

const client = new ConvexHttpClient(get("NEXT_PUBLIC_CONVEX_URL"));
const driverToken = get("M4_M3_DRIVER_TOKEN");

const snap = await client.query("m3Driver:snapshot", { intentId, driverToken });
if (!snap?.intent) {
  console.error(`intent not found: ${intentId}`);
  process.exit(1);
}
const intent = snap.intent;
const objectiveKey = intent.objectiveKey;

const raw = await client.query(api.objectives.getObjective, { objectiveKey });
const mgmt = raw?.record?.management ?? {};
const policyRaw = mgmt.authorizedPurposePolicy;
const policyPurposeKind =
  policyRaw &&
  typeof policyRaw.purposeKind === "string" &&
  isGovernedPurposeKind(policyRaw.purposeKind)
    ? policyRaw.purposeKind
    : null;

const ws = await client.query(api.m5Workspace.getObjectiveWorkspaceV2, { objectiveKey });
const req = (ws?.view?.requirements ?? []).find(
  (r) => r.requirementKey === intent.requirementKey,
);
const fallbackPurposeText = req?.statement ?? req?.title ?? null;

const repaired = bindExecutionIntentPurposeScope({
  intent,
  matchingNeed: null,
  objectivePolicyPurposeKind: policyPurposeKind,
  fallbackPurposeText,
});

if (!repaired.requestedPurposeKind || !repaired.purpose) {
  console.error("repair could not bind scope; check objective policy and requirement text");
  process.exit(1);
}

const payload = JSON.stringify({
  intentId: repaired.intentId,
  objectiveKey,
  idempotencyKey: repaired.idempotencyKey,
  data: repaired,
});

const convexMain = join(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  "node_modules",
  "convex",
  "bin",
  "main.js",
);
const result = spawnSync(
  process.execPath,
  [convexMain, "run", "--env-file", ".env.local", "internal/workforce:putIntent", payload],
  { cwd: process.cwd(), encoding: "utf8", shell: false },
);
if (result.status !== 0) {
  console.error(result.stderr || result.stdout || "convex run failed");
  process.exit(result.status ?? 1);
}

console.log(
  JSON.stringify({
    intentId,
    requestedPurposeKind: repaired.requestedPurposeKind,
    purposeLength: repaired.purpose?.length ?? 0,
    ok: true,
  }),
);
