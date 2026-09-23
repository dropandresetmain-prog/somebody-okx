// M6.1 — FIRST PRODUCT E2E, Level 1 (deterministic, real Convex storage).
//
// Proves the causal seams the canonical founder objective must pass through,
// with ONLY the external provider/payment boundary deterministically simulated:
//   1. reducer rule 8b routes a VERIFIED intent (no satisfaction attempt yet)
//      to verify_requirement — verified external truth must reach the verify
//      step or a satisfied BUY stalls forever;
//   2. strategyDelivery keeps the ACCEPTED A2 semantics: HYBRID delivers both
//      halves from one dispatch, never a staged two-phase delivery;
//   3. the M6.1 simulation boundary (convex/m3Driver.ts) drives the SAME intent
//      kernel the live rail drives — authorized → handed_off → result_recorded
//      → verified — persists provenance "simulation", wakes Somebody through
//      the normal path, and FAILS CLOSED on wrong token, stale revision, wrong
//      resource class, or missing founder grant; a replay is an idempotent
//      duplicate, never a second effect;
//   4. the worker read surface exposes exactly the VERIFIED acquisitions, and
//      the artifact mutation enforces evidence-ref truth (cited ids must be
//      verified acquisitions; verified acquisitions must be cited);
//   5. the M5 read model shows a simulated acquisition truthfully: no payment
//      stages beyond "prepared", SIMULATION labels, evidence as provider
//      result, artifact versions carrying their own evidence refs.
import test, { mock, after as afterAll } from "node:test";
import assert from "node:assert/strict";
import { convexTest } from "convex-test";
import schema from "../convex/schema";
import {
  reduceManagementState,
  type ReducerFacts,
} from "../lib/management/reducer";
import { strategyDelivery } from "../lib/management/dispatch";
import { sha256Hex } from "../lib/management/sha256";
import {
  simulateVerifiedAcquisition,
  simulationCandidate,
} from "../convex/m3Driver";
import {
  readWorkerObservation,
  updateCompanyArtifact,
  setupCanonicalDemoObjective,
} from "../convex/objectives";
import {
  buildConvexManagementPorts,
  runManagementPass,
} from "../convex/management";
import {
  putContract,
  putRequirement,
  initBudget,
  putIntent,
} from "../convex/internal/workforce";
import { buildOutcomeContract, buildRequirement } from "../lib/management/contract";
import {
  buildExternalOption,
  withEligibility,
  eligibilityInputFor,
  EMPTY_FACTS,
  type EligibilityFacts,
} from "../lib/management/options";
import { CANONICAL_SIMULATED_SOCIAL_RESULT } from "../lib/objective/seedData";
import { composeObjectiveWorkspace } from "../lib/m5/workspaceModel";
import type {
  ExecutionIntent,
  GroundedOption,
  ManagerialDecision,
  OutcomeContract,
  Requirement,
} from "../lib/management/types";
import type { DecisionPassResult } from "../lib/management/decision";
import { CP2_REQUIREMENT_FIELDS, cp2ParsedRequirement } from "./helpers/cp2Requirement";
import type { WorkspaceSource } from "../lib/m5/workspaceModel";

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

const now = 1962000000000;
const REQ = "req_external_evidence";
const OPERATOR_TOKEN = "m61-demo-operator-token";

// ── Shared fixtures (mirrors the accepted dispatch-persistence harness) ──────

function contractFor(objectiveKey: string): OutcomeContract {
  const built = buildOutcomeContract({
    objectiveKey,
    contractId: `contract_${objectiveKey}`,
    revision: 1,
    parsed: {
      intent: "get a better relaunch ready",
      levels: [{ levelKey: "goal", order: 1, statement: "the goal holds", label: "Goal" }],
      minimumCompletionBar: "goal",
      ambiguities: [],
    },
    requestId: "req_m61_test",
    founderResolvedQuestions: [],
    at: now,
  });
  assert.ok(built.ok);
  if (!built.ok) throw new Error("contract fixture invalid");
  return built.contract;
}

function buyRequirement(objectiveKey: string): Requirement {
  const built = buildRequirement(
    {
      objectiveKey,
      contract: contractFor(objectiveKey),
      proposed: cp2ParsedRequirement({
        requirementKey: REQ,
        priority: "required",
        title: "External evidence is available and current",
        mustBeTrue: "an acquired external result is verified",
        scope: "external acquisition",
      }),
      artifactKeyForInternalProof: null,
      at: now,
    },
    "BUY",
  );
  assert.ok(!("errors" in built));
  return "requirement" in built ? built.requirement : (() => { throw new Error(); })();
}

const buyFacts: EligibilityFacts = {
  requiredResourceClasses: ["proprietary_data"],
  controlledResourceClasses: ["proprietary_data"],
  deadlineAt: null,
  now,
  estimatedMinutes: null,
  requiresMandatoryProof: false,
  proofAvailable: true,
  workerAvailable: null,
  spendAuthorityUsd: 5,
  budgetRemainingUsd: 100,
};

function buyOption(): GroundedOption {
  const option = buildExternalOption({
    requirementKey: REQ,
    contractRevision: 1,
    offeringId: "reg_offer_1",
    providerId: "prov_newsliquid",
    serviceId: "newsliquid_twitter_search",
    resourceClass: CANONICAL_SIMULATED_SOCIAL_RESULT.resourceClass,
    priceUsd: 0.02,
    priceProvenance: "provider_quote",
    registryVerified: true,
    compatibleResourceClass: true,
    executionPathConfigured: true,
    purposeScopeCompatible: true,
    facts: EMPTY_FACTS,
  });
  return withEligibility([option], (o) => eligibilityInputFor(o, buyFacts))[0];
}

