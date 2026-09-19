#!/usr/bin/env node
/**
 * Secondary diagnostic A/B after primary INVALID (accepted.amount is null).
 * Same Mock Merchant economic terms, but accepts[] uses `amount` (as CLI quote
 * normalization does) instead of `maxAmountRequired`.
 * Still: TEE --payload only, no merchant replay, no settle.
 */
import { spawn } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const BASE = "https://web3.okx.com";
const VERIFY_PATH = "/api/v6/pay/x402/verify";

const EXACT_ACCEPT = {
  scheme: "exact",
  network: "eip155:1952",
  amount: "10000",
  asset: "0xcb8bf24c6ce16ad21d707c9505421a17f2bec79d",
  payTo: "0x3509655ad99effc7f3f74205482b1cb337ca08f7",
  resource: "/api/v1/pay/mock-merchant/resource",
  mimeType: "application/json",
  maxTimeoutSeconds: 60,
  extra: { name: "USDC_TEST", version: "1" },
};

function loadDotEnvLocal() {
  const envPath = path.join(ROOT, ".env.local");
  if (!fs.existsSync(envPath)) return;
  for (const raw of fs.readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq <= 0) continue;
    const key = line.slice(0, eq).trim();
    let val = line.slice(eq + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'")))
      val = val.slice(1, -1);
    if (process.env[key] === undefined) process.env[key] = val;
  }
}

function redact(s) {
  return String(s)
    .replace(/0x[a-fA-F0-9]{20,}/g, "0xREDACTED")
    .replace(/[A-Za-z0-9+/]{64,}={0,2}/g, (m) => `B64_REDACTED_LEN_${m.length}`);
}

function resolveCreds() {
  return {
    apiKey: process.env.OKX_API_KEY,
    secretKey: process.env.OKX_SECRET_KEY || process.env.OKX_API_SECRET,
    passphrase: process.env.OKX_API_PASSPHRASE || process.env.OKX_PASSPHRASE,
    projectId: process.env.OKX_PROJECT_ID,
  };
}

function sign(secretKey, timestamp, method, requestPath, rawBody = "") {
  return crypto
    .createHmac("sha256", secretKey)
    .update(timestamp + method.toUpperCase() + requestPath + rawBody)
    .digest("base64");
}

function run(cmd, args) {
  return new Promise((resolve) => {
    const child = spawn(cmd, args, { shell: false, windowsHide: true, env: process.env });
    let stdout = "", stderr = "";
    child.stdout.on("data", (d) => (stdout += d.toString("utf8")));
    child.stderr.on("data", (d) => (stderr += d.toString("utf8")));
    child.on("close", (code) => resolve({ code, stdout, stderr }));
    child.on("error", (err) => resolve({ code: -1, stdout, stderr: String(err.message || err) }));
  });
}

function decodePaymentPayload(authorizationHeader) {
  const normalized = authorizationHeader.replace(/-/g, "+").replace(/_/g, "/");
  const pad = normalized.length % 4 === 0 ? "" : "=".repeat(4 - (normalized.length % 4));
  return JSON.parse(Buffer.from(normalized + pad, "base64").toString("utf8"));
}

async function main() {
  loadDotEnvLocal();
  const creds = resolveCreds();
  const challenge = {
    x402Version: 2,
    resource: { url: "/api/v1/pay/mock-merchant/resource", mimeType: "application/json" },
    accepts: [EXACT_ACCEPT],
  };
  const payloadB64 = Buffer.from(JSON.stringify(challenge), "utf8").toString("base64");
  const cli = await run("onchainos", [
    "payment", "pay", "--payload", payloadB64, "--selected-index", "0", "--yes",
  ]);
  const parsed = JSON.parse(cli.stdout.trim() || "{}");
  const authHeader = parsed?.data?.authorization_header || parsed?.authorization_header;
  if (!authHeader) {
    console.log(JSON.stringify({
      label: "AB_amount_field",
      verdict: "SIGN_FAILED",
      exitCode: cli.code,
      stderrSafe: redact(cli.stderr || "").slice(0, 400),
    }, null, 2));
    process.exit(1);
  }
  const paymentPayload = decodePaymentPayload(authHeader);
  const accepted = paymentPayload.accepted;
  const report = {
    label: "AB_amount_field",
    note: "Secondary diagnostic only — primary result remains merchant maxAmountRequired shape",
    signOk: true,
    acceptedKeys: Object.keys(accepted || {}).sort(),
    acceptedAmount: accepted?.amount ?? null,
    acceptedMaxAmountRequired: accepted?.maxAmountRequired ?? null,
    acceptedExtra: accepted?.extra ?? null,
    authPath: paymentPayload?.payload?.authorization ? "eip3009" : "other",
    hasSignature: Boolean(paymentPayload?.payload?.signature),
  };

  const body = {
    x402Version: paymentPayload.x402Version ?? 2,
    paymentPayload,
    paymentRequirements: { ...accepted },
  };
  const rawBody = JSON.stringify(body);
  const timestamp = new Date().toISOString();
  const headers = {
    "OK-ACCESS-KEY": creds.apiKey,
    "OK-ACCESS-SIGN": sign(creds.secretKey, timestamp, "POST", VERIFY_PATH, rawBody),
    "OK-ACCESS-TIMESTAMP": timestamp,
    "OK-ACCESS-PASSPHRASE": creds.passphrase,
    "Content-Type": "application/json",
  };
  if (creds.projectId) headers["OK-ACCESS-PROJECT"] = creds.projectId;
  const res = await fetch(`${BASE}${VERIFY_PATH}`, { method: "POST", headers, body: rawBody });
  const json = await res.json();
  const data = json?.data;
  report.verify = {
    httpStatus: res.status,
    code: json?.code ?? null,
    msg: json?.msg ?? null,
    isValid: data?.isValid ?? null,
    invalidReason: data?.invalidReason ?? null,
    invalidMessage: data?.invalidMessage ?? null,
    payer: data?.payer ?? null,
  };
  report.verdict =
    data?.isValid === true
      ? "VALID"
      : data?.isValid === false
        ? `INVALID — ${data.invalidReason || "unknown"}`
        : "VERIFY_CALL_FAILED";
  console.log(JSON.stringify(report, null, 2));
  process.exit(report.verdict === "VALID" ? 0 : 1);
}

main().catch((e) => {
  console.log(JSON.stringify({ verdict: "FATAL", error: redact(e.message || e) }, null, 2));
  process.exit(1);
});
