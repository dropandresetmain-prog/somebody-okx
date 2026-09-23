// V6 product surface — focused render tests (task §23). Pure presentational
// components only: renderToStaticMarkup, no Convex provider, no runtime.
// Fixtures below are shaped like the product contract types (app/product/
// contracts.ts) for test purposes only — never copied into production code.

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type {
  AcquisitionView,
  ActivityItem,
  AttentionState,
  ObjectiveListView,
  ObjectiveSummaryView,
  ObjectiveWorkspaceView,
  ObjectiveProductStatus,
  StartCapabilitiesView,
} from "../app/product/contracts";
import { Sidebar } from "../app/product/components/Sidebar";
import { ObjectiveHeader } from "../app/product/components/ObjectiveHeader";
import { Checkpoints } from "../app/product/components/Checkpoints";
import { CurrentWork } from "../app/product/components/CurrentWork";
import { Activity } from "../app/product/components/Activity";
import { Deliverables } from "../app/product/components/Deliverables";
import { Acquisitions } from "../app/product/components/Acquisitions";
import { Attention } from "../app/product/components/Attention";
import { V6WorkspaceView, type MainPaneState } from "../app/product/V6WorkspaceView";
import { StartView } from "../app/start/StartView";

const NOW = 1_820_000_000_000;

function summary(over: Partial<ObjectiveSummaryView> = {}): ObjectiveSummaryView {
  return { id: "obj_1", title: "Ship the launch page", status: "working", updatedAt: NOW, hasAttention: false, ...over };
}

function list(over: Partial<ObjectiveListView> = {}): ObjectiveListView {
  return { inProgress: [], needsYou: [], done: [], ...over };
}

function workspace(over: Partial<ObjectiveWorkspaceView> = {}): ObjectiveWorkspaceView {
  return {
    objective: {
      id: "obj_1",
      title: "Ship the launch page",
      request: "Ship the launch page by Friday.",
      status: "working",
      createdAt: NOW - 100_000,
      updatedAt: NOW,
    },
    liveness: {
      active: true,
      phase: "working",
      lastProgressAt: NOW,
      detail: "Choosing and executing the next bounded step.",
    },
    progress: { checkpoints: [] },
    somebodyNow: { state: "working", headline: "Working on it", detail: "An intern is doing bounded work.", updatedAt: NOW },
    currentWork: null,
    activity: [],
    deliverables: [],
    acquisitions: [],
    attention: null,
    availableActions: [],
    ...over,
  };
}

// ── A. Sidebar / Objective selection ────────────────────────────────────────

test("Sidebar renders exactly the three supplied arrays with no regrouping", () => {
  const view = list({
    needsYou: [summary({ id: "n1", status: "needs_you", hasAttention: true })],
    inProgress: [summary({ id: "p1", status: "working" })],
    done: [summary({ id: "d1", status: "completed" })],
  });
  const html = renderToStaticMarkup(
    createElement(Sidebar, { list: view, selectedId: "p1", onSelect: () => {}, onStartNew: () => {} }),
  );
  assert.ok(html.includes('data-objective-id="n1"'));
  assert.ok(html.includes('data-objective-id="p1"'));
  assert.ok(html.includes('data-objective-id="d1"'));
  assert.ok(html.includes('data-sidebar-section="Needs you"'));
  assert.ok(html.includes('data-sidebar-section="In progress"'));
  assert.ok(html.includes('data-sidebar-section="Done"'));
  // selection marks the supplied selectedId, not a recomputed one
  assert.match(html, /data-objective-id="p1"[^]*?aria-current="true"/);
});

test("Sidebar renders a truthful empty state when every section is empty", () => {
  const html = renderToStaticMarkup(
    createElement(Sidebar, { list: list(), selectedId: null, onSelect: () => {}, onStartNew: () => {} }),
  );
  assert.ok(html.includes("No objectives yet."));
});

// ── B. Objective status — rendered, not recalculated ────────────────────────

const ALL_STATUSES: ObjectiveProductStatus[] = ["starting", "working", "waiting", "needs_you", "verifying", "completed", "blocked"];

test("every ObjectiveProductStatus renders as the supplied value via data-objective-status", () => {
  for (const status of ALL_STATUSES) {
    const html = renderToStaticMarkup(
      createElement(ObjectiveHeader, {
        objective: workspace({ objective: { ...workspace().objective, status } }).objective,
        liveness: workspace().liveness,
        somebodyNow: workspace().somebodyNow,
      }),
    );
    assert.ok(html.includes(`data-objective-status="${status}"`), `missing status ${status}`);
  }
});

