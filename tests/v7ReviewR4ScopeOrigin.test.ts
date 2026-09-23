// V7 review R4 FINAL scope-origin correction.
//
// R4's authority check (Requirement.authorizedPurposeKinds) was already
// correct; the defect was that PRODUCTION never created that authority — only
// a test-only putRequirement() patch did. This file proves the real origin:
//
//   setupCanonicalDemoObjective (application setup, never the model)
//     → Objective.management.authorizedPurposePolicy
//     → beginInterpretation / applyInterpretation (production mutations; the
//       model supplies rawContract/rawRequirements exactly like every other
//       test in this repo — no live model call exists anywhere here)
//     → bindAuthorizedPurposePolicy binds the policy onto the ONE
//       structurally-targeted Requirement (requirementKind match only —
//       never prose)
//     → persisted Requirement.authorizedPurposeKinds
//     → reportMissingInput / grounding (already-reviewed R4 mechanics,
//       unchanged and untouched here).
//
// NO manual putRequirement authority patch exists anywhere in this file.
import test, { mock, after as afterAll } from "node:test";
import assert from "node:assert/strict";
import { convexTest } from "convex-test";
import schema from "../convex/schema";
import { applyInterpretation, beginInterpretation } from "../convex/management";
import { reportMissingInput, setupCanonicalDemoObjective } from "../convex/objectives";
import { initBudget, readDecisionContext } from "../convex/internal/workforce";
import { buildDecisionPassInput, type DecisionPassReads } from "../lib/management/decisionPass";
import { runManagerialDecisionPass } from "../lib/management/decision";
import { CANONICAL_AUTHORIZED_PURPOSE_POLICY } from "../lib/objective/seedData";
import { M3_PRODUCT_FULFILLMENT_SCOPE } from "../lib/payment/m3FounderNarrativeProduct";
import type { GroundedOption, Requirement } from "../lib/management/types";
import type { ObjectiveRecord, WorkContract } from "../lib/objective/types";
import type { ResourceNeed } from "../lib/objective/resourceNeed";

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

const now = 1_995_000_000_000;
const OPERATOR_TOKEN = "v7-scope-origin-operator-token";
const SUPPORTED = "founder_messaging_qualitative";

type Backend = ReturnType<typeof convexTest>;
type Handler = { _handler: (c: unknown, a: Record<string, unknown>) => Promise<unknown> };

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

const rawContractFor = (intent: string) => ({
  intent,
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
});

/**
 * Runs interpretation through the REAL production mutations — the durable
 * two-step seam every other test in this repo uses in place of a live model
 * call (beginInterpretation reserves; applyInterpretation parses + binds
 * authority + persists). Nothing here touches a Requirement directly.
 */
async function interpret(t: Backend, key: string, rawRequirements: unknown[]) {
  const begin = (await t.mutation(async (ctx) =>
    (beginInterpretation as unknown as Handler)._handler(ctx, {
      objectiveKey: key,
      at: now,
    }),
  )) as { proceed: boolean; requestId?: string; reason?: string };
  assert.equal(begin.proceed, true, begin.reason);
  const applied = (await t.mutation(async (ctx) =>
    (applyInterpretation as unknown as Handler)._handler(ctx, {
      objectiveKey: key,
      requestId: begin.requestId!,
      rawContract: rawContractFor("deliver a relaunch recommendation"),
      rawRequirements,
      founderResolvedQuestions: [],
      at: now,
    }),
  )) as { ok: boolean; errors?: string[] };
  assert.equal(applied.ok, true, applied.errors?.join("; "));
}

/** A general (non-canonical) Objective row: no application policy at all. */
async function seedGeneral(t: Backend, key: string, request: string) {
  await t.mutation(async (ctx) => {
    await ctx.db.insert("objectives", {
      key,
      data: {
        key,
        request,
        createdAt: now,
        updatedAt: now,
        state: "received",
        activity: "new",
        plan: null,
        workItems: [],
        run: null,
        result: null,
        companyArtifacts: [],
        management: { contractId: null },
      } as never,
    });
    await (initBudget as unknown as Handler)._handler(ctx, { objectiveKey: key, at: now });
  });
}

