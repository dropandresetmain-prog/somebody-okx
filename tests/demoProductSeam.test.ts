// Level 2 — product data seam: live vs demo playback switch together.
// No Convex; the seam is exercised by projecting through committed scenario frames.

import test from "node:test";
import assert from "node:assert/strict";
import { lunaRelaunchScenario } from "../lib/demo/scenarios/lunaRelaunch";
import {
  createIdleEngine,
  engineReset,
  engineRun,
  engineSnapshot,
  engineTick,
} from "../lib/demo/playback";

test("live/idle mode exposes no demo frame (Convex path owns data)", () => {
  const snap = engineSnapshot(createIdleEngine(lunaRelaunchScenario), 0);
  assert.equal(snap.active, false);
  assert.equal(snap.currentFrame, null);
});

test("playback mode returns current DemoFrame product contract views", () => {
  let engine = createIdleEngine(lunaRelaunchScenario, "demo_sequence", 0);
  engine = engineRun(engine, 0);
  const snap = engineSnapshot(engine, 0);
  assert.ok(snap.currentFrame);
  assert.equal(snap.currentFrame!.workspace.objective.id, lunaRelaunchScenario.source.objectiveId);
  assert.ok(Array.isArray(snap.currentFrame!.workspace.activity));
  assert.ok(Array.isArray(snap.currentFrame!.objectiveList.inProgress) || Array.isArray(snap.currentFrame!.objectiveList.done));
});

test("sidebar list and workspace switch together on the same frame", () => {
  let engine = createIdleEngine(lunaRelaunchScenario, "demo_sequence", 0);
  engine = engineRun(engine, 0);
  // Advance to completed frame (last demo sequence entry at 26s).
  engine = engineTick(engine, 26_000);
  const snap = engineSnapshot(engine, 26_000);
  assert.ok(snap.currentFrame);
  const { objectiveList, workspace } = snap.currentFrame!;
  assert.equal(workspace.objective.status, "completed");
  assert.equal(objectiveList.done.length, 1);
  assert.equal(objectiveList.done[0]!.id, workspace.objective.id);
  assert.equal(objectiveList.inProgress.length, 0);
});

test("leaving playback restores idle/live data ownership", () => {
  let engine = createIdleEngine(lunaRelaunchScenario, "demo_sequence", 0);
  engine = engineRun(engine, 0);
  assert.equal(engineSnapshot(engine, 0).active, true);
  engine = engineReset(engine);
  assert.equal(engineSnapshot(engine, 0).active, false);
  assert.equal(engineSnapshot(engine, 0).currentFrame, null);
});

test("scenario frames are product-contract shaped (no raw Requirement/Intent arrays)", () => {
  for (const frame of lunaRelaunchScenario.frames) {
    const view = frame.workspace as Record<string, unknown>;
    assert.ok(view.objective);
    assert.ok(view.somebodyNow);
    assert.ok(view.progress);
    assert.ok(Array.isArray(view.activity));
    assert.ok(Array.isArray(view.deliverables));
    assert.ok(Array.isArray(view.acquisitions));
    assert.equal(view.requirements, undefined);
    assert.equal(view.assignments, undefined);
    assert.equal(view.executionIntents, undefined);
    assert.equal(view.intents, undefined);
    assert.equal(view.decisions, undefined);
  }
});

test("historical acquisition provenance stays simulation (not recorded_replay)", () => {
  assert.equal(lunaRelaunchScenario.source.acquisitionProvenance, "simulation");
  const final = lunaRelaunchScenario.frames[lunaRelaunchScenario.frames.length - 1]!;
  const acq = final.workspace.acquisitions.find((row) => row.provenance);
  assert.ok(acq);
  assert.equal(acq!.provenance, "simulation");
  assert.notEqual(acq!.provenance, "recorded_replay");
});
