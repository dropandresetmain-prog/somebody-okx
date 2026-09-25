import test from "node:test";
import assert from "node:assert/strict";
import {
  assessmentMatchesTarget,
  buildFinalDeliverableCorrectionPlan,
  resolveGovernedAssessmentTarget,
} from "../lib/management/finalDeliverableLifecycle";
import type { Assignment, Requirement } from "../lib/management/types";

const ARTIFACT = "objective/deliverable";
function req(key: string, deps: string[] = [], overrides: Partial<Requirement> = {}): Requirement {
  return {
    requirementKey: key, objectiveKey: "obj_lifecycle", contractId: "contract_lifecycle",
    contractRevision: 1, priority: "required", title: key, mustBeTrue: `${key} must be delivered`,
    scope: "test", dependsOnRequirementKeys: deps, requiredResourceClasses: ["company_records"],
    expectedOutput: "saved report", requirementKind: "deliverable", state: "satisfied",
    strategy: "MAKE", resolution: { contractRevision: 1, proofRefs: ["proof_existing"] } as Requirement["resolution"],
    blockedReason: null, waiver: null, revision: 1, createdAt: 10, updatedAt: 20,
    proofs: [{ proofKey: "artifact", proofKind: "company_artifact_version", description: "saved output",
      params: { artifactKey: ARTIFACT, minVersion: 2 } }],
    ...overrides,
  };
}
function graph(): Requirement[] {
  return [req("launch_context"), req("comparative_benchmark"),
    req("founder_ready_launch_plan", ["launch_context", "comparative_benchmark"])];
}
function resolve(requirements = graph(), artifacts = [{ key: ARTIFACT, version: 5 }]) {
  return resolveGovernedAssessmentTarget({ requirements, artifacts, contractRevision: 1 });
}
function assignment(requirementKey: string, overrides: Partial<Assignment> = {}): Assignment {
  return {
    assignmentId: `assignment_${requirementKey}`, objectiveKey: "obj_lifecycle", requirementKey,
    contractRevision: 1, state: "verified", runId: `run_${requirementKey}`, acceptedOutput: { summary: "accepted prerequisite" },
    ...overrides,
  } as Assignment;
}

