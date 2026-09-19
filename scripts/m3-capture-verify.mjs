#!/usr/bin/env node
/**
 * M3 Phase 2+3: TEE sign-only capture → OKX /verify (no settle, no merchant).
 *
 * - Builds a challenge matching live Mock Merchant exact terms (not corrected).
 * - Signs via `onchainos payment pay --payload` (Agentic Wallet TEE; NOT pay-local).
 * - Does NOT replay to Mock Merchant.
 * - Posts the same accepted requirements to /verify.
 * - Never prints raw signature / PAYMENT-SIGNATURE / auth headers.
 * - Keeps authorization only in process memory; wipes temp files.
 */

import { spawn } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const BASE = "https://web3.okx.com";
const VERIFY_PATH = "/api/v6/pay/x402/verify";

// Live Mock Merchant exact terms (from M3_LIVE_SESSION) — do not "fix" version/asset.
const EXACT_ACCEPT = {
  scheme: "exact",
  network: "eip155:1952",
  maxAmountRequired: "10000",
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
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    if (process.env[key] === undefined) process.env[key] = val;
  }
}

function redact(s) {
  return String(s)
    .replace(/OK-ACCESS-[A-Z-]+=\S+/gi, "OK-ACCESS-*=REDACTED")
    .replace(/0x[a-fA-F0-9]{20,}/g, "0xREDACTED")
    .replace(/[A-Za-z0-9+/]{40,}={0,2}/g, (m) =>
      m.length >= 64 ? `B64_REDACTED_LEN_${m.length}` : m
    );
}

function resolveCreds() {
  const apiKey = process.env.OKX_API_KEY;
  const secretKey = process.env.OKX_SECRET_KEY || process.env.OKX_API_SECRET;
  const passphrase =
    process.env.OKX_API_PASSPHRASE || process.env.OKX_PASSPHRASE;
  const projectId = process.env.OKX_PROJECT_ID;
  const missing = [];
  if (!apiKey) missing.push("OKX_API_KEY");
  if (!secretKey) missing.push("OKX_SECRET_KEY|OKX_API_SECRET");
  if (!passphrase) missing.push("OKX_API_PASSPHRASE|OKX_PASSPHRASE");
  return { apiKey, secretKey, passphrase, projectId, missing };
}

function sign(secretKey, timestamp, method, requestPath, rawBody = "") {
  return crypto
    .createHmac("sha256", secretKey)
    .update(timestamp + method.toUpperCase() + requestPath + rawBody)
    .digest("base64");
}

function run(cmd, args, { timeoutMs = 120_000 } = {}) {
  return new Promise((resolve) => {
    const child = spawn(cmd, args, {
      shell: false,
      windowsHide: true,
      env: process.env,
    });
    let stdout = "";
    let stderr = "";
    const timer = setTimeout(() => {
      try {
        child.kill();
      } catch {
        /* ignore */
      }
    }, timeoutMs);
    child.stdout.on("data", (d) => {
      stdout += d.toString("utf8");
    });
    child.stderr.on("data", (d) => {
      stderr += d.toString("utf8");
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      resolve({ code, stdout, stderr });
    });
    child.on("error", (err) => {
      clearTimeout(timer);
      resolve({ code: -1, stdout, stderr: String(err.message || err) });
    });
  });
}

function safeCliMeta(parsed) {
  if (!parsed || typeof parsed !== "object") return { parseOk: false };
  return {
    parseOk: true,
    topKeys: Object.keys(parsed).sort(),
    ok: parsed.ok,
    header_name: parsed.header_name ?? parsed.data?.header_name ?? null,
    scheme: parsed.scheme ?? parsed.data?.scheme ?? null,
    walletPresent: Boolean(parsed.wallet ?? parsed.data?.wallet),
    hasAuthorizationHeader: Boolean(
      parsed.authorization_header ?? parsed.data?.authorization_header
    ),
    error: parsed.error ? redact(String(parsed.error)) : null,
  };
}

function extractAuthorizationHeader(parsed) {
  return (
    parsed?.authorization_header ||
    parsed?.data?.authorization_header ||
    null
  );
}

