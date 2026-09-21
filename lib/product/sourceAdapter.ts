// Row → ProductSource normalization (pure).
//
// Convex `data` payloads are validated at write time, but several fields are
// `v.any()` (companyArtifacts, acquisitionResults, resourceNeeds, controlNotes)
// or optional on legacy rows. This adapter is the ONLY place that reads those
// loose shapes, and it degrades every missing field to an explicit empty value
// so the projection never sees `undefined` where it expects truth.

import type {
  ProductAcquisitionResult,
  ProductArtifact,
  ProductAssessment,
  ProductAssignment,
  ProductContract,
  ProductDecision,
  ProductEvidence,
  ProductIntent,
  ProductObjectiveRow,
  ProductRequirement,
  ProductResourceNeed,
  ProductWorker,
} from "./frontendProjection";

type Loose = Record<string, unknown>;
const asArray = (value: unknown): Loose[] => (Array.isArray(value) ? (value as Loose[]) : []);
const str = (value: unknown, fallback = ""): string => (typeof value === "string" ? value : fallback);
const num = (value: unknown, fallback = 0): number => (typeof value === "number" && Number.isFinite(value) ? value : fallback);
const strOrNull = (value: unknown): string | null => (typeof value === "string" ? value : null);
const strArray = (value: unknown): string[] => (Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : []);

export function normalizeObjective(data: Loose): ProductObjectiveRow {
  const management = (data.management ?? {}) as Loose;
  const pending = management.pendingFinalAssessment as Loose | null | undefined;
  const result = data.result as Loose | null | undefined;
  const assessment = data.finalSemanticAssessment as Loose | null | undefined;
  return {
    key: str(data.key),
    request: str(data.request),
    createdAt: num(data.createdAt),
    updatedAt: num(data.updatedAt),
    state: str(data.state, "received"),
    result: result ? { summary: str(result.summary), completedAt: num(result.completedAt) } : null,
    workItems: asArray(data.workItems).map((item) => ({
      id: str(item.id),
      state: str(item.state),
      runs: asArray(item.runs).map((run) => ({
        id: str(run.id),
        status: (run.status === "running" || run.status === "stopped" || run.status === "failed" ? run.status : "stopped") as "running" | "stopped" | "failed",
        startedAt: num(run.startedAt),
        leaseUntil: num(run.leaseUntil),
      })),
    })),
    companyArtifacts: asArray(data.companyArtifacts).map(normalizeArtifact),
    acquisitionResults: asArray(data.acquisitionResults).map(
      (row): ProductAcquisitionResult => ({
        intentId: str(row.intentId),
        resultEvidenceId: str(row.resultEvidenceId),
        provenance: row.provenance === "live" || row.provenance === "recorded_replay" ? row.provenance : "simulation",
        providerId: str(row.providerId),
        serviceId: str(row.serviceId),
        content: str(row.content),
        recordedAt: num(row.recordedAt),
        verifiedAt: num(row.verifiedAt),
      }),
    ),
    resourceNeeds: asArray(data.resourceNeeds).map(
      (row): ProductResourceNeed => ({
        id: str(row.id),
        dedupeKey: str(row.dedupeKey),
        purpose: str(row.purpose),
        reasonOwnedInsufficient: str(row.reasonOwnedInsufficient),
        createdAt: num(row.createdAt),
        validationAuthority: row.validationAuthority === "application" || row.validationAuthority === "unconfirmed" ? row.validationAuthority : null,
        contractRevision: typeof row.contractRevision === "number" ? row.contractRevision : null,
      }),
    ),
    finalSemanticAssessment: assessment ? normalizeAssessment(assessment) : null,
    controlNotes: asArray(management.controlNotes),
    pendingFinalAssessmentRevision: pending && typeof pending.contractRevision === "number" ? pending.contractRevision : null,
    interpretationStatus: strOrNull(management.interpretationStatus),
  };
}

function normalizeArtifact(row: Loose): ProductArtifact {
  return {
    key: str(row.key),
    label: str(row.label, str(row.key)),
    content: str(row.content),
    version: num(row.version, 1),
    updatedAt: num(row.updatedAt),
    history: asArray(row.history).map((entry) => ({
      version: num(entry.version),
      content: str(entry.content),
      changedByRunId: str(entry.changedByRunId),
      changedAt: num(entry.changedAt),
      changeNote: str(entry.changeNote),
      ...(Array.isArray(entry.usedAcquisitionEvidenceIds) ? { usedAcquisitionEvidenceIds: strArray(entry.usedAcquisitionEvidenceIds) } : {}),
    })),
  };
}

function normalizeAssessment(row: Loose): ProductAssessment {
  return {
    meetsMinimumBar: row.meetsMinimumBar === true,
    rationale: str(row.rationale),
    artifactKey: strOrNull(row.artifactKey),
    artifactVersion: typeof row.artifactVersion === "number" ? row.artifactVersion : null,
    evidenceRefs: strArray(row.evidenceRefs),
    assumptionsUnknowns: strArray(row.assumptionsUnknowns),
    recommendedNextAction: str(row.recommendedNextAction),
    assessedAt: num(row.assessedAt),
    contractRevision: num(row.contractRevision),
  };
}

