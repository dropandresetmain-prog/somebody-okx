import { describe, it } from "node:test";
import assert from "node:assert/strict";

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
const inputFor = (q: ReturnType<typeof buildQuoteFromChallenge>) => ({
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
  approvalId: "approval-1",
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

function b64url(value: unknown): string {
  return Buffer.from(JSON.stringify(value)).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** Emulates the official CLI: embeds the supplied accepts entry as `accepted`. */
function fakeRunner(calls: string[][], mode: "ok" | "fail" | "hpke" | "no-amount" = "ok"): OnchainosPaymentRunner {
  return async (args) => {
    calls.push(args);
    if (mode === "fail") return { ok: false, stdout: "", stderr: `boom ${AUTH_SECRET_MARKER}`, exitCode: 1 };
    if (mode === "hpke") {
      return { ok: false, stderr: "", exitCode: 1, stdout: JSON.stringify({ ok: false, error: "HPKE decryption failed: Failed to open ciphertext", data: null }) };
    }
    const payload = JSON.parse(Buffer.from(args[args.indexOf("--payload") + 1], "base64").toString("utf8"));
    const accepted = { ...payload.accepts[0] };
    if (mode === "no-amount") delete accepted.amount;
    return {
      ok: true,
      stderr: "",
      exitCode: 0,
      stdout: JSON.stringify({
        ok: true,
        data: {
          authorization_header: b64url({ x402Version: 2, accepted, payload: { signature: AUTH_SECRET_MARKER } }),
          header_name: "PAYMENT-SIGNATURE",
          scheme: "exact",
          wallet: "0xwallet",
        },
      }),
    };
  };
}

function okResponse(): MerchantReplayResponse {
  return {
    status: 200,
    headers: { get: (n) => (n.toUpperCase() === "PAYMENT-RESPONSE" ? b64url({ success: true, transaction: TX, network: "eip155:1952" }) : null) },
    text: async () => JSON.stringify({ data: "protected-result" }),
  };
}

function setup(opts: {
  runner?: OnchainosPaymentRunner;
  fetchImpl?: MerchantReplayFetch;
  execution?: ReturnType<typeof buildQuoteFromChallenge>;
  challenge?: { x402Version: number; accepts: unknown[] };
  now?: number;
  url?: string;
}) {
  const preview = buildQuoteFromChallenge(opts.challenge ?? liveChallenge, "local-preview", 1);
  const confirmation = confirmPreviewPaymentTerms({ confirmationId: "conf", confirmedAt: 2, purchaseId: "p1", preview });
  const execution = opts.execution ?? buildQuoteFromChallenge(liveChallenge, "local-exec", 10);
  const calls: string[][] = [];
  const fetches: Array<{ url: string; init: Parameters<MerchantReplayFetch>[1] }> = [];
  const fetchImpl: MerchantReplayFetch = opts.fetchImpl ?? (async () => okResponse());
  const executor = new OfficialSignOnlyReplayExecutor(
    execution,
    confirmation,
    opts.url ?? MERCHANT_URL,
    opts.runner ?? fakeRunner(calls),
    () => opts.now ?? 15,
    async (url, init) => {
      fetches.push({ url, init });
      return fetchImpl(url, init);
    },
    1000,
  );
  return { executor, execution, calls, fetches };
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

  it("is single-use: a second execution never reaches the wallet or merchant", async () => {
    const calls: string[][] = [];
    const { executor, execution, fetches } = setup({ runner: fakeRunner(calls) });
    await executor.executeApprovedPayment(inputFor(execution));
    await assert.rejects(() => executor.executeApprovedPayment(inputFor(execution)), /single-use/);
    assert.equal(calls.length, 1);
    assert.equal(fetches.length, 1);
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
});