// ── C. Somebody Now ──────────────────────────────────────────────────────────

test("Somebody Now renders supplied headline/detail/state verbatim", () => {
  const html = renderToStaticMarkup(
    createElement(ObjectiveHeader, {
      objective: workspace().objective,
      liveness: { ...workspace().liveness, active: false },
      somebodyNow: { state: "needs_you", headline: "Somebody needs your approval", detail: "A $50 purchase is waiting.", updatedAt: NOW },
    }),
  );
  assert.ok(html.includes("Somebody needs your approval"));
  assert.ok(html.includes("A $50 purchase is waiting."));
  assert.ok(html.includes('data-somebody-state="needs_you"'));
});

// ── D. Checkpoints ────────────────────────────────────────────────────────────

test("Checkpoints render exactly the supplied checkpoints and never a percentage", () => {
  const html = renderToStaticMarkup(
    createElement(Checkpoints, {
      progress: {
        checkpoints: [
          { id: "c1", label: "Draft the copy", state: "complete" },
          { id: "c2", label: "Get it reviewed", state: "active", detail: "Waiting on legal" },
          { id: "c3", label: "Publish", state: "pending" },
          { id: "c4", label: "Blocked one", state: "blocked", detail: "Missing asset" },
        ],
      },
    }),
  );
  for (const id of ["c1", "c2", "c3", "c4"]) assert.ok(html.includes(`data-checkpoint-id="${id}"`));
  assert.ok(!/%/.test(html), "checkpoints must never render a percentage");
});

// ── E. Current Work / Intern ─────────────────────────────────────────────────

test("Intern done never implies Objective completion — CurrentWork has no objective-status claim", () => {
  const html = renderToStaticMarkup(
    createElement(CurrentWork, {
      currentWork: {
        id: "a1",
        title: "Write the landing copy",
        status: "done",
        approach: "MAKE",
        intern: { id: "w1", label: "Rae", state: "done" },
        updatedAt: NOW,
      },
    }),
  );
  assert.ok(html.includes('data-intern-state="done"'));
  assert.ok(!html.includes("Objective complete"));
  assert.ok(!html.includes('data-objective-status="completed"'));
});

test("CurrentWork renders null gracefully (no card)", () => {
  const html = renderToStaticMarkup(createElement(CurrentWork, { currentWork: null }));
  assert.equal(html, "");
});

// ── F. Activity ───────────────────────────────────────────────────────────────

test("Activity uses item.id as identity and preserves supplied order", () => {
  const items: ActivityItem[] = [
    { id: "act_1", type: "objective_interpreted", occurredAt: NOW - 3000, actor: { kind: "somebody", label: "Somebody" }, title: "Somebody defined the outcome", importance: "major" },
    { id: "act_2", type: "intern_assigned", occurredAt: NOW - 2000, actor: { kind: "somebody", label: "Somebody" }, title: "Somebody assigned Rae", importance: "standard" },
  ];
  const html = renderToStaticMarkup(createElement(Activity, { items }));
  const i1 = html.indexOf('data-activity-id="act_1"');
  const i2 = html.indexOf('data-activity-id="act_2"');
  assert.ok(i1 >= 0 && i2 >= 0 && i1 < i2, "activity must render in supplied order using stable ids");
});

