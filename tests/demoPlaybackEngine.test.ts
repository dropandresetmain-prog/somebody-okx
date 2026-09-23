// Level 1 — demo playback state machine (fake timers, no real sleeps).

import test from "node:test";
import assert from "node:assert/strict";
import type { ObjectiveListView, ObjectiveWorkspaceView } from "../app/product/contracts";
import {
  createIdleEngine,
  durationForMode,
  enginePause,
  engineReset,
  engineRestart,
  engineResume,
  engineRun,
  engineSnapshot,
  engineTick,
  formatPlaybackClock,
  frameIndexAtElapsed,
  type DemoScenario,
} from "../lib/demo/playback";
import { lunaRelaunchScenario } from "../lib/demo/scenarios/lunaRelaunch";

const NOW = 1_700_000_000_000;

function emptyList(): ObjectiveListView {
  return { inProgress: [], needsYou: [], done: [] };
}

function workspace(status: ObjectiveWorkspaceView["objective"]["status"], id = "obj_demo"): ObjectiveWorkspaceView {
  return {
    objective: {
      id,
      title: "Demo objective",
      request: "Demo request",
      status,
      createdAt: NOW,
      updatedAt: NOW,
    },
    progress: { checkpoints: [] },
    somebodyNow: { state: status === "completed" ? "completed" : "working", headline: "h", detail: "d", updatedAt: NOW },
    currentWork: null,
    activity: [],
    deliverables: [],
    acquisitions: [],
    attention: null,
    availableActions: [],
  };
}

function scenario(): DemoScenario {
  const frames = [
    { elapsedMs: 0, objectiveList: emptyList(), workspace: workspace("starting") },
    { elapsedMs: 10_000, objectiveList: emptyList(), workspace: workspace("working") },
    { elapsedMs: 20_000, objectiveList: emptyList(), workspace: workspace("completed") },
  ];
  return {
    id: "test-scenario",
    label: "Test",
    source: {
      candidateSha: "abc1234",
      objectiveId: "obj_demo",
      model: "openai/gpt-5.6-luna",
      evidencePath: "test.json",
      acquisitionProvenance: "simulation",
    },
    originalDurationMs: 20_000,
    demoSequenceDurationMs: 6_000,
    frames,
    originalSequence: [
      { frameIndex: 0, atMs: 0 },
      { frameIndex: 1, atMs: 10_000 },
      { frameIndex: 2, atMs: 20_000 },
    ],
    demoSequence: [
      { frameIndex: 0, atMs: 0 },
      { frameIndex: 1, atMs: 3_000 },
      { frameIndex: 2, atMs: 6_000 },
    ],
  };
}

test("inactive engine is live mode (no current frame)", () => {
  const engine = createIdleEngine(scenario(), "demo_sequence", 3_000);
  const snap = engineSnapshot(engine, 0);
  assert.equal(snap.active, false);
  assert.equal(snap.phase, "idle");
  assert.equal(snap.currentFrame, null);
});

test("Run with 3s start delay enters delaying then playing", () => {
  let engine = createIdleEngine(scenario(), "demo_sequence", 3_000);
  engine = engineRun(engine, 1_000);
  let snap = engineSnapshot(engine, 1_000);
  assert.equal(snap.phase, "delaying");
  assert.equal(snap.active, true);
  assert.ok(snap.delayRemainingMs > 2_900);

  engine = engineTick(engine, 1_000 + 3_000);
  snap = engineSnapshot(engine, 1_000 + 3_000);
  assert.equal(snap.phase, "playing");
  assert.equal(snap.elapsedMs, 0);
  assert.equal(snap.frameIndex, 0);
});

test("frame progression follows demo sequence timing", () => {
  let engine = createIdleEngine(scenario(), "demo_sequence", 0);
  engine = engineRun(engine, 0);
  assert.equal(engineSnapshot(engine, 0).frameIndex, 0);
  assert.equal(engineSnapshot(engine, 2_999).frameIndex, 0);
  assert.equal(engineSnapshot(engine, 3_000).frameIndex, 1);
  assert.equal(engineSnapshot(engine, 6_000).frameIndex, 2);
  engine = engineTick(engine, 6_000);
  assert.equal(engineSnapshot(engine, 6_000).phase, "finished");
});

