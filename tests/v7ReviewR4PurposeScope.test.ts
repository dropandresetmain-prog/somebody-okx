// V7 final-review correction R4 — structured purpose authority in the ACTUAL
// path. Every case runs the real chain:
//   reportMissingInput (application validation of the worker proposal)
//   → stored ResourceNeed → readDecisionContext (open-need projection)
//   → buildDecisionPassInput → buildGroundingContext → groundRegistryOfferings
//   → externalOfferingAcceptsPurpose → runManagerialDecisionPass eligibility.
// No live model: the strategy proposal and the recommendation are test doubles.
// No payment, merchant, provider or network call exists on this path.
import test, { mock, after as afterAll } from "node:test";
import assert from "node:assert/strict";
import { convexTest } from "convex-test";
import schema from "../convex/schema";
import { reportMissingInput } from "../convex/objectives";
import { putContract, putRequirement, initBudget, readDecisionContext } from "../convex/internal/workforce";
import { buildOutcomeContract } from "../lib/management/contract";
import { buildDecisionPassInput, type DecisionPassReads } from "../lib/management/decisionPass";
import { runManagerialDecisionPass } from "../lib/management/decision";
import { GOVERNED_PURPOSE_KINDS } from "../lib/workforce/catalog";
import { M3_PRODUCT_FULFILLMENT_SCOPE } from "../lib/payment/m3FounderNarrativeProduct";
import type { OutcomeContract, Requirement, GroundedOption } from "../lib/management/types";
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

const now = 1_990_000_000_000;
const REQ = "req_scope";
const SUPPORTED = "founder_messaging_qualitative";
type Handler = { _handler: (c: unknown, a: Record<string, unknown>) => Promise<unknown> };

function contractFor(key: string): OutcomeContract {
  const built = buildOutcomeContract({
    objectiveKey: key, contractId: `contract_${key}`, revision: 1,
    parsed: {
      intent: "gather accepted evidence then produce a controlled artifact",
      levels: [
        { levelKey: "evidence", order: 1, statement: "sufficient accepted evidence is on record", label: "Evidence" },
        { levelKey: "artifact", order: 2, statement: "controlled artifact exists using accepted evidence", label: "Artifact" },
      ],
      minimumCompletionBar: "artifact", ambiguities: [],
    },
    requestId: `req_${key}`, founderResolvedQuestions: [], at: now,
  });
  if (!built.ok) throw new Error("contract");
  return built.contract;
}

function workContract(): WorkContract {
  return {
    assignment: "Obtain sufficient accepted evidence", idempotencyScope: "scope_v7_r4", workerKey: "worker_research",
    capabilityKeys: ["public_information_research", "company_records_lookup"],
    allowedToolPermissions: ["read_company_record", "read_public_web", "record_finding", "request_resource", "submit_result", "request_completion"],
    requiredSourceClasses: ["company_record", "public_web"], minObservations: 2,
    sourceProofs: [{ sourceClass: "company_record", minDistinctSources: 1 }, { sourceClass: "public_web", minDistinctSources: 1 }],
    requiredVerifiedEffectKeys: [], approvalVersion: null,
    resultRequirements: { summary: true, fit: true, risks: true, unknowns: true, recommendedNextAction: true },
  };
}

