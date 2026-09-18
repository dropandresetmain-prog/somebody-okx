// Payment lifecycle state machine — pure, integration-free
// No I/O, no network, no env reads, no timers, no randomness, no crypto

import type {
  PaymentContext,
  PaymentEvent,
  PaymentState,
  TransitionResult,
} from "./types";
import { PaymentLifecycleError } from "./types";

/**
 * Create initial payment state.
 */
export function initial(): { state: PaymentState; context: PaymentContext } {
  return { state: "prepared", context: {} };
}

/**
 * Transition the payment lifecycle state machine.
 * 
 * Returns a TransitionResult — either success with new state/context, or a typed rejection.
 * 
 * Critical invariants enforced:
 * - submission != settlement != verification (three distinct facts, never collapsed)
 * - result_received is NOT verified
 * - approval must be explicit (no self-granting, no transition widens authority)
 * - terminal verified requires settled AND independently received/verified result
 * - ambiguous/uncertain state cannot authorize blind repayment — reconciliation required first
 * - duplicate submission rejected or routed to reconciliation
 * - failed state cannot reach verified without explicit new attempt with reconciliation
 * - illegal transitions return typed rejection (never silently no-op)
 */
export function transition(
  currentState: PaymentState,
  event: PaymentEvent,
  currentContext: PaymentContext,
): TransitionResult {
  // Determinism check: same state+event → same result (no hidden mutable state)
  const result = computeTransition(currentState, event, currentContext);
  return result;
}

function computeTransition(
  state: PaymentState,
  event: PaymentEvent,
  context: PaymentContext,
): TransitionResult {
  switch (event.type) {
    case "request_approval":
      return handleRequestApproval(state, event, context);
    case "grant_approval":
      return handleGrantApproval(state, event, context);
    case "deny_approval":
      return handleDenyApproval(state, event, context);
    case "attempt_payment":
      return handleAttemptPayment(state, event, context);
    case "submit_payment":
      return handleSubmitPayment(state, event, context);
    case "confirm_settlement":
      return handleConfirmSettlement(state, event, context);
    case "receive_result":
      return handleReceiveResult(state, event, context);
    case "verify_result":
      return handleVerifyResult(state, event, context);
    case "report_failure":
      return handleReportFailure(state, event, context);
    case "report_uncertainty":
      return handleReportUncertainty(state, event, context);
    case "require_reconciliation":
      return handleRequireReconciliation(state, event, context);
    case "complete_reconciliation":
      return handleCompleteReconciliation(state, event, context);
    case "retry_payment":
      return handleRetryPayment(state, event, context);
    default: {
      // Unknown event type — fail closed
      // TypeScript exhaustiveness check: if event is not never, this is a type error
      const _exhaustive: never = event;
      void _exhaustive; // suppress unused warning
      return fail(state, "unknown", "Unknown event type");
    }
  }
}

// ============================================================================
// Approval handlers
// ============================================================================

function handleRequestApproval(
  state: PaymentState,
  event: { type: "request_approval"; requestedBy: string; reason: string },
  context: PaymentContext,
): TransitionResult {
  // Only valid from prepared
  if (state !== "prepared") {
    return fail(state, event.type, "Approval can only be requested from prepared state");
  }
  return succeed("awaiting_approval", context);
}

function handleGrantApproval(
  state: PaymentState,
  event: { type: "grant_approval"; grantedBy: string; approvalId: string },
  context: PaymentContext,
): TransitionResult {
  // Only valid from awaiting_approval
  // CRITICAL: approval must be explicit — cannot be self-granted
  if (state !== "awaiting_approval") {
    return fail(state, event.type, "Approval can only be granted from awaiting_approval state");
  }
  // Approval is granted by an external actor (grantedBy), not by the payment itself
  return succeed("approved", { ...context, approvalId: event.approvalId, grantedBy: event.grantedBy });
}

