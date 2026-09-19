// CP7 — worker-originated wake seams on the SHIPPED Convex mutations.
// planWakeForResourceRequest / planWakeForWorkerResult are pure and
// deterministic (replayed inputs rebuild byte-identical eventId/dedupeKey),
// and appendWakeEvent's dedupe collapses redelivery so Somebody wakes exactly
// once. Handlers are invoked through their own _handler entries — this runs
// the shipped mutation code, not a copy.
import test from "node:test";
import assert from "node:assert/strict";
import { convexTest } from "convex-test";
import schema from "../convex/schema";
import { appendWakeEvent } from "../convex/internal/workforce";
import {
  planWakeForResourceRequest,
  planWakeForWorkerResult,
  type ResourceRequestWakePlan,
} from "../lib/management/wakes";

const modules = {
  "../convex/schema.ts": () => import("../convex/schema"),
  "../convex/objectiveValidators.ts": () => import("../convex/objectiveValidators"),
  "../convex/managementValidators.ts": () => import("../convex/managementValidators"),
  "../convex/workforceGuards.ts": () => import("../convex/workforceGuards"),
  "../convex/internal/workforce.ts": () => import("../convex/internal/workforce"),
  "../convex/_generated/api.d.ts": () => import("../convex/_generated/api"),
  "../convex/_generated/server.d.ts": () => import("../convex/_generated/server"),
};

const now = 1810000000000;

const callMutation = (fn: unknown, ctx: unknown, args: Record<string, unknown>) =>
  (fn as { _handler: (ctx: unknown, args: Record<string, unknown>) => Promise<unknown> })._handler(ctx, args);

type WakeRow = {
  objectiveKey: string;
  data: { eventId: string; reason: string; refKind: string; refId: string };
};
const readWakes = (t: ReturnType<typeof convexTest>, objectiveKey: string) =>
  t.query(async (ctx) =>
    (ctx.db as unknown as { query(name: string): { collect(): Promise<WakeRow[]> } })
      .query("wakeEvents")
      .collect(),
  ).then((rows) => rows.filter((r) => r.objectiveKey === objectiveKey));

async function append(
  t: ReturnType<typeof convexTest>,
  plan: ResourceRequestWakePlan,
  objectiveKey: string,
): Promise<{ ok?: boolean; duplicate?: boolean; existingEventId?: string }> {
  return (await t.mutation(async (ctx) =>
    callMutation(appendWakeEvent, ctx, {
      eventId: plan.eventId,
      objectiveKey,
      dedupeKey: plan.dedupeKey,
      data: plan.event,
    }),
  )) as { ok?: boolean; duplicate?: boolean; existingEventId?: string };
}

test("planWakeForResourceRequest is deterministic: replay rebuilds byte-identical eventId/dedupeKey", () => {
  const input = {
    objectiveKey: "obj_w1",
    runId: "run_w1",
    resourceClass: "proprietary_data",
    purpose: "social signal corpus",
    needId: "need_w1",
    at: now,
  };
  const a = planWakeForResourceRequest(input);
  const b = planWakeForResourceRequest({ ...input });
  assert.deepEqual(a, b);
  assert.equal(a.reason, "worker_resource_request");
  // the wake carries a POINTER to the persisted need, never the payload
  assert.equal(a.event.refKind, "requirement");
  assert.equal(a.event.refId, "need_w1");
  assert.match(a.eventId, /^wake_rr_[0-9a-f]{24}$/);
  // same run may request the same class for a DIFFERENT purpose: distinct wakes
  const other = planWakeForResourceRequest({ ...input, purpose: "pricing intel" });
  assert.notEqual(other.dedupeKey, a.dedupeKey);
  assert.notEqual(other.eventId, a.eventId);
});

test("planWakeForWorkerResult: failure vs success are distinct typed wakes; finish is DATA, never satisfaction", () => {
  const ok = planWakeForWorkerResult({
    objectiveKey: "obj_w2", runId: "run_w2", failed: false, spineCompleted: true, at: now,
  });
  const fail = planWakeForWorkerResult({
    objectiveKey: "obj_w2", runId: "run_w2", failed: true, spineCompleted: false, at: now,
  });
  assert.equal(ok.reason, "worker_result");
  assert.equal(fail.reason, "worker_failure");
  assert.notEqual(ok.dedupeKey, fail.dedupeKey);
  assert.equal(ok.event.refKind, "objective");
  assert.equal(ok.event.refId, "run_w2");
  // the summary states the gate re-decides; completion is never authorized here
  assert.match(ok.event.summary, /gate re-decides/);
  // determinism
  assert.deepEqual(ok, planWakeForWorkerResult({
    objectiveKey: "obj_w2", runId: "run_w2", failed: false, spineCompleted: true, at: now,
  }));
});

test("resource-request wake round-trips through shipped appendWakeEvent: redelivery dedupes, listWakeEvents returns the pointer", async () => {
  const t = convexTest(schema, modules);
  const plan = planWakeForResourceRequest({
    objectiveKey: "obj_w3", runId: "run_w3", resourceClass: "compute",
    purpose: "batch scrape", needId: "need_w3", at: now,
  });

  const first = await append(t, plan, "obj_w3");
  assert.deepEqual(first, { ok: true });
  const replay = await append(t, plan, "obj_w3");
  assert.equal(replay.duplicate, true);
  assert.equal(replay.existingEventId, plan.eventId);

  const events = await readWakes(t, "obj_w3");
  assert.equal(events.length, 1, "one wake per logical request — never a twin");
  assert.equal(events[0].data.reason, "worker_resource_request");
  assert.equal(events[0].data.refId, "need_w3");
});

test("worker-result wake round-trips through shipped appendWakeEvent; a failed and a finished run are separate wakes", async () => {
  const t = convexTest(schema, modules);
  const done = planWakeForWorkerResult({
    objectiveKey: "obj_w4", runId: "run_w4", failed: false, spineCompleted: false, at: now,
  });
  const crashed = planWakeForWorkerResult({
    objectiveKey: "obj_w4", runId: "run_w4b", failed: true, spineCompleted: false, at: now,
  });
  assert.deepEqual(await append(t, done, "obj_w4"), { ok: true });
  assert.deepEqual(await append(t, crashed, "obj_w4"), { ok: true });
  // redelivery of the SAME finish collapses
  const replay = await append(t, done, "obj_w4");
  assert.equal(replay.duplicate, true);

  const events = await readWakes(t, "obj_w4");
  assert.equal(events.length, 2);
  const reasons = events.map((e) => e.data.reason).sort();
  assert.deepEqual(reasons, ["worker_failure", "worker_result"]);
});
