/** Safe persisted-confirmation adapter for the LOCAL Node driver. */
import fs from "node:fs";
import path from "node:path";
import {
  buildQuoteFromChallenge,
  canonicalMerchantEndpoint,
  OfficialSignOnlyReplayExecutor,
  MERCHANT_REPLAY_TIMEOUT_MS,
  createLocalOnchainosPaymentRunner,
  paymentTermsEqual,
  type FounderPaymentConfirmation,
  type PreviewQuote,
} from "./onchainOsExecutor";
import { authorizeFreshExecutionQuote, confirmApprovedPurchaseTerms } from "./supervisedPurchase";
import { readSomebodyExecutionMode } from "../execution/executionMode";
import type { PaymentExecutionAuthority } from "./executionAuthority";
import type { PaymentExecutor, PaymentSubmissionResult, PurchaseRecord, RailConfig } from "./types";
import { handoffApprovedPurchaseToM3, type M3BuyerRailDeps, type SeamResult } from "../management/m3BuyerRail";
import type { ExecutionIntent } from "../management/types";
import {
  buildM3MerchantRequestHeaders,
  M3_PRODUCT_ID,
  M3_PRODUCT_SERVICE_ID,
  m3AuthorizedRequestFromIntent,
} from "./m3FounderNarrativeProduct";
import {
  SOCIAL_MEDIA_GURU_PRODUCT_ID,
  SOCIAL_MEDIA_GURU_SERVICE_ID,
  socialMediaGuruAuthorizedRequestFromIntent,
} from "./socialMediaGuruProduct";
import {
  M3_SELLER_DEFAULT_HOST,
  M3_SELLER_PATH,
  M3_SELLER_PORT,
  M3_SOCIAL_MEDIA_GURU_PATH,
} from "./m3Seller";

export type ConfirmationLedger = {
  get(purchaseId: string): FounderPaymentConfirmation | null;
  put(confirmation: FounderPaymentConfirmation): FounderPaymentConfirmation;
};

export function resolveFounderConfirmationLedgerPath(root: string): string {
  if (!path.isAbsolute(root)) throw new Error("confirmation ledger root must be absolute");
  return path.join(path.normalize(root), ".m3-founder-confirmations.json");
}

/** Resolve the controlled Testnet merchant URL for a composed service. */
export function controlledMerchantEndpointForService(
  serviceId: string,
  env: NodeJS.ProcessEnv = process.env,
): string {
  const override = env.M3_MERCHANT_URL?.trim();
  if (override) return override;
  const host = (env.M3_SELLER_HOST ?? M3_SELLER_DEFAULT_HOST).trim();
  const base = `http://${host}:${M3_SELLER_PORT}`;
  if (serviceId === SOCIAL_MEDIA_GURU_SERVICE_ID) {
    return `${base}${M3_SOCIAL_MEDIA_GURU_PATH}`;
  }
  return `${base}${M3_SELLER_PATH}`;
}

