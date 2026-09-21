// Production-style whole-loop test through REAL Convex seams (convex-test harness),
// plus exactly 10 negative proofs. No live model/network: the model steps are
// represented by calling the apply mutations directly with raw payloads.
//
// Positive test: interpret → decide → dispatch → verify → propose → completed
// Negative tests N1-N10: forged satisfaction, no grant BUY, stale revision,
// hallucinated option, garbage interpretation, result without proof, replay
// applyDecision, ungoverned capability, decision ceiling, no-progress quiescence.

import test, { mock, after as afterAll } from "node:test";
import assert from "node:assert/strict";
import { convexTest } from "convex-test";
import schema from "../convex/schema";
import {
  putContract,
  putRequirement,
  initBudget,
  readBudget,
  putAssignment,
  timerState,
} from "../convex/internal/workforce";
import {
  buildConvexManagementPorts,
  applyInterpretation,
  applyDecision,
  runManagementPass,
  BEGIN_DECISION_CEILING,
} from "../convex/management";
import { buildOutcomeContract, buildRequirement, buildSemanticRequirement } from "../lib/management/contract";
import { optionIdFor } from "../lib/management/options";
import type { OutcomeContract, Requirement, Assignment } from "../lib/management/types";
import { cp2ParsedRequirement } from "./helpers/cp2Requirement";

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

const now = 1950000000000;
type Backend = ReturnType<typeof convexTest>;

type LooseDb = {
  query(name: string): {
    withIndex(name: string, f: (q: { eq: (k: string, v: unknown) => unknown }) => unknown): {
      unique(): Promise<Record<string, unknown> | null>;
      collect(): Promise<Array<Record<string, unknown>>>;
    };
  };
};
const looseDb = (ctx: { db: unknown }): LooseDb => ctx.db as LooseDb;

type Handler = { _handler: (c: unknown, a: Record<string, unknown>) => Promise<unknown> };

async function invokeApplyInterpretation(t: Backend, args: Record<string, unknown>) {
  return t.mutation(async (ctx) =>
    (applyInterpretation as unknown as Handler)._handler(ctx, args),
  );
}

async function invokeApplyDecision(t: Backend, args: Record<string, unknown>) {
  return t.mutation(async (ctx) =>
    (applyDecision as unknown as Handler)._handler(ctx, args),
  );
}

async function invokeRunManagementPass(t: Backend, args: Record<string, unknown>): Promise<any> {
  return t.mutation(async (ctx) =>
    (runManagementPass as unknown as Handler)._handler(ctx, args),
  );
}

function rawContract(intent = "prove the whole loop works") {
  return {
    intent,
    levels: [{ levelKey: "goal", order: 1, statement: "the goal holds", label: "Goal" }],
    minimumCompletionBar: "goal",
    ambiguities: [],
  };
}

function rawRequirements(reqKey: string, title = "The governed result is recorded", mustBeTrue = "an application observation supports the statement") {
  return [
    { requirementKey: reqKey, priority: "required", title, mustBeTrue, scope: "company artifact + observation" },
  ];
}

function contractFor(objectiveKey: string, revision = 1): OutcomeContract {
  const built = buildOutcomeContract({
    objectiveKey,
    contractId: `contract_${objectiveKey}`,
    revision,
    parsed: {
      intent: "prove the whole loop works",
      levels: [{ levelKey: "goal", order: 1, statement: "the goal holds", label: "Goal" }],
      minimumCompletionBar: "goal",
      ambiguities: [],
    },
    requestId: "loop_test",
    founderResolvedQuestions: [],
    at: now,
  });
  assert.equal(built.ok, true);
  if (!built.ok) throw new Error("contract fixture invalid");
  return built.contract;
}

function makeRequirement(objectiveKey: string, reqKey: string, strategy: "MAKE" | "BUY" | null = "MAKE", title = "A loop test requirement", mustBeTrue = "the loop authorizes correctly"): Requirement {
  const built = buildRequirement(
    {
      objectiveKey,
      contract: contractFor(objectiveKey),
      proposed: cp2ParsedRequirement({
        requirementKey: reqKey,
        priority: "required",
        title,
        mustBeTrue,
        scope: "one governed decision",
      }),
      artifactKeyForInternalProof: null,
      at: now,
    },
    strategy,
  );
  assert.ok(!("errors" in built), `buildRequirement failed: ${"errors" in built ? built.errors.join("; ") : ""}`);
  return "requirement" in built ? built.requirement : (() => { throw new Error(); })();
}

async function seedObjective(t: Backend, key: string, extra: Record<string, unknown> = {}) {
  await t.mutation(async (ctx) => {
    await ctx.db.insert("objectives", {
      key,
      data: {
        key,
        request: "prove the whole loop works",
        createdAt: now,
        updatedAt: now,
        state: "received",
        activity: "new",
        plan: null,
        workItems: [],
        run: null,
        result: null,
        management: { contractId: null, controlNotes: [], ...extra },
      } as never,
    });
  });
}

