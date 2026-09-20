import { test } from "node:test";
import { strict as assert } from "node:assert";
import {
  groundRegistryOfferings,
  requiredResourceClassesFor,
  controlledResourceClassesFor,
  buildGroundingContext,
} from "../lib/management/grounding";
import type { RegistryEntry } from "../lib/market/registryData";
import type { MarketOffering } from "../lib/market/discovery";
import type { ResourceClass } from "../lib/workforce/types";
import { EMPTY_FACTS } from "../lib/management/options";

// ── Test fixtures ────────────────────────────────────────────────────────────

const mockRegistry: RegistryEntry[] = [
  {
    serviceId: "test_service_a",
    providerId: "provider_a",
    resourceClasses: ["proprietary_data"],
    verified: true,
  },
  {
    serviceId: "test_service_b",
    providerId: "provider_b",
    resourceClasses: ["privileged_access"],
    verified: true,
  },
];

const mockOfferings: MarketOffering[] = [
  {
    offeringId: "provider_a:test_service_a",
    providerId: "provider_a",
    serviceId: "test_service_a",
    name: "Test Offering A",
    description: "Test offering A",
    price: { amount: "0.002", asset: "USDT", unit: "per_use" },
    source: { kind: "snapshot", retrievedAt: 1000 },
    compatibleResourceClasses: [],
  },
  {
    offeringId: "provider_b:test_service_b",
    providerId: "provider_b",
    serviceId: "test_service_b",
    name: "Test Offering B",
    description: "Test offering B",
    price: { amount: "0.005", asset: "USDT", unit: "per_use" },
    source: { kind: "snapshot", retrievedAt: 1000 },
    compatibleResourceClasses: [],
  },
];

// ── Determinism tests ────────────────────────────────────────────────────────

test("groundRegistryOfferings is deterministic", () => {
  const input = {
    registry: mockRegistry,
    discovered: mockOfferings,
    requiredResourceClass: "proprietary_data" as const,
    at: 1000,
  };

  const result1 = groundRegistryOfferings(input);
  const result2 = groundRegistryOfferings(input);

  // Same input → identical offerings array
  assert.equal(result1.offerings.length, result2.offerings.length);

  for (let i = 0; i < result1.offerings.length; i++) {
    assert.equal(result1.offerings[i].offeringId, result2.offerings[i].offeringId);
    assert.equal(result1.offerings[i].priceUsd, result2.offerings[i].priceUsd);
    assert.equal(result1.offerings[i].registryVerified, result2.offerings[i].registryVerified);
    assert.equal(result1.offerings[i].compatibleResourceClass, result2.offerings[i].compatibleResourceClass);
  }

  // factsForOffering produces identical results for same inputs
  for (const offering of result1.offerings) {
    const facts1 = result1.factsForOffering(offering);
    const matchingOffering = result2.offerings.find(o => o.offeringId === offering.offeringId)!;
    const facts2 = result2.factsForOffering(matchingOffering);
    assert.deepEqual(facts1, facts2);
  }
});

// ── UNKNOWN fields stay null ─────────────────────────────────────────────────

test("UNKNOWN fields remain null, never invented", () => {
  const result = groundRegistryOfferings({
    registry: mockRegistry,
    discovered: mockOfferings,
    requiredResourceClass: "proprietary_data",
    at: 1000,
  });

  for (const offering of result.offerings) {
    const facts = result.factsForOffering(offering);

    // These fields are UNKNOWN in the registry data
    assert.equal(facts.expectedQuality, null);
    assert.equal(facts.setupMinutes, null);
    assert.equal(facts.queueMinutes, null);
    assert.equal(facts.executionMinutes, null);
    assert.equal(facts.verificationMinutes, null);
    assert.equal(facts.reliability, null);
    assert.equal(facts.availability, null);
    assert.equal(facts.reuseValue, null);
    assert.equal(facts.externalAdvantage, null);
    assert.equal(facts.internalCostUsd, null);
  }
});

// ── Provenance classes preserved ─────────────────────────────────────────────

test("provenance classes are preserved exactly", () => {
  const result = groundRegistryOfferings({
    registry: mockRegistry,
    discovered: mockOfferings,
    requiredResourceClass: "proprietary_data",
    at: 1000,
  });

  for (const offering of result.offerings) {
    const facts = result.factsForOffering(offering);

    // Snapshot fixtures carry registry_data provenance, not a live provider quote.
    if (facts.externalPriceUsd !== null) {
      assert.equal(facts.externalPriceUsd.provenance, "registry_data");
      assert.equal(facts.externalPriceUsd.confidence, "high");
      const matched = result.offerings.find((o) => facts.scope === `external:${o.resourceClass}`);
      assert.ok(matched);
      assert.equal(matched.priceProvenance, "registry_data");
    }

    // Scope is always populated
    assert.ok(facts.scope !== null);
    assert.ok(facts.scope.startsWith("external:"));
  }
});

