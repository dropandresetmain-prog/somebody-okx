// V7 Review R3 regression (interpretation reservation fencing):
//
// applyInterpretation (convex/management.ts) never validates args.requestId
// against the CURRENT pending reservation (management.interpretationRequestId).
// It only early-returns if management.contractId is already set. beginInterpretation
// derives a fresh requestId per attempt (`interpret_<key>_a<n>`) and
// expireInterpretationReservation can retire a reservation (status -> "refused")
// while its action chain is still in flight. If that late callback (from an
// EXPIRED reservation A) lands after a NEWER reservation B has been armed, it can
// install a contract or a refusal over B's in-flight attempt -- a stale write.
// Its refusal path also increments interpretationAttempts unconditionally, even
// though beginInterpretation already incremented attempts when it reserved --
// suspected double counting of a single attempt.
//
// These tests drive begin/expire/apply directly through convex-test (no live
// model, no network, no convex dev/deploy). setTimeout AND Date are mocked, so
// scheduled jobs (including the proposeInterpretation model action) never run
// by themselves and every deadline is decided by an explicit test clock.
// Against the unfixed candidate 3ce6e76 the fence/double-count/deadline cases
// fail (evidence: RELIABILITY_V7_EVIDENCE_MANIFEST.md, review corrections).

import test, { mock, after as afterAll } from "node:test";
import assert from "node:assert/strict";
import { convexTest } from "convex-test";
import schema from "../convex/schema";
import {
  beginInterpretation,
  applyInterpretation,
  expireInterpretationReservation,
  BEGIN_INTERPRETATION_CEILING,
  INTERPRETATION_RESERVATION_TTL_MS,
} from "../convex/management";

const modules = {
  "../convex/schema.ts": () => import("../convex/schema"),
  "../convex/objectiveValidators.ts": () => import("../convex/objectiveValidators"),
  "../convex/managementValidators.ts": () => import("../convex/managementValidators"),
  "../convex/workforceGuards.ts": () => import("../convex/workforceGuards"),
  "../convex/objectives.ts": () => import("../convex/objectives"),
  "../convex/objectiveRunner.ts": () => import("../convex/objectiveRunner"),
  "../convex/internal/workforce.ts": () => import("../convex/internal/workforce"),
  "../convex/management.ts": () => import("../convex/management"),
  "../convex/_generated/api.d.ts": () => import("../convex/_generated/api"),
  "../convex/_generated/server.d.ts": () => import("../convex/_generated/server"),
  "../convex/_generated/dataModel.d.ts": () => import("../convex/_generated/dataModel"),
};

type Handler = { _handler: (c: unknown, a: Record<string, unknown>) => Promise<unknown> };
type Backend = ReturnType<typeof convexTest>;

const now = 1_990_000_000_000;
const TTL = INTERPRETATION_RESERVATION_TTL_MS;

mock.timers.enable({ apis: ["setTimeout", "Date"], now });
afterAll(() => mock.timers.reset());
/** Controlled clock: Date.now() inside the mutations. */
function setClock(ms: number) {
  mock.timers.setTime(ms);
}
/** Expire `requestId` after its own deadline (reserved at `reservedAt`). */
async function expireAfterDeadline(t: Backend, key: string, requestId: string, reservedAt: number) {
  setClock(reservedAt + TTL + 1);
  return invokeExpire(t, key, requestId);
}

async function invokeBegin(t: Backend, objectiveKey: string, at: number) {
  return t.mutation(async (ctx) =>
    (beginInterpretation as unknown as Handler)._handler(ctx, { objectiveKey, at }),
  ) as Promise<{ proceed: boolean; requestId?: string; reason?: string }>;
}

async function invokeApply(t: Backend, args: Record<string, unknown>) {
  return t.mutation(async (ctx) =>
    (applyInterpretation as unknown as Handler)._handler(ctx, args),
  ) as Promise<{ ok: boolean; contractId?: string; errors?: string[] }>;
}

async function invokeExpire(t: Backend, objectiveKey: string, requestId: string) {
  return t.mutation(async (ctx) =>
    (expireInterpretationReservation as unknown as Handler)._handler(ctx, { objectiveKey, requestId }),
  );
}


function rawContract(intent = "prove reservation fencing") {
  return {
    intent,
    levels: [{ levelKey: "goal", order: 1, statement: "the goal holds", label: "Goal" }],
    minimumCompletionBar: "goal",
    ambiguities: [],
  };
}

function rawRequirements(reqKey: string) {
  return [
    {
      requirementKey: reqKey,
      priority: "required",
      title: "The governed result is recorded",
      mustBeTrue: "an application observation supports the statement",
      scope: "company artifact + observation",
    },
  ];
}

