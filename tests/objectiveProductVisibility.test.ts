// Incident #4 — product sidebar visibility.
//
// The product sidebar (getObjectiveListV1) must show only real founder
// Objectives, never internal/gate/eval/demo traffic that also flows through
// the shared `objectives` table via createReceivedObjective,
// objectives.submitObjective, or objectives.setupCanonicalDemoObjective.
//
// Visibility is an explicit, application-owned field (productVisibility:
// "visible" | "internal") set once at creation — never inferred from request
// text, title, ID prefix, or timestamps. Rows missing the field (legacy, from
// before this field existed) are treated as NOT visible: hidden by default.
//
// This file proves:
//   1. createObjectiveV1 (the real `/start` path) → visible in the list.
//   2. submitObjective (raw internal/gate/eval entrypoint) → hidden from the
//      list.
//   3. setupCanonicalDemoObjective (operator-gated canonical demo) → hidden
//      from the list.
//   4. A legacy row with no productVisibility field → hidden from the
//      product list, but still returned by objectives.listObjectives
//      (internal/debug reads stay unfiltered, by design).
//   5. The product list stays bounded at its display window even when many
//      internal rows are more recently updated than the visible ones — the
//      raw fetch window must be widened, not just filtered after a small
//      take().

import test, { mock, after as afterAll } from "node:test";
import assert from "node:assert/strict";
import { convexTest } from "convex-test";

import schema from "../convex/schema";
import { createObjectiveV1 } from "../convex/productCommands";
import { submitObjective, setupCanonicalDemoObjective, listObjectives } from "../convex/objectives";
import { getObjectiveListV1 } from "../convex/productWorkspace";
import type { ObjectiveRecord } from "../lib/objective/types";
import type { ObjectiveListView, ProductReadEnvelope } from "../app/product/contracts";

const modules = {
  "../convex/schema.ts": () => import("../convex/schema"),
  "../convex/objectiveValidators.ts": () => import("../convex/objectiveValidators"),
  "../convex/managementValidators.ts": () => import("../convex/managementValidators"),
  "../convex/workforceGuards.ts": () => import("../convex/workforceGuards"),
  "../convex/objectiveCreate.ts": () => import("../convex/objectiveCreate"),
  "../convex/productCommands.ts": () => import("../convex/productCommands"),
  "../convex/productWorkspace.ts": () => import("../convex/productWorkspace"),
  "../convex/objectives.ts": () => import("../convex/objectives"),
  "../convex/management.ts": () => import("../convex/management"),
  "../convex/objectiveRunner.ts": () => import("../convex/objectiveRunner"),
  "../convex/internal/workforce.ts": () => import("../convex/internal/workforce"),
  "../convex/_generated/api.d.ts": () => import("../convex/_generated/api"),
  "../convex/_generated/server.d.ts": () => import("../convex/_generated/server"),
  "../convex/_generated/dataModel.d.ts": () => import("../convex/_generated/dataModel"),
};

// Scheduled beginInterpretation (model chain) must never actually run in
// these tests — same discipline as createObjectiveCommand.test.ts.
mock.timers.enable({ apis: ["setTimeout", "Date"], now: 1_900_000_000_000 });
afterAll(() => mock.timers.reset());

type Handler = { _handler: (ctx: unknown, args: Record<string, unknown>) => Promise<unknown> };
const call = (fn: unknown, ctx: unknown, args: Record<string, unknown>) =>
  (fn as Handler)._handler(ctx, args);

const VALID_REQUEST = "Fix our launch messaging and prepare a relaunch pack.";
const OPERATOR_TOKEN = "objective-visibility-operator-token";

function allListedIds(envelope: ProductReadEnvelope<ObjectiveListView>): string[] {
  if (!envelope.found) return [];
  const { needsYou, done, inProgress } = envelope.view;
  return [...needsYou, ...done, ...inProgress].map((row) => row.id);
}

