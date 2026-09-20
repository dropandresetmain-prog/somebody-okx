// The M4 management graph (LangGraph) — continuation position ONLY.
//
// ARCHITECTURE.md §2 authority split, enforced structurally here:
//   - Graph state is the frozen small shape (ids/cursors/pass). Nothing else
//     may be threaded between nodes; every consequential node RELOADS Convex
//     truth through the ManagementPorts interface below.
//   - The graph never decides. Nodes delegate to the pure authorities:
//     decision.ts (ground→eligibility→recommend→recheck), requirements.ts
//     (satisfaction), completion.ts (the gate), reducer.ts (control state),
//     budget.ts (limits). No node may mark anything satisfied or complete.
//   - A pass ENDS at a wake boundary (interruptible by design: the caller
//     invokes once per wake, and wakeEvents carry the consumedAt cursor).
//     There is no autonomous infinite loop reachable from this file — pass
//     only advances within one invocation, and the budget reducer can stop
//     the whole engine from CP3 storage.
//
// The ports exist so this module runs identically under: production Convex
// adapters (CP3/CP7 wiring), and deterministic fakes in Cutoff-2 adversarial
// tests. The graph itself holds zero state between invocations.

import "./convexIsolatePolyfill";
import { Annotation, END, START, StateGraph } from "@langchain/langgraph";
import { isCoherentHold, reduceManagementState } from "./reducer";
import type { DecisionPassResult } from "./decision";
import type {
  CompletionProposal,
  CompletionVerdict,
  GraphOutcome,
  GraphState,
  ManagementState,
  OutcomeContract,
  Requirement,
  WakeReason,
} from "./types";

// ── Ports: the ONLY way the graph touches the world ──────────────────────────

export type ManagementPorts = {
  // Authoritative reads (fresh per node — caching here would violate the
  // reload rule; adapters MUST read Convex every call).
  loadContract(objectiveKey: string): Promise<{ contract: OutcomeContract | null; currentContractRevision: number }>;
  loadRequirements(objectiveKey: string, revision: number): Promise<Requirement[]>;
  loadGrounded(objectiveKey: string, revision: number): Promise<Map<string, import("./types").GroundedOption[]>>;
  loadAssignments(objectiveKey: string): Promise<import("./types").Assignment[]>;
  loadIntents(objectiveKey: string): Promise<import("./types").ExecutionIntent[]>;
  loadBudgetVerdict(objectiveKey: string, at: number): Promise<import("./types").BudgetVerdict>;
  loadPendingApproval(objectiveKey: string): Promise<{ question: string } | null>;
  loadCompletionVerdict(objectiveKey: string): Promise<CompletionVerdict | null>;
  loadWakeEvents(objectiveKey: string): Promise<import("./types").WakeEvent[]>;

  // Effects — every one idempotent by the ids in graph state.
  consumeWakeEvents(objectiveKey: string, eventIds: string[], at: number): Promise<void>;
  spendDecisionCall(objectiveKey: string, at: number): Promise<void>;
  runDecisionPass(state: GraphState, ports: ManagementPorts, at: number): Promise<DecisionPassResult | null>;
  persistDecision(result: DecisionPassResult, at: number): Promise<void>;
  recordSatisfactionAttempt(state: GraphState, requirementKey: string, at: number): Promise<boolean>;
  proposeCompletion(proposal: CompletionProposal, at: number): Promise<CompletionVerdict>;
  writeObjectiveState(objectiveKey: string, state: ManagementState, summary: string, at: number): Promise<void>;
  // R3 A3 — a TIMER, not a re-wake. `runAfter(0, runManagementPass)` used to be
  // called from the settle node for every `waiting`/`blocked` pass, which is an
  // infinite zero-delay loop that also appended a control note each round.
  // Adapters must therefore (a) use the non-zero `delayMs` given here, (b) derive
  // one stable identity per logical condition so at most one timer is outstanding
  // for that condition, and (c) record the pass against the no-progress budget.
  scheduleTimer(objectiveKey: string, reason: WakeReason, delayMs: number, timerKey: string, at: number): Promise<boolean>;
  // R3 A3 — persisted no-progress accounting for one completed pass.
  recordPassProgress(objectiveKey: string, progressed: boolean, at: number): Promise<void>;
  // R3 A2 — make an authorized plan real. Adapters dispatch through the existing
  // storage seams (reserveWorker/putAssignment, createIntentFromAuthorization/
  // putIntent); ids come from stable decision identity so a replay is a no-op.
  dispatchRequirement(state: GraphState, requirementKey: string, at: number): Promise<string | null>;
};