async function seedObjective(t: Backend, key: string) {
  await t.mutation(async (ctx) => {
    await ctx.db.insert("objectives", {
      key,
      data: {
        key,
        request: "fence interpretation reservations correctly",
        createdAt: now,
        updatedAt: now,
        state: "received",
        activity: "new",
        plan: null,
        workItems: [],
        run: null,
        result: null,
        companyArtifacts: [],
        management: { contractId: null, controlNotes: [] },
      } as never,
    });
  });
}

async function readManagement(t: Backend, key: string) {
  return t.query(async (ctx) => {
    const row = await ctx.db.query("objectives").withIndex("by_key", (q) => q.eq("key", key)).unique();
    const data = (row as unknown as { data: Record<string, unknown> }).data;
    return { state: data.state, management: data.management as Record<string, unknown> };
  });
}

async function readContracts(t: Backend, key: string) {
  return t.query(async (ctx) => {
    const rows = await (ctx.db as unknown as {
      query(n: string): { withIndex(n: string, f: (q: { eq: (k: string, v: unknown) => unknown }) => unknown): { collect(): Promise<unknown[]> } };
    })
      .query("outcomeContracts")
      .withIndex("by_objective", (q) => q.eq("objectiveKey", key))
      .collect();
    return rows;
  });
}

async function readRequirements(t: Backend, key: string) {
  return t.query(async (ctx) => {
    const rows = await (ctx.db as unknown as {
      query(n: string): { withIndex(n: string, f: (q: { eq: (k: string, v: unknown) => unknown }) => unknown): { collect(): Promise<unknown[]> } };
    })
      .query("requirements")
      .withIndex("by_objectiveKey", (q) => q.eq("objectiveKey", key))
      .collect();
    return rows;
  });
}

async function scheduledJobs(t: Backend, name?: string) {
  return t.query(async (ctx) => {
    const rows = await ctx.db.system.query("_scheduled_functions").collect();
    return rows
      .filter((r: unknown) => {
        const row = r as { name?: string; state?: { kind?: string } };
        return name ? row.name === name : true;
      })
      .map((r: unknown) => {
        const row = r as { name?: string; args?: unknown; state?: { kind?: string } };
        return { name: row.name, args: row.args, state: row.state?.kind };
      });
  });
}

// ── 1. late VALID callback from expired reservation A cannot install a ──────
//    contract over pending reservation B
test("late VALID callback from expired reservation A cannot install a contract over pending reservation B", async () => {
  const t = convexTest(schema, modules);
  const key = "obj_fence_1";
  await seedObjective(t, key);

  const a = await invokeBegin(t, key, now);
  assert.equal(a.proceed, true);
  const requestIdA = a.requestId!;
  await expireAfterDeadline(t, key, requestIdA, now);

  const b = await invokeBegin(t, key, now + TTL + 2);
  assert.equal(b.proceed, true);
  const requestIdB = b.requestId!;
  assert.notEqual(requestIdA, requestIdB, "B must be a distinct reservation from A");

  const before = await readManagement(t, key);
  const contractsBefore = await readContracts(t, key);
  const reqsBefore = await readRequirements(t, key);
  const scheduledBefore = await scheduledJobs(t);

  const reqKey = "req_fence_1";
  const lateResult = await invokeApply(t, {
    objectiveKey: key,
    requestId: requestIdA,
    rawContract: rawContract(),
    rawRequirements: rawRequirements(reqKey),
    founderResolvedQuestions: [],
    at: now + 2_000,
  });

  assert.equal(lateResult.ok, false, "a callback for an expired/superseded reservation must not be accepted");

  const after = await readManagement(t, key);
  assert.deepEqual(after, before, "B's reservation must be byte-identical after A's late callback is rejected");

  const contractsAfter = await readContracts(t, key);
  const reqsAfter = await readRequirements(t, key);
  assert.equal(contractsAfter.length, contractsBefore.length, "no contract row created by the stale callback");
  assert.equal(reqsAfter.length, reqsBefore.length, "no requirement rows created by the stale callback");

  const scheduledAfter = await scheduledJobs(t);
  assert.equal(scheduledAfter.length, scheduledBefore.length, "the stale callback must not schedule new wakes/passes");

  // B completes normally with a valid payload.
  const bResult = await invokeApply(t, {
    objectiveKey: key,
    requestId: requestIdB,
    rawContract: rawContract(),
    rawRequirements: rawRequirements(reqKey),
    founderResolvedQuestions: [],
    at: now + 3_000,
  });
  assert.equal(bResult.ok, true, `B should apply cleanly: ${bResult.errors?.join("; ")}`);
  const finalMgmt = await readManagement(t, key);
  assert.equal(finalMgmt.management.interpretationStatus, "done");
  assert.equal(finalMgmt.management.interpretationRequestId, requestIdB);
  assert.ok(finalMgmt.management.contractId, "contract installed by B");
});

