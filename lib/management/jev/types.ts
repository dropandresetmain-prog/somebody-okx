/**
 * Jev option-selector — narrow input/output vocabulary.
 *
 * This module is a semantic CHOOSER, not an authority. It selects among
 * options the application has already computed as eligible (Stage 1 hard
 * eligibility already ran — see lib/management/types.ts). It must never be
 * asked to determine eligibility, authorization, budget, spend, proof
 * legality, or stale-contract validity; those stay deterministic.
 */
import type { GroundedOption } from "../types";
import type { ProviderFailureClass } from "../modelBoundary";
import type { JevQuestionRubric } from "./questionBuilder";

/** Bounded semantic context about the requirement — never the full row. */
export type JevRequirementContext = {
  requirementKey: string;
  title: string;
  mustBeTrue: string;
  scope: string;
  expectedOutput: string | null;
  requiredResourceClasses: readonly string[];
};

export type JevOptionSelectionInput = {
  requirement: JevRequirementContext;
  /** Already-eligible options only. The adapter never sees ineligible ones. */
  eligible: readonly GroundedOption[];
  /** Wall-clock cap for the gateway call. Defaults to DEFAULT_TIMEOUT_MS. */
  timeoutMs?: number;
  /** J3 baseline vs J3.1 neutral rubric (default baseline). */
  questionRubric?: JevQuestionRubric;
};

export type JevOptionSelectionResult =
  | {
      kind: "selected";
      optionId: string;
      /** Diagnostic only — never authority. Keyed by candidate optionId. */
      probabilities: Record<string, number>;
      confidence: number | null;
    }
  | {
      /** The deterministic no-option guard. Jev is never called in this case. */
      kind: "no_candidates";
    }
  | {
      /** Gateway/provider failure (timeout, rate limit, upstream, etc). */
      kind: "unavailable";
      failureClass: ProviderFailureClass;
      detail: string;
    }
  | {
      /** Jev answered, but the answer failed validation (fail closed). */
      kind: "invalid_response";
      detail: string;
    };
