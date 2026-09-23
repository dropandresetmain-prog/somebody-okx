// Focused M6.1 fix: empty-options / proposal-failure decisions must not become
// permanent grounded truth. Covers Case A retry, ceiling → recovery_required,
// Case B genuine no-eligible waiting, and loadGrounded omission of [].

import test, { mock, after as afterAll } from "node:test";
import assert from "node:assert/strict";
import { convexTest } from "convex-test";
import schema from "../convex/schema";
import { putContract, putRequirement, initBudget } from "../convex/internal/workforce";
import {
  buildConvexManagementPorts,
  applyDecision,
  runManagementPass,
  BEGIN_DECISION_CEILING,
} from "../convex/management";
import { BEGIN_DECISION_CEILING as KERNEL_CEILING } from "../lib/management/decision";
import { reduceManagementState } from "../lib/management/reducer";
import { buildOutcomeContract, buildSemanticRequirement } from "../lib/management/contract";
import type { GroundedOption, OutcomeContract, Requirement } from "../lib/management/types";
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

const now = 1960000000000;
type Backend = ReturnType<typeof convexTest>;
type Handler = { _handler: (c: unknown, a: Record<string, unknown>) => Promise<unknown> };

type LooseDb = {
  query(name: string): {
    withIndex(name: string, f: (q: { eq: (k: string, v: unknown) => unknown }) => unknown): {
      unique(): Promise<Record<string, unknown> | null>;
      collect(): Promise<Array<Record<string, unknown>>>;
    };
  };
};
const looseDb = (ctx: { db: unknown }): LooseDb => ctx.db as LooseDb;

test("BEGIN_DECISION_CEILING is shared (kernel === convex re-export) and remains 3", () => {
  assert.equal(BEGIN_DECISION_CEILING, 3);
  assert.equal(KERNEL_CEILING, BEGIN_DECISION_CEILING);
});

function contractFor(objectiveKey: string): OutcomeContract {
  const built = buildOutcomeContract({
    objectiveKey,
    contractId: `contract_${objectiveKey}`,
    revision: 1,
    parsed: {
      intent: "retry grounding",
      levels: [{ levelKey: "goal", order: 1, statement: "goal", label: "Goal" }],
      minimumCompletionBar: "goal",
      ambiguities: [],
    },
    requestId: "retry_test",
    founderResolvedQuestions: [],
    at: now,
  });
  assert.equal(built.ok, true);
  if (!built.ok) throw new Error("bad contract");
  return built.contract;
}

function semanticReq(objectiveKey: string, reqKey: string): Requirement {
  const built = buildSemanticRequirement({
    objectiveKey,
    contract: contractFor(objectiveKey),
    proposed: cp2ParsedRequirement({
      requirementKey: reqKey,
      priority: "required",
      title: "Evidence available",
      mustBeTrue: "evidence exists",
      scope: "launch",
    }),
    at: now,
  });
  if ("errors" in built) throw new Error(built.errors.join("; "));
  return built.requirement;
}

async function seed(t: Backend, key: string, req: Requirement) {
  await t.mutation(async (ctx) => {
    await ctx.db.insert("objectives", {
      key,
      data: {
        key,
        request: "retry grounding",
        createdAt: now,
        updatedAt: now,
        state: "received",
        activity: "new",
        plan: null,
        workItems: [],
        run: null,
        result: null,
        management: { contractId: null, controlNotes: [] },
      } as never,
    });
  });
  await t.mutation(async (ctx) =>
    (putContract as unknown as Handler)._handler(ctx, {
      objectiveKey: key,
      contractId: `contract_${key}`,
      revision: 1,
      data: contractFor(key),
    }),
  );
  await t.mutation(async (ctx) =>
    (putRequirement as unknown as Handler)._handler(ctx, {
      objectiveKey: key,
      requirementKey: req.requirementKey,
      data: req,
      currentContractRevision: 1,
    }),
  );
  await t.mutation(async (ctx) =>
    (initBudget as unknown as Handler)._handler(ctx, { objectiveKey: key, at: now }),
  );
  await t.mutation(async (ctx) => {
    const row = await looseDb(ctx).query("objectives").withIndex("by_key", (q) => q.eq("key", key)).unique();
    if (!row) throw new Error("missing objective");
    const data = (row as { data: Record<string, unknown> }).data;
    await ctx.db.patch((row as { _id: unknown })._id as never, {
      data: {
        ...data,
        management: {
          ...(data.management as object),
          contractId: `contract_${key}`,
          decisionAttempts: {},
          decisionRefusalAttempts: {},
        },
      },
    } as never);
  });
}

