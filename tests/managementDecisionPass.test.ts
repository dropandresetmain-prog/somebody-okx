import { test } from "node:test";
import { strict as assert } from "node:assert";
import { buildDecisionPassInput } from "../lib/management/decisionPass";
import type { DecisionPassReads } from "../lib/management/decisionPass";
import { buildOutcomeContract, buildRequirement } from "../lib/management/contract";
import {
  requiredResourceClassesFor,
  controlledResourceClassesFor,
} from "../lib/management/grounding";
import { CURRENT_RESOURCE_INVENTORY } from "../lib/objective/policy";
import { planWakeForDecision } from "../lib/management/wakes";
import type { OutcomeContract, Requirement } from "../lib/management/types";
import { cp2ParsedRequirement } from "./helpers/cp2Requirement";

// ── Fixtures ─────────────────────────────────────────────────────────────────

const NOW = 1726617600000;
const OBJ = "obj_dp";
const DECISION_ID = "dec_dp_001";
const REQ_KEY = "req_dp";

const noopRecommend = async () => null;

function contractFor(objectiveKey: string): OutcomeContract {
  const built = buildOutcomeContract({
    objectiveKey,
    contractId: `contract_${objectiveKey}`,
    revision: 1,
    parsed: {
      intent: "test decision pass",
      levels: [
        { levelKey: "goal", order: 1, statement: "the goal holds", label: "Goal" },
      ],
      minimumCompletionBar: "goal",
      ambiguities: [],
    },
    requestId: "req_dp_test",
    founderResolvedQuestions: [],
    at: NOW,
  });
  assert.equal(built.ok, true);
  if (!built.ok) throw new Error("contract fixture invalid");
  return built.contract;
}

function makeRequirement(
  objectiveKey: string,
  title = "Test requirement",
  mustBeTrue = "something is true",
): Requirement {
  const contract = contractFor(objectiveKey);
  const built = buildRequirement(
    {
      objectiveKey,
      contract,
      proposed: cp2ParsedRequirement({
        requirementKey: REQ_KEY,
        priority: "required",
        title,
        mustBeTrue,
        scope: "test scope",
      }),
      artifactKeyForInternalProof: null,
      at: NOW,
    },
    "MAKE",
  );
  assert.ok(
    !("errors" in built),
    `requirement fixture errors: ${"errors" in built ? built.errors.join(", ") : ""}`,
  );
  if ("errors" in built) throw new Error("requirement fixture invalid");
  return built.requirement;
}

function makeReads(overrides?: Partial<DecisionPassReads>): DecisionPassReads {
  return {
    contract: contractFor(OBJ),
    currentContractRevision: 1,
    requirement: makeRequirement(OBJ),
    inventory: [],
    creationAllowed: true,
    budget: null,
    grant: null,
    at: NOW,
    decisionId: DECISION_ID,
    ...overrides,
  };
}

// ── 1. Determinism ───────────────────────────────────────────────────────────

test("buildDecisionPassInput is deterministic (same inputs → deep-equal input)", async () => {
  const reads = makeReads();
  const proposal = {
    strategy: "MAKE",
    desiredCapabilities: ["public_information_research"],
    needsExternalResourceClass: null,
  };

  const r1 = await buildDecisionPassInput(reads, proposal, noopRecommend);
  const r2 = await buildDecisionPassInput(reads, proposal, noopRecommend);

  assert.equal(r1.ok, true);
  assert.equal(r2.ok, true);
  if (!r1.ok || !r2.ok) throw new Error("expected ok");

  // JSON.stringify omits functions (recommend, factsForOffering), so this
  // compares everything except the recommend fn — exactly as the spec asks.
  const json1 = JSON.stringify(r1.input);
  const json2 = JSON.stringify(r2.input);
  assert.equal(json1, json2, "inputs must be byte-identical (modulo functions)");
});

// ── 2. A7 positive ───────────────────────────────────────────────────────────

