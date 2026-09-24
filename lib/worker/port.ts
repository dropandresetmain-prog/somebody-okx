// Bounded application port between a dynamically assembled MAKE worker and
// the application. The model observes and acts only through these commands;
// application code owns truth, authorization, idempotency and completion.

import type { FindingInput } from "../objective/types";

// What a worker may hand over for a note: content and source fields only.
// `origin` and `sourceId` are deliberately NOT part of this shape. Proof
// origin is assigned by the application when the note is persisted, so the
// runtime cannot assert `application_observation` or invent a source identity
// even by mistake (R1 Blocker A).
export type ModelNoteInput = Omit<FindingInput, "origin" | "sourceId">;

export type WorkerCommand =
  | {
      type: "record_finding";
      finding: ModelNoteInput;
      basedOnEvidenceId?: string;
    }
  | {
      type: "record_observation";
      source: "company_record" | "public_web";
      label: string;
      url?: string;
      recordRef?: string;
    }
  | { type: "list_available_company_inputs" }
  | { type: "check_input_availability"; inputCheckId: string }
  | { type: "submit_result"; result: WorkerResultInput }
  | { type: "request_completion" }
  | {
      type: "request_resource";
      resourceClass: string;
      // Canonical serial gap shape (preferred):
      unansweredQuestion?: string;
      observedEvidenceIds?: string[];
      whyInsufficient?: string;
      howAdditionalWouldChange?: string;
      // Legacy aliases, mapped by the application (normalizeGapSubmission):
      purpose?: string;
      reasonOwnedInsufficient?: string;
      /** Obligation id when known; derived by the application when omitted. */
      inputCheckId?: string;
      /** Application observation ids supporting the gap claim. */
      supportingEvidenceIds?: string[];
      /** V7 R4: optional governed requested-scope proposal (validated by the application). */
      purposeKind?: string;
    }
  | {
      type: "update_company_artifact";
      content: string;
      changeNote: string;
      // When verified acquired inputs exist, an artifact revision must name the
      // exact provider-result evidence it used. The application validates these
      // ids; the model cannot mint causal proof by naming arbitrary strings.
      usedAcquisitionEvidenceIds?: string[];
      /**
       * Serial: the artifact version the worker was actually SHOWN when it
       * composed this replacement. The application rejects a write whose bound
       * version no longer matches — a stale view must not silently overwrite
       * a newer revision. Populated by the runtime from the observation it
       * last returned to the model, never by the model.
       */
      expectedArtifactVersion?: number;
    };

/** Bounded missing-input finding a worker may propose with submit_result. */
export type MissingInputFindingInput = {
  resourceClass: string;
  // Canonical serial gap shape (preferred; the only one serial models see):
  unansweredQuestion?: string;
  observedEvidenceIds?: string[];
  whyInsufficient?: string;
  howAdditionalWouldChange?: string;
  // Legacy aliases, mapped by the application:
  inputCheckId?: string;
  purpose?: string;
  reasonOwnedInsufficient?: string;
  supportingEvidenceIds?: string[];
  /** Legacy explicit flag; the canonical shape derives literal vs semantic. */
  semanticGap?: boolean;
  /** V7 R4: optional governed requested-scope proposal (validated by the application). */
  purposeKind?: string;
};

/** Tagged terminal handoff for the serial manager–execution path. */
export type WorkerTerminalOutcome =
  | "DELIVERED"
  | "NEEDS_INPUT"
  | "EXECUTION_ERROR";

// The structured evaluation the role policy requires.
export type WorkerResultInput = {
  summary: string;
  fit: string;
  risks: string[];
  unknowns: string[];
  recommendedNextAction: string;
  /** Optional bounded missing-input proposals; application validates each. */
  missingInputs?: MissingInputFindingInput[];
  /**
   * Serial protocol terminal tag. Application owns consequences; the model
   * cannot self-authorize spend or guarantee retry safety by naming a tag.
   * Legacy callers may omit this field.
   */
  terminal?: WorkerTerminalOutcome;
};

