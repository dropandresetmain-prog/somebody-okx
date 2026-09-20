"use strict";

// CP-4 decision chain tests: BEGIN (runDecisionPass) → APPLY (applyDecision)
//
// The decision pass is split into a durable three-step chain mirroring the
// interpretation chain: BEGIN reserves a cursor and schedules the action,
// APPLY reloads fresh truth, re-runs the kernel, persists, and wakes the loop.
// These tests drive the shipped adapter ports on real storage.

import test, { mock, after as afterAll } from "node:test";
import assert from "node:assert/strict";
import { convexTest } from "convex-test";
import schema from "../convex/schema";
import {
  initBudget,
  putContract,
  putRequirement,
} from "../convex/internal/workforce";
import { buildConvexManagementPorts, applyDecision, BEGIN_DECISION_CEILING } from "../convex/management";
import { buildOutcomeContract, buildRequirement } from "../lib/management/contract";
import { optionIdFor } from "../lib/management/options";
import type { OutcomeContract, Requirement, GraphState } from "../lib/management/types";

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

// Scheduled work is armed, never fired: this file asserts cursors and rows.
mock.timers.enable({ apis: ["setTimeout"] });
afterAll(() => mock.timers.reset());

const now = 1950000000000;

type Backend = ReturnType<typeof convexTest>;

// Loose ctx.db cast — the convex-test query ctx types do not carry our schema's
// named indexes (same pattern managementCompletionGate.test.ts uses).
type LooseDb = {
  query(name: string): {
    withIndex(name: string, f: (q: { eq: (k: string, v: unknown) => unknown }) => unknown): {
      unique(): Promise<Record<string, unknown> | null>;
      collect(): Promise<Array<Record<string, unknown>>>;
    };
  };
};
const looseDb = (ctx: { db: unknown }): LooseDb => ctx.db as LooseDb;


function contractFor(objectiveKey: string, revision = 1): OutcomeContract {
  const built = buildOutcomeContract({
    objectiveKey,
    contractId: `contract_${objectiveKey}`,
    revision,
    parsed: {
      intent: "prove the decision chain works",
      levels: [{ levelKey: "goal", order: 1, statement: "the goal holds", label: "Goal" }],
      minimumCompletionBar: "goal",
      ambiguities: [],
    },
    requestId: "decision_chain_test",
    founderResolvedQuestions: [],
    at: now,
  });
  assert.equal(built.ok, true);
  if (!built.ok) throw new Error("contract fixture invalid");
  return built.contract;
}

function makeRequirement(
  objectiveKey: string,
  requirementKey: string,
  strategy: "MAKE" | "BUY" | null = "MAKE",
  artifactKeyForInternalProof: string | null = null,
): Requirement {
  const built = buildRequirement(
    {
      objectiveKey,
      contract: contractFor(objectiveKey),
      proposed: {
        requirementKey,
        priority: "required",
        title: "A decision test requirement",
        mustBeTrue: "the decision chain authorizes correctly",
        scope: "one governed decision",
      },
      artifactKeyForInternalProof,
      at: now,
    },
    strategy,
  );
  assert.ok(!("errors" in built));
  return "requirement" in built ? built.requirement : (() => { throw new Error(); })();
}

async function seed(
  t: Backend,
  key: string,
  requirement: Requirement,
  decisionAttempts: Record<string, number> = {},
  revision = 1,
) {
  await t.mutation(async (ctx) => {
    await ctx.db.insert("objectives", {
      key,
      data: {
        key,
        request: "prove the decision chain works",
        createdAt: now,
        updatedAt: now,
        state: "executing",
        activity: "managed",
        plan: null,
        workItems: [],
        run: null,
        result: null,
        management: {
          contractId: `contract_${key}`,
          currentContractRevision: revision,
          controlNotes: [],
          pendingDecision: null,
          decisionAttempts,
        },
      } as never,
    });
  });
  await t.mutation(async (ctx) =>
    (putContract as unknown as { _handler: (c: unknown, a: Record<string, unknown>) => Promise<unknown> })._handler(ctx, {
      objectiveKey: key,
      contractId: `contract_${key}`,
      revision,
      data: contractFor(key, revision),
    }),
  );
  await t.mutation(async (ctx) =>
    (putRequirement as unknown as { _handler: (c: unknown, a: Record<string, unknown>) => Promise<unknown> })._handler(ctx, {
      objectiveKey: key,
      requirementKey: requirement.requirementKey,
      data: requirement,
      currentContractRevision: revision,
    }),
  );
  await t.mutation(async (ctx) =>
    (initBudget as unknown as { _handler: (c: unknown, a: Record<string, unknown>) => Promise<unknown> })._handler(ctx, {
      objectiveKey: key,
      at: now,
    }),
  );
}

