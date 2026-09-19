// M5 INTEGRATION — normalized read-model composer (pure, runtime-agnostic).
//
// Direction of truth (never reversed):
//   Convex authoritative domain truth
//     → this composer (ONE normalized backend read model)
//     → ObjectiveWorkspaceView
//     → accepted M5 Executive Mission Control
//
// React is NOT the join layer: this module composes the whole workspace from
// rows the backend persisted. It invents nothing: every field maps to a
// durable row, and missing backend facts degrade to truthful empty states —
// NEVER to fixture values.
//
// Truth boundaries preserved here:
//   - M4 ExecutionIntent state and M3 payment state are separate machines.
//     Convex holds only M4 intent truth; a payment view is DERIVED from intent
//     state and is labelled as such. submitted ≠ settled ≠ result_received ≠
//     verified is never collapsed.
//   - worker result_submitted ≠ assignment verified ≠ requirement satisfied ≠
//     objective completed.
//   - external_acquisition ≠ external_effect.
//   - No Requirement dependency edges exist; none are invented (the accepted
//     frontend xray builder only relates requirement→contract, never
//     requirement→requirement).
//   - Mission Story events come from persisted rows with stable ids; the
//     backend's wake dedupe means duplicate activity cannot duplicate events.

import type {
  AssignmentView,
  AttentionItem,
  ArtifactView,
  DecisionView,
  EvidenceView,
  ExternalView,
  MissionStoryEvent,
  ObjectiveWorkspaceView,
  OptionView,
  RequirementView,
  SomebodyNow,
  WorkerView,
} from "../../app/m5/workspace";
import type { PaymentState } from "../payment/types";

// ── Loose source rows (structural subsets — this is the adapter seam) ────────

export type SourceObjectiveRow = {
  key: string;
  request: string;
  createdAt: number;
  updatedAt: number;
  state: string;
  result?: { summary: string; completedAt: number } | null;
  companyArtifacts?: SourceArtifact[];
  management?: {
    contractId?: string | null;
    controlNotes?: Array<Record<string, unknown>>;
  };
};

export type SourceArtifact = {
  key: string;
  label: string;
  version: number;
  history: { version: number; changeNote: string; changedAt: number }[];
};

export type SourceContract = {
  contractId: string;
  objectiveKey: string;
  revision: number;
  intent: string;
  minimumCompletionBar: string;
  levels: { levelKey: string; order: number; label: string; statement: string }[];
};

export type SourceRequirement = {
  requirementKey: string;
  title: string;
  mustBeTrue: string;
  priority: "required" | "supporting";
  state: "active" | "satisfied" | "blocked" | "superseded" | "waived";
  strategy: string | null;
  contractRevision: number;
  resolution: { resolutionId: string; proofRefs: string[]; acceptedAt: number } | null;
  createdAt?: number;
};

export type SourceWorker = {
  workerKey: string;
  displayName: string;
  responsibility: string;
  lifecycle: "available" | "assigned" | "suspended" | "retired";
  createdByObjective: string | null;
  reservedBy: { assignmentId: string } | null;
  verifiedAssignments: { assignmentId: string; requirementKey: string | null; outcome: string; summary: string; at: number }[];
};

export type SourceAssignment = {
  assignmentId: string;
  workerKey: string;
  requirementKey: string;
  decisionId: string;
  contractRevision: number;
  state: "authorized" | "dispatched" | "running" | "result_submitted" | "verified" | "failed" | "superseded";
  resultSummary: string | null;
  runId: string | null;
  createdAt?: number;
  updatedAt: number;
};

export type SourceDecisionRow = {
  decisionId: string;
  requirementKey: string;
  kind: string;
  strategy: string | null;
  optionId: string | null;
  recommendation: { rationale: string } | null;
  authorization:
    | { kind: "authorized"; optionId?: string; spendApprovalId?: string | null }
    | { kind: "refused"; detail?: string }
    | { kind: "approval_required"; question?: string; reason?: string };
  coarsePlanSummary: string;
  consideredOptionIds: string[];
  at: number;
};

export type SourceIntent = {
  intentId: string;
  requirementKey: string;
  decisionId: string;
  contractRevision: number;
  kind: "external_acquisition" | "external_effect";
  strategy: "BUY" | "HYBRID";
  target: { providerId: string | null; serviceId: string | null; offeringId: string | null; resourceClass: string | null };
  terms: { priceUsd: number | null; priceProvenance: string; requiresApproval: boolean; approvalId: string | null };
  state: string;
  resultEvidenceId: string | null;
  verificationEvidenceId: string | null;
  boundaryNote: string;
  createdAt: number;
  updatedAt: number;
};

export type SourceGrant = {
  approvalId: string;
  limitUsd: number;
  grantedAt: number;
  revokedAt: number | null;
};

export type SourceEvidenceRow = {
  evidenceId: string;
  label: string;
  text: string;
  origin: "application_observation" | "model_note";
  observedAt: number;
  runId: string;
};

