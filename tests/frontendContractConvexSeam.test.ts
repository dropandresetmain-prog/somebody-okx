// FRONTEND CONTRACT V1 — Level 2: direct Convex → product read seam.
// Seeds real rows through the shipped internal mutations and calls the shipped
// getObjectiveListV1 / getObjectiveWorkspaceV1 / getStartCapabilitiesV1 handlers.

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
import { getObjectiveListV1, getObjectiveWorkspaceV1, getStartCapabilitiesV1 } from "../convex/productWorkspace";

const modules = {
  "../convex/schema.ts": () => import("../convex/schema"),
  "../convex/objectiveValidators.ts": () => import("../convex/objectiveValidators"),
  "../convex/managementValidators.ts": () => import("../convex/managementValidators"),
  "../convex/workforceGuards.ts": () => import("../convex/workforceGuards"),
  "../convex/internal/workforce.ts": () => import("../convex/internal/workforce"),
  "../convex/m5Workspace.ts": () => import("../convex/m5Workspace"),
  "../convex/productWorkspace.ts": () => import("../convex/productWorkspace"),
  "../convex/_generated/api.d.ts": () => import("../convex/_generated/api"),
  "../convex/_generated/server.d.ts": () => import("../convex/_generated/server"),
  "../convex/_generated/dataModel.d.ts": () => import("../convex/_generated/dataModel"),
};

const now = 1820000000000;
type Backend = ReturnType<typeof convexTest>;
type Handler = { _handler: (ctx: unknown, args: Record<string, unknown>) => Promise<unknown> };
const call = (fn: unknown, ctx: unknown, args: Record<string, unknown>) => (fn as Handler)._handler(ctx, args);
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Loose = Record<string, any>;

