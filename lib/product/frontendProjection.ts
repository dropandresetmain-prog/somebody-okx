// V1 PRODUCT PROJECTION — pure, runtime-agnostic.
//
//   Convex rows → normalized ProductSource → this module → V6 product contract
//
// SSOT for every shape and rule here: docs/product/FRONTEND_CONTRACTS.md
// (accepted at 66262ea). Types live in app/product/contracts.ts.
//
// This module has NO authority. It reads normalized copies of persisted rows
// and derives the founder-facing view. It never queries, never writes, never
// calls a model, and never parses free-form event text into lifecycle truth.
//
// Rules that shape the code below (contract §3 / §51):
//   - missing truth stays missing (omit, do not invent);
//   - "done"/"verified"/"completed" are each a strictly stronger claim than the
//     step before them and are only produced from the exact facts that define
//     them;
//   - causality is emitted only from persisted relationships;
//   - the projection never exposes raw Requirement/Assignment/Intent rows.

import { sha256Hex } from "../management/sha256";
import type {
  AcquisitionProductStatus,
  AcquisitionView,
  ActivityActor,
  ActivityItem,
  AttentionActionView,
  AttentionState,
  AttentionType,
  CheckpointState,
  CheckpointView,
  CurrentWorkStatus,
  CurrentWorkView,
  DeliverableStatus,
  DeliverableView,
  EvidenceRefView,
  ExternalProvenance,
  InternState,
  InternView,
  ObjectiveListView,
  ObjectiveProductStatus,
  ObjectiveSummaryView,
  ObjectiveWorkspaceView,
  ProductApproach,
  ProgressView,
  SomebodyNowView,
  StartCapabilitiesView,
  TransactionFactView,
} from "../../app/product/contracts";
import {
  deriveSpendApprovalCandidate,
  formatSpendUsd,
  type SpendApprovalCandidate,
} from "./spendApprovalPolicy";

// ── Normalized source rows (the adapter seam; structural subsets) ────────────

export type ProductContract = {
  contractId: string;
  revision: number;
  intent: string;
  createdAt: number;
};

export type ProductRequirement = {
  requirementKey: string;
  contractRevision: number;
  priority: "required" | "supporting";
  title: string;
  mustBeTrue: string;
  scope: string;
  dependsOnRequirementKeys?: string[];
  state: "active" | "satisfied" | "blocked" | "superseded" | "waived";
  resolution: { contractRevision: number; acceptedAt: number } | null;
  blockedReason: string | null;
  waiver: { authorizedBy: "founder"; at: number } | null;
  updatedAt: number;
};

export type ProductWorker = {
  workerKey: string;
  displayName: string;
  responsibility: string;
  lifecycle: string;
  verifiedAssignments: { assignmentId: string; outcome: string; at: number }[];
};

export type ProductAssignment = {
  assignmentId: string;
  workerKey: string;
  requirementKey: string;
  decisionId: string;
  contractRevision: number;
  kind: string;
  state: "authorized" | "dispatched" | "running" | "result_submitted" | "verified" | "failed" | "superseded";
  runId: string | null;
  resultSummary: string | null;
  inputEvidenceIds: string[];
  targetArtifactKey: string | null;
  createdAt: number;
  updatedAt: number;
};

export type ProductDecision = {
  decisionId: string;
  requirementKey: string;
  contractRevision: number;
  kind: string;
  strategy: string | null;
  optionId: string | null;
  authorization:
    | { kind: "authorized" }
    | { kind: "refused" }
    | { kind: "approval_required"; question: string; reason: string };
  rationale: string | null;
  strongestAlternativeId: string | null;
  /** Raw JSON persisted in coarsePlanSummary; decoded defensively here. */
  coarsePlanSummary: string;
  at: number;
};

export type ProductIntent = {
  intentId: string;
  requirementKey: string;
  decisionId: string;
  contractRevision: number;
  kind: "external_acquisition" | "external_effect";
  target: { providerId: string | null; serviceId: string | null; offeringId: string | null; resourceClass: string | null };
  terms: { priceUsd: number | null; priceProvenance: string };
  state: "authorized" | "handed_off" | "awaiting_m3" | "result_recorded" | "verified" | "failed" | "reconciliation_required";
  resultEvidenceId: string | null;
  createdAt: number;
  updatedAt: number;
};

export type ProductAcquisitionResult = {
  intentId: string;
  resultEvidenceId: string;
  provenance: ExternalProvenance;
  providerId: string;
  serviceId: string;
  content: string;
  recordedAt: number;
  verifiedAt: number;
};

export type ProductEvidence = {
  evidenceId: string;
  label: string;
  text: string;
  origin: "application_observation" | "model_note";
  observedAt: number;
  runId: string;
};

export type ProductResourceNeed = {
  id: string;
  dedupeKey: string;
  purpose: string;
  reasonOwnedInsufficient: string;
  createdAt: number;
  validationAuthority?: "application" | "unconfirmed" | null;
  contractRevision?: number | null;
};

export type ProductArtifact = {
  key: string;
  label: string;
  content: string;
  version: number;
  updatedAt: number;
  history: {
    version: number;
    content: string;
    changedByRunId: string;
    changedAt: number;
    changeNote: string;
    usedAcquisitionEvidenceIds?: string[];
  }[];
};

export type ProductAssessment = {
  meetsMinimumBar: boolean;
  rationale: string;
  artifactKey: string | null;
  artifactVersion: number | null;
  evidenceRefs: string[];
  assumptionsUnknowns: string[];
  recommendedNextAction: string;
  assessedAt: number;
  contractRevision: number;
};

export type ProductWorkItem = {
  id: string;
  state: string;
  runs: { id: string; status: "running" | "stopped" | "failed"; startedAt: number; leaseUntil: number }[];
};

export type ProductObjectiveRow = {
  key: string;
  request: string;
  createdAt: number;
  updatedAt: number;
  /** Raw persisted enum; product status is derived, never copied. */
  state: string;
  result: { summary: string; completedAt: number } | null;
  workItems: ProductWorkItem[];
  companyArtifacts: ProductArtifact[];
  acquisitionResults: ProductAcquisitionResult[];
  resourceNeeds: ProductResourceNeed[];
  finalSemanticAssessment: ProductAssessment | null;
  controlNotes: Array<Record<string, unknown>>;
  pendingFinalAssessmentRevision: number | null;
  interpretationStatus: string | null;
};

/** Everything the status/attention/list derivation needs (no evidence/workers). */
export type StatusSource = {
  objective: ProductObjectiveRow;
  contracts: ProductContract[];
  requirements: ProductRequirement[];
  assignments: ProductAssignment[];
  decisions: ProductDecision[];
  intents: ProductIntent[];
};

export type ProductSource = StatusSource & {
  workers: ProductWorker[];
  evidence: ProductEvidence[];
};

export type ProjectionOptions = {
  /** Wall clock for run-lease staleness only. Never feeds viewRevision. */
  now: number;
  /**
   * Legal founder actions per attention type for NON-spend families still under
   * test injection (clarification / reconciliation). Spend approval actions are
   * NEVER taken from this map — they come only from deriveSpendApprovalCandidate
   * so read and command seams cannot drift (contract §32 / §41).
   */
  attentionActions?: Partial<Record<AttentionType, AttentionActionView[]>>;
  /**
   * Authoritative M3 transaction facts keyed by intent id. Convex holds no M3
   * rows, so callers currently omit this and `transaction` is omitted (§36).
   */
  transactionFacts?: Record<string, TransactionFactView>;
};

/**
 * Merge optional injected actions with the shared spend-approval policy.
 * Approval buttons appear only when deriveSpendApprovalCandidate yields a hit.
 */
export function resolveAttentionActions(
  source: StatusSource,
  injected: Partial<Record<AttentionType, AttentionActionView[]>> = {},
): { actions: Partial<Record<AttentionType, AttentionActionView[]>>; spend: SpendApprovalCandidate | null } {
  const spend = deriveSpendApprovalCandidate(source);
  const actions: Partial<Record<AttentionType, AttentionActionView[]>> = { ...injected };
  // Strip any injected approval actions — they must not arm material_ambiguity,
  // waiver, or external-effect approvals that have no Product Command.
  delete actions.approval;
  if (spend) actions.approval = [spend.action];
  return { actions, spend };
}

// ── Small helpers ────────────────────────────────────────────────────────────

const byKey = <T extends { requirementKey: string }>(a: T, b: T) => (a.requirementKey < b.requirementKey ? -1 : a.requirementKey > b.requirementKey ? 1 : 0);

