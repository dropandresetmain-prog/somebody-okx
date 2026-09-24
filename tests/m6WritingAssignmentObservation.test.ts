// CHECKPOINT 2, item 2 (verify-first): a legitimate WRITING assignment
// (WorkContract.targetArtifactKey set to a real key) must receive the exact
// authorized target artifact identity, its complete current content, and its
// current version through the real worker observation path — and
// update_company_artifact must bind its write to the version actually SHOWN
// to the model, refusing a write composed from a stale view. This is
// end-to-end through runWorker + the real Convex port + the real mutation,
// not a package-builder unit test.
import test, { mock, after as afterAll } from "node:test";
import assert from "node:assert/strict";
import { convexTest } from "convex-test";
import type { Model, ModelRequest, ModelResponse } from "@openai/agents-core";
import { Usage } from "@openai/agents-core";
import schema from "../convex/schema";
import { makeConvexPort } from "../convex/objectiveRunner";
import { runWorker } from "../lib/worker/runtime";
import { M61_SERIAL_V1 } from "../lib/management/executionProtocol";
import { createWorkContract, createWorkerSpec } from "../lib/workforce";
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

const now = 1_984_000_000_000;
type Backend = ReturnType<typeof convexTest>;

const ARTIFACT_KEY = "launch/page-message";
const SEED_CONTENT = "SENTINEL_CONTENT_V1: original headline draft in full";

async function seedWritingAssignment(t: Backend, key: string, runId: string) {
  const workContract = createWorkContract({
    assignment: "Deliver relaunch recommendation",
    idempotencyScope: `${key}:run`,
    worker: createWorkerSpec(["growth_launch_operations", "company_records_lookup"]),
    sourceProofs: [{ sourceClass: "company_record", minDistinctSources: 1 }],
    inputEvidenceIds: [],
    targetArtifactKey: ARTIFACT_KEY,
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
            id: "wi_write",
            objectiveKey: key,
            title: "relaunch",
            assignment: workContract.assignment,
            workerKey: workContract.workerKey,
            state: "running",
            contract: workContract,
            runs: [
              {
                id: runId,
                workItemId: "wi_write",
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
          workItemId: "wi_write",
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
          { key: ARTIFACT_KEY, version: 1, content: SEED_CONTENT, history: [] },
        ],
        management: {
          contractId: `c_${key}`,
          currentContractRevision: 1,
          executionProtocol: M61_SERIAL_V1,
          controlNotes: [],
        },
      } as never,
    });
  });

  return { contract: workContract };
}

test("writing assignment: observation carries exact target key, complete content, and current version", async () => {
  const t = convexTest(schema, modules);
  const key = "obj_write_observation";
  const runId = "run_write_observation";
  await seedWritingAssignment(t, key, runId);

  const observation = (await t.action(async (ctx) => {
    const port = makeConvexPort(ctx, key, runId, true);
    return port.read();
  })) as {
    loadedInputPackage?: {
      targetArtifact: { key: string; version: number; content: string; complete: boolean } | null;
      targetArtifactKey: string | null;
    };
  };

  const pkg = observation.loadedInputPackage;
  assert.ok(pkg, "a writing assignment must carry a loadedInputPackage");
  assert.equal(pkg!.targetArtifactKey, ARTIFACT_KEY);
  assert.equal(pkg!.targetArtifact?.key, ARTIFACT_KEY);
  assert.equal(pkg!.targetArtifact?.version, 1);
  assert.equal(pkg!.targetArtifact?.content, SEED_CONTENT);
  assert.equal(pkg!.targetArtifact?.complete, true);
});

test("writing assignment: update_company_artifact binds to the shown version and refuses a write composed from a stale view", async () => {
  const t = convexTest(schema, modules);
  const key = "obj_write_stale";
  const runId = "run_write_stale";
  const { contract } = await seedWritingAssignment(t, key, runId);

  const capturedToolResults: Array<{ name: string; result: string }> = [];
  const script = [
    { name: "record_finding", args: { sourceClass: "company_record", label: "note", text: "an observation" } },
    {
      name: "update_company_artifact",
      args: { content: "SENTINEL_CONTENT_V2: rewritten from a stale view", changeNote: "attempt" },
    },
    {
      name: "submit_result",
      args: {
        summary: "stopped after stale artifact refusal",
        fit: "incomplete",
        risks: [],
        unknowns: [],
        recommendedNextAction: "recompose from current version",
        terminal: "EXECUTION_ERROR",
      },
    },
  ];
  let step = 0;
  let bumped = false;
  const model: Model = {
    async getResponse(_request: ModelRequest): Promise<ModelResponse> {
      const index = Math.min(step, script.length - 1);
      const next = script[index];
      step += 1;
      // Simulate a concurrent out-of-band write landing between the turn that
      // showed the model v1 and the turn where it acts on that view: bump the
      // artifact to v2 right before the model's update_company_artifact call.
      if (next.name === "update_company_artifact" && !bumped) {
        bumped = true;
        await t.mutation(async (ctx) => {
          const row = await ctx.db
            .query("objectives")
            .withIndex("by_key", (q) => q.eq("key", key))
            .unique();
          const data = (row as { data: ObjectiveRecord }).data;
          await ctx.db.patch(row!._id, {
            data: {
              ...data,
              companyArtifacts: (data.companyArtifacts ?? []).map((a) =>
                a.key === ARTIFACT_KEY
                  ? { ...a, version: 2, content: "concurrent write from elsewhere" }
                  : a,
              ),
            },
          });
        });
      }
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

  // Patch runWorker's act() indirectly by inspecting persisted evidence/events
  // afterward — the tool's own JSON envelope (returned to the model) already
  // carries the refusal status, so wrap the port to capture the raw act()
  // result the runtime hands back to the tool call.
  await t.action(async (ctx) => {
    const port = makeConvexPort(ctx, key, runId, true);
    const originalAct = port.act.bind(port);
    port.act = async (command: Record<string, unknown>) => {
      const result = await originalAct(command);
      capturedToolResults.push({ name: String(command.type), result });
      return result;
    };
    await runWorker(port, contract, {
      model,
      serialManagerProtocol: true,
      maxTurns: 4,
    });
  });

  const writeAttempt = capturedToolResults.find(
    (r) => r.name === "update_company_artifact",
  );
  assert.ok(writeAttempt, "update_company_artifact must have been attempted");
  const parsed = JSON.parse(writeAttempt!.result) as { status?: string; error?: string };
  assert.equal(
    parsed.status,
    "stale",
    "a write composed from the shown (now stale) version must be refused, not silently applied",
  );
  assert.match(parsed.error ?? "", /stale|now v2/i);

  const final = await t.query(async (ctx) => {
    const row = await ctx.db
      .query("objectives")
      .withIndex("by_key", (q) => q.eq("key", key))
      .unique();
    return (row as { data: ObjectiveRecord }).data;
  });
  const artifact = final.companyArtifacts?.find((a) => a.key === ARTIFACT_KEY);
  assert.equal(
    artifact?.content,
    "concurrent write from elsewhere",
    "the refused stale write must have no side effect on the artifact",
  );
  assert.equal(artifact?.version, 2);
});