function handleDenyApproval(
  state: PaymentState,
  event: { type: "deny_approval"; deniedBy: string; reason: string },
  context: PaymentContext,
): TransitionResult {
  // Only valid from awaiting_approval
  if (state !== "awaiting_approval") {
    return fail(state, event.type, "Approval can only be denied from awaiting_approval state");
  }
  return fail(state, event.type, "Approval denied");
}

// ============================================================================
// Payment submission handlers
// ============================================================================

function handleAttemptPayment(
  state: PaymentState,
  event: { type: "attempt_payment"; paymentId: string },
  context: PaymentContext,
): TransitionResult {
  // Only valid from approved
  // CRITICAL: cannot submit without approval
  if (state !== "approved") {
    return fail(state, event.type, "Payment can only be attempted from approved state");
  }
  return succeed("payment_attempted", { ...context, paymentId: event.paymentId });
}

function handleSubmitPayment(
  state: PaymentState,
  event: { type: "submit_payment"; transactionHash: string },
  context: PaymentContext,
): TransitionResult {
  // Only valid from payment_attempted
  // CRITICAL: duplicate submission check — if already submitted, reject or route to reconciliation
  if (state === "submitted" || state === "settled" || state === "result_received" || state === "verified") {
    // Duplicate submission — route to reconciliation
    return succeed("reconciliation_required", { ...context, uncertaintyReason: "Duplicate submission detected" });
  }
  if (state !== "payment_attempted") {
    return fail(state, event.type, "Payment can only be submitted from payment_attempted state");
  }
  return succeed("submitted", { ...context, transactionHash: event.transactionHash });
}

// ============================================================================
// Settlement handlers
// ============================================================================

function handleConfirmSettlement(
  state: PaymentState,
  event: { type: "confirm_settlement"; settlementProof: string },
  context: PaymentContext,
): TransitionResult {
  // Only valid from submitted
  // CRITICAL: cannot settle before submission
  if (state !== "submitted") {
    return fail(state, event.type, "Settlement can only be confirmed from submitted state");
  }
  return succeed("settled", { ...context, settlementProof: event.settlementProof });
}

// ============================================================================
// Result and verification handlers
// ============================================================================

function handleReceiveResult(
  state: PaymentState,
  event: { type: "receive_result"; resultData: unknown },
  context: PaymentContext,
): TransitionResult {
  // Only valid from settled
  // CRITICAL: result_received is NOT verified — verification is a separate step
  if (state !== "settled") {
    return fail(state, event.type, "Result can only be received from settled state");
  }
  return succeed("result_received", { ...context, resultData: event.resultData });
}

function handleVerifyResult(
  state: PaymentState,
  event: { type: "verify_result"; verificationProof: string },
  context: PaymentContext,
): TransitionResult {
  // Only valid from result_received
  // CRITICAL: terminal verified requires settled AND independently received/verified result
  // This is enforced by the state sequence: submitted → settled → result_received → verified
  if (state !== "result_received") {
    return fail(state, event.type, "Result can only be verified from result_received state");
  }
  // Verify that we have the required proofs
  if (!context.settlementProof) {
    return fail(state, event.type, "Cannot verify without settlement proof");
  }
  if (context.resultData === undefined) {
    return fail(state, event.type, "Cannot verify without result data");
  }
  return succeed("verified", { ...context, verificationProof: event.verificationProof });
}

// ============================================================================
// Failure and uncertainty handlers
// ============================================================================

function handleReportFailure(
  state: PaymentState,
  event: { type: "report_failure"; failureReason: string },
  context: PaymentContext,
): TransitionResult {
  // A source-proven pre-submission failure may become failed. Once a payment
  // was submitted — or submission is already uncertain — a later error can no
  // longer prove non-settlement, so it must reconcile before any new spend.
  if (state === "submitted" || state === "uncertain") {
    return succeed("reconciliation_required", {
      ...context,
      failureReason: event.failureReason,
      uncertaintyReason: "Failure reported after submission became possible",
    });
  }
  if (state !== "payment_attempted") {
    return fail(
      state,
      event.type,
      "Failure can only be reported from payment_attempted, submitted, or uncertain states",
    );
  }
  return succeed("failed", { ...context, failureReason: event.failureReason });
}

