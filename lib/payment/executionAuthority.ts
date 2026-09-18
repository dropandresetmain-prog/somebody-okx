/**
 * Durable application-owned authority for one payment attempt per purchase.
 *
 * The ledger is deliberately small. A claim is written before wallet signing,
 * and every later outcome keeps the claim occupied. A process crash therefore
 * leaves an attempt that must be reconciled instead of silently restoring spend
 * authority on restart.
 */

import fs from "node:fs";
import path from "node:path";

export type PaymentExecutionStatus =
  | "attempting"
  | "pre_submission_failed"
  | "submitted"
  | "ambiguous"
  | "settled"
  | "verified";

export type PaymentExecutionAttempt = {
  attemptId: string;
  purchaseId: string;
  idempotencyKey: string;
  approvalId: string;
  status: PaymentExecutionStatus;
  transactionHash?: string;
  failureStage?: string;
  claimedAt: number;
  updatedAt: number;
};

export type SettlementExecutionBinding = {
  purchaseId: string;
  executionAttemptId: string;
  transactionHash: string;
};

export type PaymentExecutionAuthority = {
  claim(input: {
    purchaseId: string;
    idempotencyKey: string;
    approvalId: string;
    at?: number;
  }): PaymentExecutionAttempt;
  recordPreSubmissionFailure(attemptId: string, stage: string, at?: number): void;
  recordAmbiguous(attemptId: string, at?: number): void;
  recordSubmitted(attemptId: string, transactionHash: string, at?: number): void;
  recordSettled(attemptId: string, at?: number): void;
  recordVerified(attemptId: string, at?: number): void;
  getAttempt(attemptId: string): PaymentExecutionAttempt | undefined;
  getSettlementBinding(
    attemptId: string,
    purchaseId: string,
    transactionHash: string,
  ): SettlementExecutionBinding;
};

export class PaymentExecutionAlreadyClaimedError extends Error {
  constructor(public readonly existing: PaymentExecutionAttempt) {
    super(
      `Purchase ${existing.purchaseId} already has durable payment execution authority `
      + `in state ${existing.status}; reconcile before another attempt`,
    );
    this.name = "PaymentExecutionAlreadyClaimedError";
  }
}

export class PaymentExecutionAuthorityBusyError extends Error {
  constructor(public readonly ledgerFile: string) {
    super(`Payment execution ledger is busy: ${ledgerFile}`);
    this.name = "PaymentExecutionAuthorityBusyError";
  }
}

export class PaymentExecutionBindingError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PaymentExecutionBindingError";
  }
}

type Ledger = {
  version: 1;
  attempts: PaymentExecutionAttempt[];
};

function emptyLedger(): Ledger {
  return { version: 1, attempts: [] };
}

function readLedger(file: string): Ledger {
  if (!fs.existsSync(file)) return emptyLedger();
  const parsed = JSON.parse(fs.readFileSync(file, "utf8")) as Partial<Ledger>;
  if (parsed.version !== 1 || !Array.isArray(parsed.attempts)) {
    throw new Error(`Payment execution ledger is malformed: ${file}`);
  }
  return parsed as Ledger;
}

function writeLedger(file: string, ledger: Ledger): void {
  const directory = path.dirname(file);
  fs.mkdirSync(directory, { recursive: true });
  const temporary = `${file}.${process.pid}.${Date.now()}.tmp`;
  fs.writeFileSync(temporary, JSON.stringify(ledger, null, 2), { encoding: "utf8" });
  fs.renameSync(temporary, file);
}

function withExclusiveLedger<T>(file: string, fn: () => T): T {
  const lockFile = `${file}.lock`;
  let descriptor: number;
  try {
    descriptor = fs.openSync(lockFile, "wx");
  } catch {
    throw new PaymentExecutionAuthorityBusyError(file);
  }

  try {
    return fn();
  } finally {
    fs.closeSync(descriptor);
    fs.unlinkSync(lockFile);
  }
}

function cloneAttempt(attempt: PaymentExecutionAttempt): PaymentExecutionAttempt {
  return { ...attempt };
}

function normalizeTransactionHash(value: string): string {
  const normalized = value.toLowerCase();
  if (!/^0x[0-9a-f]{64}$/.test(normalized)) {
    throw new PaymentExecutionBindingError("Submitted transaction identity is not a 32-byte EVM hash");
  }
  return normalized;
}

/** JSON-file implementation used by the M3 state-file application boundary. */
export class FilePaymentExecutionAuthority implements PaymentExecutionAuthority {
  constructor(private readonly ledgerFile: string) {}