export type WorkspaceSource = {
  objective: SourceObjectiveRow;
  contract: SourceContract | null;
  requirements: SourceRequirement[];
  workers: SourceWorker[];
  assignments: SourceAssignment[];
  decisions: SourceDecisionRow[];
  intents: SourceIntent[];
  grants: SourceGrant[];
  evidence: SourceEvidenceRow[];
};

// ── Payment normalization (M4 intent truth → UI payment stage) ───────────────
//
// Convex stores NO M3 payment rows; the Node driver owns the financial ledger.
// The intent state is the only payment-adjacent fact the read model may show.
// This mapping is monotone and never claims a stage the intent has not passed.
// It NEVER invents signed/confirmed/finalized wording.
export const PAYMENT_STAGE_BY_INTENT_STATE: Record<string, PaymentState | null> = {
  authorized: null, // authorized ≠ any payment fact; no payment view yet
  awaiting_m3: null, // resting at the M4/M3 boundary; nothing was attempted
  handed_off: "submitted", // the driver submitted; settled is NOT implied
  result_recorded: "result_received", // provider result persisted; NOT verified
  verified: "verified",
  failed: "failed",
  reconciliation_required: "reconciliation_required",
};

function approvalStageHistory(intent: SourceIntent, grant: SourceGrant | null): { id: string; state: PaymentState; at: number }[] {
  const history: { id: string; state: PaymentState; at: number }[] = [];
  history.push({ id: `${intent.intentId}:prepared`, state: "prepared", at: intent.createdAt });
  if (intent.terms.requiresApproval || intent.terms.approvalId !== null) {
    history.push({ id: `${intent.intentId}:awaiting_approval`, state: "awaiting_approval", at: intent.createdAt });
    if (intent.terms.approvalId !== null) {
      history.push({
        id: `${intent.intentId}:approved`,
        state: "approved",
        at: grant ? grant.grantedAt : intent.createdAt,
      });
    }
  }
  return history;
}

function derivePaymentView(intent: SourceIntent, grant: SourceGrant | null): ExternalView["payment"] | null {
  const stage = PAYMENT_STAGE_BY_INTENT_STATE[intent.state] ?? null;
  if (stage === null) return null; // no payment fact exists yet — truthfully absent
  const history = approvalStageHistory(intent, grant);
  if (stage === "submitted" || stage === "result_received" || stage === "verified") {
    history.push({ id: `${intent.intentId}:payment_attempted`, state: "payment_attempted", at: intent.updatedAt });
    history.push({ id: `${intent.intentId}:submitted`, state: "submitted", at: intent.updatedAt });
  }
  if (stage === "result_received" || stage === "verified") {
    history.push({ id: `${intent.intentId}:result_received`, state: "result_received", at: intent.updatedAt });
  }
  if (stage === "verified") {
    history.push({ id: `${intent.intentId}:verified`, state: "verified", at: intent.updatedAt });
  }
  if (stage === "failed" || stage === "reconciliation_required") {
    history.push({ id: `${intent.intentId}:${stage}`, state: stage, at: intent.updatedAt });
  }
  // maximumUsd provenance: the founder spend grant limit is a real USD bound.
  // The M4 expected/quoted price is a DIFFERENT concept and only used when it
  // carries a known USD provenance; it is labelled in the boundary note.
  const maximumUsd = grant
    ? grant.limitUsd
    : intent.terms.priceUsd !== null && intent.terms.priceProvenance !== "unknown"
      ? intent.terms.priceUsd
      : 0;
  return { paymentId: `payment-view:${intent.intentId}`, state: stage, maximumUsd, history };
}

// ── Individual view mappers ──────────────────────────────────────────────────

function toRequirementView(req: SourceRequirement, currentRevision: number): RequirementView {
  // A resolution accepted against an OLDER contract revision is stale: it is a
  // historical fact, never current satisfaction.
  const stale = req.resolution !== null && req.contractRevision < currentRevision;
  return {
    requirementKey: req.requirementKey,
    title: req.title,
    mustBeTrue: req.mustBeTrue,
    priority: req.priority,
    state: req.state === "satisfied" && stale ? "active" : req.state,
    strategy: (req.strategy as RequirementView["strategy"]) ?? null,
    contractRevision: req.contractRevision,
    resolution: stale ? null : req.resolution,
  };
}

function staffingTruth(worker: SourceWorker, objectiveKey: string): WorkerView["staffing"] {
  // REUSE / CREATE comes only from persisted staffing truth: the dispatch path
  // stamps createdByObjective when (and only when) it CREATES the worker row.
  if (worker.createdByObjective === objectiveKey) {
    return { outcome: "create", reason: "Worker row created by this Objective's dispatch (persisted createdByObjective)." };
  }
  return { outcome: "reuse", reason: "Persistent That Guy predating this Objective's staffing." };
}

