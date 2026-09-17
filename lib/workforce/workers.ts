import {
  isControlledCapabilityKey,
  isOwnedResourceClass,
  requireCapability,
} from "./catalog";
import {
  enforcePermissionEnvelope,
  toolPermissionsForCapabilities,
} from "./permissions";
import type {
  CapabilityKey,
  ResourceClass,
  WorkerResolution,
  WorkerSpec,
} from "./types";
function requiredCapabilitySet(keys: readonly string[]): CapabilityKey[] {
  const validated = new Set(keys.map((key) => requireCapability(key).key));
  if (validated.size === 0)
    throw new Error("A worker requires at least one controlled capability");
  return [...validated].sort();
}
function resourcesForCapabilities(keys: readonly CapabilityKey[]): ResourceClass[] {
  const resources = new Set<ResourceClass>();
  for (const key of keys)
    for (const resource of requireCapability(key).requiredResources) {
      if (!isOwnedResourceClass(resource))
        throw new Error(
          `Capability ${key} requires externally controlled resource ${resource}`,
        );
      resources.add(resource);
    }
  return [...resources].sort();
}
function responsibilityForCapabilities(keys: readonly CapabilityKey[]): string {
  return keys.map((key) => requireCapability(key).responsibility).join("\n");
}
// Capability keys contain no "-", so the derived key is stable and collision-free.
function workerKeyForCapabilities(keys: readonly CapabilityKey[]): string {
  return `worker_${keys.join("-")}`;
}
export function createWorkerSpec(capabilityKeys: readonly string[]): WorkerSpec {
  const keys = requiredCapabilitySet(capabilityKeys);
  return {
    workerKey: workerKeyForCapabilities(keys),
    capabilityKeys: keys,
    allowedToolPermissions: toolPermissionsForCapabilities(keys),
    requiredResources: resourcesForCapabilities(keys),
    responsibility: responsibilityForCapabilities(keys),
  };
}
// An inventory worker is untrusted input: rebuild it from controlled capabilities and
// never widen the permissions it already declares.
function sanitizeInventoryWorker(worker: WorkerSpec): WorkerSpec | null {
  const keys = [
    ...new Set(worker.capabilityKeys.filter(isControlledCapabilityKey)),
  ].sort();
  if (keys.length === 0) return null;
  return {
    workerKey: worker.workerKey,
    capabilityKeys: keys,
    allowedToolPermissions: enforcePermissionEnvelope({
      capabilityKeys: keys,
      requestedPermissions: worker.allowedToolPermissions,
    }).granted,
    requiredResources: resourcesForCapabilities(keys),
    responsibility: responsibilityForCapabilities(keys),
  };
}
// The MAKE primitive: a missing worker is not a missing capability, so an absent
// match produces buildable internal capacity rather than a reason to buy.
export function resolveWorker(input: {
  requiredCapabilityKeys: readonly string[];
  inventory: readonly WorkerSpec[];
}): WorkerResolution {
  const required = requiredCapabilitySet(input.requiredCapabilityKeys);
  const candidates = input.inventory
    .map(sanitizeInventoryWorker)
    .filter((worker): worker is WorkerSpec => worker !== null)
    .filter((worker) =>
      required.every((key) => worker.capabilityKeys.includes(key)),
    )
    .sort(
      (a, b) =>
        a.capabilityKeys.length - b.capabilityKeys.length ||
        a.workerKey.localeCompare(b.workerKey),
    );
  const reused = candidates[0];
  if (reused)
    return {
      outcome: "reuse",
      worker: reused,
      reason: "An existing internal worker already covers the required capabilities",
    };
  return {
    outcome: "create",
    worker: createWorkerSpec(required),
    reason: "No existing internal worker covers the required capabilities",
  };
}
