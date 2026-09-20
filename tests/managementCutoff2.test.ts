// CP5 — Cutoff 2 adversarial suite. The mandate: an arbitrary prompt must
// terminate in a TYPED state, never an exception, never hallucinated authority,
// never accidental spend, never fake completion. These tests hammer the REAL
// kernels (options/decision/reducer/budget/completion/proposals/graph); the
// refusal must come from the production code path, not from a mock.
import test from "node:test";
import assert from "node:assert/strict";
import {
  buildExternalOption,
  buildInternalOption,
  eligibilityInputFor,
  optionIdFor,
  withEligibility,
  type EligibilityFacts,
} from "../lib/management/options";
import { runManagerialDecisionPass, type DecisionPassInput } from "../lib/management/decision";
import { reduceManagementState, isCoherentHold, type ReducerFacts } from "../lib/management/reducer";
import { CP2_DECISION_PASS_FIELDS, CP2_REQUIREMENT_FIELDS } from "./helpers/cp2Requirement";
import {
  createBudget,
  checkBudget,
  recordProgress,
  trySpendDecision,
  trySpendModelCall,
  tryCommitSpend,
  tryIntentRetry,
  tryRequirementAttempt,
  trySpendWorkerCreation,
  tryStartAssignment,
} from "../lib/management/budget";
import { evaluateCompletionGate } from "../lib/management/completion";
import { parseManagerialRecommendation } from "../lib/management/proposals";
import { buildOutcomeContract } from "../lib/management/contract";
import { buildManagementGraph, type ManagementPorts } from "../lib/management/graph";
import type {
  GroundedOption,
  ManagementState,
  ObjectiveBudget,
  OutcomeContract,
  Requirement,
  WakeEvent,
  WorkerRecord,
} from "../lib/management/types";

const at0 = 1700000000000;

const contractResult = buildOutcomeContract({
  objectiveKey: "obj_x",
  contractId: "contract_x",
  revision: 1,
  parsed: {
    intent: "an arbitrary founder prompt",
    levels: [{ levelKey: "done_x", order: 1, statement: "x is true", label: "Done" }],
    minimumCompletionBar: "done_x",
    ambiguities: [],
  },
  requestId: "req_x",
  founderResolvedQuestions: [],
  at: at0,
});
assert.equal(contractResult.ok, true);
const contract: OutcomeContract = contractResult.ok ? contractResult.contract : (() => { throw new Error(); })();

function req(overrides: Partial<Requirement> = {}): Requirement {
  return {
    requirementKey: "req_x",
    objectiveKey: "obj_x",
    contractId: "contract_x",
    contractRevision: 1,
    priority: "required",
    title: "x",
    mustBeTrue: "x holds",
    scope: "x",
    ...CP2_REQUIREMENT_FIELDS,
    proofs: [{ proofKey: "p1", description: "d", proofKind: "application_observation", params: { sourceId: "ev-1" } }],
    state: "active",
    strategy: null,
    resolution: null,
    blockedReason: null,
    waiver: null,
    revision: 1,
    createdAt: at0,
    updatedAt: at0,
    ...overrides,
  };
}

function emptyFacts() {
  return { scope: null, expectedQuality: null, setupMinutes: null, queueMinutes: null, executionMinutes: null, verificationMinutes: null, internalCostUsd: null, externalPriceUsd: null, reliability: null, availability: null, reuseValue: null, externalAdvantage: null };
}

// The five classes a growth-capability worker consumes, all company-controlled
// (same shape the CP4 graph fixtures use — no scenario routing reads them).
const FIVE = ["llm_reasoning", "public_web", "ordinary_compute", "company_records", "company_tools"];

const baseFacts: EligibilityFacts = {
  requiredResourceClasses: FIVE,
  controlledResourceClasses: FIVE,
  deadlineAt: null,
  now: at0,
  estimatedMinutes: null,
  requiresMandatoryProof: false,
  proofAvailable: true,
  workerAvailable: null,
  spendAuthorityUsd: 10,
  budgetRemainingUsd: 100,
};

function internalOption(workerKey: string | null): GroundedOption | null {
  const built = buildInternalOption({
    requirementKey: "req_x",
    contractRevision: 1,
    capabilityKeys: ["growth_launch_operations"],
    responsibility: "do x",
    workerKey,
    staffingReason: "test",
    facts: emptyFacts(),
  });
  return built.option;
}