export function clip(text: string, max: number): string {
  const trimmed = text.trim().replace(/\s+/g, " ");
  return trimmed.length <= max ? trimmed : `${trimmed.slice(0, max - 1).trimEnd()}…`;
}

export function deriveTitle(request: string): string {
  const firstLine = request.trim().split(/\n/)[0] ?? "";
  const firstSentence = firstLine.split(/(?<=[.!?])\s/)[0] ?? firstLine;
  return clip(firstSentence || request, 60) || "Untitled objective";
}

const STATUS_LABEL: Record<ObjectiveProductStatus, string> = {
  starting: "Starting",
  working: "Working",
  waiting: "Waiting",
  needs_you: "Needs you",
  verifying: "Verifying",
  completed: "Done",
  blocked: "Blocked",
};

function toApproach(strategy: string | null): ProductApproach | null {
  switch (strategy) {
    case "MAKE":
      return "MAKE";
    case "BUY":
      return "BUY";
    case "WAIT":
      return "WAIT";
    case "ASK_FOUNDER":
      return "ASK";
    default:
      // HYBRID stays internal in the serial contract; BLOCK/null are not approaches.
      return null;
  }
}

type DecodedOption = { optionId: string; approach: ProductApproach | null; label: string | null };

function decodeOptions(summary: string): DecodedOption[] {
  try {
    const parsed = JSON.parse(summary) as { extra?: { options?: Array<Record<string, unknown>> } };
    return (parsed.extra?.options ?? []).map((raw) => {
      const internal = raw.internal as { responsibility?: string } | null | undefined;
      const external = raw.external as { offeringId?: string | null; providerId?: string | null } | null | undefined;
      const label = internal?.responsibility ?? external?.offeringId ?? external?.providerId ?? null;
      return {
        optionId: String(raw.optionId ?? ""),
        approach: toApproach(typeof raw.strategy === "string" ? raw.strategy : null),
        label: label ? String(label) : null,
      };
    });
  } catch {
    return [];
  }
}

function decodeGate(summary: string): { accepted: boolean } | null {
  try {
    const parsed = JSON.parse(summary) as { gateVerdict?: { accepted?: unknown } };
    if (parsed.gateVerdict && typeof parsed.gateVerdict.accepted === "boolean") {
      return { accepted: parsed.gateVerdict.accepted };
    }
  } catch {
    // not a gate row
  }
  return null;
}

const SUPPORTED_LIVE_ASSIGNMENT: ReadonlySet<string> = new Set(["authorized", "dispatched", "running"]);
const OPEN_INTENT_STATES: ReadonlySet<string> = new Set(["authorized", "handed_off", "awaiting_m3", "result_recorded"]);
const BLOCKED_CONTROL_STATES: ReadonlySet<string> = new Set(["blocked", "failed", "recovery_required", "escalated"]);

// ── Facts (one derivation shared by status, Somebody Now, attention, lists) ──

export type AttentionCandidate = { attention: AttentionState; raisedAt: number };

export type ObjectiveFacts = {
  effectiveState: string;
  contract: ProductContract | null;
  revision: number | null;
  currentRequirements: ProductRequirement[];
  requiredOrdered: ProductRequirement[];
  completeKeys: Set<string>;
  gate: { accepted: boolean; at: number } | null;
  completionAccepted: boolean;
  /** Dominant Attention — present ONLY when it carries at least one legal action. */
  attention: AttentionCandidate | null;
  /**
   * The engine wants a founder decision (approval/clarification) but no legal
   * product action exists yet. Never surfaced as Attention; projects `waiting`.
   */
  pendingFounder: AttentionCandidate | null;
  status: ObjectiveProductStatus;
  /** Timestamp of the fact that put the objective in its current status. */
  statusAt: number;
  blockerNote: string | null;
  blockedAt: number | null;
};

function effectiveState(objective: ProductObjectiveRow): string {
  if (objective.state === "completed" || objective.state === "failed") return objective.state;
  const control = objective.controlNotes
    .filter((note) => note.type === "control_state" && typeof note.state === "string")
    .sort((a, b) => Number(a.at ?? 0) - Number(b.at ?? 0));
  const last = control[control.length - 1];
  return last ? String(last.state) : objective.state;
}

function isComplete(req: ProductRequirement, revision: number): boolean {
  if (req.contractRevision !== revision) return false;
  if (req.state === "satisfied") return req.resolution !== null && req.resolution.contractRevision === revision;
  if (req.state === "waived") return req.waiver !== null && req.waiver.authorizedBy === "founder";
  return false;
}

function orderRequired(reqs: ProductRequirement[]): ProductRequirement[] {
  const keys = new Set(reqs.map((req) => req.requirementKey));
  const remaining = new Map(reqs.map((req) => [req.requirementKey, req] as const));
  const done = new Set<string>();
  const out: ProductRequirement[] = [];
  while (remaining.size > 0) {
    const pool = [...remaining.values()].sort(byKey);
    const ready = pool.filter((req) =>
      (req.dependsOnRequirementKeys ?? []).every((dep) => dep === req.requirementKey || !keys.has(dep) || done.has(dep)),
    );
    // A dependency cycle is a data fault; fall back to key order rather than loop.
    const pick = ready[0] ?? pool[0];
    out.push(pick);
    done.add(pick.requirementKey);
    remaining.delete(pick.requirementKey);
  }
  return out;
}

function latestBy<T>(items: T[], at: (item: T) => number, id: (item: T) => string): T | null {
  let best: T | null = null;
  for (const item of items) {
    if (best === null || at(item) > at(best) || (at(item) === at(best) && id(item) > id(best))) best = item;
  }
  return best;
}

/** Strategy-bearing decisions of the current revision (completion gate rows excluded). */
function currentStrategyDecisions(source: StatusSource, revision: number): ProductDecision[] {
  return source.decisions.filter(
    (row) => row.contractRevision === revision && (row.kind === "satisfaction_strategy" || row.kind === "escalation"),
  );
}

function latestDecisionByRequirement(decisions: ProductDecision[]): Map<string, ProductDecision> {
  const map = new Map<string, ProductDecision>();
  for (const decision of decisions) {
    const existing = map.get(decision.requirementKey);
    if (!existing || decision.at > existing.at || (decision.at === existing.at && decision.decisionId > existing.decisionId)) {
      map.set(decision.requirementKey, decision);
    }
  }
  return map;
}

