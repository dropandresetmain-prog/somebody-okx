import test from "node:test";
import assert from "node:assert/strict";
import {
  appendIntegrationEvent,
  founderMerchantLabelFromOfferingName,
  integrationEventId,
  parseSubmittedTxHash,
} from "../lib/integration/persistedEvents";
import { normalizeIntegrationEventsForProduct } from "../lib/integration/productProjection";
import { buildDecisionPassInput } from "../lib/management/decisionPass";
import { TESTNET_DEMO_OFFERINGS } from "../lib/market/testnetDemoMarket";
import type { DecisionPassReads } from "../lib/management/decisionPass";

test("marketplace: testnet discovery witness lists 3 founder merchant labels", async () => {
  process.env.SOMEBODY_EXECUTION_MODE = "testnet_demo";
  const reads = minimalReads();
  const built = await buildDecisionPassInput(reads, validProposal(), async () => null);
  assert.equal(built.ok, true);
  assert.ok(built.marketDiscovery);
  assert.equal(built.marketDiscovery!.offeringNames.length, 3);
  assert.deepEqual(built.marketDiscovery!.offeringNames, [
    "Social Media Guru",
    "Token Market Intelligence",
    "Wallet / Onchain Risk Intelligence",
  ]);
});

test("marketplace: duplicate append is idempotent per epoch", () => {
  const id = integrationEventId({
    integrationId: "okx_marketplace",
    action: "market_search",
    objectiveKey: "obj_1",
    epochKey: "epoch_a",
  });
  const event = {
    id,
    objectiveKey: "obj_1",
    integrationId: "okx_marketplace" as const,
    action: "market_search" as const,
    occurredAt: 1,
    resourceNeed: "Need",
    candidateLabels: ["A", "B", "C"],
  };
  const once = appendIntegrationEvent([], event);
  const twice = appendIntegrationEvent(once, event);
  assert.equal(once.length, 1);
  assert.equal(twice.length, 1);
});

test("marketplace: new epoch may add another search event", () => {
  const base = {
    objectiveKey: "obj_1",
    integrationId: "okx_marketplace" as const,
    action: "market_search" as const,
    occurredAt: 1,
    resourceNeed: "Need",
    candidateLabels: ["A"],
  };
  const a = appendIntegrationEvent([], {
    ...base,
    id: integrationEventId({
      integrationId: "okx_marketplace",
      action: "market_search",
      objectiveKey: "obj_1",
      epochKey: "epoch_a",
    }),
  });
  const b = appendIntegrationEvent(a, {
    ...base,
    id: integrationEventId({
      integrationId: "okx_marketplace",
      action: "market_search",
      objectiveKey: "obj_1",
      epochKey: "epoch_b",
    }),
  });
  assert.equal(b.length, 2);
});

test("wallet: payment_preparing idempotent per intent", () => {
  const id = integrationEventId({
    integrationId: "okx_agentic_wallet",
    action: "payment_preparing",
    objectiveKey: "obj_1",
    epochKey: "intent_1",
    intentId: "intent_1",
  });
  const row = {
    id,
    objectiveKey: "obj_1",
    integrationId: "okx_agentic_wallet" as const,
    action: "payment_preparing" as const,
    intentId: "intent_1",
    occurredAt: 2,
    merchantLabel: "Social Media Guru",
    amount: { amount: "0.01", currency: "USD₮0" },
    networkLabel: "X Layer Testnet",
  };
  assert.equal(appendIntegrationEvent([row], row).length, 1);
});

test("x layer: parseSubmittedTxHash only from submitted notes", () => {
  assert.equal(
    parseSubmittedTxHash("handed to M3 buyer rail; submitted tx 0xabc123 (submitted ≠ settled)"),
    "0xabc123",
  );
  assert.equal(parseSubmittedTxHash("prepared durable M3 purchase"), null);
});

test("x layer: submitted and settlement are separate ids", () => {
  const submitted = integrationEventId({
    integrationId: "x_layer_testnet",
    action: "transaction_submitted",
    objectiveKey: "obj_1",
    epochKey: "intent_1:0xabc",
    intentId: "intent_1",
  });
  const settled = integrationEventId({
    integrationId: "x_layer_testnet",
    action: "settlement_confirmed",
    objectiveKey: "obj_1",
    epochKey: "intent_1:0xabc",
    intentId: "intent_1",
  });
  assert.notEqual(submitted, settled);
});

test("projection: persisted rows normalize to integration_activity inputs", () => {
  const rows = normalizeIntegrationEventsForProduct([
    {
      id: "okx_marketplace:market_search:obj_1:epoch",
      objectiveKey: "obj_1",
      integrationId: "okx_marketplace",
      action: "market_search",
      occurredAt: 100,
      resourceNeed: "Cross-platform social intelligence",
      candidateLabels: TESTNET_DEMO_OFFERINGS.map((o) => founderMerchantLabelFromOfferingName(o.name)),
    },
  ]);
  assert.equal(rows.length, 1);
  assert.equal(rows[0]!.integration.label, "OKX Marketplace");
  assert.equal(rows[0]!.candidates?.length, 3);
});

function validProposal() {
  return {
    strategy: "HYBRID",
    desiredCapabilities: ["growth_launch_operations"],
    needsExternalResourceClass: "proprietary_data",
  };
}

function minimalReads(): DecisionPassReads {
  return {
    contract: {
      contractId: "c1",
      objectiveKey: "obj_test",
      revision: 1,
      intent: "Launch week social plan",
      createdAt: 1,
    },
    currentContractRevision: 1,
    requirement: {
      requirementKey: "req_social",
      contractRevision: 1,
      revision: 1,
      title: "Social intelligence",
      mustBeTrue: "Channels covered",
      scope: "TikTok, Instagram, Facebook, X",
      priority: "required",
      dependsOnRequirementKeys: [],
      state: "active",
      strategy: null,
      expectedOutput: null,
      requiredResourceClasses: ["proprietary_data"],
      authorizedPurposeKinds: ["social_intelligence"],
      updatedAt: 1,
    },
    inventory: [],
    creationAllowed: false,
    budget: {
      objectiveKey: "obj_test",
      startedAt: 1,
      limits: {
        maxElapsedMs: 300_000,
        maxManagementDecisions: 8,
        maxWorkerAttemptsPerRequirement: 4,
        maxExternalSpendUsd: 10,
        maxModelCalls: 40,
      },
      used: {
        elapsedMs: 0,
        managementDecisions: 0,
        attemptsByRequirement: {},
        externalSpendCommittedUsd: 0,
        modelCalls: 0,
      },
    },
    grant: null,
    at: 1_000,
    decisionId: "dec_preview",
    openResourceNeeds: [],
    prerequisiteResults: [],
    scopedCoveredResourceClasses: [],
    serialManagerProtocol: true,
  };
}
