// OKX / X Layer Activity branding — focused fixtures (spec §18 A–F).
//
// Pure presentational + pure projection tests only: renderToStaticMarkup for
// the component layer, and frontendProjection functions directly for the
// projection layer. No Convex, no clock, no network. Fixtures are shaped
// like the product contract types for test purposes only — never copied
// into production code.

import test from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { ActivityItem, IntegrationIdentity } from "../app/product/contracts";
import { Activity } from "../app/product/components/Activity";
import { INTEGRATION_IDENTITIES } from "../app/product/integrations";
import {
  deriveObjectiveFacts,
  projectActivity,
  type ProductIntegrationEvent,
  type ProductObjectiveRow,
  type ProductRequirement,
  type ProductSource,
} from "../lib/product/frontendProjection";

const NOW = 1_820_000_000_000;
const KEY = "obj_1";

// ── Minimal ProductSource fixture (mirrors tests/frontendContractProjection.test.ts) ──

function objective(over: Partial<ProductObjectiveRow> = {}): ProductObjectiveRow {
  return {
    key: KEY,
    request: "Get cross-platform social intelligence for the launch.",
    createdAt: NOW - 200_000,
    updatedAt: NOW - 1000,
    state: "executing",
    result: null,
    workItems: [],
    companyArtifacts: [],
    acquisitionResults: [],
    resourceNeeds: [],
    finalSemanticAssessment: null,
    controlNotes: [],
    pendingFinalAssessmentRevision: null,
    interpretationStatus: null,
    interpretationPending: false,
    pendingDecisionRequirementKey: null,
    managementPassWatchActive: false,
    ...over,
  };
}

function req(key: string, over: Partial<ProductRequirement> = {}): ProductRequirement {
  return {
    requirementKey: key,
    contractRevision: 1,
    priority: "required",
    title: `Title ${key}`,
    mustBeTrue: `${key} must be true`,
    scope: `scope ${key}`,
    dependsOnRequirementKeys: [],
    state: "active",
    resolution: null,
    blockedReason: null,
    waiver: null,
    updatedAt: NOW - 5000,
    ...over,
  };
}

function source(over: Partial<ProductSource> = {}): ProductSource {
  return {
    objective: objective(),
    contracts: [{ contractId: "c1", revision: 1, intent: "Get cross-platform social intelligence", createdAt: NOW - 190_000 }],
    requirements: [req("r1")],
    assignments: [],
    decisions: [],
    intents: [],
    workers: [],
    evidence: [],
    ...over,
  };
}

// ── Integration identities under test ───────────────────────────────────────

const OKX_MARKETPLACE: IntegrationIdentity = INTEGRATION_IDENTITIES.okx_marketplace;
const OKX_WALLET: IntegrationIdentity = INTEGRATION_IDENTITIES.okx_agentic_wallet;
const X_LAYER: IntegrationIdentity = INTEGRATION_IDENTITIES.x_layer_testnet;

// ── A. OKX Marketplace fixture ──────────────────────────────────────────────

test("A. OKX Marketplace card renders logo, name, search action, and all 3 candidates", () => {
  const items: ActivityItem[] = [
    {
      id: "act_market",
      type: "integration_activity",
      occurredAt: NOW - 50_000,
      actor: { kind: "external", id: "okx_marketplace", label: "OKX Marketplace" },
      title: "Searched for external services",
      importance: "standard",
      payload: {
        integration: OKX_MARKETPLACE,
        action: "market_search",
        headline: "Searched for external services",
        resourceNeed: "Cross-platform social intelligence",
        candidateCount: 3,
        candidates: [
          { label: "Social Media Guru" },
          { label: "Token Market Intelligence" },
          { label: "Wallet / Onchain Risk Intelligence" },
        ],
      },
    },
  ];
  const html = renderToStaticMarkup(createElement(Activity, { items }));
  assert.ok(html.includes('src="/integrations/okx.svg"'), "literal OKX logo asset must be referenced");
  assert.ok(html.includes("OKX Marketplace"), "canonical identity label must appear");
  assert.ok(html.includes("Searched for external services"), "search action copy must appear");
  assert.ok(html.includes("Cross-platform social intelligence"), "the Need must appear");
  assert.ok(html.includes("3 Testnet services considered"));
  for (const name of ["Social Media Guru", "Token Market Intelligence", "Wallet / Onchain Risk Intelligence"]) {
    assert.ok(html.includes(name), `candidate "${name}" must be visible`);
  }
  assert.ok(!html.includes("OKX-owned"), "merchants must never be called OKX-owned");
});

// ── B. OKX Agentic Wallet fixture ───────────────────────────────────────────