function deriveAttention(
  source: StatusSource,
  revision: number | null,
  effState: string,
  options: Pick<ProjectionOptions, "attentionActions">,
  onlyActionable: boolean,
  spend: SpendApprovalCandidate | null,
): AttentionCandidate | null {
  const actions = options.attentionActions ?? {};
  // `needs_you` promises the founder can DO something. With onlyActionable a
  // source type is considered only when a legal action exists for it; without
  // it, the same sources are found so the projection can report the truthful
  // non-actionable state (waiting) instead of a fabricated button.
  const has = (type: AttentionType) => !onlyActionable || (actions[type] ?? []).length > 0;

  // 1. Reconciliation — an ambiguous financial state is unresolved whatever the
  // contract revision. It is Attention ONLY with a legal founder action.
  const reconcileActions = actions.reconciliation ?? [];
  if (reconcileActions.length > 0) {
    const intent = latestBy(
      source.intents.filter((row) => row.state === "reconciliation_required"),
      (row) => row.updatedAt,
      (row) => row.intentId,
    );
    if (intent) {
      return {
        raisedAt: intent.updatedAt,
        attention: {
          id: intent.intentId,
          revision: `${intent.intentId}:${intent.updatedAt}`,
          type: "reconciliation",
          title: "An external action needs reconciliation",
          detail: "An external action left an ambiguous financial state. Somebody will not retry blindly; it has to be reconciled first.",
          actions: reconcileActions,
        },
      };
    }
  }

  if (revision === null) return has("approval") ? approvalFromNote(source.objective, effState, actions) : null;

  const decisions = currentStrategyDecisions(source, revision);
  const latest = latestDecisionByRequirement(decisions);
  const activeKeys = new Set(
    source.requirements.filter((req) => req.contractRevision === revision && req.state === "active").map((req) => req.requirementKey),
  );

  // 2. Current approval: the latest decision for an active requirement asks for it.
  // Spend-approval actions come only from the shared policy (spend candidate).
  const approvals = [...latest.values()].filter(
    (row) => row.authorization.kind === "approval_required" && activeKeys.has(row.requirementKey),
  );
  const approval = latestBy(approvals, (row) => row.at, (row) => row.decisionId);
  if (approval && approval.authorization.kind === "approval_required") {
    const isSpend =
      spend !== null &&
      spend.attentionId === approval.decisionId &&
      spend.attentionRevision === `${approval.decisionId}:${approval.at}`;
    const approvalActions = isSpend ? [spend.action] : [];
    if (!onlyActionable || approvalActions.length > 0) {
      return {
        raisedAt: approval.at,
        attention: {
          id: approval.decisionId,
          revision: `${approval.decisionId}:${approval.at}`,
          type: "approval",
          title: "Somebody needs your approval",
          detail: clip(approval.authorization.question, 400),
          context: {
            reason: approval.authorization.reason,
            ...(isSpend
              ? { amount: { amount: formatSpendUsd(spend.priceUsd), currency: "USD" } }
              : {}),
          },
          actions: approvalActions,
        },
      };
    }
  }

  // 3. ASK_FOUNDER / escalation clarification: latest decision for the
  // requirement, still unresolved (objective-level escalations have no key).
  const asks = [...latest.values()].filter((row) => {
    const isAsk = row.strategy === "ASK_FOUNDER" || row.kind === "escalation";
    if (!isAsk || row.authorization.kind === "approval_required") return false;
    return row.requirementKey === "" ? effState === "escalated" : activeKeys.has(row.requirementKey);
  });
  const ask = has("clarification") ? latestBy(asks, (row) => row.at, (row) => row.decisionId) : null;
  if (ask) {
    return {
      raisedAt: ask.at,
      attention: {
        id: ask.decisionId,
        revision: `${ask.decisionId}:${ask.at}`,
        type: "clarification",
        title: "Somebody needs your input",
        detail: clip(ask.rationale ?? "Somebody asked for your input before continuing.", 400),
        actions: actions.clarification ?? [],
      },
    };
  }

  // The durable pending_approval control note is a second way the same fact is
  // recorded; fall back to it only when no decision row explains the state.
  // Note-only fallback never carries a spend action (no decision/option price).
  return has("approval") ? approvalFromNote(source.objective, effState, actions) : null;
}

function approvalFromNote(
  objective: ProductObjectiveRow,
  effState: string,
  actions: Partial<Record<AttentionType, AttentionActionView[]>>,
): AttentionCandidate | null {
  if (effState !== "approval_required") return null;
  const note = latestBy(
    objective.controlNotes.filter((row) => row.type === "pending_approval"),
    (row) => Number(row.at ?? 0),
    (row) => String(row.question ?? ""),
  );
  if (!note) return null;
  const at = Number(note.at ?? objective.updatedAt);
  const id = `approval:${objective.key}:${at}`;
  return {
    raisedAt: at,
    attention: {
      id,
      revision: id,
      type: "approval",
      title: "Somebody needs your approval",
      detail: clip(String(note.question ?? "A decision needs your approval."), 400),
      actions: actions.approval ?? [],
    },
  };
}

export function deriveObjectiveFacts(source: StatusSource, options: Pick<ProjectionOptions, "attentionActions"> = {}): ObjectiveFacts {
  const objective = source.objective;
  const effState = effectiveState(objective);
  const contract = [...source.contracts].sort((a, b) => b.revision - a.revision)[0] ?? null;
  const revision = contract?.revision ?? null;

  const currentRequirements =
    revision === null ? [] : source.requirements.filter((req) => req.contractRevision === revision && req.state !== "superseded");
  const requiredOrdered = orderRequired(currentRequirements.filter((req) => req.priority === "required"));
  const completeKeys = new Set(
    revision === null ? [] : requiredOrdered.filter((req) => isComplete(req, revision)).map((req) => req.requirementKey),
  );

  const gateRow =
    revision === null
      ? null
      : latestBy(
          source.decisions.filter((row) => row.kind === "completion_proposal" && row.contractRevision === revision),
          (row) => row.at,
          (row) => row.decisionId,
        );
  const gateDecoded = gateRow ? decodeGate(gateRow.coarsePlanSummary) : null;
  const gate = gateRow && gateDecoded ? { accepted: gateDecoded.accepted, at: gateRow.at } : null;
  // completed = row completed AND the deterministic gate for the CURRENT
  // revision accepted. Anything weaker is not "completed" in the product.
  const completionAccepted = effState === "completed" && gate !== null && gate.accepted === true;

  // Shared spend-approval policy is the only source of approval Attention actions.
  const { actions: attentionActions, spend } = resolveAttentionActions(source, options.attentionActions);
  const actionOptions = { attentionActions };

  const attention = completionAccepted
    ? null
    : deriveAttention(source, revision, effState, actionOptions, true, spend);
  const pendingFounder =
    completionAccepted || attention
      ? null
      : deriveAttention(source, revision, effState, actionOptions, false, spend);

  const blockedRequired = requiredOrdered.find((req) => req.state === "blocked") ?? null;
  const reconciling = latestBy(
    source.intents.filter((row) => row.state === "reconciliation_required"),
    (row) => row.updatedAt,
    (row) => row.intentId,
  );
  const controlBlock = latestBy(
    objective.controlNotes.filter((note) => note.type === "control_state" && BLOCKED_CONTROL_STATES.has(String(note.state))),
    (note) => Number(note.at ?? 0),
    (note) => String(note.summary ?? ""),
  );
  const interpretationStalled = revision === null && objective.interpretationStatus === "refused";
  // "escalated" with an unanswerable founder question is a quiescent wait, not a
  // dead end; every other blocked state stays blocked.
  const stateBlocked =
    (BLOCKED_CONTROL_STATES.has(effState) && !(effState === "escalated" && pendingFounder !== null)) || effState === "failed";

  const blocked =
    stateBlocked || reconciling !== null || blockedRequired !== null || interpretationStalled;

  let blockerNote: string | null = null;
  let blockedAt: number | null = null;
  if (blocked) {
    if (blockedRequired) {
      blockerNote = `${blockedRequired.title}${blockedRequired.blockedReason ? ` — ${clip(blockedRequired.blockedReason, 200)}` : ""}`;
      blockedAt = blockedRequired.updatedAt;
    } else if (reconciling) {
      blockerNote = "An external action left an ambiguous financial state and cannot be retried blindly.";
      blockedAt = reconciling.updatedAt;
    } else if (controlBlock) {
      blockerNote = clip(String(controlBlock.summary ?? ""), 240) || null;
      blockedAt = Number(controlBlock.at ?? objective.updatedAt);
    } else if (interpretationStalled) {
      blockerNote = "Somebody could not turn the request into an outcome that can be proved.";
      blockedAt = objective.updatedAt;
    } else {
      blockedAt = objective.updatedAt;
    }
  }

  const liveIntents = source.intents.filter(
    (row) => revision !== null && row.contractRevision === revision && (row.state === "authorized" || row.state === "handed_off" || row.state === "awaiting_m3"),
  );
  const waitingOnBoundary = liveIntents.length > 0;
  const waitingState = effState === "waiting" || effState === "waiting_for_resource";

  const resultSubmitted = source.assignments.some((row) => revision !== null && row.contractRevision === revision && row.state === "result_submitted");
  const resultRecorded = source.intents.some((row) => revision !== null && row.contractRevision === revision && row.state === "result_recorded");
  const assessmentPending = revision !== null && objective.pendingFinalAssessmentRevision === revision;
  const allRequiredComplete = requiredOrdered.length > 0 && requiredOrdered.every((req) => completeKeys.has(req.requirementKey));
  const rowCompletedWithoutGate = effState === "completed" && !completionAccepted;
  const verifying = resultSubmitted || resultRecorded || assessmentPending || allRequiredComplete || rowCompletedWithoutGate;

  let status: ObjectiveProductStatus;
  let statusAt = objective.updatedAt;
  if (completionAccepted) {
    status = "completed";
    statusAt = objective.result?.completedAt ?? gate?.at ?? objective.updatedAt;
  } else if (attention) {
    status = "needs_you";
    statusAt = attention.raisedAt;
  } else if (blocked) {
    status = "blocked";
    statusAt = blockedAt ?? objective.updatedAt;
  } else if (waitingOnBoundary || waitingState || effState === "approval_required" || pendingFounder) {
    status = "waiting";
    statusAt = waitingOnBoundary
      ? Math.max(...liveIntents.map((row) => row.updatedAt))
      : pendingFounder
        ? pendingFounder.raisedAt
        : objective.updatedAt;
  } else if (verifying) {
    status = "verifying";
  } else if (contract === null) {
    status = "starting";
  } else {
    status = "working";
  }

  return {
    effectiveState: effState,
    contract,
    revision,
    currentRequirements,
    requiredOrdered,
    completeKeys,
    gate,
    completionAccepted,
    attention,
    pendingFounder,
    status,
    statusAt,
    blockerNote,
    blockedAt,
  };
}

