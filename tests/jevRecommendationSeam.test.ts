// Jev Stage-3 recommendation seam (J4) — focused tests against the composed
// bounded selector used by proposeDecision (convex/objectiveRunner.ts).
//
// Stage-4 applyDecision remains the sole authorizer; these tests prove the
// Stage-3 composition never grants authority, never calls a second/rationale
// model after a valid bounded selection, and never falls back to the
// incumbent for anything but a PRE-SELECTION technical/provider failure.
import test from "node:test";
import assert from "node:assert/strict";
import {
  composeBoundedStage3Recommendation,
  isJevOptionSelectionEnabled,
  JEV_OPTION_SELECTION_ENV,
} from "../lib/management/jevStage3";
import type { JevGatewayCall, JevGatewayResult } from "../lib/management/jev/client";
import { EMPTY_FACTS } from "../lib/management/options";
import { parseManagerialRecommendation } from "../lib/management/proposals";
import type { GroundedOption } from "../lib/management/types";
import type { JevRequirementContext } from "../lib/management/jev/types";

const requirement: JevRequirementContext = {
  requirementKey: "req_relaunch",
  title: "Relaunch messaging",
  mustBeTrue: "A founder-readable relaunch message draft exists.",
  scope: "messaging research and draft only",
  expectedOutput: "draft message",
  requiredResourceClasses: ["public_web"],
};

function option(id: string, overrides: Partial<GroundedOption> = {}): GroundedOption {
  return {
    optionId: id,
    requirementKey: "req_relaunch",
    contractRevision: 1,
    kind: "internal",
    strategy: "MAKE",
    internal: {
      capabilityKeys: ["public_information_research"],
      responsibility: "draft",
      workerKey: "worker_1",
      staffingReason: "REUSE",
      primitives: [],
    },
    external: null,
    facts: EMPTY_FACTS,
    eligibility: { eligible: true, checksPassed: ["capability_governed"] },
    ...overrides,
  };
}

function buyOption(id: string, priceUsd: number): GroundedOption {
  return option(id, {
    kind: "external",
    strategy: "BUY",
    internal: null,
    external: {
      offeringId: "off_1",
      providerId: "prov_1",
      serviceId: "svc_1",
      resourceClass: "proprietary_data",
      priceUsd,
      priceSource: "registry_data",
      registryVerified: true,
      compatibleResourceClass: true,
      executionPathConfigured: true,
      purposeScopeCompatible: true,
    },
  });
}

function gatewayResultFor(answer: unknown): JevGatewayResult {
  return {
    answers: { selectedOption: answer },
  } as unknown as JevGatewayResult;
}

test("gate helper: only exact true enables Jev selection", () => {
  assert.equal(isJevOptionSelectionEnabled({ [JEV_OPTION_SELECTION_ENV]: "true" }), true);
  assert.equal(isJevOptionSelectionEnabled({ [JEV_OPTION_SELECTION_ENV]: "TRUE" }), true);
  assert.equal(isJevOptionSelectionEnabled({ [JEV_OPTION_SELECTION_ENV]: "1" }), false);
  assert.equal(isJevOptionSelectionEnabled({ [JEV_OPTION_SELECTION_ENV]: "false" }), false);
  assert.equal(isJevOptionSelectionEnabled({}), false);
});

test("zero eligible: Jev not called; no_candidates", async () => {
  let called = 0;
  const callGateway: JevGatewayCall = async () => {
    called += 1;
    return gatewayResultFor({ type: "choice", choice: "x" });
  };
  const result = await composeBoundedStage3Recommendation(
    { requirementKey: "req_relaunch", contractRevision: 1, requirement, eligible: [] },
    { callGateway },
  );
  assert.equal(result.kind, "no_candidates");
  assert.equal(called, 0);
});

test("one eligible: Jev not called; deterministic sole-eligible recommendation via the J2 bridge", async () => {
  let called = 0;
  const callGateway: JevGatewayCall = async () => {
    called += 1;
    return gatewayResultFor({ type: "choice", choice: "opt_only" });
  };
  const sole = option("opt_only");
  const result = await composeBoundedStage3Recommendation(
    { requirementKey: "req_relaunch", contractRevision: 1, requirement, eligible: [sole] },
    { callGateway },
  );
  assert.equal(called, 0);
  assert.equal(result.kind, "recommendation");
  if (result.kind !== "recommendation") return;
  assert.equal(result.source, "sole_eligible");
  assert.equal(result.recommendation.selectedOptionId, "opt_only");
  assert.equal(result.recommendation.strongestAlternativeId, null);
  // Truthful attribution — never claim Jev picked a sole-eligible option.
  assert.doesNotMatch(result.recommendation.rationale, /^Jev selected/);
  assert.match(result.recommendation.rationale, /sole eligible/i);

  const parsed = parseManagerialRecommendation(result.recommendation, {
    requirementKey: "req_relaunch",
    contractRevision: 1,
    eligibleOptionIds: ["opt_only"],
  });
  assert.equal(parsed.ok, true);
});