test("B. OKX Agentic Wallet card renders the exact copy block", () => {
  const items: ActivityItem[] = [
    {
      id: "act_wallet",
      type: "integration_activity",
      occurredAt: NOW - 40_000,
      actor: { kind: "external", id: "okx_agentic_wallet", label: "OKX Agentic Wallet" },
      title: "Preparing x402 payment",
      importance: "standard",
      payload: {
        integration: OKX_WALLET,
        action: "payment_preparing",
        headline: "Preparing x402 payment",
        merchantLabel: "Social Media Guru",
        amount: { amount: "0.01", currency: "USD₮0" },
        networkLabel: "X Layer Testnet",
      },
    },
  ];
  const html = renderToStaticMarkup(createElement(Activity, { items }));
  assert.ok(html.includes('src="/integrations/okx.svg"'), "literal OKX logo asset must be referenced");
  assert.ok(html.includes("OKX Agentic Wallet"));
  assert.ok(html.includes("Preparing x402 payment"));
  assert.ok(html.includes("0.01"));
  assert.ok(html.includes("USD₮0"), "amount currency USD₮0 must appear");
  assert.ok(html.includes("X Layer Testnet"), "network label must appear");
  assert.ok(html.includes("Social Media Guru"), "merchant label must appear");
  // Never show private keys / signatures / secret material.
  for (const forbidden of ["private key", "signature", "secret", "authorization token"]) {
    assert.ok(!html.toLowerCase().includes(forbidden), `must never render "${forbidden}"`);
  }
  // "Preparing" must never be presented as "submitted".
  assert.ok(!/transaction submitted/i.test(html));
});

// ── C. X Layer submitted fixture ────────────────────────────────────────────

const TX_HASH = "0x72af1e9c8b4d3f0a5e6d7c8b9a0f1e2d3c4b5a6972af91e";

function shortenTxHash(hash: string): string {
  return hash.length <= 14 ? hash : `${hash.slice(0, 6)}…${hash.slice(-4)}`;
}

test("C. X Layer Testnet submitted card renders identity, submitted action, and the tx hash", () => {
  const items: ActivityItem[] = [
    {
      id: "act_submitted",
      type: "integration_activity",
      occurredAt: NOW - 30_000,
      actor: { kind: "external", id: "x_layer_testnet", label: "X Layer Testnet" },
      title: "Transaction submitted",
      importance: "standard",
      payload: {
        integration: X_LAYER,
        action: "transaction_submitted",
        headline: "Transaction submitted",
        merchantLabel: "Social Media Guru",
        amount: { amount: "0.01", currency: "USD₮0" },
        txHash: TX_HASH,
      },
    },
  ];
  const html = renderToStaticMarkup(createElement(Activity, { items }));
  assert.ok(html.includes('src="/integrations/x-layer.svg"'), "literal X Layer logo asset must be referenced");
  assert.ok(html.includes("X Layer Testnet"));
  assert.ok(html.includes("Transaction submitted"));
  assert.ok(html.includes(shortenTxHash(TX_HASH)), "the (shortened) tx hash must be visible");
  assert.ok(!/settlement confirmed/i.test(html), "submitted must not read as confirmed");
});

// ── D. X Layer confirmed fixture (submitted ≠ confirmed) ───────────────────

test("D. X Layer Testnet settlement-confirmed card is visibly distinct from submitted", () => {
  const submittedItems: ActivityItem[] = [
    {
      id: "act_submitted_2",
      type: "integration_activity",
      occurredAt: NOW - 30_000,
      actor: { kind: "external", id: "x_layer_testnet", label: "X Layer Testnet" },
      title: "Transaction submitted",
      importance: "standard",
      payload: { integration: X_LAYER, action: "transaction_submitted", headline: "Transaction submitted", txHash: TX_HASH },
    },
  ];
  const confirmedItems: ActivityItem[] = [
    {
      id: "act_confirmed",
      type: "integration_activity",
      occurredAt: NOW - 20_000,
      actor: { kind: "external", id: "x_layer_testnet", label: "X Layer Testnet" },
      title: "Settlement confirmed",
      importance: "standard",
      payload: {
        integration: X_LAYER,
        action: "settlement_confirmed",
        headline: "Settlement confirmed",
        detail: "Payment settlement verified",
        amount: { amount: "0.01", currency: "USD₮0" },
        txHash: TX_HASH,
      },
    },
  ];
  const submittedHtml = renderToStaticMarkup(createElement(Activity, { items: submittedItems }));
  const confirmedHtml = renderToStaticMarkup(createElement(Activity, { items: confirmedItems }));

  assert.ok(confirmedHtml.includes("Settlement confirmed"));
  assert.ok(!confirmedHtml.includes("Transaction submitted"), "the confirmed card must not also claim submitted");
  assert.ok(!submittedHtml.includes("Settlement confirmed"), "the submitted card must not claim confirmation");
  assert.notEqual(submittedHtml, confirmedHtml, "submitted and confirmed must render as two distinguishable states");
});

