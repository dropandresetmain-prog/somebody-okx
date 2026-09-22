// Somebody × OKX — V1 product-facing read contract (types only).
//
// SSOT: docs/product/FRONTEND_CONTRACTS.md (accepted at 66262ea). This module is
// the ONE shared TypeScript home for those shapes: the backend projection
// (lib/product/frontendProjection.ts) produces them and React consumes them.
// Never redeclare a variant of these types elsewhere.
//
// This file has no runtime code and no imports so both Convex and React can
// reference it.

// ── Transport (§4) ───────────────────────────────────────────────────────────

export type ProductReadEnvelope<T> =
  | {
      found: true;
      contractVersion: 1;
      /** Opaque backend token; its format is not part of the contract. */
      viewRevision: string;
      generatedAt: number;
      view: T;
    }
  | {
      found: false;
      contractVersion: 1;
      reason: "not_found";
    };

// ── Objective status / list (§5–7) ───────────────────────────────────────────

export type ObjectiveProductStatus =
  | "starting"
  | "working"
  | "waiting"
  | "needs_you"
  | "verifying"
  | "completed"
  | "blocked";

export type ObjectiveSummaryView = {
  id: string;
  title: string;
  status: ObjectiveProductStatus;
  updatedAt: number;
  statusLabel?: string;
  hasAttention: boolean;
};

export type ObjectiveListView = {
  inProgress: ObjectiveSummaryView[];
  needsYou: ObjectiveSummaryView[];
  done: ObjectiveSummaryView[];
};

// ── Objective (§9) ───────────────────────────────────────────────────────────

export type ObjectiveView = {
  id: string;
  title: string;
  request: string;
  summary?: string;
  status: ObjectiveProductStatus;
  createdAt: number;
  updatedAt: number;
};

// ── Somebody Now (§10) ───────────────────────────────────────────────────────

export type SomebodyNowState =
  | "interpreting"
  | "working"
  | "waiting"
  | "needs_you"
  | "verifying"
  | "completed"
  | "blocked";

export type SomebodyNowView = {
  state: SomebodyNowState;
  headline: string;
  detail: string;
  updatedAt: number;
};

// ── Progress / checkpoints (§12) ─────────────────────────────────────────────

export type CheckpointState = "pending" | "active" | "complete" | "blocked";

export type CheckpointView = {
  id: string;
  label: string;
  state: CheckpointState;
  detail?: string;
};

export type ProgressView = {
  checkpoints: CheckpointView[];
  currentPhase?: string;
};

// ── Current work / Intern (§14, §16) ─────────────────────────────────────────

export type ProductApproach = "MAKE" | "BUY" | "WAIT" | "ASK";

export type CurrentWorkStatus = "queued" | "working" | "waiting" | "done" | "blocked";

export type InternState = "idle" | "assigned" | "working" | "waiting" | "done";

export type InternView = {
  id: string;
  label: string;
  specialty?: string;
  state: InternState;
};

export type CurrentWorkView = {
  id: string;
  title: string;
  summary?: string;
  status: CurrentWorkStatus;
  approach?: ProductApproach;
  intern?: InternView;
  startedAt?: number;
  updatedAt: number;
};

// ── Activity (§19–23) ────────────────────────────────────────────────────────

export type ActivityType =
  | "objective_interpreted"
  | "intern_assigned"
  | "work_started"
  | "work_summary"
  | "work_completed"
  | "finding_added"
  | "evidence_gap_identified"
  | "manager_decision"
  | "founder_action_required"
  | "acquisition_started"
  | "acquisition_submitted"
  | "external_result_received"
  | "external_result_verified"
  | "work_resumed"
  | "artifact_changed"
  | "verification_started"
  | "verification_completed"
  | "objective_completed"
  | "objective_blocked";

export type ActivityActor =
  | { kind: "somebody"; label: "Somebody" }
  | { kind: "intern"; id: string; label: string }
  | { kind: "founder"; label: string }
  | { kind: "external"; id?: string; label: string };

export type ActivityImportance = "major" | "standard" | "minor";

export type ExternalProvenance = "live" | "simulation" | "recorded_replay";

export type EvidenceRefView = { id: string; label: string };

export type InternAssignedPayload = {
  intern: InternView;
  assignmentTitle: string;
  scope?: string;
  authorityNote?: string;
};

export type FindingPayload = {
  finding: string;
  evidenceRefs?: EvidenceRefView[];
};

export type ManagerDecisionPayload = {
  selected: { approach: ProductApproach; label: string };
  alternative?: { approach: ProductApproach; label: string };
  reason?: string;
};

export type WorkSummaryPayload = {
  summary: string;
  actionCount?: number;
  durationMs?: number;
};

export type ArtifactChangedPayload = {
  deliverableId: string;
  before?: string;
  after?: string;
  changeSummary: string;
  evidenceRefs?: EvidenceRefView[];
};

export type VerificationPayload = {
  checks: { label: string; status: "passed" | "pending" | "failed" }[];
  remainingUnknowns?: string[];
};

