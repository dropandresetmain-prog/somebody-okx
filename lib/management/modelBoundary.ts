/**
 * Bounded model-call boundary for serial management actions.
 *
 * Production calls OpenAI structured chat here. Tests may install a double that
 * receives the SAME request shape and returns deterministic JSON — without
 * bypassing proposeInterpretation / proposeDecision / proposeFinalSemanticAssessment.
 *
 * Doubles must never grant authority; they only supply untrusted proposal text.
 *
 * Milestone 2 — shared bounded structural repair. Every MANAGEMENT structured
 * call (interpretation, strategy, recommendation, final assessment) goes through
 * `runRepairableStructuredCall`, which separates three outcomes that must never
 * share one recovery counter:
 *
 *   provider_failure      timeout / rate limit / upstream / empty transport.
 *   structural_rejection  malformed JSON, missing field, wrong enum, illegal id.
 *   semantic_negative     a VALID answer that says "not ready" — never seen here;
 *                         it is a successful call whose value the caller applies.
 *
 * A structurally rejected answer earns ONE corrective re-ask that names the exact
 * rejected fields, the exact validation reasons and any legal values, and tells
 * the model to keep its business judgment. The repair never chooses for the model,
 * invents evidence, or mutates business truth: it only re-asks.
 */

export type StructuredChatKind =
  | "interpretation"
  | "outcome_contract"
  | "requirements"
  | "strategy"
  | "recommendation"
  | "final_assessment";

/** One exact structural problem with a model answer. */
export type StructuralIssue = {
  field: string;
  reason: string;
  /** Exact legal values when the runtime knows the closed set. */
  legalValues?: readonly string[];
};

export type StructuredChatRequest = {
  kind: StructuredChatKind;
  model: string;
  system: string;
  user: string;
  schemaName: string;
  /** Present ONLY on the corrective re-ask. */
  repair?: {
    attempt: number;
    issues: readonly StructuralIssue[];
  };
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
  callLive: (request: StructuredChatRequest) => Promise<unknown>,
): Promise<unknown> {
  if (testDouble) {
    return testDouble(request);
  }
  return callLive(request);
}

// ── Failure typing ──────────────────────────────────────────────────────────

/**
 * The model answered, but not in a usable shape (e.g. unparseable JSON). Thrown
 * by live adapters so the boundary can treat it as STRUCTURAL, not as a provider
 * outage. `rejectedText` is the model's own (bounded) answer, for the repair.
 */
export class StructuralOutputError extends Error {
  readonly rejectedText: string | null;
  constructor(message: string, rejectedText?: string | null) {
    super(message);
    this.name = "StructuralOutputError";
    this.rejectedText = rejectedText ?? null;
  }
}

export type ProviderFailureClass =
  | "timeout"
  | "rate_limit"
  | "upstream_unavailable"
  | "empty_response"
  | "configuration"
  | "other";

/** Transport/provider failure classification. Business semantics never live here. */
export function classifyProviderFailure(error: unknown): ProviderFailureClass {
  const record = (typeof error === "object" && error !== null
    ? (error as Record<string, unknown>)
    : {}) as Record<string, unknown>;
  const status = typeof record.status === "number" ? record.status : null;
  const name = typeof record.name === "string" ? record.name : "";
  const message = (error instanceof Error ? error.message : String(error ?? ""))
    .toLowerCase();
  if (status === 429 || /rate.?limit|too many requests|\b429\b/.test(message))
    return "rate_limit";
  if (
    /timeout|timed out|aborted/.test(message) ||
    name === "APIConnectionTimeoutError" ||
    name === "AbortError"
  )
    return "timeout";
  if (status !== null && status >= 500) return "upstream_unavailable";
  if (
    /econnreset|econnrefused|enotfound|socket|network|fetch failed|unavailable|overloaded|bad gateway|502|503|504/.test(
      message,
    ) ||
    name === "APIConnectionError"
  )
    return "upstream_unavailable";
  if (/empty|no content|no proposal|returned no/.test(message))
    return "empty_response";
  if (/api key|not configured|no model configured|configuration/.test(message))
    return "configuration";
  return "other";
}

/** Model calls made by OUR boundary (logical invocations, not SDK retries). */
export type CallUsage = { logicalCalls: number; repairCalls: number };

export type StructuredCallOutcome<T> =
  | { ok: true; value: T; usage: CallUsage }
  | {
      ok: false;
      failure: "provider_failure";
      failureClass: ProviderFailureClass;
      detail: string;
      usage: CallUsage;
      /** Last structurally rejected raw output, if the failure hit the repair call. */
      lastRaw?: unknown;
    }
  | {
      ok: false;
      failure: "structural_rejection";
      issues: readonly StructuralIssue[];
      detail: string;
      usage: CallUsage;
      /** The last rejected raw output — forwarded for deterministic downstream refusal. */
      lastRaw: unknown;
      /** True when the repair was NOT attempted because global model-call headroom was exhausted. */
      repairVetoed?: boolean;
    };

export type StructuralValidation<T> =
  | { ok: true; value: T }
  | { ok: false; issues: StructuralIssue[] };

