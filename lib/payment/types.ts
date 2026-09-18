// Payment lifecycle types — pure, integration-free state machine

/**
 * Payment lifecycle states.
 * 
 * Critical invariants:
 * - submission != settlement != verification (three distinct facts)
 * - result_received is NOT verified
 * - approval must be explicit (no self-granting)
 * - terminal verified requires settled AND independently received/verified result
 */
export type PaymentState =
  | "prepared"
  | "awaiting_approval"
  | "approved"
  | "payment_attempted"
  | "submitted"
  | "settled"
  | "result_received"
  | "verified"
  | "failed"
  | "uncertain"
  | "reconciliation_required";

/**
 * Payment lifecycle events/commands.
 */
export type PaymentEvent =
  | { type: "request_approval"; requestedBy: string; reason: string }
  | { type: "grant_approval"; grantedBy: string; approvalId: string }
  | { type: "deny_approval"; deniedBy: string; reason: string }
  | { type: "attempt_payment"; paymentId: string }
  | { type: "submit_payment"; transactionHash: string }
  | { type: "confirm_settlement"; settlementProof: string }
  | { type: "receive_result"; resultData: unknown }
  | { type: "verify_result"; verificationProof: string }
  | { type: "report_failure"; failureReason: string }
  | { type: "report_uncertainty"; uncertaintyReason: string }
  | { type: "require_reconciliation"; reason: string }
  | { type: "complete_reconciliation"; reconciliationProof: string }
  | { type: "retry_payment"; newPaymentId: string };

/**
 * Payment context — carries all proofs and metadata through the lifecycle.
 */
export type PaymentContext = {
  paymentId?: string;
  transactionHash?: string;
  settlementProof?: string;
  resultData?: unknown;
  verificationProof?: string;
  approvalId?: string;
  grantedBy?: string;
  failureReason?: string;
  uncertaintyReason?: string;
  reconciliationProof?: string;
  retryPaymentId?: string;
};

/**
 * Transition result — either success with new state/context, or typed rejection.
 */
export type TransitionResult =
  | { success: true; state: PaymentState; context: PaymentContext }
  | { success: false; error: PaymentLifecycleError };

/**
 * Typed error for illegal transitions.
 */
export class PaymentLifecycleError extends Error {
  constructor(
    public readonly currentState: PaymentState,
    public readonly attemptedEvent: string,
    public readonly reason: string,
  ) {
    super(
      `Illegal payment lifecycle transition: ${attemptedEvent} in state ${currentState} — ${reason}`,
    );
    this.name = "PaymentLifecycleError";
  }
}

// ─── §9a Dynamic 402 challenge terms ───────────────────────────────────────
// Normalized from the LIVE 402 response body. Never hardcoded: asset, payTo,
// amount and network all come from the parsed challenge (see M3_PROBE_RESULTS).

/**
 * One normalized payment option from a 402 challenge `accepts[]` entry.
 */
export type NormalizedChallengeTerms = {
  scheme: string;
  network: string;
  asset: string;
  maxAmountRequired: string;
  payTo: string;
  resource: string;
  eip712: { name: string; version: string };
  maxTimeoutSeconds: number;
};

/**
 * Explicit application/founder approval with economic bounds. A payment can
 * only be bound when the live challenge terms fall within these bounds.
 */
export type PaymentApproval = {
  approver: string;
  approvalId: string;
  approvedMaxAmount: string;
  approvedNetwork: string;
  approvedAsset: string;
  approvedPayTo: string;
  approvedAt: number;
};

/**
 * A challenge bound to an approval — the last state before signing.
 * state is always "ready_to_sign": the rail stops here and never signs itself.
 */
export type BoundPaymentIntent = {
  intentId: string;
  terms: NormalizedChallengeTerms;
  approval: PaymentApproval;
  boundAt: number;
  state: "ready_to_sign";
};

// ─── §9b Purchase record (multiple independent purchases per objective) ─────

/**
 * One independent economic purchase. Two purchases under one objective never
 * share an idempotencyKey, and one purchase's state can never authorize another.
 */
export type PurchaseRecord = {
  id: string;
  objectiveKey: string;
  resourceNeedId: string;
  offeringId: string;
  idempotencyKey: string;
  state: PaymentState;
  boundTerms: NormalizedChallengeTerms | null;
  approval: PaymentApproval | null;
  receipt: { transactionHash: string; settledAt?: number } | null;
  result: unknown | null;
  verified: boolean;
  createdAt: number;
  updatedAt: number;
};

// ─── §9c Buyer rail injected dependencies ───────────────────────────────────

/**
 * TEST-ONLY signing stub. Used by FakeSigner / simplified EIP-712 scaffolding.
 * This is NOT the production wallet/signing surface.
 *
 * Production signing belongs to an official Onchain OS / Agentic Wallet
 * PaymentExecutor implementation (x402 payment payload with authorization
 * fields: from, to, value, validAfter, validBefore, nonce, signature).
 */
export type Signer = {
  readonly address: string;
  /** Simplified test payload — not a production EIP-712 typed-data signer. */
  signEIP712(payload: unknown): Promise<string>;
};

/**
 * Safe subset of the official CLI response retained for reconciliation.
 * Authorization headers, signatures, and session material are intentionally
 * excluded even when the CLI returns additional fields.
 */
export type SafeOfficialPaymentResponse = {
  ok: boolean | null;
  data: {
    status?: unknown;
    txHash?: unknown;
    decodedReceipt?: unknown;
    result?: unknown;
    error?: unknown;
  } | null;
};

/**
 * Production-facing payment execution boundary.
 *
 * The application owns: purchase identity, spend approval, approved
 * network/asset/amount/recipient, lifecycle, idempotency, retry/reconciliation,
 * and settlement/result verification.
 *
 * The official OKX / Onchain OS / Agentic Wallet layer owns actual wallet
 * signing wherever practical. Do not hand-roll cryptographic signing here.
 */
export type PaymentSubmissionResult = {
  submitted: boolean;
  transactionHash?: string;
  paymentPayloadRef?: string;
  note?: string;
  safeResponse?: SafeOfficialPaymentResponse;
};

export type PaymentExecutor = {
  readonly kind: "official_onchainos" | "test_scaffold";
  executeApprovedPayment(input: {
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
  }): Promise<PaymentSubmissionResult>;
};

/**
 * Settlement readback abstraction: settlement is a distinct fact from
 * submission and from result verification.
 */
export type SettlementReader = {
  readSettlement(
    transactionHash: string,
  ): Promise<{ settled: boolean; settledAt?: number }>;
};

/**
 * Provider retry-with-payment-header abstraction.
 */
export type PaidRequestSender = {
  sendWithPayment(
    resource: string,
    paymentProof: string,
  ): Promise<{ success: boolean; result?: unknown }>;
};

/**
 * Fail-closed rail configuration. allowedNetworks defaults to testnet only in
 * practice; a mainnet network is refused unless explicitly configured.
 */
export type RailConfig = {
  allowedNetworks: readonly string[];
  maxSpend: string;
};
