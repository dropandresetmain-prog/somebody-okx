import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { localDemoDriverCandidate } from "../convex/m3Driver";
import {
  LOCAL_DEMO_FOUNDER_PAYMENT_CONFIRMATION_ID,
  localDemoM3DriverEnabled,
} from "../lib/payment/localDemoM3DriverAdvance";
import {
  FileFounderConfirmationLedger,
  persistFounderConfirmation,
  persistLocalTestnetDemoExecutionConsent,
} from "../lib/payment/supervisedDriverAdapter";
import { buildQuoteFromChallenge } from "../lib/payment/onchainOsExecutor";
import { createPurchase } from "../lib/payment/purchase";
import { prepareApprovedPurchase } from "../lib/payment/supervisedPurchase";
import type { ExecutionIntent } from "../lib/management/types";
import { SOCIAL_MEDIA_GURU_SERVICE_ID } from "../lib/payment/socialMediaGuruProduct";

const token = "local-demo-driver-token";
const at = 1962000000000;

type Handler = { _handler: (ctx: unknown, args: Record<string, unknown>) => Promise<unknown> };

test("localDemoM3DriverEnabled requires testnet_demo and M4_M3_EXECUTION_ENABLED", () => {
  assert.equal(
    localDemoM3DriverEnabled({
      SOMEBODY_EXECUTION_MODE: "testnet_demo",
      M4_M3_EXECUTION_ENABLED: "true",
      CONVEX_URL: "http://127.0.0.1:3210",
      M4_M3_DRIVER_TOKEN: "t",
    } as unknown as NodeJS.ProcessEnv),
    true,
  );
  assert.equal(
    localDemoM3DriverEnabled({
      SOMEBODY_EXECUTION_MODE: "disabled",
      M4_M3_EXECUTION_ENABLED: "true",
      CONVEX_URL: "http://127.0.0.1:3210",
      M4_M3_DRIVER_TOKEN: "t",
    } as unknown as NodeJS.ProcessEnv),
    false,
  );
});

test("LOCAL_DEMO_FOUNDER_PAYMENT_CONFIRMATION_ID is stable for product attention wiring", () => {
  assert.equal(LOCAL_DEMO_FOUNDER_PAYMENT_CONFIRMATION_ID, "founder-product-attention-approve");
});

test("localDemoDriverCandidate returns null when execution mode is not testnet_demo", async () => {
  const previousMode = process.env.SOMEBODY_EXECUTION_MODE;
  const previousToken = process.env.M4_M3_DRIVER_TOKEN;
  process.env.SOMEBODY_EXECUTION_MODE = "disabled";
  process.env.M4_M3_DRIVER_TOKEN = token;
  try {
    const result = await (localDemoDriverCandidate as unknown as Handler)._handler({}, { driverToken: token });
    assert.equal(result, null);
  } finally {
    if (previousMode === undefined) delete process.env.SOMEBODY_EXECUTION_MODE;
    else process.env.SOMEBODY_EXECUTION_MODE = previousMode;
    if (previousToken === undefined) delete process.env.M4_M3_DRIVER_TOKEN;
    else process.env.M4_M3_DRIVER_TOKEN = previousToken;
  }
});