async function seedContractRequirementBudget(
  t: Backend,
  key: string,
  requirement: Requirement,
  revision = 1,
  decisionAttempts: Record<string, number> = {},
  decisionRefusalAttempts: Record<string, number> = {},
) {
  await t.mutation(async (ctx) =>
    (putContract as unknown as Handler)._handler(ctx, {
      objectiveKey: key,
      contractId: `contract_${key}`,
      revision,
      data: contractFor(key, revision),
    }),
  );
  await t.mutation(async (ctx) =>
    (putRequirement as unknown as Handler)._handler(ctx, {
      objectiveKey: key,
      requirementKey: requirement.requirementKey,
      data: requirement,
      currentContractRevision: revision,
    }),
  );
  await t.mutation(async (ctx) =>
    (initBudget as unknown as Handler)._handler(ctx, {
      objectiveKey: key,
      at: now,
    }),
  );
  await t.mutation(async (ctx) => {
    const row = await looseDb(ctx).query("objectives").withIndex("by_key", (q) => q.eq("key", key)).unique();
    if (!row) throw new Error("objective missing");
    const data = (row as any).data;
    await ctx.db.patch((row as any)._id, {
      data: {
        ...data,
        management: {
          ...(data.management ?? {}),
          contractId: `contract_${key}`,
          currentContractRevision: revision,
          controlNotes: [],
          pendingDecision: null,
          decisionAttempts,
          decisionRefusalAttempts,
        },
      },
    } as never);
  });
}

async function readObjective(t: Backend, key: string) {
  return t.query(async (ctx) => {
    const row = await looseDb(ctx).query("objectives").withIndex("by_key", (q) => q.eq("key", key)).unique();
    return row ? (row as any).data : null;
  });
}

async function readDecisions(t: Backend, key: string) {
  return t.query(async (ctx) => {
    const rows = await looseDb(ctx).query("managerialDecisions").withIndex("by_objectiveKey", (q) => q.eq("objectiveKey", key)).collect();
    return rows.map((row) => (row as any).data);
  });
}

async function readWakes(t: Backend, key: string) {
  return t.query(async (ctx) => {
    const rows = await looseDb(ctx).query("wakeEvents").withIndex("by_objective", (q) => q.eq("objectiveKey", key)).collect();
    return rows.map((row) => ({ dedupeKey: (row as any).dedupeKey, data: (row as any).data }));
  });
}

async function readRequirements(t: Backend, key: string) {
  return t.query(async (ctx) => {
    const rows = await looseDb(ctx).query("requirements").withIndex("by_objectiveKey", (q) => q.eq("objectiveKey", key)).collect();
    return rows.map((row) => (row as any).data as Requirement);
  });
}

async function readAssignments(t: Backend, key: string) {
  return t.query(async (ctx) => {
    const rows = await looseDb(ctx).query("assignments").withIndex("by_objective", (q) => q.eq("objectiveKey", key)).collect();
    return rows.map((row) => (row as any).data as Assignment);
  });
}

async function readBudgetRow(t: Backend, key: string) {
  return t.query(async (ctx) =>
    (readBudget as unknown as Handler)._handler(ctx, { objectiveKey: key }),
  ) as Promise<any>;
}

async function readContracts(t: Backend, key: string) {
  return t.query(async (ctx) => {
    const rows = await looseDb(ctx).query("outcomeContracts").withIndex("by_objective", (q) => q.eq("objectiveKey", key)).collect();
    return rows.map((row) => (row as any).data as OutcomeContract);
  });
}

async function readEvidence(t: Backend, key: string) {
  return t.query(async (ctx) => {
    const rows = await looseDb(ctx).query("evidence").withIndex("by_objectiveKey", (q) => q.eq("objectiveKey", key)).collect();
    return rows.map((row) => ({ evidenceId: (row as any).evidenceId, data: (row as any).data }));
  });
}

async function readIntents(t: Backend, key: string) {
  return t.query(async (ctx) => {
    const rows = await looseDb(ctx).query("executionIntents").withIndex("by_objective", (q) => q.eq("objectiveKey", key)).collect();
    return rows.map((row) => (row as any).data);
  });
}

function computeOptionId(reqKey: string, revision: number, capabilities: string[], workerKey: string | null = null): string {
  const sortedKeys = [...new Set(capabilities)].sort();
  const target = `internal:${sortedKeys.join("+")}:${workerKey ?? "new"}`;
  return optionIdFor({ requirementKey: reqKey, contractRevision: revision, kind: "internal", target });
}

// ── Positive whole-loop test ─────────────────────────────────────────────────

