import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import {
  buildQuoteFromChallenge,
  confirmPreviewPaymentTerms,
  acceptExecutionQuoteForPayment,
  OfficialPaymentAmbiguousError,
  OfficialPaymentPreSubmissionError,
  OfficialSignOnlyReplayExecutor,
  paymentTermsFingerprint,
  PaymentTermsMutationError,
  StaleExecutionQuoteError,
  EXECUTION_QUOTE_MAX_AGE_MS,
  type MerchantReplayFetch,
  type MerchantReplayResponse,
  type OnchainosPaymentRunner,
} from "../lib/payment/onchainOsExecutor";
import { FilePaymentExecutionAuthority, type PaymentExecutionAuthority } from "../lib/payment/executionAuthority";
import { normalizeX402V2PaymentRequirement } from "../lib/payment/x402V2Compat";

const MERCHANT_URL = "https://www.okx.com/api/v1/pay/mock-merchant/resource";
const TX = "0x" + "ab".repeat(32);

const legacyEntry = {
  scheme: "exact",
  network: "eip155:1952",
  maxAmountRequired: "10000",
  asset: "0xcb8bf24c6ce16ad21d707c9505421a17f2bec79d",
  payTo: "0x3509655ad99effc7f3f74205482b1cb337ca08f7",
  resource: "/api/v1/pay/mock-merchant/resource",
  mimeType: "application/json",
  maxTimeoutSeconds: 60,
  extra: { name: "USDC_TEST", version: "1" },
};
const liveChallenge = { x402Version: 2, accepts: [legacyEntry, { ...legacyEntry, scheme: "aggr_deferred" }] };
const inputFor = (
  q: ReturnType<typeof buildQuoteFromChallenge>,
  overrides: Partial<{ purchaseId: string; idempotencyKey: string; approvalId: string }> = {},
) => ({
  purchaseId: overrides.purchaseId ?? "p1",
  idempotencyKey: overrides.idempotencyKey ?? "idem-p1",
  intentId: "intent-1",
  scheme: q.terms.scheme,
  network: q.terms.network,
  asset: q.terms.asset,
  amount: q.terms.maxAmountRequired,
  payTo: q.terms.payTo,
  resource: q.terms.resource,
  eip712Name: q.terms.eip712.name,
  eip712Version: q.terms.eip712.version,
  maxTimeoutSeconds: q.terms.maxTimeoutSeconds,
  approvalId: overrides.approvalId ?? "approval-1",
});

describe("x402 v2 requirement normalization", () => {
  it("creates amount from maxAmountRequired only (case 1)", () => {
    const { requirement, normalization } = normalizeX402V2PaymentRequirement(legacyEntry, 2);
    assert.equal(requirement.amount, "10000");
    assert.equal(requirement.maxAmountRequired, "10000");
    assert.deepEqual(normalization, {
      type: "x402_v2_max_amount_to_amount",
      originalField: "maxAmountRequired",
      normalizedField: "amount",
      valueChanged: false,
    });
    assert.equal((legacyEntry as Record<string, unknown>).amount, undefined, "input not mutated");
  });

  it("accepts matching fields untouched (case 2) and passes through v2-native (case 6)", () => {
    const both = normalizeX402V2PaymentRequirement({ ...legacyEntry, amount: "10000" }, 2);
    assert.equal(both.normalization, null);
    assert.equal(both.requirement.amount, "10000");
    const { maxAmountRequired: _drop, ...native } = legacyEntry;
    const passthrough = normalizeX402V2PaymentRequirement({ ...native, amount: "10000" }, 2);
    assert.equal(passthrough.normalization, null);
    assert.deepEqual(passthrough.requirement, { ...native, amount: "10000" });
  });

  it("fails closed on conflicting amounts (case 3)", () => {
    assert.throws(
      () => normalizeX402V2PaymentRequirement({ ...legacyEntry, amount: "20000" }, 2),
      /Conflicting/,
    );
  });

  it("rejects malformed / non-scalar / non-integer amounts (case 4)", () => {
    for (const bad of ["1e4", "-1", "10.5", "0x10", "", " 10", "010"]) {
      assert.throws(() => normalizeX402V2PaymentRequirement({ ...legacyEntry, maxAmountRequired: bad }, 2));
    }
    for (const bad of [10000, { v: "1" }, ["10000"], true]) {
      assert.throws(() => normalizeX402V2PaymentRequirement({ ...legacyEntry, maxAmountRequired: bad }, 2));
      assert.throws(() => normalizeX402V2PaymentRequirement({ ...legacyEntry, amount: bad }, 2));
    }
  });

  it("refuses unsupported version/scheme/network instead of reinterpreting (case 5)", () => {
    assert.throws(() => normalizeX402V2PaymentRequirement(legacyEntry, 1), /version/);
    assert.throws(() => normalizeX402V2PaymentRequirement({ ...legacyEntry, scheme: "aggr_deferred" }, 2), /scheme/);
    assert.throws(() => normalizeX402V2PaymentRequirement({ ...legacyEntry, network: "eip155:196" }, 2), /network/);
  });

  it("never alters any other field", () => {
    const { requirement } = normalizeX402V2PaymentRequirement(legacyEntry, 2);
    const { amount: _a, ...rest } = requirement;
    assert.deepEqual(rest, legacyEntry);
  });
});

