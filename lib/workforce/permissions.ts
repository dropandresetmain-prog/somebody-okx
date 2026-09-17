import {
  getCapability,
  isControlledToolPermissionId,
  requireCapability,
} from "./catalog";
import type { ToolPermissionId } from "./types";
// Deny by default: a permission exists for a worker only because a capability grants it.
export function toolPermissionsForCapabilities(
  capabilityKeys: readonly string[],
): ToolPermissionId[] {
  const granted = new Set<ToolPermissionId>();
  for (const key of capabilityKeys)
    for (const permissionId of requireCapability(key).allowedToolPermissions)
      granted.add(permissionId);
  return [...granted].sort();
}
export function isPermissionAllowedForCapability(
  permissionId: string,
  capabilityKey: string,
): boolean {
  if (!isControlledToolPermissionId(permissionId)) return false;
  const capability = getCapability(capabilityKey);
  if (!capability) return false;
  return capability.allowedToolPermissions.includes(permissionId);
}
// Filters an untrusted permission request down to the capability envelope, so a
// worker cannot widen its own tool set by asking for more.
export function enforcePermissionEnvelope(input: {
  capabilityKeys: readonly string[];
  requestedPermissions: readonly string[];
}): { granted: ToolPermissionId[]; denied: string[] } {
  const envelope = new Set(toolPermissionsForCapabilities(input.capabilityKeys));
  const granted = new Set<ToolPermissionId>();
  const denied = new Set<string>();
  for (const requested of input.requestedPermissions) {
    const permissionId = requested.trim();
    if (!permissionId) continue;
    if (
      isControlledToolPermissionId(permissionId) &&
      envelope.has(permissionId)
    )
      granted.add(permissionId);
    else denied.add(permissionId);
  }
  return {
    granted: [...granted].sort(),
    denied: [...denied].sort(),
  };
}
