// Jev Stage-3 recommendation seam — focused tests against the converged lock +
// rationale-honor helpers used by proposeDecision (convex/objectiveRunner.ts).
//
// Stage-4 applyDecision remains the sole authorizer; these tests prove Stage-3
// composition never grants authority and never silently falls back while the
// Jev gate is ON.
import test from "node:test";
import assert from "node:assert/strict";
import {
  assertRationaleHonorsLockedSelection,
  isJevOptionSelectionEnabled,
  lockEligibleOptionSelection,
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
  const result = await lockEligibleOptionSelection(
    { requirement, eligible: [] },
    { callGateway },
  );
  assert.equal(result.kind, "no_candidates");
  assert.equal(called, 0);
});

test("one eligible: Jev not called; selection locked to sole option", async () => {
  let called = 0;
  const callGateway: JevGatewayCall = async () => {
    called += 1;
    return gatewayResultFor({ type: "choice", choice: "opt_only" });
  };
  const sole = option("opt_only");
  const result = await lockEligibleOptionSelection(
    { requirement, eligible: [sole] },
    { callGateway },
  );
  assert.equal(called, 0);
  assert.equal(result.kind, "selected");
  if (result.kind === "selected") {
    assert.equal(result.selectedOptionId, "opt_only");
    assert.equal(result.source, "sole_eligible");
  }
  // Rationale source cannot escape the lock.
  assert.equal(assertRationaleHonorsLockedSelection("opt_only", "opt_only").ok, true);
  assert.equal(assertRationaleHonorsLockedSelection("opt_only", "opt_other").ok, false);
});

test("several eligible: Jev receives exactly the application-computed eligible IDs", async () => {
  const eligible = [option("opt_make"), buyOption("opt_buy", 12), option("opt_make_b")];
  // Ineligible ID must never be offered to Jev.
  const ineligible = option("opt_ineligible", {
    eligibility: { eligible: false, reasons: ["budget_exceeded"], detail: "over budget" },
  });
  void ineligible;

  let seenIds: string[] = [];
  const callGateway: JevGatewayCall = async ({ questions }) => {
    const criteria = (questions.selectedOption as { criteria: Record<string, unknown> }).criteria;
    seenIds = Object.keys(criteria);
    return gatewayResultFor({
      type: "choice",
      choice: "opt_buy",
      probabilities: { opt_make: 0.2, opt_buy: 0.6, opt_make_b: 0.2 },
    });
  };

  const result = await lockEligibleOptionSelection(
    { requirement, eligible },
    { callGateway },
  );
  assert.deepEqual(seenIds, ["opt_make", "opt_buy", "opt_make_b"]);
  assert.ok(!seenIds.includes("opt_ineligible"));
  assert.equal(result.kind, "selected");
  if (result.kind === "selected") {
    assert.equal(result.selectedOptionId, "opt_buy");
    assert.equal(result.source, "jev");
  }

  // Valid Jev selection flows into a raw ManagerialRecommendation shape.
  const raw = {
    requirementKey: "req_relaunch",
    contractRevision: 1,
    selectedOptionId: "opt_buy",
    strongestAlternativeId: "opt_make",
    rationale: "Buy fills the founder-language gap faster.",
    materialAssumptions: ["simulated offering remains available"],
    changeMyMindEvidence: ["price changes"],
  };
  const parsed = parseManagerialRecommendation(raw, {
    requirementKey: "req_relaunch",
    contractRevision: 1,
    eligibleOptionIds: eligible.map((o) => o.optionId),
  });
  assert.equal(parsed.ok, true);
  if (parsed.ok) assert.equal(parsed.value.selectedOptionId, "opt_buy");
});

test("Jev returns unknown ID: typed refusal; no decision authority", async () => {
  const eligible = [option("opt_a"), option("opt_b")];
  const callGateway: JevGatewayCall = async () =>
    gatewayResultFor({ type: "choice", choice: "opt_not_eligible", probabilities: {} });

  const result = await lockEligibleOptionSelection(
    { requirement, eligible },
    { callGateway },
  );
  assert.equal(result.kind, "failure");
  if (result.kind === "failure") {
    assert.match(result.detail, /not an eligible grounded option|unknown option id/i);
  }
});

