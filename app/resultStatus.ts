// Pure decision helper for result acceptance display.
// Extracted from ObjectiveWorkspace.tsx so it can be tested without React.
//
// Contract (§6 of R1_SHARED_CONTRACT.md): the backend read model returns
// `completion: { accepted: boolean; unmet: string[] }`. The UI must NEVER
// default to accepted — fail toward honesty.

export type CompletionField = {
  accepted: boolean;
  unmet: string[];
};

export type ResultDisplayState =
  | { kind: "no_result" }
  | { kind: "not_accepted"; unmet: string[] }
  | { kind: "accepted" };

/**
 * Decide how to display the result section based on the backend completion
 * field and whether a result exists at all.
 *
 * Rules:
 * - No result -> no_result (section hidden)
 * - Result exists but completion is absent or not accepted -> not_accepted
 *   with unmet reasons surfaced (defaulting to a generic message if unmet
 *   is empty — never silently accept)
 * - Result exists and completion.accepted === true -> accepted
 */
export function resolveResultDisplay(
  completion: CompletionField | undefined | null,
  hasResult: boolean,
): ResultDisplayState {
  if (!hasResult) return { kind: "no_result" };
  if (!completion || !completion.accepted) {
    const unmet =
      completion && completion.unmet.length > 0
        ? completion.unmet
        : ["Application has not accepted the proof"];
    return { kind: "not_accepted", unmet };
  }
  return { kind: "accepted" };
}
