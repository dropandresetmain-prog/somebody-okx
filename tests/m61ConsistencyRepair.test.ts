// M6.1 consistency repair — Requirement-scoped input truth, continuation, finalization.
//
// Proves the failed physical shape locally:
//   historical INPUT_BLOCKED + fulfilled need + verified acquisition
//   → new worker is not falsely stopped
//   → acquired content is usable
//   → substantive artifact revision
//   → finishRun succeeds with management bookkeeping preserved
//
// Plus negatives: genuine gap, wrong/unverified acquisition, unread≠scarce,
// already-covered obligation.

import test, { mock, after as afterAll } from "node:test";
import assert from "node:assert/strict";
import { convexTest } from "convex-test";
import schema from "../convex/schema";
import {
  finishRun,
  readWorkerObservation,
  updateCompanyArtifact,
} from "../convex/objectives";
import { putIntent } from "../convex/internal/workforce";
import {
  checkInputAvailability,
  scopedCoveredResourceClasses,
} from "../lib/objective/inputAvailability";
import {
  currentUnresolvedValidatedGap,
  listInputObligations,
  obligationAlreadyCovered,
  validateMissingInputProposal,
} from "../lib/objective/inputDiagnosis";
import { createResourceNeed } from "../lib/objective/resourceNeed";
import { CURRENT_RESOURCE_INVENTORY } from "../lib/objective/policy";
import { createWorkContract, createWorkerSpec } from "../lib/workforce";
import type { ObjectiveRecord } from "../lib/objective/types";
import type { ExternalAcquisitionResult } from "../lib/objective/types";
import type { ResourceNeed } from "../lib/objective/resourceNeed";
import type { Model } from "@openai/agents";
import { Usage } from "@openai/agents";
import { runWorker } from "../lib/worker/runtime";
import type { WorkerCommand, WorkerPort } from "../lib/worker/port";

mock.timers.enable({ apis: ["setTimeout"] });
afterAll(() => mock.timers.reset());

const now = 1_974_100_000_000;
const FINDING =
  "AI manager is often read as another dashboard unless copy makes clear work is carried through";
const ACQ_EVIDENCE_ID = "sim_result_consistency_repair";

const modules = {
  "../convex/schema.ts": () => import("../convex/schema"),
  "../convex/objectiveValidators.ts": () => import("../convex/objectiveValidators"),
  "../convex/managementValidators.ts": () => import("../convex/managementValidators"),
  "../convex/workforceGuards.ts": () => import("../convex/workforceGuards"),
  "../convex/objectives.ts": () => import("../convex/objectives"),
  "../convex/internal/workforce.ts": () => import("../convex/internal/workforce"),
  "../convex/_generated/api.d.ts": () => import("../convex/_generated/api"),
  "../convex/_generated/server.d.ts": () => import("../convex/_generated/server"),
  "../convex/_generated/dataModel.d.ts": () => import("../convex/_generated/dataModel"),
};

type Handler = { _handler: (c: unknown, a: Record<string, unknown>) => Promise<unknown> };
const call = (fn: unknown, ctx: unknown, args: Record<string, unknown>) =>
  (fn as Handler)._handler(ctx, args);

function growthContract() {
  return createWorkContract({
    assignment: "Rewrite launch/page-message using verified acquired messaging evidence",
    idempotencyScope: "test:consistency",
    worker: createWorkerSpec([
      "company_records_lookup",
      "document_drafting",
      "growth_launch_operations",
    ]),
    sourceProofs: [{ sourceClass: "company_record", minDistinctSources: 1 }],
    resultRequirements: {
      summary: true,
      fit: true,
      risks: false,
      unknowns: false,
      recommendedNextAction: false,
    },
  });
}