function decodePaymentPayload(authorizationHeader) {
  // Header value is base64 (or base64url) of PaymentPayload JSON.
  const normalized = authorizationHeader.replace(/-/g, "+").replace(/_/g, "/");
  const pad = normalized.length % 4 === 0 ? "" : "=".repeat(4 - (normalized.length % 4));
  const json = Buffer.from(normalized + pad, "base64").toString("utf8");
  return JSON.parse(json);
}

function safePayloadMeta(paymentPayload) {
  const auth = paymentPayload?.payload?.authorization;
  const p2 = paymentPayload?.payload?.permit2Authorization;
  return {
    x402Version: paymentPayload?.x402Version ?? null,
    acceptedScheme: paymentPayload?.accepted?.scheme ?? null,
    acceptedNetwork: paymentPayload?.accepted?.network ?? null,
    acceptedAsset: paymentPayload?.accepted?.asset ?? null,
    acceptedAmount:
      paymentPayload?.accepted?.amount ??
      paymentPayload?.accepted?.maxAmountRequired ??
      null,
    acceptedPayTo: paymentPayload?.accepted?.payTo ?? null,
    acceptedExtra: paymentPayload?.accepted?.extra ?? null,
    resource: paymentPayload?.resource ?? null,
    hasSignature: Boolean(paymentPayload?.payload?.signature),
    signatureLen: paymentPayload?.payload?.signature
      ? String(paymentPayload.payload.signature).length
      : 0,
    authPath: auth ? "eip3009" : p2 ? "permit2" : "unknown",
    authFrom: auth?.from ?? p2?.from ?? null,
    authTo: auth?.to ?? p2?.witness?.to ?? null,
    authValue: auth?.value ?? p2?.permitted?.amount ?? null,
    validAfter: auth?.validAfter ?? p2?.witness?.validAfter ?? null,
    validBefore: auth?.validBefore ?? p2?.deadline ?? null,
    hasNonce: Boolean(auth?.nonce ?? p2?.nonce),
  };
}

function toPaymentRequirements(accepted) {
  // Use EXACTLY the accepted object that was signed — do not mutate fields.
  // Official /verify schema uses `amount`; if CLI left maxAmountRequired only,
  // keep as-is (preserve contradiction rather than silently correcting).
  return { ...accepted };
}

async function okxVerify(creds, body) {
  const rawBody = JSON.stringify(body);
  const timestamp = new Date().toISOString();
  const headers = {
    "OK-ACCESS-KEY": creds.apiKey,
    "OK-ACCESS-SIGN": sign(
      creds.secretKey,
      timestamp,
      "POST",
      VERIFY_PATH,
      rawBody
    ),
    "OK-ACCESS-TIMESTAMP": timestamp,
    "OK-ACCESS-PASSPHRASE": creds.passphrase,
    "Content-Type": "application/json",
  };
  if (creds.projectId) headers["OK-ACCESS-PROJECT"] = creds.projectId;

  const res = await fetch(`${BASE}${VERIFY_PATH}`, {
    method: "POST",
    headers,
    body: rawBody,
  });
  const text = await res.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {
    /* ignore */
  }
  return {
    httpStatus: res.status,
    code: json?.code ?? null,
    msg: json?.msg ?? null,
    data: json?.data ?? null,
    parseOk: json != null,
    bodyLen: text.length,
  };
}

function summarizeVerify(data) {
  if (!data || typeof data !== "object") return { rawType: typeof data };
  return {
    isValid: data.isValid,
    invalidReason: data.invalidReason ?? null,
    invalidMessage: data.invalidMessage ?? null,
    payer: data.payer ?? null,
    network: data.network ?? null,
    topLevelKeys: Object.keys(data).sort(),
  };
}