export function projectObjectiveStatus(source: StatusSource, options: Pick<ProjectionOptions, "attentionActions"> = {}): ObjectiveProductStatus {
  return deriveObjectiveFacts(source, options).status;
}

// ── Intern ───────────────────────────────────────────────────────────────────

function findRun(objective: ProductObjectiveRow, runId: string | null) {
  if (!runId) return { run: null, workItem: null };
  for (const workItem of objective.workItems) {
    const run = workItem.runs.find((item) => item.id === runId);
    if (run) return { run, workItem };
  }
  return { run: null, workItem: null };
}

/**
 * Worker + current Assignment + current Run → Intern state (§17).
 * `done` means the bounded Assignment itself is application-verified for the
 * current revision — nothing stronger, and nothing weaker counts.
 */
export function deriveInternState(
  assignment: ProductAssignment | null,
  objective: ProductObjectiveRow,
  currentRevision: number | null,
  now: number,
): InternState {
  if (!assignment) return "idle";
  if (currentRevision === null || assignment.contractRevision !== currentRevision) return "idle";
  if (assignment.state === "verified") return "done";
  // result_submitted, failed and superseded are NOT done and have no live work.
  if (!SUPPORTED_LIVE_ASSIGNMENT.has(assignment.state)) return "idle";
  const { run, workItem } = findRun(objective, assignment.runId);
  if (workItem && workItem.state === "waiting_for_resource") return "waiting";
  if (run && run.status === "running" && run.leaseUntil > now) return "working";
  return "assigned";
}

function toInternView(worker: ProductWorker | undefined, assignment: ProductAssignment, state: InternState): InternView {
  return {
    id: assignment.workerKey,
    label: worker?.displayName ?? assignment.workerKey,
    ...(worker?.responsibility ? { specialty: clip(worker.responsibility, 120) } : {}),
    state,
  };
}

// ── Checkpoints (§13) ────────────────────────────────────────────────────────

function ownedRequirementKeys(source: StatusSource, revision: number): Set<string> {
  const owned = new Set<string>();
  for (const assignment of source.assignments) {
    if (assignment.contractRevision === revision && (SUPPORTED_LIVE_ASSIGNMENT.has(assignment.state) || assignment.state === "result_submitted")) {
      owned.add(assignment.requirementKey);
    }
  }
  for (const intent of source.intents) {
    if (intent.contractRevision === revision && OPEN_INTENT_STATES.has(intent.state)) owned.add(intent.requirementKey);
  }
  return owned;
}

function requirementCheckpointState(
  req: ProductRequirement,
  facts: ObjectiveFacts,
  activeKeys: Set<string>,
): CheckpointState {
  if (facts.completeKeys.has(req.requirementKey)) return "complete";
  if (req.state === "blocked") return "blocked";
  if (activeKeys.has(req.requirementKey)) return "active";
  return "pending";
}

export function projectProgress(source: StatusSource, facts: ObjectiveFacts): ProgressView {
  const revision = facts.revision;
  if (revision === null || facts.requiredOrdered.length === 0) return { checkpoints: [] };

  // Active = owned by the current decision/assignment/intent; otherwise the
  // first unresolved executable required Requirement in serial order.
  const owned = ownedRequirementKeys(source, revision);
  const ownerCandidate = facts.attention ?? facts.pendingFounder;
  if (ownerCandidate) {
    const owner = source.decisions.find((row) => row.decisionId === ownerCandidate.attention.id);
    if (owner && owner.requirementKey) owned.add(owner.requirementKey);
  }
  const requiredKeys = new Set(facts.requiredOrdered.map((req) => req.requirementKey));
  const activeKeys = new Set<string>();
  for (const req of facts.requiredOrdered) {
    if (owned.has(req.requirementKey) && !facts.completeKeys.has(req.requirementKey) && req.state !== "blocked") {
      activeKeys.add(req.requirementKey);
    }
  }
  if (activeKeys.size === 0) {
    const next = facts.requiredOrdered.find(
      (req) =>
        req.state === "active" &&
        !facts.completeKeys.has(req.requirementKey) &&
        (req.dependsOnRequirementKeys ?? []).every((dep) => dep === req.requirementKey || !requiredKeys.has(dep) || facts.completeKeys.has(dep)),
    );
    if (next) activeKeys.add(next.requirementKey);
  }

  const toCheckpoint = (req: ProductRequirement): CheckpointView => {
    const state = requirementCheckpointState(req, facts, activeKeys);
    const detail = state === "blocked" && req.blockedReason ? clip(req.blockedReason, 200) : clip(req.mustBeTrue, 160);
    return {
      id: `checkpoint:req:${revision}:${req.requirementKey}`,
      label: req.title,
      state,
      ...(detail ? { detail } : {}),
    };
  };

  let checkpoints: CheckpointView[];
  if (facts.requiredOrdered.length <= 5) {
    checkpoints = facts.requiredOrdered.map(toCheckpoint);
  } else {
    const head = facts.requiredOrdered.slice(0, 4).map(toCheckpoint);
    const rest = facts.requiredOrdered.slice(4);
    const memberStates = rest.map((req) => requirementCheckpointState(req, facts, activeKeys));
    const aggregateState: CheckpointState = memberStates.includes("blocked")
      ? "blocked"
      : memberStates.includes("active")
        ? "active"
        : memberStates.every((state) => state === "complete")
          ? "complete"
          : "pending";
    const restKeys = rest.map((req) => req.requirementKey);
    const stableHash = sha256Hex(restKeys.join(" ")).slice(0, 12);
    checkpoints = [
      ...head,
      {
        id: `checkpoint:remaining:${revision}:${stableHash}`,
        label: "Complete remaining required work",
        state: aggregateState,
        detail: `${rest.length} more required item${rest.length === 1 ? "" : "s"}: ${clip(rest.map((req) => req.title).join("; "), 200)}`,
      },
    ];
  }

  const activeCheckpoint = checkpoints.find((item) => item.state === "active");
  const currentPhase = activeCheckpoint
    ? activeCheckpoint.label
    : facts.status === "verifying"
      ? "Verifying the required outcome"
      : undefined;
  return { checkpoints, ...(currentPhase ? { currentPhase } : {}) };
}

// ── Current work (§15) ───────────────────────────────────────────────────────

function decisionApproach(source: StatusSource, decisionId: string): ProductApproach | undefined {
  const decision = source.decisions.find((row) => row.decisionId === decisionId);
  return toApproach(decision?.strategy ?? null) ?? undefined;
}

