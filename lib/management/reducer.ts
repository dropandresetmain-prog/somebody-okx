// Control-state reducer — the generic rule that replaces the M2
// completion-by-worker inference (convex/objectives.ts finishRead-style
// growth rules). Pure, total, and scenario-free: given the CURRENT facts,
// it produces the one management state and the next permitted action. The
// LangGraph loop (CP4) calls this after every wake; Convex stores its output
// but never derives it — derivation stays here so it is unit-testable.
//
// Priority is deliberate and fixed (first match wins):
//   1. budget verdict (recovery_required / escalated / waiting)
//   2. no contract yet            → planning
//   3. unresolved material ambiguity → approval_required
//   4. pending founder approval (waiver / spend bound) → approval_required
//   5. accepted completion verdict → completed   (gate decides, not this file)
//   6. rejected completion verdict → its routed state (executing/blocked/
//      recovery_required) — stale revision proposals land recovery_required
//   7. all required resolved, none proposed yet → propose_completion
//   8. every open requirement has no eligible path → blocked
//   9. work in flight (running assignments / nonterminal intents) → executing
//  10. waiting on schedule/external facts only → waiting
//  11. open requirements with executable paths → executing (decide next pass)

import { openRequired } from "./requirements";
import { strategyDelivery } from "./dispatch";
import type {
  Assignment,
  BudgetVerdict,
  CompletionVerdict,
  ExecutionIntent,
  GroundedOption,
  ManagementState,
  OutcomeContract,
  Requirement,
} from "./types";
import { isQuiescent } from "./types";

export type ReducerFacts = {
  contract: OutcomeContract | null;
  currentContractRevision: number;
  requirements: readonly Requirement[];
  // Eligibility verdicts from the LAST grounding pass (fresh Convex reload,
  // keyed by requirement). Absent = never grounded this revision.
  groundedByRequirement: ReadonlyMap<string, readonly GroundedOption[]>;
  assignments: readonly Assignment[];
  intents: readonly ExecutionIntent[];
  budgetVerdict: BudgetVerdict;
  pendingApproval: { question: string } | null;
  completionProposal: CompletionVerdict | null; // latest gate verdict, if proposed
  at: number;
};

export type ManagementAction =
  | { kind: "plan_contract" }
  | { kind: "ask_founder"; question: string }
  | { kind: "propose_completion" }
  | { kind: "decide_requirement"; requirementKey: string }
  | { kind: "dispatch"; requirementKey: string }
  // R3 A2 — a run or provider result that has REACHED the application but has
  // not been verified yet. Routing on this explicit action is what replaces the
  // stale `lastNode === "decide"` test that made the verify node unreachable.
  | { kind: "verify_requirement"; requirementKey: string }
  | { kind: "await_wake"; reason: string }
  | { kind: "hold"; state: ManagementState; reason: string };

export type ReducedState = {
  state: ManagementState;
  action: ManagementAction;
  detail: string;
};

const ACTIVE_ASSIGNMENT_STATES = new Set(["dispatched", "running", "result_submitted"]);
const OPEN_INTENT_STATES = new Set(["authorized", "handed_off", "awaiting_m3", "result_recorded"]);

// Strategies that commit EXECUTION. WAIT / ASK_FOUNDER / BLOCK bind a strategy
// too (that is how the engine records "we are deliberately not acting"), but
// they have nothing to dispatch — treating them as dispatchable would be a way
// to manufacture work out of a hold.
const DISPATCHABLE_STRATEGIES = new Set(["MAKE", "BUY", "HYBRID"]);

