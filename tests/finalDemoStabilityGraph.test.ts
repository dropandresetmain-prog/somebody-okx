// Final demo stability graph — an interpretation-declared gap on a NON-
// terminal deliverable Requirement, through real production seams:
//
//   applyInterpretation (raw model payloads, 3 Requirements shaped like the
//   final demo graph: launch_context, comparative_benchmark,
//   founder_ready_launch_plan) → structural purpose-policy binding onto the
//   UNIQUE TERMINAL deliverable (d8da952) → comparative_benchmark's own
//   declared proprietary_data gap still reaches the Objective-wide sourcing
//   envelope (deriveExternalSourcingContext branch 2) even though it is not
//   the bound Requirement → MAKE ineligible (input_not_owned) → Testnet
//   marketplace discovery (Social Media Guru compatible; Token Market
//   Intelligence / Wallet-Onchain Risk incompatible by purpose) → sole-
//   eligible BUY → no founder grant → approval_required survives the
//   reservation clear → Needs You (one $0.01 approve action) → approval →
//   re-decision authorizes BUY bound to that approval → runManagementPass
//   dispatches the real ExecutionIntent → the M6.1 operator-gated
//   `simulateVerifiedAcquisition` seam (SAME intent kernel the live M3 rail
//   drives; no network call) verifies it → the scoped proprietary_data gap is
//   covered → MAKE eligible again for comparative_benchmark, and
//   founder_ready_launch_plan (the terminal deliverable, and the ONLY
//   Requirement carrying authorizedPurposeKinds) is MAKE-eligible too.
//
// Negative control: the policy ALONE — on launch_context and
// founder_ready_launch_plan, neither of which declares proprietary_data —
// never yields an eligible external option.
import test, { mock, after as afterAll } from "node:test";
import assert from "node:assert/strict";
import { convexTest } from "convex-test";
import schema from "../convex/schema";
import {
  applyInterpretation,
  applyDecision,
  beginInterpretation,
  runManagementPass,
} from "../convex/management";
import { simulateVerifiedAcquisition } from "../convex/m3Driver";
import { submitAttentionActionV1 } from "../convex/productCommands";
import { getObjectiveWorkspaceV1 } from "../convex/productWorkspace";
import { readDecisionContext } from "../convex/internal/workforce";
import {
  buildDecisionPassInput,
  type DecisionPassReads,
} from "../lib/management/decisionPass";
import { runManagerialDecisionPass } from "../lib/management/decision";
import { SUBMISSION_EXTERNAL_SOCIAL_PURPOSE_POLICY } from "../lib/objective/seedData";
import { SOCIAL_MEDIA_GURU_SERVICE_ID } from "../lib/payment/socialMediaGuruProduct";
import {
  TESTNET_TOKEN_MARKET_SERVICE_ID,
  TESTNET_WALLET_RISK_SERVICE_ID,
} from "../lib/payment/testnetDemoProducts";
import { APPROVE_SPEND_ACTION_ID } from "../lib/product/spendApprovalPolicy";
import type { AttentionState, ProductCommandResult } from "../app/product/contracts";
import type { GroundedOption, Requirement } from "../lib/management/types";
import type { ObjectiveRecord } from "../lib/objective/types";

const modules = {
  "../convex/schema.ts": () => import("../convex/schema"),
  "../convex/objectiveValidators.ts": () => import("../convex/objectiveValidators"),
  "../convex/managementValidators.ts": () => import("../convex/managementValidators"),
  "../convex/workforceGuards.ts": () => import("../convex/workforceGuards"),
  "../convex/objectives.ts": () => import("../convex/objectives"),
  "../convex/objectiveRunner.ts": () => import("../convex/objectiveRunner"),
  "../convex/productCommands.ts": () => import("../convex/productCommands"),
  "../convex/productWorkspace.ts": () => import("../convex/productWorkspace"),
  "../convex/internal/workforce.ts": () => import("../convex/internal/workforce"),
  "../convex/management.ts": () => import("../convex/management"),
  "../convex/m3Driver.ts": () => import("../convex/m3Driver"),
  "../convex/_generated/api.d.ts": () => import("../convex/_generated/api"),
  "../convex/_generated/server.d.ts": () => import("../convex/_generated/server"),
  "../convex/_generated/dataModel.d.ts": () => import("../convex/_generated/dataModel"),
};

