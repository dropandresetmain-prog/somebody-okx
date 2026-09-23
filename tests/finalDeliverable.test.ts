// Final Deliverable — pure render tests (post-founder-live-run Incident #2:
// a completed Objective's governed final artifact must be unmistakable, not
// buried in the right-rail Deliverables card). Uses ONLY the existing
// DeliverableView/ObjectiveWorkspaceView projection shapes (app/product/
// contracts.ts) — renderToStaticMarkup, no Convex, no runtime — mirroring the
// pattern in tests/v6ProductWorkspace.test.ts.

import test from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { DeliverableView, ObjectiveView, ObjectiveWorkspaceView, SomebodyNowView } from "../app/product/contracts";
import { FinalDeliverable } from "../app/product/components/FinalDeliverable";
import { Deliverables } from "../app/product/components/Deliverables";
import { V6WorkspaceView, type MainPaneState } from "../app/product/V6WorkspaceView";

const NOW = 1_820_000_000_000;

function objective(over: Partial<ObjectiveView> = {}): ObjectiveView {
  return {
    id: "obj_1",
    title: "Ship the launch page",
    request: "Ship the launch page by Friday.",
    status: "working",
    createdAt: NOW - 100_000,
    updatedAt: NOW,
    ...over,
  };
}

function somebodyNow(over: Partial<SomebodyNowView> = {}): SomebodyNowView {
  return { state: "working", headline: "Working on it", detail: "An intern is doing bounded work.", updatedAt: NOW, ...over };
}

function deliverable(over: Partial<DeliverableView> = {}): DeliverableView {
  return {
    id: "d1",
    title: "Relaunch recommendation",
    type: "document",
    version: 1,
    status: "current",
    updatedAt: NOW,
    ...over,
  };
}

function workspace(over: Partial<ObjectiveWorkspaceView> = {}): ObjectiveWorkspaceView {
  return {
    objective: objective(),
    progress: { checkpoints: [] },
    somebodyNow: somebodyNow(),
    currentWork: null,
    activity: [],
    deliverables: [],
    acquisitions: [],
    attention: null,
    availableActions: [],
    ...over,
  };
}

// ── A. Gating on objective.status ────────────────────────────────────────────

test("FinalDeliverable renders nothing when the Objective is not completed", () => {
  const html = renderToStaticMarkup(
    createElement(FinalDeliverable, {
      objective: objective({ status: "working" }),
      somebodyNow: somebodyNow(),
      deliverables: [deliverable({ status: "verified", content: "The finished plan." })],
    }),
  );
  assert.equal(html, "");
});

test("FinalDeliverable renders, clearly labeled, once the Objective is completed", () => {
  const html = renderToStaticMarkup(
    createElement(FinalDeliverable, {
      objective: objective({ status: "completed" }),
      somebodyNow: somebodyNow({ state: "completed", headline: "The required outcome is verified.", detail: "Saved.", updatedAt: NOW }),
      deliverables: [
        deliverable({
          id: "d1",
          title: "Relaunch recommendation",
          version: 2,
          status: "verified",
          content: "Full governed artifact text goes here.",
        }),
      ],
    }),
  );
  assert.ok(html.includes('aria-label="Final deliverable"'));
  assert.ok(html.includes("Final deliverable"));
  assert.ok(html.includes("Relaunch recommendation"));
  assert.ok(html.includes("Full governed artifact text goes here."));
  assert.ok(html.includes('id="final-deliverable"'));
});

// ── B. Version selection — verified/current only, never superseded/draft ────

test("with multiple deliverable versions, only the verified one's content is shown, not a superseded version", () => {
  const deliverables: DeliverableView[] = [
    deliverable({ id: "d_old", title: "Relaunch recommendation", version: 1, status: "superseded", content: "Old superseded draft content." }),
    deliverable({ id: "d_new", title: "Relaunch recommendation", version: 2, status: "verified", content: "The verified final content." }),
  ];
  const html = renderToStaticMarkup(
    createElement(FinalDeliverable, {
      objective: objective({ status: "completed" }),
      somebodyNow: somebodyNow({ state: "completed", headline: "Done", detail: "Saved.", updatedAt: NOW }),
      deliverables,
    }),
  );
  assert.ok(html.includes("The verified final content."));
  assert.ok(!html.includes("Old superseded draft content."));
  assert.ok(html.includes('data-deliverable-status="verified"'));
});

test("falls back to the current deliverable when none is verified yet, never a draft branch", () => {
  const deliverables: DeliverableView[] = [
    deliverable({ id: "d_draft", title: "Alt approach", version: 1, status: "draft", content: "An abandoned draft branch." }),
    deliverable({ id: "d_current", title: "Relaunch recommendation", version: 3, status: "current", content: "The current accepted content." }),
  ];
  const html = renderToStaticMarkup(
    createElement(FinalDeliverable, {
      objective: objective({ status: "completed" }),
      somebodyNow: somebodyNow({ state: "completed", headline: "Done", detail: "Saved.", updatedAt: NOW }),
      deliverables,
    }),
  );
  assert.ok(html.includes("The current accepted content."));
  assert.ok(!html.includes("An abandoned draft branch."));
  assert.ok(html.includes('data-deliverable-status="current"'));
});

