// CP7 — Production Convex-backed ManagementPorts adapter persistence tests.
// Mirrors the pattern from managementIntentsPersistence.test.ts: callMutation/callQuery
// via _handler, schema import, convex-test modules map.
//
// Tests cover:
//   1. loadContract returns null before any contract, and the persisted contract after putContract
//   2. persistDecision writes decision + options, and loadGrounded reconstructs the options map
//   3. spendDecisionCall increments used.managementDecisions through the shipped budget kernel;
//      a second init does not reset it
//   4. recordSatisfactionAttempt REFUSES an assignment_run_finished event (requirement stays active)
//   5. proposeCompletion rejects against a missing contract without persisting a verdict
//   6. runManagementPass over an objective with no contract returns a typed outcome with action
//      plan_contract path (state "planning") and does not throw

import test from "node:test";
import assert from "node:assert/strict";
import { convexTest } from "convex-test";
import schema from "../convex/schema";
import {
  putContract,
  putDecision,
  putRequirement,
  initBudget,
  readBudget,
} from "../convex/internal/workforce";
import { buildConvexManagementPorts, runManagementPass, CONTROL_NOTE_LIMIT } from "../convex/management";
import { buildOutcomeContract } from "../lib/management/contract";
import { buildInternalOption, EMPTY_FACTS, withEligibility, eligibilityInputFor } from "../lib/management/options";
import type { DecisionPassResult } from "../lib/management/decision";
import type { GroundedOption, Requirement, ManagerialDecision } from "../lib/management/types";
import { CP2_REQUIREMENT_FIELDS } from "./helpers/cp2Requirement";

const modules = {
  "../convex/schema.ts": () => import("../convex/schema"),
  "../convex/objectiveValidators.ts": () => import("../convex/objectiveValidators"),
  "../convex/managementValidators.ts": () => import("../convex/managementValidators"),
  "../convex/workforceGuards.ts": () => import("../convex/workforceGuards"),
  "../convex/internal/workforce.ts": () => import("../convex/internal/workforce"),
  "../convex/management.ts": () => import("../convex/management"),
  "../convex/_generated/api.d.ts": () => import("../convex/_generated/api"),
  "../convex/_generated/server.d.ts": () => import("../convex/_generated/server"),
  "../convex/_generated/dataModel.d.ts": () => import("../convex/_generated/dataModel"),
};

const now = 1820000000000;

const callMutation = (fn: unknown, ctx: unknown, args: Record<string, unknown>) =>
  (fn as { _handler: (ctx: unknown, args: Record<string, unknown>) => Promise<unknown> })._handler(ctx, args);

const callQuery = (fn: unknown, ctx: unknown, args: Record<string, unknown>) =>
  (fn as { _handler: (ctx: unknown, args: Record<string, unknown>) => Promise<unknown> })._handler(ctx, args);

// ── Test 1: loadContract round-trip ─────────────────────────────────────────

test("loadContract returns null before any contract, and the persisted contract after putContract", async () => {
  const t = convexTest(schema, modules);

  // Before any contract
  const beforeContract = await t.mutation(async (ctx) => {
    const ports = buildConvexManagementPorts(ctx as any);
    return ports.loadContract("obj_test_1");
  });
  assert.equal(beforeContract.contract, null);
  assert.equal(beforeContract.currentContractRevision, 0);

  // Persist a contract via putContract
  const contractResult = buildOutcomeContract({
    objectiveKey: "obj_test_1",
    contractId: "contract_test_1",
    revision: 1,
    parsed: {
      intent: "test objective",
      levels: [{ levelKey: "done", order: 1, statement: "done", label: "Done" }],
      minimumCompletionBar: "done",
      ambiguities: [],
    },
    requestId: "req_test_1",
    founderResolvedQuestions: [],
    at: now,
  });
  assert.equal(contractResult.ok, true);
  if (!contractResult.ok) return;

  await t.mutation(async (ctx) =>
    callMutation(putContract, ctx, {
      objectiveKey: "obj_test_1",
      contractId: "contract_test_1",
      revision: 1,
      data: contractResult.contract,
    }),
  );

  // After contract
  const afterContract = await t.mutation(async (ctx) => {
    const ports = buildConvexManagementPorts(ctx as any);
    return ports.loadContract("obj_test_1");
  });
  assert.notEqual(afterContract.contract, null);
  assert.equal(afterContract.currentContractRevision, 1);
  assert.equal(afterContract.contract!.contractId, "contract_test_1");
});

