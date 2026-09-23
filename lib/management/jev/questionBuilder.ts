/**
 * Builds the single `choice` question Jev answers: pick ONE of the exact
 * supplied option IDs. Jev never independently chooses strategy/provider/
 * offering and never gets room to invent an id — the criteria keys ARE the
 * closed set of legal answers.
 */
import type { GroundedOption } from "../types";
import type { JevGatewayQuestion } from "./client";

export const SELECTION_QUESTION_ID = "selectedOption";

export type JevQuestionRubric = "baseline" | "neutral";

export const BASELINE_CHOICE_INSTRUCTIONS =
  "Choose exactly one optionId from the keys of `criteria`, using state.requirement and state.options for full comparable facts. Answer with the exact optionId string — never invent one.";

/** J3.1 neutral managerial rubric — no inherent MAKE/BUY/HYBRID preference. */
export const NEUTRAL_CHOICE_INSTRUCTIONS = `Choose exactly one optionId from the keys of \`criteria\`, using state.requirement and state.options.

Choose the eligible option that best satisfies the requirement using only the supplied facts. No strategy or option kind is inherently preferred: MAKE, BUY, HYBRID, internal and external options start neutral.

Compare only known decision-relevant facts such as requirement fit, quality, reliability, total known time (setup, queue, execution, verification where present), known cost, availability, reuse value, and documented external advantage.

Do not treat missing or null facts as zero or as evidence for or against an option.

If one option is no worse than every other on all known comparable dimensions and strictly better on at least one, prefer that dominating option.

When real tradeoffs remain among known facts, choose the option best supported by the supplied facts rather than applying an inherent MAKE or BUY preference.

Answer with the exact optionId string — never invent one.`;

function describeOptionForCriteria(option: GroundedOption): string {
  const parts = [`${option.kind} option (strategy ${option.strategy}).`];
  if (option.internal) {
    parts.push(
      `Internal capability: ${option.internal.capabilityKeys.join(", ") || "none"}, worker ${
        option.internal.workerKey ?? "to be created"
      }.`,
    );
  }
  if (option.external) {
    const price = option.external.priceUsd != null ? `$${option.external.priceUsd}` : "unpriced";
    parts.push(
      `External offering ${option.external.offeringId ?? "unknown"} from ${
        option.external.providerId ?? "unknown provider"
      } at ${price}.`,
    );
  }
  return parts.join(" ");
}

export function buildOptionChoiceQuestion(
  eligible: readonly GroundedOption[],
  rubric: JevQuestionRubric = "baseline",
): JevGatewayQuestion {
  const criteria: Record<string, string> = {};
  for (const option of eligible) criteria[option.optionId] = describeOptionForCriteria(option);
  return {
    type: "choice",
    instructions:
      rubric === "neutral" ? NEUTRAL_CHOICE_INSTRUCTIONS : BASELINE_CHOICE_INSTRUCTIONS,
    criteria,
  };
}
