import test from "node:test";
import assert from "node:assert/strict";
import {
  caseShapeFor,
  compareToIncumbent,
  isConfidentlyWrong,
  probabilityMargin,
} from "../lib/management/jev/eval/classify";
import { buildEvalSummary } from "../lib/management/jev/eval/summarize";
import type { EvalCase, JevRunRecord } from "../lib/management/jev/eval/types";

test("caseShapeFor classifies single vs multi", () => {
  assert.equal(caseShapeFor(1, "DETERMINISTIC_DOMINANCE"), "ONE_CANDIDATE");
  assert.equal(caseShapeFor(3, "DETERMINISTIC_DOMINANCE"), "MULTI_CANDIDATE_CLEAR");
  assert.equal(caseShapeFor(3, "HUMAN_REVIEW"), "MULTI_CANDIDATE_AMBIGUOUS");
});

test("probabilityMargin computes top and runner-up", () => {
  const m = probabilityMargin({ a: 0.2, b: 0.7, c: 0.1 }, "b");
  assert.equal(m.top, 0.7);
  assert.equal(m.runnerUp, 0.2);
  assert.ok(m.margin !== null && Math.abs(m.margin - 0.5) < 1e-9);
});

test("isConfidentlyWrong flags high-margin misses only on multi-option", () => {
  assert.equal(
    isConfidentlyWrong({
      caseShape: "MULTI_CANDIDATE_CLEAR",
      matchesReference: false,
      topProbability: 0.9,
      margin: 0.5,
    }),
    true,
  );
  assert.equal(
    isConfidentlyWrong({
      caseShape: "ONE_CANDIDATE",
      matchesReference: false,
      topProbability: 0.9,
      margin: 0.5,
    }),
    false,
  );
});

test("compareToIncumbent does not treat agreement as accuracy without truth", () => {
  assert.equal(
    compareToIncumbent(null, "a", "a", "HUMAN_REVIEW"),
    "agreement_without_independent_truth",
  );
  assert.equal(compareToIncumbent("a", "a", "a", "DETERMINISTIC_DOMINANCE"), "both_correct");
});

test("buildEvalSummary separates single-candidate control", () => {
  const cases: EvalCase[] = [
    {
      caseId: "one",
      corpusSource: "REAL",
      provenance: "test",
      caseShape: "ONE_CANDIDATE",
      reference: { kind: "DETERMINISTIC_DOMINANCE", expectedOptionId: "x", notes: "" },
      requirement: {
        requirementKey: "r",
        title: "t",
        mustBeTrue: "m",
        scope: "s",
        expectedOutput: null,
        requiredResourceClasses: [],
      },
      contractRevision: 1,
      eligible: [],
      factsSummary: "",
    },
  ];
  const results: JevRunRecord[] = [
    {
      caseId: "one",
      corpusSource: "REAL",
      caseShape: "ONE_CANDIDATE",
      candidateCount: 1,
      candidateIds: ["x"],
      factsSummary: "",
      referenceKind: "DETERMINISTIC_DOMINANCE",
      expectedOptionId: "x",
      jevOptionId: "x",
      jevKind: "selected",
      probabilities: { x: 1 },
      confidence: 1,
      topProbability: 1,
      runnerUpProbability: null,
      margin: 1,
      confidentlyWrong: false,
      matchesReference: true,
      bridgeOk: true,
      bridgeReason: null,
      incumbentOptionId: null,
      incumbentComparison: "no_incumbent",
      failureClass: null,
      latencyMs: 10,
      usage: { inputTokens: 1, outputTokens: 2, totalTokens: 3 },
      marketCostUsd: 0.001,
      detail: null,
    },
  ];
  const summary = buildEvalSummary(cases, results, { startingSha: "abc", branch: "eval/test" });
  assert.equal(summary.singleCandidateControl.validSelection, 1);
  assert.equal(summary.tokens.total, 3);
});
