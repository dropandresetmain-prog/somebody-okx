// Staffing: REUSE / CREATE over the PERSISTENT worker inventory.
//
// This is the module the M2 runtime never had a real input for: resolveWorker()
// existed but the Convex runtime passed an empty inventory, so "REUSE" was
// decorative. Here the inventory is a real, loaded set of persistent Worker
// records, and the preference for REUSE is an explicit, reasoned, auditable
// decision — not a fallback of an empty list.
//
// Rules (ARCHITECTURE.md §8, locked decisions 7/9/10):
//   1. filter by governed capability + permission compatibility;
//   2. then by lifecycle/availability (an expired reservation is available);
//   3. consider relevant verified history, context/setup cost, completion time;
//   4. prefer REUSE unless a SUPPORTED reason favors CREATE;
//   5. record the reason. An unsupported reason is not a licence to create.
//
// Breadth rule: a created worker is the smallest coherent capability bundle for
// a recognizable bounded responsibility — not one giant employee, not one
// micro-agent per tiny action.

import { requireCapability, isControlledCapabilityKey } from "../workforce/catalog";
import { toolPermissionsForCapabilities } from "../workforce/permissions";
import type { CapabilityKey } from "../workforce/types";
import type { StaffingDecision, WorkerRecord } from "./types";

type CreateReason = Extract<StaffingDecision, { outcome: "create" }>["createReason"];

export type StaffingRequest = {
  objectiveKey: string;
  requirementKey: string;
  requiredCapabilityKeys: readonly string[];
  // Tool permissions the assignment genuinely needs; a candidate must grant them.
  requiredPermissions: readonly string[];
  // How long the assignment is expected to hold the worker (reservation lease).
  expectedHoldMs: number;
  now: number;
  // Context this assignment needs. A worker holding these refs has lower setup
  // cost, which is itself a supported REUSE reason.
  neededContextRefs: readonly string[];
  // Bounded parallelism demand: >1 means one worker cannot serve it alone.
  parallelismNeeded: number;
  // Specialist requirement stated in words, matched against history only as a
  // tie-breaker — never as a scenario keyword router.
  specializationNeeded: boolean;
};

export type StaffingInput = StaffingRequest & {
  inventory: readonly WorkerRecord[];
  // Whether the objective may create another worker at all (budget-gated).
  creationAllowed: boolean;
};

function isAvailable(worker: WorkerRecord, now: number): boolean {
  if (worker.lifecycle === "suspended" || worker.lifecycle === "retired") return false;
  if (worker.lifecycle === "available") return true;
  // "assigned" is available again once its reservation lease has lapsed.
  if (!worker.reservedBy) return true;
  return worker.reservedBy.heldUntil <= now;
}

// Governed capability + permission compatibility. Capabilities are validated
// fail-closed: an unknown key disqualifies the worker, it does not widen.
function capabilityCompatible(
  worker: WorkerRecord,
  request: StaffingRequest,
): { ok: boolean; missing: string[] } {
  const held = new Set<string>();
  for (const key of worker.capabilityKeys)
    if (isControlledCapabilityKey(key)) held.add(key as CapabilityKey);
  const missing = request.requiredCapabilityKeys.filter((key) => !held.has(key));
  if (missing.length) return { ok: false, missing };

  const granted = new Set<string>(toolPermissionsForCapabilities([...held] as CapabilityKey[]));
  for (const spec of worker.dynamicCapabilities)
    for (const primitive of spec.primitives) granted.add(primitive);
  const permissionMissing = request.requiredPermissions.filter((p) => !granted.has(p));
  return { ok: permissionMissing.length === 0, missing: permissionMissing };
}

function relevantHistory(worker: WorkerRecord, request: StaffingRequest): number {
  const wanted = new Set(request.requiredCapabilityKeys);
  return worker.verifiedAssignments.filter(
    (record) => record.outcome === "accepted" && record.capabilityKeys.some((key) => wanted.has(key)),
  ).length;
}

function contextOverlap(worker: WorkerRecord, request: StaffingRequest): number {
  const wanted = new Set(request.neededContextRefs);
  return worker.contextRefs.filter((ref) => wanted.has(ref)).length;
}