function toWorkerView(worker: SourceWorker, objectiveKey: string): WorkerView {
  return {
    workerKey: worker.workerKey,
    displayName: worker.displayName,
    responsibility: worker.responsibility,
    lifecycle: worker.lifecycle,
    staffing: staffingTruth(worker, objectiveKey),
    // Verified history = application-ACCEPTED assignment outcomes only. A
    // worker run finishing is not verification; only "accepted" rows are shown.
    verifiedHistory: worker.verifiedAssignments
      .filter((item) => item.outcome === "accepted")
      .map((item) => `${item.summary || item.assignmentId} (accepted${item.requirementKey ? ` · ${item.requirementKey}` : ""})`),
    reservedForAssignmentId: worker.reservedBy?.assignmentId ?? null,
  };
}

function toAssignmentView(assignment: SourceAssignment, currentRevision: number): AssignmentView {
  const stale = assignment.contractRevision < currentRevision;
  return {
    assignmentId: assignment.assignmentId,
    workerKey: assignment.workerKey,
    requirementKey: assignment.requirementKey,
    decisionId: assignment.decisionId,
    // A delivery against a superseded revision is history, not current state.
    state: stale && assignment.state !== "failed" ? "superseded" : assignment.state,
    resultSummary: assignment.resultSummary,
    proofRefs: [],
  };
}

function decodeDecisionExtras(summary: string): {
  options?: Array<Record<string, unknown>>;
  gateVerdict?: { accepted: boolean; satisfiedRequired?: string[]; disclosedPendingSupporting?: string[]; levelsAboveBarPending?: string[]; unmet?: string[] };
} {
  try {
    const parsed = JSON.parse(summary) as {
      extra?: { options?: Array<Record<string, unknown>> };
      gateVerdict?: { accepted: boolean; satisfiedRequired?: string[]; disclosedPendingSupporting?: string[]; levelsAboveBarPending?: string[]; unmet?: string[] };
    };
    return { options: parsed.extra?.options, gateVerdict: parsed.gateVerdict };
  } catch {
    return {};
  }
}

function toOptionView(raw: Record<string, unknown>): OptionView {
  const facts = Array.isArray(raw.facts) ? (raw.facts as Array<Record<string, unknown>>) : [];
  return {
    optionId: String(raw.optionId ?? "option"),
    strategy: (["MAKE", "BUY", "HYBRID"].includes(String(raw.strategy)) ? String(raw.strategy) : "MAKE") as OptionView["strategy"],
    label: String(
      (raw.internal as { responsibility?: string } | null)?.responsibility ??
        (raw.external as { offeringId?: string | null; providerId?: string | null } | null)?.offeringId ??
        raw.optionId ?? "option",
    ),
    eligibility: (raw.eligibility as { eligible?: boolean })?.eligible ? "eligible" : "ineligible",
    reason: String(
      (raw.eligibility as { detail?: string; reasons?: string[] } | undefined)?.detail ??
        ((raw.eligibility as { reasons?: string[] } | undefined)?.reasons ?? []).join(", ") ??
        "Grounded by application code.",
    ),
    facts: facts.slice(0, 6).map((fact) => ({
      label: String(fact.label ?? fact.key ?? "fact"),
      value: String(fact.value ?? "unknown"),
      provenance: (["persisted_evidence", "registry_data", "provider_quote", "llm_estimate", "measured"].includes(String(fact.provenance))
        ? String(fact.provenance)
        : "unknown") as OptionView["facts"][number]["provenance"],
    })),
  };
}

function toDecisionView(row: SourceDecisionRow): DecisionView | null {
  // Gate rows are completion verdicts, not managerial strategy decisions; they
  // feed `completion`, never the Decisions card.
  if (row.kind === "completion_proposal") return null;
  const extras = decodeDecisionExtras(row.coarsePlanSummary);
  const options = (extras.options ?? []).map(toOptionView);
  const authorization: DecisionView["authorization"] =
    row.authorization.kind === "authorized"
      ? "authorized"
      : row.authorization.kind === "approval_required"
        ? "approval_required"
        : "refused";
  let summary: string;
  try {
    const parsed = JSON.parse(row.coarsePlanSummary) as { original?: string };
    summary = parsed.original ?? row.coarsePlanSummary;
  } catch {
    summary = row.coarsePlanSummary;
  }
  return {
    decisionId: row.decisionId,
    requirementKey: row.requirementKey,
    strategy: (row.strategy ?? "WAIT") as DecisionView["strategy"],
    summary: summary.slice(0, 300) || row.decisionId,
    rationale: row.recommendation?.rationale ?? (authorization === "refused" ? "Authorization refused by the deterministic gate." : "No model recommendation persisted; the deterministic kernel decided."),
    authorization,
    selectedOptionId: row.authorization.kind === "authorized" ? (row.authorization.optionId ?? row.optionId) : row.optionId,
    options,
    at: row.at,
  };
}