// ── 2. late INVALID callback from expired reservation A must not touch B ────
test("late INVALID callback from expired reservation A does not disturb pending reservation B", async () => {
  const t = convexTest(schema, modules);
  const key = "obj_fence_2";
  await seedObjective(t, key);

  const a = await invokeBegin(t, key, now);
  const requestIdA = a.requestId!;
  await expireAfterDeadline(t, key, requestIdA, now);
  const b = await invokeBegin(t, key, now + TTL + 2);
  const requestIdB = b.requestId!;

  const before = await readManagement(t, key);

  const lateInvalid = await invokeApply(t, {
    objectiveKey: key,
    requestId: requestIdA,
    rawContract: null,
    rawRequirements: null,
    founderResolvedQuestions: [],
    at: now + 2_000,
  });
  assert.equal(lateInvalid.ok, false);

  const after = await readManagement(t, key);
  assert.equal(after.management.interpretationStatus, "pending", "B's reservation must remain pending");
  assert.equal(after.management.interpretationRequestId, requestIdB, "B's requestId must be untouched");
  assert.equal(
    after.management.interpretationAttempts,
    before.management.interpretationAttempts,
    "a stale callback for A must not increment B's attempt counter",
  );

  const reqKey = "req_fence_2";
  const bResult = await invokeApply(t, {
    objectiveKey: key,
    requestId: requestIdB,
    rawContract: rawContract(),
    rawRequirements: rawRequirements(reqKey),
    founderResolvedQuestions: [],
    at: now + 3_000,
  });
  assert.equal(bResult.ok, true, `B should still complete normally: ${bResult.errors?.join("; ")}`);
});

// ── 3. foreign requestId (never reserved) never applies ─────────────────────
test("foreign requestId never applies", async () => {
  const t = convexTest(schema, modules);
  const key = "obj_fence_3";
  await seedObjective(t, key);

  const before = await readManagement(t, key);
  const result = await invokeApply(t, {
    objectiveKey: key,
    requestId: "interpret_never_reserved_a1",
    rawContract: rawContract(),
    rawRequirements: rawRequirements("req_fence_3"),
    founderResolvedQuestions: [],
    at: now,
  });
  assert.equal(result.ok, false, "a requestId that was never reserved must be rejected");
  const after = await readManagement(t, key);
  assert.deepEqual(after, before, "no mutation from a foreign requestId");
});

// ── 4. exact accepted application is idempotent ──────────────────────────────
test("exact accepted application is idempotent; contract existence does not retroactively validate a different requestId", async () => {
  const t = convexTest(schema, modules);
  const key = "obj_fence_4";
  await seedObjective(t, key);

  const a = await invokeBegin(t, key, now);
  const requestIdA = a.requestId!;
  await expireAfterDeadline(t, key, requestIdA, now);
  const b = await invokeBegin(t, key, now + TTL + 2);
  const requestIdB = b.requestId!;

  const reqKey = "req_fence_4";
  const payload = { rawContract: rawContract(), rawRequirements: rawRequirements(reqKey) };
  const first = await invokeApply(t, {
    objectiveKey: key,
    requestId: requestIdB,
    ...payload,
    founderResolvedQuestions: [],
    at: now + 2_000,
  });
  assert.equal(first.ok, true);
  const contractsAfterFirst = await readContracts(t, key);

  const replayB = await invokeApply(t, {
    objectiveKey: key,
    requestId: requestIdB,
    ...payload,
    founderResolvedQuestions: [],
    at: now + 3_000,
  });
  assert.equal(replayB.ok, true, "replaying B's own accepted requestId is idempotent");
  assert.equal(replayB.contractId, first.contractId, "same contractId on replay");
  const contractsAfterReplay = await readContracts(t, key);
  assert.equal(contractsAfterReplay.length, contractsAfterFirst.length, "no second contract row from replay");

  const replayA = await invokeApply(t, {
    objectiveKey: key,
    requestId: requestIdA,
    ...payload,
    founderResolvedQuestions: [],
    at: now + 4_000,
  });
  assert.equal(
    replayA.ok,
    false,
    "A must still be rejected even though a contract now exists -- existence of a contract is not proof A was accepted",
  );
});

// ── 5. apply refusal does not double count attempts ──────────────────────────
test("apply refusal does not double count attempts", async () => {
  const t = convexTest(schema, modules);
  const key = "obj_fence_5";
  await seedObjective(t, key);

  const a = await invokeBegin(t, key, now);
  assert.equal(a.proceed, true);
  const mgmtAfterBegin = await readManagement(t, key);
  assert.equal(mgmtAfterBegin.management.interpretationAttempts, 1, "begin burns the first attempt");

  const refusal = await invokeApply(t, {
    objectiveKey: key,
    requestId: a.requestId!,
    rawContract: null,
    rawRequirements: null,
    founderResolvedQuestions: [],
    at: now + 1_000,
  });
  assert.equal(refusal.ok, false);

  const mgmtAfterRefusal = await readManagement(t, key);
  assert.equal(
    mgmtAfterRefusal.management.interpretationAttempts,
    1,
    "a refusal for the SAME reservation begin already counted must not increment attempts again (documents the double-count defect if it fails)",
  );
});

