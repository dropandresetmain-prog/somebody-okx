#!/usr/bin/env node
/**
 * M3 read-only OKX facilitator probe.
 *
 * Phase 1: GET /api/v6/pay/x402/supported
 * Phase 3 (optional): POST /api/v6/pay/x402/verify when SAFE_VERIFY_BODY_PATH is set
 *
 * Credentials: process env / .env.local only. Never prints secrets, auth headers,
 * signatures, or raw payment payloads.
 *
 * Usage:
 *   node scripts/m3-facilitator-probe.mjs              # /supported only
 *   node scripts/m3-facilitator-probe.mjs --verify-file <path>  # also /verify
 *
 * --verify-file must be a JSON file with { x402Version, paymentPayload, paymentRequirements }.
 * The file is read once, used in-memory, and should be deleted by the caller.
 */

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const BASE = "https://web3.okx.com";
const SUPPORTED_PATH = "/api/v6/pay/x402/supported";
const VERIFY_PATH = "/api/v6/pay/x402/verify";

function loadDotEnvLocal() {
  const envPath = path.join(ROOT, ".env.local");
  if (!fs.existsSync(envPath)) return;
  const text = fs.readFileSync(envPath, "utf8");
  for (const raw of text.split(/\r?\n/)) {
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

function present(name) {
  const v = process.env[name];
  return typeof v === "string" && v.length > 0;
}

function resolveCreds() {
  // Accept documented names + local aliases without inventing auth behavior.
  const apiKey = process.env.OKX_API_KEY;
  const secretKey = process.env.OKX_SECRET_KEY || process.env.OKX_API_SECRET;
  const passphrase =
    process.env.OKX_API_PASSPHRASE || process.env.OKX_PASSPHRASE;
  const projectId = process.env.OKX_PROJECT_ID;

  const missing = [];
  if (!apiKey) missing.push("OKX_API_KEY");
  if (!secretKey) missing.push("OKX_SECRET_KEY (or alias OKX_API_SECRET)");
  if (!passphrase) missing.push("OKX_API_PASSPHRASE (or alias OKX_PASSPHRASE)");
  // Project ID is required by some Onchain OS APIs (OK-ACCESS-PROJECT).
  // x402 payment docs list only the four OK-ACCESS-* headers; we include
  // PROJECT when present and report when absent.
  return { apiKey, secretKey, passphrase, projectId, missing };
}

function sign(secretKey, timestamp, method, requestPath, rawBody = "") {
  const prehash = timestamp + method.toUpperCase() + requestPath + rawBody;
  return crypto.createHmac("sha256", secretKey).update(prehash).digest("base64");
}

function buildHeaders({ apiKey, secretKey, passphrase, projectId }, method, requestPath, rawBody = "") {
  const timestamp = new Date().toISOString();
  const headers = {
    "OK-ACCESS-KEY": apiKey,
    "OK-ACCESS-SIGN": sign(secretKey, timestamp, method, requestPath, rawBody),
    "OK-ACCESS-TIMESTAMP": timestamp,
    "OK-ACCESS-PASSPHRASE": passphrase,
  };
  if (projectId) headers["OK-ACCESS-PROJECT"] = projectId;
  if (method.toUpperCase() === "POST") {
    headers["Content-Type"] = "application/json";
  }
  return headers;
}

function redactError(err) {
  const msg = String(err && err.message ? err.message : err);
  return msg
    .replace(/OK-ACCESS-[A-Z-]+=\S+/gi, "OK-ACCESS-*=REDACTED")
    .replace(/0x[a-fA-F0-9]{20,}/g, "0xREDACTED");
}

function summarizeKinds(data) {
  const kinds = Array.isArray(data?.kinds) ? data.kinds : [];
  const summary = kinds.map((k) => ({
    x402Version: k.x402Version,
    scheme: k.scheme,
    network: k.network,
    extra: k.extra ?? null,
  }));

  const hasExact1952 = kinds.some(
    (k) => k.scheme === "exact" && k.network === "eip155:1952"
  );
  const hasExact196 = kinds.some(
    (k) => k.scheme === "exact" && k.network === "eip155:196"
  );
  const networks = [...new Set(kinds.map((k) => k.network))].sort();
  const schemes = [...new Set(kinds.map((k) => k.scheme))].sort();
  const exact1952Variants = kinds.filter(
    (k) => k.scheme === "exact" && k.network === "eip155:1952"
  );
  const exact196Variants = kinds.filter(
    (k) => k.scheme === "exact" && k.network === "eip155:196"
  );
  const aggr1952 = kinds.filter(
    (k) => k.scheme === "aggr_deferred" && k.network === "eip155:1952"
  );
  const aggr196 = kinds.filter(
    (k) => k.scheme === "aggr_deferred" && k.network === "eip155:196"
  );

  return {
    kindCount: kinds.length,
    networks,
    schemes,
    hasExact1952,
    hasExact196,
    exact1952Variants,
    exact196Variants,
    aggr1952,
    aggr196,
    extensions: data?.extensions ?? [],
    signersKeys: data?.signers ? Object.keys(data.signers) : [],
    kinds: summary,
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
    // Keep only known safe top-level keys; never echo nested payloads.
    topLevelKeys: Object.keys(data).sort(),
  };
}

async function okxRequest(creds, method, requestPath, bodyObj = null) {
  const rawBody = bodyObj == null ? "" : JSON.stringify(bodyObj);
  const headers = buildHeaders(creds, method, requestPath, rawBody);
  const res = await fetch(`${BASE}${requestPath}`, {
    method,
    headers,
    body: bodyObj == null ? undefined : rawBody,
  });
  const text = await res.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    json = null;
  }
  return {
    httpStatus: res.status,
    // Never return request headers.
    code: json?.code ?? null,
    msg: json?.msg ?? null,
    data: json?.data ?? null,
    parseOk: json != null,
    bodyLen: text.length,
  };
}

async function main() {
  loadDotEnvLocal();

  const args = process.argv.slice(2);
  let verifyFile = null;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--verify-file" && args[i + 1]) {
      verifyFile = args[++i];
    }
  }

  const creds = resolveCreds();
  const envPresence = {
    OKX_API_KEY: present("OKX_API_KEY"),
    OKX_SECRET_KEY: present("OKX_SECRET_KEY"),
    OKX_API_SECRET: present("OKX_API_SECRET"),
    OKX_API_PASSPHRASE: present("OKX_API_PASSPHRASE"),
    OKX_PASSPHRASE: present("OKX_PASSPHRASE"),
    OKX_PROJECT_ID: present("OKX_PROJECT_ID"),
    secretResolved: Boolean(creds.secretKey),
    passphraseResolved: Boolean(creds.passphrase),
    projectIdResolved: Boolean(creds.projectId),
  };

  const report = {
    probedAt: new Date().toISOString(),
    docsRef: "https://web3.okx.com/onchainos/dev-docs/payments/api-http-onetime",
    authRef: "https://web3.okx.com/onchainos/dev-docs/home/api-access-and-usage",
    envPresence,
    missingRequired: creds.missing,
    projectIdNote: creds.projectId
      ? "OK-ACCESS-PROJECT included (present in env)"
      : "OKX_PROJECT_ID absent; x402 docs omit PROJECT header — requesting without it",
    supported: null,
    verify: null,
    case: null,
  };

  if (creds.missing.length > 0) {
    report.case = "BLOCKED_MISSING_CREDENTIALS";
    console.log(JSON.stringify(report, null, 2));
    process.exit(2);
  }

  try {
    const supported = await okxRequest(creds, "GET", SUPPORTED_PATH);
    // Official envelope uses string "0"; some responses may coerce to number 0.
    const codeOk = supported.code === "0" || supported.code === 0;
    const safe =
      codeOk && supported.data
        ? summarizeKinds(supported.data)
        : null;
    report.supported = {
      httpStatus: supported.httpStatus,
      code: supported.code,
      msg: supported.msg,
      parseOk: supported.parseOk,
      bodyLen: supported.bodyLen,
      dataType: supported.data == null ? "null" : Array.isArray(supported.data) ? "array" : typeof supported.data,
      dataKeys:
        supported.data && typeof supported.data === "object" && !Array.isArray(supported.data)
          ? Object.keys(supported.data).sort()
          : null,
      summary: safe,
    };
    if (safe) {
      report.case = safe.hasExact1952
        ? "CASE_B_EXACT_1952_PRESENT"
        : "CASE_A_EXACT_1952_ABSENT";
    } else {
      report.case = "SUPPORTED_CALL_FAILED";
    }
  } catch (err) {
    report.supported = { error: redactError(err) };
    report.case = "SUPPORTED_CALL_FAILED";
  }

  if (verifyFile && report.case === "CASE_B_EXACT_1952_PRESENT") {
    try {
      const abs = path.resolve(verifyFile);
      const raw = fs.readFileSync(abs, "utf8");
      const body = JSON.parse(raw);
      // Wipe file contents from disk immediately after read (best-effort).
      try {
        fs.writeFileSync(abs, '{"redacted":true}\n', "utf8");
      } catch {
        /* ignore */
      }
      const required = ["x402Version", "paymentPayload", "paymentRequirements"];
      const bodyMissing = required.filter((k) => body[k] === undefined);
      if (bodyMissing.length) {
        report.verify = { error: `verify body missing keys: ${bodyMissing.join(",")}` };
      } else {
        const verify = await okxRequest(creds, "POST", VERIFY_PATH, {
          x402Version: body.x402Version,
          paymentPayload: body.paymentPayload,
          paymentRequirements: body.paymentRequirements,
        });
        const verifyCodeOk = verify.code === "0" || verify.code === 0;
        report.verify = {
          httpStatus: verify.httpStatus,
          code: verify.code,
          msg: verify.msg,
          parseOk: verify.parseOk,
          summary: verifyCodeOk ? summarizeVerify(verify.data) : null,
          // If business error, keep only code/msg — no payload echo.
        };
      }
    } catch (err) {
      report.verify = { error: redactError(err) };
    }
  } else if (verifyFile) {
    report.verify = {
      skipped: true,
      reason: "verify only runs when /supported Case B is confirmed",
    };
  }

  console.log(JSON.stringify(report, null, 2));
  process.exit(report.case === "CASE_B_EXACT_1952_PRESENT" || report.case === "CASE_A_EXACT_1952_ABSENT" ? 0 : 1);
}

main().catch((err) => {
  console.log(
    JSON.stringify(
      { case: "FATAL", error: redactError(err) },
      null,
      2
    )
  );
  process.exit(1);
});
