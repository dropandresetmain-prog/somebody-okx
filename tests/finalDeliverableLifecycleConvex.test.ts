/**
 * Final-deliverable lifecycle — production Convex seams for the remaining
 * cross-stage defects on a multi-deliverable serial Objective:
 *
 *   interpretation binding (Opus) already chooses the unique terminal
 *   deliverable; these tests prove assessment targeting, scoped correction,
 *   and exact artifact-version reassessment use that same identity.
 *
 * No live payment / signing / provider call. Model boundaries are doubled.
 */
import test, { mock, after as afterAll } from "node:test";
import assert from "node:assert/strict";
import { convexTest } from "convex-test";
import schema from "../convex/schema";
import {
  applyFinalSemanticAssessment,
  applyInterpretation,
  beginFinalSemanticAssessment,
  beginInterpretation,
  runManagementPass,
} from "../convex/management";
import { proposeFinalSemanticAssessment } from "../convex/objectiveRunner";
import {
  initBudget,
  putAssignment,
  putContract,
  putRequirement,
} from "../convex/internal/workforce";
import { resolveGovernedAssessmentTarget } from "../lib/management/finalDeliverableLifecycle";
import { M61_SERIAL_V1 } from "../lib/management/executionProtocol";
import { installStructuredChatDouble } from "../lib/management/modelBoundary";
import { SUBMISSION_EXTERNAL_SOCIAL_PURPOSE_POLICY } from "../lib/objective/seedData";
import { createWorkContract, createWorkerSpec } from "../lib/workforce";
import type { Assignment, Requirement } from "../lib/management/types";
import type { ObjectiveRecord } from "../lib/objective/types";

const modules = {
  "../convex/schema.ts": () => import("../convex/schema"),
  "../convex/objectiveValidators.ts": () => import("../convex/objectiveValidators"),
  "../convex/managementValidators.ts": () => import("../convex/managementValidators"),
  "../convex/workforceGuards.ts": () => import("../convex/workforceGuards"),
  "../convex/objectives.ts": () => import("../convex/objectives"),
  "../convex/objectiveRunner.ts": () => import("../convex/objectiveRunner"),
  "../convex/productCommands.ts": () => import("../convex/productCommands"),
  "../convex/productWorkspace.ts": () => import("../convex/productWorkspace"),
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
});

const now = 1_990_000_000_000;
const KEY = "obj_fdl_lifecycle";
const ARTIFACT = "objective/deliverable";
const REQ_LAUNCH = "launch_context";
const REQ_BENCH = "comparative_benchmark";
const REQ_PLAN = "founder_ready_launch_plan";
const REQ_INPUT = "owned_evidence";

type Backend = ReturnType<typeof convexTest>;
type Handler = { _handler: (ctx: unknown, args: Record<string, unknown>) => Promise<unknown> };
const call = (fn: unknown, ctx: unknown, args: Record<string, unknown>) =>
  (fn as Handler)._handler(ctx, args);

async function readObj(t: Backend) {
  return t.query(async (ctx) => {
    const row = await ctx.db
      .query("objectives")
      .withIndex("by_key", (q) => q.eq("key", KEY))
      .unique();
    return (row as { data: ObjectiveRecord & { management: Record<string, unknown> } }).data;
  });
}

async function readReqs(t: Backend): Promise<Requirement[]> {
  return t.query(async (ctx) => {
    const rows = await ctx.db
      .query("requirements")
      .withIndex("by_objectiveKey", (q) => q.eq("objectiveKey", KEY))
      .collect();
    return rows.map((r) => (r as { data: Requirement }).data);
  });
}

async function readAssignments(t: Backend): Promise<Assignment[]> {
  return t.query(async (ctx) => {
    const rows = await ctx.db
      .query("assignments")
      .withIndex("by_objective", (q) => q.eq("objectiveKey", KEY))
      .collect();
    return rows.map((r) => (r as { data: Assignment }).data);
  });
}

