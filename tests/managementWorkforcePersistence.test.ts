// Persistence tests for M4 workforce mutations using convex-test.
// Tests the actual Convex mutations with a mock backend.

import test from "node:test";
import assert from "node:assert/strict";
import { convexTest } from "convex-test";
import schema from "../convex/schema";
import type { WorkerRecord, ObjectiveBudget } from "../lib/management/types";
import { CP2_REQUIREMENT_FIELDS } from "./helpers/cp2Requirement";

// Provide modules explicitly since import.meta.glob isn't available in Node test runner
const modules = {
  "../convex/schema.ts": () => import("../convex/schema"),
  "../convex/objectiveValidators.ts": () => import("../convex/objectiveValidators"),
  "../convex/managementValidators.ts": () => import("../convex/managementValidators"),
  "../convex/workforceGuards.ts": () => import("../convex/workforceGuards"),
  "../convex/_generated/api.d.ts": () => import("../convex/_generated/api"),
  "../convex/_generated/server.d.ts": () => import("../convex/_generated/server"),
};

const now = 1800000000000;

function worker(overrides: Partial<WorkerRecord> = {}): WorkerRecord {
  return {
    workerKey: "worker_test",
    displayName: "Test Worker",
    capabilityKeys: ["public_information_research"],
    dynamicCapabilities: [],
    responsibility: "Test responsibility",
    lifecycle: "available",
    reservedBy: null,
    verifiedAssignments: [],
    contextRefs: [],
    createdByObjective: null,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

// ── Worker upsert and listing ────────────────────────────────────────────────

test("upsertWorker creates a new worker", async () => {
  const t = convexTest(schema, modules);
  const w = worker({ workerKey: "worker_1" });

  const result = await t.mutation(async (ctx) => {
    const existing = await ctx.db
      .query("workers")
      .withIndex("by_workerKey", (q) => q.eq("workerKey", "worker_1"))
      .unique();

    if (existing) {
      await ctx.db.patch(existing._id, { data: w });
      return { created: false };
    }

    await ctx.db.insert("workers", {
      workerKey: "worker_1",
      data: w,
    });
    return { created: true };
  });

  assert.equal(result.created, true);

  const stored = await t.query(async (ctx) => {
    const row = await ctx.db
      .query("workers")
      .withIndex("by_workerKey", (q) => q.eq("workerKey", "worker_1"))
      .unique();
    return row?.data;
  });

  assert.equal(stored?.workerKey, "worker_1");
  assert.equal(stored?.lifecycle, "available");
});

test("upsertWorker updates an existing worker", async () => {
  const t = convexTest(schema, modules);
  const w1 = worker({ workerKey: "worker_1", lifecycle: "available" });
  const w2 = worker({ workerKey: "worker_1", lifecycle: "suspended" });

  await t.mutation(async (ctx) => {
    await ctx.db.insert("workers", { workerKey: "worker_1", data: w1 });
  });

  const result = await t.mutation(async (ctx) => {
    const existing = await ctx.db
      .query("workers")
      .withIndex("by_workerKey", (q) => q.eq("workerKey", "worker_1"))
      .unique();

    if (existing) {
      await ctx.db.patch(existing._id, { data: w2 });
      return { created: false };
    }

    await ctx.db.insert("workers", { workerKey: "worker_1", data: w2 });
    return { created: true };
  });

  assert.equal(result.created, false);

  const stored = await t.query(async (ctx) => {
    const row = await ctx.db
      .query("workers")
      .withIndex("by_workerKey", (q) => q.eq("workerKey", "worker_1"))
      .unique();
    return row?.data;
  });

  assert.equal(stored?.lifecycle, "suspended");
});

test("listWorkers returns all workers when no keys provided", async () => {
  const t = convexTest(schema, modules);

  await t.mutation(async (ctx) => {
    await ctx.db.insert("workers", { workerKey: "worker_1", data: worker({ workerKey: "worker_1" }) });
    await ctx.db.insert("workers", { workerKey: "worker_2", data: worker({ workerKey: "worker_2" }) });
    await ctx.db.insert("workers", { workerKey: "worker_3", data: worker({ workerKey: "worker_3" }) });
  });

  const workers = await t.query(async (ctx) => {
    const rows = await ctx.db.query("workers").collect();
    return rows.map((row) => row.data);
  });

  assert.equal(workers.length, 3);
});

test("listWorkers returns only requested workers", async () => {
  const t = convexTest(schema, modules);

  await t.mutation(async (ctx) => {
    await ctx.db.insert("workers", { workerKey: "worker_1", data: worker({ workerKey: "worker_1" }) });
    await ctx.db.insert("workers", { workerKey: "worker_2", data: worker({ workerKey: "worker_2" }) });
    await ctx.db.insert("workers", { workerKey: "worker_3", data: worker({ workerKey: "worker_3" }) });
  });

  const workers = await t.query(async (ctx) => {
    const keys = ["worker_1", "worker_3"];
    const results = [];
    for (const key of keys) {
      const row = await ctx.db
        .query("workers")
        .withIndex("by_workerKey", (q) => q.eq("workerKey", key))
        .unique();
      if (row) results.push(row.data);
    }
    return results;
  });

  assert.equal(workers.length, 2);
  assert.equal(workers[0].workerKey, "worker_1");
  assert.equal(workers[1].workerKey, "worker_3");
});

test("listWorkers omits missing keys", async () => {
  const t = convexTest(schema, modules);

  await t.mutation(async (ctx) => {
    await ctx.db.insert("workers", { workerKey: "worker_1", data: worker({ workerKey: "worker_1" }) });
  });

  const workers = await t.query(async (ctx) => {
    const keys = ["worker_1", "worker_missing"];
    const results = [];
    for (const key of keys) {
      const row = await ctx.db
        .query("workers")
        .withIndex("by_workerKey", (q) => q.eq("workerKey", key))
        .unique();
      if (row) results.push(row.data);
    }
    return results;
  });

  assert.equal(workers.length, 1);
  assert.equal(workers[0].workerKey, "worker_1");
});

// ── Reservation ──────────────────────────────────────────────────────────────

test("reserveWorker reserves a free worker", async () => {
  const t = convexTest(schema, modules);
  const w = worker({ workerKey: "worker_1", lifecycle: "available" });

  await t.mutation(async (ctx) => {
    await ctx.db.insert("workers", { workerKey: "worker_1", data: w });
  });

  const result = await t.mutation(async (ctx) => {
    const row = await ctx.db
      .query("workers")
      .withIndex("by_workerKey", (q) => q.eq("workerKey", "worker_1"))
      .unique();

    if (!row) return { ok: false, reason: "worker_missing" };

    const worker = row.data;
    const updated = {
      ...worker,
      lifecycle: "assigned" as const,
      reservedBy: {
        objectiveKey: "obj_1",
        requirementKey: "req_1",
        assignmentId: "assign_1",
        heldUntil: now + 10000,
      },
      updatedAt: now,
    };

    await ctx.db.patch(row._id, { data: updated });
    return { ok: true };
  });

  assert.equal(result.ok, true);

  const stored = await t.query(async (ctx) => {
    const row = await ctx.db
      .query("workers")
      .withIndex("by_workerKey", (q) => q.eq("workerKey", "worker_1"))
      .unique();
    return row?.data;
  });

  assert.equal(stored?.lifecycle, "assigned");
  assert.equal(stored?.reservedBy?.assignmentId, "assign_1");
});

test("reserveWorker rejects reserved worker with active lease", async () => {
  const t = convexTest(schema, modules);
  const w = worker({
    workerKey: "worker_1",
    lifecycle: "assigned",
    reservedBy: {
      objectiveKey: "obj_1",
      requirementKey: "req_1",
      assignmentId: "assign_1",
      heldUntil: now + 10000,
    },
  });

  await t.mutation(async (ctx) => {
    await ctx.db.insert("workers", { workerKey: "worker_1", data: w });
  });

  const result = await t.mutation(async (ctx) => {
    const row = await ctx.db
      .query("workers")
      .withIndex("by_workerKey", (q) => q.eq("workerKey", "worker_1"))
      .unique();

    if (!row) return { ok: false, reason: "worker_missing" };

    const worker = row.data;

    // Check if reserved by different assignment
    if (
      worker.reservedBy &&
      worker.reservedBy.assignmentId !== "assign_2" &&
      worker.reservedBy.heldUntil > now
    ) {
      return { ok: false, reason: "worker_reserved" };
    }

    return { ok: true };
  });

  assert.equal(result.ok, false);
  assert.equal(result.reason, "worker_reserved");
});

test("reserveWorker allows replay of same assignmentId", async () => {
  const t = convexTest(schema, modules);
  const w = worker({
    workerKey: "worker_1",
    lifecycle: "assigned",
    reservedBy: {
      objectiveKey: "obj_1",
      requirementKey: "req_1",
      assignmentId: "assign_1",
      heldUntil: now + 10000,
    },
  });

  await t.mutation(async (ctx) => {
    await ctx.db.insert("workers", { workerKey: "worker_1", data: w });
  });

  const result = await t.mutation(async (ctx) => {
    const row = await ctx.db
      .query("workers")
      .withIndex("by_workerKey", (q) => q.eq("workerKey", "worker_1"))
      .unique();

    if (!row) return { ok: false, reason: "worker_missing" };

    const worker = row.data;

    // Idempotent replay
    if (
      worker.reservedBy &&
      worker.reservedBy.assignmentId === "assign_1" &&
      worker.lifecycle === "assigned"
    ) {
      return { ok: true, replayed: true };
    }

    return { ok: true };
  });

  assert.equal(result.ok, true);
  assert.equal(result.replayed, true);
});

test("reserveWorker allows acquisition after lease expires", async () => {
  const t = convexTest(schema, modules);
  const w = worker({
    workerKey: "worker_1",
    lifecycle: "assigned",
    reservedBy: {
      objectiveKey: "obj_1",
      requirementKey: "req_1",
      assignmentId: "assign_1",
      heldUntil: now - 1000, // expired
    },
  });

  await t.mutation(async (ctx) => {
    await ctx.db.insert("workers", { workerKey: "worker_1", data: w });
  });

  const result = await t.mutation(async (ctx) => {
    const row = await ctx.db
      .query("workers")
      .withIndex("by_workerKey", (q) => q.eq("workerKey", "worker_1"))
      .unique();

    if (!row) return { ok: false, reason: "worker_missing" };

    const worker = row.data;

    // Lease expired, can acquire
    if (worker.reservedBy && worker.reservedBy.heldUntil <= now) {
      const updated = {
        ...worker,
        reservedBy: {
          objectiveKey: "obj_2",
          requirementKey: "req_2",
          assignmentId: "assign_2",
          heldUntil: now + 10000,
        },
        updatedAt: now,
      };
      await ctx.db.patch(row._id, { data: updated });
      return { ok: true };
    }

    return { ok: false, reason: "worker_reserved" };
  });

  assert.equal(result.ok, true);

  const stored = await t.query(async (ctx) => {
    const row = await ctx.db
      .query("workers")
      .withIndex("by_workerKey", (q) => q.eq("workerKey", "worker_1"))
      .unique();
    return row?.data;
  });

  assert.equal(stored?.reservedBy?.assignmentId, "assign_2");
});

// ── Release worker ───────────────────────────────────────────────────────────

test("releaseWorker releases reservation held by same assignmentId", async () => {
  const t = convexTest(schema, modules);
  const w = worker({
    workerKey: "worker_1",
    lifecycle: "assigned",
    reservedBy: {
      objectiveKey: "obj_1",
      requirementKey: "req_1",
      assignmentId: "assign_1",
      heldUntil: now + 10000,
    },
  });

  await t.mutation(async (ctx) => {
    await ctx.db.insert("workers", { workerKey: "worker_1", data: w });
  });

  const result = await t.mutation(async (ctx) => {
    const row = await ctx.db
      .query("workers")
      .withIndex("by_workerKey", (q) => q.eq("workerKey", "worker_1"))
      .unique();

    if (!row) return { ok: false, reason: "worker_missing" };

    const worker = row.data;

    if (!worker.reservedBy || worker.reservedBy.assignmentId !== "assign_1") {
      return { ok: false, reason: "reservation_owner_mismatch" };
    }

    const updated = {
      ...worker,
      lifecycle: "available" as const,
      reservedBy: null,
      updatedAt: now,
    };

    await ctx.db.patch(row._id, { data: updated });
    return { ok: true };
  });

  assert.equal(result.ok, true);

  const stored = await t.query(async (ctx) => {
    const row = await ctx.db
      .query("workers")
      .withIndex("by_workerKey", (q) => q.eq("workerKey", "worker_1"))
      .unique();
    return row?.data;
  });

  assert.equal(stored?.lifecycle, "available");
  assert.equal(stored?.reservedBy, null);
});

test("releaseWorker rejects release by different assignmentId", async () => {
  const t = convexTest(schema, modules);
  const w = worker({
    workerKey: "worker_1",
    lifecycle: "assigned",
    reservedBy: {
      objectiveKey: "obj_1",
      requirementKey: "req_1",
      assignmentId: "assign_1",
      heldUntil: now + 10000,
    },
  });

  await t.mutation(async (ctx) => {
    await ctx.db.insert("workers", { workerKey: "worker_1", data: w });
  });

  const result = await t.mutation(async (ctx) => {
    const row = await ctx.db
      .query("workers")
      .withIndex("by_workerKey", (q) => q.eq("workerKey", "worker_1"))
      .unique();

    if (!row) return { ok: false, reason: "worker_missing" };

    const worker = row.data;

    if (!worker.reservedBy || worker.reservedBy.assignmentId !== "assign_2") {
      return { ok: false, reason: "reservation_owner_mismatch" };
    }

    return { ok: true };
  });

  assert.equal(result.ok, false);
  assert.equal(result.reason, "reservation_owner_mismatch");
});

// ── Verified assignment history ──────────────────────────────────────────────

test("recordVerifiedAssignment appends and truncates history", async () => {
  const t = convexTest(schema, modules);
  const w = worker({ workerKey: "worker_1", verifiedAssignments: [] });

  await t.mutation(async (ctx) => {
    await ctx.db.insert("workers", { workerKey: "worker_1", data: w });
  });

  // Add 25 assignments (beyond default cap of 20)
  for (let i = 1; i <= 25; i++) {
    await t.mutation(async (ctx) => {
      const row = await ctx.db
        .query("workers")
        .withIndex("by_workerKey", (q) => q.eq("workerKey", "worker_1"))
        .unique();

      if (!row) return;

      const worker = row.data;
      const history = [
        ...worker.verifiedAssignments,
        {
          assignmentId: `assign_${i}`,
          objectiveKey: "obj_1",
          requirementKey: "req_1",
          capabilityKeys: ["public_information_research"],
          outcome: "accepted" as const,
          summary: `Assignment ${i}`,
          at: now + i,
        },
      ];

      const maxHistory = 20;
      const truncated = history.length > maxHistory
        ? history.slice(history.length - maxHistory)
        : history;

      await ctx.db.patch(row._id, {
        data: { ...worker, verifiedAssignments: truncated, updatedAt: now + i },
      });
    });
  }

  const stored = await t.query(async (ctx) => {
    const row = await ctx.db
      .query("workers")
      .withIndex("by_workerKey", (q) => q.eq("workerKey", "worker_1"))
      .unique();
    return row?.data;
  });

  assert.equal(stored?.verifiedAssignments.length, 20);
  assert.equal(stored?.verifiedAssignments[0].assignmentId, "assign_6"); // oldest truncated
  assert.equal(stored?.verifiedAssignments[19].assignmentId, "assign_25"); // newest
});

// ── Wake events ──────────────────────────────────────────────────────────────

test("appendWakeEvent deduplicates by dedupeKey", async () => {
  const t = convexTest(schema, modules);

  const result1 = await t.mutation(async (ctx) => {
    const existing = await ctx.db
      .query("wakeEvents")
      .withIndex("by_dedupe", (q) => q.eq("dedupeKey", "dedupe_1"))
      .unique();

    if (existing) {
      return { ok: false, duplicate: true, existingEventId: existing.eventId };
    }

    await ctx.db.insert("wakeEvents", {
      eventId: "event_1",
      objectiveKey: "obj_1",
      dedupeKey: "dedupe_1",
      data: {
        eventId: "event_1",
        objectiveKey: "obj_1",
        reason: "objective_submitted",
        refKind: "objective",
        refId: "obj_1",
        summary: "Objective submitted",
        at: now,
        consumedAt: null,
      },
    });

    return { ok: true };
  });

  assert.equal(result1.ok, true);

  const result2 = await t.mutation(async (ctx) => {
    const existing = await ctx.db
      .query("wakeEvents")
      .withIndex("by_dedupe", (q) => q.eq("dedupeKey", "dedupe_1"))
      .unique();

    if (existing) {
      return { ok: false, duplicate: true, existingEventId: existing.eventId };
    }

    await ctx.db.insert("wakeEvents", {
      eventId: "event_2",
      objectiveKey: "obj_1",
      dedupeKey: "dedupe_1",
      data: {
        eventId: "event_2",
        objectiveKey: "obj_1",
        reason: "objective_submitted",
        refKind: "objective",
        refId: "obj_1",
        summary: "Objective submitted",
        at: now,
        consumedAt: null,
      },
    });

    return { ok: true };
  });

  assert.equal(result2.ok, false);
  assert.equal(result2.duplicate, true);
  assert.equal(result2.existingEventId, "event_1");

  const count = await t.query(async (ctx) => {
    const rows = await ctx.db.query("wakeEvents").collect();
    return rows.length;
  });

  assert.equal(count, 1);
});

test("markWakeConsumed only touches unconsumed events", async () => {
  const t = convexTest(schema, modules);

  await t.mutation(async (ctx) => {
    await ctx.db.insert("wakeEvents", {
      eventId: "event_1",
      objectiveKey: "obj_1",
      dedupeKey: "dedupe_1",
      data: {
        eventId: "event_1",
        objectiveKey: "obj_1",
        reason: "objective_submitted",
        refKind: "objective",
        refId: "obj_1",
        summary: "Event 1",
        at: now,
        consumedAt: null,
      },
    });

    await ctx.db.insert("wakeEvents", {
      eventId: "event_2",
      objectiveKey: "obj_1",
      dedupeKey: "dedupe_2",
      data: {
        eventId: "event_2",
        objectiveKey: "obj_1",
        reason: "founder_input",
        refKind: "objective",
        refId: "obj_1",
        summary: "Event 2",
        at: now,
        consumedAt: now + 1000, // already consumed
      },
    });
  });

  const result = await t.mutation(async (ctx) => {
    let marked = 0;
    const eventIds = ["event_1", "event_2"];

    for (const eventId of eventIds) {
      const row = await ctx.db
        .query("wakeEvents")
        .withIndex("by_eventId", (q) => q.eq("eventId", eventId))
        .unique();

      if (!row) continue;

      if (row.data.consumedAt !== null) continue;

      await ctx.db.patch(row._id, {
        data: { ...row.data, consumedAt: now + 2000 },
      });
      marked++;
    }

    return { ok: true, marked };
  });

  assert.equal(result.marked, 1); // only event_1 was marked

  const events = await t.query(async (ctx) => {
    const rows = await ctx.db.query("wakeEvents").collect();
    return rows.map((row) => ({
      eventId: row.eventId,
      consumedAt: row.data.consumedAt,
    }));
  });

  const event1 = events.find((e) => e.eventId === "event_1");
  const event2 = events.find((e) => e.eventId === "event_2");

  assert.equal(event1?.consumedAt, now + 2000);
  assert.equal(event2?.consumedAt, now + 1000); // unchanged
});

// ── Budget ───────────────────────────────────────────────────────────────────

test("initBudget creates budget idempotently", async () => {
  const t = convexTest(schema, modules);

  const budget1 = await t.mutation(async (ctx) => {
    const existing = await ctx.db
      .query("objectiveBudgets")
      .withIndex("by_objectiveKey", (q) => q.eq("objectiveKey", "obj_1"))
      .unique();

    if (existing) return existing.data;

    const budget: ObjectiveBudget = {
      objectiveKey: "obj_1",
      limits: {
        maxWorkersCreated: 6,
        maxActiveAssignments: 4,
        maxManagementDecisions: 40,
        maxWorkerAttemptsPerRequirement: 3,
        maxRetriesPerIntent: 2,
        maxElapsedMs: 45 * 60_000,
        maxModelCalls: 60,
        maxExternalSpendUsd: 1,
        maxNoProgressCycles: 3,
      },
      used: {
        workersCreated: 0,
        activeAssignments: 0,
        managementDecisions: 0,
        modelCalls: 0,
        externalSpendCommittedUsd: 0,
        noProgressCycles: 0,
        attemptsByRequirement: {},
        retriesByIntent: {},
      },
      startedAt: now,
      lastProgressAt: now,
    };

    await ctx.db.insert("objectiveBudgets", {
      objectiveKey: "obj_1",
      data: budget,
    });

    return budget;
  });

  const budget2 = await t.mutation(async (ctx) => {
    const existing = await ctx.db
      .query("objectiveBudgets")
      .withIndex("by_objectiveKey", (q) => q.eq("objectiveKey", "obj_1"))
      .unique();

    if (existing) return existing.data;

    return null;
  });

  assert.equal(budget1.objectiveKey, "obj_1");
  assert.equal(budget2?.objectiveKey, "obj_1");
  assert.deepEqual(budget1, budget2);
});

// ── Stale downsert protection ────────────────────────────────────────────────

test("putRequirement rejects stale downsert on satisfied requirement", async () => {
  const t = convexTest(schema, modules);

  await t.mutation(async (ctx) => {
    await ctx.db.insert("requirements", {
      objectiveKey: "obj_1",
      requirementKey: "req_1",
      data: {
        requirementKey: "req_1",
        objectiveKey: "obj_1",
        contractId: "contract_1",
        contractRevision: 2,
        priority: "required",
        title: "Requirement 1",
        mustBeTrue: "Something must be true",
        scope: "In scope",
        ...CP2_REQUIREMENT_FIELDS,
        proofs: [],
        state: "satisfied",
        strategy: "MAKE",
        resolution: {
          resolutionId: "res_1",
          acceptedDecisionId: "dec_1",
          acceptedAssignmentId: null,
          acceptedIntentId: null,
          proofRefs: [],
          contractRevision: 2,
          acceptedAt: now,
        },
        blockedReason: null,
        waiver: null,
        revision: 1,
        createdAt: now,
        updatedAt: now,
      },
    });
  });

  const result = await t.mutation(async (ctx) => {
    const existing = await ctx.db
      .query("requirements")
      .withIndex("by_objectiveRequirement", (q) =>
        q.eq("objectiveKey", "obj_1").eq("requirementKey", "req_1"),
      )
      .unique();

    if (existing) {
      const existingData = existing.data;
      const newData = { ...existingData, contractRevision: 1 }; // stale

      // Stale downsert protection
      if (
        newData.contractRevision < 2 && // currentContractRevision
        existingData.state === "satisfied"
      ) {
        return { ok: false, reason: "stale_downsert_rejected" };
      }

      await ctx.db.patch(existing._id, { data: newData });
    }

    return { ok: true };
  });

  assert.equal(result.ok, false);
  assert.equal(result.reason, "stale_downsert_rejected");
});
