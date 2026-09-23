// Portability gate regression (nex-1): once interpretation exhausts its refusal
// ceiling (BEGIN_INTERPRETATION_CEILING), no further proposeInterpretation is
// scheduled -- so without an explicit terminal transition the Objective was
// orphaned at state "received" forever: no wake, no timer, no founder-visible
// signal, indistinguishable from a just-submitted Objective. This can strand
// ANY model that hits two interpretation refusals/timeouts, so it is a generic
// engine defect, not a model weakness.
import test from "node:test";
import assert from "node:assert/strict";
import { convexTest } from "convex-test";
import schema from "../convex/schema";
import { beginInterpretation, BEGIN_INTERPRETATION_CEILING } from "../convex/management";
import type { ObjectiveRecord } from "../lib/objective/types";

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
const now = 1_985_000_000_000;
const key = "obj_interp_ceiling";

test("interpretation ceiling exhausted transitions to a visible terminal state, not silent orphaning", async () => {
  const t = convexTest(schema, modules);
  await t.mutation(async (ctx) => {
    await ctx.db.insert("objectives", {
      key,
      data: {
        key,
        request: "fix our launch messaging",
        createdAt: now,
        updatedAt: now,
        state: "received",
        activity: "Objective received.",
        plan: null,
        workItems: [],
        run: null,
        result: null,
        companyArtifacts: [],
        management: {
          contractId: null,
          interpretationStatus: "refused",
          interpretationAttempts: BEGIN_INTERPRETATION_CEILING,
        },
      } as never,
    });
  });

  const result = (await t.mutation(async (ctx) =>
    (beginInterpretation as unknown as Handler)._handler(ctx, { objectiveKey: key, at: now }),
  )) as { proceed: boolean; reason: string };

  assert.equal(result.proceed, false);
  assert.match(result.reason, /interpretation ceiling reached/);

  const row = await t.query(async (ctx) => {
    const r = await ctx.db.query("objectives").withIndex("by_key", (q) => q.eq("key", key)).unique();
    return (r as { data: ObjectiveRecord }).data;
  });
  assert.equal(row.state, "escalated", "Objective must not remain 'received' (indistinguishable from a fresh submission)");
  assert.match(row.activity, /interpretation ceiling reached/);
});

test("beginInterpretation below the ceiling is unaffected (still proceeds, state untouched)", async () => {
  const t = convexTest(schema, modules);
  const belowKey = "obj_interp_below_ceiling";
  await t.mutation(async (ctx) => {
    await ctx.db.insert("objectives", {
      key: belowKey,
      data: {
        key: belowKey,
        request: "fix our launch messaging",
        createdAt: now,
        updatedAt: now,
        state: "received",
        activity: "Objective received.",
        plan: null,
        workItems: [],
        run: null,
        result: null,
        companyArtifacts: [],
        management: { contractId: null, interpretationStatus: "refused", interpretationAttempts: 0 },
      } as never,
    });
  });
  const result = (await t.mutation(async (ctx) =>
    (beginInterpretation as unknown as Handler)._handler(ctx, { objectiveKey: belowKey, at: now }),
  )) as { proceed: boolean };
  assert.equal(result.proceed, true);
  const row = await t.query(async (ctx) => {
    const r = await ctx.db.query("objectives").withIndex("by_key", (q) => q.eq("key", belowKey)).unique();
    return (r as { data: ObjectiveRecord }).data;
  });
  assert.equal(row.state, "received");
});
