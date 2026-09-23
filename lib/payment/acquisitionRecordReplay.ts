/**
 * M2-I — OPT-IN verified external acquisition record/replay.
 * V7 review R1 — authenticated canonical acquisition binding.
 *
 * Truthfulness contract:
 * - DISABLED BY DEFAULT. Recording and replay exist only when the operator
 *   explicitly sets M3_VERIFIED_ACQUISITION_RECORD_DIR to an absolute path.
 *   Replay while disabled throws a loud "disabled" error — it can never
 *   silently no-op into a fabricated record or replay.
 * - Enabled ALSO requires M3_VERIFIED_ACQUISITION_RECORD_KEY: a dedicated
 *   record-authentication key (environment/secure store only; never a wallet
 *   key, never the bridge bearer token, never the fact-attestation key).
 *   Enabled-without-key refuses explicitly.
 * - ONE canonical binding per record: the originating intent identity, the
 *   complete purchase identity, the authorized normalized request (provider,
 *   service, offering, resource class, validated purpose scope, normalized
 *   purpose), the strictly-parsed protected result, its content hash and the
 *   recomputed verification proof. The content that replay RETURNS is the
 *   verified result's own `content` — there is no second, separately editable
 *   copy. The whole binding is authenticated with HMAC-SHA256 under an
 *   explicit domain tag, so editing the file (content, result, metadata,
 *   provenance, or retagging it to another request/Objective) — even while
 *   recomputing any plain hash — is refused.
 * - ONLY VERIFIED results are recordable; verification is RECOMPUTED with the
 *   production verifier (a claimed proof is never trusted).
 * - REPLAY re-derives the expected binding from the REQUESTING intent/purchase
 *   and requires canonical equality with the authenticated stored binding, and
 *   re-runs production verification on the stored result. Any mismatch,
 *   malformed shape, legacy (unauthenticated) record or absence refuses
 *   without fallback.
 * - A replayed acquisition is labeled `recorded_replay` — never `live`, never
 *   `simulation` — and keeps the original payload's source provenance and
 *   limitation. A shape-valid record is NOT proof that a genuine live
 *   acquisition happened; it is only proof the record was written by a holder
 *   of the record key for a result that verified at that time.
 * - This module performs no provider, merchant, network, wallet, or payment
 *   call and creates no transaction.
 */
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

import { sha256Hex } from "../management/sha256";
import { parseM3ProtectedSuccess, m3AuthorizedRequestFromIntent } from "./m3FounderNarrativeProduct";
import type { M3AuthorizedRequest, M3ProtectedSuccessResult } from "./m3FounderNarrativeProduct";
import { verifyProductionM3Result } from "./localProductionComposition";
import { purchaseIdentityFromIntent } from "../management/m3BuyerRail";
import type { PurchaseRecord } from "./types";
import type { ExecutionIntent } from "../management/types";

export const ACQUISITION_RECORD_ENV = "M3_VERIFIED_ACQUISITION_RECORD_DIR" as const;
export const ACQUISITION_RECORD_KEY_ENV = "M3_VERIFIED_ACQUISITION_RECORD_KEY" as const;
/** Secrets the record key must never equal (distinct authorities). */
const DISTINCT_SECRET_ENVS = ["M4_M3_DRIVER_TOKEN", "M4_M3_FACT_ATTESTATION_KEY", "SOMEBODY_DEMO_OPERATOR_TOKEN"] as const;
const MIN_KEY_LENGTH = 32;

export const ACQUISITION_RECORD_FORMAT = "somebody.verified-acquisition-record" as const;
export const ACQUISITION_RECORD_VERSION = 2 as const;
/** Domain separation: this MAC can never be confused with any other HMAC use. */
const MAC_DOMAIN = "somebody/v7/verified-acquisition-record/v2/hmac-sha256";
const MAX_RECORD_BYTES = 256 * 1024;

/** Resolved record directory, or null when the opt-in gate is off. */
export function resolveAcquisitionRecordDirectory(env: Record<string, string | undefined> = process.env): string | null {
  const raw = env[ACQUISITION_RECORD_ENV]?.trim();
  if (!raw) return null;
  if (!path.isAbsolute(raw)) {
    throw new Error(`${ACQUISITION_RECORD_ENV} must be an absolute path; refusing a relative record directory`);
  }
  return path.resolve(raw); // normalized, no trailing separator
}