test("Activity attaches the full receipt to the chronologically latest acquisition event, not the last one in newest-first render order", () => {
  // Supplied newest-first (per projectActivity contract): items[0] is the
  // chronologically LATEST event for acq1, items[1] is an earlier one.
  const items: ActivityItem[] = [
    {
      id: "act_later",
      type: "external_result_verified",
      occurredAt: NOW - 1000,
      actor: { kind: "somebody", label: "Somebody" },
      title: "Verified the result for market data",
      importance: "major",
      related: { acquisitionId: "acq1" },
    },
    {
      id: "act_earlier",
      type: "acquisition_started",
      occurredAt: NOW - 5000,
      actor: { kind: "somebody", label: "Somebody" },
      title: "Somebody authorized acquiring market data",
      importance: "standard",
      related: { acquisitionId: "acq1" },
    },
  ];
  const acquisitions: AcquisitionView[] = [
    { id: "acq1", resourceLabel: "market data", status: "verified", resultSummary: "Got it.", updatedAt: NOW - 1000 },
  ];
  const html = renderToStaticMarkup(createElement(Activity, { items, acquisitions }));
  // The full receipt card renders "Resource"/"Status" grid cells; the
  // step-only card does not.
  const laterIdx = html.indexOf('data-activity-id="act_later"');
  const earlierIdx = html.indexOf('data-activity-id="act_earlier"');
  const laterCard = html.slice(laterIdx, earlierIdx);
  const earlierCard = html.slice(earlierIdx);
  assert.ok(laterCard.includes("v6-receipt-grid"), "the chronologically latest event carries the full receipt");
  assert.ok(!laterCard.includes("v6-receipt--step"), "the latest event is not rendered as a step-only card");
  assert.ok(earlierCard.includes("v6-receipt--step"), "the chronologically earlier event stays a step card, not a second full receipt");
});

test("Activity marks the chronologically LATER duplicate finding as repeated, never the original", () => {
  // Supplied newest-first: items[0] is the later, repeated occurrence;
  // items[1] is the original finding it repeats.
  const items: ActivityItem[] = [
    {
      id: "act_repeat",
      type: "finding_added",
      occurredAt: NOW - 1000,
      actor: { kind: "intern", id: "w1", label: "Rae" },
      title: "Pricing page is broken",
      importance: "minor",
      payload: { finding: "The pricing page 404s." },
    },
    {
      id: "act_original",
      type: "finding_added",
      occurredAt: NOW - 9000,
      actor: { kind: "intern", id: "w1", label: "Rae" },
      title: "Pricing page is broken",
      importance: "minor",
      payload: { finding: "The pricing page 404s." },
    },
  ];
  const html = renderToStaticMarkup(createElement(Activity, { items }));
  const repeatIdx = html.indexOf('data-activity-id="act_repeat"');
  const originalIdx = html.indexOf('data-activity-id="act_original"');
  const repeatCard = html.slice(repeatIdx, originalIdx);
  const originalCard = html.slice(originalIdx);
  assert.ok(repeatCard.includes("Same finding as earlier"), "the later occurrence is marked as the repeat");
  assert.ok(!originalCard.includes("Same finding as earlier"), "the original finding is never marked as its own repeat");
});

test("Activity context derivation never changes the visible newest-first render order", () => {
  const items: ActivityItem[] = [
    {
      id: "act_newest",
      type: "external_result_verified",
      occurredAt: NOW - 1000,
      actor: { kind: "somebody", label: "Somebody" },
      title: "Verified the result",
      importance: "major",
      related: { acquisitionId: "acq1" },
    },
    {
      id: "act_middle",
      type: "finding_added",
      occurredAt: NOW - 5000,
      actor: { kind: "intern", id: "w1", label: "Rae" },
      title: "Finding",
      importance: "minor",
      payload: { finding: "Same text" },
    },
    {
      id: "act_oldest",
      type: "finding_added",
      occurredAt: NOW - 9000,
      actor: { kind: "intern", id: "w1", label: "Rae" },
      title: "Finding",
      importance: "minor",
      payload: { finding: "Same text" },
    },
  ];
  const acquisitions: AcquisitionView[] = [{ id: "acq1", resourceLabel: "market data", status: "verified", updatedAt: NOW - 1000 }];
  const html = renderToStaticMarkup(createElement(Activity, { items, acquisitions }));
  const indices = ["act_newest", "act_middle", "act_oldest"].map((id) => html.indexOf(`data-activity-id="${id}"`));
  assert.ok(indices.every((i) => i >= 0));
  assert.ok(indices[0] < indices[1] && indices[1] < indices[2], "render order stays exactly the supplied newest-first order");
});

test("Activity renders no causal connector when causedByActivityId is absent, and renders one when supplied", () => {
  const withoutCause: ActivityItem = {
    id: "act_a",
    type: "work_started",
    occurredAt: NOW,
    actor: { kind: "intern", id: "w1", label: "Rae" },
    title: "Rae started work",
    importance: "minor",
  };
  const withCause: ActivityItem = {
    id: "act_b",
    type: "work_resumed",
    occurredAt: NOW,
    actor: { kind: "intern", id: "w1", label: "Rae" },
    title: "Rae resumed with the acquired result",
    importance: "standard",
    causedByActivityId: "act_a",
  };
  const html1 = renderToStaticMarkup(createElement(Activity, { items: [withoutCause] }));
  assert.ok(!html1.includes("data-caused-by-note"));
  assert.ok(!html1.includes("data-caused-by-activity-id"));

  const html2 = renderToStaticMarkup(createElement(Activity, { items: [withCause] }));
  assert.ok(html2.includes('data-caused-by-activity-id="act_a"'));
  assert.ok(html2.includes("data-caused-by-note"));
});

