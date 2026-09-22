// Shared Objective request bounds / normalization for Product Command + legacy
// submitObjective. Pure — safe for React and Convex.

export const OBJECTIVE_REQUEST_MIN_CHARS = 8;
export const OBJECTIVE_REQUEST_MAX_CHARS = 2000;

export type NormalizedObjectiveRequest =
  | { ok: true; request: string }
  | { ok: false; message: string };

/** Trim + bound the founder request the same way submitObjective always has. */
export function normalizeObjectiveRequest(raw: string): NormalizedObjectiveRequest {
  const request = raw.trim();
  if (request.length < OBJECTIVE_REQUEST_MIN_CHARS) {
    return { ok: false, message: "Describe the objective in at least 8 characters" };
  }
  if (request.length > OBJECTIVE_REQUEST_MAX_CHARS) {
    return { ok: false, message: "Objective is not bounded (max 2000 characters)" };
  }
  return { ok: true, request };
}
