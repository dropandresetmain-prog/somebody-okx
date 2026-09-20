import test from "node:test";
import assert from "node:assert/strict";
import {
  demoteSpendAmbiguitiesWhenGrantPresent,
  isSpendBoundAmbiguity,
} from "../lib/management/interpretation";

test("isSpendBoundAmbiguity matches spend/budget questions only", () => {
  assert.equal(isSpendBoundAmbiguity("What is the approved spend limit?"), true);
  assert.equal(isSpendBoundAmbiguity("Who is the target audience?"), false);
});

test("demoteSpendAmbiguitiesWhenGrantPresent clears spend-bound material holds", () => {
  const contract = {
    ambiguities: [
      {
        question: "What is the approved spend limit?",
        materiality: "material" as const,
        resolution: "founder must answer",
        resolvedBy: "founder" as const,
        requiresFounderApproval: true,
      },
      {
        question: "Who is the target audience?",
        materiality: "material" as const,
        resolution: "founder must answer",
        resolvedBy: "founder" as const,
        requiresFounderApproval: true,
      },
    ],
  };
  const unchanged = demoteSpendAmbiguitiesWhenGrantPresent(contract, false);
  assert.equal(unchanged.demoted, 0);
  assert.equal(unchanged.contract.ambiguities[0].requiresFounderApproval, true);

  const demoted = demoteSpendAmbiguitiesWhenGrantPresent(contract, true);
  assert.equal(demoted.demoted, 1);
  assert.equal(demoted.contract.ambiguities[0].requiresFounderApproval, false);
  assert.equal(demoted.contract.ambiguities[0].materiality, "ordinary");
  assert.equal(demoted.contract.ambiguities[1].requiresFounderApproval, true);
});
