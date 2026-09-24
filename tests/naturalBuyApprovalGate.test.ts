// fix/final-natural-buy-path — emergent BUY → founder approval gate, end to end
// through real Convex mutations (no seeded BUY, grant, intent, or
// proprietary_data requirement):
//
//   Objective carries SUBMISSION_EXTERNAL_SOCIAL_PURPOSE_POLICY (purpose only)
//   → before any gap: MAKE is the only eligible option
//   → worker reportMissingInput (evidence_sufficiency, proprietary_data)
//   → application-validated ResourceNeed → MAKE input_not_owned, [Guru] only
//   → applyDecision with no founder grant → approval_required
//   → pending_approval survives the reservation clear; refusal ceiling untouched
//   → product workspace shows Needs You with one approve action for $0.01
//   → no execution intent / grant before approval
//   → founder approves once (replay is stale) → re-decision authorizes BUY
//     bound to that approval.
import test, { mock, after as afterAll } from "node:test";
import assert from "node:assert/strict";
import { convexTest } from "convex-test";
import schema from "../convex/schema";
import { reportMissingInput } from "../convex/objectives";
import {
  putContract,
  putRequirement,
  initBudget,
  readDecisionContext,
} from "../convex/internal/workforce";
import { applyDecision } from "../convex/management";
import { submitAttentionActionV1 } from "../convex/productCommands";
import { getObjectiveWorkspaceV1 } from "../convex/productWorkspace";
import { buildOutcomeContract } from "../lib/management/contract";
import {
  buildDecisionPassInput,
  type DecisionPassReads,
} from "../lib/management/decisionPass";
import { runManagerialDecisionPass } from "../lib/management/decision";
import { SUBMISSION_EXTERNAL_SOCIAL_PURPOSE_POLICY } from "../lib/objective/seedData";
import { SOCIAL_MEDIA_GURU_SERVICE_ID } from "../lib/payment/socialMediaGuruProduct";
import { APPROVE_SPEND_ACTION_ID } from "../lib/product/spendApprovalPolicy";
import type { AttentionState, ProductCommandResult } from "../app/product/contracts";
import type { GroundedOption, OutcomeContract, Requirement } from "../lib/management/types";
import type { ObjectiveRecord, WorkContract } from "../lib/objective/types";

const modules = {
  "../convex/schema.ts": () => import("../convex/schema"),
  "../convex/objectiveValidators.ts": () => import("../convex/objectiveValidators"),
  "../convex/managementValidators.ts": () => import("../convex/managementValidators"),
  "../convex/workforceGuards.ts": () => import("../convex/workforceGuards"),
  "../convex/objectives.ts": () => import("../convex/objectives"),
  "../convex/objectiveRunner.ts": () => import("../convex/objectiveRunner"),
  "../convex/objectiveCreate.ts": () => import("../convex/objectiveCreate"),
  "../convex/productCommands.ts": () => import("../convex/productCommands"),
  "../convex/productWorkspace.ts": () => import("../convex/productWorkspace"),
  "../convex/internal/workforce.ts": () => import("../convex/internal/workforce"),
  "../convex/management.ts": () => import("../convex/management"),
  "../convex/_generated/api.d.ts": () => import("../convex/_generated/api"),
  "../convex/_generated/server.d.ts": () => import("../convex/_generated/server"),
  "../convex/_generated/dataModel.d.ts": () => import("../convex/_generated/dataModel"),
};

mock.timers.enable({ apis: ["setTimeout"] });
const previousMode = process.env.SOMEBODY_EXECUTION_MODE;
process.env.SOMEBODY_EXECUTION_MODE = "testnet_demo";
afterAll(() => {
  mock.timers.reset();
  if (previousMode === undefined) delete process.env.SOMEBODY_EXECUTION_MODE;
  else process.env.SOMEBODY_EXECUTION_MODE = previousMode;
});

type Handler = { _handler: (ctx: unknown, args: Record<string, unknown>) => Promise<unknown> };
const call = (fn: unknown, ctx: unknown, args: Record<string, unknown>) =>
  (fn as Handler)._handler(ctx, args);
type Backend = ReturnType<typeof convexTest>;

