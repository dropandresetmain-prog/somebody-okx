import type {
  CapabilityDefinition,
  CapabilityKey,
  ResourceClass,
  ResourceDefinition,
  ToolPermissionDefinition,
  ToolPermissionId,
} from "./types";
export const RESOURCE_CLASSES: readonly ResourceDefinition[] = [
  {
    class: "llm_reasoning",
    ownership: "owned",
    description: "Generic model reasoning the company already pays for.",
  },
  {
    class: "public_web",
    ownership: "owned",
    description: "Publicly reachable web pages and search results.",
  },
  {
    class: "company_records",
    ownership: "owned",
    description: "Documents and records the company already holds.",
  },
  {
    class: "company_tools",
    ownership: "owned",
    description: "Systems the company is already authenticated against.",
  },
  {
    class: "ordinary_compute",
    ownership: "owned",
    description: "Normal application compute.",
  },
  {
    class: "proprietary_data",
    ownership: "external",
    description: "Licensed or proprietary data held by another entity.",
  },
  {
    class: "privileged_access",
    ownership: "external",
    description: "Access rights the company does not hold.",
  },
  {
    class: "specialist_compute",
    ownership: "external",
    description: "Scarce or specialist infrastructure.",
  },
  {
    class: "human_voice_contact",
    ownership: "external",
    description: "Independent human voice contact with a third party.",
  },
  {
    class: "physical_presence",
    ownership: "external",
    description: "Action in the physical world.",
  },
  {
    class: "attestation",
    ownership: "external",
    description: "Independent third-party attestation or verification.",
  },
] as const;
export const TOOL_PERMISSIONS: readonly ToolPermissionDefinition[] = [
  {
    id: "read_public_web",
    description: "Retrieve publicly reachable pages.",
    externalAuthority: false,
  },
  {
    id: "read_company_record",
    description: "Read company records relevant to the assigned work.",
    externalAuthority: false,
  },
  {
    id: "draft_document",
    description: "Produce a draft artifact for review.",
    externalAuthority: false,
  },
  {
    id: "record_finding",
    description: "Record a structured finding as evidence.",
    externalAuthority: false,
  },
  {
    id: "authorize_external_spend",
    description:
      "Commit company funds to an external provider. Reserved for a future BUY path; no capability grants it.",
    externalAuthority: true,
  },
  {
    id: "request_resource",
    description: "Propose a missing resource the application should acquire.",
    externalAuthority: false,
  },
  {
    id: "update_company_artifact",
    description: "Apply a bounded versioned change to a controlled company artifact.",
    externalAuthority: false,
  },
] as const;
// A capability's allowedToolPermissions is the single source of truth for grants.
export const CONTROLLED_CAPABILITIES: readonly CapabilityDefinition[] = [
  {
    key: "public_information_research",
    name: "Public information research",
    description: "Gather and synthesize information available on the public web.",
    requiredResources: ["llm_reasoning", "public_web", "ordinary_compute"],
    allowedToolPermissions: ["read_public_web", "record_finding"],
    responsibility:
      "Answer the assigned question from public sources and record findings with their provenance. Do not assert anything the sources do not support.",
  },
  {
    key: "company_records_lookup",
    name: "Company records lookup",
    description: "Retrieve and summarize facts from records the company holds.",
    requiredResources: [
      "llm_reasoning",
      "company_records",
      "company_tools",
      "ordinary_compute",
    ],
    allowedToolPermissions: ["read_company_record", "record_finding"],
    responsibility:
      "Retrieve the requested facts from company records and record them with their source. Report gaps instead of inferring missing values.",
  },
  {
    key: "document_drafting",
    name: "Document drafting",
    description: "Produce a review-ready written artifact from supplied material.",
    requiredResources: ["llm_reasoning", "ordinary_compute"],
    allowedToolPermissions: ["draft_document", "record_finding"],
    responsibility:
      "Draft the requested artifact from supplied material only, and leave it for review rather than sending or publishing it.",
  },
  {
    key: "growth_launch_operations",
    name: "Growth launch operations",
    description: "Research and update controlled company artifacts for growth objectives.",
    requiredResources: [
      "llm_reasoning",
      "public_web",
      "company_records",
      "company_tools",
      "ordinary_compute",
    ],
    allowedToolPermissions: [
      "read_company_record",
      "read_public_web",
      "record_finding",
      "update_company_artifact",
      "request_resource",
    ],
    responsibility:
      "Research public sources and internal records as needed, update the controlled company artifact with a versioned change, and request any missing resources the application must acquire. Do not invoke providers, authorize spend, or make arbitrary external calls.",
  },
] as const;
const resourceByClass = new Map(
  RESOURCE_CLASSES.map((resource) => [resource.class, resource]),
);
const permissionById = new Map(
  TOOL_PERMISSIONS.map((permission) => [permission.id, permission]),
);
const capabilityByKey = new Map(
  CONTROLLED_CAPABILITIES.map((capability) => [capability.key, capability]),
);
export function listControlledCapabilityKeys(): CapabilityKey[] {
  return CONTROLLED_CAPABILITIES.map((capability) => capability.key).sort();
}
export function isControlledCapabilityKey(key: string): key is CapabilityKey {
  return capabilityByKey.has(key as CapabilityKey);
}
export function getCapability(key: string): CapabilityDefinition | undefined {
  return capabilityByKey.get(key as CapabilityKey);
}
export function requireCapability(key: string): CapabilityDefinition {
  const capability = getCapability(key);
  if (!capability) throw new Error(`Unknown capability: ${key}`);
  return capability;
}
export function isControlledToolPermissionId(id: string): id is ToolPermissionId {
  return permissionById.has(id as ToolPermissionId);
}
export function getToolPermission(
  id: string,
): ToolPermissionDefinition | undefined {
  return permissionById.get(id as ToolPermissionId);
}
export function isOwnedResourceClass(resource: string): boolean {
  return resourceByClass.get(resource as ResourceClass)?.ownership === "owned";
}
// Models may propose capability keys; only controlled keys survive.
export function validateCapabilityKeys(proposed: readonly string[]): {
  accepted: CapabilityKey[];
  rejected: string[];
} {
  const accepted = new Set<CapabilityKey>();
  const rejected = new Set<string>();
  for (const proposal of proposed) {
    const key = proposal.trim();
    if (!key) continue;
    if (isControlledCapabilityKey(key)) accepted.add(key);
    else rejected.add(key);
  }
  return {
    accepted: [...accepted].sort(),
    rejected: [...rejected].sort(),
  };
}
// Guards the catalog itself, so a bad definition fails at the source rather than at a grant.
export function assertCatalogIntegrity(): void {
  for (const capability of CONTROLLED_CAPABILITIES) {
    for (const resource of capability.requiredResources) {
      if (!resourceByClass.has(resource))
        throw new Error(
          `Capability ${capability.key} requires unknown resource class ${resource}`,
        );
      if (!isOwnedResourceClass(resource))
        throw new Error(
          `Capability ${capability.key} requires externally controlled resource ${resource}`,
        );
    }
    for (const permissionId of capability.allowedToolPermissions) {
      const permission = permissionById.get(permissionId);
      if (!permission)
        throw new Error(
          `Capability ${capability.key} grants unknown tool permission ${permissionId}`,
        );
      if (permission.externalAuthority)
        throw new Error(
          `Capability ${capability.key} grants external-authority permission ${permissionId}`,
        );
    }
  }
}
