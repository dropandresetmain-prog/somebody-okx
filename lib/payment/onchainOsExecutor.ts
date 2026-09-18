/**
 * Official Onchain OS / Agentic Wallet payment adapter.
 *
 * The adapter deliberately delegates construction, TEE signing, settlement,
 * and merchant replay to `onchainos payment pay --payment-id`. It never accepts
 * a private key, nor returns an authorization header for application storage.
 */

import { spawn } from "node:child_process";

import type {
  BoundPaymentIntent,
  NormalizedChallengeTerms,
  PaymentExecutor,
  PaymentSubmissionResult,
} from "./types";

export type OnchainosPaymentRunner = (args: string[]) => Promise<{
  ok: boolean;
  stdout: string;
  stderr: string;
  exitCode: number | null;
}>;

export type OfficialQuotedPayment = {
  paymentId: string;
  selectedIndex: number;
  terms: NormalizedChallengeTerms;
};

export type FounderPaymentConfirmation = {
  confirmationId: string;
  confirmedAt: number;
};

/**
 * A command may have reached the merchant before its response was lost. The
 * caller must transition to reconciliation, never make another payment.
 */
export class OfficialPaymentAmbiguousError extends Error {
  constructor(
    public readonly paymentId: string,
    message: string,
  ) {
    super(message);
    this.name = "OfficialPaymentAmbiguousError";
  }
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
  const fields: Array<keyof Pick<NormalizedChallengeTerms,
    "scheme" | "network" | "asset" | "maxAmountRequired" | "payTo" | "resource" | "maxTimeoutSeconds"
  >> = [
    "scheme", "network", "asset", "maxAmountRequired", "payTo", "resource", "maxTimeoutSeconds",
  ];
  for (const field of fields) {
    if (actual[field] !== quoted[field]) {
      throw new Error(`Approved terms no longer match quoted ${field}`);
    }
  }
  if (
    actual.eip712.name !== quoted.eip712.name ||
    actual.eip712.version !== quoted.eip712.version
  ) {
    throw new Error("Approved terms no longer match quoted EIP-712 domain");
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

/** Parse only safe receipt metadata; intentionally discard authorization headers/signatures. */
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
  const root = asRecord(parsed);
  const data = asRecord(root?.data);
  if (root?.ok !== true || !data) {
    throw new OfficialPaymentAmbiguousError(paymentId, "Official payment did not return a confirmed receipt; reconcile before retrying");
  }
  const transactionHash = transactionHashFrom(data);
  if (!transactionHash) {
    throw new OfficialPaymentAmbiguousError(paymentId, "Official payment response lacks a safe transaction identity; reconcile before retrying");
  }
  return {
    submitted: true,
    transactionHash,
    paymentPayloadRef: paymentId,
    note: "Official Onchain OS TEE payment; authorization material intentionally discarded",
  };
}

/**
 * Production executor for a pre-quoted fixed-price M3 payment. `--yes` is
 * reached only after a separate founder confirmation is recorded by the caller.
 */
export class OfficialOnchainosPaymentExecutor implements PaymentExecutor {
  readonly kind = "official_onchainos" as const;

  constructor(
    private readonly quoted: OfficialQuotedPayment,
    private readonly confirmation: FounderPaymentConfirmation,
    private readonly run: OnchainosPaymentRunner = createLocalOnchainosPaymentRunner(),
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
    `asset: ${intent.terms.asset} (${intent.terms.eip712.name})`,
    `amount: ${intent.terms.maxAmountRequired} atomic units`,
    `recipient: ${intent.terms.payTo}`,
    `service: ${intent.terms.resource}`,
    `purchase id: ${purchaseId}`,
  ].join("\n");
}
