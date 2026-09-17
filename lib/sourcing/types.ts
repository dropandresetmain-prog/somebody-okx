/**
 * M2 Sourcing Policy Kernel — Type Definitions
 *
 * This module defines the vocabulary for deterministic Make-vs-Buy sourcing decisions.
 * The kernel is scenario-independent, pure, and side-effect free.
 *
 * KEY DESIGN PRINCIPLES:
 * 1. Factual inventory is the ONLY ownership authority. Catalog membership does not imply control.
 * 2. Every required resource must be validated against a kernel-local allow-list (identity validation only, not ownership).
 * 3. Provider paths are keyed by exact resource class — no wildcard/global approval.
 * 4. Model-proposed verdicts carry zero authority. The model proposes needs; application policy decides sourcing.
 * 5. Determinism: same inputs → byte-identical outputs. Lists are sorted and deduplicated.
 */

import type { ResourceClass } from "@/lib/workforce/types";

// ─── Decision Union ──────────────────────────────────────────────────────────

/**
 * The three possible sourcing decisions.
 * - MAKE: all required resources are factually controlled by the company.
 * - BUY: one or more required resources are missing, but an approved external provider path exists.
 * - BLOCKED: one or more required resources are missing, and no approved path exists.
 */
export type SourcingDecision = "MAKE" | "BUY" | "BLOCKED";

/**
 * Closed reason code union for deterministic decision explanations.
 * Each decision kind maps to exactly one reason code.
 */
export type SourcingReasonCode =
  | "all_resources_controlled"        // MAKE
  | "missing_with_approved_path"     // BUY
  | "missing_without_approved_path"; // BLOCKED

// ─── Untrusted Model Proposal ────────────────────────────────────────────────

/**
 * The shape a model may propose. This is UNTRUSTED input.
 * The model may propose resource needs, but NEVER sourcing decisions, provider approvals,
 * or any authority field. All such fields are stripped during validation.
 *
 * IMPORTANT: The model's output is NON-AUTHORITATIVE. Application policy validates
 * and decides. A model-proposed MAKE verdict cannot override a BUY/BLOCKED outcome.
 */
export type UntrustedModelProposal = {
  /**
   * The resource classes the model believes are needed.
   * These are arbitrary strings from the model's output and MUST be validated
   * against the kernel's allow-list before use.
   */
  requiredResourceClasses?: readonly string[];

  /**
   * ANY fields the model might propose about sourcing, approval, or authority
   * are explicitly ignored. The kernel strips them during validation.
   * Examples: decision, sourcing, makeOrBuy, approved, provider, etc.
   */
  [key: string]: unknown;
};

/**
 * Validated resource needs after the untrusted model proposal has been sanitized.
 * Only known ResourceClass identities survive. Unknown/tampered strings are rejected.
 *
 * IMPORTANT: This validation is IDENTITY validation only. It does not imply ownership
 * or factual control. A validated ResourceClass still requires inventory verification.
 */
export type ValidatedResourceNeeds = {
  /**
   * The validated resource classes the model proposed.
   * Sorted and deduplicated for determinism.
   */
  requiredResourceClasses: readonly ResourceClass[];

  /**
   * Any strings the model proposed that were not recognized ResourceClass identities.
   * These are rejected and reported for observability.
   */
  rejectedUnknownClasses: readonly string[];
};

// ─── Factual Inventory ───────────────────────────────────────────────────────

/**
 * The factual inventory of resource classes the company currently controls.
 * This is the SOLE authority for ownership. Catalog membership is irrelevant.
 *
 * A resource class present in the catalog as "owned" but ABSENT from this inventory
 * is reported as missing. The kernel does not call isOwnedResourceClass or any
 * catalog helper to infer control.
 */
export type FactualResourceInventory = {
  /**
   * The resource classes the company factually controls NOW.
   * This is application-observed truth, not catalog vocabulary.
   */
  controlledResourceClasses: readonly ResourceClass[];
};

// ─── Approved Provider Path ──────────────────────────────────────────────────

/**
 * An approved external provider path for a specific missing resource class.
 * Provider paths are keyed by exact resource class — no wildcard/global approval.
 *
 * A path approved for resource X cannot satisfy a missing resource Y.
 */
export type ApprovedProviderPath = {
  /**
   * The exact resource class this path is approved for.
   */
  forResourceClass: ResourceClass;

  /**
   * Identifier for the provider path (e.g., "okx_testnet", "stripe_sandbox").
   * This is opaque to the kernel; it's used for observability in the decision.
   */
  pathId: string;
};

// ─── Sourcing Decision Result ────────────────────────────────────────────────

/**
 * The result of a sourcing evaluation.
 * This is a discriminated union on the `outcome` field.
 */
export type SourcingEvaluationResult =
  | SourcingAuthorizingResult
  | SourcingInvalidResult;

/**
 * An authorizing result: MAKE, BUY, or BLOCKED.
 * This is the normal outcome when inputs are valid.
 */
export type SourcingAuthorizingResult = {
  outcome: "authorizing";

  /**
   * The sourcing decision: MAKE, BUY, or BLOCKED.
   */
  decision: SourcingDecision;

  /**
   * A deterministic reason code for the decision.
   */
  reasonCode: SourcingReasonCode;

  /**
   * The resource classes that are satisfied (present in inventory).
   * Sorted and deduplicated for determinism.
   */
  satisfiedResourceClasses: readonly ResourceClass[];

  /**
   * The resource classes that are missing (not in inventory).
   * Sorted and deduplicated for determinism.
   * Empty for MAKE decisions.
   */
  missingResourceClasses: readonly ResourceClass[];

  /**
   * For BUY decisions: the approved provider paths that satisfy the missing resources.
   * Each missing resource must have a corresponding approved path.
   * Empty for MAKE and BLOCKED decisions.
   */
  approvedProviderPaths: readonly ApprovedProviderPath[];
};

/**
 * A non-authorizing result: the inputs were invalid or malformed.
 * This is the fail-closed outcome. Empty/invalid requirements MUST NOT yield MAKE.
 */
export type SourcingInvalidResult = {
  outcome: "invalid";

  /**
   * Why the inputs were invalid.
   */
  reason: string;
};

// ─── Evaluation Input ────────────────────────────────────────────────────────

/**
 * The input to the sourcing evaluation function.
 */
export type SourcingEvaluationInput = {
  /**
   * The validated resource needs (from the model proposal after sanitization).
   */
  validatedNeeds: ValidatedResourceNeeds;

  /**
   * The factual inventory of resource classes the company currently controls.
   */
  factualInventory: FactualResourceInventory;

  /**
   * Optional approved provider paths for missing resources.
   * Each path is keyed by exact resource class.
   */
  approvedProviderPaths?: readonly ApprovedProviderPath[];
};