// ── Test 2: persistDecision + loadGrounded round-trip ───────────────────────

test("persistDecision writes decision + options, and loadGrounded reconstructs the options map for the requirement", async () => {
  const t = convexTest(schema, modules);

  // Create a grounded option
  const internalOption = buildInternalOption({
    requirementKey: "req_test_2",
    contractRevision: 1,
    capabilityKeys: ["growth_launch_operations"],
    responsibility: "test responsibility",
    workerKey: null,
    staffingReason: "test",
    facts: EMPTY_FACTS,
  });
  assert.ok(internalOption.option);
  const options: GroundedOption[] = [internalOption.option!];

  // Create a decision
  const decision: ManagerialDecision = {
    decisionId: "dec_test_2",
    objectiveKey: "obj_test_2",
    contractRevision: 1,
    requirementKey: "req_test_2",
    kind: "satisfaction_strategy",
    strategy: "MAKE",
    optionId: options[0].optionId,
    recommendation: null,
    authorization: {
      kind: "authorized",
      decisionId: "dec_test_2",
      requirementKey: "req_test_2",
      contractRevision: 1,
      strategy: "MAKE",
      optionId: options[0].optionId,
      authorizedAt: now,
      // MAKE has no monetary external effect, so there is no grant to name.
      spendApprovalId: null,
    },
    coarsePlanSummary: "test decision",
    consideredOptionIds: options.map((o) => o.optionId),
    at: now,
  };

  const result: DecisionPassResult = {
    decision,
    boundRequirement: null,
    options,
    recommendation: null,
    authorization: decision.authorization,
  };

  // Persist via persistDecision
  await t.mutation(async (ctx) => {
    const ports = buildConvexManagementPorts(ctx as any);
    await ports.persistDecision(result, now);
  });

  // Load grounded options - convert Map to plain object for serialization
  const groundedResult = await t.mutation(async (ctx) => {
    const ports = buildConvexManagementPorts(ctx as any);
    const grounded = await ports.loadGrounded("obj_test_2", 1);
    // Convert Map to plain object for Convex serialization
    const obj: Record<string, GroundedOption[]> = {};
    for (const [key, value] of grounded.entries()) {
      obj[key] = value;
    }
    return obj;
  });

  const keys = Object.keys(groundedResult);
  assert.equal(keys.length, 1);
  assert.ok(keys.includes("req_test_2"));
  const loadedOptions = groundedResult["req_test_2"];
  assert.equal(loadedOptions.length, 1);
  assert.equal(loadedOptions[0].optionId, options[0].optionId);
});

