// M6.1 STOP B — post-INPUT_BLOCKED redecision.
//
// Starts at the successful A1 state: validated gap, worker yielded, MAKE
// strategy cleared, assignment still looking "running" against a stopped
// waiting_for_resource work item, decisionAttempts=1, no external intent.
//
// Expectation: one management pass reconciles the assignment out of flight,
// reserves a second strategic decision, and (with a deterministic mock
// recommendation) authorizes BUY/HYBRID into an external intent.
//
// Negative twin: when an external intent is already awaiting, do NOT redecide.
// Duplicate wake: second identical pass must not mint a third decision.

import test, { mock, after as afterAll } from "node:test";
import assert from "node:assert/strict";
import { convexTest } from "convex-test";
import schema from "../convex/schema";
import {
  putContract,
  putRequirement,
  initBudget,
  putAssignment,
  putIntent,
  readDecisionContext,
} from "../convex/internal/workforce";
import {
  applyDecision,
  runManagementPass,
} from "../convex/management";
import { buildOutcomeContract } from "../lib/management/contract";
import { computeDecisionInputFingerprint } from "../lib/objective/inputDiagnosis";
import { createWorkContract, createWorkerSpec } from "../lib/workforce";
import type {
  Assignment,
  ExecutionIntent,
  OutcomeContract,
  Requirement,
} from "../lib/management/types";
import type { ObjectiveRecord } from "../lib/objective/types";
import type { ResourceNeed } from "../lib/objective/resourceNeed";
import type { DecisionPassReads } from "../lib/management/decisionPass";

const modules = {
  "../convex/schema.ts": () => import("../convex/schema"),
  "../convex/objectiveValidators.ts": () => import("../convex/objectiveValidators"),
  "../convex/managementValidators.ts": () => import("../convex/managementValidators"),
  "../convex/workforceGuards.ts": () => import("../convex/workforceGuards"),
  "../convex/objectives.ts": () => import("../convex/objectives"),
  "../convex/objectiveRunner.ts": () => import("../convex/objectiveRunner"),
  "../convex/internal/workforce.ts": () => import("../convex/internal/workforce"),
  "../convex/management.ts": () => import("../convex/management"),
  "../convex/_generated/api.d.ts": () => import("../convex/_generated/api"),
  "../convex/_generated/server.d.ts": () => import("../convex/_generated/server"),
  "../convex/_generated/dataModel.d.ts": () => import("../convex/_generated/dataModel"),
};

mock.timers.enable({ apis: ["setTimeout"] });
afterAll(() => mock.timers.reset());

const now = 1_973_000_000_000;
const REQ = "req_01";

type Backend = ReturnType<typeof convexTest>;
type Handler = { _handler: (c: unknown, a: Record<string, unknown>) => Promise<unknown> };

function contractFor(key: string): OutcomeContract {
  const built = buildOutcomeContract({
    objectiveKey: key,
    contractId: `contract_${key}`,
    revision: 1,
    parsed: {
      intent: "gather messaging evidence then relaunch",
      levels: [
        {
          levelKey: "evidence",
          order: 1,
          statement: "current messaging evidence is decision-ready",
          label: "Evidence",
        },
      ],
      minimumCompletionBar: "evidence",
      ambiguities: [],
    },
    requestId: "stopb",
    founderResolvedQuestions: [],
    at: now,
  });
  assert.ok(built.ok);
  if (!built.ok) throw new Error("contract");
  return built.contract;
}

