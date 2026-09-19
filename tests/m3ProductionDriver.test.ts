import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { assertCurrentFounderSpendAuthority, runM3ProductionDriver, type DriverSnapshot, type M3DriverStore } from "../lib/management/m3ProductionDriver";
import type { ExecutionIntent } from "../lib/management/types";
import type { M3BuyerRailDeps } from "../lib/management/m3BuyerRail";
import { FilePurchaseLedger, type PurchaseLedger } from "../lib/payment/purchaseLedger";
import { FilePreviewLedger } from "../lib/payment/previewLedger";
import type { PurchaseRecord } from "../lib/payment/types";
import { createPurchase } from "../lib/payment/purchase";
import { prepareApprovedPurchase } from "../lib/payment/supervisedPurchase";
import { prepareFounderVisiblePreview } from "../lib/payment/supervisedPreparation";
import { handoffApprovedPurchaseToM3 } from "../lib/management/m3BuyerRail";
import { FileFounderConfirmationLedger, persistFounderConfirmation } from "../lib/payment/supervisedDriverAdapter";
import { createLocalProductionComposition } from "../lib/payment/localProductionComposition";

const at = 1960000000000;
const intent: ExecutionIntent = {
  intentId: "int_driver_fixture", idempotencyKey: "idem_driver_fixture", objectiveKey: "obj_driver",
  requirementKey: "req_driver", contractRevision: 1, decisionId: "dec_driver", kind: "external_acquisition",
  strategy: "BUY", target: { offeringId: "offer_driver", providerId: "provider", serviceId: "service", resourceClass: "data", endpointRef: null },
  terms: { priceUsd: 4, priceProvenance: "provider_quote", requiresApproval: false, approvalId: "approval_driver" },
  state: "awaiting_m3", attempts: 0, lastEventId: null, resultEvidenceId: null, verificationEvidenceId: null,
  boundaryNote: "awaiting local M3 driver", createdAt: at, updatedAt: at,
};

class MemoryPurchases implements PurchaseLedger {
  private readonly rows = new Map<string, PurchaseRecord>();
  get(id: string) { return this.rows.get(id) ?? null; }
  put(purchase: PurchaseRecord) { this.rows.set(purchase.id, structuredClone(purchase)); return purchase; }
}

function store(initial = intent, founderSpendApprovalCurrent = true): M3DriverStore & { writes: number; current: ExecutionIntent } {
  return {
    writes: 0,
    current: structuredClone(initial),
    async read(id) { return id === this.current.intentId ? { intent: this.current, objectiveExists: true, contractCurrent: true, requirementCurrent: true, founderSpendApprovalCurrent } : null; },
    async write(change) {
      assert.equal(change.expectedIntent.updatedAt, this.current.updatedAt, "driver writes against the fresh authoritative intent");
      this.current = change.nextIntent;
      this.writes += 1;
    },
  };
}

function rail(): M3BuyerRailDeps {
  let settled = false;
  let resultAvailable = false;
  return {
    mode: "m3_available_bounded", now: () => at,
    railConfig: { allowedNetworks: ["eip155:1952"], maxSpend: "10000" },
    executor: { kind: "test_scaffold", async executeApprovedPayment() { return { submitted: true, transactionHash: "0x" + "1".repeat(64), note: "SIMULATED: no signing or spend" }; } },
    fetchLiveChallenge: async () => ({ x402Version: 2, resource: { url: "/paid" }, accepts: [{ scheme: "exact", network: "eip155:1952", asset: "0xasset", amount: "10000", payTo: "0xrecipient", resource: "/paid", maxTimeoutSeconds: 60, extra: { name: "USDT0", version: "1" } }] }),
    buildApproval: ({ approvalId, liveTerms }) => approvalId ? { approver: "founder", approvalId, approvedAt: at, approvedMaxAmount: liveTerms.maxAmountRequired, approvedNetwork: liveTerms.network, approvedAsset: liveTerms.asset, approvedPayTo: liveTerms.payTo } : null,
    settlementReader: { async readSettlement() { return settled ? { settled: true, settledAt: at + 1 } : { settled: false }; } },
    paidRequestSender: { async sendWithPayment() { return resultAvailable ? { success: true, result: { simulated: true } } : { success: false }; } },
    verifyResult: () => ({ verified: true, verificationProof: "SIMULATED verification" }),
    // Test-only controls are intentionally exposed only inside this deterministic fixture.
    get setSettled() { return () => { settled = true; }; },
    get setResultAvailable() { return () => { resultAvailable = true; }; },
  } as M3BuyerRailDeps;
}

