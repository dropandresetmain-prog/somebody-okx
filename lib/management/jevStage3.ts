/**
 * Stage-3 Jev bounded-selector composition for the live recommendation seam
 * (J4 — build/jev-v7-controlled-stage3).
 *
 * Ownership boundary:
 * - Application already computed the eligible GroundedOption set (Stages 1-2).
 * - Gate OFF: this module is not consulted at all. The runner preserves the
 *   incumbent `recommendWithModel(eligible)` path exactly.
 * - Gate ON:
 *     zero eligible  -> caller's own existing deterministic no-option guard
 *                        handles this before composeBoundedStage3Recommendation
 *                        is even called (kept here too, defensively).
 *     one eligible   -> deterministic sole-eligible selection routed straight
 *                        through the J2 bridge. No Jev call, no incumbent call.
 *     >= 2 eligible  -> a single bounded Jev call among exactly the eligible
 *                        IDs, using the J3.1 neutral managerial rubric. A
 *                        valid selection goes straight through the J2 bridge
 *                        — NO second generative rationale call ever runs
 *                        after a valid bounded selection exists.
 * - Fallback to the incumbent recommender is allowed ONLY for a PRE-SELECTION
 *   technical/provider failure (gateway unavailable, timeout, malformed
 *   response, unknown/unusable returned id). It is never used to route
 *   around an application/policy outcome (bridge identity/revision mismatch,
 *   authorization refusal, etc.) — those remain normal Reliability V7
 *   refusals, decided entirely downstream of this module.
 */
import type { GroundedOption, ManagerialRecommendation } from "./types";
import {
  buildJevManagerialRecommendation,
  type JevRecommendationBridgeFailureReason,
} from "./jev/buildManagerialRecommendation";
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

export type Stage3ComposeInput = {
  requirementKey: string;
  contractRevision: number;
  requirement: JevRequirementContext;
  /** Already-eligible grounded options for this requirement/revision. */
  eligible: readonly GroundedOption[];
  timeoutMs?: number;
};

export type Stage3ComposeDeps = {
  selectEligibleOption?: typeof selectEligibleOption;
  callGateway?: JevGatewayCall;
};

export type Stage3ComposeResult =
  | { kind: "no_candidates" }
  | {
      kind: "recommendation";
      recommendation: ManagerialRecommendation;
      source: "sole_eligible" | "jev";
    }
  | {
      /** PRE-SELECTION technical/provider failure — the only fallback-eligible case. */
      kind: "technical_failure";
      failureClass?: string;
      detail: string;
    }
  | {
      /** Application-truth failure (identity/revision/duplicate-id, etc). Fail closed, no fallback. */
      kind: "bridge_failure";
      reason: JevRecommendationBridgeFailureReason;
      detail: string;
    };

/**
 * Route Stage-3 selection among already-eligible options:
 *   0 eligible -> no_candidates (Jev never called)
 *   1 eligible -> deterministic sole-eligible selection via the J2 bridge
 *   N eligible -> exactly one bounded Jev call; a valid selection goes
 *                 straight through the J2 bridge (no rationale model, ever)
 *
 * Callers decide fallback: `technical_failure` is the ONLY result kind for
 * which invoking the incumbent recommender is permitted, and at most once.
 */
export async function composeBoundedStage3Recommendation(
  input: Stage3ComposeInput,
  deps: Stage3ComposeDeps = {},
): Promise<Stage3ComposeResult> {
  const { eligible, requirement, requirementKey, contractRevision } = input;

  if (eligible.length === 0) return { kind: "no_candidates" };

  if (eligible.length === 1) {
    const bridge = buildJevManagerialRecommendation({
      requirementKey,
      contractRevision,
      eligible,
      selection: { optionId: eligible[0]!.optionId, probabilities: {}, confidence: null },
      source: "sole_eligible",
    });
    if (!bridge.ok) return { kind: "bridge_failure", reason: bridge.reason, detail: bridge.detail };
    return { kind: "recommendation", recommendation: bridge.recommendation, source: "sole_eligible" };
  }

  const select = deps.selectEligibleOption ?? selectEligibleOption;
  const jevResult = await select(
    { requirement, eligible, timeoutMs: input.timeoutMs, questionRubric: "neutral" },
    deps.callGateway ? { callGateway: deps.callGateway } : {},
  );

  if (jevResult.kind === "no_candidates") {
    // Unreachable given eligible.length >= 2 here; fail closed as technical
    // rather than assume any particular option.
    return {
      kind: "technical_failure",
      detail: "jev returned no_candidates despite eligible options",
    };
  }
  if (jevResult.kind === "unavailable") {
    return { kind: "technical_failure", failureClass: jevResult.failureClass, detail: jevResult.detail };
  }
  if (jevResult.kind === "invalid_response") {
    return { kind: "technical_failure", detail: jevResult.detail };
  }

  const eligibleIds = new Set(eligible.map((option) => option.optionId));
  if (!eligibleIds.has(jevResult.optionId)) {
    // Unknown/unusable answer BEFORE a valid bounded selection exists —
    // technical fallback territory, not a policy bypass.
    return {
      kind: "technical_failure",
      detail: `jev returned unknown option id: ${jevResult.optionId}`,
    };
  }

  const bridge = buildJevManagerialRecommendation({
    requirementKey,
    contractRevision,
    eligible,
    selection: {
      optionId: jevResult.optionId,
      probabilities: jevResult.probabilities,
      confidence: jevResult.confidence,
    },
    source: "jev",
  });
  if (!bridge.ok) return { kind: "bridge_failure", reason: bridge.reason, detail: bridge.detail };
  return { kind: "recommendation", recommendation: bridge.recommendation, source: "jev" };
}