test("original timing uses original duration and sequence", () => {
  let engine = createIdleEngine(scenario(), "original", 0);
  engine = engineRun(engine, 0);
  const snap = engineSnapshot(engine, 0);
  assert.equal(snap.durationMs, 20_000);
  assert.equal(frameIndexAtElapsed(scenario(), "original", 10_000), 1);
  assert.equal(engineSnapshot(engine, 10_000).frameIndex, 1);
});

test("pause freezes elapsed; resume continues without jump", () => {
  let engine = createIdleEngine(scenario(), "demo_sequence", 0);
  engine = engineRun(engine, 0);
  engine = enginePause(engine, 2_000);
  let snap = engineSnapshot(engine, 2_000);
  assert.equal(snap.phase, "paused");
  assert.equal(snap.elapsedMs, 2_000);

  // Wall clock advances while paused — elapsed must stay frozen.
  snap = engineSnapshot(engine, 50_000);
  assert.equal(snap.elapsedMs, 2_000);

  engine = engineResume(engine, 50_000);
  snap = engineSnapshot(engine, 51_000);
  assert.equal(snap.phase, "playing");
  assert.equal(snap.elapsedMs, 3_000);
});

test("pause/resume during start delay preserves remaining countdown", () => {
  let engine = createIdleEngine(scenario(), "demo_sequence", 3_000);
  engine = engineRun(engine, 0);
  engine = enginePause(engine, 1_000);
  assert.equal(engineSnapshot(engine, 1_000).delayRemainingMs, 2_000);
  engine = engineResume(engine, 10_000);
  assert.equal(engineSnapshot(engine, 10_000).phase, "delaying");
  assert.equal(engineSnapshot(engine, 10_000).delayRemainingMs, 2_000);
  engine = engineTick(engine, 12_000);
  assert.equal(engineSnapshot(engine, 12_000).phase, "playing");
});

test("restart returns to frame 0 and begins again", () => {
  let engine = createIdleEngine(scenario(), "demo_sequence", 0);
  engine = engineRun(engine, 0);
  engine = engineTick(engineTick(engine, 6_000), 6_000);
  assert.equal(engineSnapshot(engine, 6_000).phase, "finished");
  engine = engineRestart(engine, 100);
  assert.equal(engineSnapshot(engine, 100).phase, "playing");
  assert.equal(engineSnapshot(engine, 100).elapsedMs, 0);
  assert.equal(engineSnapshot(engine, 100).frameIndex, 0);
});

test("reset exits playback (live mode) without changing scenario content", () => {
  let engine = createIdleEngine(scenario(), "demo_sequence", 3_000);
  engine = engineRun(engine, 0);
  engine = engineTick(engine, 3_000);
  engine = engineReset(engine);
  const snap = engineSnapshot(engine, 10_000);
  assert.equal(snap.active, false);
  assert.equal(snap.phase, "idle");
  assert.equal(snap.currentFrame, null);
  assert.equal(snap.startDelayMs, 3_000);
});

test("formatPlaybackClock shows one decimal second", () => {
  assert.equal(formatPlaybackClock(18_400, 26_000), "18.4s / 26.0s");
  assert.equal(formatPlaybackClock(0, 141_000), "0.0s / 141.0s");
});

test("immediate mode jumps straight to the final frame with no delay or pacing", () => {
  const scenario = lunaRelaunchScenario;
  let engine = createIdleEngine(scenario, "immediate", 3_000);
  engine = engineRun(engine, 1_000);
  const snap = engineSnapshot(engine, 1_000);
  assert.equal(snap.phase, "finished");
  assert.equal(snap.delayRemainingMs, 0);
  assert.equal(snap.durationMs, 0);
  assert.equal(snap.frameIndex, scenario.frames.length - 1);
  assert.equal(snap.currentFrame, scenario.frames[scenario.frames.length - 1]);
  // Same frames — immediate never changes scenario content or other modes.
  assert.equal(durationForMode(scenario, "original"), 141_000);
  assert.equal(durationForMode(scenario, "demo_sequence"), 70_000);
});