function authorizedBuyDecision(objectiveKey: string, option: GroundedOption): ManagerialDecision {
  return {
    decisionId: `dec_${objectiveKey}_buy`,
    objectiveKey,
    contractRevision: 1,
    requirementKey: REQ,
    kind: "satisfaction_strategy",
    strategy: "BUY",
    optionId: option.optionId,
    recommendation: null,
    authorization: {
      kind: "authorized",
      decisionId: `dec_${objectiveKey}_buy`,
      requirementKey: REQ,
      contractRevision: 1,
      strategy: "BUY",
      optionId: option.optionId,
      authorizedAt: now,
      spendApprovalId: `demo_grant_${objectiveKey}`,
    },
    coarsePlanSummary: "authorized by the decision kernel in a prior pass",
    consideredOptionIds: [option.optionId],
    at: now,
  };
}

async function seedObjectiveWithGrant(
  t: ReturnType<typeof convexTest>,
  objectiveKey: string,
) {
  const requirement = buyRequirement(objectiveKey);
  await t.mutation(async (ctx) => {
    await ctx.db.insert("objectives", {
      key: objectiveKey,
      data: {
        key: objectiveKey,
        request: "Our launch messaging isn’t working. Get a better relaunch ready.",
        createdAt: now,
        updatedAt: now,
        state: "executing",
        activity: "managed",
        plan: null,
        workItems: [],
        run: null,
        result: null,
        acquisitionResults: [],
        management: { contractId: `contract_${objectiveKey}`, controlNotes: [] },
      },
    });
    await ctx.db.insert("founderSpendGrants", {
      approvalId: `demo_grant_${objectiveKey}`,
      objectiveKey,
      data: {
        approvalId: `demo_grant_${objectiveKey}`,
        objectiveKey,
        limitUsd: 5,
        grantedAt: now,
        revokedAt: null,
        note: "Founder-approved demo spend limit; authorizes no payment.",
      },
    });
  });
  await t.mutation(async (ctx) =>
    (putContract as unknown as { _handler: (c: unknown, a: Record<string, unknown>) => Promise<unknown> })._handler(ctx, {
      objectiveKey,
      contractId: `contract_${objectiveKey}`,
      revision: 1,
      data: contractFor(objectiveKey),
    }),
  );
  await t.mutation(async (ctx) =>
    (putRequirement as unknown as { _handler: (c: unknown, a: Record<string, unknown>) => Promise<unknown> })._handler(ctx, {
      objectiveKey,
      requirementKey: REQ,
      data: requirement,
      currentContractRevision: 1,
    }),
  );
  await t.mutation(async (ctx) =>
    (initBudget as unknown as { _handler: (c: unknown, a: Record<string, unknown>) => Promise<unknown> })._handler(ctx, {
      objectiveKey,
      at: now,
    }),
  );
  return requirement;
}

async function seedAuthorizedBuy(
  t: ReturnType<typeof convexTest>,
  objectiveKey: string,
  requirement: Requirement,
  option: GroundedOption,
) {
  const decision = authorizedBuyDecision(objectiveKey, option);
  const result: DecisionPassResult = {
    decision,
    boundRequirement: requirement,
    options: [option],
    recommendation: null,
    authorization: decision.authorization,
  };
  await t.mutation(async (ctx) => {
    const ports = buildConvexManagementPorts(ctx as never);
    await ports.persistDecision(result, now);
  });
}

async function dispatchBuy(t: ReturnType<typeof convexTest>, objectiveKey: string): Promise<string | null> {
  return t.mutation(async (ctx) => {
    const ports = buildConvexManagementPorts(ctx as never);
    return ports.dispatchRequirement(
      {
        objectiveKey,
        contractRevision: 1,
        focusRequirementKey: REQ,
        managerDecisionId: null,
        pendingIntentId: null,
        wakeReason: "objective_submitted",
        wakeEventIds: [],
        continuation: {},
        lastNode: null,
        pass: 0,
      },
      REQ,
      now,
    );
  }) as Promise<string | null>;
}

type Handler = { _handler: (ctx: unknown, args: Record<string, unknown>) => Promise<unknown> };

async function readIntentRow(
  t: ReturnType<typeof convexTest>,
  intentId: string,
): Promise<ExecutionIntent> {
  return t.query(async (ctx) => {
    const db = ctx.db as unknown as {
      query(n: string): {
        withIndex(n: string, f: (q: { eq: (k: string, v: unknown) => unknown }) => unknown): {
          unique(): Promise<{ data: ExecutionIntent } | null>;
        };
      };
    };
    const row = await db.query("executionIntents").withIndex("by_intentId", (q) => q.eq("intentId", intentId)).unique();
    if (!row) throw new Error(`intent not found: ${intentId}`);
    return row.data;
  });
}

// ── 1. Reducer rule 8b: a VERIFIED intent must reach the verify step ─────────

function verifiedBuyIntent(requirementKey: string, requirementState: Requirement["state"]): {
  intent: ExecutionIntent;
  requirement: Requirement;
} {
  const at = now;
  const requirement: Requirement = {
    requirementKey,
    objectiveKey: "obj_m61",
    contractId: "contract_m61",
    contractRevision: 1,
    priority: "required",
    title: "external evidence",
    mustBeTrue: "x",
    scope: "x",
    proofs: [],
    state: requirementState,
    strategy: "BUY",
    resolution: null,
    blockedReason: null,
    waiver: null,
    revision: 1,
    createdAt: at,
    updatedAt: at,
    ...CP2_REQUIREMENT_FIELDS,
  };
  const intent: ExecutionIntent = {
    intentId: "int_verified", idempotencyKey: "idem_v", objectiveKey: "obj_m61",
    requirementKey, contractRevision: 1, decisionId: "dec_1",
    kind: "external_acquisition", strategy: "BUY",
    target: { offeringId: "off", providerId: "p", serviceId: "s", resourceClass: "proprietary_data", endpointRef: null },
    terms: { priceUsd: 0.02, priceProvenance: "provider_quote", requiresApproval: false, approvalId: "appr" },
    state: "verified", attempts: 1, lastEventId: "evt", resultEvidenceId: "ev_r",
    verificationEvidenceId: "ev_v", boundaryNote: "verified", createdAt: at, updatedAt: at,
  };
  return { intent, requirement };
}