function satisfiedDeliverable(
  requirementKey: string,
  deps: string[],
  assignmentId: string,
  opts: { kind?: "deliverable" | "input"; artifactKey?: string; minVersion?: number } = {},
): Requirement {
  const kind = opts.kind ?? "deliverable";
  const artifactKey = opts.artifactKey ?? ARTIFACT;
  const minVersion = opts.minVersion ?? 2;
  return {
    requirementKey,
    objectiveKey: KEY,
    contractId: `c_${KEY}`,
    contractRevision: 1,
    priority: "required",
    title: requirementKey,
    mustBeTrue: `${requirementKey} must be delivered`,
    scope: "test",
    dependsOnRequirementKeys: deps,
    requiredResourceClasses: kind === "input" ? ["proprietary_data"] : ["company_records"],
    expectedOutput: "saved output",
    requirementKind: kind,
    state: "satisfied",
    strategy: kind === "input" ? "BUY" : "MAKE",
    resolution: {
      resolutionId: `res_${requirementKey}`,
      acceptedDecisionId: `dec_${requirementKey}`,
      acceptedAssignmentId: assignmentId,
      acceptedIntentId: kind === "input" ? "int_buy_bench" : null,
      proofRefs: kind === "input" ? ["acq:sim_bench"] : [`artifact:${artifactKey}:${minVersion}`],
      contractRevision: 1,
      acceptedAt: now,
    },
    blockedReason: null,
    waiver: null,
    revision: 1,
    createdAt: now,
    updatedAt: now,
    proofs:
      kind === "input"
        ? [
            {
              proofKey: "external",
              description: "verified acquisition",
              proofKind: "verified_external_result",
              params: {},
            },
          ]
        : [
            {
              proofKey: "artifact",
              description: "saved output",
              proofKind: "company_artifact_version",
              params: { artifactKey, minVersion },
            },
          ],
  };
}

function verifiedAssignment(
  requirementKey: string,
  assignmentId: string,
): Assignment {
  const workContract = createWorkContract({
    assignment: `Deliver ${requirementKey}`,
    idempotencyScope: `${KEY}:${assignmentId}`,
    worker: createWorkerSpec([
      "growth_launch_operations",
      "company_records_lookup",
      "public_information_research",
    ]),
    sourceProofs: [{ sourceClass: "company_record", minDistinctSources: 1 }],
    inputEvidenceIds: requirementKey === REQ_INPUT ? ["sim_bench"] : [],
    targetArtifactKey: ARTIFACT,
  });
  return {
    assignmentId,
    objectiveKey: KEY,
    requirementKey,
    contractRevision: 1,
    decisionId: `dec_${requirementKey}`,
    workerKey: workContract.workerKey,
    kind: "internal_make",
    state: "verified",
    attempt: 1,
    runId: `run_${assignmentId}`,
    workContract,
    resultSummary: `accepted ${requirementKey}`,
    idempotencyScope: workContract.idempotencyScope,
    createdAt: now,
    updatedAt: now,
  } as Assignment;
}

