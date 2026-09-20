import test from "node:test";
import assert from "node:assert/strict";

import { bindExecutedProofParams } from "../lib/management/contract";
import { missingProofs } from "../lib/management/requirements";
import type { Requirement } from "../lib/management/types";
import { CP2_REQUIREMENT_FIELDS } from "./helpers/cp2Requirement";

function effectRequirement(): Requirement {
  return {
    requirementKey: "req_effect", objectiveKey: "obj_effect", contractId: "contract_effect", contractRevision: 1,
    priority: "required", title: "Publish the verified external effect", mustBeTrue: "effect happened", scope: "objective",
    proofs: [{ proofKey: "effect", description: "actual external effect", proofKind: "verified_external_effect", params: {} }],
    state: "active", strategy: "BUY", resolution: null, blockedReason: null, waiver: null, revision: 1, createdAt: 1, updatedAt: 1,
    ...CP2_REQUIREMENT_FIELDS,
  };
}

test("R3: verified acquisition facts cannot bind or satisfy an external-effect proof", () => {
  const requirement = effectRequirement();
  const acquisitionOnly = {
    artifactVersions: {}, applicationObservationIds: [], verifiedIntentIds: ["acquisition_only"],
    verifiedExternalResultIntentIds: ["acquisition_only"], verifiedExternalEffectIntentIds: [], founderConfirmationRefs: [],
  };
  const bound = bindExecutedProofParams(requirement, acquisitionOnly, 2);
  assert.equal(bound.proofs[0].params.intentId, undefined, "acquisition must not bind an effect obligation");
  assert.match(missingProofs(bound.proofs, acquisitionOnly, { contractRevision: 1, proofRefs: [] })[0]!, /external effect/);

  const effectFacts = { ...acquisitionOnly, verifiedExternalEffectIntentIds: ["effect_only"] };
  const effectBound = bindExecutedProofParams(requirement, effectFacts, 3);
  assert.equal(effectBound.proofs[0].params.intentId, "effect_only");
  assert.deepEqual(missingProofs(effectBound.proofs, effectFacts, { contractRevision: 1, proofRefs: [] }), []);
});
