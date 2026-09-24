/**
 * MAKE/BUY sourcing correction — MAKE input resources vs external BUY
 * fulfillment are separate axes. Run 1 (obj_1790243907700_spk25d) grounded
 * every BUY option against an owned MAKE class (company_records), so all three
 * Testnet merchants were ineligible and Jev was never called.
 *
 * A. MAKE resources stay independent of the BUY grounding class
 * B. Objective sourcing policy derives the BUY class via the governed catalogue
 * C. No policy + no validated gap → fail closed
 * D. Validated gap wins over the Objective policy fallback
 * E. Early input Requirement w/o a validated gap: Objective policy alone never
 *    makes Guru compatible (fix/final-natural-buy-path — no Objective-wide leak)
 * F. Market after a validated proprietary_data gap: Guru ✓, Token ✕, Wallet ✕
 * G. Validated gap → MAKE input_not_owned; eligible set is exactly [Guru]
 * H. Founder projection reads "Different purpose"; raw detail stays in source
 */
import test from "node:test";
import assert from "node:assert/strict";

import {
  buildDecisionPassInput,
  type DecisionPassReads,
  type OpenResourceNeedFact,
} from "../lib/management/decisionPass";
import { runManagerialDecisionPass } from "../lib/management/decision";
import { createBudget } from "../lib/management/budget";
import {
  deriveExternalSourcingContext,
  resolveExternalClassForPurposeKind,
} from "../lib/management/externalSourcing";
import { composeBoundedStage3Recommendation } from "../lib/management/jevStage3";
import { interpretOutcomeContract } from "../lib/management/interpretation";
import {
  EXTERNAL_SOCIAL_INTELLIGENCE_PURPOSE_KIND,
  FOUNDER_MESSAGING_QUALITATIVE_PURPOSE_KIND,
  externalResourceClassesForPurposeKind,
} from "../lib/workforce/catalog";
import { SUBMISSION_EXTERNAL_SOCIAL_PURPOSE_POLICY } from "../lib/objective/seedData";
import { CURRENT_RESOURCE_INVENTORY } from "../lib/objective/policy";
import { SOCIAL_MEDIA_GURU_SERVICE_ID } from "../lib/payment/socialMediaGuruProduct";
import {
  TESTNET_TOKEN_MARKET_SERVICE_ID,
  TESTNET_WALLET_RISK_SERVICE_ID,
} from "../lib/payment/testnetDemoProducts";
import {
  deriveObjectiveFacts,
  projectActivity,
  type ProductObjectiveRow,
  type ProductSource,
} from "../lib/product/frontendProjection";
import type { ActivityItem, ManagerDecisionPayload } from "../app/product/contracts";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { Activity } from "../app/product/components/Activity";
import type { GroundedOption, OutcomeContract, Requirement } from "../lib/management/types";

const AT = 1_790_243_907_700;
const OBJ = "obj_sourcing_fix";

// Run the whole file under the controlled Testnet market (restored after).
const previousMode = process.env.SOMEBODY_EXECUTION_MODE;
process.env.SOMEBODY_EXECUTION_MODE = "testnet_demo";
test.after(() => {
  if (previousMode === undefined) delete process.env.SOMEBODY_EXECUTION_MODE;
  else process.env.SOMEBODY_EXECUTION_MODE = previousMode;
});

function contract(): OutcomeContract {
  const built = interpretOutcomeContract({
    objectiveKey: OBJ,
    requestId: "req_sourcing_fix",
    rawContract: {
      intent: "Launch across social channels with credible audience evidence",
      levels: [
        { levelKey: "evidence_ready", statement: "scoped audience evidence exists", label: "Evidence" },
        { levelKey: "launch_week_ready", statement: "a launch-week plan is saved", label: "Launch" },
      ],
      minimumCompletionBar: "launch_week_ready",
      ambiguities: [],
    },
    founderResolvedQuestions: [],
    at: AT,
  });
  if (!built.ok) throw new Error("contract");
  return built.contract;
}