async function beginDecision(t: Backend, key: string, reqKey: string) {
  return t.mutation(async (ctx) => {
    const ports = buildConvexManagementPorts(ctx as never);
    return ports.runDecisionPass(
      {
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
      },
      ports,
      now,
    );
  });
}

async function applyEmptyProposal(t: Backend, key: string, reqKey: string, requestId: string) {
  return t.mutation(async (ctx) =>
    (applyDecision as unknown as Handler)._handler(ctx, {
      objectiveKey: key,
      requestId,
      rawStrategyProposal: {
        strategy: "MAKE",
        desiredCapabilities: [],
        needsExternalResourceClass: null,
        notes: null,
      },
      rawRecommendation: {
        requirementKey: reqKey,
        contractRevision: 1,
        selectedOptionId: "opt_none",
        rationale: "empty proposal",
        materialAssumptions: [],
        changeMyMindEvidence: [],
      },
      at: now,
    }),
  );
}

async function readObjective(t: Backend, key: string) {
  return t.query(async (ctx) => {
    const row = await looseDb(ctx).query("objectives").withIndex("by_key", (q) => q.eq("key", key)).unique();
    return (row as { data: Record<string, unknown> } | null)?.data ?? null;
  });
}

async function loadGroundedMap(t: Backend, key: string) {
  return t.mutation(async (ctx) => {
    const ports = buildConvexManagementPorts(ctx as never);
    const map = await ports.loadGrounded(key, 1);
    const obj: Record<string, number> = {};
    for (const [k, v] of map.entries()) obj[k] = v.length;
    return obj;
  });
}

test("1–3. empty-options refusal is omitted from loadGrounded; attempt #2 is schedulable", async () => {
  const t = convexTest(schema, modules);
  const key = "obj_empty_retry_a";
  const reqKey = "req_01";
  await seed(t, key, semanticReq(key, reqKey));

  await beginDecision(t, key, reqKey);
  const obj1 = await readObjective(t, key);
  const pending1 = (obj1!.management as { pendingDecision: { requestId: string; attempts: number } })
    .pendingDecision;
  assert.equal(pending1.attempts, 1);

  const apply1 = (await applyEmptyProposal(t, key, reqKey, pending1.requestId)) as {
    ok: boolean;
    authorized?: boolean;
  };
  assert.equal(apply1.ok, true);
  assert.equal(apply1.authorized, false);

  const grounded = await loadGroundedMap(t, key);
  assert.deepEqual(grounded, {}, "empty options[] must not register as grounded");

  const objAfter = await readObjective(t, key);
  const refusals = (objAfter!.management as { decisionRefusalAttempts: Record<string, number> })
    .decisionRefusalAttempts;
  assert.equal(refusals[reqKey], 1);

  // Management pass must route to decide again (not waiting).
  const outcome = await t.mutation(async (ctx) =>
    (runManagementPass as unknown as Handler)._handler(ctx, {
      objectiveKey: key,
      reason: "decision_applied",
    }),
  );
  assert.equal((outcome as { objectiveState: string }).objectiveState, "executing");

  const obj2 = await readObjective(t, key);
  const pending2 = (obj2!.management as { pendingDecision: { requestId: string; attempts: number } | null })
    .pendingDecision;
  assert.ok(pending2, "attempt #2 reserved");
  assert.equal(pending2!.attempts, 2);
  assert.match(pending2!.requestId, /_a2$/);
});