async function readObjective(t: Backend, key: string) {
  return t.query(async (ctx) => {
    const row = (await looseDb(ctx)
      .query("objectives")
      .withIndex("by_key", (q) => q.eq("key", key))
      .unique()) as { data: Record<string, unknown> } | null;
    return row ? row.data : null;
  });
}

async function readManagerialDecisions(t: Backend, key: string) {
  return t.query(async (ctx) => {
    const rows = await looseDb(ctx)
      .query("managerialDecisions")
      .withIndex("by_objectiveKey", (q) => q.eq("objectiveKey", key))
      .collect();
    return rows.map((row) => (row as { data: Record<string, unknown> }).data);
  });
}

async function readWakeEvents(t: Backend, key: string) {
  return t.query(async (ctx) => {
    const rows = await looseDb(ctx)
      .query("wakeEvents")
      .withIndex("by_objective", (q) => q.eq("objectiveKey", key))
      .collect();
    return rows.map((row) => ({
      dedupeKey: (row as { dedupeKey: string }).dedupeKey,
      data: (row as { data: Record<string, unknown> }).data,
    }));
  });
}

async function readObjectiveEvents(t: Backend, key: string) {
  return t.query(async (ctx) => {
    const rows = await looseDb(ctx)
      .query("objectiveEvents")
      .withIndex("by_objectiveKey", (q) => q.eq("objectiveKey", key))
      .collect();
    return rows.map((row) => (row as { data: Record<string, unknown> }).data);
  });
}

async function readRequirements(t: Backend, key: string) {
  return t.query(async (ctx) => {
    const rows = await looseDb(ctx)
      .query("requirements")
      .withIndex("by_objectiveKey", (q) => q.eq("objectiveKey", key))
      .collect();
    return rows.map((row) => (row as { data: Requirement }).data);
  });
}

// ── Test 1: BEGIN reserves ───────────────────────────────────────────────────

test("1. BEGIN reserves: runDecisionPass creates pendingDecision cursor and increments decisionAttempts", async () => {
  const t = convexTest(schema, modules);
  const key = "obj_begin_reserves";
  const reqKey = "req_begin";
  const requirement = makeRequirement(key, reqKey, "MAKE", "launch_page");
  await seed(t, key, requirement);

  const state: GraphState = {
    objectiveKey: key,
    focusRequirementKey: reqKey,
    contractRevision: 1,
    managerDecisionId: null,
    pendingIntentId: null,
    wakeReason: null,
    wakeEventIds: [],
    continuation: {},
    lastNode: null,
    pass: 1,
  };

  const result = await t.mutation(async (ctx) => {
    const ports = buildConvexManagementPorts(ctx as never);
    return ports.runDecisionPass(state, ports, now);
  });

  assert.equal(result, null, "BEGIN returns null (no authority granted)");

  const objData = await readObjective(t, key);
  assert.ok(objData, "objective row exists");
  const mgmt = objData!.management as Record<string, unknown>;
  const pending = mgmt.pendingDecision as {
    requestId: string;
    requirementKey: string;
    contractRevision: number;
    attempts: number;
  };
  assert.ok(pending, "pendingDecision cursor exists");
  assert.equal(pending.requirementKey, reqKey);
  assert.equal(pending.contractRevision, 1);
  assert.equal(pending.attempts, 1);
  assert.equal(pending.requestId, `decide_${key}_${reqKey}_r1_a1`);

  const attempts = mgmt.decisionAttempts as Record<string, number>;
  assert.equal(attempts[reqKey], 1, "decisionAttempts incremented");

  const decisions = await readManagerialDecisions(t, key);
  assert.equal(decisions.length, 0, "NO managerialDecisions row written");
});

