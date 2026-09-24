// Source-proof alignment — Requirement-local proof must preserve the
// observable source intent already present in Requirement.requiredResourceClasses.
//
// Regression basis: Luna Run 1B's clean DELIVERED requirement
// (req_launch_week_plan) locally satisfied with a company_record-only proof
// even though it materially depended on public research. This file proves the
// fix across the whole path: proof attachment -> dispatch obligations ->
// executability -> proof binding -> Requirement-level recomputation.
import test from "node:test";
import assert from "node:assert/strict";
import {
  bindExecutedProofParams,
  buildOutcomeContract,
  buildRequirement,
} from "../lib/management/contract";
import {
  assessInternalContractExecutability,
  observationProofObligations,
} from "../lib/management/dispatch";
import { missingProofs, NO_PROOF_FACTS } from "../lib/management/requirements";
import type { ProofFacts } from "../lib/management/requirements";
import { evaluateCompletionGate } from "../lib/management/completion";
import { createWorkContract, createWorkerSpec } from "../lib/workforce";
import type { OutcomeContract, Requirement } from "../lib/management/types";
import { cp2ParsedRequirement } from "./helpers/cp2Requirement";

const at = 1_800_000_000_000;

function contractFor(objectiveKey: string): OutcomeContract {
  const built = buildOutcomeContract({
    objectiveKey,
    contractId: `contract_${objectiveKey}`,
    revision: 1,
    parsed: {
      intent: "prove source-proof alignment",
      levels: [{ levelKey: "goal", order: 1, statement: "the goal holds", label: "Goal" }],
      minimumCompletionBar: "goal",
      ambiguities: [],
    },
    requestId: "req_source_proof_test",
    founderResolvedQuestions: [],
    at,
  });
  assert.equal(built.ok, true);
  if (!built.ok) throw new Error("fixture contract failed");
  return built.contract;
}

function requirementFor(
  objectiveKey: string,
  requirementKey: string,
  requiredResourceClasses: string[],
): Requirement {
  const built = buildRequirement(
    {
      objectiveKey,
      contract: contractFor(objectiveKey),
      proposed: cp2ParsedRequirement({
        requirementKey,
        priority: "required",
        title: "t",
        mustBeTrue: "true",
        scope: "s",
        requiredResourceClasses,
      }),
      artifactKeyForInternalProof: null,
      at,
    },
    "MAKE",
  );
  assert.ok("requirement" in built, JSON.stringify(built));
  if (!("requirement" in built)) throw new Error("unreachable");
  return built.requirement;
}

function factsWith(overrides: Partial<ProofFacts>): ProofFacts {
  return { ...NO_PROOF_FACTS, ...overrides };
}

function resolutionFor(revision: number): Requirement["resolution"] {
  return {
    resolutionId: "res_test",
    acceptedDecisionId: null,
    acceptedAssignmentId: null,
    acceptedIntentId: null,
    proofRefs: [],
    contractRevision: revision,
    acceptedAt: at,
  };
}

// ── 1/2/3/4: proof attachment preserves the Requirement's observable source intent ─

test("requiredResourceClasses=[public_web] attaches an observation proof carrying sourceClass public_web", () => {
  const req = requirementFor("obj_1", "req_a", ["public_web"]);
  const obs = req.proofs.filter((p) => p.proofKind === "application_observation");
  assert.equal(obs.length, 1);
  assert.equal(obs[0].params.sourceClass, "public_web");
});

test("requiredResourceClasses=[company_records] attaches an observation proof carrying sourceClass company_record", () => {
  const req = requirementFor("obj_1", "req_b", ["company_records"]);
  const obs = req.proofs.filter((p) => p.proofKind === "application_observation");
  assert.equal(obs.length, 1);
  assert.equal(obs[0].params.sourceClass, "company_record");
});

test("both company_records and public_web required: both source obligations survive attachment", () => {
  const req = requirementFor("obj_1", "req_c", ["company_records", "public_web"]);
  const obs = req.proofs.filter((p) => p.proofKind === "application_observation");
  assert.equal(obs.length, 2);
  assert.deepEqual(obs.map((p) => p.params.sourceClass).sort(), ["company_record", "public_web"]);
});

test("no explicitly observable source requirement keeps the legacy generic fallback proof unchanged", () => {
  const req = requirementFor("obj_1", "req_d", ["llm_reasoning", "ordinary_compute"]);
  const obs = req.proofs.filter((p) => p.proofKind === "application_observation");
  assert.equal(obs.length, 1);
  assert.deepEqual(obs[0].params, {});
  assert.equal(obs[0].proofKey, "observation");
});

// ── 5: MAKE executability refuses rather than silently substituting a class ──