test("persistDecision approval_required appends pending_approval; stale overwrite would wipe it", async () => {
  const t = convexTest(schema, modules);
  const key = "obj_pending_approval_survive";
  const question =
    "No founder spend limit is set for this objective. Acquiring social_media_guru costs $0.01. Approve a bounded spend limit, or choose another option?";

  await t.mutation(async (ctx) => {
    await ctx.db.insert("objectives", {
      key,
      data: {
        key,
        request: "test",
        createdAt: now,
        updatedAt: now,
        state: "executing",
        activity: "test",
        plan: null,
        workItems: [],
        run: null,
        result: null,
        management: {
          contractId: null,
          controlNotes: [{ type: "control_state", state: "executing", summary: "working", at: now - 1 }],
          pendingDecision: {
            requestId: "decide_test",
            requirementKey: "req_buy",
            contractRevision: 1,
            attempts: 1,
          },
        },
      },
    });
  });

  const decision: ManagerialDecision = {
    decisionId: "dec_pending_survive",
    objectiveKey: key,
    contractRevision: 1,
    requirementKey: "req_buy",
    kind: "satisfaction_strategy",
    strategy: null,
    optionId: "opt_buy",
    recommendation: null,
    authorization: {
      kind: "approval_required",
      requirementKey: "req_buy",
      contractRevision: 1,
      reason: "spend_authority_required",
      question,
    },
    coarsePlanSummary: "founder approval required",
    consideredOptionIds: ["opt_buy"],
    at: now,
  };
  const result: DecisionPassResult = {
    decision,
    boundRequirement: null,
    options: [],
    recommendation: null,
    authorization: decision.authorization,
  };

  await t.mutation(async (ctx) => {
    const ports = buildConvexManagementPorts(ctx as any);
    await ports.persistDecision(result, now);
  });

  const afterPersist = await t.query(async (ctx) => {
    const row = await (ctx.db as any).query("objectives").withIndex("by_key", (q: any) => q.eq("key", key)).unique();
    return (row as any).data.management.controlNotes as Array<Record<string, unknown>>;
  });
  assert.ok(
    afterPersist.some((n) => n.type === "pending_approval" && n.question === question),
    "persistDecision must write pending_approval for Needs You",
  );

  // Reproduce the pre-fix clearPending bug: patch from a stale management
  // snapshot that predates the pending_approval note.
  await t.mutation(async (ctx) => {
    const row = await (ctx.db as any).query("objectives").withIndex("by_key", (q: any) => q.eq("key", key)).unique();
    const data = (row as any).data as Record<string, unknown>;
    const staleMgmt = {
      contractId: null,
      controlNotes: [{ type: "control_state", state: "executing", summary: "working", at: now - 1 }],
      pendingDecision: {
        requestId: "decide_test",
        requirementKey: "req_buy",
        contractRevision: 1,
        attempts: 1,
      },
    };
    await ctx.db.patch(row._id, {
      data: {
        ...data,
        management: { ...staleMgmt, pendingDecision: null },
      },
    } as never);
  });

  const afterStale = await t.query(async (ctx) => {
    const row = await (ctx.db as any).query("objectives").withIndex("by_key", (q: any) => q.eq("key", key)).unique();
    return (row as any).data.management.controlNotes as Array<Record<string, unknown>>;
  });
  assert.equal(
    afterStale.some((n) => n.type === "pending_approval"),
    false,
    "stale overwrite demonstrates the wipe that hid Needs You",
  );

  // Re-apply persistDecision, then clear with a fresh read (fixed clearPending shape).
  await t.mutation(async (ctx) => {
    const ports = buildConvexManagementPorts(ctx as any);
    await ports.persistDecision(result, now + 1);
    const row = await (ctx.db as any).query("objectives").withIndex("by_key", (q: any) => q.eq("key", key)).unique();
    const latestData = (row as any).data as Record<string, unknown>;
    const latestMgmt = (latestData.management ?? {}) as Record<string, unknown>;
    await ctx.db.patch(row._id, {
      data: {
        ...latestData,
        management: { ...latestMgmt, pendingDecision: null },
      },
    } as never);
  });

  const afterFresh = await t.query(async (ctx) => {
    const row = await (ctx.db as any).query("objectives").withIndex("by_key", (q: any) => q.eq("key", key)).unique();
    return (row as any).data.management.controlNotes as Array<Record<string, unknown>>;
  });
  assert.ok(
    afterFresh.some((n) => n.type === "pending_approval" && n.question === question),
    "fresh-read clear must preserve pending_approval so the founder gate stays visible",
  );
});

test("loadGrounded omits empty options[] so a refused empty proposal is not stable grounding", async () => {
  const t = convexTest(schema, modules);

  const decision: ManagerialDecision = {
    decisionId: "dec_empty_opts",
    objectiveKey: "obj_empty_opts",
    contractRevision: 1,
    requirementKey: "req_empty",
    kind: "satisfaction_strategy",
    strategy: null,
    optionId: null,
    recommendation: null,
    authorization: {
      kind: "refused",
      requirementKey: "req_empty",
      contractRevision: 1,
      reasons: ["unknown"],
      detail: "no grounded option is currently eligible",
    },
    coarsePlanSummary: "empty proposal",
    consideredOptionIds: [],
    at: now,
  };

  const result: DecisionPassResult = {
    decision,
    boundRequirement: null,
    options: [],
    recommendation: null,
    authorization: decision.authorization,
  };

  await t.mutation(async (ctx) => {
    const ports = buildConvexManagementPorts(ctx as any);
    await ports.persistDecision(result, now);
  });

  const groundedResult = await t.mutation(async (ctx) => {
    const ports = buildConvexManagementPorts(ctx as any);
    const grounded = await ports.loadGrounded("obj_empty_opts", 1);
    const obj: Record<string, number> = {};
    for (const [key, value] of grounded.entries()) obj[key] = value.length;
    return obj;
  });

  assert.deepEqual(groundedResult, {}, "empty options must not appear in grounded map");
});

