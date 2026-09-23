// Founder live run #1: an accepted completion later regressed to "escalated"
// (product-facing "blocked") because a stale/late management pass ran after
// the gate had already accepted completion, hit the maxNoProgressCycles
// budget guard, and overwrote durable state. Accepted completion for the
// CURRENT contract revision must be monotonic: a late timeout wake, recovery
// watchdog, duplicate worker/verification wake, or stale scheduled pass must
// become a harmless no-op — it may read "completed" but must never regress
// it, spend budget, start a model call, dispatch work, or create an intent.
//
// See docs/work/gate-evidence/founder-live-run-1-2026-09-24/SUMMARY.md for
// the exact production transition this reproduces: control_state
// "completed" at t=1790182191680, then control_state "escalated" (budget
// limit maxNoProgressCycles) at t=1790182254535, 62.8s later.

import test, { mock, after as afterAll } from "node:test";
import assert from "node:assert/strict";
import { convexTest } from "convex-test";
import schema from "../convex/schema";
import {
  runManagementPass,
  recoverStalledManagementPass,
  buildConvexManagementPorts,
} from "../convex/management";

mock.timers.enable({ apis: ["setTimeout", "Date"], now: 1_970_000_000_000 });
afterAll(() => mock.timers.reset());

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

type Handler = { _handler: (c: unknown, a: Record<string, unknown>) => Promise<unknown> };
const now = 1970000000000;

async function scheduledJobs(t: ReturnType<typeof convexTest>, suffix: string) {
  return t.run(async (ctx) => {
    const rows = await ctx.db.system.query("_scheduled_functions").collect();
    return rows.filter((row) => String((row as { name?: string }).name ?? "").includes(suffix));
  });
}

function completedObjectiveRow(key: string) {
  const contractId = `contract_${key}`;
  return {
    key,
    request: "Launch social content for a new community.",
    createdAt: now,
    updatedAt: now,
    state: "completed",
    activity: "gate accepted completion; disclosed 0 pending supporting item(s)",
    plan: null,
    workItems: [],
    run: null,
    result: null,
    management: {
      contractId,
      currentContractRevision: 1,
      interpretationStatus: "done",
      controlNotes: [
        { at: now - 1000, type: "control_state", state: "completed", summary: "gate accepted completion" },
      ],
    },
  };
}

async function insertCompletedObjective(t: ReturnType<typeof convexTest>, key: string) {
  await t.mutation(async (ctx) => {
    await ctx.db.insert("objectives", { key, data: completedObjectiveRow(key) as never });
  });
}

async function loadRow(t: ReturnType<typeof convexTest>, key: string) {
  return t.run(async (ctx) =>
    ctx.db.query("objectives").withIndex("by_key", (q) => q.eq("key", key)).unique(),
  );
}

test("accepted completion -> stale timeout wake -> still completed", async () => {
  const t = convexTest(schema, modules);
  const key = "obj_terminal_timeout";
  await insertCompletedObjective(t, key);

  const outcome = (await t.mutation(async (ctx) =>
    (runManagementPass as unknown as Handler)._handler(ctx, { objectiveKey: key, reason: "timeout" }),
  )) as { objectiveState: string; acted: boolean };

  assert.equal(outcome.objectiveState, "completed");
  assert.equal(outcome.acted, false);

  const row = await loadRow(t, key);
  const data = row?.data as { state: string };
  assert.equal(data.state, "completed");
});

test("accepted completion -> recovery_event wake -> still completed", async () => {
  const t = convexTest(schema, modules);
  const key = "obj_terminal_recovery_event";
  await insertCompletedObjective(t, key);

  const outcome = (await t.mutation(async (ctx) =>
    (runManagementPass as unknown as Handler)._handler(ctx, {
      objectiveKey: key,
      reason: "recovery_event",
    }),
  )) as { objectiveState: string; acted: boolean };

  assert.equal(outcome.objectiveState, "completed");
  assert.equal(outcome.acted, false);

  const row = await loadRow(t, key);
  const data = row?.data as { state: string };
  assert.equal(data.state, "completed");
});

test("accepted completion -> duplicate management pass -> no new decision, assignment, intent, or Blocked control-state event", async () => {
  const t = convexTest(schema, modules);
  const key = "obj_terminal_duplicate_pass";
  await insertCompletedObjective(t, key);

  const before = await loadRow(t, key);
  const beforeControlNotes = (
    (before?.data as { management?: { controlNotes?: unknown[] } }).management?.controlNotes ?? []
  ).length;

  for (const reason of ["timeout", "recovery_event", "worker_result", "verification"]) {
    const outcome = (await t.mutation(async (ctx) =>
      (runManagementPass as unknown as Handler)._handler(ctx, { objectiveKey: key, reason }),
    )) as { objectiveState: string; acted: boolean };
    assert.equal(outcome.objectiveState, "completed", `reason=${reason}`);
    assert.equal(outcome.acted, false, `reason=${reason}`);
  }

  const after = await loadRow(t, key);
  const afterData = after?.data as {
    state: string;
    management?: { controlNotes?: Array<{ state?: string }> };
  };
  assert.equal(afterData.state, "completed");
  const afterControlNotes = afterData.management?.controlNotes ?? [];
  // No-op passes must never append a new control-state event: same count as
  // before, and certainly no "escalated"/"blocked" entry appended.
  assert.equal(afterControlNotes.length, beforeControlNotes);
  assert.ok(
    !afterControlNotes.some((note) => note.state === "escalated" || note.state === "blocked"),
    `expected no escalated/blocked control note, saw: ${JSON.stringify(afterControlNotes)}`,
  );
});