async function seedSatisfiedMultiDeliverable(t: Backend, artifactVersion = 5) {
  await t.mutation(async (ctx) => {
    await ctx.db.insert("objectives", {
      key: KEY,
      data: {
        key: KEY,
        request: "founder-ready launch plan",
        createdAt: now,
        updatedAt: now,
        state: "executing",
        activity: "assessing",
        plan: null,
        workItems: [],
        run: null,
        result: {
          summary: "first final draft",
          fit: "thin",
          risks: ["needs revision"],
          unknowns: [],
          recommendedNextAction: "revise",
          completedAt: now,
        },
        companyArtifacts: [
          {
            key: ARTIFACT,
            version: artifactVersion,
            content: `FINAL_DRAFT_V${artifactVersion} — missing CTA clarity`,
            history: [],
          },
        ],
        acquisitionResults: [
          {
            intentId: "int_buy_bench",
            requirementKey: REQ_INPUT,
            contractRevision: 1,
            resultEvidenceId: "sim_bench",
            provenance: "simulation",
            providerId: "p_social",
            serviceId: "svc_guru",
            offeringId: "off_1",
            resourceClass: "proprietary_data",
            content: "audience language from BUY",
            responseHash: "h_bench",
            recordedAt: now,
            verifiedAt: now,
            needDedupeKey: "need_bench",
          },
        ],
        management: {
          contractId: `c_${KEY}`,
          currentContractRevision: 1,
          executionProtocol: M61_SERIAL_V1,
          controlNotes: [],
          decisionAttempts: {
            [REQ_INPUT]: 2,
            [REQ_LAUNCH]: 1,
            [REQ_BENCH]: 1,
            [REQ_PLAN]: 1,
          },
          decisionRefusalAttempts: {},
          decisionInputFingerprints: {
            [REQ_INPUT]: "fp_input",
            [REQ_LAUNCH]: "fp_launch",
            [REQ_BENCH]: "fp_bench",
            [REQ_PLAN]: "fp_plan",
          },
          pendingDecision: null,
          finalAssessmentAttempts: 0,
          pendingFinalAssessment: null,
          authorizedPurposePolicy: SUBMISSION_EXTERNAL_SOCIAL_PURPOSE_POLICY,
        },
      } as never,
    });
    await call(initBudget, ctx, { objectiveKey: KEY, at: now });
    await call(putContract, ctx, {
      objectiveKey: KEY,
      contractId: `c_${KEY}`,
      revision: 1,
      data: {
        contractId: `c_${KEY}`,
        objectiveKey: KEY,
        revision: 1,
        intent: "founder-ready launch plan",
        levels: [
          {
            levelKey: "plan",
            order: 1,
            statement: "a founder-ready launch plan is saved",
            label: "Launch plan",
          },
        ],
        minimumCompletionBar: "plan",
        ambiguities: [],
        createdBy: "somebody",
        createdFromRequestId: `interpret_${KEY}`,
        createdAt: now,
      },
    });

    const reqs = [
      satisfiedDeliverable(REQ_INPUT, [], "asg_input", { kind: "input" }),
      satisfiedDeliverable(REQ_LAUNCH, [REQ_INPUT], "asg_launch"),
      satisfiedDeliverable(REQ_BENCH, [], "asg_bench"),
      satisfiedDeliverable(REQ_PLAN, [REQ_LAUNCH, REQ_BENCH], "asg_plan", {
        minVersion: 2,
      }),
    ];
    for (const req of reqs) {
      await call(putRequirement, ctx, {
        objectiveKey: KEY,
        requirementKey: req.requirementKey,
        data: req,
        currentContractRevision: 1,
      });
    }
    for (const asg of [
      verifiedAssignment(REQ_INPUT, "asg_input"),
      verifiedAssignment(REQ_LAUNCH, "asg_launch"),
      verifiedAssignment(REQ_BENCH, "asg_bench"),
      verifiedAssignment(REQ_PLAN, "asg_plan"),
    ]) {
      await call(putAssignment, ctx, {
        assignmentId: asg.assignmentId,
        objectiveKey: KEY,
        data: asg,
      });
    }
  });
}

