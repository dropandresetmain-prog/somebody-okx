// Create Objective Product Command — Level 1/2/3 focused seam tests.
//
// On Reliability V7, createReceivedObjective schedules beginInterpretation →
// proposeInterpretation. These tests assert create persistence only, so timers
// are mocked (same pattern as v7ReviewR3InterpretationFence) so the model
// action chain does not auto-run or hang convex-test teardown.

import test, { mock, after as afterAll } from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { convexTest } from "convex-test";

import schema from "../convex/schema";
import { createObjectiveV1 } from "../convex/productCommands";
import { createReceivedObjective } from "../convex/objectiveCreate";
import { getStartCapabilitiesV1 } from "../convex/productWorkspace";
import { StartView } from "../app/start/StartView";
import type { ProductCommandResult, StartCapabilitiesView } from "../app/product/contracts";
import {
  CREATE_TRANSITION_ASSET,
  CREATE_TRANSITION_COPY,
  canSubmitCreate,
  objectiveWorkspaceHref,
  productErrorCopy,
  shouldShowSuccessTransition,
  transitionDurationMs,
  trimObjectiveRequest,
} from "../app/start/startCreateFlow";
import type { MutationCtx } from "../convex/_generated/server";

const __dirname = dirname(fileURLToPath(import.meta.url));

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
  "../convex/_generated/server.d.ts": () => import("../convex/_generated/server"),
  "../convex/_generated/dataModel.d.ts": () => import("../convex/_generated/dataModel"),
};

type Handler = { _handler: (ctx: unknown, args: Record<string, unknown>) => Promise<unknown> };
const call = (fn: unknown, ctx: unknown, args: Record<string, unknown>) =>
  (fn as Handler)._handler(ctx, args);

const VALID_REQUEST = "Fix our launch messaging and prepare a relaunch pack.";

// ── Pure start-flow helpers ──────────────────────────────────────────────────

test("startCreateFlow: trims, gates submit, and maps navigation/transition", () => {
  assert.equal(trimObjectiveRequest("  hello world  "), "hello world");
  assert.equal(canSubmitCreate("short", true, false), false);
  assert.equal(canSubmitCreate(VALID_REQUEST, true, false), true);
  assert.equal(canSubmitCreate(VALID_REQUEST, true, true), false);
  assert.equal(canSubmitCreate(VALID_REQUEST, false, false), false);
  assert.equal(objectiveWorkspaceHref("obj_1"), "/?objective=obj_1");
  assert.equal(
    shouldShowSuccessTransition({ accepted: true, commandId: "create:x", objectiveId: "x" }),
    true,
  );
  assert.equal(
    shouldShowSuccessTransition({
      accepted: false,
      error: { code: "validation_error", message: "nope" },
    }),
    false,
  );
  assert.equal(transitionDurationMs(false), 800);
  assert.equal(transitionDurationMs(true), 0);
  assert.equal(CREATE_TRANSITION_ASSET, "/mascot/duo/duo-walking-transparent.webp");
  assert.equal(CREATE_TRANSITION_COPY, "Somebody is on it.");
  assert.match(productErrorCopy({ code: "validation_error", message: "bounded" }), /bounded/);
  assert.match(productErrorCopy({ code: "not_allowed", message: "no" }), /no/);
  assert.match(
    productErrorCopy({ code: "temporarily_unavailable", message: "later" }),
    /later/,
  );
});

// ── Start capabilities ───────────────────────────────────────────────────────

test("getStartCapabilitiesV1 advertises Create Objective only", async () => {
  const t = convexTest(schema, modules);
  const result = (await t.query(async (ctx) =>
    call(getStartCapabilitiesV1, ctx, {}),
  )) as { found: boolean; view: StartCapabilitiesView };
  assert.equal(result.found, true);
  assert.deepEqual(result.view, {
    canCreateObjective: true,
    supportsContextRefs: false,
    supportsAttachments: false,
    advanced: { spendLimit: false, deadline: false, externalEffectPolicy: false },
  });
});

// ── Authoritative create primitive ───────────────────────────────────────────

test("createReceivedObjective: persists received row, event, schedules interpretation", async () => {
  const inserts: Array<{ table: string; doc: Record<string, unknown> }> = [];
  const scheduled: Array<{ ms: number; args: Record<string, unknown> }> = [];
  const ctx = {
    db: {
      insert: async (table: string, doc: Record<string, unknown>) => {
        inserts.push({ table, doc });
        return "id" as never;
      },
    },
    scheduler: {
      runAfter: async (ms: number, _ref: unknown, args: Record<string, unknown>) => {
        scheduled.push({ ms, args });
        return "jid" as never;
      },
    },
  };

  const { key } = await createReceivedObjective(ctx as unknown as MutationCtx, VALID_REQUEST);
  assert.match(key, /^obj_\d+_[a-z0-9]+$/);
  assert.equal(inserts.length, 2);
  assert.equal(inserts[0].table, "objectives");
  assert.equal((inserts[0].doc.data as { state: string; request: string }).state, "received");
  assert.equal((inserts[0].doc.data as { request: string }).request, VALID_REQUEST);
  assert.equal(inserts[1].table, "objectiveEvents");
  assert.equal((inserts[1].doc.data as { text: string }).text, "Objective received.");
  assert.equal(scheduled.length, 1);
  assert.equal(scheduled[0].ms, 0);
  assert.equal(scheduled[0].args.objectiveKey, key);
});

// ── createObjectiveV1 seam ───────────────────────────────────────────────────