mock.timers.enable({ apis: ["setTimeout"] });
const previousMode = process.env.SOMEBODY_EXECUTION_MODE;
process.env.SOMEBODY_EXECUTION_MODE = "testnet_demo";
const previousOperatorToken = process.env.SOMEBODY_DEMO_OPERATOR_TOKEN;
const OPERATOR_TOKEN = "fds-graph-demo-operator-token";
process.env.SOMEBODY_DEMO_OPERATOR_TOKEN = OPERATOR_TOKEN;
afterAll(() => {
  mock.timers.reset();
  if (previousMode === undefined) delete process.env.SOMEBODY_EXECUTION_MODE;
  else process.env.SOMEBODY_EXECUTION_MODE = previousMode;
  if (previousOperatorToken === undefined) delete process.env.SOMEBODY_DEMO_OPERATOR_TOKEN;
  else process.env.SOMEBODY_DEMO_OPERATOR_TOKEN = previousOperatorToken;
});

type Handler = { _handler: (ctx: unknown, args: Record<string, unknown>) => Promise<unknown> };
const call = (fn: unknown, ctx: unknown, args: Record<string, unknown>) =>
  (fn as Handler)._handler(ctx, args);
type Backend = ReturnType<typeof convexTest>;

const now = 1_976_000_000_000;
const KEY = "obj_fds_graph";
const REQ_LAUNCH = "launch_context";
const REQ_BENCH = "comparative_benchmark";
const REQ_PLAN = "founder_ready_launch_plan";

const MAKE_PROPOSAL = {
  strategy: "MAKE",
  desiredCapabilities: ["public_information_research", "company_records_lookup"],
  needsExternalResourceClass: null,
  notes: null,
};

// ── Raw model-shaped interpretation payloads (the final demo graph) ─────────

const rawContract = {
  intent: "ship a founder-ready launch plan grounded in owned context and a comparative benchmark",
  levels: [
    {
      levelKey: "plan",
      order: 1,
      statement: "a founder-ready launch plan is saved",
      label: "Launch plan",
    },
  ],
  minimumCompletionBar: "plan",
  ambiguities: [],
};

const rawRequirements = [
  {
    requirementKey: REQ_LAUNCH,
    priority: "required",
    title: "Launch context deliverable",
    mustBeTrue: "the current launch context (owned records + public web) is captured for the relaunch",
    scope: "founder-facing deliverable",
    expectedOutput: "saved launch context brief",
    requirementKind: "deliverable",
    requiredResourceClasses: ["company_records", "public_web"],
    dependsOnRequirementKeys: [],
  },
  {
    requirementKey: REQ_BENCH,
    priority: "required",
    title: "Comparative benchmark deliverable",
    mustBeTrue:
      "a comparative benchmark grounded in current cross-platform audience/trend evidence is on record",
    scope: "founder-facing deliverable",
    expectedOutput: "saved comparative benchmark",
    requirementKind: "deliverable",
    // Declared directly by interpretation from the founder objective — not a
    // worker-discovered ResourceNeed. This is the GPT-6 case the task calls
    // out: a gap declared as an interpretation-time deliverable requirement.
    requiredResourceClasses: ["proprietary_data"],
    dependsOnRequirementKeys: [],
  },
  {
    requirementKey: REQ_PLAN,
    priority: "required",
    title: "Founder-ready launch plan",
    mustBeTrue:
      "a founder-ready relaunch plan combining the launch context and the comparative benchmark is saved",
    scope: "founder-facing deliverable",
    expectedOutput: "saved founder-ready launch plan",
    requirementKind: "deliverable",
    requiredResourceClasses: ["company_records", "public_web"],
    dependsOnRequirementKeys: [REQ_LAUNCH, REQ_BENCH],
  },
];

