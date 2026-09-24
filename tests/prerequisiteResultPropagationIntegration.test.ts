// Focused regression: the manager's prerequisiteResults (readDecisionContext)
// and the dependent worker's loadedInputPackage.priorRequirementResults
// (readWorkerObservation) must project the SAME accepted prerequisite
// conclusion (item 7), from the actual accepted worker output rather than
// generic "application verified" bookkeeping text (item 5), and
// inputEvidenceIds must stay untouched acquisition/provenance authority
// (item 6) — never repurposed to carry this DATA.
import test, { mock, after as afterAll } from "node:test";
import assert from "node:assert/strict";
import { convexTest } from "convex-test";
import schema from "../convex/schema";
import { initBudget, putContract, putRequirement, readDecisionContext } from "../convex/internal/workforce";
import { readWorkerObservation } from "../convex/objectives";
import { buildOutcomeContract, buildRequirement } from "../lib/management/contract";
import { M61_SERIAL_V1 } from "../lib/management/executionProtocol";
import { createWorkContract, createWorkerSpec } from "../lib/workforce";
import type { Requirement } from "../lib/management/types";

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

type Handler = { _handler: (c: unknown, a: Record<string, unknown>) => Promise<unknown> };
const now = 1_985_000_000_000;
const key = "obj_prereq_propagation";
const ARTIFACT = "launch/page-message";

function contract() {
  const built = buildOutcomeContract({
    objectiveKey: key,
    contractId: `c_${key}`,
    revision: 1,
    parsed: {
      intent: "launch plan",
      levels: [{ levelKey: "plan", order: 1, statement: "saved launch plan exists", label: "Plan" }],
      minimumCompletionBar: "plan",
      ambiguities: [],
    },
    requestId: "r1",
    founderResolvedQuestions: [],
    at: now,
  });
  return (built as unknown as { contract: never }).contract;
}

function requirement(reqKey: string, dependsOn: string[]): Requirement {
  const built = buildRequirement(
    {
      objectiveKey: key,
      contract: contract(),
      proposed: {
        requirementKey: reqKey,
        priority: "required",
        title: `Title ${reqKey}`,
        mustBeTrue: `truth of ${reqKey}`,
        scope: "s",
        dependsOnRequirementKeys: dependsOn,
        requiredResourceClasses: [],
        expectedOutput: "artifact",
        requirementKind: "deliverable",
      },
      artifactKeyForInternalProof: ARTIFACT,
      at: now,
    } as never,
    null,
  );
  return (built as { requirement: Requirement }).requirement;
}

const ACCEPTED_SUMMARY =
  "owned company evidence and public evidence were both inspected; product/channel-specific audience or engagement claims remain unsupported";
const ACCEPTED_FIT = "sufficient for messaging tone, insufficient for audience sizing";
const ACCEPTED_NEXT_ACTION = "the launch-plan worker should not claim audience size without new evidence";
const ACCEPTED_UNKNOWNS = ["exact audience size per channel is unknown"];