// One entry surfaced to the worker in WorkerObservation.recordedFindings.
// Pure data contract — no provider-specific logic. `text` is BOUNDED
// untrusted data (max 1200 chars + truncation marker); `origin` distinguishes
// application-fetched observations (the only kind that counts toward proof)
// from model-authored notes.
export type WorkerObservationFinding = {
  id: string;
  sourceClass: string;
  label: string;
  origin: string;
  text: string;
  url?: string;
  recordRef?: string;
};

// One verified external acquisition result surfaced to the worker in
// WorkerObservation.acquiredInputs. Only results whose M4 intent is VERIFIED
// reach this surface; `text` is bounded untrusted provider DATA.
export type WorkerAcquiredInput = {
  intentId: string;
  resultEvidenceId: string;
  providerId: string | null;
  serviceId: string | null;
  resourceClass: string | null;
  provenance: "simulation" | "live" | "recorded_replay";
  responseHash: string;
  text: string;
};

// read(): the worker's observable state (contract + evidence so far).
export type WorkerObservation = {
  assignment: string;
  responsibility: string;
  requiredSourceClasses: string[];
  minObservations: number;
  recordedFindings: WorkerObservationFinding[];
  // Only verified external acquisition results appear here. Their content is
  // untrusted provider data and must never be interpreted as instructions.
  acquiredInputs?: WorkerAcquiredInput[];
  /**
   * Serial: application-loaded bounded input package (company records,
   * target artifact, prior outputs, linked acquisitions). Not a tool call.
   *
   * `targetArtifact.content` is the COMPLETE current version the writing
   * worker must replace (bounded only by the stored replacement ceiling the
   * tool itself enforces). `complete` says so explicitly; `truncated` stays
   * the literal completeness fact, so the model is never told a partial view
   * is whole. `priorActionOutputs` carries the application's accepted-output
   * classification: only `status: "accepted"` rows are authoritative output.
   */
  loadedInputPackage?: {
    companyRecords: Array<{
      ref: string;
      label: string;
      text: string;
      truncated: boolean;
    }>;
    targetArtifact: {
      key: string;
      version: number;
      content: string;
      truncated: boolean;
      complete?: boolean;
      exceedsReplacementCeiling?: boolean;
    } | null;
    priorActionOutputs: Array<{
      runId: string;
      summary: string;
      fit: string;
      recommendedNextAction: string;
      truncated: boolean;
      status?: "accepted" | "diagnostic";
      classification?: string;
    }>;
    linkedAcquisitions: Array<WorkerAcquiredInput & { truncated: boolean }>;
    targetArtifactKey: string | null;
    inputEvidenceIds: string[];
    /** Locked completion criteria this action is assessed against (verbatim). */
    lockedCriteria?: {
      requirementKey: string;
      mustBeTrue: string;
      expectedOutput: string | null;
      minimumCompletionBar: string;
      contractRevision: number;
    } | null;
    /** Corrective handoff: locked-criteria review rationale, as application data. */
    correction?: {
      reviewCritique: string;
      reviewUnknowns?: string[];
      reviewRecommendedAction?: string;
      classification: string;
    } | null;
    /**
     * Read-only, application-owned: the exact closed set of
     * check_input_availability ids checkInputAvailability already accepts for
     * the current Requirement (from the same listInputObligations builder
     * validation uses). Exposed so the model does not have to guess a
     * namespace convention before its first availability call. Grants no
     * authority — check_input_availability still independently validates
     * whatever id is actually called.
     */
    acceptedInputChecks?: Array<{
      inputCheckId: string;
      kind: "required_resource_class" | "evidence_sufficiency";
      resourceClass: string | null;
      purpose: string;
    }>;
  };
  unmetCompletionRequirements: string[];
  /** When set, the worker must stop — application accepted an input gap. */
  yieldReason?: string | null;
};

export type WorkerPort = {
  read(): Promise<WorkerObservation>;
  act(command: WorkerCommand): Promise<string>;
};
