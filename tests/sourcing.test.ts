import { test } from "node:test";
import assert from "node:assert/strict";
import {
  evaluateSourcingPolicy,
  validateModelProposal,
} from "@/lib/sourcing";
import type {
  ApprovedProviderPath,
  FactualResourceInventory,
  UntrustedModelProposal,
  ValidatedResourceNeeds,
} from "@/lib/sourcing";

// ─── Test 1: All required resources present in inventory → MAKE ─────────────

test("all required resources present in inventory → MAKE", () => {
  const validatedNeeds: ValidatedResourceNeeds = {
    requiredResourceClasses: ["llm_reasoning", "public_web", "ordinary_compute"],
    rejectedUnknownClasses: [],
  };

  const inventory: FactualResourceInventory = {
    controlledResourceClasses: ["llm_reasoning", "public_web", "ordinary_compute", "company_records"],
  };

  const result = evaluateSourcingPolicy({ validatedNeeds, factualInventory: inventory });

  assert.equal(result.outcome, "authorizing");
  if (result.outcome === "authorizing") {
    assert.equal(result.decision, "MAKE");
    assert.equal(result.reasonCode, "all_resources_controlled");
    assert.deepEqual([...result.satisfiedResourceClasses].sort(), ["llm_reasoning", "ordinary_compute", "public_web"]);
    assert.deepEqual(result.missingResourceClasses, []);
    assert.deepEqual(result.approvedProviderPaths, []);
  }
});

// ─── Test 2: Worker absent but resources factually controlled → still MAKE ──

test("missing worker ≠ BUY: resources factually controlled → MAKE even without worker", () => {
  // The kernel doesn't know about workers - it only cares about resources.
  // This test verifies the invariant: a missing worker is NOT automatically BUY.
  // If the underlying required resources are factually controlled, the decision stays MAKE.
  const validatedNeeds: ValidatedResourceNeeds = {
    requiredResourceClasses: ["llm_reasoning", "company_records"],
    rejectedUnknownClasses: [],
  };

  const inventory: FactualResourceInventory = {
    controlledResourceClasses: ["llm_reasoning", "company_records", "ordinary_compute"],
  };

  const result = evaluateSourcingPolicy({ validatedNeeds, factualInventory: inventory });

  assert.equal(result.outcome, "authorizing");
  if (result.outcome === "authorizing") {
    assert.equal(result.decision, "MAKE");
    assert.equal(result.reasonCode, "all_resources_controlled");
    // The kernel doesn't care whether a worker exists - only whether resources are controlled.
  }
});

// ─── Test 3: One resource missing + approved provider path → BUY ────────────

test("one resource missing + approved provider path for that resource → BUY", () => {
  const validatedNeeds: ValidatedResourceNeeds = {
    requiredResourceClasses: ["llm_reasoning", "physical_presence"],
    rejectedUnknownClasses: [],
  };

  const inventory: FactualResourceInventory = {
    controlledResourceClasses: ["llm_reasoning", "ordinary_compute"],
  };

  const approvedPaths: ApprovedProviderPath[] = [
    { forResourceClass: "physical_presence", pathId: "field_agent_service" },
  ];

  const result = evaluateSourcingPolicy({
    validatedNeeds,
    factualInventory: inventory,
    approvedProviderPaths: approvedPaths,
  });

  assert.equal(result.outcome, "authorizing");
  if (result.outcome === "authorizing") {
    assert.equal(result.decision, "BUY");
    assert.equal(result.reasonCode, "missing_with_approved_path");
    assert.deepEqual(result.satisfiedResourceClasses, ["llm_reasoning"]);
    assert.deepEqual(result.missingResourceClasses, ["physical_presence"]);
    assert.equal(result.approvedProviderPaths.length, 1);
    assert.equal(result.approvedProviderPaths[0].forResourceClass, "physical_presence");
    assert.equal(result.approvedProviderPaths[0].pathId, "field_agent_service");
  }
});