// ── Test 2: BEGIN idempotent ─────────────────────────────────────────────────

test("2. BEGIN idempotent: second call returns null and does not change pendingDecision or decisionAttempts", async () => {
  const t = convexTest(schema, modules);
  const key = "obj_begin_idempotent";
  const reqKey = "req_idem";
  const requirement = makeRequirement(key, reqKey, "MAKE", "launch_page");
  await seed(t, key, requirement);

  const state: GraphState = {
    objectiveKey: key,
    focusRequirementKey: reqKey,
    contractRevision: 1,
    managerDecisionId: null,
    pendingIntentId: null,
    wakeReason: null,
    wakeEventIds: [],
    continuation: {},
    lastNode: null,
    pass: 1,
  };

  await t.mutation(async (ctx) => {
    const ports = buildConvexManagementPorts(ctx as never);
    return ports.runDecisionPass(state, ports, now);
  });

  const objData1 = await readObjective(t, key);
  const mgmt1 = objData1!.management as Record<string, unknown>;
  const pending1 = mgmt1.pendingDecision;
  const attempts1 = (mgmt1.decisionAttempts as Record<string, number>)[reqKey];

  const result2 = await t.mutation(async (ctx) => {
    const ports = buildConvexManagementPorts(ctx as never);
    return ports.runDecisionPass(state, ports, now);
  });

  assert.equal(result2, null, "second BEGIN returns null");

  const objData2 = await readObjective(t, key);
  const mgmt2 = objData2!.management as Record<string, unknown>;
  const pending2 = mgmt2.pendingDecision;
  const attempts2 = (mgmt2.decisionAttempts as Record<string, number>)[reqKey];

  assert.deepEqual(pending2, pending1, "pendingDecision unchanged");
  assert.equal(attempts2, attempts1, "decisionAttempts unchanged");
});

// ── Test 3: BEGIN ceiling ────────────────────────────────────────────────────

test("3. BEGIN ceiling: runDecisionPass refuses to schedule when decisionAttempts >= ceiling", async () => {
  const t = convexTest(schema, modules);
  const key = "obj_begin_ceiling";
  const reqKey = "req_ceiling";
  const requirement = makeRequirement(key, reqKey, "MAKE", "launch_page");
  await seed(t, key, requirement, { [reqKey]: BEGIN_DECISION_CEILING });

  const state: GraphState = {
    objectiveKey: key,
    focusRequirementKey: reqKey,
    contractRevision: 1,
    managerDecisionId: null,
    pendingIntentId: null,
    wakeReason: null,
    wakeEventIds: [],
    continuation: {},
    lastNode: null,
    pass: 1,
  };

  const result = await t.mutation(async (ctx) => {
    const ports = buildConvexManagementPorts(ctx as never);
    return ports.runDecisionPass(state, ports, now);
  });

  assert.equal(result, null, "BEGIN returns null at ceiling");

  const objData = await readObjective(t, key);
  const mgmt = objData!.management as Record<string, unknown>;
  const pending = mgmt.pendingDecision;
  assert.equal(pending, null, "pendingDecision NOT created at ceiling");

  const attempts = mgmt.decisionAttempts as Record<string, number>;
  assert.equal(attempts[reqKey], BEGIN_DECISION_CEILING, "decisionAttempts unchanged");
});

// ── Test 4: APPLY happy path MAKE ────────────────────────────────────────────