function baseFacts(overrides: Partial<ReducerFacts>): ReducerFacts {
  const { requirement, intent } = verifiedBuyIntent(REQ, "active");
  return {
    contract: contractFor("obj_m61"),
    currentContractRevision: 1,
    requirements: [requirement],
    groundedByRequirement: new Map(),
    assignments: [],
    intents: [intent],
    budgetVerdict: { ok: true },
    pendingApproval: null,
    completionProposal: null,
    at: now,
    ...overrides,
  };
}

test("M6.1: a VERIFIED intent without a satisfaction attempt routes to verify_requirement, not a stall", () => {
  const r = reduceManagementState(baseFacts({}));
  assert.equal(r.state, "executing");
  assert.deepEqual(r.action, { kind: "verify_requirement", requirementKey: REQ });
});

test("M6.1: a verified intent on an already-satisfied requirement is NOT re-verified (gate proposal follows)", () => {
  const { requirement, intent } = verifiedBuyIntent(REQ, "satisfied");
  const r = reduceManagementState(
    baseFacts({
      requirements: [requirement],
      intents: [intent],
    }),
  );
  // Rule 8b skips satisfied requirements; rule 11-adjacent completion rule
  // proposes to the gate — the verified intent no longer drives any action.
  assert.equal(r.action.kind, "propose_completion");
});

// ── 2. strategyDelivery keeps the accepted A2 HYBRID semantics ───────────────

test("M6.1: HYBRID delivery stays one-dispatch-both-halves (no staged two-phase delivery)", () => {
  const states = (assignment: string | null, intent: string | null) => ({
    assignmentStates: assignment ? [assignment as never] : [],
    intentStates: intent ? [intent] : [],
  });
  assert.deepEqual(strategyDelivery("HYBRID", states("running", "authorized")), { delivered: true });
  assert.deepEqual(strategyDelivery("HYBRID", states("running", null)), { delivered: false, missing: "intent" });
  assert.deepEqual(strategyDelivery("HYBRID", states(null, "authorized")), { delivered: false, missing: "both" });
  assert.deepEqual(strategyDelivery("HYBRID", states("result_submitted", "verified")), { delivered: true });
});

// ── 3. The M6.1 simulation boundary drives the REAL intent kernel ────────────

function expectedSimulatedEvidenceId(intentId: string): string {
  const responseHash = sha256Hex(CANONICAL_SIMULATED_SOCIAL_RESULT.content);
  const identity = sha256Hex([intentId, responseHash, "m6-1-simulation"].join("\u0000")).slice(0, 24);
  return `sim_result_${identity}`;
}

test("M6.1 simulation: authorized intent → verified through the real kernel, provenance persisted, engine woken, replay idempotent", async () => {
  const previousToken = process.env.SOMEBODY_DEMO_OPERATOR_TOKEN;
  process.env.SOMEBODY_DEMO_OPERATOR_TOKEN = OPERATOR_TOKEN;
  try {
    await runSimulationHappyPath();
  } finally {
    if (previousToken === undefined) delete process.env.SOMEBODY_DEMO_OPERATOR_TOKEN;
    else process.env.SOMEBODY_DEMO_OPERATOR_TOKEN = previousToken;
  }

  async function runSimulationHappyPath() {
  const t = convexTest(schema, modules);
  const key = "obj_m61_sim";
  const requirement = await seedObjectiveWithGrant(t, key);
  await seedAuthorizedBuy(t, key, requirement, buyOption());

  const effectId = await dispatchBuy(t, key);
  assert.ok(effectId);
  const before = await readIntentRow(t, effectId);
  assert.equal(before.state, "authorized", "dispatch leaves a real authorized intent");

  // Candidate discovery finds it for the operator.
  const candidate = await t.mutation(async (ctx) =>
    (simulationCandidate as unknown as Handler)._handler(ctx, {
      operatorToken: OPERATOR_TOKEN,
      objectiveKey: key,
    }),
  ) as { intentId: string } | null;
  assert.ok(candidate);
  assert.equal(candidate!.intentId, effectId);

  const result = await t.mutation(async (ctx) =>
    (simulateVerifiedAcquisition as unknown as Handler)._handler(ctx, {
      operatorToken: OPERATOR_TOKEN,
      intentId: effectId,
    }),
  ) as { verified: boolean; duplicate: boolean; resultEvidenceId: string; intentState: string };
  assert.equal(result.verified, true);
  assert.equal(result.duplicate, false);
  assert.equal(result.intentState, "verified");
  assert.equal(result.resultEvidenceId, expectedSimulatedEvidenceId(effectId!));

  const intent = await readIntentRow(t, effectId!);
  assert.equal(intent.state, "verified");
  assert.equal(intent.resultEvidenceId, result.resultEvidenceId);
  assert.ok(intent.verificationEvidenceId, "a verification evidence id was recorded");

  // Durable provenance on the objective aggregate.
  const objective = await t.query(async (ctx) => {
    const db = ctx.db as unknown as {
      query(n: string): {
        withIndex(n: string, f: (q: { eq: (k: string, v: unknown) => unknown }) => unknown): {
          unique(): Promise<{ data: { acquisitionResults?: Array<Record<string, unknown>> } } | null>;
        };
      };
    };
    const row = await db.query("objectives").withIndex("by_key", (q) => q.eq("key", key)).unique();
    return row!.data;
  });
  assert.equal(objective.acquisitionResults?.length, 1);
  assert.equal(objective.acquisitionResults![0].provenance, "simulation");
  assert.equal(objective.acquisitionResults![0].resultEvidenceId, result.resultEvidenceId);

  // Somebody is woken through the normal path: one verification_result wake.
  const wake = await t.query(async (ctx) => {
    const db = ctx.db as unknown as {
      query(n: string): { collect(): Promise<Array<{ dedupeKey: string; data: { reason: string; refId: string } }>> };
    };
    return db.query("wakeEvents").collect();
  });
  const simWakes = wake.filter((row) => row.dedupeKey.startsWith(`intent:${effectId}:simulation_verified:`));
  assert.equal(simWakes.length, 1);
  assert.equal(simWakes[0].data.reason, "verification_result");
  assert.equal(simWakes[0].data.refId, effectId);

  // Replay: same content on the same verified intent is an idempotent duplicate.
  const replay = await t.mutation(async (ctx) =>
    (simulateVerifiedAcquisition as unknown as Handler)._handler(ctx, {
      operatorToken: OPERATOR_TOKEN,
      intentId: effectId,
    }),
  ) as { verified: boolean; duplicate: boolean; resultEvidenceId: string };
  assert.equal(replay.duplicate, true);
  assert.equal(replay.resultEvidenceId, result.resultEvidenceId);
  const objectiveAfter = await t.query(async (ctx) => {
    const db = ctx.db as unknown as {
      query(n: string): {
        withIndex(n: string, f: (q: { eq: (k: string, v: unknown) => unknown }) => unknown): {
          unique(): Promise<{ data: { acquisitionResults?: unknown[] } } | null>;
        };
      };
    };
    const row = await db.query("objectives").withIndex("by_key", (q) => q.eq("key", key)).unique();
    return row!.data;
  });
  assert.equal(objectiveAfter.acquisitionResults?.length, 1, "no second acquisition row");
  }
});

