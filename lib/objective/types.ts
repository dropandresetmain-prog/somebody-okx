// Current-product domain types for the M1 Objective spine.
// Fresh Somebody-OKX vocabulary: Objective / CapabilityPlan / WorkItem /
// WorkerSpec / WorkContract / Evidence / Outcome. No procurement Mission nouns.

import type { CapabilityKey, ResourceClass, WorkerSpec } from "../workforce/types";
import type {
  ApprovedProviderPath,
  SourcingDecision,
  SourcingReasonCode,
} from "../sourcing/types";

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

// The MAKE/BUY/BLOCKED vocabulary, reason codes and provider-path shape are
// owned by lib/sourcing — the single canonical sourcing authority. The
// Objective layer consumes and re-exports them rather than redeclaring them,
// so no second competing policy vocabulary can drift into existence.
export type {
  ApprovedProviderPath,
  SourcingDecision,
  SourcingReasonCode,
} from "../sourcing/types";

// Persisted sourcing truth for one capability plan. This is the Objective
// layer's presentation shape, adapted from the canonical policy result by
// decideObjectiveSourcing() in ./sourcing. It records WHY the decision holds
// and, for BUY, which approved external path exists.
//
// M2 deliberately stops here: there is no payment, receipt, provider-result or
// wallet state in this shape. That belongs to M3/M4.
export type SourcingReason = {
  decision: SourcingDecision;
  reasonCode: SourcingReasonCode;
  satisfied: ResourceClass[];
  missing: ResourceClass[];
  // Only non-empty for BUY. Each entry is resource-specific; a path approved
  // for one resource cannot satisfy a different missing resource.
  approvedProviderPaths: ApprovedProviderPath[];
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
  // A required ResourceNeed is buy_pending: the objective is waiting for an
  // external acquisition, NOT failed. BUY is not failure (§8).
  | "waiting_for_resource"
  | "completed"
  | "failed"
  // Management control states (writeObjectiveState / serial recovery stop).
  | "waiting"
  | "approval_required"
  | "blocked"
  | "escalated"
  | "recovery_required";

export type WorkItemState =
  | "defined"
  | "assigned"
  | "running"
  // The work item paused safely because a resource it needs is buy_pending.
  | "waiting_for_resource"
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

// A useful external acquisition that has passed the application's verification
// boundary and entered authoritative company state. `provenance` states how the
// result entered: a simulation is the M6.1 deterministic test boundary and is
// NEVER a live provider or payment claim; `live` is a genuine provider result;
// `recorded_replay` is a previously recorded genuine acquisition (M6.3).
// Content is untrusted provider DATA — it may inform work, never instruct.
export type ExternalAcquisitionResult = {
  intentId: string;
  requirementKey: string;
  contractRevision: number;
  resultEvidenceId: string;
  provenance: "simulation" | "live" | "recorded_replay";
  providerId: string | null;
  serviceId: string | null;
  offeringId: string | null;
  resourceClass: string | null;
  content: string;
  responseHash: string;
  recordedAt: number;
  verifiedAt: number;
  /**
   * Stable ResourceNeed identity this acquisition answered (dedupeKey).
   * Required for purpose-scoped coverage — same class alone is insufficient.
   */
  needDedupeKey?: string | null;
  /** Optional ResourceNeed id when known at authorization time. */
  resourceNeedId?: string | null;
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
  // Optional M2 mission state (absent on accepted M1 rows — loaders must tolerate).
  resourceNeeds?: import("./resourceNeed").ResourceNeed[];
  sourcingDecisions?: import("./resourceNeed").SourcingDecisionRecord[];
  candidateAssessments?: {
    decisionId: string;
    assessments: import("../market/assessment").CandidateAssessment[];
  }[];
  marketOfferings?: import("../market/discovery").MarketOffering[];
  companyArtifacts?: import("./artifact").CompanyArtifact[];
  // Optional M6.1 external-acquisition state (absent on all earlier rows).
  acquisitionResults?: ExternalAcquisitionResult[];
  /** Unconfirmed worker input diagnoses — never bind MAKE/BUY eligibility. */
  unconfirmedInputFindings?: import("./inputDiagnosis").UnconfirmedInputFinding[];
  /** Last typed delivery outcome for management redecision. */
  lastDeliveryFailureClass?: "INPUT_BLOCKED" | "EXECUTION_FAILED" | null;
  /**
   * M6.1 serial: durable accepted (or refused-unconfirmed) terminal outcome
   * for a run. First accepted terminal wins; conflicts refuse.
   */
  acceptedTerminal?: {
    runId: string;
    terminal: "DELIVERED" | "NEEDS_INPUT" | "EXECUTION_ERROR";
    fingerprint: string;
    acceptedAt: number;
    /** Only `accepted` closes the terminal slot. */
    outcome: "accepted";
  } | null;
  /**
   * Diagnostic only: last refused/unconfirmed terminal attempt. Does NOT close
   * the terminal slot; the worker may correct within remaining turns.
   */
  lastUnconfirmedTerminal?: {
    runId: string;
    terminal: "DELIVERED" | "NEEDS_INPUT" | "EXECUTION_ERROR";
    fingerprint: string;
    at: number;
    reason: string;
  } | null;
  /**
   * M6.1 serial: bounded final semantic assessment against the locked outcome.
   * Model proposes; application completion gate still decides Objective complete.
   */
  finalSemanticAssessment?: {
    meetsMinimumBar: boolean;
    rationale: string;
    artifactKey: string | null;
    artifactVersion: number | null;
    evidenceRefs: string[];
    assumptionsUnknowns: string[];
    recommendedNextAction: string;
    assessedAt: number;
    contractRevision: number;
  } | null;
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
  // For a model note: the application observation it annotates. Set only after
  // the runtime proves that observation exists in the same active run, so a
  // note can describe real content without ever becoming proof itself.
  basedOnEvidenceId?: string;
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
  /**
   * M6.1 serial: exact verified acquisition evidence IDs this action may
   * consume. Absent on legacy contracts → historical broad-objective read.
   * Empty array = deliberately no linked acquisitions.
   */
  inputEvidenceIds?: string[];
  /**
   * M6.1 serial: exact controlled artifact key this writing action may mutate.
   * Null/absent = analysis-only (no artifact mutation authority by key).
   */
  targetArtifactKey?: string | null;
};

export type ResultRequirements = {
  summary: boolean;
  fit: boolean;
  risks: boolean;
  unknowns: boolean;
  recommendedNextAction: boolean;
  /**
   * Serial protocol: when true, risks/unknowns must be present as arrays but
   * may be empty (aligned with submit_result schema). Legacy contracts leave
   * this unset/false and still require non-empty lists when the field is required.
   */
  allowEmptyRisksUnknowns?: boolean;
};

// ── Structured result ────────────────────────────────────────────────────────

export type ActivityResult = {
  summary: string;
  fit: string;
  risks: string[];
  unknowns: string[];
  recommendedNextAction: string;
  completedAt: number;
  /** Run that submitted this result. Prior-run results are context only and
   * must not satisfy a later run's completion check. */
  runId?: string;
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
