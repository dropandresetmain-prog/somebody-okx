/**
 * Builds the single `choice` question Jev answers: pick ONE of the exact
 * supplied option IDs. Jev never independently chooses strategy/provider/
 * offering and never gets room to invent an id — the criteria keys ARE the
 * closed set of legal answers.
 */
import type { GroundedOption } from "../types";
import type { JevGatewayQuestion } from "./client";

export const SELECTION_QUESTION_ID = "selectedOption";

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
): JevGatewayQuestion {
  const criteria: Record<string, string> = {};
  for (const option of eligible) criteria[option.optionId] = describeOptionForCriteria(option);
  return {
    type: "choice",
    instructions:
      "Choose exactly one optionId from the keys of `criteria`, using state.requirement and state.options for full comparable facts. Answer with the exact optionId string — never invent one.",
    criteria,
  };
}
