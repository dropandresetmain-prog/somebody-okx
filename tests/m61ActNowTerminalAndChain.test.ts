// M6.1 act-now: terminal fencing + unbroken production-chain proof.
// Does NOT declare Gate 1 live PASS.
import test, { mock, after as afterAll } from "node:test";
import assert from "node:assert/strict";
import { convexTest } from "convex-test";
import schema from "../convex/schema";
import {
  applyInterpretation,
  applyDecision,
  runManagementPass,
} from "../convex/management";
import {
  initBudget,
  putIntent,
  putRequirement,
} from "../convex/internal/workforce";
import {
  readWorkerObservation,
  recordFinding,
  submitFinalSemanticAssessment,
  submitResult,
  updateCompanyArtifact,
} from "../convex/objectives";
import { buildRequirement } from "../lib/management/contract";
import { evaluateCompletionGate } from "../lib/management/completion";
import { NO_PROOF_FACTS } from "../lib/management/requirements";
import { M61_SERIAL_V1 } from "../lib/management/executionProtocol";
import { optionIdFor } from "../lib/management/options";
import { createWorkContract, createWorkerSpec } from "../lib/workforce";
import type {
  OutcomeContract,
  Requirement,
} from "../lib/management/types";
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

const now = 1_977_000_000_000;
type Handler = { _handler: (c: unknown, a: Record<string, unknown>) => Promise<unknown> };

async function seedRunningSerial(
  t: ReturnType<typeof convexTest>,
  key: string,
  runId: string,
  opts: {
    inputEvidenceIds?: string[];
    targetArtifactKey?: string | null;
    acquisition?: boolean;
  } = {},
) {
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
      { sourceClass: "public_web", minDistinctSources: 1 },
    ],
    inputEvidenceIds: opts.inputEvidenceIds ?? [],
    targetArtifactKey:
      opts.targetArtifactKey === undefined
        ? artifactKey
        : opts.targetArtifactKey,
  });
  await t.mutation(async (ctx) => {
    await ctx.db.insert("objectives", {
      key,
      data: {
        key,
        request: "Diagnose weak launch messaging and prepare a better relaunch",
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
          { key: artifactKey, version: 1, content: "seed headline", history: [] },
        ],
        acquisitionResults: opts.acquisition
          ? [
              {
                intentId: `int_${key}`,
                requirementKey: "req_relaunch",
                contractRevision: 1,
                resultEvidenceId: `sim_${key}`,
                provenance: "simulation",
                providerId: "2135",
                serviceId: "newsliquid_twitter_search",
                offeringId: "2135:newsliquid_twitter_search",
                resourceClass: "proprietary_data",
                content: "SIMULATED audience language finding",
                responseHash: "h",
                recordedAt: now,
                verifiedAt: now,
              },
            ]
          : [],
        management: {
          contractId: `contract_${key}`,
          executionProtocol: M61_SERIAL_V1,
          currentContractRevision: 1,
        },
      } as never,
    });
  });
  return { artifactKey, workContract };
}

test("terminal: NEEDS_INPUT without validated gap does not set INPUT_BLOCKED", async () => {
  const t = convexTest(schema, modules);
  const key = "obj_term_needs_refuse";
  const runId = "run_needs";
  await seedRunningSerial(t, key, runId);

  const out = (await t.mutation(async (ctx) =>
    (submitResult as unknown as Handler)._handler(ctx, {
      objectiveKey: key,
      runId,
      result: {
        summary: "need more evidence",
        fit: "incomplete",
        risks: [],
        unknowns: ["audience language"],
        recommendedNextAction: "acquire proprietary_data",
        terminal: "NEEDS_INPUT",
        validatedGapAccepted: false,
      },
    }),
  )) as { status: string; terminalAccepted: boolean };

  assert.equal(out.status, "refused");
  assert.equal(out.terminalAccepted, false);

  const data = await t.query(async (ctx) => {
    const row = await ctx.db
      .query("objectives")
      .withIndex("by_key", (q) => q.eq("key", key))
      .unique();
    return (row as { data: ObjectiveRecord }).data;
  });
  assert.notEqual(data.lastDeliveryFailureClass, "INPUT_BLOCKED");
  assert.equal(data.acceptedTerminal, null);
  assert.equal(data.lastUnconfirmedTerminal?.terminal, "NEEDS_INPUT");
});

