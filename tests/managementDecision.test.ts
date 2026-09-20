// CP2 — managerial decision protocol: economic counterexamples.
//
// These tests pin the ECONOMIC CHANGE: internal availability no longer forces
// MAKE, external options must EARN selection through grounded comparable facts
// and hard eligibility, a redundant external wrapper cannot win by existing
// (or by a model hallucinating it), and HYBRID is a first-class grounded
// shape. Every failure path returns a typed outcome — never an exception.
import test from "node:test";
import assert from "node:assert/strict";
import { buildOutcomeContract } from "../lib/management/contract";
import { runManagerialDecisionPass } from "../lib/management/decision";
import type { GroundingContext, RegistryOffering } from "../lib/management/decision";
import type { EconomicFacts, WorkerRecord } from "../lib/management/types";
import type { EligibilityFacts } from "../lib/management/options";
import { factValue, optionIdFor } from "../lib/management/options";
import { CP2_DECISION_PASS_FIELDS } from "./helpers/cp2Requirement";

const at = 1700000000000;

const contractResult = buildOutcomeContract({
  objectiveKey: "obj_launch",
  contractId: "contract_launch",
  revision: 1,
  parsed: {
    intent: "ship the launch page",
    levels: [{ levelKey: "page_live", order: 1, statement: "page live", label: "Live" }],
    minimumCompletionBar: "page_live",
    ambiguities: [],
  },
  requestId: "req_1",
  founderResolvedQuestions: [],
  at,
});
assert.equal(contractResult.ok, true);
const contract = contractResult.ok ? contractResult.contract : (() => { throw new Error(); })();

function worker(overrides: Partial<WorkerRecord> = {}): WorkerRecord {
  return {
    workerKey: "worker_growth_launch_operations",
    displayName: "Ops generalist",
    capabilityKeys: ["growth_launch_operations"],
    dynamicCapabilities: [],
    responsibility: "run growth operations",
    lifecycle: "available",
    reservedBy: null,
    verifiedAssignments: [],
    contextRefs: ["launch_page"],
    createdByObjective: null,
    createdAt: at - 1000,
    updatedAt: at - 1000,
    ...overrides,
  };
}

const internalFacts: EconomicFacts = {
  ...{
    scope: null,
    expectedQuality: null,
    setupMinutes: null,
    queueMinutes: null,
    executionMinutes: factValue(30, "measured", "high", "obs_internal", at),
    verificationMinutes: null,
    internalCostUsd: factValue(0.4, "measured", "high", "obs_internal", at),
    externalPriceUsd: null,
    reliability: null,
    availability: factValue("free", "measured", "high", "obs_internal", at),
    reuseValue: null,
    externalAdvantage: null,
  },
};

function offering(overrides: Partial<RegistryOffering> = {}): RegistryOffering {
  return {
    offeringId: "off_market_research_sprint",
    providerId: "prov_research_co",
    serviceId: "svc_research_sprint",
    resourceClass: "public_web",
    priceUsd: 1.5,
    priceProvenance: "provider_quote",
    registryVerified: true,
    compatibleResourceClass: true,
    ...overrides,
  };
}

function offeringFacts(priceUsd: number | null): EconomicFacts {
  return {
    scope: null,
    expectedQuality: priceUsd !== null ? factValue("comparable", "provider_quote", "medium", "quote_1", at) : null,
    setupMinutes: factValue(0, "provider_quote", "medium", "quote_1", at),
    queueMinutes: factValue(10, "provider_quote", "medium", "quote_1", at),
    executionMinutes: factValue(90, "provider_quote", "medium", "quote_1", at),
    verificationMinutes: null,
    internalCostUsd: null,
    externalPriceUsd: priceUsd !== null ? factValue(priceUsd, "provider_quote", "high", "quote_1", at) : null,
    reliability: factValue("proven_once", "registry_data", "medium", "registry_1", at),
    availability: factValue("free", "provider_quote", "medium", "quote_1", at),
    reuseValue: null,
    externalAdvantage: factValue("speed", "provider_quote", "medium", "quote_1", at),
  };
}

