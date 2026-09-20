import assert from "node:assert/strict";
import test from "node:test";
import {
  buildAssignmentContract,
  ensureObservableCapabilityKeys,
  observationProofObligations,
  proofSourceClassesFor,
} from "../lib/management/dispatch";
import { buildInternalOption, EMPTY_FACTS } from "../lib/management/options";
import type { Requirement } from "../lib/management/types";

const requirement = {
  requirementKey: "req_03",
  objectiveKey: "obj_test",
  contractRevision: 1,
  title: "Solution Plan Development",
  mustBeTrue: "A plan exists.",
  scope: "messaging",
  priority: "required",
  state: "active",
  strategy: "MAKE",
  proofs: [
    {
      proofKey: "observation",
      description: "observation",
      proofKind: "application_observation",
      params: {},
    },
  ],
  createdAt: 1,
  updatedAt: 1,
} as Requirement;

test("document_drafting alone gains company_records_lookup for observation proof", () => {
  assert.deepEqual(proofSourceClassesFor(["document_drafting"]), []);
  assert.deepEqual(ensureObservableCapabilityKeys(["document_drafting"]), [
    "company_records_lookup",
    "document_drafting",
  ]);
  assert.ok(
    observationProofObligations(
      requirement,
      ensureObservableCapabilityKeys(["document_drafting"]),
    ).length > 0,
  );
});

test("buildInternalOption pairs drafting-only seeds with an observe capability", () => {
  const built = buildInternalOption({
    requirementKey: "req_03",
    contractRevision: 1,
    capabilityKeys: ["document_drafting"],
    responsibility: "draft a plan",
    workerKey: null,
    staffingReason: null,
    facts: EMPTY_FACTS,
  });
  assert.ok(built.option);
  assert.deepEqual(built.option!.internal!.capabilityKeys, [
    "company_records_lookup",
    "document_drafting",
  ]);
});

test("buildAssignmentContract accepts drafting-only MAKE after observe widening", () => {
  const builtOption = buildInternalOption({
    requirementKey: "req_03",
    contractRevision: 1,
    capabilityKeys: ["document_drafting"],
    responsibility: "draft a plan",
    workerKey: null,
    staffingReason: null,
    facts: EMPTY_FACTS,
  });
  assert.ok(builtOption.option);
  // Simulate a legacy authorized option that stored drafting-only keys.
  const legacy = {
    ...builtOption.option!,
    internal: {
      ...builtOption.option!.internal!,
      capabilityKeys: ["document_drafting"],
    },
  };
  const contract = buildAssignmentContract({
    requirement,
    option: legacy,
    assignmentId: "asg_test",
    workerKey: "worker_company_records_lookup-document_drafting",
    worker: null,
    at: 1,
  });
  assert.equal(contract.ok, true);
  if (!contract.ok) return;
  assert.ok(contract.sourceProofs.length > 0);
});
