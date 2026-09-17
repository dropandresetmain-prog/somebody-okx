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
