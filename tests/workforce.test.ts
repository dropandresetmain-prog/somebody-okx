import test from "node:test";
import assert from "node:assert/strict";
import {
  CONTROLLED_CAPABILITIES,
  TOOL_PERMISSIONS,
  assertCatalogIntegrity,
  createWorkerSpec,
  enforcePermissionEnvelope,
  isPermissionAllowedForCapability,
  listControlledCapabilityKeys,
  requireCapability,
  resolveWorker,
  toolPermissionsForCapabilities,
  validateCapabilityKeys,
} from "../lib/workforce";
import type { WorkerSpec } from "../lib/workforce";
test("controlled capability keys validate and unknown proposals are rejected", () => {
  const capability = requireCapability("public_information_research");
  assert.equal(capability.name, "Public information research");
  const validated = validateCapabilityKeys([
    "public_information_research",
    " document_drafting ",
    "negotiate_with_supplier",
    "",
  ]);
  assert.deepEqual(validated.accepted, [
    "document_drafting",
    "public_information_research",
  ]);
  assert.deepEqual(validated.rejected, ["negotiate_with_supplier"]);
});
test("an unknown capability fails closed everywhere it can reach a worker", () => {
  assert.throws(
    () => requireCapability("negotiate_with_supplier"),
    /Unknown capability/,
  );
  assert.throws(
    () => createWorkerSpec(["negotiate_with_supplier"]),
    /Unknown capability/,
  );
  assert.throws(() => createWorkerSpec([]), /at least one controlled capability/);
  assert.throws(
    () =>
      resolveWorker({
        requiredCapabilityKeys: ["negotiate_with_supplier"],
        inventory: [],
      }),
    /Unknown capability/,
  );
  assert.throws(
    () => toolPermissionsForCapabilities(["negotiate_with_supplier"]),
    /Unknown capability/,
  );
});
test("a capability maps only to the tools it is permitted", () => {
  assert.deepEqual(toolPermissionsForCapabilities(["document_drafting"]), [
    "record_finding",
    "update_company_artifact",
  ]);
  assert.deepEqual(
    toolPermissionsForCapabilities([
      "document_drafting",
      "public_information_research",
    ]),
    ["read_public_web", "record_finding", "update_company_artifact"],
  );
  assert.equal(
    isPermissionAllowedForCapability("read_public_web", "document_drafting"),
    false,
  );
  assert.equal(
    isPermissionAllowedForCapability(
      "read_public_web",
      "public_information_research",
    ),
    true,
  );
});
test("tools outside the capability envelope are not granted", () => {
  const envelope = enforcePermissionEnvelope({
    capabilityKeys: ["document_drafting"],
    requestedPermissions: [
      "update_company_artifact",
      "read_company_record",
      "delete_company_record",
      "draft_document",
    ],
  });
  assert.deepEqual(envelope.granted, ["update_company_artifact"]);
  assert.deepEqual(envelope.denied, [
    "delete_company_record",
    "draft_document",
    "read_company_record",
  ]);
});
test("a worker spec receives only permissions its capabilities validate", () => {
  const worker = createWorkerSpec(["company_records_lookup"]);
  assert.deepEqual(worker.allowedToolPermissions, [
    "read_company_record",
    "record_finding",
  ]);
  assert.deepEqual(worker.capabilityKeys, ["company_records_lookup"]);
  assert.equal(worker.workerKey, "worker_company_records_lookup");
  assert.ok(worker.responsibility.length > 0);
});
test("resource requirements are represented deterministically", () => {
  const worker = createWorkerSpec(["company_records_lookup"]);
  assert.deepEqual(worker.requiredResources, [
    "company_records",
    "company_tools",
    "llm_reasoning",
    "ordinary_compute",
  ]);
  const forward = createWorkerSpec([
    "document_drafting",
    "public_information_research",
  ]);
  const reversed = createWorkerSpec([
    "public_information_research",
    "document_drafting",
    "document_drafting",
  ]);
  assert.deepEqual(reversed, forward);
  assert.deepEqual(forward.requiredResources, [
    "llm_reasoning",
    "ordinary_compute",
    "public_web",
  ]);
});
test("a compatible existing worker is reused instead of duplicated", () => {
  const broad = createWorkerSpec([
    "document_drafting",
    "public_information_research",
  ]);
  const narrow = createWorkerSpec(["public_information_research"]);
  const resolution = resolveWorker({
    requiredCapabilityKeys: ["public_information_research"],
    inventory: [broad, narrow],
  });
  assert.equal(resolution.outcome, "reuse");
  assert.equal(resolution.worker.workerKey, narrow.workerKey);
});
test("an absent compatible worker produces a new minimal worker spec", () => {
  const resolution = resolveWorker({
    requiredCapabilityKeys: ["document_drafting"],
    inventory: [createWorkerSpec(["public_information_research"])],
  });
  assert.equal(resolution.outcome, "create");
  assert.deepEqual(resolution.worker, createWorkerSpec(["document_drafting"]));
});
test("a reused worker cannot carry permissions its capabilities do not allow", () => {
  const smuggled: WorkerSpec = {
    ...createWorkerSpec(["document_drafting"]),
    allowedToolPermissions: [
      "update_company_artifact",
      "record_finding",
      "read_company_record",
      "authorize_external_spend",
      "draft_document",
    ],
  };
  const resolution = resolveWorker({
    requiredCapabilityKeys: ["document_drafting"],
    inventory: [smuggled],
  });
  assert.equal(resolution.outcome, "reuse");
  assert.deepEqual(resolution.worker.allowedToolPermissions, [
    "record_finding",
    "update_company_artifact",
  ]);
});
test("external spend authority is never granted to an ordinary MAKE worker", () => {
  const spend = TOOL_PERMISSIONS.find(
    (permission) => permission.id === "authorize_external_spend",
  );
  assert.ok(spend, "the reserved spend permission must exist as vocabulary");
  assert.equal(spend.externalAuthority, true);
  const everyCapabilityKey = listControlledCapabilityKeys();
  assert.deepEqual(
    toolPermissionsForCapabilities(everyCapabilityKey).filter(
      (permissionId) => permissionId === "authorize_external_spend",
    ),
    [],
  );
  for (const key of everyCapabilityKey)
    assert.equal(
      isPermissionAllowedForCapability("authorize_external_spend", key),
      false,
    );
  assert.deepEqual(
    enforcePermissionEnvelope({
      capabilityKeys: everyCapabilityKey,
      requestedPermissions: ["authorize_external_spend"],
    }),
    { granted: [], denied: ["authorize_external_spend"] },
  );
});
test("the catalog itself stays internal, owned and scenario-independent", () => {
  assert.doesNotThrow(assertCatalogIntegrity);
  const vocabulary = JSON.stringify(CONTROLLED_CAPABILITIES).toLowerCase();
  for (const scenarioTerm of [
    "toilet",
    "tenant",
    "contractor",
    "plumb",
    "telegram",
    "whatsapp",
    "invoice",
  ])
    assert.equal(
      vocabulary.includes(scenarioTerm),
      false,
      `capability vocabulary must not hard-code ${scenarioTerm}`,
    );
});
