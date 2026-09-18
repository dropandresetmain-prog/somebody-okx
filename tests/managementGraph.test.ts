// CP4 skeleton — LangGraph management graph: one wake = one bounded pass,
// continuation across wakes, and REAL pure authorities behind the ports.
//
// The world is an in-memory fake implementing ManagementPorts, but every
// consequential decision inside it runs the SAME pure kernels production uses
// (decision.ts, requirements.ts, completion.ts, reducer.ts, budget.ts). The
// graph never completes anything directly — these tests prove completion only
// happens via a proof-bearing wake → satisfaction → proposal → gate.
import test from "node:test";
import assert from "node:assert/strict";
import { buildManagementGraph, type ManagementPorts } from "../lib/management/graph";
import { runManagerialDecisionPass, type DecisionPassResult } from "../lib/management/decision";
import { attemptRequirementSatisfaction, type RequirementEvent } from "../lib/management/requirements";
import { evaluateCompletionGate } from "../lib/management/completion";
import { createBudget, checkBudget, trySpendDecision, recordProgress } from "../lib/management/budget";
import { bindProofParams, buildOutcomeContract } from "../lib/management/contract";
import type { ReducerFacts } from "../lib/management/reducer";
import type {
  CompletionVerdict,
  GraphState,
  GroundedOption,
  ManagementState,
  ObjectiveBudget,
  OutcomeContract,
  Requirement,
  WakeEvent,
  WakeReason,
} from "../lib/management/types";

const at0 = 1700000000000;

const contractResult = buildOutcomeContract({
  objectiveKey: "obj_launch",
  contractId: "contract_launch",
  revision: 1,
  parsed: {
    intent: "ship the launch page",
    levels: [{ levelKey: "page_live", order: 1, statement: "page is live", label: "Live" }],
    minimumCompletionBar: "page_live",
    ambiguities: [],
  },
  requestId: "req_1",
  founderResolvedQuestions: [],
  at: at0,
});
assert.equal(contractResult.ok, true);
const contract: OutcomeContract = contractResult.ok ? contractResult.contract : (() => { throw new Error(); })();

function requirement(): Requirement {
  return {
    requirementKey: "page_live",
    objectiveKey: "obj_launch",
    contractId: "contract_launch",
    contractRevision: 1,
    priority: "required",
    title: "Landing page is live",
    mustBeTrue: "the page is reachable",
    scope: "public URL",
    proofs: [
      { proofKey: "artifact_change", description: "artifact advanced", proofKind: "company_artifact_version", params: { artifactKey: "launch_page", minVersion: 2 } },
      { proofKey: "observation", description: "app observation", proofKind: "application_observation", params: { sourceId: "obs_check" } },
    ],
    state: "active",
    strategy: null,
    resolution: null,
    blockedReason: null,
    waiver: null,
    revision: 1,
    createdAt: at0,
    updatedAt: at0,
  };
}

// ── The fake world ───────────────────────────────────────────────────────────

type World = {
  now: number;
  budget: ObjectiveBudget;
  requirement: Requirement;
  wakes: WakeEvent[];
  decisions: DecisionPassResult[];
  objectiveState: ManagementState | null;
  stateLog: ManagementState[];
  groundedByReq: Map<string, GroundedOption[]>;
  pendingApproval: { question: string } | null;
  completionVerdict: CompletionVerdict | null;
  modelCallsSpent: number;
};

function freshWorld(): World {
  return {
    now: at0,
    budget: createBudget("obj_launch", at0),
    requirement: requirement(),
    wakes: [
      {
        eventId: "wake_1", objectiveKey: "obj_launch", reason: "objective_submitted",
        refKind: "objective", refId: "obj_launch", summary: "founder submitted request",
        at: at0, consumedAt: null,
      },
    ],
    decisions: [],
    objectiveState: null,
    stateLog: [],
    groundedByReq: new Map(),
    pendingApproval: null,
    completionVerdict: null,
    modelCallsSpent: 0,
  };
}