export function reduceManagementState(facts: ReducerFacts): ReducedState {
  const {
    contract,
    currentContractRevision,
    requirements,
    groundedByRequirement,
    assignments,
    intents,
    budgetVerdict,
    pendingApproval,
    completionProposal,
  } = facts;

  // 1. Budget ceilings are the outermost guard: nothing proceeds past them.
  if (!budgetVerdict.ok)
    return {
      state: budgetVerdict.state,
      action: { kind: "hold", state: budgetVerdict.state, reason: `budget ${budgetVerdict.limit}` },
      detail: `budget limit ${budgetVerdict.limit}: ${budgetVerdict.detail}`,
    };

  // 2. No contract = nothing to manage yet. Planning is the M2-compatible name.
  if (!contract)
    return {
      state: "planning",
      action: { kind: "plan_contract" },
      detail: "no Outcome Contract exists for the current revision",
    };
  if (contract.revision !== currentContractRevision)
    return {
      state: "recovery_required",
      action: { kind: "hold", state: "recovery_required", reason: "contract revision mismatch" },
      detail: `facts carry contract r${contract.revision} but current revision is r${currentContractRevision}`,
    };

  const current = requirements.filter(
    (requirement) => requirement.contractRevision === currentContractRevision,
  );

  // 3. Material ambiguity outranks all work: acting without the founder's
  //    answer is the hallucinated-authority failure M4 exists to prevent.
  const ambiguity = contract.ambiguities.find(
    (entry) => entry.materiality === "material" && entry.requiresFounderApproval,
  );
  if (ambiguity)
    return {
      state: "approval_required",
      action: { kind: "ask_founder", question: ambiguity.question },
      detail: `material ambiguity unresolved: ${ambiguity.question}`,
    };

  // 4. A founder question already pending (waiver, spend bound) parks the loop.
  if (pendingApproval)
    return {
      state: "approval_required",
      action: { kind: "await_wake", reason: "approval_resolved" },
      detail: `waiting on founder: ${pendingApproval.question}`,
    };

  // 5–6. A completion proposal is decided by the GATE, and this reducer just
  //      honours its verdict — accepted completes, rejected routes onward.
  if (completionProposal) {
    if (completionProposal.accepted)
      return {
        state: "completed",
        action: { kind: "hold", state: "completed", reason: "completion accepted by gate" },
        detail: `gate accepted completion; disclosed ${completionProposal.disclosedPendingSupporting.length} pending supporting item(s)`,
      };
    if (completionProposal.objectiveState === "recovery_required")
      return {
        state: "recovery_required",
        action: { kind: "hold", state: "recovery_required", reason: "gate demanded recovery" },
        detail: completionProposal.unmet.join("; "),
      };
    // fall through with the gate's rejection informing the state below
  }

  const open = openRequired(current);

  // 7a. The gate rejected completion even though every required row reads
  //     "satisfied": proof went stale against the current revision. A
  //     satisfied row cannot be silently re-satisfied (requirements.ts owns
  //     that), so this needs a deliberate re-decision — an honest
  //     recovery_required, never a re-propose loop.
  if (completionProposal && !completionProposal.accepted && open.length === 0)
    return {
      state: "recovery_required",
      action: {
        kind: "hold",
        state: "recovery_required",
        reason: "completion gate rejected despite no open requirements",
      },
      detail: completionProposal.unmet.join("; "),
    };

  // 7. Everything required is resolved — Somebody may only PROPOSE; the gate
  //    (CP1) accepts. Until a verdict exists, propose exactly once per revision.
  if (open.length === 0 && !completionProposal)
    return {
      state: "executing",
      action: { kind: "propose_completion" },
      detail: "all required requirements resolved; completion must pass the independent gate",
    };

  // 8. No executable path anywhere. IMPORTANT distinction: a requirement with
  //    NO grounding entry has simply never been decided for this revision —
  //    that is decision work, not a dead end. Only requirements that HAVE been
  //    grounded and produced no eligible option count toward "no path".
  //    Explicit dependsOn edges block decide/dispatch until those keys resolve
  //    (satisfied/waived) — lexical req_01 ordering is not enough alone.
  const byKey = new Map(current.map((requirement) => [requirement.requirementKey, requirement]));
  const prerequisitesMet = (requirement: Requirement): boolean => {
    const deps = requirement.dependsOnRequirementKeys ?? [];
    if (!deps.length) return true;
    return deps.every((dep) => {
      const row = byKey.get(dep);
      return !!row && (row.state === "satisfied" || row.state === "waived");
    });
  };
  const groundedKnown = (requirement: Requirement) =>
    groundedByRequirement.has(requirement.requirementKey);
  const solvable = open.filter((requirement) => {
    if (!prerequisitesMet(requirement)) return false;
    if (!groundedKnown(requirement)) return true; // undecided ⇒ work to do
    const grounded = groundedByRequirement.get(requirement.requirementKey) ?? [];
    return grounded.some((option) => option.eligibility.eligible);
  });
  const waitingOnDeps = open.filter((requirement) => !prerequisitesMet(requirement));
  const stuck = open.filter((requirement) => requirement.state === "blocked");
  if (solvable.length === 0 && open.length > 0) {
    if (waitingOnDeps.length === open.length) {
      return {
        state: "waiting",
        action: { kind: "await_wake", reason: "timeout" },
        detail: `open requirements wait on unresolved prerequisites: ${waitingOnDeps
          .map((r) => r.requirementKey)
          .join(", ")}`,
      };
    }
    return {
      state: stuck.length ? "blocked" : "waiting",
      action: {
        kind: "await_wake",
        reason: stuck.length ? "recovery_event" : "timeout",
      },
      detail: stuck.length
        ? `no eligible path; ${stuck.length} requirement(s) blocked: ${stuck.map((r) => r.requirementKey).join(", ")}`
        : "no eligible path currently exists for any open requirement",
    };
  }

  // 8b. R3 A2 — VERIFICATION TIME.
  //
  // A submitted worker result or a recorded provider result is DATA, not
  // satisfaction (requirements.ts refuses `assignment_run_finished`; only an
  // accepted, proof-bearing resolution satisfies). The engine must still RUN the
  // verification step for those rows, and it must be reachable from business
  // state — which is exactly what the graph's dead `verify` node needed.
  const needsVerification = current.find((requirement) => {
    if (requirement.state === "satisfied" || requirement.state === "superseded") return false;
    const assignmentIn = assignments.filter(
      (assignment) => assignment.requirementKey === requirement.requirementKey,
    );
    if (assignmentIn.some((assignment) => assignment.state === "result_submitted")) return true;
    const intentsIn = intents.filter((intent) => intent.requirementKey === requirement.requirementKey);
    // `result_recorded` awaits verification of a provider result. `verified`
    // routes here too: satisfaction itself only counts verified intents
    // (external_result_verified), so a verified intent without a satisfaction
    // attempt yet must still reach the verify step, not stall forever.
    return intentsIn.some(
      (intent) =>
        intent.state === "result_recorded" || intent.state === "verified",
    );
  });
  if (needsVerification)
    return {
      state: "executing",
      action: { kind: "verify_requirement", requirementKey: needsVerification.requirementKey },
      detail: `${needsVerification.requirementKey} has an unverified result; verifying against current proof`,
    };

  // 9. R3 A2 — AUTHORIZED BUT NOT DELIVERED.
  //
  // A decision pass that authorizes a strategy BINDS it onto the requirement
  // (decision.ts does that; nothing else may). Until CP8 nothing read that fact
  // back, so the engine decided and then simply waited forever: the reducer had a
  // `dispatch` action in its union that no rule ever returned, and
  // reserveWorker/putAssignment/createIntentFromAuthorization/putIntent had zero
  // production callers. An authorized plan that is never executed is a
  // false-completion machine waiting to happen.
  //
  // The signal is therefore business state, not graph memory: a current-revision
  // requirement that is still `active`, carries an executable strategy, and whose
  // effect rows are MISSING. `strategyDelivery` says what missing means per
  // strategy — MAKE needs an assignment, BUY needs an intent, HYBRID needs BOTH —
  // so a half-delivered hybrid is still recognised as work to do rather than work
  // in flight. That is a fact this reducer re-reads every pass, so a replayed wake
  // recomputes the same conclusion and the dispatch itself is idempotent on stable
  // identity (I4) rather than relying on this node having run exactly once.
  const undelivered = [...current]
    .filter(
      (requirement) =>
        prerequisitesMet(requirement) &&
        requirement.state === "active" &&
        DISPATCHABLE_STRATEGIES.has(requirement.strategy ?? "") &&
        !strategyDelivery(requirement.strategy, {
          assignmentStates: assignments
            .filter((assignment) => assignment.requirementKey === requirement.requirementKey)
            .map((assignment) => assignment.state),
          intentStates: intents
            .filter((intent) => intent.requirementKey === requirement.requirementKey)
            .map((intent) => intent.state),
        }).delivered,
    )
    // Same stable order the decision rule uses: required before supporting,
    // then by key. Never insertion order, so a replay dispatches the same thing.
    .sort(
      (a, b) =>
        (a.priority === b.priority ? 0 : a.priority === "required" ? -1 : 1) ||
        a.requirementKey.localeCompare(b.requirementKey),
    )[0];
  if (undelivered)
    return {
      state: "executing",
      action: { kind: "dispatch", requirementKey: undelivered.requirementKey },
      detail: `authorized ${undelivered.strategy} for ${undelivered.requirementKey} is not fully delivered; dispatching`,
    };

  // 10. Work in flight — wake carries it forward, no new model invocations.
  const activeWork =
    assignments.some((assignment) => ACTIVE_ASSIGNMENT_STATES.has(assignment.state)) ||
    intents.some((intent) => OPEN_INTENT_STATES.has(intent.state));
  if (activeWork)
    return {
      state: intents.some((intent) => intent.state === "awaiting_m3")
        ? "waiting_for_resource"
        : "executing",
      action: { kind: "await_wake", reason: "work in flight" },
      detail: "assignment or intent in flight; awaiting its event",
    };

  // 10–11. Decision time for the first open, solvable requirement (stable
  //        order: contract priority then key — never insertion order).
  const next = [...solvable].sort(
    (a, b) =>
      (a.priority === b.priority ? 0 : a.priority === "required" ? -1 : 1) ||
      a.requirementKey.localeCompare(b.requirementKey),
  )[0];
  return {
    state: "executing",
    action: { kind: "decide_requirement", requirementKey: next.requirementKey },
    detail: `grounded decision pass needed for ${next.requirementKey}`,
  };
}

// Invariant the graph asserts on every transition (and Cutoff-2 tests hammer):
// a quiescent state NEVER carries a model-invoking or effect-making action.
// `ask_founder` is the coherent park for unresolved material ambiguity — it
// invokes no model and mints no effect; omitting it made every material
// ambiguity crash the management pass instead of waiting for the founder.
export function isCoherentHold(reduced: ReducedState): boolean {
  if (!isQuiescent(reduced.state)) return true;
  return (
    reduced.action.kind === "await_wake" ||
    reduced.action.kind === "hold" ||
    reduced.action.kind === "ask_founder"
  );
}