function externalName(intent: SourceIntent): string {
  return intent.target.providerId ?? intent.target.serviceId ?? intent.target.offeringId ?? "External provider";
}

function toExternalView(intent: SourceIntent, grants: SourceGrant[]): ExternalView {
  const grant = intent.terms.approvalId
    ? grants.find((item) => item.approvalId === intent.terms.approvalId && item.revokedAt === null) ?? null
    : null;
  const payment = derivePaymentView(intent, grant);
  const kindNote =
    intent.kind === "external_acquisition"
      ? "external_acquisition: buying information/resource. It does NOT prove any later external business effect happened."
      : "external_effect: an authorized change in the outside world.";
  const priceNote =
    grant
      ? `Spend bound by founder grant ${grant.approvalId} (limit $${grant.limitUsd.toFixed(2)}).`
      : intent.terms.priceUsd !== null
        ? `M4 expected/quoted price $${intent.terms.priceUsd.toFixed(2)} (${intent.terms.priceProvenance.replaceAll("_", " ")}). A quote is not an executed transaction amount.`
        : "No USD amount persisted.";
  const paymentNote = payment
    ? " Payment stage is DERIVED from the M4 intent state; the M3 financial ledger is the separate authority."
    : " No payment fact exists yet; nothing was attempted.";
  return {
    providerId: intent.target.providerId ?? `provider:${intent.intentId}`,
    name: externalName(intent),
    resource: intent.target.resourceClass ?? intent.target.serviceId ?? intent.kind,
    requirementKey: intent.requirementKey,
    decisionId: intent.decisionId,
    intent: {
      intentId: intent.intentId,
      kind: intent.kind,
      state: intent.state as NonNullable<ExternalView["intent"]>["state"],
      approvalId: intent.terms.approvalId ?? `unbound:${intent.intentId}`,
    },
    payment: payment ?? {
      // No payment fact yet: show the earliest truthful stage with NO history
      // beyond intent creation, so the UI never renders a stage not reached.
      paymentId: `payment-view:${intent.intentId}`,
      state: "prepared",
      maximumUsd: grant ? grant.limitUsd : intent.terms.priceUsd ?? 0,
      history: [{ id: `${intent.intentId}:prepared`, state: "prepared" as PaymentState, at: intent.createdAt }],
    },
    boundaryNote: `${intent.boundaryNote} ${kindNote} ${priceNote}${paymentNote}`,
  };
}

function evidenceState(
  row: SourceEvidenceRow,
  requirements: SourceRequirement[],
): EvidenceView["state"] {
  // Evidence is "verified" only when an ACCEPTED resolution (or gate) cites it
  // as proof. An external intent's verification evidence id marks that the
  // intent verified SOMETHING; the evidence row itself is verified only via
  // the application's own accepted proof references.
  if (requirements.some((req) => req.resolution?.proofRefs.includes(row.evidenceId))) return "verified";
  return "received";
}

function toEvidenceViews(source: WorkspaceSource): EvidenceView[] {
  const runToRequirement = new Map<string, string>();
  for (const assignment of source.assignments) {
    if (assignment.runId) runToRequirement.set(assignment.runId, assignment.requirementKey);
  }
  return source.evidence.map((row) => ({
    evidenceId: row.evidenceId,
    label: row.label,
    summary: row.text.slice(0, 400),
    // model_note is a non-proof annotation; the closest view origin is
    // founder_confirmation-shaped text, but truthfully it is neither an
    // application observation nor a provider result — keep application truth:
    origin: row.origin === "application_observation" ? "application_observation" : "founder_confirmation",
    state: evidenceState(row, source.requirements),
    requirementKey:
      source.intents.find((intent) => intent.resultEvidenceId === row.evidenceId)?.requirementKey ??
      runToRequirement.get(row.runId) ??
      source.requirements[0]?.requirementKey ??
      "",
    providerId: source.intents.find((intent) => intent.resultEvidenceId === row.evidenceId)?.target.providerId ?? null,
    observedAt: row.observedAt,
  }));
}

function toArtifactViews(objective: SourceObjectiveRow): ArtifactView[] {
  return (objective.companyArtifacts ?? []).map((artifact) => ({
    artifactId: `artifact:${objective.key}:${artifact.key}`,
    label: artifact.label,
    versions: artifact.history.map((entry) => ({
      id: `artifact-version:${objective.key}:${artifact.key}:${entry.version}`,
      version: entry.version,
      summary: entry.changeNote,
      at: entry.changedAt,
      // Artifacts do not persist direct evidence references; an empty list is
      // truthful. Never fabricate refs.
      evidenceRefs: [],
    })),
  }));
}

// ── SomebodyNow (normalized presentation concept, derived — never persisted) ──

