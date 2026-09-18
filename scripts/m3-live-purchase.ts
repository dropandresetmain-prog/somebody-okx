/**
 * M3 live Testnet purchase driver (real application path, no manual steps).
 *
 *   npx tsx scripts/m3-live-purchase.ts preview  <state.json>
 *   npx tsx scripts/m3-live-purchase.ts execute  <state.json> <evidence.json>
 *
 * `preview` fetches the live 402, prints the economic terms, and saves the
 * (non-secret) preview to <state.json>. Run `execute` ONLY after the founder
 * approves those terms. `execute` performs at most ONE signed payment.
 * No signature / authorization header is ever printed or written.
 */
import fs from "node:fs";

import { transition } from "../lib/payment/lifecycle";
import { decodePaymentRequiredHeader } from "../lib/payment/challenge";
import { executeApprovedPayment } from "../lib/payment/buyerRail";
import { createPurchase, recordPurchaseReceipt, recordPurchaseResult, updatePurchaseState, verifyPurchase } from "../lib/payment/purchase";
import {
  authorizeFreshExecutionQuote,
  confirmApprovedPurchaseTerms,
  prepareApprovedPurchase,
} from "../lib/payment/supervisedPurchase";
import {
  buildQuoteFromChallenge,
  describeFounderApproval,
  OfficialPaymentAmbiguousError,
  OfficialPaymentPreSubmissionError,
  OfficialSignOnlyReplayExecutor,
} from "../lib/payment/onchainOsExecutor";
import {
  createXLayerJsonRpcTransport,
  readAndVerifyXLayerSettlement,
  XLAYER_TESTNET_NETWORK,
} from "../lib/payment/xlayerSettlement";
import type { PaymentContext, PaymentState } from "../lib/payment/types";

const MERCHANT_URL = process.env.M3_MERCHANT_URL ?? "http://127.0.0.1:4021/m3/paid-ping";
const PAYER = process.env.M3_BUYER_ADDRESS ?? "0xd2dd2eb5028a1afaa09c9d350b3378f1ad4f1db4";
const CONFIG = { allowedNetworks: [XLAYER_TESTNET_NETWORK], maxSpend: "10000" } as const;

async function fetchChallenge(): Promise<unknown> {
  const res = await fetch(MERCHANT_URL, { redirect: "manual", signal: AbortSignal.timeout(20_000) });
  if (res.status !== 402) throw new Error(`Expected HTTP 402 challenge, got ${res.status}`);
  const encoded = res.headers.get("PAYMENT-REQUIRED");
  if (encoded) return decodePaymentRequiredHeader(encoded);
  return res.json();
}

function humanAmount(atomic: string, decimals = 6): string {
  const s = atomic.padStart(decimals + 1, "0");
  return `${s.slice(0, -decimals)}.${s.slice(-decimals)}`;
}

function preparedFor(body: unknown, purchaseId: string, at: number) {
  const purchase = createPurchase({
    id: purchaseId,
    objectiveKey: "objective-m3-live",
    resourceNeedId: "need-mock-merchant",
    offeringId: "okx-mock-merchant",
    idempotencyKey: `idem-${purchaseId}`,
    at,
  });
  const preview = buildQuoteFromChallenge(body, "local-preview", at);
  const approval = {
    approver: "founder",
    approvalId: `approval-${purchaseId}`,
    approvedMaxAmount: preview.terms.maxAmountRequired,
    approvedNetwork: preview.terms.network,
    approvedAsset: preview.terms.asset,
    approvedPayTo: preview.terms.payTo,
    approvedAt: at,
  };
  return {
    preview,
    approval,
    ready: prepareApprovedPurchase({
      purchase,
      approval,
      challengeBody: body,
      config: CONFIG,
      intentId: `intent-${purchaseId}`,
      at,
    }),
  };
}

async function preview(stateFile: string) {
  const body = await fetchChallenge();
  const at = Date.now();
  const purchaseId = `purchase-m3-${at}`;
  const { ready, preview: quote } = preparedFor(body, purchaseId, at);
  fs.writeFileSync(stateFile, JSON.stringify({ purchaseId, previewAt: at, challengeBody: body }, null, 2));
  console.log(describeFounderApproval(ready.prepared.intent, purchaseId));
  console.log(`human amount: ${humanAmount(quote.terms.maxAmountRequired)} ${quote.terms.eip712.name}`);
  console.log(`payer: ${PAYER}`);
  console.log(`normalization (safe compat, no economic change): ${JSON.stringify(quote.normalization)}`);
}