/** The record-authentication key; throws explicitly when enabled but unusable. */
function requireRecordKey(env: Record<string, string | undefined>): string {
  const key = env[ACQUISITION_RECORD_KEY_ENV];
  if (!key || key.trim().length === 0) {
    throw new Error(
      `verified acquisition record/replay is enabled but ${ACQUISITION_RECORD_KEY_ENV} is not configured — refusing to record or replay without record authentication`,
    );
  }
  if (key.length < MIN_KEY_LENGTH) {
    throw new Error(`${ACQUISITION_RECORD_KEY_ENV} must be at least ${MIN_KEY_LENGTH} characters`);
  }
  for (const other of DISTINCT_SECRET_ENVS) {
    if (env[other] && env[other] === key) {
      throw new Error(`${ACQUISITION_RECORD_KEY_ENV} must be distinct from ${other}`);
    }
  }
  return key;
}

function requireEnabled(env: Record<string, string | undefined>): { dir: string; key: string } {
  const dir = resolveAcquisitionRecordDirectory(env);
  if (!dir) {
    throw new Error(
      "verified acquisition record/replay is DISABLED: set the absolute path " +
        `${ACQUISITION_RECORD_ENV} to opt in; nothing is recorded or replayed without it`,
    );
  }
  return { dir, key: requireRecordKey(env) };
}

// ── The canonical binding ────────────────────────────────────────────────────

/** Exactly the material identity/scope/result fields; nothing is spread. */
export type AcquisitionBinding = {
  intent: {
    intentId: string;
    idempotencyKey: string;
    objectiveKey: string;
    requirementKey: string;
    contractRevision: number;
    decisionId: string;
    kind: string;
    strategy: string;
    needDedupeKey: string | null;
    resourceNeedId: string | null;
  };
  purchase: {
    id: string;
    objectiveKey: string;
    resourceNeedId: string;
    offeringId: string;
    idempotencyKey: string;
  };
  request: M3AuthorizedRequest;
  result: M3ProtectedSuccessResult;
  /** sha256 of result.content (the content replay returns). */
  contentHash: string;
  verificationProof: string;
};

export type VerifiedAcquisitionRecord = {
  format: typeof ACQUISITION_RECORD_FORMAT;
  version: typeof ACQUISITION_RECORD_VERSION;
  binding: AcquisitionBinding;
  recordedAt: number;
  /** hex HMAC-SHA256(recordKey, domain || canonical({format,version,binding,recordedAt})) */
  mac: string;
};

export type VerifiedAcquisitionReplay = {
  provenance: "recorded_replay";
  /** The verified result's own content — the only content in the record. */
  content: string;
  contentHash: string;
  /** The original payload's source provenance/limitation, unchanged. */
  sourceProvenance: M3ProtectedSuccessResult["provenance"];
  limitation: string;
  result: M3ProtectedSuccessResult;
  binding: AcquisitionBinding;
  recordedAt: number;
};

/**
 * Deterministic JSON: sorted object keys, no undefined, finite numbers only.
 * Refuses anything it cannot encode unambiguously.
 */
export function canonicalJson(value: unknown): string {
  if (value === null) return "null";
  if (typeof value === "string" || typeof value === "boolean") return JSON.stringify(value);
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new Error("canonicalJson: non-finite number");
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (typeof value === "object") {
    const record = value as Record<string, unknown>;
    const keys = Object.keys(record).sort();
    return `{${keys
      .map((key) => {
        if (record[key] === undefined) throw new Error(`canonicalJson: undefined at ${key}`);
        return `${JSON.stringify(key)}:${canonicalJson(record[key])}`;
      })
      .join(",")}}`;
  }
  throw new Error(`canonicalJson: unsupported ${typeof value}`);
}

function macFor(key: string, envelope: Omit<VerifiedAcquisitionRecord, "mac">): string {
  return crypto.createHmac("sha256", key).update(`${MAC_DOMAIN}\n${canonicalJson(envelope)}`, "utf8").digest("hex");
}

function macEqual(left: string, right: string): boolean {
  const a = Buffer.from(left, "hex");
  const b = Buffer.from(right, "hex");
  return a.length === 32 && b.length === 32 && crypto.timingSafeEqual(a, b);
}

