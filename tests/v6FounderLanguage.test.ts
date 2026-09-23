// V6 founder language — presentation-only humanization of recorded Product
// Contract copy. Exercised against the committed Luna replay frames (the real
// historical run) plus small fixtures. No Convex, no model, no commands.

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { V6WorkspaceView } from "../app/product/V6WorkspaceView";
import {
  activityHeadline,
  actorDisplayName,
  clipText,
  decisionOptionLabel,
  humanizeProse,
  internDisplayName,
  isInternalWorkerKey,
} from "../app/product/humanize";
import type { ActivityItem } from "../app/product/contracts";
import { lunaRelaunchScenario } from "../lib/demo/scenarios/lunaRelaunch";

const WORKER_KEY =
  "worker_company_records_lookup-document_drafting-growth_launch_operations-public_information_research";

function renderFrame(index: number): string {
  const frame = lunaRelaunchScenario.frames[index]!;
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

/** Founder-visible text only: tags and attributes (data-*, ids) stripped. */
function visibleText(html: string): string {
  return html
    .replace(/<[^>]*>/g, " ")
    .replace(/&quot;/g, '"')
    .replace(/&#x27;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ");
}

const ALL_FRAMES = lunaRelaunchScenario.frames.map((_, index) => index);

test("raw worker_* identifiers are never founder-visible in any replay frame", () => {
  for (const index of ALL_FRAMES) {
    const text = visibleText(renderFrame(index));
    assert.ok(!/worker_/i.test(text), `frame ${index} shows a raw worker key`);
  }
});

test("the Intern is named as Intern", () => {
  const text = visibleText(renderFrame(lunaRelaunchScenario.frames.length - 1));
  assert.ok(text.includes("Somebody assigned the Intern"));
  assert.ok(text.includes("Intern started work"));
  assert.ok(text.includes("Intern resumed with the acquired result"));
  assert.ok(text.includes("Intern finding"));
});

test("no duplicated actor phrasing (Somebody Somebody / Intern Intern)", () => {
  for (const index of ALL_FRAMES) {
    const text = visibleText(renderFrame(index));
    assert.ok(!/\bSomebody Somebody\b/.test(text), `frame ${index} duplicates Somebody`);
    assert.ok(!/\bIntern Intern\b/.test(text), `frame ${index} duplicates Intern`);
  }
});

test("manager decisions speak MAKE/BUY product language, not eligibility prose", () => {
  const text = visibleText(renderFrame(lunaRelaunchScenario.frames.length - 1));
  assert.ok(text.includes("Somebody decided to handle it internally"));
  assert.ok(text.includes("Somebody decided to bring in outside help"));
  assert.ok(text.includes("Use the Intern"));
  assert.ok(text.includes("Founder narrative pulse"));
  assert.ok(!text.includes("eligible, available and capability-matched"));
  assert.ok(!text.includes("chose to make:"));
  assert.ok(!text.includes("somebody_controlled_test"));
});

test("engine vocabulary stays out of the normal replay UI", () => {
  const banned = [
    "proof obligations",
    "application-verified",
    "capability-matched",
    "outside boundary",
    "proprietary_data",
    "relaunch_ready",
    "launch/page-message",
    "Retrieve the requested facts from company records",
  ];
  for (const index of ALL_FRAMES) {
    const text = visibleText(renderFrame(index));
    for (const phrase of banned) {
      assert.ok(!text.includes(phrase), `frame ${index} shows engine phrase "${phrase}"`);
    }
  }
});

test("decision rationale sits behind a Why disclosure and is bounded", () => {
  const html = renderFrame(lunaRelaunchScenario.frames.length - 1);
  const whys = [...html.matchAll(/<details class="v6-decision-reason"><summary>Why<\/summary><p>([^<]*)<\/p><\/details>/g)];
  assert.equal(whys.length, 4);
  for (const match of whys) assert.ok(match[1]!.length <= 241);
});

test("checkpoints show label + state; long detail only for the active one, clipped", () => {
  const mid = renderFrame(6);
  assert.equal((mid.match(/class="v6-checkpoint-detail/g) ?? []).length, 1);
  const detail = mid.match(/class="v6-checkpoint-detail[^>]*>([^<]*)</)![1]!;
  assert.ok(detail.length <= 111);
  const final = renderFrame(lunaRelaunchScenario.frames.length - 1);
  assert.equal((final.match(/class="v6-checkpoint-detail/g) ?? []).length, 0);
  for (const label of ["Launch context and evidence available", "Messaging diagnosis completed", "Relaunch messaging package ready"]) {
    assert.ok(final.includes(label));
  }
});

test("Somebody card: humanized headline, bounded detail, no duplicated working-now line", () => {
  const waiting = visibleText(renderFrame(4));
  assert.ok(waiting.includes("Waiting on Proprietary data") || waiting.includes("Waiting on proprietary data"));
  assert.ok(waiting.includes("Outside help is working on it."));
  const working = renderFrame(6);
  assert.ok(!working.includes("Working now: Messaging diagnosis completed"));
});

test("presentation is deterministic", () => {
  for (const index of ALL_FRAMES) assert.equal(renderFrame(index), renderFrame(index));
});

test("historical source data is unchanged by presentation", () => {
  const final = lunaRelaunchScenario.frames[lunaRelaunchScenario.frames.length - 1]!.workspace;
  const snapshot = JSON.stringify(final);
  renderFrame(lunaRelaunchScenario.frames.length - 1);
  assert.equal(JSON.stringify(final), snapshot);
  const assigned = final.activity.find((item) => item.type === "intern_assigned")!;
  assert.equal(assigned.title, `Somebody assigned ${WORKER_KEY}`);
  const decision = final.activity.find((item) => item.type === "manager_decision")!;
  assert.equal(decision.title, "Somebody chose to make: eligible, available and capability-matched");
  assert.equal(final.acquisitions[0]!.provenance, "simulation");
  assert.equal(final.acquisitions[0]!.resourceLabel, "proprietary_data");
});

test("replay frames carry no founder actions, so Replay cannot issue Product Commands", () => {
  for (const frame of lunaRelaunchScenario.frames) {
    assert.equal(frame.workspace.attention, null);
    assert.deepEqual(frame.workspace.availableActions, []);
  }
  for (const file of ["app/product/humanize.ts", "lib/demo/playback.ts", "app/demo/DemoPlaybackProvider.tsx"]) {
    const src = readFileSync(file, "utf8");
    assert.ok(!src.includes("productCommands"), `${file} must not reference Product Commands`);
    assert.ok(!src.includes("useMutation"), `${file} must not mutate`);
  }
});

// ── Helper-level rules ───────────────────────────────────────────────────────

test("worker keys map to Intern; human labels are kept", () => {
  assert.equal(isInternalWorkerKey(WORKER_KEY), true);
  assert.equal(internDisplayName({ label: WORKER_KEY }), "Intern");
  assert.equal(internDisplayName({ label: "Rae" }), "Rae");
  assert.equal(actorDisplayName({ kind: "intern", id: WORKER_KEY, label: WORKER_KEY }), "Intern");
  assert.equal(actorDisplayName({ kind: "external", label: "somebody_controlled_test" }), "Controlled test provider");
});

test("headline names the actor exactly once", () => {
  const base = { id: "a", occurredAt: 0, importance: "standard" as const };
  const cases: [ActivityItem, string][] = [
    [
      { ...base, type: "work_started", actor: { kind: "intern", id: WORKER_KEY, label: WORKER_KEY }, title: `${WORKER_KEY} started work` },
      "Intern started work",
    ],
    [
      { ...base, type: "work_completed", actor: { kind: "intern", id: WORKER_KEY, label: WORKER_KEY }, title: `${WORKER_KEY}'s work was accepted` },
      "Intern's work was accepted",
    ],
    [{ ...base, type: "objective_interpreted", actor: { kind: "somebody", label: "Somebody" }, title: "Somebody defined the outcome" }, "Somebody defined the outcome"],
    [{ ...base, type: "evidence_gap_identified", actor: { kind: "somebody", label: "Somebody" }, title: "Identified missing input" }, "Somebody identified missing input"],
    [{ ...base, type: "objective_completed", actor: { kind: "somebody", label: "Somebody" }, title: "Objective complete" }, "Objective complete"],
    [{ ...base, type: "manager_decision", actor: { kind: "somebody", label: "Somebody" }, title: "Somebody chose to make: landing copy" }, "Somebody chose to make: landing copy"],
  ];
  for (const [item, expected] of cases) assert.equal(activityHeadline(item), expected);
});

test("decision option labels: engine eligibility → approach wording; human labels kept", () => {
  assert.equal(decisionOptionLabel({ approach: "MAKE", label: "eligible, available and capability-matched" }), "Use the Intern");
  assert.equal(decisionOptionLabel({ approach: "BUY", label: "somebody_controlled_test:founder_narrative_pulse" }), "Founder narrative pulse");
  assert.equal(decisionOptionLabel({ approach: "BUY", label: "Acquire audience-language evidence" }), "Acquire audience-language evidence");
});

test("humanizeProse leaves ids with digits alone and clipText cuts on word boundaries", () => {
  assert.equal(humanizeProse("meets the relaunch_ready minimum bar"), "meets the relaunch ready minimum bar");
  assert.equal(humanizeProse("cites sim_result_6269e01f"), "cites sim_result_6269e01f");
  assert.equal(clipText("one two three four", 9), "one two…");
  assert.equal(clipText("short", 20), "short");
});