async function execute(stateFile: string, evidenceFile: string) {
  const state = JSON.parse(fs.readFileSync(stateFile, "utf8")) as { purchaseId: string; previewAt: number; challengeBody: unknown };
  const evidence: Record<string, unknown> = { purchaseId: state.purchaseId, startedAt: new Date().toISOString(), states: [] };
  const save = () => fs.writeFileSync(evidenceFile, JSON.stringify(evidence, null, 2));

  let ps: PaymentState = "prepared";
  let ctx: PaymentContext = {};
  const step = (event: Parameters<typeof transition>[1]) => {
    const r = transition(ps, event, ctx);
    if (!r.success) throw r.error;
    ps = r.state;
    ctx = r.context;
    (evidence.states as string[]).push(ps);
  };

  // Founder approval already obtained in chat for the previewed terms.
  const { ready, preview: previewQuote, approval } = preparedFor(state.challengeBody, state.purchaseId, state.previewAt);
  step({ type: "request_approval", requestedBy: "somebody", reason: "M3 live purchase" });
  step({ type: "grant_approval", grantedBy: "founder", approvalId: approval.approvalId });
  let purchase = ready.purchase;
  const confirmation = confirmApprovedPurchaseTerms({
    purchase,
    preview: previewQuote,
    confirmationId: `founder-conf-${state.purchaseId}`,
    confirmedAt: Date.now(),
  });

  // JIT: fresh merchant challenge, normalized, compared, freshness-gated.
  const freshBody = await fetchChallenge();
  const execution = buildQuoteFromChallenge(freshBody, "local-exec", Date.now());
  evidence.normalizationApplied = execution.normalization;
  evidence.executionTerms = execution.terms;
  authorizeFreshExecutionQuote({ purchase, confirmation, execution, now: Date.now() });
  evidence.confirmedFingerprintEqual = true;

  const executor = new OfficialSignOnlyReplayExecutor(execution, confirmation, MERCHANT_URL);
  step({ type: "attempt_payment", paymentId: execution.paymentId });
  purchase = updatePurchaseState(purchase, "payment_attempted", Date.now());
  save();

  let submission;
  try {
    submission = await executeApprovedPayment(ready.prepared, executor);
  } catch (error) {
    if (error instanceof OfficialPaymentPreSubmissionError) {
      evidence.outcome = { boundary: "pre_submission", stage: error.stage, message: error.message, safeResponse: error.safeResponse ?? null };
    } else if (error instanceof OfficialPaymentAmbiguousError) {
      // Persist evidence BEFORE any state transition so a lifecycle error can never lose it.
      evidence.outcome = { boundary: "ambiguous_after_signing", message: error.message, safeResponse: error.safeResponse ?? null };
      save();
      step({ type: "report_uncertainty", uncertaintyReason: error.message });
      step({ type: "require_reconciliation", reason: error.message });
    } else {
      evidence.outcome = { boundary: "unexpected", message: (error as Error).message };
    }
    evidence.finalState = ps;
    save();
    console.log(JSON.stringify(evidence, null, 2));
    process.exitCode = 1;
    return;
  }

  step({ type: "submit_payment", transactionHash: submission.transactionHash! });
  const txHash = submission.transactionHash!;
  evidence.submission = {
    transactionHash: txHash,
    merchantHttpStatus: submission.safeResponse?.data?.status,
    decodedReceipt: submission.safeResponse?.data?.decodedReceipt,
  };
  evidence.protectedResult = submission.safeResponse?.data?.result;
  save();

  // Independent readback (does not trust the merchant's prose).
  const rpc = createXLayerJsonRpcTransport();
  let verification: Awaited<ReturnType<typeof readAndVerifyXLayerSettlement>> | undefined;
  for (let i = 0; i < 12; i++) {
    verification = await readAndVerifyXLayerSettlement(rpc, {
      network: execution.terms.network,
      transactionHash: txHash,
      asset: execution.terms.asset,
      amount: execution.terms.maxAmountRequired,
      payTo: execution.terms.payTo,
      payer: PAYER,
    }).catch((e) => ({ state: "pending" as const, transactionHash: txHash, note: (e as Error).message }));
    if (verification.state !== "pending") break;
    await new Promise((r) => setTimeout(r, 5000));
  }
  evidence.settlement = verification;

  if (verification?.state === "settled") {
    step({ type: "confirm_settlement", settlementProof: `${txHash}@${verification.blockNumber}` });
    purchase = recordPurchaseReceipt(purchase, txHash, Date.now());
    const result = submission.safeResponse?.data?.result;
    if (result !== undefined && result !== null && result !== "") {
      step({ type: "receive_result", resultData: result });
      purchase = recordPurchaseResult(purchase, result, Date.now());
      step({ type: "verify_result", verificationProof: `x-layer-readback:${txHash}` });
      purchase = verifyPurchase(purchase, Date.now());
    }
  } else {
    step({ type: "report_uncertainty", uncertaintyReason: `settlement readback state ${verification?.state}` });
    step({ type: "require_reconciliation", reason: `settlement readback state ${verification?.state}` });
  }
  evidence.finalState = ps;
  evidence.verified = purchase.verified;
  evidence.finishedAt = new Date().toISOString();
  save();
  console.log(JSON.stringify(evidence, null, 2));
}

const [cmd, a, b] = process.argv.slice(2);
(cmd === "preview" ? preview(a) : cmd === "execute" ? execute(a, b) : Promise.reject(new Error("usage: preview|execute")))
  .catch((e) => {
    console.error(`FATAL: ${(e as Error).message}`);
    process.exitCode = 1;
  });