test("production loop: interpret → decide → dispatch → verify → propose → completed", async () => {
  const t = convexTest(schema, modules);
  const key = "obj_loop";
  const reqKey = "req_loop";
  const requestId = "interpret_obj_loop_a1";

  // Phase 1: Seed objective + applyInterpretation
  await seedObjective(t, key);
  const interpretResult = await invokeApplyInterpretation(t, {
    objectiveKey: key,
    requestId,
    rawContract: rawContract(),
    rawRequirements: rawRequirements(reqKey),
    founderResolvedQuestions: [],
    at: now,
  }) as { ok: boolean; contractId?: string; requirementKeys?: string[]; errors?: string[] };

  assert.equal(interpretResult.ok, true, `applyInterpretation failed: ${interpretResult.errors?.join("; ")}`);
  assert.ok(interpretResult.contractId, "contractId returned");
  assert.deepEqual(interpretResult.requirementKeys, [reqKey], "requirementKeys returned");

  // Assert: contract row persisted
  const contracts = await readContracts(t, key);
  assert.equal(contracts.length, 1, "one contract row");

  // Assert: requirement row persisted
  const reqs = await readRequirements(t, key);
  assert.equal(reqs.length, 1, "one requirement row");
  assert.equal(reqs[0].requirementKey, reqKey);
  assert.deepEqual(reqs[0].proofs, [], "semantic requirement has no proofs yet");

  // Assert: management.contractId set
  const obj1 = await readObjective(t, key);
  assert.equal(obj1.management.contractId, interpretResult.contractId, "management.contractId set");

  // Assert: wake event appended
  const wakes1 = await readWakes(t, key);
  const interpretWake = wakes1.find((w) => w.dedupeKey.startsWith(`interpret:${key}:`));
  assert.ok(interpretWake, "interpretation wake appended");

  // Phase 2: runManagementPass → decide begins
  const outcome1 = await invokeRunManagementPass(t, {
    objectiveKey: key,
    reason: "objective_submitted",
  }) as { objectiveState: string };

  const obj2 = await readObjective(t, key);
  const pending = obj2.management.pendingDecision as { requestId: string; requirementKey: string; contractRevision: number; attempts: number } | null;
  assert.ok(pending, "pendingDecision reserved");
  assert.equal(pending!.requirementKey, reqKey);
  assert.equal(pending!.contractRevision, 1);
  assert.equal(pending!.attempts, 1);

  const attempts1 = obj2.management.decisionAttempts as Record<string, number>;
  assert.equal(attempts1[reqKey], 1, "decisionAttempts incremented");

  const decisions1 = await readDecisions(t, key);
  assert.equal(decisions1.length, 0, "no decision row yet");

  // Phase 3: applyDecision → authorized
  const capabilityKeys = ["public_information_research"];
  const expectedOptionId = computeOptionId(reqKey, 1, capabilityKeys);

  const applyResult = await invokeApplyDecision(t, {
    objectiveKey: key,
    requestId: pending!.requestId,
    rawStrategyProposal: {
      strategy: "MAKE",
      desiredCapabilities: capabilityKeys,
      needsExternalResourceClass: null,
      notes: null,
    },
    rawRecommendation: {
      requirementKey: reqKey,
      contractRevision: 1,
      selectedOptionId: expectedOptionId,
      rationale: "test MAKE authorization",
      materialAssumptions: [],
      changeMyMindEvidence: [],
    },
    at: now,
  }) as { ok: boolean; decisionId?: string; authorized?: boolean; strategy?: string | null; reason?: string };

  assert.equal(applyResult.ok, true, `applyDecision failed: ${applyResult.reason}`);
  assert.equal(applyResult.authorized, true, "decision authorized");
  assert.equal(applyResult.strategy, "MAKE");

  const decisions2 = await readDecisions(t, key);
  assert.equal(decisions2.length, 1, "one decision row");
  assert.equal((decisions2[0].authorization as any).kind, "authorized");

  const reqs2 = await readRequirements(t, key);
  assert.equal(reqs2[0].strategy, "MAKE", "requirement strategy bound");
  assert.ok(reqs2[0].proofs.length > 0, "requirement proofs attached");

  const obj3 = await readObjective(t, key);
  assert.equal(obj3.management.pendingDecision, null, "pendingDecision cleared");

  // Phase 4: runManagementPass → dispatch
  const outcome2 = await invokeRunManagementPass(t, {
    objectiveKey: key,
    reason: "decision_applied",
  }) as { objectiveState: string };

  const assignments1 = await readAssignments(t, key);
  assert.equal(assignments1.length, 1, "one assignment row");
  assert.equal(assignments1[0].state, "running", "assignment running after startManagedRun");
  assert.ok(assignments1[0].runId, "assignment has runId");

  const obj4 = await readObjective(t, key);
  assert.ok(obj4.workItems.length > 0, "objective has workItems");
  assert.ok(obj4.run, "objective has run");

  // Phase 5a: Patch workItem run to "running" (no-op since already running)
  const outcome3 = await invokeRunManagementPass(t, {
    objectiveKey: key,
    reason: "worker_result",
  }) as { objectiveState: string };

  const assignments2 = await readAssignments(t, key);
  assert.equal(assignments2[0].state, "running", "assignment still running");

  // Phase 5b: Patch run to "stopped" + wi to "completed", seed evidence
  const assignmentRunId = assignments2[0].runId!;
  await t.mutation(async (ctx) => {
    const row = await looseDb(ctx).query("objectives").withIndex("by_key", (q) => q.eq("key", key)).unique();
    if (!row) throw new Error("objective missing");
    const data = (row as any).data;
    const workItems = [...(data.workItems ?? [])];
    workItems[0] = {
      ...workItems[0],
      state: "completed",
      runs: workItems[0].runs.map((r: any) => ({ ...r, status: "stopped", summary: "done" })),
    };
    await ctx.db.patch((row as any)._id, {
      data: {
        ...data,
        workItems,
        run: { ...data.run, status: "stopped", summary: "done" },
      },
    } as never);
  });

  await t.mutation(async (ctx) => {
    await ctx.db.insert("evidence", {
      objectiveKey: key,
      evidenceId: "ev_loop_1",
      data: {
        sourceClass: "public_web",
        label: "ev_loop_1",
        text: "content",
        observedAt: now,
        recordedBy: "worker-1",
        runId: assignmentRunId,
        origin: "application_observation",
        sourceId: "url:https://loop.example/a",
      } as never,
    });
  });

  const outcome4 = await invokeRunManagementPass(t, {
    objectiveKey: key,
    reason: "worker_result",
  }) as { objectiveState: string };

  const reqs3 = await readRequirements(t, key);
  assert.equal(reqs3[0].state, "satisfied", "requirement satisfied");

  const assignments3 = await readAssignments(t, key);
  assert.equal(assignments3[0].state, "verified", "assignment verified");

  // Serial protocol (set at interpretation): final semantic assessment required.
  const { beginFinalSemanticAssessment, applyFinalSemanticAssessment } =
    await import("../convex/management");
  // Ensure a sole governed artifact exists for unambiguous assessment target.
  await t.mutation(async (ctx) => {
    const row = await looseDb(ctx)
      .query("objectives")
      .withIndex("by_key", (q) => q.eq("key", key))
      .unique();
    if (!row) throw new Error("objective missing");
    const data = (row as { data: Record<string, unknown> }).data;
    await ctx.db.patch((row as { _id: string })._id as never, {
      data: {
        ...data,
        companyArtifacts: [
          {
            key: "loop/deliverable",
            version: 1,
            content: "loop deliverable content",
            history: [],
          },
        ],
      } as never,
    });
  });
  const began = (await t.mutation(async (ctx) =>
    (beginFinalSemanticAssessment as unknown as Handler)._handler(ctx, {
      objectiveKey: key,
      at: now,
    }),
  )) as { proceed: boolean; requestId?: string; reason?: string };
  assert.equal(began.proceed, true, began.reason);
  const assessed = (await t.mutation(async (ctx) =>
    (applyFinalSemanticAssessment as unknown as Handler)._handler(ctx, {
      objectiveKey: key,
      requestId: began.requestId!,
      meetsMinimumBar: true,
      rationale: "loop deliverable meets minimum bar",
      artifactKey: "loop/deliverable",
      artifactVersion: 1,
      evidenceRefs: ["ev_loop_1"],
      assumptionsUnknowns: [],
      recommendedNextAction: "complete",
      contractRevision: 1,
      at: now,
    }),
  )) as { ok: boolean; reason?: string };
  assert.equal(assessed.ok, true, assessed.reason);

  // Phase 6: runManagementPass → propose → completed (may already be done via continue cycles)
  const outcome5 = await invokeRunManagementPass(t, {
    objectiveKey: key,
    reason: "worker_result",
  }) as { objectiveState: string };

  assert.equal(outcome5.objectiveState, "completed", "objective completed");

  // Assert: completion_proposal decision row exists with accepted verdict
  const decisions3 = await readDecisions(t, key);
  const gateDecision = decisions3.find((d) => (d as any).kind === "completion_proposal");
  assert.ok(gateDecision, "completion_proposal decision row exists");

  const gateSummary = JSON.parse((gateDecision as any).coarsePlanSummary);
  assert.ok(gateSummary.gateVerdict, "gate verdict encoded");
  assert.equal(gateSummary.gateVerdict.accepted, true, "gate accepted");

  // Assert: control notes contain completed state
  const obj5 = await readObjective(t, key);
  const notes = obj5.management.controlNotes as Array<Record<string, unknown>>;
  const completedNote = notes.find((n) => n.type === "control_state" && n.state === "completed");
  assert.ok(completedNote, "control note with state completed exists");
});