function acquisition(over: Partial<ExternalAcquisitionResult> = {}): ExternalAcquisitionResult {
  return {
    intentId: "int_covered",
    requirementKey: "req_01",
    contractRevision: 1,
    resultEvidenceId: ACQ_EVIDENCE_ID,
    provenance: "simulation",
    providerId: "2135",
    serviceId: "newsliquid_twitter_search",
    offeringId: "2135:newsliquid_twitter_search",
    resourceClass: "proprietary_data",
    content: `SIMULATED proprietary social evidence.\nObserved finding: ${FINDING}\nUse this exact finding in the artifact.`,
    responseHash: "hash_consistency",
    recordedAt: now - 5_000,
    verifiedAt: now - 5_000,
    ...over,
  };
}

function fulfilledNeed(over: Partial<ResourceNeed> = {}): ResourceNeed {
  return createResourceNeed({
    id: "need_prior",
    objectiveKey: "obj_consistency",
    workItemId: "wi:asg_prior",
    requirementKey: "req_01",
    resourceClass: "proprietary_data",
    purpose: "Obtain current-launch evidence",
    reasonOwnedInsufficient: "owned catalog insufficient after inspection",
    proposedByRunId: "run_prior_blocked",
    at: now - 20_000,
    status: "fulfilled",
    contractRevision: 1,
    inputCheckId: "evidence_sufficiency",
    supportingEvidenceIds: ["ev_prior_na"],
    validationAuthority: "application",
    ...over,
  });
}

function seedRunningObjective(
  key: string,
  over: Partial<ObjectiveRecord> & {
    acquisitionResults?: ExternalAcquisitionResult[];
    resourceNeeds?: ResourceNeed[];
  } = {},
): ObjectiveRecord {
  const contract = growthContract();
  const runId = "run_resumed";
  return {
    key,
    request: "fix messaging with acquired evidence",
    createdAt: now - 30_000,
    updatedAt: now,
    state: "executing",
    activity: "Resumed after verified acquisition",
    plan: null,
    workItems: [
      {
        id: "wi:asg_resumed",
        objectiveKey: key,
        title: "Rewrite launch message",
        assignment: contract.assignment,
        workerKey: contract.workerKey,
        state: "running",
        contract,
        runs: [
          {
            id: runId,
            workItemId: "wi:asg_resumed",
            status: "running",
            startedAt: now,
            leaseUntil: now + 300_000,
            model: "test-model",
            modelSelectionReason: "injected",
            toolCalls: 0,
            summary: "",
          },
        ],
      },
    ],
    run: {
      id: runId,
      workItemId: "wi:asg_resumed",
      status: "running",
      startedAt: now,
      leaseUntil: now + 300_000,
      model: "test-model",
      modelSelectionReason: "injected",
      toolCalls: 0,
      summary: "",
    },
    result: {
      summary: "Applied acquired messaging finding to launch copy",
      fit: "Aligned with founder outcome language",
      risks: [],
      unknowns: [],
      recommendedNextAction: "Review revised launch message",
      completedAt: now,
      runId: "run_resumed",
    },
    companyArtifacts: [
      {
        key: "launch/page-message",
        version: 1,
        content: "Generic automate your workflows language.",
        history: [],
      },
    ],
    resourceNeeds: over.resourceNeeds ?? [fulfilledNeed({ objectiveKey: key })],
    acquisitionResults: over.acquisitionResults ?? [acquisition()],
    lastDeliveryFailureClass: "INPUT_BLOCKED",
    management: {
      contractId: "contract_consistency",
      currentContractRevision: 1,
      interpretationStatus: "done",
      decisionAttempts: { req_01: 3 },
      decisionInputFingerprints: { req_01: "fp_prior_blocked" },
      pendingDecision: null,
      controlNotes: [{ type: "control_state", state: "executing", summary: "prior", at: now - 1_000 }],
    },
    ...over,
  } as ObjectiveRecord;
}

// ── Unit: unread ≠ scarcity ──────────────────────────────────────────────────