/**
 * Build the ONE canonical binding for (intent, purchase, result). Refuses
 * unless the result verifies for exactly this intent/purchase right now.
 */
function buildBinding(intent: ExecutionIntent, purchase: PurchaseRecord, rawResult: unknown): AcquisitionBinding {
  const verification = verifyProductionM3Result({ intent, purchase, result: rawResult });
  if (!verification.verified) {
    throw new Error(`acquisition result does not verify for this request: ${verification.verificationProof}`);
  }
  const result = parseM3ProtectedSuccess(rawResult);
  const authorized = m3AuthorizedRequestFromIntent(intent);
  if (!result || !authorized.ok) {
    // Unreachable after a verified proof; kept so a verifier change cannot
    // silently produce a partial binding.
    throw new Error("acquisition result/authority is not canonical");
  }
  const identity = purchaseIdentityFromIntent(intent);
  return {
    intent: {
      intentId: intent.intentId,
      idempotencyKey: intent.idempotencyKey,
      objectiveKey: intent.objectiveKey,
      requirementKey: intent.requirementKey,
      contractRevision: intent.contractRevision,
      decisionId: intent.decisionId,
      kind: intent.kind,
      strategy: intent.strategy,
      needDedupeKey: intent.needDedupeKey ?? null,
      resourceNeedId: intent.resourceNeedId ?? null,
    },
    purchase: {
      id: identity.id,
      objectiveKey: identity.objectiveKey,
      resourceNeedId: identity.resourceNeedId,
      offeringId: identity.offeringId,
      idempotencyKey: identity.idempotencyKey,
    },
    request: { ...authorized.request },
    result,
    contentHash: sha256Hex(result.content),
    verificationProof: verification.verificationProof,
  };
}

// ── Strict runtime parsing of a stored record ────────────────────────────────

function isRecordObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function hasExactKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
  const own = Object.keys(value);
  return own.length === keys.length && keys.every((key) => Object.prototype.hasOwnProperty.call(value, key));
}
const str = (value: unknown, max = 512): value is string =>
  typeof value === "string" && value.length > 0 && value.length <= max;
const strOrNull = (value: unknown): value is string | null => value === null || str(value);

/** Shape/bounds check of a parsed record; the MAC and binding are checked separately. */
function parseStoredRecord(raw: unknown): VerifiedAcquisitionRecord {
  const malformed = (why: string) => new Error(`verified acquisition record is malformed: ${why}`);
  if (!isRecordObject(raw)) throw malformed("not an object");
  if (raw.version === 1 || !("format" in raw)) {
    throw new Error("verified acquisition record is a legacy unauthenticated format — refusing an unverifiable replay");
  }
  if (!hasExactKeys(raw, ["format", "version", "binding", "recordedAt", "mac"])) throw malformed("unexpected envelope keys");
  if (raw.format !== ACQUISITION_RECORD_FORMAT || raw.version !== ACQUISITION_RECORD_VERSION) throw malformed("incompatible format/version");
  if (typeof raw.recordedAt !== "number" || !Number.isSafeInteger(raw.recordedAt) || raw.recordedAt < 0) throw malformed("recordedAt");
  if (typeof raw.mac !== "string" || !/^[0-9a-f]{64}$/.test(raw.mac)) throw malformed("mac");
  const b = raw.binding;
  if (!isRecordObject(b) || !hasExactKeys(b, ["intent", "purchase", "request", "result", "contentHash", "verificationProof"])) throw malformed("binding keys");
  const i = b.intent;
  if (!isRecordObject(i) || !hasExactKeys(i, ["intentId", "idempotencyKey", "objectiveKey", "requirementKey", "contractRevision", "decisionId", "kind", "strategy", "needDedupeKey", "resourceNeedId"])) throw malformed("intent keys");
  if (![i.intentId, i.idempotencyKey, i.objectiveKey, i.requirementKey, i.decisionId, i.kind, i.strategy].every((v) => str(v))) throw malformed("intent fields");
  if (typeof i.contractRevision !== "number" || !Number.isSafeInteger(i.contractRevision)) throw malformed("contractRevision");
  if (!strOrNull(i.needDedupeKey) || !strOrNull(i.resourceNeedId)) throw malformed("need identity");
  const p = b.purchase;
  if (!isRecordObject(p) || !hasExactKeys(p, ["id", "objectiveKey", "resourceNeedId", "offeringId", "idempotencyKey"])) throw malformed("purchase keys");
  if (![p.id, p.objectiveKey, p.resourceNeedId, p.offeringId, p.idempotencyKey].every((v) => str(v))) throw malformed("purchase fields");
  const q = b.request;
  if (!isRecordObject(q) || !hasExactKeys(q, ["requestId", "providerId", "serviceId", "offeringId", "resourceClass", "purposeKind", "purpose"])) throw malformed("request keys");
  if (![q.requestId, q.providerId, q.serviceId, q.offeringId, q.resourceClass, q.purposeKind].every((v) => str(v)) || !str(q.purpose, 500)) throw malformed("request fields");
  const result = parseM3ProtectedSuccess(b.result);
  if (!result) throw malformed("protected result shape");
  // The stored result must BE its canonical projection (no extra/altered keys).
  if (canonicalJson(result) !== canonicalJson(b.result)) throw malformed("protected result is not canonical");
  if (typeof b.contentHash !== "string" || !/^[0-9a-f]{64}$/.test(b.contentHash)) throw malformed("contentHash");
  if (!str(b.verificationProof, 2_000)) throw malformed("verificationProof");
  return raw as unknown as VerifiedAcquisitionRecord;
}