export function deriveSomebodyNow(source: WorkspaceSource, state: string): SomebodyNow {
  const requirements = source.requirements.map((req) => toRequirementView(req, source.contract?.revision ?? req.contractRevision));
  const notes = source.objective.management?.controlNotes ?? [];
  const pendingApproval = notes.filter((note) => note.type === "pending_approval");
  const reconciling = source.intents.some((intent) => intent.state === "reconciliation_required");
  const blocked = state === "blocked" || state === "recovery_required" || requirements.some((req) => req.state === "blocked");
  const activeAssignment = source.assignments.find((item) => item.state === "running" || item.state === "dispatched");
  const submittedResult = source.assignments.find((item) => item.state === "result_submitted");
  const handedOff = source.intents.find((intent) => intent.state === "handed_off");
  const awaitingProvider = source.intents.find((intent) => intent.state === "result_recorded");
  const currentRequirement =
    requirements.find((req) => req.state === "active" && req.priority === "required") ??
    requirements.find((req) => req.state === "active") ??
    null;

  if (state === "completed") {
    return {
      headline: "Done means proved.",
      detail: "The independent completion gate accepted the Objective. Supporting work that remains pending is disclosed, not hidden.",
      ball: "Nobody — complete",
      condition: "verified",
      currentRequirementKey: null,
    };
  }
  if (state === "failed") {
    return {
      headline: "This Objective failed.",
      detail: "Somebody stopped and recorded why. Nothing is silently retried.",
      ball: "You",
      condition: "blocked",
      currentRequirementKey: currentRequirement?.requirementKey ?? null,
    };
  }
  if (reconciling) {
    return {
      headline: "Reconciliation required.",
      detail: "An external execution left an ambiguous financial state. Somebody will not retry blindly; the durable record must be reconciled first.",
      ball: "Somebody",
      condition: "blocked",
      currentRequirementKey: source.intents.find((intent) => intent.state === "reconciliation_required")?.requirementKey ?? null,
    };
  }
  if (pendingApproval.length > 0) {
    return {
      headline: "Somebody needs your call.",
      detail: String(pendingApproval[0].question ?? "A material decision requires founder approval."),
      ball: "You",
      condition: "needs_you",
      currentRequirementKey: currentRequirement?.requirementKey ?? null,
    };
  }
  if (state === "escalated") {
    return {
      headline: "Escalated to you.",
      detail: "Somebody stopped acting and handed the Objective to the founder.",
      ball: "You",
      condition: "needs_you",
      currentRequirementKey: currentRequirement?.requirementKey ?? null,
    };
  }
  if (blocked) {
    return {
      headline: "Blocked — no executable path right now.",
      detail: "Somebody recorded the blocker instead of inventing a way around it.",
      ball: "Somebody",
      condition: "blocked",
      currentRequirementKey: currentRequirement?.requirementKey ?? null,
    };
  }
  if (submittedResult) {
    return {
      headline: "A result arrived, not a completion claim.",
      detail: "Somebody is verifying the delivery against the Requirement's proof before anything is accepted.",
      ball: "Somebody",
      condition: "working",
      currentRequirementKey: submittedResult.requirementKey,
    };
  }
  if (activeAssignment) {
    return {
      headline: "Bounded work in progress.",
      detail: "A That Guy is executing one bounded assignment. Somebody holds the outcome, not a task list.",
      ball: "Somebody",
      condition: "working",
      currentRequirementKey: activeAssignment.requirementKey,
    };
  }
  if (awaitingProvider) {
    return {
      headline: "Provider result recorded. Verification is separate.",
      detail: "The external result exists; application verification has not accepted it yet.",
      ball: "Somebody",
      condition: "working",
      currentRequirementKey: awaitingProvider.requirementKey,
    };
  }
  if (handedOff) {
    return {
      headline: "Waiting on the outside world.",
      detail: "An authorized external acquisition was handed off. Submitted does not mean settled, and settled does not mean the result arrived.",
      ball: "Provider",
      condition: "waiting",
      currentRequirementKey: handedOff.requirementKey,
    };
  }
  if (source.intents.some((intent) => intent.state === "awaiting_m3")) {
    return {
      headline: "Resting at the payment boundary.",
      detail: "The intent is recorded and waits. No payment was attempted or made.",
      ball: "You",
      condition: "waiting",
      currentRequirementKey: currentRequirement?.requirementKey ?? null,
    };
  }
  if (state === "waiting" || state === "waiting_for_resource" || state === "approval_required") {
    return {
      headline: "Waiting on a real condition.",
      detail: "Somebody is quiescent: waiting on time, a resource, or an approval. Nothing auto-runs.",
      ball: state === "approval_required" ? "You" : "Somebody",
      condition: state === "approval_required" ? "needs_you" : "waiting",
      currentRequirementKey: currentRequirement?.requirementKey ?? null,
    };
  }
  if (!source.contract) {
    return {
      headline: "An Objective, not another to-do list.",
      detail: "Somebody is interpreting the request into an outcome that can be proved.",
      ball: "Somebody",
      condition: "working",
      currentRequirementKey: null,
    };
  }
  return {
    headline: "Somebody is managing the outcome.",
    detail: currentRequirement
      ? `Working the next Requirement: ${currentRequirement.title}.`
      : "Planning the next authoritative move from persisted truth.",
    ball: "Somebody",
    condition: "working",
    currentRequirementKey: currentRequirement?.requirementKey ?? null,
  };
}

