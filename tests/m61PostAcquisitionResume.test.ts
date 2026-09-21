// M6.1 — post-acquisition resume after STOP B / verified external result.
//
// Starting state (physical stall):
//   - active Requirement, strategy cleared after INPUT_BLOCKED HYBRID failure
//   - validated scoped ResourceNeed still "active"
//   - external intent verified + acquisition result persisted
//   - no internal worker running
//   - no-progress may already be near the ceiling from prior timeout polls
//
// Expected on a normal verification_result wake:
//   - material progress resets the no-progress counter
//   - ResourceNeed becomes fulfilled (scoped coverage)
//   - reducer does NOT trap forever on verify_requirement
//   - next legitimate decide/dispatch of internal work is reserved
//
// Negative twin: wrong requirement / stale revision / unverified / wrong class
// must leave coverage missing and must not unlock decide via fingerprint change.

import test, { mock, after as afterAll } from "node:test";
import assert from "node:assert/strict";
import { convexTest } from "convex-test";
import schema from "../convex/schema";
import {
  putContract,
  putRequirement,
  initBudget,
  putAssignment,
  putIntent,
} from "../convex/internal/workforce";
import { runManagementPass } from "../convex/management";
import { buildOutcomeContract } from "../lib/management/contract";
import {
  reduceManagementState,
  type ReducerFacts,
} from "../lib/management/reducer";
import {
  computeDecisionInputFingerprint,
  validatedMissingClassesAfterAcquisitions,
  verifiedAcquisitionCoversNeed,
} from "../lib/objective/inputDiagnosis";
import { createResourceNeed } from "../lib/objective/resourceNeed";
import type { ResourceNeed } from "../lib/objective/resourceNeed";
import type { ExternalAcquisitionResult } from "../lib/objective/types";
import { createWorkContract, createWorkerSpec } from "../lib/workforce";
import type {
  Assignment,
  ExecutionIntent,
  OutcomeContract,
  Requirement,
  WakeEvent,
} from "../lib/management/types";
import type { ObjectiveRecord } from "../lib/objective/types";
import { CP2_REQUIREMENT_FIELDS } from "./helpers/cp2Requirement";

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

const now = 1_974_000_000_000;
const REQ = "req_01";

type Backend = ReturnType<typeof convexTest>;
type Handler = { _handler: (c: unknown, a: Record<string, unknown>) => Promise<unknown> };

function contractFor(key: string): OutcomeContract {
  const built = buildOutcomeContract({
    objectiveKey: key,
    contractId: `contract_${key}`,
    revision: 1,
    parsed: {
      intent: "gather messaging evidence then relaunch",
      levels: [
        {
          levelKey: "evidence",
          order: 1,
          statement: "current messaging evidence is decision-ready",
          label: "Evidence",
        },
      ],
      minimumCompletionBar: "evidence",
      ambiguities: [],
    },
    requestId: "postacq",
    founderResolvedQuestions: [],
    at: now,
  });
  assert.ok(built.ok);
  if (!built.ok) throw new Error("contract");
  return built.contract;
}

function requirementFor(key: string, contract: OutcomeContract): Requirement {
  return {
    requirementKey: REQ,
    objectiveKey: key,
    contractId: contract.contractId,
    contractRevision: 1,
    priority: "required",
    title: "Current messaging evidence is decision-ready",
    mustBeTrue: "sufficient accepted evidence is on record",
    scope: "owned then external if needed",
    ...CP2_REQUIREMENT_FIELDS,
    dependsOnRequirementKeys: [],
    requiredResourceClasses: ["proprietary_data"],
    expectedOutput: "accepted evidence",
    proofs: [
      {
        proofKey: "artifact_v2",
        description: "Launch message artifact advanced after acquisition-backed work",
        proofKind: "company_artifact_version",
        params: { artifactKey: "launch/page-message", minVersion: 2 },
      },
    ],
    state: "active",
    strategy: null,
    resolution: null,
    blockedReason: null,
    waiver: null,
    revision: 1,
    createdAt: now,
    updatedAt: now,
  };
}

function needFor(key: string): ResourceNeed {
  return createResourceNeed({
    id: `need_${key}`,
    objectiveKey: key,
    workItemId: "wi:asg_failed",
    requirementKey: REQ,
    resourceClass: "proprietary_data",
    purpose: "Obtain current-launch evidence",
    reasonOwnedInsufficient: "owned catalog insufficient",
    proposedByRunId: "run_prior",
    at: now - 10_000,
    status: "active",
    contractRevision: 1,
    inputCheckId: "evidence_sufficiency",
    supportingEvidenceIds: ["ev_gap"],
    validationAuthority: "application",
  });
}