test("assessment begin binds the unique terminal deliverable, not array-first intermediates", async () => {
  const t = convexTest(schema, modules);
  await seedSatisfiedMultiDeliverable(t, 5);

  const reqs = await readReqs(t);
  const obj = await readObj(t);
  // Order intermediates first to catch any residual array-order fallback.
  const shuffled = [
    reqs.find((r) => r.requirementKey === REQ_LAUNCH)!,
    reqs.find((r) => r.requirementKey === REQ_BENCH)!,
    reqs.find((r) => r.requirementKey === REQ_INPUT)!,
    reqs.find((r) => r.requirementKey === REQ_PLAN)!,
  ];
  const resolved = resolveGovernedAssessmentTarget({
    requirements: shuffled,
    artifacts: obj.companyArtifacts ?? [],
    contractRevision: 1,
  });
  assert.equal(resolved.ok, true);
  if (!resolved.ok) throw new Error(resolved.reason);
  assert.equal(resolved.requirementKey, REQ_PLAN);
  assert.equal(resolved.artifactKey, ARTIFACT);
  assert.equal(resolved.artifactVersion, 5);

  const began = (await t.mutation(async (ctx) =>
    call(beginFinalSemanticAssessment, ctx, { objectiveKey: KEY, at: now }),
  )) as { proceed: boolean; requestId?: string; reason?: string };
  assert.equal(began.proceed, true, began.reason);
  const after = await readObj(t);
  const pending = after.management.pendingFinalAssessment as {
    deliverableRequirementKey?: string;
    targetArtifactKey?: string;
    targetArtifactVersion?: number;
  };
  assert.equal(pending.deliverableRequirementKey, REQ_PLAN);
  assert.equal(pending.targetArtifactKey, ARTIFACT);
  assert.equal(pending.targetArtifactVersion, 5);
});

test("negative final assessment reopens only the terminal deliverable and preserves prerequisite proof", async () => {
  const t = convexTest(schema, modules);
  await seedSatisfiedMultiDeliverable(t, 5);

  const began = (await t.mutation(async (ctx) =>
    call(beginFinalSemanticAssessment, ctx, { objectiveKey: KEY, at: now }),
  )) as { proceed: boolean; requestId?: string; reason?: string };
  assert.equal(began.proceed, true, began.reason);

  const applied = (await t.mutation(async (ctx) =>
    call(applyFinalSemanticAssessment, ctx, {
      objectiveKey: KEY,
      requestId: began.requestId!,
      meetsMinimumBar: false,
      rationale: "Final plan lacks CTA clarity and does not use acquisition evidence",
      artifactKey: ARTIFACT,
      artifactVersion: 5,
      evidenceRefs: ["sim_bench"],
      assumptionsUnknowns: ["channel mix"],
      recommendedNextAction: "revise",
      contractRevision: 1,
      at: now + 1,
    }),
  )) as { ok: boolean; reason?: string };
  assert.equal(applied.ok, true, applied.reason);

  await t.mutation(async (ctx) =>
    call(runManagementPass, ctx, {
      objectiveKey: KEY,
      reason: "final_semantic_assessment",
    }),
  );

  const reqs = await readReqs(t);
  const byKey = new Map(reqs.map((r) => [r.requirementKey, r]));
  assert.equal(byKey.get(REQ_PLAN)!.state, "active");
  assert.equal(byKey.get(REQ_PLAN)!.strategy, null);
  assert.equal(byKey.get(REQ_PLAN)!.resolution, null);
  assert.equal(byKey.get(REQ_LAUNCH)!.state, "satisfied");
  assert.equal(byKey.get(REQ_BENCH)!.state, "satisfied");
  assert.equal(byKey.get(REQ_INPUT)!.state, "satisfied");

  const assignments = await readAssignments(t);
  const asg = (id: string) => assignments.find((a) => a.assignmentId === id)!;
  assert.equal(asg("asg_plan").state, "superseded");
  assert.equal(asg("asg_launch").state, "verified");
  assert.equal(asg("asg_bench").state, "verified");
  assert.equal(asg("asg_input").state, "verified");

  const obj = await readObj(t);
  assert.equal(obj.finalSemanticAssessment, null);
  assert.equal(obj.management.finalAssessmentAttempts, 1);
  const fps = obj.management.decisionInputFingerprints as Record<string, string>;
  assert.equal(fps[REQ_PLAN], undefined);
  assert.equal(fps[REQ_LAUNCH], "fp_launch");
  assert.equal(fps[REQ_BENCH], "fp_bench");
  assert.equal(fps[REQ_INPUT], "fp_input");
  assert.equal((obj.acquisitionResults ?? []).length, 1);
  assert.equal((obj.acquisitionResults ?? [])[0]!.resultEvidenceId, "sim_bench");
  assert.equal((obj.acquisitionResults ?? [])[0]!.intentId, "int_buy_bench");
});