test("terminal: refused NEEDS_INPUT then corrected valid NEEDS_INPUT same run accepted", async () => {
  const t = convexTest(schema, modules);
  const key = "obj_term_correct";
  const runId = "run_correct";
  await seedRunningSerial(t, key, runId, {
    acquisition: true,
  });

  // Seed application observation evidence the gap can cite.
  await t.mutation(async (ctx) => {
    await ctx.db.insert("evidence", {
      objectiveKey: key,
      evidenceId: "ev_obs_1",
      data: {
        sourceClass: "company_record",
        label: "Launch context",
        text: "owned launch context without audience language",
        recordRef: "launch/context",
        observedAt: now,
        recordedBy: "app",
        runId,
        origin: "application_observation",
        sourceId: "record:launch/context",
      },
    });
    await ctx.db.insert("evidence", {
      objectiveKey: key,
      evidenceId: "ev_obs_2",
      data: {
        sourceClass: "public_web",
        label: "Public page",
        text: "public page without proprietary audience language",
        url: "https://example.com/launch",
        observedAt: now,
        recordedBy: "app",
        runId,
        origin: "application_observation",
        sourceId: "url:https://example.com/launch",
      },
    });
  });

  const refused = (await t.mutation(async (ctx) =>
    (submitResult as unknown as Handler)._handler(ctx, {
      objectiveKey: key,
      runId,
      result: {
        summary: "need more",
        fit: "incomplete",
        risks: [],
        unknowns: ["audience"],
        recommendedNextAction: "acquire",
        terminal: "NEEDS_INPUT",
        validatedGapAccepted: false,
      },
    }),
  )) as { status: string; terminalAccepted: boolean };
  assert.equal(refused.status, "refused");
  assert.equal(refused.terminalAccepted, false);

  // Application-side: mark gap accepted for the corrected submission (production
  // runner sets this after reportMissingInput validates semanticGap).
  const accepted = (await t.mutation(async (ctx) =>
    (submitResult as unknown as Handler)._handler(ctx, {
      objectiveKey: key,
      runId,
      result: {
        summary: "need proprietary audience language",
        fit: "incomplete until acquisition",
        risks: [],
        unknowns: ["audience language"],
        recommendedNextAction: "BUY proprietary_data",
        terminal: "NEEDS_INPUT",
        validatedGapAccepted: true,
      },
    }),
  )) as { status: string; terminalAccepted: boolean };
  assert.equal(accepted.status, "accepted");
  assert.equal(accepted.terminalAccepted, true);

  const replay = (await t.mutation(async (ctx) =>
    (submitResult as unknown as Handler)._handler(ctx, {
      objectiveKey: key,
      runId,
      result: {
        summary: "need proprietary audience language",
        fit: "incomplete until acquisition",
        risks: [],
        unknowns: ["audience language"],
        recommendedNextAction: "BUY proprietary_data",
        terminal: "NEEDS_INPUT",
        validatedGapAccepted: true,
      },
    }),
  )) as { status: string; terminalAccepted: boolean };
  assert.equal(replay.status, "idempotent_replay");
  assert.equal(replay.terminalAccepted, true);

  const conflict = (await t.mutation(async (ctx) =>
    (submitResult as unknown as Handler)._handler(ctx, {
      objectiveKey: key,
      runId,
      result: {
        summary: "actually delivered",
        fit: "done",
        risks: [],
        unknowns: [],
        recommendedNextAction: "complete",
        terminal: "DELIVERED",
      },
    }),
  )) as { status: string };
  assert.equal(conflict.status, "refused");
});