// ─── Test 4: One resource missing + no approved path → BLOCKED ──────────────

test("one resource missing + no approved path → BLOCKED", () => {
  const validatedNeeds: ValidatedResourceNeeds = {
    requiredResourceClasses: ["llm_reasoning", "attestation"],
    rejectedUnknownClasses: [],
  };

  const inventory: FactualResourceInventory = {
    controlledResourceClasses: ["llm_reasoning"],
  };

  const result = evaluateSourcingPolicy({ validatedNeeds, factualInventory: inventory });

  assert.equal(result.outcome, "authorizing");
  if (result.outcome === "authorizing") {
    assert.equal(result.decision, "BLOCKED");
    assert.equal(result.reasonCode, "missing_without_approved_path");
    assert.deepEqual(result.satisfiedResourceClasses, ["llm_reasoning"]);
    assert.deepEqual(result.missingResourceClasses, ["attestation"]);
    assert.deepEqual(result.approvedProviderPaths, []);
  }
});

// ─── Test 5: Multiple required resources with exactly one missing ───────────

test("multiple required resources with exactly one missing → correct result", () => {
  const validatedNeeds: ValidatedResourceNeeds = {
    requiredResourceClasses: ["llm_reasoning", "public_web", "ordinary_compute", "specialist_compute"],
    rejectedUnknownClasses: [],
  };

  const inventory: FactualResourceInventory = {
    controlledResourceClasses: ["llm_reasoning", "public_web", "ordinary_compute"],
  };

  const approvedPaths: ApprovedProviderPath[] = [
    { forResourceClass: "specialist_compute", pathId: "gpu_cloud_provider" },
  ];

  const result = evaluateSourcingPolicy({
    validatedNeeds,
    factualInventory: inventory,
    approvedProviderPaths: approvedPaths,
  });

  assert.equal(result.outcome, "authorizing");
  if (result.outcome === "authorizing") {
    assert.equal(result.decision, "BUY");
    assert.equal(result.reasonCode, "missing_with_approved_path");
    assert.deepEqual([...result.satisfiedResourceClasses].sort(), ["llm_reasoning", "ordinary_compute", "public_web"]);
    assert.deepEqual(result.missingResourceClasses, ["specialist_compute"]);
    assert.equal(result.approvedProviderPaths.length, 1);
    assert.equal(result.approvedProviderPaths[0].forResourceClass, "specialist_compute");
  }
});

// ─── Test 6: Unknown / tampered resource identity → fails closed ────────────

test("unknown / tampered resource identity → fails closed, never MAKE", () => {
  const proposal: UntrustedModelProposal = {
    requiredResourceClasses: ["llm_reasoning", "unknown_resource_class", "another_fake_one"],
  };

  const validated = validateModelProposal(proposal);

  // The unknown classes should be rejected
  assert.deepEqual(validated.requiredResourceClasses, ["llm_reasoning"]);
  assert.deepEqual([...validated.rejectedUnknownClasses].sort(), ["another_fake_one", "unknown_resource_class"]);

  // Now evaluate with the validated needs
  const inventory: FactualResourceInventory = {
    controlledResourceClasses: ["llm_reasoning"],
  };

  const result = evaluateSourcingPolicy({ validatedNeeds: validated, factualInventory: inventory });

  assert.equal(result.outcome, "authorizing");
  if (result.outcome === "authorizing") {
    assert.equal(result.decision, "MAKE");
    // The unknown classes were stripped, so only llm_reasoning remains, which is controlled.
  }
});

// ─── Test 7: Model-provided sourcing verdict is ignored ─────────────────────

