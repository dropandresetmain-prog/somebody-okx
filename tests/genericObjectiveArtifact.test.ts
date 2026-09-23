// Generic /start deliverable workspace vs canonical launch artifact isolation.

import test, { mock, after as afterAll } from "node:test";
import assert from "node:assert/strict";
import { convexTest } from "convex-test";
import schema from "../convex/schema";
import { createObjectiveV1 } from "../convex/productCommands";
import { setupCanonicalDemoObjective, updateCompanyArtifact } from "../convex/objectives";
import { applyArtifactChange, createArtifact } from "../lib/objective/artifact";
import { artifactVersionsAuthoredByRuns } from "../lib/management/requirements";
import {
  CANONICAL_LAUNCH_ARTIFACT,
  GENERIC_OBJECTIVE_DELIVERABLE,
} from "../lib/objective/seedData";

mock.timers.enable({ apis: ["setTimeout", "Date"], now: 1_820_000_000_000 });
afterAll(() => mock.timers.reset());

const modules = {
  "../convex/schema.ts": () => import("../convex/schema"),
  "../convex/objectiveValidators.ts": () => import("../convex/objectiveValidators"),
  "../convex/managementValidators.ts": () => import("../convex/managementValidators"),
  "../convex/workforceValidators.ts": () => import("../convex/workforceValidators"),
  "../convex/workforceGuards.ts": () => import("../convex/workforceGuards"),
  "../convex/objectives.ts": () => import("../convex/objectives"),
  "../convex/objectiveCreate.ts": () => import("../convex/objectiveCreate"),
  "../convex/objectiveRunner.ts": () => import("../convex/objectiveRunner"),
  "../convex/productCommands.ts": () => import("../convex/productCommands"),
  "../convex/internal/workforce.ts": () => import("../convex/internal/workforce"),
  "../convex/management.ts": () => import("../convex/management"),
  "../convex/_generated/api.d.ts": () => import("../convex/_generated/api"),
  "../convex/_generated/server.d.ts": () => import("../convex/_generated/server"),
  "../convex/_generated/dataModel.d.ts": () => import("../convex/_generated/dataModel"),
};

type Handler = { _handler: (c: unknown, a: Record<string, unknown>) => Promise<unknown> };
const call = <A extends Record<string, unknown>>(fn: unknown, ctx: unknown, args: A) =>
  (fn as Handler)._handler(ctx, args);

const VALID_REQUEST =
  "Prepare a short weekly status note for the team covering blockers and next steps.";

test("createObjectiveV1 seeds neutral objective/deliverable, not canonical launch", async () => {
  const t = convexTest(schema, modules);
  const result = (await t.mutation(async (ctx) =>
    call(createObjectiveV1, ctx, { request: VALID_REQUEST }),
  )) as { accepted: boolean; objectiveId?: string };
  assert.equal(result.accepted, true);
  const row = await t.run(async (ctx) =>
    ctx.db.query("objectives").withIndex("by_key", (q) => q.eq("key", result.objectiveId!)).unique(),
  );
  const arts = (row?.data as { companyArtifacts: Array<Record<string, unknown>> }).companyArtifacts;
  assert.equal(arts.length, 1);
  assert.equal(arts[0]!.key, GENERIC_OBJECTIVE_DELIVERABLE.key);
  assert.equal(arts[0]!.label, GENERIC_OBJECTIVE_DELIVERABLE.label);
  assert.equal(arts[0]!.provenanceRunId, GENERIC_OBJECTIVE_DELIVERABLE.provenanceRunId);
  assert.equal(arts[0]!.version, 1);
  const blob = JSON.stringify(arts);
  assert.ok(!blob.includes(CANONICAL_LAUNCH_ARTIFACT.key));
  assert.ok(!blob.includes("Share Society"));
  assert.ok(!blob.toLowerCase().includes("somebody: an ai manager"));
});

test("seed deliverable does not count as worker-authored proof; worker version does", () => {
  const seed = createArtifact({
    key: GENERIC_OBJECTIVE_DELIVERABLE.key,
    objectiveKey: "obj_proof",
    label: GENERIC_OBJECTIVE_DELIVERABLE.label,
    content: GENERIC_OBJECTIVE_DELIVERABLE.initialContent,
    runId: GENERIC_OBJECTIVE_DELIVERABLE.provenanceRunId,
    at: 1,
  });
  const workerRuns = new Set(["run_worker_1"]);
  assert.deepEqual(artifactVersionsAuthoredByRuns([seed], workerRuns), {});

  const authored = applyArtifactChange(seed, {
    content: "Worker-authored draft of the weekly status note.",
    changeNote: "first worker draft",
    runId: "run_worker_1",
    at: 2,
  });
  assert.equal(authored.version, 2);
  assert.equal(authored.provenanceRunId, "run_worker_1");
  assert.deepEqual(artifactVersionsAuthoredByRuns([authored], workerRuns), {
    [GENERIC_OBJECTIVE_DELIVERABLE.key]: 2,
  });
});