test("4–6. second empty refusal still retries; ceiling exhaustion → recovery_required; no timer storm", async () => {
  const t = convexTest(schema, modules);
  const key = "obj_empty_retry_ceil";
  const reqKey = "req_01";
  await seed(t, key, semanticReq(key, reqKey));

  for (let attempt = 1; attempt <= BEGIN_DECISION_CEILING; attempt += 1) {
    await beginDecision(t, key, reqKey);
    const obj = await readObjective(t, key);
    const pending = (obj!.management as { pendingDecision: { requestId: string; attempts: number } | null })
      .pendingDecision;
    assert.ok(pending, `pending for attempt ${attempt}`);
    assert.equal(pending!.attempts, attempt);
    const applied = (await applyEmptyProposal(t, key, reqKey, pending!.requestId)) as {
      ok: boolean;
      authorized?: boolean;
    };
    assert.equal(applied.ok, true);
    assert.equal(applied.authorized, false);
  }

  const afterCeiling = await readObjective(t, key);
  const refusals = (afterCeiling!.management as { decisionRefusalAttempts: Record<string, number> })
    .decisionRefusalAttempts;
  assert.equal(refusals[reqKey], BEGIN_DECISION_CEILING);

  const beginBlocked = await beginDecision(t, key, reqKey);
  assert.equal(beginBlocked, null, "begin refuses at ceiling");

  const outcome = await t.mutation(async (ctx) =>
    (runManagementPass as unknown as Handler)._handler(ctx, {
      objectiveKey: key,
      reason: "decision_applied",
    }),
  );
  assert.equal(
    (outcome as { objectiveState: string }).objectiveState,
    "recovery_required",
    "ceiling exhaustion parks recovery_required",
  );

  const timers = await t.query(async (ctx) => {
    const rows = await looseDb(ctx).query("wakeEvents").withIndex("by_objective", (q) => q.eq("objectiveKey", key)).collect();
    return rows
      .map((r) => (r as { data: { dedupeKey?: string } }).data)
      .filter((d) => typeof d.dedupeKey === "string" && d.dedupeKey.startsWith("timer:"));
  });
  assert.equal(timers.length, 0, "recovery_required must not arm no_eligible_path timers");
});

test("7. genuine application-grounded no-eligible path still waits (does not burn model retries)", () => {
  const ineligible: GroundedOption = {
    optionId: "opt_inelig",
    requirementKey: "req_01",
    contractRevision: 1,
    kind: "internal",
    strategy: "MAKE",
    internal: {
      capabilityKeys: ["growth_launch_operations"],
      responsibility: "x",
      workerKey: null,
      staffingReason: "x",
      primitives: [],
    },
    external: null,
    facts: {
      scope: null,
      expectedQuality: null,
      setupMinutes: null,
      queueMinutes: null,
      executionMinutes: null,
      verificationMinutes: null,
      internalCostUsd: null,
      externalPriceUsd: null,
      reliability: null,
      availability: null,
      reuseValue: null,
      externalAdvantage: null,
    },
    eligibility: { eligible: false, reasons: ["budget_exceeded"], detail: "budget" },
  };
  const contract = contractFor("obj_case_b");
  const req = semanticReq("obj_case_b", "req_01");
  const r = reduceManagementState({
    contract,
    currentContractRevision: 1,
    requirements: [req],
    groundedByRequirement: new Map([["req_01", [ineligible]]]),
    assignments: [],
    intents: [],
    budgetVerdict: { ok: true },
    pendingApproval: null,
    completionProposal: null,
    decisionRefusalAttempts: { req_01: 1 },
    at: now,
  });
  assert.equal(r.state, "waiting");
  assert.equal(r.action.kind, "await_wake");
});

test("9. duplicate begin while pending does not advance attempt counter", async () => {
  const t = convexTest(schema, modules);
  const key = "obj_dup_wake";
  const reqKey = "req_01";
  await seed(t, key, semanticReq(key, reqKey));

  await beginDecision(t, key, reqKey);
  const first = await readObjective(t, key);
  const pending1 = (first!.management as { pendingDecision: { requestId: string; attempts: number } })
    .pendingDecision;
  assert.equal(pending1.attempts, 1);

  await beginDecision(t, key, reqKey);
  const second = await readObjective(t, key);
  const pending2 = (second!.management as { pendingDecision: { requestId: string; attempts: number } })
    .pendingDecision;
  assert.equal(pending2.requestId, pending1.requestId);
  assert.equal(pending2.attempts, 1);
  const attempts = (second!.management as { decisionAttempts: Record<string, number> }).decisionAttempts;
  assert.equal(attempts[reqKey], 1);
});
