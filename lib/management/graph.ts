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
  recordSatisfactionAttempt(state: GraphState, requirementKey: string, at: number): Promise<void>;
  proposeCompletion(proposal: CompletionProposal, at: number): Promise<CompletionVerdict>;
  writeObjectiveState(objectiveKey: string, state: ManagementState, summary: string, at: number): Promise<void>;
  scheduleWake(objectiveKey: string, reason: WakeReason, at: number): Promise<void>;
};

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
  return {
    lastNode: "observe",
    wakeReason: fresh[0]?.reason ?? state.wakeReason,
    wakeEventIds: fresh.map((w) => w.eventId),
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
    reduced.action.kind === "decide_requirement" || reduced.action.kind === "dispatch"
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
    return {
      lastNode: "decide",
      managerDecisionId: result.decision.decisionId,
      continuation: { ...state.continuation, lastAuthorization: result.authorization.kind },
    };
  }
  return { lastNode: "decide" };
}

async function verifyNode(state: Ann, deps: GraphDeps): Promise<NodeResult> {
  // Verification of assignment/intent outcomes lives with the CP3/CP6 seams
  // (the wake EVENT carries the evidence); this node's job is only to route
  // "did the world change" wakes into satisfaction attempts. It never marks
  // anything satisfied itself — recordSatisfactionAttempt delegates to
  // requirements.ts on the server side, where only proof-bearing events pass.
  if (state.focusRequirementKey)
    await deps.ports.recordSatisfactionAttempt(state as GraphState, state.focusRequirementKey, deps.now());
  return { lastNode: "verify" };
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
      continuation: { ...state.continuation, gateAccepted: String(verdict.accepted) },
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
  if (["waiting", "blocked"].includes(reduced.state))
    await deps.ports.scheduleWake(state.objectiveKey, "timeout", at);
  const outcome: GraphOutcome = {
    objectiveState: reduced.state,
    acted: ["decide_requirement", "propose_completion", "dispatch"].includes(reduced.action.kind),
    nextWakeExpected,
    summary: reduced.detail,
  };
  return { lastNode: "settle", outcome };
}

// ── Graph assembly ───────────────────────────────────────────────────────────

export type ManagementGraph = {
  invoke(state: GraphState): Promise<{ final: GraphState; outcome: GraphOutcome }>;
};

const NODE_LIMIT = 8; // one wake = one pass; graph-local, mirrors §14 not business truth

export function buildManagementGraph(deps: GraphDeps): ManagementGraph {
  const builder = new StateGraph(GraphAnnotation)
    .addNode("observe", (state: Ann) => observeNode(state, deps))
    .addNode("reduce", (state: Ann) => reduceNode(state, deps))
    .addNode("decide", (state: Ann) => decideNode(state, deps))
    .addNode("verify", (state: Ann) => verifyNode(state, deps))
    .addNode("propose", (state: Ann) => proposeNode(state, deps))
    .addNode("settle", (state: Ann) => settleNode(state, deps))
    .addEdge(START, "observe")
    .addEdge("observe", "reduce")
    .addConditionalEdges("reduce", async (state: Ann) => {
      // Route WITHOUT re-running the reducer's effects: continuation was
      // written by reduceNode; recompute route from the carried action.
      const action = state.continuation.reducerAction;
      if (action === "plan_contract" || action === "ask_founder" || action === "await_wake" || action === "hold") return "settle";
      if (action === "propose_completion") return "propose";
      if (action === "decide_requirement" || action === "dispatch")
        return state.lastNode === "decide" ? "verify" : "decide";
      return "settle";
    }, { settle: "settle", propose: "propose", decide: "decide", verify: "verify" })
    .addEdge("decide", "settle")
    .addEdge("verify", "settle")
    .addEdge("propose", "settle")
    .addEdge("settle", END);

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