export function projectCurrentWork(
  source: ProductSource,
  facts: ObjectiveFacts,
  options: Pick<ProjectionOptions, "now">,
): CurrentWorkView | null {
  const revision = facts.revision;
  if (revision === null || facts.completionAccepted) return null;
  const reqTitle = (key: string) => source.requirements.find((req) => req.requirementKey === key && req.contractRevision === revision)?.title ?? key;
  const workerFor = (key: string) => source.workers.find((worker) => worker.workerKey === key);

  // 1. Live internal assignment/run (a delivered-but-unverified one still owns the action).
  const liveAssignment = latestBy(
    source.assignments.filter(
      (row) => row.contractRevision === revision && (SUPPORTED_LIVE_ASSIGNMENT.has(row.state) || row.state === "result_submitted"),
    ),
    (row) => row.updatedAt,
    (row) => row.assignmentId,
  );
  if (liveAssignment) {
    const internState = deriveInternState(liveAssignment, source.objective, revision, options.now);
    const { run } = findRun(source.objective, liveAssignment.runId);
    let status: CurrentWorkStatus;
    if (liveAssignment.state === "result_submitted") status = "working";
    else if (internState === "waiting") status = "waiting";
    else if (internState === "working") status = "working";
    else status = "queued";
    return {
      id: liveAssignment.assignmentId,
      title: reqTitle(liveAssignment.requirementKey),
      ...(liveAssignment.state === "result_submitted"
        ? { summary: "A result was delivered and is being verified before anything is accepted." }
        : {}),
      status,
      approach: "MAKE",
      intern: toInternView(workerFor(liveAssignment.workerKey), liveAssignment, internState),
      ...(run ? { startedAt: run.startedAt } : {}),
      updatedAt: liveAssignment.updatedAt,
    };
  }

  // 2. Active external intent (acquisition/effect) — BUY.
  const activeIntent = latestBy(
    source.intents.filter(
      (row) => row.contractRevision === revision && (OPEN_INTENT_STATES.has(row.state) || row.state === "reconciliation_required"),
    ),
    (row) => row.updatedAt,
    (row) => row.intentId,
  );
  if (activeIntent) {
    const status: CurrentWorkStatus =
      activeIntent.state === "reconciliation_required"
        ? "blocked"
        : activeIntent.state === "authorized"
          ? "queued"
          : activeIntent.state === "result_recorded"
            ? "working"
            : "waiting";
    return {
      id: activeIntent.intentId,
      title: reqTitle(activeIntent.requirementKey),
      summary: `Acquiring ${externalLabel(activeIntent)} from outside the company.`,
      status,
      approach: "BUY",
      startedAt: activeIntent.createdAt,
      updatedAt: activeIntent.updatedAt,
    };
  }

  // 3. Legitimate WAIT / ASK action (an approval is an ASK).
  const decisions = currentStrategyDecisions(source, revision);
  const latest = latestDecisionByRequirement(decisions);
  const activeKeys = new Set(
    source.requirements.filter((req) => req.contractRevision === revision && req.state === "active").map((req) => req.requirementKey),
  );
  const pending = [...latest.values()].filter((row) => {
    if (!activeKeys.has(row.requirementKey)) return false;
    if (row.authorization.kind === "approval_required") return true;
    return row.authorization.kind === "authorized" && (row.strategy === "WAIT" || row.strategy === "ASK_FOUNDER");
  });
  const waitAsk = latestBy(pending, (row) => row.at, (row) => row.decisionId);
  if (waitAsk) {
    const approach: ProductApproach = waitAsk.authorization.kind === "approval_required" ? "ASK" : (toApproach(waitAsk.strategy) ?? "WAIT");
    return {
      id: waitAsk.decisionId,
      title: reqTitle(waitAsk.requirementKey),
      ...(waitAsk.authorization.kind === "approval_required" ? { summary: clip(waitAsk.authorization.question, 200) } : {}),
      status: "waiting",
      approach,
      updatedAt: waitAsk.at,
    };
  }

  // 4. Most recent just-verified bounded action — only for transition rendering.
  if (facts.status === "working" || facts.status === "verifying") {
    const verified = latestBy(
      source.assignments.filter((row) => row.contractRevision === revision && row.state === "verified"),
      (row) => row.updatedAt,
      (row) => row.assignmentId,
    );
    if (verified) {
      return {
        id: verified.assignmentId,
        title: reqTitle(verified.requirementKey),
        ...(verified.resultSummary ? { summary: clip(verified.resultSummary, 240) } : {}),
        status: "done",
        approach: decisionApproach(source, verified.decisionId) ?? "MAKE",
        intern: toInternView(workerFor(verified.workerKey), verified, "done"),
        updatedAt: verified.updatedAt,
      };
    }
  }
  return null;
}

function externalLabel(intent: ProductIntent): string {
  return intent.target.resourceClass ?? intent.target.serviceId ?? intent.target.offeringId ?? "an external resource";
}

// ── Somebody Now (§10–11) ────────────────────────────────────────────────────

export function projectSomebodyNow(source: ProductSource, facts: ObjectiveFacts, currentWork: CurrentWorkView | null): SomebodyNowView {
  const objective = source.objective;
  switch (facts.status) {
    case "completed":
      return {
        state: "completed",
        headline: "Objective complete",
        detail: clip(objective.result?.summary ?? "The completion gate accepted the required outcome.", 240),
        updatedAt: facts.statusAt,
      };
    case "needs_you":
      return {
        state: "needs_you",
        headline: facts.attention?.attention.title ?? "Somebody needs you",
        detail: facts.attention?.attention.detail ?? "A decision is waiting on you.",
        updatedAt: facts.statusAt,
      };
    case "blocked":
      return {
        state: "blocked",
        headline: "Blocked",
        detail: facts.blockerNote ?? "Somebody stopped and recorded the blocker instead of inventing a way around it.",
        updatedAt: facts.statusAt,
      };
    case "waiting": {
      const intent = latestBy(
        source.intents.filter(
          (row) => facts.revision !== null && row.contractRevision === facts.revision && (row.state === "authorized" || row.state === "handed_off" || row.state === "awaiting_m3"),
        ),
        (row) => row.updatedAt,
        (row) => row.intentId,
      );
      return {
        state: "waiting",
        headline: intent ? `Waiting on ${externalLabel(intent)}` : facts.pendingFounder ? "Waiting for a decision" : "Waiting",
        detail: intent
          ? "An authorized external action is waiting at the outside boundary. Nothing else runs until it resolves."
          : facts.pendingFounder
            ? facts.pendingFounder.attention.detail
            : "Somebody is waiting on a real external or timed condition. Nothing runs until it resolves.",
        updatedAt: facts.statusAt,
      };
    }
    case "verifying":
      return {
        state: "verifying",
        headline: "Verifying the result",
        detail:
          facts.revision !== null && objective.pendingFinalAssessmentRevision === facts.revision
            ? "Somebody is assessing the deliverable against the required outcome."
            : "Work has arrived. Somebody is checking it against the required outcome before accepting anything.",
        updatedAt: currentWork?.updatedAt ?? facts.statusAt,
      };
    case "starting":
      return {
        state: "interpreting",
        headline: "Understanding your objective",
        detail: "Somebody is turning your request into an outcome that can be proved.",
        updatedAt: objective.createdAt,
      };
    default:
      return {
        state: "working",
        headline: currentWork ? `Working on ${currentWork.title}` : "Working on your objective",
        detail:
          currentWork?.approach === "MAKE"
            ? "An intern is doing one bounded piece of work. Somebody holds the outcome."
            : currentWork?.approach === "BUY"
              ? "Somebody is acquiring an outside resource for the next step."
              : "Somebody is deciding the next move from what is already established.",
        updatedAt: currentWork?.updatedAt ?? facts.statusAt,
      };
  }
}

// ── Acquisitions (§34–36) ────────────────────────────────────────────────────

function toMoney(usd: number): { amount: string; currency: string } {
  return { amount: usd.toFixed(2), currency: "USD" };
}

function acquisitionLabels(intent: ProductIntent) {
  return {
    resourceLabel: intent.target.resourceClass ?? intent.target.serviceId ?? intent.target.offeringId ?? "External resource",
    ...(intent.target.providerId ? { providerLabel: intent.target.providerId } : {}),
  };
}

