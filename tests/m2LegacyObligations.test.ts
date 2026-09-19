// M2 legacy obligation tests — verifies the historical growth artifact requirement
// is restored behind the legacy/M2 boundary (isM4Managed predicate).
//
// Three critical scenarios:
// 1. Growth run that changes no company artifact does NOT complete (M2-legacy)
// 2. Growth run that does change the artifact completes normally (M2-legacy)
// 3. M4-managed row is NOT evaluated by the legacy obligation (gate decides)

import test from "node:test";
import assert from "node:assert/strict";
import { convexTest } from "convex-test";
import schema from "../convex/schema";
import { finishRun, readWorkerObservation } from "../convex/objectives";
import type { ObjectiveRecord } from "../lib/objective/types";
import { createWorkContract, createWorkerSpec } from "../lib/workforce";
import { sourceIdentity } from "../lib/objective/contract";
import { createArtifact, applyArtifactChange } from "../lib/objective/artifact";

const modules = {
  "../convex/schema.ts": () => import("../convex/schema"),
  "../convex/objectiveValidators.ts": () => import("../convex/objectiveValidators"),
  "../convex/objectives.ts": () => import("../convex/objectives"),
  "../convex/_generated/api.d.ts": () => import("../convex/_generated/api"),
  "../convex/_generated/server.d.ts": () => import("../convex/_generated/server"),
};

const now = 1800000000000;

// Growth contract: includes update_company_artifact permission
function createGrowthContract() {
  return createWorkContract({
    assignment: "Growth objective: improve launch artifact",
    idempotencyScope: "test:growth-wi-1",
    worker: {
      ...createWorkerSpec(["company_records_lookup", "public_information_research"]),
      allowedToolPermissions: ["read_company_record", "read_public_web", "record_finding", "update_company_artifact"],
    },
    sourceProofs: [
      { sourceClass: "company_record", minDistinctSources: 1 },
      { sourceClass: "public_web", minDistinctSources: 2 },
    ],
    resultRequirements: { summary: true, fit: true, risks: false, unknowns: false, recommendedNextAction: false },
  });
}

// Research contract: does NOT include update_company_artifact permission
function createResearchContract() {
  return createWorkContract({
    assignment: "Research objective: evaluate partnership target",
    idempotencyScope: "test:research-wi-1",
    worker: createWorkerSpec(["company_records_lookup", "public_information_research"]),
    sourceProofs: [
      { sourceClass: "company_record", minDistinctSources: 1 },
      { sourceClass: "public_web", minDistinctSources: 2 },
    ],
    resultRequirements: { summary: true, fit: true, risks: false, unknowns: false, recommendedNextAction: false },
  });
}