test("setupCanonicalDemoObjective still seeds the canonical launch artifact", async () => {
  const t = convexTest(schema, modules);
  const OPERATOR_TOKEN = "founder-e2e-demo-operator";
  const previousToken = process.env.SOMEBODY_DEMO_OPERATOR_TOKEN;
  process.env.SOMEBODY_DEMO_OPERATOR_TOKEN = OPERATOR_TOKEN;
  try {
    const result = (await t.mutation(async (ctx) =>
      call(setupCanonicalDemoObjective, ctx, {
        operatorToken: OPERATOR_TOKEN,
        spendLimitUsd: 5,
      }),
    )) as { key: string };
    const row = await t.run(async (ctx) =>
      ctx.db.query("objectives").withIndex("by_key", (q) => q.eq("key", result.key)).unique(),
    );
    const arts = (row?.data as { companyArtifacts: Array<{ key: string }> }).companyArtifacts;
    assert.ok(arts.some((a) => a.key === CANONICAL_LAUNCH_ARTIFACT.key));
    assert.ok(!arts.some((a) => a.key === GENERIC_OBJECTIVE_DELIVERABLE.key));
  } finally {
    if (previousToken === undefined) delete process.env.SOMEBODY_DEMO_OPERATOR_TOKEN;
    else process.env.SOMEBODY_DEMO_OPERATOR_TOKEN = previousToken;
  }
});

test("MAKE can update the generic deliverable artifact on a seeded Objective", async () => {
  const t = convexTest(schema, modules);
  const created = (await t.mutation(async (ctx) =>
    call(createObjectiveV1, ctx, { request: VALID_REQUEST }),
  )) as { accepted: true; objectiveId: string };
  const key = created.objectiveId;
  const now = Date.now();
  const runId = "run_make_generic";

  await t.mutation(async (ctx) => {
    const row = await ctx.db.query("objectives").withIndex("by_key", (q) => q.eq("key", key)).unique();
    assert.ok(row);
    const data = row.data as Record<string, unknown>;
    const run = {
      id: runId,
      workItemId: "wi_1",
      status: "running" as const,
      startedAt: now,
      leaseUntil: now + 60_000,
      model: "test/model",
      modelSelectionReason: "test",
      toolCalls: 0,
      summary: "",
    };
    await ctx.db.patch(row._id, {
      data: {
        ...data,
        state: "executing",
        updatedAt: now,
        workItems: [
          {
            id: "wi_1",
            objectiveKey: key,
            title: "Write deliverable",
            assignment: "update deliverable",
            workerKey: "worker_test",
            state: "running",
            contract: {
              assignment: "update deliverable",
              idempotencyScope: "wi_1",
              workerKey: "worker_test",
              capabilityKeys: ["growth_launch_operations"],
              allowedToolPermissions: ["update_company_artifact"],
              requiredSourceClasses: [],
              minObservations: 0,
              sourceProofs: [],
              requiredVerifiedEffectKeys: [],
              approvalVersion: null,
              resultRequirements: {
                summary: true,
                fit: true,
                risks: true,
                unknowns: true,
                recommendedNextAction: true,
              },
              targetArtifactKey: GENERIC_OBJECTIVE_DELIVERABLE.key,
            },
            runs: [run],
          },
        ],
        run,
      } as never,
    });
  });

  const before = await t.run(async (ctx) => {
    const row = await ctx.db.query("objectives").withIndex("by_key", (q) => q.eq("key", key)).unique();
    return (row?.data as { companyArtifacts: Array<{ key: string; version: number }> }).companyArtifacts;
  });
  assert.equal(before[0]?.key, GENERIC_OBJECTIVE_DELIVERABLE.key);
  assert.equal(before[0]?.version, 1);

  const updated = (await t.mutation(async (ctx) =>
    call(updateCompanyArtifact, ctx, {
      objectiveKey: key,
      runId,
      content: "Status note: blockers cleared; next steps listed.",
      changeNote: "worker draft",
    }),
  )) as { key: string; version: number };
  assert.equal(updated.key, GENERIC_OBJECTIVE_DELIVERABLE.key);
  assert.equal(updated.version, 2);
});