test("explicit public_web proof + worker without read_public_web fails executability (never substitutes company_record)", () => {
  const req = requirementFor("obj_1", "req_e", ["public_web"]);
  const result = assessInternalContractExecutability({
    requirement: req,
    capabilityKeys: ["company_records_lookup"], // grants read_company_record only
  });
  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.ok(result.reasons.some((r) => r.includes("public_web")), result.reasons.join("; "));
});

test("explicit public_web proof + worker with read_public_web is executable", () => {
  const req = requirementFor("obj_1", "req_e2", ["public_web"]);
  const result = assessInternalContractExecutability({
    requirement: req,
    capabilityKeys: ["public_information_research"],
  });
  assert.equal(result.ok, true, JSON.stringify(result));
});

// ── 6: WorkContract.sourceProofs preserves explicit source intent ───────────

test("observationProofObligations honors explicit source intent and WorkContract.sourceProofs preserves it", () => {
  const req = requirementFor("obj_1", "req_f", ["public_web"]);
  const obligations = observationProofObligations(req, ["public_information_research"]);
  assert.deepEqual(obligations, [{ sourceClass: "public_web", minDistinctSources: 1 }]);

  const spec = createWorkerSpec(["public_information_research"]);
  const contract = createWorkContract({
    assignment: "do the research",
    idempotencyScope: "scope_source_proof_1",
    worker: spec,
    sourceProofs: obligations,
  });
  assert.deepEqual(contract.sourceProofs, [{ sourceClass: "public_web", minDistinctSources: 1 }]);
  assert.deepEqual(contract.requiredSourceClasses, ["public_web"]);
});

test("both classes required + worker with both capabilities: obligations preserve both, never drop one via round-robin", () => {
  const req = requirementFor("obj_1", "req_g", ["company_records", "public_web"]);
  const obligations = observationProofObligations(req, ["growth_launch_operations"]);
  assert.deepEqual(obligations.map((o) => o.sourceClass).sort(), ["company_record", "public_web"]);
});

test("legacy generic observation proof (no explicit class) still round-robins across whatever the envelope can observe", () => {
  const req = requirementFor("obj_1", "req_h", []);
  const obligations = observationProofObligations(req, ["growth_launch_operations"]);
  assert.equal(obligations.length, 1);
  assert.ok(obligations[0].sourceClass === "company_record" || obligations[0].sourceClass === "public_web");
});

// ── 7/8: missingProofs is class-scoped, not id-existence-scoped ─────────────

test("company_record-only evidence cannot satisfy a public_web-scoped observation proof", () => {
  const proof = {
    proofKey: "observation_public_web",
    description: "d",
    proofKind: "application_observation" as const,
    params: { sourceClass: "public_web", sourceId: "obs_1" },
  };
  const facts = factsWith({
    applicationObservationIds: ["obs_1"],
    applicationObservationSourceClasses: { obs_1: "company_record" },
  });
  const missing = missingProofs([proof], facts, { contractRevision: 1, proofRefs: [] });
  assert.equal(missing.length, 1);
  assert.ok(missing[0].includes("public_web"), missing[0]);
});

test("public_web evidence satisfies the public_web-scoped observation proof", () => {
  const proof = {
    proofKey: "observation_public_web",
    description: "d",
    proofKind: "application_observation" as const,
    params: { sourceClass: "public_web", sourceId: "obs_1" },
  };
  const facts = factsWith({
    applicationObservationIds: ["obs_1"],
    applicationObservationSourceClasses: { obs_1: "public_web" },
  });
  const missing = missingProofs([proof], facts, { contractRevision: 1, proofRefs: [] });
  assert.deepEqual(missing, []);
});

// ── 9: bindExecutedProofParams binds the class-matching observation ─────────

test("bindExecutedProofParams binds the source-class-matching observation, not the first arbitrary one", () => {
  const req = requirementFor("obj_1", "req_i", ["public_web"]);
  const facts = factsWith({
    // alphabetically first id is the WRONG class; a naive observations[0] pick would bind it
    applicationObservationIds: ["obs_aaa_company", "obs_zzz_web"],
    applicationObservationSourceClasses: {
      obs_aaa_company: "company_record",
      obs_zzz_web: "public_web",
    },
  });
  const bound = bindExecutedProofParams(req, facts, at);
  const obs = bound.proofs.find((p) => p.proofKind === "application_observation");
  assert.ok(obs);
  assert.equal(obs!.params.sourceId, "obs_zzz_web");
});

test("bindExecutedProofParams leaves the proof unbound when no observation of the required class exists", () => {
  const req = requirementFor("obj_1", "req_j", ["public_web"]);
  const facts = factsWith({
    applicationObservationIds: ["obs_company_only"],
    applicationObservationSourceClasses: { obs_company_only: "company_record" },
  });
  const bound = bindExecutedProofParams(req, facts, at);
  const obs = bound.proofs.find((p) => p.proofKind === "application_observation");
  assert.ok(obs);
  assert.equal(obs!.params.sourceId, undefined);
});