// Sensible, non-zero timer delays. A quiescent Objective does not poll; these are
// the only self-generated wakes the engine is allowed to make, and each is one
// bounded deadline for a specific logical condition.
export const TIMER_DELAYS_MS = {
  // Lease/watchdog for in-flight work: long enough that a normal run never needs
  // it, short enough that a lost worker is noticed within the objective budget.
  work_in_flight: 5 * 60_000,
  // Nothing eligible right now: re-check on a human timescale, not a busy loop.
  no_eligible_path: 15 * 60_000,
  // Awaiting the founder: a reminder, never a retry storm.
  founder_pending: 60 * 60_000,
} as const;

// R3 A2 — how much WORK one wake may contain. `decide → dispatch → verify →
// propose` is the loop doing its job from reloaded state, so a single
// `objective_submitted` wake must be able to reach quiescence instead of
// deciding and then idling. It is bounded per pass, and every cycle still
// consumes the persisted decision/model-call ceilings, so this can never spin:
// the ceilings and the no-progress escalation remain the outer guards.
export const MAX_CONTINUE_CYCLES = 3;

export type GraphDeps = {
  ports: ManagementPorts;
  now: () => number;
};

// ── Graph state annotation (the frozen small shape, field-for-field) ─────────

const GraphAnnotation = Annotation.Root({
  objectiveKey: Annotation<string>({ reducer: (_prev, next) => next, default: () => "" }),
  contractRevision: Annotation<number | null>({ reducer: (_prev, next) => next, default: () => null }),
  focusRequirementKey: Annotation<string | null>({ reducer: (_prev, next) => next, default: () => null }),
  managerDecisionId: Annotation<string | null>({ reducer: (_prev, next) => next, default: () => null }),
  pendingIntentId: Annotation<string | null>({ reducer: (_prev, next) => next, default: () => null }),
  wakeReason: Annotation<WakeReason | null>({ reducer: (_prev, next) => next, default: () => null }),
  wakeEventIds: Annotation<string[]>({ reducer: (_prev, next) => next, default: () => [] }),
  continuation: Annotation<Record<string, string>>({ reducer: (prev, next) => ({ ...prev, ...next }), default: () => ({}) }),
  lastNode: Annotation<string | null>({ reducer: (_prev, next) => next, default: () => null }),
  pass: Annotation<number>({ reducer: (_prev, next) => next, default: () => 0 }),
  // Internal channel: the settle node's computed outcome. Mapped out of the
  // small frozen GraphState in invoke(); never fed back in as business truth.
  outcome: Annotation<GraphOutcome | null>({ reducer: (_prev, next) => next, default: () => null }),
});

type Ann = typeof GraphAnnotation.State;

// ── Nodes ────────────────────────────────────────────────────────────────────

export type NodeResult = Partial<Ann>;
async function observeNode(state: Ann, deps: GraphDeps): Promise<NodeResult> {
  const { ports } = deps;
  const at = deps.now();
  // Fold unconsumed wakes into this pass (ids only) and mark them consumed —
  // duplicate delivery is harmless because consumption is by event id.
  const wakes = await ports.loadWakeEvents(state.objectiveKey);
  const fresh = wakes.filter((wake) => wake.consumedAt === null);
  if (fresh.length) await ports.consumeWakeEvents(state.objectiveKey, fresh.map((w) => w.eventId), at);
  // R3 A3 — "material" means the WORLD changed: a worker result, a resource or
  // approval event, founder input, a provider/M3 event. A timer or no-progress
  // wake is the engine poking itself, which must NOT reset the no-progress
  // counter — otherwise the finite ceiling could never be reached.
  const SELF_WAKE = new Set<WakeReason>(["timeout", "no_progress", "recovery_event"]);
  const material = fresh.some((wake) => !SELF_WAKE.has(wake.reason));
  return {
    lastNode: "observe",
    wakeReason: fresh[0]?.reason ?? state.wakeReason,
    wakeEventIds: fresh.map((w) => w.eventId),
    continuation: { ...state.continuation, materialWake: material ? "true" : "false" },
    pass: state.pass + 1,
  };
}

