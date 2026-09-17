// Minimal internal-workforce kernel for the MAKE path, plus the current
// Objective spine modules (planner validation, canonical sourcing policy,
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
export { isKnownResourceClass, validatePlannerProposal } from "../objective/planner";
// The canonical sourcing authority (rule) and the Objective seam (adapter).
// One policy, one seam — nothing in the Objective layer decides MAKE/BUY/BLOCKED.
export { evaluateSourcingPolicy, validateModelProposal } from "../sourcing";
export {
  APPROVED_PROVIDER_PATHS,
  approvedPathsFor,
  decideObjectiveSourcing,
} from "../objective/sourcing";
export type {
  ApprovedProviderPath,
  SourcingReasonCode,
} from "../sourcing";
export {
  createWorkContract,
  evaluateCompletion,
} from "../objective/contract";
export {
  COMPANY_RECORDS,
  COMPANY_RECORD_KEYS,
  CURRENT_RESOURCE_INVENTORY,
  RESEARCH_ROLE,
  companyRecord,
  currentResourceInventory,
} from "../objective/policy";
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
  EvidenceOrigin,
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
  SourceProof,
  ValidatedPlan,
  WorkContract,
  WorkItem,
  WorkItemState,
  WorkerRun,
  WorkerRunStatus,
} from "../objective/types";
