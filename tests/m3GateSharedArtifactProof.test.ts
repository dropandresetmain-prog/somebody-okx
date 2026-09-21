// Portability gate regression (luna-2): a later requirement's legitimate update to the
// SHARED artifact must not un-prove an earlier requirement's own artifact delivery, while a
// version authored by another requirement's runs must still never count for this one.
import test from "node:test";
import assert from "node:assert/strict";
import { artifactVersionsAuthoredByRuns, missingProofs } from "../lib/management/requirements";

const artifact = {
  key: "launch/page-message",
  version: 4,
  provenanceRunId: "run_req03", // current version was written by req_03's run
  history: [
    { version: 1, changedByRunId: "seed" },
    { version: 2, changedByRunId: "run_req02" },
    { version: 3, changedByRunId: "run_req02b" },
    { version: 4, changedByRunId: "run_req03" },
  ],
};
const proof = [{ proofKey: "artifact_change", description: "x", proofKind: "company_artifact_version" as const, params: { artifactKey: "launch/page-message", minVersion: 2 } }];
const facts = (v: Record<string, number>) => ({ artifactVersions: v, applicationObservationIds: [], verifiedIntentIds: [], founderConfirmationRefs: [] });
const ev = { contractRevision: 1, proofRefs: [] };

test("earlier requirement keeps its artifact proof after a later requirement updates the shared artifact", () => {
  const v = artifactVersionsAuthoredByRuns([artifact], new Set(["run_req02", "run_req02b"]));
  assert.equal(v["launch/page-message"], 3);
  assert.deepEqual(missingProofs(proof, facts(v), ev), []);
});

test("a version authored only by another requirement's runs never proves this requirement", () => {
  const v = artifactVersionsAuthoredByRuns([artifact], new Set(["run_other"]));
  assert.equal(v["launch/page-message"], undefined);
  assert.equal(missingProofs(proof, facts(v), ev).length, 1);
});

test("a requirement that authored only v1-equivalent (< minVersion) still fails closed", () => {
  const v = artifactVersionsAuthoredByRuns([{ ...artifact, history: [{ version: 1, changedByRunId: "run_x" }], provenanceRunId: "none", version: 1 }], new Set(["run_x"]));
  assert.equal(missingProofs(proof, facts(v), ev).length, 1);
});