async function reduceNode(state: Ann, deps: GraphDeps): Promise<NodeResult> {
  const { ports } = deps;
  const at = deps.now();
  const { contract, currentContractRevision } = await ports.loadContract(state.objectiveKey);
  const requirements = contract
    ? await ports.loadRequirements(state.objectiveKey, currentContractRevision)
    : [];
  const grounded = contract
    ? await ports.loadGrounded(state.objectiveKey, currentContractRevision)
    : new Map();
  const [assignments, intents, budgetVerdict, pendingApproval, completionVerdict] = await Promise.all([
    ports.loadAssignments(state.objectiveKey),
    ports.loadIntents(state.objectiveKey),
    ports.loadBudgetVerdict(state.objectiveKey, at),
    ports.loadPendingApproval(state.objectiveKey),
    ports.loadCompletionVerdict(state.objectiveKey),
  ]);
  const reduced = reduceManagementState({
    contract,
    currentContractRevision,
    requirements,
    groundedByRequirement: grounded,
    assignments,
    intents,
    budgetVerdict,
    pendingApproval,
    completionProposal: completionVerdict,
    at,
  });
  if (!isCoherentHold(reduced))
    throw new Error(`reducer incoherence: ${reduced.state} with ${reduced.action.kind}`);
  // Persisting the CONTROL state is bookkeeping the read model shows; it is
  // never a business resolution. The reducer is its only author.
  await ports.writeObjectiveState(state.objectiveKey, reduced.state, reduced.detail, at);
  const focus =
    reduced.action.kind === "decide_requirement" ||
    reduced.action.kind === "dispatch" ||
    reduced.action.kind === "verify_requirement"
      ? reduced.action.requirementKey
      : null;
  return {
    lastNode: "reduce",
    contractRevision: currentContractRevision,
    focusRequirementKey: focus,
    continuation: { reducerState: reduced.state, reducerAction: reduced.action.kind },
  };
}

// Route on the reduced action carried in graph memory. The routing rule is
// action → node, nothing else; business conclusions are NEVER carried.
async function decideNode(state: Ann, deps: GraphDeps): Promise<NodeResult> {
  const at = deps.now();
  const { ports } = deps;
  if (!state.focusRequirementKey) return { lastNode: "decide" };
  await ports.spendDecisionCall(state.objectiveKey, at);
  const result = await ports.runDecisionPass(state as GraphState, ports, at);
  if (result) {
    await ports.persistDecision(result, at);
    const authorized = result.authorization.kind === "authorized";
    return {
      lastNode: "decide",
      managerDecisionId: result.decision.decisionId,
      continuation: {
        ...state.continuation,
        lastAuthorization: result.authorization.kind,
        // Only an AUTHORIZATION counts as cycle work. A refusal changed no
        // state, and re-deciding the same refusal would burn up to
        // MAX_CONTINUE_CYCLES model calls per wake for an identical answer —
        // the reducer routes refusal passes to `waiting` instead, where the
        // bounded re-check timer applies.
        ...(authorized ? { actedCycle: String(state.continuation.continueCycles ?? "0") } : {}),
      },
    };
  }
  return { lastNode: "decide" };
}

// R3 A2 — the node that makes an authorized plan REAL. It performs no business
// judgement: the reducer already concluded "authorized and undelivered" from
// reloaded state, and the adapter's dispatch is idempotent on stable identity,
// so re-entering this node cannot mint a second assignment or intent.
async function dispatchNode(state: Ann, deps: GraphDeps): Promise<NodeResult> {
  const at = deps.now();
  const requirementKey = state.focusRequirementKey;
  if (!requirementKey) return { lastNode: "dispatch" };
  const effectId = await deps.ports.dispatchRequirement(state as GraphState, requirementKey, at);
  return {
    lastNode: "dispatch",
    pendingIntentId: effectId ?? state.pendingIntentId,
    continuation: {
      ...state.continuation,
      dispatched: requirementKey,
      ...(effectId
        ? { effectId, actedCycle: String(state.continuation.continueCycles ?? "0") }
        : {}),
    },
  };
}

