// R3 A2/A3 — the dispatch seam and the wait discipline, on REAL Convex storage.
//
// These tests drive the SHIPPED ports (buildConvexManagementPorts) and the
// SHIPPED internal mutations against a mock backend: no port is reimplemented,
// and nothing is proven by calling pure kernels in sequence. The point of the
// file is the production claim R3 said was missing: "the graph decides but
// never dispatches". Each test therefore asserts what the WORLD looks like on
// the other side of one call — assignment rows, worker reservations, run rows,
// intent rows, budget counters, control notes.
//
// A2 claims proven here:
//   1. MAKE  → exactly ONE assignment + reserved worker + bounded managed run
//   2. BUY   → exactly ONE intent that stops at the M3 boundary (awaiting_m3),
//              no payment attempted, no worker spend, no run row
//   3. HYBRID → BOTH halves, from one call
//   4. a replayed wake ⇒ still exactly one of every effect row (stable identity)
//   5. a dispatch that cannot be honoured defers LOUDLY (typed note) and
//      writes nothing
// A3 claims proven here:
//   6. scheduleTimer: zero delay throws; one outstanding timer per condition;
//      re-arming after consumption gets the NEXT sequence identity
//   7. recordPassProgress: no-progress cycles persist and reach the finite
//      escalation ceiling; a material pass resets the counter
//
// Scheduling note: node's mock timers stand in for setTimeout, which is what
// convex-test's scheduler queues onto. A dispatch legitimately schedules
// minutes-out work (executeWorker now, the lease watchdog and expiry later);
// draining those chains is managementProductionLoop.test.ts's job (CP-5) —
// this file asserts the ROWS one seam writes, so timers are armed and left
// un-fired rather than left burning real event-loop time.
import test, { mock, after as afterAll } from "node:test";
import assert from "node:assert/strict";
import { convexTest } from "convex-test";
import schema from "../convex/schema";
import { internal } from "../convex/_generated/api";
import {
  putContract,
  putRequirement,
  initBudget,
  readBudget,
  timerState,
} from "../convex/internal/workforce";
import { buildConvexManagementPorts } from "../convex/management";
import { deriveRunId } from "../lib/management/dispatch";
import { buildOutcomeContract, buildRequirement } from "../lib/management/contract";
import {
  buildInternalOption,
  buildExternalOption,
  buildHybridOption,
  withEligibility,
  eligibilityInputFor,
  EMPTY_FACTS,
  type EligibilityFacts,
} from "../lib/management/options";
import { checkBudget } from "../lib/management/budget";
import type { DecisionPassResult } from "../lib/management/decision";
import type {
  Assignment,
  ExecutionIntent,
  GroundedOption,
  ManagerialDecision,
  OutcomeContract,
  Requirement,
  WorkerRecord,
} from "../lib/management/types";
import type { GraphState } from "../lib/management/types";

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

// Mock setTimeout for the whole file so minutes-out scheduled work (worker
// execution, lease expiry, engine re-checks) is ARMed but never burns real
// event-loop time. Each test asserts on the rows the seams write.
mock.timers.enable({ apis: ["setTimeout"] });
afterAll(() => mock.timers.reset());

const now = 1900000000000;
const REQ = "req_live";

function contractFor(objectiveKey: string): OutcomeContract {
  const built = buildOutcomeContract({
    objectiveKey,
    contractId: `contract_${objectiveKey}`,
    revision: 1,
    parsed: {
      intent: "make the governed thing true",
      levels: [{ levelKey: "goal", order: 1, statement: "the goal holds", label: "Goal" }],
      minimumCompletionBar: "goal",
      ambiguities: [],
    },
    requestId: "req_dispatch_test",
    founderResolvedQuestions: [],
    at: now,
  });
  assert.equal(built.ok, true);
  if (!built.ok) throw new Error("contract fixture invalid");
  return built.contract;
}

