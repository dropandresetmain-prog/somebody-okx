/**
 * Stage-3 Jev option-selection helpers for the live recommendation seam.
 *
 * Ownership boundary:
 * - Application already computed the eligible GroundedOption set (Stages 1–2).
 * - When JEV_OPTION_SELECTION_ENABLED=true, selection is locked (sole eligible
 *   option, or Jev among eligible IDs). Rationale model must not escape the lock.
 * - Gate OFF preserves unconstrained-among-eligible recommendation.
 * - Gate ON never silently falls back to unconstrained selection.
 * - Stage-4 applyDecision still reloads fresh truth and reauthorizes — unchanged.
 */
import type { GroundedOption } from "./types";
import {
  selectEligibleOption,
  type JevGatewayCall,
  type JevRequirementContext,
} from "./jev";

export const JEV_OPTION_SELECTION_ENV = "JEV_OPTION_SELECTION_ENABLED";

export function isJevOptionSelectionEnabled(
  env: NodeJS.ProcessEnv | Record<string, string | undefined> = process.env,
): boolean {
  return String(env[JEV_OPTION_SELECTION_ENV] ?? "").trim().toLowerCase() === "true";
}

export type LockEligibleOptionSelectionInput = {
  requirement: JevRequirementContext;
  eligible: readonly GroundedOption[];
  timeoutMs?: number;
};

export type LockEligibleOptionSelectionResult =
  | { kind: "no_candidates" }
  | { kind: "selected"; selectedOptionId: string; source: "sole_eligible" | "jev" }
  | {
      kind: "failure";
      detail: string;
      failureClass?: string;
    };

export type LockEligibleOptionSelectionDeps = {
  selectEligibleOption?: typeof selectEligibleOption;
  callGateway?: JevGatewayCall;
};

/**
 * Lock a selectedOptionId among already-eligible options.
 * - zero eligible → no_candidates (Jev never called)
 * - one eligible → sole lock (Jev never called)
 * - several → Jev chooses; unknown/malformed/unavailable → typed failure
 */
export async function lockEligibleOptionSelection(
  input: LockEligibleOptionSelectionInput,
  deps: LockEligibleOptionSelectionDeps = {},
): Promise<LockEligibleOptionSelectionResult> {
  const { eligible, requirement } = input;
  if (eligible.length === 0) return { kind: "no_candidates" };
  if (eligible.length === 1) {
    return {
      kind: "selected",
      selectedOptionId: eligible[0]!.optionId,
      source: "sole_eligible",
    };
  }

  const select = deps.selectEligibleOption ?? selectEligibleOption;
  const jevResult = await select(
    { requirement, eligible, timeoutMs: input.timeoutMs },
    deps.callGateway ? { callGateway: deps.callGateway } : {},
  );

  if (jevResult.kind === "no_candidates") {
    return {
      kind: "failure",
      detail: "jev returned no_candidates despite eligible options",
    };
  }
  if (jevResult.kind === "unavailable") {
    return {
      kind: "failure",
      failureClass: jevResult.failureClass,
      detail: jevResult.detail,
    };
  }
  if (jevResult.kind === "invalid_response") {
    return {
      kind: "failure",
      detail: jevResult.detail,
    };
  }

  const eligibleIds = new Set(eligible.map((option) => option.optionId));
  if (!eligibleIds.has(jevResult.optionId)) {
    return {
      kind: "failure",
      detail: `jev returned unknown option id: ${jevResult.optionId}`,
    };
  }

  return {
    kind: "selected",
    selectedOptionId: jevResult.optionId,
    source: "jev",
  };
}

/**
 * After Jev/sole lock, the rationale model must echo the locked selectedOptionId.
 * A different ID is a typed refusal — never silently adopted.
 */
export function assertRationaleHonorsLockedSelection(
  lockedOptionId: string,
  selectedOptionId: unknown,
): { ok: true } | { ok: false; detail: string } {
  if (typeof selectedOptionId !== "string" || selectedOptionId !== lockedOptionId) {
    return {
      ok: false,
      detail: `rationale model returned selectedOptionId ${JSON.stringify(selectedOptionId)} after lock ${JSON.stringify(lockedOptionId)}`,
    };
  }
  return { ok: true };
}