test("localDemoDriverCandidate picks authorized testnet BUY with live founder grant", async () => {
  const previousMode = process.env.SOMEBODY_EXECUTION_MODE;
  const previousToken = process.env.M4_M3_DRIVER_TOKEN;
  process.env.SOMEBODY_EXECUTION_MODE = "testnet_demo";
  process.env.M4_M3_DRIVER_TOKEN = token;

  const intent: ExecutionIntent = {
    intentId: "int_demo",
    idempotencyKey: "idem_demo",
    objectiveKey: "obj_demo",
    requirementKey: "comparative_benchmark",
    contractRevision: 1,
    decisionId: "dec_demo",
    kind: "external_acquisition",
    strategy: "BUY",
    target: {
      offeringId: "offer",
      providerId: "somebody_testnet_social",
      serviceId: SOCIAL_MEDIA_GURU_SERVICE_ID,
      resourceClass: "proprietary_data",
      endpointRef: null,
    },
    terms: {
      priceUsd: 0.01,
      priceProvenance: "provider_quote",
      requiresApproval: false,
      approvalId: "approval_demo",
    },
    state: "authorized",
    attempts: 0,
    lastEventId: null,
    resultEvidenceId: null,
    verificationEvidenceId: null,
    boundaryNote: "test",
    createdAt: at,
    updatedAt: at,
    needDedupeKey: "need",
    resourceNeedId: "need_id",
  };

  const ctx = {
    db: {
      query(table: string) {
        const one = (value: unknown) => ({
          withIndex: () => ({
            unique: async () => value,
            eq: () => ({ unique: async () => value }),
            collect: async () => (value == null ? [] : Array.isArray(value) ? value : [value]),
          }),
          collect: async () => (table === "executionIntents" ? [{ data: intent }] : []),
        });
        if (table === "executionIntents") return one(null);
        if (table === "objectives") {
          return {
            withIndex: () => ({
              unique: async () => ({ data: { state: "executing" } }),
            }),
          };
        }
        if (table === "founderSpendGrants") {
          return {
            withIndex: () => ({
              unique: async () => ({
                data: {
                  approvalId: "approval_demo",
                  objectiveKey: "obj_demo",
                  limitUsd: 1,
                  grantedAt: at,
                  revokedAt: null,
                  note: "test",
                },
              }),
            }),
          };
        }
        throw new Error(`unexpected ${table}`);
      },
    },
  };

  try {
    const result = await (localDemoDriverCandidate as unknown as Handler)._handler(ctx, {
      driverToken: token,
    });
    assert.deepEqual(result, {
      intentId: "int_demo",
      objectiveKey: "obj_demo",
      intentState: "authorized",
      phase: "awaiting_submission",
      updatedAt: at,
    });
  } finally {
    if (previousMode === undefined) delete process.env.SOMEBODY_EXECUTION_MODE;
    else process.env.SOMEBODY_EXECUTION_MODE = previousMode;
    if (previousToken === undefined) delete process.env.M4_M3_DRIVER_TOKEN;
    else process.env.M4_M3_DRIVER_TOKEN = previousToken;
  }
});

// ─── persistLocalTestnetDemoExecutionConsent ──────────────────────────────

const socialIntent: ExecutionIntent = {
  intentId: "int_consent",
  idempotencyKey: "idem_consent",
  objectiveKey: "obj_consent",
  requirementKey: "req_consent",
  contractRevision: 1,
  decisionId: "dec_consent",
  kind: "external_acquisition",
  strategy: "BUY",
  target: {
    offeringId: "offer_smg",
    providerId: "somebody_testnet_social",
    serviceId: SOCIAL_MEDIA_GURU_SERVICE_ID,
    resourceClass: "proprietary_data",
    endpointRef: null,
  },
  terms: { priceUsd: 0.01, priceProvenance: "provider_quote", requiresApproval: false, approvalId: "approval_consent" },
  state: "authorized",
  attempts: 0,
  lastEventId: null,
  resultEvidenceId: null,
  verificationEvidenceId: null,
  boundaryNote: "test",
  createdAt: at,
  updatedAt: at,
};

const controlledMerchantEndpoint = "http://127.0.0.1:4021/m3/social-media-guru";
const enabledEnv = {
  SOMEBODY_EXECUTION_MODE: "testnet_demo",
  M4_M3_EXECUTION_ENABLED: "true",
} as unknown as NodeJS.ProcessEnv;

function challengeFor(
  overrides: Partial<{ network: string; asset: string; amount: string; payTo: string; resource: string }> = {},
) {
  const resource = overrides.resource ?? "/m3/social-media-guru";
  return {
    x402Version: 2,
    resource: { url: resource },
    accepts: [
      {
        scheme: "exact",
        network: overrides.network ?? "eip155:1952",
        asset: overrides.asset ?? "0xasset",
        amount: overrides.amount ?? "10000",
        payTo: overrides.payTo ?? "0xrecipient",
        resource,
        maxTimeoutSeconds: 60,
        extra: { name: "USDT0", version: "1" },
      },
    ],
  };
}

