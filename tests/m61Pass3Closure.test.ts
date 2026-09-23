// M6.1 pass-3 closure — corrective execution, manager BUY, assessment grounding,
// proposeDecision/executeWorker boundary proofs. Does NOT declare Gate 1 PASS.
import test, { mock, after as afterAll } from "node:test";
import assert from "node:assert/strict";
import { Usage, type Model } from "@openai/agents";
import { convexTest } from "convex-test";
import schema from "../convex/schema";
import {
  applyDecision,
  applyFinalSemanticAssessment,
  beginFinalSemanticAssessment,
  BEGIN_FINAL_ASSESSMENT_CEILING,
  runManagementPass,
} from "../convex/management";
import {
  executeWorker,
  proposeDecision,
  proposeFinalSemanticAssessment,
} from "../convex/objectiveRunner";
import {
  initBudget,
  putAssignment,
  putContract,
  putRequirement,
} from "../convex/internal/workforce";
import {
  finishRun,
  recordFinding,
} from "../convex/objectives";
import { buildOutcomeContract, buildRequirement } from "../lib/management/contract";
import { optionIdFor } from "../lib/management/options";
import { M61_SERIAL_V1 } from "../lib/management/executionProtocol";
import { installStructuredChatDouble } from "../lib/management/modelBoundary";
import { installWorkerModelDouble } from "../lib/worker/workerModelBoundary";
import { createWorkContract, createWorkerSpec, evaluateCompletion } from "../lib/workforce";
import type { Assignment, Requirement } from "../lib/management/types";
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
afterAll(() => {
  mock.timers.reset();
  installStructuredChatDouble(null);
  installWorkerModelDouble(null);
});

const now = 1_982_000_000_000;
const ARTIFACT = "launch/page-message";
const MAKE_CAPS = [
  "growth_launch_operations",
  "company_records_lookup",
  "public_information_research",
] as const;

type Backend = ReturnType<typeof convexTest>;
type Handler = { _handler: (c: unknown, a: Record<string, unknown>) => Promise<unknown> };

function toolCall(name: string, args: unknown, callId: string) {
  return {
    type: "function_call" as const,
    callId,
    name,
    arguments: JSON.stringify(args),
    status: "completed" as const,
  };
}

async function invokePass(t: Backend, key: string, reason = "test_wake") {
  return t.mutation(async (ctx) =>
    (runManagementPass as unknown as Handler)._handler(ctx, {
      objectiveKey: key,
      reason,
    }),
  ) as Promise<{ objectiveState: string; summary: string; unmet?: string[] }>;
}

async function readObj(t: Backend, key: string) {
  return t.query(async (ctx) => {
    const row = await ctx.db
      .query("objectives")
      .withIndex("by_key", (q) => q.eq("key", key))
      .unique();
    return (row as { data: ObjectiveRecord & { management: Record<string, unknown> } })
      .data;
  });
}

async function readReqs(t: Backend, key: string) {
  return t.query(async (ctx) => {
    const rows = await ctx.db
      .query("requirements")
      .withIndex("by_objectiveKey", (q) => q.eq("objectiveKey", key))
      .collect();
    return rows.map((r) => (r as { data: Requirement }).data);
  });
}

async function readAssignments(t: Backend, key: string) {
  return t.query(async (ctx) => {
    const rows = await ctx.db
      .query("assignments")
      .withIndex("by_objective", (q) => q.eq("objectiveKey", key))
      .collect();
    return rows.map((r) => (r as { data: Assignment }).data);
  });
}

async function readIntents(t: Backend, key: string) {
  return t.query(async (ctx) => {
    const rows = await ctx.db
      .query("executionIntents")
      .withIndex("by_objective", (q) => q.eq("objectiveKey", key))
      .collect();
    return rows.map((r) => (r as { data: Record<string, unknown> }).data);
  });
}