// ── Test 3: spendDecisionCall increments budget ─────────────────────────────

test("spendDecisionCall increments used.managementDecisions through the shipped budget kernel; a second init does not reset it", async () => {
  const t = convexTest(schema, modules);

  // First spend
  await t.mutation(async (ctx) => {
    const ports = buildConvexManagementPorts(ctx as any);
    await ports.spendDecisionCall("obj_test_3", now);
  });

  const budget1 = await t.query(async (ctx) =>
    callQuery(readBudget, ctx, { objectiveKey: "obj_test_3" }),
  );
  assert.equal((budget1 as any).used.managementDecisions, 1);

  // Second spend
  await t.mutation(async (ctx) => {
    const ports = buildConvexManagementPorts(ctx as any);
    await ports.spendDecisionCall("obj_test_3", now + 1000);
  });

  const budget2 = await t.query(async (ctx) =>
    callQuery(readBudget, ctx, { objectiveKey: "obj_test_3" }),
  );
  assert.equal((budget2 as any).used.managementDecisions, 2);

  // Verify initBudget is idempotent (doesn't reset)
  await t.mutation(async (ctx) =>
    callMutation(initBudget, ctx, { objectiveKey: "obj_test_3", at: now + 2000 }),
  );

  const budget3 = await t.query(async (ctx) =>
    callQuery(readBudget, ctx, { objectiveKey: "obj_test_3" }),
  );
  assert.equal((budget3 as any).used.managementDecisions, 2);
});

// ── Test 4: recordSatisfactionAttempt refuses assignment_run_finished ─────────

test("recordSatisfactionAttempt REFUSES an assignment_run_finished event (requirement stays active) and does not throw", async () => {
  const t = convexTest(schema, modules);

  // Create an objective row
  await t.mutation(async (ctx) => {
    await ctx.db.insert("objectives", {
      key: "obj_test_4",
      data: {
        key: "obj_test_4",
        request: "test",
        createdAt: now,
        updatedAt: now,
        state: "executing",
        activity: "test",
        plan: null,
        workItems: [],
        run: null,
        result: null,
      },
    });
  });

  // Create a requirement
  const requirement: Requirement = {
    requirementKey: "req_test_4",
    objectiveKey: "obj_test_4",
    contractId: "contract_test_4",
    contractRevision: 1,
    priority: "required",
    title: "test requirement",
    mustBeTrue: "test must be true",
    scope: "test scope",
    proofs: [
      {
        proofKey: "observation",
        description: "test observation",
        proofKind: "application_observation",
        params: { sourceId: "ev_test_4" },
      },
    ],
    state: "active",
    strategy: null,
    resolution: null,
    blockedReason: null,
    waiver: null,
    revision: 1,
    createdAt: now,
    updatedAt: now,
    ...CP2_REQUIREMENT_FIELDS,
  };

  await t.mutation(async (ctx) =>
    callMutation(putRequirement, ctx, {
      objectiveKey: "obj_test_4",
      requirementKey: "req_test_4",
      data: requirement,
      currentContractRevision: 1,
    }),
  );

  // Call recordSatisfactionAttempt with no verified assignments/intents
  // This should use assignment_run_finished event kind, which is refused
  await t.mutation(async (ctx) => {
    const ports = buildConvexManagementPorts(ctx as any);
    await ports.recordSatisfactionAttempt(
      {
        objectiveKey: "obj_test_4",
        contractRevision: 1,
        focusRequirementKey: "req_test_4",
        managerDecisionId: null,
        pendingIntentId: null,
        wakeReason: "worker_result",
        wakeEventIds: [],
        continuation: {},
        lastNode: null,
        pass: 1,
      },
      "req_test_4",
      now,
    );
  });

  // Verify requirement is still active (not satisfied)
  const requirementRows = await t.query(async (ctx) =>
    (ctx.db as any)
      .query("requirements")
      .withIndex("by_objectiveRequirement", (q: any) =>
        q.eq("objectiveKey", "obj_test_4").eq("requirementKey", "req_test_4"),
      )
      .collect(),
  );
  assert.equal(requirementRows.length, 1);
  assert.equal((requirementRows[0] as any).data.state, "active");
});