test("A7: governed capabilities accepted and sorted; ungoverned silently dropped", async () => {
  const reads = makeReads();
  const proposal = {
    strategy: "MAKE",
    desiredCapabilities: ["document_drafting", "fake_capability", "public_information_research"],
    needsExternalResourceClass: null,
  };

  const result = await buildDecisionPassInput(reads, proposal, noopRecommend);
  assert.equal(result.ok, true);
  if (!result.ok) throw new Error("expected ok");

  // Governed keys accepted and sorted
  assert.deepEqual(result.input.staffing.requiredCapabilityKeys, [
    "document_drafting",
    "public_information_research",
  ]);

  // Ungoverned key silently dropped
  assert.ok(!result.input.staffing.requiredCapabilityKeys.includes("fake_capability"));
});

test("A7: empty accepted list → requiredCapabilityKeys [] and NO hardcoded growth_launch_operations", async () => {
  const reads = makeReads();
  const proposal = {
    strategy: "MAKE",
    desiredCapabilities: ["fake_one", "fake_two"],
    needsExternalResourceClass: null,
  };

  const result = await buildDecisionPassInput(reads, proposal, noopRecommend);
  assert.equal(result.ok, true);
  if (!result.ok) throw new Error("expected ok");

  assert.deepEqual(result.input.staffing.requiredCapabilityKeys, []);
  // The old hardcoded ["growth_launch_operations"] literal must NOT appear
  const keys = result.input.staffing.requiredCapabilityKeys as readonly string[];
  assert.ok(
    !keys.includes("growth_launch_operations"),
    "growth_launch_operations must not be hardcoded into requiredCapabilityKeys",
  );
});

// ── 3. A7 negative ───────────────────────────────────────────────────────────

test("A7 negative: null rawStrategyProposal → {ok:false, errors:[...]}, no throw", async () => {
  const result = await buildDecisionPassInput(makeReads(), null, noopRecommend);
  assert.equal(result.ok, false);
  if (result.ok) throw new Error("expected not ok");
  assert.ok(result.errors.length > 0);
});

test("A7 negative: {} → {ok:false, errors:[...]}, no throw", async () => {
  const result = await buildDecisionPassInput(makeReads(), {}, noopRecommend);
  assert.equal(result.ok, false);
  if (result.ok) throw new Error("expected not ok");
  assert.ok(result.errors.length > 0);
});

test("A7 negative: {strategy:'FLY'} → {ok:false, errors:[...]}, no throw", async () => {
  const result = await buildDecisionPassInput(
    makeReads(),
    { strategy: "FLY" },
    noopRecommend,
  );
  assert.equal(result.ok, false);
  if (result.ok) throw new Error("expected not ok");
  assert.ok(result.errors.length > 0);
});

// ── 4. I3 MAKE ───────────────────────────────────────────────────────────────

test("I3: MAKE, desiredCapabilities ['public_information_research'], needsExternalResourceClass null → grounding.discovered [], correct resource classes", async () => {
  const reads = makeReads();
  const proposal = {
    strategy: "MAKE",
    desiredCapabilities: ["public_information_research"],
    needsExternalResourceClass: null,
  };

  const result = await buildDecisionPassInput(reads, proposal, noopRecommend);
  assert.equal(result.ok, true);
  if (!result.ok) throw new Error("expected ok");

  // No external class needed → discovered is []
  assert.deepEqual(result.input.grounding.discovered, []);

  // requiredResourceClasses equals requiredResourceClassesFor(["public_information_research"])
  const expectedRequired = requiredResourceClassesFor(["public_information_research"]);
  assert.deepEqual(result.input.eligibilityFacts.requiredResourceClasses, expectedRequired);

  // controlledResourceClasses equals sorted CURRENT_RESOURCE_INVENTORY
  const expectedControlled = controlledResourceClassesFor(CURRENT_RESOURCE_INVENTORY);
  assert.deepEqual(
    result.input.eligibilityFacts.controlledResourceClasses,
    expectedControlled,
  );
});

