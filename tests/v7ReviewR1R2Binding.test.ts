// V7 final-review corrections R1 (replay-record integrity) and R2 (exact
// purchase–intent–provider result binding). Ports of the reviewer's
// source-isolation probes, executed against the ACTUAL repository modules.
//
// Every "acquisition" here is a locally BUILT fixture (buildM3ProtectedSuccess)
// — never a genuine live acquisition — and no provider, merchant, network,
// wallet, signing or payment path is reachable: global fetch is trapped.
import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import {
  ACQUISITION_RECORD_ENV,
  ACQUISITION_RECORD_KEY_ENV,
  canonicalJson,
  recordVerifiedAcquisition,
  replayVerifiedAcquisition,
} from "../lib/payment/acquisitionRecordReplay";
import { verifyProductionM3Result } from "../lib/payment/localProductionComposition";
import {
  buildM3ProtectedSuccess,
  evaluateM3ProductFulfillment,
  readM3MerchantProductRequest,
  M3_PRODUCT_OFFERING_ID,
} from "../lib/payment/m3FounderNarrativeProduct";
import { merchantHeadersForIntent } from "../lib/payment/supervisedDriverAdapter";
import { purchaseRecordFromIntent } from "../lib/management/m3BuyerRail";
import { sha256Hex } from "../lib/management/sha256";
import type { ExecutionIntent } from "../lib/management/types";
import type { PurchaseRecord } from "../lib/payment/types";

const at = 2_000_000_000_000;
const TEST_KEY = "test-only-v7-record-key-abcdefghijklmnopqrstuvwxyz";
const OTHER_TEST_KEY = "test-only-v7-OTHER-record-key-abcdefghijklmnopqrstu";

const intent: ExecutionIntent = {
  intentId: "int_v7_r", idempotencyKey: "idem_v7_r", objectiveKey: "obj_v7_r",
  requirementKey: "req_v7_r", contractRevision: 3, decisionId: "dec_v7_r", kind: "external_acquisition",
  strategy: "BUY",
  target: { offeringId: M3_PRODUCT_OFFERING_ID, providerId: "somebody_controlled_test", serviceId: "founder_narrative_pulse", resourceClass: "proprietary_data", endpointRef: null },
  terms: { priceUsd: 1, priceProvenance: "provider_quote", requiresApproval: true, approvalId: "ap_v7" },
  state: "result_recorded", attempts: 1, lastEventId: null, resultEvidenceId: null, verificationEvidenceId: null,
  boundaryNote: "v7 review fixture", createdAt: at, updatedAt: at,
  needDedupeKey: "need_dedupe_v7", resourceNeedId: "need_v7",
  purpose: "How do solo founders describe the pain of juggling selling and delivery?",
  requestedPurposeKind: "founder_messaging_qualitative",
};

function purchaseFor(i: ExecutionIntent): PurchaseRecord {
  return { ...purchaseRecordFromIntent(i, at), state: "result_received" };
}
function resultFor(i: ExecutionIntent, overrides: Partial<Parameters<typeof buildM3ProtectedSuccess>[0]> = {}) {
  return buildM3ProtectedSuccess({
    purpose: (i.purpose ?? "").trim().slice(0, 500).trim(),
    purposeKind: "founder_messaging_qualitative",
    requestId: i.intentId,
    offeringId: i.target.offeringId,
    observedAt: 7,
    ...overrides,
  });
}
const purchase = purchaseFor(intent);
const result = resultFor(intent);

function tempDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "v7-r1-"));
}
function env(dir: string, key = TEST_KEY): Record<string, string | undefined> {
  return { [ACQUISITION_RECORD_ENV]: dir, [ACQUISITION_RECORD_KEY_ENV]: key };
}
function recordPath(dir: string, i: ExecutionIntent = intent): string {
  return path.join(dir, `verified-acquisition-${i.intentId}.json`);
}
function mutateRecord(dir: string, mutate: (record: any) => void, target = recordPath(dir)): void {
  const record = JSON.parse(fs.readFileSync(recordPath(dir), "utf8"));
  mutate(record);
  fs.writeFileSync(target, JSON.stringify(record), "utf8");
}
function withTrappedNetwork<T>(fn: () => T): { value: T; fetchCalls: number } {
  const original = globalThis.fetch;
  let fetchCalls = 0;
  globalThis.fetch = (async () => {
    fetchCalls += 1;
    throw new Error("network is forbidden in this test");
  }) as typeof fetch;
  try {
    return { value: fn(), fetchCalls };
  } finally {
    globalThis.fetch = original;
  }
}

