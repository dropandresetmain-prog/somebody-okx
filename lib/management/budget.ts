// Finite, persisted Objective-wide limits. These exist so an autonomous
// management loop cannot explode even when the model keeps proposing sensible
// but endless work, and so the limits survive a process restart.
//
// Design rules:
//   - a hit limit is a TYPED verdict with a control state, never an exception;
//   - "no progress" is measured against a materially new observation, not wall
//     clock loop count alone;
//   - worker-to-worker recursive creation is structurally zero: only the
//     management controller may consume a worker-creation allowance.

import type {
  BudgetVerdict,
  ManagementState,
  ObjectiveBudget,
} from "./types";

export const DEFAULT_BUDGET_LIMITS: ObjectiveBudget["limits"] = {
  maxWorkersCreated: 6,
  maxActiveAssignments: 4,
  maxManagementDecisions: 40,
  maxWorkerAttemptsPerRequirement: 3,
  maxRetriesPerIntent: 2,
  maxElapsedMs: 45 * 60_000,
  maxModelCalls: 60,
  maxExternalSpendUsd: 1,
  maxNoProgressCycles: 3,
};

export function createBudget(
  objectiveKey: string,
  at: number,
  limits: Partial<ObjectiveBudget["limits"]> = {},
): ObjectiveBudget {
  return {
    objectiveKey,
    limits: { ...DEFAULT_BUDGET_LIMITS, ...limits },
    used: {
      workersCreated: 0,
      activeAssignments: 0,
      managementDecisions: 0,
      modelCalls: 0,
      externalSpendCommittedUsd: 0,
      noProgressCycles: 0,
      attemptsByRequirement: {},
      retriesByIntent: {},
    },
    startedAt: at,
    lastProgressAt: at,
  };
}

// The single pre-check every consequential action must run before acting.
export function checkBudget(
  budget: ObjectiveBudget,
  now: number,
): BudgetVerdict {
  const { limits, used } = budget;
  const fail = (
    limit: string,
    detail: string,
    state: ManagementState,
  ): BudgetVerdict => ({ ok: false, limit, detail, state });

  if (used.managementDecisions >= limits.maxManagementDecisions)
    return fail(
      "maxManagementDecisions",
      `${used.managementDecisions} management decisions reached the ceiling ${limits.maxManagementDecisions}`,
      "recovery_required",
    );
  if (used.modelCalls >= limits.maxModelCalls)
    return fail(
      "maxModelCalls",
      `${used.modelCalls} model calls reached the ceiling ${limits.maxModelCalls}`,
      "recovery_required",
    );
  if (used.noProgressCycles >= limits.maxNoProgressCycles)
    return fail(
      "maxNoProgressCycles",
      `${used.noProgressCycles} consecutive cycles produced no materially new observation`,
      "escalated",
    );
  if (now - budget.startedAt >= limits.maxElapsedMs)
    return fail(
      "maxElapsedMs",
      `objective elapsed ${Math.round((now - budget.startedAt) / 60_000)}m beyond the ${Math.round(limits.maxElapsedMs / 60_000)}m budget`,
      "escalated",
    );
  if (used.activeAssignments >= limits.maxActiveAssignments)
    return fail(
      "maxActiveAssignments",
      `${used.activeAssignments} active assignments at the ceiling ${limits.maxActiveAssignments}`,
      "waiting",
    );
  return { ok: true };
}

// Per-action allowances. Each returns a mutated COPY (pure) plus a typed verdict
// so the caller cannot accidentally spend an unaffordable action.
export type SpendResult =
  | { ok: true; budget: ObjectiveBudget }
  | { ok: false; verdict: BudgetVerdict };

export function trySpendWorkerCreation(budget: ObjectiveBudget): SpendResult {
  if (budget.used.workersCreated >= budget.limits.maxWorkersCreated)
    return no(
      "maxWorkersCreated",
      `${budget.used.workersCreated} workers created, ceiling ${budget.limits.maxWorkersCreated}`,
      "escalated",
    );
  return yes({
    ...budget,
    used: { ...budget.used, workersCreated: budget.used.workersCreated + 1 },
  });
}

export function trySpendDecision(budget: ObjectiveBudget): SpendResult {
  if (budget.used.managementDecisions >= budget.limits.maxManagementDecisions)
    return no(
      "maxManagementDecisions",
      `management decision ceiling ${budget.limits.maxManagementDecisions}`,
      "recovery_required",
    );
  return yes({
    ...budget,
    used: {
      ...budget.used,
      managementDecisions: budget.used.managementDecisions + 1,
      modelCalls: budget.used.modelCalls + 1,
    },
  });
}

