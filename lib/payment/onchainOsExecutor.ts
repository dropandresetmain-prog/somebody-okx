/**
 * Official Onchain OS / Agentic Wallet payment adapter.
 *
 * The adapter deliberately delegates construction, TEE signing, settlement,
 * and merchant replay to `onchainos payment pay --payment-id`. It never accepts
 * a private key, nor returns an authorization header for application storage.
 *
 * Quote lifetime (official onchainos): local quotes expire at
 * min(challengeExpires, quoteCreatedAt + 300s). Therefore a preview quote
 * cannot survive open-ended human confirmation. Confirmation authorizes
 * economic terms; a fresh ExecutionQuote is acquired only after confirmation.
 */

import { spawn } from "node:child_process";

import type {
  BoundPaymentIntent,
  NormalizedChallengeTerms,
  PaymentExecutor,
  PaymentSubmissionResult,
  SafeOfficialPaymentResponse,
} from "./types";

export type OnchainosPaymentRunner = (args: string[]) => Promise<{
  ok: boolean;
  stdout: string;
  stderr: string;
  exitCode: number | null;
}>;

/**
 * Local CLI quote handle + material terms. `paymentId` is a transport-local
 * identifier owned by the CLI — never durable execution authority.
 */
export type OfficialQuotedPayment = {
  paymentId: string;
  selectedIndex: number;
  terms: NormalizedChallengeTerms;
  /** Local wall-clock when this application acquired the quote from the CLI. */
  acquiredAt: number;
};

/** Shown to the founder for economic-term approval. Not durable for signing. */
export type PreviewQuote = OfficialQuotedPayment;

/** Obtained after confirmation solely to execute already-confirmed terms. */
export type ExecutionQuote = OfficialQuotedPayment;

/**
 * Conservative execution window after JIT ExecutionQuote acquisition.
 * Confirmation already happened; this only bounds compare→pay latency.
 * Well below the official 300s quote ceiling and the typical 60s challenge
 * timeout so a founder cannot linger on a live signing handle.
 */
export const EXECUTION_QUOTE_MAX_AGE_MS = 30_000;

/**
 * Founder confirmation authorizes these exact transaction terms for one
 * PurchaseRecord — not a local CLI `paymentId` handle forever.
 */
export type FounderPaymentConfirmation = {
  confirmationId: string;
  confirmedAt: number;
  purchaseId: string;
  confirmedTermsFingerprint: string;
  confirmedTerms: NormalizedChallengeTerms;
};

/**
 * A command may have reached the merchant before its response was lost. The
 * caller must transition to reconciliation, never make another payment.
 */
export class OfficialPaymentAmbiguousError extends Error {
  constructor(
    public readonly paymentId: string,
    message: string,
    public readonly safeResponse?: SafeOfficialPaymentResponse,
  ) {
    super(message);
    this.name = "OfficialPaymentAmbiguousError";
  }
}

/** Material economic terms changed between confirmation and execution. */
export class PaymentTermsMutationError extends Error {
  constructor(
    public readonly confirmedFingerprint: string,
    public readonly executionFingerprint: string,
    message = "Execution quote terms no longer match confirmed payment terms",
  ) {
    super(message);
    this.name = "PaymentTermsMutationError";
  }
}

/** ExecutionQuote aged past the conservative local window before signing. */
export class StaleExecutionQuoteError extends Error {
  constructor(
    public readonly paymentId: string,
    public readonly ageMs: number,
    public readonly maxAgeMs: number,
    message = "Execution quote is stale; discard and re-quote before signing",
  ) {
    super(message);
    this.name = "StaleExecutionQuoteError";
  }
}

/** Confirmation for one purchase cannot authorize another. */
export class ConfirmationPurchaseMismatchError extends Error {
  constructor(
    public readonly confirmationPurchaseId: string,
    public readonly attemptedPurchaseId: string,
    message = "Founder confirmation does not authorize this purchase identity",
  ) {
    super(message);
    this.name = "ConfirmationPurchaseMismatchError";
  }
}

/**
 * Pure deterministic fingerprint over material payment terms only.
 * Excludes local paymentId, acquisition timestamps, and transport handles.
 */
export function paymentTermsFingerprint(terms: NormalizedChallengeTerms): string {
  return [
    terms.network,
    terms.asset,
    terms.maxAmountRequired,
    terms.payTo,
    terms.resource,
    terms.scheme,
    String(terms.maxTimeoutSeconds),
    terms.eip712.name,
    terms.eip712.version,
  ].join("\0");
}

export function paymentTermsEqual(
  a: NormalizedChallengeTerms,
  b: NormalizedChallengeTerms,
): boolean {
  return paymentTermsFingerprint(a) === paymentTermsFingerprint(b);
}