// ════════════════════════════════ R2 ════════════════════════════════════════

test("R2: the exact request/purchase/intent/result verifies", () => {
  const verdict = verifyProductionM3Result({ intent, purchase, result });
  assert.equal(verdict.verified, true, verdict.verificationProof);
});

test("R2: a foreign purchase, or the pair supplied with another intent/Objective, refuses", () => {
  const otherIntent: ExecutionIntent = { ...intent, intentId: "int_v7_other", idempotencyKey: "idem_other" };
  // Reviewer probe: purchase/result of intent A supplied with intent B.
  const crossed = verifyProductionM3Result({ intent: otherIntent, purchase, result });
  assert.equal(crossed.verified, false);
  assert.match(crossed.verificationProof, /m3-purchase-intent-binding-rejected/);
  // Same intent id, different Objective (retagged).
  const otherObjective: ExecutionIntent = { ...intent, objectiveKey: "obj_someone_else" };
  const retagged = verifyProductionM3Result({ intent: otherObjective, purchase, result });
  assert.equal(retagged.verified, false);
  assert.match(retagged.verificationProof, /purchase\.objectiveKey/);
  // Each purchase identity field is load-bearing.
  for (const field of ["id", "objectiveKey", "resourceNeedId", "offeringId", "idempotencyKey"] as const) {
    const foreign = { ...purchase, [field]: `${purchase[field]}_x` };
    const verdict = verifyProductionM3Result({ intent, purchase: foreign, result });
    assert.equal(verdict.verified, false, field);
    assert.match(verdict.verificationProof, new RegExp(`purchase\\.${field}`));
  }
});

test("R2: wrong or missing provider/service/offering/resource authority refuses — never completed with the demo product", () => {
  // Reviewer probe: a result claiming a different provider.
  const wrongProviderResult = { ...result, providerId: "evil_provider" };
  assert.equal(verifyProductionM3Result({ intent, purchase, result: wrongProviderResult }).verified, false);
  for (const [field, value] of [
    ["providerId", "other_provider"], ["providerId", null],
    ["serviceId", "other_service"], ["serviceId", null],
    ["offeringId", null],
    ["resourceClass", "privileged_access"], ["resourceClass", null],
  ] as const) {
    const bad: ExecutionIntent = { ...intent, target: { ...intent.target, [field]: value } };
    const verdict = verifyProductionM3Result({ intent: bad, purchase: purchaseFor(bad), result });
    assert.equal(verdict.verified, false, `${field}=${value}`);
    assert.match(verdict.verificationProof, /m3-intent-authority-rejected/, `${field}=${value}`);
  }
  // A different (but concrete) authorized offering must be echoed exactly.
  const otherOffering: ExecutionIntent = { ...intent, target: { ...intent.target, offeringId: "somebody_controlled_test:other_listing" } };
  const mismatch = verifyProductionM3Result({ intent: otherOffering, purchase: purchaseFor(otherOffering), result });
  assert.equal(mismatch.verified, false);
  assert.match(mismatch.verificationProof, /offeringId .* is not the authorized/);
});

test("R2: wrong request identity refuses", () => {
  const verdict = verifyProductionM3Result({ intent, purchase, result: resultFor(intent, { requestId: "int_someone_else" }) });
  assert.equal(verdict.verified, false);
  assert.match(verdict.verificationProof, /requestId int_someone_else is not the authorized int_v7_r/);
});