const deliverableProposal = (requirementKey: string, prose?: Partial<{ title: string; mustBeTrue: string; scope: string; expectedOutput: string }>) => ({
  requirementKey,
  priority: "required",
  title: prose?.title ?? "Relaunch recommendation delivered",
  mustBeTrue: prose?.mustBeTrue ?? "a versioned relaunch recommendation artifact is saved",
  scope: prose?.scope ?? "founder-facing deliverable",
  expectedOutput: prose?.expectedOutput ?? "saved relaunch recommendation",
  requirementKind: "deliverable",
});

const inputProposal = (requirementKey: string, prose?: Partial<{ title: string; mustBeTrue: string; scope: string; expectedOutput: string }>) => ({
  requirementKey,
  priority: "required",
  title: prose?.title ?? "Owned evidence gathered",
  mustBeTrue: prose?.mustBeTrue ?? "sufficient owned evidence is on record",
  scope: prose?.scope ?? "owned research input",
  expectedOutput: prose?.expectedOutput ?? "recorded evidence",
  requirementKind: "input",
});

/** Wires a lightweight running workItem/run onto an existing Objective row so
 * reportMissingInput has an execution surface to validate against — test-only
 * scaffolding for the EXECUTION context, never for the authority under test
 * (mirrors the established pattern in tests/v7ReviewR4PurposeScope.test.ts). */
function workContract(): WorkContract {
  return {
    assignment: "Obtain sufficient accepted evidence",
    idempotencyScope: "scope_v7_origin",
    workerKey: "worker_research",
    capabilityKeys: ["public_information_research", "company_records_lookup"],
    allowedToolPermissions: [
      "read_company_record",
      "read_public_web",
      "record_finding",
      "request_resource",
      "submit_result",
      "request_completion",
    ],
    requiredSourceClasses: ["company_record", "public_web"],
    minObservations: 2,
    sourceProofs: [
      { sourceClass: "company_record", minDistinctSources: 1 },
      { sourceClass: "public_web", minDistinctSources: 1 },
    ],
    requiredVerifiedEffectKeys: [],
    approvalVersion: null,
    resultRequirements: {
      summary: true,
      fit: true,
      risks: true,
      unknowns: true,
      recommendedNextAction: true,
    },
  };
}

async function attachRunningWorkItem(t: Backend, key: string) {
  const runId = `run_${key}`;
  const wiId = `wi_${key}`;
  const run = {
    id: runId,
    workItemId: wiId,
    status: "running",
    startedAt: now,
    leaseUntil: now + 60_000,
    model: "mock",
    modelSelectionReason: "test",
    toolCalls: 0,
    summary: "",
  };
  await t.run(async (ctx) => {
    const row = await ctx.db.query("objectives").withIndex("by_key", (q) => q.eq("key", key)).unique();
    const data = (row as { data: ObjectiveRecord }).data;
    await ctx.db.patch(row!._id, {
      data: {
        ...data,
        state: "executing",
        workItems: [
          {
            id: wiId,
            objectiveKey: key,
            title: "Evidence",
            assignment: workContract().assignment,
            workerKey: "worker_research",
            state: "running",
            contract: workContract(),
            runs: [run],
          },
        ],
        run,
      } as never,
    });
    await ctx.db.insert("evidence", {
      objectiveKey: key,
      evidenceId: `ev_rec_${key}`,
      data: {
        sourceClass: "company_record",
        label: "input_check:NOT_AVAILABLE",
        text: "availability: NOT_AVAILABLE. not found — zero usable sources",
        recordRef: "missing_audience_language",
        observedAt: now,
        recordedBy: "app",
        runId,
        origin: "application_observation",
        sourceId: `src_rec_${key}`,
      },
    });
    await ctx.db.insert("evidence", {
      objectiveKey: key,
      evidenceId: `ev_web_${key}`,
      data: {
        sourceClass: "public_web",
        label: "Public page",
        text: "no usable public content",
        url: "https://example.com/empty",
        observedAt: now,
        recordedBy: "app",
        runId,
        origin: "application_observation",
        sourceId: `src_web_${key}`,
      },
    });
  });
  return { runId, wiId, evidenceIds: [`ev_rec_${key}`, `ev_web_${key}`] };
}