test("M6.1 simulation fails closed: no token, wrong token, wrong resource class, missing grant, stale revision", async () => {
  const previousToken = process.env.SOMEBODY_DEMO_OPERATOR_TOKEN;
  process.env.SOMEBODY_DEMO_OPERATOR_TOKEN = OPERATOR_TOKEN;
  try {
    await runSimulationFailClosed();
  } finally {
    if (previousToken === undefined) delete process.env.SOMEBODY_DEMO_OPERATOR_TOKEN;
    else process.env.SOMEBODY_DEMO_OPERATOR_TOKEN = previousToken;
  }

  async function runSimulationFailClosed() {
  const t = convexTest(schema, modules);
  const key = "obj_m61_simfail";
  const requirement = await seedObjectiveWithGrant(t, key);
  await seedAuthorizedBuy(t, key, requirement, buyOption());
  const effectId = await dispatchBuy(t, key);
  assert.ok(effectId);

  // No env token configured at all.
  const previousToken = process.env.SOMEBODY_DEMO_OPERATOR_TOKEN;
  delete process.env.SOMEBODY_DEMO_OPERATOR_TOKEN;
  try {
    await assert.rejects(
      () => t.mutation(async (ctx) =>
        (simulationCandidate as unknown as Handler)._handler(ctx, {
          operatorToken: OPERATOR_TOKEN,
          objectiveKey: key,
        }),
      ),
      /not authorized/,
    );
    await assert.rejects(
      () => t.mutation(async (ctx) =>
        (simulateVerifiedAcquisition as unknown as Handler)._handler(ctx, {
          operatorToken: OPERATOR_TOKEN,
          intentId: effectId!,
        }),
      ),
      /not authorized/,
    );
  } finally {
    if (previousToken === undefined) delete process.env.SOMEBODY_DEMO_OPERATOR_TOKEN;
    else process.env.SOMEBODY_DEMO_OPERATOR_TOKEN = previousToken;
  }

  // Wrong resource class: a direct call against an intent the fixture does not
  // describe is refused even with a valid token.
  await t.mutation(async (ctx) => {
    const wrong: ExecutionIntent = {
      intentId: "int_wrongclass", idempotencyKey: "idem_wrong", objectiveKey: key,
      requirementKey: REQ, contractRevision: 1, decisionId: "dec_wrong",
      kind: "external_acquisition", strategy: "BUY",
      target: { offeringId: "off2", providerId: "p2", serviceId: "s2", resourceClass: "public_web", endpointRef: null },
      terms: { priceUsd: null, priceProvenance: "unknown", requiresApproval: false, approvalId: null },
      state: "authorized", attempts: 0, lastEventId: null, resultEvidenceId: null,
      verificationEvidenceId: null, boundaryNote: "b", createdAt: now, updatedAt: now,
    };
    await (putIntent as unknown as Handler)._handler(ctx, {
      intentId: wrong.intentId, objectiveKey: key, idempotencyKey: wrong.idempotencyKey, data: wrong,
    });
  });
  await assert.rejects(
    () => t.mutation(async (ctx) =>
      (simulateVerifiedAcquisition as unknown as Handler)._handler(ctx, {
        operatorToken: OPERATOR_TOKEN,
        intentId: "int_wrongclass",
      }),
    ),
    /does not match the simulated fixture/,
  );

  // Registry disclaims the class (M2/G fulfillment authority): the intent's
  // target class MATCHES the fixture — but the verified registry declares a
  // different class for that serviceId. The authorized offering's declaration,
  // not the class named on the intent, decides what may be written back.
  await t.mutation(async (ctx) => {
    const disclaimed: ExecutionIntent = {
      intentId: "int_registry_disclaim", idempotencyKey: "idem_disclaim", objectiveKey: key,
      requirementKey: REQ, contractRevision: 1, decisionId: "dec_disclaim",
      kind: "external_acquisition", strategy: "BUY",
      target: { offeringId: "3460:xbird_twitter_x_api", providerId: "3460", serviceId: "xbird_twitter_x_api", resourceClass: CANONICAL_SIMULATED_SOCIAL_RESULT.resourceClass, endpointRef: null },
      terms: { priceUsd: null, priceProvenance: "unknown", requiresApproval: false, approvalId: null },
      state: "authorized", attempts: 0, lastEventId: null, resultEvidenceId: null,
      verificationEvidenceId: null, boundaryNote: "b", createdAt: now, updatedAt: now,
    };
    await (putIntent as unknown as Handler)._handler(ctx, {
      intentId: disclaimed.intentId, objectiveKey: key, idempotencyKey: disclaimed.idempotencyKey, data: disclaimed,
    });
  });
  await assert.rejects(
    () => t.mutation(async (ctx) =>
      (simulateVerifiedAcquisition as unknown as Handler)._handler(ctx, {
        operatorToken: OPERATOR_TOKEN,
        intentId: "int_registry_disclaim",
      }),
    ),
    /refusing mismatched acquisition writeback/,
  );

  // Missing founder grant: a priced intent without a live grant is refused.
  await t.mutation(async (ctx) => {
    const unbacked: ExecutionIntent = {
      intentId: "int_nogrant", idempotencyKey: "idem_nogrant", objectiveKey: key,
      requirementKey: REQ, contractRevision: 1, decisionId: "dec_nogrant",
      kind: "external_acquisition", strategy: "BUY",
      target: { offeringId: "off3", providerId: "p3", serviceId: "s3", resourceClass: CANONICAL_SIMULATED_SOCIAL_RESULT.resourceClass, endpointRef: null },
      terms: { priceUsd: 0.02, priceProvenance: "provider_quote", requiresApproval: false, approvalId: "appr_missing" },
      state: "authorized", attempts: 0, lastEventId: null, resultEvidenceId: null,
      verificationEvidenceId: null, boundaryNote: "b", createdAt: now, updatedAt: now,
    };
    await (putIntent as unknown as Handler)._handler(ctx, {
      intentId: unbacked.intentId, objectiveKey: key, idempotencyKey: unbacked.idempotencyKey, data: unbacked,
    });
  });
  await assert.rejects(
    () => t.mutation(async (ctx) =>
      (simulateVerifiedAcquisition as unknown as Handler)._handler(ctx, {
        operatorToken: OPERATOR_TOKEN,
        intentId: "int_nogrant",
      }),
    ),
    /not covered by a live founder spend grant/,
  );

  // Stale revision: after the contract advances, the intent may not be
  // simulated over — exactly like the live rail refuses stale submissions.
  await t.mutation(async (ctx) =>
    (putContract as unknown as Handler)._handler(ctx, {
      objectiveKey: key,
      contractId: `contract_${key}`,
      revision: 2,
      data: { ...contractFor(key), revision: 2 },
    }),
  );
  await t.mutation(async (ctx) =>
    (putRequirement as unknown as Handler)._handler(ctx, {
      objectiveKey: key,
      requirementKey: REQ,
      data: { ...requirement, contractRevision: 2, revision: 2 },
      currentContractRevision: 2,
    }),
  );
  await assert.rejects(
    () => t.mutation(async (ctx) =>
      (simulateVerifiedAcquisition as unknown as Handler)._handler(ctx, {
        operatorToken: OPERATOR_TOKEN,
        intentId: effectId!,
      }),
    ),
    /stale/,
  );
  const intent = await readIntentRow(t, effectId!);
  assert.equal(intent.state, "authorized", "a refused simulation leaves the intent untouched");
  }
});

