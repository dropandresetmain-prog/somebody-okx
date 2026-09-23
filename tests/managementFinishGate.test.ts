// CP7 completion-gate proposal path tests.
// Verifies that finishRun routes completion inference through the gate proposal mechanism:
// 1. M2-legacy rows (no management.contractId): spine completes, controlNote carries proposal
// 2. M4-managed rows (management.contractId set): spine proposes, state stays "executing"
// 3. Failure and buy_pending paths unchanged

import test from "node:test";
import assert from "node:assert/strict";
import { convexTest } from "convex-test";
import schema from "../convex/schema";
import { finishRun } from "../convex/objectives";
import type { ObjectiveRecord } from "../lib/objective/types";
import { createWorkContract, createWorkerSpec, evaluateCompletion } from "../lib/workforce";
import { sourceIdentity } from "../lib/objective/contract";

const modules = {
  "../convex/schema.ts": () => import("../convex/schema"),
  "../convex/objectiveValidators.ts": () => import("../convex/objectiveValidators"),
  "../convex/objectives.ts": () => import("../convex/objectives"),
  "../convex/_generated/api.d.ts": () => import("../convex/_generated/api"),
  "../convex/_generated/server.d.ts": () => import("../convex/_generated/server"),
};

const now = 1800000000000;

function createMinimalObjective(overrides: Partial<ObjectiveRecord> = {}): ObjectiveRecord {
  const contract = createWorkContract({
    assignment: "Test objective",
    idempotencyScope: "test:wi-1",
    worker: createWorkerSpec(["company_records_lookup"]),
    sourceProofs: [{ sourceClass: "company_record", minDistinctSources: 1 }],
    resultRequirements: { summary: true, fit: true, risks: false, unknowns: false, recommendedNextAction: false },
  });

  return {
    key: "test-obj-1",
    request: "Test request",
    createdAt: now,
    updatedAt: now,
    state: "executing",
    activity: "Running",
    plan: null,
    workItems: [
      {
        id: "wi-1",
        objectiveKey: "test-obj-1",
        title: "Test work item",
        assignment: "Test assignment",
        workerKey: "worker-1",
        state: "running",
        contract,
        runs: [
          {
            id: "run-1",
            workItemId: "wi-1",
            status: "running",
            startedAt: now,
            leaseUntil: now + 300000,
            model: "test-model",
            modelSelectionReason: "test",
            toolCalls: 0,
            summary: "",
          },
        ],
      },
    ],
    run: {
      id: "run-1",
      workItemId: "wi-1",
      status: "running",
      startedAt: now,
      leaseUntil: now + 300000,
      model: "test-model",
      modelSelectionReason: "test",
      toolCalls: 0,
      summary: "",
    },
    result: {
      summary: "Test result",
      fit: "Good fit",
      risks: [],
      unknowns: [],
      recommendedNextAction: "Proceed",
      completedAt: now,
    },
    ...overrides,
  };
}

async function seedObjective(t: ReturnType<typeof convexTest>, record: ObjectiveRecord) {
  await t.mutation(async (ctx) => {
    await ctx.db.insert("objectives", {
      key: record.key,
      data: record,
    });
  });
}

async function seedEvidence(
  t: ReturnType<typeof convexTest>,
  objectiveKey: string,
  runId: string,
) {
  await t.mutation(async (ctx) => {
    await ctx.db.insert("evidence", {
      objectiveKey,
      evidenceId: "ev-1",
      data: {
        sourceClass: "company_record",
        label: "Test evidence",
        text: "Test evidence text",
        recordRef: "test/record",
        observedAt: now,
        recordedBy: "test",
        runId,
        origin: "application_observation",
        sourceId: sourceIdentity({ sourceClass: "company_record", recordRef: "test/record" }),
      },
    });
  });
}

async function getObjective(t: ReturnType<typeof convexTest>, key: string): Promise<ObjectiveRecord | null> {
  return await t.query(async (ctx) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const db = ctx.db as any;
    const row = await db
      .query("objectives")
      .withIndex("by_key", (q: { eq: (field: string, value: unknown) => unknown }) => q.eq("key", key))
      .unique();
    return row ? (row as { data: ObjectiveRecord }).data : null;
  });
}

async function getEvents(t: ReturnType<typeof convexTest>, objectiveKey: string) {
  return await t.query(async (ctx) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const db = ctx.db as any;
    const rows = await db
      .query("objectiveEvents")
      .withIndex("by_objectiveKey", (q: { eq: (field: string, value: unknown) => unknown }) => q.eq("objectiveKey", objectiveKey))
      .collect();
    return rows.map((row: { data: unknown }) => row.data);
  });
}