test("unit: unread owned catalog is UNREAD and does not authorize scarcity", () => {
  const obligations = listInputObligations({
    requiredResourceClasses: ["proprietary_data"],
    sourceProofs: [{ sourceClass: "company_record", minDistinctSources: 1 }],
    mustBeTrue: "evidence ready",
    expectedOutput: "accepted evidence",
  });
  const unread = checkInputAvailability({
    inputCheckId: "evidence_sufficiency",
    obligations,
    sourceProofs: [{ sourceClass: "company_record", minDistinctSources: 1 }],
    controlledResourceClasses: [...CURRENT_RESOURCE_INVENTORY],
    evidence: [],
    runId: "run_new",
  });
  assert.equal(unread.status, "UNREAD");
});

test("unit: verified scoped acquisition covers req_class obligation", () => {
  const obligations = listInputObligations({
    requiredResourceClasses: ["proprietary_data"],
    sourceProofs: [{ sourceClass: "company_record", minDistinctSources: 1 }],
    mustBeTrue: "evidence ready",
    expectedOutput: "accepted evidence",
  });
  const covered = checkInputAvailability({
    inputCheckId: "req_class:proprietary_data",
    obligations,
    sourceProofs: [{ sourceClass: "company_record", minDistinctSources: 1 }],
    controlledResourceClasses: [...CURRENT_RESOURCE_INVENTORY],
    evidence: [],
    runId: "run_new",
    requirementKey: "req_01",
    contractRevision: 1,
    acquisitions: [
      {
        requirementKey: "req_01",
        contractRevision: 1,
        resourceClass: "proprietary_data",
        verifiedAt: now,
      },
    ],
  });
  assert.equal(covered.status, "AVAILABLE");

  const wrongReq = checkInputAvailability({
    inputCheckId: "req_class:proprietary_data",
    obligations,
    sourceProofs: [{ sourceClass: "company_record", minDistinctSources: 1 }],
    controlledResourceClasses: [...CURRENT_RESOURCE_INVENTORY],
    evidence: [],
    runId: "run_new",
    requirementKey: "req_01",
    contractRevision: 1,
    acquisitions: [
      {
        requirementKey: "req_other",
        contractRevision: 1,
        resourceClass: "proprietary_data",
        verifiedAt: now,
      },
    ],
  });
  assert.equal(wrongReq.status, "NOT_AVAILABLE");

  const unverified = checkInputAvailability({
    inputCheckId: "req_class:proprietary_data",
    obligations,
    sourceProofs: [{ sourceClass: "company_record", minDistinctSources: 1 }],
    controlledResourceClasses: [...CURRENT_RESOURCE_INVENTORY],
    evidence: [],
    runId: "run_new",
    requirementKey: "req_01",
    contractRevision: 1,
    acquisitions: [
      {
        requirementKey: "req_01",
        contractRevision: 1,
        resourceClass: "proprietary_data",
        verifiedAt: null,
      },
    ],
  });
  assert.equal(unverified.status, "NOT_AVAILABLE");
});

