/**
 * Official Onchain OS / Agentic Wallet payment adapter.
 *
 * Signing is delegated to the Agentic Wallet TEE through the sign-only mode
 * `onchainos payment pay --payload`. The application owns the single merchant
 * replay. It never accepts a private key, nor returns/persists the
 * authorization header. (`--payment-id` is NOT used: it re-embeds the merchant's
 * `maxAmountRequired`-only requirement and the facilitator rejects it.)
 *
 * Confirmation authorizes economic terms; a fresh ExecutionQuote (fresh
 * merchant challenge, normalized) is acquired only after confirmation and must
 * match the confirmed fingerprint and be <30s old at signing time.
 */

import { spawn } from "node:child_process";

import { parse402Challenge } from "./challenge";
import {
  normalizeX402V2PaymentRequirement,
  type X402V2Normalization,
} from "./x402V2Compat";
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
 * A live merchant challenge reduced to material terms plus the requirement to
 * sign. `paymentId` is a local reference only — never durable execution authority.
 */
export type OfficialQuotedPayment = {
  paymentId: string;
  selectedIndex: number;
  terms: NormalizedChallengeTerms;
  /** Local wall-clock when this application fetched the merchant challenge. */
  acquiredAt: number;
  /** Normalized exact `accepts[]` entry handed to the TEE signer (no secrets). */
  signingRequirement?: Record<string, unknown>;
  /** Audit record when the v2 compatibility edit was applied; null otherwise. */
  normalization?: X402V2Normalization | null;
};

/**
 * Turn a live 402 body into a quote: pick the exact entry, normalize the known
 * v2 defect (fail closed on ambiguity), and derive economic terms. The original
 * body stays with the caller; only the safe audit record is kept here.
 */
export function buildQuoteFromChallenge(
  body: unknown,
  paymentId: string,
  acquiredAt: number,
): OfficialQuotedPayment {
  const root = asRecord(body);
  if (!root || typeof root.x402Version !== "number" || !Array.isArray(root.accepts)) {
    throw new Error("Challenge must include x402Version and accepts[]");
  }
  const exact = root.accepts.find((entry) => asRecord(entry)?.scheme === "exact");
  if (!exact) throw new Error("No exact payment requirement in challenge");
  const { requirement, normalization } = normalizeX402V2PaymentRequirement(exact, root.x402Version);
  const terms = parse402Challenge({
    x402Version: root.x402Version,
    resource: root.resource,
    accepts: [requirement],
  })[0];
  if (!terms) throw new Error("Exact payment requirement is malformed");
  return {
    paymentId,
    selectedIndex: 0,
    terms,
    acquiredAt,
    signingRequirement: requirement,
    normalization,
  };
}

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

export type OfficialPreSubmissionFailureStage =
  | "quote_state"
  | "wallet_session_crypto"
  | "tee_sign";

/**
 * Source-proven failure before a payment proof can reach the merchant.
 *
 * This distinction matters for reconciliation: a known pre-submission failure
 * must not be mislabeled as submitted, while every unknown/non-clean CLI
 * failure remains ambiguous and therefore non-retryable until reconciled.
 */
export class OfficialPaymentPreSubmissionError extends Error {
  readonly definitelyNotSubmitted = true as const;

