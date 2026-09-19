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
  PaymentExecutor,
  PaymentSubmissionResult,
} from "./types";
import { parse402Challenge, bindTermsToApproval, parseAtomicAmount } from "./challenge";
import { assertIdempotencyDistinct } from "./purchase";

export type { PaymentExecutor, PaymentSubmissionResult };

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
  /** Set by the supervised purchase wrapper; required for production execution. */
  purchaseId?: string;
  idempotencyKey?: string;
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

  // M3 only authorizes exact, fixed-price payments. Never let a changed
  // merchant ordering silently select an unsupported/deferred scheme.
  const terms = allTerms.find((candidate) => candidate.scheme === "exact");
  if (!terms) {
    throw new Error("No supported exact payment terms found in 402 challenge");
  }

  // Validate network is allowed
  if (!config.allowedNetworks.includes(terms.network)) {
    throw new Error(
      `Network ${terms.network} not in allowed networks: ${config.allowedNetworks.join(", ")}`,
    );
  }

  // Validate amount is within spend limit
  const requiredAmount = parseAtomicAmount(terms.maxAmountRequired, "terms");
  const maxSpend = parseAtomicAmount(config.maxSpend, "rail maximum");

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
 * TEST-ONLY scaffold: exercise READY_TO_SIGN → inject FakeSigner → fake submit.
 *
 * This is NOT production signing. It constructs a simplified payload that is
 * useful for lifecycle/idempotency tests only. Official x402 / Agentic Wallet
 * signing must go through PaymentExecutor (kind: "official_onchainos").
 *
 * Prefer executeApprovedPayment(prepared, executor) at the application boundary.
 *
 * @deprecated name retained for existing tests — use TestScaffoldPaymentExecutor
 *   or executeApprovedPayment with an official executor for new code.
 */
export async function executeSignedPayment(
  prepared: PreparedPayment,
  signer: Signer,
  submit: (signedPayment: { signature: string; intent: BoundPaymentIntent }) => Promise<{ transactionHash: string }>,
): Promise<{ transactionHash: string }> {
  if (prepared.state !== "ready_to_sign") {
    throw new Error(
      `Cannot execute payment in state ${prepared.state}; must be ready_to_sign`,
    );
  }

  // Simplified test payload — NOT production EIP-712 / x402 authorization.
  const payload = {
    network: prepared.terms.network,
    asset: prepared.terms.asset,
    amount: prepared.terms.maxAmountRequired,
    payTo: prepared.terms.payTo,
    resource: prepared.terms.resource,
    _scaffold: "test_only_simplified_signer",
  };

  const signature = await signer.signEIP712(payload);
  return submit({ signature, intent: prepared.intent });
}

/**
 * Application payment boundary: execute an approved READY_TO_SIGN intent via
 * an injected PaymentExecutor. Production must inject an official Onchain OS /
 * Agentic Wallet executor — never FakeSigner / TestScaffoldPaymentExecutor.
 */
export async function executeApprovedPayment(
  prepared: PreparedPayment,
  executor: PaymentExecutor,
): Promise<PaymentSubmissionResult> {
  if (prepared.state !== "ready_to_sign") {
    throw new Error(
      `Cannot execute payment in state ${prepared.state}; must be ready_to_sign`,
    );
  }
  if (!prepared.intent.approval) {
    throw new Error("Cannot execute payment without explicit approval");
  }
  if (!prepared.purchaseId || !prepared.idempotencyKey) {
    throw new Error("Cannot execute payment without a durable purchase identity");
  }
  return executor.executeApprovedPayment({
    purchaseId: prepared.purchaseId,
    idempotencyKey: prepared.idempotencyKey,
    intentId: prepared.intent.intentId,
    scheme: prepared.terms.scheme,
    network: prepared.terms.network,
    asset: prepared.terms.asset,
    amount: prepared.terms.maxAmountRequired,
    payTo: prepared.terms.payTo,
    resource: prepared.terms.resource,
    eip712Name: prepared.terms.eip712.name,
    eip712Version: prepared.terms.eip712.version,
    maxTimeoutSeconds: prepared.terms.maxTimeoutSeconds,
    approvalId: prepared.intent.approval.approvalId,
  });
}

