/**
 * M2-I — OPT-IN verified external acquisition record/replay.
 *
 * Truthfulness contract:
 * - DISABLED BY DEFAULT. Recording and replay exist only when the operator
 *   explicitly sets M3_VERIFIED_ACQUISITION_RECORD_DIR to an absolute path.
 *   Every call while disabled throws a loud "disabled" error — it can never
 *   silently no-op into a fabricated record or replay.
 * - ONLY VERIFIED results are recordable, and verification is RECOMPUTED at
 *   record time with the production H verifier. A caller claiming "verified"
 *   without evidence is refused.
 * - REPLAY re-verifies before use: the stored protected result must still pass
 *   the shape gate AND bind to the requesting intent/purchase's exact request
 *   identity (a record made for purchase A can never replay for purchase B),
 *   and the stored content must still hash to the recorded hash.
 * - A replayed acquisition is labeled `recorded_replay` — never `live`, never
 *   `simulation`. Content provenance inside the payload is unchanged.
 * - RECORD plumbing only: this module performs no provider, merchant, network,
 *   wallet, or payment call. Records in this repository can therefore only
 *   exist for acquisitions genuinely executed by an operator outside tests.
 */
import fs from "node:fs";
import path from "node:path";

import { sha256Hex } from "../management/sha256";
import { verifyM3ProtectedResult } from "./m3FounderNarrativeProduct";
import { verifyProductionM3Result } from "./localProductionComposition";
import type { PurchaseRecord } from "./types";
import type { ExecutionIntent } from "../management/types";

export const ACQUISITION_RECORD_ENV = "M3_VERIFIED_ACQUISITION_RECORD_DIR" as const;

/** Resolved record directory, or null when the opt-in gate is off. */
export function resolveAcquisitionRecordDirectory(env: Record<string, string | undefined> = process.env): string | null {
  const raw = env[ACQUISITION_RECORD_ENV]?.trim();
  if (!raw) return null;
  if (!path.isAbsolute(raw)) {
    throw new Error(`${ACQUISITION_RECORD_ENV} must be an absolute path; refusing a relative record directory`);
  }
  return path.normalize(raw);
}

/**
 * A durable verified-acquisition record. Identity fields are exactly what the
 * H verifier binds against, so a record is only replayable for the same
 * normalized request it was verified for. No authorization headers,
 * signatures, or wallet material — the protected result shape excludes them.
 */
export type VerifiedAcquisitionRecord = {
  /** Record schema version. */
  version: 1;
  requestId: string;
  purchaseId: string;
  intentId: string;
  offeringId: string;
  serviceId: string;
  providerId: string;
  resourceClass: string;
  /** sha256 of `content`; replay recomputes and refuses on drift. */
  contentHash: string;
  content: string;
  verificationProof: string;
  /** The full protected result payload as verified (untrusted DATA). */
  protectedResult: unknown;
  recordedAt: number;
};

export type VerifiedAcquisitionReplay = {
  provenance: "recorded_replay";
  record: VerifiedAcquisitionRecord;
};

function recordFile(dir: string, requestId: string): string {
  if (!/^[A-Za-z0-9_.:-]{1,128}$/.test(requestId)) {
    throw new Error("requestId is not a safe record key");
  }
  return path.join(dir, `verified-acquisition-${requestId}.json`);
}

function requireEnabledDir(env: Record<string, string | undefined>): string {
  const dir = resolveAcquisitionRecordDirectory(env);
  if (!dir) {
    throw new Error(
      "verified acquisition record/replay is DISABLED: set the absolute path " +
        `${ACQUISITION_RECORD_ENV} to opt in; nothing is recorded or replayed without it`,
    );
  }
  return dir;
}

