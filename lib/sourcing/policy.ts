/**
 * M2 Sourcing Policy Kernel — Pure Evaluation Logic
 *
 * This module implements deterministic Make-vs-Buy sourcing policy.
 * It is pure, side-effect free, and dependency-free (no I/O, no network, no env reads).
 *
 * CRITICAL DESIGN CONSTRAINTS:
 * 1. Factual inventory is the ONLY ownership authority. The kernel does NOT call
 *    isOwnedResourceClass, RESOURCE_CLASSES, or any catalog helper to infer control.
 * 2. The kernel-local allow-list (KNOWN_RESOURCE_CLASSES) is for IDENTITY validation only.
 *    It does not carry or imply ownership. A resource passing identity validation still
 *    requires inventory verification.
 * 3. Provider paths are keyed by exact resource class. No wildcard/global approval.
 * 4. Model-proposed verdicts are stripped. The model proposes needs; application policy decides.
 * 5. Determinism: same inputs → byte-identical outputs. Lists are sorted and deduplicated.
 * 6. Empty/invalid requirements fail closed. They MUST NOT yield MAKE.
 */

import type { ResourceClass } from "../workforce/types";
import type {
  ApprovedProviderPath,
  FactualResourceInventory,
  SourcingAuthorizingResult,
  SourcingEvaluationInput,
  SourcingEvaluationResult,
  SourcingReasonCode,
  UntrustedModelProposal,
  ValidatedResourceNeeds,
} from "./types";

// ─── Kernel-Local Identity Allow-List ───────────────────────────────────────

/**
 * The complete set of known ResourceClass identities.
 *
 * IMPORTANT: This is IDENTITY VALIDATION ONLY. It does not carry or imply ownership.
 * A resource class present in this list is a valid identity, but that does NOT mean
 * the company factually controls it. Ownership is determined solely by the factual
 * inventory passed in by the caller (FactualResourceInventory).
 *
 * A resource class present in the catalog as "owned" but ABSENT from the supplied
 * inventory must be reported as missing. This kernel does not call isOwnedResourceClass
 * or any catalog helper to infer control.
 *
 * SYNC: declared as an exhaustive Record over the canonical ResourceClass union, so
 * adding a ResourceClass to lib/workforce/types.ts without declaring it here is a
 * COMPILE error. A newly valid class therefore cannot silently fail closed.
 * tests/sourcing.test.ts asserts the same equality at runtime against the catalog's
 * own ResourceDefinition list.
 */
type ResourceClassIdentityRecord = Record<ResourceClass, true>;

const RESOURCE_CLASS_IDENTITIES: ResourceClassIdentityRecord = {
  llm_reasoning: true,
  public_web: true,
  company_records: true,
  company_tools: true,
  ordinary_compute: true,
  proprietary_data: true,
  privileged_access: true,
  specialist_compute: true,
  human_voice_contact: true,
  physical_presence: true,
  attestation: true,
};

/**
 * The complete set of known ResourceClass identities, derived from the
 * exhaustive identity record above. Exported for the identity-sync invariant
 * test only; callers must not use it to infer ownership.
 */
export const KNOWN_RESOURCE_CLASSES: readonly ResourceClass[] = (
  Object.keys(RESOURCE_CLASS_IDENTITIES) as ResourceClass[]
).sort();

const knownResourceClassSet = new Set<ResourceClass>(KNOWN_RESOURCE_CLASSES);

/**
 * Check whether a string is a known ResourceClass identity.
 * This is identity validation only — it does not imply ownership or factual control.
 */
function isKnownResourceClass(value: string): value is ResourceClass {
  return knownResourceClassSet.has(value as ResourceClass);
}

// ─── Untrusted Model Proposal Validation ─────────────────────────────────────

/**
 * Validate and sanitize an untrusted model proposal.
 *
 * This function:
 * 1. Strips ALL authority fields (decision, sourcing, makeOrBuy, approved, provider, etc.).
 *    The model proposes needs; application policy decides sourcing.
 * 2. Validates each proposed resource class against the kernel's identity allow-list.
 *    Unknown/tampered strings are rejected and reported.
 * 3. Returns only validated resource needs. Identity validation does not imply ownership.
 *
 * IMPORTANT: The model's output is NON-AUTHORITATIVE. A model-proposed MAKE verdict
 * cannot override a BUY/BLOCKED outcome. All such fields are ignored.
 *
 * @param proposal - The untrusted model proposal (may contain arbitrary fields)
 * @returns Validated resource needs with rejected unknown classes reported
 */