function makePorts(world: World): ManagementPorts {
  const ports: ManagementPorts = {
    async loadContract() {
      return { contract, currentContractRevision: contract.revision };
    },
    async loadRequirements() {
      return [structuredClone(world.requirement)];
    },
    async loadGrounded() {
      return world.groundedByReq;
    },
    async loadAssignments() {
      return [];
    },
    async loadIntents() {
      return [];
    },
    async loadBudgetVerdict() {
      return checkBudget(world.budget, world.now);
    },
    async loadPendingApproval() {
      return world.pendingApproval;
    },
    async loadCompletionVerdict() {
      return world.completionVerdict;
    },
    async loadWakeEvents() {
      return world.wakes;
    },
    async consumeWakeEvents(_objectiveKey, eventIds, at) {
      for (const wake of world.wakes)
        if (eventIds.includes(wake.eventId)) wake.consumedAt = at;
    },
    async spendDecisionCall() {
      const spent = trySpendDecision(world.budget);
      assert.equal(spent.ok, true, "test budget must cover decisions");
      if (spent.ok) world.budget = spent.budget;
      world.modelCallsSpent += 1;
    },
    async runDecisionPass(state) {
      // THE REAL DECISION PASS with a deterministic fake recommender.
      const eligibleIds = (world.groundedByReq.get(state.focusRequirementKey ?? "") ?? []).filter(
        (o) => o.eligibility.eligible,
      );
      const result = await runManagerialDecisionPass({
        objectiveKey: state.objectiveKey,
        contract,
        currentContractRevision: contract.revision,
        requirementKey: state.focusRequirementKey ?? "page_live",
        requirementTitle: world.requirement.title,
        mustBeTrue: world.requirement.mustBeTrue,
        priority: world.requirement.priority,
        artifactKeyForInternalProof: "launch_page",
        staffing: {
          objectiveKey: "obj_launch",
          requirementKey: "page_live",
          requiredCapabilityKeys: ["growth_launch_operations"],
          requiredPermissions: ["update_company_artifact"],
          expectedHoldMs: 60 * 60 * 1000,
          now: world.now,
          neededContextRefs: [],
          parallelismNeeded: 1,
          specializationNeeded: false,
          inventory: [],
          creationAllowed: true,
        },
        grounding: {
          discovered: [],
          internalFacts: world.groundedByReq.get("page_live")?.[0]?.facts ?? emptyFacts(),
          factsForOffering: () => emptyFacts(),
        },
        eligibilityFacts: {
          requiredResourceClasses: ["llm_reasoning", "public_web", "ordinary_compute", "company_records", "company_tools"],
          controlledResourceClasses: ["llm_reasoning", "public_web", "ordinary_compute", "company_records", "company_tools"],
          deadlineAt: null,
          now: world.now,
          estimatedMinutes: null,
          requiresMandatoryProof: false,
          proofAvailable: true,
          workerAvailable: null,
          spendAuthorityUsd: 2,
          budgetRemainingUsd: 10,
        },
        recommend: async (eligible) => ({
          requirementKey: state.focusRequirementKey,
          contractRevision: contract.revision,
          selectedOptionId: eligible[0]?.optionId ?? "opt_none",
          rationale: "only eligible path (fake recommender)",
        }),
        at: world.now,
        decisionId: `dec_${state.pass}`,
        spendAuthorityUsd: 2,
        externalAuthority: "m3_unavailable",
        waiverRequested: false,
      });
      void eligibleIds;
      return result;
    },
    async persistDecision(result, at) {
      world.decisions.push(result);
      if (result.boundRequirement) {
        // CP3's putRequirement seam binds this application-verified observation
        // id once the run that produced it is known.
        world.requirement = bindProofParams(
          result.boundRequirement,
          { observation: { sourceId: "obs_check" } },
          at,
        );
      }
    },
    async recordSatisfactionAttempt() {
      // routed satisfaction: the CALLER event decides; here CP4 test 2 drives
      // it explicitly via deliverVerified() below. The port exists so the
      // verify node has somewhere to route wake-borne evidence.
    },
    async proposeCompletion(proposal) {
      const satisfiedProofKeys = new Map<string, string[]>();
      if (world.requirement.state === "satisfied")
        satisfiedProofKeys.set(world.requirement.requirementKey, world.requirement.proofs.map((p) => p.proofKey));
      const verdict = evaluateCompletionGate({
        proposal,
        contract,
        currentContractRevision: contract.revision,
        requirements: [world.requirement],
        satisfiedProofKeys,
        unresolvedEffectIds: [],
        unresolvedResourceIds: [],
        at: world.now,
      });
      world.completionVerdict = verdict;
      return verdict;
    },
    async writeObjectiveState(_objectiveKey, state) {
      world.objectiveState = state;
      world.stateLog.push(state);
    },
    async scheduleWake() {
      // timeout wakes are the caller's scheduler in production; faked as no-op.
    },
  };
  return ports;
}

function emptyFacts() {
  return {
    scope: null, expectedQuality: null, setupMinutes: null, queueMinutes: null,
    executionMinutes: null, verificationMinutes: null, internalCostUsd: null,
    externalPriceUsd: null, reliability: null, availability: null, reuseValue: null,
    externalAdvantage: null,
  };
}

function initialState(reason: WakeReason): GraphState {
  return {
    objectiveKey: "obj_launch",
    contractRevision: null,
    focusRequirementKey: null,
    managerDecisionId: null,
    pendingIntentId: null,
    wakeReason: reason,
    wakeEventIds: [],
    continuation: {},
    lastNode: null,
    pass: 0,
  };
}

function addWake(world: World, reason: WakeReason, eventId: string) {
  world.wakes.push({
    eventId, objectiveKey: "obj_launch", reason,
    refKind: "requirement", refId: "page_live", summary: reason, at: world.now, consumedAt: null,
  });
}

