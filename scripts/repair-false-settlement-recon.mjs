/**
 * Supervised recovery after a false reconciliation_required from settlement
 * verifier bugs (on-chain tx already submitted). Resets local M3 purchase to
 * `submitted` and M4 intent to `handed_off` without re-executing payment.
 *
 * Usage: node scripts/repair-false-settlement-recon.mjs <intentId> [--env-file=.env.local]
 */
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { ConvexHttpClient } from "convex/browser";
import { loadGateEnv } from "./gate/envFile.mjs";
const { args, get } = loadGateEnv(process.argv.slice(2));
const intentId = args[0];
if (!intentId) {
  console.error("usage: node scripts/repair-false-settlement-recon.mjs <intentId>");
  process.exit(2);
}

const applicationRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const ledgerPath = join(applicationRoot, ".m3-purchase-ledger.json");
const ledger = JSON.parse(fs.readFileSync(ledgerPath, "utf8"));
const purchase = ledger.purchases?.find((row) => row.id === intentId);
if (!purchase) {
  console.error(`purchase not found in ledger: ${intentId}`);
  process.exit(1);
}
if (!purchase.receipt?.transactionHash) {
  console.error("purchase has no submitted transaction hash; cannot resume observation");
  process.exit(1);
}
if (purchase.state !== "reconciliation_required" && purchase.state !== "uncertain") {
  console.error(`purchase is ${purchase.state}; only reconciliation_required/uncertain are repaired here`);
  process.exit(1);
}

const client = new ConvexHttpClient(get("NEXT_PUBLIC_CONVEX_URL"));
const driverToken = get("M4_M3_DRIVER_TOKEN");
const snap = await client.query("m3Driver:snapshot", { intentId, driverToken });
if (!snap?.intent) {
  console.error(`intent not found: ${intentId}`);
  process.exit(1);
}
const intent = { ...snap.intent };
if (intent.state !== "reconciliation_required") {
  console.error(`intent is ${intent.state}; expected reconciliation_required`);
  process.exit(1);
}

const at = Date.now();
purchase.state = "submitted";
purchase.updatedAt = at;
fs.writeFileSync(ledgerPath, `${JSON.stringify(ledger, null, 2)}\n`);

intent.state = "handed_off";
intent.boundaryNote =
  `Supervised recovery: false settlement mismatch cleared after verifier fix; resuming observation for tx ${purchase.receipt.transactionHash}`;
intent.updatedAt = at;

const payload = JSON.stringify({
  intentId: intent.intentId,
  objectiveKey: intent.objectiveKey,
  idempotencyKey: intent.idempotencyKey,
  data: intent,
});

const convexMain = join(applicationRoot, "node_modules", "convex", "bin", "main.js");
const result = spawnSync(
  process.execPath,
  [convexMain, "run", "--env-file", ".env.local", "internal/workforce:putIntent", payload],
  { cwd: applicationRoot, encoding: "utf8", shell: false },
);
if (result.status !== 0) {
  console.error(result.stderr || result.stdout || "convex run failed");
  process.exit(result.status ?? 1);
}

console.log(
  JSON.stringify({
    intentId,
    purchaseState: purchase.state,
    intentState: intent.state,
    transactionHash: purchase.receipt.transactionHash,
    ok: true,
  }),
);
