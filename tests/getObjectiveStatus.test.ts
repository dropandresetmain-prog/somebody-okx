// I/O hardening — getObjectiveStatus is the lightweight status read the
// model-portability gate polls every 5s instead of full getObjective +
// getObjectiveWorkspaceV2. It must expose exactly what a poll loop needs
// (state + requirement state/strategy) and nothing heavier.

import test from "node:test";
import assert from "node:assert/strict";
import { convexTest } from "convex-test";
import schema from "../convex/schema";
import { getObjectiveStatus } from "../convex/objectives";
import { putRequirement } from "../convex/internal/workforce";
import type { ObjectiveRecord } from "../lib/objective/types";
import type { Requirement } from "../lib/management/types";
import { CP2_REQUIREMENT_FIELDS } from "./helpers/cp2Requirement";

const modules = {
  "../convex/schema.ts": () => import("../convex/schema"),
  "../convex/objectiveValidators.ts": () => import("../convex/objectiveValidators"),
  "../convex/managementValidators.ts": () => import("../convex/managementValidators"),
  "../convex/workforceGuards.ts": () => import("../convex/workforceGuards"),
  "../convex/internal/workforce.ts": () => import("../convex/internal/workforce"),
  "../convex/objectives.ts": () => import("../convex/objectives"),
  "../convex/_generated/api.d.ts": () => import("../convex/_generated/api"),
  "../convex/_generated/server.d.ts": () => import("../convex/_generated/server"),
  "../convex/_generated/dataModel.d.ts": () => import("../convex/_generated/dataModel"),
};

const now = 1840000000000;

const callMutation = (fn: unknown, ctx: unknown, args: Record<string, unknown>) =>
  (fn as { _handler: (ctx: unknown, args: Record<string, unknown>) => Promise<unknown> })._handler(ctx, args);

test("getObjectiveStatus returns null for an unknown objective", async () => {
  const t = convexTest(schema, modules);
  const result = await t.query(async (ctx) =>
    (getObjectiveStatus as unknown as { _handler: (ctx: unknown, args: Record<string, unknown>) => Promise<unknown> })
      ._handler(ctx, { objectiveKey: "obj_missing" }),
  );
  assert.equal(result, null);
});

test("getObjectiveStatus returns state and per-requirement state/strategy without evidence or events", async () => {
  const t = convexTest(schema, modules);

  const record: ObjectiveRecord = {
    key: "obj_status_1",
    request: "test",
    createdAt: now,
    updatedAt: now + 5000,
    state: "executing",
    activity: "test",
    plan: null,
    workItems: [],
    run: null,
    result: null,
  } as ObjectiveRecord;

  await t.mutation(async (ctx) => {
    await ctx.db.insert("objectives", { key: "obj_status_1", data: record });
  });

  const requirement: Requirement = {
    requirementKey: "req_status_1",
    objectiveKey: "obj_status_1",
    contractId: "contract_status_1",
    contractRevision: 1,
    priority: "required",
    title: "test requirement",
    mustBeTrue: "test must be true",
    scope: "test scope",
    proofs: [],
    state: "active",
    strategy: "MAKE",
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
      objectiveKey: "obj_status_1",
      requirementKey: "req_status_1",
      data: requirement,
      currentContractRevision: 1,
    }),
  );

  const result = (await t.query(async (ctx) =>
    (getObjectiveStatus as unknown as { _handler: (ctx: unknown, args: Record<string, unknown>) => Promise<unknown> })
      ._handler(ctx, { objectiveKey: "obj_status_1" }),
  )) as { key: string; state: string; updatedAt: number; requirements: Array<{ requirementKey: string; state: string; strategy: string | null }> };

  assert.equal(result.key, "obj_status_1");
  assert.equal(result.state, "executing");
  assert.equal(result.updatedAt, now + 5000);
  assert.equal(result.requirements.length, 1);
  assert.equal(result.requirements[0].requirementKey, "req_status_1");
  assert.equal(result.requirements[0].state, "active");
  assert.equal(result.requirements[0].strategy, "MAKE");

  // The shape carries only status fields — no evidence/events/contract keys.
  assert.deepEqual(Object.keys(result).sort(), ["key", "requirements", "state", "updatedAt"]);
});