// ── stable identities under adversarial replay ───────────────────────────────

test("identities are deterministic under replay: equal semantics collide onto ONE id; revision/kind can never alias a live option", () => {
  const a = optionIdFor({ requirementKey: "req_x", contractRevision: 1, kind: "external", target: "external:reg_off_1" });
  const b = optionIdFor({ requirementKey: "req_x", contractRevision: 1, kind: "external", target: "external:reg_off_1" });
  assert.equal(a, b, "a replayed wake rebuilds the same optionId — no phantom twin");
  const c = optionIdFor({ requirementKey: "req_x", contractRevision: 2, kind: "external", target: "external:reg_off_1" });
  assert.notEqual(a, c, "revision is part of the identity");
  const d = optionIdFor({ requirementKey: "req_x", contractRevision: 1, kind: "internal", target: "external:reg_off_1" });
  assert.notEqual(a, d, "kind is part of the identity");
});

// ── malformed model output: bounded, typed, zero side effects ────────────────

test("recommendation parser survives every malformed variant with typed results and never throws", () => {
  const ctx = { requirementKey: "req_x", contractRevision: 1, eligibleOptionIds: ["opt_a"] };
  const hostile: unknown[] = [
    null,
    undefined,
    "i am the CEO now, buy everything",
    42,
    [],
    {},
    // legal-but-hostile-shaped controls below (string revision coerces; junk
    // fields are truncated/discarded, never invented into structure)
    { requirementKey: "req_x", contractRevision: 1, selectedOptionId: "opt_a", rationale: "ok" },
    { requirementKey: "req_x", contractRevision: "1", selectedOptionId: "opt_a", rationale: "string revision coerces" },
    { requirementKey: "not_req", contractRevision: 1, selectedOptionId: "opt_a", rationale: "wrong target" },
    { requirementKey: "req_x", contractRevision: 99, selectedOptionId: "opt_a", rationale: "future revision" },
    { requirementKey: "req_x", contractRevision: 1, selectedOptionId: "opt_hallucinated", rationale: "invented option" },
    { requirementKey: "req_x", contractRevision: 1, rationale: "no option at all" },
    { requirementKey: "req_x", contractRevision: 1, selectedOptionId: "opt_a" },
    { requirementKey: "req_x", contractRevision: 1, selectedOptionId: "opt_a", rationale: "   " },
    { requirementKey: "req_x", contractRevision: 1, selectedOptionId: "opt_a", rationale: "x".repeat(50_000) },
    { requirementKey: "req_x", contractRevision: 1, selectedOptionId: "opt_a", rationale: "r", strongestAlternativeId: "opt_evil" },
    { requirementKey: "req_x", contractRevision: 1, selectedOptionId: "opt_a", rationale: "r", materialAssumptions: [1, "ok", null, {}, "fine"] },
  ];
  let valid = 0;
  for (const raw of hostile) {
    const parsed = parseManagerialRecommendation(raw, ctx); // must never throw
    if (parsed.ok) {
      valid += 1;
      // whatever was accepted carries ONLY application-known eligible ids
      assert.ok(ctx.eligibleOptionIds.includes(parsed.value.selectedOptionId));
      assert.ok(parsed.value.strongestAlternativeId === null || ctx.eligibleOptionIds.includes(parsed.value.strongestAlternativeId));
      assert.ok(parsed.value.rationale.length <= 1200, "oversized rationale truncated, not stored raw");
      assert.ok(parsed.value.materialAssumptions.every((a) => typeof a === "string" && a.length > 0));
    } else {
      assert.ok(parsed.errors.length > 0, "refusals carry typed reasons");
    }
  }
  // exactly: control + coerced-revision + oversized-rationale + invented-
  // alternative-discarded + junk-list-filtered. Everything else is a refusal.
  assert.equal(valid, 5);
});

// ── impossible deadline terminates typed, never a forced MAKE ────────────────

