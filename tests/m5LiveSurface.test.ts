// M5 INTEGRATION — Level 3: frontend integration behavior for the accepted
// Mission Control surface when fed the BACKEND-composed read model instead of
// fixtures. Only the critical accepted interactions affected by the fixture
// replacement are tested (risk-based): live labels, Needs You behavior without
// a fake approve command, empty/partial degradation, and payment stage rendering.

import test from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MissionControl } from "../app/m5/MissionControl";
import { CompanyField } from "../app/m5/CompanyField";
import { Decisions, NeedsYou } from "../app/m5/DecisionAttention";
import { AcquisitionProgress, CompletionSummary, EvidenceInspector, MissionStory } from "../app/m5/EvidenceStory";
import { SystemXray } from "../app/m5/SystemXray";
import { buildXray } from "../app/m5/xray";
import { composeObjectiveWorkspace, type WorkspaceSource } from "../lib/m5/workspaceModel";

const now = 1820000000000;

function emptySource(overrides: Partial<WorkspaceSource> = {}): WorkspaceSource {
  return {
    objective: {
      key: "obj_live",
      request: "Our launch isn't working. Fix it and relaunch today.",
      createdAt: now,
      updatedAt: now,
      state: "received",
      result: null,
      companyArtifacts: [],
      management: { contractId: null, controlNotes: [] },
    },
    contract: null,
    requirements: [],
    workers: [],
    assignments: [],
    decisions: [],
    intents: [],
    grants: [],
    evidence: [],
    ...overrides,
  };
}

function renderLive(view: ReturnType<typeof composeObjectiveWorkspace>) {
  return renderToStaticMarkup(
    createElement(MissionControl, {
      view,
      objectiveNavigation: createElement("nav", { "aria-label": "Objectives" }, "nav"),
      controls: null,
      company: createElement(CompanyField, { view }),
      attention: createElement(NeedsYou, { view }),
      story: createElement(
        "div",
        null,
        createElement(CompletionSummary, { view }),
        createElement(AcquisitionProgress, { view }),
        createElement(MissionStory, { view }),
      ),
      inspection: createElement(
        "div",
        null,
        createElement(EvidenceInspector, { view }),
        createElement(SystemXray, { xray: buildXray(view) }),
      ),
    }),
  );
}

test("live view renders the accepted surface with live labels, not fixture labels", () => {
  const html = renderLive(composeObjectiveWorkspace(emptySource()));
  assert.ok(html.includes("Live workspace · Convex authoritative"));
  assert.ok(!html.includes("Fixture workspace · not live"));
  assert.ok(!html.includes("illustrative fixture"));
  assert.ok(!html.includes("Fixture controls"));
  // Accepted structure is intact
  assert.ok(html.includes("Somebody now"));
  assert.ok(html.includes("Done means."));
  assert.ok(html.includes("Ball with"));
  assert.ok(html.includes("Skip to mission"));
});

test("live Needs You shows the real approval card with NO working approve button", () => {
  const view = composeObjectiveWorkspace(
    emptySource({
      objective: {
        ...emptySource().objective,
        state: "executing",
        management: { contractId: null, controlNotes: [{ type: "pending_approval", question: "Approve external spend up to $0.40?", at: now }] },
      },
    }),
  );
  const html = renderToStaticMarkup(createElement(NeedsYou, { view }));
  assert.ok(html.includes("Your approval is required"));
  assert.ok(html.includes("Approve external spend up to $0.40?"));
  // No onApprove wired in production → no simulated button, no faked success.
  assert.ok(!html.includes("<button"));
  assert.ok(html.includes("Your next action"));
});

test("empty backend state degrades truthfully inside the accepted layout", () => {
  const html = renderLive(composeObjectiveWorkspace(emptySource()));
  assert.ok(html.includes("Somebody is interpreting the Objective"));
  assert.ok(html.includes("Requirements will follow the Outcome Contract"));
  assert.ok(html.includes("No That Guy assigned"));
  assert.ok(html.includes("No evidence yet. Absence of proof is not success."));
  assert.ok(html.includes("Completion is a separate verdict."));
});

test("payment stages render exactly the derived facts: submitted is not settled", () => {
  const view = composeObjectiveWorkspace(
    emptySource({
      intents: [{
        intentId: "intent_1", requirementKey: "req_1", decisionId: "dec_1", contractRevision: 1,
        kind: "external_acquisition", strategy: "BUY",
        target: { providerId: "prov_1", serviceId: "svc_1", offeringId: "off_1", resourceClass: "data" },
        terms: { priceUsd: 0.4, priceProvenance: "provider_quote", requiresApproval: true, approvalId: null },
        state: "handed_off", resultEvidenceId: null, verificationEvidenceId: null,
        boundaryNote: "submitted to the buyer rail", createdAt: now, updatedAt: now,
      }],
    }),
  );
  const html = renderToStaticMarkup(createElement(AcquisitionProgress, { view }));
  assert.ok(html.includes("submitted"));
  // The settled stage appears in the track (accepted design) but NOT as recorded.
  const settledItem = html.match(/<li[^>]*data-recorded="false"[^>]*>(?:(?!<\/li>).)*settled/s);
  assert.ok(settledItem, "settled must render as not reached");
  assert.ok(!html.match(/data-recorded="true"[^>]*>(?:(?!<\/li>).)*settled/s), "settled must not render as recorded");
  assert.ok(html.includes("expected/quoted price"));
});

test("xray renders real ids from backend truth with no invented requirement edges", () => {
  const view = composeObjectiveWorkspace(
    emptySource({
      contract: {
        contractId: "contract_1", objectiveKey: "obj_live", revision: 1, intent: "prove it",
        minimumCompletionBar: "bar",
        levels: [{ levelKey: "bar", order: 1, label: "Bar", statement: "proved" }],
      },
      requirements: [
        { requirementKey: "req_a", title: "A", mustBeTrue: "a", priority: "required", state: "active", strategy: null, contractRevision: 1, resolution: null },
        { requirementKey: "req_b", title: "B", mustBeTrue: "b", priority: "supporting", state: "active", strategy: null, contractRevision: 1, resolution: null },
      ],
    }),
  );
  const xray = buildXray(view);
  const html = renderToStaticMarkup(createElement(SystemXray, { xray }));
  assert.ok(html.includes("req_a"));
  assert.ok(html.includes("req_b"));
  const requirementIds = new Set(view.requirements.map((r) => r.requirementKey));
  for (const rel of xray.relationships) {
    assert.ok(!(requirementIds.has(rel.from) && requirementIds.has(rel.to)), "invented requirement dependency");
  }
});