test("same contract revision + newer artifact version is assessed; stale v5 does not suppress v6", async () => {
  const t = convexTest(schema, modules);
  // Seed at v5 with a positive assessment for that exact version, then bump the
  // governed artifact to v6 — the classic stale-content race.
  await seedSatisfiedMultiDeliverable(t, 5);

  await t.mutation(async (ctx) => {
    const row = await ctx.db
      .query("objectives")
      .withIndex("by_key", (q) => q.eq("key", KEY))
      .unique();
    const data = (row as { data: Record<string, unknown> }).data;
    const mgmt = (data.management ?? {}) as Record<string, unknown>;
    await ctx.db.patch(row!._id, {
      data: {
        ...data,
        companyArtifacts: [
          {
            key: ARTIFACT,
            version: 5,
            content: "FINAL_DRAFT_V5 — accepted then superseded by edit",
            history: [],
          },
        ],
        finalSemanticAssessment: {
          meetsMinimumBar: true,
          rationale: "v5 met the bar",
          artifactKey: ARTIFACT,
          artifactVersion: 5,
          evidenceRefs: ["sim_bench"],
          assumptionsUnknowns: [],
          recommendedNextAction: "complete",
          assessedAt: now - 1_000,
          contractRevision: 1,
        },
        management: {
          ...mgmt,
          finalAssessmentAttempts: 1,
          pendingFinalAssessment: null,
        },
      },
    } as never);
  });

  // Worker produces v6 after the prior assessment.
  await t.mutation(async (ctx) => {
    const row = await ctx.db
      .query("objectives")
      .withIndex("by_key", (q) => q.eq("key", KEY))
      .unique();
    const data = (row as { data: Record<string, unknown> }).data;
    await ctx.db.patch(row!._id, {
      data: {
        ...data,
        companyArtifacts: [
          {
            key: ARTIFACT,
            version: 6,
            content: "FINAL_DRAFT_V6 — revised after prior assessment",
            history: [{ version: 5, content: "FINAL_DRAFT_V5 — accepted then superseded by edit" }],
          },
        ],
      },
    } as never);
  });

  const before = await readObj(t);
  assert.equal(before.companyArtifacts?.[0]?.version, 6);
  assert.equal(before.finalSemanticAssessment?.artifactVersion, 5);

  let assessedVersion: number | null = null;
  installStructuredChatDouble((req) => {
    if (req.kind !== "final_assessment") throw new Error(`unexpected ${req.kind}`);
    const parsed = JSON.parse(req.user) as { artifact?: { version?: number; content?: string } };
    assessedVersion = parsed.artifact?.version ?? null;
    assert.equal(assessedVersion, 6);
    assert.match(String(parsed.artifact?.content ?? ""), /FINAL_DRAFT_V6/);
    return {
      meetsMinimumBar: true,
      rationale: "v6 addresses the prior critique with acquisition evidence",
      artifactKey: ARTIFACT,
      artifactVersion: 6,
      evidenceRefs: [],
      assumptionsUnknowns: [],
      recommendedNextAction: "complete",
    };
  });

  const began = (await t.mutation(async (ctx) =>
    call(beginFinalSemanticAssessment, ctx, { objectiveKey: KEY, at: now + 10 }),
  )) as { proceed: boolean; requestId?: string; reason?: string };
  assert.equal(began.proceed, true, began.reason);
  const pending = (await readObj(t)).management.pendingFinalAssessment as {
    targetArtifactVersion?: number;
  };
  assert.equal(pending.targetArtifactVersion, 6);

  await t.action(async (ctx) =>
    call(proposeFinalSemanticAssessment, ctx, {
      objectiveKey: KEY,
      requestId: began.requestId!,
      contractRevision: 1,
    }),
  );
  installStructuredChatDouble(null);

  assert.equal(assessedVersion, 6, "propose must assess the reserved newer version");
  const obj = await readObj(t);
  assert.equal(obj.finalSemanticAssessment?.artifactVersion, 6);
  assert.equal(obj.finalSemanticAssessment?.meetsMinimumBar, true);
  assert.equal(obj.management.finalAssessmentAttempts, 2);
});

