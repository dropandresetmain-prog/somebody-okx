// Portability gate regression (nex-5): a worker/assignment delivery FAILURE for a
// requirement is itself a material fact change. Without folding it into the decision
// input fingerprint, a re-decide after a failed authorized delivery fingerprints
// identically to the decision that authorized it, and the begin step silently declines
// to schedule another pass — permanently stranding the Objective in "executing" with
// no timer armed to rescue it (that state has no await_wake/timer branch).
import test from "node:test";
import assert from "node:assert/strict";
import { computeDecisionInputFingerprint } from "../lib/objective/inputDiagnosis";

const base = {
  requirementKey: "req_02",
  contractRevision: 1,
  requiredResourceClasses: [] as string[],
  validatedMissingClasses: [] as string[],
  prerequisiteStates: [] as string[],
  eligibleOfferingIds: [] as string[],
  spendAuthorityUsd: null,
  budgetRemainingUsd: null,
};

test("a new terminal delivery for the same requirement changes the fingerprint", () => {
  const before = computeDecisionInputFingerprint({ ...base, terminalDeliveryCount: 0 });
  const after = computeDecisionInputFingerprint({ ...base, terminalDeliveryCount: 1 });
  assert.notEqual(before, after);
});

test("an unrelated duplicate wake with the same terminal delivery count is still a no-op (unchanged)", () => {
  const a = computeDecisionInputFingerprint({ ...base, terminalDeliveryCount: 1 });
  const b = computeDecisionInputFingerprint({ ...base, terminalDeliveryCount: 1 });
  assert.equal(a, b);
});

test("terminalDeliveryCount defaults to 0 when omitted (back-compat callers)", () => {
  const omitted = computeDecisionInputFingerprint({ ...base });
  const explicit = computeDecisionInputFingerprint({ ...base, terminalDeliveryCount: 0 });
  assert.equal(omitted, explicit);
});
