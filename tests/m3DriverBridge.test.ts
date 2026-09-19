import test from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";

import { apply, snapshot } from "../convex/m3Driver";
import { canonicalM3DriverFact, type M3DriverFact } from "../lib/management/m3DriverFacts";
import type { ExecutionIntent } from "../lib/management/types";

const key = "test-only-independent-m3-fact-attestation-key";
const token = "test-driver-bridge-token";
const at = 1961000000000;

function sign(fact: M3DriverFact): string {
  return createHmac("sha256", key).update(canonicalM3DriverFact(fact)).digest("hex");
}

function fixture(currentRevision = 1, grant: { data: Record<string, unknown> } | null = {
  data: { approvalId: "approval", objectiveKey: "obj_bridge", limitUsd: 1, grantedAt: at, revokedAt: null, note: "test" },
}): { ctx: unknown; current: () => ExecutionIntent } {
  let intent: ExecutionIntent = {
    intentId: "int_bridge", idempotencyKey: "idem_bridge", objectiveKey: "obj_bridge", requirementKey: "req_bridge", contractRevision: 1,
    decisionId: "dec_bridge", kind: "external_acquisition", strategy: "BUY", target: { offeringId: "offer", providerId: null, serviceId: null, resourceClass: null, endpointRef: null },
    terms: { priceUsd: 1, priceProvenance: "provider_quote", requiresApproval: false, approvalId: "approval" }, state: "awaiting_m3", attempts: 0,
    lastEventId: null, resultEvidenceId: null, verificationEvidenceId: null, boundaryNote: "test", createdAt: at, updatedAt: at,
  };
  const one = (value: unknown) => ({ withIndex: () => ({ unique: async () => value, order: () => ({ first: async () => value }) }) });
  const ctx = {
    db: {
      query(table: string) {
        if (table === "executionIntents") return one({ _id: "intent-row", data: intent });
        if (table === "objectives") return one({ _id: "objective-row" });
        if (table === "outcomeContracts") return one({ _id: "contract-row", revision: currentRevision });
        if (table === "requirements") return one({ _id: "requirement-row", data: { contractRevision: currentRevision } });
        if (table === "founderSpendGrants") return one(grant);
        if (table === "wakeEvents") return one(null);
        throw new Error(`unexpected table ${table}`);
      },
      async patch(_id: string, value: { data: ExecutionIntent }) { intent = value.data; },
      async insert() { return "wake-row"; },
    },
    scheduler: { async runAfter() { return "scheduled"; } },
  };
  return { ctx, current: () => intent };
}

type Handler = { _handler: (ctx: unknown, args: Record<string, unknown>) => Promise<unknown> };

async function invoke(ctx: unknown, fact: M3DriverFact, attestation = sign(fact)): Promise<unknown> {
  return (apply as unknown as Handler)._handler(ctx, { ...fact, evidenceId: fact.evidenceId ?? undefined, attestation, driverToken: token });
}

async function readSnapshot(ctx: unknown): Promise<{ founderSpendApprovalCurrent: boolean }> {
  return (snapshot as unknown as Handler)._handler(ctx, { intentId: "int_bridge", driverToken: token }) as Promise<{ founderSpendApprovalCurrent: boolean }>;
}

test("R3: governed snapshot validates only the intent's exact current founder spend grant", async () => {
  const previousToken = process.env.M4_M3_DRIVER_TOKEN;
  process.env.M4_M3_DRIVER_TOKEN = token;
  try {
    const cases: Array<[string, { data: Record<string, unknown> } | null, boolean]> = [
      ["missing", null, false],
      ["another approval", { data: { approvalId: "other", objectiveKey: "obj_bridge", limitUsd: 1, grantedAt: at, revokedAt: null, note: "test" } }, false],
      ["another objective", { data: { approvalId: "approval", objectiveKey: "obj_other", limitUsd: 1, grantedAt: at, revokedAt: null, note: "test" } }, false],
      ["revoked", { data: { approvalId: "approval", objectiveKey: "obj_bridge", limitUsd: 1, grantedAt: at, revokedAt: at + 1, note: "test" } }, false],
      ["insufficient", { data: { approvalId: "approval", objectiveKey: "obj_bridge", limitUsd: 0.5, grantedAt: at, revokedAt: null, note: "test" } }, false],
      ["valid exact grant", { data: { approvalId: "approval", objectiveKey: "obj_bridge", limitUsd: 1, grantedAt: at, revokedAt: null, note: "test" } }, true],
    ];
    for (const [name, grant, expected] of cases) {
      const result = await readSnapshot(fixture(1, grant).ctx);
      assert.equal(result.founderSpendApprovalCurrent, expected, name);
    }
  } finally {
    if (previousToken === undefined) delete process.env.M4_M3_DRIVER_TOKEN; else process.env.M4_M3_DRIVER_TOKEN = previousToken;
  }
});

