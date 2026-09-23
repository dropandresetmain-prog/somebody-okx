// Founder-facing language pass: system/orchestration vocabulary must not reach
// the default rendered surface, while provenance, transaction truth, unknowns
// and approval states stay visible. Driven by the real recorded Luna replay
// frames plus small contract-shaped cases for paths Luna does not exercise.

import test from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { AcquisitionView, ActivityItem, DeliverableView, ProgressView } from "../app/product/contracts";
import { Activity } from "../app/product/components/Activity";
import { Checkpoints } from "../app/product/components/Checkpoints";
import { Deliverables } from "../app/product/components/Deliverables";
import { ObjectiveHeader } from "../app/product/components/ObjectiveHeader";
import { V6WorkspaceView } from "../app/product/V6WorkspaceView";
import { humanizeKey, internName, presentActivity, presentOption, presentSomebodyNow } from "../app/product/humanize";
import { lunaRelaunchScenario } from "../lib/demo/scenarios/lunaRelaunch";

const NOW = 1_820_000_000_000;

function renderFrame(index: number): string {
  const frame = lunaRelaunchScenario.frames[index];
  return renderToStaticMarkup(
    createElement(V6WorkspaceView, {
      list: frame.objectiveList,
      selectedId: frame.workspace.objective.id,
      onSelect: () => {},
      onStartNew: () => {},
      main: { kind: "ready", view: frame.workspace },
    }),
  );
}

/** Visible text only, with <details> bodies removed (they are opt-in). */
function defaultVisibleText(html: string): string {
  return html
    .replace(/<details[\s\S]*?<summary[^>]*>([\s\S]*?)<\/summary>[\s\S]*?<\/details>/g, " $1 ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&#x27;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ");
}

// Engine vocabulary that has no business on the default founder surface.
// Work content (the founder request, findings, artifact text) is exempt by
// construction: none of these appear in the Luna work content.
const LEAKS = [
  /worker_/,
  /capability-matched/i,
  /\beligible\b/i,
  /Managerial (decision|interpretation)/i,
  /External capability/i,
  /Accountable manager/i,
  /Artifact changed/i,
  /supplied amount/i,
  /proof obligations?/i,
  /application-verified/i,
  /proprietary_data/,
  /somebody_controlled_test/,
  /founder_narrative_pulse/,
  /Received is not verified/i,
  /does not by itself satisfy a requirement/i,
  /launch\/page-message artifact/i,
];

test("every Luna replay frame renders without orchestration vocabulary on the default surface", () => {
  lunaRelaunchScenario.frames.forEach((_, index) => {
    const text = defaultVisibleText(renderFrame(index));
    for (const pattern of LEAKS) {
      assert.ok(!pattern.test(text), `frame ${index} leaks ${pattern}: …${text.match(pattern)?.[0]}…`);
    }
  });
});

test("Luna final frame keeps the business story and every truth marker", () => {
  const html = renderFrame(lunaRelaunchScenario.frames.length - 1);
  const text = defaultVisibleText(html);
  // Story beats.
  for (const beat of [
    "Somebody defined the outcome",
    "Keep this in-house",
    "Use the Intern",
    "Bring in outside help",
    "Founder narrative pulse",
    "Authorized getting proprietary data",
    "The Intern picked the work back up with the outside result",
    "Launch page headline and message",
    "Now version 3",
    "The deliverable meets the required outcome",
    "Objective complete",
  ]) {
    assert.ok(text.includes(beat), `missing story beat: ${beat}`);
  }
  // Truth markers stay visible by default.
  assert.ok(text.includes("Simulation"), "simulation provenance must stay visible");
  assert.ok(text.includes("SIMULATED proprietary social evidence"), "external result keeps its own simulation disclosure");
  assert.ok(text.includes("3 remaining unknowns"), "remaining unknowns stay discoverable");
  assert.ok(text.includes("Next move"));
  // Persisted rationale stays available behind Why.
  assert.ok(html.includes("<summary>Why</summary>"));
  assert.ok(html.includes("Select the eligible internal MAKE option"), "rationale is preserved, not rewritten");
  // Causality is preserved.
  assert.ok(html.includes('data-caused-by-activity-id="activity:external_result_verified:sim_result_6269e01f64377bbfb5f17971"'));
});

