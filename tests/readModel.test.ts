// Read-model selector tests (§31). Proves the UI read model renders persisted
// GENERIC state — multiple needs, candidate assessments incl. the rejected
// offering, BUY waiting state, multiple purchase/payment states, artifact
// version history — with NO scenario or provider branching.

import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  describeNeedStatus,
  describeVerdict,
  describePaymentState,
  isAwaitingSigning,
  toResourceNeedDisplay,
  toCandidateDisplays,
  toPurchaseDisplay,
  toArtifactVersionDisplays,
  buildObjectiveMissionView,
} from "../app/readModel";
import { createArtifact, applyArtifactChange } from "../lib/objective/artifact";
import type { ResourceNeed } from "../lib/objective/resourceNeed";
import type { CandidateAssessment } from "../lib/market/assessment";

function need(over: Partial<ResourceNeed>): ResourceNeed {
  return {
    id: "need-1",
    objectiveKey: "obj-1",
    workItemId: null,
    resourceClass: "proprietary_data",
    purpose: "p",
    reasonOwnedInsufficient: "r",
    status: "active",
    proposedByRunId: null,
    createdAt: 0,
    updatedAt: 0,
    dedupeKey: "dk",
    ...over,
  };
}

describe("read model — need status display", () => {
  it("maps every status to a label + tone without scenario branching", () => {
    assert.equal(describeNeedStatus("buy_pending").tone, "waiting");
    assert.equal(describeNeedStatus("fulfilled").tone, "done");
    assert.equal(describeNeedStatus("sourcing").tone, "working");
    assert.equal(describeNeedStatus("rejected").label, "Resolved internally");
    const d = toResourceNeedDisplay(need({ status: "buy_pending" }));
    assert.equal(d.tone, "waiting");
    assert.equal(d.statusLabel, "Waiting for acquisition");
  });
});

describe("read model — candidate display incl. rejected offering", () => {
  it("renders an eligible and a rejected candidate, marking the selected one", () => {
    const assessments: CandidateAssessment[] = [
      {
        offeringId: "p1:svc-scarce",
        verdict: "eligible_buy",
        reasonCode: "supplies_missing_resource",
        resourceClass: "proprietary_data",
        rationale: "supplies the missing resource",
      },
      {
        offeringId: "p2:svc-generic",
        verdict: "reject_redundant",
        reasonCode: "redundant_with_owned_resources",
        resourceClass: "proprietary_data",
        rationale: "only generic reasoning already owned",
      },
    ];
    const offerings = [
      { offeringId: "p1:svc-scarce", name: "Scarce Service", price: { amount: "0.002", asset: "USDT", unit: "per_use" } },
      { offeringId: "p2:svc-generic", name: "Generic Service", price: { amount: "1", asset: "USDT", unit: "per_use" } },
    ];
    const rows = toCandidateDisplays({ assessments, offerings, selectedOfferingId: "p1:svc-scarce" });
    assert.equal(rows.length, 2);
    const scarce = rows.find((r) => r.offeringId === "p1:svc-scarce")!;
    const generic = rows.find((r) => r.offeringId === "p2:svc-generic")!;
    assert.equal(scarce.selected, true);
    assert.equal(scarce.verdictLabel, "Eligible to buy");
    assert.equal(scarce.priceLabel, "0.002 USDT/per_use");
    assert.equal(generic.selected, false);
    assert.match(generic.verdictLabel, /Rejected — redundant/);
  });

  it("describeVerdict covers every verdict generically", () => {
    assert.match(describeVerdict("reject_untrusted"), /unverified/i);
    assert.match(describeVerdict("reject_incompatible"), /does not supply/i);
  });
});