function baseEligibilityFacts(overrides: Partial<EligibilityFacts> = {}): EligibilityFacts {
  return {
    requiredResourceClasses: ["llm_reasoning", "public_web", "ordinary_compute", "company_records", "company_tools"],
    controlledResourceClasses: ["llm_reasoning", "public_web", "ordinary_compute", "company_records", "company_tools"],
    deadlineAt: null,
    now: at,
    estimatedMinutes: null,
    requiresMandatoryProof: false, // overridden per option by the pass
    proofAvailable: true,
    workerAvailable: null,
    spendAuthorityUsd: 2,
    budgetRemainingUsd: 10,
    ...overrides,
  };
}

function staffingRequest(inventory: readonly WorkerRecord[], overrides = {}) {
  return {
    objectiveKey: "obj_launch",
    requirementKey: "page_live",
    requiredCapabilityKeys: ["growth_launch_operations"],
    requiredPermissions: ["update_company_artifact"],
    expectedHoldMs: 60 * 60 * 1000,
    now: at,
    neededContextRefs: ["launch_page"],
    parallelismNeeded: 1,
    specializationNeeded: false,
    inventory,
    creationAllowed: true,
    ...overrides,
  };
}

function makeInternalId(workerKey: string | null): string {
  return optionIdFor({
    requirementKey: "page_live",
    contractRevision: 1,
    kind: "internal",
    target: `internal:growth_launch_operations:${workerKey ?? "new"}`,
  });
}
function makeExternalId(offeringId: string): string {
  return optionIdFor({
    requirementKey: "page_live",
    contractRevision: 1,
    kind: "external",
    target: `external:${offeringId}`,
  });
}

function pass(overrides: Partial<Parameters<typeof runManagerialDecisionPass>[0]>) {
  return runManagerialDecisionPass({
    objectiveKey: "obj_launch",
    contract,
    currentContractRevision: 1,
    requirementKey: "page_live",
    requirementTitle: "Landing page is live",
    mustBeTrue: "the page is reachable",
    priority: "required",
    artifactKeyForInternalProof: "launch_page",
    staffing: staffingRequest([worker()]),
    grounding: {
      discovered: [],
      internalFacts,
      factsForOffering: () => offeringFacts(1.5),
    },
    eligibilityFacts: baseEligibilityFacts(),
    recommend: async () => ({}),
    at,
    decisionId: "dec_1",
    spendAuthorityUsd: 2,
    spendApprovalId: "appr_test_decision_1",
    externalAuthority: "m3_available_bounded",
    waiverRequested: false,
    ...CP2_DECISION_PASS_FIELDS,
    ...overrides,
  });
}

// ── 1. The old rule is gone: internal availability must not force MAKE ──────

test("an eligible internal path does NOT auto-win — BUY can be recommended and authorized on facts", async () => {
  const seen: string[] = [];
  const result = await pass({
    grounding: {
      discovered: [offering()],
      internalFacts,
      factsForOffering: () => offeringFacts(1.5),
    },
    recommend: async (eligible) => {
      seen.push(...eligible.map((o) => o.kind));
      const buy = eligible.find((o) => o.strategy === "BUY");
      assert.ok(buy, "BUY must be among the eligible options even though internal is available");
      return {
        requirementKey: "page_live",
        contractRevision: 1,
        selectedOptionId: buy!.optionId,
        rationale: "provider delivers in 100m for $1.50 with proven reliability; internal estimate needs 30m but misses launch-day deadline pressure recorded in facts",
      };
    },
  });
  // both shapes were eligible and shown to the model — no auto-MAKE filter
  assert.ok(seen.includes("internal") && seen.includes("external"), `saw: ${seen}`);
  assert.equal(result.authorization.kind, "authorized");
  if (result.authorization.kind !== "authorized") return;
  assert.equal(result.authorization.strategy, "BUY");
  // the bound requirement now carries ONLY the external proof — no artifact
  // proof can be satisfied by a purchase that updates nothing internally.
  assert.ok(result.boundRequirement);
  assert.deepEqual(result.boundRequirement!.proofs.map((p) => p.proofKind), ["verified_external_result"]);
});