// ── 5. I3 BUY ────────────────────────────────────────────────────────────────

test("I3: BUY with needsExternalResourceClass 'proprietary_data' → genuine BUY is reachable via snapshot discovery", async () => {
  // FIXED during CP-4: buildDecisionPassInput validates the model-proposed
  // external class against the FULL catalog union (RESOURCE_CLASSES), not the
  // capability-derived RESOURCE_CLASS_VALUES. No controlled capability requires
  // an external class, so validating against capability requirements would make
  // every genuine BUY unreachable — exactly the I3 defect this test pins shut.
  // The snapshot registry carries proprietary_data offerings (X/Twitter social
  // intelligence), keyword-matched against the requirement text.
  const reads = makeReads({
    requirement: makeRequirement(OBJ, "Live narrative intelligence", "current narrative data from X is recorded"),
  });
  const proposal = {
    strategy: "BUY",
    desiredCapabilities: ["public_information_research"],
    needsExternalResourceClass: "proprietary_data",
  };

  const result = await buildDecisionPassInput(reads, proposal, noopRecommend);
  assert.equal(result.ok, true);
  if (!result.ok) throw new Error("expected ok");

  assert.ok(
    result.input.grounding.discovered.length > 0,
    "proprietary_data is a known resource class → snapshot discovery must surface offerings, so BUY is reachable",
  );
  for (const offering of result.input.grounding.discovered) {
    assert.equal(offering.resourceClass, "proprietary_data");
    assert.equal(offering.registryVerified, true, `${offering.offeringId} must be registry-verified`);
    assert.equal(offering.compatibleResourceClass, true);
  }
});

test("I3: BUY with known resource class 'public_web' → discovery returns offerings with correct facts", async () => {
  // Use a requirement title that keyword-matches flybeacon_project_growth_analysis
  // (the only snapshot offering compatible with public_web).
  const reads = makeReads({
    requirement: makeRequirement(OBJ, "Project growth analysis", "analysis covers positioning"),
  });
  const proposal = {
    strategy: "BUY",
    desiredCapabilities: ["public_information_research"],
    needsExternalResourceClass: "public_web",
  };

  const result = await buildDecisionPassInput(reads, proposal, noopRecommend);
  assert.equal(result.ok, true);
  if (!result.ok) throw new Error("expected ok");

  // Discovery should return at least one offering
  assert.ok(
    result.input.grounding.discovered.length > 0,
    "expected at least one discovered offering for public_web",
  );

  // Every entry has registryVerified true
  for (const offering of result.input.grounding.discovered) {
    assert.equal(offering.registryVerified, true, `${offering.offeringId} must be registry-verified`);
  }

  // factsForOffering: priced offerings carry a real provenance (snapshot registry
  // may surface registry_data; live quotes use provider_quote). Never invent price.
  for (const offering of result.input.grounding.discovered) {
    const facts = result.input.grounding.factsForOffering(offering);
    if (offering.priceUsd !== null) {
      assert.ok(facts.externalPriceUsd !== null, `${offering.offeringId} has a price → externalPriceUsd must be set`);
      assert.ok(
        facts.externalPriceUsd!.provenance === "provider_quote" ||
          facts.externalPriceUsd!.provenance === "registry_data",
        `${offering.offeringId} price provenance must be known, got ${facts.externalPriceUsd!.provenance}`,
      );
      assert.equal(typeof facts.externalPriceUsd!.value, "number");
    }
    // An offering with null price yields externalPriceUsd null (no invented price)
    if (offering.priceUsd === null) {
      assert.equal(facts.externalPriceUsd, null, `${offering.offeringId} has no price → externalPriceUsd must be null`);
    }
  }
});

// ── 6. Spend authority fails closed ──────────────────────────────────────────