async function report(
  t: Backend,
  key: string,
  requirementKey: string,
  ids: { runId: string; wiId: string; evidenceIds: string[] },
  purposeKind?: string,
  resourceClass = "proprietary_data",
) {
  return (await t.run(async (ctx) =>
    (reportMissingInput as unknown as Handler)._handler(ctx, {
      objectiveKey: key,
      runId: ids.runId,
      requirementKey,
      workItemId: ids.wiId,
      proposal: {
        inputCheckId: "evidence_sufficiency",
        resourceClass,
        purpose: "What evidence is missing?",
        reasonOwnedInsufficient: "owned records and public pages returned no usable sources",
        supportingEvidenceIds: ids.evidenceIds,
        ...(purposeKind !== undefined ? { purposeKind } : {}),
      },
    }),
  )) as { validated: boolean; refusalCode: string | null; needId: string | null };
}

const storedNeeds = async (t: Backend, key: string) =>
  (await readObj(t, key)).resourceNeeds as ResourceNeed[] | undefined;

async function ground(t: Backend, key: string, requirementKey: string) {
  const reads = (await t.run(async (ctx) =>
    (readDecisionContext as unknown as Handler)._handler(ctx, {
      objectiveKey: key,
      requirementKey,
    }),
  )) as DecisionPassReads;
  const built = await buildDecisionPassInput(
    { ...reads, at: now, decisionId: `dec_${key}` },
    {
      strategy: "BUY",
      desiredCapabilities: ["public_information_research"],
      needsExternalResourceClass: "proprietary_data",
      notes: null,
    },
    async (eligible) => {
      const pick = eligible.find((o) => o.eligibility.eligible);
      return pick
        ? {
            requirementKey,
            contractRevision: 1,
            selectedOptionId: pick.optionId,
            rationale: "test double picks the first eligible option",
            materialAssumptions: [],
            changeMyMindEvidence: [],
          }
        : null;
    },
  );
  assert.equal(built.ok, true);
  if (!built.ok) throw new Error("build");
  const result = await runManagerialDecisionPass(built.input);
  return { reads, options: result.options };
}

const productOption = (options: GroundedOption[]) =>
  options.find((o) => o.external?.serviceId === "founder_narrative_pulse");

test("R4 adapter/taxonomy sanity: the demo policy's kind is exactly what the adapter declares", () => {
  assert.deepEqual([...M3_PRODUCT_FULFILLMENT_SCOPE.purposeKinds], [SUPPORTED]);
  assert.equal(CANONICAL_AUTHORIZED_PURPOSE_POLICY.purposeKind, SUPPORTED);
  assert.equal(CANONICAL_AUTHORIZED_PURPOSE_POLICY.targetRequirementKind, "deliverable");
});

