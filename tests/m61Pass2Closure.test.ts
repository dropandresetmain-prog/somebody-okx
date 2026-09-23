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
import {
  finishRun,
  readWorkerObservation,
  recordFinding,
  reportMissingInput,
  submitResult,
  updateCompanyArtifact,
} from "../convex/objectives";
import { readDecisionContext } from "../convex/internal/workforce";
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

async function seedRunningSerial(
  t: Backend,
  key: string,
  runId: string,
  opts: { workItemId?: string } = {},
) {
  const workItemId = opts.workItemId ?? "wi_1";
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
            id: workItemId,
            objectiveKey: key,
            title: "relaunch",
            assignment: workContract.assignment,
            workerKey: workContract.workerKey,
            state: "running",
            contract: workContract,
            runs: [
              {
                id: runId,
                workItemId,
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
          workItemId,
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
  return { artifactKey, workContract };
}

type Payload = {
  summary: string;
  fit: string;
  risks: string[];
  unknowns: string[];
  recommendedNextAction: string;
  terminal: "DELIVERED" | "NEEDS_INPUT" | "EXECUTION_ERROR";
};
const deliveredPayload: Payload = {
  summary: "delivered draft",
  fit: "meets bar",
  risks: [],
  unknowns: [],
  recommendedNextAction: "complete",
  terminal: "DELIVERED",
};

type Outcome = {
  status: string;
  detail: string;
  terminalAccepted: boolean;
  unmetObligations?: string[];
};
async function submit(t: Backend, key: string, runId: string, result: Payload) {
  return (await t.mutation(async (ctx) =>
    (submitResult as unknown as Handler)._handler(ctx, {
      objectiveKey: key,
      runId,
      result,
    }),
  )) as Outcome;
}
async function readObjective(t: Backend, key: string) {
  return t.query(async (ctx) => {
    const row = await ctx.db
      .query("objectives")
      .withIndex("by_key", (q) => q.eq("key", key))
      .unique();
    return (row as { data: ObjectiveRecord }).data;
  });
}

// Seed an M4-managed requirement/contract/assignment so the run's proof kinds
// include company_artifact_version (deterministic artifact obligation).
async function seedArtifactObligation(
  t: Backend,
  key: string,
  artifactKey: string,
  workContract: never,
) {
  const { putContract, putRequirement } = await import("../convex/internal/workforce");
  const { buildOutcomeContract, buildRequirement } = await import("../lib/management/contract");
  const built = buildOutcomeContract({
    objectiveKey: key,
    contractId: `c_${key}`,
    revision: 1,
    parsed: {
      intent: "relaunch",
      levels: [
        { levelKey: "relaunch", order: 1, statement: "saved relaunch exists", label: "Relaunch" },
      ],
      minimumCompletionBar: "relaunch",
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
        requirementKey: "req_relaunch",
        priority: "required",
        title: "Relaunch",
        mustBeTrue: "saved relaunch recommendation exists",
        scope: "deliverable",
        dependsOnRequirementKeys: [],
        requiredResourceClasses: [],
        expectedOutput: "saved relaunch",
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
      contractId: `c_${key}`,
      revision: 1,
      data: contract,
    });
    await (putRequirement as unknown as Handler)._handler(ctx, {
      objectiveKey: key,
      requirementKey: "req_relaunch",
      data: { ...requirement, state: "active", strategy: null },
      currentContractRevision: 1,
    });
    await ctx.db.insert("assignments", {
      assignmentId: "asg_1",
      objectiveKey: key,
      data: {
        assignmentId: "asg_1",
        objectiveKey: key,
        requirementKey: "req_relaunch",
        contractRevision: 1,
        decisionId: "dec_1",
        workerKey: (workContract as { workerKey: string }).workerKey,
        kind: "internal_make",
        state: "running",
        attempt: 1,
        runId: null,
        workContract,
        resultSummary: null,
        idempotencyScope: `${key}:run`,
        createdAt: now,
        updatedAt: now,
      } as never,
    });
  });
}

type ManagerPackage = {
  latestAcceptedWorkerOutput: Record<string, unknown> | null;
  latestWorkerDiagnostic: Record<string, unknown> | null;
};
async function decisionPackage(t: Backend, key: string): Promise<ManagerPackage> {
  const reads = (await t.query(async (ctx) =>
    (readDecisionContext as unknown as Handler)._handler(ctx, {
      objectiveKey: key,
      requirementKey: "req_relaunch",
    }),
  )) as { managerResultPackage: ManagerPackage };
  return reads.managerResultPackage;
}

// Persist one real application observation for the run (proof the worker earned).
async function recordObservation(
  t: Backend,
  key: string,
  runId: string,
  ref = "customer_interviews",
) {
  return t.mutation(async (ctx) =>
    (recordFinding as unknown as Handler)._handler(ctx, {
      objectiveKey: key,
      runId,
      finding: {
        sourceClass: "company_record",
        label: `Company record ${ref}`,
        text: `Observed content of ${ref}: customers describe the relaunch value in detail.`,
        origin: "application_observation",
        sourceId: `record:${ref}`,
        recordRef: ref,
        observedAt: now,
      },
    }),
  ) as Promise<{ evidenceId: string }>;
}

test("terminal: production makeConvexPort returns typed idempotent_replay and refused (not accepted)", async () => {
  const t = convexTest(schema, modules);
  const key = "obj_port_term";
  const runId = "run_port_term";
  await seedRunningSerial(t, key, runId);
  await recordObservation(t, key, runId);

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

// ── Milestone 1 / F1: typed refusals through the production serial port ─────────

test("F1: production serial port surfaces a rejected request_resource as refused, never accepted", async () => {
  const t = convexTest(schema, modules);
  const key = "obj_f1_refuse";
  const runId = "run_f1_refuse";
  await seedRunningSerial(t, key, runId);

  const raw = await t.action(async (ctx) =>
    makeConvexPort(ctx, key, runId, true).act({
      type: "request_resource",
      resourceClass: "magic_crystal_data",
      unansweredQuestion: "who are the buyers?",
      whyInsufficient: "owned inputs do not say",
      observedEvidenceIds: [],
    }),
  );
  const parsed = JSON.parse(String(raw)) as { status: string; detail?: string };
  assert.equal(parsed.status, "refused", `got ${raw}`);
  assert.match(String(parsed.detail), /refused/i);
  const record = await readObjective(t, key);
  assert.equal(
    (record.resourceNeeds ?? []).length,
    0,
    "wrapper must not create ResourceNeed/BUY authority",
  );
});

test("F1: two identical refused request_resource actions hit the duplicate no-progress stop", async () => {
  const { runWorker, emptyWorkerTelemetry } = await import("../lib/worker/runtime");
  const { Usage } = await import("@openai/agents");
  const t = convexTest(schema, modules);
  const key = "obj_f1_dup";
  const runId = "run_f1_dup";
  const { workContract } = await seedRunningSerial(t, key, runId);
  const call = (callId: string) => ({
    type: "function_call" as const,
    callId,
    name: "request_resource",
    arguments: JSON.stringify({
      resourceClass: "magic_crystal_data",
      unansweredQuestion: "who are the buyers?",
      observedEvidenceIds: [],
      whyInsufficient: "owned inputs do not say",
    }),
    status: "completed" as const,
  });
  let n = 0;
  const model = {
    async getResponse() {
      n += 1;
      return { usage: new Usage(), output: [call(`c${n}`)] };
    },
    async *getStreamedResponse() {
      throw new Error("unused");
    },
  };
  const telemetry = emptyWorkerTelemetry();
  await assert.rejects(
    t.action(async (ctx) =>
      runWorker(makeConvexPort(ctx, key, runId, true), workContract, {
        model: model as never,
        telemetry,
        serialManagerProtocol: true,
        maxTurns: 6,
      }),
    ),
    /no-progress/,
  );
  assert.equal(telemetry.failedActions, 2);
  assert.equal(telemetry.successfulActions, 0);
  assert.equal(n, 2, "stops at the existing duplicate bound, not the turn ceiling");
  const record = await readObjective(t, key);
  assert.equal((record.resourceNeeds ?? []).length, 0);
});

// ── Milestone 1 / F2: accepted output vs non-authoritative diagnostics ──────────

test("F2: refused/unconfirmed NEEDS_INPUT never populates latestAcceptedWorkerOutput; stays inspectable", async () => {
  const t = convexTest(schema, modules);
  const key = "obj_f2_diag";
  const runId = "run_f2_diag";
  const { artifactKey, workContract } = await seedRunningSerial(t, key, runId);
  await seedArtifactObligation(t, key, artifactKey, workContract as never);

  const refused = await submit(t, key, runId, {
    ...deliveredPayload,
    terminal: "NEEDS_INPUT",
    summary: "owned sources look thin",
  });
  assert.equal(refused.status, "refused");
  assert.equal(refused.terminalAccepted, false);

  const record = await readObjective(t, key);
  assert.equal(record.acceptedTerminal ?? null, null);
  assert.equal(record.result, null, "refused output must not become the stored result");

  const pkg = await decisionPackage(t, key);
  assert.equal(pkg.latestAcceptedWorkerOutput, null);
  assert.ok(pkg.latestWorkerDiagnostic, "diagnostic remains inspectable");
  assert.equal(pkg.latestWorkerDiagnostic!.authoritative, false);
  assert.equal(pkg.latestWorkerDiagnostic!.kind, "refused_terminal");
  assert.equal(pkg.latestWorkerDiagnostic!.terminal, "NEEDS_INPUT");
  assert.equal(pkg.latestWorkerDiagnostic!.runId, runId);
  assert.match(String(pkg.latestWorkerDiagnostic!.summary), /owned sources look thin/);
});

// ── Milestone 1 / F3: refuse premature DELIVERED before sealing the terminal ────

test("F3: premature DELIVERED is refused with exact obligations, the same run corrects and resubmits", async () => {
  const t = convexTest(schema, modules);
  const key = "obj_f3_premature";
  const runId = "run_f3_premature";
  const { artifactKey, workContract } = await seedRunningSerial(t, key, runId, {
    workItemId: "wi:asg_1",
  });
  await seedArtifactObligation(t, key, artifactKey, workContract as never);

  // Advice-only DELIVERED: no observation, no artifact mutation yet.
  const premature = await submit(t, key, runId, deliveredPayload);
  assert.equal(premature.status, "refused");
  assert.equal(premature.terminalAccepted, false);
  const unmet = (premature.unmetObligations ?? []).join(" | ");
  assert.match(unmet, /company_record: found 0 distinct source/);
  assert.match(unmet, /company_artifact: no version change by this run/);
  assert.ok((premature.unmetObligations ?? []).length <= 8);

  let record = await readObjective(t, key);
  assert.equal(record.acceptedTerminal ?? null, null, "terminal slot must stay open");
  assert.equal(record.result, null);
  assert.equal(record.run?.status, "running", "run is not marked delivered");
  const pkgRefused = await decisionPackage(t, key);
  assert.equal(pkgRefused.latestAcceptedWorkerOutput, null);
  assert.deepEqual(
    pkgRefused.latestWorkerDiagnostic!.unmetObligations,
    premature.unmetObligations,
  );

  // The unmet list is what the worker observes, so the model needs no prose parsing.
  const observed = (await t.query(async (ctx) =>
    (readWorkerObservation as unknown as Handler)._handler(ctx, {
      objectiveKey: key,
      runId,
    }),
  )) as { unmetCompletionRequirements: string[] };
  assert.ok(
    observed.unmetCompletionRequirements.some((u) => u.startsWith("company_artifact")),
  );

  // SAME authoritative run performs the missing legal actions...
  await recordObservation(t, key, runId);
  await t.mutation(async (ctx) =>
    (updateCompanyArtifact as unknown as Handler)._handler(ctx, {
      objectiveKey: key,
      runId,
      content: "relaunch v2",
      changeNote: "apply findings",
    }),
  );
  // ...and resubmits successfully without a new assignment/run.
  const accepted = await submit(t, key, runId, deliveredPayload);
  assert.equal(accepted.status, "accepted");
  assert.equal(accepted.terminalAccepted, true);
  record = await readObjective(t, key);
  assert.equal(record.acceptedTerminal?.runId, runId);
  assert.equal(record.acceptedTerminal?.terminal, "DELIVERED");
  assert.equal(record.workItems.length, 1);
  assert.equal(record.workItems[0].runs.length, 1);

  // F2 positive: accepted DELIVERED is projected once, with exact run identity.
  const pkg = await decisionPackage(t, key);
  assert.equal(pkg.latestWorkerDiagnostic, null);
  assert.equal(pkg.latestAcceptedWorkerOutput?.runId, runId);
  assert.equal(pkg.latestAcceptedWorkerOutput?.terminal, "DELIVERED");
  assert.equal(pkg.latestAcceptedWorkerOutput?.summary, "delivered draft");

  // Accepted DELIVERED does not complete the Objective: the independent gate does.
  await t.mutation(async (ctx) =>
    (finishRun as unknown as Handler)._handler(ctx, { objectiveKey: key, runId }),
  );
  const after = await readObjective(t, key);
  assert.notEqual(after.state, "completed", "Objective completion stays with the management gate");
});

test("F3: stale/superseded runs stay fenced for terminal writes", async () => {
  const t = convexTest(schema, modules);
  const key = "obj_f3_stale";
  const runId = "run_f3_stale";
  await seedRunningSerial(t, key, runId);
  await recordObservation(t, key, runId);

  const stale = await submit(t, key, "run_someone_else", deliveredPayload);
  assert.equal(stale.status, "stale");
  assert.equal(stale.terminalAccepted, false);
  assert.equal((await readObjective(t, key)).acceptedTerminal ?? null, null);

  // Once the live run has sealed its terminal, material writes are refused.
  const ok = await submit(t, key, runId, deliveredPayload);
  assert.equal(ok.status, "accepted");
  await assert.rejects(
    t.mutation(async (ctx) =>
      (updateCompanyArtifact as unknown as Handler)._handler(ctx, {
        objectiveKey: key,
        runId,
        content: "late write",
        changeNote: "late",
      }),
    ),
    /TERMINAL_CLOSED/,
  );
});