const callMutation = (fn: unknown, ctx: unknown, args: Record<string, unknown>) =>
  (fn as { _handler: (ctx: unknown, args: Record<string, unknown>) => Promise<unknown> })._handler(ctx, args);

test("M2-legacy row: spine completes, controlNote carries completion_proposed, state is completed", async () => {
  const t = convexTest(schema, modules);
  const record = createMinimalObjective();
  await seedObjective(t, record);
  await seedEvidence(t, "test-obj-1", "run-1");

  const result = await t.mutation(async (ctx) =>
    callMutation(finishRun, ctx, {
      objectiveKey: "test-obj-1",
      runId: "run-1",
      failed: false,
    }),
  ) as { completed: boolean; unmet: string[] };

  assert.equal(result.completed, true, `spine reports completion unmet=${result.unmet.join("; ")}`);
  assert.equal(result.unmet.length, 0, "no unmet requirements");

  const updated = await getObjective(t, "test-obj-1");
  assert.ok(updated, "objective exists");
  assert.equal(updated!.state, "completed", "M2-legacy: state is completed");
  assert.equal(updated!.workItems[0].state, "completed", "workItem state is completed");
  assert.equal(updated!.workItems[0].runs[0].status, "stopped", "run status is stopped");

  const management = (updated as unknown as { management?: { controlNotes?: unknown[] } }).management;
  assert.ok(management, "management extension exists");
  assert.ok(management.controlNotes, "controlNotes exists");
  assert.equal(management.controlNotes!.length, 1, "exactly one control note");

  const note = management.controlNotes![0] as {
    type: string;
    proposalId: string;
    runId: string;
    spineVerdict: string;
    proposedAt: number;
  };
  assert.equal(note.type, "completion_proposed", "note type is completion_proposed");
  assert.equal(note.proposalId, "prop_test-obj-1_run-1", "proposalId format correct");
  assert.equal(note.runId, "run-1", "runId matches");
  assert.equal(note.spineVerdict, "complete", "spineVerdict is complete");
  assert.equal(typeof note.proposedAt, "number", "proposedAt is a number");
  assert.ok(note.proposedAt > 0, "proposedAt is a valid timestamp");

  const events = await getEvents(t, "test-obj-1");
  assert.equal(events.length, 1, "one event appended");
  assert.equal(events[0].kind, "result", "event kind is result");
  assert.ok(
    events[0].text.includes("completion proposed to the independent gate"),
    "event text mentions completion proposed, not completed",
  );
  assert.ok(
    !events[0].text.includes("Objective completed"),
    "event text does NOT claim objective completed",
  );
});

test("M4-managed row: spine proposes, state stays executing, controlNote carries completion_proposed", async () => {
  const t = convexTest(schema, modules);
  const record = createMinimalObjective({
    management: {
      contractId: "contract-1",
      currentContractRevision: 1,
      controlNotes: [],
    },
  } as unknown as ObjectiveRecord);
  await seedObjective(t, record);
  await seedEvidence(t, "test-obj-1", "run-1");

  const result = await t.mutation(async (ctx) =>
    callMutation(finishRun, ctx, {
      objectiveKey: "test-obj-1",
      runId: "run-1",
      failed: false,
    }),
  ) as { completed: boolean; unmet: string[] };

  assert.equal(result.completed, true, "spine reports completion");

  const updated = await getObjective(t, "test-obj-1");
  assert.ok(updated, "objective exists");
  assert.equal(updated!.state, "executing", "M4-managed: state stays executing (awaiting gate)");
  assert.equal(updated!.workItems[0].state, "completed", "workItem state is completed (spine verdict)");
  assert.equal(updated!.workItems[0].runs[0].status, "stopped", "run status is stopped");

  const management = (updated as unknown as { management?: { contractId: string | null; controlNotes?: unknown[] } }).management;
  assert.ok(management, "management extension exists");
  assert.equal(management.contractId, "contract-1", "contractId preserved");
  assert.ok(management.controlNotes, "controlNotes exists");
  assert.equal(management.controlNotes!.length, 1, "exactly one control note");

  const note = management.controlNotes![0] as { type: string; proposalId: string };
  assert.equal(note.type, "completion_proposed", "note type is completion_proposed");
  assert.equal(note.proposalId, "prop_test-obj-1_run-1", "proposalId format correct");

  const events = await getEvents(t, "test-obj-1");
  assert.equal(events.length, 1, "one event appended");
  assert.equal(events[0].kind, "result", "event kind is result");
  assert.ok(
    events[0].text.includes("completion proposed to the independent gate"),
    "event text mentions completion proposed",
  );
});