// ── 6. watchdog deadline discipline ──────────────────────────────────────────
test("watchdog does not act before its own deadline (it re-arms once for the remainder), then expires exactly its reservation", async () => {
  const t = convexTest(schema, modules);
  const key = "obj_fence_6";
  await seedObjective(t, key);

  setClock(now);
  const a = await invokeBegin(t, key, now);
  const requestIdA = a.requestId!;
  const reserved = await readManagement(t, key);
  assert.equal(reserved.management.interpretationExpiresAt, now + TTL, "the reservation stores its own deadline");

  const watchdogsBefore = (await scheduledJobs(t, "management:expireInterpretationReservation")).length;
  setClock(now + 1_000); // an early delivery
  await invokeExpire(t, key, requestIdA);
  const early = await readManagement(t, key);
  assert.equal(early.management.interpretationStatus, "pending", "no expiry before the reservation's own deadline");
  assert.equal(early.management.interpretationRequestId, requestIdA);
  assert.equal(
    (await scheduledJobs(t, "management:expireInterpretationReservation")).length,
    watchdogsBefore + 1,
    "exactly one watchdog is re-armed for the remaining time (bounded, not a poll)",
  );

  await expireAfterDeadline(t, key, requestIdA, now);
  const expired = await readManagement(t, key);
  assert.equal(expired.management.interpretationStatus, "refused");
  assert.equal(expired.management.interpretationAttempts, 1, "expiry does not count the attempt twice");
});

test("a repeat/late watchdog call for an already-superseded reservation A leaves reservation B untouched", async () => {
  const t = convexTest(schema, modules);
  const key = "obj_fence_6b";
  await seedObjective(t, key);

  const a = await invokeBegin(t, key, now);
  const requestIdA = a.requestId!;
  await expireAfterDeadline(t, key, requestIdA, now); // A expires for real
  const b = await invokeBegin(t, key, now + TTL + 2);
  const requestIdB = b.requestId!;
  const before = await readManagement(t, key);

  // A late/duplicate watchdog delivery for A fires again after B is armed —
  // even past B's own deadline it must leave B untouched.
  setClock(now + 3 * TTL);
  await invokeExpire(t, key, requestIdA);

  const after = await readManagement(t, key);
  assert.deepEqual(after, before, "a repeat watchdog for A must not touch B's reservation");
});

// ── 7. continuation ownership after expiry ───────────────────────────────────
test("expiry owns its continuation: it re-begins within the ceiling, then reaches the explicit escalated state (no manual rescue, no loop)", async () => {
  const t = convexTest(schema, modules);
  const key = "obj_fence_7";
  await seedObjective(t, key);

  setClock(now);
  const a = await invokeBegin(t, key, now);
  const beginJobs = async () => (await scheduledJobs(t, "management:beginInterpretation")).length;
  const passJobs = async () => (await scheduledJobs(t, "management:runManagementPass")).length;
  const passesBefore = await passJobs();

  await expireAfterDeadline(t, key, a.requestId!, now);
  assert.equal(await beginJobs(), 1, "the expiry itself schedules the next bounded begin");
  assert.equal(await passJobs(), passesBefore, "no inert management pass is used as the continuation");

  // Deliver that scheduled begin (the test plays the scheduler; no model runs).
  const retryAt = now + TTL + 1;
  const b = await invokeBegin(t, key, retryAt);
  assert.equal(b.proceed, true, "attempt 2 is reserved under the ceiling");
  const second = await readManagement(t, key);
  assert.equal(second.management.interpretationAttempts, 2);
  assert.equal(second.management.interpretationStatus, "pending");

  await expireAfterDeadline(t, key, b.requestId!, retryAt);
  assert.equal(await beginJobs(), 2, "the second expiry also hands back to begin");
  const c = await invokeBegin(t, key, retryAt + TTL + 1);
  assert.equal(c.proceed, false);
  const final = await readManagement(t, key);
  assert.equal(BEGIN_INTERPRETATION_CEILING, 2);
  assert.equal(final.state, "escalated", "the ceiling reaches the explicit governed escalated state");
  assert.equal(final.management.interpretationStatus, "refused");
  assert.equal(final.management.interpretationAttempts, 2, "no attempt was refunded or double counted");
  assert.equal(await beginJobs(), 2, "escalation schedules nothing further (no busy loop)");
});
