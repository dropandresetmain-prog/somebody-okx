import {
  getCapability,
  isControlledToolPermissionId,
  requireCapability,
} from "./catalog";
import type { ToolPermissionId } from "./types";

/**
 * Permissions the worker runtime can turn into tools. Capability grants outside
 * this set are unrealizable (zombie) and must not reach dispatch.
 * authorize_external_spend and draft_document are intentionally excluded.
 */
export const MATERIALIZABLE_TOOL_PERMISSIONS: ReadonlySet<ToolPermissionId> = new Set([
  "read_public_web",
  "read_company_record",
  "record_finding",
  "request_resource",
  "update_company_artifact",
]);

export function isMaterializableToolPermission(id: string): boolean {
  return MATERIALIZABLE_TOOL_PERMISSIONS.has(id as ToolPermissionId);
}

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
