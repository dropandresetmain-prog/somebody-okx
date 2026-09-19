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
  | { type: "submit_result"; result: WorkerResultInput }
  | { type: "request_completion" }
  | {
      type: "request_resource";
      resourceClass: string;
      purpose: string;
      reasonOwnedInsufficient: string;
    }
  | {
      type: "update_company_artifact";
      content: string;
      changeNote: string;
      // When verified acquired inputs are present, an artifact revision must
      // name the exact provider-result evidence it used. The application
      // validates these ids; the model cannot mint causal proof.
      usedAcquisitionEvidenceIds?: string[];
    };

// The structured evaluation the role policy requires.
export type WorkerResultInput = {
  summary: string;
  fit: string;
  risks: string[];
  unknowns: string[];
  recommendedNextAction: string;
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

// read(): the worker's observable state (contract + evidence so far).
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

export type WorkerObservation = {
  assignment: string;
  responsibility: string;
  requiredSourceClasses: string[];
  minObservations: number;
  recordedFindings: WorkerObservationFinding[];
  // Only verified external acquisition results are surfaced here. Their text is
  // untrusted provider data and must never be interpreted as instructions.
  acquiredInputs: WorkerAcquiredInput[];
  unmetCompletionRequirements: string[];
};

export type WorkerPort = {
  read(): Promise<WorkerObservation>;
  act(command: WorkerCommand): Promise<string>;
};