test("R3: the actual Convex bridge refuses a bearer-token-only forged verification sequence", async () => {
  const previousToken = process.env.M4_M3_DRIVER_TOKEN;
  const previousKey = process.env.M4_M3_FACT_ATTESTATION_KEY;
  process.env.M4_M3_DRIVER_TOKEN = token;
  process.env.M4_M3_FACT_ATTESTATION_KEY = key;
  try {
    const bad = fixture();
    const forged: M3DriverFact = { intentId: "int_bridge", expectedUpdatedAt: at, eventKind: "submitted", eventId: "forged_submitted", dedupeKey: "intent:int_bridge:submitted:forged", evidenceId: null, note: "forged", at };
    await assert.rejects(() => invoke(bad.ctx, forged, "00".repeat(32)), /attestation is invalid/);
    assert.equal(bad.current().state, "awaiting_m3");

    const good = fixture();
    const submitted: M3DriverFact = { ...forged, eventId: "m3_submitted", dedupeKey: "intent:int_bridge:submitted:m3", note: "attested M3 submission" };
    await invoke(good.ctx, submitted);
    const result: M3DriverFact = { intentId: "int_bridge", expectedUpdatedAt: at, eventKind: "provider_result", eventId: "m3_result", dedupeKey: "intent:int_bridge:provider_result:m3", evidenceId: "ev_result_attested", note: "attested M3 result", at: at + 1 };
    await invoke(good.ctx, result);
    const verification: M3DriverFact = { intentId: "int_bridge", expectedUpdatedAt: at + 1, eventKind: "verification_passed", eventId: "m3_verify", dedupeKey: "intent:int_bridge:verification_result:m3", evidenceId: "ev_verify_attested", note: "attested M3 verification", at: at + 2 };
    await invoke(good.ctx, verification);
    assert.equal(good.current().state, "verified");
  } finally {
    if (previousToken === undefined) delete process.env.M4_M3_DRIVER_TOKEN; else process.env.M4_M3_DRIVER_TOKEN = previousToken;
    if (previousKey === undefined) delete process.env.M4_M3_FACT_ATTESTATION_KEY; else process.env.M4_M3_FACT_ATTESTATION_KEY = previousKey;
  }
});

test("R3: the actual Convex bridge rejects configuration that reuses the bearer token as its fact-attestation key", async () => {
  const previousToken = process.env.M4_M3_DRIVER_TOKEN;
  const previousKey = process.env.M4_M3_FACT_ATTESTATION_KEY;
  process.env.M4_M3_DRIVER_TOKEN = token;
  process.env.M4_M3_FACT_ATTESTATION_KEY = token;
  try {
    const bridge = fixture();
    const fact: M3DriverFact = { intentId: "int_bridge", expectedUpdatedAt: at, eventKind: "submitted", eventId: "same_secret", dedupeKey: "intent:int_bridge:submitted:same_secret", evidenceId: null, note: "bad configuration", at };
    await assert.rejects(() => invoke(bridge.ctx, fact, createHmac("sha256", token).update(canonicalM3DriverFact(fact)).digest("hex")), /must be distinct/);
    assert.equal(bridge.current().state, "awaiting_m3");
  } finally {
    if (previousToken === undefined) delete process.env.M4_M3_DRIVER_TOKEN; else process.env.M4_M3_DRIVER_TOKEN = previousToken;
    if (previousKey === undefined) delete process.env.M4_M3_FACT_ATTESTATION_KEY; else process.env.M4_M3_FACT_ATTESTATION_KEY = previousKey;
  }
});

test("R3: an attested already-submitted financial fact remains reportable after M4 revision advances", async () => {
  const previousToken = process.env.M4_M3_DRIVER_TOKEN;
  const previousKey = process.env.M4_M3_FACT_ATTESTATION_KEY;
  process.env.M4_M3_DRIVER_TOKEN = token;
  process.env.M4_M3_FACT_ATTESTATION_KEY = key;
  try {
    const stale = fixture(2);
    const submitted: M3DriverFact = { intentId: "int_bridge", expectedUpdatedAt: at, eventKind: "submitted", eventId: "m3_submitted_stale", dedupeKey: "intent:int_bridge:submitted:stale", evidenceId: null, note: "attested pre-revision submission", at };
    await invoke(stale.ctx, submitted);
    assert.equal(stale.current().state, "handed_off");
  } finally {
    if (previousToken === undefined) delete process.env.M4_M3_DRIVER_TOKEN; else process.env.M4_M3_DRIVER_TOKEN = previousToken;
    if (previousKey === undefined) delete process.env.M4_M3_FACT_ATTESTATION_KEY; else process.env.M4_M3_FACT_ATTESTATION_KEY = previousKey;
  }
});