describe("normalization and founder-approved economics", () => {
  const preview = buildQuoteFromChallenge(liveChallenge, "local-preview", 1);
  const confirmation = confirmPreviewPaymentTerms({
    confirmationId: "conf-1",
    confirmedAt: 2,
    purchaseId: "purchase-1",
    approvalId: "approval-1",
    merchantEndpoint: MERCHANT_URL,
    preview,
  });

  it("selects exact scheme and records normalization provenance", () => {
    assert.equal(preview.terms.scheme, "exact");
    assert.equal(preview.normalization?.valueChanged, false);
    assert.equal(preview.signingRequirement?.amount, "10000");
  });

  it("amount vs maxAmountRequired naming is not part of approved economics", () => {
    const { maxAmountRequired: _d, ...native } = legacyEntry;
    const v2native = buildQuoteFromChallenge(
      { x402Version: 2, accepts: [{ ...native, amount: "10000" }] },
      "local-exec",
      3,
    );
    assert.equal(paymentTermsFingerprint(v2native.terms), paymentTermsFingerprint(preview.terms));
    acceptExecutionQuoteForPayment({ confirmation, purchaseId: "purchase-1", execution: v2native, now: 5 });
  });

  it("real amount/network/asset/payee/resource mutations remain blocked", () => {
    const mutations: Array<Record<string, unknown>> = [
      { maxAmountRequired: "20000" },
      { asset: "0x0000000000000000000000000000000000000001" },
      { payTo: "0x0000000000000000000000000000000000000002" },
      { resource: "/other" },
    ];
    for (const m of mutations) {
      const exec = buildQuoteFromChallenge({ x402Version: 2, accepts: [{ ...legacyEntry, ...m }] }, "x", 3);
      assert.throws(
        () => acceptExecutionQuoteForPayment({ confirmation, purchaseId: "purchase-1", execution: exec, now: 5 }),
        PaymentTermsMutationError,
      );
    }
    assert.throws(() => buildQuoteFromChallenge({ x402Version: 2, accepts: [{ ...legacyEntry, network: "eip155:196" }] }, "x", 3));
  });
});

// ── sign-only executor ──────────────────────────────────────────────────────

const AUTH_SECRET_MARKER = "SECRET-SIG-MATERIAL";
const AUTHORIZATION_NONCE = `0x${"b".repeat(64)}`;

class FailingAuthorizationPersistenceAuthority extends FilePaymentExecutionAuthority {
  override recordAuthorization(): void {
    throw new Error("simulated authorization persistence failure");
  }
}

