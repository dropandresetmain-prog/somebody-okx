// M6.1 CP3 — hard eligibility, ownership, provenance, authorization recheck.
import test from "node:test";
import assert from "node:assert/strict";
import { evaluateOptionEligibility } from "../lib/sourcing/eligibility";
import {
  buildExternalOption,
  buildHybridOption,
  buildInternalOption,
  eligibilityInputFor,
  EMPTY_FACTS,
  withEligibility,
  type EligibilityFacts,
} from "../lib/management/options";
import { reauthorizeRecommendation } from "../lib/management/authorization";
import { groundRegistryOfferings } from "../lib/management/grounding";
import { parseManagerialRecommendation } from "../lib/management/proposals";
import type { EligibilityInput, GroundedOption } from "../lib/management/types";
import type { RegistryEntry } from "../lib/market/registryData";
import type { MarketOffering } from "../lib/market/discovery";

const at = 1700000000000;

const GROWTH_FIVE = [
  "llm_reasoning",
  "public_web",
  "ordinary_compute",
  "company_records",
  "company_tools",
] as const;

function baseEligibilityFacts(
  overrides: Partial<EligibilityFacts> = {},
): EligibilityFacts {
  return {
    requiredResourceClasses: [...GROWTH_FIVE],
    controlledResourceClasses: [...GROWTH_FIVE],
    deadlineAt: null,
    now: at,
    estimatedMinutes: null,
    requiresMandatoryProof: false,
    proofAvailable: true,
    workerAvailable: true,
    spendAuthorityUsd: 50,
    budgetRemainingUsd: 100,
    ...overrides,
  };
}

function internalMakeOption(): GroundedOption {
  const built = buildInternalOption({
    requirementKey: "req_cp3",
    contractRevision: 1,
    capabilityKeys: ["growth_launch_operations"],
    responsibility: "update launch artifact",
    workerKey: "worker_growth",
    staffingReason: "reuse",
    facts: EMPTY_FACTS,
  });
  assert.ok(built.option);
  return built.option;
}

test("CP3: owned required inputs keep MAKE eligible (no forced BUY)", () => {
  const option = internalMakeOption();
  const grounded = withEligibility([option], (o) =>
    eligibilityInputFor(o, baseEligibilityFacts()),
  )[0];
  assert.equal(grounded.eligibility.eligible, true);
  if (grounded.eligibility.eligible) {
    assert.ok(grounded.eligibility.checksPassed.includes("inputs_owned"));
    assert.ok(!grounded.eligibility.checksPassed.includes("resources_controlled"));
  }
});

test("CP3: missing uncontrolled required input → input_not_owned (not capability_not_governed)", () => {
  const option = internalMakeOption();
  const missingData = baseEligibilityFacts({
    requiredResourceClasses: ["proprietary_data", ...GROWTH_FIVE],
    controlledResourceClasses: [...GROWTH_FIVE],
  });
  const grounded = withEligibility([option], (o) =>
    eligibilityInputFor(o, missingData),
  )[0];
  assert.equal(grounded.eligibility.eligible, false);
  if (!grounded.eligibility.eligible) {
    assert.deepEqual(grounded.eligibility.reasons, ["input_not_owned"]);
    assert.ok(!grounded.eligibility.reasons.includes("capability_not_governed"));
  }
});

test("CP3: compatible verified external offering with price may be BUY-eligible", () => {
  const buy = buildExternalOption({
    requirementKey: "req_data",
    contractRevision: 1,
    offeringId: "off_dataset",
    providerId: "prov_a",
    serviceId: "svc_dataset",
    resourceClass: "proprietary_data",
    priceUsd: 2,
    priceProvenance: "registry_data",
    registryVerified: true,
    compatibleResourceClass: true,
    facts: EMPTY_FACTS,
  });
  const facts = baseEligibilityFacts({
    requiredResourceClasses: ["proprietary_data"],
    controlledResourceClasses: [],
  });
  const result = evaluateOptionEligibility(eligibilityInputFor(buy, facts));
  assert.equal(result.eligible, true);
  if (result.eligible) {
    assert.ok(result.checksPassed.includes("provider_identity_compatible"));
    assert.ok(result.checksPassed.includes("financial_bounds"));
  }
});