test("unit: already-covered obligation refuses reacquisition", () => {
  const need = fulfilledNeed();
  const acq = acquisition();
  assert.equal(
    obligationAlreadyCovered({
      requirementKey: "req_01",
      contractRevision: 1,
      resourceClass: "proprietary_data",
      existingNeeds: [need],
      acquisitions: [
        {
          requirementKey: acq.requirementKey,
          contractRevision: acq.contractRevision,
          resourceClass: acq.resourceClass ?? "proprietary_data",
          verifiedAt: acq.verifiedAt,
        },
      ],
    }),
    true,
  );

  const refused = validateMissingInputProposal(
    {
      inputCheckId: "req_class:proprietary_data",
      resourceClass: "proprietary_data",
      purpose: "different wording same obligation",
      reasonOwnedInsufficient: "staffing changed",
      supportingEvidenceIds: ["ev_na"],
    },
    {
      objectiveKey: "obj_consistency",
      requirementKey: "req_01",
      contractRevision: 1,
      runId: "run_resumed",
      workItemId: "wi:asg_resumed",
      requiredResourceClasses: ["proprietary_data"],
      mustBeTrue: "evidence ready",
      expectedOutput: "accepted evidence",
      sourceProofs: [{ sourceClass: "company_record", minDistinctSources: 1 }],
      requiredSourceClasses: ["company_record"],
      controlledResourceClasses: [...CURRENT_RESOURCE_INVENTORY],
      evidence: [
        {
          id: "ev_na",
          sourceClass: "company_record",
          label: "input_check:NOT_AVAILABLE",
          text: "availability: NOT_AVAILABLE. fake",
          origin: "application_observation",
          sourceId: "record:input_check/x",
          recordRef: "input_check/x",
          observedAt: now,
          recordedBy: "app",
          runId: "run_resumed",
        },
      ],
      existingNeeds: [need],
      acquisitions: [
        {
          requirementKey: acq.requirementKey,
          contractRevision: acq.contractRevision,
          resourceClass: acq.resourceClass ?? "proprietary_data",
          verifiedAt: acq.verifiedAt,
        },
      ],
      at: now,
      needId: "need_dup",
    },
  );
  assert.equal(refused.ok, false);
  if (!refused.ok) assert.equal(refused.refusalCode, "already_covered");
});

test("unit: currentUnresolvedValidatedGap ignores historical fulfilled needs", () => {
  const gap = currentUnresolvedValidatedGap(
    [fulfilledNeed()],
    [
      {
        requirementKey: "req_01",
        contractRevision: 1,
        resourceClass: "proprietary_data",
        verifiedAt: now,
      },
    ],
  );
  assert.equal(gap, null);

  const active = createResourceNeed({
    id: "need_active",
    objectiveKey: "obj_x",
    requirementKey: "req_01",
    resourceClass: "proprietary_data",
    purpose: "gap",
    reasonOwnedInsufficient: "missing",
    proposedByRunId: "run_x",
    at: now,
    status: "active",
    contractRevision: 1,
    validationAuthority: "application",
  });
  const unresolved = currentUnresolvedValidatedGap([active], []);
  assert.equal(unresolved?.id, "need_active");
});

test("unit: scopedCoveredResourceClasses stays scoped", () => {
  assert.deepEqual(
    scopedCoveredResourceClasses({
      requirementKey: "req_01",
      contractRevision: 1,
      acquisitions: [
        {
          requirementKey: "req_01",
          contractRevision: 1,
          resourceClass: "proprietary_data",
          verifiedAt: now,
        },
        {
          requirementKey: "req_02",
          contractRevision: 1,
          resourceClass: "proprietary_data",
          verifiedAt: now,
        },
        {
          requirementKey: "req_01",
          contractRevision: 1,
          resourceClass: "compute",
          verifiedAt: null,
        },
      ],
    }),
    ["proprietary_data"],
  );
});

// ── Integration: historical blocked → acquired → resume → artifact → finish ─

