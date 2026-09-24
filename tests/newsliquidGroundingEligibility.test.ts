// Level 2 — marketplace grounding -> eligibility for the live Newsliquid
// ("OpenNews Twitter Search") OKX x402 product, mirroring the real chain used
// by tests/v7ReviewR4PurposeScope.test.ts:
//   reportMissingInput (application validation of the worker proposal)
//   -> stored ResourceNeed -> readDecisionContext (open-need projection)
//   -> buildDecisionPassInput -> buildGroundingContext -> groundRegistryOfferings
//   -> externalOfferingAcceptsPurpose -> runManagerialDecisionPass eligibility.
// No live model, no network, no payment/merchant/provider call anywhere here.
import test, { mock, after as afterAll } from "node:test";
import assert from "node:assert/strict";
import { convexTest } from "convex-test";
import schema from "../convex/schema";
import { reportMissingInput } from "../convex/objectives";
import { putContract, putRequirement, initBudget, readDecisionContext } from "../convex/internal/workforce";
import { buildOutcomeContract } from "../lib/management/contract";
import { buildDecisionPassInput, type DecisionPassReads } from "../lib/management/decisionPass";
import { runManagerialDecisionPass } from "../lib/management/decision";
import { EXTERNAL_SOCIAL_INTELLIGENCE_PURPOSE_KIND, FOUNDER_MESSAGING_QUALITATIVE_PURPOSE_KIND } from "../lib/workforce/catalog";
import { NEWSLIQUID_SERVICE_ID } from "../lib/payment/newsliquidProduct";
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

const now = 1_991_000_000_000;
const REQ = "req_scope_newsliquid";
const SUPPORTED = EXTERNAL_SOCIAL_INTELLIGENCE_PURPOSE_KIND;
type ObjectivesDb = {
  query(table: "objectives"): {
    withIndex(index: "by_key", f: (q: { eq(field: "key", value: string): unknown }) => unknown): { unique(): Promise<unknown> };
  };
};
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
    assignment: "Obtain sufficient accepted evidence", idempotencyScope: "scope_newsliquid", workerKey: "worker_research",
    capabilityKeys: ["public_information_research", "company_records_lookup"],
    allowedToolPermissions: ["read_company_record", "read_public_web", "record_finding", "request_resource", "submit_result", "request_completion"],
    requiredSourceClasses: ["company_record", "public_web"], minObservations: 2,
    sourceProofs: [{ sourceClass: "company_record", minDistinctSources: 1 }, { sourceClass: "public_web", minDistinctSources: 1 }],
    requiredVerifiedEffectKeys: [], approvalVersion: null,
    resultRequirements: { summary: true, fit: true, risks: true, unknowns: true, recommendedNextAction: true },
  };
}