function approvedSocialPurchase() {
  const purchase = createPurchase({
    id: socialIntent.intentId,
    objectiveKey: socialIntent.objectiveKey,
    resourceNeedId: socialIntent.requirementKey,
    offeringId: socialIntent.target.offeringId!,
    idempotencyKey: socialIntent.idempotencyKey,
    at,
  });
  const approval = {
    approver: "founder",
    approvalId: socialIntent.terms.approvalId!,
    approvedMaxAmount: "10000",
    approvedNetwork: "eip155:1952",
    approvedAsset: "0xasset",
    approvedPayTo: "0xrecipient",
    approvedAt: at,
  };
  return prepareApprovedPurchase({
    purchase,
    approval,
    challengeBody: challengeFor(),
    config: { allowedNetworks: ["eip155:1952"], maxSpend: "10000" },
    intentId: socialIntent.intentId,
    at,
  }).purchase;
}

function withTempConfirmations<T>(run: (confirmations: FileFounderConfirmationLedger) => T): T {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "local-testnet-consent-"));
  try {
    return run(new FileFounderConfirmationLedger(path.join(root, "confirmations.json")));
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}

test("persistLocalTestnetDemoExecutionConsent: disabled/Mainnet mode refuses (Mainnet remains impossible)", () => {
  const purchase = approvedSocialPurchase();
  const preview = buildQuoteFromChallenge(challengeFor(), "preview_consent", at);
  withTempConfirmations((confirmations) => {
    for (const mode of ["disabled", "mainnet_live"]) {
      assert.throws(
        () =>
          persistLocalTestnetDemoExecutionConsent({
            intent: socialIntent,
            purchase,
            preview,
            confirmationId: LOCAL_DEMO_FOUNDER_PAYMENT_CONFIRMATION_ID,
            merchantEndpoint: controlledMerchantEndpoint,
            confirmedAt: at,
            confirmations,
            env: { SOMEBODY_EXECUTION_MODE: mode, M4_M3_EXECUTION_ENABLED: "true" } as unknown as NodeJS.ProcessEnv,
          }),
        /testnet_demo/,
      );
    }
  });
});

test("persistLocalTestnetDemoExecutionConsent: refuses when M4_M3_EXECUTION_ENABLED is not exactly \"true\"", () => {
  const purchase = approvedSocialPurchase();
  const preview = buildQuoteFromChallenge(challengeFor(), "preview_consent", at);
  withTempConfirmations((confirmations) => {
    assert.throws(
      () =>
        persistLocalTestnetDemoExecutionConsent({
          intent: socialIntent,
          purchase,
          preview,
          confirmationId: LOCAL_DEMO_FOUNDER_PAYMENT_CONFIRMATION_ID,
          merchantEndpoint: controlledMerchantEndpoint,
          confirmedAt: at,
          confirmations,
          env: { SOMEBODY_EXECUTION_MODE: "testnet_demo", M4_M3_EXECUTION_ENABLED: "false" } as unknown as NodeJS.ProcessEnv,
        }),
      /M4_M3_EXECUTION_ENABLED/,
    );
  });
});

test("persistLocalTestnetDemoExecutionConsent: refuses a non-Social-Media-Guru intent (wrong resource/merchant)", () => {
  const purchase = approvedSocialPurchase();
  const preview = buildQuoteFromChallenge(challengeFor(), "preview_consent", at);
  const wrongServiceIntent: ExecutionIntent = {
    ...socialIntent,
    target: { ...socialIntent.target, serviceId: "token_market_intelligence" },
  };
  withTempConfirmations((confirmations) => {
    assert.throws(
      () =>
        persistLocalTestnetDemoExecutionConsent({
          intent: wrongServiceIntent,
          purchase,
          preview,
          confirmationId: LOCAL_DEMO_FOUNDER_PAYMENT_CONFIRMATION_ID,
          merchantEndpoint: controlledMerchantEndpoint,
          confirmedAt: at,
          confirmations,
          env: enabledEnv,
        }),
      /bounded to social_media_guru/,
    );
  });
});

