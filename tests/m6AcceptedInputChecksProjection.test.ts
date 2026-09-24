// CHECKPOINT 2 (final rough edge): Nex Run 1 evidence showed the worker
// guessing check_input_availability ids (e.g. "artifact:launch-week-plan")
// before ever learning the application's actual closed legal set for the
// current Requirement. The application already derives that set through
// lib/objective/inputDiagnosis.ts::listInputObligations — the SAME builder
// checkInputAvailability validates against. This suite proves the set is now
// PROACTIVELY exposed, read-only, through the real production observation
// path, with no second derivation and no widened authority.
import test, { mock, after as afterAll } from "node:test";
import assert from "node:assert/strict";
import { convexTest } from "convex-test";
import type { Model, ModelRequest, ModelResponse } from "@openai/agents-core";
import { Usage } from "@openai/agents-core";
import schema from "../convex/schema";
import { makeConvexPort } from "../convex/objectiveRunner";
import { runWorker } from "../lib/worker/runtime";
import { recordInputAvailabilityCheck } from "../convex/objectives";
import { putContract, putRequirement } from "../convex/internal/workforce";
import { buildOutcomeContract, buildRequirement } from "../lib/management/contract";
import { listInputObligations } from "../lib/objective/inputDiagnosis";
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

const now = 1_986_000_000_000;
type Backend = ReturnType<typeof convexTest>;
type Handler = { _handler: (c: unknown, a: Record<string, unknown>) => Promise<unknown> };