test("Activity degrades gracefully when an optional payload is absent", () => {
  const item: ActivityItem = {
    id: "act_c",
    type: "manager_decision",
    occurredAt: NOW,
    actor: { kind: "somebody", label: "Somebody" },
    title: "Somebody chose to make: landing copy",
    importance: "major",
  };
  const html = renderToStaticMarkup(createElement(Activity, { items: [item] }));
  assert.ok(html.includes("Somebody chose to make: landing copy"));
});

test("Activity MAKE/BUY decisions use founder-facing headlines while preserving selected truth", () => {
  const make: ActivityItem = {
    id: "act_make",
    type: "manager_decision",
    occurredAt: NOW,
    actor: { kind: "somebody", label: "Somebody" },
    title: "Somebody chose to make: landing copy",
    importance: "major",
    payload: {
      selected: { approach: "MAKE", label: "Use the Intern" },
      alternative: { approach: "BUY", label: "Buy a writer" },
      reason: "Internal capacity is enough.",
    },
  };
  const buy: ActivityItem = {
    id: "act_buy",
    type: "manager_decision",
    occurredAt: NOW,
    actor: { kind: "somebody", label: "Somebody" },
    title: "Somebody chose to buy audience evidence",
    importance: "major",
    payload: {
      selected: { approach: "BUY", label: "Acquire audience-language evidence" },
      alternative: { approach: "MAKE", label: "Continue with owned research" },
      reason: "The gap is current audience language.",
    },
  };
  const makeHtml = renderToStaticMarkup(createElement(Activity, { items: [make] }));
  assert.ok(makeHtml.includes("Keep this in-house"));
  assert.ok(makeHtml.includes("Use the Intern"));
  assert.ok(makeHtml.includes("v6-option is-selected"));
  assert.ok(makeHtml.includes("<summary>Why</summary>"));
  assert.ok(makeHtml.includes("Internal capacity is enough."));

  const buyHtml = renderToStaticMarkup(createElement(Activity, { items: [buy] }));
  assert.ok(buyHtml.includes("Bring in outside help"));
  assert.ok(buyHtml.includes("Acquire audience-language evidence"));
  assert.ok(buyHtml.includes("Continue with owned research"));
});

test("ObjectiveHeader completed state uses verified treatment; working/blocked stay non-green", () => {
  const completed = renderToStaticMarkup(
    createElement(ObjectiveHeader, {
      objective: { ...workspace().objective, status: "completed" },
      liveness: { ...workspace().liveness, active: false, phase: "idle" },
      somebodyNow: { state: "completed", headline: "The required outcome is verified.", detail: "Saved.", updatedAt: NOW },
    }),
  );
  assert.ok(completed.includes('data-objective-status="completed"'));
  assert.ok(completed.includes("Somebody · objective verified"));
  assert.ok(completed.includes("tone-verified"));

  const working = renderToStaticMarkup(
    createElement(ObjectiveHeader, {
      objective: workspace().objective,
      liveness: workspace().liveness,
      somebodyNow: workspace().somebodyNow,
    }),
  );
  assert.ok(working.includes('data-objective-status="working"'));
  assert.ok(!working.includes("Somebody · objective verified"));
  assert.match(working, /v6-somebody-card[^>]*data-objective-status="working"/);

  const blocked = renderToStaticMarkup(
    createElement(ObjectiveHeader, {
      objective: { ...workspace().objective, status: "blocked" },
      liveness: { ...workspace().liveness, active: false, phase: "idle" },
      somebodyNow: { state: "blocked", headline: "Stopped", detail: "Missing authority.", updatedAt: NOW },
    }),
  );
  assert.ok(blocked.includes('data-objective-status="blocked"'));
  assert.ok(!blocked.includes("Somebody · objective verified"));

  const needsYou = renderToStaticMarkup(
    createElement(ObjectiveHeader, {
      objective: { ...workspace().objective, status: "needs_you" },
      liveness: { ...workspace().liveness, active: false, phase: "idle" },
      somebodyNow: { state: "needs_you", headline: "Needs you", detail: "Approve spend.", updatedAt: NOW },
    }),
  );
  assert.ok(needsYou.includes('data-objective-status="needs_you"'));
  assert.ok(!needsYou.includes("Somebody · objective verified"));
});