test("failure path: state is failed, no completion_proposed note", async () => {
  const t = convexTest(schema, modules);
  const record = createMinimalObjective();
  await seedObjective(t, record);

  const result = await t.mutation(async (ctx) =>
    callMutation(finishRun, ctx, {
      objectiveKey: "test-obj-1",
      runId: "run-1",
      failed: true,
      failureReason: "Test failure",
    }),
  ) as { completed: boolean; unmet: string[] };

  assert.equal(result.completed, false, "spine reports failure");

  const updated = await getObjective(t, "test-obj-1");
  assert.ok(updated, "objective exists");
  assert.equal(updated!.state, "failed", "state is failed");
  assert.equal(updated!.workItems[0].state, "failed", "workItem state is failed");
  assert.equal(updated!.workItems[0].runs[0].status, "failed", "run status is failed");
  assert.equal(updated!.workItems[0].runs[0].summary, "Test failure", "run summary is failure reason");

  const management = (updated as unknown as { management?: { controlNotes?: unknown[] } }).management;
  assert.ok(!management || !management.controlNotes || management.controlNotes.length === 0, "no completion_proposed note on failure");

  const events = await getEvents(t, "test-obj-1");
  assert.equal(events.length, 1, "one event appended");
  assert.equal(events[0].kind, "system", "event kind is system");
  assert.ok(events[0].text.includes("Run failed"), "event text mentions run failed");
});

test("buy_pending path: state is waiting_for_resource, no completion_proposed note", async () => {
  const t = convexTest(schema, modules);
  const record = createMinimalObjective({
    resourceNeeds: [
      {
        id: "need-1",
        resourceClass: "proprietary_data",
        purpose: "Test",
        reasonOwnedInsufficient: "Not owned",
        status: "buy_pending",
        proposedByRunId: "run-1",
      },
    ],
  } as unknown as ObjectiveRecord);
  await seedObjective(t, record);

  const result = await t.mutation(async (ctx) =>
    callMutation(finishRun, ctx, {
      objectiveKey: "test-obj-1",
      runId: "run-1",
      failed: false,
    }),
  ) as { completed: boolean; unmet: string[] };

  assert.equal(result.completed, false, "spine reports not completed");

  const updated = await getObjective(t, "test-obj-1");
  assert.ok(updated, "objective exists");
  assert.equal(updated!.state, "waiting_for_resource", "state is waiting_for_resource");
  assert.equal(updated!.workItems[0].state, "waiting_for_resource", "workItem state is waiting_for_resource");
  assert.equal(updated!.workItems[0].runs[0].status, "stopped", "run status is stopped");
  assert.equal(
    updated!.workItems[0].runs[0].summary,
    "Paused: waiting for external resource acquisition",
    "run summary is buy_pending message",
  );

  const management = (updated as unknown as { management?: { controlNotes?: unknown[] } }).management;
  assert.ok(!management || !management.controlNotes || management.controlNotes.length === 0, "no completion_proposed note on buy_pending");

  const events = await getEvents(t, "test-obj-1");
  assert.equal(events.length, 1, "one event appended");
  assert.equal(events[0].kind, "decision", "event kind is decision");
  assert.ok(
    events[0].text.includes("waiting_for_resource"),
    "event text mentions waiting_for_resource",
  );
});

test("incomplete run: state is failed, no completion_proposed note", async () => {
  const t = convexTest(schema, modules);
  const record = createMinimalObjective({
    result: null, // no result → incomplete
  });
  await seedObjective(t, record);

  const result = await t.mutation(async (ctx) =>
    callMutation(finishRun, ctx, {
      objectiveKey: "test-obj-1",
      runId: "run-1",
      failed: false,
    }),
  ) as { completed: boolean; unmet: string[] };

  assert.equal(result.completed, false, "spine reports not completed");

  const updated = await getObjective(t, "test-obj-1");
  assert.ok(updated, "objective exists");
  assert.equal(updated!.state, "failed", "state is failed (incomplete)");
  assert.equal(updated!.workItems[0].state, "failed", "workItem state is failed");

  const management = (updated as unknown as { management?: { controlNotes?: unknown[] } }).management;
  assert.ok(!management || !management.controlNotes || management.controlNotes.length === 0, "no completion_proposed note on incomplete");

  const events = await getEvents(t, "test-obj-1");
  assert.equal(events.length, 1, "one event appended");
  assert.equal(events[0].kind, "system", "event kind is system");
  assert.ok(
    events[0].text.includes("Objective not completed"),
    "event text mentions objective not completed",
  );
});