/**
 * TEST-ONLY PaymentExecutor wrapping FakeSigner + fake submit.
 * kind is always "test_scaffold" so it cannot be mistaken for production.
 */
export class TestScaffoldPaymentExecutor implements PaymentExecutor {
  readonly kind = "test_scaffold" as const;

  constructor(
    private readonly signer: Signer = new FakeSigner(),
    private readonly submitFn: (
      signedPayment: { signature: string; intent: BoundPaymentIntent },
    ) => Promise<{ transactionHash: string }> = fakeSubmit,
  ) {}

  async executeApprovedPayment(input: {
    purchaseId: string;
    idempotencyKey: string;
    intentId: string;
    scheme: string;
    network: string;
    asset: string;
    amount: string;
    payTo: string;
    resource: string;
    eip712Name: string;
    eip712Version: string;
    maxTimeoutSeconds: number;
    approvalId: string;
  }): Promise<PaymentSubmissionResult> {
    const payload = {
      ...input,
      _scaffold: "test_only_simplified_signer",
    };
    const signature = await this.signer.signEIP712(payload);
    // Minimal intent for the fake submit path — not a production binding.
    const intent = {
      intentId: input.intentId,
      state: "ready_to_sign" as const,
      terms: {
        scheme: "exact",
        network: input.network,
        asset: input.asset,
        maxAmountRequired: input.amount,
        payTo: input.payTo,
        resource: input.resource,
        eip712: { name: "TEST", version: "1" },
        maxTimeoutSeconds: 60,
      },
      approval: {
        approver: "test",
        approvedMaxAmount: input.amount,
        approvedNetwork: input.network,
        approvedAsset: input.asset,
        approvedPayTo: input.payTo,
        approvalId: input.approvalId,
        approvedAt: 0,
      },
      boundAt: 0,
    } satisfies BoundPaymentIntent;
    const result = await this.submitFn({ signature, intent });
    return {
      submitted: true,
      transactionHash: result.transactionHash,
      note: "test_scaffold_only — not official Onchain OS signing",
    };
  }
}

/**
 * Placeholder for the official Onchain OS / Agentic Wallet executor.
 * Always refuses until a real implementation is wired in supervised M3.
 */
export class OfficialSigningPendingExecutor implements PaymentExecutor {
  readonly kind = "official_onchainos" as const;

  async executeApprovedPayment(): Promise<PaymentSubmissionResult> {
    throw new Error(
      "Official Onchain OS / Agentic Wallet PaymentExecutor not yet wired — M3 live sign/pay pending",
    );
  }
}

/**
 * Plan retry for a failed purchase.
 * 
 * Rules:
 * - Refuses ambiguous/submitted states outright
 * - A failed state is not itself retry authority; explicit reconciliation proof is required
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
  reconciliationProof?: string,
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

  // A local "failed" label is not proof that no payment landed. The caller
  // must provide evidence from the reconciliation lane before a retry can even
  // be planned.
  if (purchase.state !== "failed") {
    throw new Error(
      `Can only retry a reconciled failed purchase; current state is ${purchase.state}`,
    );
  }
  if (!reconciliationProof?.trim()) {
    throw new Error("Cannot retry failed purchase without reconciliation proof");
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
 * TEST-ONLY fake signer — deterministic fake signature.
 * NEVER constructed from a real secret. Not a production PaymentExecutor.
 */
export class FakeSigner implements Signer {
  readonly address: string;
  /** Marker so static review can assert this is test-only. */
  readonly isTestOnlySigner = true as const;

  constructor(address: string = "0x0000000000000000000000000000000000000000") {
    this.address = address;
  }

  async signEIP712(payload: unknown): Promise<string> {
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