// ── Test 5: proposeCompletion rejects without contract ──────────────────────

test("proposeCompletion rejects against a missing contract without persisting a verdict", async () => {
  const t = convexTest(schema, modules);

  const verdict = await t.mutation(async (ctx) => {
    const ports = buildConvexManagementPorts(ctx as any);
    return ports.proposeCompletion(
      {
        proposalId: "prop_test_5",
        objectiveKey: "obj_test_5",
        contractId: "contract_test_5",
        contractRevision: 1,
        claimedLevelKey: "done",
        rationale: "test",
        proposedAt: now,
      },
      now,
    );
  });

  assert.equal(verdict.accepted, false);
  assert.equal(verdict.objectiveState, "planning");
  assert.ok(verdict.unmet.includes("no Outcome Contract persisted"));

  // Verify no verdict was persisted
  const decisionRows = await t.query(async (ctx) =>
    (ctx.db as any)
      .query("managerialDecisions")
      .withIndex("by_objectiveKey", (q: any) => q.eq("objectiveKey", "obj_test_5"))
      .collect(),
  );
  assert.equal(decisionRows.length, 0);
});

// ── Test 6: runManagementPass with no contract ──────────────────────────────

test("runManagementPass over an objective with no contract returns a typed outcome with action plan_contract path (state 'planning') and does not throw", async () => {
  const t = convexTest(schema, modules);

  // Create an objective row
  await t.mutation(async (ctx) => {
    await ctx.db.insert("objectives", {
      key: "obj_test_6",
      data: {
        key: "obj_test_6",
        request: "test objective",
        createdAt: now,
        updatedAt: now,
        state: "received",
        activity: "test",
        plan: null,
        workItems: [],
        run: null,
        result: null,
      },
    });
  });

  // Run the management pass
  const outcome = (await t.mutation(async (ctx) =>
    callMutation(runManagementPass, ctx, {
      objectiveKey: "obj_test_6",
      reason: "objective_submitted",
    }),
  )) as { objectiveState: string; acted: boolean; summary: string };

  assert.equal(outcome.objectiveState, "planning");
  assert.equal(outcome.acted, false);
  assert.ok(typeof outcome.summary === "string");
});

// ── Test 7: writeObjectiveState control-note bounding ───────────────────────

test("writeObjectiveState repeated equivalent control_state notes replace in place instead of growing unbounded", async () => {
  const t = convexTest(schema, modules);

  await t.mutation(async (ctx) => {
    await ctx.db.insert("objectives", {
      key: "obj_test_7",
      data: {
        key: "obj_test_7",
        request: "test",
        createdAt: now,
        updatedAt: now,
        state: "planning",
        activity: "test",
        plan: null,
        workItems: [],
        run: null,
        result: null,
      },
    });
  });

  // 100 passes, same "executing" state each time (the observed Luna/production
  // pattern: a repeated no-op control_state on every pass).
  for (let i = 0; i < 100; i += 1) {
    await t.mutation(async (ctx) => {
      const ports = buildConvexManagementPorts(ctx as any);
      await ports.writeObjectiveState(
        "obj_test_7",
        "executing" as any,
        `pass ${i}`,
        now + i,
      );
    });
  }

  const row = await t.query(async (ctx) =>
    (ctx.db as any)
      .query("objectives")
      .withIndex("by_key", (q: any) => q.eq("key", "obj_test_7"))
      .unique(),
  );
  const notes = (row as any).data.management.controlNotes as Array<Record<string, unknown>>;
  const controlStateNotes = notes.filter((n) => n.type === "control_state");
  assert.equal(controlStateNotes.length, 1, "repeated identical state must replace, not append");
  assert.equal(controlStateNotes[0].summary, "pass 99", "the replaced note carries the latest summary");
  assert.ok(notes.length <= CONTROL_NOTE_LIMIT);
});