/** Seeds one Objective whose Requirement text is `mustBeTrue`/`expectedOutput` (descriptive prose). */
async function seed(t: ReturnType<typeof convexTest>, key: string, prose: { mustBeTrue: string; expectedOutput: string; title: string }) {
  const contract = contractFor(key);
  const requirement: Requirement = {
    requirementKey: REQ, objectiveKey: key, contractId: contract.contractId, contractRevision: 1, priority: "required",
    title: prose.title, mustBeTrue: prose.mustBeTrue, scope: "owned then external if needed", dependsOnRequirementKeys: [],
    requiredResourceClasses: [], expectedOutput: prose.expectedOutput, proofs: [], state: "active", strategy: null,
    resolution: null, blockedReason: null, waiver: null, revision: 1, createdAt: now, updatedAt: now,
  };
  const runId = `run_${key}`;
  const wiId = `wi_${key}`;
  const run = { id: runId, workItemId: wiId, status: "running", startedAt: now, leaseUntil: now + 60_000, model: "mock", modelSelectionReason: "test", toolCalls: 0, summary: "" };
  await t.run(async (ctx) => {
    await ctx.db.insert("objectives", {
      key,
      data: {
        key, request: "Produce a sourced note", createdAt: now, updatedAt: now, state: "executing", activity: "MAKE evidence attempt",
        plan: null, workItems: [{ id: wiId, objectiveKey: key, title: "Evidence", assignment: workContract().assignment, workerKey: "worker_research", state: "running", contract: workContract(), runs: [run] }],
        run, result: null, resourceNeeds: [], management: { contractId: contract.contractId, decisionAttempts: {} },
      } as unknown as ObjectiveRecord & { management: Record<string, unknown> },
    });
    await ctx.db.insert("evidence", {
      objectiveKey: key, evidenceId: "ev_rec",
      data: { sourceClass: "company_record", label: "input_check:NOT_AVAILABLE", text: "availability: NOT_AVAILABLE. not found — zero usable sources", recordRef: "missing_audience_language", observedAt: now, recordedBy: "app", runId, origin: "application_observation", sourceId: "src_rec" },
    });
    await ctx.db.insert("evidence", {
      objectiveKey: key, evidenceId: "ev_web",
      data: { sourceClass: "public_web", label: "Public page", text: "no usable public content", url: "https://example.com/empty", observedAt: now, recordedBy: "app", runId, origin: "application_observation", sourceId: "src_web" },
    });
  });
  await t.run(async (ctx) => {
    await (putContract as unknown as Handler)._handler(ctx, { objectiveKey: key, contractId: contract.contractId, revision: 1, data: contract });
    await (putRequirement as unknown as Handler)._handler(ctx, { objectiveKey: key, requirementKey: REQ, data: requirement, currentContractRevision: 1 });
    await (initBudget as unknown as Handler)._handler(ctx, { objectiveKey: key, at: now });
    await ctx.db.insert("founderSpendGrants", {
      approvalId: `appr_${key}`, objectiveKey: key,
      data: { approvalId: `appr_${key}`, objectiveKey: key, limitUsd: 25, grantedAt: now, revokedAt: null, note: "test grant" },
    });
  });
  return { runId, wiId };
}

async function report(t: ReturnType<typeof convexTest>, key: string, ids: { runId: string; wiId: string }, purpose: string, purposeKind?: string, resourceClass = "proprietary_data") {
  return (await t.run(async (ctx) => (reportMissingInput as unknown as Handler)._handler(ctx, {
    objectiveKey: key, runId: ids.runId, requirementKey: REQ, workItemId: ids.wiId,
    proposal: {
      inputCheckId: "evidence_sufficiency", resourceClass, purpose,
      reasonOwnedInsufficient: "owned records and public pages returned no usable audience-language sources",
      supportingEvidenceIds: ["ev_rec", "ev_web"],
      ...(purposeKind !== undefined ? { purposeKind } : {}),
    },
  }))) as { validated: boolean; refusalCode: string | null; needId: string | null };
}

/** Runs the REAL decision-pass grounding for this Objective; the model doubles never force a strategy. */
async function ground(t: ReturnType<typeof convexTest>, key: string): Promise<{ reads: DecisionPassReads; options: GroundedOption[] }> {
  const reads = (await t.run(async (ctx) => (readDecisionContext as unknown as Handler)._handler(ctx, { objectiveKey: key, requirementKey: REQ }))) as DecisionPassReads;
  const built = await buildDecisionPassInput(
    { ...reads, at: now, decisionId: `dec_${key}` },
    { strategy: "BUY", desiredCapabilities: ["public_information_research"], needsExternalResourceClass: "proprietary_data", notes: null },
    async (eligible) => {
      const pick = eligible.find((o) => o.eligibility.eligible);
      return pick
        ? { requirementKey: REQ, contractRevision: 1, selectedOptionId: pick.optionId, rationale: "test double picks the first eligible option", materialAssumptions: [], changeMyMindEvidence: [] }
        : null;
    },
  );
  assert.equal(built.ok, true);
  if (!built.ok) throw new Error("build");
  const result = await runManagerialDecisionPass(built.input);
  return { reads, options: result.options };
}
const productOption = (options: GroundedOption[]) => options.find((o) => o.external?.serviceId === "founder_narrative_pulse");
const storedNeeds = async (t: ReturnType<typeof convexTest>, key: string) =>
  (await t.run(async (ctx) => {
    const row = await ctx.db.query("objectives").withIndex("by_key", (q) => q.eq("key", key)).unique();
    return ((row as { data: ObjectiveRecord }).data.resourceNeeds ?? []) as ResourceNeed[];
  }));