test("recovery watchdog after completion is a no-op even with a live watch marker", async () => {
  const t = convexTest(schema, modules);
  const key = "obj_terminal_watchdog";
  const contractId = `contract_${key}`;
  const watchToken = `mpass:${contractId}:r1:${now}`;
  await t.mutation(async (ctx) => {
    await ctx.db.insert("objectives", {
      key,
      data: {
        ...completedObjectiveRow(key),
        management: {
          ...completedObjectiveRow(key).management,
          // A watch marker somehow still present alongside completed state
          // (e.g. a race with the settle write) must not resurrect the loop.
          managementPassWatch: { watchToken, contractId, contractRevision: 1, armedAt: now },
        },
      } as never,
    });
  });

  const before = await scheduledJobs(t, "runManagementPass");
  await t.mutation(async (ctx) =>
    (recoverStalledManagementPass as unknown as Handler)._handler(ctx, {
      objectiveKey: key,
      watchToken,
    }),
  );

  const row = await loadRow(t, key);
  const data = row?.data as { state: string };
  assert.equal(data.state, "completed", "recovery watchdog must not regress completed state");

  const after = await scheduledJobs(t, "runManagementPass");
  assert.equal(after.length, before.length, "recovery watchdog must not schedule new work after completion");
});

test("timer wake after completion is a no-op: state holds, no new management-pass job", async () => {
  const t = convexTest(schema, modules);
  const key = "obj_terminal_timer";
  await insertCompletedObjective(t, key);

  const before = await scheduledJobs(t, "runManagementPass");
  await t.mutation(async (ctx) =>
    (runManagementPass as unknown as Handler)._handler(ctx, { objectiveKey: key, reason: "timeout" }),
  );
  const after = await scheduledJobs(t, "runManagementPass");

  // The no-op boundary itself must not schedule a follow-up pass.
  assert.equal(after.length, before.length);

  const row = await loadRow(t, key);
  assert.equal((row?.data as { state: string }).state, "completed");
});

test("completion remains visible in Product Workspace after a stale post-completion wake", async () => {
  const t = convexTest(schema, modules);
  const key = "obj_terminal_workspace";
  await insertCompletedObjective(t, key);

  await t.mutation(async (ctx) =>
    (runManagementPass as unknown as Handler)._handler(ctx, { objectiveKey: key, reason: "timeout" }),
  );

  const row = await loadRow(t, key);
  const data = row?.data as { state: string; management?: { contractId?: string | null } };
  assert.equal(data.state, "completed");
  assert.ok(
    data.management?.contractId,
    "the accepted Objective's governing contract must remain readable after the stale wake",
  );
});

test("Boundary B: writeObjectiveState refuses to overwrite accepted completion with a non-completed state", async () => {
  const t = convexTest(schema, modules);
  const key = "obj_terminal_write_fence";
  await insertCompletedObjective(t, key);

  await t.mutation(async (ctx) => {
    const ports = buildConvexManagementPorts(ctx);
    await ports.writeObjectiveState(
      key,
      "escalated",
      "budget limit maxNoProgressCycles: 3 consecutive cycles produced no materially new observation",
      now + 60_000,
    );
  });

  const row = await loadRow(t, key);
  const data = row?.data as { state: string; updatedAt: number };
  assert.equal(data.state, "completed", "writeObjectiveState must refuse the overwrite");
  assert.equal(data.updatedAt, now, "a refused write must not touch the row at all");
});

test("Boundary B: writeObjectiveState allows an idempotent completed -> completed write", async () => {
  const t = convexTest(schema, modules);
  const key = "obj_terminal_write_idempotent";
  await insertCompletedObjective(t, key);

  await t.mutation(async (ctx) => {
    const ports = buildConvexManagementPorts(ctx);
    await ports.writeObjectiveState(key, "completed", "gate accepted completion (replay)", now + 60_000);
  });

  const row = await loadRow(t, key);
  const data = row?.data as { state: string };
  assert.equal(data.state, "completed");
});

test("no-op post-completion pass never spends decision budget or model-call budget", async () => {
  const t = convexTest(schema, modules);
  const key = "obj_terminal_budget";
  await insertCompletedObjective(t, key);

  await t.mutation(async (ctx) =>
    (runManagementPass as unknown as Handler)._handler(ctx, { objectiveKey: key, reason: "timeout" }),
  );

  // The no-op boundary returns before any budget/graph module is touched, so
  // no budget row should exist for this objective at all.
  const budgetRow = await t.run(async (ctx) =>
    ctx.db
      .query("objectiveBudgets")
      .withIndex("by_objectiveKey", (q) => q.eq("objectiveKey", key))
      .unique(),
  );
  assert.equal(budgetRow, null, "no budget row should be created by a completed no-op pass");
});