const now = 1_973_000_000_000;
const KEY = "obj_natural_buy";
const REQ = "req_launch_deliverable";
const RUN = `run_${KEY}`;
const WI = `wi_${KEY}`;

const MAKE_PROPOSAL = {
  strategy: "MAKE",
  desiredCapabilities: ["public_information_research", "company_records_lookup"],
  needsExternalResourceClass: null,
  notes: null,
};

function contract(): OutcomeContract {
  const built = buildOutcomeContract({
    objectiveKey: KEY,
    contractId: `contract_${KEY}`,
    revision: 1,
    parsed: {
      intent: "ship a launch deliverable grounded in credible audience evidence",
      levels: [
        { levelKey: "deliverable", order: 1, statement: "the founder-facing launch deliverable is saved", label: "Deliverable" },
      ],
      minimumCompletionBar: "deliverable",
      ambiguities: [],
    },
    requestId: "req_natural_buy",
    founderResolvedQuestions: [],
    at: now,
  });
  if (!built.ok) throw new Error("contract");
  return built.contract;
}

function requirement(c: OutcomeContract): Requirement {
  return {
    requirementKey: REQ,
    objectiveKey: KEY,
    contractId: c.contractId,
    contractRevision: 1,
    priority: "required",
    title: "Launch deliverable",
    mustBeTrue: "the launch deliverable reflects current cross-platform audience behaviour",
    scope: "founder-facing deliverable",
    dependsOnRequirementKeys: [],
    // Owned/public inputs only — nothing pre-declares proprietary_data.
    requiredResourceClasses: ["company_records", "public_web"],
    requirementKind: "deliverable",
    // Bound from the Objective policy by bindAuthorizedPurposePolicy.
    authorizedPurposeKinds: [SUBMISSION_EXTERNAL_SOCIAL_PURPOSE_POLICY.purposeKind],
    expectedOutput: "saved launch deliverable",
    proofs: [],
    state: "active",
    strategy: null,
    resolution: null,
    blockedReason: null,
    waiver: null,
    revision: 1,
    createdAt: now,
    updatedAt: now,
  };
}

function workContract(): WorkContract {
  return {
    assignment: "Draft the launch deliverable from owned and public evidence",
    idempotencyScope: "scope_natural_buy",
    workerKey: "worker_research",
    capabilityKeys: ["public_information_research", "company_records_lookup"],
    allowedToolPermissions: [
      "read_company_record",
      "read_public_web",
      "record_finding",
      "request_resource",
      "submit_result",
      "request_completion",
    ],
    requiredSourceClasses: ["company_record", "public_web"],
    minObservations: 2,
    sourceProofs: [
      { sourceClass: "company_record", minDistinctSources: 1 },
      { sourceClass: "public_web", minDistinctSources: 1 },
    ],
    requiredVerifiedEffectKeys: [],
    approvalVersion: null,
    resultRequirements: { summary: true, fit: true, risks: true, unknowns: true, recommendedNextAction: true },
  };
}