test("4. APPLY happy path MAKE: begin + applyDecision authorizes and persists decision", async () => {
  const t = convexTest(schema, modules);
  const key = "obj_apply_happy";
  const reqKey = "req_happy";
  const requirement = makeRequirement(key, reqKey, "MAKE", "launch_page");
  await seed(t, key, requirement);

  const state: GraphState = {
    objectiveKey: key,
    focusRequirementKey: reqKey,
    contractRevision: 1,
    managerDecisionId: null,
    pendingIntentId: null,
    wakeReason: null,
    wakeEventIds: [],
    continuation: {},
    lastNode: null,
    pass: 1,
  };

  await t.mutation(async (ctx) => {
    const ports = buildConvexManagementPorts(ctx as never);
    return ports.runDecisionPass(state, ports, now);
  });

  const objData = await readObjective(t, key);
  const mgmt = objData!.management as Record<string, unknown>;
  const pending = mgmt.pendingDecision as { requestId: string };
  const requestId = pending.requestId;

  // Compute the expected optionId for MAKE internal option
  const capabilityKeys = ["growth_launch_operations"];
  const sortedKeys = [...new Set(capabilityKeys)].sort();
  const target = `internal:${sortedKeys.join("+")}:new`;
  const expectedOptionId = optionIdFor({
    requirementKey: reqKey,
    contractRevision: 1,
    kind: "internal",
    target,
  });

  const rawStrategyProposal = {
    strategy: "MAKE",
    desiredCapabilities: capabilityKeys,
    needsExternalResourceClass: null,
    notes: null,
  };

  const rawRecommendation = {
    requirementKey: reqKey,
    contractRevision: 1,
    selectedOptionId: expectedOptionId,
    rationale: "test MAKE authorization",
    materialAssumptions: [],
    changeMyMindEvidence: [],
  };

  const result = await t.mutation(async (ctx) =>
    (applyDecision as unknown as { _handler: (c: unknown, a: Record<string, unknown>) => Promise<unknown> })._handler(ctx, {
      objectiveKey: key,
      requestId,
      rawStrategyProposal,
      rawRecommendation,
      at: now,
    }),
  );

  const verdict = result as { ok: boolean; decisionId?: string; authorized?: boolean; strategy?: string | null; reason?: string };
  assert.equal(verdict.ok, true, "APPLY returns ok:true");
  assert.equal(verdict.authorized, true, "decision authorized");
  assert.equal(verdict.strategy, "MAKE");

  const expectedDecisionId = `dec_${key}_${reqKey}_r1_a1`;
  assert.equal(verdict.decisionId, expectedDecisionId);

  const decisions = await readManagerialDecisions(t, key);
  assert.equal(decisions.length, 1, "one managerialDecisions row");
  const decision = decisions[0];
  assert.equal(decision.decisionId, expectedDecisionId);
  assert.equal((decision.authorization as { kind: string }).kind, "authorized");

  const [storedReq] = await readRequirements(t, key);
  assert.ok(storedReq, "requirement row exists");
  assert.equal(storedReq.requirementKey, reqKey);

  const objData2 = await readObjective(t, key);
  const mgmt2 = objData2!.management as Record<string, unknown>;
  assert.equal(mgmt2.pendingDecision, null, "pendingDecision cleared");

  const attempts2 = mgmt2.decisionAttempts as Record<string, number>;
  assert.equal(attempts2[reqKey], 1, "decisionAttempts retained after authorization");

  const wakes = await readWakeEvents(t, key);
  const decisionWake = wakes.find((w) => w.dedupeKey === `decision:${key}:${expectedDecisionId}`);
  assert.ok(decisionWake, "decision wake exists");
  assert.equal(decisionWake.data.reason, "decision_applied");

  const events = await readObjectiveEvents(t, key);
  const decisionEvent = events.find((e) => e.kind === "decision");
  assert.ok(decisionEvent, "objectiveEvents decision row exists");
});

// ── Test 5: APPLY stale requestId ────────────────────────────────────────────