test("completion hero is one calm sentence and never repeats the deliverable summary", () => {
  const frame = lunaRelaunchScenario.frames[lunaRelaunchScenario.frames.length - 1].workspace;
  const html = renderToStaticMarkup(
    createElement(ObjectiveHeader, {
      objective: frame.objective,
      somebodyNow: frame.somebodyNow,
      deliverables: frame.deliverables,
    }),
  );
  assert.ok(html.includes("Objective complete"));
  assert.ok(html.includes("Launch page headline and message (version 3) passed the final check."));
  assert.ok(!html.includes("Saved version 3"));
  assert.ok(!html.includes("Outcome with Somebody"));
});

test("completion hero only names a deliverable when its supplied status is verified", () => {
  const current: DeliverableView = { id: "d1", title: "Brief", type: "document", version: 2, status: "current", updatedAt: NOW };
  const display = presentSomebodyNow(
    { state: "completed", headline: "Objective complete", detail: "Saved the brief.", updatedAt: NOW },
    [current],
  );
  assert.equal(display.detail, "Saved the brief.");
});

test("waiting on outside help does not claim the ball is with the founder", () => {
  const html = renderToStaticMarkup(
    createElement(ObjectiveHeader, {
      objective: { id: "o", title: "T", request: "R", status: "waiting", createdAt: NOW, updatedAt: NOW },
      somebodyNow: {
        state: "waiting",
        headline: "Waiting on proprietary_data",
        detail: "An authorized external action is waiting at the outside boundary. Nothing else runs until it resolves.",
        updatedAt: NOW,
      },
    }),
  );
  assert.ok(html.includes("Waiting on proprietary data"));
  assert.ok(html.includes("Waiting for outside help to come back."));
  assert.ok(!html.includes("Ball with you"));
});

test("MAKE / BUY option labels are translated; unknown labels pass through", () => {
  assert.deepEqual(presentOption({ approach: "MAKE", label: "eligible, available and capability-matched" }), {
    label: "Use the Intern",
    source: null,
  });
  assert.deepEqual(presentOption({ approach: "BUY", label: "somebody_controlled_test:founder_narrative_pulse" }), {
    label: "Founder narrative pulse",
    source: "Somebody controlled test",
  });
  assert.deepEqual(presentOption({ approach: "BUY", label: "Acquire audience-language evidence" }), {
    label: "Acquire audience-language evidence",
    source: null,
  });
});

test("a decision that needs founder approval is never presented as already decided", () => {
  const item: ActivityItem = {
    id: "d",
    type: "manager_decision",
    occurredAt: NOW,
    actor: { kind: "somebody", label: "Somebody" },
    title: "Somebody needs approval to buy: somebody_controlled_test:founder_narrative_pulse",
    importance: "major",
    payload: { selected: { approach: "BUY", label: "somebody_controlled_test:founder_narrative_pulse" } },
  };
  assert.equal(presentActivity(item).title, "Outside help needs your approval");
  const html = renderToStaticMarkup(createElement(Activity, { items: [item] }));
  assert.ok(!html.includes("Bring in outside help"));
});

test("worker keys become the Intern; human names are kept", () => {
  assert.equal(internName("worker_company_records_lookup-document_drafting"), "Intern");
  assert.equal(internName("Rae"), "Rae");
  assert.equal(humanizeKey("proprietary_data"), "Proprietary data");
  assert.equal(humanizeKey("Growth research"), "Growth research");
});