// ── E. Full founder-facing story order (newest-first display, correct causal chronology) ──

test("E. Full story fixture: causal timestamps are correct and display order stays newest-first", () => {
  // Causal (real-world) order, oldest → newest:
  const t = {
    market_search: NOW - 90_000,
    jev_decision: NOW - 80_000,
    needs_you: NOW - 75_000,
    wallet_prep: NOW - 60_000,
    xlayer_submitted: NOW - 50_000,
    xlayer_confirmed: NOW - 40_000,
    merchant_result: NOW - 30_000,
    somebody_verified: NOW - 20_000,
    intern_resumed: NOW - 10_000,
  };
  const causalOrderIds = [
    "market_search",
    "jev_decision",
    "needs_you",
    "wallet_prep",
    "xlayer_submitted",
    "xlayer_confirmed",
    "merchant_result",
    "somebody_verified",
    "intern_resumed",
  ] as const;

  // Assert the fixture's own timestamps are causally monotonic before using them.
  const stamps = causalOrderIds.map((id) => t[id]);
  for (let i = 1; i < stamps.length; i++) {
    assert.ok(stamps[i] > stamps[i - 1], `"${causalOrderIds[i]}" must occur after "${causalOrderIds[i - 1]}"`);
  }

  const items: ActivityItem[] = [
    {
      id: "intern_resumed",
      type: "work_resumed",
      occurredAt: t.intern_resumed,
      actor: { kind: "intern", id: "w1", label: "Rae" },
      title: "Rae resumed with the acquired result",
      importance: "standard",
    },
    {
      id: "somebody_verified",
      type: "external_result_verified",
      occurredAt: t.somebody_verified,
      actor: { kind: "somebody", label: "Somebody" },
      title: "Somebody verified the acquired result",
      importance: "major",
    },
    {
      id: "merchant_result",
      type: "external_result_received",
      occurredAt: t.merchant_result,
      actor: { kind: "external", id: "social_media_guru", label: "Social Media Guru" },
      title: "Social Media Guru delivered the result",
      importance: "standard",
    },
    {
      id: "xlayer_confirmed",
      type: "integration_activity",
      occurredAt: t.xlayer_confirmed,
      actor: { kind: "external", id: "x_layer_testnet", label: "X Layer Testnet" },
      title: "Settlement confirmed",
      importance: "standard",
      payload: { integration: X_LAYER, action: "settlement_confirmed", headline: "Settlement confirmed", txHash: TX_HASH },
    },
    {
      id: "xlayer_submitted",
      type: "integration_activity",
      occurredAt: t.xlayer_submitted,
      actor: { kind: "external", id: "x_layer_testnet", label: "X Layer Testnet" },
      title: "Transaction submitted",
      importance: "standard",
      payload: { integration: X_LAYER, action: "transaction_submitted", headline: "Transaction submitted", txHash: TX_HASH },
    },
    {
      id: "wallet_prep",
      type: "integration_activity",
      occurredAt: t.wallet_prep,
      actor: { kind: "external", id: "okx_agentic_wallet", label: "OKX Agentic Wallet" },
      title: "Preparing x402 payment",
      importance: "standard",
      payload: {
        integration: OKX_WALLET,
        action: "payment_preparing",
        headline: "Preparing x402 payment",
        merchantLabel: "Social Media Guru",
        amount: { amount: "0.01", currency: "USD₮0" },
        networkLabel: "X Layer Testnet",
      },
    },
    {
      id: "needs_you",
      type: "founder_action_required",
      occurredAt: t.needs_you,
      actor: { kind: "somebody", label: "Somebody" },
      title: "Somebody needs your approval",
      importance: "major",
    },
    {
      id: "jev_decision",
      type: "manager_decision",
      occurredAt: t.jev_decision,
      actor: { kind: "somebody", label: "Somebody" },
      title: "Somebody chose to buy: Social Media Guru",
      importance: "major",
      payload: { selected: { approach: "BUY", label: "Social Media Guru" }, selectionSource: "jev" },
    },
    {
      id: "market_search",
      type: "integration_activity",
      occurredAt: t.market_search,
      actor: { kind: "external", id: "okx_marketplace", label: "OKX Marketplace" },
      title: "Searched for external services",
      importance: "standard",
      payload: {
        integration: OKX_MARKETPLACE,
        action: "market_search",
        headline: "Searched for external services",
        resourceNeed: "Cross-platform social intelligence",
        candidateCount: 3,
        candidates: [{ label: "Social Media Guru" }, { label: "Token Market Intelligence" }, { label: "Wallet / Onchain Risk Intelligence" }],
      },
    },
  ];
  // items is supplied newest-first, exactly as projectActivity would emit it.
  assert.deepEqual(
    items.map((i) => i.id),
    [...causalOrderIds].reverse(),
  );

  const html = renderToStaticMarkup(createElement(Activity, { items }));
  // The OKX Marketplace search card renders BEFORE (above) the Jev decision
  // card in the OUTPUT (newest-first) — but market_search happened first in
  // real time. Assert the founder-visible render order is newest-first,
  // i.e. the opposite of causal order in the HTML.
  const idxOf = (id: string) => html.indexOf(`data-activity-id="${id}"`);
  for (let i = 1; i < causalOrderIds.length; i++) {
    const earlier = causalOrderIds[i - 1];
    const later = causalOrderIds[i];
    assert.ok(idxOf(later) < idxOf(earlier), `newest-first render: "${later}" must render above "${earlier}"`);
  }
  // Sourcing decision stays a separate card from the OKX Marketplace card (§7).
  assert.ok(idxOf("market_search") >= 0 && idxOf("jev_decision") >= 0 && idxOf("market_search") !== idxOf("jev_decision"));
});

