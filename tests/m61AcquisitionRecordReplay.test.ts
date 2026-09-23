// M2-I focused tests — opt-in verified acquisition record/replay.
// RECORD plumbing only: every record below is a locally BUILT fixture result
// (buildM3ProtectedSuccess), never a live acquisition, and nothing here calls
// a provider, merchant, network, wallet, or payment path.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import {
  ACQUISITION_RECORD_ENV,
  ACQUISITION_RECORD_KEY_ENV,
  recordVerifiedAcquisition,
  replayVerifiedAcquisition,
  resolveAcquisitionRecordDirectory,
  withAcquisitionRecording,
} from "../lib/payment/acquisitionRecordReplay";
import { verifyProductionM3Result } from "../lib/payment/localProductionComposition";
import { buildM3ProtectedSuccess } from "../lib/payment/m3FounderNarrativeProduct";
import { sha256Hex } from "../lib/management/sha256";
import type { ExecutionIntent } from "../lib/management/types";
import type { PurchaseRecord } from "../lib/payment/types";

const at = 2_000_000_000_000;

const intent: ExecutionIntent = {
  intentId: "int_i_replay", idempotencyKey: "idem_i_replay", objectiveKey: "obj_i",
  requirementKey: "req_i", contractRevision: 1, decisionId: "dec_i", kind: "external_acquisition",
  strategy: "BUY",
  target: { offeringId: "somebody_controlled_test:founder_narrative_pulse", providerId: "somebody_controlled_test", serviceId: "founder_narrative_pulse", resourceClass: "proprietary_data", endpointRef: null },
  terms: { priceUsd: 4, priceProvenance: "provider_quote", requiresApproval: true, approvalId: "approval_i" },
  state: "handed_off", attempts: 1, lastEventId: null, resultEvidenceId: null, verificationEvidenceId: null,
  boundaryNote: "record/replay plumbing test", createdAt: at, updatedAt: at,
  purpose: "Qualitative read on founder messaging resonance.",
  requestedPurposeKind: "founder_messaging_qualitative",
};

const purchase: PurchaseRecord = {
  id: intent.intentId, objectiveKey: intent.objectiveKey, resourceNeedId: intent.requirementKey,
  offeringId: intent.target.offeringId!, idempotencyKey: intent.idempotencyKey,
  state: "result_received", boundTerms: null, approval: null,
  receipt: { transactionHash: `0x${"b".repeat(64)}`, settledAt: at + 1 },
  result: null, verified: false, createdAt: at, updatedAt: at,
};

const boundResult = buildM3ProtectedSuccess({
  purpose: intent.purpose ?? "", purposeKind: "founder_messaging_qualitative",
  requestId: intent.intentId, offeringId: intent.target.offeringId,
});

// TEST-ONLY record-authentication key (never a real secret).
const TEST_RECORD_KEY = "test-only-record-key-0123456789abcdef-v7";
function enabledEnv(dir: string): Record<string, string | undefined> {
  return { [ACQUISITION_RECORD_ENV]: dir, [ACQUISITION_RECORD_KEY_ENV]: TEST_RECORD_KEY };
}

// ── The gate: disabled by default, loud when required ────────────────────────

test("I1: record/replay is DISABLED by default — no env means no recording, replay fails closed, and nothing is invented", () => {
  assert.equal(resolveAcquisitionRecordDirectory({}), null);
  assert.equal(resolveAcquisitionRecordDirectory({ [ACQUISITION_RECORD_ENV]: "   " }), null);
  // Recording: plumbing present but disabled → pure passthrough verifier.
  const wrapped = withAcquisitionRecording(verifyProductionM3Result, { env: {}, now: () => at });
  assert.deepEqual(wrapped({ intent, purchase, result: boundResult }), verifyProductionM3Result({ intent, purchase, result: boundResult }));
  assert.equal(recordVerifiedAcquisition({ intent, purchase, result: boundResult, recordedAt: at, env: {} }), null);
  // Replay while disabled is a LOUD refusal, never a silent fallback.
  assert.throws(() => replayVerifiedAcquisition({ intent, purchase, env: {} }), /DISABLED/);
  // A relative record dir is refused, not silently resolved against cwd.
  assert.throws(() => resolveAcquisitionRecordDirectory({ [ACQUISITION_RECORD_ENV]: "relative/dir" }), /absolute path/);
});

// ── Recording plumbing: verified-only, immutable, identity-bound ─────────────