async function seed(t: ReturnType<typeof convexTest>, key: string, authorizedPurposeKinds: string[] = []) {
  const prose = { title: "Live audience language", mustBeTrue: "the relaunch copy is grounded in current live social evidence", expectedOutput: "saved relaunch recommendation" };
  const contract = contractFor(key);
  const requirement: Requirement = {
    requirementKey: REQ, objectiveKey: key, contractId: contract.contractId, contractRevision: 1, priority: "required",
    title: prose.title, mustBeTrue: prose.mustBeTrue, scope: "owned then external if needed", dependsOnRequirementKeys: [],
    requiredResourceClasses: [], authorizedPurposeKinds, expectedOutput: prose.expectedOutput, proofs: [], state: "active", strategy: null,
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
const newsliquidOption = (options: GroundedOption[]) => options.find((o) => o.external?.serviceId === NEWSLIQUID_SERVICE_ID);
const storedNeeds = async (t: ReturnType<typeof convexTest>, key: string) =>
  (await t.run(async (ctx) => {
    const row = await (ctx.db as unknown as ObjectivesDb).query("objectives").withIndex("by_key", (q) => q.eq("key", key)).unique();
    return ((row as { data: ObjectiveRecord }).data.resourceNeeds ?? []) as ResourceNeed[];
  }));

test("Newsliquid: an authorized Requirement + matching worker-proposed live-social scope is eligible through the real grounding path", async () => {
  const t = convexTest(schema, modules);
  const key = "obj_newsliquid_authorized";
  const ids = await seed(t, key, [SUPPORTED]);
  const rep = await report(t, key, ids, "What are people on X saying about our launch right now?", SUPPORTED);
  assert.equal(rep.validated, true);
  const [need] = await storedNeeds(t, key);
  assert.deepEqual(need!.requestedScope, { purposeKind: SUPPORTED, authority: "application" });
  const { reads, options } = await ground(t, key);
  assert.equal(reads.openResourceNeeds?.[0]?.requestedPurposeKind, SUPPORTED);
  const option = newsliquidOption(options);
  assert.ok(option, "the live Newsliquid offering is grounded");
  assert.equal(option?.external?.purposeScopeCompatible, true);
  assert.equal(option?.eligibility.eligible, true, "all other existing gates allow it");
});

test("Newsliquid: OLD behavior preserved — generic objectives with no authorized policy stay ineligible (provider_incompatible)", async () => {
  const t = convexTest(schema, modules);
  const key = "obj_newsliquid_unauthorized";
  const ids = await seed(t, key); // no authorizedPurposeKinds at all — the pre-existing default
  const rep = await report(t, key, ids, "What are people on X saying about our launch right now?", SUPPORTED);
  // Requirement authorizes no purpose scope, so the worker's proposed kind is
  // refused at the application boundary before any ResourceNeed is stored.
  assert.equal(rep.validated, false);
  assert.equal(rep.refusalCode, "purpose_scope_not_authorized");
  assert.equal((await storedNeeds(t, key)).length, 0);
  const { reads, options } = await ground(t, key);
  assert.equal(reads.openResourceNeeds?.length ?? 0, 0, "no ResourceNeed was ever stored");
  const option = newsliquidOption(options);
  assert.ok(option, "the offering is still grounded (visible), just not compatible");
  assert.equal(option?.external?.purposeScopeCompatible, false);
  assert.equal(option?.eligibility.eligible, false);
  if (option && !option.eligibility.eligible) {
    assert.ok(option.eligibility.reasons.includes("provider_incompatible"));
  }
});

test("Newsliquid: authorized Requirement but worker proposes NO purposeKind — no scope invented on the need; the application-owned scope supplies purpose", async () => {
  // Sourcing correction: the worker is not forced to reproduce application
  // authority it does not own. The validated need still carries no scope, but
  // the Requirement's application-bound purpose scope (from the Objective
  // sourcing policy) provides the purpose context for grounding.
  const t = convexTest(schema, modules);
  const key = "obj_newsliquid_authorized_no_kind";
  const ids = await seed(t, key, [SUPPORTED]);
  const rep = await report(t, key, ids, "What are people on X saying about our launch right now?");
  assert.equal(rep.validated, true, "the gap itself is still a validated need");
  const [need] = await storedNeeds(t, key);
  assert.equal(need!.requestedScope, undefined, "no scope is invented for the need");
  const option = newsliquidOption((await ground(t, key)).options);
  assert.equal(option?.external?.purposeScopeCompatible, true);
});

test("Newsliquid: the M3 synthetic purpose kind never authorizes the live Newsliquid product (cross-contamination check)", async () => {
  const t = convexTest(schema, modules);
  const key = "obj_newsliquid_m3_kind_rejected";
  const ids = await seed(t, key, [FOUNDER_MESSAGING_QUALITATIVE_PURPOSE_KIND]);
  const rep = await report(t, key, ids, "What are people on X saying about our launch right now?", SUPPORTED);
  // The Requirement authorizes only the M3 synthetic kind, not the live one.
  assert.equal(rep.validated, false);
  assert.equal(rep.refusalCode, "purpose_scope_not_authorized");
});

test("Newsliquid: regression — the M3 controlled-test-merchant path is completely unaffected", async () => {
  const t = convexTest(schema, modules);
  const key = "obj_m3_regression_after_newsliquid";
  const ids = await seed(t, key, [FOUNDER_MESSAGING_QUALITATIVE_PURPOSE_KIND]);
  const rep = await report(t, key, ids, "How do solo founders phrase launch pain?", FOUNDER_MESSAGING_QUALITATIVE_PURPOSE_KIND);
  assert.equal(rep.validated, true);
  const { options } = await ground(t, key);
  const m3Option = options.find((o) => o.external?.serviceId === "founder_narrative_pulse");
  assert.ok(m3Option, "founder_narrative_pulse still grounds");
  assert.equal(m3Option?.external?.purposeScopeCompatible, true);
  assert.equal(m3Option?.eligibility.eligible, true, "M3 path works exactly as before");
});