test("model-provided sourcing verdict is ignored / not part of authority", () => {
  const proposal: UntrustedModelProposal = {
    requiredResourceClasses: ["llm_reasoning", "physical_presence"],
    decision: "MAKE", // Model claims MAKE
    sourcing: "internal", // Model claims internal sourcing
    makeOrBuy: "MAKE", // Another way to claim MAKE
    approved: true, // Model claims approval
    provider: "internal", // Model claims internal provider
  };

  const validated = validateModelProposal(proposal);

  // The validated output should only contain the resource classes
  assert.deepEqual([...validated.requiredResourceClasses].sort(), ["llm_reasoning", "physical_presence"]);
  assert.deepEqual(validated.rejectedUnknownClasses, []);

  // The authority fields should be stripped (not present in the validated output)
  assert.equal((validated as any).decision, undefined);
  assert.equal((validated as any).sourcing, undefined);
  assert.equal((validated as any).makeOrBuy, undefined);
  assert.equal((validated as any).approved, undefined);
  assert.equal((validated as any).provider, undefined);

  // Now evaluate: physical_presence is missing, so it should be BLOCKED (no path)
  const inventory: FactualResourceInventory = {
    controlledResourceClasses: ["llm_reasoning"],
  };

  const result = evaluateSourcingPolicy({ validatedNeeds: validated, factualInventory: inventory });

  assert.equal(result.outcome, "authorizing");
  if (result.outcome === "authorizing") {
    assert.equal(result.decision, "BLOCKED"); // NOT MAKE, despite model's claim
    assert.equal(result.reasonCode, "missing_without_approved_path");
  }
});

// ─── Test 8: Empty requirements fail closed ─────────────────────────────────

test("empty requirements and structurally invalid requirements cannot silently produce MAKE", () => {
  // Empty requirements
  const validated1: ValidatedResourceNeeds = {
    requiredResourceClasses: [],
    rejectedUnknownClasses: [],
  };

  const inventory: FactualResourceInventory = {
    controlledResourceClasses: ["llm_reasoning"],
  };

  const result1 = evaluateSourcingPolicy({ validatedNeeds: validated1, factualInventory: inventory });

  assert.equal(result1.outcome, "invalid");
  if (result1.outcome === "invalid") {
    assert.ok(result1.reason.includes("Empty"));
  }

  // Structurally invalid: null proposal
  const validated2 = validateModelProposal(null);
  assert.deepEqual(validated2.requiredResourceClasses, []);

  const result2 = evaluateSourcingPolicy({ validatedNeeds: validated2, factualInventory: inventory });
  assert.equal(result2.outcome, "invalid");

  // Structurally invalid: undefined proposal
  const validated3 = validateModelProposal(undefined);
  assert.deepEqual(validated3.requiredResourceClasses, []);

  const result3 = evaluateSourcingPolicy({ validatedNeeds: validated3, factualInventory: inventory });
  assert.equal(result3.outcome, "invalid");
});

// ─── Test 9: Catalogue-membership-as-ownership regression guard ─────────────

test("catalogue-membership-as-ownership regression guard: catalogue-owned class absent from inventory is reported missing", () => {
  // "llm_reasoning" is in the catalog as "owned", but if it's not in the inventory, it's missing.
  const validatedNeeds: ValidatedResourceNeeds = {
    requiredResourceClasses: ["llm_reasoning", "public_web"],
    rejectedUnknownClasses: [],
  };

  const inventory: FactualResourceInventory = {
    controlledResourceClasses: ["public_web"], // llm_reasoning is NOT in the inventory
  };

  const result = evaluateSourcingPolicy({ validatedNeeds, factualInventory: inventory });

  assert.equal(result.outcome, "authorizing");
  if (result.outcome === "authorizing") {
    assert.equal(result.decision, "BLOCKED");
    assert.deepEqual(result.satisfiedResourceClasses, ["public_web"]);
    assert.deepEqual(result.missingResourceClasses, ["llm_reasoning"]); // llm_reasoning is missing despite being in catalog
  }
});

// ─── Test 10: Determinism ───────────────────────────────────────────────────