async function verifyNode(state: Ann, deps: GraphDeps): Promise<NodeResult> {
  // Verification of assignment/intent outcomes lives with the CP3/CP6 seams
  // (the wake EVENT carries the evidence); this node's job is only to route
  // "did the world change" wakes into satisfaction attempts. It never marks
  // anything satisfied itself — recordSatisfactionAttempt delegates to
  // requirements.ts on the server side, where only proof-bearing events pass.
  // The boolean is the KERNEL's verdict, reported back purely for progress
  // accounting; nothing here reads it as business truth.
  let satisfied = false;
  if (state.focusRequirementKey)
    satisfied = await deps.ports.recordSatisfactionAttempt(
      state as GraphState,
      state.focusRequirementKey,
      deps.now(),
    );
  return {
    lastNode: "verify",
    continuation: {
      ...state.continuation,
      verifiedSatisfied: satisfied ? "true" : "false",
      ...(satisfied ? { actedCycle: String(state.continuation.continueCycles ?? "0") } : {}),
    },
  };
}

async function proposeNode(state: Ann, deps: GraphDeps): Promise<NodeResult> {
  const { ports } = deps;
  const at = deps.now();
  const { contract, currentContractRevision } = await ports.loadContract(state.objectiveKey);
  if (!contract) return { lastNode: "propose" };
  const requirements = await ports.loadRequirements(state.objectiveKey, currentContractRevision);
  const open = requirements.filter(
    (requirement) => requirement.priority === "required" && requirement.state !== "satisfied" && requirement.state !== "waived" && requirement.state !== "superseded",
  );
  if (open.length === 0) {
    const verdict = await ports.proposeCompletion(
      {
        proposalId: `prop_${state.objectiveKey}_r${currentContractRevision}_p${state.pass}`,
        objectiveKey: state.objectiveKey,
        contractId: contract.contractId,
        contractRevision: currentContractRevision,
        claimedLevelKey: contract.minimumCompletionBar, // Somebody may claim the bar, never above it unilaterally
        rationale: "all required requirements carry current-revision satisfied resolutions",
        proposedAt: at,
      },
      at,
    );
    return {
      lastNode: "propose",
      continuation: {
        ...state.continuation,
        gateAccepted: String(verdict.accepted),
        ...(verdict.accepted ? { actedCycle: String(state.continuation.continueCycles ?? "0") } : {}),
      },
    };
  }
  return { lastNode: "propose" };
}