/** Confirmation fields are safe authority metadata, never a signature or wallet secret. */
export class FileFounderConfirmationLedger implements ConfirmationLedger {
  constructor(private readonly file: string) {}
  get(purchaseId: string): FounderPaymentConfirmation | null {
    if (!fs.existsSync(this.file)) return null;
    const ledger = JSON.parse(fs.readFileSync(this.file, "utf8")) as { version?: number; confirmations?: FounderPaymentConfirmation[] };
    if (ledger.version !== 1 || !Array.isArray(ledger.confirmations)) throw new Error("M3 founder confirmation ledger is malformed");
    return ledger.confirmations.find((item) => item.purchaseId === purchaseId) ?? null;
  }
  put(confirmation: FounderPaymentConfirmation): FounderPaymentConfirmation {
    const lock = `${this.file}.lock`;
    let descriptor: number;
    try {
      fs.mkdirSync(path.dirname(this.file), { recursive: true });
      descriptor = fs.openSync(lock, "wx");
    } catch {
      throw new Error(`M3 founder confirmation ledger is busy: ${this.file}`);
    }
    try {
    fs.mkdirSync(path.dirname(this.file), { recursive: true });
    const ledger = fs.existsSync(this.file)
      ? JSON.parse(fs.readFileSync(this.file, "utf8")) as { version?: number; confirmations?: FounderPaymentConfirmation[] }
      : { version: 1, confirmations: [] as FounderPaymentConfirmation[] };
    if (ledger.version !== 1 || !Array.isArray(ledger.confirmations)) throw new Error("M3 founder confirmation ledger is malformed");
    const index = ledger.confirmations.findIndex((item) => item.purchaseId === confirmation.purchaseId);
    if (index >= 0 && JSON.stringify(ledger.confirmations[index]) !== JSON.stringify(confirmation)) throw new Error("founder confirmation is immutable for a purchase");
    if (index < 0) ledger.confirmations.push(confirmation);
    const temp = `${this.file}.${process.pid}.${Date.now()}.tmp`;
    fs.writeFileSync(temp, JSON.stringify(ledger, null, 2), "utf8");
    fs.renameSync(temp, this.file);
    return structuredClone(confirmation);
    } finally {
      fs.closeSync(descriptor!);
      fs.unlinkSync(lock);
    }
  }
}

/** Called only after the founder has seen the safe preview terms. */
export function persistFounderConfirmation(input: {
  purchase: PurchaseRecord; preview?: PreviewQuote; previewBody?: unknown; confirmationId: string; merchantEndpoint: string; confirmedAt: number; confirmations: ConfirmationLedger;
}): FounderPaymentConfirmation {
  if ((input.preview === undefined) === (input.previewBody === undefined)) {
    throw new Error("provide exactly one safe PreviewQuote or preview challenge body");
  }
  const preview = input.preview ?? buildQuoteFromChallenge(input.previewBody, `preview_${input.purchase.id}_${input.confirmedAt}`, input.confirmedAt);
  return input.confirmations.put(confirmApprovedPurchaseTerms({ purchase: input.purchase, preview, confirmationId: input.confirmationId, merchantEndpoint: input.merchantEndpoint, confirmedAt: input.confirmedAt }));
}

/**
 * LOCAL `testnet_demo` ONLY. The founder's one explicit authorizing action for
 * this controlled purchase is the earlier Product Attention $0.01 approval —
 * the automated watcher path never shows the founder a second preview to
 * confirm. This function's authority basis is that approval PLUS independent
 * verification, right here, that the live preview is exactly the bounded
 * controlled Social Media Guru terms: same service, same controlled merchant
 * endpoint, and (via `confirmApprovedPurchaseTerms`) the same network/asset/
 * amount/payTo/resource already bound to the approval. Any mismatch throws
 * before a confirmation is ever persisted.
 *
 * Must NOT be called outside `SOMEBODY_EXECUTION_MODE=testnet_demo`, and must
 * never stand in for `persistFounderConfirmation`'s manual-preview-review
 * authority on the ordinary supervised path.
 */