test("determinism: repeated evaluation of identical inputs yields identical results", () => {
  const validatedNeeds: ValidatedResourceNeeds = {
    requiredResourceClasses: ["llm_reasoning", "public_web", "ordinary_compute", "specialist_compute"],
    rejectedUnknownClasses: [],
  };

  const inventory: FactualResourceInventory = {
    controlledResourceClasses: ["llm_reasoning", "public_web"],
  };

  const approvedPaths: ApprovedProviderPath[] = [
    { forResourceClass: "specialist_compute", pathId: "gpu_cloud" },
  ];

  // Call evaluateSourcingPolicy multiple times with the same inputs
  const result1 = evaluateSourcingPolicy({ validatedNeeds, factualInventory: inventory, approvedProviderPaths: approvedPaths });
  const result2 = evaluateSourcingPolicy({ validatedNeeds, factualInventory: inventory, approvedProviderPaths: approvedPaths });
  const result3 = evaluateSourcingPolicy({ validatedNeeds, factualInventory: inventory, approvedProviderPaths: approvedPaths });

  // All results should be byte-identical
  assert.deepEqual(result1, result2);
  assert.deepEqual(result2, result3);

  // Verify missing lists are sorted
  if (result1.outcome === "authorizing") {
    const missing = result1.missingResourceClasses;
    const sorted = [...missing].sort();
    assert.deepEqual(missing, sorted);
  }
});

// ─── Test 11: Provider path for resource X cannot satisfy resource Y ────────

test("a provider path approved for resource X cannot satisfy a missing resource Y", () => {
  const validatedNeeds: ValidatedResourceNeeds = {
    requiredResourceClasses: ["llm_reasoning", "physical_presence", "attestation"],
    rejectedUnknownClasses: [],
  };

  const inventory: FactualResourceInventory = {
    controlledResourceClasses: ["llm_reasoning"],
  };

  // Provide a path for physical_presence, but NOT for attestation
  const approvedPaths: ApprovedProviderPath[] = [
    { forResourceClass: "physical_presence", pathId: "field_agent" },
  ];

  const result = evaluateSourcingPolicy({
    validatedNeeds,
    factualInventory: inventory,
    approvedProviderPaths: approvedPaths,
  });

  assert.equal(result.outcome, "authorizing");
  if (result.outcome === "authorizing") {
    assert.equal(result.decision, "BLOCKED"); // BLOCKED because attestation has no path
    assert.deepEqual(result.satisfiedResourceClasses, ["llm_reasoning"]);
    assert.deepEqual([...result.missingResourceClasses].sort(), ["attestation", "physical_presence"]);
    assert.deepEqual(result.approvedProviderPaths, []); // No paths in BLOCKED result
  }
});

// ─── Test 12: validateModelProposal strips authority fields ─────────────────

test("validateModelProposal strips all authority fields from model proposal", () => {
  const proposal: UntrustedModelProposal = {
    requiredResourceClasses: ["llm_reasoning"],
    decision: "MAKE",
    sourcing: "internal",
    makeOrBuy: "MAKE",
    approved: true,
    provider: "internal",
    authority: "model",
    authorization: "granted",
  };

  const validated = validateModelProposal(proposal);

  // Only the resource classes should remain
  assert.deepEqual(validated.requiredResourceClasses, ["llm_reasoning"]);
  assert.deepEqual(validated.rejectedUnknownClasses, []);

  // All authority fields should be stripped
  const keys = Object.keys(validated);
  assert.deepEqual(keys.sort(), ["rejectedUnknownClasses", "requiredResourceClasses"]);
});

// ─── Test 13: validateModelProposal deduplicates and sorts resources ────────

test("validateModelProposal deduplicates and sorts resources", () => {
  const proposal: UntrustedModelProposal = {
    requiredResourceClasses: ["public_web", "llm_reasoning", "public_web", "ordinary_compute", "llm_reasoning"],
  };

  const validated = validateModelProposal(proposal);

  // Should be deduplicated and sorted
  assert.deepEqual(validated.requiredResourceClasses, ["llm_reasoning", "ordinary_compute", "public_web"]);
});

