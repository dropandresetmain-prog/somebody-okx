import { test } from "node:test";
import assert from "node:assert/strict";
import { fixtureScenarios, selectFixture } from "../app/m5/fixtures";

const paymentOrder = ["prepared", "awaiting_approval", "approved", "payment_attempted", "submitted", "settled", "result_received", "verified"];
const epoch = Date.UTC(2026, 8, 19);

for (const scenario of fixtureScenarios) test(`${scenario.id}: stable references, numeric clocks, explicit proof and safe authority`, () => {
  assert.ok(scenario.snapshots.some(s => s.id === scenario.initialSnapshotId));
  assert.equal(new Set(scenario.snapshots.map(s => s.id)).size, scenario.snapshots.length);
  for (const snapshot of scenario.snapshots) {
    const v = snapshot.view;
    assert.equal(v.provenance, "frontend_fixture");
    assert.ok(Number.isSafeInteger(v.objective.updatedAt) && v.objective.updatedAt >= epoch);
    const ids = [v.objective.objectiveKey, ...(v.outcome ? [v.outcome.contractId] : []), ...v.requirements.map(r => r.requirementKey), ...v.workers.map(w => w.workerKey), ...v.assignments.map(a => a.assignmentId), ...v.decisions.map(d => d.decisionId), ...v.external.flatMap(e => [e.providerId, ...(e.intent ? [e.intent.intentId] : [])]), ...v.artifacts.map(a => a.artifactId), ...v.evidence.map(e => e.evidenceId)];
    assert.equal(new Set(ids).size, ids.length);
    assert.ok(ids.every(Boolean));
    const verifiedIds = new Set(v.evidence.filter(e => e.state === "verified").map(e => e.evidenceId));
    if (v.outcome) assert.ok(v.outcome.levels.some(l => l.levelKey === v.outcome!.minimumCompletionBar));
    for (const r of v.requirements) {
      assert.ok(!("dependencies" in r) && !("dependsOn" in r));
      if (r.state === "satisfied") {
        assert.ok(r.resolution && r.resolution.proofRefs.length > 0);
        assert.ok(r.resolution.proofRefs.every(id => verifiedIds.has(id)));
      }
    }
    for (const a of v.assignments) {
      assert.ok(ids.includes(a.workerKey) && ids.includes(a.requirementKey) && ids.includes(a.decisionId));
      if (a.state === "verified") assert.ok(a.proofRefs.length && a.proofRefs.every(id => verifiedIds.has(id)));
    }
    for (const w of v.workers) {
      if (w.staffing.outcome === "reuse") assert.ok(w.verifiedHistory.length > 0 && w.staffing.reason);
      const running = v.assignments.filter(a => a.workerKey === w.workerKey && a.state === "running");
      assert.ok(running.length <= 1, "No invented concurrent assignments");
      if (running.length) assert.equal(w.reservedForAssignmentId, running[0].assignmentId);
    }
    for (const event of v.missionStory) {
      assert.ok(event.id && Number.isSafeInteger(event.at) && event.at >= epoch && event.at <= v.objective.updatedAt);
      assert.ok(event.relatedIds.every(id => ids.includes(id)), `Dangling event reference: ${event.id}`);
    }
    for (const artifact of v.artifacts) for (const version of artifact.versions) {
      assert.ok(version.id && Number.isSafeInteger(version.at) && version.at >= epoch);
      assert.ok(version.evidenceRefs.every(id => ids.includes(id)));
    }
    for (const d of v.decisions) {
      assert.ok(ids.includes(d.requirementKey));
      if (d.selectedOptionId) assert.ok(d.options.some(o => o.optionId === d.selectedOptionId));
      if (d.authorization === "authorized" && d.selectedOptionId) assert.equal(d.options.find(o => o.optionId === d.selectedOptionId)!.eligibility, "eligible");
    }
    for (const external of v.external) {
      const history = external.payment.history;
      assert.deepEqual(history.map(e => e.state), paymentOrder.slice(0, history.length));
      assert.equal(history.at(-1)!.state, external.payment.state);
      assert.equal(new Set(history.map(e => e.id)).size, history.length);
      assert.ok(history.every(e => Number.isSafeInteger(e.at) && e.at >= epoch));
      if (history.length < 3) assert.equal(external.intent, null);
      else assert.ok(external.intent?.approvalId);
      if (external.payment.state === "result_received") assert.equal(v.evidence.find(e => e.providerId === external.providerId)?.state, "received");
    }
    if (v.objective.state === "completed") {
      assert.equal(v.completion.accepted, true);
      assert.ok(v.completion.acceptedAt && v.completion.proofRefs.length);
      assert.ok(v.completion.proofRefs.every(id => verifiedIds.has(id)));
      assert.ok(v.requirements.filter(r => r.priority === "required").every(r => r.state === "satisfied"));
      assert.ok(v.requirements.some(r => r.priority === "supporting" && r.state === "active"));
      assert.ok(v.completion.remaining.length);
    }
    if (snapshot.action) {
      assert.ok(snapshot.action.label);
      assert.ok(scenario.snapshots.some(s => s.id === snapshot.action!.nextSnapshotId));
    }
  }
});

test("worker result, assignment verification, Requirement resolution and completion stay distinct", () => {
  const result = selectFixture("partner", "result").snapshot.view;
  assert.equal(result.assignments[0].state, "result_submitted");
  assert.equal(result.requirements[0].state, "active");
  assert.equal(result.completion.accepted, false);
  const verified = selectFixture("partner", "verified").snapshot.view;
  assert.equal(verified.assignments[0].state, "verified");
  assert.equal(verified.requirements[0].state, "active");
  const satisfied = selectFixture("partner", "satisfied").snapshot.view;
  assert.equal(satisfied.requirements[0].state, "satisfied");
  assert.equal(satisfied.completion.accepted, false);
});

test("approval is an explicit fixture action, not a timer or autonomous permission", () => {
  const approval = selectFixture("launch", "approval").snapshot;
  assert.equal(approval.view.somebodyNow.ball, "You");
  assert.equal(approval.action!.requiresFounder, true);
  assert.equal(approval.action!.nextSnapshotId, "approved");
  assert.equal(approval.view.external[0].intent, null);
  assert.ok(approval.view.assignments.every(a => a.state !== "running"));
  assert.equal(selectFixture("launch", "approved").snapshot.view.external[0].payment.state, "approved");
});

test("blocked work stops without a fake recovery button or ASK backend state", () => {
  const blocked = selectFixture("supplier").snapshot;
  assert.equal(blocked.view.objective.state, "blocked");
  assert.equal(blocked.view.requirements[0].strategy, "ASK_FOUNDER");
  assert.equal(blocked.view.somebodyNow.ball, "You");
  assert.equal(blocked.action, null);
  assert.equal(blocked.view.completion.accepted, false);
});

test("selector is deterministic and unknown URL values fall back to known data", () => {
  assert.equal(selectFixture("unknown", "unknown").snapshot.id, "approval");
  assert.equal(selectFixture("partner", "unknown").snapshot.id, "working");
  const before = JSON.stringify(selectFixture("launch", "approval"));
  selectFixture("launch", "completed");
  assert.equal(JSON.stringify(selectFixture("launch", "approval")), before);
});

test("the complete launch fixture records every accepted payment state separately", () => {
  assert.deepEqual(selectFixture("launch", "completed").snapshot.view.external[0].payment.history.map(e => e.state), paymentOrder);
  assert.equal(selectFixture("launch", "result").snapshot.view.requirements.find(r => r.requirementKey === "req-audience")!.state, "active");
});
