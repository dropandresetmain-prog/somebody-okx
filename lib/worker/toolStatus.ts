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

/** Application/runtime refusal carrying an explicit typed status. */
export class ToolStatusError extends Error {
  readonly toolStatus: SerialToolStatus;
  constructor(status: SerialToolStatus, message: string) {
    super(message);
    this.name = "ToolStatusError";
    this.toolStatus = status;
  }
}

export function isToolStatusError(error: unknown): error is ToolStatusError {
  return error instanceof ToolStatusError;
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