test("D1-D11: exact persisted awaiting_m3 intent runs one simulated purchase, resumes one fact at a time, and never signs in prepare", async () => {
  const backing = store();
  const purchases = new MemoryPurchases();
  const deps = rail() as M3BuyerRailDeps & { setSettled: () => void; setResultAvailable: () => void };

  await assert.rejects(() => runM3ProductionDriver("inspect", "wrong", { store: backing, purchases, rail: deps }), /not found/);
  const prepared = await runM3ProductionDriver("prepare", intent.intentId, { store: backing, purchases, rail: deps });
  assert.equal(prepared.purchase?.id, intent.intentId);
  assert.equal(prepared.purchase?.state, "prepared");
  assert.equal(backing.current.state, "awaiting_m3", "prepare has no M4 execution transition");
  const preparedAgain = await runM3ProductionDriver("prepare", intent.intentId, { store: backing, purchases, rail: deps });
  assert.equal(preparedAgain.changed, false, "restart/reprepare keeps the same durable purchase");
  await assert.rejects(() => runM3ProductionDriver("execute", intent.intentId, { store: backing, purchases, rail: deps }), /disabled/);

  const submitted = await runM3ProductionDriver("execute", intent.intentId, { store: backing, purchases, rail: deps, executionAuthorized: true });
  assert.equal(submitted.purchase?.id, intent.intentId);
  assert.equal(submitted.purchase?.state, "submitted");
  assert.equal(submitted.intent.state, "handed_off");
  const resting = await runM3ProductionDriver("observe", intent.intentId, { store: backing, purchases, rail: deps });
  assert.equal(resting.purchase?.state, "submitted", "submitted is not settled");
  deps.setSettled();
  const settled = await runM3ProductionDriver("observe", intent.intentId, { store: backing, purchases, rail: deps });
  assert.equal(settled.purchase?.state, "settled", "one observation sees settlement only");
  const noResult = await runM3ProductionDriver("observe", intent.intentId, { store: backing, purchases, rail: deps });
  assert.equal(noResult.purchase?.state, "settled", "settled provider gap cannot repay");
  deps.setResultAvailable();
  const received = await runM3ProductionDriver("observe", intent.intentId, { store: backing, purchases, rail: deps });
  assert.equal(received.purchase?.state, "result_received");
  assert.equal(received.intent.state, "result_recorded");
  const verified = await runM3ProductionDriver("observe", intent.intentId, { store: backing, purchases, rail: deps });
  assert.equal(verified.purchase?.state, "verified");
  assert.equal(verified.intent.state, "verified");
  assert.equal(verified.events[0]?.reason, "verification_result");
});

test("D14: stale business authority rejects a new execution but permits read-only reconciliation", async () => {
  const stale = store();
  stale.read = async (id) => id === intent.intentId ? { intent: stale.current, objectiveExists: true, contractCurrent: false, requirementCurrent: false, founderSpendApprovalCurrent: true } : null;
  const deps = rail();
  await assert.rejects(() => runM3ProductionDriver("prepare", intent.intentId, { store: stale, purchases: new MemoryPurchases(), rail: deps }), /stale/);
  const reconciled = await runM3ProductionDriver("reconcile", intent.intentId, { store: stale, purchases: new MemoryPurchases(), rail: deps });
  assert.equal(reconciled.stale, true);
  assert.equal(reconciled.changed, false);
});

