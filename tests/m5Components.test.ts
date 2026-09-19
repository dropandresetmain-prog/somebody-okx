import { test } from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { FixtureWorkspace } from "../app/m5/FixtureWorkspace";
import { SystemXray } from "../app/m5/SystemXray";
import { fixtureScenarios, selectFixture } from "../app/m5/fixtures";
import { buildXray } from "../app/m5/xray";

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

test("company boundaries, staffing truth and rejected options are inspectable", () => {
  const html = renderToStaticMarkup(createElement(FixtureWorkspace, { initialScenario: "launch" }));
  assert.ok(html.includes("Inside your company"));
  assert.ok(html.includes("Outside your company"));
  assert.ok(html.includes("REUSE"));
  assert.ok(html.includes("MAKE / BUY / HYBRID"));
  assert.ok(html.includes("Generic growth wrapper"));
  assert.ok(html.includes("illustrative fixture quote"));
  assert.ok(html.includes("No run in progress"));
  assert.ok(html.includes("Recommendation only · not authorized"));
});

test("approval is a single explicit bounded action; blocked has no fake action", () => {
  const approval = renderToStaticMarkup(createElement(FixtureWorkspace, { initialScenario: "launch", initialMoment: "approval" }));
  assert.equal((approval.match(/Simulate: Approve up to/g) ?? []).length, 1);
  assert.ok(approval.includes("Fixture approval only. No money moves."));
  const blocked = renderToStaticMarkup(createElement(FixtureWorkspace, { initialScenario: "supplier" }));
  assert.ok(blocked.includes("Paused safely."));
  assert.ok(!blocked.includes("Simulate:"));
});

test("payment submission, settlement, result receipt and verification have distinct recorded markers", () => {
  for (const moment of ["submitted", "settled", "result", "verified"]) {
    const html = renderToStaticMarkup(createElement(FixtureWorkspace, { initialScenario: "launch", initialMoment: moment }));
    assert.ok(html.includes("One bounded acquisition"));
    const expected = { submitted: "submitted", settled: "settled", result: "result received", verified: "verified" }[moment];
    assert.match(html, new RegExp(`aria-current="step"[^]*?<strong>${expected}</strong>`));
    assert.ok(html.includes("Mission Story"));
    assert.ok(html.includes("Order does not imply causality."));
    assert.ok(!html.includes('id="completion-title"'));
  }
});

test("accepted completion exposes proof, revision history and uncompleted supporting outcomes", () => {
  const html = renderToStaticMarkup(createElement(FixtureWorkspace, { initialScenario: "launch", initialMoment: "completed" }));
  assert.ok(html.includes('id="completion-title"'));
  assert.ok(html.includes("Still pending / outside scope"));
  assert.ok(html.includes("No public launch or audience lift is claimed."));
  assert.ok(html.includes("Version 2"));
  assert.ok(html.includes("v1 ·"));
  assert.ok(html.includes('href="#evidence-pack"'));
  assert.ok(html.includes('id="evidence-pack"'));
});

test("System X-ray renders explicit nodes and relationships without invented causality", () => {
  const shellHtml = renderToStaticMarkup(createElement(FixtureWorkspace, { initialScenario: "launch", initialMoment: "completed" }));
  assert.ok(shellHtml.includes("System X-ray · secondary inspection"));
  const { snapshot } = selectFixture("launch", "completed");
  const xray = buildXray(snapshot.view);
  const html = renderToStaticMarkup(createElement(SystemXray, { xray }));
  assert.ok(html.includes("System X-ray"));
  assert.ok(html.includes("no inferred causality"));
  assert.ok(html.includes("No live backend — fixture data only"));
  assert.ok(html.includes("proof for"));
  assert.ok(html.includes("assigned to"));
  assert.ok(html.includes("accepts"));
  assert.ok(!html.includes("depends_on"));
  assert.ok(!html.includes("depends on"));
  assert.ok(!html.includes(">causes<"));
  assert.ok(!html.includes(">observe<"));
  assert.ok(!html.includes(">reduce<"));
  assert.ok(!html.includes(">decide<"));
  assert.ok(!html.includes(">settle<"));
});

test("X-ray node IDs match stable fixture IDs and relationships reference only known nodes", () => {
  for (const scenarioId of ["launch", "partner", "supplier"]) {
    const { snapshot } = selectFixture(scenarioId, undefined);
    const xray = buildXray(snapshot.view);
    const nodeIds = new Set(xray.nodes.map(n => n.id));
    assert.ok(nodeIds.has(snapshot.view.objective.objectiveKey));
    for (const rel of xray.relationships) {
      assert.ok(nodeIds.has(rel.from), `Dangling from: ${rel.from}`);
      assert.ok(nodeIds.has(rel.to), `Dangling to: ${rel.to}`);
    }
    const allowedLabels = ["defines", "requires", "assigned_to", "addresses", "selects", "authorizes", "provided_by", "proof_for", "accepts"];
    assert.ok(xray.relationships.every(r => allowedLabels.includes(r.label)));
  }
});