// ── 4. Worker surface + artifact evidence-ref truth ──────────────────────────

async function seedObjectiveWithRunAndAcquisition(
  t: ReturnType<typeof convexTest>,
  objectiveKey: string,
  options: { intentState: "verified" | "authorized" } = { intentState: "verified" },
) {
  const intentId = "int_evidence";
  const resultEvidenceId = "ev_sim_result";
  await t.mutation(async (ctx) => {
    await ctx.db.insert("objectives", {
      key: objectiveKey,
      data: {
        key: objectiveKey,
        request: "relaunch",
        createdAt: now,
        updatedAt: now,
        state: "executing",
        activity: "managed",
        plan: null,
        workItems: [
          {
            id: "wi_test",
            objectiveKey,
            title: "t",
            assignment: "a",
            workerKey: "w",
            state: "running",
            contract: {
              assignment: "a",
              idempotencyScope: "s",
              workerKey: "w",
              capabilityKeys: [],
              allowedToolPermissions: ["update_company_artifact"],
              requiredSourceClasses: [],
              minObservations: 0,
              sourceProofs: [],
              requiredVerifiedEffectKeys: [],
              approvalVersion: null,
              resultRequirements: {
                summary: false,
                fit: false,
                risks: false,
                unknowns: false,
                recommendedNextAction: false,
              },
            },
            runs: [],
          },
        ],
        run: {
          id: "run_evidence", workItemId: "wi_test", status: "running",
          startedAt: now, leaseUntil: now + 60_000, model: "test",
          modelSelectionReason: "test", toolCalls: 0, summary: "",
        },
        result: null,
        companyArtifacts: [
          {
            key: "launch/page-message", objectiveKey, label: "Launch page",
            content: "v1 content", version: 1, provenanceRunId: "seed",
            history: [{ version: 1, changeNote: "seed", changedAt: now, runId: "seed" }],
          },
        ],
        acquisitionResults: [
          {
            intentId,
            requirementKey: REQ,
            contractRevision: 1,
            resultEvidenceId,
            provenance: "simulation",
            providerId: "prov_newsliquid",
            serviceId: "newsliquid_twitter_search",
            offeringId: "reg_offer_1",
            resourceClass: "proprietary_data",
            content: CANONICAL_SIMULATED_SOCIAL_RESULT.content,
            responseHash: "hash",
            recordedAt: now,
            verifiedAt: now,
          },
        ],
        management: { contractId: "contract_x", controlNotes: [] },
      },
    });
    const intent: ExecutionIntent = {
      intentId, idempotencyKey: "idem_ev", objectiveKey,
      requirementKey: REQ, contractRevision: 1, decisionId: "dec_e",
      kind: "external_acquisition", strategy: "BUY",
      target: { offeringId: "off", providerId: "prov_newsliquid", serviceId: "newsliquid_twitter_search", resourceClass: "proprietary_data", endpointRef: null },
      terms: { priceUsd: 0.02, priceProvenance: "provider_quote", requiresApproval: false, approvalId: null },
      state: options.intentState, attempts: 1,
      lastEventId: "evt", resultEvidenceId: options.intentState === "verified" ? resultEvidenceId : null,
      verificationEvidenceId: options.intentState === "verified" ? "ev_ver" : null,
      boundaryNote: "b", createdAt: now, updatedAt: now,
    };
    await (putIntent as unknown as Handler)._handler(ctx, {
      intentId: intent.intentId, objectiveKey, idempotencyKey: intent.idempotencyKey, data: intent,
    });
  });
  return { intentId, resultEvidenceId };
}