test("lifecycle: historical INPUT_BLOCKED + verified acquisition → substantive finish preserves management", async () => {
  const t = convexTest(schema, modules);
  const key = "obj_consistency";
  const runId = "run_resumed";
  const record = seedRunningObjective(key);
  const beforeContent = record.companyArtifacts![0]!.content;

  await t.run(async (ctx) => {
    await ctx.db.insert("objectives", { key, data: record });
    await ctx.db.insert("evidence", {
      objectiveKey: key,
      evidenceId: "ev_owned",
      data: {
        sourceClass: "company_record",
        label: "company/profile",
        text: "Company profile with usable launch context for the assignment.",
        recordRef: "company/profile",
        observedAt: now,
        recordedBy: "app",
        runId,
        origin: "application_observation",
        sourceId: "record:company/profile",
      },
    });
    await call(putIntent, ctx, {
      intentId: "int_covered",
      objectiveKey: key,
      idempotencyKey: "idem_covered",
      data: {
        intentId: "int_covered",
        idempotencyKey: "idem_covered",
        objectiveKey: key,
        requirementKey: "req_01",
        contractRevision: 1,
        decisionId: "dec_prior",
        kind: "external_acquisition",
        strategy: "HYBRID",
        target: {
          offeringId: "2135:newsliquid_twitter_search",
          providerId: "2135",
          serviceId: "newsliquid_twitter_search",
          resourceClass: "proprietary_data",
          endpointRef: null,
        },
        terms: {
          priceUsd: 0.5,
          priceProvenance: "provider_quote",
          requiresApproval: true,
          approvalId: "grant_x",
        },
        state: "verified",
        attempts: 1,
        lastEventId: "evt_v",
        resultEvidenceId: ACQ_EVIDENCE_ID,
        verificationEvidenceId: "sim_verification_consistency",
        boundaryNote: "verified simulation",
        createdAt: now - 5_000,
        updatedAt: now - 5_000,
      },
    });
  });

  // Observation must not yield from historical INPUT_BLOCKED.
  const observation = await t.run(async (ctx) =>
    call(readWorkerObservation, ctx, { objectiveKey: key, runId }),
  ) as {
    yieldReason: string | null;
    acquiredInputs: Array<{ resultEvidenceId: string; text: string }>;
    unmetCompletionRequirements: string[];
  };
  assert.equal(observation.yieldReason, null, "historical INPUT_BLOCKED must not set yieldReason");
  assert.ok(observation.acquiredInputs.length >= 1);
  assert.ok(observation.acquiredInputs.some((a) => a.resultEvidenceId === ACQ_EVIDENCE_ID));
  assert.ok(observation.acquiredInputs.some((a) => a.text.includes(FINDING)));
  // Artifact still unmet until this run mutates it.
  assert.ok(
    observation.unmetCompletionRequirements.some((u) => u.includes("company_artifact")),
  );

  // Injected worker applies acquired finding into the artifact, then finishes.
  const port: WorkerPort = {
    async read() {
      const obs = await t.run(async (ctx) =>
        call(readWorkerObservation, ctx, { objectiveKey: key, runId }),
      );
      return obs as Awaited<ReturnType<WorkerPort["read"]>>;
    },
    async act(command: WorkerCommand) {
      if (command.type === "update_company_artifact") {
        const content = String(command.content ?? "");
        assert.ok(content.includes(FINDING), "artifact must reflect acquired finding");
        const result = await t.run(async (ctx) =>
          call(updateCompanyArtifact, ctx, {
            objectiveKey: key,
            runId,
            content,
            changeNote: "Applied acquired messaging finding",
            usedAcquisitionEvidenceIds: [ACQ_EVIDENCE_ID],
          }),
        );
        return JSON.stringify(result);
      }
      if (command.type === "submit_result") return "result accepted";
      if (command.type === "request_completion") return "completion requested";
      return "ok";
    },
  };

  let step = 0;
  const model: Model = {
    async getResponse() {
      step += 1;
      if (step === 1) {
        return {
          usage: new Usage(),
          output: [
            {
              type: "function_call",
              callId: "c1",
              name: "update_company_artifact",
              arguments: JSON.stringify({
                content: `Lead with accountability. ${FINDING}. Then explain make-versus-buy.`,
                changeNote: "Applied acquired messaging finding",
                usedAcquisitionEvidenceIds: [ACQ_EVIDENCE_ID],
              }),
              status: "completed" as const,
            },
          ],
        };
      }
      return {
        usage: new Usage(),
        output: "done",
      };
    },
    async *getStreamedResponse() {
      throw new Error("unused");
    },
  };

  await runWorker(port, growthContract(), { model, maxTurns: 4 });

  const finished = await t.run(async (ctx) =>
    call(finishRun, ctx, { objectiveKey: key, runId, toolCalls: 1 }),
  ) as { completed: boolean; unmet: string[] };

  assert.equal(finished.completed, true, `expected complete, unmet=${finished.unmet.join("; ")}`);
  assert.equal(finished.unmet.length, 0);

  const updated = await t.run(async (ctx) => {
    const row = await ctx.db
      .query("objectives")
      .withIndex("by_key", (q) => q.eq("key", key))
      .unique();
    return (row as { data: ObjectiveRecord }).data;
  });

  const artifact = updated.companyArtifacts!.find((a) => a.key === "launch/page-message")!;
  assert.ok(artifact.version >= 2, `expected version>=2 got ${artifact.version}`);
  assert.notEqual(artifact.content, beforeContent);
  assert.ok(artifact.content.includes(FINDING));
  assert.equal(artifact.provenanceRunId, runId);

  const mgmt = (
    updated as unknown as {
      management: {
        decisionAttempts: Record<string, number>;
        decisionInputFingerprints: Record<string, string>;
        controlNotes: Array<{ type: string }>;
      };
    }
  ).management;
  assert.equal(mgmt.decisionAttempts.req_01, 3, "decisionAttempts must survive finalization");
  assert.equal(
    mgmt.decisionInputFingerprints.req_01,
    "fp_prior_blocked",
    "decisionInputFingerprints must survive finalization",
  );
  assert.ok(mgmt.controlNotes.some((n) => n.type === "completion_proposed"));
  assert.ok(mgmt.controlNotes.some((n) => n.type === "control_state"));
});

