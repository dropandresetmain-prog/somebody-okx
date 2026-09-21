// M6.1 pass-2 closure — behavioral regressions for remaining production defects.
// Does NOT declare Gate 1 PASS. No live models / deploy / payments.
import test, { mock, after as afterAll } from "node:test";
import assert from "node:assert/strict";
import { convexTest } from "convex-test";
import schema from "../convex/schema";
import {
  BEGIN_DECISION_CEILING,
  BEGIN_FINAL_ASSESSMENT_CEILING,
  resolveGovernedAssessmentTarget,
  runManagementPass,
} from "../convex/management";
import { makeConvexPort } from "../convex/objectiveRunner";
import { initBudget } from "../convex/internal/workforce";
import { submitResult } from "../convex/objectives";
import { obligationAlreadyCovered } from "../lib/objective/inputDiagnosis";
import { createResourceNeed } from "../lib/objective/resourceNeed";
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
  "../convex/m3Driver.ts": () => import("../convex/m3Driver"),
  "../convex/_generated/api.d.ts": () => import("../convex/_generated/api"),
  "../convex/_generated/server.d.ts": () => import("../convex/_generated/server"),
  "../convex/_generated/dataModel.d.ts": () => import("../convex/_generated/dataModel"),
};

mock.timers.enable({ apis: ["setTimeout"] });
afterAll(() => mock.timers.reset());

const now = 1_981_000_000_000;
type Backend = ReturnType<typeof convexTest>;
type Handler = { _handler: (c: unknown, a: Record<string, unknown>) => Promise<unknown> };