export type ActivityPayload =
  | InternAssignedPayload
  | FindingPayload
  | ManagerDecisionPayload
  | WorkSummaryPayload
  | ArtifactChangedPayload
  | VerificationPayload;

export type ActivityItem = {
  id: string;
  type: ActivityType;
  occurredAt: number;
  actor: ActivityActor;
  title: string;
  detail?: string;
  importance: ActivityImportance;
  related?: {
    internId?: string;
    deliverableId?: string;
    acquisitionId?: string;
    evidenceIds?: string[];
  };
  /** Present ONLY when a persisted relationship supports it; never inferred. */
  causedByActivityId?: string;
  provenance?: ExternalProvenance;
  payload?: ActivityPayload;
};

// ── Deliverables (§24) ───────────────────────────────────────────────────────

export type DeliverableStatus = "draft" | "current" | "verified" | "superseded";

export type DeliverableView = {
  id: string;
  title: string;
  type: string;
  version: number | string;
  status: DeliverableStatus;
  summary?: string;
  content?: string;
  assumptions?: string[];
  unknowns?: string[];
  recommendedNextMove?: string;
  evidenceRefs?: EvidenceRefView[];
  updatedAt: number;
};

// ── Money / Attention (§29, §33) ─────────────────────────────────────────────

export type MoneyView = {
  amount: string;
  currency: string;
};

export type AttentionType = "approval" | "clarification" | "choice" | "reconciliation";

export type AttentionActionType =
  | "approve"
  | "decline"
  | "choose"
  | "provide_input"
  | "acknowledge";

export type AttentionActionView = {
  id: string;
  type: AttentionActionType;
  label: string;
  requiresText?: boolean;
  destructive?: boolean;
  confirmText?: string;
};

export type AttentionState = {
  id: string;
  revision: string;
  type: AttentionType;
  title: string;
  detail: string;
  context?: {
    reason?: string;
    amount?: MoneyView;
  };
  actions: AttentionActionView[];
};

// ── Acquisitions / transactions (§34) ────────────────────────────────────────

export type AcquisitionProductStatus =
  | "proposed"
  | "needs_approval"
  | "in_progress"
  | "result_received"
  | "verified"
  | "failed"
  | "reconciliation_required";

export type TransactionFactView = {
  status: "not_started" | "submitted" | "confirmed" | "failed" | "reconciliation_required";
  label: string;
  txHash?: string;
  explorerUrl?: string;
};

export type AcquisitionView = {
  id: string;
  resourceLabel: string;
  providerLabel?: string;
  amount?: MoneyView;
  status: AcquisitionProductStatus;
  transaction?: TransactionFactView;
  resultSummary?: string;
  /**
   * Present once a result is persisted (verified / result-backed acquisitions
   * always carry it). Absent before that: provenance is only durable with the
   * AcquisitionResult and is never defaulted or invented.
   */
  provenance?: ExternalProvenance;
  updatedAt: number;
};

// ── Actions (§37) ────────────────────────────────────────────────────────────

export type ObjectiveActionType = "resume" | "retry";

export type ObjectiveActionView = {
  id: string;
  type: ObjectiveActionType;
  label: string;
  confirmText?: string;
};

// ── Workspace (§8) ───────────────────────────────────────────────────────────

export type ObjectiveWorkspaceView = {
  objective: ObjectiveView;
  progress: ProgressView;
  somebodyNow: SomebodyNowView;
  currentWork: CurrentWorkView | null;
  activity: ActivityItem[];
  deliverables: DeliverableView[];
  acquisitions: AcquisitionView[];
  attention: AttentionState | null;
  availableActions: ObjectiveActionView[];
};

// ── Start capabilities (§38) ─────────────────────────────────────────────────

export type StartCapabilitiesView = {
  canCreateObjective: boolean;
  supportsContextRefs: boolean;
  supportsAttachments: boolean;
  advanced: {
    spendLimit: boolean;
    deadline: boolean;
    externalEffectPolicy: boolean;
  };
};

// ── Commands (§40–44) — shared command shapes ───────────────────────────────
// Create Objective is wired via convex/productCommands.createObjectiveV1.
// Other command adapters remain reserved / unwired.

export type CreateObjectiveCommand = {
  request: string;
  contextRefs?: string[];
  advanced?: {
    spendLimit?: MoneyView;
    deadline?: string;
    externalEffectPolicy?: string;
  };
};

export type SubmitAttentionActionCommand = {
  objectiveId: string;
  attentionId: string;
  attentionRevision: string;
  actionId: string;
  text?: string;
};

export type AddFounderInputCommand = {
  objectiveId: string;
  text: string;
  contextRefs?: string[];
};

export type InvokeObjectiveActionCommand = {
  objectiveId: string;
  actionId: string;
  expectedViewRevision: string;
};

export type ProductCommandError = {
  code:
    | "validation_error"
    | "not_allowed"
    | "stale_view"
    | "conflict"
    | "temporarily_unavailable"
    | "reconciliation_required";
  message: string;
};

export type ProductCommandResult =
  | { accepted: true; commandId: string; objectiveId: string }
  | { accepted: false; error: ProductCommandError };