function makeLegacyObjective(key: string, updatedAt: number): ObjectiveRecord {
  // Deliberately omits productVisibility — this is what every row written
  // before this field existed looks like.
  return {
    key,
    request: `legacy request for ${key}`,
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

function makeVisibilityObjective(
  key: string,
  updatedAt: number,
  productVisibility: "visible" | "internal",
): ObjectiveRecord {
  return {
    key,
    request: `request for ${key}`,
    createdAt: updatedAt,
    updatedAt,
    state: "planning",
    activity: "test",
    productVisibility,
    plan: null,
    workItems: [],
    run: null,
    result: null,
  } as ObjectiveRecord;
}

test("getObjectiveListV1: createObjectiveV1 (real /start path) is visible", async () => {
  const t = convexTest(schema, modules);
  const result = (await t.mutation(async (ctx) =>
    call(createObjectiveV1, ctx, { request: VALID_REQUEST }),
  )) as { accepted: true; objectiveId: string } | { accepted: false };
  assert.equal(result.accepted, true);
  if (!result.accepted) return;

  const list = (await t.query(async (ctx) =>
    call(getObjectiveListV1, ctx, {}),
  )) as ProductReadEnvelope<ObjectiveListView>;
  assert.ok(
    allListedIds(list).includes(result.objectiveId),
    "an Objective created via createObjectiveV1 must appear in the product sidebar",
  );
});

test("getObjectiveListV1: submitObjective (raw internal/gate/eval entrypoint) is hidden", async () => {
  const t = convexTest(schema, modules);
  const { key } = (await t.mutation(async (ctx) =>
    call(submitObjective, ctx, { request: VALID_REQUEST }),
  )) as { key: string };

  const list = (await t.query(async (ctx) =>
    call(getObjectiveListV1, ctx, {}),
  )) as ProductReadEnvelope<ObjectiveListView>;
  assert.ok(
    !allListedIds(list).includes(key),
    "an Objective created via submitObjective must NOT appear in the product sidebar",
  );
});

test("getObjectiveListV1: setupCanonicalDemoObjective (operator demo) is hidden", async () => {
  const t = convexTest(schema, modules);
  const previousToken = process.env.SOMEBODY_DEMO_OPERATOR_TOKEN;
  process.env.SOMEBODY_DEMO_OPERATOR_TOKEN = OPERATOR_TOKEN;
  try {
    const { key } = (await t.mutation(async (ctx) =>
      call(setupCanonicalDemoObjective, ctx, {
        operatorToken: OPERATOR_TOKEN,
        spendLimitUsd: 3,
      }),
    )) as { key: string };

    const list = (await t.query(async (ctx) =>
      call(getObjectiveListV1, ctx, {}),
    )) as ProductReadEnvelope<ObjectiveListView>;
    assert.ok(
      !allListedIds(list).includes(key),
      "the canonical demo Objective must NOT appear in the product sidebar",
    );
  } finally {
    if (previousToken === undefined) delete process.env.SOMEBODY_DEMO_OPERATOR_TOKEN;
    else process.env.SOMEBODY_DEMO_OPERATOR_TOKEN = previousToken;
  }
});

test("getObjectiveListV1: legacy row with no productVisibility field is hidden, but objectives.listObjectives still returns it", async () => {
  const t = convexTest(schema, modules);
  const key = "obj_legacy_no_visibility";
  await t.run(async (ctx) => {
    await ctx.db.insert("objectives", { key, data: makeLegacyObjective(key, Date.now()) });
  });

  const list = (await t.query(async (ctx) =>
    call(getObjectiveListV1, ctx, {}),
  )) as ProductReadEnvelope<ObjectiveListView>;
  assert.ok(
    !allListedIds(list).includes(key),
    "a legacy row with no visibility field must be hidden from the product sidebar by default",
  );

  const internalRows = (await t.query(async (ctx) =>
    call(listObjectives, ctx, {}),
  )) as Array<{ key: string }>;
  assert.ok(
    internalRows.some((row) => row.key === key),
    "objectives.listObjectives (internal/debug read) must keep returning the legacy row unfiltered",
  );
});

test("getObjectiveListV1: stays bounded at the display window even when internal rows are more recently updated than visible rows", async () => {
  const t = convexTest(schema, modules);
  const now = Date.now();

  // 25 real product rows, older updatedAt — more than the 20-row display cap,
  // so this also proves the cap still applies to visible rows.
  const visibleCount = 25;
  const visibleKeys: string[] = [];
  await t.mutation(async (ctx) => {
    for (let i = 0; i < visibleCount; i += 1) {
      const key = `obj_visible_${i}`;
      visibleKeys.push(key);
      await ctx.db.insert("objectives", {
        key,
        data: makeVisibilityObjective(key, now + i, "visible"),
      });
    }
  });

  // 30 internal rows, all updated AFTER every visible row. A naive
  // take(20)-then-filter would return zero real rows here.
  const internalCount = 30;
  await t.mutation(async (ctx) => {
    for (let i = 0; i < internalCount; i += 1) {
      const key = `obj_internal_${i}`;
      await ctx.db.insert("objectives", {
        key,
        data: makeVisibilityObjective(key, now + visibleCount + i, "internal"),
      });
    }
  });

  const list = (await t.query(async (ctx) =>
    call(getObjectiveListV1, ctx, {}),
  )) as ProductReadEnvelope<ObjectiveListView>;
  const ids = allListedIds(list);

  assert.equal(ids.length, 20, "product list must stay bounded at the display window (20)");
  assert.ok(
    ids.every((id) => visibleKeys.includes(id)),
    "every returned row must be a real (visible) product row, none internal",
  );
  // The 20 returned should be the most-recently-updated 20 of the visible
  // set (obj_visible_5 .. obj_visible_24), proving the widened raw fetch
  // window reached back far enough past the internal noise.
  for (let i = visibleCount - 20; i < visibleCount; i += 1) {
    assert.ok(ids.includes(`obj_visible_${i}`), `obj_visible_${i} must be present`);
  }
});
