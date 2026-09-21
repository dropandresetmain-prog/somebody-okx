/**
 * Bounded model-call boundary for serial management actions.
 *
 * Production calls OpenAI structured chat here. Tests may install a double that
 * receives the SAME request shape and returns deterministic JSON — without
 * bypassing proposeInterpretation / proposeDecision / proposeFinalSemanticAssessment.
 *
 * Doubles must never grant authority; they only supply untrusted proposal text.
 */

export type StructuredChatKind =
  | "interpretation"
  | "strategy"
  | "recommendation"
  | "final_assessment";

export type StructuredChatRequest = {
  kind: StructuredChatKind;
  model: string;
  system: string;
  user: string;
  schemaName: string;
};

export type StructuredChatDouble = (
  request: StructuredChatRequest,
) => Promise<unknown> | unknown;

let testDouble: StructuredChatDouble | null = null;

/** Test-only: install or clear a structured-chat double. */
export function installStructuredChatDouble(
  handler: StructuredChatDouble | null,
): void {
  testDouble = handler;
}

export function structuredChatDoubleInstalled(): boolean {
  return testDouble !== null;
}

/**
 * Run a structured chat completion. When a test double is installed it is used
 * and `callLive` is never invoked (no network).
 */
export async function runStructuredChat(
  request: StructuredChatRequest,
  callLive: () => Promise<unknown>,
): Promise<unknown> {
  if (testDouble) {
    return testDouble(request);
  }
  return callLive();
}