test("several eligible: Jev receives exactly the application-computed eligible IDs, using the neutral rubric", async () => {
  const eligible = [option("opt_make"), buyOption("opt_buy", 12), option("opt_make_b")];
  // Ineligible ID must never be offered to Jev.
  const ineligible = option("opt_ineligible", {
    eligibility: { eligible: false, reasons: ["budget_exceeded"], detail: "over budget" },
  });
  void ineligible;

  let seenIds: string[] = [];
  let callCount = 0;
  const callGateway: JevGatewayCall = async ({ questions }) => {
    callCount += 1;
    const question = questions.selectedOption as { criteria: Record<string, unknown>; instructions: string };
    seenIds = Object.keys(question.criteria);
    // J3.1-evaluated neutral managerial rubric must be in production use.
    assert.match(question.instructions, /No strategy or option kind is inherently preferred/);
    return gatewayResultFor({
      type: "choice",
      choice: "opt_buy",
      probabilities: { opt_make: 0.2, opt_buy: 0.6, opt_make_b: 0.2 },
    });
  };

  const result = await composeBoundedStage3Recommendation(
    { requirementKey: "req_relaunch", contractRevision: 1, requirement, eligible },
    { callGateway },
  );
  assert.equal(callCount, 1);
  assert.deepEqual(seenIds, ["opt_make", "opt_buy", "opt_make_b"]);
  assert.ok(!seenIds.includes("opt_ineligible"));
  assert.equal(result.kind, "recommendation");
  if (result.kind !== "recommendation") return;
  assert.equal(result.source, "jev");
  assert.equal(result.recommendation.selectedOptionId, "opt_buy");
  assert.equal(result.recommendation.strongestAlternativeId, "opt_make");
  assert.match(result.recommendation.rationale, /^Jev selected/);

  // Valid Jev selection flows straight through the real parser.
  const parsed = parseManagerialRecommendation(result.recommendation, {
    requirementKey: "req_relaunch",
    contractRevision: 1,
    eligibleOptionIds: eligible.map((o) => o.optionId),
  });
  assert.equal(parsed.ok, true);
  if (parsed.ok) assert.equal(parsed.value.selectedOptionId, "opt_buy");
});

test("Jev returns unknown ID: technical_failure (fallback-eligible), no decision authority granted here", async () => {
  const eligible = [option("opt_a"), option("opt_b")];
  const callGateway: JevGatewayCall = async () =>
    gatewayResultFor({ type: "choice", choice: "opt_not_eligible", probabilities: {} });

  const result = await composeBoundedStage3Recommendation(
    { requirementKey: "req_relaunch", contractRevision: 1, requirement, eligible },
    { callGateway },
  );
  assert.equal(result.kind, "technical_failure");
  if (result.kind === "technical_failure") {
    assert.match(result.detail, /not an eligible grounded option|unknown option id/i);
  }
});

test("Jev malformed / unavailable / timeout: technical_failure; no silent incumbent inside this helper", async () => {
  const eligible = [option("opt_a"), option("opt_b")];

  const malformed = await composeBoundedStage3Recommendation(
    { requirementKey: "req_relaunch", contractRevision: 1, requirement, eligible },
    { callGateway: async () => gatewayResultFor({ type: "choice", choice: 123 }) },
  );
  assert.equal(malformed.kind, "technical_failure");

  const unavailable = await composeBoundedStage3Recommendation(
    { requirementKey: "req_relaunch", contractRevision: 1, requirement, eligible },
    {
      callGateway: async () => {
        throw new Error("gateway down");
      },
    },
  );
  assert.equal(unavailable.kind, "technical_failure");
  if (unavailable.kind === "technical_failure") {
    assert.ok(unavailable.failureClass);
  }

  const timeout = await composeBoundedStage3Recommendation(
    { requirementKey: "req_relaunch", contractRevision: 1, requirement, eligible, timeoutMs: 20 },
    {
      callGateway: async ({ abortSignal }: { abortSignal?: AbortSignal }) =>
        new Promise((_, reject) => {
          abortSignal?.addEventListener("abort", () => reject(new Error("aborted")));
        }),
    },
  );
  assert.equal(timeout.kind, "technical_failure");
});

test("stale eligible set between propose and apply: parser refuses Jev-selected id", () => {
  // Stage-4 fence: applyDecision recomputes eligible from fresh truth. If the
  // Jev-selected id is no longer eligible, parseManagerialRecommendation fails.
  const raw = {
    requirementKey: "req_relaunch",
    contractRevision: 1,
    selectedOptionId: "opt_buy_stale",
    strongestAlternativeId: null,
    rationale: "was eligible at propose",
    materialAssumptions: [],
    changeMyMindEvidence: [],
  };
  const freshEligibleIds = ["opt_make_only"];
  const parsed = parseManagerialRecommendation(raw, {
    requirementKey: "req_relaunch",
    contractRevision: 1,
    eligibleOptionIds: freshEligibleIds,
  });
  assert.equal(parsed.ok, false);
});