test("CP3: incompatible resource class makes BUY ineligible", () => {
  const buy = buildExternalOption({
    requirementKey: "req_data",
    contractRevision: 1,
    offeringId: "off_wrong_class",
    providerId: "prov_a",
    serviceId: "svc_wrong",
    resourceClass: "privileged_access",
    priceUsd: 1,
    priceProvenance: "provider_quote",
    registryVerified: true,
    compatibleResourceClass: false,
    facts: EMPTY_FACTS,
  });
  const result = evaluateOptionEligibility(
    eligibilityInputFor(
      buy,
      baseEligibilityFacts({
        requiredResourceClasses: ["proprietary_data"],
        controlledResourceClasses: [],
      }),
    ),
  );
  assert.equal(result.eligible, false);
  if (!result.eligible) {
    assert.ok(result.reasons.includes("provider_incompatible"));
  }
});

test("CP3: missing spend authority routes BUY to approval_required at authorization", () => {
  const buy = withEligibility(
    [
      buildExternalOption({
        requirementKey: "req_cp3",
        contractRevision: 1,
        offeringId: "off_paid",
        providerId: "prov_a",
        serviceId: "svc_a",
        resourceClass: "proprietary_data",
        priceUsd: 3,
        priceProvenance: "registry_data",
        registryVerified: true,
        compatibleResourceClass: true,
        facts: EMPTY_FACTS,
      }),
    ],
    (o) =>
      eligibilityInputFor(
        o,
        baseEligibilityFacts({
          requiredResourceClasses: ["proprietary_data"],
          controlledResourceClasses: [],
          spendAuthorityUsd: null,
        }),
      ),
  )[0];
  assert.equal(buy.eligibility.eligible, true);

  const auth = reauthorizeRecommendation(
    {
      requirementKey: "req_cp3",
      contractRevision: 1,
      selectedOptionId: buy.optionId,
      strongestAlternativeId: null,
      rationale: "dataset is required for the report",
      materialAssumptions: [],
      changeMyMindEvidence: [],
    },
    {
      currentContractRevision: 1,
      optionsById: new Map([[buy.optionId, buy]]),
      eligibilityFor: (option) =>
        eligibilityInputFor(
          option,
          baseEligibilityFacts({
            requiredResourceClasses: ["proprietary_data"],
            controlledResourceClasses: [],
            spendAuthorityUsd: null,
          }),
        ),
      at,
      decisionId: "dec_cp3",
      spendAuthorityUsd: null,
      spendApprovalId: null,
      externalAuthority: "m3_available_bounded",
      unresolvedMaterialAmbiguity: null,
      waiverRequested: false,
    },
  );
  assert.equal(auth.kind, "approval_required");
  if (auth.kind === "approval_required") {
    assert.equal(auth.reason, "spend_authority_required");
  }
});

test("CP3: snapshot offerings ground price with registry_data provenance", () => {
  const registry: RegistryEntry[] = [
    {
      serviceId: "svc_snapshot",
      providerId: "prov_snapshot",
      resourceClasses: ["proprietary_data"],
      verified: true,
    },
  ];
  const discovered: MarketOffering[] = [
    {
      offeringId: "prov_snapshot:svc_snapshot",
      providerId: "prov_snapshot",
      serviceId: "svc_snapshot",
      name: "Snapshot dataset",
      description: "fixture",
      price: { amount: "1.25", asset: "USDT", unit: "per_use" },
      source: { kind: "snapshot", retrievedAt: at },
      compatibleResourceClasses: [],
    },
  ];
  const { offerings, factsForOffering } = groundRegistryOfferings({
    registry,
    discovered,
    requiredResourceClass: "proprietary_data",
    at,
  });
  assert.equal(offerings.length, 1);
  assert.equal(offerings[0].priceUsd, 1.25);
  assert.equal(offerings[0].priceProvenance, "registry_data");
  const facts = factsForOffering(offerings[0]);
  assert.ok(facts.externalPriceUsd);
  assert.equal(facts.externalPriceUsd!.provenance, "registry_data");
});