test("spend authority: null grant → spendAuthorityUsd null AND spendApprovalId null", async () => {
  const reads = makeReads({ grant: null });
  const proposal = {
    strategy: "MAKE",
    desiredCapabilities: ["public_information_research"],
  };

  const result = await buildDecisionPassInput(reads, proposal, noopRecommend);
  assert.equal(result.ok, true);
  if (!result.ok) throw new Error("expected ok");

  assert.equal(result.input.eligibilityFacts.spendAuthorityUsd, null);
  assert.equal(result.input.spendApprovalId, null);
  assert.equal(result.input.spendAuthorityUsd, null);
});

test("spend authority: grant {limitUsd:5, approvalId:'appr_x'} → both threaded", async () => {
  const reads = makeReads({ grant: { limitUsd: 5, approvalId: "appr_x" } });
  const proposal = {
    strategy: "MAKE",
    desiredCapabilities: ["public_information_research"],
  };

  const result = await buildDecisionPassInput(reads, proposal, noopRecommend);
  assert.equal(result.ok, true);
  if (!result.ok) throw new Error("expected ok");

  assert.equal(result.input.eligibilityFacts.spendAuthorityUsd, 5);
  assert.equal(result.input.spendApprovalId, "appr_x");
  assert.equal(result.input.spendAuthorityUsd, 5);
});

// ── 7. decisionId passthrough ────────────────────────────────────────────────

test("decisionId passed through verbatim (deterministic identity, no timestamps)", async () => {
  const reads = makeReads({ decisionId: "dec_exact-id_42" });
  const proposal = {
    strategy: "MAKE",
    desiredCapabilities: ["public_information_research"],
  };

  const result = await buildDecisionPassInput(reads, proposal, noopRecommend);
  assert.equal(result.ok, true);
  if (!result.ok) throw new Error("expected ok");

  assert.equal(result.input.decisionId, "dec_exact-id_42");

  // Run again to confirm no timestamp leakage
  const result2 = await buildDecisionPassInput(reads, proposal, noopRecommend);
  assert.equal(result2.ok, true);
  if (!result2.ok) throw new Error("expected ok");
  assert.equal(result2.input.decisionId, "dec_exact-id_42");
});

// ── 8. planWakeForDecision ───────────────────────────────────────────────────

test("planWakeForDecision: determinism + dedupe", () => {
  const base = {
    objectiveKey: OBJ,
    managerDecisionId: "dec_wake_001",
    authorized: true,
    at: NOW,
  };

  const plan1 = planWakeForDecision(base);
  const plan2 = planWakeForDecision(base);

  // Same inputs → byte-identical eventId/dedupeKey
  assert.equal(plan1.eventId, plan2.eventId);
  assert.equal(plan1.dedupeKey, plan2.dedupeKey);

  // Different managerDecisionId → different eventId
  const plan3 = planWakeForDecision({ ...base, managerDecisionId: "dec_wake_002" });
  assert.notEqual(plan1.eventId, plan3.eventId);
  assert.notEqual(plan1.dedupeKey, plan3.dedupeKey);

  // dedupeKey format: decision:${objectiveKey}:${managerDecisionId}
  assert.equal(plan1.dedupeKey, `decision:${OBJ}:dec_wake_001`);

  // eventId format: wake_dc_${hash24(dedupeKey)}
  assert.ok(plan1.eventId.startsWith("wake_dc_"));

  // reason is "decision_applied"
  assert.equal(plan1.reason, "decision_applied");
  assert.equal(plan1.event.reason, "decision_applied");

  // event.consumedAt null
  assert.equal(plan1.event.consumedAt, null);

  // refKind is "objective"
  assert.equal(plan1.event.refKind, "objective");
  assert.equal(plan1.event.refId, "dec_wake_001");

  // summary differs by authorized true/false
  const planAuth = planWakeForDecision({ ...base, authorized: true });
  const planNoAuth = planWakeForDecision({ ...base, authorized: false });
  assert.notEqual(planAuth.event.summary, planNoAuth.event.summary);
  assert.ok(planAuth.event.summary.includes("authorized"));
  assert.ok(planNoAuth.event.summary.includes("without authorization"));
});