function b64url(value: unknown): string {
  return Buffer.from(JSON.stringify(value)).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** Emulates the official CLI: embeds the supplied accepts entry and EIP-3009 authorization. */
function fakeRunner(
  calls: string[][],
  mode: "ok" | "fail" | "hpke" | "no-amount" | "missing-authorization" | "malformed-nonce" = "ok",
): OnchainosPaymentRunner {
  return async (args) => {
    calls.push(args);
    if (mode === "fail") return { ok: false, stdout: "", stderr: `boom ${AUTH_SECRET_MARKER}`, exitCode: 1 };
    if (mode === "hpke") {
      return { ok: false, stderr: "", exitCode: 1, stdout: JSON.stringify({ ok: false, error: "HPKE decryption failed: Failed to open ciphertext", data: null }) };
    }
    const payload = JSON.parse(Buffer.from(args[args.indexOf("--payload") + 1], "base64").toString("utf8"));
    const accepted = { ...payload.accepts[0] };
    if (mode === "no-amount") delete accepted.amount;
    const authorization = {
      from: "0xd2dd2eb5028a1afaa09c9d350b3378f1ad4f1db4",
      to: accepted.payTo,
      value: accepted.amount,
      validAfter: "5",
      validBefore: "65",
      nonce: mode === "malformed-nonce" ? "0x1234" : AUTHORIZATION_NONCE,
    };
    return {
      ok: true,
      stderr: "",
      exitCode: 0,
      stdout: JSON.stringify({
        ok: true,
        data: {
          authorization_header: b64url({
            x402Version: 2,
            accepted,
            payload: {
              signature: AUTH_SECRET_MARKER,
              ...(mode === "missing-authorization" ? {} : { authorization }),
            },
          }),
          header_name: "PAYMENT-SIGNATURE",
          scheme: "exact",
          wallet: "0xwallet",
        },
      }),
    };
  };
}

function okResponse(transactionHash = TX): MerchantReplayResponse {
  return {
    status: 200,
    headers: { get: (n) => (n.toUpperCase() === "PAYMENT-RESPONSE" ? b64url({ success: true, transaction: transactionHash, network: "eip155:1952" }) : null) },
    text: async () => JSON.stringify({ data: "protected-result" }),
  };
}

function setup(opts: {
  runner?: OnchainosPaymentRunner;
  fetchImpl?: MerchantReplayFetch;
  execution?: ReturnType<typeof buildQuoteFromChallenge>;
  challenge?: { x402Version: number; resource?: unknown; accepts: unknown[] };
  now?: number;
  url?: string;
  approvedUrl?: string;
  authority?: PaymentExecutionAuthority;
  purchaseId?: string;
  idempotencyKey?: string;
  approvalId?: string;
  txHash?: string;
}) {
  const preview = buildQuoteFromChallenge(opts.challenge ?? liveChallenge, "local-preview", 1);
  const approvedUrl = opts.approvedUrl ?? opts.url ?? MERCHANT_URL;
  const confirmation = confirmPreviewPaymentTerms({
    confirmationId: "conf",
    confirmedAt: 2,
    purchaseId: opts.purchaseId ?? "p1",
    approvalId: opts.approvalId ?? "approval-1",
    merchantEndpoint: approvedUrl,
    preview,
  });
  const execution = opts.execution ?? buildQuoteFromChallenge(liveChallenge, "local-exec", 10);
  const calls: string[][] = [];
  const fetches: Array<{ url: string; init: Parameters<MerchantReplayFetch>[1] }> = [];
  const fetchImpl: MerchantReplayFetch = opts.fetchImpl ?? (async () => okResponse(opts.txHash ?? TX));
  const ledgerDirectory = fs.mkdtempSync(path.join(os.tmpdir(), "somebody-payment-test-"));
  const authority = opts.authority ?? new FilePaymentExecutionAuthority(path.join(ledgerDirectory, "ledger.json"));
  const executor = new OfficialSignOnlyReplayExecutor(
    execution,
    confirmation,
    opts.url ?? MERCHANT_URL,
    authority,
    opts.runner ?? fakeRunner(calls),
    () => opts.now ?? 15,
    async (url, init) => {
      fetches.push({ url, init });
      return fetchImpl(url, init);
    },
    1000,
  );
  return {
    executor,
    execution,
    calls,
    fetches,
    authority,
    confirmation,
    purchaseId: opts.purchaseId ?? "p1",
    idempotencyKey: opts.idempotencyKey ?? "idem-p1",
    approvalId: opts.approvalId ?? "approval-1",
  };
}

describe("official TEE sign-only + application-owned replay", () => {
  it("signs with --payload (never --payment-id) and replays exactly once", async () => {
    const calls: string[][] = [];
    const { executor, execution, fetches } = setup({ runner: fakeRunner(calls) });
    const result = await executor.executeApprovedPayment(inputFor(execution));

    assert.equal(calls.length, 1);
    assert.equal(calls[0][0], "payment");
    assert.equal(calls[0][1], "pay");
    assert.ok(calls[0].includes("--payload"));
    assert.ok(!calls[0].includes("--payment-id"));
    assert.ok(!calls[0].some((a) => a.includes("pay-local")));
    const sent = JSON.parse(Buffer.from(calls[0][calls[0].indexOf("--payload") + 1], "base64").toString("utf8"));
    assert.equal(sent.accepts.length, 1);
    assert.equal(sent.accepts[0].amount, "10000");
    assert.equal(sent.accepts[0].scheme, "exact");

    assert.equal(fetches.length, 1);
    assert.equal(fetches[0].url, MERCHANT_URL);
    assert.equal(fetches[0].init.method, "GET");
    assert.equal(fetches[0].init.redirect, "manual");
    assert.ok(fetches[0].init.headers["PAYMENT-SIGNATURE"]);

    assert.equal(result.submitted, true);
    assert.equal(result.transactionHash, TX);
    assert.equal(result.safeResponse?.data?.status, 200);
    assert.deepEqual(result.safeResponse?.data?.result, { data: "protected-result" });
  });

  it("never exposes authorization material in results", async () => {
    const { executor, execution, fetches } = setup({});
    const result = await executor.executeApprovedPayment(inputFor(execution));
    const header = fetches[0].init.headers["PAYMENT-SIGNATURE"];
    const serialized = JSON.stringify(result);
    assert.ok(!serialized.includes(header));
    assert.ok(!serialized.includes(AUTH_SECRET_MARKER));
    assert.ok(!serialized.includes("authorization_header"));
  });

  it("persists only the safe EIP-3009 identity and replays exactly once", async () => {
    const { executor, execution, authority } = setup({});
    const result = await executor.executeApprovedPayment(inputFor(execution));
    const identity = authority.getAuthorizationIdentity(result.executionAttemptId!);
    assert.deepEqual(identity, {
      authorizationKind: "eip3009",
      authorizationNonce: AUTHORIZATION_NONCE,
      authorizationValidAfter: "5",
      authorizationValidBefore: "65",
    });
    const serializedResult = JSON.stringify(result);
    const serializedAttempt = JSON.stringify(authority.getAttempt(result.executionAttemptId!));
    assert.equal((result as unknown as Record<string, unknown>).authorizationNonce, undefined);
    assert.ok(!serializedResult.includes(AUTH_SECRET_MARKER));
    assert.ok(!serializedAttempt.includes(AUTH_SECRET_MARKER));
    assert.ok(!serializedAttempt.includes("PAYMENT-SIGNATURE"));
  });

  it("refuses malformed or missing authorization identity before merchant replay", async () => {
    for (const mode of ["missing-authorization", "malformed-nonce"] as const) {
      const calls: string[][] = [];
      const { executor, execution, fetches } = setup({ runner: fakeRunner(calls, mode) });
      await assert.rejects(
        () => executor.executeApprovedPayment(inputFor(execution)),
        OfficialPaymentAmbiguousError,
      );
      assert.equal(calls.length, 1);
      assert.equal(fetches.length, 0);
    }
  });

  it("does not replay when safe authorization identity persistence fails", async () => {
    const calls: string[][] = [];
    const { executor, execution, fetches } = setup({
      authority: new FailingAuthorizationPersistenceAuthority(
        path.join(fs.mkdtempSync(path.join(os.tmpdir(), "somebody-payment-persist-failure-")), "ledger.json"),
      ),
      runner: fakeRunner(calls),
    });
    await assert.rejects(
      () => executor.executeApprovedPayment(inputFor(execution)),
      OfficialPaymentAmbiguousError,
    );
    assert.equal(calls.length, 1);
    assert.equal(fetches.length, 0);
  });

  it("redacts sensitive strings recursively while preserving safe diagnostics", async () => {
    const { executor, execution } = setup({
      fetchImpl: async () => ({
        status: 402,
        headers: { get: () => null },
        text: async () => JSON.stringify({
          result: [
            { innocent: "authorization=AUTH-MARKER", nested: ["signature=SIG-MARKER"] },
            { diagnostic: "normal diagnostic" },
          ],
          error: "access_token=TOKEN-MARKER; safe context",
        }),
      }),
    });
    let caught: unknown;
    await assert.rejects(
      () => executor.executeApprovedPayment(inputFor(execution)),
      (error) => { caught = error; return error instanceof OfficialPaymentAmbiguousError; },
    );
    const serialized = JSON.stringify(caught);
    assert.ok(!serialized.includes("AUTH-MARKER"));
    assert.ok(!serialized.includes("SIG-MARKER"));
    assert.ok(!serialized.includes("TOKEN-MARKER"));
    assert.ok(!serialized.includes("authorization"));
    assert.ok(!serialized.includes("PAYMENT-SIGNATURE"));
    assert.ok(serialized.includes("normal diagnostic"));
  });

  it("is single-use: a second execution never reaches the wallet or merchant", async () => {
    const calls: string[][] = [];
    const { executor, execution, fetches } = setup({ runner: fakeRunner(calls) });
    await executor.executeApprovedPayment(inputFor(execution));
    await assert.rejects(() => executor.executeApprovedPayment(inputFor(execution)), /already has durable payment execution authority/);
    assert.equal(calls.length, 1);
    assert.equal(fetches.length, 1);
  });

  it("checks purchase identity again at the final signing boundary", async () => {
    const calls: string[][] = [];
    const { executor, execution } = setup({ runner: fakeRunner(calls) });
    await assert.rejects(
      () => executor.executeApprovedPayment(inputFor(execution, { purchaseId: "p2" })),
      /confirmation does not authorize this purchase identity/,
    );
    assert.equal(calls.length, 0);
  });

  it("checks approval identity again at the final signing boundary", async () => {
    const calls: string[][] = [];
    const { executor, execution } = setup({ runner: fakeRunner(calls) });
    await assert.rejects(
      () => executor.executeApprovedPayment(inputFor(execution, { approvalId: "approval-other" })),
      /confirmation does not authorize this approval identity/,
    );
    assert.equal(calls.length, 0);
  });

  it("refuses a reconstructed executor through the durable application ledger", async () => {
    const ledgerDirectory = fs.mkdtempSync(path.join(os.tmpdir(), "somebody-payment-restart-"));
    const ledgerFile = path.join(ledgerDirectory, "ledger.json");
    const first = setup({ authority: new FilePaymentExecutionAuthority(ledgerFile) });
    await first.executor.executeApprovedPayment(inputFor(first.execution));

    const secondCalls: string[][] = [];
    const second = setup({ authority: new FilePaymentExecutionAuthority(ledgerFile), runner: fakeRunner(secondCalls) });
    await assert.rejects(
      () => second.executor.executeApprovedPayment(inputFor(second.execution)),
      /already has durable payment execution authority/,
    );
    assert.equal(secondCalls.length, 0);
    assert.equal(second.fetches.length, 0);
  });

  it("durably records a source-proven pre-sign failure and does not silently retry it", async () => {
    const ledgerDirectory = fs.mkdtempSync(path.join(os.tmpdir(), "somebody-payment-pre-sign-"));
    const ledgerFile = path.join(ledgerDirectory, "ledger.json");
    const first = setup({
      authority: new FilePaymentExecutionAuthority(ledgerFile),
      runner: fakeRunner([], "fail"),
    });
    await assert.rejects(
      () => first.executor.executeApprovedPayment(inputFor(first.execution)),
      OfficialPaymentPreSubmissionError,
    );
    const secondCalls: string[][] = [];
    const second = setup({
      authority: new FilePaymentExecutionAuthority(ledgerFile),
      runner: fakeRunner(secondCalls),
    });
    await assert.rejects(
      () => second.executor.executeApprovedPayment(inputFor(second.execution)),
      /already has durable payment execution authority/,
    );
    assert.equal(secondCalls.length, 0);
  });

  it("allows two separately approved purchases with identical economics", async () => {
    const ledgerDirectory = fs.mkdtempSync(path.join(os.tmpdir(), "somebody-payment-race-"));
    const authority = new FilePaymentExecutionAuthority(path.join(ledgerDirectory, "ledger.json"));
    const a = setup({ authority, purchaseId: "purchase-a", idempotencyKey: "idem-a", approvalId: "approval-a", txHash: TX });
    const b = setup({ authority, purchaseId: "purchase-b", idempotencyKey: "idem-b", approvalId: "approval-b", txHash: "0x" + "cd".repeat(32) });
    await a.executor.executeApprovedPayment(inputFor(a.execution, {
      purchaseId: "purchase-a", idempotencyKey: "idem-a", approvalId: "approval-a",
    }));
    await b.executor.executeApprovedPayment(inputFor(b.execution, {
      purchaseId: "purchase-b", idempotencyKey: "idem-b", approvalId: "approval-b",
    }));
    assert.equal(a.calls.length, 1);
    assert.equal(b.calls.length, 1);
  });

  it("allows only one concurrent contender to claim one purchase", async () => {
    const ledgerDirectory = fs.mkdtempSync(path.join(os.tmpdir(), "somebody-payment-race-"));
    const authority = new FilePaymentExecutionAuthority(path.join(ledgerDirectory, "ledger.json"));
    const callsA: string[][] = [];
    const callsB: string[][] = [];
    const a = setup({ authority, runner: fakeRunner(callsA) });
    const b = setup({ authority, runner: fakeRunner(callsB) });
    const results = await Promise.allSettled([
      a.executor.executeApprovedPayment(inputFor(a.execution)),
      b.executor.executeApprovedPayment(inputFor(b.execution)),
    ]);
    assert.equal(results.filter((result) => result.status === "fulfilled").length, 1);
    assert.equal(results.filter((result) => result.status === "rejected").length, 1);
    assert.equal(callsA.length + callsB.length, 1);
  });

  it("lost response after signing: ambiguous, no retry, no secret in error", async () => {
    const calls: string[][] = [];
    const { executor, execution, fetches } = setup({
      runner: fakeRunner(calls),
      fetchImpl: async () => { throw new Error("socket hang up"); },
    });
    let caught: unknown;
    await assert.rejects(() => executor.executeApprovedPayment(inputFor(execution)), (e) => { caught = e; return e instanceof OfficialPaymentAmbiguousError; });
    assert.equal(fetches.length, 1);
    assert.equal(calls.length, 1);
    assert.ok(!JSON.stringify(caught, Object.getOwnPropertyNames(caught as object)).includes(AUTH_SECRET_MARKER));
    assert.ok(!(caught as Error).message.includes(fetches[0].init.headers["PAYMENT-SIGNATURE"]));
  });

  it("replay timeout is enforced and ambiguous", async () => {
    const { executor, execution, fetches } = setup({
      fetchImpl: (_u, init) => new Promise((_res, rej) => init.signal.addEventListener("abort", () => rej(new Error("aborted")))),
    });
    await assert.rejects(() => executor.executeApprovedPayment(inputFor(execution)), OfficialPaymentAmbiguousError);
    assert.equal(fetches.length, 1);
  });

  it("redirect: authorization is never forwarded; ambiguous after exactly one request", async () => {
    const { executor, execution, fetches } = setup({
      fetchImpl: async () => ({ status: 302, headers: { get: (n) => (n.toLowerCase() === "location" ? "https://evil.example/x" : null) }, text: async () => "" }),
    });
    await assert.rejects(() => executor.executeApprovedPayment(inputFor(execution)), /redirected/);
    assert.equal(fetches.length, 1);
    assert.equal(fetches[0].init.redirect, "manual");
  });

  it("merchant 402 after signing is ambiguous with safe evidence, not retried", async () => {
    const { executor, execution, fetches } = setup({
      fetchImpl: async () => ({ status: 402, headers: { get: () => null }, text: async () => JSON.stringify({ error: "Payment Required" }) }),
    });
    let caught: unknown;
    await assert.rejects(() => executor.executeApprovedPayment(inputFor(execution)), (e) => { caught = e; return e instanceof OfficialPaymentAmbiguousError; });
    assert.equal((caught as OfficialPaymentAmbiguousError).safeResponse?.data?.status, 402);
    assert.equal(fetches.length, 1);
  });

  it("2xx without a transaction identity is ambiguous, not verified", async () => {
    const { executor, execution } = setup({
      fetchImpl: async () => ({ status: 200, headers: { get: () => null }, text: async () => "{}" }),
    });
    await assert.rejects(() => executor.executeApprovedPayment(inputFor(execution)), /transaction identity/);
  });

  it("a merchant that echoes the authorization is not persisted", async () => {
    const { executor, execution } = setup({
      runner: fakeRunner([]),
      fetchImpl: async (_u, init) => ({ status: 200, headers: { get: () => null }, text: async () => JSON.stringify({ echo: init.headers["PAYMENT-SIGNATURE"] }) }),
    });
    let caught: unknown;
    await assert.rejects(() => executor.executeApprovedPayment(inputFor(execution)), (e) => { caught = e; return e instanceof OfficialPaymentAmbiguousError; });
    assert.equal((caught as OfficialPaymentAmbiguousError).safeResponse, undefined);
  });

  it("signing failures are definitely pre-submission and never reach the merchant", async () => {
    for (const mode of ["fail", "hpke", "no-amount"] as const) {
      const calls: string[][] = [];
      const { executor, execution, fetches } = setup({ runner: fakeRunner(calls, mode) });
      let caught: unknown;
      await assert.rejects(() => executor.executeApprovedPayment(inputFor(execution)), (e) => { caught = e; return e instanceof OfficialPaymentPreSubmissionError; });
      assert.equal(fetches.length, 0);
      assert.ok(!(caught as Error).message.includes(AUTH_SECRET_MARKER));
      assert.ok(!JSON.stringify(caught).includes(AUTH_SECRET_MARKER));
      if (mode === "hpke") assert.equal((caught as OfficialPaymentPreSubmissionError).stage, "wallet_session_crypto");
      if (mode === "no-amount") assert.match((caught as Error).message, /accepted\.amount/);
    }
  });

  it("refuses mutated terms, stale quotes, wrong merchant URL, mainnet before any signing", async () => {
    const mutated = buildQuoteFromChallenge(
      { x402Version: 2, accepts: [{ ...legacyEntry, maxAmountRequired: "20000" }] }, "m", 10);
    const a = setup({ execution: mutated });
    await assert.rejects(() => a.executor.executeApprovedPayment(inputFor(mutated)), /no longer match|mutation|Approved terms/);

    const b = setup({ now: 10 + EXECUTION_QUOTE_MAX_AGE_MS + 1 });
    await assert.rejects(() => b.executor.executeApprovedPayment(inputFor(b.execution)), StaleExecutionQuoteError);

    const c = setup({ url: "https://evil.example/api/v1/pay/mock-merchant/resource" });
    await assert.rejects(() => c.executor.executeApprovedPayment(inputFor(c.execution)), /Merchant URL/);
    const d = setup({ url: "http://www.okx.com/api/v1/pay/mock-merchant/resource" });
    await assert.rejects(() => d.executor.executeApprovedPayment(inputFor(d.execution)), /Merchant URL/);

    for (const s of [a, b, c, d]) {
      assert.equal(s.calls.length, 0);
      assert.equal(s.fetches.length, 0);
    }
  });

  it("allows only the fixed Testnet loopback seller origin and frozen path", async () => {
    const controlledChallenge = {
      x402Version: 2,
      accepts: [{
        ...legacyEntry,
        asset: "0x9e29b3aada05bf2d2c827af80bd28dc0b9b4fb0c",
        payTo: "0x1111111111111111111111111111111111111111",
        resource: "/m3/paid-ping",
        extra: { name: "USD₮0", version: "1" },
        amount: "10000",
      }],
    };
    const execution = buildQuoteFromChallenge(controlledChallenge, "local-exec", 10);
    const local = setup({
      challenge: controlledChallenge,
      execution,
      url: "http://127.0.0.1:4021/m3/paid-ping",
    });
    const result = await local.executor.executeApprovedPayment(inputFor(execution));
    assert.equal(result.submitted, true);
    assert.equal(local.fetches.length, 1);

    const publicPort = setup({
      challenge: controlledChallenge,
      execution,
      url: "http://127.0.0.1:4022/m3/paid-ping",
    });
    await assert.rejects(
      () => publicPort.executor.executeApprovedPayment(inputFor(execution)),
      /Merchant URL/,
    );
    assert.equal(publicPort.calls.length, 0);
  });

  it("freezes the exact approved endpoint, including host, port, protocol, path, and query", async () => {
    const controlledChallenge = {
      x402Version: 2,
      accepts: [{
        ...legacyEntry,
        asset: "0x9e29b3aada05bf2d2c827af80bd28dc0b9b4fb0c",
        payTo: "0x1111111111111111111111111111111111111111",
        resource: "/m3/paid-ping",
        extra: { name: "USD₮0", version: "1" },
        amount: "10000",
      }],
    };
    const execution = buildQuoteFromChallenge(controlledChallenge, "local-exec", 10);
    const approved = "http://127.0.0.1:4021/m3/paid-ping";
    for (const mutated of [
      "http://localhost:4021/m3/paid-ping",
      "http://127.0.0.1:4022/m3/paid-ping",
      "https://127.0.0.1:4021/m3/paid-ping",
      "http://127.0.0.1:4021/other",
      "http://127.0.0.1:4021/m3/paid-ping?changed=1",
    ]) {
      const candidate = setup({
        challenge: controlledChallenge,
        execution,
        approvedUrl: approved,
        url: mutated,
      });
      await assert.rejects(
        () => candidate.executor.executeApprovedPayment(inputFor(execution)),
        /merchant endpoint|Merchant URL/,
      );
      assert.equal(candidate.calls.length, 0);
      assert.equal(candidate.fetches.length, 0);
    }

    const fragmentOnly = setup({
      approvedUrl: MERCHANT_URL + "#founder-fragment",
      url: MERCHANT_URL + "#runtime-fragment",
    });
    await fragmentOnly.executor.executeApprovedPayment(inputFor(fragmentOnly.execution));
    assert.equal(fragmentOnly.fetches[0].url, MERCHANT_URL);
  });
  it("signs a native v2 challenge whose resource is top-level only", async () => {
    const { resource: _omit, ...entryWithoutResource } = legacyEntry as Record<string, unknown>;
    const nativeChallenge = {
      x402Version: 2,
      resource: { url: "/m3/paid-ping" },
      accepts: [{
        ...entryWithoutResource,
        asset: "0x9e29b3aada05bf2d2c827af80bd28dc0b9b4fb0c",
        payTo: "0x1111111111111111111111111111111111111111",
        extra: { name: "USD₮0", version: "1" },
        amount: "10000",
      }],
    };
    const execution = buildQuoteFromChallenge(nativeChallenge, "local-exec", 10);
    const local = setup({ challenge: nativeChallenge, execution, url: "http://127.0.0.1:4021/m3/paid-ping" });
    const result = await local.executor.executeApprovedPayment(inputFor(execution));
    assert.equal(result.submitted, true);
    assert.equal(local.fetches.length, 1);
  });
});
