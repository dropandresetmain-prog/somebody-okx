/**
 * The narrow Jev adapter: choose one ID among already-eligible options.
 *
 * This does NOT sit behind the live `recommend` seam yet (see
 * ../decision.ts). It is a standalone, transplantable unit: given eligible
 * GroundedOptions and bounded requirement context, it returns a typed
 * selection or a typed failure — never a fallback, never a fabricated
 * ManagerialRecommendation. Translating a "selected" result into a
 * ManagerialRecommendation is owned by buildJevManagerialRecommendation —
 * still not wired into the live recommend seam.
 */
import { classifyProviderFailure } from "../modelBoundary";
import { callJevGateway, type JevGatewayCall } from "./client";
import { buildOptionChoiceQuestion, SELECTION_QUESTION_ID } from "./questionBuilder";
import { buildOptionSelectionState } from "./stateBuilder";
import type { JevOptionSelectionInput, JevOptionSelectionResult } from "./types";
import { validateJevSelection } from "./validate";

const DEFAULT_TIMEOUT_MS = 15_000;

export async function selectEligibleOption(
  input: JevOptionSelectionInput,
  deps: { callGateway?: JevGatewayCall } = {},
): Promise<JevOptionSelectionResult> {
  const { eligible, requirement } = input;

  // The critical invariant: zero eligible options means Jev is never called.
  // This preserves the existing deterministic no-option guard in decision.ts.
  if (eligible.length === 0) return { kind: "no_candidates" };

  const eligibleOptionIds = new Set(eligible.map((option) => option.optionId));
  const state = buildOptionSelectionState(requirement, eligible);
  const question = buildOptionChoiceQuestion(eligible, input.questionRubric ?? "baseline");
  const callGateway = deps.callGateway ?? callJevGateway;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), input.timeoutMs ?? DEFAULT_TIMEOUT_MS);
  try {
    const raw = await callGateway({
      state,
      questions: { [SELECTION_QUESTION_ID]: question },
      abortSignal: controller.signal,
    });
    return validateJevSelection(raw, SELECTION_QUESTION_ID, eligibleOptionIds);
  } catch (error) {
    return {
      kind: "unavailable",
      failureClass: classifyProviderFailure(error),
      detail: (error instanceof Error ? error.message : String(error)).slice(0, 400),
    };
  } finally {
    clearTimeout(timeout);
  }
}
