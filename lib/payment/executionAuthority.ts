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

export type PaymentAuthorizationIdentity = {
  authorizationKind: "eip3009";
  authorizationNonce: string;
  authorizationValidAfter: string;
  authorizationValidBefore: string;
};

export type PaymentExecutionAttempt = {
  attemptId: string;
  purchaseId: string;
  idempotencyKey: string;
  approvalId: string;
  status: PaymentExecutionStatus;
  transactionHash?: string;
  failureStage?: string;
  authorizationKind?: PaymentAuthorizationIdentity["authorizationKind"];
  authorizationNonce?: string;
  authorizationValidAfter?: string;
  authorizationValidBefore?: string;
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
  recordAuthorization(attemptId: string, identity: PaymentAuthorizationIdentity, at?: number): void;
  recordAmbiguous(attemptId: string, at?: number): void;
  recordSubmitted(attemptId: string, transactionHash: string, at?: number): void;
  recordSettled(attemptId: string, at?: number): void;
  recordVerified(attemptId: string, at?: number): void;
  getAttempt(attemptId: string): PaymentExecutionAttempt | undefined;
  getAttemptForPurchase(purchaseId: string): PaymentExecutionAttempt | undefined;
  getAuthorizationIdentity(attemptId: string): PaymentAuthorizationIdentity;
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

/**
 * Resolve the M3 ledger from an application-owned root, never from process.cwd().
 * The caller must derive applicationRoot from the installed module/script
 * location so a different launch directory cannot select a different authority.
 */
export function resolvePaymentExecutionLedgerPath(applicationRoot: string): string {
  if (!path.isAbsolute(applicationRoot)) {
    throw new Error("Payment execution ledger root must be an absolute application path");
  }
  return path.join(path.normalize(applicationRoot), ".m3-payment-execution-ledger.json");
}

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

function normalizeAuthorizationNonce(value: string): string {
  const normalized = value.toLowerCase();
  if (!/^0x[0-9a-f]{64}$/.test(normalized)) {
    throw new PaymentExecutionBindingError("EIP-3009 authorization nonce is not a bytes32 value");
  }
  return normalized;
}

function normalizeAuthorizationTime(value: string, field: string): string {
  if (!/^(0|[1-9][0-9]*)$/.test(value)) {
    throw new PaymentExecutionBindingError(`EIP-3009 ${field} is not an unsigned decimal integer`);
  }
  return BigInt(value).toString();
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

  recordAuthorization(attemptId: string, identity: PaymentAuthorizationIdentity, at = Date.now()): void {
    const normalized: PaymentAuthorizationIdentity = {
      authorizationKind: identity.authorizationKind,
      authorizationNonce: normalizeAuthorizationNonce(identity.authorizationNonce),
      authorizationValidAfter: normalizeAuthorizationTime(identity.authorizationValidAfter, "validAfter"),
      authorizationValidBefore: normalizeAuthorizationTime(identity.authorizationValidBefore, "validBefore"),
    };
    if (normalized.authorizationKind !== "eip3009") {
      throw new PaymentExecutionBindingError("Unsupported payment authorization kind");
    }
    this.update(attemptId, (attempt) => {
      if (
        attempt.authorizationNonce !== undefined
        && (
          attempt.authorizationKind !== normalized.authorizationKind
          || attempt.authorizationNonce !== normalized.authorizationNonce
          || attempt.authorizationValidAfter !== normalized.authorizationValidAfter
          || attempt.authorizationValidBefore !== normalized.authorizationValidBefore
        )
      ) {
        throw new PaymentExecutionBindingError("Execution attempt authorization identity cannot be replaced");
      }
      return {
        ...attempt,
        ...normalized,
        updatedAt: at,
      };
    });
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

  getAttemptForPurchase(purchaseId: string): PaymentExecutionAttempt | undefined {
    const attempt = readLedger(this.ledgerFile).attempts.find((candidate) => candidate.purchaseId === purchaseId);
    return attempt ? cloneAttempt(attempt) : undefined;
  }

  getAuthorizationIdentity(attemptId: string): PaymentAuthorizationIdentity {
    const attempt = this.getAttempt(attemptId);
    if (!attempt) throw new PaymentExecutionBindingError(`Unknown payment execution attempt ${attemptId}`);
    if (
      !attempt.authorizationKind
      || !attempt.authorizationNonce
      || !attempt.authorizationValidAfter
      || !attempt.authorizationValidBefore
    ) {
      throw new PaymentExecutionBindingError("Payment execution has no durable authorization identity");
    }
    return {
      authorizationKind: attempt.authorizationKind,
      authorizationNonce: normalizeAuthorizationNonce(attempt.authorizationNonce),
      authorizationValidAfter: normalizeAuthorizationTime(attempt.authorizationValidAfter, "validAfter"),
      authorizationValidBefore: normalizeAuthorizationTime(attempt.authorizationValidBefore, "validBefore"),
    };
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
