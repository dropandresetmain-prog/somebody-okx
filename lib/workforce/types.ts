// Resource classes describe what a capability consumes, never which vendor supplies it.
export type ResourceOwnership = "owned" | "external";
export type ResourceClass =
  | "llm_reasoning"
  | "public_web"
  | "company_records"
  | "company_tools"
  | "ordinary_compute"
  | "proprietary_data"
  | "privileged_access"
  | "specialist_compute"
  | "human_voice_contact"
  | "physical_presence"
  | "attestation";
export type ResourceDefinition = {
  class: ResourceClass;
  ownership: ResourceOwnership;
  description: string;
};
export type ToolPermissionId =
  | "read_public_web"
  | "read_company_record"
  | "draft_document"
  | "record_finding"
  | "authorize_external_spend";
export type ToolPermissionDefinition = {
  id: ToolPermissionId;
  description: string;
  // External authority is vocabulary only here. No capability may grant it.
  externalAuthority: boolean;
};
export type CapabilityKey =
  | "public_information_research"
  | "company_records_lookup"
  | "document_drafting";
export type CapabilityDefinition = {
  key: CapabilityKey;
  name: string;
  description: string;
  requiredResources: readonly ResourceClass[];
  allowedToolPermissions: readonly ToolPermissionId[];
  responsibility: string;
};
export type WorkerSpec = {
  workerKey: string;
  capabilityKeys: CapabilityKey[];
  allowedToolPermissions: ToolPermissionId[];
  requiredResources: ResourceClass[];
  responsibility: string;
};
export type WorkerResolution =
  | { outcome: "reuse"; worker: WorkerSpec; reason: string }
  | { outcome: "create"; worker: WorkerSpec; reason: string };