export function persistLocalTestnetDemoExecutionConsent(input: {
  intent: ExecutionIntent;
  purchase: PurchaseRecord;
  preview: PreviewQuote;
  confirmationId: string;
  merchantEndpoint: string;
  confirmedAt: number;
  confirmations: ConfirmationLedger;
  env?: NodeJS.ProcessEnv;
}): FounderPaymentConfirmation {
  const env = input.env ?? process.env;
  if (readSomebodyExecutionMode(env) !== "testnet_demo") {
    throw new Error(
      "local Testnet-demo execution consent requires SOMEBODY_EXECUTION_MODE=testnet_demo",
    );
  }
  if (env.M4_M3_EXECUTION_ENABLED !== "true") {
    throw new Error("local Testnet-demo execution consent requires M4_M3_EXECUTION_ENABLED=true");
  }
  const serviceId = input.intent.target?.serviceId?.trim() ?? "";
  if (serviceId !== SOCIAL_MEDIA_GURU_SERVICE_ID) {
    throw new Error(
      `local Testnet-demo execution consent is bounded to ${SOCIAL_MEDIA_GURU_SERVICE_ID}; refusing for ${serviceId || "(no service)"}`,
    );
  }
  const expectedMerchantEndpoint = controlledMerchantEndpointForService(serviceId, env);
  if (
    canonicalMerchantEndpoint(input.merchantEndpoint) !==
    canonicalMerchantEndpoint(expectedMerchantEndpoint)
  ) {
    throw new Error(
      "local Testnet-demo execution consent merchant endpoint does not match the controlled Social Media Guru endpoint",
    );
  }
  return input.confirmations.put(
    confirmApprovedPurchaseTerms({
      purchase: input.purchase,
      preview: input.preview,
      confirmationId: input.confirmationId,
      merchantEndpoint: input.merchantEndpoint,
      confirmedAt: input.confirmedAt,
    }),
  );
}

/**
 * V7 review R2/R4 — the merchant request is the intent's AUTHORIZED normalized
 * request, the same derivation the result verifier binds against. Supports the
 * controlled Testnet products (founder_narrative_pulse and social_media_guru).
 * Missing/inconsistent authority refuses HERE — before any quote is fetched.
 */
export function merchantHeadersForIntent(intent: ExecutionIntent): Record<string, string> {
  const serviceId = intent.target?.serviceId?.trim() ?? "";
  if (serviceId === SOCIAL_MEDIA_GURU_SERVICE_ID) {
    const authorized = socialMediaGuruAuthorizedRequestFromIntent(intent);
    if (!authorized.ok) {
      throw new Error(`refusing to build a paid merchant request before signing: ${authorized.reason}`);
    }
    const request = authorized.request;
    return buildM3MerchantRequestHeaders({
      resourceClass: request.resourceClass,
      productId: SOCIAL_MEDIA_GURU_PRODUCT_ID,
      serviceId: request.serviceId,
      offeringId: request.offeringId,
      purpose: request.purpose,
      purposeKind: request.purposeKind,
      requestId: request.requestId,
    });
  }
  const authorized = m3AuthorizedRequestFromIntent(intent);
  if (!authorized.ok) {
    throw new Error(`refusing to build a paid merchant request before signing: ${authorized.reason}`);
  }
  const request = authorized.request;
  return buildM3MerchantRequestHeaders({
    resourceClass: request.resourceClass,
    productId: serviceId === M3_PRODUCT_SERVICE_ID ? M3_PRODUCT_ID : M3_PRODUCT_ID,
    serviceId: request.serviceId,
    offeringId: request.offeringId,
    purpose: request.purpose,
    purposeKind: request.purposeKind,
    requestId: request.requestId,
  });
}

class FreshQuoteExecutor implements PaymentExecutor {
  readonly kind = "official_onchainos" as const;
  constructor(
    private readonly purchase: PurchaseRecord,
    private readonly confirmation: FounderPaymentConfirmation,
    private readonly merchantEndpoint: string,
    private readonly fetchChallenge: () => Promise<unknown>,
    private readonly authority: PaymentExecutionAuthority,
    private readonly now: () => number,
    private readonly merchantRequestHeaders: Record<string, string>,
  ) {}
  async executeApprovedPayment(input: Parameters<PaymentExecutor["executeApprovedPayment"]>[0]): Promise<PaymentSubmissionResult> {
    if (!this.purchase.approval || input.purchaseId !== this.purchase.id || input.idempotencyKey !== this.purchase.idempotencyKey || input.approvalId !== this.purchase.approval.approvalId) throw new Error("execution input is not the confirmed durable M3 purchase");
    const body = await this.fetchChallenge();
    const execution = buildQuoteFromChallenge(body, `execution_${input.purchaseId}_${this.now()}`, this.now());
    authorizeFreshExecutionQuote({ purchase: this.purchase, confirmation: this.confirmation, execution, now: this.now() });
    return new OfficialSignOnlyReplayExecutor(
      execution,
      this.confirmation,
      this.merchantEndpoint,
      this.authority,
      createLocalOnchainosPaymentRunner(),
      this.now,
      (url, init) => fetch(url, init),
      MERCHANT_REPLAY_TIMEOUT_MS,
      this.merchantRequestHeaders,
    ).executeApprovedPayment(input);
  }
}

