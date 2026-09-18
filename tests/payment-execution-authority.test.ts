import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import {
  FilePaymentExecutionAuthority,
  PaymentExecutionAlreadyClaimedError,
  resolvePaymentExecutionLedgerPath,
} from "../lib/payment/executionAuthority";

describe("payment execution authority path", () => {
  it("resolves one application-owned ledger path across different launch directories", () => {
    const applicationRoot = fs.mkdtempSync(path.join(os.tmpdir(), "somebody-payment-app-"));
    const launchDirectoryA = fs.mkdtempSync(path.join(os.tmpdir(), "somebody-launch-a-"));
    const launchDirectoryB = fs.mkdtempSync(path.join(os.tmpdir(), "somebody-launch-b-"));
    const originalCwd = process.cwd();
    try {
      process.chdir(launchDirectoryA);
      const fromA = resolvePaymentExecutionLedgerPath(applicationRoot);
      process.chdir(launchDirectoryB);
      const fromB = resolvePaymentExecutionLedgerPath(applicationRoot);
      assert.equal(fromA, fromB);
      assert.equal(fromA, path.join(applicationRoot, ".m3-payment-execution-ledger.json"));
    } finally {
      process.chdir(originalCwd);
    }
  });

  it("blocks the same purchase through separately constructed authorities while allowing another purchase", () => {
    const applicationRoot = fs.mkdtempSync(path.join(os.tmpdir(), "somebody-payment-authority-"));
    const launchDirectoryA = fs.mkdtempSync(path.join(os.tmpdir(), "somebody-authority-launch-a-"));
    const launchDirectoryB = fs.mkdtempSync(path.join(os.tmpdir(), "somebody-authority-launch-b-"));
    const ledgerFile = resolvePaymentExecutionLedgerPath(applicationRoot);
    const firstAuthority = new FilePaymentExecutionAuthority(ledgerFile);
    const originalCwd = process.cwd();
    try {
      process.chdir(launchDirectoryA);
      const first = firstAuthority.claim({
        purchaseId: "purchase-a",
        idempotencyKey: "idem-a",
        approvalId: "approval-a",
        at: 1_000,
      });

      process.chdir(launchDirectoryB);
      const reconstructedAuthority = new FilePaymentExecutionAuthority(
        resolvePaymentExecutionLedgerPath(applicationRoot),
      );
      assert.throws(
        () => reconstructedAuthority.claim({
          purchaseId: "purchase-a",
          idempotencyKey: "idem-a",
          approvalId: "approval-a-retry",
          at: 2_000,
        }),
        PaymentExecutionAlreadyClaimedError,
      );

      const second = reconstructedAuthority.claim({
        purchaseId: "purchase-b",
        idempotencyKey: "idem-b",
        approvalId: "approval-b",
        at: 3_000,
      });
      assert.equal(first.purchaseId, "purchase-a");
      assert.equal(second.purchaseId, "purchase-b");
    } finally {
      process.chdir(originalCwd);
    }
  });
});