test("delegation keeps the assignment, hides capability prose, and keeps short roles and authority notes", () => {
  const long: ActivityItem = {
    id: "a",
    type: "intern_assigned",
    occurredAt: NOW,
    actor: { kind: "somebody", label: "Somebody" },
    title: "Somebody assigned worker_x_y",
    importance: "major",
    payload: {
      intern: { id: "worker_x_y", label: "worker_x_y", specialty: "Retrieve the requested facts from company records and record them with their source. Report gaps…", state: "idle" },
      assignmentTitle: "Messaging diagnosis completed",
      scope: "The principal problems in the product launch messaging are documented, supported by the available evidence, prioritized by likely impact, and linked to the audience response.",
    },
  };
  const html = renderToStaticMarkup(createElement(Activity, { items: [long] }));
  const text = defaultVisibleText(html);
  assert.ok(text.includes("Messaging diagnosis completed"));
  assert.ok(text.includes("Manager"));
  assert.ok(!text.includes("Retrieve the requested facts"));
  assert.ok(html.includes("<summary>Brief</summary>"), "long scope sits behind a disclosure");

  const short: ActivityItem = {
    ...long,
    id: "b",
    payload: {
      intern: { id: "w1", label: "Rae", specialty: "Growth research", state: "assigned" },
      assignmentTitle: "Diagnose the launch message",
      scope: "Inspect launch context.",
      authorityNote: "Bounded assignment · no spending authority",
    },
  };
  const shortText = defaultVisibleText(renderToStaticMarkup(createElement(Activity, { items: [short] })));
  assert.ok(shortText.includes("Rae"));
  assert.ok(shortText.includes("Growth research"));
  assert.ok(shortText.includes("Inspect launch context."));
  assert.ok(shortText.includes("Bounded assignment · no spending authority"));
});

test("evidence gap leads with what is missing without reading as a verification claim", () => {
  const item: ActivityItem = {
    id: "g",
    type: "evidence_gap_identified",
    occurredAt: NOW,
    actor: { kind: "somebody", label: "Somebody" },
    title: "Identified missing input",
    detail: "Verified launch context and evidence for the product’s current messaging.",
    importance: "standard",
  };
  assert.equal(
    presentActivity(item).title,
    "Somebody still needs verified launch context and evidence for the product’s current messaging.",
  );
  const text = defaultVisibleText(renderToStaticMarkup(createElement(Activity, { items: [item] })));
  assert.ok(text.includes("Missing input"));
  assert.ok(!text.includes("Missing proof"));
});

test("receipts: full facts once per acquisition, provenance and transaction truth on every step", () => {
  const acquisition: AcquisitionView = {
    id: "int_1",
    resourceLabel: "proprietary_data",
    providerLabel: "somebody_controlled_test",
    amount: { amount: "18", currency: "USDC" },
    status: "verified",
    resultSummary: "Audience language patterns.",
    provenance: "live",
    transaction: { status: "confirmed", label: "Settled on X Layer" },
    updatedAt: NOW,
  };
  const step = (id: string, type: ActivityItem["type"], title: string): ActivityItem => ({
    id,
    type,
    occurredAt: NOW,
    actor: { kind: "somebody", label: "Somebody" },
    title,
    importance: "standard",
    related: { acquisitionId: "int_1" },
    provenance: "live",
  });
  const items = [
    step("s1", "acquisition_started", "Somebody authorized acquiring proprietary_data"),
    step("s2", "external_result_received", "Received a result for proprietary_data"),
    step("s3", "external_result_verified", "Verified the result for proprietary_data"),
  ];
  const html = renderToStaticMarkup(createElement(Activity, { items, acquisitions: [acquisition] }));
  const text = defaultVisibleText(html);
  assert.equal(html.split("v6-receipt-grid").length - 1, 1, "receipt grid renders once");
  assert.equal(html.split("Audience language patterns.").length - 1, 1, "result summary renders once");
  assert.equal(html.split(">Live<").length - 1, 3, "provenance stays on every step");
  assert.ok(text.includes("18 USDC"));
  assert.ok(text.includes("Cost"));
  assert.ok(text.includes("Settled on X Layer"), "transaction label renders exactly as supplied");
  assert.ok(html.includes('data-transaction-status="confirmed"'));
  assert.ok(text.includes("Authorized getting proprietary data"));
  assert.ok(text.includes("Somebody controlled test"));
});

test("a repeated identical finding collapses to one line; a new finding stays prominent", () => {
  const finding = (id: string, text: string): ActivityItem => ({
    id,
    type: "finding_added",
    occurredAt: NOW,
    actor: { kind: "intern", id: "worker_a_b", label: "worker_a_b" },
    title: "Launch context and goals",
    importance: "standard",
    payload: { finding: text, evidenceRefs: [{ id: id + "ev", label: "Launch context and goals" }] },
  });
  const html = renderToStaticMarkup(
    createElement(Activity, { items: [finding("f1", "Goal: relaunch."), finding("f2", "Goal: relaunch."), finding("f3", "New fact.")] }),
  );
  assert.equal(html.split("v6-finding-quote").length - 1, 2);
  assert.ok(html.includes("Same finding as earlier"));
  assert.ok(html.includes("“New fact.”"));
  assert.ok(!html.includes("worker_a_b"));
});