/** Run 1 shape: early evidence Requirement with internal MAKE inputs, no local scope. */
function evidenceRequirement(over: Partial<Requirement> = {}): Requirement {
  const c = contract();
  return {
    requirementKey: "req_evidence_scoped",
    objectiveKey: OBJ,
    contractId: c.contractId,
    contractRevision: 1,
    priority: "required",
    title: "Scoped audience evidence",
    mustBeTrue: "evidence about how target audiences engage on TikTok, Instagram, Facebook and X is recorded",
    scope: "evidence for the launch plan",
    dependsOnRequirementKeys: [],
    requiredResourceClasses: ["company_records", "public_web", "llm_reasoning"],
    requirementKind: "input",
    expectedOutput: null,
    proofs: [],
    state: "active",
    strategy: null,
    resolution: null,
    blockedReason: null,
    waiver: null,
    revision: 1,
    createdAt: AT,
    updatedAt: AT,
    ...over,
  };
}

function reads(over: Partial<DecisionPassReads> = {}): DecisionPassReads {
  return {
    contract: contract(),
    currentContractRevision: 1,
    requirement: evidenceRequirement(),
    inventory: [],
    creationAllowed: true,
    budget: createBudget(OBJ, AT), // default Objective budget ($1 external cap)
    grant: null, // NO founder spend authority anywhere in this file
    at: AT,
    decisionId: "dec_sourcing_fix",
    serialManagerProtocol: true,
    objectiveSourcingPolicy: SUBMISSION_EXTERNAL_SOCIAL_PURPOSE_POLICY,
    ...over,
  };
}

const MAKE_PROPOSAL = {
  strategy: "MAKE",
  desiredCapabilities: ["public_information_research", "company_records_lookup"],
  needsExternalResourceClass: null,
};
const noRecommend = async () => null;

/** An application-validated, scope-less proprietary_data gap (worker NEEDS_INPUT). */
const VALIDATED_GAP: OpenResourceNeedFact = {
  needId: "need_validated_gap",
  resourceClass: "proprietary_data",
  purpose: "current cross-platform audience engagement evidence",
  reasonOwnedInsufficient: "owned records and public pages carry no current audience-behaviour data",
  status: "active",
  validated: true,
  dedupeKey: null,
  requestedPurposeKind: null,
};
const withGap = (over: Partial<DecisionPassReads> = {}) =>
  reads({ openResourceNeeds: [VALIDATED_GAP], ...over });

async function groundedOptions(r: DecisionPassReads): Promise<GroundedOption[]> {
  const built = await buildDecisionPassInput(r, MAKE_PROPOSAL, noRecommend);
  assert.equal(built.ok, true);
  if (!built.ok) throw new Error("build");
  return (await runManagerialDecisionPass(built.input)).options;
}
const byService = (options: GroundedOption[], serviceId: string) =>
  options.find((o) => o.external?.serviceId === serviceId);
const makeOf = (options: GroundedOption[]) => options.find((o) => o.strategy === "MAKE");

// ── A ────────────────────────────────────────────────────────────────────────

test("A: MAKE evaluates Requirement-owned inputs; BUY is never grounded as supplying company_records", async () => {
  const built = await buildDecisionPassInput(reads(), MAKE_PROPOSAL, noRecommend);
  assert.equal(built.ok, true);
  if (!built.ok) return;
  for (const cls of ["company_records", "public_web", "llm_reasoning"]) {
    assert.ok(built.input.eligibilityFacts.requiredResourceClasses.includes(cls as never), `MAKE still requires ${cls}`);
  }
  assert.ok(built.input.grounding.discovered.length > 0);
  for (const offering of built.input.grounding.discovered) {
    assert.notEqual(offering.resourceClass, "company_records");
    assert.equal(offering.resourceClass, "proprietary_data");
  }
  const options = (await runManagerialDecisionPass(built.input)).options;
  assert.equal(makeOf(options)?.eligibility.eligible, true, "owned MAKE inputs keep MAKE eligible");
});