async function main() {
  loadDotEnvLocal();
  const report = {
    probedAt: new Date().toISOString(),
    method:
      "onchainos payment pay --payload (TEE sign-only; no merchant replay; no settle)",
    challengeSource: "live Mock Merchant exact terms (USDC_TEST version 1)",
    sign: null,
    verify: null,
    verdict: null,
  };

  const creds = resolveCreds();
  if (creds.missing.length) {
    report.verdict = "BLOCKED_MISSING_CREDENTIALS";
    report.missing = creds.missing;
    console.log(JSON.stringify(report, null, 2));
    process.exit(2);
  }

  const challenge = {
    x402Version: 2,
    resource: {
      url: "/api/v1/pay/mock-merchant/resource",
      mimeType: "application/json",
    },
    accepts: [
      EXACT_ACCEPT,
      {
        ...EXACT_ACCEPT,
        scheme: "aggr_deferred",
      },
    ],
  };

  const payloadB64 = Buffer.from(
    JSON.stringify(challenge),
    "utf8"
  ).toString("base64");

  // Sign via TEE. Do not use pay-local.
  const cli = await run("onchainos", [
    "payment",
    "pay",
    "--payload",
    payloadB64,
    "--selected-index",
    "0",
    "--yes",
  ]);

  let parsed = null;
  try {
    parsed = JSON.parse(cli.stdout.trim() || "{}");
  } catch {
    parsed = null;
  }

  report.sign = {
    exitCode: cli.code,
    stderrSafe: redact(cli.stderr || "").slice(0, 500),
    stdoutLen: (cli.stdout || "").length,
    meta: safeCliMeta(parsed),
  };

  const authHeader = parsed ? extractAuthorizationHeader(parsed) : null;
  if (!authHeader) {
    // Try nested ok:false structures
    report.verdict = "SIGN_FAILED_NO_AUTHORIZATION";
    console.log(JSON.stringify(report, null, 2));
    process.exit(1);
  }

  let paymentPayload;
  try {
    paymentPayload = decodePaymentPayload(authHeader);
  } catch (err) {
    report.verdict = "SIGN_DECODE_FAILED";
    report.sign.decodeError = redact(err.message || err);
    console.log(JSON.stringify(report, null, 2));
    process.exit(1);
  }

  report.sign.payloadMeta = safePayloadMeta(paymentPayload);

  const paymentRequirements = toPaymentRequirements(paymentPayload.accepted);
  const verifyBody = {
    x402Version: paymentPayload.x402Version ?? 2,
    paymentPayload,
    paymentRequirements,
  };

  // Optional ephemeral file for debugging path — write then immediately wipe.
  const tmp = path.join(os.tmpdir(), `m3-verify-${crypto.randomBytes(8).toString("hex")}.json`);
  try {
    fs.writeFileSync(tmp, JSON.stringify(verifyBody), { mode: 0o600 });
  } catch {
    /* ignore */
  }

  try {
    const verify = await okxVerify(creds, verifyBody);
    const codeOk = verify.code === "0" || verify.code === 0;
    report.verify = {
      httpStatus: verify.httpStatus,
      code: verify.code,
      msg: verify.msg,
      parseOk: verify.parseOk,
      bodyLen: verify.bodyLen,
      summary: codeOk ? summarizeVerify(verify.data) : null,
    };
    if (codeOk && verify.data?.isValid === true) {
      report.verdict = "VALID";
    } else if (codeOk && verify.data?.isValid === false) {
      report.verdict = `INVALID — ${verify.data.invalidReason || "unknown"}`;
    } else {
      report.verdict = "VERIFY_CALL_FAILED";
    }
  } catch (err) {
    report.verify = { error: redact(err.message || err) };
    report.verdict = "VERIFY_CALL_FAILED";
  } finally {
    // Wipe sensitive material from disk and encourage GC of in-memory refs.
    try {
      if (fs.existsSync(tmp)) fs.writeFileSync(tmp, '{"redacted":true}\n');
      if (fs.existsSync(tmp)) fs.unlinkSync(tmp);
    } catch {
      /* ignore */
    }
    paymentPayload = null;
  }

  console.log(JSON.stringify(report, null, 2));
  process.exit(report.verdict === "VALID" ? 0 : 1);
}

main().catch((err) => {
  console.log(
    JSON.stringify({ verdict: "FATAL", error: redact(err.message || err) }, null, 2)
  );
  process.exit(1);
});