export function decideStaffing(input: StaffingInput): StaffingDecision {
  const eligible: { worker: WorkerRecord; score: number }[] = [];
  const considered: string[] = [];
  const disqualified: { workerKey: string; reason: string }[] = [];

  for (const worker of input.inventory) {
    considered.push(worker.workerKey);
    const capability = capabilityCompatible(worker, input);
    if (!capability.ok) {
      disqualified.push({ workerKey: worker.workerKey, reason: `missing ${capability.missing.join(", ")}` });
      continue;
    }
    if (!isAvailable(worker, input.now)) {
      disqualified.push({ workerKey: worker.workerKey, reason: "reserved or not available" });
      continue;
    }
    // A specialist demand is served by history, not by a name guess.
    if (input.specializationNeeded && relevantHistory(worker, input) === 0) {
      disqualified.push({ workerKey: worker.workerKey, reason: "no accepted assignment history in the required capability" });
      continue;
    }
    eligible.push({
      worker,
      score:
        relevantHistory(worker, input) * 10 +
        contextOverlap(worker, input) * 5 +
        // Narrower envelopes first: the smallest coherent fit.
        Math.max(0, 50 - worker.capabilityKeys.length * 5),
    });
  }

  // Deterministic ordering: score desc, then workerKey asc. Never depends on
  // inventory iteration order.
  eligible.sort((a, b) => b.score - a.score || a.worker.workerKey.localeCompare(b.worker.workerKey));

  const best = eligible[0];
  if (best) {
    // Parallelism is the one supported reason that can override a valid reuse:
    // one worker cannot be in two assignments at once.
    const freeCount = eligible.length;
    if (input.parallelismNeeded > freeCount && input.creationAllowed)
      return createDecision(input, "parallelism", `only ${freeCount} eligible worker(s) free for ${input.parallelismNeeded} concurrent assignments`);
    return {
      outcome: "reuse",
      workerKey: best.worker.workerKey,
      reason: `eligible, available and ${contextOverlap(best.worker, input) > 0 ? "already holds the needed context" : "capability-matched"}`,
      considered,
      facts: {
        availability: "free",
        setupMinutes: contextOverlap(best.worker, input) > 0 ? 0 : 5,
        reuseValue: relevantHistory(best.worker, input) > 0 ? "some" : "none",
      },
    };
  }

  const blockers = disqualified.length
    ? disqualified.map((entry) => `${entry.workerKey}: ${entry.reason}`)
    : ["inventory is empty — no persistent worker exists yet for these capabilities"];

  if (!input.creationAllowed)
    return {
      outcome: "no_staffing_possible",
      reason: "no eligible persistent worker and worker creation is at its limit for this objective",
      blockers,
    };

  const capabilityProblem = input.requiredCapabilityKeys.find(
    (key) => !isControlledCapabilityKey(key),
  );
  if (capabilityProblem)
    return {
      outcome: "no_staffing_possible",
      reason: `capability ${capabilityProblem} is not governed; a new semantic capability must be validated first`,
      blockers: [`ungoverned capability ${capabilityProblem}`, ...blockers],
    };

  return createDecision(
    input,
    "availability",
    "no eligible available persistent worker exists for the required capability envelope",
  );
}

// A CREATE is only ever issued for a supported reason; the reason is recorded
// in the decision so the reviewer can see WHY a new That Guy exists.
function createDecision(
  input: StaffingInput,
  createReason: CreateReason,
  detail: string,
): StaffingDecision {
  const keys = [...new Set(input.requiredCapabilityKeys)].sort();
  return {
    outcome: "create",
    workerKey: deriveWorkerKey(keys),
    reason: detail,
    createReason,
    considered: input.inventory.map((worker) => worker.workerKey),
  };
}

// Stable identity for a created worker: derived from the governed capability
// envelope, so the same need in the same objective resolves to the same key and
// a replayed wake cannot spawn twins.
export function deriveWorkerKey(capabilityKeys: readonly string[]): string {
  const keys = [...new Set(capabilityKeys)].sort();
  return `worker_${keys.join("-")}`;
}

// The breadth rule, as a check the caller can assert on: a created envelope
// must be exactly the required capabilities, never a superset.
export function smallestCoherentEnvelope(required: readonly string[]): CapabilityKey[] {
  const accepted: CapabilityKey[] = [];
  for (const key of required)
    if (isControlledCapabilityKey(key)) {
      requireCapability(key);
      accepted.push(key);
    }
  return [...new Set(accepted)].sort();
}

export { isAvailable as isWorkerAvailable };
