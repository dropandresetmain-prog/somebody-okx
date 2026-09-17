// Minimal internal-workforce kernel for the MAKE path, plus the current
// Objective spine modules (planner validation, factual inventory sourcing,
// WorkContract adapted from the inherited CoreWorkerContract).
// Workforce kernel adapted from pre-OKX Army of Interns R&D (BUILD_DELTA.md §2).

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
export { evaluateSourcing, isKnownResourceClass, validatePlannerProposal } from "../objective/planner";
export {
  createWorkContract,
  evaluateCompletion,
} from "../objective/contract";
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
export type {
  ActivityResult,
  ActivityEvent,
  CapabilityPlan,
  CompanyResourceInventory,
  EvidenceRecord,
  FindingInput,
  ObjectiveRecord,
  ObjectiveRow,
  ObjectiveState,
  PlannerProposal,
  ResultRequirements,
  SourcingDecision,
  SourcingReason,
  SourceClass,
  ValidatedPlan,
  WorkContract,
  WorkItem,
  WorkItemState,
  WorkerRun,
  WorkerRunStatus,
} from "../objective/types";
