// CP1 — Outcome Contract construction + untrusted proposal parsing.
import test from "node:test";
import assert from "node:assert/strict";
import {
  buildOutcomeContract,
  buildRequirement,
  supersedeForRevision,
  unresolvedMaterialAmbiguity,
} from "../lib/management/contract";
import {
  parseManagerialRecommendation,
  parseOutcomeContractProposal,
  parseRequirementProposals,
} from "../lib/management/proposals";
import type { ParsedOutcomeContract } from "../lib/management/proposals";
import { CP2_REQUIREMENT_FIELDS, cp2ParsedRequirement } from "./helpers/cp2Requirement";

const at = 1700000000000;

const parsed: ParsedOutcomeContract = {
  intent: "ship a landing page that collects waitlist emails",
  levels: [
    { levelKey: "page_draft", order: 1, statement: "page exists in draft", label: "Draft" },
    { levelKey: "page_live", order: 2, statement: "page is live and form works", label: "Live" },
    { levelKey: "first_signup", order: 3, statement: "a real signup recorded", label: "Traction" },
  ],
  minimumCompletionBar: "page_live",
  ambiguities: [
    {
      question: "does the founder own the domain already?",
      materiality: "material",
      resolution: "assume founder must buy it",
      resolvedBy: "founder",
      requiresFounderApproval: true,
    },
  ],
};

function buildContract(overrides: Partial<ParsedOutcomeContract> = {}) {
  return buildOutcomeContract({
    objectiveKey: "obj_launch",
    contractId: "contract_launch",
    revision: 1,
    parsed: { ...parsed, ...overrides },
    requestId: "req_1",
    founderResolvedQuestions: [],
    at,
  });
}

test("contract builds with levels renumbered by position and bar preserved", () => {
  const result = buildContract();
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.deepEqual(
    result.contract.levels.map((l) => l.order),
    [1, 2, 3],
  );
  assert.equal(result.contract.minimumCompletionBar, "page_live");
  assert.equal(result.contract.createdBy, "somebody");
  assert.equal(result.contract.createdFromRequestId, "req_1");
});

test("founder-resolved question clears the approval flag; others keep it", () => {
  const resolved = buildOutcomeContract({
    objectiveKey: "obj_launch",
    contractId: "contract_launch",
    revision: 1,
    parsed,
    requestId: "req_1",
    founderResolvedQuestions: [parsed.ambiguities[0].question],
    at,
  });
  assert.equal(resolved.ok, true);
  if (!resolved.ok) return;
  assert.equal(resolved.contract.ambiguities[0].requiresFounderApproval, false);
  assert.equal(unresolvedMaterialAmbiguity(resolved.contract), null);

  const unresolved = buildContract();
  assert.equal(unresolved.ok, true);
  if (!unresolved.ok) return;
  assert.equal(unresolvedMaterialAmbiguity(unresolved.contract), parsed.ambiguities[0].question);
});

test("proposal with bar referencing an undeclared level is refused", () => {
  const raw = {
    intent: "x",
    levels: [{ levelKey: "lvl_a", statement: "a", label: "A" }],
    minimumCompletionBar: "nonexistent_level",
  };
  const result = parseOutcomeContractProposal(raw);
  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.ok(result.errors.some((e) => e.includes("not one of the proposed levels")));
});

test("proposal declaring no levels or no bar is refused outright", () => {
  assert.equal(parseOutcomeContractProposal({ intent: "x", levels: [], minimumCompletionBar: "lvl_a" }).ok, false);
  const noBar = parseOutcomeContractProposal({
    intent: "x",
    levels: [{ levelKey: "lvl_a", statement: "a", label: "A" }],
  });
  assert.equal(noBar.ok, false);
});

test("material ambiguity ALWAYS requires founder approval regardless of model claim", () => {
  const result = parseOutcomeContractProposal({
    intent: "x",
    levels: [{ levelKey: "lvl_a", statement: "a", label: "A" }],
    minimumCompletionBar: "lvl_a",
    ambiguities: [
      {
        question: "spend real money?",
        materiality: "material",
        resolution: "no need to ask, decided yes",
        requiresFounderApproval: false, // model trying to waive itself
      },
    ],
  });
  assert.equal(result.ok, true);
  if (!result.ok) return;
  const ambiguity = result.value.ambiguities[0];
  assert.equal(ambiguity.requiresFounderApproval, true);
  assert.equal(ambiguity.resolvedBy, "founder");
});

test("requirement proposals: unclear priority fails safe to required; all-supporting is refused", () => {
  const sloppy = parseRequirementProposals([
    { requirementKey: "page_live", mustBeTrue: "page is live", priority: "kinda important" },
    { requirementKey: "seo_polish", mustBeTrue: "meta tags exist", priority: "supporting" },
  ]);
  assert.equal(sloppy.ok, true);
  if (!sloppy.ok) return;
  assert.equal(sloppy.value[0].priority, "required");
  assert.equal(sloppy.value[1].priority, "supporting");

  const allSupporting = parseRequirementProposals([
    { requirementKey: "nice_to_have", mustBeTrue: "x", priority: "supporting" },
  ]);
  assert.equal(allSupporting.ok, false);
  if (allSupporting.ok) return;
  assert.ok(allSupporting.errors.some((e) => e.includes("no required requirement")));
});