function requirementFor(key: string, contract: OutcomeContract): Requirement {
  return {
    requirementKey: REQ,
    objectiveKey: key,
    contractId: contract.contractId,
    contractRevision: 1,
    priority: "required",
    title: "Current messaging evidence is decision-ready",
    mustBeTrue: "sufficient accepted evidence is on record",
    scope: "owned then external if needed",
    dependsOnRequirementKeys: [],
    requiredResourceClasses: ["proprietary_data"],
    expectedOutput: "accepted evidence",
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

function fingerprint(input: {
  requiredResourceClasses: readonly string[];
  validatedMissingClasses: readonly string[];
  terminalDeliveryCount?: number;
}): string {
  return computeDecisionInputFingerprint({
    requirementKey: REQ,
    contractRevision: 1,
    requiredResourceClasses: input.requiredResourceClasses,
    validatedMissingClasses: input.validatedMissingClasses,
    prerequisiteStates: [],
    spendAuthorityUsd: null,
    budgetRemainingUsd: null,
    terminalDeliveryCount: input.terminalDeliveryCount ?? 0,
  });
}

const BEFORE_GAP_FP = fingerprint({
  requiredResourceClasses: [],
  validatedMissingClasses: [],
});
// The re-decide this test exercises follows the FIRST run's own assignment
// leaving "failed" (asserted below) — that terminal delivery is itself the
// material fact change the portability-gate fix folds into the fingerprint.
const AFTER_GAP_FP = fingerprint({
  requiredResourceClasses: ["proprietary_data"],
  validatedMissingClasses: ["proprietary_data"],
  terminalDeliveryCount: 1,
});

assert.notEqual(BEFORE_GAP_FP, AFTER_GAP_FP, "fingerprints must differ across A1");

async function seedPostA1(
  t: Backend,
  key: string,
  opts: { withAwaitingIntent?: boolean } = {},
) {
  const contract = contractFor(key);
  const requirement = requirementFor(key, contract);
  const runId = `run_${key}`;
  const wiId = `wi:asg_${key}`;
  const assignmentId = `asg_${key}`;
  const decisionId = `dec_${key}_${REQ}_r1_a1`;
  const workContract = createWorkContract({
    assignment: "Bounded MAKE attempt for messaging evidence",
    idempotencyScope: `${key}:${REQ}:r1:${assignmentId}`,
    worker: createWorkerSpec([
      "public_information_research",
      "company_records_lookup",
      "growth_launch_operations",
    ]),
    sourceProofs: [{ sourceClass: "company_record", minDistinctSources: 1 }],
  });

  const need: ResourceNeed = {
    id: `need_${key}`,
    objectiveKey: key,
    workItemId: wiId,
    resourceClass: "proprietary_data",
    purpose: "licensed market / audience dataset for messaging evidence",
    reasonOwnedInsufficient: "owned company_record check returned NOT_AVAILABLE",
    status: "active",
    proposedByRunId: runId,
    createdAt: now,
    updatedAt: now,
    requirementKey: REQ,
    validationAuthority: "application",
    inputCheckId: "evidence_sufficiency",
    contractRevision: 1,
    supportingEvidenceIds: ["ev_check"],
    dedupeKey: `${key}:proprietary_data:${REQ}`,
  };

  await t.run(async (ctx) => {
    await ctx.db.insert("objectives", {
      key,
      data: {
        key,
        request: "Fix launch messaging within approved spend.",
        createdAt: now,
        updatedAt: now,
        state: "waiting_for_resource",
        activity: "INPUT_BLOCKED — validated input gap; worker yielded; no payment created.",
        plan: null,
        lastDeliveryFailureClass: "INPUT_BLOCKED",
        workItems: [
          {
            id: wiId,
            objectiveKey: key,
            title: "Evidence",
            assignment: workContract.assignment,
            workerKey: workContract.workerKey,
            state: "waiting_for_resource",
            contract: workContract,
            runs: [
              {
                id: runId,
                workItemId: wiId,
                status: "stopped",
                startedAt: now,
                leaseUntil: now + 60_000,
                model: "mock",
                modelSelectionReason: "test",
                toolCalls: 3,
                summary:
                  "Paused: INPUT_BLOCKED — validated missing input; awaiting management redecision",
              },
            ],
          },
        ],
        run: {
          id: runId,
          workItemId: wiId,
          status: "stopped",
          startedAt: now,
          leaseUntil: now + 60_000,
          model: "mock",
          modelSelectionReason: "test",
          toolCalls: 3,
          summary:
            "Paused: INPUT_BLOCKED — validated missing input; awaiting management redecision",
        },
        result: null,
        resourceNeeds: [need],
        management: {
          contractId: contract.contractId,
          currentContractRevision: 1,
          decisionAttempts: { [REQ]: 1 },
          decisionInputFingerprints: { [REQ]: BEFORE_GAP_FP },
          pendingDecision: null,
          controlNotes: [],
          interpretationStatus: "done",
        },
      } as ObjectiveRecord & { management: Record<string, unknown> },
    });

    await ctx.db.insert("evidence", {
      objectiveKey: key,
      evidenceId: "ev_check",
      data: {
        sourceClass: "company_record",
        label: "input_check:NOT_AVAILABLE",
        text: "availability: NOT_AVAILABLE. zero usable sources",
        observedAt: now,
        recordedBy: "app",
        runId,
        origin: "application_observation",
        sourceId: "src_check",
      },
    });
  });

  await t.run(async (ctx) => {
    await (putContract as unknown as Handler)._handler(ctx, {
      objectiveKey: key,
      contractId: contract.contractId,
      revision: 1,
      data: contract,
    });
    await (putRequirement as unknown as Handler)._handler(ctx, {
      objectiveKey: key,
      requirementKey: REQ,
      data: requirement,
      currentContractRevision: 1,
    });
    await (initBudget as unknown as Handler)._handler(ctx, {
      objectiveKey: key,
      at: now,
    });
    await ctx.db.insert("founderSpendGrants", {
      approvalId: `appr_${key}`,
      objectiveKey: key,
      data: {
        approvalId: `appr_${key}`,
        objectiveKey: key,
        limitUsd: 25,
        grantedAt: now,
        revokedAt: null,
        note: "test grant",
      },
    });

    const assignment: Assignment = {
      assignmentId,
      objectiveKey: key,
      requirementKey: REQ,
      contractRevision: 1,
      decisionId,
      workerKey: workContract.workerKey,
      kind: "internal_make",
      state: "running",
      attempt: 1,
      runId,
      workContract,
      resultSummary: null,
      idempotencyScope: workContract.idempotencyScope,
      createdAt: now,
      updatedAt: now,
    };
    await (putAssignment as unknown as Handler)._handler(ctx, {
      assignmentId,
      objectiveKey: key,
      data: assignment,
    });

    if (opts.withAwaitingIntent) {
      const intent: ExecutionIntent = {
        intentId: `intent_${key}`,
        objectiveKey: key,
        requirementKey: REQ,
        contractRevision: 1,
        decisionId: `dec_${key}_${REQ}_r1_buy`,
        kind: "external_acquisition",
        strategy: "BUY",
        target: {
          offeringId: "off_seed",
          providerId: "prov_seed",
          serviceId: "svc_seed",
          resourceClass: "proprietary_data",
          endpointRef: null,
        },
        terms: {
          priceUsd: 2,
          priceProvenance: "registry_data",
          requiresApproval: false,
          approvalId: `appr_${key}`,
        },
        state: "awaiting_m3",
        attempts: 0,
        lastEventId: null,
        resultEvidenceId: null,
        verificationEvidenceId: null,
        boundaryNote: "seeded awaiting external result",
        createdAt: now,
        updatedAt: now,
        idempotencyKey: `idem_${key}_buy`,
      };
      await (putIntent as unknown as Handler)._handler(ctx, {
        intentId: intent.intentId,
        objectiveKey: key,
        idempotencyKey: intent.idempotencyKey,
        data: intent,
      });
    }
  });

  return { contract, requirement, runId, assignmentId, decisionId, workContract };
}

async function invokePass(t: Backend, key: string, reason = "worker_result") {
  return t.mutation(async (ctx) =>
    (runManagementPass as unknown as Handler)._handler(ctx, {
      objectiveKey: key,
      reason,
    }),
  ) as Promise<{ objectiveState: string; acted: boolean; summary: string }>;
}

async function readObj(t: Backend, key: string) {
  return t.query(async (ctx) => {
    const row = await ctx.db
      .query("objectives")
      .withIndex("by_key", (q) => q.eq("key", key))
      .unique();
    const data = (row as { data: ObjectiveRecord & { management: Record<string, unknown> } })
      .data;
    const assignments = await ctx.db
      .query("assignments")
      .withIndex("by_objective", (q) => q.eq("objectiveKey", key))
      .collect();
    const intents = await ctx.db
      .query("executionIntents")
      .withIndex("by_objective", (q) => q.eq("objectiveKey", key))
      .collect();
    return {
      state: data.state,
      management: data.management,
      assignments: assignments.map((a) => (a as { data: Assignment }).data),
      intents: intents.map((i) => (i as { data: ExecutionIntent }).data),
    };
  });
}

test("STOP B: INPUT_BLOCKED → reconcile assignment → decide_requirement → BUY intent", async () => {
  const key = "obj_stopb_redecide";
  const t = convexTest(schema, modules);
  await seedPostA1(t, key);

  const outcome = await invokePass(t, key);
  assert.match(
    outcome.summary,
    /grounded decision pass needed|decide/i,
    `expected decide path, got: ${outcome.summary}`,
  );

  const afterPass = await readObj(t, key);
  assert.equal(afterPass.assignments[0]?.state, "failed", "assignment must leave running");
  const attempts = afterPass.management.decisionAttempts as Record<string, number>;
  assert.equal(attempts[REQ], 2, "second strategic decision reserved");
  const pending = afterPass.management.pendingDecision as {
    requestId: string;
    attempts: number;
    inputFingerprint?: string;
  } | null;
  assert.ok(pending, "pendingDecision reserved");
  assert.equal(pending!.attempts, 2);
  assert.equal(
    pending!.inputFingerprint,
    AFTER_GAP_FP,
    "reservation fingerprint must include validated gap",
  );

  const reads = (await t.run(async (ctx) =>
    (readDecisionContext as unknown as Handler)._handler(ctx, {
      objectiveKey: key,
      requirementKey: REQ,
    }),
  )) as DecisionPassReads;
  assert.ok(reads.openResourceNeeds?.some((n) => n.validated && n.resourceClass === "proprietary_data"));

  // Deterministic mock recommendation: propose BUY covering the validated gap.
  // Discover eligible external option id the same way applyDecision will.
  const { buildDecisionPassInput } = await import("../lib/management/decisionPass");
  const probe = await buildDecisionPassInput(
    { ...reads, at: now, decisionId: "probe" },
    {
      strategy: "BUY",
      desiredCapabilities: ["public_information_research"],
      needsExternalResourceClass: "proprietary_data",
      notes: null,
    },
    async (eligible) => {
      const make = eligible.find((o) => o.kind === "internal");
      assert.ok(make);
      assert.equal(make!.eligibility.eligible, false, "MAKE excluded by validated gap");
      const external = eligible.find((o) => o.kind === "external" && o.eligibility.eligible);
      assert.ok(external, "compatible external option available");
      return {
        requirementKey: REQ,
        contractRevision: 1,
        selectedOptionId: external!.optionId,
        rationale: "validated proprietary_data gap requires external acquisition",
        materialAssumptions: ["registry price is current"],
        changeMyMindEvidence: [],
      };
    },
  );
  assert.equal(probe.ok, true);
  if (!probe.ok) return;

  const externalOpt = (
    await (async () => {
      const { runManagerialDecisionPass } = await import("../lib/management/decision");
      return runManagerialDecisionPass(probe.input);
    })()
  ).options.find((o) => o.kind === "external" && o.eligibility.eligible);
  assert.ok(externalOpt);

  const applied = (await t.mutation(async (ctx) =>
    (applyDecision as unknown as Handler)._handler(ctx, {
      objectiveKey: key,
      requestId: pending!.requestId,
      rawStrategyProposal: {
        strategy: "BUY",
        desiredCapabilities: ["public_information_research"],
        needsExternalResourceClass: "proprietary_data",
        notes: null,
      },
      rawRecommendation: {
        requirementKey: REQ,
        contractRevision: 1,
        selectedOptionId: externalOpt!.optionId,
        rationale: "validated proprietary_data gap requires external acquisition",
        materialAssumptions: ["registry price is current"],
        changeMyMindEvidence: [],
      },
      at: now,
    }),
  )) as { ok: boolean; authorized?: boolean; strategy?: string | null; reason?: string };

  assert.equal(applied.ok, true, applied.ok ? "" : applied.reason);
  assert.equal(applied.authorized, true);
  assert.equal(applied.strategy, "BUY");

  // Dispatch pass creates the external intent.
  await invokePass(t, key, "decision_applied");
  const afterDispatch = await readObj(t, key);
  assert.ok(
    afterDispatch.intents.some(
      (i) =>
        i.kind === "external_acquisition" &&
        (i.state === "awaiting_m3" || i.state === "authorized" || i.state === "handed_off"),
    ),
    "external intent must exist after authorized BUY",
  );
  assert.equal(
    (afterDispatch.management.decisionAttempts as Record<string, number>)[REQ],
    2,
  );
});

test("STOP B negative twin: awaiting external intent → await_wake, no second decision", async () => {
  const key = "obj_stopb_wait";
  const t = convexTest(schema, modules);
  await seedPostA1(t, key, { withAwaitingIntent: true });

  const outcome = await invokePass(t, key);
  assert.match(outcome.summary, /in flight|await/i, outcome.summary);
  assert.equal(outcome.objectiveState, "waiting_for_resource");

  const after = await readObj(t, key);
  assert.equal(after.assignments[0]?.state, "failed", "MAKE assignment still reconciled out");
  assert.equal(
    (after.management.decisionAttempts as Record<string, number>)[REQ],
    1,
    "must not burn another decision while BUY awaits",
  );
  assert.equal(after.management.pendingDecision, null);
  assert.equal(after.intents.length, 1);
});

test("STOP B duplicate wake: exactly one new decision, no third", async () => {
  const key = "obj_stopb_dup";
  const t = convexTest(schema, modules);
  await seedPostA1(t, key);

  await invokePass(t, key);
  const first = await readObj(t, key);
  assert.equal((first.management.decisionAttempts as Record<string, number>)[REQ], 2);
  const pending1 = first.management.pendingDecision as { requestId: string } | null;
  assert.ok(pending1);

  // Same wake again while pending — must not mint attempt 3.
  await invokePass(t, key);
  const second = await readObj(t, key);
  assert.equal((second.management.decisionAttempts as Record<string, number>)[REQ], 2);
  const pending2 = second.management.pendingDecision as { requestId: string } | null;
  assert.equal(pending2?.requestId, pending1!.requestId);

  // Apply BUY, then duplicate wake with unchanged facts must not start attempt 3.
  const reads = (await t.run(async (ctx) =>
    (readDecisionContext as unknown as Handler)._handler(ctx, {
      objectiveKey: key,
      requirementKey: REQ,
    }),
  )) as DecisionPassReads;
  const { buildDecisionPassInput } = await import("../lib/management/decisionPass");
  const { runManagerialDecisionPass } = await import("../lib/management/decision");
  const built = await buildDecisionPassInput(
    { ...reads, at: now, decisionId: "dup_probe" },
    {
      strategy: "BUY",
      desiredCapabilities: ["public_information_research"],
      needsExternalResourceClass: "proprietary_data",
      notes: null,
    },
    async (eligible) => {
      const external = eligible.find((o) => o.kind === "external" && o.eligibility.eligible);
      assert.ok(external);
      return {
        requirementKey: REQ,
        contractRevision: 1,
        selectedOptionId: external!.optionId,
        rationale: "duplicate-wake apply",
        materialAssumptions: [],
        changeMyMindEvidence: [],
      };
    },
  );
  assert.equal(built.ok, true);
  if (!built.ok) return;
  const pass = await runManagerialDecisionPass(built.input);
  const external = pass.options.find((o) => o.kind === "external" && o.eligibility.eligible);
  assert.ok(external);

  await t.mutation(async (ctx) =>
    (applyDecision as unknown as Handler)._handler(ctx, {
      objectiveKey: key,
      requestId: pending1!.requestId,
      rawStrategyProposal: {
        strategy: "BUY",
        desiredCapabilities: ["public_information_research"],
        needsExternalResourceClass: "proprietary_data",
        notes: null,
      },
      rawRecommendation: {
        requirementKey: REQ,
        contractRevision: 1,
        selectedOptionId: external!.optionId,
        rationale: "duplicate-wake apply",
        materialAssumptions: [],
        changeMyMindEvidence: [],
      },
      at: now,
    }),
  );

  await invokePass(t, key, "decision_applied");
  // Intent exists; further identical wakes must not decide again.
  await invokePass(t, key, "worker_result");
  const final = await readObj(t, key);
  assert.equal((final.management.decisionAttempts as Record<string, number>)[REQ], 2);
  assert.ok(final.intents.length >= 1);
  // No duplicate intent for the same requirement+decision identity.
  const buyIntents = final.intents.filter((i) => i.kind === "external_acquisition");
  assert.equal(buyIntents.length, 1, "no duplicate external intent");
});