test("5. APPLY stale requestId: applyDecision with wrong requestId returns ok:false and leaves pendingDecision", async () => {
  const t = convexTest(schema, modules);
  const key = "obj_apply_stale_id";
  const reqKey = "req_stale_id";
  const requirement = makeRequirement(key, reqKey, "MAKE", "launch_page");
  await seed(t, key, requirement);

  const state: GraphState = {
    objectiveKey: key,
    focusRequirementKey: reqKey,
    contractRevision: 1,
    managerDecisionId: null,
    pendingIntentId: null,
    wakeReason: null,
    wakeEventIds: [],
    continuation: {},
    lastNode: null,
    pass: 1,
  };

  await t.mutation(async (ctx) => {
    const ports = buildConvexManagementPorts(ctx as never);
    return ports.runDecisionPass(state, ports, now);
  });

  const result = await t.mutation(async (ctx) =>
    (applyDecision as unknown as { _handler: (c: unknown, a: Record<string, unknown>) => Promise<unknown> })._handler(ctx, {
      objectiveKey: key,
      requestId: "decide_wrong",
      rawStrategyProposal: { strategy: "MAKE", desiredCapabilities: ["growth_launch_operations"], needsExternalResourceClass: null, notes: null },
      rawRecommendation: { requirementKey: reqKey, contractRevision: 1, selectedOptionId: "opt_fake", rationale: "test", materialAssumptions: [], changeMyMindEvidence: [] },
      at: now,
    }),
  );

  const verdict = result as { ok: boolean; reason?: string };
  assert.equal(verdict.ok, false, "APPLY returns ok:false");
  assert.ok(verdict.reason?.includes("no matching pending decision reservation"), "reason mentions stale reservation");

  const objData = await readObjective(t, key);
  const mgmt = objData!.management as Record<string, unknown>;
  assert.ok(mgmt.pendingDecision, "pendingDecision STILL reserved");

  const decisions = await readManagerialDecisions(t, key);
  assert.equal(decisions.length, 0, "no managerialDecisions row");
});

// ── Test 6: APPLY stale revision ─────────────────────────────────────────────

test("6. APPLY stale revision: applyDecision after contract revision moves returns ok:false and clears pendingDecision", async () => {
  const t = convexTest(schema, modules);
  const key = "obj_apply_stale_rev";
  const reqKey = "req_stale_rev";
  const requirement = makeRequirement(key, reqKey, "MAKE", "launch_page");
  await seed(t, key, requirement, {}, 1);

  const state: GraphState = {
    objectiveKey: key,
    focusRequirementKey: reqKey,
    contractRevision: 1,
    managerDecisionId: null,
    pendingIntentId: null,
    wakeReason: null,
    wakeEventIds: [],
    continuation: {},
    lastNode: null,
    pass: 1,
  };

  await t.mutation(async (ctx) => {
    const ports = buildConvexManagementPorts(ctx as never);
    return ports.runDecisionPass(state, ports, now);
  });

  // Move contract to revision 2
  await t.mutation(async (ctx) =>
    (putContract as unknown as { _handler: (c: unknown, a: Record<string, unknown>) => Promise<unknown> })._handler(ctx, {
      objectiveKey: key,
      contractId: `contract_${key}`,
      revision: 2,
      data: contractFor(key, 2),
    }),
  );

  const objData1 = await readObjective(t, key);
  const mgmt1 = objData1!.management as Record<string, unknown>;
  const pending1 = mgmt1.pendingDecision as { requestId: string };

  const result = await t.mutation(async (ctx) =>
    (applyDecision as unknown as { _handler: (c: unknown, a: Record<string, unknown>) => Promise<unknown> })._handler(ctx, {
      objectiveKey: key,
      requestId: pending1.requestId,
      rawStrategyProposal: { strategy: "MAKE", desiredCapabilities: ["growth_launch_operations"], needsExternalResourceClass: null, notes: null },
      rawRecommendation: { requirementKey: reqKey, contractRevision: 1, selectedOptionId: "opt_fake", rationale: "test", materialAssumptions: [], changeMyMindEvidence: [] },
      at: now,
    }),
  );

  const verdict = result as { ok: boolean; reason?: string };
  assert.equal(verdict.ok, false, "APPLY returns ok:false");
  assert.ok(verdict.reason?.toLowerCase().includes("stale"), "reason mentions stale");

  const objData2 = await readObjective(t, key);
  const mgmt2 = objData2!.management as Record<string, unknown>;
  assert.equal(mgmt2.pendingDecision, null, "pendingDecision cleared");

  const decisions = await readManagerialDecisions(t, key);
  const r1Decisions = decisions.filter((d) => (d.decisionId as string).includes("_r1_"));
  assert.equal(r1Decisions.length, 0, "no decision row for r1");
});

// ── Test 7: APPLY garbage proposal fail-closed ───────────────────────────────