// ── B ────────────────────────────────────────────────────────────────────────

test("B: Objective policy external_social_intelligence resolves to proprietary_data through the catalogue", () => {
  assert.deepEqual(externalResourceClassesForPurposeKind(EXTERNAL_SOCIAL_INTELLIGENCE_PURPOSE_KIND), ["proprietary_data"]);
  assert.equal(resolveExternalClassForPurposeKind(EXTERNAL_SOCIAL_INTELLIGENCE_PURPOSE_KIND), "proprietary_data");
  const ctx = deriveExternalSourcingContext({
    openResourceNeeds: [],
    controlledResourceClasses: CURRENT_RESOURCE_INVENTORY,
    scopedCoveredResourceClasses: [],
    objectivePolicy: SUBMISSION_EXTERNAL_SOCIAL_PURPOSE_POLICY,
    requiredResourceClasses: ["company_records", "proprietary_data"],
  });
  assert.deepEqual(
    ctx && { resourceClass: ctx.resourceClass, purposeKind: ctx.purposeKind, source: ctx.source },
    { resourceClass: "proprietary_data", purposeKind: EXTERNAL_SOCIAL_INTELLIGENCE_PURPOSE_KIND, source: "objective_sourcing_policy" },
  );
  // Fail closed on an ungoverned kind.
  assert.equal(resolveExternalClassForPurposeKind("quantitative_conversion_uplift"), null);
  assert.equal(
    deriveExternalSourcingContext({
      openResourceNeeds: [],
      controlledResourceClasses: CURRENT_RESOURCE_INVENTORY,
      scopedCoveredResourceClasses: [],
      objectivePolicy: { purposeKind: "quantitative_conversion_uplift", targetRequirementKind: "deliverable" },
      requiredResourceClasses: ["proprietary_data"],
    }),
    null,
  );
  // Already acquired for this Requirement → no re-sourcing.
  assert.equal(
    deriveExternalSourcingContext({
      openResourceNeeds: [],
      controlledResourceClasses: CURRENT_RESOURCE_INVENTORY,
      scopedCoveredResourceClasses: ["proprietary_data"],
      objectivePolicy: SUBMISSION_EXTERNAL_SOCIAL_PURPOSE_POLICY,
      requiredResourceClasses: ["proprietary_data"],
    }),
    null,
  );
  // The policy authorizes a purpose; it never invents a gap. A Requirement
  // whose inputs are all owned (or public_web-only) gets no sourcing context,
  // including via a Requirement-local scope bound from the same policy.
  for (const required of [["company_records", "llm_reasoning"], ["public_web"], []]) {
    assert.equal(
      deriveExternalSourcingContext({
        openResourceNeeds: [],
        controlledResourceClasses: CURRENT_RESOURCE_INVENTORY,
        scopedCoveredResourceClasses: [],
        objectivePolicy: SUBMISSION_EXTERNAL_SOCIAL_PURPOSE_POLICY,
        requirementAuthorizedPurposeKinds: [EXTERNAL_SOCIAL_INTELLIGENCE_PURPOSE_KIND],
        requiredResourceClasses: required,
      }),
      null,
      `policy must not create a gap for required=[${required.join(",")}]`,
    );
  }
});

// ── C ────────────────────────────────────────────────────────────────────────

test("C: no Objective policy and no validated gap → Social Media Guru is never purpose-compatible", async () => {
  const options = await groundedOptions(reads({ objectiveSourcingPolicy: null }));
  const guru = byService(options, SOCIAL_MEDIA_GURU_SERVICE_ID);
  assert.ok(guru, "market awareness may still list it");
  assert.equal(guru!.external!.purposeScopeCompatible, false);
  assert.equal(guru!.eligibility.eligible, false);
  assert.ok(options.filter((o) => o.strategy === "BUY").every((o) => !o.eligibility.eligible));
});

// ── D ────────────────────────────────────────────────────────────────────────