test("interpretation still binds purpose policy to the unique terminal deliverable", async () => {
  const t = convexTest(schema, modules);
  const key = "obj_fdl_interpret";
  await t.run(async (ctx) => {
    await ctx.db.insert("objectives", {
      key,
      data: {
        key,
        request: "Ship a founder-ready launch plan",
        createdAt: now,
        updatedAt: now,
        state: "received",
        activity: "new",
        plan: null,
        workItems: [],
        run: null,
        result: null,
        resourceNeeds: [],
        management: {
          contractId: null,
          authorizedPurposePolicy: SUBMISSION_EXTERNAL_SOCIAL_PURPOSE_POLICY,
        },
      } as ObjectiveRecord & { management: Record<string, unknown> },
    });
  });

  const begin = (await t.mutation(async (ctx) =>
    call(beginInterpretation, ctx, { objectiveKey: key, at: now }),
  )) as { proceed: boolean; requestId?: string; reason?: string };
  assert.equal(begin.proceed, true, begin.reason);

  const applied = (await t.mutation(async (ctx) =>
    call(applyInterpretation, ctx, {
      objectiveKey: key,
      requestId: begin.requestId!,
      rawContract: {
        intent: "ship a founder-ready launch plan",
        levels: [
          {
            levelKey: "plan",
            order: 1,
            statement: "a founder-ready launch plan is saved",
            label: "Launch plan",
          },
        ],
        minimumCompletionBar: "plan",
        ambiguities: [],
      },
      rawRequirements: [
        {
          requirementKey: REQ_LAUNCH,
          priority: "required",
          title: "Launch context",
          mustBeTrue: "launch context captured",
          scope: "deliverable",
          expectedOutput: "brief",
          requirementKind: "deliverable",
          requiredResourceClasses: ["company_records", "public_web"],
          dependsOnRequirementKeys: [],
        },
        {
          requirementKey: REQ_BENCH,
          priority: "required",
          title: "Comparative benchmark",
          mustBeTrue: "comparative benchmark on record",
          scope: "deliverable",
          expectedOutput: "benchmark",
          requirementKind: "deliverable",
          requiredResourceClasses: ["proprietary_data"],
          dependsOnRequirementKeys: [],
        },
        {
          requirementKey: REQ_PLAN,
          priority: "required",
          title: "Founder-ready launch plan",
          mustBeTrue: "founder-ready plan saved",
          scope: "deliverable",
          expectedOutput: "plan",
          requirementKind: "deliverable",
          requiredResourceClasses: ["company_records", "public_web"],
          dependsOnRequirementKeys: [REQ_LAUNCH, REQ_BENCH],
        },
      ],
      founderResolvedQuestions: [],
      at: now,
    }),
  )) as { ok: boolean; errors?: string[] };
  assert.equal(applied.ok, true, applied.errors?.join("; "));

  const reqs = await t.query(async (ctx) => {
    const rows = await ctx.db
      .query("requirements")
      .withIndex("by_objectiveKey", (q) => q.eq("objectiveKey", key))
      .collect();
    return rows.map((r) => (r as { data: Requirement }).data);
  });
  const carriers = reqs.filter((r) => (r.authorizedPurposeKinds ?? []).length > 0);
  assert.deepEqual(
    carriers.map((r) => r.requirementKey),
    [REQ_PLAN],
  );
});