describe("read model — purchase / payment states", () => {
  it("distinguishes awaiting-signing from submitted/settled/verified", () => {
    assert.equal(isAwaitingSigning("approved"), true);
    assert.equal(isAwaitingSigning("prepared"), true);
    assert.equal(isAwaitingSigning("submitted"), false);
    assert.equal(isAwaitingSigning("settled"), false);
    assert.equal(describePaymentState("submitted"), "Submitted (not yet settled)");
    assert.equal(describePaymentState("settled"), "Settled (result not yet verified)");
    assert.equal(describePaymentState("verified"), "Verified");
    const d = toPurchaseDisplay({ id: "pur-1", offeringId: "p1:svc", state: "approved", verified: false });
    assert.equal(d.awaitingSigning, true);
    assert.equal(d.stateLabel, "Approved — ready to sign");
  });

  it("renders two independent purchases as separate rows", () => {
    const a = toPurchaseDisplay({ id: "pur-1", offeringId: "p1:svc", state: "verified", verified: true });
    const b = toPurchaseDisplay({ id: "pur-2", offeringId: "p2:svc", state: "awaiting_approval", verified: false });
    assert.notEqual(a.id, b.id);
    assert.equal(a.verified, true);
    assert.equal(b.awaitingSigning, true);
  });
});

describe("read model — artifact version history", () => {
  it("lists versions newest-last and flags the current one", () => {
    const v1 = createArtifact({ key: "k", objectiveKey: "o", label: "L", content: "a", runId: "r1", at: 1 });
    const v2 = applyArtifactChange(v1, { content: "b", changeNote: "changed", runId: "r2", at: 2 });
    const rows = toArtifactVersionDisplays(v2);
    assert.equal(rows.length, 2);
    assert.equal(rows[1].isCurrent, true);
    assert.equal(rows[0].isCurrent, false);
    assert.equal(rows[1].version, 2);
  });
});

describe("read model — composite mission view", () => {
  it("aggregates needs, sourcing steps, purchases, artifacts and the waiting flag", () => {
    const artifact = applyArtifactChange(
      createArtifact({ key: "launch/page", objectiveKey: "obj-1", label: "Launch page", content: "v1", runId: "r1", at: 1 }),
      { content: "v2", changeNote: "rewrite", runId: "r1", at: 2 },
    );
    const view = buildObjectiveMissionView({
      objectiveState: "waiting_for_resource",
      needs: [need({ id: "n1", status: "buy_pending" }), need({ id: "n2", status: "fulfilled", resourceClass: "privileged_access" })],
      decisions: [{ id: "d1", resourceNeedId: "n1", decision: "BUY", selectedOfferingId: "p1:svc-scarce" }],
      assessmentsByDecision: {
        d1: [
          { offeringId: "p1:svc-scarce", verdict: "eligible_buy", reasonCode: "supplies_missing_resource", resourceClass: "proprietary_data", rationale: "x" },
          { offeringId: "p2:svc-generic", verdict: "reject_redundant", reasonCode: "redundant_with_owned_resources", resourceClass: "proprietary_data", rationale: "y" },
        ],
      },
      offerings: [
        { offeringId: "p1:svc-scarce", name: "Scarce", price: { amount: "0.002", asset: "USDT", unit: "per_use" } },
        { offeringId: "p2:svc-generic", name: "Generic", price: { amount: "1", asset: "USDT", unit: "per_use" } },
      ],
      purchases: [{ id: "pur-1", offeringId: "p1:svc-scarce", state: "approved", verified: false }],
      artifacts: [artifact],
    });
    assert.equal(view.isWaitingForResource, true);
    assert.equal(view.hasUnresolvedRequiredResource, true);
    assert.equal(view.needs.length, 2);
    assert.equal(view.sourcingSteps.length, 1);
    assert.equal(view.sourcingSteps[0].candidates.length, 2);
    assert.equal(view.sourcingSteps[0].candidates.find((c) => c.selected)!.offeringId, "p1:svc-scarce");
    assert.equal(view.purchases[0].awaitingSigning, true);
    assert.equal(view.artifacts[0].currentVersion, 2);
    assert.equal(view.artifacts[0].versions.length, 2);
  });

  it("reports no unresolved resource when all needs are fulfilled/rejected", () => {
    const view = buildObjectiveMissionView({
      objectiveState: "executing",
      needs: [need({ status: "fulfilled" }), need({ id: "n2", status: "rejected" })],
      decisions: [],
      assessmentsByDecision: {},
      offerings: [],
      purchases: [],
      artifacts: [],
    });
    assert.equal(view.hasUnresolvedRequiredResource, false);
    assert.equal(view.isWaitingForResource, false);
  });
});