// ── Negative proofs ──────────────────────────────────────────────────────────

test("N1 forged satisfaction: satisfied requirement with invented proofRefs is REFUSED by completion gate", async () => {
  const t = convexTest(schema, modules);
  const key = "obj_n1_forged";
  const reqKey = "req_n1";
  const requirement: Requirement = {
    ...makeRequirement(key, reqKey),
    state: "satisfied",
    resolution: {
      resolutionId: "res_forged",
      acceptedDecisionId: null,
      acceptedAssignmentId: null,
      acceptedIntentId: null,
      proofRefs: ["ev_ghost", "intent_ghost"],
      contractRevision: 1,
      acceptedAt: now,
    },
  };
  await seedObjective(t, key);
  await seedContractRequirementBudget(t, key, requirement);

  const verdict = await t.mutation(async (ctx) =>
    buildConvexManagementPorts(ctx as never).proposeCompletion({
      proposalId: `prop_${key}`,
      objectiveKey: key,
      contractId: `contract_${key}`,
      contractRevision: 1,
      claimedLevelKey: "goal",
      rationale: "forged satisfaction",
      proposedAt: now,
    }, now),
  ) as { accepted: boolean; unmet: string[] };

  assert.equal(verdict.accepted, false, "gate refused forged satisfaction");
  assert.ok(verdict.unmet.some((line) => line.includes(reqKey) && line.includes("no application observation")), `unmet mentions missing observation: ${verdict.unmet.join("; ")}`);
});

