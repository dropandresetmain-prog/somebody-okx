import test from "node:test";
import assert from "node:assert/strict";

import { localDemoDriverCandidate } from "../convex/m3Driver";
import {
  LOCAL_DEMO_FOUNDER_PAYMENT_CONFIRMATION_ID,
  localDemoM3DriverEnabled,
} from "../lib/payment/localDemoM3DriverAdvance";
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
    }),
    true,
  );
  assert.equal(
    localDemoM3DriverEnabled({
      SOMEBODY_EXECUTION_MODE: "disabled",
      M4_M3_EXECUTION_ENABLED: "true",
      CONVEX_URL: "http://127.0.0.1:3210",
      M4_M3_DRIVER_TOKEN: "t",
    }),
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