test("D: a validated ResourceNeed overrides the generic Objective sourcing fallback", () => {
  const need: OpenResourceNeedFact = {
    needId: "need_1",
    resourceClass: "proprietary_data",
    purpose: "founder phrasing of launch pain",
    reasonOwnedInsufficient: "owned records empty",
    status: "active",
    validated: true,
    dedupeKey: "dk_1",
    requestedPurposeKind: FOUNDER_MESSAGING_QUALITATIVE_PURPOSE_KIND,
  };
  const ctx = deriveExternalSourcingContext({
    openResourceNeeds: [need],
    controlledResourceClasses: CURRENT_RESOURCE_INVENTORY,
    scopedCoveredResourceClasses: [],
    objectivePolicy: SUBMISSION_EXTERNAL_SOCIAL_PURPOSE_POLICY,
    requiredResourceClasses: ["company_records", "public_web"],
  });
  assert.equal(ctx?.source, "validated_resource_need");
  assert.equal(ctx?.purposeKind, FOUNDER_MESSAGING_QUALITATIVE_PURPOSE_KIND, "need's own scope wins over broader policy");
  assert.equal(ctx?.resourceNeedId, "need_1");
  assert.equal(ctx?.needPurpose, need.purpose);

  // Serial NEEDS_INPUT without a scope: class from the need, purpose from policy.
  const scopeless = deriveExternalSourcingContext({
    openResourceNeeds: [{ ...need, requestedPurposeKind: null }],
    controlledResourceClasses: CURRENT_RESOURCE_INVENTORY,
    scopedCoveredResourceClasses: [],
    objectivePolicy: SUBMISSION_EXTERNAL_SOCIAL_PURPOSE_POLICY,
    requiredResourceClasses: ["company_records", "public_web"],
  });
  assert.equal(scopeless?.source, "validated_resource_need");
  assert.equal(scopeless?.purposeKind, EXTERNAL_SOCIAL_INTELLIGENCE_PURPOSE_KIND);

  // A stored scope that failed validation is never re-scoped by policy.
  const rejected = deriveExternalSourcingContext({
    openResourceNeeds: [{ ...need, requestedPurposeKind: null, requestedScopeRejected: true }],
    controlledResourceClasses: CURRENT_RESOURCE_INVENTORY,
    scopedCoveredResourceClasses: [],
    objectivePolicy: SUBMISSION_EXTERNAL_SOCIAL_PURPOSE_POLICY,
    requiredResourceClasses: ["company_records", "public_web"],
  });
  assert.equal(rejected?.purposeKind, null);

  // An unvalidated (proposed) need never drives sourcing, and the policy
  // cannot stand in for it when the Requirement does not require the class.
  const proposed = deriveExternalSourcingContext({
    openResourceNeeds: [{ ...need, validated: false }],
    controlledResourceClasses: CURRENT_RESOURCE_INVENTORY,
    scopedCoveredResourceClasses: [],
    objectivePolicy: SUBMISSION_EXTERNAL_SOCIAL_PURPOSE_POLICY,
    requiredResourceClasses: ["company_records", "public_web"],
  });
  assert.equal(proposed, null);
});

// ── E ────────────────────────────────────────────────────────────────────────