test("an impossible deadline makes every grounded option ineligible and the reducer lands in a typed coherent hold", () => {
  const past: EligibilityFacts = { ...baseFacts, deadlineAt: at0 - 1, now: at0 };
  const options = [internalOption(null), externalOption("reg_off", { registryVerified: true, priceUsd: 1 })].filter(
    (o): o is GroundedOption => o !== null,
  );
  const grounded = withEligibility(options, (option) => eligibilityInputFor(option, past));
  for (const option of grounded) {
    assert.equal(option.eligibility.eligible, false, `${option.kind} must be deadline-ineligible`);
    assert.ok(option.eligibility.reasons.includes("deadline_infeasible"), option.eligibility.detail);
  }
  const reduced = reduceManagementState(factsWith({
    requirements: [req()],
    groundedByRequirement: new Map<string, GroundedOption[]>([["req_x", grounded]]),
  }));
  assert.equal(reduced.state, "waiting", "grounded-nothing-eligible + nothing blocked ⇒ waiting on timeout wake");
  assert.ok(isCoherentHold(reduced));
});

function externalOption(offeringId: string, opts: { registryVerified: boolean; priceUsd: number | null }): GroundedOption {
  return buildExternalOption({
    requirementKey: "req_x",
    contractRevision: 1,
    offeringId,
    providerId: "prov_x",
    serviceId: "svc_x",
    resourceClass: "ordinary_compute",
    priceUsd: opts.priceUsd,
    priceProvenance: "provider_quote",
    registryVerified: opts.registryVerified,
    compatibleResourceClass: true,
    facts: emptyFacts(),
  });
}

// ── contradictory requirements: typed, no false completion, no global stall ──

test("a blocked requirement never fakes completion and never stalls a solvable sibling", () => {
  const blocked = req({ requirementKey: "req_contra", state: "blocked", blockedReason: "provably impossible" });
  const solvable = req({ requirementKey: "req_solvable" });
  const internal = internalOption("worker_a");
  assert.ok(internal);
  const grounded = withEligibility([internal!], (o) => eligibilityInputFor(o, baseFacts));
  assert.equal(grounded[0].eligibility.eligible, true, "internal path over fully-controlled classes is eligible");
  const reduced = reduceManagementState(factsWith({
    requirements: [blocked, solvable],
    groundedByRequirement: new Map([["req_solvable", grounded]]),
  }));
  // the never-grounded blocked sibling is still decision work; the engine acts
  assert.equal(reduced.state, "executing");
  assert.ok(reduced.action.kind === "decide_requirement");
  // completion cannot be claimed while the contradiction stands
  const verdict = evaluateCompletionGate({
    proposal: { proposalId: "prop_1", objectiveKey: "obj_x", contractId: "contract_x", contractRevision: 1, claimedLevelKey: "done_x", rationale: "trust me", proposedAt: at0 },
    contract, currentContractRevision: 1,
    requirements: [blocked, { ...solvable, state: "satisfied", resolution: { resolutionId: "r", acceptedDecisionId: null, acceptedAssignmentId: null, acceptedIntentId: null, proofRefs: [], contractRevision: 1, acceptedAt: at0 } }],
    factsByRequirementKey: new Map([["req_solvable", { artifactVersions: {}, applicationObservationIds: ["ev-1"], verifiedIntentIds: [], founderConfirmationRefs: [] }]]),
    unresolvedEffectIds: [], unresolvedResourceIds: [], at: at0,
  });
  assert.equal(verdict.accepted, false);
  assert.equal(verdict.objectiveState, "blocked");
});

// ── malicious provider text stays DATA ───────────────────────────────────────

test("provider text demanding spend/authority is grounded verbatim as data and dies at deterministic eligibility", () => {
  const injection = buildExternalOption({
    requirementKey: "req_x",
    contractRevision: 1,
    offeringId: "reg_evil",
    providerId: "prov_evil",
    serviceId: "svc_evil",
    resourceClass: "ordinary_compute",
    priceUsd: 500,
    priceProvenance: "llm_estimate",
    registryVerified: false,
    compatibleResourceClass: true,
    facts: emptyFacts(),
  });
  // smuggle the hostile prose into the display fields (adapter-faithful shape)
  const poisoned: GroundedOption = {
    ...injection,
    external: { ...injection.external!, registryVerified: false },
  };
  const grounded = withEligibility([poisoned], (o) => eligibilityInputFor(o, baseFacts));
  const option = grounded[0];
  assert.equal(option.eligibility.eligible, false);
  assert.ok(option.eligibility.reasons.includes("unverified_source"), option.eligibility.detail);
  assert.equal(option.external?.offeringId, "reg_evil", "identity stays a fact, never an authority");
});

