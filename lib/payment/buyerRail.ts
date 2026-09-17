// §9c — Buyer rail to READY_TO_SIGN boundary
// Pure pipeline with injected dependencies; no actual signing or submission

import type {
  NormalizedChallengeTerms,
  PaymentApproval,
  BoundPaymentIntent,
  PurchaseRecord,
  Signer,
  SettlementReader,
  PaidRequestSender,
  RailConfig,
} from "./types";
import { parse402Challenge, bindTermsToApproval } from "./challenge";
import { assertIdempotencyDistinct } from "./purchase";

/**
 * Detect if a response is a 402 Payment Required challenge.
 * 
 * @param response - HTTP response with status and body
 * @returns true if status is 402, false otherwise
 */
export function detect402(response: { status: number; body: unknown }): boolean {
  return response.status === 402;
}

/**
 * Result of preparePayment — the rail stops at READY_TO_SIGN.
 */
export type PreparedPayment = {
  intent: BoundPaymentIntent;
  terms: NormalizedChallengeTerms;
  state: "ready_to_sign";
};

/**
 * Prepare a payment by parsing the 402 challenge, validating against policy,
 * and binding terms to approval. Stops at READY_TO_SIGN — does NOT sign.
 * 
 * @param challengeBody - The 402 response body (injected for testing)
 * @param approval - Explicit approval with bounds
 * @param config - Rail configuration (allowed networks, max spend)
 * @param intentId - Optional intent ID for testing
 * @returns Prepared payment at READY_TO_SIGN state
 * @throws if validation fails
 */
export function preparePayment(
  challengeBody: unknown,
  approval: PaymentApproval,
  config: RailConfig,
  intentId?: string,
): PreparedPayment {
  // Parse and normalize challenge terms
  const allTerms = parse402Challenge(challengeBody);
  
  if (allTerms.length === 0) {
    throw new Error("No valid payment terms found in 402 challenge");
  }

  // Select first scheme (in production, could implement scheme selection logic)
  const terms = allTerms[0];

  // Validate network is allowed
  if (!config.allowedNetworks.includes(terms.network)) {
    throw new Error(
      `Network ${terms.network} not in allowed networks: ${config.allowedNetworks.join(", ")}`,
    );
  }

  // Validate amount is within spend limit
  const requiredAmount = parseFloat(terms.maxAmountRequired);
  const maxSpend = parseFloat(config.maxSpend);

  if (isNaN(requiredAmount) || isNaN(maxSpend)) {
    throw new Error("Invalid amount values");
  }

  if (requiredAmount > maxSpend) {
    throw new Error(
      `Amount ${terms.maxAmountRequired} exceeds max spend ${config.maxSpend}`,
    );
  }

  // Bind terms to approval (validates network, asset, payTo, amount)
  const intent = bindTermsToApproval(terms, approval, intentId);

  return {
    intent,
    terms,
    state: "ready_to_sign",
  };
}

/**
 * Execute a signed payment. Requires explicit authorization and injected signer.
 * 
 * This function:
 * 1. Verifies state is READY_TO_SIGN
 * 2. Calls injected signer to sign the EIP-712 payload
 * 3. Calls injected submit function to submit the signed payment
 * 4. Returns transaction hash
 * 
 * @param prepared - Prepared payment at READY_TO_SIGN
 * @param signer - Injected signer (FakeSigner in tests)
 * @param submit - Injected submit function (fake in tests)
 * @returns Transaction hash
 * @throws if state is not READY_TO_SIGN
 */
export async function executeSignedPayment(
  prepared: PreparedPayment,
  signer: Signer,
  submit: (signedPayment: { signature: string; intent: BoundPaymentIntent }) => Promise<{ transactionHash: string }>,
): Promise<{ transactionHash: string }> {
  // Verify state
  if (prepared.state !== "ready_to_sign") {
    throw new Error(
      `Cannot execute payment in state ${prepared.state}; must be ready_to_sign`,
    );
  }

  // Create EIP-712 payload (simplified — in production would construct proper typed data)
  const payload = {
    network: prepared.terms.network,
    asset: prepared.terms.asset,
    amount: prepared.terms.maxAmountRequired,
    payTo: prepared.terms.payTo,
    resource: prepared.terms.resource,
  };

  // Sign with injected signer
  const signature = await signer.signEIP712(payload);

  // Submit with injected submit function
  const result = await submit({ signature, intent: prepared.intent });

  return result;
}