async function settleNode(state: Ann, deps: GraphDeps): Promise<NodeResult> {
  const at = deps.now();
  // Re-reduce after the action to compute the pass outcome from CURRENT truth.
  const { contract, currentContractRevision } = await deps.ports.loadContract(state.objectiveKey);
  const requirements = contract ? await deps.ports.loadRequirements(state.objectiveKey, currentContractRevision) : [];
  const grounded = contract ? await deps.ports.loadGrounded(state.objectiveKey, currentContractRevision) : new Map();
  const [assignments, intents, budgetVerdict, pendingApproval, completionVerdict] = await Promise.all([
    deps.ports.loadAssignments(state.objectiveKey),
    deps.ports.loadIntents(state.objectiveKey),
    deps.ports.loadBudgetVerdict(state.objectiveKey, at),
    deps.ports.loadPendingApproval(state.objectiveKey),
    deps.ports.loadCompletionVerdict(state.objectiveKey),
  ]);
  const reduced = reduceManagementState({
    contract, currentContractRevision, requirements,
    groundedByRequirement: grounded, assignments, intents, budgetVerdict,
    pendingApproval, completionProposal: completionVerdict, at,
  });
  let nextWakeExpected: WakeReason | null = null;
  switch (reduced.action.kind) {
    case "await_wake":
      nextWakeExpected = reduced.action.reason === "approval_resolved" ? "approval_resolved" : "worker_result";
      break;
    case "ask_founder":
      nextWakeExpected = "founder_input";
      break;
    case "hold":
      nextWakeExpected = null;
      break;
    default:
      break;
  }

  // R3 A3 — QUIESCENT STATES DO NOT RESCHEDULE THEMSELVES.
  //
  // `waiting` and `blocked` resume on a MEANINGFUL wake: a worker result, a
  // resource request, founder input, an approval, a provider/M3 event. They used
  // to call `scheduleWake("timeout")` → `runAfter(0, runManagementPass)`, which
  // is an infinite zero-delay loop that also grew a control note every round.
  //
  // A timer is kept only where the passage of time is itself the condition the
  // engine is waiting on — an expired worker lease, or re-checking whether a
  // resource became available. Each such timer is (a) non-zero, (b) keyed by one
  // stable identity per logical condition so the adapter can hold at most one
  // outstanding timer for it, and (c) counted as NO progress below, so repeated
  // timers walk the objective into the existing finite ceiling instead of
  // spinning forever.
  //
  // A lease watchdog only makes sense while internal work is actually in flight;
  // an intent resting at the M3 boundary is not "work in flight", it waits for a
  // meaningful external event.
  const liveInternalWork = assignments.some(
    (assignment) => assignment.state === "dispatched" || assignment.state === "running",
  );
  const cycles = Number(state.continuation.continueCycles ?? "0");
  let timerScheduled = false;
  let continueRequested = false;

  // R3 A2 — one wake may ACT until the objective is quiescent, bounded:
  // decide → dispatch → verify → propose is the loop doing its job, not a
  // retry storm. Two bounds apply: MAX_CONTINUE_CYCLES per pass, and the cycle
  // that just ran must have PRODUCED something — an authorization, an effect
  // row, a verification, a gate verdict (action nodes stamp `actedCycle`). A
  // cycle that changed no state ends the pass: re-reducing identical state
  // would only replay the same action, and the persisted decision/model-call
  // ceilings plus no-progress escalation remain the outer guards.
  const ACTIONABLE = new Set(["decide_requirement", "dispatch", "verify_requirement", "propose_completion"]);
  const cycleDidWork = Number(state.continuation.actedCycle ?? "-1") === cycles;
  if (ACTIONABLE.has(reduced.action.kind) && cycles < MAX_CONTINUE_CYCLES && cycleDidWork)
    continueRequested = true;
  if (!continueRequested) {
    if (reduced.action.kind === "await_wake" && nextWakeExpected === "worker_result" && liveInternalWork) {
      timerScheduled = await deps.ports.scheduleTimer(
        state.objectiveKey, "timeout", TIMER_DELAYS_MS.work_in_flight,
        `lease:${state.objectiveKey}`, at,
      );
    } else if (reduced.state === "waiting" || reduced.state === "blocked") {
      timerScheduled = await deps.ports.scheduleTimer(
        state.objectiveKey, "timeout", TIMER_DELAYS_MS.no_eligible_path,
        `${reduced.state}:${state.objectiveKey}`, at,
      );
    } else if (reduced.state === "approval_required") {
      timerScheduled = await deps.ports.scheduleTimer(
        state.objectiveKey, "timeout", TIMER_DELAYS_MS.founder_pending,
        `founder_pending:${state.objectiveKey}`, at,
      );
    }
  }

  // Progress is a FACT about this pass, read from what the nodes actually
  // produced — not from "the graph ran". A pass that only poked itself made no
  // progress, which is what makes the persisted no-progress ceiling reachable.
  // Note `dispatched` alone is NOT progress: a deferred dispatch wrote no effect
  // row, so only `effectId` (the id actually created or found) counts.
  const carried = state.continuation;
  const progressed =
    carried.materialWake === "true" ||
    carried.lastAuthorization === "authorized" || // a strategy was bound
    carried.effectId !== undefined ||             // an effect row exists
    carried.verifiedSatisfied === "true" ||       // a requirement was resolved
    carried.gateAccepted === "true";              // the independent gate accepted
  await deps.ports.recordPassProgress(state.objectiveKey, progressed, at);

  const outcome: GraphOutcome = {
    objectiveState: reduced.state,
    acted: ACTIONABLE.has(reduced.action.kind),
    nextWakeExpected,
    summary: reduced.detail,
  };
  if (continueRequested)
    return {
      lastNode: "settle",
      outcome,
      continuation: {
        continueRequested: "true",
        continueCycles: String(cycles + 1),
      },
    };
  return { lastNode: "settle", outcome, continuation: { continueRequested: "false" } };
}

