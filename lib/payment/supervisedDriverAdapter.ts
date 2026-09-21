/** Safe persisted-confirmation adapter for the LOCAL Node driver. */
import fs from "node:fs";
import path from "node:path";
import {
  buildQuoteFromChallenge,
  OfficialSignOnlyReplayExecutor,
  MERCHANT_REPLAY_TIMEOUT_MS,
  createLocalOnchainosPaymentRunner,
  paymentTermsEqual,
  type FounderPaymentConfirmation,
  type PreviewQuote,
} from "./onchainOsExecutor";
import { authorizeFreshExecutionQuote, confirmApprovedPurchaseTerms } from "./supervisedPurchase";
import type { PaymentExecutionAuthority } from "./executionAuthority";
import type { PaymentExecutor, PaymentSubmissionResult, PurchaseRecord, RailConfig } from "./types";
import { handoffApprovedPurchaseToM3, type M3BuyerRailDeps, type SeamResult } from "../management/m3BuyerRail";
import type { ExecutionIntent } from "../management/types";
import {
  buildM3MerchantRequestHeaders,
  M3_PRODUCT_ID,
  M3_PRODUCT_OFFERING_ID,
  M3_PRODUCT_SERVICE_ID,
  M3_SUPPORTED_PURPOSE_KIND,
} from "./m3FounderNarrativeProduct";

export type ConfirmationLedger = {
  get(purchaseId: string): FounderPaymentConfirmation | null;
  put(confirmation: FounderPaymentConfirmation): FounderPaymentConfirmation;
};

export function resolveFounderConfirmationLedgerPath(root: string): string {
  if (!path.isAbsolute(root)) throw new Error("confirmation ledger root must be absolute");
  return path.join(path.normalize(root), ".m3-founder-confirmations.json");
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

function merchantHeadersForIntent(intent: ExecutionIntent): Record<string, string> {
  // The loopback TESTNET merchant sells only founder_narrative_pulse. Purpose and
  // resource class still come from the authorized intent so out-of-scope BUYs fail closed.
  return buildM3MerchantRequestHeaders({
    resourceClass: intent.target.resourceClass,
    productId: M3_PRODUCT_ID,
    serviceId: M3_PRODUCT_SERVICE_ID,
    offeringId: intent.target.offeringId ?? M3_PRODUCT_OFFERING_ID,
    purpose: intent.purpose,
    purposeKind: intent.purpose ? M3_SUPPORTED_PURPOSE_KIND : null,
    requestId: intent.intentId,
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
    const rail: M3BuyerRailDeps = {
      mode: "m3_available_bounded", railConfig: config.railConfig, now,
      fetchLiveChallenge: async () => config.fetchChallenge(),
      buildApproval: ({ intent, liveTerms, approvalId }) => {
        if (!input.purchase.approval || !input.purchase.boundTerms || intent.intentId !== input.intent.intentId || approvalId !== input.purchase.approval.approvalId) return null;
        const candidate = { ...input.purchase.boundTerms, ...liveTerms };
        return paymentTermsEqual(candidate, input.purchase.boundTerms) ? input.purchase.approval : null;
      },
      executor: new FreshQuoteExecutor(
        input.purchase,
        confirmation,
        config.merchantEndpoint,
        config.fetchChallenge,
        config.executionAuthority,
        now,
        merchantHeadersForIntent(input.intent),
      ),
      settlementReader: config.settlementReaderForPurchase(input.purchase), paidRequestSender: config.paidRequestSender, verifyResult: config.verifyResult,
    };
    return handoffApprovedPurchaseToM3({ ...input, deps: rail });
  };
}