const RELAUNCH = { title: "Audience language", mustBeTrue: "the relaunch copy is grounded in how solo founders describe the problem", expectedOutput: "saved relaunch recommendation" };

test("R4: the adapter declares only governed kinds (one taxonomy, no second vocabulary)", () => {
  for (const kind of M3_PRODUCT_FULFILLMENT_SCOPE.purposeKinds) assert.ok(GOVERNED_PURPOSE_KINDS.includes(kind));
});

test("R4: a supported, application-validated structured scope is eligible through the real grounding path", async () => {
  const t = convexTest(schema, modules);
  const key = "obj_r4_supported";
  const ids = await seed(t, key, RELAUNCH);
  const rep = await report(t, key, ids, "How do solo founders phrase launch pain?", SUPPORTED);
  assert.equal(rep.validated, true);
  const [need] = await storedNeeds(t, key);
  assert.deepEqual(need!.requestedScope, { purposeKind: SUPPORTED, authority: "application" });
  const { reads, options } = await ground(t, key);
  assert.equal(reads.openResourceNeeds?.[0]?.requestedPurposeKind, SUPPORTED);
  const product = productOption(options);
  assert.equal(product?.external?.purposeScopeCompatible, true);
  assert.equal(product?.eligibility.eligible, true, "all other existing gates allow it");
});

test("R4: missing scope fails closed — the same prose that used to match by keyword is NOT compatible", async () => {
  const t = convexTest(schema, modules);
  const key = "obj_r4_missing";
  const ids = await seed(t, key, RELAUNCH); // prose contains 'relaunch'/'founders' (former signal words)
  const rep = await report(t, key, ids, "How do solo founders phrase launch pain?");
  assert.equal(rep.validated, true, "the gap itself is still a validated need");
  const [need] = await storedNeeds(t, key);
  assert.equal(need!.requestedScope, undefined, "no scope is invented for the need");
  const { reads, options } = await ground(t, key);
  assert.equal(reads.openResourceNeeds?.[0]?.requestedPurposeKind, null);
  const product = productOption(options);
  assert.ok(product, "the offering is still grounded (visible), just not compatible");
  assert.equal(product!.external!.purposeScopeCompatible, false);
  assert.equal(product!.eligibility.eligible, false);
});

test("R4: equivalent paraphrases do not change authoritative compatibility; unrelated signal-word prose does not become eligible", async () => {
  const t = convexTest(schema, modules);
  const cases: Array<{ key: string; prose: typeof RELAUNCH; kind?: string; expected: boolean }> = [
    // Paraphrases with the validated scope — including one with NONE of the former signal words.
    { key: "obj_r4_para_a", prose: RELAUNCH, kind: SUPPORTED, expected: true },
    { key: "obj_r4_para_b", prose: { title: "Customer wording", mustBeTrue: "the copy reflects how our target customers put the problem in their own words", expectedOutput: "saved copy recommendation" }, kind: SUPPORTED, expected: true },
    // Unrelated requests packed with former signal words, no validated scope.
    { key: "obj_r4_unrelated_a", prose: { title: "Workflow language", mustBeTrue: "translate the launch workflow docs into another language with message clarity", expectedOutput: "translated workflow docs" }, expected: false },
    { key: "obj_r4_unrelated_b", prose: { title: "Founder perception", mustBeTrue: "benchmark the founder dashboard message queue workflow for clarity", expectedOutput: "benchmark report" }, expected: false },
  ];
  for (const c of cases) {
    const ids = await seed(t, c.key, c.prose);
    const rep = await report(t, c.key, ids, "What evidence is missing?", c.kind);
    assert.equal(rep.validated, true, c.key);
    const product = productOption((await ground(t, c.key)).options);
    assert.equal(product?.external?.purposeScopeCompatible, c.expected, c.key);
    assert.equal(product?.eligibility.eligible, c.expected, c.key);
  }
});