function recordFile(dir: string, requestId: string): string {
  if (!/^[A-Za-z0-9_.:-]{1,128}$/.test(requestId) || requestId.includes("..")) {
    throw new Error("requestId is not a safe record key");
  }
  const file = path.join(dir, `verified-acquisition-${requestId}.json`);
  if (path.dirname(file) !== dir) throw new Error("record path escapes the record directory");
  return file;
}

function readRecordFile(file: string): unknown {
  const stat = fs.lstatSync(file);
  if (!stat.isFile()) throw new Error("verified acquisition record is not a regular file — refusing");
  if (stat.size > MAX_RECORD_BYTES) throw new Error("verified acquisition record exceeds its size bound — refusing");
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    throw new Error("verified acquisition record is malformed: not JSON");
  }
}

/**
 * Authenticate a stored record and prove it is the canonical acquisition for
 * THIS intent/purchase. Returns the authenticated record or throws.
 */
function authenticateForRequest(input: {
  raw: unknown;
  key: string;
  intent: ExecutionIntent;
  purchase: PurchaseRecord;
}): VerifiedAcquisitionRecord {
  const record = parseStoredRecord(input.raw);
  const { mac, ...envelope } = record;
  if (!macEqual(mac, macFor(input.key, envelope))) {
    throw new Error("verified acquisition record failed authentication — refusing a tampered, substituted or foreign-key record");
  }
  // Re-derive the expected binding from the REQUESTING intent/purchase and the
  // authenticated stored result (production verification re-runs inside).
  let expected: AcquisitionBinding;
  try {
    expected = buildBinding(input.intent, input.purchase, record.binding.result);
  } catch (error) {
    throw new Error(`stored acquisition no longer verifies for this request: ${error instanceof Error ? error.message : String(error)}`);
  }
  if (canonicalJson(expected) !== canonicalJson(record.binding)) {
    throw new Error("verified acquisition record is bound to a different request/Objective/scope — cross-request replay refused");
  }
  return record;
}

// ── Record ───────────────────────────────────────────────────────────────────

/**
 * Record one acquisition result that verifies RIGHT NOW against this exact
 * intent/purchase. Returns null (and records nothing) when the gate is off.
 * First write wins atomically (exclusive create — never check-then-overwrite).
 * An existing record is returned only if it authenticates AND is the same
 * canonical binding; anything else is an explicit immutability conflict.
 */