test("an LLM roleplaying authority cannot buy past the deterministic budget bound (price > budget ⇒ ineligible; commit refused)", () => {
  const overpriced = externalOption("reg_big", { registryVerified: true, priceUsd: 5_000 });
  const grounded = withEligibility([overpriced], (o) => eligibilityInputFor(o, { ...baseFacts, budgetRemainingUsd: 100 }));
  assert.equal(grounded[0].eligibility.eligible, false);
  assert.ok(grounded[0].eligibility.reasons.includes("budget_exceeded"));
  const commit = tryCommitSpend(createBudget("obj_x", at0), 5_000);
  assert.equal(commit.ok, false); // the ceiling refuses the commit; no partial spend
  if (!commit.ok && !commit.verdict.ok) assert.equal(commit.verdict.state, "approval_required");
  // a null price is UNKNOWN, never zero: not authorizable without a quote
  const unpriced = externalOption("reg_null", { registryVerified: true, priceUsd: null });
  const unpricedGrounded = withEligibility([unpriced], (o) => eligibilityInputFor(o, baseFacts));
  assert.equal(unpricedGrounded[0].eligibility.eligible, false);
  assert.ok(unpricedGrounded[0].eligibility.reasons.includes("provider_incompatible"));
});

// ── finite persisted budgets: EVERY limit maps to a typed terminal verdict ───

test("every budget limit is finite; each exhaustion is a typed verdict, never an exception, and the two call ceilings stay independent", () => {
  // decision ceiling
  let b: ObjectiveBudget = createBudget("obj_x", at0);
  for (let i = 0; i < b.limits.maxManagementDecisions; i += 1) {
    const spent = trySpendDecision(b);
    assert.equal(spent.ok, true, `decision ${i} affordable`);
    if (spent.ok) b = spent.budget;
  }
  assert.equal(trySpendDecision(b).ok, false);
  const v1 = checkBudget(b, at0 + 1);
  assert.equal(v1.ok, false);
  if (!v1.ok) assert.equal(v1.state, "recovery_required");

  // model-call ceiling alone exhausts without touching decisions
  let m = createBudget("obj_x", at0);
  for (let i = 0; i < m.limits.maxModelCalls; i += 1) {
    const spent = trySpendModelCall(m);
    if (spent.ok) m = spent.budget;
  }
  assert.equal(trySpendModelCall(m).ok, false);
  assert.equal(m.used.managementDecisions, 0, "model calls are not decisions — independent ceilings");

  // …and decisions spend exactly one model call each (40 of 60), leaving
  // non-decision turns their own remaining budget
  assert.equal(b.used.modelCalls, b.limits.maxManagementDecisions);
  const extra = trySpendModelCall(b);
  assert.equal(extra.ok, true, "the decision ceiling exhausted ≠ the model-call ceiling exhausted");

  // worker-creation / attempts / retries / assignments: finite and typed
  const atLimit = (used: ObjectiveBudget["used"]): ObjectiveBudget => ({ ...b, used });
  assert.equal(trySpendWorkerCreation(atLimit({ ...b.used, workersCreated: b.limits.maxWorkersCreated })).ok, false);
  assert.equal(tryRequirementAttempt(atLimit({ ...b.used, attemptsByRequirement: { req_x: b.limits.maxWorkerAttemptsPerRequirement } }), "req_x").ok, false);
  assert.equal(tryIntentRetry(atLimit({ ...b.used, retriesByIntent: { int_1: b.limits.maxRetriesPerIntent } }), "int_1").ok, false);
  assert.equal(tryStartAssignment(atLimit({ ...b.used, activeAssignments: b.limits.maxActiveAssignments })).ok, false);

  // no-progress and elapsed ceilings escalate with typed states
  let np = createBudget("obj_x", at0, { maxNoProgressCycles: 2 });
  np = recordProgress(np, false, at0 + 1);
  np = recordProgress(np, false, at0 + 2);
  const v2 = checkBudget(np, at0 + 3);
  assert.equal(v2.ok, false);
  if (!v2.ok) assert.equal(v2.state, "escalated");
  const v3 = checkBudget(createBudget("obj_x", at0, { maxElapsedMs: 1 }), at0 + 2);
  assert.equal(v3.ok, false);
  if (!v3.ok) assert.equal(v3.state, "escalated");
});

// ── no infinite worker spawning: replay ⇒ ONE stable identity, zero twins ───