async function seed(t: Backend) {
  const c = contract();
  const run = {
    id: RUN,
    workItemId: WI,
    status: "running",
    startedAt: now,
    leaseUntil: now + 60_000,
    model: "mock",
    modelSelectionReason: "test",
    toolCalls: 0,
    summary: "",
  };
  await t.run(async (ctx) => {
    await ctx.db.insert("objectives", {
      key: KEY,
      data: {
        key: KEY,
        request: "Plan our launch week with credible audience evidence",
        createdAt: now,
        updatedAt: now,
        state: "executing",
        activity: "MAKE attempt",
        plan: null,
        workItems: [
          { id: WI, objectiveKey: KEY, title: "Deliverable", assignment: workContract().assignment, workerKey: "worker_research", state: "running", contract: workContract(), runs: [run] },
        ],
        run,
        result: null,
        resourceNeeds: [],
        management: {
          contractId: c.contractId,
          decisionAttempts: {},
          authorizedPurposePolicy: SUBMISSION_EXTERNAL_SOCIAL_PURPOSE_POLICY,
          // Set by applyInterpretation for every interpreted Objective.
          executionProtocol: "m61_serial_v1",
        },
      } as ObjectiveRecord & { management: Record<string, unknown> },
    });
    // The worker's own lookups: owned record has no audience-behaviour data.
    for (const item of [
      {
        evidenceId: "ev_rec",
        data: {
          sourceClass: "company_record" as const,
          label: "input_check:NOT_AVAILABLE",
          text: "availability: NOT_AVAILABLE. not found — zero usable sources for current audience behaviour",
          recordRef: "audience_behaviour",
          observedAt: now,
          recordedBy: "app",
          runId: RUN,
          origin: "application_observation" as const,
          sourceId: "src_rec",
        },
      },
      {
        evidenceId: "ev_web",
        data: {
          sourceClass: "public_web" as const,
          label: "Public page",
          text: "generic platform guidance only; no current audience engagement data",
          url: "https://example.com/platform-guide",
          observedAt: now,
          recordedBy: "app",
          runId: RUN,
          origin: "application_observation" as const,
          sourceId: "src_web",
        },
      },
    ]) {
      await ctx.db.insert("evidence", { objectiveKey: KEY, evidenceId: item.evidenceId, data: item.data });
    }
  });
  await t.run(async (ctx) => {
    await call(putContract, ctx, { objectiveKey: KEY, contractId: c.contractId, revision: 1, data: c });
    await call(putRequirement, ctx, { objectiveKey: KEY, requirementKey: REQ, data: requirement(c), currentContractRevision: 1 });
    await call(initBudget, ctx, { objectiveKey: KEY, at: now });
  });
}

async function readsNow(t: Backend): Promise<DecisionPassReads> {
  const reads = (await t.run(async (ctx) =>
    call(readDecisionContext, ctx, { objectiveKey: KEY, requirementKey: REQ }),
  )) as DecisionPassReads | null;
  assert.ok(reads);
  return reads!;
}

async function eligibleNow(t: Backend, decisionId: string) {
  const built = await buildDecisionPassInput(
    { ...(await readsNow(t)), at: now, decisionId },
    MAKE_PROPOSAL,
    async () => null,
  );
  assert.equal(built.ok, true);
  if (!built.ok) throw new Error("build");
  const { options } = await runManagerialDecisionPass(built.input);
  const eligible: GroundedOption[] = options.filter((o) => o.eligibility.eligible);
  return { eligible, built: built.input };
}

async function objectiveMgmt(t: Backend) {
  return t.run(async (ctx) => {
    const row = await (ctx.db as any).query("objectives").withIndex("by_key", (q: any) => q.eq("key", KEY)).unique();
    return (row as unknown as { data: { management: Record<string, unknown> } }).data.management;
  });
}

async function reserve(t: Backend, requestId: string, attempts: number) {
  await t.run(async (ctx) => {
    const row = await (ctx.db as any).query("objectives").withIndex("by_key", (q: any) => q.eq("key", KEY)).unique();
    const data = (row as unknown as { data: Record<string, unknown> }).data;
    const mgmt = (data.management ?? {}) as Record<string, unknown>;
    await ctx.db.patch(row!._id, {
      data: {
        ...data,
        management: {
          ...mgmt,
          pendingDecision: { requestId, requirementKey: REQ, contractRevision: 1, attempts },
          decisionAttempts: { [REQ]: attempts },
        },
      },
    } as never);
  });
}

const count = (t: Backend, table: "executionIntents" | "founderSpendGrants") =>
  t.run(async (ctx) => (await ctx.db.query(table).collect()).length);