  constructor(
    public readonly paymentId: string,
    public readonly stage: OfficialPreSubmissionFailureStage,
    message: string,
    public readonly safeResponse?: SafeOfficialPaymentResponse,
  ) {
    super(message);
    this.name = "OfficialPaymentPreSubmissionError";
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

function sanitizeSafeErrorText(value: unknown): unknown {
  if (typeof value !== "string") return undefined;
  // Keep bounded diagnostic text while redacting obvious inline credential-like
  // values. Raw stderr is never persisted by this adapter.
  return value
    .slice(0, 1000)
    .replace(
      /\b(authorization|signature|session[_ -]?key|access[_ -]?token|refresh[_ -]?token|private[_ -]?key|secret|password)\b\s*[:=]\s*[^\s,;]+/gi,
      "$1=[redacted]",
    );
}

function safeResponseFrom(
  parsed: unknown,
  exitCode?: number | null,
): SafeOfficialPaymentResponse {
  const root = asRecord(parsed);
  const rawData = asRecord(root?.data);
  const data = rawData
    ? Object.fromEntries(
        SAFE_RESPONSE_FIELDS
          .filter((field) => Object.prototype.hasOwnProperty.call(rawData, field))
          .map((field) => [field, sanitizeSafeValue(rawData[field])]),
      )
    : null;

  const topLevelError = sanitizeSafeErrorText(root?.error);
  return {
    ok: typeof root?.ok === "boolean" ? root.ok : null,
    ...(topLevelError !== undefined ? { topLevelError } : {}),
    ...(exitCode !== undefined ? { exitCode } : {}),
    data,
  };
}

function safeResponseFromStdout(
  stdout: string,
  exitCode: number | null,
): SafeOfficialPaymentResponse | undefined {
  try {
    return safeResponseFrom(JSON.parse(stdout), exitCode);
  } catch {
    return undefined;
  }
}

function knownPreSubmissionStage(
  safeResponse: SafeOfficialPaymentResponse | undefined,
  stderr: string,
): OfficialPreSubmissionFailureStage | undefined {
  const topError =
    typeof safeResponse?.topLevelError === "string" ? safeResponse.topLevelError : "";
  // stderr may help classify a supported CLI error, but is never retained.
  const diagnostic = `${topError}\n${stderr}`.toLowerCase();

  if (diagnostic.includes("quote_expired_or_missing")) {
    return "quote_state";
  }
  if (
    diagnostic.includes("hpke decryption failed") ||
    diagnostic.includes("failed to open ciphertext")
  ) {
    return "wallet_session_crypto";
  }
  return undefined;
}

/** Minimal response surface the application-owned merchant replay depends on. */
export type MerchantReplayResponse = {
  status: number;
  headers: { get(name: string): string | null };
  text(): Promise<string>;
};

export type MerchantReplayFetch = (
  url: string,
  init: {
    method: "GET";
    headers: Record<string, string>;
    redirect: "manual";
    signal: AbortSignal;
  },
) => Promise<MerchantReplayResponse>;

export const MERCHANT_REPLAY_TIMEOUT_MS = 20_000;
/** M3 only replays a signed payment to the OKX Mock Merchant origin. */
export const M3_ALLOWED_MERCHANT_ORIGINS: readonly string[] = ["https://www.okx.com"];
/** Controlled M3 seller exception: loopback only, fixed port, Testnet only. */
export const M3_ALLOWED_LOOPBACK_MERCHANT_ORIGINS: readonly string[] = [
  "http://127.0.0.1:4021",
  "http://localhost:4021",
];
const SIGNED_HEADER_NAMES = new Set(["PAYMENT-SIGNATURE", "X-PAYMENT"]);

function base64Json(value: string): Record<string, unknown> | null {
  try {
    const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
    const padded = normalized + "=".repeat((4 - (normalized.length % 4)) % 4);
    return asRecord(JSON.parse(Buffer.from(padded, "base64").toString("utf8")));
  } catch {
    return null;
  }
}

/**
 * Transient, in-memory check that the signed header carries the confirmed
 * economic terms with a v2 `accepted.amount`. Nothing decoded here is retained.
 */
function signedHeaderMatchesTerms(header: string, terms: NormalizedChallengeTerms): boolean {
  const accepted = asRecord(base64Json(header)?.accepted);
  return (
    accepted !== null &&
    accepted.amount === terms.maxAmountRequired &&
    accepted.network === terms.network &&
    accepted.scheme === terms.scheme &&
    accepted.payTo === terms.payTo &&
    typeof accepted.asset === "string" &&
    accepted.asset.toLowerCase() === terms.asset.toLowerCase()
  );
}

function boundedText(text: string): string {
  return String(sanitizeSafeErrorText(text) ?? "");
}

function parseBody(text: string): unknown {
  try {
    return sanitizeSafeValue(JSON.parse(text));
  } catch {
    return boundedText(text);
  }
}

/**
 * Production executor for a JIT-quoted fixed-price M3 payment.
 *
 *   Agentic Wallet TEE  ->  `onchainos payment pay --payload` (sign only)
 *   Somebody            ->  exactly ONE replay to the frozen merchant URL
 *
 * The signed authorization lives only in local variables of one call. It is
 * never returned, stored, logged, or included in an error. The executor is
 * single-use: a second call throws before touching the wallet. `--payment-id`
 * is deliberately not used because it re-embeds the merchant's original
 * (`maxAmountRequired`-only) requirement as `accepted`.
 */
export class OfficialSignOnlyReplayExecutor implements PaymentExecutor {
  readonly kind = "official_onchainos" as const;
  private attempted = false;

  constructor(
    private readonly quoted: OfficialQuotedPayment,
    private readonly confirmation: FounderPaymentConfirmation,
    private readonly merchantUrl: string,
    private readonly run: OnchainosPaymentRunner = createLocalOnchainosPaymentRunner(),
    private readonly now: () => number = () => Date.now(),
    private readonly replayFetch: MerchantReplayFetch = (url, init) => fetch(url, init),
    private readonly replayTimeoutMs: number = MERCHANT_REPLAY_TIMEOUT_MS,
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

    const requirement = this.quoted.signingRequirement;
    if (!requirement) {
      throw new Error("Execution quote carries no signing requirement");
    }
    // The requirement handed to the signer must express exactly the confirmed
    // economics, with a v2 `amount`.
    const signedTerms = parse402Challenge({ x402Version: 2, accepts: [requirement] })[0];
    if (
      !signedTerms ||
      requirement.amount !== signedTerms.maxAmountRequired ||
      !paymentTermsEqual(signedTerms, this.confirmation.confirmedTerms)
    ) {
      throw new PaymentTermsMutationError(
        this.confirmation.confirmedTermsFingerprint,
        signedTerms ? paymentTermsFingerprint(signedTerms) : "unparseable",
        "Signing requirement does not match confirmed payment terms",
      );
    }
    this.assertMerchantUrlBoundToTerms();

    if (this.attempted) {
      throw new Error("This payment executor is single-use; a second signing attempt is refused");
    }
    this.attempted = true;

    const paymentId = this.quoted.paymentId;
    const payload = Buffer.from(
      JSON.stringify({
        x402Version: 2,
        resource: {
          url: this.quoted.terms.resource,
          ...(typeof requirement.mimeType === "string" ? { mimeType: requirement.mimeType } : {}),
        },
        accepts: [requirement],
      }),
      "utf8",
    ).toString("base64");

    // ── 1. Official TEE sign-only. Nothing has reached the merchant yet. ──
    const signed = await this.run(["payment", "pay", "--payload", payload, "--selected-index", "0", "--yes"]);
    let parsedStdout: unknown;
    try {
      parsedStdout = JSON.parse(signed.stdout);
    } catch {
      parsedStdout = undefined;
    }
    const data = asRecord(asRecord(parsedStdout)?.data);
    const authorization = data?.authorization_header;
    const headerName = data?.header_name;
    const signFailure = (message: string) => {
      const safe = safeResponseFromStdout(signed.stdout, signed.exitCode);
      return new OfficialPaymentPreSubmissionError(
        paymentId,
        knownPreSubmissionStage(safe, signed.stderr) ?? "tee_sign",
        message,
        safe,
      );
    };
    if (!signed.ok || asRecord(parsedStdout)?.ok !== true) {
      throw signFailure("Official TEE signing did not produce an authorization; nothing was sent to the merchant");
    }
    if (typeof authorization !== "string" || authorization.length === 0 || typeof headerName !== "string") {
      throw signFailure("Official TEE signing returned no usable authorization header");
    }
    if (!SIGNED_HEADER_NAMES.has(headerName.toUpperCase()) || /[\r\n]/.test(authorization)) {
      throw signFailure("Official TEE signing returned an unexpected header shape");
    }
    if (!signedHeaderMatchesTerms(authorization, this.quoted.terms)) {
      throw signFailure("Signed authorization does not carry the confirmed terms with accepted.amount");
    }

    // ── 2. Application-owned replay: exactly one request, no redirects. ──
    const ambiguous = (message: string, safe?: SafeOfficialPaymentResponse) =>
      new OfficialPaymentAmbiguousError(paymentId, message, safe);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.replayTimeoutMs);
    let response: MerchantReplayResponse;
    let bodyText: string;
    try {
      response = await this.replayFetch(this.merchantUrl, {
        method: "GET",
        headers: { [headerName]: authorization },
        redirect: "manual",
        signal: controller.signal,
      });
      bodyText = await response.text();
    } catch {
      throw ambiguous("Merchant replay response was lost or timed out; reconcile before any new payment");
    } finally {
      clearTimeout(timer);
    }

    const body = parseBody(bodyText);
    const receiptHeader =
      response.headers.get("PAYMENT-RESPONSE") ?? response.headers.get("X-PAYMENT-RESPONSE");
    const decodedReceipt = receiptHeader ? sanitizeSafeValue(base64Json(receiptHeader)) : null;
    const transactionHash = transactionHashFrom(decodedReceipt) ?? transactionHashFrom(body);
    const safeResponse: SafeOfficialPaymentResponse = {
      ok: response.status >= 200 && response.status < 300,
      exitCode: signed.exitCode,
      data: {
        status: response.status,
        ...(transactionHash ? { txHash: transactionHash } : {}),
        decodedReceipt,
        result: body,
      },
    };
    if (JSON.stringify(safeResponse).includes(authorization)) {
      throw ambiguous("Merchant response echoed authorization material; reconcile before any new payment");
    }
    if (response.status >= 300 && response.status < 400) {
      throw ambiguous("Merchant redirected a signed request; authorization was not forwarded", safeResponse);
    }
    if (response.status < 200 || response.status >= 300) {
      throw ambiguous(`Merchant returned HTTP ${response.status} to the signed request; reconcile before any new payment`, safeResponse);
    }
    if (asRecord(decodedReceipt)?.success === false) {
      throw ambiguous("Merchant receipt reports unsuccessful settlement; reconcile before any new payment", safeResponse);
    }
    if (!transactionHash) {
      throw ambiguous("Merchant response lacks a transaction identity; reconcile before any new payment", safeResponse);
    }
    return {
      submitted: true,
      transactionHash,
      paymentPayloadRef: paymentId,
      note: "Official TEE sign-only + application-owned single merchant replay; authorization discarded",
      safeResponse,
    };
  }

  /** The frozen merchant URL must be the resource the founder confirmed. */
  private assertMerchantUrlBoundToTerms(): void {
    const url = new URL(this.merchantUrl);
    const resource = this.quoted.terms.resource;
    const matches = /^https?:\/\//.test(resource)
      ? url.href === new URL(resource).href
      : url.pathname === resource;
    const hostedOriginAllowed =
      url.protocol === "https:" && M3_ALLOWED_MERCHANT_ORIGINS.includes(url.origin);
    const loopbackOriginAllowed =
      this.quoted.terms.network === "eip155:1952" &&
      url.protocol === "http:" &&
      M3_ALLOWED_LOOPBACK_MERCHANT_ORIGINS.includes(url.origin);
    if ((!hostedOriginAllowed && !loopbackOriginAllowed) || !matches) {
      throw new Error("Merchant URL is not the confirmed https resource or controlled Testnet loopback resource");
    }
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