async function seedObjective(t: Backend, key: string, overrides: Record<string, unknown> = {}) {
  await t.mutation(async (ctx) => {
    await ctx.db.insert("objectives", {
      key,
      data: {
        key,
        request: `Objective ${key}. Fix it and relaunch today.`,
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
        levels: [{ levelKey: "bar", order: 1, statement: "Pack verified", label: "Minimum bar" }],
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

function workerRow(workerKey: string, objectiveKey: string) {
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
    state: "handed_off",
    attempts: 0,
    lastEventId: null,
    resultEvidenceId: null,
    verificationEvidenceId: null,
    boundaryNote: "M4 stopped at the buyer-rail boundary",
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

async function putMakeDecision(t: Backend, key: string) {
  await t.mutation(async (ctx) =>
    call(putDecision, ctx, {
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
    }),
  );
}

async function putApprovalDecision(t: Backend, key: string) {
  await t.mutation(async (ctx) =>
    call(putDecision, ctx, {
      objectiveKey: key,
      decisionId: "dec_appr",
      data: {
        decisionId: "dec_appr", objectiveKey: key, contractRevision: 1, requirementKey: "req_1",
        kind: "satisfaction_strategy", strategy: "BUY", optionId: "opt_1",
        recommendation: { requirementKey: "req_1", contractRevision: 1, selectedOptionId: "opt_1", strongestAlternativeId: null, rationale: "buy it", materialAssumptions: [], changeMyMindEvidence: [] },
        authorization: { kind: "approval_required", requirementKey: "req_1", contractRevision: 1, question: "Approve $5?", reason: "spend_authority_required" },
        coarsePlanSummary: JSON.stringify({ original: "BUY", extra: { options: [] } }),
        consideredOptionIds: ["opt_1"], at: now,
      },
    }),
  );
}

async function putGate(t: Backend, key: string) {
  await t.mutation(async (ctx) =>
    call(putDecision, ctx, {
      objectiveKey: key,
      decisionId: `gate_${key}_r1`,
      data: {
        decisionId: `gate_${key}_r1`, objectiveKey: key, contractRevision: 1, requirementKey: "",
        kind: "completion_proposal", strategy: null, optionId: null, recommendation: null,
        authorization: { kind: "refused", requirementKey: "", contractRevision: 1, reasons: ["unknown"], detail: "placeholder" },
        coarsePlanSummary: JSON.stringify({ gateVerdict: { accepted: true } }),
        consideredOptionIds: [], at: now,
      },
    }),
  );
}

const workspace = async (t: Backend, key: string): Promise<Loose> =>
  (await t.query(async (ctx) => call(getObjectiveWorkspaceV1, ctx, { objectiveKey: key }))) as Loose;
const list = async (t: Backend): Promise<Loose> =>
  (await t.query(async (ctx) => call(getObjectiveListV1, ctx, {}))) as Loose;

const PRODUCT_STATUSES = ["starting", "working", "waiting", "needs_you", "verifying", "completed", "blocked"];

// ── Tests ────────────────────────────────────────────────────────────────────

test("workspace: missing key returns the exact not_found envelope", async () => {
  const t = convexTest(schema, modules);
  assert.deepEqual(await workspace(t, "obj_missing"), { found: false, contractVersion: 1, reason: "not_found" });
});

test("workspace: executing objective projects to a product view with no engine rows", async () => {
  const t = convexTest(schema, modules);
  const key = "obj_a";
  await seedObjective(t, key);
  await seedContract(t, key);
  await seedRequirement(t, key);
  await t.mutation(async (ctx) => {
    await call(upsertWorker, ctx, { workerKey: "wk_1", data: workerRow("wk_1", key), at: now });
    await call(putAssignment, ctx, { assignmentId: "asg_1", objectiveKey: key, data: assignmentRow(key) });
  });
  await putMakeDecision(t, key);

  const result = await workspace(t, key);
  assert.equal(result.found, true);
  assert.equal(result.contractVersion, 1);
  assert.equal(typeof result.viewRevision, "string");
  assert.equal(typeof result.generatedAt, "number");
  const view = result.view;
  assert.equal(view.objective.status, "working");
  assert.deepEqual(
    Object.keys(view).sort(),
    ["objective", "progress", "somebodyNow", "currentWork", "activity", "deliverables", "acquisitions", "attention", "availableActions"].sort(),
  );
  for (const forbidden of ["requirements", "assignments", "workers", "decisions", "intents", "external", "evidence", "xray"]) {
    assert.ok(!(forbidden in view), `view must not expose ${forbidden}`);
  }
  assert.ok(PRODUCT_STATUSES.includes(view.objective.status));
});

test("workspace: viewRevision is stable without data change and changes with source", async () => {
  const t = convexTest(schema, modules);
  const key = "obj_rev";
  await seedObjective(t, key);
  await seedContract(t, key);
  await seedRequirement(t, key);
  const first = await workspace(t, key);
  const second = await workspace(t, key);
  assert.equal(first.viewRevision, second.viewRevision);

  await seedRequirement(t, key, { requirementKey: "req_2", title: "Second required item" });
  const third = await workspace(t, key);
  assert.notEqual(third.viewRevision, first.viewRevision);
});

test("workspace: completed row without gate is verifying; with accepting gate it is completed and listed done", async () => {
  const t = convexTest(schema, modules);
  const key = "obj_done";
  await seedObjective(t, key, { state: "completed", result: { summary: "Pack verified and accepted", fit: "fit", risks: [], unknowns: [], recommendedNextAction: "publish", completedAt: now } });
  await seedContract(t, key);
  await seedRequirement(t, key);

  const before = await workspace(t, key);
  assert.equal(before.view.objective.status, "verifying");
  const beforeList = await list(t);
  assert.equal(beforeList.view.done.length, 0);

  await putGate(t, key);
  const after = await workspace(t, key);
  assert.equal(after.view.objective.status, "completed");
  const afterList = await list(t);
  assert.deepEqual(afterList.view.done.map((row: Loose) => row.id), [key]);
});

test("workspace: pending approval with no wired product command is waiting, not needs_you", async () => {
  const t = convexTest(schema, modules);
  const key = "obj_appr";
  await seedObjective(t, key);
  await seedContract(t, key);
  await seedRequirement(t, key);
  await putApprovalDecision(t, key);

  const { view } = await workspace(t, key);
  assert.equal(view.attention, null, "no legal founder action exists, so no Attention");
  assert.equal(view.objective.status, "waiting");
  assert.equal(view.somebodyNow.state, "waiting");
  const listed = await list(t);
  assert.equal(listed.view.needsYou.length, 0);
  const entry = listed.view.inProgress.find((row: Loose) => row.id === key);
  assert.ok(entry);
  assert.equal(entry.hasAttention, false);
  assert.equal(entry.status, "waiting");
});

test("workspace: blocked required requirement is blocked with null attention, listed in progress", async () => {
  const t = convexTest(schema, modules);
  const key = "obj_blk";
  await seedObjective(t, key);
  await seedContract(t, key);
  await seedRequirement(t, key, { state: "blocked", blockedReason: "No source available" });

  const { view } = await workspace(t, key);
  assert.equal(view.objective.status, "blocked");
  assert.equal(view.attention, null);
  const listed = await list(t);
  assert.ok(listed.view.inProgress.some((row: Loose) => row.id === key));
});

test("list: groups needsYou/done/inProgress, sorts updatedAt desc then id, exposes summaries only", async () => {
  const t = convexTest(schema, modules);
  await seedObjective(t, "obj_done", { state: "completed", updatedAt: now + 10 });
  await seedContract(t, "obj_done");
  await seedRequirement(t, "obj_done");
  await putGate(t, "obj_done");

  await seedObjective(t, "obj_ny", { updatedAt: now + 20 });
  await seedContract(t, "obj_ny");
  await seedRequirement(t, "obj_ny");
  await putApprovalDecision(t, "obj_ny");

  await seedObjective(t, "obj_p_old", { updatedAt: now + 30 });
  await seedContract(t, "obj_p_old");
  await seedObjective(t, "obj_p_new", { updatedAt: now + 40 });
  await seedContract(t, "obj_p_new");

  const result = await list(t);
  assert.equal(result.found, true);
  assert.equal(result.contractVersion, 1);
  const view = result.view;
  assert.deepEqual(view.needsYou.map((row: Loose) => row.id), [], "needs_you requires a legal action; none is wired");
  assert.deepEqual(view.done.map((row: Loose) => row.id), ["obj_done"]);
  assert.deepEqual(view.inProgress.map((row: Loose) => row.id), ["obj_p_new", "obj_p_old", "obj_ny"]);
  for (const row of [...view.needsYou, ...view.done, ...view.inProgress]) {
    assert.deepEqual(Object.keys(row).sort(), ["hasAttention", "id", "status", "statusLabel", "title", "updatedAt"]);
  }
});

test("capabilities: returns the fixed start capabilities in the found envelope", async () => {
  const t = convexTest(schema, modules);
  const result = (await t.query(async (ctx) => call(getStartCapabilitiesV1, ctx, {}))) as Loose;
  assert.equal(result.found, true);
  assert.equal(result.contractVersion, 1);
  assert.deepEqual(result.view, {
    canCreateObjective: false,
    supportsContextRefs: false,
    supportsAttachments: false,
    advanced: { spendLimit: false, deadline: false, externalEffectPolicy: false },
  });
});

test("workspace: handed_off BUY intent is in_progress with no transaction and no provenance", async () => {
  const t = convexTest(schema, modules);
  const key = "obj_buy";
  await seedObjective(t, key);
  await seedContract(t, key);
  await seedRequirement(t, key);
  await t.mutation(async (ctx) => {
    await call(putIntent, ctx, { intentId: "intent_1", objectiveKey: key, idempotencyKey: "idem_1", data: intentRow(key) });
  });
  const { view } = await workspace(t, key);
  const acquisition = view.acquisitions.find((row: Loose) => row.id === "intent_1");
  assert.ok(acquisition);
  assert.equal(acquisition.status, "in_progress");
  assert.ok(!("transaction" in acquisition));
  assert.ok(!("provenance" in acquisition), "provenance is absent before a persisted result");
});
