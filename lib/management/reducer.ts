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
  | { kind: "await_wake"; reason: string }
  | { kind: "hold"; state: ManagementState; reason: string };

export type ReducedState = {
  state: ManagementState;
  action: ManagementAction;
  detail: string;
};

const ACTIVE_ASSIGNMENT_STATES = new Set(["dispatched", "running", "result_submitted"]);
const OPEN_INTENT_STATES = new Set(["authorized", "handed_off", "awaiting_m3", "result_recorded"]);

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
  const groundedKnown = (requirement: Requirement) =>
    groundedByRequirement.has(requirement.requirementKey);
  const solvable = open.filter((requirement) => {
    if (!groundedKnown(requirement)) return true; // undecided ⇒ work to do
    const grounded = groundedByRequirement.get(requirement.requirementKey) ?? [];
    return grounded.some((option) => option.eligibility.eligible);
  });
  const stuck = open.filter((requirement) => requirement.state === "blocked");
  if (solvable.length === 0 && open.length > 0) {
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

  // 9. Work in flight — wake carries it forward, no new model invocations.
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
export function isCoherentHold(reduced: ReducedState): boolean {
  if (!isQuiescent(reduced.state)) return true;
  return reduced.action.kind === "await_wake" || reduced.action.kind === "hold";
}
