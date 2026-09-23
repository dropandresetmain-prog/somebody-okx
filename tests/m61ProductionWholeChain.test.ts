// M6.1 owner-review F: genuine unbroken production manager/execution chain.
// Does NOT declare Gate 1 PASS. Does NOT preseed decisions/intents/acquisitions/
// satisfied requirements/running assignments/worker evidence/completion verdicts.
//
// Deterministic injected model responses are allowed. Operator-gated acquisition
// SIMULATION only after a matching authorized intent exists.
import test, { mock, after as afterAll } from "node:test";
import assert from "node:assert/strict";
import { Usage, type Model } from "@openai/agents";
import { convexTest } from "convex-test";
import schema from "../convex/schema";
import {
  applyInterpretation,
  applyDecision,
  beginFinalSemanticAssessment,
  beginInterpretation,
  runManagementPass,
} from "../convex/management";
import {
  makeConvexPort,
  proposeFinalSemanticAssessment,
} from "../convex/objectiveRunner";
import { initBudget } from "../convex/internal/workforce";
import {
  finishRun,
  readWorkerObservation,
  recordFinding,
  reportMissingInput,
  submitResult,
  updateCompanyArtifact,
} from "../convex/objectives";
import { simulateVerifiedAcquisition } from "../convex/m3Driver";
import { runWorker } from "../lib/worker/runtime";
import type { WorkerCommand, WorkerPort } from "../lib/worker/port";
import { optionIdFor } from "../lib/management/options";
import { M61_SERIAL_V1 } from "../lib/management/executionProtocol";
import { installStructuredChatDouble } from "../lib/management/modelBoundary";
import type { Assignment, Requirement } from "../lib/management/types";
import type { ObjectiveRecord } from "../lib/objective/types";
import type { WorkContract } from "../lib/workforce";

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

const now = 1_978_000_000_000;
const OPERATOR_TOKEN = "m61-demo-operator-token";
const ARTIFACT = "launch/page-message";
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
  ) as Promise<{ objectiveState: string; summary: string }>;
}