function acquisitionFor(
  key: string,
  overrides: Partial<ExternalAcquisitionResult> = {},
): ExternalAcquisitionResult {
  return {
    intentId: `int_${key}`,
    requirementKey: REQ,
    contractRevision: 1,
    resultEvidenceId: `sim_result_${key}`,
    provenance: "simulation",
    providerId: "2135",
    serviceId: "newsliquid_twitter_search",
    offeringId: "2135:newsliquid_twitter_search",
    resourceClass: "proprietary_data",
    content: "SIMULATED proprietary social evidence",
    responseHash: "abc",
    recordedAt: now,
    verifiedAt: now,
    needDedupeKey: needFor(key).dedupeKey,
    ...overrides,
  };
}

function verifiedIntent(key: string): ExecutionIntent {
  return {
    intentId: `int_${key}`,
    idempotencyKey: `idem_${key}`,
    objectiveKey: key,
    requirementKey: REQ,
    contractRevision: 1,
    decisionId: `dec_${key}_req_01_r1_a2`,
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
      priceUsd: 2,
      priceProvenance: "provider_quote",
      requiresApproval: true,
      approvalId: `grant_${key}`,
    },
    state: "verified",
    attempts: 1,
    lastEventId: "evt_v",
    resultEvidenceId: `sim_result_${key}`,
    verificationEvidenceId: `sim_verification_${key}`,
    boundaryNote: "verified simulation",
    createdAt: now - 5_000,
    updatedAt: now,
  };
}

function failedAssignment(key: string): Assignment {
  const assignmentId = `asg_${key}_hybrid`;
  const workContract = createWorkContract({
    assignment: "Bounded HYBRID internal attempt",
    idempotencyScope: `${key}:${REQ}:r1:${assignmentId}`,
    worker: createWorkerSpec([
      "public_information_research",
      "company_records_lookup",
      "growth_launch_operations",
    ]),
    sourceProofs: [{ sourceClass: "company_record", minDistinctSources: 1 }],
  });
  return {
    assignmentId,
    objectiveKey: key,
    requirementKey: REQ,
    contractRevision: 1,
    decisionId: `dec_${key}_req_01_r1_a2`,
    workerKey: workContract.workerKey,
    kind: "internal_component_of_hybrid",
    state: "failed",
    attempt: 1,
    runId: `run_${key}`,
    workContract,
    resultSummary: "run ended waiting_for_resource; worker released for management redecision",
    idempotencyScope: workContract.idempotencyScope,
    createdAt: now - 5_000,
    updatedAt: now - 4_000,
  };
}

async function seedPostAcquisition(
  t: Backend,
  key: string,
  opts: {
    acquisition?: ExternalAcquisitionResult;
    noProgressCycles?: number;
    skipWake?: boolean;
  } = {},
): Promise<void> {
  const contract = contractFor(key);
  const requirement = requirementFor(key, contract);
  const need = needFor(key);
  const acquisition = opts.acquisition ?? acquisitionFor(key);
  const intent = verifiedIntent(key);
  const assignment = failedAssignment(key);

  await t.run(async (ctx) => {
    await ctx.db.insert("objectives", {
      key,
      data: {
        key,
        request: "fix messaging",
        createdAt: now - 20_000,
        updatedAt: now,
        state: "waiting_for_resource",
        activity: "INPUT_BLOCKED — validated input gap; worker yielded; no payment created.",
        plan: null,
        workItems: [],
        run: null,
        result: null,
        companyArtifacts: [
          {
            key: "launch/page-message",
            version: 1,
            content: "seed",
            history: [],
          },
        ],
        resourceNeeds: [need],
        acquisitionResults: [acquisition],
        lastDeliveryFailureClass: "INPUT_BLOCKED",
        management: {
          contractId: contract.contractId,
          interpretationStatus: "done",
          currentContractRevision: 1,
          decisionAttempts: { [REQ]: 2 },
          pendingDecision: null,
          decisionInputFingerprints: {
            [REQ]: computeDecisionInputFingerprint({
              requirementKey: REQ,
              contractRevision: 1,
              requiredResourceClasses: ["proprietary_data"],
              validatedMissingClasses: ["proprietary_data"],
              prerequisiteStates: [],
              eligibleOfferingIds: [],
              spendAuthorityUsd: null,
              budgetRemainingUsd: null,
            }),
          },
          controlNotes: [],
        },
      } as ObjectiveRecord & { management: Record<string, unknown> },
    });
  });

  await t.run(async (ctx) => {
    await (putContract as unknown as Handler)._handler(ctx, {
      objectiveKey: key,
      contractId: contract.contractId,
      revision: 1,
      data: contract,
    });
    await (putRequirement as unknown as Handler)._handler(ctx, {
      objectiveKey: key,
      requirementKey: REQ,
      data: requirement,
      currentContractRevision: 1,
    });
    await (initBudget as unknown as Handler)._handler(ctx, {
      objectiveKey: key,
      at: now - 20_000,
    });
    await (putAssignment as unknown as Handler)._handler(ctx, {
      assignmentId: assignment.assignmentId,
      objectiveKey: key,
      data: assignment,
    });
    await (putIntent as unknown as Handler)._handler(ctx, {
      intentId: intent.intentId,
      objectiveKey: key,
      idempotencyKey: intent.idempotencyKey,
      data: intent,
    });
  });

  if ((opts.noProgressCycles ?? 0) > 0) {
    await t.run(async (ctx) => {
      const row = await ctx.db
        .query("objectiveBudgets")
        .withIndex("by_objectiveKey", (q) => q.eq("objectiveKey", key))
        .unique();
      assert.ok(row);
      const data = (row as { data: { used: { noProgressCycles: number }; limits: unknown; lastProgressAt: number; objectiveKey: string } }).data;
      await ctx.db.patch(row._id, {
        data: {
          ...data,
          used: { ...data.used, noProgressCycles: opts.noProgressCycles },
        },
      });
    });
  }

  if (!opts.skipWake) {
    const wake: WakeEvent = {
      eventId: `wake_verify_${key}`,
      objectiveKey: key,
      reason: "verification_result",
      refKind: "intent",
      refId: intent.intentId,
      summary: "verified external acquisition",
      at: now,
      consumedAt: null,
    };
    await t.run(async (ctx) => {
      await ctx.db.insert("wakeEvents", {
        eventId: wake.eventId,
        objectiveKey: key,
        dedupeKey: `intent:${intent.intentId}:resume_test`,
        data: wake,
      });
    });
  }
}

