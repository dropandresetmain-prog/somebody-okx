// CHECKPOINT 2: locked completion criteria + reopening correction critique
// must survive the REAL production Convex port, not just the query-side
// package builder. convex/objectives.ts::buildLoadedInputPackage already
// composes lockedCriteria/correction; convex/objectiveRunner.ts::makeConvexPort
// reconstructs loadedInputPackage by copying explicit fields and previously
// dropped both, so a corrective worker never saw the bar it was being
// measured against or the critique that reopened its deliverable.
import test, { mock, after as afterAll } from "node:test";
import assert from "node:assert/strict";
import { convexTest } from "convex-test";
import type { Model, ModelRequest, ModelResponse } from "@openai/agents-core";
import { Usage } from "@openai/agents-core";
import schema from "../convex/schema";
import { makeConvexPort } from "../convex/objectiveRunner";
import { runWorker } from "../lib/worker/runtime";
import { putContract, putRequirement } from "../convex/internal/workforce";
import { buildOutcomeContract, buildRequirement } from "../lib/management/contract";
import { recordFinding } from "../convex/objectives";
import { M61_SERIAL_V1 } from "../lib/management/executionProtocol";
import { createWorkContract, createWorkerSpec } from "../lib/workforce";
import type { Requirement } from "../lib/management/types";
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

mock.timers.enable({ apis: ["setTimeout"] });
afterAll(() => mock.timers.reset());

const now = 1_983_000_000_000;
type Backend = ReturnType<typeof convexTest>;
type Handler = { _handler: (c: unknown, a: Record<string, unknown>) => Promise<unknown> };

const SENTINEL_MUST_BE_TRUE = "SENTINEL_MUST_BE_TRUE: a versioned relaunch recommendation is saved with evidence";
const SENTINEL_EXPECTED_OUTPUT = "SENTINEL_EXPECTED_OUTPUT: saved relaunch recommendation";
const SENTINEL_BAR = "sentinel_bar_relaunch";
const SENTINEL_CRITIQUE = "SENTINEL_CRITIQUE: the artifact does not cite the acquired audience finding";
const SENTINEL_UNKNOWN = "SENTINEL_UNKNOWN: live conversion impact unmeasured";
const SENTINEL_NEXT_ACTION = "SENTINEL_NEXT_ACTION: cite the finding explicitly";

async function seedRunningSerialWithRequirement(
  t: Backend,
  key: string,
  runId: string,
): Promise<{ artifactKey: string }> {
  const artifactKey = "launch/page-message";
  const contractId = `c_${key}`;
  const workContract = createWorkContract({
    assignment: "Deliver relaunch recommendation",
    idempotencyScope: `${key}:run`,
    worker: createWorkerSpec([
      "growth_launch_operations",
      "company_records_lookup",
      "public_information_research",
    ]),
    sourceProofs: [{ sourceClass: "company_record", minDistinctSources: 1 }],
    inputEvidenceIds: [],
    targetArtifactKey: artifactKey,
  });

  await t.mutation(async (ctx) => {
    await ctx.db.insert("objectives", {
      key,
      data: {
        key,
        request: "relaunch messaging",
        createdAt: now,
        updatedAt: now,
        state: "executing",
        activity: "running",
        plan: null,
        workItems: [
          {
            id: "wi:asg_lc",
            objectiveKey: key,
            title: "relaunch",
            assignment: workContract.assignment,
            workerKey: workContract.workerKey,
            state: "running",
            contract: workContract,
            runs: [
              {
                id: runId,
                workItemId: "wi:asg_lc",
                status: "running",
                startedAt: now,
                leaseUntil: now + 120_000,
                model: "mock",
                modelSelectionReason: "test",
                toolCalls: 0,
                summary: "",
              },
            ],
          },
        ],
        run: {
          id: runId,
          workItemId: "wi:asg_lc",
          status: "running",
          startedAt: now,
          leaseUntil: now + 120_000,
          model: "mock",
          modelSelectionReason: "test",
          toolCalls: 0,
          summary: "",
        },
        result: null,
        companyArtifacts: [
          { key: artifactKey, version: 1, content: "draft v1", history: [] },
        ],
        management: {
          contractId,
          currentContractRevision: 1,
          executionProtocol: M61_SERIAL_V1,
          controlNotes: [],
        },
      } as never,
    });
  });

  const built = buildOutcomeContract({
    objectiveKey: key,
    contractId,
    revision: 1,
    parsed: {
      intent: "relaunch",
      levels: [
        { levelKey: SENTINEL_BAR, order: 1, statement: "saved relaunch exists", label: "Relaunch" },
      ],
      minimumCompletionBar: SENTINEL_BAR,
      ambiguities: [],
    },
    requestId: "r1",
    founderResolvedQuestions: [],
    at: now,
  });
  assert.equal(built.ok, true);
  const contract = (built as { ok: true; contract: never }).contract;

  const reqBuilt = buildRequirement(
    {
      objectiveKey: key,
      contract: contract as never,
      proposed: {
        requirementKey: "req_lc",
        priority: "required",
        title: "Relaunch recommendation",
        mustBeTrue: SENTINEL_MUST_BE_TRUE,
        scope: "founder-facing deliverable",
        dependsOnRequirementKeys: [],
        requiredResourceClasses: [],
        expectedOutput: SENTINEL_EXPECTED_OUTPUT,
        requirementKind: "deliverable",
      },
      artifactKeyForInternalProof: artifactKey,
      at: now,
    },
    null,
  );
  assert.ok(!("errors" in reqBuilt));
  const requirement = (reqBuilt as { requirement: Requirement }).requirement;

  await t.mutation(async (ctx) => {
    await (putContract as unknown as Handler)._handler(ctx, {
      objectiveKey: key,
      contractId,
      revision: 1,
      data: contract,
    });
    await (putRequirement as unknown as Handler)._handler(ctx, {
      objectiveKey: key,
      requirementKey: "req_lc",
      data: { ...requirement, state: "active", strategy: "MAKE" },
      currentContractRevision: 1,
    });
    await ctx.db.insert("assignments", {
      assignmentId: "asg_lc",
      objectiveKey: key,
      data: {
        assignmentId: "asg_lc",
        objectiveKey: key,
        requirementKey: "req_lc",
        contractRevision: 1,
        decisionId: "dec_lc",
        workerKey: workContract.workerKey,
        kind: "internal_make",
        state: "running",
        attempt: 1,
        runId,
        workContract,
        resultSummary: null,
        idempotencyScope: `${key}:run`,
        createdAt: now,
        updatedAt: now,
      } as never,
    });
  });

  return { artifactKey };
}