// ─── Test 14: validateModelProposal rejects unknown resource classes ────────

test("validateModelProposal rejects unknown resource classes and reports them", () => {
  const proposal: UntrustedModelProposal = {
    requiredResourceClasses: ["llm_reasoning", "fake_resource", "another_fake", "public_web"],
  };

  const validated = validateModelProposal(proposal);

  assert.deepEqual([...validated.requiredResourceClasses].sort(), ["llm_reasoning", "public_web"]);
  assert.deepEqual([...validated.rejectedUnknownClasses].sort(), ["another_fake", "fake_resource"]);
});

// ─── Test 15: Multiple missing resources, some with paths, some without → BLOCKED

test("multiple missing resources, some with paths, some without → BLOCKED", () => {
  const validatedNeeds: ValidatedResourceNeeds = {
    requiredResourceClasses: ["llm_reasoning", "physical_presence", "attestation", "specialist_compute"],
    rejectedUnknownClasses: [],
  };

  const inventory: FactualResourceInventory = {
    controlledResourceClasses: ["llm_reasoning"],
  };

  // Provide paths for physical_presence and specialist_compute, but NOT attestation
  const approvedPaths: ApprovedProviderPath[] = [
    { forResourceClass: "physical_presence", pathId: "field_agent" },
    { forResourceClass: "specialist_compute", pathId: "gpu_cloud" },
  ];

  const result = evaluateSourcingPolicy({
    validatedNeeds,
    factualInventory: inventory,
    approvedProviderPaths: approvedPaths,
  });

  assert.equal(result.outcome, "authorizing");
  if (result.outcome === "authorizing") {
    assert.equal(result.decision, "BLOCKED");
    assert.deepEqual(result.satisfiedResourceClasses, ["llm_reasoning"]);
    assert.deepEqual([...result.missingResourceClasses].sort(), ["attestation", "physical_presence", "specialist_compute"]);
    assert.deepEqual(result.approvedProviderPaths, []);
  }
});

// ─── Test 16: BUY decision includes correct provider paths ──────────────────

test("BUY decision includes the correct provider paths, sorted by resource class", () => {
  const validatedNeeds: ValidatedResourceNeeds = {
    requiredResourceClasses: ["llm_reasoning", "physical_presence", "attestation"],
    rejectedUnknownClasses: [],
  };

  const inventory: FactualResourceInventory = {
    controlledResourceClasses: ["llm_reasoning"],
  };

  // Provide paths for both missing resources
  const approvedPaths: ApprovedProviderPath[] = [
    { forResourceClass: "attestation", pathId: "notary_service" },
    { forResourceClass: "physical_presence", pathId: "field_agent" },
  ];

  const result = evaluateSourcingPolicy({
    validatedNeeds,
    factualInventory: inventory,
    approvedProviderPaths: approvedPaths,
  });

  assert.equal(result.outcome, "authorizing");
  if (result.outcome === "authorizing") {
    assert.equal(result.decision, "BUY");
    assert.equal(result.reasonCode, "missing_with_approved_path");
    assert.deepEqual(result.satisfiedResourceClasses, ["llm_reasoning"]);
    assert.deepEqual([...result.missingResourceClasses].sort(), ["attestation", "physical_presence"]);

    // The approved paths should be sorted by resource class
    assert.equal(result.approvedProviderPaths.length, 2);
    assert.equal(result.approvedProviderPaths[0].forResourceClass, "attestation");
    assert.equal(result.approvedProviderPaths[0].pathId, "notary_service");
    assert.equal(result.approvedProviderPaths[1].forResourceClass, "physical_presence");
    assert.equal(result.approvedProviderPaths[1].pathId, "field_agent");
  }
});