/**
 * Plan retry for a failed purchase.
 * 
 * Rules:
 * - Refuses to retry from submitted/uncertain/reconciliation_required (must reconcile first)
 * - Allows retry only from failed state
 * - Prevents double-pay: same idempotencyKey + already submitted/settled → refuse
 * 
 * @param purchase - The purchase to retry
 * @param existingPurchases - Other purchases to check for idempotency collisions
 * @returns true if retry is allowed, false otherwise
 * @throws if retry is not allowed
 */
export function planRetry(
  purchase: PurchaseRecord,
  existingPurchases: PurchaseRecord[],
): boolean {
  // Refuse to retry from ambiguous states
  if (
    purchase.state === "submitted" ||
    purchase.state === "uncertain" ||
    purchase.state === "reconciliation_required"
  ) {
    throw new Error(
      `Cannot retry purchase in state ${purchase.state}; must reconcile first`,
    );
  }

  // Allow retry only from failed
  if (purchase.state !== "failed") {
    throw new Error(
      `Can only retry purchase in failed state; current state is ${purchase.state}`,
    );
  }

  // Check for double-pay: same idempotencyKey + already submitted/settled
  for (const existing of existingPurchases) {
    if (existing.id === purchase.id) continue; // Skip self
    
    if (existing.idempotencyKey === purchase.idempotencyKey) {
      if (
        existing.state === "submitted" ||
        existing.state === "settled" ||
        existing.state === "result_received" ||
        existing.state === "verified"
      ) {
        throw new Error(
          `Cannot retry: idempotency key ${purchase.idempotencyKey} already used by purchase ${existing.id} in state ${existing.state}`,
        );
      }
    }
  }

  return true;
}

/**
 * Fake signer for tests — returns deterministic fake signature.
 * NEVER constructed from a real secret.
 */
export class FakeSigner implements Signer {
  readonly address: string;

  constructor(address: string = "0x0000000000000000000000000000000000000000") {
    this.address = address;
  }

  async signEIP712(payload: unknown): Promise<string> {
    // Deterministic fake signature — no real key
    const payloadStr = JSON.stringify(payload);
    let hash = 0;
    for (let i = 0; i < payloadStr.length; i++) {
      const char = payloadStr.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    return `0xfake-signature-${Math.abs(hash).toString(16).padStart(64, "0")}`;
  }
}

/**
 * Fake settlement reader for tests.
 */
export class FakeSettlementReader implements SettlementReader {
  private settlements: Map<string, { settled: boolean; settledAt?: number }> = new Map();

  /**
   * Set settlement status for a transaction hash (test helper).
   */
  setSettlement(transactionHash: string, settled: boolean, settledAt?: number): void {
    this.settlements.set(transactionHash, { settled, settledAt });
  }

  async readSettlement(transactionHash: string): Promise<{ settled: boolean; settledAt?: number }> {
    const settlement = this.settlements.get(transactionHash);
    if (!settlement) {
      return { settled: false };
    }
    return settlement;
  }
}

/**
 * Fake paid request sender for tests.
 */
export class FakePaidRequestSender implements PaidRequestSender {
  private results: Map<string, { success: boolean; result?: unknown }> = new Map();

  /**
   * Set result for a resource (test helper).
   */
  setResult(resource: string, success: boolean, result?: unknown): void {
    this.results.set(resource, { success, result });
  }

  async sendWithPayment(resource: string, paymentProof: string): Promise<{ success: boolean; result?: unknown }> {
    const preset = this.results.get(resource);
    if (preset) {
      return preset;
    }
    // Default: success with mock result
    return { success: true, result: { mock: true, resource } };
  }
}

/**
 * Fake submit function for tests.
 */
export async function fakeSubmit(
  signedPayment: { signature: string; intent: BoundPaymentIntent },
): Promise<{ transactionHash: string }> {
  // Deterministic fake transaction hash
  const sig = signedPayment.signature;
  let hash = 0;
  for (let i = 0; i < sig.length; i++) {
    const char = sig.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return { transactionHash: `0x${Math.abs(hash).toString(16).padStart(64, "0")}` };
}