test("persistLocalTestnetDemoExecutionConsent: refuses a merchant endpoint that is not the controlled Social Media Guru endpoint (wrong payTo/merchant)", () => {
  const purchase = approvedSocialPurchase();
  const preview = buildQuoteFromChallenge(challengeFor(), "preview_consent", at);
  withTempConfirmations((confirmations) => {
    assert.throws(
      () =>
        persistLocalTestnetDemoExecutionConsent({
          intent: socialIntent,
          purchase,
          preview,
          confirmationId: LOCAL_DEMO_FOUNDER_PAYMENT_CONFIRMATION_ID,
          merchantEndpoint: "http://127.0.0.1:4021/m3/paid-ping",
          confirmedAt: at,
          confirmations,
          env: enabledEnv,
        }),
      /merchant endpoint/,
    );
  });
});

test("persistLocalTestnetDemoExecutionConsent: refuses when the live preview no longer matches the approved terms (wrong amount/network/asset/payTo)", () => {
  const purchase = approvedSocialPurchase();
  withTempConfirmations((confirmations) => {
    for (const overrides of [
      { amount: "99999999" },
      { network: "eip155:196" },
      { asset: "0xsomethingelse" },
      { payTo: "0xsomeoneelse" },
    ]) {
      const mismatchedPreview = buildQuoteFromChallenge(challengeFor(overrides), "preview_mismatch", at);
      assert.throws(
        () =>
          persistLocalTestnetDemoExecutionConsent({
            intent: socialIntent,
            purchase,
            preview: mismatchedPreview,
            confirmationId: LOCAL_DEMO_FOUNDER_PAYMENT_CONFIRMATION_ID,
            merchantEndpoint: controlledMerchantEndpoint,
            confirmedAt: at,
            confirmations,
            env: enabledEnv,
          }),
        /no longer match/,
      );
    }
  });
});

test("persistLocalTestnetDemoExecutionConsent: exact controlled Testnet terms + valid Product Attention approval → execution consent accepted", () => {
  const purchase = approvedSocialPurchase();
  const preview = buildQuoteFromChallenge(challengeFor(), "preview_consent", at);
  withTempConfirmations((confirmations) => {
    const confirmation = persistLocalTestnetDemoExecutionConsent({
      intent: socialIntent,
      purchase,
      preview,
      confirmationId: LOCAL_DEMO_FOUNDER_PAYMENT_CONFIRMATION_ID,
      merchantEndpoint: controlledMerchantEndpoint,
      confirmedAt: at,
      confirmations,
      env: enabledEnv,
    });
    assert.equal(confirmation.confirmationId, LOCAL_DEMO_FOUNDER_PAYMENT_CONFIRMATION_ID);
    assert.equal(confirmation.approvalId, socialIntent.terms.approvalId);
    assert.equal(confirmation.purchaseId, purchase.id);
    assert.equal(confirmations.get(purchase.id)?.confirmationId, LOCAL_DEMO_FOUNDER_PAYMENT_CONFIRMATION_ID);
  });
});

test("the ordinary manual preview-confirmation path (persistFounderConfirmation) is unchanged and does not require testnet_demo", () => {
  const purchase = approvedSocialPurchase();
  const preview = buildQuoteFromChallenge(challengeFor(), "preview_manual", at);
  const previousMode = process.env.SOMEBODY_EXECUTION_MODE;
  delete process.env.SOMEBODY_EXECUTION_MODE;
  try {
    withTempConfirmations((confirmations) => {
      const confirmation = persistFounderConfirmation({
        purchase,
        preview,
        confirmationId: "operator_confirmed_preview",
        merchantEndpoint: controlledMerchantEndpoint,
        confirmedAt: at,
        confirmations,
      });
      assert.equal(confirmation.confirmationId, "operator_confirmed_preview");
    });
  } finally {
    if (previousMode === undefined) delete process.env.SOMEBODY_EXECUTION_MODE;
    else process.env.SOMEBODY_EXECUTION_MODE = previousMode;
  }
});