test("Deliverables unknowns stay available behind a disclosure without inventing counts", () => {
  const withUnknowns = renderToStaticMarkup(
    createElement(Deliverables, {
      deliverables: [
        {
          id: "d1",
          title: "Relaunch recommendation",
          type: "document",
          version: 2,
          status: "verified",
          summary: "Revised messaging.",
          recommendedNextMove: "Publish when ready",
          unknowns: ["Audience size still approximate", "Channel mix untested"],
          updatedAt: NOW,
        },
      ],
    }),
  );
  assert.ok(withUnknowns.includes("2 remaining unknowns"));
  assert.ok(withUnknowns.includes("Audience size still approximate"));
  assert.ok(withUnknowns.includes("Channel mix untested"));

  const none = renderToStaticMarkup(
    createElement(Deliverables, {
      deliverables: [
        {
          id: "d2",
          title: "Brief",
          type: "document",
          version: 1,
          status: "current",
          updatedAt: NOW,
        },
      ],
    }),
  );
  assert.ok(!none.includes("remaining unknown"));
});

test("Activity objective completion avoids duplicating the deliverable summary", () => {
  const item: ActivityItem = {
    id: "act_done",
    type: "objective_completed",
    occurredAt: NOW,
    actor: { kind: "somebody", label: "Somebody" },
    title: "Objective complete",
    detail: "A very long deliverable summary that belongs on the Deliverables card.",
    importance: "major",
  };
  const html = renderToStaticMarkup(createElement(Activity, { items: [item] }));
  assert.ok(html.includes("Objective complete"));
  assert.ok(html.includes("The final deliverable is ready to review."));
  assert.ok(!html.includes("A very long deliverable summary that belongs on the Deliverables card."));
});

test("Activity renders type-specific treatments for major event types", () => {
  const items: ActivityItem[] = [
    {
      id: "act_finding",
      type: "finding_added",
      occurredAt: NOW,
      actor: { kind: "intern", id: "w1", label: "Rae" },
      title: "Found a pricing gap",
      importance: "minor",
      payload: { finding: "Pricing page is missing the annual plan.", evidenceRefs: [{ id: "ev1", label: "Screenshot" }] },
    },
    {
      id: "act_artifact",
      type: "artifact_changed",
      occurredAt: NOW,
      actor: { kind: "intern", id: "w1", label: "Rae" },
      title: "Landing copy updated to version 2",
      importance: "major",
      payload: { deliverableId: "deliverable:obj_1:landing", before: "Old copy", after: "New copy", changeSummary: "Rewrote the hero" },
    },
  ];
  const html = renderToStaticMarkup(createElement(Activity, { items }));
  assert.ok(html.includes("Pricing page is missing the annual plan."));
  assert.ok(html.includes("Screenshot"));
  assert.ok(html.includes("Old copy"));
  assert.ok(html.includes("New copy"));
  assert.ok(html.includes("Landing copy"));
  assert.ok(html.includes("Now version 2"));
  assert.ok(!html.includes("Rewrote the hero"), "diff owns the change; skip redundant summary prose");
});

// ── G. Deliverables ───────────────────────────────────────────────────────────

test("Deliverable current vs verified are visually distinct and status is never inferred from version", () => {
  const html = renderToStaticMarkup(
    createElement(Deliverables, {
      deliverables: [
        { id: "d1", title: "Landing page copy", type: "document", version: 5, status: "draft", updatedAt: NOW },
        { id: "d2", title: "Pricing sheet", type: "document", version: 1, status: "verified", updatedAt: NOW },
      ],
    }),
  );
  assert.ok(html.includes('data-deliverable-status="draft"'));
  assert.ok(html.includes('data-deliverable-status="verified"'));
  // higher version (5, draft) must not read as more "done" than the lower verified one
  const draftIdx = html.indexOf('data-deliverable-id="d1"');
  const verifiedIdx = html.indexOf('data-deliverable-id="d2"');
  assert.ok(draftIdx >= 0 && verifiedIdx >= 0);
});