async function invokePass(t: Backend, key: string, reason = "verification_result") {
  return (await t.mutation(async (ctx) =>
    (runManagementPass as unknown as Handler)._handler(ctx, {
      objectiveKey: key,
      reason,
    }),
  )) as { objectiveState: string; summary: string; acted: boolean };
}

// ── Coverage helpers ─────────────────────────────────────────────────────────

test("coverage: matching verified acquisition covers the scoped need", () => {
  const need = needFor("cov");
  const ok = acquisitionFor("cov");
  assert.equal(verifiedAcquisitionCoversNeed(need, ok), true);
  assert.deepEqual(
    validatedMissingClassesAfterAcquisitions([need], REQ, [ok]),
    [],
  );
});

test("coverage negative twin: wrong requirement / revision / class / unverified", () => {
  const need = needFor("neg");
  const base = acquisitionFor("neg");
  assert.equal(
    verifiedAcquisitionCoversNeed(need, { ...base, requirementKey: "req_other" }),
    false,
  );
  assert.equal(
    verifiedAcquisitionCoversNeed(need, { ...base, contractRevision: 99 }),
    false,
  );
  assert.equal(
    verifiedAcquisitionCoversNeed(need, { ...base, resourceClass: "compute" }),
    false,
  );
  assert.equal(
    verifiedAcquisitionCoversNeed(need, { ...base, verifiedAt: null as unknown as number }),
    false,
  );
  assert.deepEqual(
    validatedMissingClassesAfterAcquisitions(
      [need],
      REQ,
      [{ ...base, requirementKey: "req_other" }],
    ),
    ["proprietary_data"],
  );
});

// ── Reducer: verified must not trap redecision ───────────────────────────────

test("reducer: verified intent + cleared strategy routes to decide, not verify forever", () => {
  const contract = contractFor("obj_red");
  const requirement = requirementFor("obj_red", contract);
  const intent = verifiedIntent("obj_red");
  const facts: ReducerFacts = {
    contract,
    currentContractRevision: 1,
    requirements: [requirement],
    groundedByRequirement: new Map(),
    assignments: [failedAssignment("obj_red")],
    intents: [intent],
    budgetVerdict: { ok: true },
    pendingApproval: null,
    completionProposal: null,
    at: now,
  };
  const r = reduceManagementState(facts);
  assert.equal(r.action.kind, "decide_requirement");
  assert.equal(
    (r.action as { requirementKey: string }).requirementKey,
    REQ,
  );
});

test("reducer: verified BUY with strategy bound still routes to verify_requirement", () => {
  const contract = contractFor("obj_buy");
  const requirement = {
    ...requirementFor("obj_buy", contract),
    strategy: "BUY" as const,
  };
  const intent = { ...verifiedIntent("obj_buy"), strategy: "BUY" as const };
  const r = reduceManagementState({
    contract,
    currentContractRevision: 1,
    requirements: [requirement],
    groundedByRequirement: new Map(),
    assignments: [],
    intents: [intent],
    budgetVerdict: { ok: true },
    pendingApproval: null,
    completionProposal: null,
    at: now,
  });
  assert.deepEqual(r.action, { kind: "verify_requirement", requirementKey: REQ });
});

