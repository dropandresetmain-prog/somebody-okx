// M5 INTEGRATION — Level 2: direct Convex → M5 seam tests.
// Seeds REAL Convex rows through the shipped internal mutations and calls the
// shipped getObjectiveWorkspaceV2 query handler, proving the seam end to end:
// Objective, Outcome Contract, Requirement, worker/assignment, decision,
// AttentionItem, external intent, payment state, evidence, verification,
// Objective completion — plus the backend-side negative truths.

import test from "node:test";
import assert from "node:assert/strict";
import { convexTest } from "convex-test";
import schema from "../convex/schema";
import {
  putContract,
  putRequirement,
  putDecision,
  putAssignment,
  putIntent,
  upsertWorker,
} from "../convex/internal/workforce";
import { getObjectiveWorkspaceV2 } from "../convex/m5Workspace";
import type { ObjectiveWorkspaceView } from "../app/m5/workspace";

const modules = {
  "../convex/schema.ts": () => import("../convex/schema"),
  "../convex/objectiveValidators.ts": () => import("../convex/objectiveValidators"),
  "../convex/managementValidators.ts": () => import("../convex/managementValidators"),
  "../convex/workforceGuards.ts": () => import("../convex/workforceGuards"),
  "../convex/internal/workforce.ts": () => import("../convex/internal/workforce"),
  "../convex/m5Workspace.ts": () => import("../convex/m5Workspace"),
  "../convex/_generated/api.d.ts": () => import("../convex/_generated/api"),
  "../convex/_generated/server.d.ts": () => import("../convex/_generated/server"),
  "../convex/_generated/dataModel.d.ts": () => import("../convex/_generated/dataModel"),
};

const now = 1820000000000;
type Backend = ReturnType<typeof convexTest>;
type Handler = { _handler: (ctx: unknown, args: Record<string, unknown>) => Promise<unknown> };
const call = (fn: unknown, ctx: unknown, args: Record<string, unknown>) => (fn as Handler)._handler(ctx, args);

async function seedObjective(t: Backend, key: string, overrides: Record<string, unknown> = {}) {
  await t.mutation(async (ctx) => {
    await ctx.db.insert("objectives", {
      key,
      data: {
        key,
        request: "Our launch isn't working. Fix it and relaunch today.",
        createdAt: now,
        updatedAt: now,
        state: "executing",
        activity: "working",
        plan: null,
        workItems: [],
        run: null,
        result: null,
        ...overrides,
      } as never,
    });
  });
}

async function seedContract(t: Backend, key: string, revision = 1) {
  await t.mutation(async (ctx) =>
    call(putContract, ctx, {
      objectiveKey: key,
      contractId: `contract_${key}`,
      revision,
      data: {
        contractId: `contract_${key}`,
        objectiveKey: key,
        revision,
        intent: "A relaunch pack proved by evidence",
        levels: [
          { levelKey: "bar", order: 1, statement: "Pack verified", label: "Minimum bar" },
          { levelKey: "extra", order: 2, statement: "Audience response observed", label: "Above bar" },
        ],
        minimumCompletionBar: "bar",
        ambiguities: [],
        createdBy: "somebody",
        createdFromRequestId: `req_${key}`,
        createdAt: now,
      },
    }),
  );
}

async function seedRequirement(t: Backend, key: string, overrides: Record<string, unknown> = {}) {
  await t.mutation(async (ctx) =>
    call(putRequirement, ctx, {
      objectiveKey: key,
      requirementKey: String(overrides.requirementKey ?? "req_1"),
      data: {
        requirementKey: "req_1",
        objectiveKey: key,
        contractId: `contract_${key}`,
        contractRevision: 1,
        priority: "required",
        title: "Prepare the relaunch pack",
        mustBeTrue: "Pack reflects verified audience evidence",
        scope: "in: pack; out: publishing",
        proofs: [],
        state: "active",
        strategy: null,
        resolution: null,
        blockedReason: null,
        waiver: null,
        revision: 1,
        createdAt: now,
        updatedAt: now,
        ...overrides,
      },
    }),
  );
}