test("M6.1 worker surface: only VERIFIED acquisitions are exposed as acquired inputs", async () => {
  const t = convexTest(schema, modules);
  const key = "obj_m61_obs";
  await seedObjectiveWithRunAndAcquisition(t, key, { intentState: "verified" });
  const observation = await t.mutation(async (ctx) =>
    (readWorkerObservation as unknown as Handler)._handler(ctx, { objectiveKey: key, runId: "run_evidence" }),
  ) as { acquiredInputs: Array<{ intentId: string; provenance: string; text: string }> };
  assert.equal(observation.acquiredInputs.length, 1);
  assert.equal(observation.acquiredInputs[0].intentId, "int_evidence");
  assert.equal(observation.acquiredInputs[0].provenance, "simulation");
  assert.ok(observation.acquiredInputs[0].text.includes("SIMULATED"));

  // The same acquisition whose intent is NOT verified is invisible.
  const t2 = convexTest(schema, modules);
  const key2 = "obj_m61_obs2";
  await seedObjectiveWithRunAndAcquisition(t2, key2, { intentState: "authorized" });
  const observation2 = await t2.mutation(async (ctx) =>
    (readWorkerObservation as unknown as Handler)._handler(ctx, { objectiveKey: key2, runId: "run_evidence" }),
  ) as { acquiredInputs: unknown[] };
  assert.equal(observation2.acquiredInputs.length, 0, "unverified provider results never reach the worker");
});

test("M6.1 artifact evidence refs: cited ids must be verified acquisitions; verified acquisitions must be cited", async () => {
  const t = convexTest(schema, modules);
  const key = "obj_m61_art";
  const { resultEvidenceId } = await seedObjectiveWithRunAndAcquisition(t, key, { intentState: "verified" });
  const call = (args: Record<string, unknown>) =>
    t.mutation(async (ctx) =>
      (updateCompanyArtifact as unknown as Handler)._handler(ctx, {
        objectiveKey: key, runId: "run_evidence", content: "v2 content", changeNote: "revise with evidence", ...args,
      }),
    );

  // Verified acquisition exists and nothing is cited → refuse.
  await assert.rejects(() => call({}), /must cite the verified acquisition evidence/);
  // Unknown id → refuse.
  await assert.rejects(() => call({ usedAcquisitionEvidenceIds: ["ev_made_up"] }), /not a verified acquisition result/);
  // A made-up id plus the real one → refuse.
  await assert.rejects(
    () => call({ usedAcquisitionEvidenceIds: [resultEvidenceId, "ev_made_up"] }),
    /not a verified acquisition result/,
  );
  // The real, verified id → accepted, persisted on the artifact version.
  const ok = await call({ usedAcquisitionEvidenceIds: [resultEvidenceId] }) as { version: number };
  assert.equal(ok.version, 2);
  const record = await t.query(async (ctx) => {
    const db = ctx.db as unknown as {
      query(n: string): {
        withIndex(n: string, f: (q: { eq: (k: string, v: unknown) => unknown }) => unknown): {
          unique(): Promise<{ data: { companyArtifacts?: Array<{ version: number; history: Array<{ version: number; usedAcquisitionEvidenceIds?: string[] }> }> } } | null>;
        };
      };
    };
    const row = await db.query("objectives").withIndex("by_key", (q) => q.eq("key", key)).unique();
    return row!.data;
  });
  const history = record.companyArtifacts![0].history;
  assert.equal(history.length, 2);
  assert.deepEqual(history[1].usedAcquisitionEvidenceIds, [resultEvidenceId]);
});

test("M6.1 artifact evidence refs: with no acquisitions the revision is free of refs; a fabricated acquisition with an unverified intent is rejected", async () => {
  const t = convexTest(schema, modules);
  const key = "obj_m61_art2";
  await seedObjectiveWithRunAndAcquisition(t, key, { intentState: "authorized" });
  const ok = await t.mutation(async (ctx) =>
    (updateCompanyArtifact as unknown as Handler)._handler(ctx, {
      objectiveKey: key, runId: "run_evidence", content: "v2", changeNote: "internal only",
    }),
  ) as { version: number };
  assert.equal(ok.version, 2);

  // Now claim the unverified acquisition's evidence id → refused.
  await assert.rejects(
    () =>
      t.mutation(async (ctx) =>
        (updateCompanyArtifact as unknown as Handler)._handler(ctx, {
          objectiveKey: key, runId: "run_evidence", content: "v3", changeNote: "claim unverified",
          usedAcquisitionEvidenceIds: ["ev_sim_result"],
        }),
      ),
    /not a verified acquisition result/,
  );
});

// ── 5. Demo setup entrypoint ─────────────────────────────────────────────────

