// Founder spend approval — shared policy, read projection, product command, frontend.

import test from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { convexTest } from "convex-test";

import schema from "../convex/schema";
import {
  putContract,
  putDecision,
  putRequirement,
} from "../convex/internal/workforce";
import { submitAttentionActionV1 } from "../convex/productCommands";
import {
  getObjectiveListV1,
  getObjectiveWorkspaceV1,
} from "../convex/productWorkspace";
import { Attention } from "../app/product/components/Attention";
import type {
  AttentionState,
  ProductCommandResult,
} from "../app/product/contracts";
import {
  deriveObjectiveFacts,
  projectObjectiveSummary,
  projectObjectiveWorkspace,
  type ProductDecision,
  type ProductObjectiveRow,
  type ProductRequirement,
  type ProductSource,
} from "../lib/product/frontendProjection";
import {
  APPROVE_SPEND_ACTION_ID,
  deriveSpendApprovalCandidate,
  formatSpendUsd,
  spendGrantApprovalId,
} from "../lib/product/spendApprovalPolicy";

const __dirname = dirname(fileURLToPath(import.meta.url));
const NOW = 1_820_000_000_000;
const KEY = "obj_spend";
const QUESTION = "No founder spend limit is set. Approve a bounded spend limit?";
const DECISION_AT = NOW - 30_000;
const PRICE = 6.8;

const modules = {
  "../convex/schema.ts": () => import("../convex/schema"),
  "../convex/objectiveValidators.ts": () => import("../convex/objectiveValidators"),
  "../convex/managementValidators.ts": () => import("../convex/managementValidators"),
  "../convex/workforceGuards.ts": () => import("../convex/workforceGuards"),
  "../convex/internal/workforce.ts": () => import("../convex/internal/workforce"),
  "../convex/objectiveCreate.ts": () => import("../convex/objectiveCreate"),
  "../convex/productCommands.ts": () => import("../convex/productCommands"),
  "../convex/productWorkspace.ts": () => import("../convex/productWorkspace"),
  "../convex/management.ts": () => import("../convex/management"),
  "../convex/_generated/api.d.ts": () => import("../convex/_generated/api"),
  "../convex/_generated/server.d.ts": () => import("../convex/_generated/server"),
  "../convex/_generated/dataModel.d.ts": () => import("../convex/_generated/dataModel"),
};

type Handler = { _handler: (ctx: unknown, args: Record<string, unknown>) => Promise<unknown> };
const call = (fn: unknown, ctx: unknown, args: Record<string, unknown>) =>
  (fn as Handler)._handler(ctx, args);

function buyOptionSummary(optionId: string, priceUsd: number | null, strategy = "BUY") {
  return JSON.stringify({
    original: strategy,
    extra: {
      options: [
        {
          optionId,
          strategy,
          external: {
            offeringId: "off_1",
            providerId: "prov",
            priceUsd,
            priceSource: "provider_quote",
            registryVerified: true,
            compatibleResourceClass: true,
            executionPathConfigured: true,
            purposeScopeCompatible: true,
          },
        },
      ],
    },
  });
}