async function seedRequirementRun(
  t: Backend,
  key: string,
  runId: string,
  requiredResourceClasses: string[],
  mustBeTrue: string,
): Promise<void> {
  const artifactKey = "launch/page-message";
  const contractId = `c_${key}`;
  const workContract = createWorkContract({
    assignment: "Bounded evidence assignment",
    idempotencyScope: `${key}:run`,
    worker: createWorkerSpec(["growth_launch_operations", "company_records_lookup", "public_information_research"]),
    sourceProofs: [{ sourceClass: "company_record", minDistinctSources: 1 }],
    inputEvidenceIds: [],
    targetArtifactKey: null,
  });

  await t.mutation(async (ctx) => {
    await ctx.db.insert("objectives", {
      key,
      data: {
        key,
        request: "evidence-bounded plan",
        createdAt: now,
        updatedAt: now,
        state: "executing",
        activity: "running",
        plan: null,
        workItems: [
          {
            id: "wi:asg_input_checks",
            objectiveKey: key,
            title: "evidence boundary",
            assignment: workContract.assignment,
            workerKey: workContract.workerKey,
            state: "running",
            contract: workContract,
            runs: [
              {
                id: runId,
                workItemId: "wi:asg_input_checks",
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
          workItemId: "wi:asg_input_checks",
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
        { levelKey: "evidence_bar", order: 1, statement: "evidence is bounded", label: "Evidence" },
      ],
      minimumCompletionBar: "evidence_bar",
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
        requirementKey: "req_01",
        priority: "required",
        title: "Evidence boundary",
        mustBeTrue,
        scope: "evidence-bounded launch-week plan",
        dependsOnRequirementKeys: [],
        requiredResourceClasses,
        expectedOutput: null,
        requirementKind: "deliverable",
      },
      artifactKeyForInternalProof: null,
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
      requirementKey: "req_01",
      data: { ...requirement, state: "active", strategy: "MAKE" },
      currentContractRevision: 1,
    });
    await ctx.db.insert("assignments", {
      assignmentId: "asg_input_checks",
      objectiveKey: key,
      data: {
        assignmentId: "asg_input_checks",
        objectiveKey: key,
        requirementKey: "req_01",
        contractRevision: 1,
        decisionId: "dec_1",
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
}

async function readObservation(t: Backend, key: string, runId: string) {
  return t.action(async (ctx) => {
    const port = makeConvexPort(ctx as unknown as Parameters<typeof makeConvexPort>[0], key, runId, true);
    return port.read();
  });
}

type ExposedObligation = {
  inputCheckId: string;
  kind: string;
  resourceClass: string | null;
  purpose: string;
};

test("acceptedInputChecks: present in the initial observation before any worker tool call", async () => {
  const t = convexTest(schema, modules);
  const key = "obj_iac_initial";
  const runId = "run_iac_initial";
  await seedRequirementRun(t, key, runId, ["company_records"], "evidence-bounded plan for req_01");

  const observation = (await readObservation(t, key, runId)) as {
    loadedInputPackage?: { acceptedInputChecks?: ExposedObligation[] };
  };
  const exposed = observation.loadedInputPackage?.acceptedInputChecks;
  assert.ok(exposed, "acceptedInputChecks must be present in the initial observation");
  assert.ok(exposed!.length > 0, "must expose at least one legal id before any tool call");
});

test("acceptedInputChecks: every exposed id comes from listInputObligations / application truth", async () => {
  const t = convexTest(schema, modules);
  const key = "obj_iac_provenance";
  const runId = "run_iac_provenance";
  const mustBeTrue = "evidence-bounded plan for req_01";
  await seedRequirementRun(t, key, runId, ["company_records"], mustBeTrue);

  const observation = (await readObservation(t, key, runId)) as {
    loadedInputPackage?: { acceptedInputChecks?: ExposedObligation[] };
  };
  const exposed = observation.loadedInputPackage?.acceptedInputChecks ?? [];

  const expected = listInputObligations({
    requiredResourceClasses: ["company_records"],
    sourceProofs: [{ sourceClass: "company_record", minDistinctSources: 1 }],
    mustBeTrue,
    expectedOutput: null,
  });
  assert.deepEqual(exposed, expected, "exposed ids must be byte-identical to the application's own obligation builder output — no second derivation");
});

test("acceptedInputChecks: Requirement A cannot see Requirement B's obligations", async () => {
  const t = convexTest(schema, modules);
  const keyA = "obj_iac_a";
  const keyB = "obj_iac_b";
  const runA = "run_iac_a";
  const runB = "run_iac_b";
  await seedRequirementRun(t, keyA, runA, ["company_records"], "A's own must-be-true");
  await seedRequirementRun(t, keyB, runB, ["company_tools"], "B's own must-be-true");

  const obsA = (await readObservation(t, keyA, runA)) as {
    loadedInputPackage?: { acceptedInputChecks?: ExposedObligation[] };
  };
  const obsB = (await readObservation(t, keyB, runB)) as {
    loadedInputPackage?: { acceptedInputChecks?: ExposedObligation[] };
  };

  const idsA = (obsA.loadedInputPackage?.acceptedInputChecks ?? []).map((o) => o.inputCheckId);
  const idsB = (obsB.loadedInputPackage?.acceptedInputChecks ?? []).map((o) => o.inputCheckId);

  assert.ok(idsA.includes("req_class:company_records"));
  assert.ok(!idsA.includes("req_class:company_tools"), "Requirement A must not see B's class obligation");
  assert.ok(idsB.includes("req_class:company_tools"));
  assert.ok(!idsB.includes("req_class:company_records"), "Requirement B must not see A's class obligation");
});

test("acceptedInputChecks: a Requirement with no declared resource classes exposes only evidence_sufficiency", async () => {
  const t = convexTest(schema, modules);
  const key = "obj_iac_evidence_only";
  const runId = "run_iac_evidence_only";
  await seedRequirementRun(t, key, runId, [], "evidence-only requirement");

  const observation = (await readObservation(t, key, runId)) as {
    loadedInputPackage?: { acceptedInputChecks?: ExposedObligation[] };
  };
  const exposed = observation.loadedInputPackage?.acceptedInputChecks ?? [];
  assert.deepEqual(
    exposed.map((o) => o.inputCheckId),
    ["evidence_sufficiency"],
    "with no declared required classes, the only legal id is evidence_sufficiency",
  );
});

test("acceptedInputChecks: survives modelSafeObservation and appears in the actual worker prompt", async () => {
  const t = convexTest(schema, modules);
  const key = "obj_iac_model_visible";
  const runId = "run_iac_model_visible";
  await seedRequirementRun(t, key, runId, ["company_records"], "evidence-bounded plan for req_01");

  let capturedInitialInput: string | null = null;
  const model: Model = {
    async getResponse(request: ModelRequest): Promise<ModelResponse> {
      if (capturedInitialInput === null) {
        capturedInitialInput =
          typeof request.input === "string" ? request.input : JSON.stringify(request.input);
      }
      return {
        usage: new Usage(),
        output: [
          {
            type: "function_call" as const,
            callId: "call-1",
            name: "submit_result",
            arguments: JSON.stringify({
              summary: "stop here",
              fit: "n/a",
              risks: [],
              unknowns: [],
              recommendedNextAction: "n/a",
              terminal: "EXECUTION_ERROR",
            }),
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
    await runWorker(port, contract, { model, serialManagerProtocol: true, maxTurns: 2 });
  });

  assert.ok(capturedInitialInput, "the model must have been invoked");
  assert.match(capturedInitialInput!, /acceptedInputChecks/);
  assert.match(capturedInitialInput!, /req_class:company_records/);
  assert.match(capturedInitialInput!, /evidence_sufficiency/);
});

test("check_input_availability: an id taken from acceptedInputChecks behaves normally (not INVALID_REQUEST)", async () => {
  const t = convexTest(schema, modules);
  const key = "obj_iac_valid_call";
  const runId = "run_iac_valid_call";
  await seedRequirementRun(t, key, runId, ["company_records"], "evidence-bounded plan for req_01");

  const observation = (await readObservation(t, key, runId)) as {
    loadedInputPackage?: { acceptedInputChecks?: ExposedObligation[] };
  };
  const exposed = observation.loadedInputPackage?.acceptedInputChecks ?? [];
  const classCheck = exposed.find((o) => o.inputCheckId === "req_class:company_records");
  assert.ok(classCheck, "expected req_class:company_records to be exposed");

  const report = (await t.mutation(async (ctx) =>
    (recordInputAvailabilityCheck as unknown as Handler)._handler(ctx, {
      objectiveKey: key,
      runId,
      inputCheckId: classCheck!.inputCheckId,
      requirementKey: "req_01",
      workItemId: "wi:asg_input_checks",
    }),
  )) as { status: string; inputCheckId: string };

  assert.notEqual(report.status, "INVALID_REQUEST");
  // company_records is an owned/controlled class in this repo's inventory —
  // exposure of the id is not acquisition authority, just discoverability.
  assert.equal(report.status, "AVAILABLE");
});

test("check_input_availability: a guessed invalid id remains INVALID_REQUEST — validation is unchanged", async () => {
  const t = convexTest(schema, modules);
  const key = "obj_iac_guess";
  const runId = "run_iac_guess";
  await seedRequirementRun(t, key, runId, ["company_records"], "evidence-bounded plan for req_01");

  const report = (await t.mutation(async (ctx) =>
    (recordInputAvailabilityCheck as unknown as Handler)._handler(ctx, {
      objectiveKey: key,
      runId,
      inputCheckId: "artifact:launch-week-plan",
      requirementKey: "req_01",
      workItemId: "wi:asg_input_checks",
    }),
  )) as { status: string; detail: string };

  assert.equal(report.status, "INVALID_REQUEST");
  assert.match(report.detail, /not an accepted obligation/);
});