function makeRequirement(objectiveKey: string, strategy: "MAKE" | "BUY" | "HYBRID"): Requirement {
  const built = buildRequirement(
    {
      objectiveKey,
      contract: contractFor(objectiveKey),
      proposed: {
        requirementKey: REQ,
        priority: "required",
        title: "The governed result is recorded",
        mustBeTrue: "an application observation supports the statement",
        scope: "company artifact + observation",
      },
      // No artifact proof: MAKE/HYBRID still attach an application_observation
      // proof, which is what the bounded WorkContract consumes.
      artifactKeyForInternalProof: null,
      at: now,
    },
    strategy,
  );
  assert.ok(!("errors" in built), `requirement build failed: ${"errors" in built ? built.errors.join("; ") : ""}`);
  return "requirement" in built ? built.requirement : (() => { throw new Error(); })();
}

const CAPABILITIES = ["public_information_research"] as const;

const HYBRID_CAPABILITIES = ["company_records_lookup"] as const;

function internalOption(capabilities: readonly string[] = CAPABILITIES): GroundedOption {
  const built = buildInternalOption({
    requirementKey: REQ,
    contractRevision: 1,
    capabilityKeys: capabilities,
    responsibility: "record sourced observations",
    workerKey: null,
    staffingReason: "create under the worker ceiling",
    facts: EMPTY_FACTS,
  });
  assert.ok(built.option);
  return built.option;
}

const buyFacts: EligibilityFacts = {
  requiredResourceClasses: ["proprietary_data"],
  // The HYBRID's internal half must consume only controlled classes; the BUY
  // test proves external options intentionally consume classes the company
  // does NOT control, so this list covers both without weakening either.
  controlledResourceClasses: ["proprietary_data"],
  deadlineAt: null,
  now,
  estimatedMinutes: null,
  requiresMandatoryProof: false,
  proofAvailable: true,
  workerAvailable: null,
  spendAuthorityUsd: 10,
  budgetRemainingUsd: 100,
};

function buyOption(): GroundedOption {
  const option = buildExternalOption({
    requirementKey: REQ,
    contractRevision: 1,
    offeringId: "reg_offer_1",
    providerId: "prov_x",
    serviceId: "svc_x",
    resourceClass: "proprietary_data",
    priceUsd: 4,
    priceProvenance: "provider_quote",
    registryVerified: true,
    compatibleResourceClass: true,
    facts: EMPTY_FACTS,
  });
  // A monetary BUY is only eligible-shaped once a founder grant exists; the
  // AUTHORIZATION carries it (A4), and this test exercises dispatch, not the
  // grant rule (already proven in managementSpendAuthority.test.ts).
  return withEligibility([option], (o) => eligibilityInputFor(o, buyFacts))[0];
}

function authorizedDecision(
  objectiveKey: string,
  strategy: "MAKE" | "BUY" | "HYBRID",
  option: GroundedOption,
): ManagerialDecision {
  return {
    decisionId: `dec_${objectiveKey}_${strategy.toLowerCase()}`,
    objectiveKey,
    contractRevision: 1,
    requirementKey: REQ,
    kind: "satisfaction_strategy",
    strategy,
    optionId: option.optionId,
    recommendation: null,
    authorization: {
      kind: "authorized",
      decisionId: `dec_${objectiveKey}_${strategy.toLowerCase()}`,
      requirementKey: REQ,
      contractRevision: 1,
      strategy,
      optionId: option.optionId,
      authorizedAt: now,
      spendApprovalId: strategy === "MAKE" ? null : "appr_dispatch_1",
    },
    coarsePlanSummary: "authorized by the decision kernel in a prior pass",
    consideredOptionIds: [option.optionId],
    at: now,
  };
}

// The shipped writer, used the way runDecisionPass→persistDecision uses it.
async function seedAuthorized(
  t: ReturnType<typeof convexTest>,
  objectiveKey: string,
  requirement: Requirement,
  strategy: "MAKE" | "BUY" | "HYBRID",
  option: GroundedOption,
) {
  const decision = authorizedDecision(objectiveKey, strategy, option);
  const result: DecisionPassResult = {
    decision,
    boundRequirement: requirement,
    options: [option],
    recommendation: null,
    authorization: decision.authorization,
  };
  await t.mutation(async (ctx) => {
    const ports = buildConvexManagementPorts(ctx as never);
    // persistDecision writes the decision row (options encoded inside
    // coarsePlanSummary, exactly what dispatchRequirement decodes) and the
    // bound requirement, through the shipped mutation bodies.
    await ports.persistDecision(result, now);
  });
}