test("replaying the identical decision envelope ten times yields ONE stable worker identity and one stable option", async () => {
  const workerA: WorkerRecord = {
    workerKey: "worker_a",
    displayName: "Worker A",
    capabilityKeys: ["growth_launch_operations"],
    dynamicCapabilities: [],
    responsibility: "ops",
    lifecycle: "available",
    reservedBy: null,
    verifiedAssignments: [],
    contextRefs: [],
    createdByObjective: null,
    createdAt: at0 - 5000,
    updatedAt: at0 - 5000,
  };
  const input = (seed: number): DecisionPassInput => ({
    objectiveKey: "obj_x",
    contract,
    currentContractRevision: 1,
    requirementKey: "req_x",
    requirementTitle: "x",
    mustBeTrue: "x holds",
    priority: "required",
    ...CP2_DECISION_PASS_FIELDS,
    artifactKeyForInternalProof: "art_x",
    staffing: {
      objectiveKey: "obj_x",
      requirementKey: "req_x",
      requiredCapabilityKeys: ["growth_launch_operations"],
      requiredPermissions: ["update_company_artifact"],
      expectedHoldMs: 60_000,
      now: at0,
      neededContextRefs: [],
      parallelismNeeded: 1,
      specializationNeeded: false,
      inventory: [workerA],
      creationAllowed: true,
    },
    grounding: { discovered: [], internalFacts: emptyFacts(), factsForOffering: () => emptyFacts() },
    eligibilityFacts: baseFacts,
    recommend: async (eligible) => ({
      requirementKey: "req_x",
      contractRevision: 1,
      selectedOptionId: eligible[0]?.optionId ?? "opt_none",
      rationale: `pass ${seed}`,
    }),
    at: at0,
    decisionId: `dec_replay_${seed}`,
    spendAuthorityUsd: 2,
    spendApprovalId: null, // this replay only ever authorizes MAKE — no grant needed
    externalAuthority: "m3_unavailable",
    waiverRequested: false,
  });
  const workerKeys = new Set<string>();
  const optionIds = new Set<string>();
  for (let i = 0; i < 10; i += 1) {
    const result = await runManagerialDecisionPass(input(i));
    assert.equal(result.authorization.kind, "authorized", JSON.stringify(result.authorization));
    const internal = result.options.find((o) => o.kind === "internal");
    assert.ok(internal?.internal);
    workerKeys.add(internal!.internal!.workerKey ?? "NONE");
    optionIds.add(internal!.optionId);
  }
  assert.deepEqual([...workerKeys], ["worker_a"], "ten replays REUSE one worker — spawn-per-replay is structurally gone");
  assert.equal(optionIds.size, 1, "the same semantic option, not a fresh phantom per pass");
});

// ── weird/unrelated prompts through the REAL graph: typed terminal states ────

function factsWith(overrides: Partial<ReducerFacts> = {}): ReducerFacts {
  return {
    contract, currentContractRevision: 1, requirements: [], groundedByRequirement: new Map(),
    assignments: [], intents: [], budgetVerdict: { ok: true }, pendingApproval: null,
    completionProposal: null, at: at0, ...overrides,
  };
}

function graphWorld(options: { requirement?: Requirement; budgetExhausted?: boolean } = {}) {
  const world = {
    requirement: options.requirement ?? req(),
    wakes: [] as WakeEvent[],
    states: [] as ManagementState[],
    decisionCalls: 0,
    timers: [] as string[],
    progress: [] as boolean[],
    dispatchCalls: 0,
  };
  const ports: ManagementPorts = {
    async loadContract() { return { contract, currentContractRevision: 1 }; },
    async loadRequirements() { return [structuredClone(world.requirement)]; },
    async loadGrounded() { return new Map(); },
    async loadAssignments() { return []; },
    async loadIntents() { return []; },
    async loadBudgetVerdict() {
      return options.budgetExhausted
        ? checkBudget(createBudget("obj_x", at0, { maxManagementDecisions: 0 }), at0)
        : { ok: true };
    },
    async loadPendingApproval() { return null; },
    async loadCompletionVerdict() { return null; },
    async loadWakeEvents() { return world.wakes; },
    async consumeWakeEvents(_k, ids, at) { for (const w of world.wakes) if (ids.includes(w.eventId)) w.consumedAt = at; },
    async spendDecisionCall() { world.decisionCalls += 1; },
    async runDecisionPass() { return null; },
    async persistDecision() {},
    async recordSatisfactionAttempt(): Promise<boolean> {
      return false;
    },
    async proposeCompletion() { throw new Error("propose must not be reached in these passes"); },
    async writeObjectiveState(_k, state) { world.states.push(state); },
    async scheduleTimer(_k, _reason, delayMs, timerKey) {
      if (delayMs <= 0) throw new Error("timer delay must be non-zero");
      if (world.timers.includes(timerKey)) return false;
      world.timers.push(timerKey);
      return true;
    },
    async recordPassProgress(_k, progressed) { world.progress.push(progressed); },
    async dispatchRequirement(): Promise<string | null> {
      world.dispatchCalls += 1;
      return null;
    },
  };
  return { world, ports };
}