test("terminal: first accepted wins; exact replay idempotent; conflict refused; post-terminal mutate refused", async () => {
  const t = convexTest(schema, modules);
  const key = "obj_term_idem";
  const runId = "run_idem";
  const { artifactKey } = await seedRunningSerial(t, key, runId);
  // DELIVERED is only sealed once this run's deterministic proof exists.
  await t.mutation(async (ctx) =>
    (recordFinding as unknown as Handler)._handler(ctx, {
      objectiveKey: key,
      runId,
      finding: {
        sourceClass: "company_record",
        label: "Company record customer_interviews",
        text: "Observed customer interview content for the relaunch.",
        origin: "application_observation",
        sourceId: "record:customer_interviews",
        recordRef: "customer_interviews",
        observedAt: now,
      },
    }),
  );
  await t.mutation(async (ctx) =>
    (recordFinding as unknown as Handler)._handler(ctx, {
      objectiveKey: key,
      runId,
      finding: {
        sourceClass: "public_web",
        label: "Public page: pricing",
        text: "Observed public page content about competitor pricing.",
        origin: "application_observation",
        sourceId: "url:https://example.com/pricing",
        url: "https://example.com/pricing",
        observedAt: now,
      },
    }),
  );

  const payload = {
    summary: "delivered draft",
    fit: "meets bar",
    risks: [],
    unknowns: [],
    recommendedNextAction: "founder review",
    terminal: "DELIVERED" as const,
  };

  const first = (await t.mutation(async (ctx) =>
    (submitResult as unknown as Handler)._handler(ctx, {
      objectiveKey: key,
      runId,
      result: payload,
    }),
  )) as { status: string; terminalAccepted: boolean };
  assert.equal(first.status, "accepted");
  assert.equal(first.terminalAccepted, true);

  const replay = (await t.mutation(async (ctx) =>
    (submitResult as unknown as Handler)._handler(ctx, {
      objectiveKey: key,
      runId,
      result: payload,
    }),
  )) as { status: string; terminalAccepted: boolean };
  assert.equal(replay.status, "idempotent_replay");
  assert.equal(replay.terminalAccepted, true);

  const conflict = (await t.mutation(async (ctx) =>
    (submitResult as unknown as Handler)._handler(ctx, {
      objectiveKey: key,
      runId,
      result: { ...payload, summary: "different summary", terminal: "DELIVERED" },
    }),
  )) as { status: string };
  assert.equal(conflict.status, "refused");

  await assert.rejects(
    () =>
      t.mutation(async (ctx) =>
        (updateCompanyArtifact as unknown as Handler)._handler(ctx, {
          objectiveKey: key,
          runId,
          content: "late mutation",
          changeNote: "should refuse",
        }),
      ),
    /TERMINAL_CLOSED/,
  );
  void artifactKey;
});

test("terminal: EXECUTION_ERROR persists EXECUTION_FAILED class", async () => {
  const t = convexTest(schema, modules);
  const key = "obj_term_exec";
  const runId = "run_exec";
  await seedRunningSerial(t, key, runId);
  const out = (await t.mutation(async (ctx) =>
    (submitResult as unknown as Handler)._handler(ctx, {
      objectiveKey: key,
      runId,
      result: {
        summary: "tooling failed",
        fit: "incomplete",
        risks: ["provider timeout"],
        unknowns: [],
        recommendedNextAction: "retry or redecide",
        terminal: "EXECUTION_ERROR",
      },
    }),
  )) as { status: string; terminalAccepted: boolean };
  assert.equal(out.status, "accepted");
  const data = await t.query(async (ctx) => {
    const row = await ctx.db
      .query("objectives")
      .withIndex("by_key", (q) => q.eq("key", key))
      .unique();
    return (row as { data: ObjectiveRecord }).data;
  });
  assert.equal(data.lastDeliveryFailureClass, "EXECUTION_FAILED");
  assert.equal(data.acceptedTerminal?.terminal, "EXECUTION_ERROR");
});

/**
 * Unbroken deterministic SEAM coverage through production builders/handlers.
 * Manually advances some mid-chain state for isolated seam checks.
 * NOT Gate-1 whole-loop proof — see m61ProductionWholeChain.test.ts for F.
 */