async function seedObjective(
  t: ReturnType<typeof convexTest>,
  objectiveKey: string,
  requirement: Requirement,
) {
  await t.mutation(async (ctx) => {
    await ctx.db.insert("objectives", {
      key: objectiveKey,
      data: {
        key: objectiveKey,
        request: "make the governed thing true",
        createdAt: now,
        updatedAt: now,
        state: "executing",
        activity: "managed",
        plan: null,
        workItems: [],
        run: null,
        result: null,
        management: { contractId: `contract_${objectiveKey}`, controlNotes: [] },
      },
    });
  });
  await t.mutation(async (ctx) =>
    (putContract as unknown as { _handler: (c: unknown, a: Record<string, unknown>) => Promise<unknown> })._handler(ctx, {
      objectiveKey,
      contractId: `contract_${objectiveKey}`,
      revision: 1,
      data: contractFor(objectiveKey),
    }),
  );
  await t.mutation(async (ctx) =>
    (putRequirement as unknown as { _handler: (c: unknown, a: Record<string, unknown>) => Promise<unknown> })._handler(ctx, {
      objectiveKey,
      requirementKey: REQ,
      data: requirement,
      currentContractRevision: 1,
    }),
  );
  await t.mutation(async (ctx) =>
    (initBudget as unknown as { _handler: (c: unknown, a: Record<string, unknown>) => Promise<unknown> })._handler(ctx, {
      objectiveKey,
      at: now,
    }),
  );
}

function passState(objectiveKey: string): GraphState {
  return {
    objectiveKey,
    contractRevision: 1,
    focusRequirementKey: REQ,
    managerDecisionId: null,
    pendingIntentId: null,
    wakeReason: "objective_submitted",
    wakeEventIds: [],
    continuation: {},
    lastNode: null,
    pass: 0,
  };
}

async function dispatch(t: ReturnType<typeof convexTest>, objectiveKey: string): Promise<string | null> {
  return t.mutation(async (ctx) => {
    const ports = buildConvexManagementPorts(ctx as never);
    return ports.dispatchRequirement(passState(objectiveKey), REQ, now);
  }) as Promise<string | null>;
}

const rows = {
  assignments: (t: ReturnType<typeof convexTest>) =>
    t.query(async (ctx) => (ctx.db as never as { query(n: string): { collect(): Promise<Array<{ data: Assignment }>> } }).query("assignments").collect()),
  intents: (t: ReturnType<typeof convexTest>) =>
    t.query(async (ctx) => (ctx.db as never as { query(n: string): { collect(): Promise<Array<{ data: ExecutionIntent }>> } }).query("executionIntents").collect()),
  workers: (t: ReturnType<typeof convexTest>) =>
    t.query(async (ctx) => (ctx.db as never as { query(n: string): { collect(): Promise<Array<{ data: WorkerRecord }>> } }).query("workers").collect()),
  objective: (t: ReturnType<typeof convexTest>, key: string) =>
    t.query(async (ctx) => {
      const db = ctx.db as unknown as {
        query(name: string): {
          withIndex(name: string, f: (q: { eq: (k: string, v: unknown) => unknown }) => unknown): {
            unique(): Promise<{ data: ObjectiveView } | null>;
          };
        };
      };
      const row = await db
        .query("objectives")
        .withIndex("by_key", (q) => q.eq("key", key))
        .unique();
      return row!;
    }),
};

type ObjectiveView = {
  state: string;
  run: { id: string; workItemId: string } | null;
  workItems: Array<{ id: string; contract: { workerKey: string; capabilityKeys: string[] } }> | null;
  management?: { controlNotes?: Array<Record<string, unknown>> };
};

const readBudgetRow = (t: ReturnType<typeof convexTest>, objectiveKey: string) =>
  t.query(async (ctx) =>
    (readBudget as unknown as { _handler: (c: unknown, a: Record<string, unknown>) => Promise<unknown> })._handler(ctx, { objectiveKey }),
  ) as Promise<{ used: Record<string, number> & { attemptsByRequirement: Record<string, number> } } | null>;