test("7. APPLY garbage proposal fail-closed: null rawStrategyProposal returns ok:false and persists refusal", async () => {
  const t = convexTest(schema, modules);
  const key = "obj_apply_garbage";
  const reqKey = "req_garbage";
  const requirement = makeRequirement(key, reqKey, "MAKE", "launch_page");
  await seed(t, key, requirement);

  const state: GraphState = {
    objectiveKey: key,
    focusRequirementKey: reqKey,
    contractRevision: 1,
    managerDecisionId: null,
    pendingIntentId: null,
    wakeReason: null,
    wakeEventIds: [],
    continuation: {},
    lastNode: null,
    pass: 1,
  };

  await t.mutation(async (ctx) => {
    const ports = buildConvexManagementPorts(ctx as never);
    return ports.runDecisionPass(state, ports, now);
  });

  const objData = await readObjective(t, key);
  const mgmt = objData!.management as Record<string, unknown>;
  const pending = mgmt.pendingDecision as { requestId: string };

  const result = await t.mutation(async (ctx) =>
    (applyDecision as unknown as { _handler: (c: unknown, a: Record<string, unknown>) => Promise<unknown> })._handler(ctx, {
      objectiveKey: key,
      requestId: pending.requestId,
      rawStrategyProposal: null,
      rawRecommendation: { requirementKey: reqKey, contractRevision: 1, selectedOptionId: "opt_fake", rationale: "test", materialAssumptions: [], changeMyMindEvidence: [] },
      at: now,
    }),
  );

  const verdict = result as { ok: boolean; reason?: string };
  assert.equal(verdict.ok, false, "APPLY returns ok:false");
  assert.ok(verdict.reason && verdict.reason.length > 0, "reason non-empty");

  const objData2 = await readObjective(t, key);
  const mgmt2 = objData2!.management as Record<string, unknown>;
  assert.equal(mgmt2.pendingDecision, null, "pendingDecision cleared");

  const events = await readObjectiveEvents(t, key);
  const refusalEvent = events.find((e) => e.kind === "decision" && String(e.text ?? "").includes("refused"));
  assert.ok(refusalEvent, "objectiveEvents refusal row exists");

  const decisions = await readManagerialDecisions(t, key);
  const authorized = decisions.filter((d) => (d.authorization as { kind: string }).kind === "authorized");
  assert.equal(authorized.length, 0, "NO authorized decision row");
});

// ── Test 8: APPLY hallucinated option fail-closed ────────────────────────────

test("8. APPLY hallucinated option fail-closed: invalid optionId returns ok:true, authorized:false, persists refused decision", async () => {
  const t = convexTest(schema, modules);
  const key = "obj_apply_hallucinated";
  const reqKey = "req_hallucinated";
  const requirement = makeRequirement(key, reqKey, "MAKE", "launch_page");
  await seed(t, key, requirement);

  const state: GraphState = {
    objectiveKey: key,
    focusRequirementKey: reqKey,
    contractRevision: 1,
    managerDecisionId: null,
    pendingIntentId: null,
    wakeReason: null,
    wakeEventIds: [],
    continuation: {},
    lastNode: null,
    pass: 1,
  };

  await t.mutation(async (ctx) => {
    const ports = buildConvexManagementPorts(ctx as never);
    return ports.runDecisionPass(state, ports, now);
  });

  const objData = await readObjective(t, key);
  const mgmt = objData!.management as Record<string, unknown>;
  const pending = mgmt.pendingDecision as { requestId: string };

  const result = await t.mutation(async (ctx) =>
    (applyDecision as unknown as { _handler: (c: unknown, a: Record<string, unknown>) => Promise<unknown> })._handler(ctx, {
      objectiveKey: key,
      requestId: pending.requestId,
      rawStrategyProposal: { strategy: "MAKE", desiredCapabilities: ["growth_launch_operations"], needsExternalResourceClass: null, notes: null },
      rawRecommendation: {
        requirementKey: reqKey,
        contractRevision: 1,
        selectedOptionId: "opt_nonexistent",
        rationale: "test hallucinated option",
        materialAssumptions: [],
        changeMyMindEvidence: [],
      },
      at: now,
    }),
  );

  const verdict = result as { ok: boolean; authorized?: boolean };
  assert.equal(verdict.ok, true, "APPLY returns ok:true");
  assert.equal(verdict.authorized, false, "decision NOT authorized");

  const [storedReq] = await readRequirements(t, key);
  assert.ok(storedReq, "requirement row exists");
  assert.equal(storedReq.strategy, "MAKE", "requirement strategy unchanged");
  assert.deepEqual(storedReq.proofs, requirement.proofs, "requirement proofs unchanged");

  const objData2 = await readObjective(t, key);
  const mgmt2 = objData2!.management as Record<string, unknown>;
  assert.equal(mgmt2.pendingDecision, null, "pendingDecision cleared");

  const attempts2 = mgmt2.decisionAttempts as Record<string, number>;
  assert.equal(attempts2[reqKey], 1, "decisionAttempts retains req (refusal does NOT reset)");

  const decisions = await readManagerialDecisions(t, key);
  assert.equal(decisions.length, 1, "one decision row persisted");
  const decision = decisions[0];
  assert.equal((decision.authorization as { kind: string }).kind, "refused", "decision authorization kind is refused");
});