test("E: early Requirements with owned/public inputs — MAKE eligible; Objective policy alone never makes Guru eligible", async () => {
  const requirement = evidenceRequirement();
  assert.equal(requirement.authorizedPurposeKinds, undefined);
  let recommendSawBuy = false;
  const built = await buildDecisionPassInput(reads({ requirement }), MAKE_PROPOSAL, async (eligible) => {
    recommendSawBuy ||= eligible.some((o) => o.strategy === "BUY");
    return null;
  });
  assert.equal(built.ok, true);
  if (!built.ok) return;
  assert.equal(built.input.spendAuthorityUsd, null);
  assert.deepEqual(built.input.authorizedPurposeKinds, [], "the Requirement row is not widened");
  assert.equal(built.input.eligibilityFacts.requiredResourceClasses.includes("proprietary_data" as never), false);
  const result = await runManagerialDecisionPass(built.input);
  assert.equal(makeOf(result.options)?.eligibility.eligible, true);
  const guru = byService(result.options, SOCIAL_MEDIA_GURU_SERVICE_ID);
  assert.ok(guru, "market awareness may still list it");
  assert.equal(guru!.external!.purposeScopeCompatible, false);
  assert.equal(guru!.eligibility.eligible, false);
  assert.ok(result.options.filter((o) => o.strategy === "BUY").every((o) => !o.eligibility.eligible));
  assert.equal(recommendSawBuy, false);

  // public_evidence shape: requires only public_web.
  const publicOnly = await groundedOptions(
    reads({ requirement: evidenceRequirement({ requirementKey: "req_public_evidence", requiredResourceClasses: ["public_web"] }) }),
  );
  assert.equal(makeOf(publicOnly)?.eligibility.eligible, true);
  assert.equal(byService(publicOnly, SOCIAL_MEDIA_GURU_SERVICE_ID)?.eligibility.eligible ?? false, false);
});

// ── F ────────────────────────────────────────────────────────────────────────

test("F: after a validated gap, all three Testnet merchants discovered; Guru eligible, Token + Wallet purpose-incompatible", async () => {
  const options = await groundedOptions(withGap());
  const buys = options.filter((o) => o.strategy === "BUY");
  assert.equal(buys.length, 3);
  const guru = byService(options, SOCIAL_MEDIA_GURU_SERVICE_ID)!;
  const token = byService(options, TESTNET_TOKEN_MARKET_SERVICE_ID)!;
  const wallet = byService(options, TESTNET_WALLET_RISK_SERVICE_ID)!;
  assert.equal(guru.external!.resourceClass, "proprietary_data");
  assert.equal(guru.external!.compatibleResourceClass, true);
  assert.equal(guru.external!.purposeScopeCompatible, true);
  assert.equal(guru.eligibility.eligible, true, JSON.stringify(guru.eligibility));
  for (const distractor of [token, wallet]) {
    assert.equal(distractor.external!.resourceClass, "proprietary_data");
    assert.equal(distractor.external!.compatibleResourceClass, true, "same resource class…");
    assert.equal(distractor.external!.purposeScopeCompatible, false, "…different purpose");
    assert.equal(distractor.eligibility.eligible, false);
  }
  // Deliverable Requirement carrying the bound local scope: still no BUY until
  // a validated gap exists for it; then Guru grounds the same way.
  const deliverableReq = evidenceRequirement({
    requirementKey: "req_launch_week_ready",
    requirementKind: "deliverable",
    requiredResourceClasses: ["llm_reasoning", "company_records", "public_web", "ordinary_compute"],
    authorizedPurposeKinds: [EXTERNAL_SOCIAL_INTELLIGENCE_PURPOSE_KIND],
  });
  const before = await groundedOptions(reads({ requirement: deliverableReq }));
  assert.equal(makeOf(before)?.eligibility.eligible, true);
  assert.equal(byService(before, SOCIAL_MEDIA_GURU_SERVICE_ID)?.eligibility.eligible ?? false, false);
  const after = await groundedOptions(withGap({ requirement: deliverableReq }));
  assert.equal(byService(after, SOCIAL_MEDIA_GURU_SERVICE_ID)?.eligibility.eligible, true);
});

// ── G ────────────────────────────────────────────────────────────────────────

