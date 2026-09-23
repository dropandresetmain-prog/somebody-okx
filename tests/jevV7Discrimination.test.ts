import test from "node:test";
import assert from "node:assert/strict";
import {
  auditDominance,
  correctReferenceLabel,
  knownCostUsd,
  knownTotalMinutes,
  optionDominates,
} from "../lib/management/jev/eval/dominanceAudit";
import { auditOptionDataQuality } from "../lib/management/jev/eval/dataQuality";
import { BASELINE_CHOICE_INSTRUCTIONS, NEUTRAL_CHOICE_INSTRUCTIONS, buildOptionChoiceQuestion } from "../lib/management/jev/questionBuilder";
import { EMPTY_FACTS, factValue } from "../lib/management/options";
import type { GroundedOption } from "../lib/management/types";

function opt(id: string, facts: Partial<typeof EMPTY_FACTS> = {}): GroundedOption {
  return {
    optionId: id,
    requirementKey: "r",
    contractRevision: 1,
    kind: "external",
    strategy: "BUY",
    internal: null,
    external: {
      offeringId: "o",
      providerId: "p",
      serviceId: "s",
      resourceClass: "public_web",
      priceUsd: 2,
      priceSource: "provider_quote",
      registryVerified: true,
      compatibleResourceClass: true,
      executionPathConfigured: true,
      purposeScopeCompatible: true,
    },
    facts: { ...EMPTY_FACTS, ...facts },
    eligibility: { eligible: true, checksPassed: [] },
  };
}

test("null quality does not participate in dominance comparison", () => {
  const a = opt("a", {
    expectedQuality: factValue("comparable", "measured", "high", "x", 1),
    externalPriceUsd: factValue(2, "provider_quote", "high", "x", 1),
  });
  const b = opt("b", { expectedQuality: null, externalPriceUsd: factValue(2, "provider_quote", "high", "x", 1) });
  const { dominates } = optionDominates(a, b);
  assert.equal(dominates, false);
});

test("cheaper known cost yields dominance when time tied", () => {
  const cheap = opt("cheap", {
    externalPriceUsd: factValue(1, "provider_quote", "high", "x", 1),
    executionMinutes: factValue(50, "provider_quote", "medium", "x", 1),
  });
  const pricey = opt("pricey", {
    externalPriceUsd: factValue(4, "provider_quote", "high", "x", 1),
    executionMinutes: factValue(50, "provider_quote", "medium", "x", 1),
  });
  assert.equal(optionDominates(cheap, pricey).dominates, true);
});

test("speed externalAdvantage flagged when timing contradicts", () => {
  const slow = opt("slow", {
    externalAdvantage: factValue("speed", "provider_quote", "medium", "x", 1),
    executionMinutes: factValue(100, "provider_quote", "medium", "x", 1),
  });
  const fast = opt("fast", { executionMinutes: factValue(30, "measured", "high", "x", 1) });
  const issues = auditOptionDataQuality(slow, [slow, fast]);
  assert.ok(issues.some((i) => i.code === "external_advantage_speed_vs_timing"));
});

test("A/B question builders differ", () => {
  const base = buildOptionChoiceQuestion([opt("a")], "baseline");
  const neutral = buildOptionChoiceQuestion([opt("a")], "neutral");
  assert.equal(base.instructions, BASELINE_CHOICE_INSTRUCTIONS);
  assert.equal(neutral.instructions, NEUTRAL_CHOICE_INSTRUCTIONS);
  assert.notEqual(base.instructions, neutral.instructions);
});

test("correctReferenceLabel downgrades partial external price label when MAKE dominates", () => {
  const make: GroundedOption = {
    ...opt("make"),
    kind: "internal",
    strategy: "MAKE",
    external: null,
    facts: {
      ...EMPTY_FACTS,
      internalCostUsd: factValue(0.4, "measured", "high", "i", 1),
      executionMinutes: factValue(30, "measured", "high", "i", 1),
      availability: factValue("free", "measured", "high", "i", 1),
    },
  };
  const buyB = opt("buy_b", {
    externalPriceUsd: factValue(1.2, "provider_quote", "high", "q", 1),
    queueMinutes: factValue(10, "provider_quote", "medium", "q", 1),
    executionMinutes: factValue(90, "provider_quote", "medium", "q", 1),
    externalAdvantage: factValue("speed", "provider_quote", "medium", "q", 1),
    reliability: factValue("proven_once", "registry_data", "medium", "q", 1),
    expectedQuality: factValue("comparable", "provider_quote", "medium", "q", 1),
  });
  const eligible = [make, buyB];
  const corrected = correctReferenceLabel(eligible, {
    kind: "DETERMINISTIC_DOMINANCE",
    expectedOptionId: "buy_b",
    notes: "J3 label",
  });
  assert.equal(corrected.correctedExpected, "make");
  assert.equal(corrected.correctedKind, "DETERMINISTIC_DOMINANCE");
  assert.ok(knownCostUsd(make)! < knownCostUsd(buyB)!);
  assert.ok(knownTotalMinutes(make)! < knownTotalMinutes(buyB)!);
  const audit = auditDominance(eligible);
  assert.equal(audit.dominatorOptionId, "make");
});
