// Prevents repeated successful fetches of the same public URL within one
// worker run. read_public_web must not let the model burn turns/network by
// re-reading an already-observed page with only a cosmetic `focus` change:
// the application must refuse the repeat as a deterministic no-op (no
// network fetch, no second evidence row) and point back at the existing
// observation. This exercises the real record_observation handler in
// convex/objectiveRunner.ts through the real Convex port, not a mock.
import test from "node:test";
import assert from "node:assert/strict";
import { convexTest } from "convex-test";
import schema from "../convex/schema";
import { makeConvexPort } from "../convex/objectiveRunner";
import { createWorkContract, createWorkerSpec } from "../lib/workforce";

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

const now = 1_984_100_000_000;
type Backend = ReturnType<typeof convexTest>;

async function seedReadingAssignment(t: Backend, key: string, runId: string) {
  const workContract = createWorkContract({
    assignment: "Research the target company from public sources",
    idempotencyScope: `${key}:run`,
    worker: createWorkerSpec(["public_information_research"]),
    sourceProofs: [{ sourceClass: "public_web", minDistinctSources: 1 }],
    inputEvidenceIds: [],
  });

  await t.mutation(async (ctx) => {
    await ctx.db.insert("objectives", {
      key,
      data: {
        key,
        request: "research target company",
        createdAt: now,
        updatedAt: now,
        state: "executing",
        activity: "running",
        plan: null,
        workItems: [
          {
            id: "wi_research",
            objectiveKey: key,
            title: "research",
            assignment: workContract.assignment,
            workerKey: workContract.workerKey,
            state: "running",
            contract: workContract,
            runs: [
              {
                id: runId,
                workItemId: "wi_research",
                status: "running",
                startedAt: now,
                leaseUntil: now + 120_000,
                model: "mock",
                modelSelectionReason: "test",
                toolCalls: 0,
                summary: "",
              },
            ],
          },
        ],
        run: {
          id: runId,
          workItemId: "wi_research",
          status: "running",
          startedAt: now,
          leaseUntil: now + 120_000,
          model: "mock",
          modelSelectionReason: "test",
          toolCalls: 0,
          summary: "",
        },
        result: null,
        companyArtifacts: [],
      } as never,
    });
  });
}

/** Traps global fetch: counts calls per URL and serves deterministic HTML. */
function trapFetch() {
  const original = globalThis.fetch;
  const callsByUrl = new Map<string, number>();
  let totalCalls = 0;
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url = String(input);
    totalCalls += 1;
    callsByUrl.set(url, (callsByUrl.get(url) ?? 0) + 1);
    return {
      ok: true,
      status: 200,
      url,
      text: async () => `<html><body>Content for ${url}</body></html>`,
    } as Response;
  }) as typeof fetch;
  return {
    callsByUrl,
    totalCalls: () => totalCalls,
    restore: () => {
      globalThis.fetch = original;
    },
  };
}

async function evidenceRows(t: Backend, key: string) {
  return t.query(async (ctx) => {
    const rows = await ctx.db
      .query("evidence")
      .withIndex("by_objectiveKey", (q) => q.eq("objectiveKey", key))
      .collect();
    return rows.map((r) => r.data);
  });
}

test("read_public_web: first read fetches and records evidence", async () => {
  const t = convexTest(schema, modules);
  const key = "obj_dup_first";
  const runId = "run_dup_first";
  await seedReadingAssignment(t, key, runId);
  const trap = trapFetch();
  try {
    const raw = await t.action(async (ctx) => {
      const port = makeConvexPort(ctx, key, runId, true);
      return port.act({
        type: "record_observation",
        source: "public_web",
        label: "Public page: overview",
        url: "https://example.com/company",
      });
    });
    // A fresh successful read is wrapped as {status:"accepted", result:
    // "Observation recorded..."} — distinct from the typed idempotent_replay
    // envelope used for a blocked duplicate.
    const parsedFirst = JSON.parse(String(raw)) as { status?: string; result?: string };
    assert.equal(parsedFirst.status, "accepted");
    assert.match(String(parsedFirst.result), /^Observation recorded/);
    assert.equal(trap.totalCalls(), 1, "first read must perform exactly one fetch");
    const rows = await evidenceRows(t, key);
    const publicRows = rows.filter((r: any) => r.sourceClass === "public_web");
    assert.equal(publicRows.length, 1);
  } finally {
    trap.restore();
  }
});