// ── Test 9: APPLY replay idempotence ─────────────────────────────────────────

test("9. APPLY replay idempotence: second applyDecision with same requestId returns ok:false and wakeEvents has exactly one row", async () => {
  const t = convexTest(schema, modules);
  const key = "obj_apply_replay";
  const reqKey = "req_replay";
  const requirement = makeRequirement(key, reqKey, "MAKE", "launch_page");
  await seed(t, key, requirement);

  const state: GraphState = {
    objectiveKey: key,
    focusRequirementKey: reqKey,
    contractRevision: 1,
    managerDecisionId: null,
    pendingIntentId: null,
    wakeReason: null,
    wakeEventIds: [],
    continuation: {},
    lastNode: null,
    pass: 1,
  };

  await t.mutation(async (ctx) => {
    const ports = buildConvexManagementPorts(ctx as never);
    return ports.runDecisionPass(state, ports, now);
  });

  const objData = await readObjective(t, key);
  const mgmt = objData!.management as Record<string, unknown>;
  const pending = mgmt.pendingDecision as { requestId: string };
  const requestId = pending.requestId;

  const capabilityKeys = ["growth_launch_operations"];
  const sortedKeys = [...new Set(capabilityKeys)].sort();
  const target = `internal:${sortedKeys.join("+")}:new`;
  const expectedOptionId = optionIdFor({
    requirementKey: reqKey,
    contractRevision: 1,
    kind: "internal",
    target,
  });

  const rawStrategyProposal = {
    strategy: "MAKE",
    desiredCapabilities: capabilityKeys,
    needsExternalResourceClass: null,
    notes: null,
  };

  const rawRecommendation = {
    requirementKey: reqKey,
    contractRevision: 1,
    selectedOptionId: expectedOptionId,
    rationale: "test MAKE authorization",
    materialAssumptions: [],
    changeMyMindEvidence: [],
  };

  // First apply
  await t.mutation(async (ctx) =>
    (applyDecision as unknown as { _handler: (c: unknown, a: Record<string, unknown>) => Promise<unknown> })._handler(ctx, {
      objectiveKey: key,
      requestId,
      rawStrategyProposal,
      rawRecommendation,
      at: now,
    }),
  );

  // Second apply with same requestId
  const result2 = await t.mutation(async (ctx) =>
    (applyDecision as unknown as { _handler: (c: unknown, a: Record<string, unknown>) => Promise<unknown> })._handler(ctx, {
      objectiveKey: key,
      requestId,
      rawStrategyProposal,
      rawRecommendation,
      at: now,
    }),
  );

  const verdict2 = result2 as { ok: boolean; reason?: string };
  assert.equal(verdict2.ok, false, "second APPLY returns ok:false");
  assert.ok(verdict2.reason?.includes("no matching pending decision reservation"), "reason mentions no pending reservation");

  const expectedDecisionId = `dec_${key}_${reqKey}_r1_a1`;
  const wakes = await readWakeEvents(t, key);
  const decisionWakes = wakes.filter((w) => w.dedupeKey === `decision:${key}:${expectedDecisionId}`);
  assert.equal(decisionWakes.length, 1, "wakeEvents has exactly ONE row with that dedupeKey");
});

