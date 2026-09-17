// §9b — Purchase record management
// Pure, no I/O, no network, no hardcoded values

import type {
  PurchaseRecord,
  PaymentState,
  NormalizedChallengeTerms,
  PaymentApproval,
} from "./types";

/**
 * Create a new purchase record.
 * 
 * Each purchase has its own unique idempotency key, approval, and bound terms.
 * The first purchase's state can NEVER authorize the second purchase.
 * 
 * @param id - Unique purchase ID
 * @param objectiveKey - The objective this purchase belongs to
 * @param resourceNeedId - The resource need this purchase satisfies
 * @param offeringId - The offering being purchased
 * @param idempotencyKey - Unique key to prevent duplicate payments
 * @param at - Creation timestamp (defaults to 0 for determinism)
 * @returns A new purchase record in "prepared" state
 */
export function createPurchase(params: {
  id: string;
  objectiveKey: string;
  resourceNeedId: string;
  offeringId: string;
  idempotencyKey: string;
  at?: number;
}): PurchaseRecord {
  return {
    id: params.id,
    objectiveKey: params.objectiveKey,
    resourceNeedId: params.resourceNeedId,
    offeringId: params.offeringId,
    idempotencyKey: params.idempotencyKey,
    state: "prepared",
    boundTerms: null,
    approval: null,
    receipt: null,
    result: null,
    verified: false,
    createdAt: params.at ?? 0,
    updatedAt: params.at ?? 0,
  };
}

/**
 * Assert that two purchases have distinct idempotency keys.
 * 
 * Two purchases under the same objective MUST have different idempotency keys.
 * This prevents accidental double-payment.
 * 
 * @param a - First purchase
 * @param b - Second purchase
 * @throws if the idempotency keys match
 */
export function assertIdempotencyDistinct(
  a: PurchaseRecord,
  b: PurchaseRecord,
): void {
  if (a.idempotencyKey === b.idempotencyKey) {
    throw new Error(
      `Idempotency collision: purchases ${a.id} and ${b.id} share idempotency key ${a.idempotencyKey}`,
    );
  }
}

/**
 * Update a purchase's state.
 * 
 * @param purchase - The purchase to update
 * @param newState - The new state
 * @param at - Update timestamp (defaults to 0 for determinism)
 * @returns A new purchase record with updated state
 */
export function updatePurchaseState(
  purchase: PurchaseRecord,
  newState: PaymentState,
  at?: number,
): PurchaseRecord {
  return {
    ...purchase,
    state: newState,
    updatedAt: at ?? purchase.updatedAt,
  };
}

/**
 * Bind terms and approval to a purchase.
 * 
 * This attaches the live challenge terms and explicit approval to the purchase.
 * The purchase must be in "prepared" or "awaiting_approval" state.
 * 
 * @param purchase - The purchase to bind
 * @param terms - The live challenge terms
 * @param approval - The explicit approval
 * @param at - Update timestamp (defaults to 0 for determinism)
 * @returns A new purchase record with bound terms and approval
 * @throws if the purchase is not in a bindable state
 */
export function bindPurchaseTerms(
  purchase: PurchaseRecord,
  terms: NormalizedChallengeTerms,
  approval: PaymentApproval,
  at?: number,
): PurchaseRecord {
  if (purchase.state !== "prepared" && purchase.state !== "awaiting_approval") {
    throw new Error(
      `Cannot bind terms to purchase in state ${purchase.state}; must be prepared or awaiting_approval`,
    );
  }

  return {
    ...purchase,
    boundTerms: terms,
    approval: approval,
    state: "approved",
    updatedAt: at ?? purchase.updatedAt,
  };
}

/**
 * Record a payment receipt for a purchase.
 * 
 * @param purchase - The purchase to update
 * @param transactionHash - The transaction hash
 * @param settledAt - Settlement timestamp (optional)
 * @param at - Update timestamp (defaults to 0 for determinism)
 * @returns A new purchase record with receipt
 */
export function recordPurchaseReceipt(
  purchase: PurchaseRecord,
  transactionHash: string,
  settledAt?: number,
  at?: number,
): PurchaseRecord {
  return {
    ...purchase,
    receipt: { transactionHash, settledAt },
    updatedAt: at ?? purchase.updatedAt,
  };
}

/**
 * Record the result of a purchase.
 * 
 * @param purchase - The purchase to update
 * @param result - The result data
 * @param at - Update timestamp (defaults to 0 for determinism)
 * @returns A new purchase record with result
 */
export function recordPurchaseResult(
  purchase: PurchaseRecord,
  result: unknown,
  at?: number,
): PurchaseRecord {
  return {
    ...purchase,
    result,
    updatedAt: at ?? purchase.updatedAt,
  };
}

/**
 * Mark a purchase as verified.
 * 
 * @param purchase - The purchase to verify
 * @param at - Update timestamp (defaults to 0 for determinism)
 * @returns A new purchase record marked as verified
 */
export function verifyPurchase(
  purchase: PurchaseRecord,
  at?: number,
): PurchaseRecord {
  return {
    ...purchase,
    verified: true,
    updatedAt: at ?? purchase.updatedAt,
  };
}
