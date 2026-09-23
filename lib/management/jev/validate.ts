/**
 * Jev is untrusted. This is the ONLY place a raw gateway answer becomes a
 * typed `JevOptionSelectionResult`. Anything that does not exactly match an
 * eligible optionId, or is structurally off, fails closed as
 * "invalid_response" — it never reaches execution.
 */
import type { JevOptionSelectionResult } from "./types";

export function validateJevSelection(
  raw: unknown,
  questionId: string,
  eligibleOptionIds: ReadonlySet<string>,
): JevOptionSelectionResult {
  if (typeof raw !== "object" || raw === null)
    return { kind: "invalid_response", detail: "gateway response is not an object" };

  const answers = (raw as { answers?: unknown }).answers;
  if (typeof answers !== "object" || answers === null)
    return { kind: "invalid_response", detail: "gateway response has no answers" };

  const answer = (answers as Record<string, unknown>)[questionId];
  if (typeof answer !== "object" || answer === null)
    return { kind: "invalid_response", detail: `no answer for question "${questionId}"` };

  const record = answer as Record<string, unknown>;
  if (record.type !== "choice")
    return { kind: "invalid_response", detail: `expected a choice answer, got ${String(record.type)}` };

  const choice = record.choice;
  if (typeof choice !== "string" || choice.length === 0)
    return { kind: "invalid_response", detail: "choice answer names no option id" };
  if (!eligibleOptionIds.has(choice))
    return { kind: "invalid_response", detail: `selected id "${choice}" is not an eligible grounded option` };

  const probabilities: Record<string, number> = {};
  const probabilitiesRaw = record.probabilities;
  if (typeof probabilitiesRaw === "object" && probabilitiesRaw !== null) {
    for (const [id, value] of Object.entries(probabilitiesRaw as Record<string, unknown>)) {
      if (typeof value === "number" && eligibleOptionIds.has(id)) probabilities[id] = value;
    }
  }

  const confidence = typeof probabilities[choice] === "number" ? probabilities[choice] : null;
  return { kind: "selected", optionId: choice, probabilities, confidence };
}