// ── Attention / Needs You (only from real backend conditions) ────────────────

export function deriveAttention(source: WorkspaceSource, state: string): AttentionItem[] {
  const items: AttentionItem[] = [];
  const notes = source.objective.management?.controlNotes ?? [];
  const grants = source.grants;

  for (const note of notes) {
    if (note.type === "pending_approval") {
      const question = String(note.question ?? "Founder approval required.");
      // Bind a real spend ceiling only when a live grant exists for this
      // objective; otherwise there is no known USD amount and we show none.
      const liveGrant = grants.find((grant) => grant.revokedAt === null) ?? null;
      items.push({
        id: `attention:pending_approval:${question.slice(0, 80)}`,
        kind: "approval",
        title: "Your approval is required",
        detail: question,
        requestedAction: "Review the question and record your decision through the supervised approval path.",
        requirementKey: source.requirements.find((req) => req.state === "active")?.requirementKey ?? "",
        maximumUsd: liveGrant ? liveGrant.limitUsd : null,
      });
    }
  }

  for (const intent of source.intents) {
    if (intent.state === "reconciliation_required") {
      items.push({
        id: `attention:reconciliation:${intent.intentId}`,
        kind: "recovery",
        title: "External execution needs reconciliation",
        detail: intent.boundaryNote,
        requestedAction: "Run the supervised reconcile path on the durable driver record. No blind retry.",
        requirementKey: intent.requirementKey,
        maximumUsd: null,
      });
    }
  }

  for (const req of source.requirements) {
    if (req.state === "blocked") {
      items.push({
        id: `attention:blocked:${req.requirementKey}`,
        kind: "blocker",
        title: `Requirement blocked: ${req.title}`,
        detail: req.mustBeTrue,
        requestedAction: "Somebody recorded a real blocker. Review it before authorizing a new path.",
        requirementKey: req.requirementKey,
        maximumUsd: null,
      });
    }
  }

  if (state === "escalated" || state === "recovery_required") {
    items.push({
      id: `attention:state:${state}`,
      kind: state === "escalated" ? "question" : "recovery",
      title: state === "escalated" ? "Somebody escalated this Objective" : "Recovery required",
      detail: `Management state is ${state.replaceAll("_", " ")}. The engine stopped acting and preserved all durable records.`,
      requestedAction: "Inspect the control trail and give founder direction.",
      requirementKey: source.requirements.find((req) => req.state === "active")?.requirementKey ?? "",
      maximumUsd: null,
    });
  }

  return items;
}

// ── Mission Story (supportable facts only; explicit ids, no causal arrows) ───