test("R2: incompatible normalized purpose or scope refuses; missing validated scope refuses", () => {
  const otherPurpose = verifyProductionM3Result({ intent, purchase, result: resultFor(intent, { purpose: "A different research question." }) });
  assert.equal(otherPurpose.verified, false);
  assert.match(otherPurpose.verificationProof, /purpose is not the authorized normalized purpose/);
  const noScope: ExecutionIntent = { ...intent, requestedPurposeKind: null };
  const unscoped = verifyProductionM3Result({ intent: noScope, purchase: purchaseFor(noScope), result });
  assert.equal(unscoped.verified, false);
  assert.match(unscoped.verificationProof, /no application-validated requested scope/);
  const foreignScope: ExecutionIntent = { ...intent, requestedPurposeKind: "quantitative_conversion" };
  assert.equal(verifyProductionM3Result({ intent: foreignScope, purchase: purchaseFor(foreignScope), result }).verified, false);
  const outOfScopeProse: ExecutionIntent = { ...intent, purpose: "Measure conversion uplift from the relaunch A/B test" };
  assert.equal(verifyProductionM3Result({ intent: outOfScopeProse, purchase: purchaseFor(outOfScopeProse), result: resultFor(outOfScopeProse) }).verified, false);
});

test("R2: the verifier uses the SAME normalization as the request actually sent (truncation + trimming)", () => {
  const long = `   ${"Solo founders describe juggling selling and delivery. ".repeat(20)}   `;
  const longIntent: ExecutionIntent = { ...intent, purpose: long };
  const headers = merchantHeadersForIntent(longIntent);
  const request = readM3MerchantProductRequest({
    headers: { get: (name: string) => headers[name.toLowerCase()] ?? null },
  });
  const merchantResult = evaluateM3ProductFulfillment(request);
  assert.equal(merchantResult.ok, true);
  const verdict = verifyProductionM3Result({ intent: longIntent, purchase: purchaseFor(longIntent), result: merchantResult });
  assert.equal(verdict.verified, true, verdict.verificationProof);
  assert.ok(headers["x-somebody-purpose"]!.length <= 500);
});

test("R2: no paid merchant request is even built for incomplete or unscoped authority (refused before signing)", () => {
  assert.throws(() => merchantHeadersForIntent({ ...intent, requestedPurposeKind: null }), /before signing: .*requested scope/);
  assert.throws(() => merchantHeadersForIntent({ ...intent, target: { ...intent.target, offeringId: null } }), /before signing: .*no offeringId/);
  assert.throws(() => merchantHeadersForIntent({ ...intent, target: { ...intent.target, providerId: "other" } }), /before signing/);
  const headers = merchantHeadersForIntent(intent);
  assert.equal(headers["x-somebody-purpose-kind"], "founder_messaging_qualitative");
  assert.equal(headers["x-somebody-offering-id"], intent.target.offeringId);
  assert.equal(headers["x-somebody-request-id"], intent.intentId);
});

test("R2: the strict result shape refuses mutated evidence/payload and unknown keys", () => {
  for (const bad of [
    { ...result, evidence: [] },
    { ...result, evidence: [{ label: "x", text: "y" }] },
    { ...result, payload: { findings: [] , messagingImplications: [] } },
    { ...result, payload: { findings: ["ok"] } },
    { ...result, limitation: "NOT live but different text" },
    { ...result, extra: true },
    { ...result, provenance: "live" },
  ]) {
    assert.equal(verifyProductionM3Result({ intent, purchase, result: bad }).verified, false);
  }
});