// A model call that is NOT a managerial decision (e.g. a worker continuation
// turn) spends the model-call ceiling only. Keeping this separate preserves
// the two independent ceilings: 40 decisions, 60 model calls.
export function trySpendModelCall(budget: ObjectiveBudget): SpendResult {
  if (budget.used.modelCalls >= budget.limits.maxModelCalls)
    return no(
      "maxModelCalls",
      `${budget.used.modelCalls} model calls reached the ceiling ${budget.limits.maxModelCalls}`,
      "recovery_required",
    );
  return yes({
    ...budget,
    used: { ...budget.used, modelCalls: budget.used.modelCalls + 1 },
  });
}

export function tryStartAssignment(budget: ObjectiveBudget): SpendResult {
  if (budget.used.activeAssignments >= budget.limits.maxActiveAssignments)
    return no(
      "maxActiveAssignments",
      `active assignment ceiling ${budget.limits.maxActiveAssignments}`,
      "waiting",
    );
  return yes({
    ...budget,
    used: { ...budget.used, activeAssignments: budget.used.activeAssignments + 1 },
  });
}

export function finishAssignment(budget: ObjectiveBudget): ObjectiveBudget {
  return {
    ...budget,
    used: {
      ...budget.used,
      activeAssignments: Math.max(0, budget.used.activeAssignments - 1),
    },
  };
}

export function tryRequirementAttempt(
  budget: ObjectiveBudget,
  requirementKey: string,
): SpendResult {
  const used = budget.used.attemptsByRequirement[requirementKey] ?? 0;
  if (used >= budget.limits.maxWorkerAttemptsPerRequirement)
    return no(
      "maxWorkerAttemptsPerRequirement",
      `requirement ${requirementKey} used ${used}/${budget.limits.maxWorkerAttemptsPerRequirement} attempts`,
      "escalated",
    );
  return yes({
    ...budget,
    used: {
      ...budget.used,
      attemptsByRequirement: {
        ...budget.used.attemptsByRequirement,
        [requirementKey]: used + 1,
      },
    },
  });
}

export function tryIntentRetry(
  budget: ObjectiveBudget,
  intentId: string,
): SpendResult {
  const used = budget.used.retriesByIntent[intentId] ?? 0;
  if (used >= budget.limits.maxRetriesPerIntent)
    return no(
      "maxRetriesPerIntent",
      `intent ${intentId} used ${used}/${budget.limits.maxRetriesPerIntent} retries; reconcile before any further attempt`,
      "recovery_required",
    );
  return yes({
    ...budget,
    used: {
      ...budget.used,
      retriesByIntent: { ...budget.used.retriesByIntent, [intentId]: used + 1 },
    },
  });
}

// Financial ceiling. Committed spend is tracked BEFORE hand-off so a replayed
// wake cannot commit the same amount twice; callers must key the commit on the
// intent's idempotencyKey.
export function tryCommitSpend(
  budget: ObjectiveBudget,
  amountUsd: number,
): SpendResult {
  if (!Number.isFinite(amountUsd) || amountUsd < 0)
    return no("maxExternalSpendUsd", "invalid spend amount", "recovery_required");
  const next = budget.used.externalSpendCommittedUsd + amountUsd;
  if (next > budget.limits.maxExternalSpendUsd)
    return no(
      "maxExternalSpendUsd",
      `committing $${amountUsd} would exceed the $${budget.limits.maxExternalSpendUsd} boundary (already committed $${budget.used.externalSpendCommittedUsd})`,
      "approval_required",
    );
  return yes({
    ...budget,
    used: { ...budget.used, externalSpendCommittedUsd: next },
  });
}

export function remainingSpendHeadroom(budget: ObjectiveBudget): number {
  return Math.max(
    0,
    budget.limits.maxExternalSpendUsd - budget.used.externalSpendCommittedUsd,
  );
}

// Progress accounting. `progressed` must be decided by the caller from
// materially new observations (a new requirement state, a new verified fact, a
// new artifact version) — never from "the model said something new".
export function recordProgress(budget: ObjectiveBudget, progressed: boolean, at: number): ObjectiveBudget {
  if (progressed)
    return {
      ...budget,
      lastProgressAt: at,
      used: { ...budget.used, noProgressCycles: 0 },
    };
  return {
    ...budget,
    used: { ...budget.used, noProgressCycles: budget.used.noProgressCycles + 1 },
  };
}

function yes(budget: ObjectiveBudget): SpendResult {
  return { ok: true, budget };
}

function no(
  limit: string,
  detail: string,
  state: ManagementState,
): SpendResult {
  return { ok: false, verdict: { ok: false, limit, detail, state } };
}
