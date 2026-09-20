// M6.1 CP-A1.2/A1.3 — governed input availability + worker budget bounds.
import test from "node:test";
import assert from "node:assert/strict";
import {
  checkInputAvailability,
  listCompanyInputCatalog,
  lookupCompanyRecord,
  isNotAvailableObservation,
  isInvalidRequestObservation,
} from "../lib/objective/inputAvailability";
import {
  listInputObligations,
  validateMissingInputProposal,
} from "../lib/objective/inputDiagnosis";
import { CURRENT_RESOURCE_INVENTORY } from "../lib/objective/policy";
import type { EvidenceRecord, WorkContract } from "../lib/objective/types";
import {
  MAX_DUPLICATE_FAILURES,
  MAX_TURNS,
  runWorker,
  toolNamesForContract,
} from "../lib/worker/runtime";
import type { Model } from "@openai/agents";
import { Usage } from "@openai/agents";
import type { WorkerCommand, WorkerPort } from "../lib/worker/port";

const at = 1_700_000_000_000;

test("catalog lists governed company inputs only", () => {
  const catalog = listCompanyInputCatalog();
  assert.ok(catalog.length >= 1);
  assert.ok(catalog.every((e) => e.recordRef && e.label));
  assert.equal(
    lookupCompanyRecord("customer_feedback").status,
    "INVALID_REQUEST",
  );
  assert.equal(
    lookupCompanyRecord(catalog[0]!.recordRef).status,
    "AVAILABLE",
  );
});

test("A1 positive: NOT_AVAILABLE check supports validated gap", () => {
  const obligations = listInputObligations({
    requiredResourceClasses: [],
    sourceProofs: [{ sourceClass: "company_record", minDistinctSources: 1 }],
    mustBeTrue: "metrics on record",
    expectedOutput: "baseline metrics",
  });
  const check = checkInputAvailability({
    inputCheckId: "evidence_sufficiency",
    obligations,
    sourceProofs: [{ sourceClass: "company_record", minDistinctSources: 1 }],
    controlledResourceClasses: [...CURRENT_RESOURCE_INVENTORY],
    evidence: [],
    runId: "run_a1",
  });
  assert.equal(check.status, "NOT_AVAILABLE");
  assert.ok(
    isNotAvailableObservation({
      text: check.evidenceText,
      label: check.label,
    }),
  );

  const evidence: EvidenceRecord = {
    id: "ev_na",
    sourceClass: "company_record",
    label: check.label,
    text: check.evidenceText,
    origin: "application_observation",
    sourceId: "record:input_check/evidence_sufficiency/NOT_AVAILABLE",
    recordRef: "input_check/evidence_sufficiency/NOT_AVAILABLE",
    observedAt: at,
    recordedBy: "app",
    runId: "run_a1",
  };
  const validated = validateMissingInputProposal(
    {
      inputCheckId: "evidence_sufficiency",
      resourceClass: "proprietary_data",
      purpose: "baseline launch messaging performance metrics",
      reasonOwnedInsufficient: "governed coverage check returned NOT_AVAILABLE",
      supportingEvidenceIds: ["ev_na"],
    },
    {
      objectiveKey: "obj_a1",
      requirementKey: "req_01",
      contractRevision: 1,
      runId: "run_a1",
      workItemId: "wi_1",
      requiredResourceClasses: [],
      mustBeTrue: "metrics on record",
      expectedOutput: "baseline metrics",
      sourceProofs: [{ sourceClass: "company_record", minDistinctSources: 1 }],
      requiredSourceClasses: ["company_record"],
      controlledResourceClasses: [...CURRENT_RESOURCE_INVENTORY],
      evidence: [evidence],
      existingNeeds: [],
      at,
      needId: "need_a1",
    },
  );
  assert.equal(validated.ok, true);
});

test("invalid lookup is INVALID_REQUEST and cannot support a gap", () => {
  const looked = lookupCompanyRecord("customer_feedback");
  assert.equal(looked.status, "INVALID_REQUEST");
  const evidence: EvidenceRecord = {
    id: "ev_bad",
    sourceClass: "company_record",
    label: "input_check:INVALID_REQUEST",
    text: `availability: INVALID_REQUEST. ${looked.status === "INVALID_REQUEST" ? looked.detail : ""}`,
    origin: "application_observation",
    sourceId: "record:input_check/invalid/customer_feedback",
    recordRef: "input_check/invalid/customer_feedback",
    observedAt: at,
    recordedBy: "app",
    runId: "run_a1",
  };
  assert.ok(isInvalidRequestObservation(evidence));
  const validated = validateMissingInputProposal(
    {
      inputCheckId: "evidence_sufficiency",
      resourceClass: "proprietary_data",
      purpose: "metrics",
      reasonOwnedInsufficient: "lookup failed",
      supportingEvidenceIds: ["ev_bad"],
    },
    {
      objectiveKey: "obj_a1",
      requirementKey: "req_01",
      contractRevision: 1,
      runId: "run_a1",
      workItemId: "wi_1",
      requiredResourceClasses: [],
      mustBeTrue: "metrics",
      expectedOutput: null,
      sourceProofs: [{ sourceClass: "company_record", minDistinctSources: 1 }],
      requiredSourceClasses: ["company_record"],
      controlledResourceClasses: [...CURRENT_RESOURCE_INVENTORY],
      evidence: [evidence],
      existingNeeds: [],
      at,
      needId: "need_bad",
    },
  );
  assert.equal(validated.ok, false);
  if (!validated.ok) {
    assert.equal(validated.refusalCode, "invalid_reference_evidence");
  }
});