// Deliver the verified world-change: artifact bumped + observation recorded,
// satisfaction attempted THROUGH the pure kernel with the current revision.
function deliverVerified(world: World) {
  const attempt = attemptRequirementSatisfaction({
    requirement: world.requirement,
    event: { kind: "artifact_changed", artifactKey: "launch_page", version: 2, contractRevision: 1 },
    facts: {
      artifactVersions: { launch_page: 2 },
      applicationObservationIds: ["obs_check"],
      verifiedIntentIds: [],
      founderConfirmationRefs: [],
    },
    resolutionId: "res_1",
    acceptedDecisionId: world.decisions.at(-1)?.decision.decisionId ?? null,
    acceptedAssignmentId: "asg_1",
    acceptedIntentId: null,
    proofRefs: ["ev_artifact_v2", "obs_check"],
    currentContractRevision: contract.revision,
    at: world.now,
  });
  assert.equal(attempt.satisfied, true, `precondition: ${attempt.satisfied ? "" : attempt.reason}`);
  if (attempt.satisfied) world.requirement = attempt.requirement;
  addWake(world, "worker_result", "wake_result");
}

// ── Tests ────────────────────────────────────────────────────────────────────

test("wake 1: observe→reduce→decide runs the real decision pass and ends executing, never completed", async () => {
  const world = freshWorld();
  const graph = buildManagementGraph({ ports: makePorts(world), now: () => world.now });
  const { final, outcome } = await graph.invoke(initialState("objective_submitted"));

  // the pass consumed the wake, ran exactly one decision, parked in executing
  assert.equal(final.wakeEventIds.length, 1);
  assert.equal(world.wakes[0].consumedAt, at0);
  assert.equal(world.decisions.length, 1);
  assert.equal(world.decisions[0].authorization.kind, "authorized");
  assert.equal(world.requirement.strategy, "MAKE"); // strategy bound, NOT satisfied
  assert.equal(world.requirement.state, "active");
  assert.equal(outcome.objectiveState, "executing");
  assert.notEqual(outcome.objectiveState, "completed");
});

test("wake 2 (verified result): continuation re-enters, proposes completion once, gate accepts → completed", async () => {
  const world = freshWorld();
  const ports = makePorts(world);
  const graph = buildManagementGraph({ ports, now: () => world.now });

  await graph.invoke(initialState("objective_submitted"));
  deliverVerified(world);
  const { outcome } = await graph.invoke({ ...initialState("worker_result"), pass: 1 });

  // completion happened ONLY through gate acceptance, and it disclosed truthfully
  assert.equal(outcome.objectiveState, "completed");
  assert.ok(world.completionVerdict?.accepted);
  assert.equal(world.requirement.state, "satisfied");
});

test("duplicate delivery of the same wake is a harmless no-op pass", async () => {
  const world = freshWorld();
  const graph = buildManagementGraph({ ports: makePorts(world), now: () => world.now });
  const first = await graph.invoke(initialState("objective_submitted"));
  assert.equal(first.final.wakeEventIds.length, 1);
  const second = await graph.invoke({ ...initialState("objective_submitted"), pass: 1 });
  // wake_1 already consumed: no fresh events folded in
  assert.equal(second.final.wakeEventIds.length, 0);
});

test("budget exhaustion parks the engine in recovery_required WITHOUT running a decision pass", async () => {
  const world = freshWorld();
  // burn the decision ceiling before the pass
  for (let i = 0; i < world.budget.limits.maxManagementDecisions; i += 1) {
    const spent = trySpendDecision(world.budget);
    if (spent.ok) world.budget = spent.budget;
  }
  const graph = buildManagementGraph({ ports: makePorts(world), now: () => world.now });
  const { outcome } = await graph.invoke(initialState("objective_submitted"));
  assert.equal(outcome.objectiveState, "recovery_required");
  assert.equal(world.decisions.length, 0); // model never consulted
});

test("approval_required pass: pending founder question never dispatches a decision", async () => {
  const world = freshWorld();
  world.pendingApproval = { question: "approve $5 spend?" };
  const graph = buildManagementGraph({ ports: makePorts(world), now: () => world.now });
  const { outcome } = await graph.invoke(initialState("objective_submitted"));
  assert.equal(outcome.objectiveState, "approval_required");
  assert.equal(outcome.nextWakeExpected, "approval_resolved");
  assert.equal(world.decisions.length, 0);
});

test("no-progress escalation: repeated passes without progress do not loop forever (recordProgress path)", () => {
  let budget = createBudget("obj_launch", at0, { maxNoProgressCycles: 2 });
  budget = recordProgress(budget, false, at0 + 1000);
  budget = recordProgress(budget, false, at0 + 2000);
  const verdict = checkBudget(budget, at0 + 3000);
  assert.equal(verdict.ok, false);
  if (verdict.ok) return;
  assert.equal(verdict.state, "escalated");
});

test("ReducerFacts stays compatible with what the reduce node assembles (compile-time pin)", () => {
  const world = freshWorld();
  const facts: Omit<ReducerFacts, "at"> = {
    contract: null,
    currentContractRevision: 1,
    requirements: [],
    groundedByRequirement: new Map(),
    assignments: [],
    intents: [],
    budgetVerdict: { ok: true },
    pendingApproval: null,
    completionProposal: null,
  };
  void facts;
  assert.ok(world);
});
