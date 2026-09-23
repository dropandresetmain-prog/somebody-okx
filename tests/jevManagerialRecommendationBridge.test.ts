// J2 — deterministic bridge: validated Jev selection → ManagerialRecommendation.
//
// Every successful bridge result is round-tripped through the REAL
// parseManagerialRecommendation. No Jev-specific parser bypass.
import test from "node:test";
import assert from "node:assert/strict";
import {
  buildJevManagerialRecommendation,
  deriveStrongestAlternativeId,
} from "../lib/management/jev/buildManagerialRecommendation";
import { EMPTY_FACTS, factValue } from "../lib/management/options";
import { parseManagerialRecommendation } from "../lib/management/proposals";
import type { EconomicFacts, GroundedOption } from "../lib/management/types";

const REQ = "req_bridge";
const REV = 1;

function makeOption(id: string, overrides: Partial<GroundedOption> = {}): GroundedOption {
  return {
    optionId: id,
    requirementKey: REQ,
    contractRevision: REV,
    kind: "internal",
    strategy: "MAKE",
    internal: {
      capabilityKeys: ["public_information_research"],
      responsibility: "draft",
      workerKey: "worker_1",
      staffingReason: "REUSE",
      primitives: ["read_public_web"],
    },
    external: null,
    facts: EMPTY_FACTS,
    eligibility: { eligible: true, checksPassed: ["capability_governed"] },
    ...overrides,
  };
}

function buyOption(
  id: string,
  priceUsd: number | null,
  priceSource: GroundedOption["external"] extends infer E
    ? E extends { priceSource: infer P }
      ? P
      : never
    : never = "provider_quote",
  facts: EconomicFacts = EMPTY_FACTS,
): GroundedOption {
  return makeOption(id, {
    kind: "external",
    strategy: "BUY",
    internal: null,
    external: {
      offeringId: `off_${id}`,
      providerId: `prov_${id}`,
      serviceId: `svc_${id}`,
      resourceClass: "public_web",
      priceUsd,
      priceSource,
      registryVerified: true,
      compatibleResourceClass: true,
      executionPathConfigured: true,
      purposeScopeCompatible: true,
    },
    facts,
  });
}

function hybridOption(id: string): GroundedOption {
  return makeOption(id, {
    kind: "hybrid",
    strategy: "HYBRID",
    internal: {
      capabilityKeys: ["public_information_research"],
      responsibility: "compose",
      workerKey: null,
      staffingReason: "CREATE",
      primitives: ["read_public_web"],
    },
    external: {
      offeringId: "off_hybrid",
      providerId: "prov_hybrid",
      serviceId: "svc_hybrid",
      resourceClass: "proprietary_data",
      priceUsd: 2,
      priceSource: "registry_data",
      registryVerified: true,
      compatibleResourceClass: true,
      executionPathConfigured: true,
      purposeScopeCompatible: true,
    },
  });
}

function selection(
  optionId: string,
  probabilities: Record<string, number> = {},
): { optionId: string; probabilities: Record<string, number>; confidence: number | null } {
  return {
    optionId,
    probabilities,
    confidence: typeof probabilities[optionId] === "number" ? probabilities[optionId]! : null,
  };
}

function assertParses(recommendation: {
  requirementKey: string;
  contractRevision: number;
  selectedOptionId: string;
  strongestAlternativeId: string | null;
  rationale: string;
  materialAssumptions: string[];
  changeMyMindEvidence: string[];
}, eligible: readonly GroundedOption[]) {
  const parsed = parseManagerialRecommendation(recommendation, {
    requirementKey: REQ,
    contractRevision: REV,
    eligibleOptionIds: eligible.map((o) => o.optionId),
  });
  assert.equal(parsed.ok, true, JSON.stringify(parsed));
  if (parsed.ok) {
    assert.equal(parsed.value.selectedOptionId, recommendation.selectedOptionId);
    assert.equal(parsed.value.strongestAlternativeId, recommendation.strongestAlternativeId);
    assert.ok(parsed.value.rationale.length > 0);
    assert.ok(parsed.value.rationale.length <= 1200);
  }
  return parsed;
}