// ── A2-1 + A2-4: MAKE dispatch creates ONE assignment + reservation + run; a
// replayed wake creates nothing new ──────────────────────────────────────────

test("A2 MAKE: dispatchRequirement creates exactly one assignment, one reserved worker, one managed run — and a replayed wake adds nothing", async () => {
  const t = convexTest(schema, modules);
  const key = "obj_disp_make";
  const requirement = makeRequirement(key, "MAKE");
  await seedObjective(t, key, requirement);
  await seedAuthorized(t, key, requirement, "MAKE", internalOption());

  const effectId = await dispatch(t, key);
  assert.ok(effectId, "the dispatch returned an effect id");

  const assignments = await rows.assignments(t);
  assert.equal(assignments.length, 1, "one assignment row");
  const assignment = assignments[0].data;
  assert.equal(assignment.assignmentId, effectId);
  assert.equal(assignment.requirementKey, REQ);
  assert.equal(assignment.decisionId, `dec_${key}_make`, "the effect names the AUTHORIZED decision");
  assert.equal(assignment.state, "running", "the run started, so 'running' is the truth");
  assert.equal(assignment.attempt, 1);

  const workers = await rows.workers(t);
  assert.equal(workers.length, 1, "one worker exists");
  assert.ok(workers[0].data.reservedBy, "it is reserved");
  assert.equal(workers[0].data.reservedBy?.assignmentId, effectId);
  assert.deepEqual(workers[0].data.capabilityKeys, [...CAPABILITIES], "created under the option's envelope only");

  const objective = await rows.objective(t, key);
  assert.ok(objective.data.run, "a run row was written");
  assert.equal(objective.data.run?.id, deriveRunId(effectId!), "deterministic run identity derived from the assignment");
  assert.equal(objective.data.workItems?.length, 1);
  assert.equal(objective.data.workItems?.[0].id, `wi:${effectId}`);

  const budget = await readBudgetRow(t, key);
  assert.equal(budget?.used.workersCreated, 1);
  assert.equal(budget?.used.activeAssignments, 1);
  assert.equal(budget?.used.attemptsByRequirement[REQ], 1);

  // ── replay: two more wakes arrive, the world must NOT gain anything ──────
  const again1 = await dispatch(t, key);
  const again2 = await dispatch(t, key);
  assert.equal(again1, effectId, "replay reports the SAME effect");
  assert.equal(again2, effectId);
  assert.equal((await rows.assignments(t)).length, 1, "still one assignment");
  assert.equal((await rows.workers(t)).length, 1, "still one worker");
  const after = await rows.objective(t, key);
  assert.equal(after.data.workItems?.length, 1, "no second run on the aggregate");
  const budget2 = await readBudgetRow(t, key);
  assert.equal(budget2?.used.workersCreated, 1, "replays spend no worker-creation budget");
  assert.equal(budget2?.used.attemptsByRequirement[REQ], 1, "replays spend no attempt budget");
});

// ── A2-2: BUY dispatch stops at the M3 boundary ─────────────────────────────