test("scope-origin: setupCanonicalDemoObjective's real policy — not a test patch — is what applyInterpretation binds onto the persisted Requirement", async () => {
  const t = convexTest(schema, modules);
  const previousToken = process.env.SOMEBODY_DEMO_OPERATOR_TOKEN;
  process.env.SOMEBODY_DEMO_OPERATOR_TOKEN = OPERATOR_TOKEN;
  try {
    const setup = (await t.mutation(async (ctx) =>
      (setupCanonicalDemoObjective as unknown as Handler)._handler(ctx, {
        operatorToken: OPERATOR_TOKEN,
        spendLimitUsd: 3,
      }),
    )) as { key: string };
    const key = setup.key;

    // The policy exists BEFORE any interpretation ran — application setup
    // code, never the model, wrote it.
    const seeded = await readObj(t, key);
    assert.deepEqual(
      seeded.management.authorizedPurposePolicy,
      CANONICAL_AUTHORIZED_PURPOSE_POLICY,
    );
    const reqsBefore = await readReqs(t, key);
    assert.equal(reqsBefore.length, 0, "no Requirement exists until interpretation runs");

    await interpret(t, key, [deliverableProposal("req_relaunch_live")]);

    const reqs = await readReqs(t, key);
    assert.equal(reqs.length, 1);
    assert.deepEqual(
      reqs[0]!.authorizedPurposeKinds,
      [SUPPORTED],
      "PRODUCTION (applyInterpretation binding the setup-recorded policy) originated this — no putRequirement patch exists in this file",
    );

    // Full downstream chain, unchanged from the already-reviewed R4 mechanics:
    // worker proposal → validated ResourceNeed → grounded eligible product.
    const ids = await attachRunningWorkItem(t, key);
    const rep = await report(t, key, "req_relaunch_live", ids, SUPPORTED);
    assert.equal(rep.validated, true);
    const [need] = (await storedNeeds(t, key)) ?? [];
    assert.deepEqual(need!.requestedScope, { purposeKind: SUPPORTED, authority: "application" });
    const { options } = await ground(t, key, "req_relaunch_live");
    const product = productOption(options);
    assert.equal(product?.external?.purposeScopeCompatible, true);
    assert.equal(product?.eligibility.eligible, true, "all other existing gates allow it");
  } finally {
    if (previousToken === undefined) delete process.env.SOMEBODY_DEMO_OPERATOR_TOKEN;
    else process.env.SOMEBODY_DEMO_OPERATOR_TOKEN = previousToken;
  }
});

test("R4-scope-A/D: a general Objective with no application policy stays fail-closed, even though the adapter declares the exact kind proposed", async () => {
  const t = convexTest(schema, modules);
  const key = "obj_scope_general";
  await seedGeneral(t, key, "Translate our developer documentation into Japanese.");
  await interpret(t, key, [
    {
      requirementKey: "req_translate",
      priority: "required",
      title: "Docs translated",
      mustBeTrue: "our developer documentation is translated into Japanese",
      scope: "founder-facing deliverable",
      expectedOutput: "translated developer documentation",
      requirementKind: "deliverable",
    },
  ]);
  const reqs = await readReqs(t, key);
  assert.equal(reqs[0]!.authorizedPurposeKinds ?? undefined, undefined, "no policy exists to bind");

  const ids = await attachRunningWorkItem(t, key);
  // The worker proposes exactly the kind the adapter declares — still refused:
  // an adapter's own declaration can never create Requirement authority.
  const rep = await report(t, key, "req_translate", ids, SUPPORTED);
  assert.equal(rep.validated, false);
  assert.equal(rep.refusalCode, "purpose_scope_not_authorized");
  assert.equal((await storedNeeds(t, key))?.length ?? 0, 0, "no ResourceNeed, no scope, nothing coerced");

  const { options } = await ground(t, key, "req_translate");
  const product = productOption(options);
  assert.equal(product?.eligibility.eligible, false, "adapter scope declaration never creates request authority");
});

test("R4-scope-B: only the structurally-targeted Requirement in a scoped Objective receives the grant; an unrelated Requirement stays unscoped", async () => {
  const t = convexTest(schema, modules);
  const key = "obj_scope_multi";
  await seedGeneral(t, key, "Relaunch our messaging AND separately gather owned research notes.");
  await t.mutation(async (ctx) => {
    const row = await ctx.db.query("objectives").withIndex("by_key", (q) => q.eq("key", key)).unique();
    const data = (row as { data: ObjectiveRecord & { management: Record<string, unknown> } }).data;
    await ctx.db.patch(row!._id, {
      data: { ...data, management: { ...data.management, authorizedPurposePolicy: CANONICAL_AUTHORIZED_PURPOSE_POLICY } },
    } as never);
  });

  await interpret(t, key, [
    deliverableProposal("req_multi_deliverable"), // structurally targeted
    inputProposal("req_multi_input"), // unrelated — must stay unscoped
  ]);

  const reqs = await readReqs(t, key);
  const deliverable = reqs.find((r) => r.requirementKey === "req_multi_deliverable")!;
  const input = reqs.find((r) => r.requirementKey === "req_multi_input")!;
  assert.deepEqual(deliverable.authorizedPurposeKinds, [SUPPORTED]);
  assert.equal(input.authorizedPurposeKinds ?? undefined, undefined, "unrelated Requirement must remain unscoped");

  const ids = await attachRunningWorkItem(t, key);
  const repUnrelated = await report(t, key, "req_multi_input", ids, SUPPORTED);
  assert.equal(repUnrelated.validated, false);
  assert.equal(repUnrelated.refusalCode, "purpose_scope_not_authorized");
});

