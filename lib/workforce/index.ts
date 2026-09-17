// Minimal internal-workforce kernel for the MAKE path.
// Adapted from the pre-OKX Army of Interns workforce R&D (see BUILD_DELTA.md §2).
export {
  CONTROLLED_CAPABILITIES,
  RESOURCE_CLASSES,
  TOOL_PERMISSIONS,
  assertCatalogIntegrity,
  getCapability,
  getToolPermission,
  isControlledCapabilityKey,
  isControlledToolPermissionId,
  isOwnedResourceClass,
  listControlledCapabilityKeys,
  requireCapability,
  validateCapabilityKeys,
} from "./catalog";
export {
  enforcePermissionEnvelope,
  isPermissionAllowedForCapability,
  toolPermissionsForCapabilities,
} from "./permissions";
export { createWorkerSpec, resolveWorker } from "./workers";
export type {
  CapabilityDefinition,
  CapabilityKey,
  ResourceClass,
  ResourceDefinition,
  ResourceOwnership,
  ToolPermissionDefinition,
  ToolPermissionId,
  WorkerResolution,
  WorkerSpec,
} from "./types";
