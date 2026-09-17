// R1 Blocker E — run lifecycle / lease fencing.
//
// These prove the decisions themselves. The Convex runtime imports the same
// pure guards, so what is tested here is what runs on the deployment: a run
// that is expired, replaced or already finalized cannot write and cannot
// finalize, and the execution budget always sits inside the lease.

import test from "node:test";
import assert from "node:assert/strict";
import {
  EXECUTION_TIMEOUT_MS,
  LEASE_MS,
  decideFinalization,
  fenceRunWrite,
  isRunActive,
} from "../lib/objective/runGuards";
import type { WorkerRun } from "../lib/objective/types";

const T0 = 1_700_000_000_000;

function run(overrides: Partial<WorkerRun> = {}): WorkerRun {
  return {
    id: "run_live",
    workItemId: "obj_1:wi-1",
    status: "running",
    startedAt: T0,
    leaseUntil: T0 + LEASE_MS,
    model: "operator-selected-model",
    modelSelectionReason: "deliberate",
    toolCalls: 0,
    summary: "",
    ...overrides,
  };
}

test("the worker execution budget is strictly inside the lease", () => {
  assert.ok(EXECUTION_TIMEOUT_MS < LEASE_MS);
  assert.ok(EXECUTION_TIMEOUT_MS > 0);
  // The abort must fire with real margin, not a hair before expiry.
  assert.ok(LEASE_MS - EXECUTION_TIMEOUT_MS >= 15_000);
});

test("a live, lease-holding run may write", () => {
  const fence = fenceRunWrite({ run: run(), runId: "run_live", now: T0 + 1000 });
  assert.equal(fence.ok, true);
  assert.equal(isRunActive({ run: run(), runId: "run_live", now: T0 + 1000 }), true);
});

test("lease expiry rejects writes", () => {
  // Exactly at expiry is already expired: the boundary is not generous.
  const atExpiry = fenceRunWrite({
    run: run(),
    runId: "run_live",
    now: T0 + LEASE_MS,
  });
  assert.equal(atExpiry.ok, false);
  assert.match(
    atExpiry.ok === false ? atExpiry.reason : "",
    /lease expired/,
  );

  assert.equal(
    isRunActive({ run: run(), runId: "run_live", now: T0 + LEASE_MS + 1 }),
    false,
  );
});

test("a stale/replaced run cannot write", () => {
  const fence = fenceRunWrite({
    run: run({ id: "run_replacement" }),
    runId: "run_live",
    now: T0 + 1000,
  });
  assert.equal(fence.ok, false);
  assert.match(
    fence.ok === false ? fence.reason : "",
    /not the active run.*run_replacement/,
  );
});

test("a stopped or failed run cannot write", () => {
  for (const status of ["stopped", "failed"] as const) {
    const fence = fenceRunWrite({
      run: run({ status }),
      runId: "run_live",
      now: T0 + 1000,
    });
    assert.equal(fence.ok, false, `${status} run must not write`);
    assert.match(fence.ok === false ? fence.reason : "", /not running/);
  }
});

test("an objective with no run cannot accept a run write", () => {
  for (const missing of [null, undefined]) {
    const fence = fenceRunWrite({
      run: missing,
      runId: "run_live",
      now: T0 + 1000,
    });
    assert.equal(fence.ok, false);
  }
});

test("an expired run cannot finalize", () => {
  const decision = decideFinalization({
    run: run(),
    runId: "run_live",
    now: T0 + LEASE_MS + 5,
    state: "executing",
  });
  assert.equal(decision.kind, "no-op");
  // A late writer must not be able to manufacture success.
  assert.equal(
    decision.kind === "no-op" ? decision.completed : true,
    false,
  );
});

test("an already-finished run cannot finalize again", () => {
  const decision = decideFinalization({
    run: run({ status: "stopped" }),
    runId: "run_live",
    now: T0 + 2000,
    state: "completed",
  });
  assert.equal(decision.kind, "no-op");
  // Double finalization is harmless: it reports the durable truth it found.
  assert.equal(
    decision.kind === "no-op" ? decision.completed : false,
    true,
  );
});

test("a replaced run cannot finalize a newer run", () => {
  const decision = decideFinalization({
    run: run({ id: "run_replacement", status: "running" }),
    runId: "run_live",
    now: T0 + 2000,
    state: "executing",
  });
  assert.equal(decision.kind, "no-op");
});

test("partial failure cannot be turned into success by a stale writer", () => {
  // The live run already failed durably; the old run finally returns.
  const failed = run({ id: "run_old", status: "failed" });
  const decision = decideFinalization({
    run: failed,
    runId: "run_old",
    now: T0 + 2000,
    state: "failed",
  });
  assert.equal(decision.kind, "no-op");
  assert.equal(
    decision.kind === "no-op" ? decision.completed : true,
    false,
  );
});

test("the live lease-holding run is the only one allowed to finalize", () => {
  const decision = decideFinalization({
    run: run(),
    runId: "run_live",
    now: T0 + 1000,
    state: "executing",
  });
  assert.equal(decision.kind, "finalize");
});