function workerRow(workerKey: string, objectiveKey: string | null, overrides: Record<string, unknown> = {}) {
  return {
    workerKey,
    displayName: workerKey,
    capabilityKeys: ["public_information_research"],
    dynamicCapabilities: [],
    responsibility: "bounded work",
    lifecycle: "available",
    reservedBy: null,
    verifiedAssignments: [],
    contextRefs: [],
    createdByObjective: objectiveKey,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

function assignmentRow(key: string, overrides: Record<string, unknown> = {}) {
  return {
    assignmentId: "asg_1",
    objectiveKey: key,
    requirementKey: "req_1",
    contractRevision: 1,
    decisionId: "dec_1",
    workerKey: "wk_1",
    kind: "internal_make",
    state: "running",
    attempt: 1,
    runId: "run_1",
    workContract: {
      assignment: "bounded",
      idempotencyScope: "scope",
      workerKey: "wk_1",
      capabilityKeys: ["public_information_research"],
      allowedToolPermissions: [],
      requiredSourceClasses: ["public_web"],
      minObservations: 1,
      sourceProofs: [{ sourceClass: "public_web", minDistinctSources: 1 }],
      requiredVerifiedEffectKeys: [],
      approvalVersion: null,
      resultRequirements: { summary: true, fit: false, risks: false, unknowns: false, recommendedNextAction: false },
    },
    resultSummary: null,
    idempotencyScope: "scope",
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

function intentRow(key: string, overrides: Record<string, unknown> = {}) {
  return {
    intentId: "intent_1",
    idempotencyKey: "idem_1",
    objectiveKey: key,
    requirementKey: "req_1",
    contractRevision: 1,
    decisionId: "dec_buy",
    kind: "external_acquisition",
    strategy: "BUY",
    target: { offeringId: "off_1", providerId: "prov_1", serviceId: "svc_1", resourceClass: "data", endpointRef: null },
    terms: { priceUsd: 0.4, priceProvenance: "provider_quote", requiresApproval: true, approvalId: "grant_1" },
    state: "authorized",
    attempts: 0,
    lastEventId: null,
    resultEvidenceId: null,
    verificationEvidenceId: null,
    boundaryNote: "M4 stopped at the buyer-rail boundary: no payment attempted",
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

async function seedEvidence(t: Backend, key: string, evidenceId: string, runId: string) {
  await t.mutation(async (ctx) => {
    await ctx.db.insert("evidence", {
      objectiveKey: key,
      evidenceId,
      data: {
        sourceClass: "public_web",
        label: evidenceId,
        text: "observed content",
        observedAt: now,
        recordedBy: "wk_1",
        runId,
        origin: "application_observation",
        sourceId: evidenceId,
      } as never,
    });
  });
}

async function workspace(t: Backend, key: string): Promise<{ found: boolean; view: ObjectiveWorkspaceView | null }> {
  return (await t.query(async (ctx) => call(getObjectiveWorkspaceV2, ctx, { objectiveKey: key }))) as {
    found: boolean;
    view: ObjectiveWorkspaceView | null;
  };
}

// ── Seam tests ───────────────────────────────────────────────────────────────

test("seam: unknown objective returns found=false, never a fixture", async () => {
  const t = convexTest(schema, modules);
  const result = await workspace(t, "obj_missing");
  assert.equal(result.found, false);
  assert.equal(result.view, null);
});

test("seam: objective + contract + requirement + worker + assignment + decision compose", async () => {
  const t = convexTest(schema, modules);
  const key = "obj_seam";
  await seedObjective(t, key);
  await seedContract(t, key);
  await seedRequirement(t, key);
  await t.mutation(async (ctx) => {
    await call(upsertWorker, ctx, { workerKey: "wk_1", data: workerRow("wk_1", key), at: now });
    await call(putAssignment, ctx, { assignmentId: "asg_1", objectiveKey: key, data: assignmentRow(key, { state: "result_submitted", resultSummary: "draft ready" }) });
    await call(putDecision, ctx, {
      objectiveKey: key,
      decisionId: "dec_1",
      data: {
        decisionId: "dec_1", objectiveKey: key, contractRevision: 1, requirementKey: "req_1",
        kind: "satisfaction_strategy", strategy: "MAKE", optionId: "opt_1",
        recommendation: { requirementKey: "req_1", contractRevision: 1, selectedOptionId: "opt_1", strongestAlternativeId: null, rationale: "internal capability exists", materialAssumptions: [], changeMyMindEvidence: [] },
        authorization: { kind: "authorized", decisionId: "dec_1", requirementKey: "req_1", contractRevision: 1, strategy: "MAKE", optionId: "opt_1", authorizedAt: now, spendApprovalId: null },
        coarsePlanSummary: JSON.stringify({ original: "MAKE internally", extra: { options: [] } }),
        consideredOptionIds: ["opt_1"], at: now,
      },
    });
  });
  await seedEvidence(t, key, "ev_1", "run_1");

  const { found, view } = await workspace(t, key);
  assert.equal(found, true);
  assert.ok(view);
  assert.equal(view!.provenance, "backend_query");
  assert.equal(view!.objective.objectiveKey, key);
  assert.equal(view!.outcome?.contractId, `contract_${key}`);
  assert.equal(view!.outcome?.minimumCompletionBar, "bar");
  assert.equal(view!.requirements[0].requirementKey, "req_1");
  assert.equal(view!.requirements[0].state, "active");
  assert.equal(view!.workers.length, 1);
  assert.equal(view!.workers[0].staffing.outcome, "create"); // createdByObjective = key
  assert.equal(view!.assignments[0].state, "result_submitted");
  assert.equal(view!.decisions[0].decisionId, "dec_1");
  assert.equal(view!.decisions[0].authorization, "authorized");
  assert.equal(view!.evidence.length, 1);
  // worker result alone: NOT complete, NOT satisfied
  assert.equal(view!.completion.accepted, false);
  assert.equal(view!.somebodyNow.headline, "A result arrived, not a completion claim.");
});

test("seam: pending_approval control note produces real AttentionItem; clean objective produces none", async () => {
  const t = convexTest(schema, modules);
  const key = "obj_attention";
  await seedObjective(t, key, {
    management: { contractId: `contract_${key}`, controlNotes: [{ type: "pending_approval", question: "Approve external spend up to $0.40?", at: now }] },
  });
  await seedContract(t, key);
  await seedRequirement(t, key);
  const { view } = await workspace(t, key);
  assert.equal(view!.attention.length, 1);
  assert.equal(view!.attention[0].kind, "approval");
  assert.equal(view!.attention[0].maximumUsd, null); // no grant persisted → no invented amount
  assert.equal(view!.somebodyNow.condition, "needs_you");

  const clean = convexTest(schema, modules);
  await seedObjective(clean, "obj_clean");
  await seedContract(clean, "obj_clean");
  const cleanView = await workspace(clean, "obj_clean");
  assert.equal(cleanView.view!.attention.length, 0);
});

test("seam: intent states map to payment views without collapsing submitted/settled/result/verified", async () => {
  const cases: Array<[string, string | null, string[]]> = [
    ["awaiting_m3", null, ["prepared"]],
    ["handed_off", "submitted", ["prepared", "awaiting_approval", "payment_attempted", "submitted"]],
    ["result_recorded", "result_received", ["prepared", "awaiting_approval", "payment_attempted", "submitted", "result_received"]],
    ["verified", "verified", ["prepared", "awaiting_approval", "payment_attempted", "submitted", "result_received", "verified"]],
  ];
  for (const [state, expectedStage, expectedHistory] of cases) {
    const t = convexTest(schema, modules);
    const key = `obj_pay_${state}`;
    await seedObjective(t, key);
    await seedContract(t, key);
    await t.mutation(async (ctx) => {
      await call(putIntent, ctx, { intentId: "intent_1", objectiveKey: key, idempotencyKey: "idem_1", data: intentRow(key, { state, approvalId: undefined, terms: { priceUsd: 0.4, priceProvenance: "provider_quote", requiresApproval: true, approvalId: null } }) });
    });
    const { view } = await workspace(t, key);
    const payment = view!.external[0].payment;
    assert.equal(payment.state, expectedStage ?? "prepared", `state ${state}`);
    const recorded = payment.history.map((entry) => entry.state);
    for (const stage of expectedHistory) {
      if (stage === "awaiting_approval" && state === "awaiting_m3") continue;
      assert.ok(recorded.includes(stage as never), `state ${state}: history missing ${stage} (got ${recorded.join(",")})`);
    }
    // settled is NEVER rendered from M4 truth
    assert.ok(!recorded.includes("settled" as never), `state ${state} must not render settled`);
    if (expectedStage !== "verified" && expectedStage !== "result_received") {
      assert.ok(!recorded.includes("verified" as never), `state ${state} must not render verified`);
    }
    if (expectedStage !== "result_received" && expectedStage !== "verified") {
      assert.ok(!recorded.includes("result_received" as never), `state ${state} must not render result_received`);
    }
  }
});

test("seam: requirement satisfaction + gate verdict drive completion truthfully", async () => {
  const t = convexTest(schema, modules);
  const key = "obj_done";
  await seedObjective(t, key, { state: "completed", result: { summary: "Relaunch pack verified and accepted", fit: "fit", risks: [], unknowns: [], recommendedNextAction: "publish", completedAt: now } });
  await seedContract(t, key);
  await seedRequirement(t, key, {
    state: "satisfied",
    strategy: "MAKE",
    resolution: { resolutionId: "res_1", acceptedDecisionId: "dec_1", acceptedAssignmentId: "asg_1", acceptedIntentId: null, proofRefs: ["ev_1"], contractRevision: 1, acceptedAt: now },
  });
  await t.mutation(async (ctx) => {
    await call(putDecision, ctx, {
      objectiveKey: key,
      decisionId: `gate_${key}_r1`,
      data: {
        decisionId: `gate_${key}_r1`, objectiveKey: key, contractRevision: 1, requirementKey: "",
        kind: "completion_proposal", strategy: null, optionId: null, recommendation: null,
        authorization: { kind: "refused", requirementKey: "", contractRevision: 1, reasons: ["unknown"], detail: "placeholder" },
        coarsePlanSummary: JSON.stringify({ gateVerdict: { accepted: true, objectiveState: "completed", satisfiedRequired: ["req_1"], disclosedPendingSupporting: ["req_2"], levelsAboveBarPending: ["extra"] }, gateProposal: {} }),
        consideredOptionIds: [], at: now,
      },
    });
  });
  const { view } = await workspace(t, key);
  assert.equal(view!.completion.accepted, true);
  assert.deepEqual(view!.completion.proofRefs, ["ev_1"]);
  assert.ok(view!.completion.remaining.some((item) => item.includes("req_2")));
  assert.equal(view!.somebodyNow.condition, "verified");
  assert.equal(view!.somebodyNow.ball, "Nobody — complete");
  // gate rows never appear as managerial decisions
  assert.ok(view!.decisions.every((decision) => decision.decisionId !== `gate_${key}_r1`));
});

test("seam: stale revision satisfaction is not current; no fixture fallback on empty rows", async () => {
  const t = convexTest(schema, modules);
  const key = "obj_stale";
  await seedObjective(t, key);
  await seedContract(t, key, 2); // current revision 2
  await seedRequirement(t, key, {
    contractRevision: 1,
    state: "satisfied",
    resolution: { resolutionId: "res_old", acceptedDecisionId: null, acceptedAssignmentId: null, acceptedIntentId: null, proofRefs: ["ev_old"], contractRevision: 1, acceptedAt: now - 1000 },
  });
  const { view } = await workspace(t, key);
  assert.equal(view!.requirements[0].state, "active");
  assert.equal(view!.requirements[0].resolution, null);
  assert.equal(view!.outcome?.revision, 2);
  assert.equal(view!.completion.accepted, false);
});

test("seam: reconciliation_required intent creates recovery AttentionItem and blocked SomebodyNow", async () => {
  const t = convexTest(schema, modules);
  const key = "obj_recon";
  await seedObjective(t, key);
  await seedContract(t, key);
  await t.mutation(async (ctx) => {
    await call(putIntent, ctx, { intentId: "intent_1", objectiveKey: key, idempotencyKey: "idem_1", data: intentRow(key, { state: "reconciliation_required", boundaryNote: "ambiguous submission; durable record must be reconciled" }) });
  });
  const { view } = await workspace(t, key);
  assert.equal(view!.attention.length, 1);
  assert.equal(view!.attention[0].kind, "recovery");
  assert.equal(view!.somebodyNow.condition, "blocked");
  assert.equal(view!.external[0].payment.state, "reconciliation_required");
});

test("seam: external_acquisition vs external_effect boundary notes stay distinct", async () => {
  for (const kind of ["external_acquisition", "external_effect"] as const) {
    const t = convexTest(schema, modules);
    const key = `obj_kind_${kind}`;
    await seedObjective(t, key);
    await seedContract(t, key);
    await t.mutation(async (ctx) => {
      await call(putIntent, ctx, { intentId: "intent_1", objectiveKey: key, idempotencyKey: "idem_1", data: intentRow(key, { kind, state: "verified", resultEvidenceId: "ev_p", verificationEvidenceId: "ev_v" }) });
    });
    const { view } = await workspace(t, key);
    assert.equal(view!.external[0].intent?.kind, kind);
    if (kind === "external_acquisition") {
      assert.ok(view!.external[0].boundaryNote.includes("does NOT prove any later external business effect"));
    } else {
      assert.ok(view!.external[0].boundaryNote.includes("authorized change in the outside world"));
    }
  }
});