test("a fully-eligible internal path can still be chosen — the choice is on facts, not policy bias", async () => {
  const result = await pass({
    recommend: async (eligible) => {
      const internal = eligible.find((o) => o.kind === "internal");
      return internal
        ? {
            requirementKey: "page_live",
            contractRevision: 1,
            selectedOptionId: internal.optionId,
            rationale: "internal worker is free, cheaper and already holds the launch page context",
          }
        : {};
    },
  });
  assert.equal(result.authorization.kind, "authorized");
  if (result.authorization.kind !== "authorized") return;
  assert.equal(result.authorization.strategy, "MAKE");
  assert.ok(result.boundRequirement);
  const kinds = result.boundRequirement!.proofs.map((p) => p.proofKind).sort();
  assert.deepEqual(kinds, ["application_observation", "company_artifact_version"]);
});

// ── 2. The redundant external wrapper does not automatically win ─────────────

test("a redundant wrapper priced above the internal path stays visible-but-ineligible when over budget, and the grounded internal option wins on facts", async () => {
  // $12 wrapper against a $10 objective budget: NOT hidden from the audit
  // (truthfulness), but hard-ineligible, so it never reaches the model as a
  // choice and cannot be authorized.
  const wrapper = offering({ offeringId: "off_wrapper_agency", priceUsd: 12 });
  const wrapperId = makeExternalId("off_wrapper_agency");
  const result = await pass({
    grounding: { discovered: [wrapper], internalFacts, factsForOffering: () => offeringFacts(12) },
    recommend: async (eligible) => {
      assert.ok(!eligible.some((o) => o.optionId === wrapperId), "over-budget wrapper must not be offered");
      const internal = eligible.find((o) => o.kind === "internal")!;
      return {
        requirementKey: "page_live",
        contractRevision: 1,
        selectedOptionId: internal.optionId,
        rationale: "internal worker is free and costs $0.40; the only external quote is $12 for the same controlled resource — a redundant wrapper",
      };
    },
  });
  assert.equal(result.authorization.kind, "authorized");
  if (result.authorization.kind !== "authorized") return;
  assert.equal(result.authorization.strategy, "MAKE");
  const wrapperOption = result.options.find((o) => o.optionId === wrapperId);
  assert.ok(wrapperOption && !wrapperOption!.eligibility.eligible);
  assert.ok(wrapperOption!.eligibility.reasons.includes("budget_exceeded"));
  // comparable facts made the difference visible: both prices are recorded
  assert.equal(wrapperOption!.facts.externalPriceUsd?.value, 12);
  assert.equal(wrapperOption!.facts.externalPriceUsd?.provenance, "provider_quote");
});

test("a wrapper inside budget but selling already-controlled resources is still beatable on comparable facts", async () => {
  // $3 > spend authority ($2): eligible against BUDGET ($10), and stage 4
  // correctly asks the founder rather than silently refusing — proving the
  // wrapper had to EARN the choice, not just exist.
  const wrapper = offering({ offeringId: "off_wrapper_lite", priceUsd: 3 });
  const result = await pass({
    grounding: { discovered: [wrapper], internalFacts, factsForOffering: () => offeringFacts(3) },
    recommend: async (eligible) => {
      const buy = eligible.find((o) => o.optionId === makeExternalId("off_wrapper_lite"));
      assert.ok(buy, "within-budget wrapper IS eligible for consideration even though we control the resource");
      const internal = eligible.find((o) => o.kind === "internal")!;
      // the manager declines it on facts: $3 external vs $0.40 internal, same
      // resource class we already control → no advantage beyond "it exists".
      return {
        requirementKey: "page_live",
        contractRevision: 1,
        selectedOptionId: internal.optionId,
        strongestAlternativeId: buy ? buy.optionId : undefined,
        rationale: "wrapper sells public_web we already control at $3 versus $0.40 internal cost; no specialization or speed edge in the quote",
      };
    },
  });
  assert.equal(result.authorization.kind, "authorized");
  if (result.authorization.kind !== "authorized") return;
  assert.equal(result.authorization.strategy, "MAKE");
});