async function seed(t: Backend) {
  await t.run(async (ctx) => {
    await ctx.db.insert("objectives", {
      key: KEY,
      data: {
        key: KEY,
        request:
          "Ship a founder-ready launch plan: capture our launch context and back it with a comparative benchmark of current cross-platform audience behaviour.",
        createdAt: now,
        updatedAt: now,
        state: "received",
        activity: "new",
        plan: null,
        workItems: [],
        run: null,
        result: null,
        resourceNeeds: [],
        management: {
          contractId: null,
          // Application setup writes this BEFORE interpretation — never the
          // model. Same policy the natural-buy-path template uses.
          authorizedPurposePolicy: SUBMISSION_EXTERNAL_SOCIAL_PURPOSE_POLICY,
        },
      } as ObjectiveRecord & { management: Record<string, unknown> },
    });
  });
}

/** Drives the REAL two-step interpretation seam (no live model call exists
 * anywhere in this repo's tests — the raw payloads above stand in for it). */
async function interpret(t: Backend) {
  const begin = (await t.mutation(async (ctx) => call(beginInterpretation, ctx, { objectiveKey: KEY, at: now }))) as {
    proceed: boolean;
    requestId?: string;
    reason?: string;
  };
  assert.equal(begin.proceed, true, begin.reason);
  const applied = (await t.mutation(async (ctx) =>
    call(applyInterpretation, ctx, {
      objectiveKey: KEY,
      requestId: begin.requestId!,
      rawContract,
      rawRequirements,
      founderResolvedQuestions: [],
      at: now,
    }),
  )) as { ok: boolean; errors?: string[]; requirementKeys?: string[] };
  assert.equal(applied.ok, true, applied.errors?.join("; "));
  return applied;
}

async function readReqs(t: Backend): Promise<Requirement[]> {
  return t.query(async (ctx) => {
    const rows = await ctx.db
      .query("requirements")
      .withIndex("by_objectiveKey", (q) => q.eq("objectiveKey", KEY))
      .collect();
    return rows.map((row) => (row as unknown as { data: Requirement }).data);
  });
}

async function readsFor(t: Backend, requirementKey: string): Promise<DecisionPassReads> {
  const reads = (await t.run(async (ctx) =>
    call(readDecisionContext, ctx, { objectiveKey: KEY, requirementKey }),
  )) as DecisionPassReads | null;
  assert.ok(reads, `no decision-context reads for ${requirementKey}`);
  return reads!;
}

async function decisionOptionsFor(
  t: Backend,
  requirementKey: string,
  decisionId: string,
  proposal: Record<string, unknown> = MAKE_PROPOSAL,
) {
  const built = await buildDecisionPassInput(
    { ...(await readsFor(t, requirementKey)), at: now, decisionId },
    proposal,
    async () => null,
  );
  assert.equal(built.ok, true);
  if (!built.ok) throw new Error("build");
  const { options } = await runManagerialDecisionPass(built.input);
  const eligible: GroundedOption[] = options.filter((o) => o.eligibility.eligible);
  return { options, eligible, built: built.input };
}

async function objectiveMgmt(t: Backend) {
  return t.run(async (ctx) => {
    const row = await (ctx.db as any).query("objectives").withIndex("by_key", (q: any) => q.eq("key", KEY)).unique();
    return (row as unknown as { data: { management: Record<string, unknown> } }).data.management;
  });
}

