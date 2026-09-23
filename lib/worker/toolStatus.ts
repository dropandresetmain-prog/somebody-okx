/**
 * Bounded serial tool/application outcome status.
 * Serial path must not infer these by searching error prose.
 */
export type SerialToolStatus =
  | "accepted"
  | "refused"
  | "unavailable"
  | "stale"
  | "transient_error"
  | "idempotent_replay";

// Convex reduces an error thrown inside a mutation to a MESSAGE by the time an
// action's `runMutation` rejects, so class identity alone cannot carry the typed
// status across that boundary. The status therefore travels as a stable marker
// prefix on the message and is decoded by `toolStatusOf`. Prose is never searched.
const STATUS_MARKER = /(?:^|Uncaught ToolStatusError: )\[\[tool_status:(refused|stale|unavailable)\]\]\s*/;
const MARKED: ReadonlySet<SerialToolStatus> = new Set(["refused", "stale", "unavailable"]);

/** Application/runtime rejection carrying an explicit typed status. */
export class ToolStatusError extends Error {
  readonly toolStatus: SerialToolStatus;
  readonly cleanMessage: string;
  constructor(status: SerialToolStatus, message: string) {
    super(MARKED.has(status) ? `[[tool_status:${status}]] ${message}` : message);
    this.name = "ToolStatusError";
    this.toolStatus = status;
    this.cleanMessage = message;
  }
}

export function isToolStatusError(error: unknown): error is ToolStatusError {
  return error instanceof ToolStatusError;
}

/**
 * Classify a thrown value at the tool boundary:
 *   deterministic application rejection  → refused
 *   stale authority                      → stale
 *   true unsupported / unavailable path  → unavailable
 *   anything else (infra, provider, unknown) → transient_error
 * Never turns an arbitrary exception into `refused`.
 */
export function toolStatusOf(error: unknown): {
  status: SerialToolStatus;
  message: string;
} {
  if (isToolStatusError(error))
    return { status: error.toolStatus, message: error.cleanMessage };
  const raw = error instanceof Error ? error.message : "Tool action failed";
  const match = STATUS_MARKER.exec(raw);
  if (match) {
    const at = match.index + match[0].length;
    return { status: match[1] as SerialToolStatus, message: raw.slice(at).trim() };
  }
  return { status: "transient_error", message: raw };
}

/** Wrap a successful serial tool payload with an explicit status. */
export function serialAcceptedResult(result: unknown): string {
  return JSON.stringify({ status: "accepted" as const, result });
}

export function serialStatusResult(
  status: SerialToolStatus,
  detail: string,
  extra?: Record<string, unknown>,
): string {
  return JSON.stringify({ status, detail, ...(extra ?? {}) });
}