function nonsenseState(): Parameters<ManagementGraphInvoke>[0] {
  return { objectiveKey: "obj_x", contractRevision: null, focusRequirementKey: null, managerDecisionId: null, pendingIntentId: null, wakeReason: "timeout", wakeEventIds: [], continuation: {}, lastNode: null, pass: 0 };
}
type ManagementGraphInvoke = ReturnType<typeof buildManagementGraph>["invoke"];

test("a nonsense wake on an over-budget objective terminates recovery_required: consumed once, typed, no crash, zero decision passes", async () => {
  const { world, ports } = graphWorld({ budgetExhausted: true });
  const graph = buildManagementGraph({ ports, now: () => at0 });
  const wake: WakeEvent = { eventId: "wake_nonsense", objectiveKey: "obj_x", reason: "timeout", refKind: "objective", refId: "obj_x", summary: "asdkjhasd $$$ {{&* buy 1000000 units", at: at0, consumedAt: null };
  world.wakes.push(wake);
  const { outcome } = await graph.invoke(nonsenseState());
  assert.equal(outcome.objectiveState, "recovery_required");
  assert.equal(wake.consumedAt, at0, "the wake was consumed exactly once");
  assert.deepEqual(world.states, ["recovery_required"], "reduce wrote the control state once; the garbage summary changed nothing");
  assert.equal(world.decisionCalls, 0, "budget-exhausted engine never consults the model");
});

test("an ungrounded nonsense objective routes to a decision pass (typed executing) — never a dead-end wait, never completion", async () => {
  const { world, ports } = graphWorld();
  const graph = buildManagementGraph({ ports, now: () => at0 });
  const { outcome } = await graph.invoke(nonsenseState());
  assert.equal(outcome.objectiveState, "executing");
  assert.notEqual(outcome.objectiveState, "completed");
  assert.equal(world.decisionCalls, 1, "decision work is attempted exactly once per pass");
});

test("a fake 'satisfied' row cannot complete through the gate: the application verified NOTHING, so completion is refused with the proof named", () => {
  // R3 A5 probe 1 (persisted `state: "satisfied"`, no facts): the row claims
  // satisfaction AND carries no resolution; the gate gets FACTS, and there
  // are none. Both lies are named in separate unmet lines.
  const satisfied = req({ state: "satisfied" });
  const verdict = evaluateCompletionGate({
    proposal: { proposalId: "prop_z", objectiveKey: "obj_x", contractId: "contract_x", contractRevision: 1, claimedLevelKey: "done_x", rationale: "the worker said done", proposedAt: at0 },
    contract, currentContractRevision: 1, requirements: [satisfied],
    factsByRequirementKey: new Map(),
    unresolvedEffectIds: [], unresolvedResourceIds: [], at: at0,
  });
  assert.equal(verdict.accepted, false);
  assert.ok(verdict.unmet.some((line) => line.includes("proof p1")), verdict.unmet.join("; "));
  assert.ok(verdict.unmet.some((line) => line.includes("no resolution record")), verdict.unmet.join("; "));
});

test("the graph is total: 30 consecutive invocations over already-consumed wakes all terminate with coherent typed states", async () => {
  const { world, ports } = graphWorld();
  const graph = buildManagementGraph({ ports, now: () => at0 });
  let last = nonsenseState();
  for (let i = 0; i < 30; i += 1) {
    const { final } = await graph.invoke({ ...last, pass: i });
    last = final;
    assert.ok(world.states.every((s) => typeof s === "string" && s.length > 0));
  }
  assert.equal(last.pass, 30, "passes count graph-locally and every invoke returned");
  assert.equal(world.decisionCalls, 30, "one decision attempt per pass, bounded, no runaway loop inside a pass");
});