async function seed(t: ReturnType<typeof convexTest>) {
  const prereqWorkContract = createWorkContract({
    assignment: "Assess existing company + public evidence sufficiency",
    idempotencyScope: `${key}:req_evidence:run`,
    worker: createWorkerSpec(["company_records_lookup", "public_information_research"]),
    sourceProofs: [{ sourceClass: "company_record", minDistinctSources: 1 }],
    inputEvidenceIds: [],
  });
  const planWorkContract = createWorkContract({
    assignment: "Produce launch_week_social_media_plan",
    idempotencyScope: `${key}:req_plan:run`,
    worker: createWorkerSpec(["growth_launch_operations"]),
    sourceProofs: [{ sourceClass: "company_record", minDistinctSources: 1 }],
    inputEvidenceIds: [],
    targetArtifactKey: ARTIFACT,
  });
  const runId = "run_plan_1";

  await t.mutation(async (ctx) => {
    await ctx.db.insert("objectives", {
      key,
      data: {
        key,
        request: "launch plan",
        createdAt: now,
        updatedAt: now,
        state: "executing",
        activity: "running",
        plan: null,
        workItems: [
          {
            id: "wi:asg_plan",
            objectiveKey: key,
            title: "plan",
            assignment: planWorkContract.assignment,
            workerKey: planWorkContract.workerKey,
            state: "running",
            contract: planWorkContract,
            runs: [
              {
                id: runId,
                workItemId: "wi:asg_plan",
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
          workItemId: "wi:asg_plan",
          status: "running",
          startedAt: now,
          leaseUntil: now + 120_000,
          model: "mock",
          modelSelectionReason: "test",
          toolCalls: 0,
          summary: "",
        },
        result: null,
        companyArtifacts: [{ key: ARTIFACT, version: 1, content: "seed", history: [] }],
        management: {
          contractId: `c_${key}`,
          currentContractRevision: 1,
          executionProtocol: M61_SERIAL_V1,
          controlNotes: [],
          decisionAttempts: {},
          decisionRefusalAttempts: {},
          decisionInputFingerprints: {},
          pendingDecision: null,
        },
      } as never,
    });
    await (initBudget as unknown as Handler)._handler(ctx, { objectiveKey: key, at: now });
    await (putContract as unknown as Handler)._handler(ctx, {
      objectiveKey: key,
      contractId: `c_${key}`,
      revision: 1,
      data: contract(),
    });

    const evidenceReq = requirement("req_evidence", []);
    await (putRequirement as unknown as Handler)._handler(ctx, {
      objectiveKey: key,
      requirementKey: "req_evidence",
      data: {
        ...evidenceReq,
        state: "satisfied",
        resolution: {
          resolutionId: "res_evidence",
          acceptedDecisionId: null,
          acceptedAssignmentId: "asg_evidence",
          acceptedIntentId: null,
          proofRefs: ["ev_company_1"],
          contractRevision: 1,
          acceptedAt: now,
        },
      },
      currentContractRevision: 1,
    });
    const planReq = requirement("req_plan", ["req_evidence"]);
    await (putRequirement as unknown as Handler)._handler(ctx, {
      objectiveKey: key,
      requirementKey: "req_plan",
      data: { ...planReq, state: "active" },
      currentContractRevision: 1,
    });

    // The prerequisite's own durable accepted-output snapshot: exactly what
    // projectAcceptedOutputSnapshot writes when management.ts moves an
    // assignment to "verified".
    await ctx.db.insert("assignments", {
      assignmentId: "asg_evidence",
      objectiveKey: key,
      data: {
        assignmentId: "asg_evidence",
        objectiveKey: key,
        requirementKey: "req_evidence",
        contractRevision: 1,
        decisionId: "dec_evidence",
        workerKey: "w_evidence",
        kind: "internal_make",
        state: "verified",
        attempt: 1,
        runId: "run_evidence_1",
        workContract: prereqWorkContract,
        resultSummary: "application-verified against the current revision's proof obligations",
        idempotencyScope: `${key}:req_evidence:run`,
        createdAt: now,
        updatedAt: now,
        acceptedOutput: {
          runId: "run_evidence_1",
          terminal: "DELIVERED",
          summary: ACCEPTED_SUMMARY,
          fit: ACCEPTED_FIT,
          unknowns: ACCEPTED_UNKNOWNS,
          recommendedNextAction: ACCEPTED_NEXT_ACTION,
          acceptedAt: now,
        },
      },
    });
    // The current (dependent) Requirement's own in-flight assignment, so
    // readWorkerObservation can resolve requirementKey/contractRevision for
    // this run via loadLockedCriteriaForRun.
    await ctx.db.insert("assignments", {
      assignmentId: "asg_plan",
      objectiveKey: key,
      data: {
        assignmentId: "asg_plan",
        objectiveKey: key,
        requirementKey: "req_plan",
        contractRevision: 1,
        decisionId: "dec_plan",
        workerKey: "w_plan",
        kind: "internal_make",
        state: "running",
        attempt: 1,
        runId,
        workContract: planWorkContract,
        resultSummary: null,
        idempotencyScope: `${key}:req_plan:run`,
        createdAt: now,
        updatedAt: now,
      },
    });
  });

  return { runId };
}

test("5+7: manager prerequisiteResults and worker priorRequirementResults both carry the SAME actual accepted worker output, not generic bookkeeping text", async () => {
  const t = convexTest(schema, modules);
  const { runId } = await seed(t);

  const managerReads = (await t.query(async (ctx) =>
    (readDecisionContext as unknown as Handler)._handler(ctx, { objectiveKey: key, requirementKey: "req_plan" }),
  )) as {
    prerequisiteResults: Array<{
      requirementKey: string;
      summary: string;
      fit: string;
      unknowns: string[];
      recommendedNextAction: string;
    }>;
  };

  const workerReads = (await t.query(async (ctx) =>
    (readWorkerObservation as unknown as Handler)._handler(ctx, { objectiveKey: key, runId }),
  )) as {
    loadedInputPackage?: {
      priorRequirementResults: Array<{
        requirementKey: string;
        summary: string;
        fit: string;
        unknowns: string[];
        recommendedNextAction: string;
      }>;
      inputEvidenceIds: string[];
    };
  };

  assert.equal(managerReads.prerequisiteResults.length, 1);
  const managerFact = managerReads.prerequisiteResults[0]!;
  assert.equal(managerFact.requirementKey, "req_evidence");
  assert.equal(managerFact.summary, ACCEPTED_SUMMARY);
  assert.notEqual(managerFact.summary, "application-verified against the current revision's proof obligations");
  assert.equal(managerFact.fit, ACCEPTED_FIT);
  assert.deepEqual(managerFact.unknowns, ACCEPTED_UNKNOWNS);
  assert.equal(managerFact.recommendedNextAction, ACCEPTED_NEXT_ACTION);

  const pkg = workerReads.loadedInputPackage;
  assert.ok(pkg, "serial worker observation carries loadedInputPackage");
  assert.equal(pkg!.priorRequirementResults.length, 1);
  const workerFact = pkg!.priorRequirementResults[0]!;
  assert.deepEqual(workerFact, {
    requirementKey: managerFact.requirementKey,
    summary: managerFact.summary,
    fit: managerFact.fit,
    unknowns: managerFact.unknowns,
    recommendedNextAction: managerFact.recommendedNextAction,
  });

  // item 6: inputEvidenceIds stays acquisition/provenance-only — this
  // Requirement linked no verified external acquisitions, so it is empty,
  // and is never repurposed to carry the prerequisite's MAKE conclusion.
  assert.deepEqual(pkg!.inputEvidenceIds, []);
});