test("recommendation naming a hallucinated option is a typed refusal, not a crash", () => {
  const result = parseManagerialRecommendation(
    {
      requirementKey: "page_live",
      contractRevision: 1,
      selectedOptionId: "opt_totally_made_up",
      rationale: "cheapest",
    },
    { requirementKey: "page_live", contractRevision: 1, eligibleOptionIds: ["opt_aaa", "opt_bbb"] },
  );
  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.ok(result.errors.some((e) => e.includes("not an eligible grounded option")));
});

test("recommendation with unknown alternative keeps valid fields but nulls the invented one", () => {
  const result = parseManagerialRecommendation(
    {
      requirementKey: "page_live",
      contractRevision: 1,
      selectedOptionId: "opt_aaa",
      strongestAlternativeId: "opt_fantasy",
      rationale: "internal worker can do it now",
    },
    { requirementKey: "page_live", contractRevision: 1, eligibleOptionIds: ["opt_aaa", "opt_bbb"] },
  );
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.value.selectedOptionId, "opt_aaa");
  assert.equal(result.value.strongestAlternativeId, null);
});

// ── Requirement construction: proof attachment is application-owned ──────────

const baseProposed = cp2ParsedRequirement({
  requirementKey: "page_live",
  priority: "required",
  title: "Landing page is live",
  mustBeTrue: "the page is reachable and the form submits",
  scope: "public URL only",
});

function contract1() {
  const result = buildContract();
  assert.equal(result.ok, true);
  if (!result.ok) throw new Error("fixture contract failed");
  return result.contract;
}

test("MAKE requirement gets artifact + observation proofs; BUY gets verified external result only", () => {
  const contract = contract1();
  const make = buildRequirement(
    { objectiveKey: "obj_launch", contract, proposed: baseProposed, artifactKeyForInternalProof: "launch_page", at },
    "MAKE",
  );
  assert.ok("requirement" in make);
  if (!("requirement" in make)) return;
  const makeKinds = make.requirement.proofs.map((p) => p.proofKind);
  assert.deepEqual(makeKinds.sort(), ["application_observation", "company_artifact_version"]);

  const buy = buildRequirement(
    { objectiveKey: "obj_launch", contract, proposed: baseProposed, artifactKeyForInternalProof: null, at },
    "BUY",
  );
  assert.ok("requirement" in buy);
  if (!("requirement" in buy)) return;
  assert.deepEqual(buy.requirement.proofs.map((p) => p.proofKind), ["verified_external_result"]);
  // A BUY may not sneak an artifact proof in — nothing internal mutates.
  assert.ok(!buy.requirement.proofs.some((p) => p.proofKind === "company_artifact_version"));
});

test("WAIT/BLOCK attach no proof, so a requirement stuck on them cannot be 'satisfied' by work", () => {
  const contract = contract1();
  const wait = buildRequirement(
    { objectiveKey: "obj_launch", contract, proposed: baseProposed, artifactKeyForInternalProof: null, at },
    "WAIT",
  );
  assert.ok("errors" in wait);
  if (!("errors" in wait)) return;
  assert.ok(wait.errors.some((e) => e.includes("no attachable governed proof method")));
});

test("unknown strategy is refused", () => {
  const contract = contract1();
  const bad = buildRequirement(
    { objectiveKey: "obj_launch", contract, proposed: baseProposed, artifactKeyForInternalProof: null, at },
    "DO_IT_MYSELF" as never,
  );
  assert.ok("errors" in bad);
  if (!("errors" in bad)) return;
  assert.ok(bad.errors.some((e) => e.includes("unknown strategy")));
});

test("revision bump supersedes unresolved requirements but preserves satisfied/waived", () => {
  const contract = contract1();
  const mk = (key: string, state: "active" | "satisfied" | "waived" | "blocked") => ({
    requirementKey: key,
    objectiveKey: "obj_launch",
    contractId: contract.contractId,
    contractRevision: 1,
    priority: "required" as const,
    title: key,
    mustBeTrue: "x",
    scope: "x",
    ...CP2_REQUIREMENT_FIELDS,
    proofs: [],
    state,
    strategy: null,
    resolution: null,
    blockedReason: state === "blocked" ? "waiting on registry" : null,
    waiver: null,
    revision: 1,
    createdAt: at,
    updatedAt: at,
  });
  const next = supersedeForRevision(
    [mk("r_active", "active"), mk("r_sat", "satisfied"), mk("r_waived", "waived"), mk("r_block", "blocked")],
    at + 1,
  );
  assert.deepEqual(
    next.map((r) => [r.requirementKey, r.state]),
    [
      ["r_active", "superseded"],
      ["r_sat", "satisfied"],
      ["r_waived", "waived"],
      ["r_block", "superseded"],
    ],
  );
});