test("A2 BUY: dispatch persists exactly ONE intent resting AUTHORIZED at the M3 boundary — no hand-off, no payment, no run — and replays add nothing", async () => {
  const t = convexTest(schema, modules);
  const key = "obj_disp_buy";
  const requirement = makeRequirement(key, "BUY");
  await seedObjective(t, key, requirement);
  await seedAuthorized(t, key, requirement, "BUY", buyOption());

  const effectId = await dispatch(t, key);
  assert.ok(effectId);

  const intents = await rows.intents(t);
  assert.equal(intents.length, 1);
  const intent = intents[0].data;
  assert.equal(intent.intentId, effectId);
  // M6.1: production runs with external authority m3_available_bounded, so the
  // intent is born AUTHORIZED — a real current execution intent that only the
  // supervised M3 driver (or the M6.1 simulation boundary) may advance. It is
  // still truthfully not handed off here: dispatch never contacts a rail.
  assert.equal(intent.state, "authorized", "authorized execution intent; hand-off belongs to the supervised boundary, not dispatch");
  assert.equal(intent.terms.approvalId, "appr_dispatch_1", "the founder grant identity travels with it");
  assert.ok(
    /hand-off attempted by the caller/.test(intent.boundaryNote ?? ""),
    "the boundary note states truthfully that only the caller may attempt hand-off",
  );

  assert.equal((await rows.assignments(t)).length, 0, "BUY creates no internal work");
  assert.equal((await rows.workers(t)).length, 0, "BUY spends no worker budget");
  const objective = await rows.objective(t, key);
  assert.equal(objective.data.run, null, "no run row for an external effect");

  const again = await dispatch(t, key);
  assert.equal(again, effectId);
  assert.equal((await rows.intents(t)).length, 1, "replay never doubles the effect");
  const byIdem = await t.query(async (ctx) =>
    (ctx.db as never as { query(n: string): { withIndex(n: string, f: (q: { eq(k: string, v: unknown): unknown }) => unknown): { collect(): Promise<unknown[]> } } })
      .query("executionIntents")
      .withIndex("by_idempotency", (q: { eq(k: string, v: unknown): unknown }) => q.eq("idempotencyKey", intent.idempotencyKey))
      .collect(),
  );
  assert.equal(byIdem.length, 1, "one row per logical effect");
});

// ── A2-3: HYBRID delivers BOTH halves ───────────────────────────────────────

test("A2 HYBRID: one dispatch delivers assignment AND intent — a half-delivered plan is not delivery", async () => {
  const t = convexTest(schema, modules);
  const key = "obj_disp_hybrid";
  const requirement = makeRequirement(key, "HYBRID");
  await seedObjective(t, key, requirement);
  const internal = internalOption();
  const external = buyOption();
  const hybrid = withEligibility(
    [buildHybridOption({
      requirementKey: REQ,
      contractRevision: 1,
      internal: { ...internal, strategy: "HYBRID" },
      external,
      facts: EMPTY_FACTS,
    })],
    (o) => eligibilityInputFor(o, buyFacts),
  )[0];
  await seedAuthorized(t, key, requirement, "HYBRID", hybrid);

  const effectId = await dispatch(t, key);
  assert.ok(effectId);
  const assignments = await rows.assignments(t);
  const intents = await rows.intents(t);
  assert.equal(assignments.length, 1, "internal half delivered");
  assert.equal(intents.length, 1, "external half delivered");
  assert.equal(assignments[0].data.kind, "internal_component_of_hybrid");
  assert.equal(intents[0].data.strategy, "HYBRID");

  // replay
  await dispatch(t, key);
  assert.equal((await rows.assignments(t)).length, 1, "replay: still one assignment");
  assert.equal((await rows.intents(t)).length, 1, "replay: still one intent");
});

// ── A2-5: an undeliverable dispatch defers LOUDLY and writes nothing ────────

test("A2 deferral: with no authorized decision for the CURRENT revision the dispatch writes no effect and records the reason", async () => {
  const t = convexTest(schema, modules);
  const key = "obj_disp_defer";
  const requirement = makeRequirement(key, "MAKE");
  await seedObjective(t, key, requirement);
  // NO decision persisted at all.
  const effectId = await dispatch(t, key);
  assert.equal(effectId, null, "nothing was dispatched");
  assert.equal((await rows.assignments(t)).length, 0);
  assert.equal((await rows.workers(t)).length, 0);
  const objective = await rows.objective(t, key);
  const notes = objective.data.management?.controlNotes ?? [];
  assert.ok(
    notes.some((note) => note.type === "dispatch_deferred" && /no authorized decision/.test(String(note.reason))),
    `expected a typed dispatch_deferred note, got ${JSON.stringify(notes)}`,
  );
  // The budget saw none of it.
  const budget = await readBudgetRow(t, key);
  assert.equal(budget?.used.workersCreated, 0);
});

// ── A3-6: timers ────────────────────────────────────────────────────────────