/** Creates a supervised submit port; construction is safe and never invokes onchainos. */
export function createSupervisedSubmit(config: {
  confirmations: ConfirmationLedger; merchantEndpoint: string; fetchChallenge: () => Promise<unknown>; executionAuthority: PaymentExecutionAuthority;
  settlementReaderForPurchase: (purchase: PurchaseRecord) => M3BuyerRailDeps["settlementReader"]; paidRequestSender: M3BuyerRailDeps["paidRequestSender"]; verifyResult: M3BuyerRailDeps["verifyResult"]; railConfig: RailConfig; now?: () => number;
}): (input: { intent: ExecutionIntent; purchase: PurchaseRecord; persistPaymentAttempt: (purchase: PurchaseRecord) => Promise<void> }) => Promise<SeamResult> {
  const now = config.now ?? Date.now;
  return async (input) => {
    const confirmation = config.confirmations.get(input.purchase.id);
    if (!confirmation || !input.purchase.approval || confirmation.purchaseId !== input.purchase.id || confirmation.approvalId !== input.purchase.approval.approvalId) throw new Error("missing or mismatched durable founder confirmation");
    const serviceId = input.intent.target?.serviceId?.trim() ?? "";
    // Prefer service-bound endpoint unless an explicit M3_MERCHANT_URL override
    // was supplied into composition (config.merchantEndpoint already reflects it).
    const merchantEndpoint = process.env.M3_MERCHANT_URL?.trim()
      ? config.merchantEndpoint
      : controlledMerchantEndpointForService(serviceId);
    const fetchChallenge =
      merchantEndpoint === config.merchantEndpoint
        ? config.fetchChallenge
        : async () => {
            const response = await fetch(merchantEndpoint, {
              redirect: "manual",
              signal: AbortSignal.timeout(20_000),
            });
            if (response.status !== 402) {
              throw new Error(`expected HTTP 402 challenge, got ${response.status}`);
            }
            const encoded = response.headers.get("PAYMENT-REQUIRED");
            const { decodePaymentRequiredHeader } = await import("./challenge");
            return encoded ? decodePaymentRequiredHeader(encoded) : response.json();
          };
    const rail: M3BuyerRailDeps = {
      mode: "m3_available_bounded", railConfig: config.railConfig, now,
      fetchLiveChallenge: async () => fetchChallenge(),
      buildApproval: ({ intent, liveTerms, approvalId }) => {
        if (!input.purchase.approval || !input.purchase.boundTerms || intent.intentId !== input.intent.intentId || approvalId !== input.purchase.approval.approvalId) return null;
        const candidate = { ...input.purchase.boundTerms, ...liveTerms };
        return paymentTermsEqual(candidate, input.purchase.boundTerms) ? input.purchase.approval : null;
      },
      executor: new FreshQuoteExecutor(
        input.purchase,
        confirmation,
        merchantEndpoint,
        fetchChallenge,
        config.executionAuthority,
        now,
        merchantHeadersForIntent(input.intent),
      ),
      settlementReader: config.settlementReaderForPurchase(input.purchase), paidRequestSender: config.paidRequestSender, verifyResult: config.verifyResult,
    };
    return handoffApprovedPurchaseToM3({ ...input, deps: rail });
  };
}