test("negative: genuine unresolved gap still yields INPUT_BLOCKED", async () => {
  const t = convexTest(schema, modules);
  const key = "obj_genuine_gap";
  const runId = "run_resumed";
  const activeNeed = createResourceNeed({
    id: "need_open",
    objectiveKey: key,
    workItemId: "wi:asg_resumed",
    requirementKey: "req_01",
    resourceClass: "proprietary_data",
    purpose: "still missing",
    reasonOwnedInsufficient: "inspected owned insufficient",
    proposedByRunId: runId,
    at: now,
    status: "active",
    contractRevision: 1,
    validationAuthority: "application",
  });
  const record = seedRunningObjective(key, {
    resourceNeeds: [activeNeed],
    acquisitionResults: [],
  });
  await t.run(async (ctx) => {
    await ctx.db.insert("objectives", { key, data: record });
  });

  const observation = await t.run(async (ctx) =>
    call(readWorkerObservation, ctx, { objectiveKey: key, runId }),
  ) as { yieldReason: string | null };
  assert.ok(observation.yieldReason?.includes("INPUT_BLOCKED"));

  const finished = await t.run(async (ctx) =>
    call(finishRun, ctx, { objectiveKey: key, runId }),
  ) as { completed: boolean; unmet: string[] };
  assert.equal(finished.completed, false);
  assert.ok(finished.unmet.some((u) => u.includes("INPUT_BLOCKED")));
});

test("negative: wrong-scope acquisition does not unlock finish", async () => {
  const t = convexTest(schema, modules);
  const key = "obj_wrong_scope";
  const runId = "run_resumed";
  const activeNeed = createResourceNeed({
    id: "need_open",
    objectiveKey: key,
    requirementKey: "req_01",
    resourceClass: "proprietary_data",
    purpose: "still missing",
    reasonOwnedInsufficient: "missing",
    proposedByRunId: runId,
    at: now,
    status: "active",
    contractRevision: 1,
    validationAuthority: "application",
  });
  const record = seedRunningObjective(key, {
    resourceNeeds: [activeNeed],
    acquisitionResults: [
      acquisition({ requirementKey: "req_other", resultEvidenceId: "sim_wrong" }),
    ],
  });
  await t.run(async (ctx) => {
    await ctx.db.insert("objectives", { key, data: record });
  });
  const observation = await t.run(async (ctx) =>
    call(readWorkerObservation, ctx, { objectiveKey: key, runId }),
  ) as { yieldReason: string | null };
  assert.ok(observation.yieldReason?.includes("INPUT_BLOCKED"));
});

