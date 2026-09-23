// Founder live-run: a timed-out first management pass must not strand the Objective.

import test from "node:test";
import assert from "node:assert/strict";
import { convexTest } from "convex-test";
import schema from "../convex/schema";
import { putContract, putRequirement, initBudget } from "../convex/internal/workforce";
import {
  applyInterpretation,
  beginInterpretation,
  recoverStalledManagementPass,
  MANAGEMENT_PASS_RECOVERY_DELAY_MS,
} from "../convex/management";

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

test("applyInterpretation arms a bounded management-pass recovery watchdog", async () => {
  const t = convexTest(schema, modules);
  const key = "obj_recovery_watch";
  await t.mutation(async (ctx) => {
    await ctx.db.insert("objectives", {
      key,
      data: {
        key,
        request: "Launch social content for a new community.",
        createdAt: now,
        updatedAt: now,
        state: "received",
        activity: "Objective received.",
        plan: null,
        workItems: [],
        run: null,
        result: null,
        management: { contractId: null },
      } as never,
    });
  });

  const begin = (await t.mutation(async (ctx) =>
    (beginInterpretation as unknown as Handler)._handler(ctx, { objectiveKey: key, at: now }),
  )) as { proceed: boolean; requestId?: string };
  assert.equal(begin.proceed, true);
  const requestId = begin.requestId!;

  const applied = (await t.mutation(async (ctx) =>
    (applyInterpretation as unknown as Handler)._handler(ctx, {
      objectiveKey: key,
      requestId,
      rawContract: {
        intent: "community launch",
        levels: [{ levelKey: "goal", order: 1, statement: "goal", label: "Goal" }],
        minimumCompletionBar: "goal",
        ambiguities: [],
      },
      rawRequirements: [
        {
          requirementKey: "req_1",
          priority: "required",
          title: "The governed result is recorded",
          mustBeTrue: "an application observation supports the statement",
          scope: "company artifact + observation",
        },
      ],
      founderResolvedQuestions: [],
      at: now,
    }),
  )) as { ok: boolean; errors?: string[] };
  assert.equal(applied.ok, true, applied.errors?.join("; ") ?? "applyInterpretation failed");

  const row = await t.run(async (ctx) =>
    ctx.db.query("objectives").withIndex("by_key", (q) => q.eq("key", key)).unique(),
  );
  const watch = (row?.data as { management?: { managementPassWatch?: { watchToken: string } } }).management
    ?.managementPassWatch;
  assert.ok(watch?.watchToken);

  const allJobs = await t.run(async (ctx) => {
    const rows = await ctx.db.system.query("_scheduled_functions").collect();
    return rows.map((row) => ({
      name: String((row as { name?: string }).name ?? ""),
      args: (row as { args?: unknown }).args,
    }));
  });
  const blob = JSON.stringify(allJobs);
  assert.ok(blob.includes("runManagementPass"), `expected management pass job, saw: ${blob}`);
  assert.ok(
    blob.includes("recoverStalledManagementPass"),
    `expected recovery watchdog job, saw: ${blob}`,
  );
  assert.ok(blob.includes(watch!.watchToken));
});

test("recoverStalledManagementPass clears the watch and schedules a continuation pass", async () => {
  const t = convexTest(schema, modules);
  const key = "obj_recovery_retry";
  const contractId = `contract_${key}`;
  const watchToken = `mpass:${contractId}:r1:${now}`;

  await t.mutation(async (ctx) => {
    await ctx.db.insert("objectives", {
      key,
      data: {
        key,
        request: "Launch social content for a new community.",
        createdAt: now,
        updatedAt: now,
        state: "planning",
        activity: "Contract recorded.",
        plan: null,
        workItems: [],
        run: null,
        result: null,
        management: {
          contractId,
          currentContractRevision: 1,
          interpretationStatus: "done",
          managementPassWatch: {
            watchToken,
            contractId,
            contractRevision: 1,
            armedAt: now,
          },
        },
      } as never,
    });
  });

  await t.mutation(async (ctx) =>
    (recoverStalledManagementPass as unknown as Handler)._handler(ctx, {
      objectiveKey: key,
      watchToken,
    }),
  );

  const row = await t.run(async (ctx) =>
    ctx.db.query("objectives").withIndex("by_key", (q) => q.eq("key", key)).unique(),
  );
  const mgmt = (row?.data as { management?: Record<string, unknown> }).management ?? {};
  assert.ok(mgmt.managementPassWatch == null);

  const passes = await scheduledJobs(t, "runManagementPass");
  assert.ok(passes.length >= 1);
});

test("recoverStalledManagementPass is a no-op after a completed pass marker", async () => {
  const t = convexTest(schema, modules);
  const key = "obj_recovery_done";
  const contractId = `contract_${key}`;
  const watchToken = `mpass:${contractId}:r1:${now}`;

  await t.mutation(async (ctx) => {
    await ctx.db.insert("objectives", {
      key,
      data: {
        key,
        request: "Launch social content for a new community.",
        createdAt: now,
        updatedAt: now,
        state: "planning",
        activity: "Contract recorded.",
        plan: null,
        workItems: [],
        run: null,
        result: null,
        management: {
          contractId,
          currentContractRevision: 1,
          interpretationStatus: "done",
          managementPassWatch: {
            watchToken,
            contractId,
            contractRevision: 1,
            armedAt: now,
          },
          lastManagementPassCompletedAt: now + 1,
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
  const after = await scheduledJobs(t, "runManagementPass");
  assert.equal(after.length, before.length);
});
