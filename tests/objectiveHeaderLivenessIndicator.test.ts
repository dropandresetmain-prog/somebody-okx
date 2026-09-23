// Incident #3 — visible "working" liveness indicator (task: founder-live-postrun).
// Proves the animated three-dot badge is strictly gated on liveness.active,
// shows phase-grounded copy from ObjectiveLivenessView.phase, and keeps
// showing through the "taking longer than usual" stale case (still active).
// Pure presentational render tests — same pattern as tests/v6ProductWorkspace.test.ts.

import test from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { ObjectiveLivenessView, ObjectiveView, SomebodyNowView } from "../app/product/contracts";
import { ObjectiveHeader } from "../app/product/components/ObjectiveHeader";

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

function liveness(over: Partial<ObjectiveLivenessView> = {}): ObjectiveLivenessView {
  return { active: true, phase: "working", lastProgressAt: NOW, detail: "Choosing and executing the next bounded step.", ...over };
}

function somebodyNow(over: Partial<SomebodyNowView> = {}): SomebodyNowView {
  return { state: "working", headline: "Working on it", detail: "An intern is doing bounded work.", updatedAt: NOW, ...over };
}

function render(over: { liveness?: Partial<ObjectiveLivenessView>; somebodyNow?: Partial<SomebodyNowView>; objective?: Partial<ObjectiveView> } = {}) {
  return renderToStaticMarkup(
    createElement(ObjectiveHeader, {
      objective: objective(over.objective),
      liveness: liveness(over.liveness),
      somebodyNow: somebodyNow(over.somebodyNow),
    }),
  );
}

test("animated working badge is present while liveness.active is true", () => {
  const html = render();
  assert.ok(html.includes("v6-liveness-working"), "badge container missing");
  assert.ok(html.includes("v6-liveness-working-dots"), "animated dots missing");
});

test("animated working badge is absent for each inactive liveness case", () => {
  const cases: Array<{ objective?: Partial<ObjectiveView>; somebodyNow?: Partial<SomebodyNowView>; liveness: Partial<ObjectiveLivenessView> }> = [
    {
      objective: { status: "completed" },
      somebodyNow: { state: "completed", headline: "The required outcome is verified.", detail: "Saved." },
      liveness: { active: false, phase: "idle" },
    },
    {
      objective: { status: "blocked" },
      somebodyNow: { state: "blocked", headline: "Stopped", detail: "Missing authority." },
      liveness: { active: false, phase: "idle" },
    },
    {
      objective: { status: "needs_you" },
      somebodyNow: { state: "needs_you", headline: "Needs you", detail: "Approve spend." },
      liveness: { active: false, phase: "idle" },
    },
    {
      // idle / never-started
      liveness: { active: false, phase: "idle" },
    },
  ];

  for (const c of cases) {
    const html = render(c);
    assert.ok(!html.includes("v6-liveness-working"), `badge should be absent for ${JSON.stringify(c.liveness)}`);
  }
});

test("phase copy shown in the badge matches liveness.phase, not somebodyNow.state", () => {
  const interpreting = render({ liveness: { phase: "interpreting" } });
  assert.ok(interpreting.includes("Understanding your objective…"));

  const deciding = render({ liveness: { phase: "deciding" } });
  assert.ok(deciding.includes("Choosing the next move…"));

  const verifying = render({ liveness: { phase: "verifying" }, somebodyNow: { state: "verifying", headline: "Checking the outcome", detail: "" } });
  assert.ok(verifying.includes("Verifying the result…"));
});

test("stale ('taking longer than usual') case keeps both the animation and the honest stale-age copy", () => {
  // active stays true; lastProgressAt is far in the past (>3 minutes) so
  // formatProgressAge falls into the stale branch. The component computes
  // age against real wall-clock time (useState(() => Date.now())), not the
  // fixed NOW test constant, so the fixture must be offset from Date.now().
  // The backend clock itself is never reset by the frontend — this fixture
  // simply supplies an old timestamp, as the real projection would.
  const html = render({ liveness: { active: true, phase: "working", lastProgressAt: Date.now() - 5 * 60_000 } });
  assert.ok(html.includes("v6-liveness-working"), "animation must stay while still active");
  assert.ok(html.includes("v6-liveness-working-dots"));
  assert.ok(html.includes("This step is taking longer than usual"), "honest stale copy must still show");
  assert.ok(html.includes("Your work is still saved."));
});