// ── H. Acquisitions ───────────────────────────────────────────────────────────

test("Acquisition with absent provenance renders no fabricated provenance label", () => {
  const html = renderToStaticMarkup(
    createElement(Acquisitions, { acquisitions: [{ id: "acq1", resourceLabel: "Domain name", status: "in_progress", updatedAt: NOW }] }),
  );
  assert.ok(!html.includes("data-acquisition-provenance"));
});

test("Acquisition provenance renders exactly what is supplied: simulation, recorded_replay, live", () => {
  for (const provenance of ["simulation", "recorded_replay", "live"] as const) {
    const html = renderToStaticMarkup(
      createElement(Acquisitions, {
        acquisitions: [{ id: "acq1", resourceLabel: "Domain name", status: "verified", provenance, updatedAt: NOW }],
      }),
    );
    assert.ok(html.includes(`data-acquisition-provenance="${provenance}"`));
  }
});

test("Acquisition with absent transaction renders no transaction/payment UI; present transaction renders only when supplied", () => {
  const noTx = renderToStaticMarkup(
    createElement(Acquisitions, { acquisitions: [{ id: "acq1", resourceLabel: "Domain name", status: "verified", provenance: "live", updatedAt: NOW }] }),
  );
  assert.ok(!noTx.includes("data-transaction-status"));

  const withTx = renderToStaticMarkup(
    createElement(Acquisitions, {
      acquisitions: [
        {
          id: "acq1",
          resourceLabel: "Domain name",
          status: "verified",
          provenance: "live",
          transaction: { status: "confirmed", label: "Confirmed on-chain" },
          updatedAt: NOW,
        },
      ],
    }),
  );
  assert.ok(withTx.includes('data-transaction-status="confirmed"'));
});

test("verified acquisition does not visually imply Objective completion", () => {
  const html = renderToStaticMarkup(
    createElement(Acquisitions, { acquisitions: [{ id: "acq1", resourceLabel: "Domain name", status: "verified", updatedAt: NOW }] }),
  );
  assert.ok(!html.includes("Objective complete"));
  assert.ok(!html.includes('data-objective-status="completed"'));
});

// ── I. Attention — spend approval action when supplied ───────────────────────

test("Attention renders nothing when null", () => {
  const html = renderToStaticMarkup(createElement(Attention, { attention: null }));
  assert.equal(html, "");
});

test("Attention with zero actions renders no manufactured buttons", () => {
  const attention: AttentionState = { id: "att1", revision: "att1:1", type: "approval", title: "Needs approval", detail: "…", actions: [] };
  const html = renderToStaticMarkup(createElement(Attention, { attention }));
  assert.ok(!html.includes("<button"));
});

test("Attention without handler keeps supplied actions disabled", () => {
  const attention: AttentionState = {
    id: "att1",
    revision: "att1:1",
    type: "approval",
    title: "Needs approval",
    detail: "…",
    actions: [{ id: "approve_spend", type: "approve", label: "Approve $6.80 limit" }],
  };
  const html = renderToStaticMarkup(createElement(Attention, { attention }));
  assert.ok(html.includes('data-attention-action-id="approve_spend"'));
  assert.ok(/disabled/.test(html.match(/<button[^>]*data-attention-action-id="approve_spend"[^>]*>/)?.[0] ?? ""));
  assert.ok(!html.includes(">Decline<"), "must never manufacture an action the contract did not supply");
});

test("Attention enables returned action when onAction is wired", () => {
  const attention: AttentionState = {
    id: "att1",
    revision: "att1:1",
    type: "approval",
    title: "Needs approval",
    detail: "…",
    actions: [{ id: "approve_spend", type: "approve", label: "Approve $6.80 limit" }],
  };
  const html = renderToStaticMarkup(
    createElement(Attention, { attention, onAction: () => undefined }),
  );
  const btn = html.match(/<button[^>]*data-attention-action-id="approve_spend"[^>]*>/)?.[0] ?? "";
  assert.ok(btn);
  assert.ok(!/\sdisabled(=|\s|>)/.test(btn));
});

// ── J. Start capabilities — current all-false contract ──────────────────────

const ALL_FALSE: StartCapabilitiesView = {
  canCreateObjective: false,
  supportsContextRefs: false,
  supportsAttachments: false,
  advanced: { spendLimit: false, deadline: false, externalEffectPolicy: false },
};