// The source patch's regression is intentionally about business structure,
// not a special provider, title string, or model-specific requirement ID.
test("three deliverables sharing one artifact assess the terminal plan, not the first brief", () => {
  const result = resolve();
  assert.deepEqual(result, { ok: true, requirementKey: "founder_ready_launch_plan", artifactKey: ARTIFACT,
    artifactVersion: 5, minVersionRequired: 2 });
});
test("selection does not depend on storage row order", () => {
  const [a, b, c] = graph();
  for (const order of [[a, b, c], [a, c, b], [b, a, c], [b, c, a], [c, a, b], [c, b, a]]) {
    const result = resolve(order);
    assert.equal(result.ok && result.requirementKey, "founder_ready_launch_plan");
  }
});
test("arbitrary names still resolve by dependency structure", () => {
  const result = resolve([req("zulu"), req("alpha", ["zulu"])]);
  assert.equal(result.ok && result.requirementKey, "alpha");
});
test("intermediate artifacts do not make the final artifact ambiguous", () => {
  const requirements = graph();
  requirements[0]!.proofs[0]!.params.artifactKey = "intermediate/context";
  requirements[1]!.proofs[0]!.params.artifactKey = "intermediate/benchmark";
  const result = resolve(requirements, [{ key: "intermediate/context", version: 8 },
    { key: "intermediate/benchmark", version: 3 }, { key: ARTIFACT, version: 5 }]);
  assert.equal(result.ok && result.artifactKey, ARTIFACT);
  assert.equal(result.ok && result.requirementKey, "founder_ready_launch_plan");
});
test("two independent terminal outputs fail closed even when they share an artifact", () => {
  const result = resolve([req("one"), req("two")]);
  assert.equal(result.ok, false);
  if (!result.ok) assert.match(result.reason, /ambiguous final deliverable/);
});
test("a missing proof-named final artifact cannot fall back to an intermediate", () => {
  const result = resolve(graph(), [{ key: "unrelated", version: 99 }]);
  assert.equal(result.ok, false);
});
test("conflicting artifact proofs on the final output fail closed", () => {
  const requirements = graph();
  requirements[2]!.proofs.push({ proofKey: "second", proofKind: "company_artifact_version",
    description: "conflicting", params: { artifactKey: "another", minVersion: 2 } });
  assert.equal(resolve(requirements).ok, false);
});
test("duplicate same-artifact proofs retain the strongest minimum version", () => {
  const requirements = graph();
  requirements[2]!.proofs.push({ proofKey: "stricter", proofKind: "company_artifact_version",
    description: "later content", params: { artifactKey: ARTIFACT, minVersion: 4 } });
  assert.equal(resolve(requirements).ok && (resolve(requirements) as { minVersionRequired: number }).minVersionRequired, 4);
});
test("malformed explicit artifact proofs do not invoke the legacy fallback", () => {
  const requirement = req("final");
  requirement.proofs[0]!.params.artifactKey = "";
  assert.equal(resolve([requirement]).ok, false);
  requirement.proofs[0]!.params.artifactKey = ARTIFACT;
  requirement.proofs[0]!.params.minVersion = "five";
  assert.equal(resolve([requirement]).ok, false);
});
test("the legacy sole-artifact fallback still needs an unambiguous final requirement", () => {
  assert.equal(resolve([req("only", [], { proofs: [] })]).ok, true);
  assert.equal(resolve([req("one", [], { proofs: [] }), req("two", [], { proofs: [] })]).ok, false);
});
test("legacy proof-only input rows do not become the final deliverable", () => {
  const input = req("research", [], { requirementKind: undefined, proofs: [{ proofKey: "external",
    description: "acquisition", proofKind: "verified_external_result", params: {} }] });
  const result = resolve([input, req("final", ["research"], { requirementKind: undefined })]);
  assert.equal(result.ok && result.requirementKey, "final");
});
test("old revisions and superseded requirements cannot steal the final target", () => {
  const result = resolve([...graph(), req("old", [], { contractRevision: 0 }), req("retired", [], { state: "superseded" })]);
  assert.equal(result.ok && result.requirementKey, "founder_ready_launch_plan");
});
test("optional supporting work cannot steal the required completion target", () => {
  const result = resolve([...graph(), req("optional_extra", ["founder_ready_launch_plan"], { priority: "supporting" })]);
  assert.equal(result.ok && result.requirementKey, "founder_ready_launch_plan");
});
test("a waived final output is not silently replaced by an intermediate output", () => {
  const requirements = graph(); requirements[2]!.state = "waived";
  assert.equal(resolve(requirements).ok, false);
});
test("duplicate requirement/artifact identities or invalid artifact versions refuse assessment", () => {
  assert.equal(resolve([req("same"), req("same")]).ok, false);
  assert.equal(resolve(graph(), [{ key: ARTIFACT, version: 5 }, { key: ARTIFACT, version: 6 }]).ok, false);
  assert.equal(resolve(graph(), [{ key: ARTIFACT, version: NaN }]).ok, false);
});
test("an exact revision, artifact and version match is reusable", () => {
  assert.equal(assessmentMatchesTarget({ contractRevision: 1, artifactKey: ARTIFACT, artifactVersion: 5 },
    { contractRevision: 1, artifactKey: ARTIFACT, artifactVersion: 5 }), true);
});
test("stale content, different artifact/revision, and incomplete targets are never reusable", () => {
  const assessment = { contractRevision: 1, artifactKey: ARTIFACT, artifactVersion: 5 };
  for (const target of [
    { contractRevision: 1, artifactKey: ARTIFACT, artifactVersion: 6 },
    { contractRevision: 2, artifactKey: ARTIFACT, artifactVersion: 5 },
    { contractRevision: 1, artifactKey: "other", artifactVersion: 5 },
    { contractRevision: 1, artifactKey: ARTIFACT },
    { contractRevision: 1, artifactKey: "", artifactVersion: 5 },
  ]) assert.equal(assessmentMatchesTarget(assessment, target), false);
  assert.equal(assessmentMatchesTarget(null, { contractRevision: 1, artifactKey: ARTIFACT, artifactVersion: 5 }), false);
});
test("correction scopes reopening and supersession to the rejected final output", () => {
  const requirements = [req("owned_evidence", [], { requirementKind: "input" }), ...graph()];
  requirements[1]!.dependsOnRequirementKeys = ["owned_evidence"];
  const assignments = requirements.map((r) => assignment(r.requirementKey));
  assignments.push(assignment("founder_ready_launch_plan", { assignmentId: "old_revision", contractRevision: 0 }));
  assignments.push(assignment("founder_ready_launch_plan", { assignmentId: "other_objective", objectiveKey: "other" }));
  assignments.push(assignment("founder_ready_launch_plan", { assignmentId: "failed_attempt", state: "failed" }));
  const fingerprints = { owned_evidence: "input_fp", launch_context: "context_fp",
    comparative_benchmark: "benchmark_fp", founder_ready_launch_plan: "final_fp" };
  const before = JSON.stringify({ requirements, assignments, fingerprints });
  const plan = buildFinalDeliverableCorrectionPlan({ requirements, assignments,
    artifacts: [{ key: ARTIFACT, version: 5 }], contractRevision: 1, decisionInputFingerprints: fingerprints, at: 100 });
  assert.equal(plan.ok, true);
  if (!plan.ok) throw new Error(plan.reason);
  assert.equal(plan.reopenedRequirement.requirementKey, "founder_ready_launch_plan");
  assert.equal(plan.reopenedRequirement.state, "active");
  assert.equal(plan.reopenedRequirement.strategy, null);
  assert.equal(plan.reopenedRequirement.resolution, null);
  assert.deepEqual(plan.reopenedRequirement.proofs, requirements[3]!.proofs);
  assert.deepEqual(plan.assignmentIdsToSupersede, ["assignment_founder_ready_launch_plan"]);
  assert.deepEqual(plan.decisionInputFingerprints, { owned_evidence: "input_fp", launch_context: "context_fp", comparative_benchmark: "benchmark_fp" });
  assert.equal(JSON.stringify({ requirements, assignments, fingerprints }), before, "planning must not mutate any input");
});
test("correction does not reopen a target already active or ambiguously identified", () => {
  const requirements = graph(); requirements[2]!.state = "active";
  const input = { requirements, assignments: [], artifacts: [{ key: ARTIFACT, version: 5 }],
    contractRevision: 1, decisionInputFingerprints: {}, at: 100 };
  assert.equal(buildFinalDeliverableCorrectionPlan(input).ok, false);
  assert.equal(buildFinalDeliverableCorrectionPlan({ ...input, requirements: [req("one"), req("two")] }).ok, false);
});
