// CP1 — Requirement satisfaction semantics + independent completion gate.
//
// The load-bearing assertions here are the REFUSALS: rejection, decisions,
// run-finishes and stale-revision proofs must never satisfy or complete.
import test from "node:test";
import assert from "node:assert/strict";
import {
  attemptRequirementSatisfaction,
  canNeverSatisfy,
  transitionRequirementState,
} from "../lib/management/requirements";
import { evaluateCompletionGate } from "../lib/management/completion";
import type { Requirement, OutcomeContract } from "../lib/management/types";
import { CP2_REQUIREMENT_FIELDS } from "./helpers/cp2Requirement";
import type { CompletionGateInput } from "../lib/management/completion";

const at = 1700000000000;

function requirement(overrides: Partial<Requirement> = {}): Requirement {
  return {
    requirementKey: "page_live",
    objectiveKey: "obj_launch",
    contractId: "contract_launch",
    contractRevision: 1,
    priority: "required",
    title: "Landing page is live",
    mustBeTrue: "page reachable and form submits",
    scope: "public URL",
    proofs: [
      {
        proofKey: "artifact_change",
        description: "launch_page advanced",
        proofKind: "company_artifact_version",
        params: { artifactKey: "launch_page", minVersion: 2 },
      },
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
    ...CP2_REQUIREMENT_FIELDS,
    ...overrides,
  };
}

const fullFacts = {
  artifactVersions: { launch_page: 2 },
  applicationObservationIds: ["obs_page_check"],
  verifiedIntentIds: ["intent_domain_buy"],
  founderConfirmationRefs: ["fc_domain"],
};

function attempt(event: Parameters<typeof attemptRequirementSatisfaction>[0]["event"], overrides = {}) {
  return attemptRequirementSatisfaction({
    requirement: requirement(),
    event,
    facts: fullFacts,
    resolutionId: "res_1",
    acceptedDecisionId: "dec_1",
    acceptedAssignmentId: null,
    acceptedIntentId: null,
    proofRefs: ["ev_artifact_v2", "obs_page_check"],
    currentContractRevision: 1,
    at,
    ...overrides,
  });
}

// ── The four never-satisfies events ──────────────────────────────────────────

test("provider candidate rejection, strategy authorization, buy-proposal rejection and run-finish can NEVER satisfy", () => {
  const events = [
    { kind: "candidate_rejected", offeringId: "off_x" },
    { kind: "strategy_authorized", strategy: "MAKE", decisionId: "dec_1" },
    { kind: "buy_proposal_rejected", reason: "price too high" },
    { kind: "assignment_run_finished", assignmentId: "asg_1", runStopped: true },
  ] as const;
  for (const event of events) {
    assert.equal(canNeverSatisfy(event), true, `${event.kind} must be never-satisfies`);
    const result = attempt(event);
    assert.equal(result.satisfied, false);
    if (result.satisfied) continue;
    assert.equal(result.requirement.state, "active", `${event.kind} must leave state untouched`);
    assert.ok(result.reason.includes(event.kind));
  }
});

test("a verified event with all current proof DOES satisfy, and carries a revision-bound resolution", () => {
  const result = attempt({ kind: "artifact_changed", artifactKey: "launch_page", version: 2, contractRevision: 1 });
  assert.equal(result.satisfied, true);
  if (!result.satisfied) return;
  assert.equal(result.requirement.state, "satisfied");
  assert.equal(result.resolution.contractRevision, 1);
  assert.deepEqual(result.resolution.proofRefs, ["ev_artifact_v2", "obs_page_check"]);
});

test("stale contract revision refuses satisfaction even when every proof is present", () => {
  const result = attempt(
    { kind: "artifact_changed", artifactKey: "launch_page", version: 2, contractRevision: 1 },
    { currentContractRevision: 2 },
  );
  assert.equal(result.satisfied, false);
  if (result.satisfied) return;
  assert.ok(result.reason.includes("stale contract revision"));
  assert.equal(result.requirement.state, "active");
});

test("satisfaction requires EVERY declared proof — an artifact bump without an observation is refused", () => {
  const result = attemptRequirementSatisfaction({
    requirement: requirement(),
    event: { kind: "artifact_changed", artifactKey: "launch_page", version: 2, contractRevision: 1 },
    facts: { ...fullFacts, applicationObservationIds: [] },
    resolutionId: "res_1",
    acceptedDecisionId: null,
    acceptedAssignmentId: null,
    acceptedIntentId: null,
    proofRefs: [],
    currentContractRevision: 1,
    at,
  });
  assert.equal(result.satisfied, false);
  if (result.satisfied) return;
  assert.ok(result.reason.includes("required proof missing"));
  assert.ok(result.reason.includes("observation"));
});

test("artifact below the declared minVersion cannot satisfy", () => {
  const result = attemptRequirementSatisfaction({
    requirement: requirement(),
    event: { kind: "artifact_changed", artifactKey: "launch_page", version: 1, contractRevision: 1 },
    facts: { ...fullFacts, artifactVersions: { launch_page: 1 } },
    resolutionId: "res_1",
    acceptedDecisionId: null,
    acceptedAssignmentId: null,
    acceptedIntentId: null,
    proofRefs: [],
    currentContractRevision: 1,
    at,
  });
  assert.equal(result.satisfied, false);
  if (result.satisfied) return;
  assert.ok(result.reason.includes("v1 < required v2"));
});

test("satisfying twice is an idempotent no-op, not a second resolution", () => {
  const done = requirement({ state: "satisfied", resolution: { resolutionId: "res_0", acceptedDecisionId: null, acceptedAssignmentId: null, acceptedIntentId: null, proofRefs: [], contractRevision: 1, acceptedAt: at } });
  const result = attempt(
    { kind: "artifact_changed", artifactKey: "launch_page", version: 3, contractRevision: 1 },
    { requirement: done },
  );
  assert.equal(result.satisfied, false);
  if (result.satisfied) return;
  assert.ok(result.reason.includes("already satisfied"));
});

test("external_result_verified satisfies only when the intent id is actually verified", () => {
  const buyReq = requirement({
    proofs: [
      { proofKey: "external_result", description: "domain acquired", proofKind: "verified_external_result", params: { intentId: "intent_domain_buy" } },
    ],
    strategy: "BUY",
  });
  const ok = attemptRequirementSatisfaction({
    requirement: buyReq,
    event: { kind: "external_result_verified", intentId: "intent_domain_buy", contractRevision: 1 },
    facts: fullFacts,
    resolutionId: "res_2",
    acceptedDecisionId: "dec_2",
    acceptedAssignmentId: null,
    acceptedIntentId: "intent_domain_buy",
    proofRefs: ["intent_domain_buy"],
    currentContractRevision: 1,
    at,
  });
  assert.equal(ok.satisfied, true);

  const lying = attemptRequirementSatisfaction({
    requirement: buyReq,
    event: { kind: "external_result_verified", intentId: "intent_domain_buy", contractRevision: 1 },
    facts: { ...fullFacts, verifiedIntentIds: [] }, // application never verified it
    resolutionId: "res_3",
    acceptedDecisionId: "dec_2",
    acceptedAssignmentId: null,
    acceptedIntentId: "intent_domain_buy",
    proofRefs: [],
    currentContractRevision: 1,
    at,
  });
  assert.equal(lying.satisfied, false);
  if (lying.satisfied) return;
  assert.ok(lying.reason.includes("not independently verified"));
});

// ── Transitions ──────────────────────────────────────────────────────────────

test("waiver requires an authorized founder reason; self-waiver is refused", () => {
  const selfWaived = transitionRequirementState(requirement(), "waived", at);
  assert.equal(selfWaived.ok, false);
  if (selfWaived.ok) return;
  assert.ok(selfWaived.reason.includes("authorized reason"));

  const waived = transitionRequirementState(requirement(), "waived", at, {
    authorizedWaiverReason: "founder: skip the form, emails via DM are fine",
  });
  assert.equal(waived.ok, true);
  if (!waived.ok) return;
  assert.equal(waived.requirement.state, "waived");
  assert.equal(waived.requirement.waiver?.authorizedBy, "founder");
});

test("blocked requires a reason; superseded is terminal", () => {
  assert.equal(transitionRequirementState(requirement(), "blocked", at).ok, false);
  const blocked = transitionRequirementState(requirement(), "blocked", at, { blockedReason: "registry down" });
  assert.equal(blocked.ok, true);
  const dead = requirement({ state: "superseded" });
  assert.equal(transitionRequirementState(dead, "active", at).ok, false);
});

// ── Completion gate ──────────────────────────────────────────────────────────

const contract: OutcomeContract = {
  contractId: "contract_launch",
  objectiveKey: "obj_launch",
  revision: 1,
  intent: "ship landing page",
  levels: [
    { levelKey: "page_draft", order: 1, statement: "draft", label: "Draft" },
    { levelKey: "page_live", order: 2, statement: "live", label: "Live" },
    { levelKey: "first_signup", order: 3, statement: "signup", label: "Traction" },
  ],
  minimumCompletionBar: "page_live",
  ambiguities: [],
  createdBy: "somebody",
  createdFromRequestId: "req_1",
  createdAt: at,
};

const satisfiedReq = requirement({
  state: "satisfied",
  resolution: { resolutionId: "res_1", acceptedDecisionId: "dec_1", acceptedAssignmentId: "asg_1", acceptedIntentId: null, proofRefs: ["ev_1"], contractRevision: 1, acceptedAt: at },
});
const supportingPending = requirement({
  requirementKey: "seo_polish",
  title: "SEO polish",
  priority: "supporting",
  state: "active",
});

function gate(overrides: Partial<CompletionGateInput>): CompletionGateInput {
  return {
    proposal: {
      proposalId: "prop_1",
      objectiveKey: "obj_launch",
      contractId: "contract_launch",
      contractRevision: 1,
      claimedLevelKey: "page_live",
      rationale: "page is live",
      proposedAt: at,
    },
    contract,
    currentContractRevision: 1,
    requirements: [
      satisfiedReq,
      supportingPending,
      requirement({ requirementKey: "level_tomorrow", priority: "supporting", state: "superseded" }),
    ],
    // R3 A5 — the gate input is FRESH FACTS per requirement, not "proof keys
    // someone says were satisfied". These are the same application facts the
    // satisfaction kernel saw.
    factsByRequirementKey: new Map([[satisfiedReq.requirementKey, fullFacts]]),
    unresolvedEffectIds: [],
    unresolvedResourceIds: [],
    at,
    ...overrides,
  };
}

test("gate accepts at the bar and DISCLOSES pending supporting work and above-bar levels", () => {
  const verdict = evaluateCompletionGate(gate({}));
  assert.equal(verdict.accepted, true);
  if (!verdict.accepted) return;
  assert.deepEqual(verdict.satisfiedRequired, ["page_live"]);
  assert.deepEqual(verdict.disclosedPendingSupporting, ["seo_polish: SEO polish"]);
  assert.deepEqual(verdict.levelsAboveBarPending, ["first_signup (Traction)"]);
});

test("completion claimed below the minimum bar is rejected with the level named", () => {
  const verdict = evaluateCompletionGate(
    gate({ proposal: { ...gate({}).proposal, claimedLevelKey: "page_draft" } }),
  );
  assert.equal(verdict.accepted, false);
  if (verdict.accepted) return;
  assert.equal(verdict.objectiveState, "executing");
  assert.ok(verdict.unmet.some((u) => u.includes("below the minimum completion bar")));
});

test("completion proposal against a stale revision is rejected", () => {
  const verdict = evaluateCompletionGate(
    gate({ currentContractRevision: 2, proposal: { ...gate({}).proposal, contractRevision: 1 } }),
  );
  assert.equal(verdict.accepted, false);
  if (verdict.accepted) return;
  assert.ok(verdict.unmet.some((u) => u.includes("current revision is 2")));
});

test("an open required requirement blocks completion even if the run 'finished'", () => {
  const verdict = evaluateCompletionGate(
    gate({ requirements: [requirement(), supportingPending] }),
  );
  assert.equal(verdict.accepted, false);
  if (verdict.accepted) return;
  assert.ok(verdict.unmet.some((u) => u.includes("required requirement page_live is active")));
});

test("a blocked required requirement routes the rejection to 'blocked', not 'executing'", () => {
  const verdict = evaluateCompletionGate(
    gate({
      requirements: [requirement({ state: "blocked", blockedReason: "provider registry unreachable" }), supportingPending],
    }),
  );
  assert.equal(verdict.accepted, false);
  if (verdict.accepted) return;
  assert.equal(verdict.objectiveState, "blocked");
  assert.ok(verdict.unmet.some((u) => u.includes("provider registry unreachable")));
});

test("gate refuses when a 'satisfied' requirement's proof is stale or its resolution is from an older revision", () => {
  const staleProof = evaluateCompletionGate(
    // The application verified the artifact bump but NO observation row —
    // recompute must fail the `observation` obligation even though the row
    // persists as "satisfied".
    gate({ factsByRequirementKey: new Map([[satisfiedReq.requirementKey, { ...fullFacts, applicationObservationIds: [] }]]) }),
  );
  assert.equal(staleProof.accepted, false);
  if (staleProof.accepted) return;
  assert.ok(staleProof.unmet.some((u) => u.includes("proof observation") && u.includes("no application observation")));

  const oldResolution = evaluateCompletionGate(
    gate({
      requirements: [
        requirement({
          state: "satisfied",
          resolution: { ...satisfiedReq.resolution!, contractRevision: 0 },
        }),
        supportingPending,
      ],
    }),
  );
  assert.equal(oldResolution.accepted, false);
  if (oldResolution.accepted) return;
  assert.ok(oldResolution.unmet.some((u) => u.includes("not the current 1")));
});

test("unresolved mandatory external effect/resource blocks completion", () => {
  const verdict = evaluateCompletionGate(
    gate({ unresolvedEffectIds: ["effect_domain_transfer"] }),
  );
  assert.equal(verdict.accepted, false);
  if (verdict.accepted) return;
  assert.ok(verdict.unmet.some((u) => u.includes("effect_domain_transfer")));
});

test("contract with an unresolvable bar routes to recovery_required, never an accidental accept", () => {
  const verdict = evaluateCompletionGate(
    gate({ contract: { ...contract, minimumCompletionBar: "ghost_level" } }),
  );
  assert.equal(verdict.accepted, false);
  if (verdict.accepted) return;
  assert.equal(verdict.objectiveState, "recovery_required");
});

test("waived required requirement completes without disclosure noise", () => {
  const waived = requirement({
    state: "waived",
    waiver: { reason: "founder authorized", authorizedBy: "founder", at },
  });
  const verdict = evaluateCompletionGate(
    gate({ requirements: [waived, requirement({ requirementKey: "other", state: "satisfied", resolution: satisfiedReq.resolution }), supportingPending], factsByRequirementKey: new Map([["other", fullFacts]]) }),
  );
  assert.equal(verdict.accepted, true);
  if (!verdict.accepted) return;
  assert.ok(!verdict.disclosedPendingSupporting.some((s) => s.startsWith("page_live")));
});