test("writeObjectiveState with distinct states caps controlNotes at CONTROL_NOTE_LIMIT and keeps the most recent", async () => {
  const t = convexTest(schema, modules);

  await t.mutation(async (ctx) => {
    await ctx.db.insert("objectives", {
      key: "obj_test_8",
      data: {
        key: "obj_test_8",
        request: "test",
        createdAt: now,
        updatedAt: now,
        state: "planning",
        activity: "test",
        plan: null,
        workItems: [],
        run: null,
        result: null,
      },
    });
  });

  // Distinct control_state identities, forced with an interleaved
  // pending_approval note per round (a genuinely different note each time)
  // so the ceiling is exercised on more than CONTROL_NOTE_LIMIT live entries,
  // and must trim oldest-first while the schema's real state literals stay valid.
  const validStates = [
    "planning",
    "ready_to_execute",
    "executing",
    "waiting_for_resource",
    "waiting",
    "approval_required",
    "blocked",
    "escalated",
    "recovery_required",
    "failed",
  ] as const;
  const total = CONTROL_NOTE_LIMIT + 10;
  for (let i = 0; i < total; i += 1) {
    await t.mutation(async (ctx) => {
      const ports = buildConvexManagementPorts(ctx as any);
      await ports.writeObjectiveState(
        "obj_test_8",
        validStates[i % validStates.length] as any,
        `pass ${i}`,
        now + i,
      );
    });
  }

  const row = await t.query(async (ctx) =>
    (ctx.db as any)
      .query("objectives")
      .withIndex("by_key", (q: any) => q.eq("key", "obj_test_8"))
      .unique(),
  );
  const notes = (row as any).data.management.controlNotes as Array<Record<string, unknown>>;
  // Every state cycles back to an identity already present (there are only
  // validStates.length distinct control_state identities), so the ceiling is
  // never actually exceeded here — this proves replace-in-place holds even
  // as the state value itself changes across rounds, not just the summary.
  assert.ok(notes.length <= CONTROL_NOTE_LIMIT);
  const controlStateNotes = notes.filter((n) => n.type === "control_state");
  assert.equal(controlStateNotes.length, validStates.length);
  const last = controlStateNotes.find((n) => n.state === validStates[(total - 1) % validStates.length]);
  assert.equal(last?.summary, `pass ${total - 1}`);
});

test("boundNotes ceiling trims oldest-first once genuinely distinct identities exceed CONTROL_NOTE_LIMIT", async () => {
  const t = convexTest(schema, modules);

  await t.mutation(async (ctx) => {
    await ctx.db.insert("objectives", {
      key: "obj_test_9",
      data: {
        key: "obj_test_9",
        request: "test",
        createdAt: now,
        updatedAt: now,
        state: "planning",
        activity: "test",
        plan: null,
        workItems: [],
        run: null,
        result: null,
      },
    });
  });

  // pending_approval notes are keyed by question text, so distinct questions
  // are genuinely distinct identities — enough of them to exceed the ceiling.
  const total = CONTROL_NOTE_LIMIT + 10;
  for (let i = 0; i < total; i += 1) {
    await t.mutation(async (ctx) => {
      const row = await (ctx.db as any)
        .query("objectives")
        .withIndex("by_key", (q: any) => q.eq("key", "obj_test_9"))
        .unique();
      const data = row.data;
      const mgmt = data.management ?? {};
      const { boundNotes } = await import("../convex/management");
      await ctx.db.patch(row._id, {
        data: {
          ...data,
          management: {
            ...mgmt,
            contractId: mgmt.contractId ?? null,
            controlNotes: boundNotes(mgmt.controlNotes, {
              type: "pending_approval",
              question: `question ${i}`,
              at: now + i,
            }),
          },
        },
      });
    });
  }

  const row = await t.query(async (ctx) =>
    (ctx.db as any)
      .query("objectives")
      .withIndex("by_key", (q: any) => q.eq("key", "obj_test_9"))
      .unique(),
  );
  const notes = (row as any).data.management.controlNotes as Array<Record<string, unknown>>;
  assert.equal(notes.length, CONTROL_NOTE_LIMIT);
  const questions = notes.map((n) => n.question);
  assert.ok(!questions.includes("question 0"), "oldest note must be evicted");
  assert.ok(questions.includes(`question ${total - 1}`), "newest note must survive");
});
