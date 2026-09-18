// CP3 — persistent workforce: reuse-first staffing on a REAL inventory,
// supported CREATE reasons, typed no_staffing_possible, and replay-stable
// identities. Fixes the M2 "resolveWorker({inventory: []})" failure mode by
// proving the kernel actually consumes a non-empty inventory.
import test from "node:test";
import assert from "node:assert/strict";
import { decideStaffing, deriveWorkerKey, type StaffingInput } from "../lib/management/staffing";
import type { WorkerRecord } from "../lib/management/types";

const at = 1700000000000;

function worker(overrides: Partial<WorkerRecord> = {}): WorkerRecord {
  return {
    workerKey: "worker_a",
    displayName: "Worker A",
    capabilityKeys: ["growth_launch_operations"],
    dynamicCapabilities: [],
    responsibility: "ops",
    lifecycle: "available",
    reservedBy: null,
    verifiedAssignments: [],
    contextRefs: [],
    createdByObjective: null,
    createdAt: at - 5000,
    updatedAt: at - 5000,
    ...overrides,
  };
}

function request(overrides: Partial<StaffingInput> = {}): StaffingInput {
  return {
    objectiveKey: "obj_launch",
    requirementKey: "page_live",
    requiredCapabilityKeys: ["growth_launch_operations"],
    requiredPermissions: ["update_company_artifact"],
    expectedHoldMs: 60 * 60 * 1000,
    now: at,
    neededContextRefs: [],
    parallelismNeeded: 1,
    specializationNeeded: false,
    inventory: [],
    creationAllowed: true,
    ...overrides,
  };
}

test("EMPTY inventory is handled honestly: a supported CREATE, never a phantom reuse", () => {
  const decision = decideStaffing(request());
  assert.equal(decision.outcome, "create");
  if (decision.outcome !== "create") return;
  assert.equal(decision.createReason, "availability");
});

test("a capable, available worker is REUSED — the M2 bug could not see inventory", () => {
  const decision = decideStaffing(request({ inventory: [worker()] }));
  assert.equal(decision.outcome, "reuse");
  if (decision.outcome !== "reuse") return;
  assert.equal(decision.workerKey, "worker_a");
});

test("reserved worker with an active lease cannot be reused; lapsed lease can", () => {
  const reserved = worker({
    lifecycle: "assigned",
    reservedBy: { objectiveKey: "obj_other", requirementKey: null, assignmentId: "asg_x", heldUntil: at + 60_000 },
  });
  assert.equal(decideStaffing(request({ inventory: [reserved] })).outcome, "create");
  const lapsed = worker({
    lifecycle: "assigned",
    reservedBy: { objectiveKey: "obj_other", requirementKey: null, assignmentId: "asg_x", heldUntil: at - 1 },
  });
  assert.equal(decideStaffing(request({ inventory: [lapsed] })).outcome, "reuse");
});

test("suspended and retired workers are never staffable", () => {
  for (const lifecycle of ["suspended", "retired"] as const) {
    const decision = decideStaffing(request({ inventory: [worker({ lifecycle })], creationAllowed: false }));
    assert.equal(decision.outcome, "no_staffing_possible");
  }
});

test("capability mismatch disqualifies; parallelism demand can CREATE alongside a valid reuse", () => {
  const narrow = worker({ capabilityKeys: ["document_drafting"] });
  const noRoom = decideStaffing(request({ inventory: [narrow], creationAllowed: false }));
  assert.equal(noRoom.outcome, "no_staffing_possible");
  if (noRoom.outcome !== "no_staffing_possible") return;
  assert.ok(noRoom.blockers.length > 0);

  const oneFree = worker();
  assert.equal(decideStaffing(request({ inventory: [oneFree], parallelismNeeded: 1 })).outcome, "reuse");
  const twoNeeded = decideStaffing(request({ inventory: [oneFree], parallelismNeeded: 2 }));
  assert.equal(twoNeeded.outcome, "create");
  if (twoNeeded.outcome !== "create") return;
  assert.equal(twoNeeded.createReason, "parallelism");
});

test("specialization requires accepted history, not a name guess", () => {
  const fresh = worker();
  const seasoned = worker({
    workerKey: "worker_b",
    verifiedAssignments: [
      { assignmentId: "asg_old", objectiveKey: "obj_past", requirementKey: null, capabilityKeys: ["growth_launch_operations"], outcome: "accepted", summary: "past launch", at: at - 10 },
    ],
  });
  const decision = decideStaffing(request({ inventory: [fresh, seasoned], specializationNeeded: true }));
  assert.equal(decision.outcome, "reuse");
  if (decision.outcome !== "reuse") return;
  assert.equal(decision.workerKey, "worker_b"); // history wins; fresh is disqualified
});

test("ungoverned capability yields a typed blocker, never an invented worker", () => {
  const decision = decideStaffing(request({ requiredCapabilityKeys: ["quantum_marketing"] }));
  assert.equal(decision.outcome, "no_staffing_possible");
  if (decision.outcome !== "no_staffing_possible") return;
  assert.ok(decision.reason.includes("not governed"), decision.reason);
  assert.ok(decision.blockers.some((b: string) => b.includes("quantum_marketing")));
});

test("create identity is replay-stable: same envelope → same workerKey, so a duplicated wake cannot spawn twins", () => {
  const first = decideStaffing(request({ inventory: [] }));
  const replay = decideStaffing(request({ inventory: [] }));
  assert.equal(first.outcome, "create");
  assert.equal(replay.outcome, "create");
  if (first.outcome !== "create" || replay.outcome !== "create") return;
  assert.equal(first.workerKey, replay.workerKey);
  assert.equal(first.workerKey, deriveWorkerKey(["growth_launch_operations"]));
  // order-insensitive identity
  assert.equal(
    deriveWorkerKey(["document_drafting", "growth_launch_operations"]),
    deriveWorkerKey(["growth_launch_operations", "document_drafting"]),
  );
});

test("worker→worker creation is structurally impossible: no capability grants staffing authority", async () => {
  const { CONTROLLED_CAPABILITIES, TOOL_PERMISSIONS } = await import("../lib/workforce/catalog");
  // Type-level proof: "create_worker" is NOT a ToolPermissionId, so no
  // assignment can ever carry staffing authority (TS2367 on direct compare).
  const staffingPermissions = TOOL_PERMISSIONS.filter((permission) =>
    /^(create_worker|spawn_worker|hire)$/.test(permission.id as string),
  );
  assert.equal(staffingPermissions.length, 0);
  for (const capability of CONTROLLED_CAPABILITIES)
    assert.ok(!capability.allowedToolPermissions.some((id) => /create_worker|spawn/.test(id)));
});