// ── F. Legacy compatibility — no integration events ─────────────────────────

test("F. Legacy Activity data with no integration events renders unchanged (no integration markup)", () => {
  const items: ActivityItem[] = [
    { id: "act_1", type: "objective_interpreted", occurredAt: NOW - 3000, actor: { kind: "somebody", label: "Somebody" }, title: "Somebody defined the outcome", importance: "major" },
    { id: "act_2", type: "intern_assigned", occurredAt: NOW - 2000, actor: { kind: "somebody", label: "Somebody" }, title: "Somebody assigned Rae", importance: "standard", payload: { intern: { id: "w1", label: "Rae", state: "assigned" }, assignmentTitle: "Fix launch" } },
  ];
  const html = renderToStaticMarkup(createElement(Activity, { items }));
  assert.ok(!html.includes("v6-integration"), "no integration card markup when no integration_activity items are supplied");
  assert.ok(!html.includes("v6-event--integration"));
  assert.ok(!html.includes("/integrations/okx.svg"));
  assert.ok(!html.includes("/integrations/x-layer.svg"));
  assert.ok(html.includes("Somebody defined the outcome"));
  assert.ok(html.includes("Rae"), "the intern_assigned card renders unchanged (Intern name)");
  assert.ok(html.includes("Fix launch"), "the intern_assigned card renders unchanged (assignment title)");
});

// ── Projection layer: frontendProjection.ts stays additive and evidence-based ──

test("projection: integrationEvents omitted (today's real backend state) never emits integration_activity", () => {
  const src = source(); // no integrationEvents field at all
  const facts = deriveObjectiveFacts(src, {});
  const activity = projectActivity(src, facts, NOW);
  assert.ok(activity.every((item) => item.type !== "integration_activity"), "no backend fact ⇒ no fabricated integration event");
});

test("projection: a row missing required fields (id/integration/action/headline) is omitted, not guessed at", () => {
  const badRow = { id: "", integration: OKX_MARKETPLACE, action: "market_search", headline: "x", occurredAt: NOW - 1000 } as ProductIntegrationEvent;
  const src = source({ integrationEvents: [badRow] });
  const facts = deriveObjectiveFacts(src, {});
  const activity = projectActivity(src, facts, NOW);
  assert.ok(activity.every((item) => item.type !== "integration_activity"), "an incomplete row must be dropped, never partially rendered");
});

test("projection: a complete, persisted integrationEvents row projects to one integration_activity ActivityItem", () => {
  const row: ProductIntegrationEvent = {
    id: "ok1",
    occurredAt: NOW - 1000,
    integration: OKX_MARKETPLACE,
    action: "market_search",
    headline: "Searched for external services",
    resourceNeed: "Cross-platform social intelligence",
    candidateCount: 3,
    candidates: [{ label: "Social Media Guru" }, { label: "Token Market Intelligence" }, { label: "Wallet / Onchain Risk Intelligence" }],
  };
  const src = source({ integrationEvents: [row] });
  const facts = deriveObjectiveFacts(src, {});
  const activity = projectActivity(src, facts, NOW);
  const found = activity.find((item) => item.type === "integration_activity");
  assert.ok(found, "a complete row must project to exactly one integration_activity item");
  assert.equal(found!.id, "activity:integration_activity:ok1");
  assert.equal((found!.payload as { integration: IntegrationIdentity }).integration.id, "okx_marketplace");
});