// ── C. Seed/system placeholder never presented as a completed outcome ───────

test("a seed/system placeholder artifact is never presented as the final deliverable while the Objective is not completed", () => {
  const seedPlaceholder = deliverable({
    id: "d_seed",
    title: "Generic objective deliverable",
    type: "system",
    version: 1,
    status: "current",
    content: "GENERIC_OBJECTIVE_DELIVERABLE seed/system placeholder — no real work has happened yet.",
  });
  const html = renderToStaticMarkup(
    createElement(FinalDeliverable, {
      objective: objective({ status: "working" }),
      somebodyNow: somebodyNow(),
      deliverables: [seedPlaceholder],
    }),
  );
  assert.equal(html, "");
  assert.ok(!html.includes("GENERIC_OBJECTIVE_DELIVERABLE"));
});

// ── D. Summary and content stay visually/structurally distinct ──────────────

test("the completion summary and the deliverable content render as separate, distinctly-classed blocks", () => {
  const html = renderToStaticMarkup(
    createElement(FinalDeliverable, {
      objective: objective({ status: "completed" }),
      somebodyNow: somebodyNow({ state: "completed", headline: "Done", detail: "Saved.", updatedAt: NOW }),
      deliverables: [
        deliverable({
          id: "d1",
          title: "Relaunch recommendation",
          version: 4,
          status: "verified",
          content: "Full governed artifact body text.",
        }),
      ],
    }),
  );
  const summaryIdx = html.indexOf('class="v6-final-deliverable-summary"');
  const contentIdx = html.indexOf('class="v6-final-deliverable-content"');
  assert.ok(summaryIdx >= 0, "summary must render in its own distinctly-classed element");
  assert.ok(contentIdx >= 0, "content must render in its own distinctly-classed element");
  assert.ok(summaryIdx < contentIdx, "summary block precedes the content block — not concatenated");
  // The summary is the short completion line (references the deliverable's
  // title/version, not its full body); the content block carries the body.
  const summarySlice = html.slice(summaryIdx, contentIdx);
  assert.ok(summarySlice.includes("Relaunch recommendation"));
  assert.ok(!summarySlice.includes("Full governed artifact body text."), "summary must not absorb the full artifact body");
  const contentSlice = html.slice(contentIdx);
  assert.ok(contentSlice.includes("Full governed artifact body text."));
});

// ── E. Integration — mounted in the main content flow, not the rail ─────────

test("V6WorkspaceView mounts Final Deliverable in the primary column, after Activity, only when completed", () => {
  const notCompletedView = workspace({ deliverables: [deliverable({ status: "current", content: "Not final yet." })] });
  const notCompleted = renderToStaticMarkup(
    createElement(V6WorkspaceView, {
      list: { inProgress: [], needsYou: [], done: [] },
      selectedId: "obj_1",
      onSelect: () => {},
      onStartNew: () => {},
      main: { kind: "ready", view: notCompletedView } as MainPaneState,
    }),
  );
  assert.ok(!notCompleted.includes('aria-label="Final deliverable"'));

  const completedView = workspace({
    objective: objective({ status: "completed" }),
    somebodyNow: somebodyNow({ state: "completed", headline: "Done", detail: "Saved.", updatedAt: NOW }),
    deliverables: [deliverable({ status: "verified", content: "The governed final artifact." })],
  });
  const completed = renderToStaticMarkup(
    createElement(V6WorkspaceView, {
      list: { inProgress: [], needsYou: [], done: [] },
      selectedId: "obj_1",
      onSelect: () => {},
      onStartNew: () => {},
      main: { kind: "ready", view: completedView } as MainPaneState,
    }),
  );
  assert.ok(completed.includes('aria-label="Final deliverable"'));
  assert.ok(completed.includes("The governed final artifact."));

  const activityIdx = completed.indexOf('aria-label="Activity"');
  const finalIdx = completed.indexOf('aria-label="Final deliverable"');
  const railIdx = completed.indexOf('aria-label="Deliverables"');
  assert.ok(activityIdx >= 0 && finalIdx > activityIdx, "Final Deliverable mounts after Activity in the primary column");
  assert.ok(finalIdx < railIdx, "Final Deliverable is in the primary column, entirely before the rail column in markup order");
});

// ── F. Deliverables rail row stays openable to the new section ──────────────

test("Deliverables emphasized row links to the Final Deliverable section when content is present", () => {
  const withContent = renderToStaticMarkup(
    createElement(Deliverables, { deliverables: [deliverable({ status: "verified", content: "Has content" })] }),
  );
  assert.ok(withContent.includes('href="#final-deliverable"'));

  const withoutContent = renderToStaticMarkup(
    createElement(Deliverables, { deliverables: [deliverable({ status: "verified" })] }),
  );
  assert.ok(!withoutContent.includes('href="#final-deliverable"'));

  const nonEmphasized = renderToStaticMarkup(
    createElement(Deliverables, { deliverables: [deliverable({ status: "draft", content: "Has content" })] }),
  );
  assert.ok(!nonEmphasized.includes('href="#final-deliverable"'));
});