/** Default: exactly one corrective structural re-ask per logical call. */
export const MAX_STRUCTURAL_REPAIRS = 1;

const REPAIR_ECHO_LIMIT = 1500;

/** Bounded, structure-preserving preview of a rejected answer for the repair prompt. */
function rejectedPreview(raw: unknown, text: string | null): string {
  let rendered: string;
  if (text !== null) rendered = text;
  else {
    try {
      rendered = JSON.stringify(raw) ?? String(raw);
    } catch {
      rendered = String(raw);
    }
  }
  return rendered.length > REPAIR_ECHO_LIMIT
    ? `${rendered.slice(0, REPAIR_ECHO_LIMIT)}…[rejected answer truncated for display]`
    : rendered;
}

/**
 * The corrective instruction. It states exact problems and legal values and asks
 * the model to keep its judgment — it never supplies a choice.
 */
export function buildRepairInstruction(
  issues: readonly StructuralIssue[],
  rejectedText: string,
): string {
  const lines = [
    "REPAIR REQUEST — your previous response was rejected for STRUCTURE only.",
    "Return the SAME business judgment using the required schema; correct ONLY the invalid structure.",
    "Do not change your conclusion, invent new evidence, or add anything not asked for.",
    "Rejected because:",
  ];
  for (const issue of issues) {
    const legal =
      issue.legalValues && issue.legalValues.length
        ? ` Legal values: ${issue.legalValues.map((value) => JSON.stringify(value)).join(", ")}.`
        : "";
    lines.push(`- ${issue.field}: ${issue.reason}.${legal}`);
  }
  lines.push(`Your rejected response (for reference): ${rejectedText}`);
  return lines.join("\n");
}

type Attempt =
  | { kind: "ok"; raw: unknown }
  | { kind: "structural"; issues: StructuralIssue[]; raw: unknown; text: string | null }
  | { kind: "provider"; failureClass: ProviderFailureClass; detail: string };

async function attemptCall(
  request: StructuredChatRequest,
  callLive: (request: StructuredChatRequest) => Promise<unknown>,
): Promise<Attempt> {
  try {
    const raw = await runStructuredChat(request, callLive);
    return { kind: "ok", raw };
  } catch (error) {
    if (error instanceof StructuralOutputError) {
      return {
        kind: "structural",
        issues: [{ field: "$", reason: error.message }],
        raw: null,
        text: error.rejectedText,
      };
    }
    const detail = (error instanceof Error ? error.message : "model call failed").slice(0, 400);
    return { kind: "provider", failureClass: classifyProviderFailure(error), detail };
  }
}

/**
 * One logical structured call with at most `MAX_STRUCTURAL_REPAIRS` corrective
 * re-asks. `canAffordCall` lets the caller veto a repair when the Objective's
 * global model-call ceiling has no room (ceilings stay authoritative).
 */
export async function runRepairableStructuredCall<T>(input: {
  request: StructuredChatRequest;
  callLive: (request: StructuredChatRequest) => Promise<unknown>;
  validate: (raw: unknown) => StructuralValidation<T>;
  canAffordCall?: (callsSoFar: number) => Promise<boolean> | boolean;
}): Promise<StructuredCallOutcome<T>> {
  const usage: CallUsage = { logicalCalls: 0, repairCalls: 0 };
  let request = input.request;
  let lastRaw: unknown = null;
  let issues: readonly StructuralIssue[] = [];
  let vetoed = false;

  for (let round = 0; round <= MAX_STRUCTURAL_REPAIRS; round += 1) {
    usage.logicalCalls += 1;
    if (round > 0) usage.repairCalls += 1;
    const attempt = await attemptCall(request, input.callLive);

    if (attempt.kind === "provider") {
      return {
        ok: false,
        failure: "provider_failure",
        failureClass: attempt.failureClass,
        detail: attempt.detail,
        usage,
        ...(round > 0 ? { lastRaw } : {}),
      };
    }

    let rejectedText: string | null = null;
    if (attempt.kind === "ok") {
      const checked = input.validate(attempt.raw);
      if (checked.ok) return { ok: true, value: checked.value, usage };
      issues = checked.issues;
      lastRaw = attempt.raw;
    } else {
      issues = attempt.issues;
      lastRaw = attempt.raw;
      rejectedText = attempt.text;
    }

    if (round >= MAX_STRUCTURAL_REPAIRS) break;
    if (input.canAffordCall && !(await input.canAffordCall(usage.logicalCalls))) {
      vetoed = true;
      break;
    }
    request = {
      ...input.request,
      user: `${input.request.user}\n\n${buildRepairInstruction(
        issues,
        rejectedPreview(lastRaw, rejectedText),
      )}`,
      repair: { attempt: round + 1, issues },
    };
  }

  return {
    ok: false,
    failure: "structural_rejection",
    issues,
    detail: issues.map((issue) => `${issue.field}: ${issue.reason}`).join("; ").slice(0, 500),
    usage,
    lastRaw,
    ...(vetoed ? { repairVetoed: true } : {}),
  };
}
