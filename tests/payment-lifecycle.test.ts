import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { initial, transition, assertComplete } from "../lib/payment/lifecycle";
import { PaymentLifecycleError } from "../lib/payment/types";
import type { PaymentState, PaymentContext, PaymentEvent } from "../lib/payment/types";

describe("Payment Lifecycle State Machine", () => {
  describe("Happy path", () => {
    test("reaches verified with all proofs present", () => {
      let { state, context } = initial();
      assert.equal(state, "prepared");

      // Request approval
      let result = transition(state, { type: "request_approval", requestedBy: "user", reason: "test" }, context);
      assert.equal(result.success, true);
      if (result.success) {
        state = result.state;
        context = result.context;
      }
      assert.equal(state, "awaiting_approval");

      // Grant approval
      result = transition(state, { type: "grant_approval", grantedBy: "admin", approvalId: "approval-123" }, context);
      assert.equal(result.success, true);
      if (result.success) {
        state = result.state;
        context = result.context;
      }
      assert.equal(state, "approved");
      assert.equal(context.approvalId, "approval-123");
      assert.equal(context.grantedBy, "admin");

      // Attempt payment
      result = transition(state, { type: "attempt_payment", paymentId: "payment-456" }, context);
      assert.equal(result.success, true);
      if (result.success) {
        state = result.state;
        context = result.context;
      }
      assert.equal(state, "payment_attempted");
      assert.equal(context.paymentId, "payment-456");

      // Submit payment
      result = transition(state, { type: "submit_payment", transactionHash: "0xabc123" }, context);
      assert.equal(result.success, true);
      if (result.success) {
        state = result.state;
        context = result.context;
      }
      assert.equal(state, "submitted");
      assert.equal(context.transactionHash, "0xabc123");

      // Confirm settlement
      result = transition(state, { type: "confirm_settlement", settlementProof: "settlement-proof-789" }, context);
      assert.equal(result.success, true);
      if (result.success) {
        state = result.state;
        context = result.context;
      }
      assert.equal(state, "settled");
      assert.equal(context.settlementProof, "settlement-proof-789");

      // Receive result
      result = transition(state, { type: "receive_result", resultData: { data: "test result" } }, context);
      assert.equal(result.success, true);
      if (result.success) {
        state = result.state;
        context = result.context;
      }
      assert.equal(state, "result_received");
      assert.deepEqual(context.resultData, { data: "test result" });

      // Verify result
      result = transition(state, { type: "verify_result", verificationProof: "verification-xyz" }, context);
      assert.equal(result.success, true);
      if (result.success) {
        state = result.state;
        context = result.context;
      }
      assert.equal(state, "verified");
      assert.equal(context.verificationProof, "verification-xyz");

      // Assert complete — should not throw
      assertComplete(state, context);
    });
  });

  describe("Approval invariants", () => {
    test("cannot submit without approval", () => {
      let { state, context } = initial();
      
      // Try to attempt payment without approval
      const result = transition(state, { type: "attempt_payment", paymentId: "payment-123" }, context);
      assert.equal(result.success, false);
      if (!result.success) {
        assert.equal(result.error.currentState, "prepared");
        assert.equal(result.error.attemptedEvent, "attempt_payment");
        assert.match(result.error.reason, /approved state/);
      }
    });

    test("approval cannot be self-granted by any transition", () => {
      // Test that approval can only be granted from awaiting_approval state
      let { state, context } = initial();
      
      // Try to grant approval from prepared state
      let result = transition(state, { type: "grant_approval", grantedBy: "user", approvalId: "approval-123" }, context);
      assert.equal(result.success, false);
      if (!result.success) {
        assert.match(result.error.reason, /awaiting_approval/);
      }

      // Move to awaiting_approval
      result = transition(state, { type: "request_approval", requestedBy: "user", reason: "test" }, context);
      assert.equal(result.success, true);
      if (result.success) {
        state = result.state;
        context = result.context;
      }

      // Now grant approval should work
      result = transition(state, { type: "grant_approval", grantedBy: "admin", approvalId: "approval-123" }, context);
      assert.equal(result.success, true);
    });

    test("approval cannot be granted from any state other than awaiting_approval", () => {
      const states: PaymentState[] = ["prepared", "approved", "payment_attempted", "submitted", "settled", "result_received", "verified", "failed", "uncertain", "reconciliation_required"];
      
      for (const testState of states) {
        if (testState === "awaiting_approval") continue;
        
        const result = transition(testState, { type: "grant_approval", grantedBy: "admin", approvalId: "approval-123" }, {});
        assert.equal(result.success, false, `grant_approval should fail from state ${testState}`);
      }
    });
  });

  describe("Submission vs settlement vs verification distinctness", () => {
    test("cannot settle before submission", () => {
      let { state, context } = initial();
      
      // Move to approved
      let result = transition(state, { type: "request_approval", requestedBy: "user", reason: "test" }, context);
      assert.equal(result.success, true);
      if (result.success) {
        state = result.state;
        context = result.context;
      }
      
      result = transition(state, { type: "grant_approval", grantedBy: "admin", approvalId: "approval-123" }, context);
      assert.equal(result.success, true);
      if (result.success) {
        state = result.state;
        context = result.context;
      }

      // Try to settle without submission
      result = transition(state, { type: "confirm_settlement", settlementProof: "proof" }, context);
      assert.equal(result.success, false);
      if (!result.success) {
        assert.equal(result.error.currentState, "approved");
        assert.match(result.error.reason, /submitted state/);
      }
    });

    test("submitted is not treated as settled/confirmed", () => {
      let { state, context } = initial();
      
      // Move to submitted
      let result = transition(state, { type: "request_approval", requestedBy: "user", reason: "test" }, context);
      assert.equal(result.success, true);
      if (result.success) { state = result.state; context = result.context; }
      
      result = transition(state, { type: "grant_approval", grantedBy: "admin", approvalId: "approval-123" }, context);
      assert.equal(result.success, true);
      if (result.success) { state = result.state; context = result.context; }
      
      result = transition(state, { type: "attempt_payment", paymentId: "payment-123" }, context);
      assert.equal(result.success, true);
      if (result.success) { state = result.state; context = result.context; }
      
      result = transition(state, { type: "submit_payment", transactionHash: "0xabc" }, context);
      assert.equal(result.success, true);
      if (result.success) { state = result.state; context = result.context; }
      
      assert.equal(state, "submitted");
      
      // Try to receive result from submitted (should fail)
      result = transition(state, { type: "receive_result", resultData: {} }, context);
      assert.equal(result.success, false);
      if (!result.success) {
        assert.match(result.error.reason, /settled state/);
      }
      
      // Try to verify from submitted (should fail)
      result = transition(state, { type: "verify_result", verificationProof: "proof" }, context);
      assert.equal(result.success, false);
      if (!result.success) {
        assert.match(result.error.reason, /result_received state/);
      }
    });

    test("settled alone does not yield verified", () => {
      let { state, context } = initial();
      
      // Move to settled
      let result = transition(state, { type: "request_approval", requestedBy: "user", reason: "test" }, context);
      assert.equal(result.success, true);
      if (result.success) { state = result.state; context = result.context; }
      
      result = transition(state, { type: "grant_approval", grantedBy: "admin", approvalId: "approval-123" }, context);
      assert.equal(result.success, true);
      if (result.success) { state = result.state; context = result.context; }
      
      result = transition(state, { type: "attempt_payment", paymentId: "payment-123" }, context);
      assert.equal(result.success, true);
      if (result.success) { state = result.state; context = result.context; }
      
      result = transition(state, { type: "submit_payment", transactionHash: "0xabc" }, context);
      assert.equal(result.success, true);
      if (result.success) { state = result.state; context = result.context; }
      
      result = transition(state, { type: "confirm_settlement", settlementProof: "proof" }, context);
      assert.equal(result.success, true);
      if (result.success) { state = result.state; context = result.context; }
      
      assert.equal(state, "settled");
      
      // Try to verify from settled (should fail)
      result = transition(state, { type: "verify_result", verificationProof: "proof" }, context);
      assert.equal(result.success, false);
      if (!result.success) {
        assert.match(result.error.reason, /result_received state/);
      }
    });

    test("result_received is not automatically verified", () => {
      let { state, context } = initial();
      
      // Move to result_received
      let result = transition(state, { type: "request_approval", requestedBy: "user", reason: "test" }, context);
      assert.equal(result.success, true);
      if (result.success) { state = result.state; context = result.context; }
      
      result = transition(state, { type: "grant_approval", grantedBy: "admin", approvalId: "approval-123" }, context);
      assert.equal(result.success, true);
      if (result.success) { state = result.state; context = result.context; }
      
      result = transition(state, { type: "attempt_payment", paymentId: "payment-123" }, context);
      assert.equal(result.success, true);
      if (result.success) { state = result.state; context = result.context; }
      
      result = transition(state, { type: "submit_payment", transactionHash: "0xabc" }, context);
      assert.equal(result.success, true);
      if (result.success) { state = result.state; context = result.context; }
      
      result = transition(state, { type: "confirm_settlement", settlementProof: "proof" }, context);
      assert.equal(result.success, true);
      if (result.success) { state = result.state; context = result.context; }
      
      result = transition(state, { type: "receive_result", resultData: {} }, context);
      assert.equal(result.success, true);
      if (result.success) { state = result.state; context = result.context; }
      
      assert.equal(state, "result_received");
      assert.notEqual(state, "verified");
      
      // assertComplete should fail
      assert.throws(() => assertComplete(state, context), /not complete/);
    });
  });

  describe("Uncertainty and reconciliation", () => {
    test("uncertain state cannot simply retry payment; reconciliation required first", () => {
      let { state, context } = initial();
      
      // Move to uncertain
      let result = transition(state, { type: "request_approval", requestedBy: "user", reason: "test" }, context);
      assert.equal(result.success, true);
      if (result.success) { state = result.state; context = result.context; }
      
      result = transition(state, { type: "grant_approval", grantedBy: "admin", approvalId: "approval-123" }, context);
      assert.equal(result.success, true);
      if (result.success) { state = result.state; context = result.context; }
      
      result = transition(state, { type: "attempt_payment", paymentId: "payment-123" }, context);
      assert.equal(result.success, true);
      if (result.success) { state = result.state; context = result.context; }
      
      result = transition(state, { type: "report_uncertainty", uncertaintyReason: "timeout" }, context);
      assert.equal(result.success, true);
      if (result.success) { state = result.state; context = result.context; }
      
      assert.equal(state, "uncertain");
      
      // Try to retry payment from uncertain (should fail)
      result = transition(state, { type: "retry_payment", newPaymentId: "payment-456" }, context);
      assert.equal(result.success, false);
      if (!result.success) {
        assert.match(result.error.reason, /approved state/);
      }
    });

    test("after reconciliation succeeds, exactly one repayment path is authorized (no double-pay)", () => {
      let { state, context } = initial();
      
      // Move to uncertain
      let result = transition(state, { type: "request_approval", requestedBy: "user", reason: "test" }, context);
      assert.equal(result.success, true);
      if (result.success) { state = result.state; context = result.context; }
      
      result = transition(state, { type: "grant_approval", grantedBy: "admin", approvalId: "approval-123" }, context);
      assert.equal(result.success, true);
      if (result.success) { state = result.state; context = result.context; }
      
      result = transition(state, { type: "attempt_payment", paymentId: "payment-123" }, context);
      assert.equal(result.success, true);
      if (result.success) { state = result.state; context = result.context; }
      
      result = transition(state, { type: "report_uncertainty", uncertaintyReason: "timeout" }, context);
      assert.equal(result.success, true);
      if (result.success) { state = result.state; context = result.context; }
      
      // Require reconciliation
      result = transition(state, { type: "require_reconciliation", reason: "verify no double-spend" }, context);
      assert.equal(result.success, true);
      if (result.success) { state = result.state; context = result.context; }
      assert.equal(state, "reconciliation_required");
      
      // Complete reconciliation
      result = transition(state, { type: "complete_reconciliation", reconciliationProof: "recon-proof-123" }, context);
      assert.equal(result.success, true);
      if (result.success) { state = result.state; context = result.context; }
      assert.equal(state, "approved");
      assert.equal(context.reconciliationProof, "recon-proof-123");
      
      // Retry payment (first retry)
      result = transition(state, { type: "retry_payment", newPaymentId: "payment-456" }, context);
      assert.equal(result.success, true);
      if (result.success) { state = result.state; context = result.context; }
      assert.equal(state, "payment_attempted");
      assert.equal(context.retryPaymentId, "payment-456");
      
      // Try to retry again (should route to reconciliation)
      result = transition(state, { type: "retry_payment", newPaymentId: "payment-789" }, context);
      assert.equal(result.success, false);
      if (!result.success) {
        assert.match(result.error.reason, /approved state/);
      }
    });

    test("duplicate submission rejected / routed to reconciliation", () => {
      let { state, context } = initial();
      
      // Move to submitted
      let result = transition(state, { type: "request_approval", requestedBy: "user", reason: "test" }, context);
      assert.equal(result.success, true);
      if (result.success) { state = result.state; context = result.context; }
      
      result = transition(state, { type: "grant_approval", grantedBy: "admin", approvalId: "approval-123" }, context);
      assert.equal(result.success, true);
      if (result.success) { state = result.state; context = result.context; }
      
      result = transition(state, { type: "attempt_payment", paymentId: "payment-123" }, context);
      assert.equal(result.success, true);
      if (result.success) { state = result.state; context = result.context; }
      
      result = transition(state, { type: "submit_payment", transactionHash: "0xabc" }, context);
      assert.equal(result.success, true);
      if (result.success) { state = result.state; context = result.context; }
      assert.equal(state, "submitted");
      
      // Try to submit again (duplicate)
      result = transition(state, { type: "submit_payment", transactionHash: "0xdef" }, context);
      assert.equal(result.success, true);
      if (result.success) {
        state = result.state;
        context = result.context;
        assert.equal(state, "reconciliation_required");
        assert.match(context.uncertaintyReason || "", /Duplicate submission/);
      }
    });
  });

  describe("Post-submission failure safety", () => {
    test("a failure reported after submission routes to reconciliation, not failed", () => {
      let { state, context } = initial();

      for (const event of [
        { type: "request_approval", requestedBy: "user", reason: "test" },
        { type: "grant_approval", grantedBy: "admin", approvalId: "approval-123" },
        { type: "attempt_payment", paymentId: "payment-123" },
        { type: "submit_payment", transactionHash: "0xabc" },
      ] as PaymentEvent[]) {
        const result = transition(state, event, context);
        assert.equal(result.success, true);
        if (result.success) {
          state = result.state;
          context = result.context;
        }
      }

      const result = transition(
        state,
        { type: "report_failure", failureReason: "merchant returned an error after submission" },
        context,
      );
      assert.equal(result.success, true);
      if (result.success) {
        assert.equal(result.state, "reconciliation_required");
        assert.match(result.context.uncertaintyReason ?? "", /after submission/i);
      }
    });
  });

  describe("Failure invariants", () => {
    test("failure cannot become verified", () => {
      let { state, context } = initial();
      
      // Move to failed
      let result = transition(state, { type: "request_approval", requestedBy: "user", reason: "test" }, context);
      assert.equal(result.success, true);
      if (result.success) { state = result.state; context = result.context; }
      
      result = transition(state, { type: "grant_approval", grantedBy: "admin", approvalId: "approval-123" }, context);
      assert.equal(result.success, true);
      if (result.success) { state = result.state; context = result.context; }
      
      result = transition(state, { type: "attempt_payment", paymentId: "payment-123" }, context);
      assert.equal(result.success, true);
      if (result.success) { state = result.state; context = result.context; }
      
      result = transition(state, { type: "report_failure", failureReason: "insufficient funds" }, context);
      assert.equal(result.success, true);
      if (result.success) { state = result.state; context = result.context; }
      assert.equal(state, "failed");
      
      // Try to verify from failed (should fail)
      result = transition(state, { type: "verify_result", verificationProof: "proof" }, context);
      assert.equal(result.success, false);
      if (!result.success) {
        assert.match(result.error.reason, /result_received state/);
      }
      
      // assertComplete should fail
      assert.throws(() => assertComplete(state, context), /not complete/);
    });

    test("failed state requires reconciliation before retry", () => {
      let { state, context } = initial();
      
      // Move to failed
      let result = transition(state, { type: "request_approval", requestedBy: "user", reason: "test" }, context);
      assert.equal(result.success, true);
      if (result.success) { state = result.state; context = result.context; }
      
      result = transition(state, { type: "grant_approval", grantedBy: "admin", approvalId: "approval-123" }, context);
      assert.equal(result.success, true);
      if (result.success) { state = result.state; context = result.context; }
      
      result = transition(state, { type: "attempt_payment", paymentId: "payment-123" }, context);
      assert.equal(result.success, true);
      if (result.success) { state = result.state; context = result.context; }
      
      result = transition(state, { type: "report_failure", failureReason: "network error" }, context);
      assert.equal(result.success, true);
      if (result.success) { state = result.state; context = result.context; }
      assert.equal(state, "failed");
      
      // Try to retry without reconciliation (should fail)
      result = transition(state, { type: "retry_payment", newPaymentId: "payment-456" }, context);
      assert.equal(result.success, false);
      if (!result.success) {
        assert.match(result.error.reason, /approved state/);
      }
      
      // Require reconciliation
      result = transition(state, { type: "require_reconciliation", reason: "verify failure" }, context);
      assert.equal(result.success, true);
      if (result.success) { state = result.state; context = result.context; }
      assert.equal(state, "reconciliation_required");
      
      // Complete reconciliation
      result = transition(state, { type: "complete_reconciliation", reconciliationProof: "recon-proof" }, context);
      assert.equal(result.success, true);
      if (result.success) { state = result.state; context = result.context; }
      assert.equal(state, "approved");
      
      // Now retry should work
      result = transition(state, { type: "retry_payment", newPaymentId: "payment-456" }, context);
      assert.equal(result.success, true);
    });
  });

  describe("Determinism and purity", () => {
    test("same state+event → same result; machine holds no hidden mutable state", () => {
      const state: PaymentState = "prepared";
      const context: PaymentContext = {};
      const event: PaymentEvent = { type: "request_approval", requestedBy: "user", reason: "test" };
      
      // Call transition multiple times
      const result1 = transition(state, event, context);
      const result2 = transition(state, event, context);
      const result3 = transition(state, event, context);
      
      // All results should be identical
      assert.deepEqual(result1, result2);
      assert.deepEqual(result2, result3);
      
      // Original state and context should be unchanged
      assert.equal(state, "prepared");
      assert.deepEqual(context, {});
    });

    test("transition does not mutate input context", () => {
      const state: PaymentState = "awaiting_approval";
      const context: PaymentContext = { paymentId: "original" };
      const event: PaymentEvent = { type: "grant_approval", grantedBy: "admin", approvalId: "approval-123" };
      
      const result = transition(state, event, context);
      
      // Original context should be unchanged
      assert.equal(context.paymentId, "original");
      assert.equal(context.approvalId, undefined);
      
      // New context should have both
      if (result.success) {
        assert.equal(result.context.paymentId, "original");
        assert.equal(result.context.approvalId, "approval-123");
      }
    });
  });

  describe("Unknown/tampered state or event", () => {
    test("unknown event type fails closed", () => {
      const state: PaymentState = "prepared";
      const context: PaymentContext = {};
      const unknownEvent = { type: "unknown_event" } as any;
      
      const result = transition(state, unknownEvent, context);
      assert.equal(result.success, false);
      if (!result.success) {
        assert.match(result.error.reason, /Unknown event type/);
      }
    });

    test("illegal transition returns typed rejection", () => {
      const state: PaymentState = "prepared";
      const context: PaymentContext = {};
      
      // Try illegal transition
      const result = transition(state, { type: "submit_payment", transactionHash: "0xabc" }, context);
      assert.equal(result.success, false);
      if (!result.success) {
        assert.ok(result.error instanceof PaymentLifecycleError);
        assert.equal(result.error.currentState, state);
        assert.equal(result.error.attemptedEvent, "submit_payment");
      }
    });
  });

  describe("assertComplete gate", () => {
    test("assertComplete throws if not verified", () => {
      const states: PaymentState[] = ["prepared", "awaiting_approval", "approved", "payment_attempted", "submitted", "settled", "result_received", "failed", "uncertain", "reconciliation_required"];
      
      for (const testState of states) {
        assert.throws(() => assertComplete(testState, {}), /not complete/);
      }
    });

    test("assertComplete throws if missing required proofs", () => {
      const state: PaymentState = "verified";
      
      // Missing approval
      assert.throws(() => assertComplete(state, { transactionHash: "0x", settlementProof: "s", resultData: {}, verificationProof: "v" }), /approval proof/);
      
      // Missing transaction hash
      assert.throws(() => assertComplete(state, { approvalId: "a", settlementProof: "s", resultData: {}, verificationProof: "v" }), /transaction hash/);
      
      // Missing settlement proof
      assert.throws(() => assertComplete(state, { approvalId: "a", transactionHash: "0x", resultData: {}, verificationProof: "v" }), /settlement proof/);
      
      // Missing result data
      assert.throws(() => assertComplete(state, { approvalId: "a", transactionHash: "0x", settlementProof: "s", verificationProof: "v" }), /result data/);
      
      // Missing verification proof
      assert.throws(() => assertComplete(state, { approvalId: "a", transactionHash: "0x", settlementProof: "s", resultData: {} }), /verification proof/);
    });

    test("assertComplete succeeds with all proofs", () => {
      const state: PaymentState = "verified";
      const context: PaymentContext = {
        approvalId: "approval-123",
        transactionHash: "0xabc",
        settlementProof: "settlement-proof",
        resultData: { data: "result" },
        verificationProof: "verification-proof",
      };
      
      // Should not throw
      assertComplete(state, context);
    });
  });
});