test("read_public_web: second read of the same URL (different focus) performs no fetch and returns the prior evidence", async () => {
  const t = convexTest(schema, modules);
  const key = "obj_dup_second";
  const runId = "run_dup_second";
  await seedReadingAssignment(t, key, runId);
  const trap = trapFetch();
  try {
    const first = await t.action(async (ctx) => {
      const port = makeConvexPort(ctx, key, runId, true);
      return port.act({
        type: "record_observation",
        source: "public_web",
        label: "Public page: overview",
        url: "https://example.com/company",
      });
    });
    assert.equal(trap.totalCalls(), 1);

    const secondRaw = await t.action(async (ctx) => {
      const port = makeConvexPort(ctx, key, runId, true);
      return port.act({
        type: "record_observation",
        source: "public_web",
        label: "Public page: pricing angle",
        url: "https://example.com/company",
      });
    });
    const second = JSON.parse(secondRaw as string) as {
      status?: string;
      evidenceId?: string;
      duplicateOfUrl?: boolean;
    };

    assert.equal(trap.totalCalls(), 1, "the duplicate read must not perform a second fetch");
    assert.equal(second.status, "idempotent_replay");
    assert.equal(second.duplicateOfUrl, true);
    assert.ok(second.evidenceId, "duplicate response must reference the prior evidence id");

    const rows = await evidenceRows(t, key);
    const publicRows = rows.filter((r: any) => r.sourceClass === "public_web");
    assert.equal(
      publicRows.length,
      1,
      "the duplicate read must not create a second evidence/observation row",
    );
    void first;
  } finally {
    trap.restore();
  }
});

test("read_public_web: a fragment-only variant of an already-read URL is treated as the same page", async () => {
  const t = convexTest(schema, modules);
  const key = "obj_dup_fragment";
  const runId = "run_dup_fragment";
  await seedReadingAssignment(t, key, runId);
  const trap = trapFetch();
  try {
    await t.action(async (ctx) => {
      const port = makeConvexPort(ctx, key, runId, true);
      return port.act({
        type: "record_observation",
        source: "public_web",
        label: "Public page: overview",
        url: "https://example.com/company",
      });
    });
    assert.equal(trap.totalCalls(), 1);

    const secondRaw = await t.action(async (ctx) => {
      const port = makeConvexPort(ctx, key, runId, true);
      return port.act({
        type: "record_observation",
        source: "public_web",
        label: "Public page: same page, different fragment",
        url: "https://example.com/company#team",
      });
    });
    const second = JSON.parse(secondRaw as string) as { status?: string };

    assert.equal(trap.totalCalls(), 1, "URL#fragment must not trigger a second fetch");
    assert.equal(second.status, "idempotent_replay");

    const rows = await evidenceRows(t, key);
    const publicRows = rows.filter((r: any) => r.sourceClass === "public_web");
    assert.equal(publicRows.length, 1);
  } finally {
    trap.restore();
  }
});

test("read_public_web: a genuinely different path on the same host is not blocked", async () => {
  const t = convexTest(schema, modules);
  const key = "obj_dup_distinct";
  const runId = "run_dup_distinct";
  await seedReadingAssignment(t, key, runId);
  const trap = trapFetch();
  try {
    await t.action(async (ctx) => {
      const port = makeConvexPort(ctx, key, runId, true);
      return port.act({
        type: "record_observation",
        source: "public_web",
        label: "Public page: overview",
        url: "https://example.com/company",
      });
    });
    assert.equal(trap.totalCalls(), 1);

    const secondRaw = await t.action(async (ctx) => {
      const port = makeConvexPort(ctx, key, runId, true);
      return port.act({
        type: "record_observation",
        source: "public_web",
        label: "Public page: pricing",
        url: "https://example.com/pricing",
      });
    });

    assert.equal(trap.totalCalls(), 2, "a distinct path must be fetched normally");
    const parsedSecond = JSON.parse(String(secondRaw)) as { status?: string; result?: string };
    assert.equal(parsedSecond.status, "accepted");
    assert.match(String(parsedSecond.result), /^Observation recorded/);

    const rows = await evidenceRows(t, key);
    const publicRows = rows.filter((r: any) => r.sourceClass === "public_web");
    assert.equal(publicRows.length, 2, "distinct URLs must each create their own evidence row");
  } finally {
    trap.restore();
  }
});