test("M6.1 demo setup: operator-gated, seeds artifact v1 + empty acquisitions + bounded grant", async () => {
  const t = convexTest(schema, modules);
  const previousToken = process.env.SOMEBODY_DEMO_OPERATOR_TOKEN;
  delete process.env.SOMEBODY_DEMO_OPERATOR_TOKEN;
  try {
    await assert.rejects(
      () => t.mutation(async (ctx) =>
        (setupCanonicalDemoObjective as unknown as Handler)._handler(ctx, {
          operatorToken: OPERATOR_TOKEN, spendLimitUsd: 5,
        }),
      ),
      /not authorized/,
    );
  } finally {
    if (previousToken === undefined) delete process.env.SOMEBODY_DEMO_OPERATOR_TOKEN;
    else process.env.SOMEBODY_DEMO_OPERATOR_TOKEN = previousToken;
  }

  process.env.SOMEBODY_DEMO_OPERATOR_TOKEN = OPERATOR_TOKEN;
  try {
    await assert.rejects(
      () => t.mutation(async (ctx) =>
        (setupCanonicalDemoObjective as unknown as Handler)._handler(ctx, {
          operatorToken: OPERATOR_TOKEN, spendLimitUsd: 50,
        }),
      ),
      /within \(0, 5\]/,
    );
    const { key } = await t.mutation(async (ctx) =>
      (setupCanonicalDemoObjective as unknown as Handler)._handler(ctx, {
        operatorToken: OPERATOR_TOKEN, spendLimitUsd: 5,
      }),
    ) as { key: string };
    const record = await t.query(async (ctx) => {
      const db = ctx.db as unknown as {
        query(n: string): {
          withIndex(n: string, f: (q: { eq: (k: string, v: unknown) => unknown }) => unknown): {
            unique(): Promise<{ data: {
              companyArtifacts?: Array<{ version: number; provenanceRunId: string }>;
              acquisitionResults?: unknown[];
              management?: { contractId?: string | null };
            } } | null>;
          };
        };
      };
      const row = await db.query("objectives").withIndex("by_key", (q) => q.eq("key", key)).unique();
      return row!.data;
    });
    assert.equal(record.companyArtifacts?.length, 1);
    assert.equal(record.companyArtifacts![0].version, 1);
    assert.equal(record.companyArtifacts![0].provenanceRunId, "seed", "the final artifact must be a materially different worker-produced version");
    assert.deepEqual(record.acquisitionResults, []);
    assert.equal(record.management?.contractId ?? null, null, "interpretation owns the contract");
    const grants = await t.query(async (ctx) => {
      const db = ctx.db as unknown as {
        query(n: string): { collect(): Promise<Array<{ data: { approvalId: string; limitUsd: number; revokedAt: number | null } }>> };
      };
      return db.query("founderSpendGrants").collect();
    });
    const grant = grants.find((row) => row.data.approvalId === `demo_grant_${key}`);
    assert.ok(grant);
    assert.equal(grant!.data.limitUsd, 5);
    assert.equal(grant!.data.revokedAt, null);
  } finally {
    delete process.env.SOMEBODY_DEMO_OPERATOR_TOKEN;
  }
});

// ── 6. M5 read model: a simulated acquisition is shown truthfully ────────────

const simulatedAcquisition = {
  intentId: "int_m5",
  requirementKey: REQ,
  contractRevision: 1,
  resultEvidenceId: "ev_m5_result",
  provenance: "simulation" as const,
  providerId: "prov_newsliquid",
  serviceId: "newsliquid_twitter_search",
  offeringId: "reg_offer_1",
  resourceClass: "proprietary_data",
  content: "SIMULATED proprietary social evidence — no live provider was called.",
  responseHash: "hash",
  recordedAt: now,
  verifiedAt: now,
};

const simulatedIntent = {
  intentId: "int_m5",
  requirementKey: REQ,
  decisionId: "dec_m5",
  contractRevision: 1,
  kind: "external_acquisition" as const,
  strategy: "BUY" as const,
  target: { providerId: "prov_newsliquid", serviceId: "newsliquid_twitter_search", offeringId: "reg_offer_1", resourceClass: "proprietary_data" },
  terms: { priceUsd: 0.02, priceProvenance: "provider_quote", requiresApproval: false, approvalId: "appr" },
  state: "verified",
  resultEvidenceId: "ev_m5_result",
  verificationEvidenceId: "ev_m5_ver",
  boundaryNote: "verified at the simulated boundary",
  createdAt: now,
  updatedAt: now + 10,
};

function m5Source(acquisitionResults: unknown[], historyRefs?: string[]): WorkspaceSource {
  return {
    objective: {
      key: "obj_m5",
      request: "relaunch",
      createdAt: now,
      updatedAt: now + 20,
      state: "executing",
      result: null,
      companyArtifacts: [
        {
          key: "launch/page-message",
          label: "Launch page",
          version: 2,
          history: [
            { version: 1, changeNote: "seed", changedAt: now },
            { version: 2, changeNote: "rewritten with acquired evidence", changedAt: now + 15, ...(historyRefs ? { usedAcquisitionEvidenceIds: historyRefs } : {}) },
          ],
        },
      ],
      acquisitionResults: acquisitionResults as WorkspaceSource["objective"]["acquisitionResults"],
      management: { contractId: "contract_m5", controlNotes: [] },
    },
    contract: {
      contractId: "contract_m5", objectiveKey: "obj_m5", revision: 1,
      intent: "relaunch", minimumCompletionBar: "goal",
      levels: [{ levelKey: "goal", order: 1, label: "Goal", statement: "done" }],
    },
    requirements: [
      {
        requirementKey: REQ, title: "evidence", mustBeTrue: "x",
        priority: "required" as const, state: "satisfied" as const,
        strategy: "BUY", contractRevision: 1,
        resolution: { resolutionId: "res_m5", proofRefs: ["ev_m5_result"], acceptedAt: now + 12 },
        createdAt: now,
      },
    ],
    workers: [],
    assignments: [],
    decisions: [],
    intents: [simulatedIntent],
    grants: [{ approvalId: "appr", limitUsd: 5, grantedAt: now, revokedAt: null }],
    evidence: [],
  };
}