// ── Missing price yields null ────────────────────────────────────────────────

test("missing price yields priceUsd: null", () => {
  const offeringWithoutPrice: MarketOffering = {
    offeringId: "provider_c:test_service_c",
    providerId: "provider_c",
    serviceId: "test_service_c",
    name: "No Price",
    description: "Offering without price",
    price: null,
    source: { kind: "snapshot", retrievedAt: 1000 },
    compatibleResourceClasses: [],
  };

  const registryWithC: RegistryEntry[] = [
    ...mockRegistry,
    {
      serviceId: "test_service_c",
      providerId: "provider_c",
      resourceClasses: ["specialist_compute"],
      verified: true,
    },
  ];

  const result = groundRegistryOfferings({
    registry: registryWithC,
    discovered: [offeringWithoutPrice],
    requiredResourceClass: "specialist_compute",
    at: 1000,
  });

  assert.equal(result.offerings.length, 1);
  assert.equal(result.offerings[0].priceUsd, null);
  const facts = result.factsForOffering(result.offerings[0]);
  assert.equal(facts.externalPriceUsd, null);
});

// ── Resource-class derivation from catalog ───────────────────────────────────

test("requiredResourceClassesFor derives from catalog", () => {
  const classes = requiredResourceClassesFor(["public_information_research"]);

  // public_information_research requires: llm_reasoning, public_web, ordinary_compute
  assert.ok(classes.includes("llm_reasoning"));
  assert.ok(classes.includes("public_web"));
  assert.ok(classes.includes("ordinary_compute"));
  assert.equal(classes.length, 3);
});

test("requiredResourceClassesFor handles multiple capabilities", () => {
  const classes = requiredResourceClassesFor([
    "public_information_research",
    "company_records_lookup",
  ]);

  // public_information_research: llm_reasoning, public_web, ordinary_compute
  // company_records_lookup: llm_reasoning, company_records, company_tools, ordinary_compute
  assert.ok(classes.includes("llm_reasoning"));
  assert.ok(classes.includes("public_web"));
  assert.ok(classes.includes("ordinary_compute"));
  assert.ok(classes.includes("company_records"));
  assert.ok(classes.includes("company_tools"));
});

test("requiredResourceClassesFor ignores unknown capabilities", () => {
  const classes = requiredResourceClassesFor([
    "public_information_research",
    "unknown_capability",
  ]);

  // Should only include resources from the known capability
  assert.ok(classes.includes("llm_reasoning"));
  assert.ok(classes.includes("public_web"));
  assert.ok(classes.includes("ordinary_compute"));
  assert.equal(classes.length, 3);
});

// ── Resource-class derivation from inventory ─────────────────────────────────

test("controlledResourceClassesFor derives from inventory", () => {
  const inventory: ResourceClass[] = ["llm_reasoning", "public_web", "ordinary_compute"];
  const classes = controlledResourceClassesFor(inventory);

  assert.deepEqual(classes, ["llm_reasoning", "ordinary_compute", "public_web"]);
});

test("controlledResourceClassesFor deduplicates", () => {
  const inventory: ResourceClass[] = ["llm_reasoning", "llm_reasoning", "public_web"];
  const classes = controlledResourceClassesFor(inventory);

  assert.deepEqual(classes, ["llm_reasoning", "public_web"]);
});

// ── Generic requirement shape ────────────────────────────────────────────────

test("generic requirement shape can be grounded", () => {
  // Test with a non-launch, non-growth requirement
  const result = groundRegistryOfferings({
    registry: mockRegistry,
    discovered: mockOfferings,
    requiredResourceClass: "privileged_access",
    at: 1000,
  });

  // Should ground offerings
  assert.ok(result.offerings.length > 0);

  // At least one offering should be compatible with privileged_access
  const compatible = result.offerings.filter((o) => o.compatibleResourceClass);
  assert.ok(compatible.length > 0);

  // The compatible offering should have the correct resource class
  for (const offering of compatible) {
    assert.equal(offering.resourceClass, "privileged_access");
  }
});

// ── buildGroundingContext convenience wrapper ────────────────────────────────