async function readObj(t: Backend, key: string) {
  return t.query(async (ctx) => {
    const row = await ctx.db
      .query("objectives")
      .withIndex("by_key", (q) => q.eq("key", key))
      .unique();
    return (row as { data: ObjectiveRecord & { management: Record<string, unknown> } }).data;
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

async function seedFounderOnly(
  t: Backend,
  key: string,
  opts: { grantUsd?: number; request?: string } = {},
) {
  await t.mutation(async (ctx) => {
    await ctx.db.insert("objectives", {
      key,
      data: {
        key,
        request:
          opts.request ??
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
          {
            key: ARTIFACT,
            version: 1,
            content: "seed headline — generic businesses copy",
            history: [],
          },
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
        limitUsd: opts.grantUsd ?? 25,
        grantedAt: now,
        revokedAt: null,
        note: "founder-approved bounded spend",
      },
    });
  });
}

async function interpretDeliverable(t: Backend, key: string, reqKey: string) {
  // V7 review R3 fence: applyInterpretation now only applies against a
  // matching PENDING reservation, so beginInterpretation must reserve the
  // requestId first (the same two-step seam production uses) before we can
  // hand-build the interpretation and apply it.
  const begin = (await t.mutation(async (ctx) =>
    (beginInterpretation as unknown as Handler)._handler(ctx, {
      objectiveKey: key,
      at: now,
    }),
  )) as { proceed: boolean; requestId?: string; reason?: string };
  assert.equal(begin.proceed, true, begin.reason);
  const interpreted = (await t.mutation(async (ctx) =>
    (applyInterpretation as unknown as Handler)._handler(ctx, {
      objectiveKey: key,
      requestId: begin.requestId!,
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
          title: "Relaunch recommendation delivered",
          mustBeTrue: "a versioned relaunch recommendation artifact is saved",
          scope: "founder-facing deliverable",
          expectedOutput: "saved relaunch recommendation",
          requirementKind: "deliverable",
        },
      ],
      founderResolvedQuestions: [],
      at: now,
    }),
  )) as { ok: boolean; errors?: string[] };
  assert.equal(interpreted.ok, true, interpreted.errors?.join("; "));
}

async function pendingDecision(t: Backend, key: string) {
  const obj = await readObj(t, key);
  const pending = obj.management.pendingDecision as {
    requestId: string;
    requirementKey: string;
    contractRevision: number;
  } | null;
  assert.ok(pending, "pendingDecision must be reserved by production pass");
  return pending!;
}

function makeConvexBackedPort(
  t: Backend,
  key: string,
  runId: string,
  reqKey: string,
): WorkerPort {
  return {
    async read() {
      return (await t.query(async (ctx) =>
        (readWorkerObservation as unknown as Handler)._handler(ctx, {
          objectiveKey: key,
          runId,
        }),
      )) as Awaited<ReturnType<WorkerPort["read"]>>;
    },
    async act(command: WorkerCommand) {
      if (command.type === "record_observation" && command.source === "company_record") {
        const { lookupCompanyRecord } = await import("../lib/objective/inputAvailability");
        const looked = lookupCompanyRecord(command.recordRef ?? "");
        if (looked.status !== "AVAILABLE") {
          return JSON.stringify({ status: "INVALID_REQUEST", detail: looked.detail });
        }
        const recorded = (await t.mutation(async (ctx) =>
          (recordFinding as unknown as Handler)._handler(ctx, {
            objectiveKey: key,
            runId,
            finding: {
              sourceClass: "company_record",
              label: looked.record.label,
              text: looked.record.text,
              origin: "application_observation",
              sourceId: `record:${looked.record.ref.trim()}`,
              recordRef: looked.record.ref,
              observedAt: now,
            },
          }),
        )) as { evidenceId: string };
        return `Observation recorded (evidence ${recorded.evidenceId}) from company_record`;
      }
      if (command.type === "update_company_artifact") {
        const result = await t.mutation(async (ctx) =>
          (updateCompanyArtifact as unknown as Handler)._handler(ctx, {
            objectiveKey: key,
            runId,
            content: command.content,
            changeNote: command.changeNote ?? "worker update",
            usedAcquisitionEvidenceIds: command.usedAcquisitionEvidenceIds ?? [],
          }),
        );
        return JSON.stringify(result);
      }
      if (command.type === "submit_result") {
        const missing = command.result.missingInputs ?? [];
        let validatedGapAccepted = false;
        for (const proposal of missing.slice(0, 4)) {
          const report = (await t.mutation(async (ctx) =>
            (reportMissingInput as unknown as Handler)._handler(ctx, {
              objectiveKey: key,
              runId,
              requirementKey: reqKey,
              workItemId: null,
              proposal: {
                inputCheckId: proposal.inputCheckId,
                resourceClass: proposal.resourceClass,
                purpose:
                  proposal.unansweredQuestion ?? proposal.purpose,
                reasonOwnedInsufficient: [
                  proposal.whyInsufficient ??
                    proposal.reasonOwnedInsufficient,
                  proposal.howAdditionalWouldChange
                    ? `How additional would change: ${proposal.howAdditionalWouldChange}`
                    : "",
                ]
                  .filter((s) => s && String(s).trim().length > 0)
                  .join(" | ")
                  .slice(0, 500),
                supportingEvidenceIds:
                  proposal.observedEvidenceIds ??
                  proposal.supportingEvidenceIds,
                // V7 review R4: forwarded as a PROPOSAL; reportMissingInput validates it.
                ...(proposal.purposeKind ? { purposeKind: proposal.purposeKind } : {}),
                ...(proposal.semanticGap === true
                  ? { semanticAdequacyGap: true }
                  : {}),
              },
            }),
          )) as { validated: boolean };
          if (report.validated) validatedGapAccepted = true;
        }
        const outcome = (await t.mutation(async (ctx) =>
          (submitResult as unknown as Handler)._handler(ctx, {
            objectiveKey: key,
            runId,
            result: {
              ...command.result,
              ...(command.result.terminal === "NEEDS_INPUT"
                ? { validatedGapAccepted }
                : {}),
            },
          }),
        )) as { status: string; terminalAccepted: boolean; detail: string };
        return JSON.stringify(outcome);
      }
      return JSON.stringify({ status: "accepted", result: "ok" });
    },
  };
}

/**
 * F — genuine production chain through completed Objective.
 * Traverses: applyInterpretation → runManagementPass → applyDecision(MAKE) →
 * dispatch/startManagedRun → runWorker(injected) → finishRun →
 * runManagementPass → applyDecision(BUY) → dispatchExternal →
 * simulateVerifiedAcquisition → runManagementPass(release) →
 * applyDecision(MAKE) → dispatch with action-scoped inputEvidenceIds →
 * runWorker artifact mutation → finishRun → begin/applyFinalSemanticAssessment →
 * runManagementPass → proposeCompletion → completion gate → completed.
 */
test("F production whole-chain: founder → MAKE → gap → BUY sim → MAKE artifact → assessment → completed", async () => {
  const t = convexTest(schema, modules);
  const key = "obj_prod_chain_f";
  const reqKey = "req_relaunch";
  const previousToken = process.env.SOMEBODY_DEMO_OPERATOR_TOKEN;
  process.env.SOMEBODY_DEMO_OPERATOR_TOKEN = OPERATOR_TOKEN;

  try {
    await seedFounderOnly(t, key);
    await interpretDeliverable(t, key, reqKey);

    const afterInterp = await readObj(t, key);
    assert.equal(afterInterp.management.executionProtocol, M61_SERIAL_V1);
    assert.equal(afterInterp.result, null);
    const reqs0 = await readReqs(t, key);
    assert.equal(reqs0[0]!.state, "active");
    assert.equal(reqs0[0]!.strategy, null);
    assert.equal((await readIntents(t, key)).length, 0);
    assert.equal((await readAssignments(t, key)).length, 0);
    assert.equal(afterInterp.acquisitionResults?.length ?? 0, 0);

    await invokePass(t, key, "objective_submitted");
    const pending1 = await pendingDecision(t, key);
    assert.equal(pending1.requirementKey, reqKey);

    const makeCaps = ["growth_launch_operations", "company_records_lookup"];
    const makeOptionId = optionIdFor({
      requirementKey: reqKey,
      contractRevision: 1,
      kind: "internal",
      target: `internal:${[...makeCaps].sort().join("+")}:new`,
    });

    const make1 = (await t.mutation(async (ctx) =>
      (applyDecision as unknown as Handler)._handler(ctx, {
        objectiveKey: key,
        requestId: pending1.requestId,
        rawStrategyProposal: {
          strategy: "MAKE",
          desiredCapabilities: makeCaps,
          needsExternalResourceClass: null,
          notes: null,
        },
        rawRecommendation: {
          requirementKey: reqKey,
          contractRevision: 1,
          selectedOptionId: makeOptionId,
          rationale: "first serial MAKE to inspect owned evidence",
          materialAssumptions: [],
          changeMyMindEvidence: [],
        },
        at: now,
      }),
    )) as { ok: boolean; authorized?: boolean; strategy?: string; reason?: string };
    assert.equal(make1.ok, true, make1.reason);
    assert.equal(make1.authorized, true);
    assert.equal(make1.strategy, "MAKE");

    await invokePass(t, key, "decision_applied");
    const assignments1 = await readAssignments(t, key);
    assert.equal(assignments1.length, 1);
    const runId1 = assignments1[0]!.runId!;
    const contract1 = assignments1[0]!.workContract as WorkContract;
    assert.ok(runId1);
    assert.ok(contract1);

    // Injected worker: observe company record, then semantic-gap NEEDS_INPUT.
    let seenEv: string[] = [];
    let step = 0;
    const modelGap: Model = {
      async getResponse() {
        step += 1;
        if (step === 1) {
          return {
            usage: new Usage(),
            output: [
              toolCall(
                "read_company_record",
                { recordRef: "launch/context" },
                "c1",
              ),
            ],
          };
        }
        const obs = await t.query(async (ctx) =>
          (readWorkerObservation as unknown as Handler)._handler(ctx, {
            objectiveKey: key,
            runId: runId1,
          }),
        ) as { recordedFindings: Array<{ id: string }> };
        seenEv = obs.recordedFindings.map((f) => f.id);
        assert.ok(seenEv.length >= 1, "must observe before semantic gap");
        return {
          usage: new Usage(),
          output: [
            toolCall(
              "submit_result",
              {
                summary: "Owned sources inspected; audience language still missing",
                fit: "incomplete",
                risks: [],
                unknowns: ["audience language"],
                recommendedNextAction: "acquire proprietary audience data",
                terminal: "NEEDS_INPUT",
                missingInputs: [
                  {
                    inputCheckId: "evidence_sufficiency",
                    resourceClass: "proprietary_data",
                    purpose: "audience language for relaunch",
                    reasonOwnedInsufficient:
                      "owned company_record does not answer audience wording",
                    supportingEvidenceIds: seenEv,
                    semanticGap: true,
                    unansweredQuestion:
                      "What social intelligence describes how early founders phrase launch pain?",
                    observedEvidenceIds: seenEv,
                    whyInsufficient:
                      "Company record lacks proprietary audience-language evidence",
                    howAdditionalWouldChange:
                      "Verified proprietary social intelligence would ground relaunch wording",
                    // V7 review R4: the worker proposes the governed requested
                    // scope; eligibility no longer comes from prose substrings.
                    purposeKind: "founder_messaging_qualitative",
                  },
                ],
              },
              "c2",
            ),
          ],
        };
      },
      async *getStreamedResponse() {
        throw new Error("unused");
      },
    };

    await t.action(async (ctx) => {
      const port = makeConvexPort(ctx, key, runId1, true);
      await runWorker(port, contract1, {
        model: modelGap,
        serialManagerProtocol: true,
        maxTurns: 4,
      });
    });

    await t.mutation(async (ctx) =>
      (finishRun as unknown as Handler)._handler(ctx, {
        objectiveKey: key,
        runId: runId1,
        toolCalls: 2,
      }),
    );

    const afterGap = await readObj(t, key);
    assert.ok(
      (afterGap.resourceNeeds ?? []).some(
        (n) =>
          n.resourceClass === "proprietary_data" &&
          (n.status === "active" || n.status === "sourcing" || n.status === "buy_pending"),
      ),
      "validated ResourceNeed must exist after semantic gap",
    );
    assert.notEqual(afterGap.state, "completed");

    await invokePass(t, key, "worker_result");
    const pendingBuy = await pendingDecision(t, key);

    // Discover eligible BUY option via production decision builder.
    const { readDecisionContext } = await import("../convex/internal/workforce");
    const reads = (await t.query(async (ctx) =>
      (readDecisionContext as unknown as Handler)._handler(ctx, {
        objectiveKey: key,
        requirementKey: reqKey,
      }),
    )) as Record<string, unknown>;
    const { buildDecisionPassInput } = await import("../lib/management/decisionPass");
    const { runManagerialDecisionPass } = await import("../lib/management/decision");
    let buyOptionId: string | null = null;
    const built = await buildDecisionPassInput(
      {
        ...reads,
        at: now,
        decisionId: "probe_buy",
        serialManagerProtocol: true,
      } as never,
      {
        strategy: "BUY",
        desiredCapabilities: makeCaps,
        needsExternalResourceClass: "proprietary_data",
        notes: null,
      },
      async (eligible) => {
        const dump = eligible
          .map(
            (o) =>
              `${o.kind}:${o.eligibility.eligible}:[${o.eligibility.reasons?.join(",") ?? ""}]`,
          )
          .join("|");
        const needs = JSON.stringify(
          (reads as { openResourceNeeds?: unknown }).openResourceNeeds ?? [],
        );
        const external = eligible.find(
          (o) => o.kind === "external" && o.eligibility.eligible,
        );
        if (!external) {
          throw new Error(
            `no eligible BUY; options=${dump}; openNeeds=${needs}`,
          );
        }
        buyOptionId = external.optionId;
        return {
          requirementKey: reqKey,
          contractRevision: 1,
          selectedOptionId: external.optionId,
          rationale: "validated proprietary_data gap requires acquisition",
          materialAssumptions: [],
          changeMyMindEvidence: [],
        };
      },
    );
    assert.equal(built.ok, true, built.ok ? "" : JSON.stringify(built));
    if (!built.ok) return;
    const probe = await runManagerialDecisionPass(built.input);
    assert.ok(
      buyOptionId,
      `recommend must select BUY; auth=${probe.authorization.kind} options=${probe.options
        .map((o) => `${o.kind}:${o.eligibility.eligible}`)
        .join("|")} needs=${JSON.stringify((reads as { openResourceNeeds?: unknown }).openResourceNeeds)}`,
    );

    const buy = (await t.mutation(async (ctx) =>
      (applyDecision as unknown as Handler)._handler(ctx, {
        objectiveKey: key,
        requestId: pendingBuy.requestId,
        rawStrategyProposal: {
          strategy: "BUY",
          desiredCapabilities: makeCaps,
          needsExternalResourceClass: "proprietary_data",
          notes: null,
        },
        rawRecommendation: {
          requirementKey: reqKey,
          contractRevision: 1,
          selectedOptionId: buyOptionId!,
          rationale: "validated proprietary_data gap requires acquisition",
          materialAssumptions: [],
          changeMyMindEvidence: [],
        },
        at: now,
      }),
    )) as { ok: boolean; authorized?: boolean; strategy?: string; reason?: string };
    assert.equal(buy.ok, true, buy.reason);
    assert.equal(buy.authorized, true);
    assert.equal(buy.strategy, "BUY");

    await invokePass(t, key, "decision_applied");
    const intents = await readIntents(t, key);
    assert.equal(intents.length, 1, "exactly one authorized external intent");
    assert.ok(
      intents[0]!.state === "authorized" || intents[0]!.state === "awaiting_m3",
      `unexpected intent state ${String(intents[0]!.state)}`,
    );
    assert.ok(intents[0]!.needDedupeKey, "BUY intent must carry need identity");
    // V7 review R4: the authorized intent carries the bound need's
    // application-validated requested scope (what the merchant request and
    // result verification bind to) — never a stamped default.
    assert.equal(intents[0]!.requestedPurposeKind, "founder_messaging_qualitative");
    const intentId = String(intents[0]!.intentId);

    // Operator-gated SIMULATION only after matching authorized intent exists.
    const sim = (await t.mutation(async (ctx) =>
      (simulateVerifiedAcquisition as unknown as Handler)._handler(ctx, {
        operatorToken: OPERATOR_TOKEN,
        intentId,
      }),
    )) as { verified: boolean; resultEvidenceId: string };
    assert.equal(sim.verified, true);
    assert.ok(sim.resultEvidenceId);

    await invokePass(t, key, "verification_result");
    const afterRelease = await readReqs(t, key);
    assert.notEqual(afterRelease[0]!.state, "satisfied", "BUY must not satisfy deliverable");
    assert.equal(
      afterRelease[0]!.strategy,
      null,
      "verified BUY must release strategy for redecide",
    );

    await invokePass(t, key, "post_acquisition");
    const pendingMake2 = await pendingDecision(t, key);

    // After first MAKE, worker may now exist → option id is REUSE not :new.
    const make2Reads = (await t.query(async (ctx) =>
      (readDecisionContext as unknown as Handler)._handler(ctx, {
        objectiveKey: key,
        requirementKey: reqKey,
      }),
    )) as Record<string, unknown>;
    let make2OptionId: string | null = null;
    const make2Built = await buildDecisionPassInput(
      {
        ...make2Reads,
        at: now,
        decisionId: "probe_make2",
        serialManagerProtocol: true,
      } as never,
      {
        strategy: "MAKE",
        desiredCapabilities: makeCaps,
        needsExternalResourceClass: null,
        notes: null,
      },
      async (eligible) => {
        const internal = eligible.find(
          (o) => o.kind === "internal" && o.eligibility.eligible,
        );
        assert.ok(
          internal,
          `second MAKE must be eligible; ${eligible.map((o) => `${o.kind}:${o.eligibility.eligible}`).join("|")}`,
        );
        make2OptionId = internal!.optionId;
        return {
          requirementKey: reqKey,
          contractRevision: 1,
          selectedOptionId: internal!.optionId,
          rationale: "MAKE with action-scoped acquisition evidence",
          materialAssumptions: [],
          changeMyMindEvidence: [],
        };
      },
    );
    assert.equal(make2Built.ok, true);
    if (!make2Built.ok) return;
    await runManagerialDecisionPass(make2Built.input);
    assert.ok(make2OptionId);

    const make2 = (await t.mutation(async (ctx) =>
      (applyDecision as unknown as Handler)._handler(ctx, {
        objectiveKey: key,
        requestId: pendingMake2.requestId,
        rawStrategyProposal: {
          strategy: "MAKE",
          desiredCapabilities: makeCaps,
          needsExternalResourceClass: null,
          notes: null,
        },
        rawRecommendation: {
          requirementKey: reqKey,
          contractRevision: 1,
          selectedOptionId: make2OptionId!,
          rationale: "MAKE with action-scoped acquisition evidence",
          materialAssumptions: [],
          changeMyMindEvidence: [],
        },
        at: now,
      }),
    )) as { ok: boolean; authorized?: boolean; strategy?: string; reason?: string };
    assert.equal(make2.ok, true, `make2 failed: ${make2.reason}`);
    assert.equal(make2.authorized, true, `make2 not authorized: ${JSON.stringify(make2)}`);
    assert.equal(make2.strategy, "MAKE");

    await invokePass(t, key, "decision_applied");
    const assignments2 = await readAssignments(t, key);
    const make2Assign = assignments2
      .filter((a) => a.strategy !== "BUY" && a.kind !== "external_acquisition")
      .sort((a, b) => b.createdAt - a.createdAt)[0];
    // Prefer the newest running/dispatched MAKE.
    const latestMake = assignments2
      .filter(
        (a) =>
          a.kind === "internal_make" &&
          (a.state === "running" || a.state === "dispatched"),
      )
      .sort((a, b) => b.createdAt - a.createdAt)[0];
    assert.ok(latestMake, "second MAKE must be dispatched");
    const runId2 = latestMake.runId!;
    const contract2 = latestMake.workContract as WorkContract;
    assert.ok(
      (contract2.inputEvidenceIds ?? []).includes(sim.resultEvidenceId),
      `WorkContract must receive action-scoped acquisition ${sim.resultEvidenceId}; got ${JSON.stringify(contract2.inputEvidenceIds)}`,
    );
    assert.equal(contract2.targetArtifactKey, ARTIFACT);

    let step2 = 0;
    const modelDeliver: Model = {
      async getResponse() {
        step2 += 1;
        if (step2 === 1) {
          return {
            usage: new Usage(),
            output: [
              toolCall(
                "read_company_record",
                { recordRef: "launch/context" },
                "d1",
              ),
            ],
          };
        }
        if (step2 === 2) {
          const obs = (await t.query(async (ctx) =>
            (readWorkerObservation as unknown as Handler)._handler(ctx, {
              objectiveKey: key,
              runId: runId2,
            }),
          )) as {
            acquiredInputs?: Array<{ resultEvidenceId?: string; text?: string }>;
            loadedInputPackage?: { inputEvidenceIds?: string[] };
          };
          const acquired = obs.acquiredInputs?.[0];
          const evidenceId = acquired?.resultEvidenceId;
          const finding = String(acquired?.text ?? "").trim();
          assert.ok(
            evidenceId,
            "second MAKE worker must see action-scoped acquisition evidence id in observation (no sim fallback)",
          );
          assert.equal(
            evidenceId,
            sim.resultEvidenceId,
            "observed acquisition must be the authorized simulated receipt",
          );
          assert.ok(
            finding.length > 0,
            "observed acquisition content must be present; missing content fails causality",
          );
          return {
            usage: new Usage(),
            output: [
              toolCall(
                "update_company_artifact",
                {
                  content: `Relaunch recommendation grounded in acquired evidence.\n${finding.slice(0, 400)}`,
                  changeNote: "Apply observed acquisition to relaunch copy",
                  usedAcquisitionEvidenceIds: [evidenceId],
                },
                "d2",
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
                summary: "Relaunch recommendation saved with acquired audience evidence",
                fit: "meets minimum bar",
                risks: ["live conversion remains unproven"],
                unknowns: ["channel mix after relaunch"],
                recommendedNextAction: "complete",
                terminal: "DELIVERED",
              },
              "d3",
            ),
          ],
        };
      },
      async *getStreamedResponse() {
        throw new Error("unused");
      },
    };

    await t.action(async (ctx) => {
      const port = makeConvexPort(ctx, key, runId2, true);
      await runWorker(port, contract2, {
        model: modelDeliver,
        serialManagerProtocol: true,
        maxTurns: 5,
      });
    });

    await t.mutation(async (ctx) =>
      (finishRun as unknown as Handler)._handler(ctx, {
        objectiveKey: key,
        runId: runId2,
        toolCalls: 3,
      }),
    );

    const afterMake2 = await readObj(t, key);
    const art = afterMake2.companyArtifacts?.find((a) => a.key === ARTIFACT);
    assert.ok(art && art.version >= 2, `artifact must advance; got v${art?.version}`);
    assert.ok(
      afterMake2.workItems?.[0]?.state === "completed" ||
        afterMake2.acceptedTerminal?.terminal === "DELIVERED",
      `worker delivery must land; workItem=${afterMake2.workItems?.[0]?.state} terminal=${afterMake2.acceptedTerminal?.terminal}`,
    );
    assert.notEqual(afterMake2.state, "completed", "assessment must precede completion");
    assert.ok(
      String(art!.content).length > 40,
      "artifact content must reflect worker update",
    );

    // Final assessment through production proposeFinalSemanticAssessment via
    // structured-chat double (not applyFinalSemanticAssessment bypass).
    const assessmentRequests: Array<{ user: string; system: string }> = [];
    installStructuredChatDouble((req) => {
      if (req.kind === "final_assessment") {
        assessmentRequests.push({ user: req.user, system: req.system });
        const parsed = JSON.parse(req.user) as {
          artifact?: { key?: string; version?: number };
          lockedContract?: { minimumCompletionBar?: string };
          deliverableCriteria?: { mustBeTrue?: string };
          evidenceIds?: string[];
          ownedObservations?: unknown[];
          verifiedAcquisitions?: Array<{ resultEvidenceId?: string }>;
        };
        assert.equal(parsed.artifact?.key, ARTIFACT);
        assert.equal(parsed.artifact?.version, art!.version);
        assert.ok(Array.isArray(parsed.ownedObservations));
        assert.ok(
          (parsed.verifiedAcquisitions ?? []).every(
            (a) => a.resultEvidenceId === sim.resultEvidenceId,
          ),
          "assessment must not include unrelated Objective-wide acquisitions",
        );
        assert.ok(
          parsed.lockedContract?.minimumCompletionBar === "relaunch" ||
            String(req.user).includes("relaunch"),
          "assessment request must carry locked minimum bar / criteria",
        );
        return {
          meetsMinimumBar: true,
          rationale:
            "Artifact meets the locked relaunch bar with owned observation and verified acquisition evidence.",
          artifactKey: ARTIFACT,
          artifactVersion: art!.version,
          evidenceRefs: [sim.resultEvidenceId, ...seenEv].slice(0, 8),
          assumptionsUnknowns: ["live conversion unknown"],
          recommendedNextAction: "complete",
        };
      }
      throw new Error(`unexpected structured chat kind ${req.kind}`);
    });

    let settle = await invokePass(t, key, "worker_result");
    for (let i = 0; i < 6 && settle.objectiveState !== "completed"; i++) {
      const reqs = await readReqs(t, key);
      const req = reqs[0]!;
      if (req.state === "satisfied" && !((await readObj(t, key)).finalSemanticAssessment)) {
        const began = (await t.mutation(async (ctx) =>
          (beginFinalSemanticAssessment as unknown as Handler)._handler(ctx, {
            objectiveKey: key,
            at: now + i,
          }),
        )) as { proceed: boolean; requestId?: string; reason?: string };
        assert.ok(
          began.proceed,
          `beginFinal must proceed: ${began.reason ?? "unknown"}`,
        );
        await t.action(async (ctx) =>
          (proposeFinalSemanticAssessment as unknown as Handler)._handler(ctx, {
            objectiveKey: key,
            requestId: began.requestId!,
            contractRevision: 1,
          }),
        );
      }
      settle = await invokePass(t, key, `settle_${i}`);
    }
    installStructuredChatDouble(null);

    assert.ok(
      assessmentRequests.length >= 1,
      "proposeFinalSemanticAssessment must call structured-chat boundary",
    );

    const finalObj = await readObj(t, key);
    const finalReqs = await readReqs(t, key);
    const notes = (finalObj.management.controlNotes ?? []) as Array<{
      type?: string;
      state?: string;
      summary?: string;
    }>;
    const completedNote = notes
      .filter((n) => n.type === "control_state" && n.state === "completed")
      .at(-1);
    assert.ok(
      settle.objectiveState === "completed" || completedNote,
      `expected completed pass/note; settle=${settle.objectiveState} note=${completedNote?.summary} db=${finalObj.state} req=${finalReqs[0]?.state} last=${settle.summary}`,
    );
    assert.equal(
      finalObj.state,
      "completed",
      `durable state; settle=${settle.objectiveState} notes=${notes
        .filter((n) => n.type === "control_state")
        .slice(-5)
        .map((n) => n.state)
        .join(">")} assess=${JSON.stringify(finalObj.finalSemanticAssessment)}`,
    );
    assert.equal(finalObj.finalSemanticAssessment?.meetsMinimumBar, true);
    assert.equal(finalObj.finalSemanticAssessment?.artifactKey, ARTIFACT);
    assert.equal(finalObj.finalSemanticAssessment?.artifactVersion, art!.version);
    void make2Assign;
  } finally {
    installStructuredChatDouble(null);
    if (previousToken === undefined) delete process.env.SOMEBODY_DEMO_OPERATOR_TOKEN;
    else process.env.SOMEBODY_DEMO_OPERATOR_TOKEN = previousToken;
  }
});

/**
 * G — supplied-evidence no-BUY: owned company records already suffice; MAKE
 * delivers without authorizing external acquisition.
 */
test("G supplied-evidence: MAKE completes without BUY when owned evidence suffices", async () => {
  const t = convexTest(schema, modules);
  const key = "obj_prod_chain_g";
  const reqKey = "req_relaunch_g";

  await seedFounderOnly(t, key, {
    request:
      "Our launch messaging isn’t working. Figure out what’s wrong and get a better relaunch ready.",
  });
  // Richer owned evidence — same objective/authority as F; no "no spend" instruction.
  await t.mutation(async (ctx) => {
    const row = await ctx.db
      .query("objectives")
      .withIndex("by_key", (q) => q.eq("key", key))
      .unique();
    assert.ok(row);
    const data = (row as { data: ObjectiveRecord }).data;
    await ctx.db.patch((row as { _id: string })._id as never, {
      data: {
        ...data,
        companyArtifacts: [
          {
            key: ARTIFACT,
            version: 1,
            content:
              "Owned relaunch brief: one-person founders need an accountable system that finishes work. Audience language is already captured in company records.",
            history: [],
          },
        ],
      } as never,
    });
  });
  await interpretDeliverable(t, key, reqKey);
  await invokePass(t, key, "objective_submitted");
  const pending = await pendingDecision(t, key);

  const makeCaps = ["growth_launch_operations", "company_records_lookup"];
  const makeOptionId = optionIdFor({
    requirementKey: reqKey,
    contractRevision: 1,
    kind: "internal",
    target: `internal:${[...makeCaps].sort().join("+")}:new`,
  });

  const make = (await t.mutation(async (ctx) =>
    (applyDecision as unknown as Handler)._handler(ctx, {
      objectiveKey: key,
      requestId: pending.requestId,
      rawStrategyProposal: {
        strategy: "MAKE",
        desiredCapabilities: makeCaps,
        needsExternalResourceClass: null,
        notes: null,
      },
      rawRecommendation: {
        requirementKey: reqKey,
        contractRevision: 1,
        selectedOptionId: makeOptionId,
        rationale: "owned launch context is sufficient; no BUY",
        materialAssumptions: [],
        changeMyMindEvidence: [],
      },
      at: now,
    }),
  )) as { ok: boolean; authorized?: boolean; reason?: string };
  assert.equal(make.ok, true, make.reason);
  assert.equal(make.authorized, true);

  await invokePass(t, key, "decision_applied");
  assert.equal((await readIntents(t, key)).length, 0, "no BUY intent");
  const assignments = await readAssignments(t, key);
  assert.equal(assignments.length, 1);
  const runId = assignments[0]!.runId!;
  const contract = assignments[0]!.workContract as WorkContract;
  assert.deepEqual(contract.inputEvidenceIds ?? [], []);

  let step = 0;
  const modelG: Model = {
    async getResponse() {
      step += 1;
      if (step === 1) {
        return {
          usage: new Usage(),
          output: [
            toolCall(
              "read_company_record",
              { recordRef: "launch/context" },
              "g1",
            ),
          ],
        };
      }
      if (step === 2) {
        const obs = (await t.query(async (ctx) =>
          (readWorkerObservation as unknown as Handler)._handler(ctx, {
            objectiveKey: key,
            runId,
          }),
        )) as {
          recordedFindings: Array<{ text?: string }>;
          loadedInputPackage?: { targetArtifact?: { content?: string } };
        };
        const seen = [
          ...(obs.recordedFindings ?? []).map((f) => String(f.text ?? "")),
          String(obs.loadedInputPackage?.targetArtifact?.content ?? ""),
        ]
          .join(" ")
          .slice(0, 500);
        assert.ok(seen.length > 20, "G worker must observe owned evidence");
        return {
          usage: new Usage(),
          output: [
            toolCall(
              "update_company_artifact",
              {
                content: `Relaunch from owned observation: ${seen.slice(0, 280)}`,
                changeNote: "Owned-evidence relaunch draft",
                usedAcquisitionEvidenceIds: [],
              },
              "g2",
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
              summary: "Relaunch saved from owned company records only",
              fit: "meets bar",
              risks: ["owned context may be incomplete"],
              unknowns: ["external audience language not purchased"],
              recommendedNextAction: "complete",
              terminal: "DELIVERED",
            },
            "g3",
          ),
        ],
      };
    },
    async *getStreamedResponse() {
      throw new Error("unused");
    },
  };

  await t.action(async (ctx) => {
    const port = makeConvexPort(ctx, key, runId, true);
    await runWorker(port, contract, {
      model: modelG,
      serialManagerProtocol: true,
      maxTurns: 5,
    });
  });

  await t.mutation(async (ctx) =>
    (finishRun as unknown as Handler)._handler(ctx, {
      objectiveKey: key,
      runId,
      toolCalls: 3,
    }),
  );

  assert.equal((await readIntents(t, key)).length, 0, "still no BUY");
  const art = (await readObj(t, key)).companyArtifacts?.find((a) => a.key === ARTIFACT);
  assert.ok(art && art.version >= 2);

  installStructuredChatDouble((req) => {
    if (req.kind !== "final_assessment") {
      throw new Error(`unexpected kind ${req.kind}`);
    }
    const parsed = JSON.parse(req.user) as {
      artifact?: { key?: string; version?: number };
    };
    assert.equal(parsed.artifact?.key, ARTIFACT);
    return {
      meetsMinimumBar: true,
      rationale: "Owned evidence suffices; artifact meets relaunch bar without BUY.",
      artifactKey: ARTIFACT,
      artifactVersion: art!.version,
      evidenceRefs: [],
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

  await invokePass(t, key, "final_assessment_applied");
  const finalObj = await readObj(t, key);
  assert.equal(finalObj.state, "completed");
  assert.equal(finalObj.finalSemanticAssessment?.meetsMinimumBar, true);
  assert.equal((await readIntents(t, key)).length, 0);
});