// ── 10/11: Requirement-level recomputation / evaluateCompletionGate still verifies class after "completion" ─

test("evaluateCompletionGate refuses completion when the bound evidence is the wrong source class (stale/wrong-source evidence insufficient)", () => {
  const contract = contractFor("obj_gate1");
  const req = requirementFor("obj_gate1", "req_gate1", ["public_web"]);
  const wrongClassFacts = factsWith({
    applicationObservationIds: ["obs_company"],
    applicationObservationSourceClasses: { obs_company: "company_record" },
  });
  const bound = bindExecutedProofParams(req, wrongClassFacts, at);
  const claimedSatisfied: Requirement = {
    ...bound,
    state: "satisfied",
    resolution: resolutionFor(1),
  };
  const verdict = evaluateCompletionGate({
    proposal: {
      proposalId: "prop_1",
      objectiveKey: "obj_gate1",
      contractId: contract.contractId,
      contractRevision: 1,
      claimedLevelKey: "goal",
      rationale: "the worker said done",
      proposedAt: at,
    },
    contract,
    currentContractRevision: 1,
    requirements: [claimedSatisfied],
    factsByRequirementKey: new Map([["req_gate1", wrongClassFacts]]),
    unresolvedEffectIds: [],
    unresolvedResourceIds: [],
    at,
  });
  assert.equal(verdict.accepted, false);
  assert.ok(verdict.unmet.some((line) => line.includes("req_gate1")), verdict.unmet.join("; "));
});

test("evaluateCompletionGate accepts once the bound observation is actually of the required class", () => {
  const contract = contractFor("obj_gate2");
  const req = requirementFor("obj_gate2", "req_gate2", ["public_web"]);
  const facts = factsWith({
    applicationObservationIds: ["obs_web"],
    applicationObservationSourceClasses: { obs_web: "public_web" },
  });
  const bound = bindExecutedProofParams(req, facts, at);
  const satisfied: Requirement = { ...bound, state: "satisfied", resolution: resolutionFor(1) };
  const verdict = evaluateCompletionGate({
    proposal: {
      proposalId: "prop_2",
      objectiveKey: "obj_gate2",
      contractId: contract.contractId,
      contractRevision: 1,
      claimedLevelKey: "goal",
      rationale: "done",
      proposedAt: at,
    },
    contract,
    currentContractRevision: 1,
    requirements: [satisfied],
    factsByRequirementKey: new Map([["req_gate2", facts]]),
    unresolvedEffectIds: [],
    unresolvedResourceIds: [],
    at,
  });
  assert.equal(verdict.accepted, true, verdict.accepted ? "" : JSON.stringify(verdict));
});

// ── 12: req_launch_week_plan-shaped reconstruction (Luna Run 1B regression) ──

test("req_launch_week_plan-shaped case: company_record evidence alone can no longer locally satisfy the public-research part", () => {
  const contract = contractFor("obj_luna");
  const req = requirementFor("obj_luna", "req_launch_week_plan", ["company_records", "public_web"]);
  assert.equal(
    req.proofs.filter((p) => p.proofKind === "application_observation").length,
    2,
    "both company_record and public_web observation obligations are attached",
  );

  const companyOnlyFacts = factsWith({
    applicationObservationIds: ["obs_company_record_1"],
    applicationObservationSourceClasses: { obs_company_record_1: "company_record" },
  });
  const bound = bindExecutedProofParams(req, companyOnlyFacts, at);
  const missing = missingProofs(bound.proofs, companyOnlyFacts, { contractRevision: 1, proofRefs: [] });
  assert.ok(missing.length > 0, "the public_web obligation stays unmet on company_record-only evidence");
  assert.ok(missing.some((line) => line.includes("public_web")), missing.join("; "));

  const satisfiedRow: Requirement = { ...bound, state: "satisfied", resolution: resolutionFor(1) };
  const verdict = evaluateCompletionGate({
    proposal: {
      proposalId: "prop_luna",
      objectiveKey: "obj_luna",
      contractId: contract.contractId,
      contractRevision: 1,
      claimedLevelKey: "goal",
      rationale: "trust me, it's delivered",
      proposedAt: at,
    },
    contract,
    currentContractRevision: 1,
    requirements: [satisfiedRow],
    factsByRequirementKey: new Map([["req_launch_week_plan", companyOnlyFacts]]),
    unresolvedEffectIds: [],
    unresolvedResourceIds: [],
    at,
  });
  assert.equal(
    verdict.accepted,
    false,
    "the previously-DELIVERED requirement can no longer locally satisfy on company_record evidence alone",
  );
});
