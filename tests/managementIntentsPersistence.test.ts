// CP6 persistence — the external seam round-trip on REAL Convex mutations:
// an authorized BUY intent persists idempotently by intentId, a rail event
// wakes Somebody exactly once through appendWakeEvent's dedupeKey, and the
// consumedAt cursor closes the loop. Handlers are invoked through their own
// _handler entries — this test runs the shipped mutation code, not a copy.
import test from "node:test";
import assert from "node:assert/strict";
import { convexTest } from "convex-test";
import schema from "../convex/schema";
import { putIntent, appendWakeEvent, markWakeConsumed } from "../convex/internal/workforce";
import {
  createIntentFromAuthorization,
  planWakeForRailEvent,
} from "../lib/management/intents";
import {
  buildExternalOption,
  eligibilityInputFor,
  optionIdFor,
  withEligibility,
  EMPTY_FACTS,
  type EligibilityFacts,
} from "../lib/management/options";
import type { AuthorizationResult, GroundedOption } from "../lib/management/types";

const modules = {
  "../convex/schema.ts": () => import("../convex/schema"),
  "../convex/objectiveValidators.ts": () => import("../convex/objectiveValidators"),
  "../convex/managementValidators.ts": () => import("../convex/managementValidators"),
  "../convex/workforceGuards.ts": () => import("../convex/workforceGuards"),
  "../convex/internal/workforce.ts": () => import("../convex/internal/workforce"),
  "../convex/_generated/api.d.ts": () => import("../convex/_generated/api"),
  "../convex/_generated/server.d.ts": () => import("../convex/_generated/server"),
};

const now = 1800000000000;

const facts: EligibilityFacts = {
  requiredResourceClasses: ["proprietary_data"],
  controlledResourceClasses: [],
  deadlineAt: null,
  now,
  estimatedMinutes: null,
  requiresMandatoryProof: false,
  proofAvailable: true,
  workerAvailable: null,
  spendAuthorityUsd: 10,
  budgetRemainingUsd: 100,
};

function eligibleBuyOption(): GroundedOption {
  const option = buildExternalOption({
    requirementKey: "social_intel",
    contractRevision: 1,
    offeringId: "reg_offer_1",
    providerId: "prov_x",
    serviceId: "svc_x",
    resourceClass: "proprietary_data",
    priceUsd: 4,
    priceProvenance: "provider_quote",
    registryVerified: true,
    compatibleResourceClass: true,
    executionPathConfigured: true,
    purposeScopeCompatible: true,
    facts: EMPTY_FACTS,
  });
  return withEligibility([option], (o) => eligibilityInputFor(o, facts))[0];
}

const authorization: AuthorizationResult = {
  kind: "authorized",
  decisionId: "dec_p6",
  requirementKey: "social_intel",
  contractRevision: 1,
  strategy: "BUY",
  optionId: optionIdFor({ requirementKey: "social_intel", contractRevision: 1, kind: "external", target: "external:reg_offer_1" }),
  authorizedAt: now,
  // R3 A4 — a monetary BUY authorization names the founder grant behind it.
  spendApprovalId: "appr_intents_persistence_1",
};

// _handler is the shipped mutation body; convex-test only routes generated
// api refs, which are stale in this checkout, so the test drives the real
// handler directly (never a re-implementation).
const callMutation = (fn: unknown, ctx: unknown, args: Record<string, unknown>) =>
  (fn as { _handler: (ctx: unknown, args: Record<string, unknown>) => Promise<unknown> })._handler(ctx, args);

test("authorized intent persists idempotently by intentId; by_idempotency finds the SAME row; advance patches in place", async () => {
  const t = convexTest(schema, modules);
  const built = createIntentFromAuthorization({
    objectiveKey: "obj_p6", authorization, option: eligibleBuyOption(), at: now, mode: "m3_unavailable",
  });
  assert.equal(built.ok, true);
  if (!built.ok) return;
  const intent = built.intent;

  const first = await t.mutation(async (ctx) =>
    callMutation(putIntent, ctx, { intentId: intent.intentId, objectiveKey: intent.objectiveKey, idempotencyKey: intent.idempotencyKey, data: intent }),
  );
  assert.deepEqual(first, { ok: true });

  // a replayed wake re-"creates" the same logical effect: upsert, not twin
  const advanced = { ...intent, state: "awaiting_m3" as const, boundaryNote: intent.boundaryNote };
  await t.mutation(async (ctx) =>
    callMutation(putIntent, ctx, { intentId: intent.intentId, objectiveKey: intent.objectiveKey, idempotencyKey: intent.idempotencyKey, data: advanced }),
  );

  const rows = await t.query(async (ctx) =>
    (ctx.db as unknown as { query(name: string): { withIndex(name: string, q: (q: { eq(field: string, value: unknown): unknown }) => unknown): { collect(): Promise<Array<{ data: unknown; intentId: string }>> } } })
      .query("executionIntents")
      .withIndex("by_idempotency", (q: { eq(field: string, value: unknown): unknown }) => q.eq("idempotencyKey", intent.idempotencyKey))
      .collect(),
  );
  assert.equal(rows.length, 1, "one row per logical effect — never a twin");
  assert.deepEqual((rows[0].data as { state: string }).state, "awaiting_m3");
});

test("provider-result event flows through appendWakeEvent with planWakeForRailEvent's dedupeKey: duplicate delivery wakes once, consumption closes the cursor", async () => {
  const t = convexTest(schema, modules);
  const event = { kind: "provider_result" as const, intentId: "int_p6", eventId: "evt_p6_r1", resultEvidenceId: "ev_p6_r1", at: now };
  const plan = planWakeForRailEvent(event);
  assert.equal(plan.ok, true);
  if (!plan.ok) return;

  const insert = async (eventId: string) =>
    t.mutation(async (ctx) =>
      callMutation(appendWakeEvent, ctx, {
        eventId,
        objectiveKey: "obj_p6",
        dedupeKey: plan.dedupeKey,
        data: {
          eventId, objectiveKey: "obj_p6", reason: plan.wakeReason,
          refKind: "intent", refId: event.intentId,
          summary: "provider result recorded", at: event.at, consumedAt: null,
        },
      }),
    );

  const first = await insert("wake_a");
  assert.deepEqual((first as { ok: boolean }).ok, true);
  // the SAME webhook redelivered under a new eventId still dedupes to the one row
  const second = await insert("wake_b");
  assert.equal((second as { duplicate?: boolean }).duplicate, true);
  assert.equal((second as { existingEventId?: string }).existingEventId, "wake_a");

  const consumed = await t.mutation(async (ctx) =>
    callMutation(markWakeConsumed, ctx, { eventIds: ["wake_a"], at: now + 5 }),
  );
  assert.deepEqual(consumed, { ok: true, marked: 1 });
  // consuming twice is a typed no-op, not an error
  const again = await t.mutation(async (ctx) =>
    callMutation(markWakeConsumed, ctx, { eventIds: ["wake_a"], at: now + 6 }),
  );
  assert.deepEqual(again, { ok: true, marked: 0 });
});
