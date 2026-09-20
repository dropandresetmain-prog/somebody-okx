// M6.1 CP1 — causal-pipeline recovery regressions (run binding, executability,
// empty-proof refusal, decision attempt identity).
import test from "node:test";
import assert from "node:assert/strict";
import {
  createWorkContract,
  createWorkerSpec,
  evaluateCompletion,
} from "../lib/workforce";
import type { ActivityResult } from "../lib/workforce";
import { assessInternalContractExecutability, deriveAssignmentId } from "../lib/management/dispatch";
import { attemptRequirementSatisfaction } from "../lib/management/requirements";
import type { Requirement } from "../lib/management/types";
import {
  attemptFromDecisionId,
  BEGIN_DECISION_CEILING,
} from "../convex/management";

const at = 1700000000000;
const now = 1800000000000;

function requirement(overrides: Partial<Requirement> = {}): Requirement {
  return {
    requirementKey: "page_live",
    objectiveKey: "obj_launch",
    contractId: "contract_launch",
    contractRevision: 1,
    priority: "required",
    title: "Landing page is live",
    mustBeTrue: "page reachable",
    scope: "public URL",
    proofs: [
      {
        proofKey: "observation",
        description: "an application observation exists",
        proofKind: "application_observation",
        params: { sourceId: "obs_page_check" },
      },
    ],
    state: "active",
    strategy: "MAKE",
    resolution: null,
    blockedReason: null,
    waiver: null,
    revision: 1,
    createdAt: at,
    updatedAt: at,
    ...overrides,
  };
}

function summaryOnlyContract() {
  return createWorkContract({
    assignment: "Summarize findings.",
    idempotencyScope: "m61:summary-only",
    worker: createWorkerSpec(["company_records_lookup"]),
    sourceProofs: [{ sourceClass: "company_record", minDistinctSources: 0 }],
    resultRequirements: {
      summary: true,
      fit: false,
      risks: false,
      unknowns: false,
      recommendedNextAction: false,
    },
  });
}

function fullResult(runId: string): ActivityResult {
  return {
    summary: "Done for this run.",
    fit: "",
    risks: [],
    unknowns: [],
    recommendedNextAction: "",
    completedAt: now,
    runId,
  };
}

// ── A. Stale run result cannot complete the current run ─────────────────────

test("evaluateCompletion ignores prior run result when currentRunId differs", () => {
  const contract = summaryOnlyContract();
  const priorRun = fullResult("run_prior");
  const stale = evaluateCompletion({
    contract,
    evidence: [],
    result: priorRun,
    currentRunId: "run_current",
  });
  assert.equal(stale.complete, false);
  assert.ok(
    stale.unmet.some((line) => line.includes("Structured result missing a summary")),
    "foreign runId treated as no result",
  );

  const sameRun = evaluateCompletion({
    contract,
    evidence: [],
    result: fullResult("run_current"),
    currentRunId: "run_current",
  });
  assert.equal(sameRun.complete, true);
  assert.equal(sameRun.unmet.length, 0);
});

// ── B. Internal contract executability vs capability envelope ─────────────────

test("assessInternalContractExecutability refuses observation proof without observe path", () => {
  const obsReq = requirement();
  const draftingOnly = assessInternalContractExecutability({
    requirement: obsReq,
    capabilityKeys: ["document_drafting"],
  });
  assert.equal(draftingOnly.ok, false);
  if (draftingOnly.ok) return;
  assert.ok(
    draftingOnly.reasons.some((r) => r.includes("no executable observe path")),
  );

  const withRecords = assessInternalContractExecutability({
    requirement: obsReq,
    capabilityKeys: ["company_records_lookup"],
  });
  assert.equal(withRecords.ok, true);

  const withWeb = assessInternalContractExecutability({
    requirement: obsReq,
    capabilityKeys: ["public_information_research"],
  });
  assert.equal(withWeb.ok, true);
});

test("assessInternalContractExecutability refuses artifact proof without update_company_artifact", () => {
  const artifactReq = requirement({
    proofs: [
      {
        proofKey: "artifact_change",
        description: "artifact advanced",
        proofKind: "company_artifact_version",
        params: { artifactKey: "launch_page", minVersion: 2 },
      },
    ],
  });
  const notOk = assessInternalContractExecutability({
    requirement: artifactReq,
    capabilityKeys: ["document_drafting", "public_information_research"],
  });
  assert.equal(notOk.ok, false);
  if (notOk.ok) return;
  assert.ok(
    notOk.reasons.some((r) => r.includes("cannot mutate company artifacts")),
  );
});

// ── C. Empty proofs never satisfy ────────────────────────────────────────────

test("attemptRequirementSatisfaction refuses requirements with proofs:[]", () => {
  const req = requirement({ proofs: [] });
  const result = attemptRequirementSatisfaction({
    requirement: req,
    event: {
      kind: "artifact_changed",
      artifactKey: "launch_page",
      version: 2,
      contractRevision: 1,
    },
    facts: {
      artifactVersions: { launch_page: 2 },
      applicationObservationIds: ["obs_page_check"],
      verifiedIntentIds: [],
      founderConfirmationRefs: [],
    },
    resolutionId: "res_empty",
    acceptedDecisionId: "dec_1",
    acceptedAssignmentId: null,
    acceptedIntentId: null,
    proofRefs: ["ev_1"],
    currentContractRevision: 1,
    at,
  });
  assert.equal(result.satisfied, false);
  if (result.satisfied) return;
  assert.ok(result.reason.includes("declares no governed proof"));
  assert.equal(result.requirement.state, "active");
});

// ── D. Decision attempt suffix → assignment identity ───────────────────────

test("attemptFromDecisionId parses _aN suffix; deriveAssignmentId is stable per decision", () => {
  assert.equal(attemptFromDecisionId("dec_obj_req_r1_a2"), 2);
  assert.equal(attemptFromDecisionId("dec_obj_req_r1"), null);

  const material = {
    objectiveKey: "obj_x",
    requirementKey: "req_y",
    contractRevision: 1,
  };
  const decisionA1 = "dec_obj_x_req_y_r1_a1";
  const decisionA2 = "dec_obj_x_req_y_r1_a2";
  const id1a = deriveAssignmentId({ ...material, decisionId: decisionA1 });
  const id1b = deriveAssignmentId({ ...material, decisionId: decisionA1 });
  assert.equal(id1a, id1b, "same decision material → same assignment id");

  const id2 = deriveAssignmentId({ ...material, decisionId: decisionA2 });
  assert.notEqual(id1a, id2, "different attempt suffix → different assignment id");
});

// ── E. Decision ceiling export ───────────────────────────────────────────────

test("BEGIN_DECISION_CEILING remains 3", () => {
  assert.equal(BEGIN_DECISION_CEILING, 3);
});
