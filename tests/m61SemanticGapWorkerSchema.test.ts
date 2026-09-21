// M6.1 owner-review: semantic gap reachable through live serial worker schema.
import test from "node:test";
import assert from "node:assert/strict";
import { Usage, type Model } from "@openai/agents";
import { emptyWorkerTelemetry, runWorker } from "../lib/worker/runtime";
import type { WorkerCommand, WorkerObservation, WorkerPort } from "../lib/worker/port";
import { createWorkContract, createWorkerSpec } from "../lib/workforce";

function toolCall(name: string, args: unknown, callId: string) {
  return {
    type: "function_call" as const,
    callId,
    name,
    arguments: JSON.stringify(args),
    status: "completed" as const,
  };
}

test("serial worker schema accepts semanticGap NEEDS_INPUT without NOT_AVAILABLE", async () => {
  const contract = createWorkContract({
    assignment: "Assess relaunch evidence adequacy",
    idempotencyScope: "obj:semantic-gap-schema",
    worker: createWorkerSpec([
      "company_records_lookup",
      "public_information_research",
      "growth_launch_operations",
    ]),
    sourceProofs: [
      { sourceClass: "company_record", minDistinctSources: 1 },
      { sourceClass: "public_web", minDistinctSources: 1 },
    ],
  });

  let submitted: WorkerCommand | null = null;
  const port: WorkerPort = {
    async read(): Promise<WorkerObservation> {
      return {
        assignment: contract.assignment,
        responsibility: contract.assignment,
        requiredSourceClasses: ["company_record", "public_web"],
        minObservations: 2,
        recordedFindings: [
          {
            id: "ev_rec",
            sourceClass: "company_record",
            label: "owned",
            origin: "application_observation",
            text: "owned launch context inspected",
          },
          {
            id: "ev_web",
            sourceClass: "public_web",
            label: "web",
            origin: "application_observation",
            text: "public page inspected",
          },
        ],
        unmetCompletionRequirements: [],
        yieldReason: null,
        loadedInputPackage: {
          companyRecords: [],
          targetArtifact: null,
          priorActionOutputs: [],
          linkedAcquisitions: [],
          targetArtifactKey: null,
          inputEvidenceIds: [],
        },
      };
    },
    async act(command: WorkerCommand) {
      submitted = command;
      if (command.type === "submit_result") {
        return JSON.stringify({
          status: "accepted",
          terminalAccepted: true,
          result: { status: "accepted", terminalAccepted: true },
        });
      }
      return JSON.stringify({ status: "accepted", result: "ok" });
    },
  };

  const model: Model = {
    async getResponse() {
      return {
        usage: new Usage(),
        output: [
          toolCall(
            "submit_result",
            {
              summary: "Owned sources inspected but inadequate for audience language",
              fit: "incomplete",
              risks: [],
              unknowns: ["audience language"],
              recommendedNextAction: "acquire proprietary audience data",
              terminal: "NEEDS_INPUT",
              missingInputs: [
                {
                  inputCheckId: "evidence_sufficiency",
                  resourceClass: "proprietary_data",
                  purpose: "audience language for relaunch",
                  reasonOwnedInsufficient:
                    "owned company_record and public_web do not answer the audience question",
                  supportingEvidenceIds: ["ev_rec", "ev_web"],
                  semanticGap: true,
                  unansweredQuestion:
                    "What messaging resonates with early adopters?",
                  observedEvidenceIds: ["ev_rec", "ev_web"],
                  whyInsufficient:
                    "Neither source contains audience-language evidence",
                  howAdditionalWouldChange:
                    "Verified proprietary audience language would ground the relaunch wording",
                },
              ],
            },
            "call-sem-1",
          ),
        ],
      };
    },
    async *getStreamedResponse() {
      throw new Error("unused");
    },
  };

  const telemetry = emptyWorkerTelemetry();
  await runWorker(port, contract, {
    model,
    telemetry,
    serialManagerProtocol: true,
    maxTurns: 3,
  });

  assert.ok(submitted);
  assert.equal(submitted!.type, "submit_result");
  if (submitted!.type !== "submit_result") return;
  const gap = submitted!.result.missingInputs?.[0];
  assert.equal(gap?.semanticGap, true);
  assert.equal(
    gap?.unansweredQuestion,
    "What messaging resonates with early adopters?",
  );
  assert.deepEqual(gap?.observedEvidenceIds, ["ev_rec", "ev_web"]);
  assert.ok(gap?.howAdditionalWouldChange?.includes("audience"));
  assert.equal(submitted!.result.terminal, "NEEDS_INPUT");
});
