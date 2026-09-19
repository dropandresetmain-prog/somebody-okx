import test from "node:test";
import assert from "node:assert/strict";

import { applyArtifactChange, createArtifact } from "../lib/objective/artifact";
import { strategyDelivery } from "../lib/management/dispatch";

test("M1 causal artifact revision persists the verified acquisition evidence identity", () => {
  const seeded = createArtifact({
    key: "launch/page-message",
    objectiveKey: "obj_test",
    label: "Launch message",
    content: "v1",
    runId: "seed",
    at: 1,
  });
  const revised = applyArtifactChange(seeded, {
    content: "v2 grounded in acquired evidence",
    changeNote: "Revised with acquired founder language",
    runId: "run_after_acquisition",
    at: 2,
    usedAcquisitionEvidenceIds: ["sim_result_1", "sim_result_1"],
  });

  assert.equal(revised.version, 2);
  assert.deepEqual(revised.history[1].usedAcquisitionEvidenceIds, [
    "sim_result_1",
  ]);
});

test("M1 HYBRID waits while acquisition is open and dispatches internal only after verification", () => {
  assert.deepEqual(
    strategyDelivery("HYBRID", {
      assignmentStates: [],
      intentStates: ["authorized"],
    }),
    { delivered: true },
    "an authorized external acquisition is work in flight, not a signal to race the worker",
  );

  assert.deepEqual(
    strategyDelivery("HYBRID", {
      assignmentStates: [],
      intentStates: ["result_recorded"],
    }),
    { delivered: true },
  );

  assert.deepEqual(
    strategyDelivery("HYBRID", {
      assignmentStates: [],
      intentStates: ["verified"],
    }),
    { delivered: false, missing: "assignment" },
    "verified acquired evidence unlocks the downstream internal component",
  );

  assert.deepEqual(
    strategyDelivery("HYBRID", {
      assignmentStates: ["running"],
      intentStates: ["verified"],
    }),
    { delivered: true },
  );
});
