import { runManagerialDecisionPass, type DecisionPassInput } from "../../decision";
import { eligibleOptions } from "../../options";
import type { GroundedOption } from "../../types";
import type { JevRequirementContext } from "../types";

export type CapturedBoundary = {
  requirement: JevRequirementContext;
  contractRevision: number;
  eligible: GroundedOption[];
  allOptions: GroundedOption[];
};

export function requirementContextFromPassInput(
  input: DecisionPassInput,
): JevRequirementContext {
  return {
    requirementKey: input.requirementKey,
    title: input.requirementTitle,
    mustBeTrue: input.mustBeTrue,
    scope: input.expectedOutput ?? input.mustBeTrue,
    expectedOutput: input.expectedOutput,
    requiredResourceClasses: input.requiredResourceClasses,
  };
}

/** Capture the exact Stage-3 boundary without invoking a real recommend model. */
export async function captureRecommendationBoundary(
  input: DecisionPassInput,
): Promise<CapturedBoundary> {
  let capturedEligible: GroundedOption[] = [];
  let allOptions: GroundedOption[] = [];
  await runManagerialDecisionPass({
    ...input,
    recommend: async (eligible) => {
      capturedEligible = [...eligible];
      const first = eligible[0];
      return {
        requirementKey: input.requirementKey,
        contractRevision: input.currentContractRevision,
        selectedOptionId: first?.optionId ?? "opt_capture_stub",
        rationale: "shadow-eval capture stub",
        materialAssumptions: [],
        changeMyMindEvidence: [],
      };
    },
  }).then((result) => {
    allOptions = result.options;
    if (capturedEligible.length === 0) {
      capturedEligible = eligibleOptions(result.options);
    }
  });
  return {
    requirement: requirementContextFromPassInput(input),
    contractRevision: input.currentContractRevision,
    eligible: capturedEligible,
    allOptions,
  };
}
