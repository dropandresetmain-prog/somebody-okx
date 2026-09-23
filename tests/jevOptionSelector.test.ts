// Jev option-selector — focused adapter tests.
//
// These pin the adapter's scope boundary: it chooses among options the
// application already marked eligible, never invents an id, never gets
// called on zero candidates, and fails closed on any untrusted/malformed
// gateway answer. Diagnostic metadata (probabilities) is preserved but never
// treated as authority — the "selected" result carries no rationale and is
// not a ManagerialRecommendation.
import test from "node:test";
import assert from "node:assert/strict";
import { selectEligibleOption } from "../lib/management/jev/selectEligibleOption";
import type { JevGatewayCall, JevGatewayResult } from "../lib/management/jev/client";
import { EMPTY_FACTS } from "../lib/management/options";
import type { GroundedOption } from "../lib/management/types";
import type { JevRequirementContext } from "../lib/management/jev/types";

const requirement: JevRequirementContext = {
  requirementKey: "req_1",
  title: "Research merchant return policy",
  mustBeTrue: "A public-web research summary on the merchant's return policy exists.",
  scope: "public web research only",
  expectedOutput: "a written summary",
  requiredResourceClasses: ["public_web"],
};

function option(id: string, overrides: Partial<GroundedOption> = {}): GroundedOption {
  return {
    optionId: id,
    requirementKey: "req_1",
    contractRevision: 1,
    kind: "internal",
    strategy: "MAKE",
    internal: {
      capabilityKeys: ["public_information_research"],
      responsibility: "run research",
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

function gatewayResultFor(answer: unknown): JevGatewayResult {
  return {
    answers: { selectedOption: answer },
  } as unknown as JevGatewayResult;
}

test("one eligible option selects successfully", async () => {
  const opt = option("opt_a");
  const callGateway: JevGatewayCall = async () =>
    gatewayResultFor({ type: "choice", choice: "opt_a", probabilities: { opt_a: 0.95 } });

  const result = await selectEligibleOption({ requirement, eligible: [opt] }, { callGateway });
  assert.equal(result.kind, "selected");
  if (result.kind === "selected") {
    assert.equal(result.optionId, "opt_a");
    assert.equal(result.confidence, 0.95);
  }
});

test("several eligible options: selected id must come from supplied candidates", async () => {
  const options = [option("opt_a"), option("opt_b"), option("opt_c")];
  let seenCriteria: string[] = [];
  const callGateway: JevGatewayCall = async ({ questions }) => {
    seenCriteria = Object.keys((questions.selectedOption as { criteria: Record<string, unknown> }).criteria);
    return gatewayResultFor({ type: "choice", choice: "opt_b", probabilities: { opt_a: 0.1, opt_b: 0.8, opt_c: 0.1 } });
  };

  const result = await selectEligibleOption({ requirement, eligible: options }, { callGateway });
  assert.deepEqual(seenCriteria, ["opt_a", "opt_b", "opt_c"]);
  assert.equal(result.kind, "selected");
  if (result.kind === "selected") assert.equal(result.optionId, "opt_b");
});

test("zero eligible options: Jev is never called", async () => {
  let called = false;
  const callGateway: JevGatewayCall = async () => {
    called = true;
    return gatewayResultFor({ type: "choice", choice: "should_not_happen" });
  };

  const result = await selectEligibleOption({ requirement, eligible: [] }, { callGateway });
  assert.equal(result.kind, "no_candidates");
  assert.equal(called, false);
});

test("Jev returns an unknown option id: fails closed", async () => {
  const opt = option("opt_a");
  const callGateway: JevGatewayCall = async () =>
    gatewayResultFor({ type: "choice", choice: "opt_hallucinated" });

  const result = await selectEligibleOption({ requirement, eligible: [opt] }, { callGateway });
  assert.equal(result.kind, "invalid_response");
});

test("gateway timeout: typed failure", async () => {
  const opt = option("opt_a");
  const callGateway: JevGatewayCall = async () => {
    const error = new Error("The operation was aborted");
    error.name = "AbortError";
    throw error;
  };

  const result = await selectEligibleOption({ requirement, eligible: [opt] }, { callGateway });
  assert.equal(result.kind, "unavailable");
  if (result.kind === "unavailable") assert.equal(result.failureClass, "timeout");
});

test("provider/API failure: typed failure", async () => {
  const opt = option("opt_a");
  const callGateway: JevGatewayCall = async () => {
    throw new Error("upstream 503 bad gateway");
  };

  const result = await selectEligibleOption({ requirement, eligible: [opt] }, { callGateway });
  assert.equal(result.kind, "unavailable");
  if (result.kind === "unavailable") assert.equal(result.failureClass, "upstream_unavailable");
});

test("malformed result: fails closed", async () => {
  const opt = option("opt_a");
  const callGateway: JevGatewayCall = async () => ({ nonsense: true }) as unknown as JevGatewayResult;

  const result = await selectEligibleOption({ requirement, eligible: [opt] }, { callGateway });
  assert.equal(result.kind, "invalid_response");
});

test("probabilities are preserved as diagnostic metadata only", async () => {
  const options = [option("opt_a"), option("opt_b")];
  const callGateway: JevGatewayCall = async () =>
    gatewayResultFor({ type: "choice", choice: "opt_a", probabilities: { opt_a: 0.6, opt_b: 0.4 } });

  const result = await selectEligibleOption({ requirement, eligible: options }, { callGateway });
  assert.equal(result.kind, "selected");
  if (result.kind === "selected") {
    assert.deepEqual(result.probabilities, { opt_a: 0.6, opt_b: 0.4 });
    assert.equal(result.confidence, 0.6);
    // The result carries no rationale/authority field — selection alone.
    assert.equal("rationale" in result, false);
  }
});
