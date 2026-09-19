// M5 INTEGRATION — Level 1: focused normalized read-model tests (pure composer).
// Proves representative backend row combinations map correctly to the accepted
// frontend ObjectiveWorkspaceView, and the required negative/truth properties:
//  1. worker result alone does not show Objective complete
//  2. submitted payment does not render settled
//  3. settled is never rendered without its own fact (intent cannot say settled)
//  4. result_received does not render verified
//  5. verified external_acquisition cannot render external effect complete
//  6. stale Requirement result does not appear as current satisfaction
//  7. missing approval creates Needs You only when backend says approval required
//  8. missing backend facts do not fall back to fixture truth
//  9. no Requirement dependency edges are invented
// 10. unsupported/blocked Objective renders safely
// 11. real worker REUSE/CREATE label matches persisted staffing truth
// 12. duplicated wake/activity does not create duplicate Mission Story events

import test from "node:test";
import assert from "node:assert/strict";
import {
  composeObjectiveWorkspace,
  deriveAttention,
  deriveMissionStory,
  deriveSomebodyNow,
  type WorkspaceSource,
} from "../lib/m5/workspaceModel";
import { buildXray } from "../app/m5/xray";
import { selectFixture } from "../app/m5/fixtures";

const now = 1820000000000;

function emptySource(overrides: Partial<WorkspaceSource> = {}): WorkspaceSource {
  return {
    objective: {
      key: "obj_1",
      request: "Fix the launch",
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

const contract = {
  contractId: "contract_1",
  objectiveKey: "obj_1",
  revision: 1,
  intent: "A proved relaunch pack",
  minimumCompletionBar: "bar",
  levels: [
    { levelKey: "bar", order: 1, label: "Minimum", statement: "Pack verified" },
    { levelKey: "extra", order: 2, label: "Extra", statement: "Audience response" },
  ],
};

const requirement = (overrides: Partial<WorkspaceSource["requirements"][number]> = {}) => ({
  requirementKey: "req_1",
  title: "Prepare the pack",
  mustBeTrue: "Pack reflects verified evidence",
  priority: "required" as const,
  state: "active" as const,
  strategy: null,
  contractRevision: 1,
  resolution: null,
  ...overrides,
});

const intent = (overrides: Partial<WorkspaceSource["intents"][number]> = {}) => ({
  intentId: "intent_1",
  requirementKey: "req_2",
  decisionId: "dec_buy",
  contractRevision: 1,
  kind: "external_acquisition" as const,
  strategy: "BUY" as const,
  target: { providerId: "prov_1", serviceId: "svc_1", offeringId: "off_1", resourceClass: "data" },
  terms: { priceUsd: 0.4, priceProvenance: "provider_quote", requiresApproval: true, approvalId: "grant_1" },
  state: "authorized",
  resultEvidenceId: null,
  verificationEvidenceId: null,
  boundaryNote: "M4 stopped at the buyer-rail boundary",
  createdAt: now,
  updatedAt: now,
  ...overrides,
});

const assignment = (overrides: Partial<WorkspaceSource["assignments"][number]> = {}) => ({
  assignmentId: "asg_1",
  workerKey: "wk_1",
  requirementKey: "req_1",
  decisionId: "dec_1",
  contractRevision: 1,
  state: "running" as const,
  resultSummary: null,
  runId: "run_1",
  updatedAt: now,
  ...overrides,
});

// ── Positive mapping ─────────────────────────────────────────────────────────

test("a representative backend combination composes the full accepted view shape", () => {
  const view = composeObjectiveWorkspace(
    emptySource({
      contract,
      requirements: [requirement(), requirement({ requirementKey: "req_2", title: "Buy evidence", priority: "supporting" })],
      workers: [{
        workerKey: "wk_1", displayName: "Growth Operator", responsibility: "Launch copy",
        lifecycle: "assigned", createdByObjective: "obj_1",
        reservedBy: { assignmentId: "asg_1" },
        verifiedAssignments: [{ assignmentId: "asg_0", requirementKey: "req_0", outcome: "accepted", summary: "Positioning review", at: now }],
      }],
      assignments: [assignment({ state: "result_submitted", resultSummary: "Draft ready" })],
      decisions: [{
        decisionId: "dec_1", requirementKey: "req_1", kind: "satisfaction_strategy", strategy: "MAKE",
        optionId: "opt_1", recommendation: { rationale: "Internal capability exists" },
        authorization: { kind: "authorized", optionId: "opt_1", spendApprovalId: null },
        coarsePlanSummary: JSON.stringify({ original: "Reuse the Growth Operator", extra: { options: [{ optionId: "opt_1", strategy: "MAKE", internal: { responsibility: "Launch copy", workerKey: "wk_1", staffingReason: "reuse" }, facts: [] , eligibility: { eligible: true, checksPassed: [] } }] } }),
        consideredOptionIds: ["opt_1"], at: now,
      }],
      intents: [intent({ state: "handed_off" })],
      grants: [{ approvalId: "grant_1", limitUsd: 0.5, grantedAt: now - 1000, revokedAt: null }],
      evidence: [{ evidenceId: "ev_1", label: "Audience data", text: "observed", origin: "application_observation", observedAt: now, runId: "run_1" }],
    }),
  );
  assert.equal(view.provenance, "backend_query");
  assert.equal(view.objective.objectiveKey, "obj_1");
  assert.equal(view.outcome?.contractId, "contract_1");
  assert.equal(view.requirements.length, 2);
  assert.equal(view.workers.length, 1);
  assert.equal(view.assignments.length, 1);
  assert.equal(view.decisions.length, 1);
  assert.equal(view.external.length, 1);
  assert.equal(view.evidence.length, 1);
  assert.ok(view.missionStory.length > 0);
  assert.equal(view.completion.accepted, false);
}
);

// ── Negative / truth tests ───────────────────────────────────────────────────

test("N1: worker result alone does not show Objective complete", () => {
  const source = emptySource({
    contract,
    requirements: [requirement()],
    assignments: [assignment({ state: "result_submitted", resultSummary: "Done!" })],
  });
  const view = composeObjectiveWorkspace(source);
  assert.equal(view.completion.accepted, false);
  assert.equal(view.objective.state, "received");
  assert.ok(view.completion.summary.includes("not a completion claim"));
  assert.equal(view.somebodyNow.condition, "working");
  assert.notEqual(view.somebodyNow.headline, "Done means proved.");
});

test("N2: submitted payment does not render settled", () => {
  const view = composeObjectiveWorkspace(emptySource({ intents: [intent({ state: "handed_off" })] }));
  const payment = view.external[0].payment;
  assert.equal(payment.state, "submitted");
  assert.ok(!payment.history.some((entry) => entry.state === "settled"));
  assert.ok(!payment.history.some((entry) => entry.state === "result_received"));
});

test("N3: no backend fact can render 'settled' or invented payment words", () => {
  // The M4 intent vocabulary has no settled state; the derived payment view
  // therefore can never claim settlement. Also: no signed/confirmed/finalized.
  for (const state of ["authorized", "awaiting_m3", "handed_off", "result_recorded", "verified", "failed", "reconciliation_required"]) {
    const view = composeObjectiveWorkspace(emptySource({ intents: [intent({ state })] }));
    const payment = view.external[0].payment;
    assert.ok(!payment.history.some((entry) => entry.state === "settled"), `state ${state} must not render settled`);
    const blob = JSON.stringify(view);
    for (const banned of ["\"signed\"", "\"confirmed\"", "\"finalized\""]) {
      assert.ok(!blob.includes(banned), `state ${state} must not contain ${banned}`);
    }
  }
});

test("N4: result_received does not render verified", () => {
  const view = composeObjectiveWorkspace(
    emptySource({ intents: [intent({ state: "result_recorded", resultEvidenceId: "ev_p" })] }),
  );
  const payment = view.external[0].payment;
  assert.equal(payment.state, "result_received");
  assert.ok(!payment.history.some((entry) => entry.state === "verified"));
  const evidenceView = view.evidence; // result evidence not seeded as a row: nothing verified claimed
  assert.ok(evidenceView.every((item) => item.state !== "verified"));
  assert.ok(view.missionStory.some((event) => event.title === "Provider result received"));
  assert.ok(!view.missionStory.some((event) => event.title === "External result verified"));
});

test("N5: verified external_acquisition cannot render external effect complete", () => {
  const view = composeObjectiveWorkspace(
    emptySource({
      contract,
      requirements: [requirement({ requirementKey: "req_2", state: "active" })],
      intents: [intent({ state: "verified", kind: "external_acquisition", resultEvidenceId: "ev_p", verificationEvidenceId: "ev_v" })],
    }),
  );
  const external = view.external[0];
  assert.equal(external.intent?.kind, "external_acquisition");
  assert.ok(external.boundaryNote.includes("does NOT prove any later external business effect"));
  assert.equal(view.completion.accepted, false);
  const req = view.requirements[0];
  assert.equal(req.state, "active"); // verification of the intent did not satisfy the requirement
});

test("N6: stale Requirement result does not appear as current satisfaction", () => {
  const view = composeObjectiveWorkspace(
    emptySource({
      contract: { ...contract, revision: 2 },
      requirements: [
        requirement({
          state: "satisfied",
          contractRevision: 1,
          resolution: { resolutionId: "res_old", proofRefs: ["ev_old"], acceptedAt: now - 5000 },
        }),
      ],
      assignments: [assignment({ state: "verified", contractRevision: 1 })],
    }),
  );
  const req = view.requirements[0];
  assert.equal(req.state, "active"); // stale satisfaction is downgraded
  assert.equal(req.resolution, null);
  assert.equal(view.assignments[0].state, "superseded");
  // The historical resolution remains in the story as a fact, but it must be
  // traceable to its own resolution id — never presented as current state.
  const satisfiedEvents = view.missionStory.filter((event) => event.title === "Requirement satisfied");
  assert.ok(satisfiedEvents.every((event) => event.id.includes("res_old")));
  assert.equal(view.completion.accepted, false);
});

test("N7: Needs You appears only when backend says approval required", () => {
  const clean = composeObjectiveWorkspace(emptySource({ contract, requirements: [requirement()] }));
  assert.equal(clean.attention.length, 0);
  assert.equal(clean.somebodyNow.condition, "working");

  const withApproval = composeObjectiveWorkspace(
    emptySource({
      contract,
      requirements: [requirement()],
      objective: {
        ...emptySource().objective,
        state: "executing",
        management: { contractId: "contract_1", controlNotes: [{ type: "pending_approval", question: "Approve $0.40 spend?", at: now }] },
      },
    }),
  );
  assert.equal(withApproval.attention.length, 1);
  assert.equal(withApproval.attention[0].kind, "approval");
  assert.equal(withApproval.somebodyNow.condition, "needs_you");
  assert.equal(withApproval.somebodyNow.ball, "You");

  // A real grant binds the ceiling; no grant means no invented amount.
  assert.equal(withApproval.attention[0].maximumUsd, null);
  const withGrant = deriveAttention(
    emptySource({
      objective: { ...emptySource().objective, management: { contractId: null, controlNotes: [{ type: "pending_approval", question: "Spend?", at: now }] } },
      grants: [{ approvalId: "grant_1", limitUsd: 0.5, grantedAt: now, revokedAt: null }],
    }),
    "executing",
  );
  assert.equal(withGrant[0].maximumUsd, 0.5);
});

test("N8: missing backend facts do not fall back to fixture truth", () => {
  const view = composeObjectiveWorkspace(emptySource());
  assert.equal(view.provenance, "backend_query");
  assert.equal(view.outcome, null);
  assert.deepEqual(view.requirements, []);
  assert.deepEqual(view.workers, []);
  assert.deepEqual(view.external, []);
  assert.deepEqual(view.evidence, []);
  assert.deepEqual(view.artifacts, []);
  assert.deepEqual(view.attention, []);
  assert.equal(view.completion.accepted, false);
  // Nothing from the accepted fixtures leaked in.
  const fixtureView = selectFixture("launch").snapshot.view;
  const blob = JSON.stringify(view);
  for (const fixtureOnly of ["Newsliquid", "Growth Operator", "illustrative fixture"]) {
    if (JSON.stringify(fixtureView).includes(fixtureOnly)) {
      assert.ok(!blob.includes(fixtureOnly), `fixture value ${fixtureOnly} leaked into backend view`);
    }
  }
});

test("N9: no Requirement dependency edges are invented", () => {
  const view = composeObjectiveWorkspace(
    emptySource({
      contract,
      requirements: [requirement(), requirement({ requirementKey: "req_2", title: "Second", priority: "supporting" })],
    }),
  );
  const xray = buildXray(view);
  for (const rel of xray.relationships) {
    const isRequirement = (id: string) => view.requirements.some((r) => r.requirementKey === id);
    assert.ok(!(isRequirement(rel.from) && isRequirement(rel.to)), `invented requirement dependency: ${rel.from} -> ${rel.to}`);
  }
  // Requirement edges that DO exist point only at the contract ("requires").
  const requirementEdges = xray.relationships.filter((rel) => rel.from.startsWith("req_"));
  assert.ok(requirementEdges.every((rel) => rel.to === "contract_1" && rel.label === "requires"));
});

test("N10: blocked and escalated objectives render safely", () => {
  for (const state of ["blocked", "escalated", "recovery_required", "failed"]) {
    const source = emptySource({
      contract,
      requirements: [requirement({ state: state === "blocked" ? "blocked" : "active" })],
      objective: {
        ...emptySource().objective,
        state: state === "failed" ? "failed" : "executing",
        management: { contractId: "contract_1", controlNotes: [{ type: "control_state", state, summary: state, at: now }] },
      },
    });
    const view = composeObjectiveWorkspace(source);
    assert.ok(view.objective.title.length > 0);
    assert.equal(view.completion.accepted, false);
    const somebody = deriveSomebodyNow(source, view.objective.state);
    assert.ok(["blocked", "needs_you"].includes(somebody.condition), `${state} → ${somebody.condition}`);
    if (state === "escalated" || state === "recovery_required") {
      assert.ok(view.attention.length >= 1);
    }
  }
  // Unsupported objective (no contract, no rows at all) still renders.
  const bare = composeObjectiveWorkspace(emptySource());
  assert.equal(bare.objective.state, "received");
  assert.equal(bare.outcome, null);
});

test("N11: REUSE/CREATE matches persisted staffing truth only", () => {
  const created = composeObjectiveWorkspace(
    emptySource({
      workers: [{
        workerKey: "wk_new", displayName: "New Guy", responsibility: "r", lifecycle: "available",
        createdByObjective: "obj_1", reservedBy: null, verifiedAssignments: [],
      }],
    }),
  );
  assert.equal(created.workers[0].staffing.outcome, "create");

  const reused = composeObjectiveWorkspace(
    emptySource({
      workers: [{
        workerKey: "wk_old", displayName: "Old Guy", responsibility: "r", lifecycle: "available",
        createdByObjective: null, reservedBy: null,
        verifiedAssignments: [{ assignmentId: "a", requirementKey: null, outcome: "accepted", summary: "prior work", at: now }],
      }],
    }),
  );
  assert.equal(reused.workers[0].staffing.outcome, "reuse");
  assert.equal(reused.workers[0].verifiedHistory.length, 1);

  // A rejected outcome is never verified history.
  const rejected = composeObjectiveWorkspace(
    emptySource({
      workers: [{
        workerKey: "wk_r", displayName: "R", responsibility: "r", lifecycle: "available",
        createdByObjective: null, reservedBy: null,
        verifiedAssignments: [{ assignmentId: "a", requirementKey: null, outcome: "rejected", summary: "bad", at: now }],
      }],
    }),
  );
  assert.equal(rejected.workers[0].verifiedHistory.length, 0);
});

test("N12: duplicated activity does not create duplicate Mission Story events", () => {
  const source = emptySource({
    contract,
    requirements: [requirement({ resolution: { resolutionId: "res_1", proofRefs: ["ev_1"], acceptedAt: now } , state: "satisfied" })],
    intents: [intent({ state: "verified", resultEvidenceId: "ev_1", verificationEvidenceId: "ev_v" })],
  });
  const once = deriveMissionStory(source);
  // The backend dedupes wakes by identity; the story derives from ROWS, so
  // replaying the same rows (duplicate wake/activity upstream) is idempotent.
  const twice = deriveMissionStory(structuredClone(source));
  assert.deepEqual(once.map((event) => event.id), twice.map((event) => event.id));
  const ids = once.map((event) => event.id);
  assert.equal(new Set(ids).size, ids.length, "duplicate story event ids");
  // One verified intent yields exactly ONE submitted, ONE result, ONE verified event.
  assert.equal(once.filter((event) => event.title === "Payment submitted").length, 1);
  assert.equal(once.filter((event) => event.title === "Provider result received").length, 1);
  assert.equal(once.filter((event) => event.title === "External result verified").length, 1);
  // No causal claim language anywhere.
  for (const event of once) {
    assert.ok(!/caused|because of event|led to/i.test(event.detail), `causal claim in: ${event.detail}`);
  }
});

test("payment amounts: no dollar figure invented from unknown units", () => {
  const noPrice = composeObjectiveWorkspace(
    emptySource({ intents: [intent({ state: "handed_off", terms: { priceUsd: null, priceProvenance: "unknown", requiresApproval: false, approvalId: null } })] }),
  );
  assert.equal(noPrice.external[0].payment.maximumUsd, 0);
  assert.ok(noPrice.external[0].boundaryNote.includes("No USD amount persisted"));
  // A quote is labelled a quote, not an executed amount.
  const quoted = composeObjectiveWorkspace(emptySource({ intents: [intent({ state: "handed_off" })], grants: [] }));
  assert.ok(quoted.external[0].boundaryNote.includes("expected/quoted price"));
});

test("verification beats stay distinct: produced → received → verified → satisfied → completed", () => {
  const base = emptySource({
    contract,
    requirements: [requirement({ requirementKey: "req_2" })],
    intents: [intent({ state: "result_recorded", resultEvidenceId: "ev_p" })],
    evidence: [{ evidenceId: "ev_p", label: "Provider result", text: "raw", origin: "application_observation", observedAt: now, runId: "run_x" }],
  });
  const received = composeObjectiveWorkspace(base);
  assert.equal(received.evidence[0].state, "received");
  assert.equal(received.requirements[0].state, "active");

  const verified = composeObjectiveWorkspace({
    ...base,
    intents: [intent({ state: "verified", resultEvidenceId: "ev_p", verificationEvidenceId: "ev_v" })],
  });
  // The intent is verified, but the evidence ROW is only "verified" when an
  // accepted resolution cites it — intent verification alone does not relabel
  // raw provider output.
  assert.equal(verified.evidence[0].state, "received");
  assert.equal(verified.requirements[0].state, "active"); // still NOT satisfied

  const satisfied = composeObjectiveWorkspace({
    ...base,
    intents: [intent({ state: "verified", resultEvidenceId: "ev_p", verificationEvidenceId: "ev_v" })],
    requirements: [requirement({
      requirementKey: "req_2", state: "satisfied",
      resolution: { resolutionId: "res_1", proofRefs: ["ev_p"], acceptedAt: now },
    })],
  });
  assert.equal(satisfied.requirements[0].state, "satisfied");
  assert.equal(satisfied.completion.accepted, false); // satisfaction ≠ completion
});