test("seam coverage (not Gate-1 F): interpret → MAKE proofs → BUY release → linked MAKE artifact → assessment → gate", async () => {
  const t = convexTest(schema, modules);
  const key = "obj_chain_full";
  const reqKey = "req_relaunch";
  const artifactKey = "launch/page-message";
  const linkedId = `sim_${key}`;

  await t.mutation(async (ctx) => {
    await ctx.db.insert("objectives", {
      key,
      data: {
        key,
        request:
          "Our launch messaging isn’t working. Figure out what’s wrong and get a better relaunch ready.",
        createdAt: now,
        updatedAt: now,
        state: "received",
        activity: "new",
        plan: null,
        workItems: [],
        run: null,
        result: null,
        companyArtifacts: [
          { key: artifactKey, version: 1, content: "seed", history: [] },
        ],
        management: { contractId: null, controlNotes: [] },
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
        note: "test",
      },
    });
  });

  const interpreted = (await t.mutation(async (ctx) =>
    (applyInterpretation as unknown as Handler)._handler(ctx, {
      objectiveKey: key,
      requestId: `interpret_${key}`,
      rawContract: {
        intent: "deliver a relaunch recommendation",
        levels: [
          {
            levelKey: "relaunch",
            order: 1,
            statement: "a saved relaunch recommendation is on record",
            label: "Relaunch",
          },
        ],
        minimumCompletionBar: "relaunch",
        ambiguities: [],
      },
      rawRequirements: [
        {
          requirementKey: reqKey,
          priority: "required",
          title: "Relaunch recommendation",
          mustBeTrue: "a versioned relaunch recommendation is saved with evidence",
          scope: "founder-facing deliverable",
          expectedOutput: "saved relaunch recommendation",
          requirementKind: "deliverable",
          requiredResourceClasses: ["proprietary_data"],
        },
      ],
      founderResolvedQuestions: [],
      at: now,
    }),
  )) as { ok: boolean };
  assert.equal(interpreted.ok, true);

  const contract = await t.query(async (ctx) => {
    const rows = await ctx.db
      .query("outcomeContracts")
      .withIndex("by_objective", (q) => q.eq("objectiveKey", key))
      .collect();
    return (rows[0] as { data: OutcomeContract }).data;
  });

  // Authorize BUY on deliverable (production buildRequirement) — proofs stay deliverable.
  const buyBound = buildRequirement(
    {
      objectiveKey: key,
      contract,
      proposed: {
        requirementKey: reqKey,
        priority: "required",
        title: "Relaunch recommendation",
        mustBeTrue: "a versioned relaunch recommendation is saved with evidence",
        scope: "founder-facing deliverable",
        dependsOnRequirementKeys: [],
        requiredResourceClasses: ["proprietary_data"],
        expectedOutput: "saved relaunch recommendation",
        requirementKind: "deliverable",
      },
      artifactKeyForInternalProof: artifactKey,
      at: now,
    },
    "BUY",
  );
  assert.ok("requirement" in buyBound);
  if (!("requirement" in buyBound)) return;

  await t.mutation(async (ctx) => {
    await (putRequirement as unknown as Handler)._handler(ctx, {
      objectiveKey: key,
      requirementKey: reqKey,
      data: { ...buyBound.requirement, strategy: "BUY" },
      currentContractRevision: 1,
    });
    await (putIntent as unknown as Handler)._handler(ctx, {
      intentId: `int_${key}`,
      objectiveKey: key,
      idempotencyKey: `idem_${key}`,
      data: {
        intentId: `int_${key}`,
        idempotencyKey: `idem_${key}`,
        objectiveKey: key,
        requirementKey: reqKey,
        contractRevision: 1,
        decisionId: `dec_buy_${key}`,
        kind: "external_acquisition",
        strategy: "BUY",
        target: {
          offeringId: "2135:newsliquid_twitter_search",
          providerId: "2135",
          serviceId: "newsliquid_twitter_search",
          resourceClass: "proprietary_data",
          endpointRef: null,
        },
        terms: {
          priceUsd: 2,
          priceProvenance: "provider_quote",
          requiresApproval: true,
          approvalId: `grant_${key}`,
        },
        state: "verified",
        attempts: 1,
        lastEventId: "evt",
        resultEvidenceId: linkedId,
        verificationEvidenceId: `ver_${key}`,
        boundaryNote: "sim",
        createdAt: now,
        updatedAt: now,
      },
    });
    const row = await ctx.db
      .query("objectives")
      .withIndex("by_key", (q) => q.eq("key", key))
      .unique();
    const data = (row as { data: ObjectiveRecord }).data;
    await ctx.db.patch(row!._id, {
      data: {
        ...data,
        acquisitionResults: [
          {
            intentId: `int_${key}`,
            requirementKey: reqKey,
            contractRevision: 1,
            resultEvidenceId: linkedId,
            provenance: "simulation",
            providerId: "2135",
            serviceId: "newsliquid_twitter_search",
            offeringId: "2135:newsliquid_twitter_search",
            resourceClass: "proprietary_data",
            content: "SIMULATED audience language finding",
            responseHash: "h",
            recordedAt: now,
            verifiedAt: now,
          },
        ],
      },
    });
  });

  await t.mutation(async (ctx) =>
    (runManagementPass as unknown as Handler)._handler(ctx, {
      objectiveKey: key,
      reason: "verification_result",
    }),
  );

  const afterBuy = await t.query(async (ctx) => {
    const row = await ctx.db
      .query("requirements")
      .withIndex("by_objectiveRequirement", (q) =>
        q.eq("objectiveKey", key).eq("requirementKey", reqKey),
      )
      .unique();
    return (row as { data: Requirement }).data;
  });
  assert.equal(afterBuy.strategy, null, "BUY released for reassessment");
  assert.equal(afterBuy.state, "active");

  // Subsequent MAKE explicitly linked to acquisition + exact artifact target.
  const makeBound = buildRequirement(
    {
      objectiveKey: key,
      contract,
      proposed: {
        requirementKey: reqKey,
        priority: "required",
        title: "Relaunch recommendation",
        mustBeTrue: "a versioned relaunch recommendation is saved with evidence",
        scope: "founder-facing deliverable",
        dependsOnRequirementKeys: [],
        requiredResourceClasses: ["proprietary_data"],
        expectedOutput: "saved relaunch recommendation",
        requirementKind: "deliverable",
      },
      artifactKeyForInternalProof: artifactKey,
      at: now + 1,
    },
    "MAKE",
  );
  assert.ok("requirement" in makeBound);
  if (!("requirement" in makeBound)) return;

  const runId = "run_make_linked";
  const workContract = createWorkContract({
    assignment: makeBound.requirement.mustBeTrue,
    idempotencyScope: `${key}:make`,
    worker: createWorkerSpec([
      "growth_launch_operations",
      "company_records_lookup",
      "public_information_research",
    ]),
    sourceProofs: [
      { sourceClass: "company_record", minDistinctSources: 1 },
      { sourceClass: "public_web", minDistinctSources: 1 },
    ],
    inputEvidenceIds: [linkedId],
    targetArtifactKey: artifactKey,
  });

  await t.mutation(async (ctx) => {
    await (putRequirement as unknown as Handler)._handler(ctx, {
      objectiveKey: key,
      requirementKey: reqKey,
      data: { ...makeBound.requirement, strategy: "MAKE" },
      currentContractRevision: 1,
    });
    const row = await ctx.db
      .query("objectives")
      .withIndex("by_key", (q) => q.eq("key", key))
      .unique();
    const data = (row as { data: ObjectiveRecord }).data;
    await ctx.db.patch(row!._id, {
      data: {
        ...data,
        state: "executing",
        workItems: [
          {
            id: "wi_make",
            objectiveKey: key,
            title: "make",
            assignment: workContract.assignment,
            workerKey: workContract.workerKey,
            state: "running",
            contract: workContract,
            runs: [
              {
                id: runId,
                workItemId: "wi_make",
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
          workItemId: "wi_make",
          status: "running",
          startedAt: now,
          leaseUntil: now + 120_000,
          model: "mock",
          modelSelectionReason: "test",
          toolCalls: 0,
          summary: "",
        },
      },
    });
    await ctx.db.insert("evidence", {
      objectiveKey: key,
      evidenceId: "ev_rec",
      data: {
        sourceClass: "company_record",
        label: "Launch context",
        text: "owned launch context",
        recordRef: "launch/context",
        observedAt: now,
        recordedBy: "app",
        runId,
        origin: "application_observation",
        sourceId: "record:launch/context",
      },
    });
    await ctx.db.insert("evidence", {
      objectiveKey: key,
      evidenceId: "ev_web",
      data: {
        sourceClass: "public_web",
        label: "Public page",
        text: "public messaging observations",
        url: "https://example.com/launch",
        observedAt: now,
        recordedBy: "app",
        runId,
        origin: "application_observation",
        sourceId: "url:https://example.com/launch",
      },
    });
  });

  const obs = (await t.query(async (ctx) =>
    (readWorkerObservation as unknown as Handler)._handler(ctx, {
      objectiveKey: key,
      runId,
    }),
  )) as {
    acquiredInputs: Array<{ resultEvidenceId: string }>;
    loadedInputPackage: { inputEvidenceIds: string[] };
  };
  assert.deepEqual(obs.acquiredInputs.map((a) => a.resultEvidenceId), [linkedId]);
  assert.deepEqual(obs.loadedInputPackage.inputEvidenceIds, [linkedId]);

  const art = (await t.mutation(async (ctx) =>
    (updateCompanyArtifact as unknown as Handler)._handler(ctx, {
      objectiveKey: key,
      runId,
      content:
        "Relaunch headline using SIMULATED audience language finding — finish the job, not another dashboard.",
      changeNote: "materially use linked acquisition",
      usedAcquisitionEvidenceIds: [linkedId],
    }),
  )) as { key: string; version: number };
  assert.equal(art.key, artifactKey);
  assert.equal(art.version, 2);

  await t.mutation(async (ctx) =>
    (submitResult as unknown as Handler)._handler(ctx, {
      objectiveKey: key,
      runId,
      result: {
        summary: "Relaunch recommendation saved with acquired audience language.",
        fit: "Meets the locked minimum bar.",
        risks: [],
        unknowns: ["live conversion not yet measured"],
        recommendedNextAction: "founder review before public post",
        terminal: "DELIVERED",
      },
    }),
  );

  const assess = (await t.mutation(async (ctx) =>
    (submitFinalSemanticAssessment as unknown as Handler)._handler(ctx, {
      objectiveKey: key,
      meetsMinimumBar: true,
      rationale: "Artifact v2 incorporates linked acquisition and owned evidence.",
      artifactKey,
      artifactVersion: 2,
      evidenceRefs: ["ev_rec", "ev_web", linkedId],
      assumptionsUnknowns: ["live conversion unknown"],
      recommendedNextAction: "complete",
      contractRevision: 1,
    }),
  )) as { status: string };
  assert.equal(assess.status, "accepted");

  // Bind proofs for gate (production binder would do this from facts).
  const reqForGate: Requirement = {
    ...makeBound.requirement,
    strategy: "MAKE",
    proofs: makeBound.requirement.proofs.map((p) =>
      p.proofKind === "application_observation"
        ? { ...p, params: { ...p.params, sourceId: "ev_rec" } }
        : p,
    ),
    state: "satisfied",
    resolution: {
      resolutionId: "res_1",
      acceptedDecisionId: null,
      acceptedAssignmentId: null,
      acceptedIntentId: null,
      proofRefs: ["ev_rec", "ev_web", linkedId, `${artifactKey}:v2`],
      contractRevision: 1,
      acceptedAt: now,
    },
  };

  const proposal = {
    proposalId: "prop_chain",
    objectiveKey: key,
    contractId: contract.contractId,
    contractRevision: 1,
    claimedLevelKey: "relaunch",
    rationale: "semantic assessment accepted; artifact v2 on record",
    proposedAt: now,
  };

  // Independent gate: forged / empty facts refused.
  const forged = evaluateCompletionGate({
    proposal,
    contract,
    currentContractRevision: 1,
    requirements: [
      {
        ...reqForGate,
        resolution: {
          ...reqForGate.resolution!,
          proofRefs: ["forged"],
        },
      },
    ],
    factsByRequirementKey: new Map([[reqKey, NO_PROOF_FACTS]]),
    unresolvedEffectIds: [],
    unresolvedResourceIds: [],
    at: now,
  });
  assert.equal(forged.accepted, false);

  const gateFacts = {
    artifactVersions: { [artifactKey]: 2 },
    applicationObservationIds: ["ev_rec"],
    verifiedIntentIds: [] as string[],
    founderConfirmationRefs: [] as string[],
  };
  const completed = evaluateCompletionGate({
    proposal,
    contract,
    currentContractRevision: 1,
    requirements: [reqForGate],
    factsByRequirementKey: new Map([[reqKey, gateFacts]]),
    unresolvedEffectIds: [],
    unresolvedResourceIds: [],
    at: now,
  });
  assert.equal(completed.accepted, true);
  if (completed.accepted) {
    assert.deepEqual(completed.satisfiedRequired, [reqKey]);
  }

  const obj = await t.query(async (ctx) => {
    const row = await ctx.db
      .query("objectives")
      .withIndex("by_key", (q) => q.eq("key", key))
      .unique();
    return (row as { data: ObjectiveRecord }).data;
  });
  assert.equal(obj.finalSemanticAssessment?.meetsMinimumBar, true);
  assert.equal(obj.acceptedTerminal?.terminal, "DELIVERED");
  assert.equal(
    obj.companyArtifacts?.find((a) => a.key === artifactKey)?.version,
    2,
  );
});

test("supplied-evidence variant: adequate owned evidence needs no BUY", async () => {
  const t = convexTest(schema, modules);
  const key = "obj_chain_supplied";
  const reqKey = "req_relaunch";
  await t.mutation(async (ctx) => {
    await ctx.db.insert("objectives", {
      key,
      data: {
        key,
        request: "relaunch with owned evidence",
        createdAt: now,
        updatedAt: now,
        state: "received",
        activity: "new",
        plan: null,
        workItems: [],
        run: null,
        result: null,
        companyArtifacts: [
          { key: "launch/page-message", version: 1, content: "seed", history: [] },
        ],
        management: { contractId: null, controlNotes: [] },
      } as never,
    });
    await (initBudget as unknown as Handler)._handler(ctx, {
      objectiveKey: key,
      at: now,
    });
  });
  const interpreted = (await t.mutation(async (ctx) =>
    (applyInterpretation as unknown as Handler)._handler(ctx, {
      objectiveKey: key,
      requestId: `interpret_${key}`,
      rawContract: {
        intent: "deliver relaunch from owned evidence",
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
      },
      rawRequirements: [
        {
          requirementKey: reqKey,
          priority: "required",
          title: "Relaunch",
          mustBeTrue: "recommendation saved",
          scope: "owned evidence sufficient",
          expectedOutput: "saved recommendation",
          requirementKind: "deliverable",
        },
      ],
      founderResolvedQuestions: [],
      at: now,
    }),
  )) as { ok: boolean };
  assert.equal(interpreted.ok, true);
  const intents = await t.query(async (ctx) =>
    ctx.db
      .query("executionIntents")
      .withIndex("by_objective", (q) => q.eq("objectiveKey", key))
      .collect(),
  );
  assert.equal(intents.length, 0, "no BUY minted for supplied-evidence start");
  const reqs = await t.query(async (ctx) => {
    const rows = await ctx.db
      .query("requirements")
      .withIndex("by_objectiveKey", (q) => q.eq("objectiveKey", key))
      .collect();
    return rows.map((r) => (r as { data: Requirement }).data);
  });
  assert.equal(reqs[0]!.strategy, null);
  assert.equal(reqs[0]!.requirementKind, "deliverable");
});

test("concurrent management wakes cannot create two current actions", async () => {
  const t = convexTest(schema, modules);
  const key = "obj_concurrent_wake";
  const reqKey = "req_wake";

  await t.mutation(async (ctx) => {
    await ctx.db.insert("objectives", {
      key,
      data: {
        key,
        request: "Produce a sourced observation",
        createdAt: now,
        updatedAt: now,
        state: "received",
        activity: "new",
        plan: null,
        workItems: [],
        run: null,
        result: null,
        management: { contractId: null, controlNotes: [] },
      } as never,
    });
    await (initBudget as unknown as Handler)._handler(ctx, {
      objectiveKey: key,
      at: now,
    });
  });

  const interpreted = (await t.mutation(async (ctx) =>
    (applyInterpretation as unknown as Handler)._handler(ctx, {
      objectiveKey: key,
      requestId: `interpret_${key}`,
      rawContract: {
        intent: "produce a sourced observation",
        levels: [
          {
            levelKey: "observation",
            order: 1,
            statement: "one application observation is on record",
            label: "Observation",
          },
        ],
        minimumCompletionBar: "observation",
        ambiguities: [],
      },
      rawRequirements: [
        {
          requirementKey: reqKey,
          priority: "required",
          title: "Observation",
          mustBeTrue: "an application observation supports the work",
          scope: "one governed observation",
          requirementKind: "deliverable",
          expectedOutput: "observation",
        },
      ],
      founderResolvedQuestions: [],
      at: now,
    }),
  )) as { ok: boolean };
  assert.equal(interpreted.ok, true);

  await t.mutation(async (ctx) =>
    (runManagementPass as unknown as Handler)._handler(ctx, {
      objectiveKey: key,
      reason: "objective_submitted",
    }),
  );

  const pendingObj = await t.query(async (ctx) => {
    const row = await ctx.db
      .query("objectives")
      .withIndex("by_key", (q) => q.eq("key", key))
      .unique();
    return (
      row as {
        data: {
          management: {
            pendingDecision: {
              requestId: string;
              requirementKey: string;
              contractRevision: number;
            } | null;
          };
        };
      }
    ).data;
  });
  const pending = pendingObj.management.pendingDecision;
  assert.ok(pending);

  const capabilityKeys = ["public_information_research"];
  const expectedOptionId = optionIdFor({
    requirementKey: reqKey,
    contractRevision: 1,
    kind: "internal",
    target: `internal:${[...capabilityKeys].sort().join("+")}:new`,
  });

  const apply = (await t.mutation(async (ctx) =>
    (applyDecision as unknown as Handler)._handler(ctx, {
      objectiveKey: key,
      requestId: pending!.requestId,
      rawStrategyProposal: {
        strategy: "MAKE",
        desiredCapabilities: capabilityKeys,
        needsExternalResourceClass: null,
        notes: null,
      },
      rawRecommendation: {
        requirementKey: reqKey,
        contractRevision: 1,
        selectedOptionId: expectedOptionId,
        rationale: "MAKE for concurrent-wake fence",
        materialAssumptions: [],
        changeMyMindEvidence: [],
      },
      at: now,
    }),
  )) as { ok: boolean; authorized?: boolean };
  assert.equal(apply.ok, true);
  assert.equal(apply.authorized, true);

  // Two wakes after authorize: must not create a second current action.
  await Promise.all([
    t.mutation(async (ctx) =>
      (runManagementPass as unknown as Handler)._handler(ctx, {
        objectiveKey: key,
        reason: "decision_applied",
      }),
    ),
    t.mutation(async (ctx) =>
      (runManagementPass as unknown as Handler)._handler(ctx, {
        objectiveKey: key,
        reason: "wake_duplicate",
      }),
    ),
  ]);

  const assignments = await t.query(async (ctx) => {
    const rows = await ctx.db
      .query("assignments")
      .withIndex("by_objective", (q) => q.eq("objectiveKey", key))
      .collect();
    return rows.map((r) => (r as { data: { state: string } }).data);
  });
  const current = assignments.filter(
    (a) =>
      a.state === "authorized" ||
      a.state === "dispatched" ||
      a.state === "running" ||
      a.state === "result_submitted",
  );
  assert.equal(current.length, 1, `expected one current action, got ${current.length}`);

  const intents = await t.query(async (ctx) =>
    ctx.db
      .query("executionIntents")
      .withIndex("by_objective", (q) => q.eq("objectiveKey", key))
      .collect(),
  );
  assert.equal(intents.length, 0);
});

test("stale-revision verified BUY does not release current requirement strategy", async () => {
  const t = convexTest(schema, modules);
  const key = "obj_stale_buy_release";
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
        activity: "running",
        plan: null,
        workItems: [],
        run: null,
        result: null,
        companyArtifacts: [
          { key: "launch/page-message", version: 1, content: "seed", history: [] },
        ],
        acquisitionResults: [
          {
            intentId: `int_${key}`,
            requirementKey: reqKey,
            contractRevision: 1,
            resultEvidenceId: `sim_${key}`,
            provenance: "simulation",
            providerId: "2135",
            serviceId: "newsliquid_twitter_search",
            offeringId: "2135:newsliquid_twitter_search",
            resourceClass: "proprietary_data",
            content: "old",
            responseHash: "h",
            recordedAt: now,
            verifiedAt: now,
            needDedupeKey: "dedupe_old",
          },
        ],
        management: {
          contractId: `contract_${key}`,
          executionProtocol: M61_SERIAL_V1,
          currentContractRevision: 2,
        },
      } as never,
    });
    await (putIntent as unknown as Handler)._handler(ctx, {
      intentId: `int_${key}`,
      objectiveKey: key,
      idempotencyKey: `idem_${key}`,
      data: {
        intentId: `int_${key}`,
        idempotencyKey: `idem_${key}`,
        objectiveKey: key,
        requirementKey: reqKey,
        contractRevision: 1,
        decisionId: `dec_${key}`,
        kind: "external_acquisition",
        strategy: "BUY",
        target: {
          offeringId: "2135:newsliquid_twitter_search",
          providerId: "2135",
          serviceId: "newsliquid_twitter_search",
          resourceClass: "proprietary_data",
          endpointRef: null,
        },
        terms: {
          priceUsd: 2,
          priceProvenance: "provider_quote",
          requiresApproval: true,
          approvalId: `grant_${key}`,
        },
        state: "verified",
        attempts: 1,
        lastEventId: "evt",
        resultEvidenceId: `sim_${key}`,
        verificationEvidenceId: `ver_${key}`,
        boundaryNote: "sim",
        createdAt: now,
        updatedAt: now,
      },
    });
    await (putRequirement as unknown as Handler)._handler(ctx, {
      objectiveKey: key,
      requirementKey: reqKey,
      data: {
        requirementKey: reqKey,
        objectiveKey: key,
        contractId: `contract_${key}`,
        contractRevision: 2,
        priority: "required",
        title: "Relaunch",
        mustBeTrue: "recommendation saved",
        scope: "deliverable",
        dependsOnRequirementKeys: [],
        requiredResourceClasses: ["proprietary_data"],
        expectedOutput: "saved recommendation",
        requirementKind: "deliverable",
        proofs: [
          {
            proofKey: "artifact_change",
            description: "artifact",
            proofKind: "company_artifact_version",
            params: { artifactKey: "launch/page-message", minVersion: 2 },
          },
        ],
        state: "active",
        strategy: "BUY",
        resolution: null,
        blockedReason: null,
        waiver: null,
        revision: 2,
        createdAt: now,
        updatedAt: now,
      },
      currentContractRevision: 2,
    });
  });

  await t.mutation(async (ctx) =>
    (runManagementPass as unknown as Handler)._handler(ctx, {
      objectiveKey: key,
      reason: "verification_result",
    }),
  );

  const req = await t.query(async (ctx) => {
    const row = await ctx.db
      .query("requirements")
      .withIndex("by_objectiveRequirement", (q) =>
        q.eq("objectiveKey", key).eq("requirementKey", reqKey),
      )
      .unique();
    return (row as { data: Requirement }).data;
  });
  assert.equal(req.strategy, "BUY", "stale r1 BUY must not clear r2 strategy");
});