// ── Successful bridge cases ──────────────────────────────────────────────────

test("bridge: single eligible MAKE", () => {
  const eligible = [makeOption("opt_make")];
  const result = buildJevManagerialRecommendation({
    requirementKey: REQ,
    contractRevision: REV,
    eligible,
    selection: selection("opt_make", { opt_make: 1 }),
  });
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.recommendation.selectedOptionId, "opt_make");
  assert.equal(result.recommendation.strongestAlternativeId, null);
  assert.deepEqual(result.recommendation.materialAssumptions, []);
  assert.deepEqual(result.recommendation.changeMyMindEvidence, []);
  assertParses(result.recommendation, eligible);
});

test("bridge: MAKE vs BUY selects BUY", () => {
  const eligible = [makeOption("opt_make"), buyOption("opt_buy", 4)];
  const result = buildJevManagerialRecommendation({
    requirementKey: REQ,
    contractRevision: REV,
    eligible,
    selection: selection("opt_buy", { opt_make: 0.3, opt_buy: 0.7 }),
  });
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.recommendation.selectedOptionId, "opt_buy");
  assert.equal(result.recommendation.strongestAlternativeId, "opt_make");
  assert.match(result.recommendation.rationale, /strategy=BUY/);
  assert.match(result.recommendation.rationale, /strategy=MAKE/);
  assertParses(result.recommendation, eligible);
});

test("bridge: two BUY offerings", () => {
  const eligible = [buyOption("opt_buy_a", 3, "provider_quote"), buyOption("opt_buy_b", 5, "registry_data")];
  const result = buildJevManagerialRecommendation({
    requirementKey: REQ,
    contractRevision: REV,
    eligible,
    selection: selection("opt_buy_a", { opt_buy_a: 0.55, opt_buy_b: 0.45 }),
  });
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.recommendation.selectedOptionId, "opt_buy_a");
  assert.equal(result.recommendation.strongestAlternativeId, "opt_buy_b");
  assert.match(result.recommendation.rationale, /provenance=provider_quote/);
  assert.match(result.recommendation.rationale, /provenance=registry_data/);
  assertParses(result.recommendation, eligible);
});

test("bridge: selected internal option", () => {
  const eligible = [makeOption("opt_internal"), buyOption("opt_ext", 1)];
  const result = buildJevManagerialRecommendation({
    requirementKey: REQ,
    contractRevision: REV,
    eligible,
    selection: selection("opt_internal", { opt_internal: 0.9, opt_ext: 0.1 }),
  });
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.recommendation.selectedOptionId, "opt_internal");
  assert.match(result.recommendation.rationale, /kind=internal/);
  assert.match(result.recommendation.rationale, /worker=reuse:worker_1/);
  assertParses(result.recommendation, eligible);
});

test("bridge: selected external option", () => {
  const eligible = [makeOption("opt_internal"), buyOption("opt_ext", 2.5)];
  const result = buildJevManagerialRecommendation({
    requirementKey: REQ,
    contractRevision: REV,
    eligible,
    selection: selection("opt_ext", { opt_internal: 0.2, opt_ext: 0.8 }),
  });
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.recommendation.selectedOptionId, "opt_ext");
  assert.match(result.recommendation.rationale, /kind=external/);
  assert.match(result.recommendation.rationale, /quotedPrice=2\.5usd\(provenance=provider_quote\)/);
  assertParses(result.recommendation, eligible);
});

test("bridge: selected hybrid remains legal", () => {
  const eligible = [makeOption("opt_make"), hybridOption("opt_hybrid")];
  const result = buildJevManagerialRecommendation({
    requirementKey: REQ,
    contractRevision: REV,
    eligible,
    selection: selection("opt_hybrid", { opt_make: 0.4, opt_hybrid: 0.6 }),
  });
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.recommendation.selectedOptionId, "opt_hybrid");
  assert.match(result.recommendation.rationale, /strategy=HYBRID/);
  assert.match(result.recommendation.rationale, /worker=create/);
  assertParses(result.recommendation, eligible);
});

// ── Alternative derivation ───────────────────────────────────────────────────

