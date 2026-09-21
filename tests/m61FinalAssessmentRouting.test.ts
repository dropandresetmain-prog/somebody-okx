// M6.1 owner-review: production final-semantic-assessment routing (serial).
// Does NOT declare Gate 1 PASS.
import test, { mock, after as afterAll } from "node:test";
import assert from "node:assert/strict";
import { convexTest } from "convex-test";
import schema from "../convex/schema";
import {
  applyFinalSemanticAssessment,
  beginFinalSemanticAssessment,
  runManagementPass,
} from "../convex/management";
import { putContract, putRequirement } from "../convex/internal/workforce";
import { M61_SERIAL_V1 } from "../lib/management/executionProtocol";
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

const now = 1_975_000_000_000;
type Handler = { _handler: (c: unknown, a: Record<string, unknown>) => Promise<unknown> };

test("serial proposeCompletion requires begin/apply final semantic assessment", async () => {
  const t = convexTest(schema, modules);
  const key = "obj_assess_route";
  const reqKey = "req_done";
  const artifactKey = "launch/page-message";

  await t.mutation(async (ctx) => {
    await ctx.db.insert("objectives", {
      key,
      data: {
        key,
        request: "relaunch ready",
        createdAt: now,
        updatedAt: now,
        state: "executing",
        activity: "ready_to_complete",
        plan: null,
        workItems: [],
        run: null,
        result: null,
        companyArtifacts: [
          { key: artifactKey, version: 2, content: "final relaunch text", history: [] },
        ],
        management: {
          contractId: `contract_${key}`,
          executionProtocol: M61_SERIAL_V1,
          currentContractRevision: 1,
        },
      } as never,
    });
    await (putContract as unknown as Handler)._handler(ctx, {
      objectiveKey: key,
      contractId: `contract_${key}`,
      revision: 1,
      data: {
        contractId: `contract_${key}`,
        objectiveKey: key,
        revision: 1,
        intent: "deliver relaunch recommendation",
        levels: [
          {
            levelKey: "relaunch",
            order: 1,
            statement: "recommendation on record",
            label: "Relaunch",
          },
        ],
        minimumCompletionBar: "relaunch",
        ambiguities: [],
        createdBy: "somebody",
        createdFromRequestId: `interpret_${key}`,
        createdAt: now,
      },
    });
    await (putRequirement as unknown as Handler)._handler(ctx, {
      objectiveKey: key,
      requirementKey: reqKey,
      data: {
        requirementKey: reqKey,
        objectiveKey: key,
        contractId: `contract_${key}`,
        contractRevision: 1,
        priority: "required",
        title: "Relaunch",
        mustBeTrue: "recommendation saved",
        scope: "deliverable",
        dependsOnRequirementKeys: [],
        requiredResourceClasses: [],
        expectedOutput: "saved recommendation",
        requirementKind: "deliverable",
        proofs: [
          {
            proofKey: "artifact_change",
            description: "artifact",
            proofKind: "company_artifact_version",
            params: { artifactKey, minVersion: 2 },
          },
        ],
        state: "satisfied",
        strategy: "MAKE",
        resolution: {
          resolutionId: "res_1",
          acceptedDecisionId: null,
          acceptedAssignmentId: null,
          acceptedIntentId: null,
          proofRefs: [`${artifactKey}:v2`],
          contractRevision: 1,
          acceptedAt: now,
        },
        blockedReason: null,
        waiver: null,
        revision: 1,
        createdAt: now,
        updatedAt: now,
      } as Requirement,
      currentContractRevision: 1,
    });
    await ctx.db.insert("evidence", {
      objectiveKey: key,
      evidenceId: "ev_final",
      data: {
        sourceClass: "company_record",
        label: "obs",
        text: "supporting observation",
        recordRef: "launch/context",
        observedAt: now,
        recordedBy: "app",
        runId: "run_prior",
        origin: "application_observation",
        sourceId: "record:launch/context",
      },
    });
  });

  // Without assessment, management pass must not complete.
  await t.mutation(async (ctx) =>
    (runManagementPass as unknown as Handler)._handler(ctx, {
      objectiveKey: key,
      reason: "worker_result",
    }),
  );
  let obj = await t.query(async (ctx) => {
    const row = await ctx.db
      .query("objectives")
      .withIndex("by_key", (q) => q.eq("key", key))
      .unique();
    return (row as { data: ObjectiveRecord & { management: Record<string, unknown> } }).data;
  });
  assert.notEqual(obj.state, "completed");
  assert.equal(obj.finalSemanticAssessment, undefined);

  const began = (await t.mutation(async (ctx) =>
    (beginFinalSemanticAssessment as unknown as Handler)._handler(ctx, {
      objectiveKey: key,
      at: now,
    }),
  )) as { proceed: boolean; requestId?: string };
  assert.equal(began.proceed, true);
  assert.ok(began.requestId);

  const applied = (await t.mutation(async (ctx) =>
    (applyFinalSemanticAssessment as unknown as Handler)._handler(ctx, {
      objectiveKey: key,
      requestId: began.requestId!,
      meetsMinimumBar: true,
      rationale: "Artifact v2 meets the locked relaunch bar with owned evidence.",
      artifactKey,
      artifactVersion: 2,
      evidenceRefs: ["ev_final"],
      assumptionsUnknowns: ["live conversion unknown"],
      recommendedNextAction: "complete",
      contractRevision: 1,
      at: now,
    }),
  )) as { ok: boolean; reason?: string };
  assert.equal(applied.ok, true, applied.reason);

  obj = await t.query(async (ctx) => {
    const row = await ctx.db
      .query("objectives")
      .withIndex("by_key", (q) => q.eq("key", key))
      .unique();
    return (row as { data: ObjectiveRecord }).data;
  });
  assert.equal(obj.finalSemanticAssessment?.meetsMinimumBar, true);
  assert.equal(obj.finalSemanticAssessment?.artifactVersion, 2);
});
