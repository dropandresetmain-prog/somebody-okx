// The M1 role/capability policy: research/analysis worker assembling an
// evidence-backed business evaluation from internal company criteria plus
// current public information. This is the smallest specialization that proves
// active MAKE; it owns what observations matter, what sources are required
// and what proof completes the work. The generic runtime stays role-free.

import type { ResultRequirements, SourceClass, SourceProof } from "./types";
import type { ResourceClass, ToolPermissionId } from "../workforce/types";

export const RESEARCH_ROLE = {
  title: "Research analyst",
  requiredSourceClasses: ["company_record", "public_web"] as SourceClass[],
  // At least one internal criteria/context read plus at least two public
  // source observations, so the proof spans two distinct resource classes and
  // more than a single model response.
  minObservations: 3,
  // Per-class distinct source proof requirements (Blocker B).
  sourceProofs: [
    { sourceClass: "company_record", minDistinctSources: 1 },
    { sourceClass: "public_web", minDistinctSources: 2 },
  ] as SourceProof[],
  // Required tool permissions for this role (Blocker D — Agent B consumes).
  requiredToolPermissions: [
    "read_company_record",
    "read_public_web",
    "record_finding",
  ] as ToolPermissionId[],
  resultRequirements: {
    summary: true,
    fit: true,
    risks: true,
    unknowns: true,
    recommendedNextAction: true,
  } satisfies ResultRequirements,
  responsibility:
    "Evaluate the assigned target using the company's internal criteria and current public information. Observe sources through tools, record findings with provenance, reconcile fit, risks and unknowns, and produce a structured recommendation. Never assert what the sources do not support.",
} as const;

// Internal company context the worker reads through the company_records
// permission. Controlled development data, clearly identified as such.
export type CompanyRecord = {
  ref: string;
  label: string;
  text: string;
};

export const COMPANY_RECORDS: CompanyRecord[] = [
  {
    ref: "partnerships/evaluation-criteria",
    label: "Partnership evaluation criteria",
    text: `Partnership evaluation criteria (internal):
1. Relevance: the target must serve SME / one-person-company buyers with a product the company can resell, refer or integrate.
2. Reliability: publicly verifiable operating history of at least 12 months, or a credible parent organisation.
3. Reachability: an identified business contact channel (public business email or partner form).
4. Risk posture: no unresolved public fraud/sanction signals; clear terms of service.
5. Economics: free tier, referral or partner programme preferred over paid-only access.`,
  },
  {
    ref: "company/profile",
    label: "Company profile",
    text: `Company profile (internal): the company builds Somebody, an AI manager for one-person companies and lean SMEs. It evaluates partnership targets that extend what a one-person company can do. It has no procurement or legal department; partnerships must be self-serve.`,
  },
];

export function companyRecord(ref: string): CompanyRecord | undefined {
  return COMPANY_RECORDS.find((record) => record.ref === ref);
}

export const COMPANY_RECORD_KEYS = COMPANY_RECORDS.map((record) => record.ref);

// Factual inventory of resource classes the company currently controls for
// internal MAKE work. Catalog membership is not ownership; this is the
// application's observed truth about NOW.
export const CURRENT_RESOURCE_INVENTORY: ResourceClass[] = [
  "llm_reasoning",
  "public_web",
  "company_records",
  "company_tools",
  "ordinary_compute",
];

export function currentResourceInventory(observedAt: number): {
  availableResourceClasses: ResourceClass[];
  observedAt: number;
} {
  return {
    availableResourceClasses: [...CURRENT_RESOURCE_INVENTORY],
    observedAt,
  };
}

// Structured finding the worker records through the record_finding permission.
export type RecordedFinding = {
  sourceClass: SourceClass;
  label: string;
  text: string;
  url?: string;
  recordRef?: string;
};