export function normalizeContract(data: Loose): ProductContract {
  return {
    contractId: str(data.contractId),
    revision: num(data.revision),
    intent: str(data.intent),
    createdAt: num(data.createdAt),
  };
}

export function normalizeRequirement(data: Loose): ProductRequirement {
  const resolution = data.resolution as Loose | null | undefined;
  const waiver = data.waiver as Loose | null | undefined;
  return {
    requirementKey: str(data.requirementKey),
    contractRevision: num(data.contractRevision),
    priority: data.priority === "required" ? "required" : "supporting",
    title: str(data.title, str(data.requirementKey)),
    mustBeTrue: str(data.mustBeTrue),
    scope: str(data.scope),
    dependsOnRequirementKeys: strArray(data.dependsOnRequirementKeys),
    state: (["active", "satisfied", "blocked", "superseded", "waived"].includes(str(data.state)) ? data.state : "active") as ProductRequirement["state"],
    resolution: resolution ? { contractRevision: num(resolution.contractRevision, -1), acceptedAt: num(resolution.acceptedAt) } : null,
    blockedReason: strOrNull(data.blockedReason),
    waiver: waiver && waiver.authorizedBy === "founder" ? { authorizedBy: "founder", at: num(waiver.at) } : null,
    updatedAt: num(data.updatedAt),
  };
}

export function normalizeWorker(data: Loose): ProductWorker {
  return {
    workerKey: str(data.workerKey),
    displayName: str(data.displayName, str(data.workerKey)),
    responsibility: str(data.responsibility),
    lifecycle: str(data.lifecycle),
    verifiedAssignments: asArray(data.verifiedAssignments).map((row) => ({
      assignmentId: str(row.assignmentId),
      outcome: str(row.outcome),
      at: num(row.at),
    })),
  };
}

export function normalizeAssignment(data: Loose): ProductAssignment {
  const contract = (data.workContract ?? {}) as Loose;
  return {
    assignmentId: str(data.assignmentId),
    workerKey: str(data.workerKey),
    requirementKey: str(data.requirementKey),
    decisionId: str(data.decisionId),
    contractRevision: num(data.contractRevision),
    kind: str(data.kind),
    state: data.state as ProductAssignment["state"],
    runId: strOrNull(data.runId),
    resultSummary: strOrNull(data.resultSummary),
    inputEvidenceIds: strArray(contract.inputEvidenceIds),
    targetArtifactKey: strOrNull(contract.targetArtifactKey),
    createdAt: num(data.createdAt),
    updatedAt: num(data.updatedAt),
  };
}

export function normalizeDecision(data: Loose): ProductDecision {
  const authorization = (data.authorization ?? {}) as Loose;
  const recommendation = data.recommendation as Loose | null | undefined;
  return {
    decisionId: str(data.decisionId),
    requirementKey: str(data.requirementKey),
    contractRevision: num(data.contractRevision),
    kind: str(data.kind),
    strategy: strOrNull(data.strategy),
    optionId: strOrNull(data.optionId),
    authorization:
      authorization.kind === "authorized"
        ? { kind: "authorized" }
        : authorization.kind === "approval_required"
          ? { kind: "approval_required", question: str(authorization.question), reason: str(authorization.reason) }
          : { kind: "refused" },
    rationale: recommendation ? strOrNull(recommendation.rationale) : null,
    strongestAlternativeId: recommendation ? strOrNull(recommendation.strongestAlternativeId) : null,
    coarsePlanSummary: str(data.coarsePlanSummary),
    at: num(data.at),
  };
}

export function normalizeIntent(data: Loose): ProductIntent {
  const target = (data.target ?? {}) as Loose;
  const terms = (data.terms ?? {}) as Loose;
  return {
    intentId: str(data.intentId),
    requirementKey: str(data.requirementKey),
    decisionId: str(data.decisionId),
    contractRevision: num(data.contractRevision),
    kind: data.kind === "external_effect" ? "external_effect" : "external_acquisition",
    target: {
      providerId: strOrNull(target.providerId),
      serviceId: strOrNull(target.serviceId),
      offeringId: strOrNull(target.offeringId),
      resourceClass: strOrNull(target.resourceClass),
    },
    terms: { priceUsd: typeof terms.priceUsd === "number" ? terms.priceUsd : null, priceProvenance: str(terms.priceProvenance, "unknown") },
    state: data.state as ProductIntent["state"],
    resultEvidenceId: strOrNull(data.resultEvidenceId),
    createdAt: num(data.createdAt),
    updatedAt: num(data.updatedAt),
  };
}

export function normalizeEvidence(row: { evidenceId: unknown; data: unknown }): ProductEvidence {
  const data = (row.data ?? {}) as Loose;
  return {
    evidenceId: String(row.evidenceId),
    label: str(data.label),
    text: str(data.text),
    origin: data.origin === "application_observation" ? "application_observation" : "model_note",
    observedAt: num(data.observedAt),
    runId: str(data.runId),
  };
}