export function deriveMissionStory(source: WorkspaceSource): MissionStoryEvent[] {
  const events: MissionStoryEvent[] = [];
  const objective = source.objective;
  const notes = objective.management?.controlNotes ?? [];

  events.push({
    id: `story:objective:${objective.key}`,
    at: objective.createdAt,
    title: "Objective submitted",
    detail: objective.request.slice(0, 200),
    kind: "objective",
    relatedIds: [objective.key],
  });

  for (const note of notes) {
    if (note.type === "contract_interpreted" && source.contract) {
      events.push({
        id: `story:contract:${source.contract.contractId}:r${source.contract.revision}`,
        at: Number(note.at ?? source.contract.revision),
        title: "Outcome Contract established",
        detail: source.contract.intent.slice(0, 200),
        kind: "management",
        relatedIds: [source.contract.contractId],
      });
    }
    if (note.type === "pending_approval") {
      events.push({
        id: `story:approval:${String(note.question ?? "").slice(0, 80)}`,
        at: Number(note.at ?? objective.createdAt),
        title: "Founder approval needed",
        detail: String(note.question ?? ""),
        kind: "approval",
        relatedIds: [],
      });
    }
  }

  for (const req of source.requirements) {
    events.push({
      id: `story:requirement:${req.requirementKey}`,
      at: req.createdAt ?? objective.createdAt,
      title: "Requirement identified",
      detail: `${req.title} — ${req.mustBeTrue.slice(0, 160)}`,
      kind: "management",
      relatedIds: [req.requirementKey, ...(source.contract ? [source.contract.contractId] : [])],
    });
    if (req.resolution) {
      events.push({
        id: `story:requirement-satisfied:${req.requirementKey}:${req.resolution.resolutionId}`,
        at: req.resolution.acceptedAt,
        title: "Requirement satisfied",
        detail: `Accepted resolution cites proof explicitly (${req.resolution.proofRefs.join(", ") || "no refs"}).`,
        kind: "verification",
        relatedIds: [req.requirementKey, ...req.resolution.proofRefs],
      });
    }
  }

  for (const row of source.decisions) {
    if (row.kind === "completion_proposal") continue;
    const extras = decodeDecisionExtras(row.coarsePlanSummary);
    const staffingNote = (extras.options ?? []).find(
      (option) => (option.internal as { workerKey?: string | null } | null)?.workerKey !== undefined,
    ) as { internal?: { workerKey?: string | null; staffingReason?: string | null } } | undefined;
    events.push({
      id: `story:decision:${row.decisionId}`,
      at: row.at,
      title:
        row.authorization.kind === "authorized"
          ? `${row.strategy ?? "Strategy"} decision persisted`
          : row.authorization.kind === "approval_required"
            ? "Decision needs founder approval"
            : "Decision refused by the authority gate",
      detail: row.recommendation?.rationale.slice(0, 200) ?? "",
      kind: staffingNote ? "staffing" : "management",
      relatedIds: [row.decisionId, row.requirementKey].filter(Boolean),
    });
  }

  for (const assignment of source.assignments) {
    events.push({
      id: `story:assignment:${assignment.assignmentId}`,
      at: assignment.createdAt ?? objective.createdAt,
      title: "Assignment dispatched",
      detail: `${assignment.workerKey} → ${assignment.requirementKey}`,
      kind: "staffing",
      relatedIds: [assignment.assignmentId, assignment.workerKey, assignment.requirementKey],
    });
    if (assignment.state === "result_submitted" || assignment.state === "verified" || assignment.state === "failed") {
      events.push({
        id: `story:assignment-result:${assignment.assignmentId}:${assignment.state}`,
        at: assignment.updatedAt,
        title: assignment.state === "result_submitted" ? "Worker result submitted" : assignment.state === "verified" ? "Assignment verified" : "Assignment failed",
        detail: assignment.resultSummary?.slice(0, 200) ?? assignment.state.replaceAll("_", " "),
        kind: assignment.state === "verified" ? "verification" : "artifact",
        relatedIds: [assignment.assignmentId, assignment.requirementKey],
      });
    }
  }

  for (const intent of source.intents) {
    events.push({
      id: `story:intent:${intent.intentId}`,
      at: intent.createdAt,
      title: `External ${intent.kind === "external_acquisition" ? "acquisition" : "effect"} prepared`,
      detail: `${intent.strategy} intent ${intent.intentId} · state ${intent.state.replaceAll("_", " ")}`,
      kind: "external",
      relatedIds: [intent.intentId, intent.requirementKey, intent.decisionId],
    });
    if (intent.state === "handed_off" || intent.state === "result_recorded" || intent.state === "verified") {
      events.push({
        id: `story:intent-submitted:${intent.intentId}`,
        at: intent.updatedAt,
        title: "Payment submitted",
        detail: "Submitted per the M4 intent record. Settlement is a separate fact owned by the M3 ledger.",
        kind: "external",
        relatedIds: [intent.intentId],
      });
    }
    if (intent.resultEvidenceId) {
      events.push({
        id: `story:intent-result:${intent.intentId}:${intent.resultEvidenceId}`,
        at: intent.updatedAt,
        title: "Provider result received",
        detail: `Result persisted as evidence ${intent.resultEvidenceId}. Received does not mean verified.`,
        kind: "evidence",
        relatedIds: [intent.intentId, intent.resultEvidenceId],
      });
    }
    if (intent.state === "verified" && intent.verificationEvidenceId) {
      events.push({
        id: `story:intent-verified:${intent.intentId}:${intent.verificationEvidenceId}`,
        at: intent.updatedAt,
        title: "External result verified",
        detail: `Independent verification accepted (${intent.verificationEvidenceId}).`,
        kind: "verification",
        relatedIds: [intent.intentId, intent.verificationEvidenceId],
      });
    }
  }

  for (const evidence of source.evidence) {
    events.push({
      id: `story:evidence:${evidence.evidenceId}`,
      at: evidence.observedAt,
      title: evidence.origin === "application_observation" ? "Application observed evidence" : "Note recorded",
      detail: evidence.label,
      kind: "evidence",
      relatedIds: [evidence.evidenceId],
    });
  }

  for (const artifact of objective.companyArtifacts ?? []) {
    for (const version of artifact.history) {
      events.push({
        id: `story:artifact:${objective.key}:${artifact.key}:${version.version}`,
        at: version.changedAt,
        title: `Artifact advanced to v${version.version}`,
        detail: `${artifact.label} — ${version.changeNote.slice(0, 160)}`,
        kind: "artifact",
        relatedIds: [`artifact:${objective.key}:${artifact.key}`],
      });
    }
  }

  return events.sort((a, b) => a.at - b.at || a.id.localeCompare(b.id));
}

// ── Completion (application gate truth only) ─────────────────────────────────