test("createObjectiveV1: valid request creates one Objective with authoritative semantics", async () => {
  const t = convexTest(schema, modules);

  const result = (await t.mutation(async (ctx) =>
    call(createObjectiveV1, ctx, { request: `  ${VALID_REQUEST}  ` }),
  )) as ProductCommandResult;

  assert.equal(result.accepted, true);
  if (!result.accepted) return;
  assert.equal(result.commandId, `create:${result.objectiveId}`);
  assert.match(result.objectiveId, /^obj_\d+_[a-z0-9]+$/);
  // Success means creation accepted — not completion/work-start.
  assert.ok(!("status" in result));
  assert.ok(!("completed" in result));

  const rows = await t.run(async (ctx) => ctx.db.query("objectives").collect());
  assert.equal(rows.length, 1);
  const row = rows[0] as {
    key: string;
    data: { key: string; request: string; state: string; activity: string };
  };
  assert.equal(row.key, result.objectiveId);
  assert.equal(row.data.key, result.objectiveId);
  assert.equal(row.data.request, VALID_REQUEST, "request must be trimmed");
  assert.equal(row.data.state, "received");
  assert.equal(row.data.activity, "Objective received.");

  const events = await t.run(async (ctx) =>
    ctx.db
      .query("objectiveEvents")
      .withIndex("by_objectiveKey", (q) => q.eq("objectiveKey", result.objectiveId))
      .collect(),
  );
  assert.equal(events.length, 1);
  const ev = events[0] as { data: { kind: string; text: string } };
  assert.equal(ev.data.kind, "system");
  assert.equal(ev.data.text, "Objective received.");
});

test("createObjectiveV1: short and long requests fail as validation_error", async () => {
  const t = convexTest(schema, modules);
  const short = (await t.mutation(async (ctx) =>
    call(createObjectiveV1, ctx, { request: "short" }),
  )) as ProductCommandResult;
  assert.equal(short.accepted, false);
  if (short.accepted) return;
  assert.equal(short.error.code, "validation_error");

  const long = (await t.mutation(async (ctx) =>
    call(createObjectiveV1, ctx, { request: "x".repeat(2001) }),
  )) as ProductCommandResult;
  assert.equal(long.accepted, false);
  if (long.accepted) return;
  assert.equal(long.error.code, "validation_error");

  const rows = await t.run(async (ctx) => ctx.db.query("objectives").collect());
  assert.equal(rows.length, 0);
});

test("createObjectiveV1: unsupported context/advanced options are not_allowed", async () => {
  const t = convexTest(schema, modules);
  const withRefs = (await t.mutation(async (ctx) =>
    call(createObjectiveV1, ctx, { request: VALID_REQUEST, contextRefs: ["doc_1"] }),
  )) as ProductCommandResult;
  assert.equal(withRefs.accepted, false);
  if (!withRefs.accepted) assert.equal(withRefs.error.code, "not_allowed");

  const withAdvanced = (await t.mutation(async (ctx) =>
    call(createObjectiveV1, ctx, {
      request: VALID_REQUEST,
      advanced: { spendLimit: { amount: "10", currency: "USD" } },
    }),
  )) as ProductCommandResult;
  assert.equal(withAdvanced.accepted, false);
  if (!withAdvanced.accepted) assert.equal(withAdvanced.error.code, "not_allowed");

  const withEmptyAdvanced = (await t.mutation(async (ctx) =>
    call(createObjectiveV1, ctx, { request: VALID_REQUEST, advanced: {} }),
  )) as ProductCommandResult;
  assert.equal(withEmptyAdvanced.accepted, false);
  if (!withEmptyAdvanced.accepted) assert.equal(withEmptyAdvanced.error.code, "not_allowed");

  const rows = await t.run(async (ctx) => ctx.db.query("objectives").collect());
  assert.equal(rows.length, 0);
});

// ── Frontend StartView ───────────────────────────────────────────────────────

const CAN_CREATE: StartCapabilitiesView = {
  canCreateObjective: true,
  supportsContextRefs: false,
  supportsAttachments: false,
  advanced: { spendLimit: false, deadline: false, externalEffectPolicy: false },
};

test("StartView: textarea enabled when canCreateObjective=true; unsupported controls hidden", () => {
  const html = renderToStaticMarkup(createElement(StartView, { capabilities: CAN_CREATE }));
  const textarea = html.match(/<textarea[^>]*>/)?.[0] ?? "";
  assert.ok(!/disabled/.test(textarea), "textarea must be enabled");
  assert.ok(html.includes('data-can-create="true"'));
  assert.ok(!html.includes("Context"));
  assert.ok(!html.includes("Attachments"));
  assert.ok(!html.includes("Spend limit"));
  assert.ok(!html.includes("Deadline"));
  assert.ok(!html.includes("External effect policy"));
  const btn = html.match(/<button[^>]*data-start-submit="true"[^>]*>/)?.[0] ?? "";
  assert.ok(/disabled/.test(btn), "empty request must not submit");
});

test("StartView: capabilities loading keeps create gated", () => {
  const html = renderToStaticMarkup(createElement(StartView, { capabilities: null }));
  const textarea = html.match(/<textarea[^>]*>/)?.[0] ?? "";
  assert.ok(/disabled/.test(textarea));
  assert.ok(html.includes("Checking what’s available"));
});

test("StartContainer wires product command only", () => {
  const src = readFileSync(join(__dirname, "..", "app", "start", "StartContainer.tsx"), "utf8");
  assert.ok(src.includes("api.productCommands.createObjectiveV1"));
  assert.ok(!src.includes("api.objectives.submitObjective"));
  assert.ok(!src.includes("api.internal"));
  const viewSrc = readFileSync(join(__dirname, "..", "app", "start", "StartView.tsx"), "utf8");
  assert.ok(viewSrc.includes('pose="walking"'));
  assert.ok(viewSrc.includes("CREATE_TRANSITION_COPY"));
});
