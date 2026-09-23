/**
 * Real V7 recommendation-boundary states via production `runManagerialDecisionPass`
 * grounding (Stages 1–2). Labels document eval intent — not runtime authority.
 */
import assert from "node:assert/strict";
import { buildOutcomeContract } from "../../contract";
import type { DecisionPassInput } from "../../decision";
import type { GroundingContext, RegistryOffering } from "../../decision";
import type { EconomicFacts, WorkerRecord } from "../../types";
import type { EligibilityFacts } from "../../options";
import { factValue, optionIdFor } from "../../options";
import { CP2_DECISION_PASS_FIELDS } from "../../../../tests/helpers/cp2Requirement";
import { captureRecommendationBoundary } from "./capture";
import type { EvalCase } from "./types";
import { caseShapeFor, summarizeFacts } from "./classify";

const at = 1_700_000_000_000;

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
    executionPathConfigured: true,
    purposeScopeCompatible: true,
    ...overrides,
  };
}

function offeringFacts(priceUsd: number | null): EconomicFacts {
  return {
    scope: null,
    expectedQuality:
      priceUsd !== null ? factValue("comparable", "provider_quote", "medium", "quote_1", at) : null,
    setupMinutes: factValue(0, "provider_quote", "medium", "quote_1", at),
    queueMinutes: factValue(10, "provider_quote", "medium", "quote_1", at),
    executionMinutes: factValue(90, "provider_quote", "medium", "quote_1", at),
    verificationMinutes: null,
    internalCostUsd: null,
    externalPriceUsd:
      priceUsd !== null ? factValue(priceUsd, "provider_quote", "high", "quote_1", at) : null,
    reliability: factValue("proven_once", "registry_data", "medium", "registry_1", at),
    availability: factValue("free", "provider_quote", "medium", "quote_1", at),
    reuseValue: null,
    externalAdvantage: factValue("speed", "provider_quote", "medium", "quote_1", at),
  };
}