function makeContract(key: string) {
  const built = buildOutcomeContract({
    objectiveKey: key,
    contractId: `c_${key}`,
    revision: 1,
    parsed: {
      intent: "relaunch messaging",
      levels: [
        {
          levelKey: "relaunch",
          order: 1,
          statement: "saved relaunch recommendation exists",
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
  assert.equal(built.ok, true);
  return (built as { ok: true; contract: never }).contract;
}

function makeDeliverable(key: string, reqKey: string) {
  const reqBuilt = buildRequirement(
    {
      objectiveKey: key,
      contract: makeContract(key) as never,
      proposed: {
        requirementKey: reqKey,
        priority: "required",
        title: "Relaunch",
        mustBeTrue: "saved relaunch recommendation exists",
        scope: "deliverable",
        dependsOnRequirementKeys: [],
        requiredResourceClasses: [],
        expectedOutput: "versioned launch/page-message artifact",
        requirementKind: "deliverable",
      },
      artifactKeyForInternalProof: ARTIFACT,
      at: now,
    },
    null,
  );
  assert.ok(!("errors" in reqBuilt));
  return (reqBuilt as { requirement: Requirement }).requirement;
}

test("pass3: serial WorkContract + empty risks/unknowns finalizes via finishRun", async () => {
  const t = convexTest(schema, modules);
  const key = "obj_p3_empty_ru";
  const runId = "run_p3_empty_ru";
  const workContract = createWorkContract({
    assignment: "Deliver relaunch recommendation",
    idempotencyScope: `${key}:empty_ru`,
    worker: createWorkerSpec([...MAKE_CAPS]),
    sourceProofs: [{ sourceClass: "company_record", minDistinctSources: 1 }],
    inputEvidenceIds: [],
    targetArtifactKey: ARTIFACT,
  });
  assert.equal(
    workContract.resultRequirements.allowEmptyRisksUnknowns,
    true,
    "production serial createWorkContract must set allowEmptyRisksUnknowns",
  );

  await t.mutation(async (ctx) => {
    await ctx.db.insert("objectives", {
      key,
      data: {
        key,
        request: "relaunch",
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
                leaseUntil: now + 300_000,
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
          leaseUntil: now + 300_000,
          model: "mock",
          modelSelectionReason: "test",
          toolCalls: 0,
          summary: "",
        },
        result: {
          summary: "Delivered with no material risks or unknowns",
          fit: "ok",
          risks: [],
          unknowns: [],
          recommendedNextAction: "complete",
          completedAt: now,
          runId,
        },
        companyArtifacts: [
          {
            key: ARTIFACT,
            version: 2,
            content: "EMPTY_RU: relaunch recommendation",
            history: [],
            provenanceRunId: runId,
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
    await (recordFinding as unknown as Handler)._handler(ctx, {
      objectiveKey: key,
      runId,
      finding: {
        sourceClass: "company_record",
        label: "launch context",
        text: "Owned launch context",
        origin: "application_observation",
        sourceId: "record:launch/context",
        recordRef: "launch/context",
        observedAt: now,
      },
    });
  });

  const finished = (await t.mutation(async (ctx) =>
    (finishRun as unknown as Handler)._handler(ctx, {
      objectiveKey: key,
      runId,
      toolCalls: 1,
    }),
  )) as { completed: boolean; unmet: string[] };
  assert.equal(
    finished.completed,
    true,
    `serial empty risks/unknowns must finalize; unmet=${finished.unmet.join("; ")}`,
  );
  assert.deepEqual(finished.unmet, []);
  const obj = await readObj(t, key);
  assert.equal(obj.workItems?.[0]?.state, "completed");
  assert.notEqual(obj.state, "completed");

  // Missing arrays must still fail (malformed / not silently accepted).
  const missing = evaluateCompletion({
    contract: workContract,
    evidence: [
      {
        id: "ev1",
        sourceClass: "company_record",
        label: "x",
        text: "y",
        origin: "application_observation",
        sourceId: "record:launch/context",
        recordRef: "launch/context",
        observedAt: now,
        recordedBy: "test",
        runId,
      },
    ],
    result: {
      summary: "ok",
      fit: "ok",
      recommendedNextAction: "complete",
      completedAt: now,
      runId,
    } as never,
  });
  assert.equal(missing.complete, false);
  assert.ok(missing.unmet.some((u) => /risks/i.test(u)));
  assert.ok(missing.unmet.some((u) => /unknowns/i.test(u)));
});

test("pass3: negative assessment reopens → corrective MAKE new run/artifact → assessment #2 completes", async () => {
  const t = convexTest(schema, modules);
  const key = "obj_p3_correct";
  const reqKey = "req_relaunch";
  const oldAssignmentId = "asg_make_rejected";
  const oldRunId = "run_make_rejected";
  const oldDecisionId = "dec_make_old";
  const workContract = createWorkContract({
    assignment: "Deliver relaunch recommendation",
    idempotencyScope: `${key}:old`,
    worker: createWorkerSpec([...MAKE_CAPS]),
    sourceProofs: [{ sourceClass: "company_record", minDistinctSources: 1 }],
    inputEvidenceIds: ["sim_acq_1"],
    targetArtifactKey: ARTIFACT,
  });

  await t.mutation(async (ctx) => {
    await ctx.db.insert("objectives", {
      key,
      data: {
        key,
        request: "relaunch",
        createdAt: now,
        updatedAt: now,
        state: "executing",
        activity: "assessing",
        plan: null,
        workItems: [],
        run: null,
        result: {
          summary: "weak first deliverable",
          fit: "thin",
          risks: ["critique expected"],
          unknowns: [],
          recommendedNextAction: "revise",
          completedAt: now,
        },
        companyArtifacts: [
          {
            key: ARTIFACT,
            version: 2,
            content: "WEAK first relaunch draft without critique fixes",
            history: [],
          },
        ],
        acquisitionResults: [
          {
            intentId: "int_buy_1",
            requirementKey: reqKey,
            contractRevision: 1,
            resultEvidenceId: "sim_acq_1",
            provenance: "simulation",
            providerId: "p1",
            serviceId: "s1",
            offeringId: "o1",
            resourceClass: "proprietary_data",
            content: "audience language from BUY",
            responseHash: "h1",
            recordedAt: now,
            verifiedAt: now,
            needDedupeKey: "need_buy_1",
          },
        ],
        management: {
          contractId: `c_${key}`,
          currentContractRevision: 1,
          executionProtocol: M61_SERIAL_V1,
          controlNotes: [],
          decisionAttempts: { [reqKey]: 3 },
          decisionRefusalAttempts: { [reqKey]: 0 },
          decisionInputFingerprints: {},
          pendingDecision: null,
          finalAssessmentAttempts: 0,
          pendingFinalAssessment: null,
        },
      } as never,
    });
    await (initBudget as unknown as Handler)._handler(ctx, {
      objectiveKey: key,
      at: now,
    });
    await (putContract as unknown as Handler)._handler(ctx, {
      objectiveKey: key,
      contractId: `c_${key}`,
      revision: 1,
      data: makeContract(key),
    });
    const requirement = {
      ...makeDeliverable(key, reqKey),
      state: "satisfied" as const,
      strategy: "MAKE" as const,
      resolution: {
        resolutionId: `res_${reqKey}`,
        acceptedDecisionId: oldDecisionId,
        acceptedAssignmentId: oldAssignmentId,
        acceptedIntentId: null,
        proofRefs: [`artifact:${ARTIFACT}:2`],
        contractRevision: 1,
        acceptedAt: now,
      },
    };
    await (putRequirement as unknown as Handler)._handler(ctx, {
      objectiveKey: key,
      requirementKey: reqKey,
      data: requirement,
      currentContractRevision: 1,
    });
    await (putAssignment as unknown as Handler)._handler(ctx, {
      assignmentId: oldAssignmentId,
      objectiveKey: key,
      data: {
        assignmentId: oldAssignmentId,
        objectiveKey: key,
        requirementKey: reqKey,
        contractRevision: 1,
        decisionId: oldDecisionId,
        workerKey: workContract.workerKey,
        kind: "internal_make",
        state: "verified",
        attempt: 1,
        runId: oldRunId,
        workContract,
        resultSummary: "weak draft",
        idempotencyScope: workContract.idempotencyScope,
        createdAt: now,
        updatedAt: now,
      },
    });
  });

  // Assessment #1 negative via production begin/apply.
  const began1 = (await t.mutation(async (ctx) =>
    (beginFinalSemanticAssessment as unknown as Handler)._handler(ctx, {
      objectiveKey: key,
      at: now,
    }),
  )) as { proceed: boolean; requestId?: string; reason?: string };
  assert.equal(began1.proceed, true, began1.reason);
  const applied1 = (await t.mutation(async (ctx) =>
    (applyFinalSemanticAssessment as unknown as Handler)._handler(ctx, {
      objectiveKey: key,
      requestId: began1.requestId!,
      meetsMinimumBar: false,
      rationale: "Draft lacks concrete audience language and CTA clarity",
      artifactKey: ARTIFACT,
      artifactVersion: 2,
      evidenceRefs: ["sim_acq_1"],
      assumptionsUnknowns: ["channel mix"],
      recommendedNextAction: "revise",
      contractRevision: 1,
      at: now + 1,
    }),
  )) as { ok: boolean; reason?: string };
  assert.equal(applied1.ok, true, applied1.reason);

  const afterNeg = await invokePass(t, key, "final_semantic_assessment");
  assert.equal(afterNeg.objectiveState, "executing");
  const reopened = (await readReqs(t, key))[0]!;
  assert.equal(reopened.state, "active");
  assert.equal(reopened.strategy, null);
  const oldAfter = (await readAssignments(t, key)).find(
    (a) => a.assignmentId === oldAssignmentId,
  )!;
  assert.equal(oldAfter.state, "superseded", "rejected MAKE must be historical only");
  const objAfterNeg = await readObj(t, key);
  assert.equal(objAfterNeg.finalSemanticAssessment, null);
  assert.match(
    String(objAfterNeg.management.lastFinalAssessmentCritique ?? ""),
    /audience language/,
  );
  assert.equal(objAfterNeg.management.finalAssessmentAttempts, 1);

  // Corrective MAKE via applyDecision (authorized progress; not mere 4th pending).
  const pending = objAfterNeg.management.pendingDecision as {
    requestId: string;
  } | null;
  // Reserve if reopen wake did not already begin a decision.
  if (!pending) {
    await invokePass(t, key, "correction_redecide");
  }
  const objPend = await readObj(t, key);
  const pendingDecision = objPend.management.pendingDecision as {
    requestId: string;
  } | null;
  assert.ok(pendingDecision, "correction must reserve a decision for new MAKE");

  const makeCaps = [...MAKE_CAPS];
  const makeOptionId = optionIdFor({
    requirementKey: reqKey,
    contractRevision: 1,
    kind: "internal",
    target: `internal:${[...makeCaps].sort().join("+")}:new`,
  });
  const make3 = (await t.mutation(async (ctx) =>
    (applyDecision as unknown as Handler)._handler(ctx, {
      objectiveKey: key,
      requestId: pendingDecision!.requestId,
      rawStrategyProposal: {
        strategy: "MAKE",
        desiredCapabilities: makeCaps,
        needsExternalResourceClass: null,
        notes: "corrective revision after negative assessment",
      },
      rawRecommendation: {
        requirementKey: reqKey,
        contractRevision: 1,
        selectedOptionId: makeOptionId,
        rationale: "Revise artifact to address critique",
        materialAssumptions: [],
        changeMyMindEvidence: [],
      },
      at: now + 2,
    }),
  )) as { ok: boolean; authorized?: boolean; strategy?: string; reason?: string };
  assert.equal(make3.ok, true, make3.reason);
  assert.equal(make3.authorized, true, JSON.stringify(make3));
  assert.equal(make3.strategy, "MAKE");

  await invokePass(t, key, "decision_applied");
  const assignments = await readAssignments(t, key);
  const corrective = assignments
    .filter(
      (a) =>
        a.state !== "superseded" &&
        a.kind === "internal_make" &&
        (a.state === "dispatched" || a.state === "running"),
    )
    .sort((a, b) => b.createdAt - a.createdAt)[0];
  assert.ok(corrective, "corrective MAKE must dispatch a new assignment");
  assert.notEqual(corrective.assignmentId, oldAssignmentId);
  assert.ok(corrective.runId, "corrective assignment must have a run id");
  assert.notEqual(corrective.runId, oldRunId, "must be a new run, not the rejected one");
  const newRunId = corrective.runId!;
  assert.equal(
    corrective.workContract?.resultRequirements?.allowEmptyRisksUnknowns,
    true,
    "serial corrective WorkContract must permit empty risks/unknowns",
  );

  // Production startManagedRun already created workItems/run — do not replace them.
  const objDispatched = await readObj(t, key);
  assert.equal(objDispatched.run?.id, newRunId);
  assert.equal(objDispatched.workItems?.[0]?.state, "running");
  assert.equal(
    objDispatched.workItems?.[0]?.contract?.resultRequirements?.allowEmptyRisksUnknowns,
    true,
  );
  const preArtVersion =
    objDispatched.companyArtifacts?.find((a) => a.key === ARTIFACT)?.version ?? 0;

  // Real executeWorker path: worker-model double fulfils the generated contract.
  let step = 0;
  const correctiveModel: Model = {
    async getResponse() {
      step += 1;
      if (step === 1) {
        return {
          usage: new Usage(),
          output: [
            toolCall(
              "read_company_record",
              { recordRef: "launch/context" },
              "corr_e1",
            ),
          ],
        };
      }
      if (step === 2) {
        return {
          usage: new Usage(),
          output: [
            toolCall(
              "update_company_artifact",
              {
                content:
                  "REVISED_AFTER_CRITIQUE: concrete audience language CTA and channel plan using BUY evidence",
                changeNote: "Address negative assessment critique",
                usedAcquisitionEvidenceIds: [],
              },
              "corr_e2",
            ),
          ],
        };
      }
      return {
        usage: new Usage(),
        output: [
          toolCall(
            "submit_result",
            {
              summary: "Revised relaunch after critique",
              fit: "meets bar after correction",
              risks: [],
              unknowns: [],
              recommendedNextAction: "complete",
              terminal: "DELIVERED",
            },
            "corr_e3",
          ),
        ],
      };
    },
    async *getStreamedResponse() {
      throw new Error("unused");
    },
  };
  installWorkerModelDouble(correctiveModel);
  const finished = (await t.action(async (ctx) =>
    (executeWorker as unknown as Handler)._handler(ctx, {
      objectiveKey: key,
      runId: newRunId,
    }),
  )) as { completed: boolean; unmet: string[] };
  installWorkerModelDouble(null);

  assert.equal(
    finished.completed,
    true,
    `corrective executeWorker incomplete: ${finished.unmet.join("; ") || "(no unmet listed)"}`,
  );
  assert.deepEqual(finished.unmet, []);

  const afterExec = await readObj(t, key);
  assert.equal(afterExec.workItems?.[0]?.state, "completed");
  assert.ok(
    afterExec.run == null || afterExec.run.status === "stopped" || afterExec.run.status === "completed",
    `expected durable run terminal; got ${afterExec.run?.status}`,
  );
  assert.notEqual(afterExec.state, "completed", "worker completion must not complete the Objective");

  const artMid = afterExec.companyArtifacts?.find((a) => a.key === ARTIFACT);
  assert.ok(
    artMid && artMid.version > preArtVersion,
    `expected new artifact version after v${preArtVersion}; got v${artMid?.version}`,
  );
  assert.match(String(artMid!.content), /REVISED_AFTER_CRITIQUE/);
  assert.equal(artMid!.provenanceRunId, newRunId);
  assert.notEqual(corrective.runId, oldRunId);

  // Old rejected assignment/run cannot satisfy the new corrective action.
  const oldStill = (await readAssignments(t, key)).find(
    (a) => a.assignmentId === oldAssignmentId,
  )!;
  assert.equal(oldStill.state, "superseded");
  const oldFinish = (await t.mutation(async (ctx) =>
    (finishRun as unknown as Handler)._handler(ctx, {
      objectiveKey: key,
      runId: oldRunId,
      toolCalls: 0,
    }),
  )) as { completed: boolean; unmet: string[] };
  assert.equal(oldFinish.completed, false, "old run must not finalize the corrective work-item");

  const wakes = await t.query(async (ctx) => {
    const rows = await ctx.db
      .query("wakeEvents")
      .withIndex("by_objective", (q) => q.eq("objectiveKey", key))
      .collect();
    return rows.map((r) => (r as { data: { reason: string; refId?: string } }).data);
  });
  assert.ok(
    wakes.some((w) => w.reason === "worker_result" && w.refId === newRunId),
    `expected worker_result wake for ${newRunId}; got ${JSON.stringify(wakes)}`,
  );

  await invokePass(t, key, "worker_result");
  // Advance result_submitted → verified → satisfied via management passes.
  for (let i = 0; i < 4; i++) {
    const reqs = await readReqs(t, key);
    if (reqs[0]?.state === "satisfied") break;
    await invokePass(t, key, `verify_${i}`);
  }
  const satisfiedReq = (await readReqs(t, key))[0]!;
  assert.equal(satisfiedReq.state, "satisfied");
  assert.equal(
    satisfiedReq.resolution?.acceptedAssignmentId,
    corrective.assignmentId,
    "satisfaction must bind the corrective assignment, not the superseded one",
  );
  assert.notEqual(satisfiedReq.resolution?.acceptedAssignmentId, oldAssignmentId);

  installStructuredChatDouble((req) => {
    if (req.kind !== "final_assessment") throw new Error(`unexpected ${req.kind}`);
    const parsed = JSON.parse(req.user) as {
      artifact?: { version?: number; content?: string };
      ownedObservations?: unknown[];
      verifiedAcquisitions?: Array<{ resultEvidenceId?: string }>;
    };
    assert.ok((parsed.artifact?.version ?? 0) >= 3);
    assert.match(String(parsed.artifact?.content ?? ""), /REVISED_AFTER_CRITIQUE/);
    assert.ok(Array.isArray(parsed.ownedObservations));
    assert.ok(
      (parsed.verifiedAcquisitions ?? []).every(
        (a) => a.resultEvidenceId === "sim_acq_1",
      ),
    );
    return {
      meetsMinimumBar: true,
      rationale: "Revised artifact addresses critique with owned + acquisition evidence",
      artifactKey: ARTIFACT,
      artifactVersion: artMid!.version,
      evidenceRefs: ["sim_acq_1"],
      assumptionsUnknowns: [],
      recommendedNextAction: "complete",
    };
  });

  const began2 = (await t.mutation(async (ctx) =>
    (beginFinalSemanticAssessment as unknown as Handler)._handler(ctx, {
      objectiveKey: key,
      at: now + 10,
    }),
  )) as { proceed: boolean; requestId?: string; reason?: string };
  assert.equal(began2.proceed, true, began2.reason);
  await t.action(async (ctx) =>
    (proposeFinalSemanticAssessment as unknown as Handler)._handler(ctx, {
      objectiveKey: key,
      requestId: began2.requestId!,
      contractRevision: 1,
    }),
  );
  installStructuredChatDouble(null);

  const final = await invokePass(t, key, "final_assessment_applied");
  assert.equal(final.objectiveState, "completed");
  const finalObj = await readObj(t, key);
  assert.equal(finalObj.finalSemanticAssessment?.meetsMinimumBar, true);
  assert.equal(finalObj.management.finalAssessmentAttempts, 2);
  // Historical rejected assignment remains as superseded evidence.
  assert.equal(
    (await readAssignments(t, key)).find((a) => a.assignmentId === oldAssignmentId)
      ?.state,
    "superseded",
  );
});

test("pass3: second negative assessment reaches explicit blocked stop", async () => {
  const t = convexTest(schema, modules);
  const key = "obj_p3_stop";
  const reqKey = "req_relaunch";
  assert.equal(BEGIN_FINAL_ASSESSMENT_CEILING, 2);

  await t.mutation(async (ctx) => {
    await ctx.db.insert("objectives", {
      key,
      data: {
        key,
        request: "relaunch",
        createdAt: now,
        updatedAt: now,
        state: "executing",
        activity: "assessing",
        plan: null,
        workItems: [],
        run: null,
        result: null,
        companyArtifacts: [
          { key: ARTIFACT, version: 3, content: "still weak after revision", history: [] },
        ],
        finalSemanticAssessment: {
          meetsMinimumBar: false,
          rationale: "Still does not meet minimum bar after corrective attempt",
          artifactKey: ARTIFACT,
          artifactVersion: 3,
          evidenceRefs: [],
          assumptionsUnknowns: [],
          recommendedNextAction: "stop",
          contractRevision: 1,
          assessedAt: now,
        },
        management: {
          contractId: `c_${key}`,
          currentContractRevision: 1,
          executionProtocol: M61_SERIAL_V1,
          controlNotes: [],
          finalAssessmentAttempts: 2,
          pendingFinalAssessment: null,
          lastFinalAssessmentCritique: "Still does not meet minimum bar",
        },
      } as never,
    });
    await (initBudget as unknown as Handler)._handler(ctx, {
      objectiveKey: key,
      at: now,
    });
    await (putContract as unknown as Handler)._handler(ctx, {
      objectiveKey: key,
      contractId: `c_${key}`,
      revision: 1,
      data: makeContract(key),
    });
    await (putRequirement as unknown as Handler)._handler(ctx, {
      objectiveKey: key,
      requirementKey: reqKey,
      data: {
        ...makeDeliverable(key, reqKey),
        state: "satisfied",
        strategy: "MAKE",
        resolution: {
          resolutionId: "res_stop",
          acceptedDecisionId: "dec_stop",
          acceptedAssignmentId: "asg_stop",
          acceptedIntentId: null,
          proofRefs: [`artifact:${ARTIFACT}:3`],
          contractRevision: 1,
          acceptedAt: now,
        },
      },
      currentContractRevision: 1,
    });
  });

  const outcome = await invokePass(t, key, "second_negative");
  assert.equal(outcome.objectiveState, "blocked");
  assert.match(
    (outcome.unmet ?? []).join(" ") || outcome.summary,
    /final-assessment recovery budget exhausted|assessment/,
  );
  // Must not reopen for a third corrective cycle / fourth pending alone.
  const obj = await readObj(t, key);
  assert.equal(obj.management.pendingDecision ?? null, null);
  assert.equal((await readReqs(t, key))[0]?.state, "satisfied");
});

// V7 review R4: this test previously asserted that a manager-initiated BUY
// (no worker ResourceNeed, hence NO application-validated requested scope)
// could buy the purpose-scoped founder_narrative_pulse product. That
// eligibility came only from prose keyword luck ("relaunch"). Missing scope
// must now fail closed: the scoped product is grounded but ineligible, no BUY
// is authorized, no intent is created, and no need/scope is fabricated.
test("pass3: manager-initiated serial BUY without a validated scope cannot buy the purpose-scoped product (fails closed, nothing fabricated)", async () => {
  const t = convexTest(schema, modules);
  const key = "obj_p3_mgr_buy";
  const reqKey = "req_relaunch";
  const { buildDecisionPassInput } = await import("../lib/management/decisionPass");
  const { runManagerialDecisionPass } = await import("../lib/management/decision");
  const { readDecisionContext } = await import("../convex/internal/workforce");

  await t.mutation(async (ctx) => {
    await ctx.db.insert("objectives", {
      key,
      data: {
        key,
        request: "relaunch",
        createdAt: now,
        updatedAt: now,
        state: "executing",
        activity: "deciding",
        plan: null,
        workItems: [],
        run: null,
        result: null,
        // No open validated ResourceNeeds — manager-initiated BUY.
        resourceNeeds: [],
        companyArtifacts: [
          { key: ARTIFACT, version: 1, content: "seed", history: [] },
        ],
        management: {
          contractId: `c_${key}`,
          currentContractRevision: 1,
          executionProtocol: M61_SERIAL_V1,
          controlNotes: [],
          decisionAttempts: { [reqKey]: 1 },
          decisionRefusalAttempts: { [reqKey]: 0 },
          decisionInputFingerprints: {},
          pendingDecision: {
            requestId: `decide_${key}_${reqKey}_r1_a1`,
            requirementKey: reqKey,
            contractRevision: 1,
            attempts: 1,
          },
        },
      } as never,
    });
    await (initBudget as unknown as Handler)._handler(ctx, {
      objectiveKey: key,
      at: now,
    });
    await ctx.db.insert("founderSpendGrants", {
      approvalId: `grant_${key}`,
      objectiveKey: key,
      data: {
        approvalId: `grant_${key}`,
        objectiveKey: key,
        limitUsd: 25,
        grantedAt: now,
        revokedAt: null,
        note: "founder-approved bounded spend for manager BUY",
      },
    });
    await (putContract as unknown as Handler)._handler(ctx, {
      objectiveKey: key,
      contractId: `c_${key}`,
      revision: 1,
      data: makeContract(key),
    });
    await (putRequirement as unknown as Handler)._handler(ctx, {
      objectiveKey: key,
      requirementKey: reqKey,
      data: {
        ...makeDeliverable(key, reqKey),
        state: "active",
        strategy: null,
        // No declared missing class — BUY comes from manager proposal alone.
        requiredResourceClasses: [],
      },
      currentContractRevision: 1,
    });
  });

  const reads = (await t.query(async (ctx) =>
    (readDecisionContext as unknown as Handler)._handler(ctx, {
      objectiveKey: key,
      requirementKey: reqKey,
    }),
  )) as Record<string, unknown>;
  let buyOptionId: string | null = null;
  const built = await buildDecisionPassInput(
    {
      ...reads,
      at: now,
      decisionId: "probe_mgr_buy",
      serialManagerProtocol: true,
    } as never,
    {
      strategy: "BUY",
      desiredCapabilities: [],
      needsExternalResourceClass: "proprietary_data",
      notes: "manager-initiated acquisition",
    },
    async (eligible) => {
      buyOptionId =
        eligible.find((o) => o.kind === "external" && o.eligibility.eligible)?.optionId ?? null;
      return null; // the double never forces a strategy or provider
    },
  );
  assert.equal(built.ok, true);
  if (!built.ok) return;
  const pass = await runManagerialDecisionPass(built.input);
  assert.equal(buyOptionId, null, "no external option is eligible without a validated requested scope");
  const product = pass.options.find((o) => o.external?.serviceId === "founder_narrative_pulse");
  assert.ok(product, "the scoped product is still grounded (visible), not hidden");
  assert.equal(product!.external!.purposeScopeCompatible, false);
  assert.equal(product!.eligibility.eligible, false);
  assert.notEqual(pass.authorization.kind, "authorized", "no BUY is authorized");

  await invokePass(t, key, "decision_applied");
  assert.equal((await readIntents(t, key)).length, 0, "no intent without validated scope");
  const needs = (await readObj(t, key)).resourceNeeds ?? [];
  assert.equal(needs.length, 0, "no need (or scope) is fabricated to make BUY pass");
});

test("pass3: serial BUY with stale bound ResourceNeed is refused", async () => {
  const t = convexTest(schema, modules);
  const key = "obj_p3_stale_buy";
  const reqKey = "req_relaunch";
  const {
    buildExternalOption,
    withEligibility,
    eligibilityInputFor,
    EMPTY_FACTS,
  } = await import("../lib/management/options");
  const { buildConvexManagementPorts } = await import("../convex/management");
  const buyFacts = {
    requiredResourceClasses: ["proprietary_data"],
    controlledResourceClasses: ["proprietary_data"],
    deadlineAt: null,
    now,
    estimatedMinutes: null,
    requiresMandatoryProof: false,
    proofAvailable: true,
    workerAvailable: null,
    spendAuthorityUsd: 10,
    budgetRemainingUsd: 100,
  };
  const option = withEligibility(
    [
      buildExternalOption({
        requirementKey: reqKey,
        contractRevision: 1,
        offeringId: "2135:newsliquid_twitter_search",
        providerId: "2135",
        serviceId: "newsliquid_twitter_search",
        resourceClass: "proprietary_data",
        priceUsd: 4,
        priceProvenance: "provider_quote",
        registryVerified: true,
        compatibleResourceClass: true,
    executionPathConfigured: true,
    purposeScopeCompatible: true,
        facts: EMPTY_FACTS,
      }),
    ],
    (o) => eligibilityInputFor(o, buyFacts),
  )[0]!;

  await t.mutation(async (ctx) => {
    await ctx.db.insert("objectives", {
      key,
      data: {
        key,
        request: "relaunch",
        createdAt: now,
        updatedAt: now,
        state: "executing",
        activity: "dispatching",
        plan: null,
        workItems: [],
        run: null,
        result: null,
        resourceNeeds: [],
        companyArtifacts: [
          { key: ARTIFACT, version: 1, content: "seed", history: [] },
        ],
        management: {
          contractId: `c_${key}`,
          currentContractRevision: 1,
          executionProtocol: M61_SERIAL_V1,
          controlNotes: [],
        },
      } as never,
    });
    await (initBudget as unknown as Handler)._handler(ctx, {
      objectiveKey: key,
      at: now,
    });
    await (putContract as unknown as Handler)._handler(ctx, {
      objectiveKey: key,
      contractId: `c_${key}`,
      revision: 1,
      data: makeContract(key),
    });
    const requirement = {
      ...makeDeliverable(key, reqKey),
      state: "active" as const,
      strategy: "BUY" as const,
      requiredResourceClasses: [] as string[],
    };
    await (putRequirement as unknown as Handler)._handler(ctx, {
      objectiveKey: key,
      requirementKey: reqKey,
      data: requirement,
      currentContractRevision: 1,
    });
    const ports = buildConvexManagementPorts(ctx as never);
    await ports.persistDecision(
      {
        decision: {
          decisionId: "dec_stale_buy",
          objectiveKey: key,
          contractRevision: 1,
          requirementKey: reqKey,
          kind: "satisfaction_strategy",
          strategy: "BUY",
          optionId: option.optionId,
          recommendation: null,
          authorization: {
            kind: "authorized",
            decisionId: "dec_stale_buy",
            requirementKey: reqKey,
            contractRevision: 1,
            strategy: "BUY",
            optionId: option.optionId,
            authorizedAt: now,
            spendApprovalId: "appr_stale",
          },
          coarsePlanSummary: "stale-bound BUY",
          consideredOptionIds: [option.optionId],
          at: now,
        },
        boundRequirement: requirement,
        options: [option],
        recommendation: null,
        authorization: {
          kind: "authorized",
          decisionId: "dec_stale_buy",
          requirementKey: reqKey,
          contractRevision: 1,
          strategy: "BUY",
          optionId: option.optionId,
          authorizedAt: now,
          spendApprovalId: "appr_stale",
        },
        boundNeedDedupeKey: "need_does_not_exist",
        boundResourceNeedId: "rn_missing",
      } as never,
      now,
    );
  });

  assert.equal((await readIntents(t, key)).length, 0);
  await invokePass(t, key, "stale_bound_buy");
  assert.equal(
    (await readIntents(t, key)).length,
    0,
    "stale bound ResourceNeed must refuse BUY intent",
  );
  const events = await t.query(async (ctx) => {
    const rows = await ctx.db
      .query("objectiveEvents")
      .withIndex("by_objectiveKey", (q) => q.eq("objectiveKey", key))
      .collect();
    return rows.map((r) => (r as { data: { text?: string } }).data);
  });
  assert.ok(
    events.some((e) => /stale or missing|refusing unbound BUY/i.test(String(e.text ?? ""))),
    "stale bound BUY must leave an explicit deferral note",
  );
});

test("pass3: proposeDecision doubles receive result package / critique; authorize MAKE", async () => {
  const t = convexTest(schema, modules);
  const key = "obj_p3_propose";
  const reqKey = "req_relaunch";
  const critique = "Prior draft missing CTA clarity and audience language";
  const strategyUsers: string[] = [];
  const recUsers: string[] = [];

  await t.mutation(async (ctx) => {
    await ctx.db.insert("objectives", {
      key,
      data: {
        key,
        request: "relaunch",
        createdAt: now,
        updatedAt: now,
        state: "executing",
        activity: "deciding",
        plan: null,
        workItems: [],
        run: null,
        result: {
          summary: "prior worker output",
          fit: "partial",
          risks: [],
          unknowns: [],
          recommendedNextAction: "revise",
          completedAt: now,
        },
        companyArtifacts: [
          { key: ARTIFACT, version: 2, content: "prior draft", history: [] },
        ],
        management: {
          contractId: `c_${key}`,
          currentContractRevision: 1,
          executionProtocol: M61_SERIAL_V1,
          controlNotes: [],
          decisionAttempts: { [reqKey]: 1 },
          decisionRefusalAttempts: { [reqKey]: 0 },
          decisionInputFingerprints: {},
          lastFinalAssessmentCritique: critique,
          pendingDecision: {
            requestId: `decide_${key}_${reqKey}_r1_a1`,
            requirementKey: reqKey,
            contractRevision: 1,
            attempts: 1,
          },
        },
      } as never,
    });
    await (initBudget as unknown as Handler)._handler(ctx, {
      objectiveKey: key,
      at: now,
    });
    await (putContract as unknown as Handler)._handler(ctx, {
      objectiveKey: key,
      contractId: `c_${key}`,
      revision: 1,
      data: makeContract(key),
    });
    await (putRequirement as unknown as Handler)._handler(ctx, {
      objectiveKey: key,
      requirementKey: reqKey,
      data: {
        ...makeDeliverable(key, reqKey),
        state: "active",
        strategy: null,
      },
      currentContractRevision: 1,
    });
  });

  installStructuredChatDouble((req) => {
    if (req.kind === "strategy") {
      strategyUsers.push(req.user);
      assert.match(req.user, /MANAGER_RESULT_PACKAGE/);
      assert.match(req.user, /finalReviewCritique|CTA clarity|audience language/);
      return {
        strategy: "MAKE",
        desiredCapabilities: [...MAKE_CAPS],
        needsExternalResourceClass: null,
        notes: "corrective make after critique",
      };
    }
    if (req.kind === "recommendation") {
      recUsers.push(req.user);
      assert.match(req.user, /MANAGER_RESULT_PACKAGE/);
      assert.match(req.user, /finalReviewCritique|CTA clarity|audience language/);
      const optionsMatch = req.user.match(
        /ELIGIBLE OPTIONS \(untrusted facts\): (\[.*\])\n/s,
      );
      assert.ok(optionsMatch, "recommendation must include eligible options JSON");
      const options = JSON.parse(optionsMatch![1]!) as Array<{
        optionId: string;
        kind: string;
      }>;
      const internal = options.find((o) => o.kind === "internal");
      assert.ok(internal, `expected internal option; got ${JSON.stringify(options)}`);
      return {
        requirementKey: reqKey,
        contractRevision: 1,
        selectedOptionId: internal!.optionId,
        strongestAlternativeId: null,
        rationale: "MAKE using owned capability to revise deliverable",
        materialAssumptions: [],
        changeMyMindEvidence: [],
      };
    }
    throw new Error(`unexpected kind ${req.kind}`);
  });

  const result = (await t.action(async (ctx) =>
    (proposeDecision as unknown as Handler)._handler(ctx, {
      objectiveKey: key,
      requestId: `decide_${key}_${reqKey}_r1_a1`,
      requirementKey: reqKey,
      contractRevision: 1,
    }),
  )) as { ok: boolean; detail: string };
  installStructuredChatDouble(null);

  assert.equal(result.ok, true, result.detail);
  assert.equal(strategyUsers.length, 1);
  assert.equal(recUsers.length, 1);
  const reqAfter = (await readReqs(t, key))[0]!;
  assert.equal(reqAfter.strategy, "MAKE");
});

test("pass3: executeWorker production seam with worker model double finalizes + wakes", async () => {
  const t = convexTest(schema, modules);
  const key = "obj_p3_exec";
  const runId = "run_p3_exec";
  const workContract = createWorkContract({
    assignment: "Deliver relaunch recommendation",
    idempotencyScope: `${key}:exec`,
    worker: createWorkerSpec([...MAKE_CAPS]),
    sourceProofs: [{ sourceClass: "company_record", minDistinctSources: 1 }],
    inputEvidenceIds: [],
    targetArtifactKey: ARTIFACT,
  });

  await t.mutation(async (ctx) => {
    await ctx.db.insert("objectives", {
      key,
      data: {
        key,
        request: "relaunch",
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
          { key: ARTIFACT, version: 1, content: "seed message", history: [] },
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

  let step = 0;
  const model: Model = {
    async getResponse() {
      step += 1;
      if (step === 1) {
        return {
          usage: new Usage(),
          output: [
            toolCall(
              "read_company_record",
              { recordRef: "launch/context" },
              "e1",
            ),
          ],
        };
      }
      if (step === 2) {
        return {
          usage: new Usage(),
          output: [
            toolCall(
              "update_company_artifact",
              {
                content: "EXECUTE_WORKER_SEAM: relaunch recommendation from owned records",
                changeNote: "executeWorker seam",
                usedAcquisitionEvidenceIds: [],
              },
              "e2",
            ),
          ],
        };
      }
      return {
        usage: new Usage(),
        output: [
          toolCall(
            "submit_result",
            {
              summary: "executeWorker seam delivered",
              fit: "ok",
              risks: [],
              unknowns: [],
              recommendedNextAction: "complete",
              terminal: "DELIVERED",
            },
            "e3",
          ),
        ],
      };
    },
    async *getStreamedResponse() {
      throw new Error("unused");
    },
  };
  installWorkerModelDouble(model);

  const out = (await t.action(async (ctx) =>
    (executeWorker as unknown as Handler)._handler(ctx, {
      objectiveKey: key,
      runId,
    }),
  )) as { completed: boolean; unmet: string[] };
  installWorkerModelDouble(null);

  assert.equal(
    out.completed,
    true,
    `executeWorker incomplete: ${out.unmet.join("; ") || "(no unmet listed)"}`,
  );
  assert.deepEqual(out.unmet, []);

  const obj = await readObj(t, key);
  assert.equal(obj.workItems?.[0]?.state, "completed");
  assert.ok(
    obj.run == null ||
      obj.run.status === "stopped" ||
      obj.run.status === "completed",
    `durable run must be terminal; got ${obj.run?.status}`,
  );
  assert.ok(obj.result != null, "structured result must be persisted");
  assert.equal(obj.result?.runId, runId);
  assert.notEqual(obj.state, "completed", "Objective completion is separate from worker completion");

  const wakes = await t.query(async (ctx) => {
    const rows = await ctx.db
      .query("wakeEvents")
      .withIndex("by_objective", (q) => q.eq("objectiveKey", key))
      .collect();
    return rows.map((r) => (r as { data: { reason: string; refId: string } }).data);
  });
  assert.ok(
    wakes.some((w) => w.reason === "worker_result" && w.refId === runId),
    `expected matching worker_result wake; got ${JSON.stringify(wakes)}`,
  );

  const art = obj.companyArtifacts?.find((a) => a.key === ARTIFACT);
  assert.ok(art && art.version >= 2);
  assert.match(String(art!.content), /EXECUTE_WORKER_SEAM/);
  assert.equal(art!.provenanceRunId, runId);
});

test("pass3: assessment grounding excludes unrelated Objective-wide acquisitions", async () => {
  const t = convexTest(schema, modules);
  const key = "obj_p3_ground";
  const reqKey = "req_relaunch";
  const linkedId = "sim_linked_only";
  const unrelatedId = "sim_unrelated_other_req";
  const workContract = createWorkContract({
    assignment: "Deliver relaunch",
    idempotencyScope: `${key}:g`,
    worker: createWorkerSpec([...MAKE_CAPS]),
    sourceProofs: [{ sourceClass: "company_record", minDistinctSources: 1 }],
    inputEvidenceIds: [linkedId],
    targetArtifactKey: ARTIFACT,
  });

  await t.mutation(async (ctx) => {
    await ctx.db.insert("objectives", {
      key,
      data: {
        key,
        request: "relaunch",
        createdAt: now,
        updatedAt: now,
        state: "executing",
        activity: "assessing",
        plan: null,
        workItems: [],
        run: null,
        result: null,
        companyArtifacts: [
          {
            key: ARTIFACT,
            version: 2,
            content: "grounded relaunch text",
            history: [],
          },
        ],
        acquisitionResults: [
          {
            intentId: "int_linked",
            requirementKey: reqKey,
            contractRevision: 1,
            resultEvidenceId: linkedId,
            provenance: "simulation",
            providerId: "p",
            serviceId: "s",
            offeringId: "o",
            resourceClass: "proprietary_data",
            content: "LINKED acquisition body",
            responseHash: "hl",
            recordedAt: now,
            verifiedAt: now,
          },
          {
            intentId: "int_other",
            requirementKey: "req_other",
            contractRevision: 1,
            resultEvidenceId: unrelatedId,
            provenance: "simulation",
            providerId: "p2",
            serviceId: "s2",
            offeringId: "o2",
            resourceClass: "proprietary_data",
            content: "UNRELATED acquisition must not ground assessment",
            responseHash: "hu",
            recordedAt: now,
            verifiedAt: now,
          },
        ],
        management: {
          contractId: `c_${key}`,
          currentContractRevision: 1,
          executionProtocol: M61_SERIAL_V1,
          controlNotes: [],
          finalAssessmentAttempts: 0,
          pendingFinalAssessment: null,
        },
      } as never,
    });
    await (putContract as unknown as Handler)._handler(ctx, {
      objectiveKey: key,
      contractId: `c_${key}`,
      revision: 1,
      data: makeContract(key),
    });
    await (putRequirement as unknown as Handler)._handler(ctx, {
      objectiveKey: key,
      requirementKey: reqKey,
      data: {
        ...makeDeliverable(key, reqKey),
        state: "satisfied",
        strategy: "MAKE",
      },
      currentContractRevision: 1,
    });
    await (putAssignment as unknown as Handler)._handler(ctx, {
      assignmentId: "asg_ground",
      objectiveKey: key,
      data: {
        assignmentId: "asg_ground",
        objectiveKey: key,
        requirementKey: reqKey,
        contractRevision: 1,
        decisionId: "dec_ground",
        workerKey: workContract.workerKey,
        kind: "internal_make",
        state: "verified",
        attempt: 1,
        runId: "run_ground",
        workContract,
        resultSummary: "ok",
        idempotencyScope: workContract.idempotencyScope,
        createdAt: now,
        updatedAt: now,
      },
    });
    // Owned observation evidence row.
    await ctx.db.insert("evidence", {
      objectiveKey: key,
      evidenceId: "ev_owned_1",
      data: {
        sourceClass: "company_record",
        label: "launch context",
        text: "Owned observation for assessment",
        origin: "application_observation",
        sourceId: "record:launch/context",
        recordRef: "launch/context",
        observedAt: now,
        recordedBy: workContract.workerKey,
        runId: "run_ground",
      },
    });
  });

  const seen: Array<Record<string, unknown>> = [];
  installStructuredChatDouble((req) => {
    if (req.kind !== "final_assessment") throw new Error(req.kind);
    const parsed = JSON.parse(req.user) as Record<string, unknown>;
    seen.push(parsed);
    return {
      meetsMinimumBar: true,
      rationale: "ok",
      artifactKey: ARTIFACT,
      artifactVersion: 2,
      evidenceRefs: [linkedId, "ev_owned_1"],
      assumptionsUnknowns: [],
      recommendedNextAction: "complete",
    };
  });

  const began = (await t.mutation(async (ctx) =>
    (beginFinalSemanticAssessment as unknown as Handler)._handler(ctx, {
      objectiveKey: key,
      at: now,
    }),
  )) as { proceed: boolean; requestId?: string; reason?: string };
  assert.equal(began.proceed, true, began.reason);
  await t.action(async (ctx) =>
    (proposeFinalSemanticAssessment as unknown as Handler)._handler(ctx, {
      objectiveKey: key,
      requestId: began.requestId!,
      contractRevision: 1,
    }),
  );
  installStructuredChatDouble(null);

  assert.equal(seen.length, 1);
  const payload = seen[0]!;
  const acq = (payload.verifiedAcquisitions ?? []) as Array<{
    resultEvidenceId: string;
  }>;
  const owned = (payload.ownedObservations ?? []) as Array<{ evidenceId: string }>;
  const evidenceIds = (payload.evidenceIds ?? []) as string[];
  assert.ok(acq.some((a) => a.resultEvidenceId === linkedId));
  assert.equal(
    acq.some((a) => a.resultEvidenceId === unrelatedId),
    false,
    "unrelated Objective-wide acquisition must not ground assessment",
  );
  assert.ok(owned.some((o) => o.evidenceId === "ev_owned_1"));
  assert.equal(evidenceIds.includes(unrelatedId), false);
});