async function beginDecision(t: Backend, key: string, reqKey: string, revision = 1) {
  return t.mutation(async (ctx) => {
    const ports = buildConvexManagementPorts(ctx as never);
    const state = {
      objectiveKey: key,
      focusRequirementKey: reqKey,
      contractRevision: revision,
      managerDecisionId: null,
      pendingIntentId: null,
      wakeReason: null,
      wakeEventIds: [],
      continuation: {},
      lastNode: null,
      pass: 1,
    };
    return ports.runDecisionPass(state, ports, now);
  });
}

test("N2 no founder grant: monetary BUY cannot authorize without spend authority", async () => {
  const t = convexTest(schema, modules);
  const key = "obj_n2_nogrant";
  const reqKey = "req_n2";
  const requirement = makeRequirement(key, reqKey, "MAKE", "Research X narrative trends", "twitter data supports the claim");
  await seedObjective(t, key);
  await seedContractRequirementBudget(t, key, requirement);

  // BEGIN decision
  await beginDecision(t, key, reqKey);
  const obj1 = await readObjective(t, key);
  const pending = obj1.management.pendingDecision as { requestId: string };
  assert.ok(pending, "pendingDecision reserved");

  // APPLY with BUY strategy
  const applyResult = await invokeApplyDecision(t, {
    objectiveKey: key,
    requestId: pending.requestId,
    rawStrategyProposal: {
      strategy: "BUY",
      desiredCapabilities: [],
      needsExternalResourceClass: "proprietary_data",
      notes: null,
    },
    rawRecommendation: {
      requirementKey: reqKey,
      contractRevision: 1,
      selectedOptionId: "opt_fake",
      rationale: "test BUY without grant",
      materialAssumptions: [],
      changeMyMindEvidence: [],
    },
    at: now,
  }) as { ok: boolean; authorized?: boolean; reason?: string };

  assert.equal(applyResult.ok, true, "applyDecision returns ok:true");
  assert.equal(applyResult.authorized, false, "decision NOT authorized without grant");

  const decisions = await readDecisions(t, key);
  assert.ok(decisions.length > 0, "decision row persisted");
  const authKind = (decisions[0].authorization as any).kind;
  assert.ok(authKind === "refused" || authKind === "approval_required", `authorization kind is ${authKind}`);

  const intents = await readIntents(t, key);
  assert.equal(intents.length, 0, "NO execution intent row created");
});

test("N3 stale revision: applyDecision after contract revision moves returns ok:false stale", async () => {
  const t = convexTest(schema, modules);
  const key = "obj_n3_stale";
  const reqKey = "req_n3";
  const requirement = makeRequirement(key, reqKey);
  await seedObjective(t, key);
  await seedContractRequirementBudget(t, key, requirement, 1);

  // BEGIN at rev1
  await beginDecision(t, key, reqKey, 1);
  const obj1 = await readObjective(t, key);
  const pending = obj1.management.pendingDecision as { requestId: string };

  // Move contract to rev2
  await t.mutation(async (ctx) =>
    (putContract as unknown as Handler)._handler(ctx, {
      objectiveKey: key,
      contractId: `contract_${key}`,
      revision: 2,
      data: contractFor(key, 2),
    }),
  );

  // APPLY with stale requestId
  const applyResult = await invokeApplyDecision(t, {
    objectiveKey: key,
    requestId: pending.requestId,
    rawStrategyProposal: { strategy: "MAKE", desiredCapabilities: ["public_information_research"], needsExternalResourceClass: null, notes: null },
    rawRecommendation: { requirementKey: reqKey, contractRevision: 1, selectedOptionId: "opt_fake", rationale: "test", materialAssumptions: [], changeMyMindEvidence: [] },
    at: now,
  }) as { ok: boolean; reason?: string };

  assert.equal(applyResult.ok, false, "applyDecision returns ok:false");
  assert.ok(applyResult.reason?.toLowerCase().includes("stale"), `reason mentions stale: ${applyResult.reason}`);

  const obj2 = await readObjective(t, key);
  assert.equal(obj2.management.pendingDecision, null, "pendingDecision cleared");

  const decisions = await readDecisions(t, key);
  const r1Decisions = decisions.filter((d) => (d as any).decisionId?.includes("_r1_"));
  assert.equal(r1Decisions.length, 0, "no decision row at rev1");
});