export function recordVerifiedAcquisition(input: {
  intent: ExecutionIntent;
  purchase: PurchaseRecord;
  result: unknown;
  recordedAt: number;
  env?: Record<string, string | undefined>;
}): VerifiedAcquisitionRecord | null {
  const env = input.env ?? process.env;
  if (!resolveAcquisitionRecordDirectory(env)) return null; // plumbing present, disabled — never records
  const { dir, key } = requireEnabled(env);
  if (!Number.isSafeInteger(input.recordedAt) || input.recordedAt < 0) throw new Error("recordedAt must be a non-negative integer");
  let binding: AcquisitionBinding;
  try {
    binding = buildBinding(input.intent, input.purchase, input.result);
  } catch (error) {
    throw new Error(`refusing to record an unverified acquisition result: ${error instanceof Error ? error.message : String(error)}`);
  }
  const envelope = { format: ACQUISITION_RECORD_FORMAT, version: ACQUISITION_RECORD_VERSION, binding, recordedAt: input.recordedAt };
  const record: VerifiedAcquisitionRecord = { ...envelope, mac: macFor(key, envelope) };

  fs.mkdirSync(dir, { recursive: true });
  const file = recordFile(dir, binding.request.requestId);
  const temp = path.join(dir, `.tmp-${crypto.randomBytes(12).toString("hex")}.json`);
  fs.writeFileSync(temp, JSON.stringify(record, null, 2), { encoding: "utf8", flag: "wx" });
  try {
    try {
      // Atomic, no-overwrite publish of a COMPLETE file: link fails with
      // EEXIST if any record (even a concurrent one) already won.
      fs.linkSync(temp, file);
      return record;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
    }
    let existing: VerifiedAcquisitionRecord;
    try {
      existing = authenticateForRequest({ raw: readRecordFile(file), key, intent: input.intent, purchase: input.purchase });
    } catch (error) {
      throw new Error(
        `verified acquisition record for ${binding.request.requestId} is immutable — the existing record is not this acquisition and is left untouched: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
    if (canonicalJson(existing.binding) !== canonicalJson(binding)) {
      throw new Error(`verified acquisition record for ${binding.request.requestId} is immutable — refusing to overwrite a different verified result`);
    }
    return existing; // idempotent: the same canonical acquisition was already recorded
  } finally {
    fs.rmSync(temp, { force: true });
  }
}

// ── Replay ───────────────────────────────────────────────────────────────────

/**
 * Replay a previously RECORDED verified acquisition for this exact
 * intent/purchase. Fail-closed at every step: disabled → throw; key missing →
 * throw; absent record → throw (never fabricate); malformed/legacy → throw;
 * authentication failure → throw; any binding difference → throw; stored
 * result must still pass production verification for the REQUESTING request.
 * Performs no wallet/merchant/provider/payment operation.
 */
export function replayVerifiedAcquisition(input: {
  intent: ExecutionIntent;
  purchase: PurchaseRecord;
  env?: Record<string, string | undefined>;
}): VerifiedAcquisitionReplay {
  const env = input.env ?? process.env;
  const { dir, key } = requireEnabled(env);
  const requestId = input.intent.intentId;
  const file = recordFile(dir, requestId);
  if (!fs.existsSync(file)) {
    throw new Error(`no verified acquisition record exists for ${requestId} — replay is fail-closed and will not fabricate one`);
  }
  const record = authenticateForRequest({ raw: readRecordFile(file), key, intent: input.intent, purchase: input.purchase });
  const result = record.binding.result;
  return {
    provenance: "recorded_replay",
    content: result.content,
    contentHash: record.binding.contentHash,
    sourceProvenance: result.provenance,
    limitation: result.limitation,
    result,
    binding: record.binding,
    recordedAt: record.recordedAt,
  };
}

/**
 * Wrap the production verifier so a verified observation is durably recorded
 * (composition-time opt-in only). When the gate is disabled the wrapper is a
 * pure passthrough — behavior is byte-identical to the un-wrapped verifier.
 *
 * Failure behavior (explicit): if the gate is ON and recording fails
 * (misconfiguration, immutability conflict, I/O), the wrapper THROWS instead
 * of returning a verdict. The rail's verification step then records nothing:
 * the purchase stays at its durable `result_received` state (settlement and
 * result receipt already persisted — no financial fact is erased), no
 * verification/failure event is emitted, and nothing re-signs or repays; the
 * next observation retries verification + recording only.
 */
export function withAcquisitionRecording(
  verify: (input: { intent: ExecutionIntent; purchase: PurchaseRecord; result: unknown }) => { verified: boolean; verificationProof: string },
  opts: { env?: Record<string, string | undefined>; now: () => number } = { now: () => Date.now() },
): typeof verify {
  const env = opts.env ?? process.env;
  return (input) => {
    const verification = verify(input);
    if (verification.verified && resolveAcquisitionRecordDirectory(env)) {
      recordVerifiedAcquisition({ ...input, recordedAt: opts.now(), env });
    }
    return verification;
  };
}