test("alternative: clear second-highest probability", () => {
  const eligible = [makeOption("a"), makeOption("b"), makeOption("c")];
  assert.equal(
    deriveStrongestAlternativeId(eligible, "b", { a: 0.2, b: 0.5, c: 0.3 }),
    "c",
  );
});

test("alternative: tie broken by stable optionId ordering", () => {
  const eligible = [makeOption("opt_z"), makeOption("opt_a"), makeOption("opt_m")];
  assert.equal(
    deriveStrongestAlternativeId(eligible, "opt_m", { opt_z: 0.4, opt_a: 0.4, opt_m: 0.2 }),
    "opt_a",
  );
});

test("alternative: no usable alternative probability → null", () => {
  const eligible = [makeOption("a"), makeOption("b")];
  assert.equal(deriveStrongestAlternativeId(eligible, "a", { a: 1 }), null);
  assert.equal(deriveStrongestAlternativeId(eligible, "a", {}), null);
});

test("alternative: unrecognized probability IDs ignored", () => {
  const eligible = [makeOption("a"), makeOption("b")];
  assert.equal(
    deriveStrongestAlternativeId(eligible, "a", { a: 0.5, hallucinated: 0.99, b: 0.4 }),
    "b",
  );
});

test("bridge: no alternative probabilities → strongestAlternativeId null", () => {
  const eligible = [makeOption("a"), makeOption("b")];
  const result = buildJevManagerialRecommendation({
    requirementKey: REQ,
    contractRevision: REV,
    eligible,
    selection: selection("a"),
  });
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.recommendation.strongestAlternativeId, null);
  assert.match(result.recommendation.rationale, /Strongest alternative facts: none\./);
  assertParses(result.recommendation, eligible);
});

// ── Factual rationale ────────────────────────────────────────────────────────

test("rationale: deterministic for identical inputs", () => {
  const facts: EconomicFacts = {
    ...EMPTY_FACTS,
    expectedQuality: factValue("comparable", "provider_quote", "medium", "q1", 1),
    executionMinutes: factValue(45, "measured", "high", "m1", 1),
    externalPriceUsd: null,
  };
  const eligible = [buyOption("opt_x", 9, "provider_quote", facts), makeOption("opt_y")];
  const input = {
    requirementKey: REQ,
    contractRevision: REV,
    eligible,
    selection: selection("opt_x", { opt_x: 0.7, opt_y: 0.3 }),
  };
  const a = buildJevManagerialRecommendation(input);
  const b = buildJevManagerialRecommendation(input);
  assert.equal(a.ok, true);
  assert.equal(b.ok, true);
  if (!a.ok || !b.ok) return;
  assert.equal(a.recommendation.rationale, b.recommendation.rationale);
});

test("rationale: null facts omitted; provenance not collapsed", () => {
  const eligible = [
    buyOption("opt_quote", 4, "provider_quote", {
      ...EMPTY_FACTS,
      externalPriceUsd: factValue(4, "provider_quote", "high", "quote_1", 1),
      reliability: factValue("proven_once", "registry_data", "medium", "reg_1", 1),
    }),
  ];
  const result = buildJevManagerialRecommendation({
    requirementKey: REQ,
    contractRevision: REV,
    eligible,
    selection: selection("opt_quote"),
  });
  assert.equal(result.ok, true);
  if (!result.ok) return;
  const { rationale } = result.recommendation;
  assert.match(rationale, /quotedPrice=4usd\(provenance=provider_quote\)/);
  assert.match(rationale, /externalPriceUsd=4\(provenance=provider_quote\)/);
  assert.match(rationale, /reliability=proven_once\(provenance=registry_data\)/);
  assert.doesNotMatch(rationale, /setupMinutes=/);
  assert.doesNotMatch(rationale, /Jev chose this because/i);
  assert.doesNotMatch(rationale, /because Jev/i);
  assert.match(rationale, /^Jev selected /);
  assertParses(result.recommendation, eligible);
});