// ── Physical convex pass ─────────────────────────────────────────────────────

test("post-acquisition resume: verification wake fulfills need and reserves decide", async () => {
  const key = "obj_postacq_resume";
  const t = convexTest(schema, modules);
  await seedPostAcquisition(t, key, { noProgressCycles: 3 });

  const outcome = await invokePass(t, key);
  assert.notEqual(
    outcome.objectiveState,
    "escalated",
    `material wake must not escalate: ${outcome.summary}`,
  );
  assert.match(
    outcome.summary,
    /grounded decision pass needed|decide|dispatch/i,
    `expected decide/dispatch path, got: ${outcome.summary}`,
  );

  const after = await t.run(async (ctx) => {
    const row = await ctx.db
      .query("objectives")
      .withIndex("by_key", (q) => q.eq("key", key))
      .unique();
    const data = (row as { data: ObjectiveRecord & { management: Record<string, unknown> } }).data;
    const budget = await ctx.db
      .query("objectiveBudgets")
      .withIndex("by_objectiveKey", (q) => q.eq("objectiveKey", key))
      .unique();
    return {
      needs: data.resourceNeeds ?? [],
      management: data.management,
      noProgress: (budget as { data: { used: { noProgressCycles: number } } } | null)?.data
        .used.noProgressCycles,
    };
  });

  assert.equal(after.needs[0]?.status, "fulfilled", "matching need must be fulfilled");
  assert.equal(after.noProgress, 0, "material verification wake resets no-progress");
  const attempts = after.management.decisionAttempts as Record<string, number>;
  assert.equal(attempts[REQ], 3, "third strategic decision reserved after coverage change");
  assert.ok(after.management.pendingDecision, "pendingDecision reserved for resume");
});

test("post-acquisition negative twin: wrong-scoped acquisition does not unlock", async () => {
  const key = "obj_postacq_neg";
  const t = convexTest(schema, modules);
  await seedPostAcquisition(t, key, {
    acquisition: acquisitionFor(key, { requirementKey: "req_other" }),
    noProgressCycles: 0,
  });

  const outcome = await invokePass(t, key);
  // May verify (fails) or await — must NOT mint attempt 3 from coverage change.
  const after = await t.run(async (ctx) => {
    const row = await ctx.db
      .query("objectives")
      .withIndex("by_key", (q) => q.eq("key", key))
      .unique();
    const data = (row as { data: ObjectiveRecord & { management: Record<string, unknown> } }).data;
    return {
      needs: data.resourceNeeds ?? [],
      attempts: (data.management.decisionAttempts as Record<string, number>)[REQ],
      pending: data.management.pendingDecision,
      summary: outcome.summary,
    };
  });
  assert.equal(after.needs[0]?.status, "active", "wrong-scoped acquisition must not fulfill");
  assert.equal(after.attempts, 2, "fingerprint unchanged → no new decision");
  assert.equal(after.pending, null);
});

test("no-progress: first material acquisition wake resets; later idle pass may increment", async () => {
  const key = "obj_postacq_np";
  const t = convexTest(schema, modules);
  await seedPostAcquisition(t, key, { noProgressCycles: 2 });

  await invokePass(t, key);
  const afterMaterial = await t.run(async (ctx) => {
    const budget = await ctx.db
      .query("objectiveBudgets")
      .withIndex("by_objectiveKey", (q) => q.eq("objectiveKey", key))
      .unique();
    return (budget as { data: { used: { noProgressCycles: number } } }).data.used
      .noProgressCycles;
  });
  assert.equal(afterMaterial, 0, "first verification wake is material progress");

  // Idle self-wake with nothing new to do (pending already reserved or decide deferred).
  const idleWake: WakeEvent = {
    eventId: `wake_timeout_${key}`,
    objectiveKey: key,
    reason: "timeout",
    refKind: "objective",
    refId: key,
    summary: "idle recheck",
    at: now + 1,
    consumedAt: null,
  };
  await t.run(async (ctx) => {
    await ctx.db.insert("wakeEvents", {
      eventId: idleWake.eventId,
      objectiveKey: key,
      dedupeKey: `timeout:${key}:1`,
      data: idleWake,
    });
  });
  await invokePass(t, key, "timeout");
  const afterIdle = await t.run(async (ctx) => {
    const budget = await ctx.db
      .query("objectiveBudgets")
      .withIndex("by_objectiveKey", (q) => q.eq("objectiveKey", key))
      .unique();
    return (budget as { data: { used: { noProgressCycles: number } } }).data.used
      .noProgressCycles;
  });
  // Guard still live: an idle timeout pass may increment (0 or 1 depending on
  // whether the prior pass left pending work that counts as progress).
  assert.ok(afterIdle >= 0);
  assert.ok(afterIdle <= 1, `idle pass must not jump the ceiling; got ${afterIdle}`);
});
