/**
 * Narrow x402 v2 interoperability shim for the OKX Mock Merchant.
 *
 * WORKAROUND — REMOVAL CONDITION: delete this module once the upstream Mock
 * Merchant / Onchain OS natively emit a facilitator-valid v2 `accepted.amount`
 * and that behavior is verified live (see docs/work/M3_LIVE_SESSION.md).
 *
 * Why it exists: the Mock Merchant emits an x402 v2 requirement carrying only
 * `maxAmountRequired`. Onchain OS signs the correct amount but embeds the
 * original requirement as `accepted`, so the signed header has no
 * `accepted.amount` and OKX's facilitator answers INVALID/param_mismatch.
 *
 * This changes protocol representation, never economic intent: the only edit
 * is copying an already-present, valid `maxAmountRequired` into `amount`.
 */

import { parseAtomicAmount } from "./challenge";

export const X402_V2_COMPAT_NETWORK = "eip155:1952";

export type X402V2Normalization = {
  type: "x402_v2_max_amount_to_amount";
  originalField: "maxAmountRequired";
  normalizedField: "amount";
  valueChanged: false;
};

export type NormalizedRequirement = {
  /** Requirement to hand to the signer. Same object contents when no edit was needed. */
  requirement: Record<string, unknown>;
  /** Present only when the compatibility edit was applied. Safe to persist. */
  normalization: X402V2Normalization | null;
};

const NORMALIZATION: X402V2Normalization = {
  type: "x402_v2_max_amount_to_amount",
  originalField: "maxAmountRequired",
  normalizedField: "amount",
  valueChanged: false,
};

function isPresent(value: unknown): boolean {
  return value !== undefined && value !== null;
}

/**
 * Fail-closed normalization of one `accepts[]` entry. Never mutates the input.
 * Throws on any ambiguity; never picks between conflicting amounts.
 */
export function normalizeX402V2PaymentRequirement(
  entry: unknown,
  x402Version: unknown,
): NormalizedRequirement {
  if (typeof entry !== "object" || entry === null || Array.isArray(entry)) {
    throw new Error("Payment requirement must be an object");
  }
  const original = entry as Record<string, unknown>;
  const hasAmount = isPresent(original.amount);
  const hasLegacy = isPresent(original.maxAmountRequired);

  for (const [field, present] of [["amount", hasAmount], ["maxAmountRequired", hasLegacy]] as const) {
    if (present) {
      const value = original[field];
      if (typeof value !== "string") {
        throw new Error(`${field} must be a scalar atomic-unit string`);
      }
      parseAtomicAmount(value, field);
    }
  }

  if (hasAmount && hasLegacy && original.amount !== original.maxAmountRequired) {
    throw new Error("Conflicting amount and maxAmountRequired values; refusing to choose one");
  }

  // Either already v2-shaped, or nothing to normalize: pass through unchanged.
  if (hasAmount || !hasLegacy) {
    return { requirement: { ...original }, normalization: null };
  }

  if (x402Version !== 2) {
    throw new Error("Unsupported x402 version for amount normalization; refusing to reinterpret");
  }
  if (original.scheme !== "exact") {
    throw new Error("Unsupported scheme for amount normalization; refusing to reinterpret");
  }
  if (original.network !== X402_V2_COMPAT_NETWORK) {
    throw new Error("Unsupported network for amount normalization; refusing to reinterpret");
  }

  return {
    requirement: { ...original, amount: original.maxAmountRequired },
    normalization: { ...NORMALIZATION },
  };
}