test("StartView respects an all-false StartCapabilitiesView: no working submit, no unsupported controls", () => {
  const html = renderToStaticMarkup(createElement(StartView, { capabilities: ALL_FALSE }));
  assert.ok(html.includes('data-start-submit="true"'));
  assert.ok(/disabled/.test(html.match(/<button[^>]*data-start-submit="true"[^>]*>/)?.[0] ?? ""));
  assert.ok(!html.includes("Context"));
  assert.ok(!html.includes("Attachments"));
  assert.ok(!html.includes("Spend limit"));
  assert.ok(!html.includes("Deadline"));
  assert.ok(!html.includes("External effect policy"));
  const textarea = html.match(/<textarea[^>]*>/)?.[0] ?? "";
  assert.ok(/disabled/.test(textarea));
});

test("StartView reveals a control only when its capability flag is true", () => {
  const html = renderToStaticMarkup(
    createElement(StartView, { capabilities: { ...ALL_FALSE, supportsContextRefs: true, advanced: { ...ALL_FALSE.advanced, deadline: true } } }),
  );
  assert.ok(html.includes("Context"));
  assert.ok(html.includes("Deadline"));
  assert.ok(!html.includes("Attachments"));
  assert.ok(!html.includes("Spend limit"));
});

// ── K. Infrastructure states ─────────────────────────────────────────────────

test("V6WorkspaceView renders distinct loading / not-found / empty / reconnecting states", () => {
  const base = { list: list(), selectedId: null as string | null, onSelect: () => {}, onStartNew: () => {} };

  const loading = renderToStaticMarkup(createElement(V6WorkspaceView, { ...base, main: { kind: "loading" } as MainPaneState }));
  assert.ok(loading.includes('data-main-pane="loading"'));

  const notFound = renderToStaticMarkup(createElement(V6WorkspaceView, { ...base, main: { kind: "not_found" } as MainPaneState }));
  assert.ok(notFound.includes('data-not-found="true"'));

  const empty = renderToStaticMarkup(createElement(V6WorkspaceView, { ...base, main: { kind: "no_objectives" } as MainPaneState }));
  assert.ok(empty.includes('data-empty="true"'));

  const stale = renderToStaticMarkup(
    createElement(V6WorkspaceView, { ...base, main: { kind: "ready", view: workspace(), stale: true } as MainPaneState }),
  );
  assert.ok(stale.includes('data-stale="true"'));
  assert.ok(stale.includes("Reconnecting"));

  const ready = renderToStaticMarkup(
    createElement(V6WorkspaceView, { ...base, main: { kind: "ready", view: workspace(), stale: false } as MainPaneState }),
  );
  assert.ok(ready.includes('data-stale="false"'));
  assert.ok(!ready.includes("Reconnecting"));
});

test("ready workspace keeps Activity dominant and does not mount a Current Work card above it", () => {
  const html = renderToStaticMarkup(
    createElement(V6WorkspaceView, {
      list: list(),
      selectedId: "obj_1",
      onSelect: () => {},
      onStartNew: () => {},
      main: {
        kind: "ready",
        view: workspace({
          currentWork: {
            id: "a1",
            title: "Write the landing copy",
            status: "working",
            intern: { id: "w1", label: "Rae", state: "working" },
            updatedAt: NOW,
          },
        }),
      },
    }),
  );
  assert.ok(!html.includes('aria-label="Current work"'));
  assert.ok(html.includes('aria-label="Activity"'));
  const deliverables = html.indexOf('aria-label="Deliverables"');
  const checkpoints = html.indexOf('aria-label="Checkpoints"');
  assert.ok(deliverables >= 0 && checkpoints >= 0 && deliverables < checkpoints);
});

test("Activity intern assignment uses the approved Intern visual, not an icon substitute", () => {
  const items: ActivityItem[] = [
    {
      id: "act_assign",
      type: "intern_assigned",
      occurredAt: NOW,
      actor: { kind: "somebody", label: "Somebody" },
      title: "Somebody assigned Rae",
      importance: "major",
      payload: {
        intern: { id: "w1", label: "Rae", specialty: "Growth research", state: "assigned" },
        assignmentTitle: "Diagnose the launch message",
        scope: "Inspect launch context.",
        authorityNote: "Bounded assignment · no spending authority",
      },
    },
  ];
  const html = renderToStaticMarkup(createElement(Activity, { items }));
  assert.ok(html.includes("/mascot/intern/intern-neutral.webp"));
  assert.ok(html.includes("Diagnose the launch message"));
  assert.ok(html.includes("Bounded assignment"));
});