export function projectAcquisitions(
  source: ProductSource,
  facts: ObjectiveFacts,
  options: Pick<ProjectionOptions, "transactionFacts">,
): AcquisitionView[] {
  const views: AcquisitionView[] = [];
  const resultFor = (intent: ProductIntent) =>
    intent.resultEvidenceId === null
      ? null
      : (source.objective.acquisitionResults.find(
          (row) => row.intentId === intent.intentId && row.resultEvidenceId === intent.resultEvidenceId,
        ) ?? null);

  for (const intent of source.intents) {
    const result = resultFor(intent);
    let status: AcquisitionProductStatus;
    switch (intent.state) {
      case "authorized":
      case "handed_off":
      case "awaiting_m3":
        status = "in_progress";
        break;
      case "result_recorded":
        status = "result_received";
        break;
      case "verified":
        // verified = intent verified + the matching persisted result. Without the
        // result we cannot claim the receipt, so it stays result_received.
        status = result ? "verified" : intent.resultEvidenceId ? "result_received" : "in_progress";
        break;
      case "failed":
        status = "failed";
        break;
      default:
        status = "reconciliation_required";
    }
    const provenance = result?.provenance;
    const showResult = result !== null && (status === "verified" || status === "result_received");
    // A live/M3 fact is never attached to simulation or replay (§36).
    const tx = provenance === "live" ? options.transactionFacts?.[intent.intentId] : undefined;
    const hasQuote = intent.terms.priceUsd !== null && intent.terms.priceProvenance !== "unknown";
    views.push({
      id: intent.intentId,
      ...acquisitionLabels(intent),
      ...(hasQuote && provenance !== "simulation" && provenance !== "recorded_replay" ? { amount: toMoney(intent.terms.priceUsd as number) } : {}),
      status,
      ...(tx ? { transaction: tx } : {}),
      ...(showResult ? { resultSummary: clip(result.content, 240) } : {}),
      ...(provenance ? { provenance } : {}),
      updatedAt: intent.updatedAt,
    });
  }

  // Proposed / needs approval: an authorized BUY decision with no intent yet.
  if (facts.revision !== null && !facts.completionAccepted) {
    const decisions = currentStrategyDecisions(source, facts.revision);
    const latest = latestDecisionByRequirement(decisions);
    const activeKeys = new Set(
      source.requirements.filter((req) => req.contractRevision === facts.revision && req.state === "active").map((req) => req.requirementKey),
    );
    for (const decision of latest.values()) {
      if (decision.strategy !== "BUY" || !activeKeys.has(decision.requirementKey)) continue;
      if (source.intents.some((intent) => intent.decisionId === decision.decisionId)) continue;
      const options_ = decodeOptions(decision.coarsePlanSummary);
      const selected = options_.find((row) => row.optionId === decision.optionId);
      const label =
        selected?.label ?? source.requirements.find((req) => req.requirementKey === decision.requirementKey && req.contractRevision === facts.revision)?.title ?? "External resource";
      if (decision.authorization.kind === "approval_required") {
        views.push({ id: decision.decisionId, resourceLabel: label, status: "needs_approval", updatedAt: decision.at });
      } else if (decision.authorization.kind === "authorized") {
        views.push({ id: decision.decisionId, resourceLabel: label, status: "proposed", updatedAt: decision.at });
      }
    }
  }
  return views.sort((a, b) => a.updatedAt - b.updatedAt || (a.id < b.id ? -1 : 1));
}

// ── Deliverables (§25–28) ────────────────────────────────────────────────────

export function deliverableId(objectiveKey: string, artifactKey: string): string {
  return `deliverable:${objectiveKey}:${artifactKey}`;
}

function evidenceRefsFor(source: ProductSource, ids: string[]): EvidenceRefView[] {
  const refs: EvidenceRefView[] = [];
  for (const id of ids) {
    const evidence = source.evidence.find((row) => row.evidenceId === id);
    if (evidence) {
      refs.push({ id, label: clip(evidence.label, 120) });
      continue;
    }
    const result = source.objective.acquisitionResults.find((row) => row.resultEvidenceId === id);
    if (result) refs.push({ id, label: clip(`Acquired result (${result.serviceId})`, 120) });
    // A ref that resolves to nothing persisted is not "validated" — dropped.
  }
  return refs;
}

export function projectDeliverables(source: ProductSource, facts: ObjectiveFacts): DeliverableView[] {
  const revision = facts.revision;
  if (revision === null) return [];
  const objective = source.objective;
  const assessment = objective.finalSemanticAssessment;
  const currentAssessment = assessment && assessment.contractRevision === revision ? assessment : null;

  const currentTargets = new Set<string>();
  const olderTargets = new Set<string>();
  for (const row of source.assignments) {
    if (!row.targetArtifactKey) continue;
    if (row.contractRevision === revision) {
      if (row.state !== "superseded") currentTargets.add(row.targetArtifactKey);
    } else {
      olderTargets.add(row.targetArtifactKey);
    }
  }
  const primaryKey = currentAssessment?.artifactKey ?? null;
  if (primaryKey) currentTargets.add(primaryKey);
  // Assessments of an older revision only ever make an artifact superseded.
  if (assessment && assessment.contractRevision !== revision && assessment.artifactKey) olderTargets.add(assessment.artifactKey);

  const governed = new Set<string>([...currentTargets, ...olderTargets]);
  const views: Array<DeliverableView & { rank: number; key: string }> = [];
  for (const artifact of objective.companyArtifacts) {
    if (!governed.has(artifact.key)) continue;
    const isCurrentTarget = currentTargets.has(artifact.key);
    const assessmentMatches =
      currentAssessment !== null &&
      currentAssessment.artifactKey === artifact.key &&
      currentAssessment.artifactVersion === artifact.version;

    let status: DeliverableStatus;
    if (!isCurrentTarget) status = "superseded";
    else if (assessmentMatches && currentAssessment.meetsMinimumBar === true && facts.completionAccepted) status = "verified";
    else if (primaryKey !== null && artifact.key !== primaryKey) status = "draft";
    else status = "current";

    const latestNote = artifact.history.find((entry) => entry.version === artifact.version)?.changeNote;
    const view: DeliverableView & { rank: number; key: string } = {
      id: deliverableId(objective.key, artifact.key),
      title: artifact.label,
      type: "document",
      version: artifact.version,
      status,
      ...(latestNote ? { summary: clip(latestNote, 240) } : {}),
      content: artifact.content,
      updatedAt: artifact.updatedAt,
      rank: status === "superseded" ? 2 : status === "draft" ? 1 : 0,
      key: artifact.key,
    };
    if (assessmentMatches && currentAssessment) {
      // assumptionsUnknowns is ONE persisted list; it is surfaced as unknowns
      // rather than being split by guessing which entries are assumptions.
      if (currentAssessment.assumptionsUnknowns.length > 0) view.unknowns = currentAssessment.assumptionsUnknowns.map((item) => clip(item, 240));
      if (currentAssessment.recommendedNextAction) view.recommendedNextMove = clip(currentAssessment.recommendedNextAction, 300);
      const refs = evidenceRefsFor(source, currentAssessment.evidenceRefs);
      if (refs.length > 0) view.evidenceRefs = refs;
    }
    views.push(view);
  }
  return views
    .sort((a, b) => a.rank - b.rank || (a.key < b.key ? -1 : a.key > b.key ? 1 : 0))
    .map(({ rank: _rank, key: _key, ...view }) => view);
}

// ── Activity (§18–22) ────────────────────────────────────────────────────────

const ACTIVITY_LIMIT = 300;
const TYPE_RANK: Record<string, number> = {
  objective_interpreted: 0,
  manager_decision: 1,
  founder_action_required: 2,
  intern_assigned: 3,
  work_started: 4,
  work_resumed: 5,
  evidence_gap_identified: 6,
  finding_added: 7,
  work_summary: 8,
  work_completed: 9,
  acquisition_started: 10,
  external_result_received: 11,
  external_result_verified: 12,
  artifact_changed: 13,
  verification_completed: 14,
  objective_completed: 15,
  objective_blocked: 16,
};

const SOMEBODY: ActivityActor = { kind: "somebody", label: "Somebody" };

function excerpt(text: string, max = 500): string {
  return text.length <= max ? text : `${text.slice(0, max - 1)}…`;
}