test("emergent BUY: runtime gap → [Guru] → approval_required survives → Needs You → one approval → BUY authorized", async () => {
  const t = convexTest(schema, modules);
  await seed(t);

  // ── Before any runtime gap: the policy alone creates no BUY. ──────────────
  const pre = await eligibleNow(t, "dec_pre");
  assert.deepEqual(pre.eligible.map((o) => o.strategy), ["MAKE"]);
  assert.equal(pre.built!.eligibilityFacts.requiredResourceClasses.includes("proprietary_data" as never), false);

  // ── Worker discovers the gap during MAKE; the application validates it. ──
  const report = (await t.run(async (ctx) =>
    call(reportMissingInput, ctx, {
      objectiveKey: KEY,
      runId: RUN,
      requirementKey: REQ,
      workItemId: WI,
      proposal: {
        inputCheckId: "evidence_sufficiency",
        resourceClass: "proprietary_data",
        purpose: "current cross-platform audience-behaviour evidence for the launch deliverable",
        reasonOwnedInsufficient: "owned records have no audience-behaviour data and public pages are generic guidance",
        supportingEvidenceIds: ["ev_rec", "ev_web"],
      },
    }),
  )) as { validated: boolean; refusalCode: string | null; detail: string };
  assert.equal(report.validated, true, `${report.refusalCode}: ${report.detail}`);

  const post = await eligibleNow(t, "dec_post");
  assert.ok(post.built!.eligibilityFacts.requiredResourceClasses.includes("proprietary_data" as never));
  assert.deepEqual(post.eligible.map((o) => o.external?.serviceId), [SOCIAL_MEDIA_GURU_SERVICE_ID]);
  const guruOptionId = post.eligible[0]!.optionId;
  const rawRecommendation = {
    requirementKey: REQ,
    contractRevision: 1,
    selectedOptionId: guruOptionId,
    rationale: "sole eligible option for the validated audience-evidence gap",
    materialAssumptions: [],
    changeMyMindEvidence: [],
  };

  // ── Decision with no founder grant → approval_required. ───────────────────
  await reserve(t, "decide_nb_1", 1);
  const first = (await t.mutation(async (ctx) =>
    call(applyDecision, ctx, {
      objectiveKey: KEY,
      requestId: "decide_nb_1",
      rawStrategyProposal: MAKE_PROPOSAL,
      rawRecommendation,
      at: now + 1_000,
      sourcingDecision: { selectionSource: "sole_eligible", trigger: "needs_input" },
    }),
  )) as { ok: boolean; authorized?: boolean; reason?: string };
  assert.equal(first.ok, true, first.reason);
  assert.equal(first.authorized, false);

  const mgmt1 = await objectiveMgmt(t);
  assert.equal(mgmt1.pendingDecision, null, "reservation cleared");
  const notes1 = (mgmt1.controlNotes ?? []) as Array<Record<string, unknown>>;
  assert.ok(notes1.some((n) => n.type === "pending_approval"), "pending_approval survives the clear");
  const refusals1 = (mgmt1.decisionRefusalAttempts ?? {}) as Record<string, number>;
  assert.equal(refusals1[REQ] ?? 0, 0, "approval_required does not burn the refusal ceiling");
  assert.equal(await count(t, "executionIntents"), 0, "no intent before approval");
  assert.equal(await count(t, "founderSpendGrants"), 0, "no grant before approval");

  // ── Founder product surface: Needs You with exactly one approve action. ──
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

  // ── Explicit approval, exactly once. ──────────────────────────────────────
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

  // ── Re-decision under the new grant: same emergent option, now authorized.
  await reserve(t, "decide_nb_2", 2);
  const second = (await t.mutation(async (ctx) =>
    call(applyDecision, ctx, {
      objectiveKey: KEY,
      requestId: "decide_nb_2",
      rawStrategyProposal: MAKE_PROPOSAL,
      rawRecommendation,
      at: now + 2_000,
      sourcingDecision: { selectionSource: "sole_eligible", trigger: "needs_input" },
    }),
  )) as { ok: boolean; authorized?: boolean; strategy?: string | null; reason?: string };
  assert.equal(second.ok, true, second.reason);
  assert.equal(second.authorized, true);
  assert.equal(second.strategy, "BUY");

  const decisions = await t.run(async (ctx) => ctx.db.query("managerialDecisions").collect());
  const authorizedRows = decisions
    .map((row) => (row as unknown as { data: { authorization: Record<string, unknown>; optionId: string | null } }).data)
    .filter((d) => d.authorization.kind === "authorized");
  assert.equal(authorizedRows.length, 1, "authorized exactly once");
  assert.equal(authorizedRows[0]!.optionId, guruOptionId);
  assert.ok(authorizedRows[0]!.authorization.spendApprovalId, "BUY is bound to the founder approval record");
});