test("a wrapper selling an already-controlled resource is not ELIGIBLE as a bare BUY when its quote is missing (unknown ≠ cheap)", async () => {
  const result = await pass({
    grounding: {
      discovered: [offering({ priceUsd: null })],
      internalFacts,
      factsForOffering: () => offeringFacts(null),
    },
    recommend: async () => ({
      requirementKey: "page_live",
      contractRevision: 1,
      selectedOptionId: makeExternalId("off_market_research_sprint"), // invented eligibility
      rationale: "just buy the wrapper",
    }),
  });
  // the wrapper never entered the eligible set; recommending it is a typed refusal
  assert.equal(result.authorization.kind, "refused");
  if (result.authorization.kind !== "refused") return;
  assert.ok(result.authorization.detail.includes("not an eligible grounded option"));
  assert.equal(result.boundRequirement, null);
  // and the option object itself records WHY it lost, truthfully
  const wrapper = result.options.find((o) => o.kind === "external");
  assert.ok(wrapper && !wrapper.eligibility.eligible);
});

test("an unverified-source wrapper is refused even when the model likes it", async () => {
  const result = await pass({
    grounding: {
      discovered: [offering({ registryVerified: false })],
      internalFacts,
      factsForOffering: () => offeringFacts(0.01), // suspiciously cheap
    },
    recommend: async (eligible) => {
      // it must not even be offered: assert on what the model actually saw
      assert.ok(!eligible.some((o) => o.kind === "external"));
      const internal = eligible.find((o) => o.kind === "internal")!;
      return {
        requirementKey: "page_live",
        contractRevision: 1,
        selectedOptionId: internal.optionId,
        rationale: "no verified external source exists",
      };
    },
  });
  assert.equal(result.authorization.kind, "authorized");
  if (result.authorization.kind !== "authorized") return;
  assert.equal(result.authorization.strategy, "MAKE");
});

// ── 3. Financial boundaries ──────────────────────────────────────────────────

test("BUY above the founder-granted spend authority routes to approval_required, never a silent spend", async () => {
  const expensive = offering({ offeringId: "off_premium_sprint", priceUsd: 5 });
  const result = await pass({
    grounding: { discovered: [expensive], internalFacts, factsForOffering: () => offeringFacts(5) },
    eligibilityFacts: baseEligibilityFacts({ budgetRemainingUsd: 10 }), // budget ok, AUTHORITY is 2
    recommend: async (eligible) => {
      const buy = eligible.find((o) => o.kind === "external")!;
      return {
        requirementKey: "page_live",
        contractRevision: 1,
        selectedOptionId: buy.optionId,
        rationale: "premium provider proven and fast",
      };
    },
  });
  assert.equal(result.authorization.kind, "approval_required");
  if (result.authorization.kind !== "approval_required") return;
  assert.equal(result.authorization.reason, "spend_authority_required");
  assert.equal(result.boundRequirement, null);
});

test("external_disabled refuses BUY even when authorized-looking — the M3 boundary is one predicate", async () => {
  const result = await pass({
    externalAuthority: "external_disabled",
    grounding: { discovered: [offering()], internalFacts, factsForOffering: () => offeringFacts(1.5) },
    recommend: async (eligible) => {
      const buy = eligible.find((o) => o.kind === "external")!;
      return {
        requirementKey: "page_live",
        contractRevision: 1,
        selectedOptionId: buy.optionId,
        rationale: "buy anyway",
      };
    },
  });
  assert.equal(result.authorization.kind, "refused");
  if (result.authorization.kind !== "refused") return;
  assert.ok(result.authorization.detail.includes("disabled"));
});

// ── 4. HYBRID is a real grounded shape ───────────────────────────────────────

