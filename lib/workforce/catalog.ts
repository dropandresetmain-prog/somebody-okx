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
    // Reserved vocabulary only. No capability may grant this — the worker
    // runtime never materializes it. Document drafting uses
    // update_company_artifact (bounded versioned mutation left for review).
    id: "draft_document",
    description:
      "Obsolete alias for producing a draft artifact. Not materializable; do not grant.",
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
    description:
      "Produce a review-ready written artifact by applying a bounded versioned change to a controlled company artifact.",
    requiredResources: ["llm_reasoning", "ordinary_compute"],
    // Must grant a materializable mutation tool. draft_document is a zombie
    // permission the worker runtime never turns into a tool.
    allowedToolPermissions: ["update_company_artifact", "record_finding"],
    responsibility:
      "Draft the requested artifact from supplied material only via a bounded versioned company-artifact change, and leave it for review rather than sending or publishing it.",
    analysisOnlyResponsibility:
      "This assignment is analysis-only: you have no authority to modify any company artifact. Produce your draft content and analysis in the structured result instead of writing it anywhere.",
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
    analysisOnlyResponsibility:
      "Research public sources and internal records as needed and request any missing resources the application must acquire. This assignment is analysis-only: you have no authority to modify any company artifact — report your findings and recommendation in the structured result. Do not invoke providers, authorize spend, or make arbitrary external calls.",
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
/**
 * Per-ASSIGNMENT responsibility text (distinct from a worker's persistent,
 * capability-set-wide `responsibility`). When `analysisOnly` is true, any
 * capability whose ordinary responsibility instructs an artifact mutation is
 * substituted with its `analysisOnlyResponsibility` so a model with no
 * mutation authority for this assignment (WorkContract.targetArtifactKey ===
 * null) is never told to update an artifact it cannot write to.
 */
export function responsibilityForAssignment(
  capabilityKeys: readonly string[],
  options: { analysisOnly: boolean },
): string {
  return capabilityKeys
    .map((key) => {
      const capability = requireCapability(key);
      return options.analysisOnly && capability.analysisOnlyResponsibility
        ? capability.analysisOnlyResponsibility
        : capability.responsibility;
    })
    .join("\n");
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

/**
 * The canonical governed class vocabulary, derived from RESOURCE_CLASSES — the
 * single ownership authority above. Consumers (the worker tool boundary,
 * fixtures) MUST use this instead of duplicating a second hardcoded list: a
 * copied list drifts silently, and a drifted class vocabulary is exactly the
 * failure mode this repo's defect history records.
 */
export const GOVERNED_RESOURCE_CLASSES: readonly ResourceClass[] =
  RESOURCE_CLASSES.map((resource) => resource.class);

export function isGovernedResourceClass(value: unknown): value is ResourceClass {
  return (
    typeof value === "string" &&
    (GOVERNED_RESOURCE_CLASSES as readonly string[]).includes(value)
  );
}

/**
 * V7 review R4 — the ONE governed requested-purpose-scope vocabulary.
 *
 * A REQUEST vocabulary owned by the application, never fulfillment authority:
 * a worker may propose one of these kinds for a missing-input gap, the
 * application validates it (membership + class applicability) before it
 * becomes a ResourceNeed's requestedScope, and an adapter/offering separately
 * DECLARES which of these kinds it can fulfill. Compatibility is the exact
 * intersection of the validated request and the declaration — never prose.
 * Adapter declarations must name kinds from this list (asserted in tests), so
 * there is no second scope taxonomy.
 */
export type PurposeScopeDefinition = {
  kind: string;
  /** Resource classes this scope can be requested for. */
  resourceClasses: readonly ResourceClass[];
  description: string;
};
/**
 * Application-owned governed purpose-kind identifier. This is vocabulary —
 * not request authority and not adapter fulfillment authority. Application
 * request policy and adapter fulfillment declarations may both reference it;
 * neither invents a second taxonomy.
 */
export const FOUNDER_MESSAGING_QUALITATIVE_PURPOSE_KIND =
  "founder_messaging_qualitative" as const;
/**
 * LIVE external social-platform (Twitter/X) intelligence obtained from a real
 * third-party data provider (e.g. Newsliquid / OKX x402 live mainnet rail).
 * Distinct from FOUNDER_MESSAGING_QUALITATIVE_PURPOSE_KIND, which is
 * synthetic qualitative research and explicitly NOT live Twitter/NewsLiquid
 * data (see the M3 controlled-test-merchant product's own scope notes). This
 * kind is for current, real social-platform evidence — never synthetic.
 */
export const EXTERNAL_SOCIAL_INTELLIGENCE_PURPOSE_KIND =
  "external_social_intelligence" as const;
export const PURPOSE_SCOPES: readonly PurposeScopeDefinition[] = [
  {
    kind: FOUNDER_MESSAGING_QUALITATIVE_PURPOSE_KIND,
    resourceClasses: ["proprietary_data"],
    description:
      "Qualitative research on how founders/audiences perceive and describe a product's messaging. Not causal attribution, conversion measurement, or live platform data.",
  },
  {
    kind: EXTERNAL_SOCIAL_INTELLIGENCE_PURPOSE_KIND,
    resourceClasses: ["proprietary_data"],
    description:
      "Live, current social-platform (Twitter/X) intelligence obtained from a real third-party data provider. Not synthetic/simulated research and not internal company records.",
  },
];
export const GOVERNED_PURPOSE_KINDS: readonly string[] = PURPOSE_SCOPES.map(
  (scope) => scope.kind,
);
export function isGovernedPurposeKind(value: unknown): value is string {
  return typeof value === "string" && GOVERNED_PURPOSE_KINDS.includes(value);
}
/** True when `kind` is governed AND may be requested for `resourceClass`. */
export function purposeKindAppliesToClass(kind: string, resourceClass: string): boolean {
  const scope = PURPOSE_SCOPES.find((entry) => entry.kind === kind);
  return !!scope && scope.resourceClasses.includes(resourceClass as ResourceClass);
}
/**
 * The external resource classes a governed purpose kind may be sourced as —
 * read from PURPOSE_SCOPES, the single owner of that relationship. Empty for
 * an ungoverned kind (fail closed); callers decide how to treat >1 classes.
 */
export function externalResourceClassesForPurposeKind(kind: string): ResourceClass[] {
  const scope = PURPOSE_SCOPES.find((entry) => entry.kind === kind);
  return scope ? [...scope.resourceClasses] : [];
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
// Permissions the worker runtime can materialize from capability grants.
// Must stay aligned with MATERIALIZABLE_TOOL_PERMISSIONS in permissions.ts.
const MATERIALIZABLE_GRANT_IDS = new Set([
  "read_public_web",
  "read_company_record",
  "record_finding",
  "request_resource",
  "update_company_artifact",
]);

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
      if (!MATERIALIZABLE_GRANT_IDS.has(permissionId))
        throw new Error(
          `Capability ${capability.key} grants non-materializable permission ${permissionId}`,
        );
    }
  }
}