test("a failed verification never renders the verified stamp", () => {
  const item: ActivityItem = {
    id: "v",
    type: "verification_completed",
    occurredAt: NOW,
    actor: { kind: "somebody", label: "Somebody" },
    title: "The deliverable does not yet meet the required outcome",
    importance: "major",
    payload: { checks: [{ label: "Meets the minimum completion bar", status: "failed" }] },
  };
  const html = renderToStaticMarkup(createElement(Activity, { items: [item] }));
  assert.ok(!html.includes("verified"), "no verified stamp for a failed check");
  assert.ok(html.includes("Not yet"));
  assert.ok(!html.includes("v6-event--done"));
});

test("work report and acceptance are compact product lines", () => {
  const actor = { kind: "intern" as const, id: "worker_a_b", label: "worker_a_b" };
  const report: ActivityItem = {
    id: "r",
    type: "work_summary",
    occurredAt: NOW,
    actor,
    title: "worker_a_b reported back",
    importance: "minor",
    payload: { summary: "application-verified against the current revision's proof obligations" },
  };
  const accepted: ActivityItem = {
    id: "c",
    type: "work_completed",
    occurredAt: NOW,
    actor,
    title: "worker_a_b's work was accepted",
    detail: "Messaging diagnosis completed",
    importance: "standard",
  };
  const text = defaultVisibleText(renderToStaticMarkup(createElement(Activity, { items: [report, accepted] })));
  assert.ok(text.includes("The Intern reported back"));
  assert.ok(text.includes("Somebody checked it against the brief."));
  assert.ok(text.includes("Somebody accepted the Intern's work"));
  // A real worker summary is work content and stays verbatim.
  const real = presentActivity({ ...report, payload: { summary: "Drafted three headline options." } });
  assert.equal(real.detail, "Drafted three headline options.");
});

test("Deliverables default view: kind/version, title, status, description, next move; unknowns on demand", () => {
  const html = renderToStaticMarkup(
    createElement(Deliverables, {
      deliverables: [
        {
          id: "d",
          title: "Launch page headline and message",
          type: "document",
          version: 3,
          status: "verified",
          summary: "Version 3: clarified the audience and offer.",
          recommendedNextMove: "Run a controlled comparison.",
          unknowns: ["No test results yet."],
          updatedAt: NOW,
        },
      ],
    }),
  );
  const text = defaultVisibleText(html);
  assert.ok(text.includes("Document · v3"));
  assert.ok(text.includes("Verified"));
  assert.ok(text.includes("Clarified the audience and offer."));
  assert.ok(!text.includes("Version 3:"));
  assert.ok(text.includes("Next move"));
  assert.ok(text.includes("Run a controlled comparison."));
  assert.ok(text.includes("1 remaining unknown"));
  assert.ok(html.includes("No test results yet."), "unknown stays in the DOM behind the disclosure");
});

test("Checkpoints default to label + state; definitions open on demand; blockers stay visible", () => {
  const progress: ProgressView = {
    currentPhase: "Messaging diagnosis completed",
    checkpoints: [
      { id: "c1", label: "Launch context and evidence available", state: "complete", detail: "Long definition of the evidence requirement." },
      { id: "c2", label: "Messaging diagnosis completed", state: "active", detail: "Long definition of the diagnosis requirement." },
      { id: "c3", label: "Approval recorded", state: "blocked", detail: "Waiting on founder approval for spend." },
    ],
  };
  const html = renderToStaticMarkup(createElement(Checkpoints, { progress }));
  const text = defaultVisibleText(html);
  assert.ok(!text.includes("Long definition of the evidence requirement."));
  assert.ok(!text.includes("Long definition of the diagnosis requirement."));
  assert.ok(html.includes("Long definition of the evidence requirement."), "definition is still available");
  assert.ok(text.includes("Waiting on founder approval for spend."), "blocked detail is never hidden");
  assert.ok(!html.includes("v6-checkpoints-phase"), "phase that repeats a checkpoint label is not duplicated");
  assert.ok(text.includes("1 / 3"));
});