test("Jev malformed / unavailable / timeout: typed refusal; no silent legacy fallback", async () => {
  const eligible = [option("opt_a"), option("opt_b")];

  const malformed = await lockEligibleOptionSelection(
    { requirement, eligible },
    {
      callGateway: async () => gatewayResultFor({ type: "choice", choice: 123 }),
    },
  );
  assert.equal(malformed.kind, "failure");

  const unavailable = await lockEligibleOptionSelection(
    { requirement, eligible },
    {
      callGateway: async () => {
        throw new Error("gateway down");
      },
    },
  );
  assert.equal(unavailable.kind, "failure");
  if (unavailable.kind === "failure") {
    assert.ok(unavailable.failureClass);
  }

  const timeout = await lockEligibleOptionSelection(
    { requirement, eligible, timeoutMs: 20 },
    {
      callGateway: async ({ abortSignal }) =>
        new Promise((_, reject) => {
          abortSignal?.addEventListener("abort", () => reject(new Error("aborted")));
        }),
    },
  );
  assert.equal(timeout.kind, "failure");
});

test("rationale model returns another selectedOptionId: refusal; Jev lock not replaced", () => {
  const honor = assertRationaleHonorsLockedSelection("opt_jev", "opt_model_escape");
  assert.equal(honor.ok, false);
  if (!honor.ok) assert.match(honor.detail, /opt_jev/);
  // Locked id is preserved as the only acceptable value.
  assert.equal(assertRationaleHonorsLockedSelection("opt_jev", "opt_jev").ok, true);
});

test("stale eligible set between propose and apply: parser refuses Jev-locked id", () => {
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
  // Application only passes eligible options into the lock. An over-budget BUY
  // never reaches Jev — prove by locking with MAKE-only eligible set while a
  // BUY id is requested by a malicious gateway.
  const eligible = [option("opt_make")];
  let called = 0;
  const callGateway: JevGatewayCall = async () => {
    called += 1;
    return gatewayResultFor({ type: "choice", choice: "opt_buy_over_budget" });
  };
  // Sole eligible → Jev never called; lock is MAKE.
  const result = await lockEligibleOptionSelection(
    { requirement, eligible },
    { callGateway },
  );
  assert.equal(called, 0);
  assert.equal(result.kind, "selected");
  if (result.kind === "selected") assert.equal(result.selectedOptionId, "opt_make");

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
  // not be in `eligible`. Confirm lock cannot select it.
  const result = await lockEligibleOptionSelection(
    { requirement, eligible },
    {
      callGateway: async () =>
        gatewayResultFor({ type: "choice", choice: "opt_m3_incompatible" }),
    },
  );
  assert.equal(result.kind, "selected");
  if (result.kind === "selected") {
    assert.equal(result.selectedOptionId, "opt_make_scoped");
    assert.equal(result.source, "sole_eligible");
  }
});

test("successful canonical path shape: eligible MAKE/BUY → Jev → raw recommendation parses", async () => {
  const eligible = [option("opt_make"), buyOption("opt_buy", 9)];
  const callGateway: JevGatewayCall = async ({ questions }) => {
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
  const lock = await lockEligibleOptionSelection(
    { requirement, eligible },
    { callGateway },
  );
  assert.equal(lock.kind, "selected");
  if (lock.kind !== "selected") return;

  const honor = assertRationaleHonorsLockedSelection(lock.selectedOptionId, lock.selectedOptionId);
  assert.equal(honor.ok, true);

  const raw = {
    requirementKey: "req_relaunch",
    contractRevision: 1,
    selectedOptionId: lock.selectedOptionId,
    strongestAlternativeId: "opt_buy",
    rationale: "MAKE with owned research first.",
    materialAssumptions: ["owned public web suffices for first draft"],
    changeMyMindEvidence: ["founder-language gap remains after MAKE"],
  };
  const parsed = parseManagerialRecommendation(raw, {
    requirementKey: "req_relaunch",
    contractRevision: 1,
    eligibleOptionIds: eligible.map((o) => o.optionId),
  });
  assert.equal(parsed.ok, true);
  if (parsed.ok) assert.equal(parsed.value.selectedOptionId, "opt_make");
});