test("R2: direct recording and replay cannot bypass the binding checks", () => {
  const dir = tempDir();
  try {
    assert.throws(() => recordVerifiedAcquisition({ intent, purchase, result: { ...result, providerId: "evil_provider" }, recordedAt: at, env: env(dir) }), /refusing to record/);
    const crossed: ExecutionIntent = { ...intent, objectiveKey: "obj_other" };
    assert.throws(() => recordVerifiedAcquisition({ intent: crossed, purchase, result, recordedAt: at, env: env(dir) }), /refusing to record/);
    assert.equal(fs.readdirSync(dir).length, 0);
    recordVerifiedAcquisition({ intent, purchase, result, recordedAt: at, env: env(dir) });
    // Replay under the same ids but incompatible authority/scope refuses.
    const wrongProvider: ExecutionIntent = { ...intent, target: { ...intent.target, providerId: "other_provider" } };
    assert.throws(() => replayVerifiedAcquisition({ intent: wrongProvider, purchase: purchaseFor(wrongProvider), env: env(dir) }), /no longer verifies/);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

// ════════════════════════════════ R1 ════════════════════════════════════════

test("R1: an intact record replays for the exact compatible request, labelled recorded_replay, with no network", () => {
  const dir = tempDir();
  try {
    const recorded = recordVerifiedAcquisition({ intent, purchase, result, recordedAt: at, env: env(dir) });
    assert.ok(recorded);
    const { value: replay, fetchCalls } = withTrappedNetwork(() => replayVerifiedAcquisition({ intent, purchase, env: env(dir) }));
    assert.equal(fetchCalls, 0, "replay reaches no external dependency");
    assert.equal(replay.provenance, "recorded_replay");
    assert.equal(replay.content, result.content, "the returned content IS the verified result's content");
    assert.equal(replay.contentHash, sha256Hex(result.content));
    assert.equal(replay.sourceProvenance, "synthetic_test_provider");
    assert.match(replay.limitation, /NOT live/);
    assert.equal(canonicalJson(replay.result), canonicalJson(result));
    assert.ok(!("transactionHash" in (replay as object)), "replay creates no transaction");
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("R1: disabled, key-less, misconfigured, absent, malformed and legacy paths refuse", () => {
  const dir = tempDir();
  try {
    assert.throws(() => replayVerifiedAcquisition({ intent, purchase, env: {} }), /DISABLED/);
    assert.equal(recordVerifiedAcquisition({ intent, purchase, result, recordedAt: at, env: {} }), null, "disabled: nothing recorded");
    const keyless = { [ACQUISITION_RECORD_ENV]: dir };
    assert.throws(() => recordVerifiedAcquisition({ intent, purchase, result, recordedAt: at, env: keyless }), /RECORD_KEY is not configured/);
    assert.throws(() => replayVerifiedAcquisition({ intent, purchase, env: keyless }), /RECORD_KEY is not configured/);
    assert.throws(() => replayVerifiedAcquisition({ intent, purchase, env: { ...env(dir), M4_M3_DRIVER_TOKEN: TEST_KEY } }), /distinct from M4_M3_DRIVER_TOKEN/);
    assert.throws(() => replayVerifiedAcquisition({ intent, purchase, env: { ...env(dir), M4_M3_FACT_ATTESTATION_KEY: TEST_KEY } }), /distinct from M4_M3_FACT_ATTESTATION_KEY/);
    assert.throws(() => replayVerifiedAcquisition({ intent, purchase, env: env(dir, "short") }), /at least 32/);
    assert.throws(() => replayVerifiedAcquisition({ intent, purchase, env: { [ACQUISITION_RECORD_ENV]: "relative/dir", [ACQUISITION_RECORD_KEY_ENV]: TEST_KEY } }), /absolute path/);
    assert.throws(() => replayVerifiedAcquisition({ intent, purchase, env: env(dir) }), /will not fabricate/);
    fs.writeFileSync(recordPath(dir), "{not json", "utf8");
    assert.throws(() => replayVerifiedAcquisition({ intent, purchase, env: env(dir) }), /malformed/);
    // The pre-V7 v1 shape (unauthenticated) is legacy-unverifiable.
    fs.writeFileSync(recordPath(dir), JSON.stringify({ version: 1, requestId: intent.intentId, purchaseId: purchase.id, intentId: intent.intentId, contentHash: sha256Hex(result.content), content: result.content, protectedResult: result }), "utf8");
    assert.throws(() => replayVerifiedAcquisition({ intent, purchase, env: env(dir) }), /legacy unauthenticated/);
    fs.writeFileSync(recordPath(dir), "x".repeat(300 * 1024), "utf8");
    assert.throws(() => replayVerifiedAcquisition({ intent, purchase, env: env(dir) }), /size bound/);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("R1: protected-result-only mutation (content/hash untouched) refuses", () => {
  const dir = tempDir();
  try {
    recordVerifiedAcquisition({ intent, purchase, result, recordedAt: at, env: env(dir) });
    const pristine = fs.readFileSync(recordPath(dir), "utf8");
    for (const mutate of [
      (r: any) => { r.binding.result.payload.findings[0] = "Fabricated finding."; },
      (r: any) => { r.binding.result.evidence[0].text = "Fabricated evidence."; },
      (r: any) => { r.binding.result.payload.messagingImplications.push("Injected implication."); },
    ]) {
      fs.writeFileSync(recordPath(dir), pristine, "utf8");
      mutateRecord(dir, mutate);
      assert.throws(() => replayVerifiedAcquisition({ intent, purchase, env: env(dir) }), /failed authentication/);
    }
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("R1: content mutation with a recomputed plain hash refuses", () => {
  const dir = tempDir();
  try {
    recordVerifiedAcquisition({ intent, purchase, result, recordedAt: at, env: env(dir) });
    mutateRecord(dir, (r) => {
      r.binding.result.content = `${r.binding.result.content}\n- Injected claim: live Twitter confirms conversion uplift.`;
      r.binding.contentHash = sha256Hex(r.binding.result.content);
    });
    assert.throws(() => replayVerifiedAcquisition({ intent, purchase, env: env(dir) }), /failed authentication/);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("R1: metadata/provenance mutation refuses", () => {
  const dir = tempDir();
  try {
    recordVerifiedAcquisition({ intent, purchase, result, recordedAt: at, env: env(dir) });
    const pristine = fs.readFileSync(recordPath(dir), "utf8");
    const mutations: Array<(r: any) => void> = [
      (r) => { r.binding.request.providerId = "other_provider"; },
      (r) => { r.binding.request.serviceId = "other_service"; },
      (r) => { r.binding.request.offeringId = "other:offering"; },
      (r) => { r.binding.request.resourceClass = "privileged_access"; },
      (r) => { r.binding.purchase.offeringId = "other:offering"; },
      (r) => { r.binding.verificationProof = "m3-protected-result:forged"; },
      (r) => { r.binding.result.provenance = "live"; },
      (r) => { r.recordedAt = r.recordedAt + 1; },
      (r) => { r.binding.intent.needDedupeKey = "another_need"; },
    ];
    for (const mutate of mutations) {
      fs.writeFileSync(recordPath(dir), pristine, "utf8");
      mutateRecord(dir, mutate);
      assert.throws(() => replayVerifiedAcquisition({ intent, purchase, env: env(dir) }), /malformed|failed authentication/);
    }
    // A record authenticated under a DIFFERENT key is not ours.
    fs.writeFileSync(recordPath(dir), pristine, "utf8");
    assert.throws(() => replayVerifiedAcquisition({ intent, purchase, env: env(dir, OTHER_TEST_KEY) }), /failed authentication/);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("R1: cross-request / cross-Objective retagging and same-id incompatible scope refuse", () => {
  const dir = tempDir();
  try {
    recordVerifiedAcquisition({ intent, purchase, result, recordedAt: at, env: env(dir) });
    // Retag: copy A's authentic record under B's request key, rewriting ids.
    const other: ExecutionIntent = { ...intent, intentId: "int_v7_b", idempotencyKey: "idem_b", objectiveKey: "obj_v7_b" };
    mutateRecord(dir, (r) => {
      r.binding.intent.intentId = other.intentId;
      r.binding.intent.objectiveKey = other.objectiveKey;
      r.binding.request.requestId = other.intentId;
      r.binding.purchase.id = other.intentId;
      r.binding.result.requestId = other.intentId;
    }, recordPath(dir, other));
    assert.throws(() => replayVerifiedAcquisition({ intent: other, purchase: purchaseFor(other), env: env(dir) }), /failed authentication/);
    // Copy A's authentic record verbatim under B's key: authentic but bound to A.
    fs.copyFileSync(recordPath(dir), recordPath(dir, other));
    assert.throws(() => replayVerifiedAcquisition({ intent: other, purchase: purchaseFor(other), env: env(dir) }), /no longer verifies|different request/);
    // Same intent id, but a different Objective / decision / contract revision / need / scope.
    const sameIdVariants: ExecutionIntent[] = [
      { ...intent, objectiveKey: "obj_other" },
      { ...intent, decisionId: "dec_other" },
      { ...intent, contractRevision: 4 },
      { ...intent, needDedupeKey: "need_other" },
      { ...intent, requestedPurposeKind: null },
      { ...intent, purpose: "A different research question entirely." },
      { ...intent, target: { ...intent.target, offeringId: "somebody_controlled_test:other_listing" } },
    ];
    for (const variant of sameIdVariants) {
      assert.throws(() => replayVerifiedAcquisition({ intent: variant, purchase: purchaseFor(variant), env: env(dir) }), /no longer verifies|different request/);
    }
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("R1: existing-record idempotency validates the WHOLE binding and never overwrites", () => {
  const dir = tempDir();
  try {
    const first = recordVerifiedAcquisition({ intent, purchase, result, recordedAt: at, env: env(dir) });
    const bytes = fs.readFileSync(recordPath(dir), "utf8");
    // Same canonical acquisition → the first record is returned unchanged.
    const again = recordVerifiedAcquisition({ intent, purchase, result, recordedAt: at + 99, env: env(dir) });
    assert.equal(again!.recordedAt, first!.recordedAt);
    // Same purchaseId + same content hash, different metadata (decision/need) → conflict.
    for (const variant of [{ ...intent, decisionId: "dec_other" }, { ...intent, needDedupeKey: "need_other" }]) {
      assert.throws(() => recordVerifiedAcquisition({ intent: variant, purchase: purchaseFor(variant), result, recordedAt: at, env: env(dir) }), /immutable/);
    }
    // Same ids, different verified result evidence → conflict.
    assert.throws(() => recordVerifiedAcquisition({ intent, purchase, result: resultFor(intent, { observedAt: 8 }), recordedAt: at, env: env(dir) }), /immutable/);
    assert.equal(fs.readFileSync(recordPath(dir), "utf8"), bytes, "the first accepted record is byte-identical");
    // A tampered existing record is never "idempotently" accepted, and is left in place.
    mutateRecord(dir, (r) => { r.binding.result.payload.findings[0] = "Fabricated."; });
    const tamperedBytes = fs.readFileSync(recordPath(dir), "utf8");
    assert.throws(() => recordVerifiedAcquisition({ intent, purchase, result, recordedAt: at, env: env(dir) }), /immutable — the existing record is not this acquisition/);
    assert.equal(fs.readFileSync(recordPath(dir), "utf8"), tamperedBytes);
    assert.deepEqual(fs.readdirSync(dir).filter((f) => f.startsWith(".tmp-")), [], "no temp files leak");
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("R1: conflicting CONCURRENT creation (separate processes) cannot overwrite the first accepted record", async () => {
  const dir = tempDir();
  try {
    const startAt = Date.now() + 1_500;
    const racers = ["dec_a", "dec_b", "dec_c", "dec_d"];
    const child = path.join(process.cwd(), "tests", "fixtures", "v7", "recordRaceChild.ts");
    const tsxCli = path.join(process.cwd(), "node_modules", "tsx", "dist", "cli.mjs");
    const outcomes = await Promise.all(racers.map((decisionId) => new Promise<{ ok: boolean; decisionId?: string; error?: string }>((resolve, reject) => {
      const proc = spawn(process.execPath, [tsxCli, child, dir, TEST_KEY, decisionId, String(startAt)], { stdio: ["ignore", "pipe", "pipe"] });
      let out = "";
      let err = "";
      proc.stdout.on("data", (chunk) => { out += chunk; });
      proc.stderr.on("data", (chunk) => { err += chunk; });
      proc.on("error", reject);
      proc.on("close", () => {
        const line = out.trim().split("\n").pop() ?? "";
        try { resolve(JSON.parse(line)); } catch { reject(new Error(`child output unparseable: ${out} ${err}`)); }
      });
    })));
    const winners = outcomes.filter((o) => o.ok);
    assert.equal(winners.length, 1, `exactly one writer wins: ${JSON.stringify(outcomes)}`);
    for (const loser of outcomes.filter((o) => !o.ok)) assert.match(loser.error ?? "", /immutable/);
    const stored = JSON.parse(fs.readFileSync(path.join(dir, "verified-acquisition-int_race.json"), "utf8"));
    assert.equal(stored.binding.intent.decisionId, winners[0]!.decisionId, "the stored record is the winner's, intact");
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