test("G: validated gap → MAKE input_not_owned; bounded stage 3 sees exactly [Guru]; BUY parks at approval_required", async () => {
  let jevCalls = 0;
  let seenEligible: readonly GroundedOption[] = [];
  const requirement = evidenceRequirement();
  const built = await buildDecisionPassInput(withGap({ requirement }), MAKE_PROPOSAL, async (eligible) => {
    seenEligible = eligible;
    const compose = await composeBoundedStage3Recommendation(
      {
        requirementKey: requirement.requirementKey,
        contractRevision: 1,
        requirement: {
          requirementKey: requirement.requirementKey,
          title: requirement.title,
          mustBeTrue: requirement.mustBeTrue,
          scope: requirement.scope,
          expectedOutput: null,
          requiredResourceClasses: [...requirement.requiredResourceClasses],
        },
        eligible,
      },
      {
        selectEligibleOption: async (input) => {
          jevCalls += 1;
          return { kind: "selected", optionId: input.eligible[0]!.optionId, probabilities: {}, confidence: null };
        },
      },
    );
    assert.equal(compose.kind, "recommendation");
    return compose.kind === "recommendation" ? compose.recommendation : null;
  });
  assert.equal(built.ok, true);
  if (!built.ok) return;
  assert.ok(built.input.eligibilityFacts.requiredResourceClasses.includes("proprietary_data" as never));
  const result = await runManagerialDecisionPass(built.input);
  const make = makeOf(result.options)!;
  assert.equal(make.eligibility.eligible, false);
  if (!make.eligibility.eligible) assert.ok(make.eligibility.reasons.includes("input_not_owned"));
  assert.deepEqual(seenEligible.map((o) => o.external?.serviceId), [SOCIAL_MEDIA_GURU_SERVICE_ID]);
  assert.ok(jevCalls <= 1, "sole eligible option needs no competitive Jev selection");
  assert.equal(result.decision.optionId, seenEligible[0]!.optionId);
  assert.equal(result.authorization.kind, "approval_required", "no founder grant → Needs You, never authorized");
});

// ── H ────────────────────────────────────────────────────────────────────────

test("H: founder Activity reads 'Different purpose' for distractors; raw detail preserved in source truth", async () => {
  const options = await groundedOptions(withGap());
  const make = makeOf(options)!;
  const coarsePlanSummary = JSON.stringify({ original: "", extra: { options } });
  const objective: ProductObjectiveRow = {
    key: OBJ,
    request: "Launch across social channels",
    createdAt: AT - 100_000,
    updatedAt: AT,
    state: "executing",
    result: null,
    workItems: [],
    companyArtifacts: [],
    acquisitionResults: [],
    resourceNeeds: [],
    finalSemanticAssessment: null,
    controlNotes: [],
    pendingFinalAssessmentRevision: null,
    interpretationStatus: null,
    interpretationPending: false,
    pendingDecisionRequirementKey: null,
    managementPassWatchActive: false,
  };
  const source: ProductSource = {
    objective,
    contracts: [{ contractId: "c1", revision: 1, intent: "Launch", createdAt: AT - 90_000 }],
    requirements: [],
    assignments: [],
    decisions: [
      {
        decisionId: "dec_h",
        requirementKey: "req_evidence_scoped",
        contractRevision: 1,
        kind: "satisfaction_strategy",
        strategy: "MAKE",
        optionId: make.optionId,
        authorization: { kind: "authorized" },
        rationale: null,
        strongestAlternativeId: null,
        coarsePlanSummary,
        at: AT - 30_000,
      },
    ],
    intents: [],
    workers: [],
    evidence: [],
  };
  const activity = projectActivity(source, deriveObjectiveFacts(source), AT);
  const decision = activity.find((item) => item.type === "manager_decision");
  assert.ok(decision);
  const considered = (decision!.payload as ManagerDecisionPayload).considered ?? [];
  const forService = (serviceId: string) => {
    const id = byService(options, serviceId)!.optionId;
    return considered.find((c) => c.optionId === id)!;
  };
  for (const serviceId of [TESTNET_TOKEN_MARKET_SERVICE_ID, TESTNET_WALLET_RISK_SERVICE_ID]) {
    const view = forService(serviceId);
    assert.equal(view.status, "ineligible");
    assert.equal(view.reason, "Different purpose");
    assert.equal(view.unsuitability, "not_suitable");
  }
  assert.equal(forService(SOCIAL_MEDIA_GURU_SERVICE_ID).status, "eligible");
  const serialized = JSON.stringify(considered);
  for (const raw of ["product scope cannot", "exact required resource class", "required proof method"]) {
    assert.ok(!serialized.includes(raw), `founder copy must not expose: ${raw}`);
  }
  // Source truth still carries the technical detail for debugging/evidence.
  const token = byService(options, TESTNET_TOKEN_MARKET_SERVICE_ID)!;
  assert.ok(!token.eligibility.eligible && /product scope cannot fulfill/.test(token.eligibility.detail));
});