test("A3 timer: zero delay throws, one outstanding timer per condition, re-arm after consumption gets the next sequence id", async () => {
  const t = convexTest(schema, modules);
  const key = "obj_timer";
  await seedObjective(t, key, makeRequirement(key, "MAKE"));

  const arm = (delayMs: number, at: number) =>
    t.mutation(async (ctx) =>
      buildConvexManagementPorts(ctx as never).scheduleTimer(key, "timeout", delayMs, "waiting:x", at),
    );

  // zero delay is structurally impossible
  await assert.rejects(arm(0, now), /non-zero/);

  const first = await arm(900_000, now);
  assert.equal(first, true, "armed");
  const second = await arm(900_000, now + 5);
  assert.equal(second, false, "at most ONE outstanding timer per logical condition");

  const state1 = await t.query(async (ctx) =>
    (timerState as unknown as { _handler: (c: unknown, a: Record<string, unknown>) => Promise<unknown> })._handler(ctx, { objectiveKey: key, timerKey: "waiting:x" }),
  ) as { outstanding: boolean; armed: number };
  assert.deepEqual(state1, { outstanding: true, armed: 1 });

  // the timer fires and a pass consumes its wake → the NEXT deadline is a new
  // identity (sequence 2), never a resurrected duplicate
  type WakeRow = { eventId: string };
  const findWake = (dedupeKey: string) =>
    t.query(async (ctx) => {
      const db = ctx.db as unknown as {
        query(name: string): {
          withIndex(name: string, f: (q: { eq: (k: string, v: unknown) => unknown }) => unknown): {
            unique(): Promise<WakeRow | null>;
          };
        };
      };
      return db
        .query("wakeEvents")
        .withIndex("by_dedupe", (q) => q.eq("dedupeKey", dedupeKey))
        .unique();
    });
  const wakeRow = await findWake("timer:waiting:x:1");
  assert.ok(wakeRow, "the timer wake row exists with the sequence-numbered dedupe key");
  await t.mutation((ctx) =>
    ctx.runMutation(internal.internal.workforce.markWakeConsumed, { eventIds: [wakeRow.eventId], at: now + 10 }),
  );

  const third = await arm(900_000, now + 20);
  assert.equal(third, true, "after consumption a fresh deadline may arm");
  const state2 = await t.query(async (ctx) =>
    (timerState as unknown as { _handler: (c: unknown, a: Record<string, unknown>) => Promise<unknown> })._handler(ctx, { objectiveKey: key, timerKey: "waiting:x" }),
  ) as { outstanding: boolean; armed: number };
  assert.deepEqual(state2, { outstanding: true, armed: 2 }, "sequence advanced: no duplicate, no fan-out");
});

// ── A3-7: persisted no-progress accounting ──────────────────────────────────

test("A3 progress: no-progress cycles persist against the budget and reach the finite escalation ceiling; a material pass resets the counter", async () => {
  const t = convexTest(schema, modules);
  const key = "obj_progress";
  await seedObjective(t, key, makeRequirement(key, "MAKE"));

  const record = (progressed: boolean, at: number) =>
    t.mutation(async (ctx) => {
      const ports = buildConvexManagementPorts(ctx as never);
      await ports.recordPassProgress(key, progressed, at);
    });

  await record(false, now + 1);
  await record(false, now + 2);
  let budget = (await readBudgetRow(t, key))!;
  assert.equal(budget.used.noProgressCycles, 2, "the counter lives in PERSISTED state");

  await record(true, now + 3);
  budget = (await readBudgetRow(t, key))!;
  assert.equal(budget.used.noProgressCycles, 0, "a pass that did real work resets it");

  // run the full way to the ceiling: three consecutive non-progress passes
  await record(false, now + 4);
  await record(false, now + 5);
  await record(false, now + 6);
  const final = await t.query(async (ctx) =>
    (readBudget as unknown as { _handler: (c: unknown, a: Record<string, unknown>) => Promise<unknown> })._handler(ctx, { objectiveKey: key }),
  ) as Parameters<typeof checkBudget>[0];
  const verdict = checkBudget(final, now + 7);
  assert.equal(verdict.ok, false);
  if (!verdict.ok) assert.equal(verdict.state, "escalated", "the finite ceiling is REACHABLE from storage alone");
});