test("R4: unknown or class-inapplicable scope is refused by the application — never coerced to the supported kind", async () => {
  const t = convexTest(schema, modules);
  const key = "obj_r4_unknown";
  const ids = await seed(t, key, RELAUNCH);
  const unknown = await report(t, key, ids, "How do solo founders phrase launch pain?", "quantitative_conversion_uplift");
  assert.equal(unknown.validated, false);
  assert.equal(unknown.refusalCode, "unknown_purpose_scope");
  const inapplicable = await report(t, key, ids, "How do solo founders phrase launch pain?", SUPPORTED, "privileged_access");
  assert.equal(inapplicable.validated, false);
  assert.equal(inapplicable.refusalCode, "purpose_scope_class_mismatch");
  assert.equal((await storedNeeds(t, key)).length, 0, "no need, no scope, nothing coerced");
});

test("R4: conflicting requested vs fulfilled scope refuses — a stored non-governed or tampered scope never reaches grounding", async () => {
  const t = convexTest(schema, modules);
  const key = "obj_r4_conflict";
  const ids = await seed(t, key, RELAUNCH);
  assert.equal((await report(t, key, ids, "How do solo founders phrase launch pain?", SUPPORTED)).validated, true);
  // Tamper the stored row: a kind the adapter does not declare / not application-owned.
  for (const tampered of [
    { purposeKind: "quantitative_conversion_uplift", authority: "application" },
    { purposeKind: SUPPORTED, authority: "worker" },
  ]) {
    await t.run(async (ctx) => {
      const row = await ctx.db.query("objectives").withIndex("by_key", (q) => q.eq("key", key)).unique();
      const data = (row as { data: ObjectiveRecord }).data;
      const needs = (data.resourceNeeds ?? []).map((n) => ({ ...n, requestedScope: tampered }));
      await ctx.db.patch(row!._id, { data: { ...data, resourceNeeds: needs } } as never);
    });
    const { reads, options } = await ground(t, key);
    assert.equal(reads.openResourceNeeds?.[0]?.requestedPurposeKind, null, JSON.stringify(tampered));
    assert.equal(productOption(options)?.external?.purposeScopeCompatible, false, JSON.stringify(tampered));
  }
});

test("R4: prose can only refuse — an affirmative out-of-scope claim fails closed even with the validated kind", async () => {
  const t = convexTest(schema, modules);
  const key = "obj_r4_claim";
  const ids = await seed(t, key, { title: "Uplift", mustBeTrue: "measure conversion uplift from the relaunch A/B test", expectedOutput: "conversion uplift report" });
  assert.equal((await report(t, key, ids, "What moved conversion?", SUPPORTED)).validated, true);
  const product = productOption((await ground(t, key)).options);
  assert.equal(product?.external?.purposeScopeCompatible, false);
});

test("R4: scope changes need identity and the decision fingerprint input; scope-less legacy identity is unchanged", async () => {
  const { computeNeedDedupeKey } = await import("../lib/objective/resourceNeed");
  const base = { objectiveKey: "o", resourceClass: "proprietary_data", purpose: "p", requirementKey: "r" };
  assert.equal(computeNeedDedupeKey(base), computeNeedDedupeKey({ ...base, purposeKind: null }), "legacy keys unchanged");
  assert.notEqual(computeNeedDedupeKey(base), computeNeedDedupeKey({ ...base, purposeKind: SUPPORTED }));
});
