// §9a — Dynamic 402 challenge parsing and binding
// Pure, no I/O, no network, no hardcoded values

import type {
  NormalizedChallengeTerms,
  PaymentApproval,
  BoundPaymentIntent,
} from "./types";

/**
 * Parse a 402 challenge response body into normalized payment terms.
 * 
 * Fail-closed: validates that x402Version is present, accepts[] is an array,
 * and each entry has the required fields. Malformed entries are skipped.
 * 
 * @param body - The raw JSON body from a 402 response
 * @returns Array of normalized challenge terms (may be empty if all entries malformed)
 * @throws if x402Version is missing or accepts is not an array
 */
export function parse402Challenge(body: unknown): NormalizedChallengeTerms[] {
  if (typeof body !== "object" || body === null) {
    throw new Error("Challenge body must be an object");
  }

  const obj = body as Record<string, unknown>;

  // Validate x402Version present
  if (typeof obj.x402Version !== "number") {
    throw new Error("Challenge must include x402Version as a number");
  }

  // Validate accepts[] array
  if (!Array.isArray(obj.accepts)) {
    throw new Error("Challenge must include accepts as an array");
  }

  const results: NormalizedChallengeTerms[] = [];

  for (const entry of obj.accepts) {
    try {
      const normalized = normalizeChallengeEntry(entry);
      results.push(normalized);
    } catch (err) {
      // Malformed entry — skip it (fail-closed: we don't throw, just skip)
      // In production, this would be logged for debugging
      continue;
    }
  }

  return results;
}

/**
 * Normalize a single challenge entry from the accepts[] array.
 * 
 * @param entry - A single entry from the accepts array
 * @returns Normalized challenge terms
 * @throws if any required field is missing or malformed
 */
function normalizeChallengeEntry(entry: unknown): NormalizedChallengeTerms {
  if (typeof entry !== "object" || entry === null) {
    throw new Error("Challenge entry must be an object");
  }

  const e = entry as Record<string, unknown>;

  // Required string fields
  const scheme = requireString(e, "scheme");
  const network = requireString(e, "network");
  const asset = requireString(e, "asset");
  const maxAmountRequired = requireString(e, "maxAmountRequired");
  const payTo = requireString(e, "payTo");
  const resource = requireString(e, "resource");

  // Required number field
  if (typeof e.maxTimeoutSeconds !== "number") {
    throw new Error("maxTimeoutSeconds must be a number");
  }
  const maxTimeoutSeconds = e.maxTimeoutSeconds;

  // Required extra object with name and version
  if (typeof e.extra !== "object" || e.extra === null) {
    throw new Error("extra must be an object");
  }
  const extra = e.extra as Record<string, unknown>;
  const name = requireString(extra, "name");
  const version = requireString(extra, "version");

  return {
    scheme,
    network,
    asset,
    maxAmountRequired,
    payTo,
    resource,
    eip712: { name, version },
    maxTimeoutSeconds,
  };
}

/**
 * Require a string field from an object.
 */
function requireString(obj: Record<string, unknown>, field: string): string {
  const value = obj[field];
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`${field} must be a non-empty string`);
  }
  return value;
}

/**
 * Bind challenge terms to an approval, verifying the live terms are within
 * the approved bounds.
 * 
 * Checks:
 * - network matches approvedNetwork
 * - asset matches approvedAsset
 * - payTo matches approvedPayTo
 * - maxAmountRequired <= approvedMaxAmount (as decimal)
 * 
 * @param terms - The live challenge terms from the 402 response
 * @param approval - The explicit approval with bounds
 * @param intentId - Optional intent ID for testing (defaults to deterministic generation)
 * @param boundAt - Optional timestamp for testing (defaults to 0 for determinism)
 * @returns A bound payment intent ready to sign
 * @throws if terms are outside the approved bounds
 */
export function bindTermsToApproval(
  terms: NormalizedChallengeTerms,
  approval: PaymentApproval,
  intentId?: string,
  boundAt?: number,
): BoundPaymentIntent {
  // Verify network matches
  if (terms.network !== approval.approvedNetwork) {
    throw new Error(
      `Network mismatch: terms require ${terms.network}, but approval is for ${approval.approvedNetwork}`,
    );
  }

  // Verify asset matches
  if (terms.asset !== approval.approvedAsset) {
    throw new Error(
      `Asset mismatch: terms require ${terms.asset}, but approval is for ${approval.approvedAsset}`,
    );
  }

  // Verify payTo matches
  if (terms.payTo !== approval.approvedPayTo) {
    throw new Error(
      `Recipient mismatch: terms require ${terms.payTo}, but approval is for ${approval.approvedPayTo}`,
    );
  }

  // Verify amount is within approved bounds (decimal comparison)
  const requiredAmount = parseFloat(terms.maxAmountRequired);
  const approvedAmount = parseFloat(approval.approvedMaxAmount);

  if (isNaN(requiredAmount) || isNaN(approvedAmount)) {
    throw new Error("Amount values must be valid decimal numbers");
  }

  if (requiredAmount > approvedAmount) {
    throw new Error(
      `Amount exceeds approval: terms require ${terms.maxAmountRequired}, but approval is for ${approval.approvedMaxAmount}`,
    );
  }

  // All checks passed — create bound intent
  return {
    intentId: intentId ?? generateDeterministicIntentId(terms, approval),
    terms,
    approval,
    boundAt: boundAt ?? 0,
    state: "ready_to_sign",
  };
}

/**
 * Generate a deterministic intent ID from terms and approval.
 * Pure function — no randomness or timers.
 */
function generateDeterministicIntentId(
  terms: NormalizedChallengeTerms,
  approval: PaymentApproval,
): string {
  // Simple deterministic hash from key fields
  const key = `${terms.network}:${terms.asset}:${terms.payTo}:${approval.approvalId}`;
  let hash = 0;
  for (let i = 0; i < key.length; i++) {
    const char = key.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32-bit integer
  }
  return `intent-${Math.abs(hash).toString(36)}`;
}