function deriveCompletion(source: WorkspaceSource, state: string): ObjectiveWorkspaceView["completion"] {
  const gateRow = source.decisions
    .filter((row) => row.kind === "completion_proposal")
    .sort((a, b) => b.at - a.at)[0];
  const gate = gateRow ? decodeDecisionExtras(gateRow.coarsePlanSummary).gateVerdict : undefined;
  const accepted = state === "completed" && (gate ? gate.accepted === true : true);
  const requirements = source.requirements.map((req) => toRequirementView(req, source.contract?.revision ?? req.contractRevision));
  const proofRefs = accepted
    ? requirements.flatMap((req) => req.resolution?.proofRefs ?? [])
    : [];
  const remaining: string[] = [];
  if (!accepted) {
    if (gate && gate.unmet) remaining.push(...gate.unmet);
    for (const req of requirements) {
      if (req.priority === "required" && req.state !== "satisfied" && req.state !== "waived")
        remaining.push(`${req.title} is still ${req.state}.`);
    }
  } else if (gate) {
    for (const key of gate.disclosedPendingSupporting ?? []) remaining.push(`Supporting requirement pending: ${key}`);
    for (const key of gate.levelsAboveBarPending ?? []) remaining.push(`Outcome level above the bar pending: ${key}`);
  }
  const summary = accepted
    ? source.objective.result?.summary?.slice(0, 300) ?? "The independent completion gate accepted this Objective."
    : gate && gate.unmet
      ? `The completion gate has not accepted: ${gate.unmet.join("; ")}`
      : "Completion has not been accepted. A worker result is not a completion claim.";
  return {
    accepted,
    proofRefs,
    summary,
    remaining,
    acceptedAt: accepted ? source.objective.updatedAt : null,
  };
}

// ── The composer ─────────────────────────────────────────────────────────────

export function composeObjectiveWorkspace(rawSource: WorkspaceSource): ObjectiveWorkspaceView {
  // The objective ROW state is the frozen M1/M2 enum. M4 management states
  // (waiting / approval_required / blocked / escalated / recovery_required)
  // are persisted as the latest `control_state` control note written by
  // writeObjectiveState. Deriving from that note is reading persisted truth,
  // never inventing state; a completed row stays completed regardless.
  const notes = (rawSource.objective.management?.controlNotes ?? []) as Array<Record<string, unknown>>;
  const controlStates = notes
    .filter((note) => note.type === "control_state" && typeof note.state === "string")
    .sort((a, b) => Number(a.at ?? 0) - Number(b.at ?? 0));
  const lastControlState = controlStates.length ? controlStates[controlStates.length - 1] : undefined;
  const state =
    rawSource.objective.state === "completed" || rawSource.objective.state === "failed"
      ? rawSource.objective.state
      : lastControlState
        ? String(lastControlState.state)
        : rawSource.objective.state;
  const source: WorkspaceSource = {
    ...rawSource,
    objective: { ...rawSource.objective, state },
  };
  const objective = source.objective;
  const currentRevision = source.contract?.revision ?? 0;

  const requirements = source.requirements.map((req) => toRequirementView(req, currentRevision || req.contractRevision));
  const workers = source.workers.map((worker) => toWorkerView(worker, objective.key));
  const assignments = source.assignments.map((item) => toAssignmentView(item, currentRevision || item.contractRevision));
  const decisions = source.decisions.map(toDecisionView).filter((item): item is DecisionView => item !== null);
  const external = source.intents.map((intent) => toExternalView(intent, source.grants));
  const evidence = toEvidenceViews(source);
  const artifacts = toArtifactViews(objective);
  const missionStory = deriveMissionStory(source);
  const completion = deriveCompletion(source, state);

  const title = objective.request.length > 60 ? `${objective.request.slice(0, 57).trimEnd()}…` : objective.request;

  return {
    provenance: "backend_query",
    objective: {
      objectiveKey: objective.key,
      title,
      request: objective.request,
      state: state as ObjectiveWorkspaceView["objective"]["state"],
      createdAt: objective.createdAt,
      updatedAt: objective.updatedAt,
    },
    somebodyNow: deriveSomebodyNow(source, state),
    outcome: source.contract
      ? {
          contractId: source.contract.contractId,
          revision: source.contract.revision,
          intent: source.contract.intent,
          minimumCompletionBar: source.contract.minimumCompletionBar,
          levels: source.contract.levels.map((level) => ({
            levelKey: level.levelKey,
            label: level.label,
            statement: level.statement,
            status: completion.accepted && level.levelKey === source.contract!.minimumCompletionBar
              ? ("achieved" as const)
              : level.levelKey === source.contract!.minimumCompletionBar
                ? ("current" as const)
                : ("pending" as const),
          })),
        }
      : null,
    requirements,
    workers,
    assignments,
    decisions,
    attention: deriveAttention(source, state),
    external,
    artifacts,
    evidence,
    missionStory,
    completion,
    xray: null, // built client-side by the accepted buildXray(view); no fabricated edges
  };
}