export function projectActivity(source: ProductSource, facts: ObjectiveFacts, now: number): ActivityItem[] {
  const objective = source.objective;
  const revision = facts.revision;
  const items: ActivityItem[] = [];

  const workerByKey = new Map(source.workers.map((worker) => [worker.workerKey, worker] as const));
  const assignmentByRun = new Map<string, ProductAssignment>();
  for (const assignment of source.assignments) if (assignment.runId) assignmentByRun.set(assignment.runId, assignment);
  const internActor = (workerKey: string): ActivityActor => ({
    kind: "intern",
    id: workerKey,
    label: workerByKey.get(workerKey)?.displayName ?? workerKey,
  });
  // The actor for a run is only known through the assignment that owns the run.
  const actorForRun = (runId: string): ActivityActor | null => {
    const assignment = assignmentByRun.get(runId);
    return assignment ? internActor(assignment.workerKey) : null;
  };
  const reqTitle = (key: string, rev?: number) =>
    source.requirements.find((req) => req.requirementKey === key && (rev === undefined || req.contractRevision === rev))?.title ??
    source.requirements.find((req) => req.requirementKey === key)?.title ??
    key;

  // objective_interpreted — one per persisted contract revision.
  for (const contract of source.contracts) {
    items.push({
      id: `activity:objective_interpreted:${contract.contractId}:r${contract.revision}`,
      type: "objective_interpreted",
      occurredAt: contract.createdAt,
      actor: SOMEBODY,
      title: contract.revision === 1 ? "Somebody defined the outcome" : `Somebody revised the outcome (revision ${contract.revision})`,
      detail: clip(contract.intent, 240),
      importance: "major",
    });
  }

  // Verified acquisition results (external_result_verified) — needed for causality.
  const verifiedActivityByEvidence = new Map<string, string>();
  const acquisitionEvidenceIds = new Set<string>();
  for (const intent of source.intents) {
    const result = intent.resultEvidenceId
      ? source.objective.acquisitionResults.find((row) => row.intentId === intent.intentId && row.resultEvidenceId === intent.resultEvidenceId)
      : undefined;
    if (result) acquisitionEvidenceIds.add(result.resultEvidenceId);
    const label = externalLabel(intent);
    items.push({
      id: `activity:acquisition_started:${intent.intentId}`,
      type: "acquisition_started",
      occurredAt: intent.createdAt,
      actor: SOMEBODY,
      title: `Somebody authorized acquiring ${label}`,
      importance: "standard",
      related: { acquisitionId: intent.intentId },
      ...(result ? { provenance: result.provenance } : {}),
    });
    // acquisition_submitted is deliberately never emitted: only M3 can attest a
    // submission, and no M3 fact is readable here (§21 limitation).
    const externalActor: ActivityActor = {
      kind: "external",
      ...(intent.target.providerId ? { id: intent.target.providerId } : {}),
      label: intent.target.providerId ?? label,
    };
    const receivedAt = result ? result.recordedAt : intent.state === "result_recorded" ? intent.updatedAt : null;
    if (intent.resultEvidenceId && receivedAt !== null) {
      items.push({
        id: `activity:external_result_received:${intent.intentId}:${intent.resultEvidenceId}`,
        type: "external_result_received",
        occurredAt: receivedAt,
        actor: externalActor,
        title: `Received a result for ${label}`,
        detail: "Received is not verified; verification is a separate step.",
        importance: "standard",
        related: { acquisitionId: intent.intentId, evidenceIds: [intent.resultEvidenceId] },
        ...(result ? { provenance: result.provenance } : {}),
      });
    }
    if (intent.state === "verified" && result) {
      const id = `activity:external_result_verified:${result.resultEvidenceId}`;
      verifiedActivityByEvidence.set(result.resultEvidenceId, id);
      items.push({
        id,
        type: "external_result_verified",
        occurredAt: result.verifiedAt,
        actor: SOMEBODY,
        title: `Verified the result for ${label}`,
        detail: "The receipt is verified as the result of this acquisition. That does not by itself satisfy a requirement.",
        importance: "major",
        related: { acquisitionId: intent.intentId, evidenceIds: [result.resultEvidenceId] },
        provenance: result.provenance,
      });
    }
  }

  // Assignments → intern_assigned, work_started, work_resumed, work_summary, work_completed.
  for (const assignment of source.assignments) {
    const worker = workerByKey.get(assignment.workerKey);
    const staleRun = revision === null || assignment.contractRevision !== revision;
    const actor = internActor(assignment.workerKey);
    const internView: InternView = {
      id: assignment.workerKey,
      label: worker?.displayName ?? assignment.workerKey,
      ...(worker?.responsibility ? { specialty: clip(worker.responsibility, 120) } : {}),
      state: deriveInternState(assignment, objective, revision, now),
    };
    const title = reqTitle(assignment.requirementKey, assignment.contractRevision);
    const requirement = source.requirements.find((req) => req.requirementKey === assignment.requirementKey && req.contractRevision === assignment.contractRevision);
    items.push({
      id: `activity:intern_assigned:${assignment.assignmentId}`,
      type: "intern_assigned",
      occurredAt: assignment.createdAt,
      actor: SOMEBODY,
      title: `Somebody assigned ${actor.label}`,
      detail: title,
      importance: "standard",
      related: { internId: assignment.workerKey },
      payload: {
        intern: internView,
        assignmentTitle: title,
        ...(requirement?.scope ? { scope: clip(requirement.scope, 200) } : {}),
      },
    });

    const { run } = findRun(objective, assignment.runId);
    if (run && assignment.runId) {
      items.push({
        id: `activity:work_started:${run.id}`,
        type: "work_started",
        occurredAt: run.startedAt,
        actor,
        title: `${actor.label} started work`,
        detail: title,
        importance: "minor",
        related: { internId: assignment.workerKey },
      });

      // work_resumed: only when the WorkContract explicitly cites verified
      // acquisition evidence. One cited acquisition ⇒ an explicit causal line.
      const cited = assignment.inputEvidenceIds.filter((id) => verifiedActivityByEvidence.has(id));
      if (cited.length > 0) {
        items.push({
          id: `activity:work_resumed:${run.id}`,
          type: "work_resumed",
          occurredAt: run.startedAt,
          actor,
          title: `${actor.label} resumed with the acquired result`,
          detail: title,
          importance: "standard",
          related: { internId: assignment.workerKey, evidenceIds: cited },
          ...(cited.length === 1 ? { causedByActivityId: verifiedActivityByEvidence.get(cited[0]) } : {}),
        });
      }
    }

    if (assignment.state === "verified" && !staleRun) {
      const accepted = worker?.verifiedAssignments.find((row) => row.assignmentId === assignment.assignmentId && row.outcome === "accepted");
      const at = accepted?.at ?? assignment.updatedAt;
      if (assignment.resultSummary) {
        items.push({
          id: `activity:work_summary:${assignment.assignmentId}:${assignment.runId ?? "run"}`,
          type: "work_summary",
          occurredAt: at,
          actor,
          title: `${actor.label} reported back`,
          detail: clip(assignment.resultSummary, 240),
          importance: "standard",
          related: { internId: assignment.workerKey },
          payload: { summary: clip(assignment.resultSummary, 400) },
        });
      }
      items.push({
        id: `activity:work_completed:${assignment.assignmentId}:verified`,
        type: "work_completed",
        occurredAt: at,
        actor,
        title: `${actor.label}'s work was accepted`,
        detail: title,
        importance: "standard",
        related: { internId: assignment.workerKey },
      });
    }
  }

  // finding_added — product-safe (application-observed) evidence only.
  for (const evidence of source.evidence) {
    if (evidence.origin !== "application_observation") continue;
    const actor = actorForRun(evidence.runId);
    if (!actor) continue; // actor not derivable ⇒ omit rather than misattribute
    items.push({
      id: `activity:finding_added:${evidence.evidenceId}`,
      type: "finding_added",
      occurredAt: evidence.observedAt,
      actor,
      title: clip(evidence.label, 120),
      importance: "minor",
      related: { evidenceIds: [evidence.evidenceId], ...(actor.kind === "intern" ? { internId: actor.id } : {}) },
      payload: {
        finding: clip(evidence.text, 400),
        evidenceRefs: [{ id: evidence.evidenceId, label: clip(evidence.label, 120) }],
      },
    });
  }

  // evidence_gap_identified — application-validated ResourceNeeds only.
  for (const need of objective.resourceNeeds) {
    if (need.validationAuthority !== "application") continue;
    items.push({
      id: `activity:evidence_gap_identified:${need.dedupeKey || need.id}`,
      type: "evidence_gap_identified",
      occurredAt: need.createdAt,
      actor: SOMEBODY,
      title: "Identified missing input",
      detail: clip(need.purpose, 240),
      importance: "standard",
    });
  }

  // manager_decision — strategy decisions with a legal approach (gate rows excluded).
  const optionsByDecision = new Map(source.decisions.map((row) => [row.decisionId, decodeOptions(row.coarsePlanSummary)] as const));
  for (const decision of source.decisions) {
    if (decision.kind !== "satisfaction_strategy" && decision.kind !== "escalation") continue;
    if (decision.authorization.kind === "refused") continue;
    const approach = decision.authorization.kind === "approval_required" ? (toApproach(decision.strategy) ?? "ASK") : toApproach(decision.strategy);
    if (!approach) continue;
    const options = optionsByDecision.get(decision.decisionId) ?? [];
    const selectedOption = options.find((row) => row.optionId === decision.optionId);
    const label = selectedOption?.label ?? reqTitle(decision.requirementKey, decision.contractRevision);
    const alt = decision.strongestAlternativeId ? options.find((row) => row.optionId === decision.strongestAlternativeId) : undefined;
    items.push({
      id: `activity:manager_decision:${decision.decisionId}`,
      type: "manager_decision",
      occurredAt: decision.at,
      actor: SOMEBODY,
      title:
        decision.authorization.kind === "approval_required"
          ? `Somebody needs approval to ${approach === "BUY" ? "buy" : "proceed"}: ${clip(label, 80)}`
          : `Somebody chose to ${approach === "MAKE" ? "make" : approach === "BUY" ? "buy" : approach === "WAIT" ? "wait" : "ask"}: ${clip(label, 80)}`,
      importance: "major",
      payload: {
        selected: { approach, label: clip(label, 160) },
        ...(alt && alt.approach && alt.label ? { alternative: { approach: alt.approach, label: clip(alt.label, 160) } } : {}),
        ...(decision.rationale ? { reason: clip(decision.rationale, 300) } : {}),
      },
    });
  }

  // founder_action_required — the selected Attention source, once.
  if (facts.attention) {
    const { attention, raisedAt } = facts.attention;
    items.push({
      id: `activity:founder_action_required:${attention.id}:${attention.revision}`,
      type: "founder_action_required",
      occurredAt: raisedAt,
      actor: SOMEBODY,
      title: attention.title,
      detail: attention.detail,
      importance: "major",
    });
  }

  // artifact_changed — governed deliverables only, versions ≥ 2 (v1 is creation).
  const deliverables = projectDeliverables(source, facts);
  const deliverableKeys = new Map(deliverables.map((row) => [row.id, row] as const));
  for (const artifact of objective.companyArtifacts) {
    const id = deliverableId(objective.key, artifact.key);
    if (!deliverableKeys.has(id)) continue;
    const ordered = [...artifact.history].sort((a, b) => a.version - b.version);
    for (const entry of ordered) {
      if (entry.version < 2) continue;
      const actor = actorForRun(entry.changedByRunId);
      if (!actor) continue;
      const used = [...new Set(entry.usedAcquisitionEvidenceIds ?? [])];
      const before = ordered.find((row) => row.version === entry.version - 1);
      const causes = used.map((evidenceId) => verifiedActivityByEvidence.get(evidenceId)).filter((value): value is string => value !== undefined);
      const refs = evidenceRefsFor(source, used);
      items.push({
        id: `activity:artifact_changed:${artifact.key}:${entry.version}`,
        type: "artifact_changed",
        occurredAt: entry.changedAt,
        actor,
        title: `${artifact.label} updated to version ${entry.version}`,
        detail: clip(entry.changeNote, 240),
        importance: "major",
        related: { deliverableId: id, ...(used.length > 0 ? { evidenceIds: used } : {}), ...(actor.kind === "intern" ? { internId: actor.id } : {}) },
        // A single explicit acquisition source is a causal line; several
        // independent sources are listed in related.evidenceIds instead.
        ...(used.length === 1 && causes.length === 1 ? { causedByActivityId: causes[0] } : {}),
        payload: {
          deliverableId: id,
          ...(before ? { before: excerpt(before.content) } : {}),
          after: excerpt(entry.content),
          changeSummary: clip(entry.changeNote, 300),
          ...(refs.length > 0 ? { evidenceRefs: refs } : {}),
        },
      });
    }
  }

  // verification_started is omitted: the pending-assessment reservation carries
  // no durable timestamp, so it cannot be placed truthfully in time (§21).

  // verification_completed — the current persisted assessment for this revision.
  const assessment = objective.finalSemanticAssessment;
  if (assessment && revision !== null && assessment.contractRevision === revision) {
    const refs = assessment.evidenceRefs.filter((id) => source.evidence.some((row) => row.evidenceId === id) || acquisitionEvidenceIds.has(id));
    items.push({
      id: `activity:verification_completed:r${assessment.contractRevision}:${assessment.artifactKey ?? "none"}@${assessment.artifactVersion ?? "none"}:${assessment.assessedAt}`,
      type: "verification_completed",
      occurredAt: assessment.assessedAt,
      actor: SOMEBODY,
      title: assessment.meetsMinimumBar ? "The deliverable meets the required outcome" : "The deliverable does not yet meet the required outcome",
      detail: clip(assessment.rationale, 300),
      importance: "major",
      ...(refs.length > 0 ? { related: { evidenceIds: refs } } : {}),
      payload: {
        checks: [{ label: "Meets the minimum completion bar", status: assessment.meetsMinimumBar ? "passed" : "failed" }],
        ...(assessment.assumptionsUnknowns.length > 0 ? { remainingUnknowns: assessment.assumptionsUnknowns.map((item) => clip(item, 240)) } : {}),
      },
    });
  }

  if (facts.completionAccepted && revision !== null) {
    items.push({
      id: `activity:objective_completed:${objective.key}:r${revision}`,
      type: "objective_completed",
      occurredAt: facts.statusAt,
      actor: SOMEBODY,
      title: "Objective complete",
      ...(objective.result ? { detail: clip(objective.result.summary, 300) } : {}),
      importance: "major",
    });
  } else if (facts.status === "blocked") {
    const stamp = facts.blockedAt ?? objective.updatedAt;
    items.push({
      id: `activity:objective_blocked:${facts.effectiveState}:${stamp}`,
      type: "objective_blocked",
      occurredAt: stamp,
      actor: SOMEBODY,
      title: "Objective blocked",
      ...(facts.blockerNote ? { detail: facts.blockerNote } : {}),
      importance: "major",
    });
  }

  // Stable de-duplication by id (identity is the source fact, never repeated).
  const unique = new Map<string, ActivityItem>();
  for (const item of items) if (!unique.has(item.id)) unique.set(item.id, item);
  let sorted = [...unique.values()].sort(
    (a, b) => a.occurredAt - b.occurredAt || (TYPE_RANK[a.type] ?? 99) - (TYPE_RANK[b.type] ?? 99) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0),
  );
  if (sorted.length > ACTIVITY_LIMIT) sorted = sorted.slice(sorted.length - ACTIVITY_LIMIT);
  const kept = new Set(sorted.map((item) => item.id));
  return sorted.map((item) => {
    if (item.causedByActivityId && !kept.has(item.causedByActivityId)) {
      const { causedByActivityId: _dropped, ...rest } = item;
      return rest;
    }
    return item;
  });
}