// ── Repeated sourcing epoch ──────────────────────────────────────────────────

test("Epoch: accepted NEEDS_INPUT reopens sourcing (new fingerprint), identical state does not; epoch-2 BUY still grounded", async () => {
  const { decisionFingerprintFacts } = await import("../lib/objective/inputDiagnosis");
  const requirement = evidenceRequirement();
  const world = {
    requirement,
    currentContractRevision: 1,
    allRequirements: [requirement],
    resourceNeeds: [] as never[],
    acquisitions: [],
    intents: [],
    assignments: [],
    spendAuthorityUsd: null,
    budget: createBudget(OBJ, AT),
    workerAvailability: "available" as const,
  };
  const epoch1 = decisionFingerprintFacts(world);
  assert.equal(decisionFingerprintFacts({ ...world }), epoch1, "identical state → duplicate call suppressed");
  // Serial worker NEEDS_INPUT accepted as an application-validated, scope-less gap.
  const need = {
    id: "need_epoch2",
    objectiveKey: OBJ,
    requirementKey: requirement.requirementKey,
    resourceClass: "proprietary_data",
    purpose: "audience engagement evidence per channel",
    reasonOwnedInsufficient: "owned records and public pages were insufficient",
    status: "active",
    validationAuthority: "application",
    createdAt: AT + 1,
  };
  const epoch2 = decisionFingerprintFacts({ ...world, resourceNeeds: [need as never] });
  assert.notEqual(epoch2, epoch1, "material NEEDS_INPUT change permits a second sourcing decision");

  // Epoch-2 grounding: need supplies the class, the Objective policy the purpose.
  const options = await groundedOptions(
    reads({
      openResourceNeeds: [
        {
          needId: need.id,
          resourceClass: need.resourceClass,
          purpose: need.purpose,
          reasonOwnedInsufficient: need.reasonOwnedInsufficient,
          status: "active",
          validated: true,
          dedupeKey: null,
          requestedPurposeKind: null,
        },
      ],
    }),
  );
  assert.equal(byService(options, SOCIAL_MEDIA_GURU_SERVICE_ID)?.eligibility.eligible, true, "BUY Guru still available");
  assert.equal(byService(options, TESTNET_TOKEN_MARKET_SERVICE_ID)?.eligibility.eligible, false);
});

test("H (render): Activity card shows compact founder copy, never the raw eligibility sentence", () => {
  const item: ActivityItem = {
    id: "activity:manager_decision:dec_render",
    type: "manager_decision",
    occurredAt: AT,
    actor: { kind: "somebody", id: "somebody", label: "Somebody" } as ActivityItem["actor"],
    title: "Somebody chose to make: research",
    importance: "major",
    payload: {
      decisionType: "sourcing",
      selected: { optionId: "opt_make", approach: "MAKE", label: "research" },
      considered: [
        { optionId: "opt_make", approach: "MAKE", label: "research", status: "eligible" },
        { optionId: "opt_guru", approach: "BUY", label: "Social Media Guru", status: "eligible" },
        { optionId: "opt_token", approach: "BUY", label: "Token Market Intelligence", status: "ineligible", unsuitability: "not_suitable", reason: "Different purpose" },
        { optionId: "opt_down", approach: "BUY", label: "Unconfigured merchant", status: "ineligible", unsuitability: "not_available" },
      ],
      selectionSource: "jev",
    },
  };
  const html = renderToStaticMarkup(createElement(Activity, { items: [item] }));
  assert.ok(html.includes("Not suitable — Different purpose"), html);
  assert.ok(html.includes("Not available for this task"));
  assert.ok(!html.includes("product scope cannot"));
});