async function readLoadedInputPackage(t: Backend, key: string, runId: string) {
  return t.action(async (ctx) => {
    const port = makeConvexPort(ctx as unknown as Parameters<typeof makeConvexPort>[0], key, runId, true);
    return port.read();
  });
}

test("production port: sentinel lockedCriteria survives makeConvexPort reconstruction", async () => {
  const t = convexTest(schema, modules);
  const key = "obj_lc_criteria";
  const runId = "run_lc_criteria";
  await seedRunningSerialWithRequirement(t, key, runId);

  const observation = (await readLoadedInputPackage(t, key, runId)) as {
    loadedInputPackage?: {
      lockedCriteria?: {
        requirementKey: string;
        mustBeTrue: string;
        expectedOutput: string | null;
        minimumCompletionBar: string;
        contractRevision: number;
      };
      correction?: unknown;
    };
  };

  const locked = observation.loadedInputPackage?.lockedCriteria;
  assert.ok(locked, "lockedCriteria must survive the production port");
  assert.equal(locked!.requirementKey, "req_lc");
  assert.equal(locked!.mustBeTrue, SENTINEL_MUST_BE_TRUE);
  assert.equal(locked!.expectedOutput, SENTINEL_EXPECTED_OUTPUT);
  assert.equal(locked!.minimumCompletionBar, SENTINEL_BAR);
  assert.equal(locked!.contractRevision, 1);

  // 4. No correction exists yet — must not appear.
  assert.equal(observation.loadedInputPackage?.correction, undefined);
});

test("production port: sentinel correction critique, unknowns, and recommended action survive makeConvexPort reconstruction", async () => {
  const t = convexTest(schema, modules);
  const key = "obj_lc_correction";
  const runId = "run_lc_correction";
  await seedRunningSerialWithRequirement(t, key, runId);

  await t.mutation(async (ctx) => {
    const row = await ctx.db
      .query("objectives")
      .withIndex("by_key", (q) => q.eq("key", key))
      .unique();
    const data = (row as { data: ObjectiveRecord }).data;
    await ctx.db.patch(row!._id, {
      data: {
        ...data,
        management: {
          ...(data as unknown as { management: Record<string, unknown> }).management,
          lastFinalAssessmentCritique: SENTINEL_CRITIQUE,
        },
        finalSemanticAssessment: {
          meetsMinimumBar: false,
          rationale: "does not meet the bar",
          artifactKey: "launch/page-message",
          artifactVersion: 1,
          evidenceRefs: [],
          assumptionsUnknowns: [SENTINEL_UNKNOWN],
          recommendedNextAction: SENTINEL_NEXT_ACTION,
          assessedAt: now,
          contractRevision: 1,
        },
      } as never,
    });
  });

  const observation = (await readLoadedInputPackage(t, key, runId)) as {
    loadedInputPackage?: {
      correction?: {
        reviewCritique: string;
        reviewUnknowns?: string[];
        reviewRecommendedAction?: string;
        classification: string;
      };
    };
  };

  const correction = observation.loadedInputPackage?.correction;
  assert.ok(correction, "correction must survive the production port");
  assert.equal(correction!.reviewCritique, SENTINEL_CRITIQUE);
  assert.deepEqual(correction!.reviewUnknowns, [SENTINEL_UNKNOWN]);
  assert.equal(correction!.reviewRecommendedAction, SENTINEL_NEXT_ACTION);
  assert.equal(correction!.classification, "application_review");
});