export function validateModelProposal(
  proposal: UntrustedModelProposal | null | undefined,
): ValidatedResourceNeeds {
  // Extract the proposed resource classes (if any).
  const proposed = proposal?.requiredResourceClasses ?? [];

  // Validate each proposed class against the identity allow-list.
  const validated = new Set<ResourceClass>();
  const rejected = new Set<string>();

  for (const value of proposed) {
    // Skip non-strings (malformed input).
    if (typeof value !== "string") {
      rejected.add(String(value));
      continue;
    }

    // Trim whitespace for robustness.
    const trimmed = value.trim();
    if (!trimmed) {
      continue; // Skip empty strings.
    }

    // Validate against the identity allow-list.
    if (isKnownResourceClass(trimmed)) {
      validated.add(trimmed);
    } else {
      rejected.add(trimmed);
    }
  }

  // Return validated needs (sorted and deduplicated for determinism).
  return {
    requiredResourceClasses: [...validated].sort(),
    rejectedUnknownClasses: [...rejected].sort(),
  };
}

// ─── Sourcing Policy Evaluation ──────────────────────────────────────────────

/**
 * Evaluate sourcing policy deterministically.
 *
 * This is the core Make-vs-Buy decision function. It implements:
 * - all required resources factually controlled → MAKE
 * - one or more required resources missing + approved external provider path exists → BUY
 * - one or more required resources missing + no approved external provider path → BLOCKED
 *
 * CRITICAL INVARIANTS:
 * 1. Factual inventory is the ONLY ownership authority. The kernel does not infer control
 *    from catalog membership or any other source.
 * 2. A missing worker is NOT automatically BUY. If the underlying required resources are
 *    factually controlled, the decision stays MAKE even with no pre-existing worker.
 * 3. Provider paths are keyed by exact resource class. A path approved for resource X
 *    cannot satisfy a missing resource Y.
 * 4. Empty requirements fail closed (invalid outcome, not MAKE).
 * 5. Determinism: same inputs → byte-identical outputs. Lists are sorted and deduplicated.
 *
 * @param input - The evaluation input (validated needs, factual inventory, optional provider paths)
 * @returns The sourcing decision result (authorizing or invalid)
 */
export function evaluateSourcingPolicy(
  input: SourcingEvaluationInput,
): SourcingEvaluationResult {
  const { validatedNeeds, factualInventory, approvedProviderPaths = [] } = input;

  // Empty requirements fail closed. This is a non-authorizing outcome.
  if (validatedNeeds.requiredResourceClasses.length === 0) {
    return {
      outcome: "invalid",
      reason: "Empty resource requirements are not authorized",
    };
  }

  // Build the set of factually controlled resources from the inventory.
  // This is the SOLE authority for ownership.
  const controlled = new Set<ResourceClass>(
    factualInventory.controlledResourceClasses,
  );

  // Determine which required resources are satisfied and which are missing.
  const satisfied = new Set<ResourceClass>();
  const missing = new Set<ResourceClass>();

  for (const resource of validatedNeeds.requiredResourceClasses) {
    if (controlled.has(resource)) {
      satisfied.add(resource);
    } else {
      missing.add(resource);
    }
  }

  // If all required resources are factually controlled → MAKE.
  if (missing.size === 0) {
    return {
      outcome: "authorizing",
      decision: "MAKE",
      reasonCode: "all_resources_controlled",
      satisfiedResourceClasses: [...satisfied].sort(),
      missingResourceClasses: [],
      approvedProviderPaths: [],
    };
  }

  // One or more resources are missing. Check for approved provider paths.
  // Build a map of approved paths keyed by exact resource class.
  const approvedPathByResource = new Map<ResourceClass, ApprovedProviderPath>();
  for (const path of approvedProviderPaths) {
    // Each resource class can have at most one approved path in this evaluation.
    // If multiple paths are provided for the same resource, the first one wins
    // (deterministic: caller should provide at most one per resource).
    if (!approvedPathByResource.has(path.forResourceClass)) {
      approvedPathByResource.set(path.forResourceClass, path);
    }
  }

  // Check whether every missing resource has an approved provider path.
  const missingArray = [...missing].sort();
  const pathsForMissing: ApprovedProviderPath[] = [];
  let allMissingHavePaths = true;

  for (const resource of missingArray) {
    const path = approvedPathByResource.get(resource);
    if (path) {
      pathsForMissing.push(path);
    } else {
      allMissingHavePaths = false;
      // Don't break: we want to collect all available paths for observability.
    }
  }

  // If all missing resources have approved paths → BUY.
  if (allMissingHavePaths) {
    return {
      outcome: "authorizing",
      decision: "BUY",
      reasonCode: "missing_with_approved_path",
      satisfiedResourceClasses: [...satisfied].sort(),
      missingResourceClasses: missingArray,
      approvedProviderPaths: pathsForMissing.sort((a, b) =>
        a.forResourceClass.localeCompare(b.forResourceClass),
      ),
    };
  }

  // One or more missing resources lack an approved path → BLOCKED.
  return {
    outcome: "authorizing",
    decision: "BLOCKED",
    reasonCode: "missing_without_approved_path",
    satisfiedResourceClasses: [...satisfied].sort(),
    missingResourceClasses: missingArray,
    approvedProviderPaths: [],
  };
}