function createGrowthObjective(overrides: Partial<ObjectiveRecord> = {}): ObjectiveRecord {
  const contract = createGrowthContract();
  return {
    key: "test-growth-obj-1",
    request: "Improve the launch page",
    createdAt: now,
    updatedAt: now,
    state: "executing",
    activity: "Running",
    plan: null,
    workItems: [
      {
        id: "wi-1",
        objectiveKey: "test-growth-obj-1",
        title: "Growth work item",
        assignment: "Improve launch artifact",
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
      summary: "Improved launch page",
      fit: "Better messaging",
      risks: [],
      unknowns: [],
      recommendedNextAction: "Publish",
      completedAt: now,
    },
    ...overrides,
  };
}

function createResearchObjective(overrides: Partial<ObjectiveRecord> = {}): ObjectiveRecord {
  const contract = createResearchContract();
  return {
    key: "test-research-obj-1",
    request: "Evaluate partnership target",
    createdAt: now,
    updatedAt: now,
    state: "executing",
    activity: "Running",
    plan: null,
    workItems: [
      {
        id: "wi-1",
        objectiveKey: "test-research-obj-1",
        title: "Research work item",
        assignment: "Evaluate target",
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
      summary: "Partnership evaluation",
      fit: "Good fit",
      risks: [],
      unknowns: [],
      recommendedNextAction: "Contact",
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
    // Seed 1 company_record + 2 distinct public_web observations
    await ctx.db.insert("evidence", {
      objectiveKey,
      evidenceId: "ev-1",
      data: {
        sourceClass: "company_record",
        label: "Internal criteria",
        text: "Internal evaluation criteria",
        recordRef: "test/record",
        observedAt: now,
        recordedBy: "test",
        runId,
        origin: "application_observation",
        sourceId: sourceIdentity({ sourceClass: "company_record", recordRef: "test/record" }),
      },
    });
    await ctx.db.insert("evidence", {
      objectiveKey,
      evidenceId: "ev-2",
      data: {
        sourceClass: "public_web",
        label: "Public source 1",
        text: "Public information 1",
        url: "https://example.com",
        observedAt: now,
        recordedBy: "test",
        runId,
        origin: "application_observation",
        sourceId: sourceIdentity({ sourceClass: "public_web", url: "https://example.com" }),
      },
    });
    await ctx.db.insert("evidence", {
      objectiveKey,
      evidenceId: "ev-3",
      data: {
        sourceClass: "public_web",
        label: "Public source 2",
        text: "Public information 2",
        url: "https://other-site.com",
        observedAt: now,
        recordedBy: "test",
        runId,
        origin: "application_observation",
        sourceId: sourceIdentity({ sourceClass: "public_web", url: "https://other-site.com" }),
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

const callMutation = (fn: unknown, ctx: unknown, args: Record<string, unknown>) =>
  (fn as { _handler: (ctx: unknown, args: Record<string, unknown>) => Promise<unknown> })._handler(ctx, args);

const callQuery = (fn: unknown, ctx: unknown, args: Record<string, unknown>) =>
  (fn as { _handler: (ctx: unknown, args: Record<string, unknown>) => Promise<unknown> })._handler(ctx, args);

// ── Test 1: Growth run that changes NO artifact does NOT complete (M2-legacy) ──

test("A6: growth run with no artifact change does NOT complete (M2-legacy)", async () => {
  const t = convexTest(schema, modules);
  // Seed artifact at version 1 (no change by run-1)
  const seededArtifact = createArtifact({
    key: "launch",
    objectiveKey: "test-growth-obj-1",
    label: "Launch page",
    content: "Initial launch content",
    runId: "seed",
    at: now - 1000,
  });

  const record = createGrowthObjective({
    companyArtifacts: [seededArtifact],
  });
  await seedObjective(t, record);
  await seedEvidence(t, "test-growth-obj-1", "run-1");

  const result = await t.mutation(async (ctx) =>
    callMutation(finishRun, ctx, {
      objectiveKey: "test-growth-obj-1",
      runId: "run-1",
      failed: false,
    }),
  ) as { completed: boolean; unmet: string[] };

  assert.equal(result.completed, false, "growth run without artifact change does NOT complete");
  assert.ok(
    result.unmet.some((msg) => msg.includes("company_artifact: no version change by this run")),
    "unmet includes artifact obligation",
  );

  const updated = await getObjective(t, "test-growth-obj-1");
  assert.ok(updated, "objective exists");
  assert.equal(updated!.state, "failed", "state is failed (incomplete)");
});

// ── Test 2: Growth run that DOES change artifact completes normally (M2-legacy) ──

test("A6: growth run with artifact change completes normally (M2-legacy)", async () => {
  const t = convexTest(schema, modules);
  // Seed artifact at version 1, then apply change by run-1
  const v1 = createArtifact({
    key: "launch",
    objectiveKey: "test-growth-obj-1",
    label: "Launch page",
    content: "Initial launch content",
    runId: "seed",
    at: now - 1000,
  });
  const v2 = applyArtifactChange(v1, {
    content: "Improved launch content",
    changeNote: "Improved messaging",
    runId: "run-1",
    at: now,
  });

  const record = createGrowthObjective({
    companyArtifacts: [v2],
  });
  await seedObjective(t, record);
  await seedEvidence(t, "test-growth-obj-1", "run-1");

  const result = await t.mutation(async (ctx) =>
    callMutation(finishRun, ctx, {
      objectiveKey: "test-growth-obj-1",
      runId: "run-1",
      failed: false,
    }),
  ) as { completed: boolean; unmet: string[] };

  assert.equal(result.completed, true, "growth run with artifact change completes");
  assert.equal(result.unmet.length, 0, "no unmet requirements");

  const updated = await getObjective(t, "test-growth-obj-1");
  assert.ok(updated, "objective exists");
  assert.equal(updated!.state, "completed", "M2-legacy: state is completed");
});

// ── Test 3: M4-managed row is NOT evaluated by legacy obligation ──

test("A6: M4-managed growth row is NOT evaluated by legacy obligation (gate decides)", async () => {
  const t = convexTest(schema, modules);
  // M4-managed row with NO artifact change — but the legacy obligation must NOT apply
  const seededArtifact = createArtifact({
    key: "launch",
    objectiveKey: "test-growth-obj-1",
    label: "Launch page",
    content: "Initial launch content",
    runId: "seed",
    at: now - 1000,
  });

  const record = createGrowthObjective({
    companyArtifacts: [seededArtifact],
    management: {
      contractId: "contract-1",
      currentContractRevision: 1,
      controlNotes: [],
    },
  } as unknown as ObjectiveRecord);
  await seedObjective(t, record);
  await seedEvidence(t, "test-growth-obj-1", "run-1");

  const result = await t.mutation(async (ctx) =>
    callMutation(finishRun, ctx, {
      objectiveKey: "test-growth-obj-1",
      runId: "run-1",
      failed: false,
    }),
  ) as { completed: boolean; unmet: string[] };

  // The spine reports completion (contract proof satisfied), but the state stays "executing"
  // because M4-managed rows await the independent gate. The legacy artifact obligation
  // must NOT apply to M4-managed rows.
  assert.equal(result.completed, true, "spine reports completion (contract proof satisfied)");
  assert.equal(result.unmet.length, 0, "no unmet requirements (legacy obligation does NOT apply)");

  const updated = await getObjective(t, "test-growth-obj-1");
  assert.ok(updated, "objective exists");
  assert.equal(updated!.state, "executing", "M4-managed: state stays executing (awaiting gate)");

  const management = (updated as unknown as { management?: { controlNotes?: unknown[] } }).management;
  assert.ok(management, "management extension exists");
  assert.ok(management.controlNotes, "controlNotes exists");
  assert.equal(management.controlNotes!.length, 1, "completion_proposed note exists");
});

// ── Test 4: Research contract (no update_company_artifact) is unaffected ──

test("A6: research contract (no artifact permission) is unaffected by M2 obligation", async () => {
  const t = convexTest(schema, modules);
  const record = createResearchObjective();
  await seedObjective(t, record);
  await seedEvidence(t, "test-research-obj-1", "run-1");

  const result = await t.mutation(async (ctx) =>
    callMutation(finishRun, ctx, {
      objectiveKey: "test-research-obj-1",
      runId: "run-1",
      failed: false,
    }),
  ) as { completed: boolean; unmet: string[] };

  assert.equal(result.completed, true, "research contract completes without artifact change");
  assert.equal(result.unmet.length, 0, "no unmet requirements");

  const updated = await getObjective(t, "test-research-obj-1");
  assert.ok(updated, "objective exists");
  assert.equal(updated!.state, "completed", "state is completed");
});

// ── Test 5: readWorkerObservation reports M2 obligation in unmet requirements ──

test("A6: readWorkerObservation reports artifact obligation in unmet requirements (M2-legacy)", async () => {
  const t = convexTest(schema, modules);
  const seededArtifact = createArtifact({
    key: "launch",
    objectiveKey: "test-growth-obj-1",
    label: "Launch page",
    content: "Initial launch content",
    runId: "seed",
    at: now - 1000,
  });

  const record = createGrowthObjective({
    companyArtifacts: [seededArtifact],
  });
  await seedObjective(t, record);
  await seedEvidence(t, "test-growth-obj-1", "run-1");

  const result = await t.query(async (ctx) =>
    callQuery(readWorkerObservation, ctx, {
      objectiveKey: "test-growth-obj-1",
      runId: "run-1",
    }),
  ) as { unmetCompletionRequirements: string[] };

  assert.ok(
    result.unmetCompletionRequirements.some((msg) => msg.includes("company_artifact: no version change by this run")),
    "readWorkerObservation reports artifact obligation",
  );
});
