import { test } from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { FixtureWorkspace } from "../app/m5/FixtureWorkspace";
import { fixtureScenarios } from "../app/m5/fixtures";

for (const scenario of fixtureScenarios) test(`${scenario.id}: every snapshot renders without a provider or runtime`, () => {
  for (const snapshot of scenario.snapshots) {
    const html = renderToStaticMarkup(createElement(FixtureWorkspace, { initialScenario: scenario.id, initialMoment: snapshot.id }));
    assert.ok(html.includes("Fixture workspace · not live"));
    assert.ok(html.includes("Somebody now"));
    assert.ok(html.includes("Done means."));
    assert.ok(html.includes("Ball with"));
    assert.ok(html.includes('aria-current="page"'));
    assert.ok(!html.includes("NEXT_PUBLIC_CONVEX_URL is not set"));
    if (snapshot.view.outcome) assert.ok(html.includes("Minimum completion bar"));
    if (snapshot.view.requirements.some(r => r.priority === "supporting")) assert.ok(html.includes("Supporting · not the completion bar"));
  }
});

test("the initially selected Objective and deterministic scenario controls are accessible", () => {
  const html = renderToStaticMarkup(createElement(FixtureWorkspace, { initialScenario: "partner", initialMoment: "result" }));
  assert.match(html, /<h1>A partner worth pursuing<\/h1>/);
  assert.ok(html.includes("Scenario moment"));
  assert.ok(html.includes("Start from the Objective"));
  assert.ok(html.includes("The worker is done. The Objective is not."));
  assert.ok(html.includes('href="#mission"'));
});