test("N4 hallucinated option: invalid selectedOptionId returns authorized:false, decision refused", async () => {
  const t = convexTest(schema, modules);
  const key = "obj_n4_hallucinated";
  const reqKey = "req_n4";
  const requirement = makeRequirement(key, reqKey);
  await seedObjective(t, key);
  await seedContractRequirementBudget(t, key, requirement);

  await beginDecision(t, key, reqKey);
  const obj1 = await readObjective(t, key);
  const pending = obj1.management.pendingDecision as { requestId: string };

  const applyResult = await invokeApplyDecision(t, {
    objectiveKey: key,
    requestId: pending.requestId,
    rawStrategyProposal: { strategy: "MAKE", desiredCapabilities: ["public_information_research"], needsExternalResourceClass: null, notes: null },
    rawRecommendation: {
      requirementKey: reqKey,
      contractRevision: 1,
      selectedOptionId: "opt_nonexistent",
      rationale: "test hallucinated option",
      materialAssumptions: [],
      changeMyMindEvidence: [],
    },
    at: now,
  }) as { ok: boolean; authorized?: boolean };

  assert.equal(applyResult.ok, true, "applyDecision returns ok:true");
  assert.equal(applyResult.authorized, false, "decision NOT authorized");

  const decisions = await readDecisions(t, key);
  assert.equal(decisions.length, 1, "one decision row");
  assert.equal((decisions[0].authorization as any).kind, "refused", "decision authorization kind is refused");

  const obj2 = await readObjective(t, key);
  const attempts = obj2.management.decisionAttempts as Record<string, number>;
  assert.equal(attempts[reqKey], 1, "decisionAttempts retained (refusal does not reset)");
});

test("N5 garbage interpretation: applyInterpretation with rawContract null returns ok:false", async () => {
  const t = convexTest(schema, modules);
  const key = "obj_n5_garbage";
  await seedObjective(t, key);

  const result = await invokeApplyInterpretation(t, {
    objectiveKey: key,
    requestId: "interpret_n5_a1",
    rawContract: null,
    rawRequirements: rawRequirements("req_n5"),
    founderResolvedQuestions: [],
    at: now,
  }) as { ok: boolean; errors?: string[] };

  assert.equal(result.ok, false, "applyInterpretation returns ok:false");
  assert.ok(result.errors && result.errors.length > 0, "errors non-empty");

  const contracts = await readContracts(t, key);
  assert.equal(contracts.length, 0, "no contract row persisted");

  const obj = await readObjective(t, key);
  assert.equal(obj.management.interpretationStatus, "refused", "interpretationStatus is refused");
  assert.equal(obj.management.interpretationAttempts, 1, "interpretationAttempts incremented");
});

test("N6 result without proof: completed run with NO evidence does NOT satisfy requirement", async () => {
  const t = convexTest(schema, modules);
  const key = "obj_n6_noproof";
  const reqKey = "req_n6";
  const requirement = makeRequirement(key, reqKey);
  await seedObjective(t, key);
  await seedContractRequirementBudget(t, key, requirement);

  // BEGIN + APPLY to authorize MAKE
  await beginDecision(t, key, reqKey);
  const obj1 = await readObjective(t, key);
  const pending = obj1.management.pendingDecision as { requestId: string };
  const optionId = computeOptionId(reqKey, 1, ["public_information_research"]);

  await invokeApplyDecision(t, {
    objectiveKey: key,
    requestId: pending.requestId,
    rawStrategyProposal: { strategy: "MAKE", desiredCapabilities: ["public_information_research"], needsExternalResourceClass: null, notes: null },
    rawRecommendation: { requirementKey: reqKey, contractRevision: 1, selectedOptionId: optionId, rationale: "test", materialAssumptions: [], changeMyMindEvidence: [] },
    at: now,
  });

  // Dispatch
  await invokeRunManagementPass(t, { objectiveKey: key, reason: "decision_applied" });
  const assignments1 = await readAssignments(t, key);
  assert.equal(assignments1.length, 1, "assignment created");
  const runId = assignments1[0].runId!;

  // Patch run to stopped/completed but seed NO evidence
  await t.mutation(async (ctx) => {
    const row = await looseDb(ctx).query("objectives").withIndex("by_key", (q) => q.eq("key", key)).unique();
    if (!row) throw new Error("objective missing");
    const data = (row as any).data;
    const workItems = [...(data.workItems ?? [])];
    workItems[0] = {
      ...workItems[0],
      state: "completed",
      runs: workItems[0].runs.map((r: any) => ({ ...r, status: "stopped" })),
    };
    await ctx.db.patch((row as any)._id, {
      data: { ...data, workItems, run: { ...data.run, status: "stopped" } },
    } as never);
  });

  // runManagementPass → verify → no satisfaction
  await invokeRunManagementPass(t, { objectiveKey: key, reason: "worker_result" });

  const reqs = await readRequirements(t, key);
  assert.equal(reqs[0].state, "active", "requirement NOT satisfied without proof");

  const evidence = await readEvidence(t, key);
  assert.equal(evidence.length, 0, "no evidence rows seeded");
});