test("finishRun preserves management bookkeeping on successful completion", async () => {
  const t = convexTest(schema, modules);
  const key = "obj_mgmt_preserve";
  const runId = "run_resumed";
  const record = seedRunningObjective(key, {
    lastDeliveryFailureClass: null,
    resourceNeeds: [fulfilledNeed({ objectiveKey: key })],
  });
  // Seed evidence + artifact change for this run so completion can succeed.
  await t.run(async (ctx) => {
    await ctx.db.insert("objectives", { key, data: record });
    await ctx.db.insert("evidence", {
      objectiveKey: key,
      evidenceId: "ev_owned",
      data: {
        sourceClass: "company_record",
        label: "company/profile",
        text: "Company profile with usable launch context for the assignment.",
        recordRef: "company/profile",
        observedAt: now,
        recordedBy: "app",
        runId,
        origin: "application_observation",
        sourceId: "record:company/profile",
      },
    });
    await call(putIntent, ctx, {
      intentId: "int_covered_mgmt",
      objectiveKey: key,
      idempotencyKey: "idem_covered_mgmt",
      data: {
        intentId: "int_covered_mgmt",
        idempotencyKey: "idem_covered_mgmt",
        objectiveKey: key,
        requirementKey: "req_01",
        contractRevision: 1,
        decisionId: "dec_prior",
        kind: "external_acquisition",
        strategy: "HYBRID",
        target: {
          offeringId: "2135:newsliquid_twitter_search",
          providerId: "2135",
          serviceId: "newsliquid_twitter_search",
          resourceClass: "proprietary_data",
          endpointRef: null,
        },
        terms: {
          priceUsd: 0.5,
          priceProvenance: "provider_quote",
          requiresApproval: true,
          approvalId: "grant_x",
        },
        state: "verified",
        attempts: 1,
        lastEventId: "evt_v",
        resultEvidenceId: ACQ_EVIDENCE_ID,
        verificationEvidenceId: "sim_verification_mgmt",
        boundaryNote: "verified simulation",
        createdAt: now - 5_000,
        updatedAt: now - 5_000,
      },
    });
    // Point acquisition at this intent id for the management-preservation fixture.
    const row = await ctx.db
      .query("objectives")
      .withIndex("by_key", (q) => q.eq("key", key))
      .unique();
    const data = (row as { data: ObjectiveRecord }).data;
    await ctx.db.patch(row!._id, {
      data: {
        ...data,
        acquisitionResults: [
          acquisition({ intentId: "int_covered_mgmt" }),
        ],
      },
    });
    await call(updateCompanyArtifact, ctx, {
      objectiveKey: key,
      runId,
      content: `Revised copy. ${FINDING}`,
      changeNote: "Apply finding",
      usedAcquisitionEvidenceIds: [ACQ_EVIDENCE_ID],
    });
  });

  const finished = await t.run(async (ctx) =>
    call(finishRun, ctx, { objectiveKey: key, runId }),
  ) as { completed: boolean; unmet: string[] };
  assert.equal(finished.completed, true, finished.unmet.join("; "));

  const updated = await t.run(async (ctx) => {
    const row = await ctx.db
      .query("objectives")
      .withIndex("by_key", (q) => q.eq("key", key))
      .unique();
    return (row as { data: ObjectiveRecord & { management: Record<string, unknown> } }).data;
  });
  const mgmt = updated.management as {
    decisionAttempts: Record<string, number>;
    decisionInputFingerprints: Record<string, string>;
  };
  assert.equal(mgmt.decisionAttempts.req_01, 3);
  assert.equal(mgmt.decisionInputFingerprints.req_01, "fp_prior_blocked");
});