test("I2: an opt-in record captures only a result that verifies for THIS exact request, and replay returns it truth-labelled recorded_replay", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "m3-i-"));
  try {
    const env = enabledEnv(dir);
    const recorded = recordVerifiedAcquisition({ intent, purchase, result: boundResult, recordedAt: at, env });
    assert.ok(recorded);
    assert.equal(recorded!.binding.request.requestId, intent.intentId);
    assert.equal(recorded!.binding.purchase.id, purchase.id);
    assert.equal(recorded!.binding.contentHash, sha256Hex(boundResult.content));
    assert.equal(recorded!.binding.request.resourceClass, "proprietary_data");
    assert.ok(fs.existsSync(path.join(dir, `verified-acquisition-${intent.intentId}.json`)));

    const replay = replayVerifiedAcquisition({ intent, purchase, env });
    assert.equal(replay.provenance, "recorded_replay", "a replay is a replay — never live, never simulation");
    assert.equal(replay.contentHash, recorded!.binding.contentHash);
    assert.equal(replay.content, boundResult.content);
    assert.equal(replay.sourceProvenance, "synthetic_test_provider", "original source limitation is preserved");

    // Re-record of the identical verified result is idempotent, not a second row.
    const again = recordVerifiedAcquisition({ intent, purchase, result: boundResult, recordedAt: at + 5, env });
    assert.equal(again!.binding.contentHash, recorded!.binding.contentHash);
    assert.equal(again!.recordedAt, recorded!.recordedAt, "the immutable first record survives a re-record");
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("I3: unverified results can never be recorded and absent records can never be replayed", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "m3-i-"));
  try {
    const env = enabledEnv(dir);
    // Shape-truth but bound to ANOTHER request (H gate) → refused at record time.
    const foreign = buildM3ProtectedSuccess({
      purpose: intent.purpose ?? "", purposeKind: "founder_messaging_qualitative",
      requestId: "int_not_this", offeringId: intent.target.offeringId,
    });
    assert.throws(() => recordVerifiedAcquisition({ intent, purchase, result: foreign, recordedAt: at, env }), /refusing to record an unverified acquisition result/);
    // Malformed junk → refused too.
    assert.throws(() => recordVerifiedAcquisition({ intent, purchase, result: { ok: true }, recordedAt: at, env }), /refusing to record an unverified acquisition result/);
    assert.equal(fs.readdirSync(dir).length, 0, "a refused record leaves no file (no stray temp either)");
    // Replay with no record: fail closed, never fabricate.
    assert.throws(() => replayVerifiedAcquisition({ intent, purchase, env }), /fail-closed and will not fabricate/);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("I4: a record cannot cross-request replay and tampered content is refused", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "m3-i-"));
  try {
    const env = enabledEnv(dir);
    recordVerifiedAcquisition({ intent, purchase, result: boundResult, recordedAt: at, env });

    // Another intent/purchase pair with its own identity: the record file is
    // keyed by ITS requestId, which does not exist → fail closed.
    const other = { ...intent, intentId: "int_other", idempotencyKey: "idem_other" };
    const otherPurchase: PurchaseRecord = { ...purchase, id: "int_other" };
    assert.throws(() => replayVerifiedAcquisition({ intent: other, purchase: otherPurchase, env }), /fail-closed and will not fabricate/);

    // Tamper with the stored content → hash check refuses before any reuse.
    const file = path.join(dir, `verified-acquisition-${intent.intentId}.json`);
    const tampered = JSON.parse(fs.readFileSync(file, "utf8")) as { binding: { result: { content: string }; contentHash: string } };
    tampered.binding.result.content = "SYNTHETIC not live — tampered text";
    tampered.binding.contentHash = sha256Hex(tampered.binding.result.content); // recomputed plain hash
    fs.writeFileSync(file, JSON.stringify(tampered), "utf8");
    assert.throws(() => replayVerifiedAcquisition({ intent, purchase, env }), /failed authentication/);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("I5: the recording wrapper records exactly when the gate is ON and verification PASSES, and never for a rejection", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "m3-i-"));
  try {
    const env = enabledEnv(dir);
    const wrapped = withAcquisitionRecording(verifyProductionM3Result, { env, now: () => at });
    // Rejection path: nothing recorded.
    const foreign = buildM3ProtectedSuccess({
      purpose: intent.purpose ?? "", purposeKind: "founder_messaging_qualitative",
      requestId: "int_x", offeringId: intent.target.offeringId,
    });
    assert.equal(wrapped({ intent, purchase, result: foreign }).verified, false);
    assert.equal(fs.readdirSync(dir).length, 0);
    // Pass path: one record, replayable.
    assert.equal(wrapped({ intent, purchase, result: boundResult }).verified, true);
    assert.equal(fs.readdirSync(dir).length, 1);
    assert.equal(replayVerifiedAcquisition({ intent, purchase, env }).provenance, "recorded_replay");
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