// ── Test 10: Non-launch objective needs no launch artifact ───────────────────

test("10. Non-launch objective: MAKE with public_information_research capability has no launch literal in persisted data", async () => {
  const t = convexTest(schema, modules);
  const key = "obj_non_launch";
  const reqKey = "req_non_launch";
  // No artifact key for internal proof — this requirement uses application_observation proof only
  const requirement = makeRequirement(key, reqKey, "MAKE", null);
  await seed(t, key, requirement);

  const state: GraphState = {
    objectiveKey: key,
    focusRequirementKey: reqKey,
    contractRevision: 1,
    managerDecisionId: null,
    pendingIntentId: null,
    wakeReason: null,
    wakeEventIds: [],
    continuation: {},
    lastNode: null,
    pass: 1,
  };

  await t.mutation(async (ctx) => {
    const ports = buildConvexManagementPorts(ctx as never);
    return ports.runDecisionPass(state, ports, now);
  });

  const objData = await readObjective(t, key);
  const mgmt = objData!.management as Record<string, unknown>;
  const pending = mgmt.pendingDecision as { requestId: string };
  const requestId = pending.requestId;

  // Use public_information_research capability (no launch)
  const capabilityKeys = ["public_information_research"];
  const sortedKeys = [...new Set(capabilityKeys)].sort();
  const target = `internal:${sortedKeys.join("+")}:new`;
  const expectedOptionId = optionIdFor({
    requirementKey: reqKey,
    contractRevision: 1,
    kind: "internal",
    target,
  });

  const rawStrategyProposal = {
    strategy: "MAKE",
    desiredCapabilities: capabilityKeys,
    needsExternalResourceClass: null,
    notes: null,
  };

  const rawRecommendation = {
    requirementKey: reqKey,
    contractRevision: 1,
    selectedOptionId: expectedOptionId,
    rationale: "test non-launch MAKE authorization",
    materialAssumptions: [],
    changeMyMindEvidence: [],
  };

  const result = await t.mutation(async (ctx) =>
    (applyDecision as unknown as { _handler: (c: unknown, a: Record<string, unknown>) => Promise<unknown> })._handler(ctx, {
      objectiveKey: key,
      requestId,
      rawStrategyProposal,
      rawRecommendation,
      at: now,
    }),
  );

  const verdict = result as { ok: boolean; authorized?: boolean; strategy?: string | null };
  assert.equal(verdict.ok, true, "APPLY returns ok:true");
  assert.equal(verdict.authorized, true, "decision authorized");
  assert.equal(verdict.strategy, "MAKE");

  const decisions = await readManagerialDecisions(t, key);
  assert.equal(decisions.length, 1, "one decision row");
  const decisionJson = JSON.stringify(decisions[0]);
  assert.ok(!decisionJson.includes("growth_launch_operations"), "NO growth_launch_operations in decision row JSON");

  const [storedReq] = await readRequirements(t, key);
  assert.ok(storedReq, "requirement row exists");
  const reqJson = JSON.stringify(storedReq);
  assert.ok(!reqJson.includes("growth_launch_operations"), "NO growth_launch_operations in requirement JSON");

  // Verify the capability is correct by checking the coarsePlanSummary JSON
  const decision = decisions[0];
  const auth = decision.authorization as { kind: string };
  assert.equal(auth.kind, "authorized");

  // The capability keys are in the option data stored in coarsePlanSummary
  const coarsePlanSummary = decision.coarsePlanSummary as string;
  const parsed = JSON.parse(coarsePlanSummary);
  const options = parsed.extra?.options ?? [];
  const authorizedOption = options.find((opt: { optionId: string }) => opt.optionId === decision.optionId);
  assert.ok(authorizedOption, "authorized option found in options");
  assert.ok(
    authorizedOption.internal?.capabilityKeys?.includes("public_information_research"),
    "authorized with public_information_research capability"
  );
});