function baseEligibilityFacts(overrides: Partial<EligibilityFacts> = {}): EligibilityFacts {
  return {
    requiredResourceClasses: [
      "llm_reasoning",
      "public_web",
      "ordinary_compute",
      "company_records",
      "company_tools",
    ],
    controlledResourceClasses: [
      "llm_reasoning",
      "public_web",
      "ordinary_compute",
      "company_records",
      "company_tools",
    ],
    deadlineAt: null,
    now: at,
    estimatedMinutes: null,
    requiresMandatoryProof: false,
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

function makeExternalId(offeringId: string): string {
  return optionIdFor({
    requirementKey: "page_live",
    contractRevision: 1,
    kind: "external",
    target: `external:${offeringId}`,
  });
}

function passInput(overrides: {
  grounding?: GroundingContext;
  eligibilityFacts?: EligibilityFacts;
  externalAuthority?: DecisionPassInput["externalAuthority"];
}): DecisionPassInput {
  return {
    objectiveKey: "obj_launch",
    contract,
    currentContractRevision: 1,
    requirementKey: "page_live",
    requirementTitle: "Landing page is live",
    mustBeTrue: "the page is reachable",
    priority: "required",
    dependsOnRequirementKeys: [],
    requiredResourceClasses: ["public_web"],
    expectedOutput: "live landing page",
    artifactKeyForInternalProof: "launch_page",
    staffing: staffingRequest([worker()]),
    grounding: overrides.grounding ?? {
      discovered: [],
      internalFacts,
      factsForOffering: () => offeringFacts(1.5),
    },
    eligibilityFacts: overrides.eligibilityFacts ?? baseEligibilityFacts(),
    recommend: async () => ({}),
    at,
    decisionId: "dec_capture",
    spendAuthorityUsd: 2,
    spendApprovalId: "appr_test",
    externalAuthority: overrides.externalAuthority ?? "m3_available_bounded",
    waiverRequested: false,
    ...CP2_DECISION_PASS_FIELDS,
  };
}

type ScenarioDef = {
  caseId: string;
  provenance: string;
  buildInput: () => DecisionPassInput;
  reference: EvalCase["reference"];
  incumbent?: EvalCase["incumbent"];
};

const SCENARIOS: ScenarioDef[] = [
  {
    caseId: "v7_cp2_make_vs_buy_both_eligible",
    provenance: "tests/managementDecision.test.ts — internal does NOT auto-win",
    buildInput: () =>
      passInput({
        grounding: {
          discovered: [offering()],
          internalFacts,
          factsForOffering: () => offeringFacts(1.5),
        },
      }),
    reference: {
      kind: "HUMAN_REVIEW",
      expectedOptionId: null,
      notes: "MAKE vs BUY trade speed/cost/context vs provider sprint; no single dominant fact.",
    },
    incumbent: {
      selectedOptionId: makeExternalId("off_market_research_sprint"),
      strategy: "BUY",
      rationaleSnippet: "provider delivers in 100m for $1.50",
      source: "managementDecision.test.ts",
    },
  },
  {
    caseId: "v7_cp2_internal_preferred_on_cost",
    provenance: "tests/managementDecision.test.ts — internal chosen on facts",
    buildInput: () => passInput({}),
    reference: {
      kind: "DETERMINISTIC_DOMINANCE",
      expectedOptionId: optionIdFor({
        requirementKey: "page_live",
        contractRevision: 1,
        kind: "internal",
        target: "internal:growth_launch_operations:worker_growth_launch_operations",
      }),
      notes: "Sole eligible internal path; free worker and owned context.",
    },
  },
  {
    caseId: "v7_cp2_wrapper_inside_budget_make_wins",
    provenance: "tests/managementDecision.test.ts — wrapper vs internal cost",
    buildInput: () =>
      passInput({
        grounding: {
          discovered: [offering({ offeringId: "off_wrapper_lite", priceUsd: 3 })],
          internalFacts,
          factsForOffering: () => offeringFacts(3),
        },
      }),
    reference: {
      kind: "DETERMINISTIC_DOMINANCE",
      expectedOptionId: optionIdFor({
        requirementKey: "page_live",
        contractRevision: 1,
        kind: "internal",
        target: "internal:growth_launch_operations:worker_growth_launch_operations",
      }),
      notes: "$3 external vs $0.40 internal for already-controlled public_web.",
    },
    incumbent: {
      selectedOptionId: optionIdFor({
        requirementKey: "page_live",
        contractRevision: 1,
        kind: "internal",
        target: "internal:growth_launch_operations:worker_growth_launch_operations",
      }),
      strategy: "MAKE",
      rationaleSnippet: "wrapper sells public_web we already control",
      source: "managementDecision.test.ts",
    },
  },
  {
    caseId: "v7_cp2_hybrid_eligible",
    provenance: "tests/managementDecision.test.ts — HYBRID grounded",
    buildInput: () =>
      passInput({
        grounding: {
          discovered: [offering()],
          internalFacts,
          factsForOffering: () => offeringFacts(1.5),
        },
      }),
    reference: {
      kind: "HUMAN_REVIEW",
      expectedOptionId: null,
      notes: "MAKE, BUY, and HYBRID all eligible; hybrid combines gather+write.",
    },
  },
  {
    caseId: "v7_cp2_two_external_providers_price_dominance",
    provenance: "managementDecision grounding — two verified offerings",
    buildInput: () =>
      passInput({
        grounding: {
          discovered: [
            offering({ offeringId: "off_provider_a", providerId: "prov_a", priceUsd: 4 }),
            offering({ offeringId: "off_provider_b", providerId: "prov_b", priceUsd: 1.2 }),
          ],
          internalFacts,
          factsForOffering: (o) => offeringFacts(o.priceUsd),
        },
      }),
    reference: {
      kind: "DETERMINISTIC_DOMINANCE",
      expectedOptionId: makeExternalId("off_provider_b"),
      notes: "Same class and verification; provider_b strictly cheaper with comparable facts.",
    },
  },
  {
    caseId: "v7_cp2_make_vs_buy_speed_tradeoff",
    provenance: "managementDecision grounding — faster external vs cheap internal",
    buildInput: () =>
      passInput({
        grounding: {
          discovered: [offering({ priceUsd: 1.5 })],
          internalFacts: {
            ...internalFacts,
            executionMinutes: factValue(180, "measured", "high", "obs_slow", at),
          },
          factsForOffering: () => ({
            ...offeringFacts(1.5),
            executionMinutes: factValue(45, "provider_quote", "medium", "quote_fast", at),
          }),
        },
      }),
    reference: {
      kind: "HUMAN_REVIEW",
      expectedOptionId: null,
      notes: "External faster execution minutes vs lower internal cost — genuine tradeoff.",
    },
  },
];

export async function buildScenarioCorpus(): Promise<EvalCase[]> {
  const cases: EvalCase[] = [];
  for (const scenario of SCENARIOS) {
    const input = scenario.buildInput();
    const boundary = await captureRecommendationBoundary(input);
    const eligible = boundary.eligible;
    const shape = caseShapeFor(eligible.length, scenario.reference.kind);
    cases.push({
      caseId: scenario.caseId,
      corpusSource: "REAL",
      provenance: scenario.provenance,
      caseShape: shape,
      reference: scenario.reference,
      requirement: boundary.requirement,
      contractRevision: boundary.contractRevision,
      eligible,
      incumbent: scenario.incumbent,
      factsSummary: summarizeFacts(eligible),
    });
  }
  return cases;
}

/** Deterministic variant: swap external prices on a captured multi-option shape. */
export function derivePriceSwapVariant(base: EvalCase, caseId: string): EvalCase | null {
  if (base.eligible.length < 2) return null;
  const externals = base.eligible.filter((o) => o.kind === "external");
  if (externals.length < 2) return null;
  const sorted = [...externals].sort(
    (a, b) => (a.external?.priceUsd ?? 0) - (b.external?.priceUsd ?? 0),
  );
  const cheaper = sorted[0]!;
  const pricier = sorted[sorted.length - 1]!;
  const eligible = base.eligible.map((o) => {
    if (o.optionId !== pricier.optionId) return o;
    const clone = structuredClone(o);
    if (clone.external) clone.external.priceUsd = cheaper.external?.priceUsd ?? 0.5;
    if (clone.facts.externalPriceUsd) {
      clone.facts.externalPriceUsd = factValue(
        cheaper.external?.priceUsd ?? 0.5,
        "provider_quote",
        "medium",
        "derived_variant",
        at,
      );
    }
    return clone;
  });
  return {
    ...base,
    caseId,
    corpusSource: "REAL_DERIVED_VARIANT",
    provenance: `${base.provenance} (price-swap variant)`,
    eligible,
    reference: {
      kind: "AMBIGUOUS",
      expectedOptionId: null,
      notes: "Derived variant — inverted price dominance; not independent runtime truth.",
    },
    factsSummary: summarizeFacts(eligible),
    incumbent: undefined,
  };
}