test("production port: existing target artifact, company records, and evidence-id bounding are unchanged", async () => {
  const t = convexTest(schema, modules);
  const key = "obj_lc_unchanged";
  const runId = "run_lc_unchanged";
  const { artifactKey } = await seedRunningSerialWithRequirement(t, key, runId);

  const observation = (await readLoadedInputPackage(t, key, runId)) as {
    loadedInputPackage?: {
      targetArtifact: { key: string; version: number; content: string } | null;
      targetArtifactKey: string | null;
      companyRecords: unknown[];
      inputEvidenceIds: string[];
      linkedAcquisitions: unknown[];
    };
  };

  const pkg = observation.loadedInputPackage;
  assert.ok(pkg);
  assert.equal(pkg!.targetArtifactKey, artifactKey);
  assert.equal(pkg!.targetArtifact?.key, artifactKey);
  assert.equal(pkg!.targetArtifact?.version, 1);
  assert.equal(pkg!.targetArtifact?.content, "draft v1");
  assert.deepEqual(pkg!.inputEvidenceIds, []);
  assert.deepEqual(pkg!.linkedAcquisitions, []);
  assert.ok(Array.isArray(pkg!.companyRecords));
});

test("production port: lockedCriteria and correction remain visible to the model after modelSafeObservation wrapping", async () => {
  const t = convexTest(schema, modules);
  const key = "obj_lc_model_visible";
  const runId = "run_lc_model_visible";
  await seedRunningSerialWithRequirement(t, key, runId);

  await t.mutation(async (ctx) => {
    const row = await ctx.db
      .query("objectives")
      .withIndex("by_key", (q) => q.eq("key", key))
      .unique();
    const data = (row as { data: ObjectiveRecord }).data;
    await ctx.db.patch(row!._id, {
      data: {
        ...data,
        management: {
          ...(data as unknown as { management: Record<string, unknown> }).management,
          lastFinalAssessmentCritique: SENTINEL_CRITIQUE,
        },
        finalSemanticAssessment: {
          meetsMinimumBar: false,
          rationale: "does not meet the bar",
          artifactKey: "launch/page-message",
          artifactVersion: 1,
          evidenceRefs: [],
          assumptionsUnknowns: [SENTINEL_UNKNOWN],
          recommendedNextAction: SENTINEL_NEXT_ACTION,
          assessedAt: now,
          contractRevision: 1,
        },
      } as never,
    });
  });

  // Pre-seed the source proof so the model's single submit_result(DELIVERED)
  // call is accepted immediately — this test only inspects the FIRST prompt
  // the model actually receives, not the completion outcome.
  await t.mutation(async (ctx) =>
    (recordFinding as unknown as Handler)._handler(ctx, {
      objectiveKey: key,
      runId,
      finding: {
        sourceClass: "company_record",
        label: "Company record",
        text: "Observed company record content.",
        origin: "application_observation",
        sourceId: "record:launch/context",
        recordRef: "launch/context",
        observedAt: now,
      },
    }),
  );

  let capturedInitialInput: string | null = null;
  // Two-step script: the seeded requirement binds a company_artifact_version
  // proof to this MAKE assignment, so DELIVERED is only accepted after this
  // run has actually bumped the target artifact.
  const script = [
    {
      name: "update_company_artifact",
      args: {
        content: "Relaunch headline updated per the correction critique.",
        changeNote: "address SENTINEL_CRITIQUE",
      },
    },
    {
      name: "submit_result",
      args: {
        summary: "delivered",
        fit: "meets bar",
        risks: [],
        unknowns: [],
        recommendedNextAction: "review",
        terminal: "DELIVERED",
      },
    },
  ];
  let step = 0;
  const model: Model = {
    async getResponse(request: ModelRequest): Promise<ModelResponse> {
      if (capturedInitialInput === null) {
        capturedInitialInput =
          typeof request.input === "string"
            ? request.input
            : JSON.stringify(request.input);
      }
      const next = script[Math.min(step, script.length - 1)];
      step += 1;
      return {
        usage: new Usage(),
        output: [
          {
            type: "function_call" as const,
            callId: `call-${step}`,
            name: next.name,
            arguments: JSON.stringify(next.args),
            status: "completed" as const,
          },
        ],
      };
    },
    async *getStreamedResponse(): AsyncIterable<never> {
      throw new Error("unused");
    },
  };

  const contract = await t.query(async (ctx) => {
    const row = await ctx.db
      .query("objectives")
      .withIndex("by_key", (q) => q.eq("key", key))
      .unique();
    return (row as { data: ObjectiveRecord }).data.workItems[0]!.contract;
  });

  await t.action(async (ctx) => {
    const port = makeConvexPort(ctx, key, runId, true);
    await runWorker(port, contract, {
      model,
      serialManagerProtocol: true,
      maxTurns: 3,
    });
  });

  assert.ok(capturedInitialInput, "the model must have been invoked");
  assert.match(capturedInitialInput!, /lockedCriteria/);
  assert.match(capturedInitialInput!, new RegExp(SENTINEL_MUST_BE_TRUE.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  assert.match(capturedInitialInput!, /correction/);
  assert.match(capturedInitialInput!, new RegExp(SENTINEL_CRITIQUE.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
});