function handleReportUncertainty(
  state: PaymentState,
  event: { type: "report_uncertainty"; uncertaintyReason: string },
  context: PaymentContext,
): TransitionResult {
  // Uncertainty can be reported from payment_attempted or submitted states
  if (state !== "payment_attempted" && state !== "submitted") {
    return fail(state, event.type, "Uncertainty can only be reported from payment_attempted or submitted states");
  }
  return succeed("uncertain", { ...context, uncertaintyReason: event.uncertaintyReason });
}

// ============================================================================
// Reconciliation handlers
// ============================================================================

function handleRequireReconciliation(
  state: PaymentState,
  event: { type: "require_reconciliation"; reason: string },
  context: PaymentContext,
): TransitionResult {
  // Reconciliation can be required from failed, uncertain, or reconciliation_required states
  // CRITICAL: ambiguous/uncertain state cannot authorize blind repayment — reconciliation required first
  if (state !== "failed" && state !== "uncertain" && state !== "reconciliation_required") {
    return fail(state, event.type, "Reconciliation can only be required from failed, uncertain, or reconciliation_required states");
  }
  return succeed("reconciliation_required", { ...context, uncertaintyReason: event.reason });
}

function handleCompleteReconciliation(
  state: PaymentState,
  event: { type: "complete_reconciliation"; reconciliationProof: string },
  context: PaymentContext,
): TransitionResult {
  // Only valid from reconciliation_required
  if (state !== "reconciliation_required") {
    return fail(state, event.type, "Reconciliation can only be completed from reconciliation_required state");
  }
  return succeed("approved", { ...context, reconciliationProof: event.reconciliationProof });
}

function handleRetryPayment(
  state: PaymentState,
  event: { type: "retry_payment"; newPaymentId: string },
  context: PaymentContext,
): TransitionResult {
  // CRITICAL: retry is only allowed from approved state (after reconciliation)
  // This prevents blind repayment from uncertain/failed states
  if (state !== "approved") {
    return fail(state, event.type, "Retry payment is only allowed from approved state (after reconciliation)");
  }
  // If this is a retry after reconciliation, ensure we have reconciliation proof
  if (!context.reconciliationProof) {
    return fail(state, event.type, "Retry payment requires reconciliation proof");
  }
  // Check for duplicate retry — if we already have a retryPaymentId, route to reconciliation
  if (context.retryPaymentId) {
    return succeed("reconciliation_required", { ...context, uncertaintyReason: "Duplicate retry detected" });
  }
  return succeed("payment_attempted", { ...context, retryPaymentId: event.newPaymentId });
}

// ============================================================================
// Helper functions
// ============================================================================

function succeed(state: PaymentState, context: PaymentContext): TransitionResult {
  return { success: true, state, context };
}

function fail(state: PaymentState, eventType: string, reason: string): TransitionResult {
  return {
    success: false,
    error: new PaymentLifecycleError(state, eventType, reason),
  };
}

/**
 * Assert that a payment lifecycle is complete (reached verified state).
 * 
 * This is the completion gate — proves that verified cannot be reached without:
 * - explicit approval
 * - payment submission
 * - settlement confirmation
 * - result receipt
 * - independent verification
 */
export function assertComplete(
  state: PaymentState,
  context: PaymentContext,
): void {
  if (state !== "verified") {
    throw new Error(`Payment lifecycle is not complete: current state is ${state}, expected verified`);
  }
  // Verify all required proofs are present
  if (!context.approvalId) {
    throw new Error("Payment lifecycle is missing approval proof");
  }
  if (!context.transactionHash) {
    throw new Error("Payment lifecycle is missing transaction hash");
  }
  if (!context.settlementProof) {
    throw new Error("Payment lifecycle is missing settlement proof");
  }
  if (context.resultData === undefined) {
    throw new Error("Payment lifecycle is missing result data");
  }
  if (!context.verificationProof) {
    throw new Error("Payment lifecycle is missing verification proof");
  }
}