test("worker turn default is 8 and duplicate failure cap is 2", () => {
  assert.equal(MAX_TURNS, 8);
  assert.equal(MAX_DUPLICATE_FAILURES, 2);
});

function contract(): WorkContract {
  return {
    assignment: "Collect baseline metrics from owned sources or report gaps.",
    idempotencyScope: "test:a1",
    workerKey: "worker_test",
    capabilityKeys: ["company_records_lookup"],
    allowedToolPermissions: [
      "read_company_record",
      "record_finding",
      "request_resource",
    ],
    requiredSourceClasses: ["company_record"],
    minObservations: 1,
    sourceProofs: [{ sourceClass: "company_record", minDistinctSources: 1 }],
    resultRequirements: {
      summary: true,
      fit: true,
      risks: true,
      unknowns: true,
      recommendedNextAction: true,
    },
    requiredVerifiedEffectKeys: [],
    approvalVersion: null,
  };
}

test("read_company_record envelope also materializes list + check companions at runtime", () => {
  const surface = toolNamesForContract(contract());
  assert.ok(surface.materialized.includes("read_company_record"));
  // Companions are runtime-added; toolNamesForContract stays permission-true.
  assert.ok(!surface.materialized.includes("list_available_company_inputs"));
});

test("duplicate identical INVALID_REQUEST reads trip no-progress before turn 8", async () => {
  const calls: string[] = [];
  let yieldReason: string | null = null;
  const port: WorkerPort = {
    async read() {
      return {
        assignment: contract().assignment,
        responsibility: contract().assignment,
        requiredSourceClasses: ["company_record"],
        minObservations: 1,
        recordedFindings: [],
        unmetCompletionRequirements: ["company_record: found 0"],
        yieldReason,
      };
    },
    async act(command: WorkerCommand) {
      calls.push(command.type);
      if (command.type === "record_observation") {
        return `INVALID_REQUEST (evidence ev_x): Unknown company record ref "${command.recordRef}"`;
      }
      return "ok";
    },
  };

  let step = 0;
  const model: Model = {
    async getResponse() {
      step += 1;
      // Keep asking the same invalid read — no-progress should stop the run.
      return {
        usage: new Usage(),
        output: [
          {
            type: "function_call",
            callId: `call-${step}`,
            name: "read_company_record",
            arguments: JSON.stringify({ recordRef: "customer_feedback" }),
            status: "completed" as const,
          },
        ],
      };
    },
    async *getStreamedResponse() {
      throw new Error("unused");
    },
  };

  await assert.rejects(
    () => runWorker(port, contract(), { model, maxTurns: MAX_TURNS }),
    /no-progress|EXECUTION_FAILED|Max turns/i,
  );
  // First failure counted, second identical failure stops via no-progress.
  assert.ok(calls.length <= MAX_DUPLICATE_FAILURES + 1, `calls=${calls.length}`);
  assert.equal(yieldReason, null);
});

test("unproductive agent cannot exceed maxTurns", async () => {
  let turns = 0;
  const port: WorkerPort = {
    async read() {
      return {
        assignment: contract().assignment,
        responsibility: contract().assignment,
        requiredSourceClasses: ["company_record"],
        minObservations: 1,
        recordedFindings: [],
        unmetCompletionRequirements: ["company_record: found 0"],
        yieldReason: null,
      };
    },
    async act(command: WorkerCommand) {
      // Vary args so no-progress does not fire; turn cap must.
      if (command.type === "list_available_company_inputs") {
        return JSON.stringify({ inputs: [{ recordRef: `r${turns}`, label: "x" }] });
      }
      return `ok-${turns}`;
    },
  };

  const model: Model = {
    async getResponse() {
      turns += 1;
      return {
        usage: new Usage(),
        output: [
          {
            type: "function_call",
            callId: `call-${turns}`,
            name: "list_available_company_inputs",
            arguments: "{}",
            status: "completed" as const,
          },
        ],
      };
    },
    async *getStreamedResponse() {
      throw new Error("unused");
    },
  };

  await assert.rejects(
    () => runWorker(port, contract(), { model, maxTurns: MAX_TURNS }),
    /Max turns|max turns|maximum number of turns|8/i,
  );
  assert.ok(turns <= MAX_TURNS + 1, `turns=${turns}`);
  assert.ok(turns >= MAX_TURNS, `expected near ${MAX_TURNS}, got ${turns}`);
});