/** Record founder confirmation against preview economic terms (not paymentId). */
export function confirmPreviewPaymentTerms(input: {
  confirmationId: string;
  confirmedAt: number;
  purchaseId: string;
  preview: PreviewQuote;
}): FounderPaymentConfirmation {
  if (!input.confirmationId) {
    throw new Error("Founder confirmation id is required");
  }
  if (!input.purchaseId) {
    throw new Error("Confirmation must be bound to a purchase identity");
  }
  return {
    confirmationId: input.confirmationId,
    confirmedAt: input.confirmedAt,
    purchaseId: input.purchaseId,
    confirmedTermsFingerprint: paymentTermsFingerprint(input.preview.terms),
    confirmedTerms: input.preview.terms,
  };
}

export function assertConfirmationForPurchase(
  confirmation: FounderPaymentConfirmation,
  purchaseId: string,
): void {
  if (confirmation.purchaseId !== purchaseId) {
    throw new ConfirmationPurchaseMismatchError(confirmation.purchaseId, purchaseId);
  }
}

export function assertConfirmedTermsMatchExecution(
  confirmation: FounderPaymentConfirmation,
  execution: ExecutionQuote,
): void {
  const executionFingerprint = paymentTermsFingerprint(execution.terms);
  if (executionFingerprint !== confirmation.confirmedTermsFingerprint) {
    throw new PaymentTermsMutationError(
      confirmation.confirmedTermsFingerprint,
      executionFingerprint,
    );
  }
}

export function assertFreshExecutionQuote(
  execution: ExecutionQuote,
  now: number,
  maxAgeMs: number = EXECUTION_QUOTE_MAX_AGE_MS,
): void {
  if (now < execution.acquiredAt) {
    throw new StaleExecutionQuoteError(
      execution.paymentId,
      now - execution.acquiredAt,
      maxAgeMs,
      "Execution quote acquisition time is in the future",
    );
  }
  const ageMs = now - execution.acquiredAt;
  if (ageMs > maxAgeMs) {
    throw new StaleExecutionQuoteError(execution.paymentId, ageMs, maxAgeMs);
  }
}

/**
 * JIT gate: after founder confirmation, a fresh ExecutionQuote may proceed
 * only when material terms still match and the local acquisition is fresh.
 * Differing local paymentIds are acceptable when terms match.
 */
export function acceptExecutionQuoteForPayment(input: {
  confirmation: FounderPaymentConfirmation;
  purchaseId: string;
  execution: ExecutionQuote;
  now: number;
  maxAgeMs?: number;
}): OfficialQuotedPayment {
  assertConfirmationForPurchase(input.confirmation, input.purchaseId);
  assertConfirmedTermsMatchExecution(input.confirmation, input.execution);
  assertFreshExecutionQuote(input.execution, input.now, input.maxAgeMs);
  return input.execution;
}

export function createLocalOnchainosPaymentRunner(
  binary = process.platform === "win32" ? "onchainos.exe" : "onchainos",
): OnchainosPaymentRunner {
  return (args) =>
    new Promise((resolve) => {
      const child = spawn(binary, args, { windowsHide: true, env: process.env });
      let stdout = "";
      let stderr = "";
      child.stdout?.on("data", (chunk: Buffer | string) => {
        stdout += String(chunk);
      });
      child.stderr?.on("data", (chunk: Buffer | string) => {
        stderr += String(chunk);
      });
      child.on("error", (error) => {
        resolve({ ok: false, stdout, stderr: `${stderr}\n${error.message}`.trim(), exitCode: null });
      });
      child.on("close", (exitCode) => {
        resolve({ ok: exitCode === 0, stdout, stderr, exitCode });
      });
    });
}

function requireSameTerms(
  actual: NormalizedChallengeTerms,
  quoted: NormalizedChallengeTerms,
): void {
  if (!paymentTermsEqual(actual, quoted)) {
    throw new Error("Approved terms no longer match quoted payment terms");
  }
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null ? value as Record<string, unknown> : null;
}

function transactionHashFrom(value: unknown): string | undefined {
  const record = asRecord(value);
  if (!record) return undefined;
  for (const field of ["txHash", "transactionHash", "transaction"]) {
    const candidate = record[field];
    if (typeof candidate === "string" && candidate.startsWith("0x")) return candidate;
  }
  return transactionHashFrom(record.receipt) ?? transactionHashFrom(record.payment);
}

const SAFE_RESPONSE_FIELDS = ["status", "txHash", "decodedReceipt", "result", "error"] as const;
const SENSITIVE_KEY = /authorization|signature|session|private|secret|password|token/i;

function sanitizeSafeValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(sanitizeSafeValue);
  }
  const record = asRecord(value);
  if (!record) return value;

  const sanitized: Record<string, unknown> = {};
  for (const [key, nested] of Object.entries(record)) {
    if (SENSITIVE_KEY.test(key)) continue;
    sanitized[key] = sanitizeSafeValue(nested);
  }
  return sanitized;
}