test("buildGroundingContext produces correct shape", () => {
  const context = buildGroundingContext({
    registry: mockRegistry,
    discovered: mockOfferings,
    requiredResourceClass: "proprietary_data",
    at: 1000,
    internalFacts: EMPTY_FACTS,
  });

  assert.ok(Array.isArray(context.discovered));
  assert.equal(typeof context.factsForOffering, "function");
  assert.deepEqual(context.internalFacts, EMPTY_FACTS);

  // factsForOffering should work for each discovered offering
  for (const offering of context.discovered) {
    const facts = context.factsForOffering(offering);
    assert.ok(facts !== null);
    assert.ok(typeof facts === "object");
  }
});

// ── Empty discovery is valid ─────────────────────────────────────────────────

test("empty discovery array is valid", () => {
  const result = groundRegistryOfferings({
    registry: mockRegistry,
    discovered: [],
    requiredResourceClass: "proprietary_data",
    at: 1000,
  });

  assert.equal(result.offerings.length, 0);
  assert.equal(typeof result.factsForOffering, "function");
});

// ── Unverified registry entries ──────────────────────────────────────────────

test("unverified registry entries are marked correctly", () => {
  const unverifiedRegistry: RegistryEntry[] = [
    {
      serviceId: "test_service_a",
      providerId: "provider_a",
      resourceClasses: ["proprietary_data"],
      verified: false,
    },
  ];

  const result = groundRegistryOfferings({
    registry: unverifiedRegistry,
    discovered: [mockOfferings[0]],
    requiredResourceClass: "proprietary_data",
    at: 1000,
  });

  // Offering should be grounded but marked as unverified
  const offering = result.offerings.find((o) => o.offeringId === "provider_a:test_service_a");
  assert.ok(offering);
  assert.equal(offering.registryVerified, false);
  assert.equal(offering.compatibleResourceClass, false);
});

// ── Real snapshot data grounding ─────────────────────────────────────────────

test("real VERIFIED_SERVICE_REGISTRY + SNAPSHOT_OFFERINGS grounding", () => {
  const { VERIFIED_SERVICE_REGISTRY } = require("../lib/market/registryData") as typeof import("../lib/market/registryData");
  const { SNAPSHOT_OFFERINGS } = require("../lib/market/snapshotData") as typeof import("../lib/market/snapshotData");

  const result = groundRegistryOfferings({
    registry: VERIFIED_SERVICE_REGISTRY,
    discovered: SNAPSHOT_OFFERINGS,
    requiredResourceClass: "proprietary_data",
    at: 1726617600000,
  });

  // All four snapshot offerings should be grounded
  assert.equal(result.offerings.length, 4);

  // newsliquid_twitter_search: verified, proprietary_data → compatible
  const newsliquid = result.offerings.find((o) => o.serviceId === "newsliquid_twitter_search");
  assert.ok(newsliquid);
  assert.equal(newsliquid.registryVerified, true);
  assert.equal(newsliquid.compatibleResourceClass, true);
  assert.equal(newsliquid.priceUsd, 0.002);

  // flybeacon_project_growth_analysis: verified, but [llm_reasoning, public_web, company_records] → NOT compatible with proprietary_data
  const flybeaconAnalysis = result.offerings.find((o) => o.serviceId === "flybeacon_project_growth_analysis");
  assert.ok(flybeaconAnalysis);
  assert.equal(flybeaconAnalysis.registryVerified, true);
  assert.equal(flybeaconAnalysis.compatibleResourceClass, false);

  // Facts for newsliquid: snapshot price is registry_data
  assert.equal(newsliquid.priceProvenance, "registry_data");
  const newsliquidFacts = result.factsForOffering(newsliquid);
  assert.ok(newsliquidFacts.externalPriceUsd !== null);
  assert.equal(newsliquidFacts.externalPriceUsd!.provenance, "registry_data");
  assert.equal(newsliquidFacts.externalPriceUsd!.value, 0.002);
  // Everything else null
  assert.equal(newsliquidFacts.expectedQuality, null);
  assert.equal(newsliquidFacts.setupMinutes, null);
  assert.equal(newsliquidFacts.reliability, null);
});

// ── Provenance never upgraded ────────────────────────────────────────────────

test("live discovery quotes keep provider_quote provenance (never upgraded to measured)", () => {
  const liveOffering: MarketOffering = {
    ...mockOfferings[0],
    source: { kind: "okx_api", retrievedAt: 1000 },
  };
  const result = groundRegistryOfferings({
    registry: mockRegistry,
    discovered: [liveOffering],
    requiredResourceClass: "proprietary_data",
    at: 1000,
  });

  const grounded = result.offerings[0];
  assert.equal(grounded.priceProvenance, "provider_quote");
  const facts = result.factsForOffering(grounded);
  if (facts.externalPriceUsd !== null) {
    assert.equal(facts.externalPriceUsd.provenance, "provider_quote");
  }
});
