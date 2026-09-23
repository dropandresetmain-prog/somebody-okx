// M2-J — V6 preservation + bounded reads + control-note retention (focused).
//
// V6 contract preservation: the product list envelope (grouped
// needsYou/done/inProgress summaries) must keep its exact shape — the bounded
// read may only LIMIT which rows enter it, never change what a row looks like
// or how groups are derived (existing seam tests cover shape; this file covers
// the bound itself).
//
// Bounded read: getObjectiveListV1 previously collected EVERY objectives row —
// each carrying its full management state — to render ≤20 navigation
// summaries. It now uses the same indexed by_updatedAt desc/take discipline as
// `listObjectives` (tests/listObjectivesBounded), so table growth can never
// turn the product home screen into a full-table scan.
//
// Control-note retention: `boundNotes` must keep the note whose identity
// re-occurs (replace-in-place advancing `at`, position preserved), so a
// repeatedly-passed state does not evict its own history slot, while genuinely
// distinct identities still trim oldest-first at the ceiling.
import test from "node:test";
import assert from "node:assert/strict";
import { convexTest } from "convex-test";
import schema from "../convex/schema";
import { getObjectiveListV1 } from "../convex/productWorkspace";
import { boundNotes, CONTROL_NOTE_LIMIT } from "../convex/management";

const modules = {
  "../convex/schema.ts": () => import("../convex/schema"),
  "../convex/objectiveValidators.ts": () => import("../convex/objectiveValidators"),
  "../convex/objectives.ts": () => import("../convex/objectives"),
  "../convex/productWorkspace.ts": () => import("../convex/productWorkspace"),
  "../convex/managementValidators.ts": () => import("../convex/managementValidators"),
  "../convex/management.ts": () => import("../convex/management"),
  "../convex/_generated/api.d.ts": () => import("../convex/_generated/api"),
  "../convex/_generated/server.d.ts": () => import("../convex/_generated/server"),
};

const now = 1840000000000;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Loose = Record<string, any>;

type Handler = { _handler: (ctx: unknown, args: Record<string, unknown>) => Promise<unknown> };

async function seed(t: ReturnType<typeof convexTest>, key: string, updatedAt: number) {
  await t.mutation(async (ctx) => {
    await ctx.db.insert("objectives", {
      key,
      data: {
        key,
        request: `Objective ${key}`,
        createdAt: updatedAt,
        updatedAt,
        state: "executing",
        activity: "working",
        plan: null,
        workItems: [],
        run: null,
        result: null,
        management: { contractId: null, controlNotes: [{ type: "control_state", state: "executing", summary: `pass ${key}`, at: updatedAt }] },
      } as never,
    });
  });
}

test("J1: getObjectiveListV1 reads a bounded, indexed window — exactly the 20 most-recent objectives, newest first", async () => {
  const t = convexTest(schema, modules);
  const total = 26; // > window on every side
  const keys: string[] = [];
  for (let i = 0; i < total; i += 1) keys.push(`obj_j_${String(i).padStart(2, "0")}`);
  for (const [i, key] of keys.entries()) await seed(t, key, now + i);

  const result = (await t.query(async (ctx) =>
    (getObjectiveListV1 as unknown as Handler)._handler(ctx, {}))) as Loose;

  // Envelope contract preserved exactly (same keys, same grouping surface).
  assert.equal(result.found, true);
  assert.equal(result.contractVersion, 1);
  assert.equal(typeof result.viewRevision, "string");
  const view = result.view;
  assert.deepEqual(Object.keys(view).sort(), ["done", "inProgress", "needsYou"]);

  const all = [...view.needsYou, ...view.done, ...view.inProgress];
  assert.equal(all.length, 20, "the window is 20 regardless of table size (26 seeded)");
  const expected = keys.slice(6).reverse(); // 20 most recent, newest first
  assert.deepEqual(view.inProgress.map((row: Loose) => row.id), expected);
  // Summary row shape is the untouched V6 contract — the bound changed only
  // WHICH rows are visible, never what a row carries.
  for (const row of all) {
    assert.deepEqual(Object.keys(row).sort(), ["hasAttention", "id", "status", "statusLabel", "title", "updatedAt"]);
  }
  // A full workspace read for ANY objective (even one outside the list window)
  // remains legal: the list bound is a navigation-window bound, not a truth
  // bound.
  const { getObjectiveWorkspaceV1 } = await import("../convex/productWorkspace");
  const workspace = (await t.query(async (ctx) =>
    (getObjectiveWorkspaceV1 as unknown as Handler)._handler(ctx, { objectiveKey: keys[0] }))) as Loose;
  assert.equal(workspace.found, true, "the oldest objective is out of the LIST window but its workspace still reads fine");
  assert.equal(workspace.view.objective.id, keys[0]);
});

test("J2: control-note retention — same identity replaces in place (position + history survive; only `at` advances)", () => {
  let notes: Loose[] = [];
  for (let pass = 0; pass < 5; pass += 1) {
    // Interleave a distinct identity so replace-in-place can't hide behind an
    // append-only list: the control_state note must hold slot 0 every pass.
    notes = boundNotes(notes, { type: "control_state", state: "executing", summary: `pass ${pass}`, at: now + pass * 10 });
    notes = boundNotes(notes, { type: "wake_scheduled", reason: `dispatch ${pass}`, timerKey: `timer_${pass}`, at: now + pass * 10 + 5 });
  }
  const controlStates = notes.filter((n) => n.type === "control_state");
  assert.equal(controlStates.length, 1, "the recurring identity is ONE note, not five");
  assert.equal(controlStates[0].summary, "pass 4", "the latest meaning is retained");
  assert.equal(controlStates[0].at, now + 40, "only the timestamp advanced");
  assert.equal(notes[0].type, "control_state", "replace-in-place preserved the slot-0 position");
  assert.equal(controlStates[0], notes[0], "the merged note IS the retained slot");
  assert.equal(notes.length, 6, "1 merged control_state + 5 distinct wake identities (each pass's wake is its own identity)");
});

test("J3: control-note ceiling keeps the NEWEST retention window and evicts oldest distinct identities first", () => {
  let notes: Loose[] = [];
  const total = CONTROL_NOTE_LIMIT + 12;
  for (let i = 0; i < total; i += 1) {
    notes = boundNotes(notes, { type: "pending_approval", question: `q ${i}`, at: now + i });
    // Keep re-asserting a stable control_state so the trim cannot clobber the
    // retained current-state note.
    notes = boundNotes(notes, { type: "control_state", state: "executing", summary: `pass ${i}`, at: now + i });
  }
  assert.equal(notes.length, CONTROL_NOTE_LIMIT, "aggregate growth is hard-capped");
  const questions = notes.filter((n) => n.type === "pending_approval").map((n) => n.question);
  assert.ok(!questions.includes("q 0"), "oldest distinct identity was evicted");
  assert.ok(questions.includes(`q ${total - 1}`), "newest distinct identity survived");
  const control = notes.filter((n) => n.type === "control_state");
  assert.equal(control.length, 1);
  assert.equal(control[0].summary, `pass ${total - 1}`, "current-state retention survives ceiling pressure");
});
