/**
 * CP1 focused tests: SOMEBODY_EXECUTION_MODE policy + /start purpose authority.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { mock, after as afterAll } from "node:test";
import { convexTest } from "convex-test";

import schema from "../convex/schema";
import { createObjectiveV1 } from "../convex/productCommands";
import { createReceivedObjective } from "../convex/objectiveCreate";
import type { MutationCtx } from "../convex/_generated/server";
import type { ProductCommandResult } from "../app/product/contracts";
import {
  assertNetworkMaySignOrSubmit,
  allowedNetworksForExecutionMode,
  isFinancialSigningEnabled,
  parseSomebodyExecutionMode,
  readSomebodyExecutionMode,
  XLAYER_MAINNET_CAIP2,
  XLAYER_TESTNET_CAIP2,
} from "../lib/execution/executionMode";
import { SUBMISSION_EXTERNAL_SOCIAL_PURPOSE_POLICY } from "../lib/objective/seedData";
import { EXTERNAL_SOCIAL_INTELLIGENCE_PURPOSE_KIND } from "../lib/workforce/catalog";
import { NEWSLIQUID_PROVIDER_ID, NEWSLIQUID_SERVICE_ID, NEWSLIQUID_OFFERING_ID } from "../lib/payment/newsliquidProduct";
import { COMPOSED_EXTERNAL_EXECUTION } from "../lib/providers/executionCapability";
import { NEWSLIQUID_ENDPOINT_URL } from "../lib/providers/newsliquid";
import { executeApprovedPayment } from "../lib/payment/buyerRail";
import type { PreparedPayment } from "../lib/payment/buyerRail";
import type { PaymentExecutor } from "../lib/payment/types";

mock.timers.enable({ apis: ["setTimeout", "Date"], now: 1_820_000_000_000 });
afterAll(() => mock.timers.reset());

const modules = {
  "../convex/schema.ts": () => import("../convex/schema"),
  "../convex/objectiveValidators.ts": () => import("../convex/objectiveValidators"),
  "../convex/managementValidators.ts": () => import("../convex/managementValidators"),
  "../convex/workforceGuards.ts": () => import("../convex/workforceGuards"),
  "../convex/objectiveCreate.ts": () => import("../convex/objectiveCreate"),
  "../convex/productCommands.ts": () => import("../convex/productCommands"),
  "../convex/productWorkspace.ts": () => import("../convex/productWorkspace"),
  "../convex/management.ts": () => import("../convex/management"),
  "../convex/objectiveRunner.ts": () => import("../convex/objectiveRunner"),
  "../convex/_generated/api.d.ts": () => import("../convex/_generated/api"),
  "../convex/_generated/api.js": () => import("../convex/_generated/api"),
  "../convex/_generated/server.d.ts": () => import("../convex/_generated/server"),
  "../convex/_generated/server.js": () => import("../convex/_generated/server"),
  "../convex/_generated/dataModel.d.ts": () => import("../convex/_generated/dataModel"),
};

// convex-test helper used by createObjectiveCommand.test.ts
async function call(
  mutation: { _handler: (ctx: unknown, args: unknown) => Promise<unknown> },
  ctx: unknown,
  args: unknown,
): Promise<unknown> {
  return mutation._handler(ctx, args);
}

const VALID_REQUEST =
  "Ship a clearer launch plan for our one-person company this week with concrete messaging.";

// ── Execution mode ───────────────────────────────────────────────────────────

test("execution mode defaults to disabled and parses known values", () => {
  assert.equal(parseSomebodyExecutionMode(undefined), "disabled");
  assert.equal(parseSomebodyExecutionMode(""), "disabled");
  assert.equal(parseSomebodyExecutionMode("disabled"), "disabled");
  assert.equal(parseSomebodyExecutionMode("testnet_demo"), "testnet_demo");
  assert.equal(parseSomebodyExecutionMode("mainnet_live"), "mainnet_live");
  assert.equal(parseSomebodyExecutionMode("weird"), "disabled");
  assert.deepEqual(allowedNetworksForExecutionMode("disabled"), []);
  assert.deepEqual(allowedNetworksForExecutionMode("testnet_demo"), [
    XLAYER_TESTNET_CAIP2,
  ]);
  assert.deepEqual(allowedNetworksForExecutionMode("mainnet_live"), [
    XLAYER_MAINNET_CAIP2,
  ]);
});

test("testnet_demo allows Testnet signing when supervised; refuses Mainnet before signing", () => {
  assert.equal(
    isFinancialSigningEnabled("disabled", { supervisedExecutionEnabled: true }),
    false,
  );
  assert.equal(
    isFinancialSigningEnabled("testnet_demo", {
      supervisedExecutionEnabled: false,
    }),
    false,
  );
  assert.equal(
    isFinancialSigningEnabled("testnet_demo", {
      supervisedExecutionEnabled: true,
    }),
    true,
  );
  assert.equal(
    isFinancialSigningEnabled("mainnet_live", {
      supervisedExecutionEnabled: true,
    }),
    false,
    "mainnet_live signing is not authorized in this lane",
  );

  assert.doesNotThrow(() =>
    assertNetworkMaySignOrSubmit("testnet_demo", XLAYER_TESTNET_CAIP2),
  );
  assert.throws(
    () => assertNetworkMaySignOrSubmit("testnet_demo", XLAYER_MAINNET_CAIP2),
    /refuses non-Testnet|eip155:196/,
  );
  assert.throws(
    () => assertNetworkMaySignOrSubmit("disabled", XLAYER_TESTNET_CAIP2),
    /disabled/,
  );
  assert.throws(
    () => assertNetworkMaySignOrSubmit("mainnet_live", XLAYER_MAINNET_CAIP2),
    /not authorized/,
  );
});

test("NewsLiquid Mainnet integration remains configured but is not an executable Testnet target", () => {
  const composed = COMPOSED_EXTERNAL_EXECUTION.find(
    (row) =>
      row.providerId === NEWSLIQUID_PROVIDER_ID &&
      row.serviceId === NEWSLIQUID_SERVICE_ID,
  );
  assert.ok(composed, "NewsLiquid remains in composed execution capability");
  assert.equal(composed!.boundary, "okx_x402_live_mainnet");
  assert.equal(NEWSLIQUID_OFFERING_ID, "2135:newsliquid_twitter_search");
  assert.match(NEWSLIQUID_ENDPOINT_URL, /^https:\/\//);
  // Under testnet_demo, Mainnet network must fail the sign gate.
  assert.throws(
    () => assertNetworkMaySignOrSubmit("testnet_demo", XLAYER_MAINNET_CAIP2),
    /eip155:196/,
  );
});

test("executeApprovedPayment refuses Mainnet under testnet_demo before invoking executor", async () => {
  const prev = process.env.SOMEBODY_EXECUTION_MODE;
  process.env.SOMEBODY_EXECUTION_MODE = "testnet_demo";
  try {
    assert.equal(readSomebodyExecutionMode(), "testnet_demo");
    let executorCalled = false;
    const executor: PaymentExecutor = {
      kind: "official_onchainos",
      async executeApprovedPayment() {
        executorCalled = true;
        return {
          transactionHash: "0xdead",
          submittedAt: Date.now(),
          paymentId: "p",
        };
      },
    };
    const prepared = {
      state: "ready_to_sign",
      purchaseId: "purchase_1",
      idempotencyKey: "idem_1",
      terms: {
        scheme: "exact",
        network: XLAYER_MAINNET_CAIP2,
        asset: "0xabc",
        maxAmountRequired: "10000",
        payTo: "0x1111111111111111111111111111111111111111",
        resource: "https://example.invalid/newsliquid",
        eip712: { name: "USDT", version: "1" },
        maxTimeoutSeconds: 60,
      },
      intent: {
        intentId: "intent_1",
        approval: { approvalId: "appr_1" },
      },
    } as unknown as PreparedPayment;

    await assert.rejects(
      () => executeApprovedPayment(prepared, executor),
      /refuses Mainnet|eip155:196/,
    );
    assert.equal(executorCalled, false, "executor must not run for Mainnet under testnet_demo");
  } finally {
    if (prev === undefined) delete process.env.SOMEBODY_EXECUTION_MODE;
    else process.env.SOMEBODY_EXECUTION_MODE = prev;
  }
});

test("executeApprovedPayment also refuses Mainnet when mode is disabled", async () => {
  const prev = process.env.SOMEBODY_EXECUTION_MODE;
  delete process.env.SOMEBODY_EXECUTION_MODE;
  try {
    let executorCalled = false;
    const executor: PaymentExecutor = {
      kind: "official_onchainos",
      async executeApprovedPayment() {
        executorCalled = true;
        return {
          transactionHash: "0xdead",
          submittedAt: Date.now(),
          paymentId: "p",
        };
      },
    };
    const prepared = {
      state: "ready_to_sign",
      purchaseId: "purchase_1",
      idempotencyKey: "idem_1",
      terms: {
        scheme: "exact",
        network: XLAYER_MAINNET_CAIP2,
        asset: "0xabc",
        maxAmountRequired: "10000",
        payTo: "0x1111111111111111111111111111111111111111",
        resource: "https://example.invalid/newsliquid",
        eip712: { name: "USDT", version: "1" },
        maxTimeoutSeconds: 60,
      },
      intent: {
        intentId: "intent_1",
        approval: { approvalId: "appr_1" },
      },
    } as unknown as PreparedPayment;
    await assert.rejects(
      () => executeApprovedPayment(prepared, executor),
      /refuses Mainnet|eip155:196/,
    );
    assert.equal(executorCalled, false);
  } finally {
    if (prev === undefined) delete process.env.SOMEBODY_EXECUTION_MODE;
    else process.env.SOMEBODY_EXECUTION_MODE = prev;
  }
});

// ── Purpose authority ────────────────────────────────────────────────────────

test("visible /start createReceivedObjective does NOT blanket-authorize social scope", async () => {
  const inserts: Array<{ table: string; doc: Record<string, unknown> }> = [];
  const ctx = {
    db: {
      insert: async (table: string, doc: Record<string, unknown>) => {
        inserts.push({ table, doc });
        return "id" as never;
      },
    },
    scheduler: {
      runAfter: async () => "jid" as never,
    },
  };

  await createReceivedObjective(
    ctx as unknown as MutationCtx,
    VALID_REQUEST,
    "visible",
  );
  const data = inserts[0]!.doc.data as {
    management?: { authorizedPurposePolicy?: unknown };
  };
  assert.equal(
    data.management?.authorizedPurposePolicy ?? null,
    null,
    "unrelated visible /start must receive no social-intelligence authority",
  );
});

test("explicit structured policy binds external_social_intelligence to one Objective", async () => {
  const inserts: Array<{ table: string; doc: Record<string, unknown> }> = [];
  const ctx = {
    db: {
      insert: async (table: string, doc: Record<string, unknown>) => {
        inserts.push({ table, doc });
        return "id" as never;
      },
    },
    scheduler: {
      runAfter: async () => "jid" as never,
    },
  };

  await createReceivedObjective(
    ctx as unknown as MutationCtx,
    VALID_REQUEST,
    "visible",
    { authorizedPurposePolicy: SUBMISSION_EXTERNAL_SOCIAL_PURPOSE_POLICY },
  );
  const data = inserts[0]!.doc.data as {
    management?: {
      authorizedPurposePolicy?: {
        purposeKind: string;
        targetRequirementKind: string;
        requiredResourceClasses?: string[];
      };
    };
  };
  assert.deepEqual(data.management?.authorizedPurposePolicy, {
    purposeKind: EXTERNAL_SOCIAL_INTELLIGENCE_PURPOSE_KIND,
    targetRequirementKind: "deliverable",
    // demo/okx-required-buy-path: the submission policy additively states the
    // genuine proprietary_data need on the same targeted deliverable — see
    // SUBMISSION_EXTERNAL_SOCIAL_PURPOSE_POLICY in lib/objective/seedData.ts.
    requiredResourceClasses: ["proprietary_data"],
  });
});

test("createObjectiveV1 without policy leaves social authority absent; with policy accepts structured authority", async () => {
  const t = convexTest(schema, modules);

  const plain = (await t.mutation(async (ctx) =>
    call(createObjectiveV1, ctx, { request: VALID_REQUEST }),
  )) as ProductCommandResult;
  assert.equal(plain.accepted, true);
  if (!plain.accepted) return;

  const plainRow = await t.run(async (ctx) => {
    const rows = await ctx.db.query("objectives").collect();
    return rows.find((r) => (r as { key: string }).key === plain.objectiveId) as {
      data: { management?: { authorizedPurposePolicy?: unknown } };
    };
  });
  assert.equal(
    plainRow.data.management?.authorizedPurposePolicy ?? null,
    null,
    "generic /start must not globally receive social scope",
  );

  const authorized = (await t.mutation(async (ctx) =>
    call(createObjectiveV1, ctx, {
      request: VALID_REQUEST + " With external social intelligence authority.",
      authorizedPurposePolicy: SUBMISSION_EXTERNAL_SOCIAL_PURPOSE_POLICY,
    }),
  )) as ProductCommandResult;
  assert.equal(authorized.accepted, true);
  if (!authorized.accepted) return;

  const authRow = await t.run(async (ctx) => {
    const rows = await ctx.db.query("objectives").collect();
    return rows.find(
      (r) => (r as { key: string }).key === authorized.objectiveId,
    ) as {
      data: {
        management?: {
          authorizedPurposePolicy?: { purposeKind: string };
        };
      };
    };
  });
  assert.equal(
    authRow.data.management?.authorizedPurposePolicy?.purposeKind,
    EXTERNAL_SOCIAL_INTELLIGENCE_PURPOSE_KIND,
  );

  const rejected = (await t.mutation(async (ctx) =>
    call(createObjectiveV1, ctx, {
      request: VALID_REQUEST + " Bad policy.",
      authorizedPurposePolicy: {
        purposeKind: "not_a_real_purpose_kind",
        targetRequirementKind: "deliverable",
      },
    }),
  )) as ProductCommandResult;
  assert.equal(rejected.accepted, false);
  if (rejected.accepted) return;
  assert.equal(rejected.error.code, "validation_error");
});

// ── Testnet-demo application policy binding for the real /start surface ────
//
// This is Testnet-demo APPLICATION policy, not general production authority.
// It is mode-bound to SOMEBODY_EXECUTION_MODE=testnet_demo only, uses the
// existing structured AuthorizedPurposePolicy (no keyword matching, no
// model-created scope, no worker self-authorization), and Requirement
// binding remains structural / contract-revision-bound via the unchanged
// bindAuthorizedPurposePolicy seam.

async function createViaStartWithMode(
  mode: string | undefined,
): Promise<{ authorizedPurposePolicy?: { purposeKind: string } | null }> {
  const prev = process.env.SOMEBODY_EXECUTION_MODE;
  if (mode === undefined) delete process.env.SOMEBODY_EXECUTION_MODE;
  else process.env.SOMEBODY_EXECUTION_MODE = mode;
  try {
    const t = convexTest(schema, modules);
    const result = (await t.mutation(async (ctx) =>
      call(createObjectiveV1, ctx, { request: VALID_REQUEST }),
    )) as ProductCommandResult;
    assert.equal(result.accepted, true);
    if (!result.accepted) throw new Error("unreachable");
    const row = await t.run(async (ctx) => {
      const rows = await ctx.db.query("objectives").collect();
      return rows.find(
        (r) => (r as { key: string }).key === result.objectiveId,
      ) as {
        data: { management?: { authorizedPurposePolicy?: unknown } };
      };
    });
    return {
      authorizedPurposePolicy: (row.data.management?.authorizedPurposePolicy ??
        null) as { purposeKind: string } | null,
    };
  } finally {
    if (prev === undefined) delete process.env.SOMEBODY_EXECUTION_MODE;
    else process.env.SOMEBODY_EXECUTION_MODE = prev;
  }
}

test("disabled + /start → no external social purpose authority", async () => {
  const { authorizedPurposePolicy } = await createViaStartWithMode("disabled");
  assert.equal(authorizedPurposePolicy ?? null, null);
});

test("mainnet_live + /start → no automatic external social purpose authority", async () => {
  const { authorizedPurposePolicy } = await createViaStartWithMode(
    "mainnet_live",
  );
  assert.equal(authorizedPurposePolicy ?? null, null);
});

test("testnet_demo + /start → bounded SUBMISSION_EXTERNAL_SOCIAL_PURPOSE_POLICY", async () => {
  const { authorizedPurposePolicy } = await createViaStartWithMode(
    "testnet_demo",
  );
  assert.equal(
    authorizedPurposePolicy?.purposeKind,
    EXTERNAL_SOCIAL_INTELLIGENCE_PURPOSE_KIND,
  );
  assert.deepEqual(
    authorizedPurposePolicy,
    SUBMISSION_EXTERNAL_SOCIAL_PURPOSE_POLICY,
  );
});

test("testnet_demo /start policy still cannot execute a mismatched (purpose-incompatible) merchant", async () => {
  // The mode-bound policy only authorizes external_social_intelligence
  // Requirements to be sourced; it grants no merchant-specific eligibility.
  // Purpose-incompatible controlled merchants (Token Market Intelligence,
  // Wallet / Onchain Risk Intelligence) remain rejected by the unchanged
  // eligibility seam covered in tests/testnetBuyCp3Eligibility.test.ts —
  // this test only re-asserts the policy itself carries no merchant identity.
  assert.equal(
    "provider" in SUBMISSION_EXTERNAL_SOCIAL_PURPOSE_POLICY,
    false,
    "the policy authorizes a purpose kind, never a specific merchant",
  );
});