async function seedRunningSerial(t: Backend, key: string, runId: string) {
  const artifactKey = "launch/page-message";
  const workContract = createWorkContract({
    assignment: "Deliver relaunch recommendation",
    idempotencyScope: `${key}:run`,
    worker: createWorkerSpec([
      "growth_launch_operations",
      "company_records_lookup",
      "public_information_research",
    ]),
    sourceProofs: [
      { sourceClass: "company_record", minDistinctSources: 1 },
    ],
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
            id: "wi_1",
            objectiveKey: key,
            title: "relaunch",
            assignment: workContract.assignment,
            workerKey: workContract.workerKey,
            state: "running",
            contract: workContract,
            runs: [
              {
                id: runId,
                workItemId: "wi_1",
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
          workItemId: "wi_1",
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
          {
            key: artifactKey,
            version: 1,
            content: "draft v1",
            history: [],
          },
          {
            key: "other/noise",
            version: 1,
            content: "unrelated",
            history: [],
          },
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
  return { artifactKey };
}

test("terminal: production makeConvexPort returns typed idempotent_replay and refused (not accepted)", async () => {
  const t = convexTest(schema, modules);
  const key = "obj_port_term";
  const runId = "run_port_term";
  await seedRunningSerial(t, key, runId);

  const payload = {
    summary: "delivered draft",
    fit: "meets bar",
    risks: [] as string[],
    unknowns: [] as string[],
    recommendedNextAction: "complete",
    terminal: "DELIVERED" as const,
  };

  const first = (await t.mutation(async (ctx) =>
    (submitResult as unknown as Handler)._handler(ctx, {
      objectiveKey: key,
      runId,
      result: payload,
    }),
  )) as { status: string };
  assert.equal(first.status, "accepted");

  const eventsBefore = await t.query(async (ctx) => {
    const rows = await ctx.db
      .query("objectiveEvents")
      .withIndex("by_objectiveKey", (q) => q.eq("objectiveKey", key))
      .collect();
    return rows.length;
  });

  const replayRaw = await t.action(async (ctx) => {
    const port = makeConvexPort(ctx, key, runId, true);
    return port.act({
      type: "submit_result",
      result: payload,
    });
  });
  const replay = JSON.parse(String(replayRaw)) as { status: string };
  assert.equal(
    replay.status,
    "idempotent_replay",
    `production port must surface typed replay, got ${replayRaw}`,
  );

  const conflictRaw = await t.action(async (ctx) => {
    const port = makeConvexPort(ctx, key, runId, true);
    return port.act({
      type: "submit_result",
      result: { ...payload, summary: "different summary" },
    });
  });
  const conflict = JSON.parse(String(conflictRaw)) as { status: string };
  assert.equal(
    conflict.status,
    "refused",
    `production port must surface typed conflict, got ${conflictRaw}`,
  );

  const eventsAfter = await t.query(async (ctx) => {
    const rows = await ctx.db
      .query("objectiveEvents")
      .withIndex("by_objectiveKey", (q) => q.eq("objectiveKey", key))
      .collect();
    return rows.length;
  });
  assert.equal(
    eventsAfter,
    eventsBefore,
    "replay/conflict through production port must not append further effects",
  );
});

test("obligationAlreadyCovered: fulfilled question A does not suppress different question B", () => {
  const needA = createResourceNeed({
    id: "need_a",
    objectiveKey: "obj",
    resourceClass: "proprietary_data",
    purpose: "What language does audience A use?",
    reasonOwnedInsufficient: "owned copy is generic",
    requirementKey: "req_relaunch",
    contractRevision: 1,
    at: now,
  });
  const fulfilledA = { ...needA, status: "fulfilled" as const };
  const covered = obligationAlreadyCovered({
    requirementKey: "req_relaunch",
    contractRevision: 1,
    resourceClass: "proprietary_data",
    purpose: "What language does audience B use?",
    existingNeeds: [fulfilledA],
    acquisitions: [
      {
        requirementKey: "req_relaunch",
        contractRevision: 1,
        resourceClass: "proprietary_data",
        verifiedAt: now,
        needDedupeKey: fulfilledA.dedupeKey,
      },
    ],
  });
  assert.equal(
    covered,
    false,
    "same class + different purpose must still be admissible",
  );
});

test("decision accounting: three authorized begins leave refusal budget for correction", async () => {
  assert.equal(BEGIN_DECISION_CEILING, 3);
  assert.equal(BEGIN_FINAL_ASSESSMENT_CEILING, 2);

  const t = convexTest(schema, modules);
  const key = "obj_corr_budget";
  const reqKey = "req_relaunch";
  await t.mutation(async (ctx) => {
    await ctx.db.insert("objectives", {
      key,
      data: {
        key,
        request: "relaunch",
        createdAt: now,
        updatedAt: now,
        state: "executing",
        activity: "managed",
        plan: null,
        workItems: [],
        run: null,
        result: null,
        companyArtifacts: [
          { key: "launch/page-message", version: 1, content: "v1", history: [] },
        ],
        management: {
          contractId: `c_${key}`,
          currentContractRevision: 1,
          executionProtocol: M61_SERIAL_V1,
          controlNotes: [],
          // Three authorized MAKE/BUY/MAKE progress attempts already sequenced.
          decisionAttempts: { [reqKey]: 3 },
          decisionRefusalAttempts: { [reqKey]: 0 },
          decisionInputFingerprints: {},
          pendingDecision: null,
        },
      } as never,
    });
    await (initBudget as unknown as Handler)._handler(ctx, {
      objectiveKey: key,
      at: now,
    });
  });

  // Put an active deliverable requirement so beginDecision can reserve.
  const { putContract, putRequirement } = await import(
    "../convex/internal/workforce"
  );
  const { buildOutcomeContract, buildRequirement } = await import(
    "../lib/management/contract"
  );
  const contractBuilt = buildOutcomeContract({
    objectiveKey: key,
    contractId: `c_${key}`,
    revision: 1,
    parsed: {
      intent: "relaunch",
      levels: [
        {
          levelKey: "relaunch",
          order: 1,
          statement: "saved relaunch exists",
          label: "Relaunch",
        },
      ],
      minimumCompletionBar: "relaunch",
      ambiguities: [],
    },
    requestId: "r1",
    founderResolvedQuestions: [],
    at: now,
  });
  assert.equal(contractBuilt.ok, true);
  const contract = (contractBuilt as { ok: true; contract: never }).contract;
  const reqBuilt = buildRequirement(
    {
      objectiveKey: key,
      contract: contract as never,
      proposed: {
        requirementKey: reqKey,
        priority: "required",
        title: "Relaunch",
        mustBeTrue: "saved relaunch recommendation exists",
        scope: "deliverable",
        dependsOnRequirementKeys: [],
        requiredResourceClasses: [],
        expectedOutput: "saved relaunch",
        requirementKind: "deliverable",
      },
      artifactKeyForInternalProof: "launch/page-message",
      at: now,
    },
    null,
  );
  assert.ok(!("errors" in reqBuilt));
  const requirement = (reqBuilt as { requirement: Requirement }).requirement;

  await t.mutation(async (ctx) => {
    await (putContract as unknown as Handler)._handler(ctx, {
      objectiveKey: key,
      contractId: `c_${key}`,
      revision: 1,
      data: contract,
    });
    await (putRequirement as unknown as Handler)._handler(ctx, {
      objectiveKey: key,
      requirementKey: reqKey,
      data: { ...requirement, state: "active", strategy: null },
      currentContractRevision: 1,
    });
  });

  await t.mutation(async (ctx) =>
    (runManagementPass as unknown as Handler)._handler(ctx, {
      objectiveKey: key,
      reason: "correction_after_negative_assessment",
    }),
  );

  const obj = await t.query(async (ctx) => {
    const row = await ctx.db
      .query("objectives")
      .withIndex("by_key", (q) => q.eq("key", key))
      .unique();
    return (row as { data: ObjectiveRecord & { management: Record<string, unknown> } })
      .data;
  });
  const pending = obj.management.pendingDecision as { attempts?: number } | null;
  assert.ok(
    pending,
    "fourth begin must reserve after 3 authorized attempts when refusals=0",
  );
  assert.equal(
    (obj.management.decisionAttempts as Record<string, number>)[reqKey],
    4,
  );
  assert.equal(
    (obj.management.decisionRefusalAttempts as Record<string, number>)[reqKey] ??
      0,
    0,
  );
});

test("assessment target: proof-named artifact wins; regex/first-artifact fallback rejected", () => {
  const req = {
    objectiveKey: "obj",
    requirementKey: "req_relaunch",
    contractId: "c1",
    contractRevision: 1,
    priority: "required" as const,
    title: "Relaunch",
    mustBeTrue: "saved",
    scope: "deliverable",
    state: "satisfied" as const,
    strategy: "MAKE" as const,
    dependsOnRequirementKeys: [] as string[],
    requiredResourceClasses: [] as string[],
    expectedOutput: "saved",
    requirementKind: "deliverable" as const,
    proofs: [
      {
        proofKey: "p1",
        description: "artifact",
        proofKind: "company_artifact_version" as const,
        params: { artifactKey: "launch/page-message", minVersion: 2 },
      },
    ],
    resolution: null,
    blockedReason: null,
    waiver: null,
    revision: 1,
    createdAt: now,
    updatedAt: now,
  };
  const hit = resolveGovernedAssessmentTarget({
    requirements: [req],
    artifacts: [
      { key: "other/noise", version: 9, content: "noise" },
      { key: "launch/page-message", version: 3, content: "real" },
    ],
    contractRevision: 1,
  });
  assert.equal(hit.ok, true);
  if (!hit.ok) return;
  assert.equal(hit.artifactKey, "launch/page-message");
  assert.equal(hit.artifactVersion, 3);

  const ambiguous = resolveGovernedAssessmentTarget({
    requirements: [
      {
        ...req,
        proofs: [
          {
            proofKey: "p1",
            description: "artifact",
            proofKind: "company_artifact_version" as const,
            params: {},
          },
        ],
      },
    ],
    artifacts: [
      { key: "a/one", version: 1 },
      { key: "b/two", version: 1 },
    ],
    contractRevision: 1,
  });
  assert.equal(ambiguous.ok, false);
});