/**
 * Record one acquisition result that verifies RIGHT NOW against this exact
 * intent/purchase. Recomputes verification (never trusts a claimed proof),
 * writes immutably (same requestId with different content is refused), and is
 * idempotent for byte-identical content.
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
  const dir = requireEnabledDir(env);
  const verification = verifyProductionM3Result({ intent: input.intent, purchase: input.purchase, result: input.result });
  if (!verification.verified) {
    throw new Error(`refusing to record an unverified acquisition result: ${verification.verificationProof}`);
  }
  if (!verifyM3ProtectedResult(input.result)) throw new Error("refusing to record a result that fails the protected-shape gate");
  const content = input.result.content.trim();
  const record: VerifiedAcquisitionRecord = {
    version: 1,
    requestId: input.result.requestId ?? "",
    purchaseId: input.purchase.id,
    intentId: input.intent.intentId,
    offeringId: input.result.offeringId ?? "",
    serviceId: input.result.serviceId,
    providerId: input.result.providerId,
    resourceClass: input.result.resourceClass,
    contentHash: sha256Hex(content),
    content,
    verificationProof: verification.verificationProof,
    protectedResult: input.result,
    recordedAt: input.recordedAt,
  };
  fs.mkdirSync(dir, { recursive: true });
  const file = recordFile(dir, record.requestId);
  if (fs.existsSync(file)) {
    const existing = JSON.parse(fs.readFileSync(file, "utf8")) as VerifiedAcquisitionRecord;
    if (existing.version !== 1 || existing.contentHash !== record.contentHash || existing.purchaseId !== record.purchaseId) {
      throw new Error(`verified acquisition record for ${record.requestId} is immutable — refusing to overwrite a different verified result`);
    }
    return existing; // idempotent re-record of the identical verified result
  }
  const temp = `${file}.${process.pid}.${input.recordedAt}.tmp`;
  fs.writeFileSync(temp, JSON.stringify(record, null, 2), "utf8");
  fs.renameSync(temp, file);
  return record;
}

/**
 * Replay a previously RECORDED verified acquisition for this exact
 * intent/purchase. Fail-closed at every step: disabled → throw; absent record
 * → throw (never fabricate); content-hash drift → throw; re-verification of
 * the stored payload against the REQUESTING identity (shape + H binding) must
 * pass, so a record cannot cross-purchase replay. Success is labeled
 * `recorded_replay` — it is a replay, never a fresh live acquisition.
 */
export function replayVerifiedAcquisition(input: {
  intent: ExecutionIntent;
  purchase: PurchaseRecord;
  env?: Record<string, string | undefined>;
}): VerifiedAcquisitionReplay {
  const env = input.env ?? process.env;
  const dir = requireEnabledDir(env);
  const requestId = input.purchase.id; // the H binding identity: purchase id === intent id === requestId
  const file = recordFile(dir, requestId);
  if (!fs.existsSync(file)) {
    throw new Error(`no verified acquisition record exists for ${requestId} — replay is fail-closed and will not fabricate one`);
  }
  const record = JSON.parse(fs.readFileSync(file, "utf8")) as VerifiedAcquisitionRecord;
  if (record.version !== 1) throw new Error("verified acquisition record is malformed");
  if (sha256Hex(record.content) !== record.contentHash) {
    throw new Error(`verified acquisition record for ${requestId} failed its content-hash check — refusing a tampered or drifted replay`);
  }
  if (record.purchaseId !== input.purchase.id || record.intentId !== input.intent.intentId) {
    throw new Error(`verified acquisition record for ${requestId} is bound to purchase ${record.purchaseId}/intent ${record.intentId}, not this request — cross-request replay refused`);
  }
  const verification = verifyProductionM3Result({ intent: input.intent, purchase: input.purchase, result: record.protectedResult });
  if (!verification.verified) {
    throw new Error(`stored acquisition result no longer verifies for this request: ${verification.verificationProof}`);
  }
  return { provenance: "recorded_replay", record };
}

/**
 * Wrap the production verifier so a verified observation is durably recorded
 * first (composition-time opt-in only). When the gate is disabled the wrapper
 * is a pure passthrough — behavior is byte-identical to the un-wrapped
 * verifier, which is what "disabled by default" must mean.
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
