// Bounded application port between a dynamically assembled MAKE worker and
// the application. The model observes and acts only through these commands;
// application code owns truth, authorization, idempotency and completion.

import type { FindingInput } from "../objective/types";

export type WorkerCommand =
  | { type: "record_finding"; finding: FindingInput; basedOnEvidenceId?: string }
  | {
      type: "record_observation";
      source: "company_record" | "public_web";
      label: string;
      url?: string;
      recordRef?: string;
    }
  | { type: "submit_result"; result: WorkerResultInput }
  | { type: "request_completion" };

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
export type WorkerObservation = {
  assignment: string;
  responsibility: string;
  requiredSourceClasses: string[];
  minObservations: number;
  recordedFindings: WorkerObservationFinding[];
  unmetCompletionRequirements: string[];
};

export type WorkerPort = {
  read(): Promise<WorkerObservation>;
  act(command: WorkerCommand): Promise<string>;
};