  claim(input: {
    purchaseId: string;
    idempotencyKey: string;
    approvalId: string;
    at?: number;
  }): PaymentExecutionAttempt {
    return withExclusiveLedger(this.ledgerFile, () => {
      const ledger = readLedger(this.ledgerFile);
      const existing = ledger.attempts.find(
        (attempt) =>
          attempt.purchaseId === input.purchaseId
          || attempt.idempotencyKey === input.idempotencyKey,
      );
      if (existing) throw new PaymentExecutionAlreadyClaimedError(cloneAttempt(existing));

      const at = input.at ?? Date.now();
      const attempt: PaymentExecutionAttempt = {
        attemptId: `payment-attempt-${input.purchaseId}-${at}-${process.pid}`,
        purchaseId: input.purchaseId,
        idempotencyKey: input.idempotencyKey,
        approvalId: input.approvalId,
        status: "attempting",
        claimedAt: at,
        updatedAt: at,
      };
      ledger.attempts.push(attempt);
      writeLedger(this.ledgerFile, ledger);
      return cloneAttempt(attempt);
    });
  }

  recordPreSubmissionFailure(attemptId: string, stage: string, at = Date.now()): void {
    this.update(attemptId, (attempt) => ({
      ...attempt,
      status: "pre_submission_failed",
      failureStage: stage,
      updatedAt: at,
    }));
  }

  recordAmbiguous(attemptId: string, at = Date.now()): void {
    this.update(attemptId, (attempt) => ({ ...attempt, status: "ambiguous", updatedAt: at }));
  }

  recordSubmitted(attemptId: string, transactionHash: string, at = Date.now()): void {
    const normalizedTransactionHash = normalizeTransactionHash(transactionHash);
    this.update(attemptId, (attempt, ledger) => {
      const other = ledger.attempts.find(
        (candidate) => candidate.attemptId !== attemptId && candidate.transactionHash === normalizedTransactionHash,
      );
      if (other) {
        throw new PaymentExecutionBindingError(
          `Transaction ${normalizedTransactionHash} is already associated with purchase ${other.purchaseId}`,
        );
      }
      return { ...attempt, status: "submitted", transactionHash: normalizedTransactionHash, updatedAt: at };
    });
  }

  recordSettled(attemptId: string, at = Date.now()): void {
    this.update(attemptId, (attempt) => ({ ...attempt, status: "settled", updatedAt: at }));
  }

  recordVerified(attemptId: string, at = Date.now()): void {
    this.update(attemptId, (attempt) => ({ ...attempt, status: "verified", updatedAt: at }));
  }

  getAttempt(attemptId: string): PaymentExecutionAttempt | undefined {
    const attempt = readLedger(this.ledgerFile).attempts.find((candidate) => candidate.attemptId === attemptId);
    return attempt ? cloneAttempt(attempt) : undefined;
  }

  getSettlementBinding(
    attemptId: string,
    purchaseId: string,
    transactionHash: string,
  ): SettlementExecutionBinding {
    const attempt = this.getAttempt(attemptId);
    if (!attempt) throw new PaymentExecutionBindingError(`Unknown payment execution attempt ${attemptId}`);
    if (attempt.purchaseId !== purchaseId) {
      throw new PaymentExecutionBindingError("Payment execution attempt belongs to another purchase");
    }
    if (attempt.transactionHash !== normalizeTransactionHash(transactionHash)) {
      throw new PaymentExecutionBindingError("Transaction is not the one recorded for this execution attempt");
    }
    if (!attempt.transactionHash || !["submitted", "settled", "verified"].includes(attempt.status)) {
      throw new PaymentExecutionBindingError("Payment execution has no independently recorded submission");
    }
    return { purchaseId, executionAttemptId: attemptId, transactionHash };
  }

  private update(
    attemptId: string,
    updater: (attempt: PaymentExecutionAttempt, ledger: Ledger) => PaymentExecutionAttempt,
  ): void {
    withExclusiveLedger(this.ledgerFile, () => {
      const ledger = readLedger(this.ledgerFile);
      const index = ledger.attempts.findIndex((attempt) => attempt.attemptId === attemptId);
      if (index < 0) throw new PaymentExecutionBindingError(`Unknown payment execution attempt ${attemptId}`);
      ledger.attempts[index] = updater(ledger.attempts[index], ledger);
      writeLedger(this.ledgerFile, ledger);
    });
  }
}