test("hybrid option is grounded deterministically and its facts never undercut its own parts", async () => {
  let hybridId = "";
  const result = await pass({
    grounding: { discovered: [offering()], internalFacts, factsForOffering: () => offeringFacts(1.5) },
    recommend: async (eligible) => {
      const hybrid = eligible.find((o) => o.kind === "hybrid");
      assert.ok(hybrid, "hybrid should be eligible when both halves are");
      hybridId = hybrid!.optionId;
      return {
        requirementKey: "page_live",
        contractRevision: 1,
        selectedOptionId: hybridId,
        rationale: "provider gathers, our worker writes and updates the artifact",
      };
    },
  });
  assert.equal(result.authorization.kind, "authorized");
  if (result.authorization.kind !== "authorized") return;
  assert.equal(result.authorization.strategy, "HYBRID");
  const hybrid = result.options.find((o) => o.optionId === hybridId)!;
  // summed costs: internal $0.4 + external $1.5 = $1.9 total exposure, and the
  // external half stays priced separately — the hybrid is never "cheaper".
  assert.equal(hybrid.facts.internalCostUsd?.value, 0.4);
  assert.equal(hybrid.facts.externalPriceUsd?.value, 1.5);
  // hybrid proofs: BOTH external result and internal observation/artifact
  assert.ok(result.boundRequirement);
  const kinds = result.boundRequirement!.proofs.map((p) => p.proofKind).sort();
  assert.deepEqual(kinds, ["application_observation", "company_artifact_version", "verified_external_result"]);
});

// ── 5. Failure modes are typed terminals, not crashes ────────────────────────

test("model outage during recommendation yields a typed refusal with zero effects", async () => {
  const result = await pass({
    recommend: async () => {
      throw new Error("provider outage");
    },
  });
  assert.equal(result.authorization.kind, "refused");
  if (result.authorization.kind !== "refused") return;
  assert.ok(result.authorization.detail.includes("recommendation source failed"));
  assert.equal(result.boundRequirement, null);
});

test("nothing eligible (no worker, creation capped, no offerings) refuses without inventing MAKE", async () => {
  const result = await pass({
    staffing: staffingRequest([], { creationAllowed: false }),
    grounding: { discovered: [], internalFacts, factsForOffering: () => offeringFacts(1.5) },
    recommend: async () => {
      throw new Error("the model must not even be consulted");
    },
  });
  assert.equal(result.authorization.kind, "refused");
  if (result.authorization.kind !== "refused") return;
  assert.ok(result.authorization.detail.includes("no grounded option is currently eligible"));
  assert.ok(result.authorization.reasons.length > 0);
});

test("recommendation against a stale contract revision is refused by the pass itself", async () => {
  const result = await pass({
    currentContractRevision: 2,
    recommend: async (eligible) => ({
      requirementKey: "page_live",
      contractRevision: 2,
      selectedOptionId: eligible[0]?.optionId ?? "opt_none",
      rationale: "stale pass",
    }),
  });
  assert.equal(result.authorization.kind, "refused");
  if (result.authorization.kind !== "refused") return;
  assert.ok(result.authorization.detail.includes("stale") || result.authorization.detail.includes("revision"));
});

test("material ambiguity in the current contract forces approval_required before any effect", async () => {
  const ambiguous = buildOutcomeContract({
    objectiveKey: "obj_launch",
    contractId: "contract_launch",
    revision: 1,
    parsed: {
      intent: "ship the launch page",
      levels: [{ levelKey: "page_live", order: 1, statement: "page live", label: "Live" }],
      minimumCompletionBar: "page_live",
      ambiguities: [
        {
          question: "should we buy the premium domain?",
          materiality: "material",
          resolution: "unknown",
          resolvedBy: "somebody",
          requiresFounderApproval: true,
        },
      ],
    },
    requestId: "req_2",
    founderResolvedQuestions: [],
    at,
  });
  assert.equal(ambiguous.ok, true);
  if (!ambiguous.ok) return;
  const result = await pass({
    contract: ambiguous.contract,
    grounding: { discovered: [offering()], internalFacts, factsForOffering: () => offeringFacts(1.5) },
    recommend: async (eligible) => ({
      requirementKey: "page_live",
      contractRevision: 1,
      selectedOptionId: eligible[0].optionId,
      rationale: "whatever",
    }),
  });
  assert.equal(result.authorization.kind, "approval_required");
  if (result.authorization.kind !== "approval_required") return;
  assert.equal(result.authorization.reason, "material_ambiguity");
});