test("N7 replay applyDecision: second apply with same requestId returns ok:false, wakeEvents has exactly one decision row", async () => {
  const t = convexTest(schema, modules);
  const key = "obj_n7_replay";
  const reqKey = "req_n7";
  const requirement = makeRequirement(key, reqKey);
  await seedObjective(t, key);
  await seedContractRequirementBudget(t, key, requirement);

  await beginDecision(t, key, reqKey);
  const obj1 = await readObjective(t, key);
  const pending = obj1.management.pendingDecision as { requestId: string };
  const requestId = pending.requestId;

  const optionId = computeOptionId(reqKey, 1, ["public_information_research"]);
  const rawStrategyProposal = { strategy: "MAKE", desiredCapabilities: ["public_information_research"], needsExternalResourceClass: null, notes: null };
  const rawRecommendation = { requirementKey: reqKey, contractRevision: 1, selectedOptionId: optionId, rationale: "test", materialAssumptions: [], changeMyMindEvidence: [] };

  // First apply
  await invokeApplyDecision(t, {
    objectiveKey: key,
    requestId,
    rawStrategyProposal,
    rawRecommendation,
    at: now,
  });

  // Second apply with same requestId
  const result2 = await invokeApplyDecision(t, {
    objectiveKey: key,
    requestId,
    rawStrategyProposal,
    rawRecommendation,
    at: now,
  }) as { ok: boolean; reason?: string };

  assert.equal(result2.ok, false, "second applyDecision returns ok:false");
  assert.ok(result2.reason?.includes("no matching pending decision reservation"), `reason mentions no pending reservation: ${result2.reason}`);

  const wakes = await readWakes(t, key);
  const decisionWakes = wakes.filter((w) => w.dedupeKey.startsWith(`decision:${key}:`));
  assert.equal(decisionWakes.length, 1, "wakeEvents has exactly ONE decision wake row");
});

test("N8 ungoverned capability proposal: MAKE with only ungoverned capabilities yields refusal", async () => {
  const t = convexTest(schema, modules);
  const key = "obj_n8_ungoverned";
  const reqKey = "req_n8";
  const requirement = makeRequirement(key, reqKey);
  await seedObjective(t, key);
  await seedContractRequirementBudget(t, key, requirement);

  await beginDecision(t, key, reqKey);
  const obj1 = await readObjective(t, key);
  const pending = obj1.management.pendingDecision as { requestId: string };

  const applyResult = await invokeApplyDecision(t, {
    objectiveKey: key,
    requestId: pending.requestId,
    rawStrategyProposal: {
      strategy: "MAKE",
      desiredCapabilities: ["launch_a_rocket"],
      needsExternalResourceClass: null,
      notes: null,
    },
    rawRecommendation: {
      requirementKey: reqKey,
      contractRevision: 1,
      selectedOptionId: "opt_fake",
      rationale: "test ungoverned capability",
      materialAssumptions: [],
      changeMyMindEvidence: [],
    },
    at: now,
  }) as { ok: boolean; authorized?: boolean };

  assert.equal(applyResult.ok, true, "applyDecision returns ok:true");
  assert.equal(applyResult.authorized, false, "decision NOT authorized");

  const decisions = await readDecisions(t, key);
  assert.ok(decisions.length > 0, "decision row persisted");
  assert.equal((decisions[0].authorization as any).kind, "refused", "authorization kind is refused");

  const assignments = await readAssignments(t, key);
  assert.equal(assignments.length, 0, "no assignment row created");

  const intents = await readIntents(t, key);
  assert.equal(intents.length, 0, "no intent row created");
});

