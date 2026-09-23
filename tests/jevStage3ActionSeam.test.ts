// J4 — action-level seam: proposeDecision (convex/objectiveRunner.ts) actually
// wires composeBoundedStage3Recommendation behind JEV_OPTION_SELECTION_ENABLED.
//
// Gate OFF is already proven at the action level by
// tests/m2StructuredRepair.test.ts ("decision: invalid option id ..."), which
// runs proposeDecision unchanged with the gate unset. This file adds the
// GATE ON, SOLE-ELIGIBLE case at the same action level: with exactly one
// eligible (internal MAKE) option, the mutation-bound decision must be
// produced WITHOUT any "recommendation"-kind incumbent structured-chat call
// and WITHOUT any Jev gateway call — the J2 bridge is the sole source.
//
// GATE ON multi-eligible Jev-success and Jev-technical-failure-fallback are
// covered directly (and more thoroughly, with real bridge+parser round-trips)
// at the composition level in tests/jevRecommendationSeam.test.ts via
// composeBoundedStage3Recommendation. Reproducing a genuinely eligible
// external BUY option end-to-end through the real proposeDecision action
// requires a validated ResourceNeed bound to the one execution-path-
// configured provider in this repo (see
// lib/providers/executionCapability.ts COMPOSED_EXTERNAL_EXECUTION), which
// unavoidably also excludes MAKE's ownership of that same resource class
// (lib/sourcing/eligibility.ts rule #2) — so a genuine MAKE+BUY multi-eligible
// pair is not reproducible today without touching production registry/
// execution-path data, which is out of J4's scope. See the COMPLETION REPORT
// "Local E2E evidence" section for the full explanation.
import test, { mock, after as afterAll } from "node:test";
import assert from "node:assert/strict";
import { convexTest } from "convex-test";
import schema from "../convex/schema";
import { proposeDecision } from "../convex/objectiveRunner";
import { initBudget, putContract, putRequirement } from "../convex/internal/workforce";
import { buildOutcomeContract, buildRequirement } from "../lib/management/contract";
import { M61_SERIAL_V1 } from "../lib/management/executionProtocol";
import {
  installStructuredChatDouble,
  type StructuredChatRequest,
} from "../lib/management/modelBoundary";
import { installJevGatewayDouble } from "../lib/management/jev";
import { JEV_OPTION_SELECTION_ENV } from "../lib/management/jevStage3";
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
  "../convex/m3Driver.ts": () => import("../convex/m3Driver"),
  "../convex/_generated/api.d.ts": () => import("../convex/_generated/api"),
  "../convex/_generated/server.d.ts": () => import("../convex/_generated/server"),
  "../convex/_generated/dataModel.d.ts": () => import("../convex/_generated/dataModel"),
};

mock.timers.enable({ apis: ["setTimeout"] });
afterAll(() => {
  mock.timers.reset();
  installStructuredChatDouble(null);
  installJevGatewayDouble(null);
  delete process.env[JEV_OPTION_SELECTION_ENV];
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

function makeContract(key: string) {
  const built = buildOutcomeContract({
    objectiveKey: key,
    contractId: `c_${key}`,
    revision: 1,
    parsed: {
      intent: "relaunch messaging",
      levels: [{ levelKey: "relaunch", order: 1, statement: "saved relaunch recommendation exists", label: "Relaunch" }],
      minimumCompletionBar: "relaunch",
      ambiguities: [],
    },
    requestId: "r1",
    founderResolvedQuestions: [],
    at: now,
  });
  assert.equal(built.ok, true);
  return (built as { contract: unknown }).contract;
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

async function readBudget(t: Backend, key: string) {
  return t.query(async (ctx) => {
    const row = await ctx.db
      .query("objectiveBudgets")
      .withIndex("by_objectiveKey", (q) => q.eq("objectiveKey", key))
      .unique();
    return (row as { data: { used: { modelCalls: number; managementDecisions: number } } }).data;
  });
}

async function seedDecision(t: Backend, key: string, reqKey: string) {
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
        companyArtifacts: [{ key: ARTIFACT, version: 2, content: "prior draft", history: [] }],
        management: {
          contractId: `c_${key}`,
          currentContractRevision: 1,
          executionProtocol: M61_SERIAL_V1,
          controlNotes: [],
          decisionAttempts: { [reqKey]: 1 },
          decisionRefusalAttempts: { [reqKey]: 0 },
          decisionInputFingerprints: {},
          pendingDecision: { requestId: `decide_${key}_${reqKey}_r1_a1`, requirementKey: reqKey, contractRevision: 1, attempts: 1 },
        },
      } as never,
    });
    await (initBudget as unknown as Handler)._handler(ctx, { objectiveKey: key, at: now });
    await (putContract as unknown as Handler)._handler(ctx, { objectiveKey: key, contractId: `c_${key}`, revision: 1, data: makeContract(key) });
    await (putRequirement as unknown as Handler)._handler(ctx, {
      objectiveKey: key,
      requirementKey: reqKey,
      data: { ...makeDeliverable(key, reqKey), state: "active", strategy: null },
      currentContractRevision: 1,
    });
  });
}

test("gate ON, sole eligible: proposeDecision authorizes MAKE with NO Jev call and NO incumbent recommendation call", async () => {
  process.env[JEV_OPTION_SELECTION_ENV] = "true";
  const t = convexTest(schema, modules);
  const key = "obj_j4_sole";
  const reqKey = "req_relaunch";
  await seedDecision(t, key, reqKey);

  const recRequests: StructuredChatRequest[] = [];
  installStructuredChatDouble((req) => {
    if (req.kind === "strategy") {
      return { strategy: "MAKE", desiredCapabilities: [...MAKE_CAPS], needsExternalResourceClass: null, notes: null };
    }
    // Only the sole-eligible internal option exists; the incumbent
    // "recommendation" model must NEVER be asked once the gate is on and the
    // J2 bridge already produced a valid recommendation.
    recRequests.push(req);
    throw new Error("incumbent recommendation model must not be called for a sole-eligible gate-ON decision");
  });

  let jevCalls = 0;
  installJevGatewayDouble(async () => {
    jevCalls += 1;
    throw new Error("Jev must not be called when exactly one option is eligible");
  });

  const result = (await t.action(async (ctx) =>
    (proposeDecision as unknown as Handler)._handler(ctx, {
      objectiveKey: key,
      requestId: `decide_${key}_${reqKey}_r1_a1`,
      requirementKey: reqKey,
      contractRevision: 1,
    }),
  )) as { ok: boolean; detail: string };

  assert.equal(result.ok, true, result.detail);
  assert.equal(jevCalls, 0, "Jev gateway never called for sole-eligible selection");
  assert.equal(recRequests.length, 0, "incumbent recommendation model never called after a valid bridge result");
  assert.match(result.detail, /authorized MAKE/);

  // Exactly one model call recorded: the strategy proposal. No recommendation
  // call, no repair call, and (per J4's accounting finding) no Jev call is
  // represented in this counter at all.
  const budget = await readBudget(t, key);
  assert.equal(budget.used.modelCalls, 1, "only the strategy proposal call is recorded");

  const req = await t.query(async (ctx) => {
    const rows = await ctx.db.query("requirements").withIndex("by_objectiveKey", (q) => q.eq("objectiveKey", key)).collect();
    return (rows[0] as { data: Requirement }).data;
  });
  assert.equal(req.strategy, "MAKE");
});
