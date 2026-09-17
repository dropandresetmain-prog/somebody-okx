// Current-product domain types for the M1 Objective spine.
// Fresh Somebody-OKX vocabulary: Objective / CapabilityPlan / WorkItem /
// WorkerSpec / WorkContract / Evidence / Outcome. No procurement Mission nouns.

import type { CapabilityKey, ResourceClass, WorkerSpec } from "../workforce/types";

// ── Planner boundary ─────────────────────────────────────────────────────────

// The model may propose only these bounded fields. Anything else is invalid.
export type PlannerProposal = {
  capabilityKeys: string[];
  responsibility: string;
  requiredResourceClasses: string[];
  requestedToolPermissions?: string[];
};

export type ValidatedPlan = {
  capabilityKeys: CapabilityKey[];
  responsibility: string;
  requiredResourceClasses: ResourceClass[];
  rejectedCapabilityKeys: string[];
  rejectedResourceClasses: string[];
  deniedToolPermissions: string[];
};

// ── Factual resource inventory ───────────────────────────────────────────────

// Facts about what the company controls NOW, not catalog vocabulary.
export type CompanyResourceInventory = {
  availableResourceClasses: ResourceClass[];
  observedAt: number;
};

// ── Objective spine ──────────────────────────────────────────────────────────

export type SourcingDecision = "MAKE" | "BUY" | "BLOCKED";

export type SourcingReason = {
  decision: SourcingDecision;
  satisfied: ResourceClass[];
  missing: ResourceClass[];
  reason: string;
};

export type CapabilityPlan = {
  objectiveKey: string;
  validated: ValidatedPlan;
  sourcing: SourcingReason;
  decidedAt: number;
};

export type ObjectiveState =
  | "received"
  | "planning"
  | "ready_to_execute"
  | "executing"
  | "completed"
  | "failed";

export type WorkItemState =
  | "defined"
  | "assigned"
  | "running"
  | "completed"
  | "failed";

export type WorkerRunStatus = "running" | "stopped" | "failed";

// One durable run of a bounded internal worker.
export type WorkerRun = {
  id: string;
  workItemId: string;
  status: WorkerRunStatus;
  startedAt: number;
  leaseUntil: number;
  model: string;
  modelSelectionReason: string;
  toolCalls: number;
  summary: string;
};

export type WorkItem = {
  id: string;
  objectiveKey: string;
  title: string;
  assignment: string;
  workerKey: string;
  state: WorkItemState;
  contract: WorkContract;
  runs: WorkerRun[];
};

export type ObjectiveRecord = {
  key: string;
  request: string;
  createdAt: number;
  updatedAt: number;
  state: ObjectiveState;
  activity: string;
  plan: CapabilityPlan | null;
  workItems: WorkItem[];
  run: WorkerRun | null;
  result: ActivityResult | null;
};

// ── Evidence ─────────────────────────────────────────────────────────────────

// Controlled source classes the M1 role policy can require. Each observed fact
// carries the source class it came from so completion can demand distinct
// sources, and evidence stays provable rather than model-claimed.
export type SourceClass = "company_record" | "public_web";

// Evidence origin distinguishes application-fetched content from model-authored
// notes. Only application_observation may satisfy proof (Blocker A).
export type EvidenceOrigin = "application_observation" | "model_note";

export type EvidenceSource = {
  sourceClass: SourceClass;
  label: string;
  url?: string;
  recordRef?: string;
};

export type FindingInput = {
  sourceClass: SourceClass;
  label: string;
  text: string;
  url?: string;
  recordRef?: string;
  observedAt: number;
  origin: EvidenceOrigin;
  sourceId: string;
};

export type EvidenceRecord = FindingInput & {
  id: string;
  recordedBy: string;
  runId: string;
};

// ── WorkContract ─────────────────────────────────────────────────────────────

// Per-class distinct source proof requirement (Blocker B).
export type SourceProof = {
  sourceClass: SourceClass;
  minDistinctSources: number;
};

// The assignment-specific authority + proof boundary. Adapted from the
// inherited CoreWorkerContract so evidence-only internal work can complete
// without inventing an external state-changing effect.
export type WorkContract = {
  // Bounded assignment given to this worker.
  assignment: string;
  // Stable idempotency scope: retries of the same assignment share it.
  idempotencyScope: string;
  // The worker this contract binds (lib/workforce WorkerSpec identity).
  workerKey: string;
  // Capability envelope backing the tool permission envelope.
  capabilityKeys: CapabilityKey[];
  // Tool permissions materialized for this assignment (deny-by-default subset).
  allowedToolPermissions: string[];
  // Required source classes the worker must observe to be complete.
  requiredSourceClasses: SourceClass[];
  // Minimum distinct observations overall.
  minObservations: number;
  // Per-class distinct source proof requirements (Blocker B).
  sourceProofs: SourceProof[];
  // Optional externally verified effect keys (none in M1: zero spend/BUY).
  requiredVerifiedEffectKeys: string[];
  // Authority snapshot for gated actions. Always null in M1 MAKE work.
  approvalVersion: number | null;
  // The structured result the worker must produce.
  resultRequirements: ResultRequirements;
};

export type ResultRequirements = {
  summary: boolean;
  fit: boolean;
  risks: boolean;
  unknowns: boolean;
  recommendedNextAction: boolean;
};

// ── Structured result ────────────────────────────────────────────────────────

export type ActivityResult = {
  summary: string;
  fit: string;
  risks: string[];
  unknowns: string[];
  recommendedNextAction: string;
  completedAt: number;
};

// ── Activity ─────────────────────────────────────────────────────────────────

export type ActivityKind =
  | "system"
  | "agent"
  | "evidence"
  | "decision"
  | "result";

export type ActivityEvent = {
  at: number;
  kind: ActivityKind;
  text: string;
};

// ── Convex shape (validator-mirrored) ────────────────────────────────────────

export type ObjectiveRow = {
  key: string;
  data: ObjectiveRecord;
};

// WorkerSpec comes from lib/workforce; re-exported here for the seam.
export type { WorkerSpec };