function objective(over: Partial<ProductObjectiveRow> = {}): ProductObjectiveRow {
  return {
    key: KEY,
    request: "Buy the dataset we need.",
    createdAt: NOW - 100_000,
    updatedAt: NOW - 1000,
    state: "executing",
    result: null,
    workItems: [],
    companyArtifacts: [],
    acquisitionResults: [],
    resourceNeeds: [],
    finalSemanticAssessment: null,
    controlNotes: [{ type: "pending_approval", question: QUESTION, at: DECISION_AT }],
    pendingFinalAssessmentRevision: null,
    interpretationStatus: null,
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

function decision(over: Partial<ProductDecision> = {}): ProductDecision {
  return {
    decisionId: "dec_spend",
    requirementKey: "r1",
    contractRevision: 1,
    kind: "satisfaction_strategy",
    strategy: "BUY",
    optionId: "opt_buy",
    authorization: {
      kind: "approval_required",
      question: QUESTION,
      reason: "spend_authority_required",
    },
    rationale: null,
    strongestAlternativeId: null,
    coarsePlanSummary: buyOptionSummary("opt_buy", PRICE),
    at: DECISION_AT,
    ...over,
  };
}

function source(over: Partial<ProductSource> = {}): ProductSource {
  return {
    objective: objective(),
    contracts: [{ contractId: "c1", revision: 1, intent: "Obtain dataset", createdAt: NOW - 90_000 }],
    requirements: [req("r1")],
    assignments: [],
    decisions: [decision()],
    intents: [],
    workers: [],
    evidence: [],
    ...over,
  };
}

// ── Shared policy ────────────────────────────────────────────────────────────

test("policy: legal spend approval candidate with amount and approve_spend action", () => {
  const candidate = deriveSpendApprovalCandidate(source());
  assert.ok(candidate);
  assert.equal(candidate.priceUsd, PRICE);
  assert.equal(candidate.action.id, APPROVE_SPEND_ACTION_ID);
  assert.equal(candidate.action.type, "approve");
  assert.equal(candidate.action.label, `Approve $${formatSpendUsd(PRICE)} limit`);
  assert.equal(candidate.attentionId, "dec_spend");
  assert.equal(candidate.attentionRevision, `dec_spend:${DECISION_AT}`);
  assert.equal(candidate.authorizationReason, "spend_authority_required");
});

test("policy: each broken precondition yields null", () => {
  const cases: Array<[string, ProductSource]> = [
    [
      "wrong revision",
      source({
        contracts: [{ contractId: "c1", revision: 2, intent: "x", createdAt: 1 }],
        requirements: [req("r1", { contractRevision: 2 })],
        decisions: [decision({ contractRevision: 1 })],
      }),
    ],
    [
      "requirement not active",
      source({ requirements: [req("r1", { state: "satisfied", resolution: { contractRevision: 1, acceptedAt: NOW } })] }),
    ],
    [
      "decision superseded",
      source({
        decisions: [
          decision(),
          decision({
            decisionId: "dec_newer",
            authorization: { kind: "authorized" },
            strategy: "MAKE",
            optionId: "opt_make",
            at: DECISION_AT + 1000,
            coarsePlanSummary: "{}",
          }),
        ],
      }),
    ],
    [
      "not approval_required",
      source({ decisions: [decision({ authorization: { kind: "authorized" } })] }),
    ],
    [
      "material_ambiguity",
      source({
        decisions: [
          decision({
            authorization: {
              kind: "approval_required",
              question: QUESTION,
              reason: "material_ambiguity",
            },
          }),
        ],
      }),
    ],
    [
      "missing selected option",
      source({ decisions: [decision({ optionId: null, coarsePlanSummary: buyOptionSummary("opt_buy", PRICE) })] }),
    ],
    [
      "zero price",
      source({ decisions: [decision({ coarsePlanSummary: buyOptionSummary("opt_buy", 0) })] }),
    ],
    [
      "unknown price",
      source({ decisions: [decision({ coarsePlanSummary: buyOptionSummary("opt_buy", null) })] }),
    ],
    [
      "pending note absent",
      source({ objective: objective({ controlNotes: [{ type: "note", summary: "unrelated", at: 1 }] }) }),
    ],
  ];
  for (const [label, s] of cases) {
    assert.equal(deriveSpendApprovalCandidate(s), null, label);
  }
});

// ── Read projection ──────────────────────────────────────────────────────────

test("projection: legal spend approval → needs_you with exactly one approve action", () => {
  const facts = deriveObjectiveFacts(source());
  assert.equal(facts.status, "needs_you");
  assert.equal(facts.attention?.attention.type, "approval");
  assert.equal(facts.attention?.attention.actions.length, 1);
  assert.equal(facts.attention?.attention.actions[0]?.id, APPROVE_SPEND_ACTION_ID);
  assert.equal(facts.attention?.attention.actions[0]?.type, "approve");
  assert.deepEqual(facts.attention?.attention.context?.amount, {
    amount: formatSpendUsd(PRICE),
    currency: "USD",
  });
  const summary = projectObjectiveSummary(source());
  assert.equal(summary.status, "needs_you");
  assert.equal(summary.hasAttention, true);
  const view = projectObjectiveWorkspace(source(), { now: NOW });
  assert.equal(view.somebodyNow.state, "needs_you");
  assert.ok(view.activity.some((row) => row.type === "founder_action_required"));
});

test("projection: approval_required without wired spend action stays waiting", () => {
  const incomplete = source({
    decisions: [
      decision({
        coarsePlanSummary: buyOptionSummary("opt_buy", null),
      }),
    ],
  });
  const facts = deriveObjectiveFacts(incomplete);
  assert.equal(facts.status, "waiting");
  assert.equal(facts.attention, null);
  assert.ok(facts.pendingFounder);
});

test("projection: material / external-effect / waiver approvals are non-actionable", () => {
  for (const reason of [
    "material_ambiguity",
    "external_effect_requires_approval",
    "waiver_requires_authorization",
  ]) {
    const s = source({
      decisions: [
        decision({
          authorization: { kind: "approval_required", question: QUESTION, reason },
        }),
      ],
    });
    assert.equal(deriveSpendApprovalCandidate(s), null, reason);
    assert.equal(deriveObjectiveFacts(s).attention, null, reason);
    assert.notEqual(deriveObjectiveFacts(s).status, "needs_you", reason);
  }
});

// ── Command ──────────────────────────────────────────────────────────────────

type Backend = ReturnType<typeof convexTest>;

async function seedSpendObjective(t: Backend, key = KEY) {
  await t.mutation(async (ctx) => {
    await ctx.db.insert("objectives", {
      key,
      data: {
        key,
        request: "Buy the dataset we need for the relaunch.",
        createdAt: NOW,
        updatedAt: NOW,
        state: "executing",
        activity: "working",
        plan: null,
        workItems: [],
        run: null,
        result: null,
        management: {
          contractId: `contract_${key}`,
          controlNotes: [
            { type: "pending_approval", question: QUESTION, at: DECISION_AT },
            { type: "note", summary: "keep me", at: 1 },
          ],
        },
      } as never,
    });
  });
  await t.mutation(async (ctx) =>
    call(putContract, ctx, {
      objectiveKey: key,
      contractId: `contract_${key}`,
      revision: 1,
      data: {
        contractId: `contract_${key}`,
        objectiveKey: key,
        revision: 1,
        intent: "Obtain dataset",
        levels: [{ levelKey: "bar", order: 1, statement: "Have data", label: "In" }],
        minimumCompletionBar: "bar",
        ambiguities: [],
        createdBy: "somebody",
        createdFromRequestId: `req_${key}`,
        createdAt: NOW,
      },
    }),
  );
  await t.mutation(async (ctx) =>
    call(putRequirement, ctx, {
      objectiveKey: key,
      requirementKey: "r1",
      data: {
        requirementKey: "r1",
        objectiveKey: key,
        contractId: `contract_${key}`,
        contractRevision: 1,
        priority: "required",
        title: "Obtain dataset",
        mustBeTrue: "Dataset is company-controlled",
        scope: "in: dataset",
        proofs: [],
        state: "active",
        strategy: null,
        resolution: null,
        blockedReason: null,
        waiver: null,
        revision: 1,
        createdAt: NOW,
        updatedAt: NOW,
      },
    }),
  );
  await t.mutation(async (ctx) =>
    call(putDecision, ctx, {
      objectiveKey: key,
      decisionId: "dec_spend",
      data: {
        decisionId: "dec_spend",
        objectiveKey: key,
        contractRevision: 1,
        requirementKey: "r1",
        kind: "satisfaction_strategy",
        strategy: "BUY",
        optionId: "opt_buy",
        recommendation: {
          requirementKey: "r1",
          contractRevision: 1,
          selectedOptionId: "opt_buy",
          strongestAlternativeId: null,
          rationale: "buy it",
          materialAssumptions: [],
          changeMyMindEvidence: [],
        },
        authorization: {
          kind: "approval_required",
          requirementKey: "r1",
          contractRevision: 1,
          question: QUESTION,
          reason: "spend_authority_required",
        },
        coarsePlanSummary: buyOptionSummary("opt_buy", PRICE),
        consideredOptionIds: ["opt_buy"],
        at: DECISION_AT,
      },
    }),
  );
}

test("command: valid spend approval persists grant, resolves note, wakes manager", async () => {
  const t = convexTest(schema, modules);
  await seedSpendObjective(t);

  const before = (await t.query(async (ctx) =>
    call(getObjectiveWorkspaceV1, ctx, { objectiveKey: KEY }),
  )) as { found: boolean; view: { objective: { status: string }; attention: AttentionState | null } };
  assert.equal(before.view.objective.status, "needs_you");
  assert.equal(before.view.attention?.actions[0]?.id, APPROVE_SPEND_ACTION_ID);
  assert.deepEqual(before.view.attention?.context?.amount, {
    amount: formatSpendUsd(PRICE),
    currency: "USD",
  });

  const result = (await t.mutation(async (ctx) =>
    call(submitAttentionActionV1, ctx, {
      objectiveId: KEY,
      attentionId: "dec_spend",
      attentionRevision: `dec_spend:${DECISION_AT}`,
      actionId: APPROVE_SPEND_ACTION_ID,
    }),
  )) as ProductCommandResult;
  assert.equal(result.accepted, true);
  if (!result.accepted) return;
  const approvalId = spendGrantApprovalId("dec_spend", DECISION_AT);
  assert.equal(result.commandId, `attention:${APPROVE_SPEND_ACTION_ID}:${approvalId}`);
  assert.equal(result.objectiveId, KEY);

  const grants = await t.query(async (ctx) => ctx.db.query("founderSpendGrants").collect());
  assert.equal(grants.length, 1);
  const grant = (grants[0] as { approvalId: string; data: { limitUsd: number; approvalId: string } }).data;
  assert.equal(grant.approvalId, approvalId);
  assert.equal(grant.limitUsd, PRICE);

  const objectives = await t.query(async (ctx) => ctx.db.query("objectives").collect());
  const notes = (
    (objectives[0] as { data: { management: { controlNotes: Array<Record<string, unknown>> } } }).data
      .management.controlNotes
  );
  assert.equal(notes.some((n) => n.type === "pending_approval"), false);
  assert.ok(notes.some((n) => n.type === "note" && n.summary === "keep me"));

  const wakes = await t.query(async (ctx) => ctx.db.query("wakeEvents").collect());
  assert.equal(wakes.length, 1);
  const wake = (wakes[0] as { dedupeKey: string; data: { reason: string; refKind: string; refId: string; summary: string } });
  assert.equal(wake.dedupeKey, `approval_resolved:${approvalId}`);
  assert.equal(wake.data.reason, "approval_resolved");
  assert.equal(wake.data.refKind, "approval");
  assert.equal(wake.data.refId, approvalId);
  assert.match(wake.data.summary, /USD 6\.80/);
  assert.ok(!/payment|purchased|settled/i.test(wake.data.summary));

  // No payment / intent / requirement satisfaction from this command.
  const intents = await t.query(async (ctx) => ctx.db.query("executionIntents").collect());
  assert.equal(intents.length, 0);
  const reqs = await t.query(async (ctx) => ctx.db.query("requirements").collect());
  const reqData = (reqs[0] as { data: { state: string } }).data;
  assert.equal(reqData.state, "active");

  const after = (await t.query(async (ctx) =>
    call(getObjectiveWorkspaceV1, ctx, { objectiveKey: KEY }),
  )) as { view: { attention: AttentionState | null; objective: { status: string } } };
  assert.equal(after.view.attention, null, "same founder action is no longer advertised");
  assert.notEqual(after.view.objective.status, "needs_you");

  const listed = (await t.query(async (ctx) => call(getObjectiveListV1, ctx, {}))) as {
    view: { needsYou: Array<{ id: string }> };
  };
  assert.equal(listed.view.needsYou.some((row) => row.id === KEY), false);
});

test("command: stale / invalid paths fail closed", async () => {
  const t = convexTest(schema, modules);
  await seedSpendObjective(t, "obj_stale");

  const base = {
    objectiveId: "obj_stale",
    attentionId: "dec_spend",
    attentionRevision: `dec_spend:${DECISION_AT}`,
    actionId: APPROVE_SPEND_ACTION_ID,
  };

  const staleRev = (await t.mutation(async (ctx) =>
    call(submitAttentionActionV1, ctx, { ...base, attentionRevision: "dec_spend:1" }),
  )) as ProductCommandResult;
  assert.equal(staleRev.accepted, false);
  if (!staleRev.accepted) assert.equal(staleRev.error.code, "stale_view");

  const wrongId = (await t.mutation(async (ctx) =>
    call(submitAttentionActionV1, ctx, { ...base, attentionId: "wrong" }),
  )) as ProductCommandResult;
  assert.equal(wrongId.accepted, false);
  if (!wrongId.accepted) assert.equal(wrongId.error.code, "stale_view");

  const wrongAction = (await t.mutation(async (ctx) =>
    call(submitAttentionActionV1, ctx, { ...base, actionId: "decline" }),
  )) as ProductCommandResult;
  assert.equal(wrongAction.accepted, false);
  if (!wrongAction.accepted) assert.equal(wrongAction.error.code, "not_allowed");

  const withText = (await t.mutation(async (ctx) =>
    call(submitAttentionActionV1, ctx, { ...base, text: "please" }),
  )) as ProductCommandResult;
  assert.equal(withText.accepted, false);
  if (!withText.accepted) assert.equal(withText.error.code, "not_allowed");
});

test("command: material ambiguity and missing price are not_allowed / non-actionable", async () => {
  const t = convexTest(schema, modules);
  await seedSpendObjective(t, "obj_ambig");
  await t.mutation(async (ctx) =>
    call(putDecision, ctx, {
      objectiveKey: "obj_ambig",
      decisionId: "dec_spend",
      data: {
        decisionId: "dec_spend",
        objectiveKey: "obj_ambig",
        contractRevision: 1,
        requirementKey: "r1",
        kind: "satisfaction_strategy",
        strategy: "ASK_FOUNDER",
        optionId: "opt_ask",
        recommendation: {
          requirementKey: "r1",
          contractRevision: 1,
          selectedOptionId: "opt_ask",
          strongestAlternativeId: null,
          rationale: "ambiguous",
          materialAssumptions: [],
          changeMyMindEvidence: [],
        },
        authorization: {
          kind: "approval_required",
          requirementKey: "r1",
          contractRevision: 1,
          question: QUESTION,
          reason: "material_ambiguity",
        },
        coarsePlanSummary: buyOptionSummary("opt_ask", PRICE, "ASK_FOUNDER"),
        consideredOptionIds: ["opt_ask"],
        at: DECISION_AT,
      },
    }),
  );

  const ambig = (await t.mutation(async (ctx) =>
    call(submitAttentionActionV1, ctx, {
      objectiveId: "obj_ambig",
      attentionId: "dec_spend",
      attentionRevision: `dec_spend:${DECISION_AT}`,
      actionId: APPROVE_SPEND_ACTION_ID,
    }),
  )) as ProductCommandResult;
  assert.equal(ambig.accepted, false);
  if (!ambig.accepted) assert.equal(ambig.error.code, "not_allowed");
});

test("command: replay after resolve is stale_view and does not widen grant or duplicate wake", async () => {
  const t = convexTest(schema, modules);
  await seedSpendObjective(t, "obj_replay");
  const args = {
    objectiveId: "obj_replay",
    attentionId: "dec_spend",
    attentionRevision: `dec_spend:${DECISION_AT}`,
    actionId: APPROVE_SPEND_ACTION_ID,
  };
  const first = (await t.mutation(async (ctx) => call(submitAttentionActionV1, ctx, args))) as ProductCommandResult;
  assert.equal(first.accepted, true);

  const second = (await t.mutation(async (ctx) => call(submitAttentionActionV1, ctx, args))) as ProductCommandResult;
  assert.equal(second.accepted, false);
  if (!second.accepted) assert.equal(second.error.code, "stale_view");

  const grants = await t.query(async (ctx) => ctx.db.query("founderSpendGrants").collect());
  assert.equal(grants.length, 1);
  assert.equal((grants[0] as { data: { limitUsd: number } }).data.limitUsd, PRICE);
  const wakes = await t.query(async (ctx) => ctx.db.query("wakeEvents").collect());
  assert.equal(wakes.length, 1);
});

// ── Frontend ─────────────────────────────────────────────────────────────────

test("Attention: no actions → no button; legal action enabled when handler present", () => {
  const empty: AttentionState = {
    id: "att1",
    revision: "att1:1",
    type: "approval",
    title: "Needs approval",
    detail: "…",
    actions: [],
  };
  assert.ok(!renderToStaticMarkup(createElement(Attention, { attention: empty })).includes("<button"));

  const legal: AttentionState = {
    id: "dec_spend",
    revision: `dec_spend:${DECISION_AT}`,
    type: "approval",
    title: "Somebody needs your approval",
    detail: QUESTION,
    context: { reason: "spend_authority_required", amount: { amount: "6.80", currency: "USD" } },
    actions: [{ id: APPROVE_SPEND_ACTION_ID, type: "approve", label: "Approve $6.80 limit" }],
  };
  const withoutHandler = renderToStaticMarkup(createElement(Attention, { attention: legal }));
  assert.ok(/disabled/.test(withoutHandler.match(/<button[^>]*>/)?.[0] ?? ""));

  const withHandler = renderToStaticMarkup(
    createElement(Attention, { attention: legal, onAction: () => undefined }),
  );
  const btn = withHandler.match(/<button[^>]*data-attention-action-id="approve_spend"[^>]*>/)?.[0] ?? "";
  assert.ok(btn);
  assert.ok(!/\sdisabled(=|\s|>)/.test(btn), "returned legal action must be enabled");
  assert.ok(withHandler.includes("Approve $6.80 limit"));
  assert.ok(!withHandler.includes("Decline"));
});

test("Attention: pending disables repeat click and shows restrained copy", () => {
  const legal: AttentionState = {
    id: "dec_spend",
    revision: `dec_spend:${DECISION_AT}`,
    type: "approval",
    title: "Needs approval",
    detail: "…",
    actions: [{ id: APPROVE_SPEND_ACTION_ID, type: "approve", label: "Approve $6.80 limit" }],
  };
  const html = renderToStaticMarkup(
    createElement(Attention, {
      attention: legal,
      onAction: () => undefined,
      pendingActionId: APPROVE_SPEND_ACTION_ID,
    }),
  );
  assert.ok(/disabled/.test(html.match(/<button[^>]*>/)?.[0] ?? ""));
  assert.ok(html.includes("Recording…"));
  assert.ok(html.includes('data-attention-pending="true"'));
});

test("ProductWorkspace wires submitAttentionActionV1 without amount or payment APIs", () => {
  const src = readFileSync(join(__dirname, "../app/product/ProductWorkspace.tsx"), "utf8");
  assert.ok(src.includes("api.productCommands.submitAttentionActionV1"));
  assert.ok(src.includes("attentionId: attention.id"));
  assert.ok(src.includes("attentionRevision: attention.revision"));
  assert.ok(src.includes("actionId: action.id"));
  assert.ok(!src.includes("amount:"));
  assert.ok(!src.includes("limitUsd"));
  assert.ok(!src.includes("founderSpendGrants"));
  assert.ok(!src.includes("putSpendGrant"));
  assert.ok(!/payment|submitTransaction|m3Driver/i.test(src));
  assert.ok(src.includes("Approval recorded. Somebody is continuing."));
});