test("N9 decision ceiling: decisionRefusalAttempts at ceiling prevents new reservation", async () => {
  const t = convexTest(schema, modules);
  const key = "obj_n9_ceiling";
  const reqKey = "req_n9";
  const requirement = makeRequirement(key, reqKey);
  await seedObjective(t, key);
  await seedContractRequirementBudget(
    t,
    key,
    requirement,
    1,
    {},
    { [reqKey]: BEGIN_DECISION_CEILING },
  );

  await invokeRunManagementPass(t, { objectiveKey: key, reason: "objective_submitted" });

  const obj = await readObjective(t, key);
  assert.equal(obj.management.pendingDecision, null, "pendingDecision NOT created at ceiling");

  const refusals = obj.management.decisionRefusalAttempts as Record<string, number>;
  assert.equal(refusals[reqKey], BEGIN_DECISION_CEILING, "decisionRefusalAttempts unchanged");
});

test("N10 decision retry after refusal: after BUY refusal with eligible options, reducer routes to decide_requirement and allows retry", async () => {
  const t = convexTest(schema, modules);
  const key = "obj_n10_retry";
  const reqKey = "req_n10";

  // Seed semantic requirement (strategy: null, proofs: [])
  const contract = contractFor(key);
  const semanticReq = buildSemanticRequirement({
    objectiveKey: key,
    contract,
    proposed: cp2ParsedRequirement({
      requirementKey: reqKey,
      priority: "required",
      title: "Research X narrative trends",
      mustBeTrue: "twitter data supports the claim",
      scope: "external data",
    }),
    at: now,
  });
  if ("errors" in semanticReq) throw new Error(semanticReq.errors.join("; "));

  await seedObjective(t, key);
  await seedContractRequirementBudget(t, key, semanticReq.requirement);

  // BEGIN + APPLY with BUY strategy, select non-existent option → refusal
  await beginDecision(t, key, reqKey);
  const obj1 = await readObjective(t, key);
  const pending1 = obj1.management.pendingDecision as { requestId: string };

  await invokeApplyDecision(t, {
    objectiveKey: key,
    requestId: pending1.requestId,
    rawStrategyProposal: {
      strategy: "BUY",
      desiredCapabilities: [],
      needsExternalResourceClass: "proprietary_data",
      notes: null,
    },
    rawRecommendation: {
      requirementKey: reqKey,
      contractRevision: 1,
      selectedOptionId: "opt_fake",
      rationale: "test BUY with wrong option",
      materialAssumptions: [],
      changeMyMindEvidence: [],
    },
    at: now,
  });

  // First pass after refusal → reducer sees eligible options exist → routes to decide_requirement
  const outcome1 = await invokeRunManagementPass(t, { objectiveKey: key, reason: "decision_applied" });
  assert.equal(outcome1.objectiveState, "executing", "state is executing (needs decision)");
  assert.equal(outcome1.acted, true, "pass acted");

  // Verify: pendingDecision was reserved for retry (attempt 2)
  const obj2 = await readObjective(t, key);
  const pending2 = obj2.management.pendingDecision as { requestId: string; attempts: number } | null;
  assert.ok(pending2, "pendingDecision reserved for retry");
  assert.equal(pending2.attempts, 2, "decision attempt counter incremented");

  // Verify: decisionAttempts shows 2 attempts
  const attempts = obj2.management.decisionAttempts as Record<string, number>;
  assert.equal(attempts[reqKey], 2, "decisionAttempts incremented to 2");

  // Verify: no timer scheduled (state is not waiting/blocked)
  const wakes = await readWakes(t, key);
  const timerWakes = wakes.filter((w) => w.dedupeKey.startsWith("timer:"));
  assert.equal(timerWakes.length, 0, "no timer wakes scheduled (reducer routes to decide, not waiting)");

  // Verify: can retry with correct option
  const decisions = await readDecisions(t, key);
  const decision = decisions[0] as any;
  const parsed = JSON.parse(decision.coarsePlanSummary);
  const eligibleOptionId = parsed.extra.options[0].optionId;

  const applyResult2 = await invokeApplyDecision(t, {
    objectiveKey: key,
    requestId: pending2.requestId,
    rawStrategyProposal: {
      strategy: "BUY",
      desiredCapabilities: [],
      needsExternalResourceClass: "proprietary_data",
      notes: null,
    },
    rawRecommendation: {
      requirementKey: reqKey,
      contractRevision: 1,
      selectedOptionId: eligibleOptionId,
      rationale: "retry with correct option",
      materialAssumptions: [],
      changeMyMindEvidence: [],
    },
    at: now,
  }) as { ok: boolean; authorized?: boolean };

  // Note: This will still fail authorization because BUY requires a founder grant,
  // but the point is that the retry mechanism works
  assert.equal(applyResult2.ok, true, "retry applyDecision succeeded");
  assert.equal(applyResult2.authorized, false, "still not authorized (no grant)");
});