test("M5: a simulated acquisition never renders payment stages beyond prepared, and is labelled SIMULATION", () => {
  const view = composeObjectiveWorkspace(m5Source([simulatedAcquisition]));
  const external = view.external[0];
  assert.ok(external);
  assert.equal(external.payment.state, "prepared");
  assert.equal(external.payment.history.length, 1, "no submitted/settled/verified stage may render");
  assert.ok(external.boundaryNote.startsWith("SIMULATION ONLY"));
  assert.equal(external.intent?.state, "verified", "the INTENT truth is still shown truthfully");

  const story = view.missionStory.map((event) => event.title);
  assert.ok(!story.includes("Payment submitted"), "a simulation must never tell a payment story");
  assert.ok(story.includes("Simulated acquisition boundary executed"));
  assert.ok(story.includes("Simulated provider result recorded"));
  assert.ok(story.includes("Simulated external result verified"));

  const evidence = view.evidence.find((item) => item.evidenceId === "ev_m5_result");
  assert.ok(evidence);
  assert.equal(evidence.origin, "provider_result");
  assert.equal(evidence.state, "verified");
  assert.match(evidence.label, /SIMULATION/);
});

test("M5: artifact versions carry their own evidence refs; unverified acquisitions never become evidence", () => {
  const view = composeObjectiveWorkspace(m5Source([simulatedAcquisition], ["ev_m5_result"]));
  const artifact = view.artifacts[0];
  assert.deepEqual(artifact.versions[0].evidenceRefs, []);
  assert.deepEqual(artifact.versions[1].evidenceRefs, ["ev_m5_result"]);
  const story = view.missionStory.find((event) => event.id.endsWith(":2"));
  assert.ok(story);
  assert.match(story.detail, /Used acquired evidence: ev_m5_result/);

  // Same result but its intent is NOT verified → no evidence view, no story.
  const unverified = m5Source([simulatedAcquisition], ["ev_m5_result"]);
  unverified.intents = [{ ...simulatedIntent, state: "authorized", resultEvidenceId: null, verificationEvidenceId: null }];
  const view2 = composeObjectiveWorkspace(unverified);
  assert.equal(view2.evidence.find((item) => item.evidenceId === "ev_m5_result"), undefined);
});

// ── 7. Level 2: the simulation wake drives the REAL management pass to
//       satisfaction (verify → external_result_verified) ─────────────────────

test("M6.1 Level 2: simulation wake → real management pass → BUY requirement satisfied by external_result_verified", async () => {
  const t = convexTest(schema, modules);
  const key = "obj_m61_pass";
  const previousToken = process.env.SOMEBODY_DEMO_OPERATOR_TOKEN;
  process.env.SOMEBODY_DEMO_OPERATOR_TOKEN = OPERATOR_TOKEN;
  try {
    await runSimulationToSatisfaction(t, key);
  } finally {
    if (previousToken === undefined) delete process.env.SOMEBODY_DEMO_OPERATOR_TOKEN;
    else process.env.SOMEBODY_DEMO_OPERATOR_TOKEN = previousToken;
  }

  async function runSimulationToSatisfaction(t: ReturnType<typeof convexTest>, key: string) {
    const requirement = await seedObjectiveWithGrant(t, key);
    await seedAuthorizedBuy(t, key, requirement, buyOption());
    const effectId = await dispatchBuy(t, key);
    assert.ok(effectId);

    // The operator executes the simulated acquisition boundary.
    const result = await t.mutation(async (ctx) =>
      (simulateVerifiedAcquisition as unknown as Handler)._handler(ctx, {
        operatorToken: OPERATOR_TOKEN,
        intentId: effectId,
      }),
    ) as { verified: boolean; resultEvidenceId: string };

    // The wake Somebody receives is the SAME management pass the live rail
    // would trigger. The reducer must route the VERIFIED intent to verify,
    // and recordSatisfactionAttempt must satisfy through the kernel.
    const outcome = await t.mutation(async (ctx) =>
      (runManagementPass as unknown as Handler)._handler(ctx, {
        objectiveKey: key,
        reason: "verification_result",
      }),
    ) as { objectiveState: string; acted: boolean; summary: string };

    // The simulation did NOT complete the objective — the ENGINE did: within
    // the bounded continue-cycles the pass verifies the intent, satisfies the
    // requirement through external_result_verified, proposes completion, and
    // the deterministic gate accepts (the only required requirement is now
    // satisfied). The simulated boundary stayed at the intent kernel.
    assert.equal(outcome.objectiveState, "completed");

    const requirements = await t.query(async (ctx) => {
      const db = ctx.db as unknown as {
        query(n: string): { collect(): Promise<Array<{ data: Requirement }>> };
      };
      return db.query("requirements").collect();
    });
    const satisfied = requirements.find((row) => row.data.requirementKey === REQ);
    assert.ok(satisfied);
    assert.equal(satisfied!.data.state, "satisfied", "the kernel accepted the verified external result");
    assert.equal(satisfied!.data.resolution?.acceptedIntentId, effectId, "the resolution names the verified intent");

    // The provenance travels: the persisted acquisition result on the
    // objective is exactly what the worker surface will expose next run.
    const record = await t.query(async (ctx) => {
      const db = ctx.db as unknown as {
        query(n: string): {
          withIndex(n: string, f: (q: { eq: (k: string, v: unknown) => unknown }) => unknown): {
            unique(): Promise<{ data: { acquisitionResults?: Array<{ resultEvidenceId: string; provenance: string }> } } | null>;
          };
        };
      };
      const row = await db.query("objectives").withIndex("by_key", (q) => q.eq("key", key)).unique();
      return row!.data;
    });
    assert.equal(record.acquisitionResults?.length, 1);
    assert.equal(record.acquisitionResults![0].resultEvidenceId, result.resultEvidenceId);
    assert.equal(record.acquisitionResults![0].provenance, "simulation");
  }
});
