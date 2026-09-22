// I/O hardening — listObjectives must read only the bounded, indexed set of
// recent Objective rows it returns, not the entire objectives table.
//
// Regression covered: `ctx.db.query("objectives").collect()` read every
// Objective document (including large management state) just to derive a
// 20-row navigation summary. This exercises the by_updatedAt index path and
// confirms the returned set is correctly bounded and ordered.

import test from "node:test";
import assert from "node:assert/strict";
import { convexTest } from "convex-test";
import schema from "../convex/schema";
import { listObjectives } from "../convex/objectives";
import type { ObjectiveRecord } from "../lib/objective/types";

const modules = {
  "../convex/schema.ts": () => import("../convex/schema"),
  "../convex/objectiveValidators.ts": () => import("../convex/objectiveValidators"),
  "../convex/objectives.ts": () => import("../convex/objectives"),
  "../convex/_generated/api.d.ts": () => import("../convex/_generated/api"),
  "../convex/_generated/server.d.ts": () => import("../convex/_generated/server"),
};

const now = 1830000000000;

function makeObjective(key: string, updatedAt: number): ObjectiveRecord {
  return {
    key,
    request: `request for ${key}`,
    createdAt: updatedAt,
    updatedAt,
    state: "planning",
    activity: "test",
    plan: null,
    workItems: [],
    run: null,
    result: null,
  } as ObjectiveRecord;
}

test("listObjectives returns only the 20 most-recently-updated objectives, newest first", async () => {
  const t = convexTest(schema, modules);

  const total = 35;
  await t.mutation(async (ctx) => {
    for (let i = 0; i < total; i += 1) {
      const key = `obj_bounded_${i}`;
      await ctx.db.insert("objectives", { key, data: makeObjective(key, now + i) });
    }
  });

  const result = await t.query(async (ctx) =>
    (listObjectives as unknown as { _handler: (ctx: unknown, args: Record<string, unknown>) => Promise<unknown> })
      ._handler(ctx, {}),
  );

  const rows = result as Array<{ key: string; updatedAt: number }>;
  assert.equal(rows.length, 20, "must be bounded to 20 rows regardless of table size");

  // Newest first.
  for (let i = 0; i < rows.length - 1; i += 1) {
    assert.ok(rows[i].updatedAt >= rows[i + 1].updatedAt, "must be sorted newest-first");
  }
  // The most recent 20 (indices 15..34) must be present; the oldest 15 must not.
  const keys = new Set(rows.map((r) => r.key));
  assert.ok(keys.has(`obj_bounded_${total - 1}`), "newest row must be included");
  assert.ok(!keys.has("obj_bounded_0"), "oldest row must be excluded once past the bound");
});