test("R4-scope-C: a worker-proposed kind the policy did not grant is refused even when this Requirement is otherwise authorized", async () => {
  const t = convexTest(schema, modules);
  const key = "obj_scope_unapproved_kind";
  await seedGeneral(t, key, "Our launch messaging isn't working; get a better relaunch ready.");
  await t.mutation(async (ctx) => {
    const row = await ctx.db.query("objectives").withIndex("by_key", (q) => q.eq("key", key)).unique();
    const data = (row as { data: ObjectiveRecord & { management: Record<string, unknown> } }).data;
    await ctx.db.patch(row!._id, {
      data: { ...data, management: { ...data.management, authorizedPurposePolicy: CANONICAL_AUTHORIZED_PURPOSE_POLICY } },
    } as never);
  });
  await interpret(t, key, [deliverableProposal("req_kind_check")]);
  const reqs = await readReqs(t, key);
  assert.deepEqual(reqs[0]!.authorizedPurposeKinds, [SUPPORTED]);

  const ids = await attachRunningWorkItem(t, key);
  const rep = await report(t, key, "req_kind_check", ids, "quantitative_conversion_uplift");
  assert.equal(rep.validated, false);
  assert.equal(rep.refusalCode, "unknown_purpose_scope", "an ungoverned/unapproved kind is refused regardless of this Requirement's real authority");
});

test("R4-scope-E: paraphrasing Requirement prose neither creates nor removes the application-owned grant", async () => {
  const t = convexTest(schema, modules);

  const keyA = "obj_scope_prose_a";
  await seedGeneral(t, keyA, "Relaunch messaging needs work.");
  await t.mutation(async (ctx) => {
    const row = await ctx.db.query("objectives").withIndex("by_key", (q) => q.eq("key", keyA)).unique();
    const data = (row as { data: ObjectiveRecord & { management: Record<string, unknown> } }).data;
    await ctx.db.patch(row!._id, {
      data: { ...data, management: { ...data.management, authorizedPurposePolicy: CANONICAL_AUTHORIZED_PURPOSE_POLICY } },
    } as never);
  });
  await interpret(t, keyA, [
    deliverableProposal("req_prose_a", {
      title: "Customer wording",
      mustBeTrue: "the copy reflects how our target customers put the problem in their own words",
      expectedOutput: "saved copy recommendation",
    }),
  ]);
  const reqsA = await readReqs(t, keyA);
  assert.deepEqual(
    reqsA[0]!.authorizedPurposeKinds,
    [SUPPORTED],
    "an authorized Requirement needs no signal words — the grant follows requirementKind, not prose",
  );

  const keyB = "obj_scope_prose_b";
  await seedGeneral(t, keyB, "Benchmark the founder dashboard message queue workflow for clarity.");
  await interpret(t, keyB, [
    inputProposal("req_prose_b", {
      title: "Founder perception",
      mustBeTrue: "benchmark the founder dashboard message queue workflow for clarity",
      expectedOutput: "benchmark report",
    }),
  ]);
  const reqsB = await readReqs(t, keyB);
  assert.equal(
    reqsB[0]!.authorizedPurposeKinds ?? undefined,
    undefined,
    "prose packed with former signal words never grants scope on its own — no policy was bound to this Objective at all",
  );
});