// ── Workspace / list / capabilities ──────────────────────────────────────────

export function deriveViewRevision(view: unknown): string {
  // Opaque token: a stable hash of the projected content (never of the clock).
  return `v1:${sha256Hex(JSON.stringify(view)).slice(0, 16)}`;
}

export function projectObjectiveWorkspace(source: ProductSource, options: ProjectionOptions): ObjectiveWorkspaceView {
  const facts = deriveObjectiveFacts(source, options);
  const objective = source.objective;
  const currentWork = projectCurrentWork(source, facts, options);
  const progress = projectProgress(source, facts);
  const attention = facts.attention ? facts.attention.attention : null;
  return {
    objective: {
      id: objective.key,
      title: deriveTitle(objective.request),
      request: objective.request,
      ...(facts.completionAccepted && objective.result ? { summary: clip(objective.result.summary, 400) } : {}),
      status: facts.status,
      createdAt: objective.createdAt,
      updatedAt: objective.updatedAt,
    },
    progress,
    somebodyNow: projectSomebodyNow(source, facts, currentWork),
    currentWork,
    activity: projectActivity(source, facts, options.now),
    deliverables: projectDeliverables(source, facts),
    acquisitions: projectAcquisitions(source, facts, options),
    attention,
    // No generic resume/retry primitive exists in M6.1 (§37): never invented.
    availableActions: [],
  };
}

export function projectObjectiveSummary(source: StatusSource, options: Pick<ProjectionOptions, "attentionActions"> = {}): ObjectiveSummaryView {
  const facts = deriveObjectiveFacts(source, options);
  return {
    id: source.objective.key,
    title: deriveTitle(source.objective.request),
    status: facts.status,
    updatedAt: source.objective.updatedAt,
    statusLabel: STATUS_LABEL[facts.status],
    hasAttention: facts.attention !== null,
  };
}

export function groupObjectiveSummaries(summaries: ObjectiveSummaryView[]): ObjectiveListView {
  const sorted = [...summaries].sort((a, b) => b.updatedAt - a.updatedAt || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  return {
    needsYou: sorted.filter((row) => row.status === "needs_you"),
    done: sorted.filter((row) => row.status === "completed"),
    inProgress: sorted.filter((row) => row.status !== "needs_you" && row.status !== "completed"),
  };
}

/**
 * Advertises only what V6 may legally invoke through a WIRED product command
 * (§38–39). Create Objective is wired via productCommands.createObjectiveV1;
 * flip additional flags only in the commit that wires the matching adapter.
 */
export function projectStartCapabilities(): StartCapabilitiesView {
  return {
    canCreateObjective: true,
    supportsContextRefs: false,
    supportsAttachments: false,
    advanced: { spendLimit: false, deadline: false, externalEffectPolicy: false },
  };
}