test("Activity manager decision renders a selected fork, not a vs sentence", () => {
  const items: ActivityItem[] = [
    {
      id: "act_dec",
      type: "manager_decision",
      occurredAt: NOW,
      actor: { kind: "somebody", label: "Somebody" },
      title: "Somebody chose to buy audience evidence",
      importance: "major",
      payload: {
        selected: { approach: "BUY", label: "Acquire audience-language evidence" },
        alternative: { approach: "MAKE", label: "Continue with owned research" },
        reason: "The gap is current audience language.",
      },
    },
  ];
  const html = renderToStaticMarkup(createElement(Activity, { items }));
  assert.ok(html.includes("v6-option is-selected"));
  assert.ok(html.includes("Acquire audience-language evidence"));
  assert.ok(html.includes("Continue with owned research"));
  assert.ok(!html.includes(">vs<"));
  assert.ok(!html.includes(" vs "));
});

test("Activity does not use the old inferred causality copy", () => {
  const items: ActivityItem[] = [
    {
      id: "act_b",
      type: "artifact_changed",
      occurredAt: NOW,
      actor: { kind: "intern", id: "w1", label: "Rae" },
      title: "Landing copy updated",
      importance: "major",
      causedByActivityId: "act_a",
      payload: { deliverableId: "d1", before: "Old", after: "New", changeSummary: "Rewrote the hero" },
    },
  ];
  const html = renderToStaticMarkup(createElement(Activity, { items }));
  assert.ok(!html.includes("Continues from an earlier linked event"));
  assert.ok(html.includes("data-caused-by-note"));
});

test("StartView uses the approved working duo, not a generic mascot-only hero", () => {
  const html = renderToStaticMarkup(createElement(StartView, { capabilities: ALL_FALSE }));
  assert.ok(html.includes("/mascot/duo/duo-working-transparent.webp"));
});

// ── L. Architectural seam ─────────────────────────────────────────────────────

const FORBIDDEN_IMPORT_FRAGMENTS = [
  "lib/management",
  "app/m5/workspace",
  "lib/m5/workspaceModel",
  "lib/payment",
  "lib/objective/",
];

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(full));
    else if (entry.isFile() && /\.tsx?$/.test(entry.name)) out.push(full);
  }
  return out;
}

test("primary V6 files import no raw M6.1/M5 domain modules", () => {
  const roots = [join(__dirname, "..", "app", "product"), join(__dirname, "..", "app", "start")];
  for (const root of roots) {
    for (const file of walk(root)) {
      const src = readFileSync(file, "utf8");
      for (const fragment of FORBIDDEN_IMPORT_FRAGMENTS) {
        assert.ok(!src.includes(fragment), `${file} must not reference ${fragment}`);
      }
    }
  }
});

test("the live container references product reads via useProductWorkspace; /start uses the create command", () => {
  // Product reads live behind the useProductWorkspace seam (live Convex vs demo
  // playback). ProductWorkspace keeps the live spend-approval command only.
  const seam = readFileSync(join(__dirname, "..", "app", "demo", "useProductWorkspace.ts"), "utf8");
  assert.ok(seam.includes("api.productWorkspace.getObjectiveListV1"));
  assert.ok(seam.includes("api.productWorkspace.getObjectiveWorkspaceV1"));
  assert.ok(!seam.includes("api.objectives.listObjectives"));
  assert.ok(!seam.includes("api.m5Workspace"));
  const container = readFileSync(join(__dirname, "..", "app", "product", "ProductWorkspace.tsx"), "utf8");
  assert.ok(container.includes("useProductWorkspace"));
  assert.ok(container.includes("api.productCommands.submitAttentionActionV1"));
  assert.ok(!container.includes("api.objectives.listObjectives"));
  assert.ok(!container.includes("api.m5Workspace"));
  const startSrc = readFileSync(join(__dirname, "..", "app", "start", "StartContainer.tsx"), "utf8");
  assert.ok(startSrc.includes("api.productWorkspace.getStartCapabilitiesV1"));
  assert.ok(startSrc.includes("api.productCommands.createObjectiveV1"));
  assert.ok(!startSrc.includes("api.objectives.submitObjective"));
});