test("D5: a fresh process-facing M3 purchase ledger instance reloads the same stable purchase", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "m3-driver-ledger-"));
  try {
    const file = path.join(root, "purchases.json");
    const first = new FilePurchaseLedger(file);
    const prepared = { ...intent, state: "awaiting_m3" as const };
    const purchase = { id: prepared.intentId, objectiveKey: prepared.objectiveKey, resourceNeedId: prepared.requirementKey, offeringId: prepared.target.offeringId!, idempotencyKey: prepared.idempotencyKey, state: "prepared" as const, boundTerms: null, approval: null, receipt: null, result: null, verified: false, createdAt: at, updatedAt: at };
    first.put(purchase);
    const restarted = new FilePurchaseLedger(file);
    assert.deepEqual(restarted.get(prepared.intentId), purchase);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("R3: the exact current founder spend grant is mandatory before every pre-submission authority opening, but never blocks financial observation", async () => {
  const invalidSnapshot: DriverSnapshot = {
    intent, objectiveExists: true, contractCurrent: true, requirementCurrent: true, founderSpendApprovalCurrent: false,
  };
  for (const operation of ["prepare", "preview", "confirm", "execute"] as const) {
    assert.throws(() => assertCurrentFounderSpendAuthority(invalidSnapshot, operation), /exact founder spend grant/);
  }
  const invalid = store(intent, false);
  await assert.rejects(() => runM3ProductionDriver("prepare", intent.intentId, { store: invalid, purchases: new MemoryPurchases(), rail: rail() }), /exact founder spend grant/);
  await assert.rejects(() => runM3ProductionDriver("execute", intent.intentId, { store: invalid, purchases: new MemoryPurchases(), rail: rail(), executionAuthorized: true }), /exact founder spend grant/);

  const afterSubmission = store({ ...intent, state: "handed_off" }, false);
  const purchases = new MemoryPurchases();
  purchases.put({
    ...createPurchase({ id: intent.intentId, objectiveKey: intent.objectiveKey, resourceNeedId: intent.requirementKey, offeringId: intent.target.offeringId!, idempotencyKey: intent.idempotencyKey, at }),
    state: "submitted",
    boundTerms: { scheme: "exact", network: "eip155:1952", asset: "0xasset", maxAmountRequired: "10000", payTo: "0xrecipient", resource: "/paid", eip712: { name: "USDT0", version: "1" }, maxTimeoutSeconds: 60 },
  });
  const observation = await runM3ProductionDriver("observe", intent.intentId, { store: afterSubmission, purchases, rail: rail() });
  assert.equal(observation.purchase?.state, "reconciliation_required", "revocation after submission never suppresses a necessary financial observation; an incomplete durable receipt is conservatively reconciled");
  const reconciliation = await runM3ProductionDriver("reconcile", intent.intentId, { store: afterSubmission, purchases, rail: rail() });
  assert.equal(reconciliation.changed, false, "reconciliation remains read-only after a grant revocation");
});

test("R3: the production CLI has no adapter override and its execute/observe path is the concrete local composition", () => {
  const source = fs.readFileSync(path.resolve(process.cwd(), "scripts/m4-m3-production-driver.ts"), "utf8");
  assert.doesNotMatch(source, /adapter-module/);
  assert.doesNotMatch(source, /await import\(/);
  assert.match(source, /mode === "observe" \|\| mode === "execute"\) supplied = createLocalProductionComposition\(applicationRoot\)/);
  assert.match(source, /tests inject dependencies[\s\S]{0,100}library driver seam/);
});

test("D4-D6/D20: durable confirmation is purchase-and-approval-bound; payment_attempted persists before ambiguous executor return", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "m3-driver-confirmation-"));
  try {
    const challenge = { x402Version: 2, resource: { url: "/paid" }, accepts: [{ scheme: "exact", network: "eip155:1952", asset: "0xasset", amount: "10000", payTo: "0xrecipient", resource: "/paid", maxTimeoutSeconds: 60, extra: { name: "USDT0", version: "1" } }] };
    const purchase = createPurchase({ id: intent.intentId, objectiveKey: intent.objectiveKey, resourceNeedId: intent.requirementKey, offeringId: intent.target.offeringId!, idempotencyKey: intent.idempotencyKey, at });
    const approval = { approver: "founder", approvalId: intent.terms.approvalId!, approvedMaxAmount: "10000", approvedNetwork: "eip155:1952", approvedAsset: "0xasset", approvedPayTo: "0xrecipient", approvedAt: at };
    const approved = prepareApprovedPurchase({ purchase, approval, challengeBody: challenge, config: { allowedNetworks: ["eip155:1952"], maxSpend: "10000" }, intentId: intent.intentId, at }).purchase;
    const confirmations = new FileFounderConfirmationLedger(path.join(root, "confirmations.json"));
    const confirmation = persistFounderConfirmation({ purchase: approved, previewBody: challenge, confirmationId: "confirm_driver", merchantEndpoint: "http://127.0.0.1:4021/paid", confirmedAt: at, confirmations });
    assert.equal(new FileFounderConfirmationLedger(path.join(root, "confirmations.json")).get(approved.id)?.approvalId, approval.approvalId, "restart reloads safe confirmation authority");
    assert.throws(() => confirmations.put({ ...confirmation, approvalId: "another" }), /immutable/);

    let attempted: PurchaseRecord | null = null;
    const ambiguousRail: M3BuyerRailDeps = {
      ...rail(), mode: "m3_available_bounded",
      executor: { kind: "test_scaffold", async executeApprovedPayment() { const error = new Error("lost response"); error.name = "OfficialPaymentAmbiguousError"; throw error; } },
    };
    const result = await handoffApprovedPurchaseToM3({ intent, purchase: approved, deps: ambiguousRail, persistPaymentAttempt: async (value) => { attempted = value; } });
    assert.ok(attempted, "payment_attempted must be persisted before executor reachability");
    assert.equal((attempted as PurchaseRecord).state, "payment_attempted", "attempt fact is durable before executor may reach a merchant");
    assert.equal(result.purchase?.state, "reconciliation_required");
    assert.equal(result.intent.state, "reconciliation_required");
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("D7 runtime: the concrete local production composition constructs without network, wallet, or executor invocation", () => {
  const previous = process.env.M3_BUYER_ADDRESS;
  process.env.M3_BUYER_ADDRESS = "0x1111111111111111111111111111111111111111";
  try {
    const composition = createLocalProductionComposition(path.resolve(process.cwd()));
    assert.equal(composition.executionAuthorized, false, "real execution is disabled unless a future supervised pass explicitly enables it");
    assert.equal(composition.rail.executor.kind, "official_onchainos");
    assert.ok(composition.railForPurchase);
  } finally {
    if (previous === undefined) delete process.env.M3_BUYER_ADDRESS;
    else process.env.M3_BUYER_ADDRESS = previous;
  }
});

test("D7-D14: preview handles may refresh for identical terms but every material challenge mutation is refused before execution", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "m3-driver-preview-"));
  try {
    const challenge = { x402Version: 2, resource: { url: "/paid" }, accepts: [{ scheme: "exact", network: "eip155:1952", asset: "0xasset", amount: "10000", payTo: "0xrecipient", resource: "/paid", maxTimeoutSeconds: 60, extra: { name: "USDT0", version: "1" } }] };
    const previews = new FilePreviewLedger(path.join(root, "previews.json"));
    const purchase = createPurchase({ id: intent.intentId, objectiveKey: intent.objectiveKey, resourceNeedId: intent.requirementKey, offeringId: intent.target.offeringId!, idempotencyKey: intent.idempotencyKey, at });
    const prepared = prepareFounderVisiblePreview({ intent, purchase, challengeBody: challenge, railConfig: { allowedNetworks: ["eip155:1952"], maxSpend: "10000" }, previews, at });
    assert.equal(prepared.purchase.state, "approved");
    // Payment handles are founder-visible only. A different one with matching
    // terms is legal and changes no financial identity or approval.
    const refreshed = previews.put(purchase.id, { ...prepared.preview, paymentId: "different-preview-handle", acquiredAt: at + 1 });
    assert.equal(refreshed.paymentId, "different-preview-handle");

    const mutations: Array<[string, Record<string, unknown>]> = [
      ["amount", { amount: "10001" }], ["asset", { asset: "0xother" }], ["network", { network: "eip155:1" }],
      ["recipient", { payTo: "0xother" }], ["resource", { resource: "/other" }], ["timeout", { maxTimeoutSeconds: 61 }],
      ["EIP-712 domain", { extra: { name: "USDT1", version: "1" } }],
    ];
    for (const [name, mutation] of mutations) {
      const isolated = new FilePreviewLedger(path.join(root, `${name}.json`));
      const fresh = createPurchase({ id: `${intent.intentId}_${name}`, objectiveKey: intent.objectiveKey, resourceNeedId: intent.requirementKey, offeringId: intent.target.offeringId!, idempotencyKey: `${intent.idempotencyKey}_${name}`, at });
      const changed = { ...challenge, accepts: [{ ...challenge.accepts[0], ...mutation }] };
      const changedIntent = { ...intent, intentId: fresh.id, idempotencyKey: fresh.idempotencyKey };
      if (name === "network") {
        assert.throws(() => prepareFounderVisiblePreview({ intent: changedIntent, purchase: fresh, challengeBody: changed, railConfig: { allowedNetworks: ["eip155:1952"], maxSpend: "10000" }, previews: isolated, at }), /allowed networks/);
      } else {
        const baseline = prepareFounderVisiblePreview({ intent: changedIntent, purchase: fresh, challengeBody: challenge, railConfig: { allowedNetworks: ["eip155:1952"], maxSpend: "10000" }, previews: isolated, at });
        const changedTerms = name === "amount"
          ? { maxAmountRequired: "10001" }
          : name === "EIP-712 domain"
            ? { eip712: { name: "USDT1", version: "1" } }
            : mutation;
        assert.throws(() => isolated.put(fresh.id, { ...baseline.preview, terms: { ...baseline.preview.terms, ...changedTerms } }), /immutable/, `${name} must not replace the stored preview terms`);
      }
    }
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("D20-D23: a restart from attempted, submitted, settled, result_received, or verified never reaches the executor again", async () => {
  const states: PurchaseRecord["state"][] = ["payment_attempted", "submitted", "settled", "result_received", "verified"];
  for (const state of states) {
    const backing = store({ ...intent, state: state === "payment_attempted" ? "awaiting_m3" : state === "submitted" || state === "settled" ? "handed_off" : state === "result_received" ? "result_recorded" : "verified" });
    const purchases = new MemoryPurchases();
    purchases.put({ ...createPurchase({ id: intent.intentId, objectiveKey: intent.objectiveKey, resourceNeedId: intent.requirementKey, offeringId: intent.target.offeringId!, idempotencyKey: intent.idempotencyKey, at }), state, boundTerms: state === "payment_attempted" ? null : { scheme: "exact", network: "eip155:1952", asset: "0xasset", maxAmountRequired: "10000", payTo: "0xrecipient", resource: "/paid", eip712: { name: "USDT0", version: "1" }, maxTimeoutSeconds: 60 }, approval: null });
    let executorCalls = 0;
    const deps = rail();
    deps.executor = { kind: "test_scaffold", async executeApprovedPayment() { executorCalls += 1; return { submitted: true, transactionHash: "0x" + "1".repeat(64) }; } };
    await assert.rejects(() => runM3ProductionDriver("execute", intent.intentId, { store: backing, purchases, rail: deps, executionAuthorized: true }), /refusing execution|not awaiting_m3/);
    assert.equal(executorCalls, 0, `${state} restart cannot call executor again`);
  }
});

test("R3: a failed governed M4 writeback leaves a durable outbox that restart observation replays without re-verifying or paying", async () => {
  const backing = store({ ...intent, state: "result_recorded", updatedAt: at + 10 });
  let rejectWrite = true;
  backing.write = async (change) => {
    if (rejectWrite) throw new Error("simulated Convex interruption");
    assert.equal(change.expectedIntent.updatedAt, backing.current.updatedAt);
    backing.current = change.nextIntent;
    backing.writes += 1;
  };
  const purchases = new MemoryPurchases();
  purchases.put({
    ...createPurchase({ id: intent.intentId, objectiveKey: intent.objectiveKey, resourceNeedId: intent.requirementKey, offeringId: intent.target.offeringId!, idempotencyKey: intent.idempotencyKey, at }),
    state: "result_received", result: { simulated: true },
  });
  let verifierCalls = 0;
  const deps = rail();
  deps.verifyResult = () => { verifierCalls += 1; return { verified: true, verificationProof: "simulated proof" }; };
  await assert.rejects(() => runM3ProductionDriver("observe", intent.intentId, { store: backing, purchases, rail: deps }), /interruption/);
  const stranded = purchases.get(intent.intentId) as PurchaseRecord & { pendingM4Sync?: unknown };
  assert.equal(stranded.state, "verified");
  assert.ok(stranded.pendingM4Sync, "the exact M4 transition is durable with the financial fact");
  rejectWrite = false;
  const resumed = await runM3ProductionDriver("observe", intent.intentId, { store: backing, purchases, rail: deps });
  assert.equal(resumed.intent.state, "verified");
  assert.equal((purchases.get(intent.intentId) as PurchaseRecord & { pendingM4Sync?: unknown }).pendingM4Sync, undefined);
  assert.equal(verifierCalls, 1, "restart delivers the outbox instead of running verification again");
});

test("R3: a committed-but-unacknowledged M4 write clears the restart outbox despite different pre-observation and kernel clocks", async () => {
  const initial = { ...intent, state: "result_recorded" as const, updatedAt: 10 };
  const backing = store(initial);
  let lostAcknowledgement = true;
  backing.write = async (change) => {
    backing.current = change.nextIntent; // Convex committed the transition.
    if (lostAcknowledgement) throw new Error("simulated lost bridge acknowledgement");
    backing.writes += 1;
  };
  const purchases = new MemoryPurchases();
  purchases.put({ ...createPurchase({ id: initial.intentId, objectiveKey: initial.objectiveKey, resourceNeedId: initial.requirementKey, offeringId: initial.target.offeringId!, idempotencyKey: initial.idempotencyKey, at: 10 }), state: "result_received", result: { simulated: true } });
  const deps = rail();
  deps.now = () => 1010; // M3 kernel clock after the driver's pre-observation clock.
  await assert.rejects(() => runM3ProductionDriver("observe", initial.intentId, { store: backing, purchases, rail: deps }), /lost bridge acknowledgement/);
  lostAcknowledgement = false;
  const resumed = await runM3ProductionDriver("observe", initial.intentId, { store: backing, purchases, rail: deps });
  assert.equal(resumed.intent.state, "verified");
  assert.equal((purchases.get(initial.intentId) as PurchaseRecord & { pendingM4Sync?: unknown }).pendingM4Sync, undefined);
});