test("CP3: HYBRID excludes external resourceClass from ownership check", () => {
  const internal = internalMakeOption();
  const external = buildExternalOption({
    requirementKey: "req_cp3",
    contractRevision: 1,
    offeringId: "off_data_half",
    providerId: "prov_a",
    serviceId: "svc_data",
    resourceClass: "proprietary_data",
    priceUsd: 1,
    priceProvenance: "registry_data",
    registryVerified: true,
    compatibleResourceClass: true,
    facts: EMPTY_FACTS,
  });
  const hybrid = buildHybridOption({
    requirementKey: "req_cp3",
    contractRevision: 1,
    internal,
    external,
    facts: EMPTY_FACTS,
  });
  const grounded = withEligibility([hybrid], (o) =>
    eligibilityInputFor(
      o,
      baseEligibilityFacts({
        requiredResourceClasses: ["proprietary_data", ...GROWTH_FIVE],
        controlledResourceClasses: [...GROWTH_FIVE],
      }),
    ),
  )[0];
  assert.equal(grounded.eligibility.eligible, true);
  if (grounded.eligibility.eligible) {
    assert.ok(grounded.eligibility.checksPassed.includes("inputs_owned"));
  }
});

test("CP3: recommendation parser requires non-empty rationale against eligible options", () => {
  const option = internalMakeOption();
  const grounded = withEligibility([option], (o) =>
    eligibilityInputFor(o, baseEligibilityFacts()),
  )[0];
  assert.equal(grounded.eligibility.eligible, true);

  const missingRationale = parseManagerialRecommendation(
    {
      requirementKey: "req_cp3",
      contractRevision: 1,
      selectedOptionId: grounded.optionId,
      rationale: "",
    },
    {
      requirementKey: "req_cp3",
      contractRevision: 1,
      eligibleOptionIds: [grounded.optionId],
    },
  );
  assert.equal(missingRationale.ok, false);
  if (!missingRationale.ok) {
    assert.ok(
      missingRationale.errors.some((e) => e.includes("no business rationale")),
    );
  }

  const valid = parseManagerialRecommendation(
    {
      requirementKey: "req_cp3",
      contractRevision: 1,
      selectedOptionId: grounded.optionId,
      rationale: "Internal path already controls every required input.",
    },
    {
      requirementKey: "req_cp3",
      contractRevision: 1,
      eligibleOptionIds: [grounded.optionId],
    },
  );
  assert.equal(valid.ok, true);
});

test("CP3: evaluateOptionEligibility direct — unknown class still capability_not_governed", () => {
  const input: EligibilityInput = {
    requirementKey: "req_cp3",
    contractRevision: 1,
    kind: "internal",
    requiredPrimitives: ["read_public_web"],
    requiredResourceClasses: ["not_a_real_resource_class"],
    controlledResourceClasses: ["not_a_real_resource_class"],
    deadlineAt: null,
    now: at,
    estimatedMinutes: null,
    requiresMandatoryProof: false,
    proofAvailable: true,
    external: null,
    workerAvailable: true,
    spendAuthorityUsd: null,
    budgetRemainingUsd: null,
  };
  const result = evaluateOptionEligibility(input);
  assert.equal(result.eligible, false);
  if (!result.eligible) {
    assert.ok(result.reasons.includes("capability_not_governed"));
    assert.ok(!result.reasons.includes("input_not_owned"));
  }
});