test("rationale: stays within parser bound", () => {
  const longCaps = Array.from({ length: 40 }, (_, i) => `capability_key_${i}`);
  const eligible = [
    makeOption("opt_long", {
      internal: {
        capabilityKeys: longCaps,
        responsibility: "x".repeat(200),
        workerKey: "worker_long",
        staffingReason: "REUSE",
        primitives: ["read_public_web"],
      },
      facts: {
        ...EMPTY_FACTS,
        expectedQuality: factValue("comparable", "measured", "high", "s", 1),
        setupMinutes: factValue(1, "measured", "high", "s", 1),
        queueMinutes: factValue(2, "measured", "high", "s", 1),
        executionMinutes: factValue(3, "measured", "high", "s", 1),
        verificationMinutes: factValue(4, "measured", "high", "s", 1),
        internalCostUsd: factValue(5, "measured", "high", "s", 1),
        reliability: factValue("proven_repeatedly", "measured", "high", "s", 1),
        availability: factValue("free", "measured", "high", "s", 1),
        reuseValue: factValue("high", "measured", "high", "s", 1),
        externalAdvantage: factValue("speed", "measured", "high", "s", 1),
      },
    }),
    makeOption("opt_alt"),
  ];
  const result = buildJevManagerialRecommendation({
    requirementKey: REQ,
    contractRevision: REV,
    eligible,
    selection: selection("opt_long", { opt_long: 0.6, opt_alt: 0.4 }),
  });
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.ok(result.recommendation.rationale.length <= 1200);
  assertParses(result.recommendation, eligible);
});

// ── Identity / safety ────────────────────────────────────────────────────────

test("bridge fails: selected ID absent from eligible", () => {
  const eligible = [makeOption("a")];
  const result = buildJevManagerialRecommendation({
    requirementKey: REQ,
    contractRevision: REV,
    eligible,
    selection: selection("missing"),
  });
  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.equal(result.reason, "selected_option_absent");
});

test("bridge fails: requirement key mismatch on eligible option", () => {
  const eligible = [makeOption("a", { requirementKey: "other_req" })];
  const result = buildJevManagerialRecommendation({
    requirementKey: REQ,
    contractRevision: REV,
    eligible,
    selection: selection("a"),
  });
  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.equal(result.reason, "requirement_key_mismatch");
});

test("bridge fails: stale contract revision on eligible option", () => {
  const eligible = [makeOption("a", { contractRevision: 99 })];
  const result = buildJevManagerialRecommendation({
    requirementKey: REQ,
    contractRevision: REV,
    eligible,
    selection: selection("a"),
  });
  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.equal(result.reason, "contract_revision_mismatch");
});

test("bridge fails: duplicate option identity", () => {
  const eligible = [makeOption("dup"), makeOption("dup")];
  const result = buildJevManagerialRecommendation({
    requirementKey: REQ,
    contractRevision: REV,
    eligible,
    selection: selection("dup"),
  });
  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.equal(result.reason, "duplicate_option_id");
});

test("bridge fails: empty eligible set", () => {
  const result = buildJevManagerialRecommendation({
    requirementKey: REQ,
    contractRevision: REV,
    eligible: [],
    selection: selection("a"),
  });
  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.equal(result.reason, "no_eligible_options");
});

test("malformed bridge-shaped data does not bypass parser", () => {
  // Even if someone hand-builds a recommendation without the bridge, the
  // existing parser still refuses empty rationale / wrong ids.
  const eligible = [makeOption("a")];
  const missingRationale = parseManagerialRecommendation(
    {
      requirementKey: REQ,
      contractRevision: REV,
      selectedOptionId: "a",
      rationale: "",
      materialAssumptions: [],
      changeMyMindEvidence: [],
    },
    { requirementKey: REQ, contractRevision: REV, eligibleOptionIds: ["a"] },
  );
  assert.equal(missingRationale.ok, false);

  const wrongId = parseManagerialRecommendation(
    {
      requirementKey: REQ,
      contractRevision: REV,
      selectedOptionId: "hallucinated",
      rationale: "looks like a receipt but selects an unknown option",
      materialAssumptions: [],
      changeMyMindEvidence: [],
    },
    {
      requirementKey: REQ,
      contractRevision: REV,
      eligibleOptionIds: eligible.map((o) => o.optionId),
    },
  );
  assert.equal(wrongId.ok, false);
});
