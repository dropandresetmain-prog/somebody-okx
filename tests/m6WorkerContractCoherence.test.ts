// CHECKPOINT 2: coherent worker contract and action surface.
//
// Regression coverage for the exact contradiction the Nex Run 1 evidence
// captured (docs/work/gate-evidence/jev-sourcing-experiment-run-nex-1-2026-09-24):
// a WorkContract with targetArtifactKey: null (analysis-only, mutation
// correctly refused by the runtime) whose assignment text still instructed
// "update the controlled company artifact" and whose materialized tool
// surface still exposed update_company_artifact as a usable action — asking
// the worker to perform an action the application had already decided was
// impossible for it.
import test from "node:test";
import assert from "node:assert/strict";
import { responsibilityForAssignment } from "../lib/workforce/catalog";
import { toolNamesForContract } from "../lib/worker/runtime";
import { buildAssignmentContract } from "../lib/management/dispatch";
import type { WorkContract } from "../lib/objective/types";
import type { GroundedOption, Requirement } from "../lib/management/types";

const now = 1_977_000_000_000;

function baseRequirement(overrides: Partial<Requirement> = {}): Requirement {
  return {
    requirementKey: "req_01",
    objectiveKey: "obj_contract_coherence",
    contractId: "contract_1",
    contractRevision: 1,
    priority: "required",
    title: "Evidence boundary",
    mustBeTrue: "material claims are supported by available evidence",
    scope: "evidence-bounded launch-week plan",
    dependsOnRequirementKeys: [],
    requiredResourceClasses: [],
    expectedOutput: "a bounded evidence inventory",
    requirementKind: "deliverable",
    proofs: [
      {
        proofKey: "evidence",
        description: "observed evidence",
        proofKind: "application_observation",
        params: {},
      },
    ],
    state: "active",
    strategy: null,
    resolution: null,
    blockedReason: null,
    waiver: null,
    revision: 1,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

function internalOption(capabilityKeys: string[]): GroundedOption {
  return {
    optionId: "opt_1",
    requirementKey: "req_01",
    contractRevision: 1,
    kind: "internal",
    strategy: "MAKE",
    internal: {
      capabilityKeys,
      responsibility: "",
      workerKey: null,
      staffingReason: null,
      primitives: [],
    },
    external: null,
    facts: {
      scope: null,
      expectedQuality: null,
      setupMinutes: null,
      queueMinutes: null,
      executionMinutes: null,
      verificationMinutes: null,
      internalCostUsd: null,
      externalPriceUsd: null,
      reliability: null,
      availability: null,
      reuseValue: null,
      externalAdvantage: null,
    },
    eligibility: { eligible: true } as unknown as GroundedOption["eligibility"],
  };
}

test("responsibilityForAssignment: analysis-only never instructs an artifact mutation", () => {
  const analysisOnly = responsibilityForAssignment(
    ["growth_launch_operations", "company_records_lookup"],
    { analysisOnly: true },
  );
  assert.ok(
    !/update the controlled company artifact/i.test(analysisOnly),
    "analysis-only responsibility text must not instruct an artifact mutation",
  );
  assert.match(analysisOnly, /analysis-only/i);

  const writing = responsibilityForAssignment(["growth_launch_operations"], {
    analysisOnly: false,
  });
  assert.match(
    writing,
    /update the controlled company artifact/i,
    "a genuinely authorized writing assignment keeps its mutation instruction",
  );
});

test("toolNamesForContract: update_company_artifact is never presented as usable when targetArtifactKey is null", () => {
  const contract: WorkContract = {
    assignment: "test",
    idempotencyScope: "scope",
    workerKey: "worker_x",
    capabilityKeys: ["growth_launch_operations"],
    allowedToolPermissions: [
      "read_company_record",
      "read_public_web",
      "record_finding",
      "update_company_artifact",
    ],
    requiredSourceClasses: ["company_record"],
    minObservations: 1,
    sourceProofs: [{ sourceClass: "company_record", minDistinctSources: 1 }],
    requiredVerifiedEffectKeys: [],
    approvalVersion: null,
    resultRequirements: {
      summary: true,
      fit: true,
      risks: true,
      unknowns: true,
      recommendedNextAction: true,
    },
    targetArtifactKey: null,
  };

  const analysisOnly = toolNamesForContract(contract, { serialManagerProtocol: true });
  assert.ok(
    !analysisOnly.materialized.includes("update_company_artifact"),
    "the write tool must not be materialized when mutation is unauthorized",
  );
  assert.ok(analysisOnly.skipped.includes("update_company_artifact"));

  const writing = toolNamesForContract(
    { ...contract, targetArtifactKey: "launch/page-message" },
    { serialManagerProtocol: true },
  );
  assert.ok(
    writing.materialized.includes("update_company_artifact"),
    "a genuinely authorized writing assignment still gets the write tool",
  );

  // Legacy/non-serial contracts never carry targetArtifactKey at all
  // (undefined, not null) — unaffected, preserving compatibility.
  const legacy: WorkContract = { ...contract };
  delete (legacy as { targetArtifactKey?: string | null }).targetArtifactKey;
  const legacyTools = toolNamesForContract(legacy, { serialManagerProtocol: false });
  assert.ok(legacyTools.materialized.includes("update_company_artifact"));
});

test("buildAssignmentContract: analysis-only dispatch (targetArtifactKey null) produces a coherent contract — no write instruction, no write tool", () => {
  const requirement = baseRequirement();
  const option = internalOption([
    "growth_launch_operations",
    "company_records_lookup",
    "public_information_research",
  ]);

  const built = buildAssignmentContract({
    requirement,
    option,
    assignmentId: "asg_1",
    workerKey: "",
    at: now,
    inputEvidenceIds: [],
    targetArtifactKey: null,
    serialManagerProtocol: true,
  });

  assert.ok(built.ok, built.ok ? "" : built.errors.join("; "));
  if (!built.ok) return;

  assert.equal(built.contract.targetArtifactKey, null);
  assert.ok(
    !/update the controlled company artifact/i.test(built.contract.assignment),
    "an analysis-only assignment must never instruct the worker to update an artifact",
  );
  assert.match(built.contract.assignment, /analysis-only/i);

  const tools = toolNamesForContract(built.contract, { serialManagerProtocol: true });
  assert.ok(
    !tools.materialized.includes("update_company_artifact"),
    "the composed contract must not expose the write tool as usable when it has no authorized target",
  );
});

test("buildAssignmentContract: a genuinely authorized writing dispatch keeps its mutation instruction and tool", () => {
  const requirement = baseRequirement();
  const option = internalOption(["growth_launch_operations"]);

  const built = buildAssignmentContract({
    requirement,
    option,
    assignmentId: "asg_2",
    workerKey: "worker_growth_launch_operations",
    at: now,
    inputEvidenceIds: [],
    targetArtifactKey: "launch/page-message",
    serialManagerProtocol: true,
  });

  assert.ok(built.ok, built.ok ? "" : built.errors.join("; "));
  if (!built.ok) return;

  assert.equal(built.contract.targetArtifactKey, "launch/page-message");
  assert.match(built.contract.assignment, /update the controlled company artifact/i);

  const tools = toolNamesForContract(built.contract, { serialManagerProtocol: true });
  assert.ok(tools.materialized.includes("update_company_artifact"));
});
