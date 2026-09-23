// Level 3 — Demo Console + final completed frame render (no Convex).

import test from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { DemoConsole } from "../app/demo/DemoConsole";
import { DemoPlaybackProvider } from "../app/demo/DemoPlaybackProvider";
import { V6WorkspaceView } from "../app/product/V6WorkspaceView";
import { lunaRelaunchScenario } from "../lib/demo/scenarios/lunaRelaunch";

test("Demo Console popover opens with scenario metadata and mode controls", () => {
  const html = renderToStaticMarkup(
    createElement(DemoPlaybackProvider, {
      enabled: true,
      scenario: lunaRelaunchScenario,
      children: createElement(DemoConsole, { defaultOpen: true }),
    }),
  );
  assert.ok(html.includes("Luna — Relaunch Recovery"));
  assert.ok(html.includes("Original timing"));
  assert.ok(html.includes("Demo sequence"));
  assert.ok(html.includes("141s"));
  assert.ok(html.includes("70s"));
  assert.ok(html.includes("obj_1790046504201_vporlj"));
  assert.ok(html.includes("8f53da0"));
  assert.ok(html.includes("Run Scenario"));
  assert.ok(html.includes("simulation"));
});

test("Demo Console button hidden when feature flag is false", () => {
  const html = renderToStaticMarkup(
    createElement(DemoPlaybackProvider, {
      enabled: false,
      scenario: lunaRelaunchScenario,
      children: createElement(DemoConsole),
    }),
  );
  assert.equal(html.includes("Demo Console"), false);
  assert.equal(html.includes("data-demo-console"), false);
});

test("Demo Console button visible when feature flag is true", () => {
  const html = renderToStaticMarkup(
    createElement(DemoPlaybackProvider, {
      enabled: true,
      scenario: lunaRelaunchScenario,
      children: createElement(DemoConsole),
    }),
  );
  assert.ok(html.includes("data-demo-console=\"true\""));
  assert.ok(html.includes("Demo Console"));
  assert.ok(html.includes("demo-console-trigger"));
});

test("final completed Luna frame renders verified deliverable + simulation provenance", () => {
  const frame = lunaRelaunchScenario.frames[lunaRelaunchScenario.frames.length - 1]!;
  const html = renderToStaticMarkup(
    createElement(V6WorkspaceView, {
      list: frame.objectiveList,
      selectedId: frame.workspace.objective.id,
      onSelect: () => {},
      onStartNew: () => {},
      main: { kind: "ready", view: frame.workspace },
    }),
  );
  assert.ok(html.includes('data-objective-status="completed"') || html.includes("completed") || html.includes("Done"));
  assert.ok(html.includes(frame.workspace.objective.id) || html.includes("Relaunch") || html.includes("launch"));
  // Provenance label from Acquisitions component
  assert.ok(html.toLowerCase().includes("simulation"));
  assert.equal(html.toLowerCase().includes("recorded_replay"), false);
  assert.ok(frame.workspace.deliverables.some((d) => d.status === "verified"));
});

test("scenario metadata carries selected Luna source truth", () => {
  assert.equal(lunaRelaunchScenario.source.objectiveId, "obj_1790046504201_vporlj");
  assert.equal(lunaRelaunchScenario.source.candidateSha, "8f53da0");
  assert.equal(lunaRelaunchScenario.source.model, "openai/gpt-5.6-luna");
  assert.equal(lunaRelaunchScenario.originalDurationMs, 141_000);
  assert.equal(lunaRelaunchScenario.demoSequenceDurationMs, 70_000);
  assert.equal(lunaRelaunchScenario.frames.length, 11);
});

test("demo sequence is ~0.5x the historical timing over the same frames", () => {
  const { originalSequence, demoSequence, frames } = lunaRelaunchScenario;
  assert.deepEqual(
    originalSequence.map((entry) => entry.atMs),
    [0, 19_635, 28_795, 41_112, 49_618, 50_432, 61_418, 77_439, 92_525, 112_788, 122_913],
  );
  assert.deepEqual(
    demoSequence.map((entry) => entry.atMs),
    [0, 9_800, 14_400, 20_600, 24_800, 25_200, 30_700, 38_700, 46_300, 56_400, 61_500],
  );
  assert.deepEqual(
    demoSequence.map((entry) => entry.frameIndex),
    frames.map((_, index) => index),
  );
  for (const [index, entry] of demoSequence.entries()) {
    const half = originalSequence[index]!.atMs / 2;
    assert.ok(Math.abs(entry.atMs - half) <= 500, `beat ${index} drifts from 0.5x: ${entry.atMs} vs ${half}`);
  }
  // Completed frame holds on screen for the tail of the sequence.
  const last = demoSequence[demoSequence.length - 1]!.atMs;
  assert.ok(lunaRelaunchScenario.demoSequenceDurationMs - last >= 8_000);
});