test("budget/spend: Jev cannot make an otherwise ineligible BUY appear eligible", async () => {
  // Application only passes eligible options into the composer. An over-budget
  // BUY never reaches Jev — prove by composing with a MAKE-only eligible set
  // while a BUY id is requested by a malicious gateway.
  const eligible = [option("opt_make")];
  let called = 0;
  const callGateway: JevGatewayCall = async () => {
    called += 1;
    return gatewayResultFor({ type: "choice", choice: "opt_buy_over_budget" });
  };
  // Sole eligible → Jev never called; selection is MAKE.
  const result = await composeBoundedStage3Recommendation(
    { requirementKey: "req_relaunch", contractRevision: 1, requirement, eligible },
    { callGateway },
  );
  assert.equal(called, 0);
  assert.equal(result.kind, "recommendation");
  if (result.kind === "recommendation") {
    assert.equal(result.recommendation.selectedOptionId, "opt_make");
  }

  // Even if a raw recommendation tried the ineligible BUY, Stage-4 parser refuses.
  const parsed = parseManagerialRecommendation(
    {
      requirementKey: "req_relaunch",
      contractRevision: 1,
      selectedOptionId: "opt_buy_over_budget",
      strongestAlternativeId: null,
      rationale: "buy anyway",
      materialAssumptions: [],
      changeMyMindEvidence: [],
    },
    {
      requirementKey: "req_relaunch",
      contractRevision: 1,
      eligibleOptionIds: ["opt_make"],
    },
  );
  assert.equal(parsed.ok, false);
});

test("purpose scope: Jev never sees an M3 option the application marked ineligible", async () => {
  const eligible = [option("opt_make_scoped")];
  // Purpose-incompatible BUY would have failed Stage-1/2 grounding and must
  // not be in `eligible`. Confirm composition cannot select it.
  const result = await composeBoundedStage3Recommendation(
    { requirementKey: "req_relaunch", contractRevision: 1, requirement, eligible },
    {
      callGateway: async () => gatewayResultFor({ type: "choice", choice: "opt_m3_incompatible" }),
    },
  );
  assert.equal(result.kind, "recommendation");
  if (result.kind === "recommendation") {
    assert.equal(result.recommendation.selectedOptionId, "opt_make_scoped");
    assert.equal(result.source, "sole_eligible");
  }
});

test("successful canonical path: eligible MAKE/BUY → Jev exactly once → recommendation parses; no second model call needed", async () => {
  const eligible = [option("opt_make"), buyOption("opt_buy", 9)];
  let callCount = 0;
  const callGateway: JevGatewayCall = async ({ questions }) => {
    callCount += 1;
    const ids = Object.keys(
      (questions.selectedOption as { criteria: Record<string, unknown> }).criteria,
    );
    assert.deepEqual(ids, ["opt_make", "opt_buy"]);
    return gatewayResultFor({
      type: "choice",
      choice: "opt_make",
      probabilities: { opt_make: 0.7, opt_buy: 0.3 },
    });
  };
  const result = await composeBoundedStage3Recommendation(
    { requirementKey: "req_relaunch", contractRevision: 1, requirement, eligible },
    { callGateway },
  );
  assert.equal(callCount, 1);
  assert.equal(result.kind, "recommendation");
  if (result.kind !== "recommendation") return;

  const parsed = parseManagerialRecommendation(result.recommendation, {
    requirementKey: "req_relaunch",
    contractRevision: 1,
    eligibleOptionIds: eligible.map((o) => o.optionId),
  });
  assert.equal(parsed.ok, true);
  if (parsed.ok) assert.equal(parsed.value.selectedOptionId, "opt_make");
});

test("bridge identity failure (application-truth): reported as bridge_failure, not technical_failure — no fallback semantics implied", async () => {
  // Duplicate option identity inside the eligible set is an application-truth
  // problem, never a Jev/provider problem — the composer must surface it as
  // bridge_failure so the caller does NOT spend an incumbent fallback call on it.
  const eligible = [option("dup"), option("dup")];
  const result = await composeBoundedStage3Recommendation(
    { requirementKey: "req_relaunch", contractRevision: 1, requirement, eligible },
    {
      callGateway: async () =>
        gatewayResultFor({ type: "choice", choice: "dup", probabilities: { dup: 1 } }),
    },
  );
  assert.equal(result.kind, "bridge_failure");
  if (result.kind === "bridge_failure") {
    assert.equal(result.reason, "duplicate_option_id");
  }
});
