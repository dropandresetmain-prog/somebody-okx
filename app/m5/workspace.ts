import type { PaymentState } from "../../lib/payment/types";

// Provisional read-model projections, NOT Convex tables. M4 reference: 7723c096.
// Keep these at the adapter seam until a server-side normalized read model exists.
export type Strategy = "MAKE" | "BUY" | "HYBRID" | "WAIT" | "ASK_FOUNDER" | "BLOCK";
export type ObjectiveState = "received" | "planning" | "ready_to_execute" | "executing" | "waiting_for_resource" | "waiting" | "approval_required" | "blocked" | "escalated" | "recovery_required" | "completed" | "failed";
export type RequirementView = {
  requirementKey: string;
  title: string;
  mustBeTrue: string;
  priority: "required" | "supporting";
  state: "active" | "satisfied" | "blocked" | "superseded" | "waived";
  strategy: Strategy | null;
  contractRevision: number;
  resolution: { resolutionId: string; proofRefs: string[]; acceptedAt: number } | null;
};
export type WorkerView = {
  workerKey: string;
  displayName: string;
  responsibility: string;
  lifecycle: "available" | "assigned" | "suspended" | "retired";
  staffing: { outcome: "reuse" | "create"; reason: string };
  verifiedHistory: string[];
  reservedForAssignmentId: string | null;
};
export type AssignmentView = {
  assignmentId: string;
  workerKey: string;
  requirementKey: string;
  decisionId: string;
  state: "authorized" | "dispatched" | "running" | "result_submitted" | "verified" | "failed" | "superseded";
  resultSummary: string | null;
  proofRefs: string[];
};
export type OptionView = {
  optionId: string;
  strategy: "MAKE" | "BUY" | "HYBRID";
  label: string;
  eligibility: "eligible" | "ineligible";
  reason: string;
  facts: { label: string; value: string; provenance: "persisted_evidence" | "registry_data" | "provider_quote" | "llm_estimate" | "measured" | "unknown" }[];
};
export type DecisionView = {
  decisionId: string;
  requirementKey: string;
  strategy: Strategy;
  summary: string;
  rationale: string;
  authorization: "authorized" | "approval_required" | "refused";
  selectedOptionId: string | null;
  options: OptionView[];
  at: number;
};
export type ExternalView = {
  providerId: string;
  name: string;
  resource: string;
  requirementKey: string;
  decisionId: string;
  // No authorized execution intent exists before authority is granted.
  intent: {
    intentId: string;
    kind: "external_acquisition" | "external_effect";
    state: "authorized" | "handed_off" | "awaiting_m3" | "result_recorded" | "verified" | "failed" | "reconciliation_required";
    approvalId: string;
  } | null;
  payment: {
    paymentId: string;
    state: PaymentState;
    maximumUsd: number;
    history: { id: string; state: PaymentState; at: number }[];
  };
  boundaryNote: string;
};
export type EvidenceView = {
  evidenceId: string;
  label: string;
  summary: string;
  origin: "application_observation" | "provider_result" | "founder_confirmation";
  state: "received" | "verified" | "rejected";
  requirementKey: string;
  providerId: string | null;
  observedAt: number;
};
export type ArtifactView = {
  artifactId: string;
  label: string;
  versions: { id: string; version: number; summary: string; at: number; evidenceRefs: string[] }[];
};

// Intentionally NORMALIZED FRONTEND abstractions. These are not backend enums.
export type SomebodyNow = {
  headline: string;
  detail: string;
  ball: "Somebody" | "You" | "Provider" | "Nobody — complete";
  condition: "working" | "waiting" | "needs_you" | "blocked" | "verified";
  currentRequirementKey: string | null;
};
export type AttentionItem = {
  id: string;
  kind: "approval" | "question" | "blocker" | "recovery";
  title: string;
  detail: string;
  requestedAction: string;
  requirementKey: string;
  maximumUsd: number | null;
};
export type MissionStoryEvent = {
  id: string;
  at: number;
  title: string;
  detail: string;
  kind: "objective" | "management" | "staffing" | "artifact" | "approval" | "external" | "evidence" | "verification" | "completion";
  // Relationships are explicit supplied facts, never timestamp-derived arrows.
  relatedIds: string[];
};
export type SystemXrayFixture = {
  nodes: { id: string; label: string; kind: "objective" | "outcome" | "requirement" | "worker" | "assignment" | "decision" | "provider" | "intent" | "evidence" | "verification"; detail: string }[];
  relationships: { id: string; from: string; to: string; label: "defines" | "requires" | "assigned_to" | "addresses" | "selects" | "authorizes" | "provided_by" | "proof_for" | "accepts" }[];
  runtime: { label: string; value: string }[];
};

export type ObjectiveWorkspaceView = {
  provenance: "frontend_fixture";
  objective: { objectiveKey: string; title: string; request: string; state: ObjectiveState; createdAt: number; updatedAt: number };
  somebodyNow: SomebodyNow;
  outcome: {
    contractId: string;
    revision: number;
    intent: string;
    minimumCompletionBar: string;
    levels: { levelKey: string; label: string; statement: string; status: "achieved" | "current" | "pending" | "not_proven" }[];
  } | null;
  requirements: RequirementView[];
  workers: WorkerView[];
  assignments: AssignmentView[];
  decisions: DecisionView[];
  attention: AttentionItem[];
  external: ExternalView[];
  artifacts: ArtifactView[];
  evidence: EvidenceView[];
  missionStory: MissionStoryEvent[];
  completion: { accepted: boolean; proofRefs: string[]; summary: string; remaining: string[]; acceptedAt: number | null };
  xray: SystemXrayFixture | null;
};

// Development driver only. No timer, payment reducer or authorization logic.
export type FixtureSnapshot = {
  id: string;
  label: string;
  view: ObjectiveWorkspaceView;
  action: { label: string; nextSnapshotId: string; requiresFounder: boolean } | null;
};
export type FixtureScenario = {
  id: string;
  title: string;
  path: string;
  initialSnapshotId: string;
  snapshots: FixtureSnapshot[];
};