// ── Graph assembly ───────────────────────────────────────────────────────────

export type ManagementGraph = {
  invoke(state: GraphState): Promise<{ final: GraphState; outcome: GraphOutcome }>;
};

const NODE_LIMIT = 14; // bounded continue-cycles × 2 supersteps + the fixed nodes

export function buildManagementGraph(deps: GraphDeps): ManagementGraph {
  const builder = new StateGraph(GraphAnnotation)
    .addNode("observe", (state: Ann) => observeNode(state, deps))
    .addNode("reduce", (state: Ann) => reduceNode(state, deps))
    .addNode("decide", (state: Ann) => decideNode(state, deps))
    .addNode("verify", (state: Ann) => verifyNode(state, deps))
    .addNode("dispatch", (state: Ann) => dispatchNode(state, deps))
    .addNode("propose", (state: Ann) => proposeNode(state, deps))
    .addNode("settle", (state: Ann) => settleNode(state, deps))
    .addEdge(START, "observe")
    .addEdge("observe", "reduce")
    .addConditionalEdges("reduce", async (state: Ann) => {
      // R3 A2 — route on the reducer's EXPLICIT action, carried in graph memory
      // by reduceNode. The previous test `state.lastNode === "decide"` could
      // never be true, because reduceNode sets lastNode to "reduce" immediately
      // before this edge runs: the verify node was unreachable and the engine
      // decided without ever verifying or dispatching.
      //
      // Graph state remains continuation position only — the ACTION is a control
      // conclusion derived fresh from reloaded business state every pass, so
      // nothing here is stale truth.
      const action = state.continuation.reducerAction;
      if (action === "plan_contract" || action === "ask_founder" || action === "await_wake" || action === "hold") return "settle";
      if (action === "propose_completion") return "propose";
      if (action === "decide_requirement") return "decide";
      if (action === "dispatch") return "dispatch";
      if (action === "verify_requirement") return "verify";
      return "settle";
    }, { settle: "settle", propose: "propose", decide: "decide", verify: "verify", dispatch: "dispatch" })
    .addEdge("decide", "settle")
    .addEdge("dispatch", "settle")
    .addEdge("verify", "settle")
    .addEdge("propose", "settle")
    // R3 A2 — settle may hand control BACK to reduce, so one wake can carry
    // decide → dispatch → verify → propose. That is the loop doing its job from
    // reloaded Convex state, not a retry storm: `continueCycles` is bounded, and
    // every cycle still consumes the persisted decision/model-call ceilings.
    .addConditionalEdges("settle", async (state: Ann) =>
      state.continuation.continueRequested === "true" ? "reduce" : END,
    { reduce: "reduce", [END]: END });

  const compiled = builder.compile();

  return {
    async invoke(initial: GraphState) {
      const final = await compiled.invoke(
        { ...initial } as Ann,
        { recursionLimit: NODE_LIMIT },
      );
      const carried = final as Ann;
      const carriedState = carried.continuation.reducerState as ManagementState | undefined;
      const LEGAL: readonly ManagementState[] = ["received","planning","ready_to_execute","executing","waiting_for_resource","completed","failed","waiting","approval_required","blocked","escalated","recovery_required"];
      const outcome: GraphOutcome = carried.outcome ?? {
        objectiveState: carriedState && LEGAL.includes(carriedState) ? carriedState : "recovery_required",
        acted: false,
        nextWakeExpected:
          carriedState === "approval_required" && carried.continuation.reducerAction === "await_wake"
            ? "approval_resolved"
            : null,
        summary: "pass ended without settle outcome (defensive default)",
      };
      return {
        final: {
          objectiveKey: carried.objectiveKey,
          contractRevision: carried.contractRevision ?? null,
          focusRequirementKey: carried.focusRequirementKey ?? null,
          managerDecisionId: carried.managerDecisionId ?? null,
          pendingIntentId: carried.pendingIntentId ?? null,
          wakeReason: carried.wakeReason ?? null,
          wakeEventIds: carried.wakeEventIds ?? [],
          continuation: carried.continuation ?? {},
          lastNode: carried.lastNode ?? null,
          pass: carried.pass ?? 0,
        },
        outcome,
      };
    },
  };
}