async function reserve(t: Backend, requirementKey: string, requestId: string, attempts: number) {
  await t.run(async (ctx) => {
    const row = await (ctx.db as any).query("objectives").withIndex("by_key", (q: any) => q.eq("key", KEY)).unique();
    const data = (row as unknown as { data: Record<string, unknown> }).data;
    const mgmt = (data.management ?? {}) as Record<string, unknown>;
    const attemptsMap = { ...((mgmt.decisionAttempts ?? {}) as Record<string, number>) };
    attemptsMap[requirementKey] = attempts;
    await ctx.db.patch(row!._id, {
      data: {
        ...data,
        management: {
          ...mgmt,
          pendingDecision: { requestId, requirementKey, contractRevision: 1, attempts },
          decisionAttempts: attemptsMap,
        },
      },
    } as never);
  });
}

const count = (t: Backend, table: "executionIntents" | "founderSpendGrants") =>
  t.run(async (ctx) => (await ctx.db.query(table).collect()).length);

test("final demo stability graph: interpreted gap → sole-eligible BUY → approval → acquisition → MAKE", async () => {
  const t = convexTest(schema, modules);
  await seed(t);
  await interpret(t);

  // ── Structural purpose-policy binding: the UNIQUE TERMINAL deliverable ────
  const reqsAfterInterpretation = await readReqs(t);
  assert.equal(reqsAfterInterpretation.length, 3);
  const byKey = new Map(reqsAfterInterpretation.map((r) => [r.requirementKey, r]));
  const launch = byKey.get(REQ_LAUNCH)!;
  const bench = byKey.get(REQ_BENCH)!;
  const plan = byKey.get(REQ_PLAN)!;
  assert.ok(launch && bench && plan);
  assert.equal(
    plan.authorizedPurposeKinds?.length ?? 0,
    1,
    "the terminal deliverable (depended on by nothing) is the structural policy target",
  );
  assert.equal(
    launch.authorizedPurposeKinds ?? undefined,
    undefined,
    "a depended-on deliverable is never the structural target",
  );
  assert.equal(
    bench.authorizedPurposeKinds ?? undefined,
    undefined,
    "comparative_benchmark is depended on by the plan — it is not the terminal target",
  );
  assert.deepEqual(bench.requiredResourceClasses, ["proprietary_data"]);

  // ── Negative control: the policy ALONE never yields an eligible external
  //    option on either Requirement that does not declare proprietary_data. ─
  const launchPre = await decisionOptionsFor(t, REQ_LAUNCH, "dec_launch_pre");
  assert.deepEqual(launchPre.eligible.map((o) => o.strategy), ["MAKE"]);
  assert.equal(launchPre.built!.eligibilityFacts.requiredResourceClasses.includes("proprietary_data" as never), false);

  const planPre = await decisionOptionsFor(t, REQ_PLAN, "dec_plan_pre");
  assert.deepEqual(planPre.eligible.map((o) => o.strategy), ["MAKE"]);
  assert.equal(planPre.built!.eligibilityFacts.requiredResourceClasses.includes("proprietary_data" as never), false);

  // ── Step 1: launch Requirement → MAKE eligible. ────────────────────────────
  assert.equal(launchPre.eligible.length, 1);
  assert.equal(launchPre.eligible[0]!.kind, "internal");

  // ── Step 2: comparative_benchmark → requires proprietary_data → not owned
  //    → MAKE ineligible with reason input_not_owned. ────────────────────────
  const benchPre = await decisionOptionsFor(t, REQ_BENCH, "dec_bench_pre");
  assert.ok(
    benchPre.built!.eligibilityFacts.requiredResourceClasses.includes("proprietary_data" as never),
    "comparative_benchmark's declared class reaches eligibilityFacts",
  );
  const makeOption = benchPre.options.find((o) => o.kind === "internal");
  assert.ok(makeOption);
  assert.equal(makeOption!.eligibility.eligible, false);
  if (!makeOption!.eligibility.eligible) {
    assert.ok(
      makeOption!.eligibility.reasons.includes("input_not_owned" as never),
      `expected input_not_owned, got ${JSON.stringify(makeOption!.eligibility.reasons)}`,
    );
  }

  // ── Step 3: controlled Testnet marketplace discovery — Guru compatible;
  //    Token Market Intelligence / Wallet-Onchain Risk incompatible by
  //    purpose (grounded via the Objective-wide sourcing envelope, even
  //    though comparative_benchmark itself carries no authorizedPurposeKinds
  //    — deriveExternalSourcingContext's objective_sourcing_policy branch is
  //    an envelope for any causally-ready Requirement whose declared class
  //    matches, not gated a second time by the structural binding). ─────────
  const externalOptions = benchPre.options.filter((o) => o.kind === "external");
  const guruOption = externalOptions.find((o) => o.external?.serviceId === SOCIAL_MEDIA_GURU_SERVICE_ID);
  const tokenOption = externalOptions.find((o) => o.external?.serviceId === TESTNET_TOKEN_MARKET_SERVICE_ID);
  const walletOption = externalOptions.find((o) => o.external?.serviceId === TESTNET_WALLET_RISK_SERVICE_ID);
  assert.ok(guruOption && tokenOption && walletOption, "all three Testnet offerings are discovered");
  assert.equal(guruOption!.external?.purposeScopeCompatible, true);
  assert.equal(guruOption!.eligibility.eligible, true);
  assert.equal(tokenOption!.external?.purposeScopeCompatible, false);
  assert.equal(tokenOption!.eligibility.eligible, false);
  if (!tokenOption!.eligibility.eligible)
    assert.ok(tokenOption!.eligibility.reasons.includes("provider_incompatible" as never));
  assert.equal(walletOption!.external?.purposeScopeCompatible, false);
  assert.equal(walletOption!.eligibility.eligible, false);
  if (!walletOption!.eligibility.eligible)
    assert.ok(walletOption!.eligibility.reasons.includes("provider_incompatible" as never));

  // ── Step 4: exactly one eligible option — the external Guru option. Never
  //    hardcoded into production; only what the kernel actually computed. ──
  assert.equal(benchPre.eligible.length, 1);
  assert.equal(benchPre.eligible[0]!.optionId, guruOption!.optionId);
  const guruOptionId = guruOption!.optionId;

  const rawRecommendation = {
    requirementKey: REQ_BENCH,
    contractRevision: 1,
    selectedOptionId: guruOptionId,
    rationale: "sole eligible option for the interpretation-declared comparative-benchmark gap",
    materialAssumptions: [],
    changeMyMindEvidence: [],
  };

  // ── Step 5: applyDecision, no founder grant → approval_required. The gap
  //    here was DECLARED by interpretation, not discovered mid-MAKE via
  //    reportMissingInput, so "needs_input" would misstate its origin;
  //    "requirement_ready" is the trigger production itself uses for an
  //    ordinary/first decision pass on a causally-ready Requirement (see
  //    convex/objectiveRunner.ts's default sourcingDecisionExtra). ──────────
  await reserve(t, REQ_BENCH, "decide_bench_1", 1);
  const first = (await t.mutation(async (ctx) =>
    call(applyDecision, ctx, {
      objectiveKey: KEY,
      requestId: "decide_bench_1",
      rawStrategyProposal: MAKE_PROPOSAL,
      rawRecommendation,
      at: now + 1_000,
      sourcingDecision: { selectionSource: "sole_eligible", trigger: "requirement_ready" },
    }),
  )) as { ok: boolean; authorized?: boolean; reason?: string };
  assert.equal(first.ok, true, first.reason);
  assert.equal(first.authorized, false);

  // ── Steps 6-7: pending_approval survives the reservation clear; the
  //    refusal ceiling for comparative_benchmark is untouched. ─────────────
  const mgmt1 = await objectiveMgmt(t);
  assert.equal(mgmt1.pendingDecision, null, "reservation cleared");
  const notes1 = (mgmt1.controlNotes ?? []) as Array<Record<string, unknown>>;
  assert.ok(notes1.some((n) => n.type === "pending_approval"), "pending_approval survives the clear");
  const refusals1 = (mgmt1.decisionRefusalAttempts ?? {}) as Record<string, number>;
  assert.equal(refusals1[REQ_BENCH] ?? 0, 0, "approval_required does not burn the refusal ceiling");

  // ── Step 9 (checked here, before approval): zero intents / grants / effects.
  assert.equal(await count(t, "executionIntents"), 0, "no intent before approval");
  assert.equal(await count(t, "founderSpendGrants"), 0, "no grant before approval");
  const beforeApprovalObjective = await t.run(async (ctx) => {
    const row = await ctx.db.query("objectives").withIndex("by_key", (q) => q.eq("key", KEY)).unique();
    return (row as unknown as { data: { acquisitionResults?: unknown[] } }).data;
  });
  assert.equal((beforeApprovalObjective.acquisitionResults ?? []).length, 0, "no payment effect before approval");

  // ── Step 8: product workspace shows Needs You with exactly one $0.01
  //    approve action. ───────────────────────────────────────────────────────
  const view = (await t.query(async (ctx) =>
    call(getObjectiveWorkspaceV1, ctx, { objectiveKey: KEY }),
  )) as { view: { objective: { status: string }; attention: AttentionState | null } };
  assert.equal(view.view.objective.status, "needs_you");
  const attention = view.view.attention!;
  assert.ok(attention);
  assert.equal(attention.actions.length, 1);
  assert.equal(attention.actions[0]!.id, APPROVE_SPEND_ACTION_ID);
  assert.equal(attention.context?.amount?.currency, "USD");
  assert.equal(Number(attention.context?.amount?.amount), 0.01);

  // ── Step 10: explicit approval, exactly once; a replay is stale. ──────────
  const approveArgs = {
    objectiveId: KEY,
    attentionId: attention.id,
    attentionRevision: attention.revision,
    actionId: APPROVE_SPEND_ACTION_ID,
  };
  const approved = (await t.mutation(async (ctx) => call(submitAttentionActionV1, ctx, approveArgs))) as ProductCommandResult;
  assert.equal(approved.accepted, true);
  const replay = (await t.mutation(async (ctx) => call(submitAttentionActionV1, ctx, approveArgs))) as ProductCommandResult;
  assert.equal(replay.accepted, false, "replayed approval is stale");
  assert.equal(await count(t, "founderSpendGrants"), 1);
  assert.equal(await count(t, "executionIntents"), 0, "approval itself is not a payment");

  // ── Step 11 (part 1): re-decision under the new grant → BUY authorized,
  //    bound to the approval. ────────────────────────────────────────────────
  await reserve(t, REQ_BENCH, "decide_bench_2", 2);
  const second = (await t.mutation(async (ctx) =>
    call(applyDecision, ctx, {
      objectiveKey: KEY,
      requestId: "decide_bench_2",
      rawStrategyProposal: MAKE_PROPOSAL,
      rawRecommendation,
      at: now + 2_000,
      sourcingDecision: { selectionSource: "sole_eligible", trigger: "requirement_ready" },
    }),
  )) as { ok: boolean; authorized?: boolean; strategy?: string | null; reason?: string };
  assert.equal(second.ok, true, second.reason);
  assert.equal(second.authorized, true);
  assert.equal(second.strategy, "BUY");

  const decisions = await t.run(async (ctx) => ctx.db.query("managerialDecisions").collect());
  const benchAuthorized = decisions
    .map((row) => (row as unknown as { data: { requirementKey: string; authorization: Record<string, unknown>; optionId: string | null } }).data)
    .filter((d) => d.requirementKey === REQ_BENCH && d.authorization.kind === "authorized");
  assert.equal(benchAuthorized.length, 1, "authorized exactly once");
  assert.equal(benchAuthorized[0]!.optionId, guruOptionId);
  assert.ok(benchAuthorized[0]!.authorization.spendApprovalId, "BUY is bound to the founder approval record");

  // ── Step 11 (part 2): a real management pass dispatches the authorized BUY
  //    into a real ExecutionIntent (state "authorized"). ────────────────────
  await t.mutation(async (ctx) => call(runManagementPass, ctx, { objectiveKey: KEY, reason: "decision_applied" }));
  const intentRows = await t.run(async (ctx) => ctx.db.query("executionIntents").collect());
  const benchIntent = intentRows
    .map((row) => (row as unknown as { data: { intentId: string; requirementKey: string; state: string; target: { serviceId: string | null; resourceClass: string | null } } }).data)
    .find((d) => d.requirementKey === REQ_BENCH);
  assert.ok(benchIntent, "dispatch created an execution intent for comparative_benchmark");
  assert.equal(benchIntent!.state, "authorized");
  assert.equal(benchIntent!.target.serviceId, SOCIAL_MEDIA_GURU_SERVICE_ID);
  assert.equal(benchIntent!.target.resourceClass, "proprietary_data");

  // ── Step 11 (part 3): verified external acquisition — the SAME M6.1
  //    operator-gated seam tests/m61PostAcquisitionResume.test.ts's kind
  //    drives the live M3 rail through (handed_off → provider_result →
  //    verified), producing a genuine ExternalAcquisitionResult. No network
  //    call, no wallet, no signature — SIMULATION provenance is persisted as
  //    durable truth, exactly as convex/m3Driver.ts documents. ──────────────
  const simulated = (await t.mutation(async (ctx) =>
    call(simulateVerifiedAcquisition, ctx, { operatorToken: OPERATOR_TOKEN, intentId: benchIntent!.intentId }),
  )) as { verified: boolean; duplicate: boolean; intentState: string };
  assert.equal(simulated.verified, true);
  assert.equal(simulated.duplicate, false);
  assert.equal(simulated.intentState, "verified");

  const afterAcquisitionObjective = await t.run(async (ctx) => {
    const row = await ctx.db.query("objectives").withIndex("by_key", (q) => q.eq("key", KEY)).unique();
    return (row as unknown as { data: { acquisitionResults?: Array<{ requirementKey: string; resourceClass: string }> } }).data;
  });
  const benchAcquisition = (afterAcquisitionObjective.acquisitionResults ?? []).find(
    (a) => a.requirementKey === REQ_BENCH,
  );
  assert.ok(benchAcquisition, "the scoped proprietary_data acquisition is persisted for comparative_benchmark");
  assert.equal(benchAcquisition!.resourceClass, "proprietary_data");

  // ── Step 12: MAKE eligible again for comparative_benchmark now that the
  //    class is covered; the downstream final plan Requirement is
  //    MAKE-eligible and remains the ONLY Requirement carrying
  //    authorizedPurposeKinds. ────────────────────────────────────────────────
  const benchPost = await decisionOptionsFor(t, REQ_BENCH, "dec_bench_post_acq");
  const makeOptionPost = benchPost.options.find((o) => o.kind === "internal");
  assert.ok(makeOptionPost);
  assert.equal(
    makeOptionPost!.eligibility.eligible,
    true,
    `expected MAKE eligible after coverage, got ${JSON.stringify(makeOptionPost!.eligibility)}`,
  );

  const planPost = await decisionOptionsFor(t, REQ_PLAN, "dec_plan_post_acq");
  const planMakeOption = planPost.options.find((o) => o.kind === "internal");
  assert.ok(planMakeOption);
  assert.equal(planMakeOption!.eligibility.eligible, true, "the terminal plan Requirement is MAKE-eligible");

  const reqsFinal = await readReqs(t);
  const carriers = reqsFinal.filter((r) => (r.authorizedPurposeKinds ?? []).length > 0);
  assert.deepEqual(
    carriers.map((r) => r.requirementKey),
    [REQ_PLAN],
    "founder_ready_launch_plan remains the ONLY Requirement carrying authorizedPurposeKinds",
  );
});