function safeResponseFrom(parsed: unknown): SafeOfficialPaymentResponse {
  const root = asRecord(parsed);
  const rawData = asRecord(root?.data);
  const data = rawData
    ? Object.fromEntries(
        SAFE_RESPONSE_FIELDS
          .filter((field) => Object.prototype.hasOwnProperty.call(rawData, field))
          .map((field) => [field, sanitizeSafeValue(rawData[field])]),
      )
    : null;

  return {
    ok: typeof root?.ok === "boolean" ? root.ok : null,
    data,
  };
}

/** Parse safe receipt/merchant metadata; intentionally discard authorization material. */
export function parseOfficialPaymentSubmission(
  stdout: string,
  paymentId: string,
): PaymentSubmissionResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(stdout);
  } catch {
    throw new OfficialPaymentAmbiguousError(paymentId, "Official payment response was not valid JSON; reconcile before retrying");
  }
  const safeResponse = safeResponseFrom(parsed);
  const root = asRecord(parsed);
  const data = asRecord(root?.data);
  if (root?.ok !== true || !data) {
    throw new OfficialPaymentAmbiguousError(
      paymentId,
      "Official payment did not return a confirmed receipt; reconcile before retrying",
      safeResponse,
    );
  }
  const transactionHash = transactionHashFrom(data);
  if (!transactionHash) {
    throw new OfficialPaymentAmbiguousError(
      paymentId,
      "Official payment response lacks a safe transaction identity; reconcile before retrying",
      safeResponse,
    );
  }
  return {
    submitted: true,
    transactionHash,
    paymentPayloadRef: paymentId,
    note: "Official Onchain OS TEE payment; authorization material intentionally discarded",
    safeResponse,
  };
}

/**
 * Production executor for a JIT-quoted fixed-price M3 payment. `--yes` is
 * reached only after founder confirmation of economic terms and a fresh
 * ExecutionQuote that still matches that fingerprint.
 */
export class OfficialOnchainosPaymentExecutor implements PaymentExecutor {
  readonly kind = "official_onchainos" as const;

  constructor(
    private readonly quoted: OfficialQuotedPayment,
    private readonly confirmation: FounderPaymentConfirmation,
    private readonly run: OnchainosPaymentRunner = createLocalOnchainosPaymentRunner(),
    private readonly now: () => number = () => Date.now(),
  ) {}

  async executeApprovedPayment(input: {
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
    if (!this.confirmation.confirmationId) {
      throw new Error("Founder confirmation is required before official payment signing");
    }
    const intentTerms: NormalizedChallengeTerms = {
      ...this.quoted.terms,
      scheme: input.scheme,
      network: input.network,
      asset: input.asset,
      maxAmountRequired: input.amount,
      payTo: input.payTo,
      resource: input.resource,
      eip712: { name: input.eip712Name, version: input.eip712Version },
      maxTimeoutSeconds: input.maxTimeoutSeconds,
    };
    requireSameTerms(intentTerms, this.quoted.terms);
    if (!paymentTermsEqual(intentTerms, this.confirmation.confirmedTerms)) {
      throw new PaymentTermsMutationError(
        this.confirmation.confirmedTermsFingerprint,
        paymentTermsFingerprint(intentTerms),
      );
    }
    assertFreshExecutionQuote(this.quoted, this.now());
    if (this.quoted.terms.scheme !== "exact" || this.quoted.terms.network !== "eip155:1952") {
      throw new Error("M3 official executor only permits exact payments on X Layer Testnet");
    }
    const result = await this.run([
      "payment", "pay",
      "--payment-id", this.quoted.paymentId,
      "--selected-index", String(this.quoted.selectedIndex),
      "--yes",
    ]);
    if (!result.ok) {
      throw new OfficialPaymentAmbiguousError(
        this.quoted.paymentId,
        "Official payment command did not complete cleanly; reconcile before retrying",
      );
    }
    return parseOfficialPaymentSubmission(result.stdout, this.quoted.paymentId);
  }
}

/** Formats the exact human-confirmation surface without exposing any secret. */
export function describeFounderApproval(
  intent: BoundPaymentIntent,
  purchaseId: string,
): string {
  return [
    "TESTNET: X Layer Testnet (eip155:1952)",
    "Confirmation authorizes these exact transaction terms for this purchase only.",
    "It does not authorize a durable local payment handle.",
    `asset: ${intent.terms.asset} (${intent.terms.eip712.name})`,
    `amount: ${intent.terms.maxAmountRequired} atomic units`,
    `recipient: ${intent.terms.payTo}`,
    `service: ${intent.terms.resource}`,
    `network: ${intent.terms.network}`,
    `scheme: ${intent.terms.scheme}`,
    `purchase id: ${purchaseId}`,
  ].join("\n");
}
