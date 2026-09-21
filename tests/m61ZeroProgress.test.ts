// M6.1 CP-W2 — zero-progress invariant + turn/duplicate bounds remain fixed.
import test from "node:test";
import assert from "node:assert/strict";
import { Usage, type Model } from "@openai/agents";
import {
  MAX_DUPLICATE_FAILURES,
  MAX_TURNS,
  assessZeroProgress,
  contractRequiresToolMediatedProgress,
  emptyWorkerTelemetry,
  runWorker,
} from "../lib/worker/runtime";
import type { WorkerCommand, WorkerObservation, WorkerPort } from "../lib/worker/port";
import type { WorkContract } from "../lib/objective/types";
import { createWorkContract, createWorkerSpec } from "../lib/workforce";

const ROLE_SOURCE_PROOFS = [
  { sourceClass: "company_record" as const, minDistinctSources: 1 },
];

function contract(): WorkContract {
  return createWorkContract({
    assignment: "Lookup governed company records for messaging feedback.",
    idempotencyScope: "obj:zero-progress",
    worker: createWorkerSpec([
      "company_records_lookup",
      "document_drafting",
      "growth_launch_operations",
    ]),
    sourceProofs: ROLE_SOURCE_PROOFS,
  });
}

function baselineObs(overrides: Partial<WorkerObservation> = {}): WorkerObservation {
  return {
    assignment: contract().assignment,
    responsibility: contract().assignment,
    requiredSourceClasses: ["company_record"],
    minObservations: 1,
    recordedFindings: [],
    unmetCompletionRequirements: [
      "company_record: found 0 distinct source(s), required 1",
      "Structured result missing a summary",
    ],
    yieldReason: null,
    ...overrides,
  };
}

function toolCall(name: string, args: unknown, callId: string) {
  return {
    type: "function_call" as const,
    callId,
    name,
    arguments: JSON.stringify(args),
    status: "completed" as const,
  };
}

function message(text: string) {
  return {
    type: "message" as const,
    role: "assistant" as const,
    content: [{ type: "output_text" as const, text }],
    status: "completed" as const,
  };
}

test("turn and duplicate bounds remain 8 and 2", () => {
  assert.equal(MAX_TURNS, 8);
  assert.equal(MAX_DUPLICATE_FAILURES, 2);
});

test("observation-required contracts require tool-mediated progress", () => {
  assert.equal(contractRequiresToolMediatedProgress(contract()), true);
});

test("assessZeroProgress: prose-only / no tools → zero_progress", () => {
  const reason = assessZeroProgress({
    contract: contract(),
    baseline: baselineObs(),
    after: baselineObs(),
    toolCallCount: 0,
    successfulActions: 0,
  });
  assert.equal(reason, "EXECUTION_FAILED: zero_progress");
});

test("assessZeroProgress: yieldReason is not zero-progress", () => {
  const reason = assessZeroProgress({
    contract: contract(),
    baseline: baselineObs(),
    after: baselineObs({ yieldReason: "INPUT_BLOCKED" }),
    toolCallCount: 1,
    successfulActions: 1,
  });
  assert.equal(reason, null);
});

test("assessZeroProgress: new application observation is not zero-progress", () => {
  const reason = assessZeroProgress({
    contract: contract(),
    baseline: baselineObs(),
    after: baselineObs({
      recordedFindings: [
        {
          id: "ev_1",
          sourceClass: "company_record",
          label: "availability",
          origin: "application_observation",
          text: "availability: NOT_AVAILABLE",
        },
      ],
    }),
    toolCallCount: 1,
    successfulActions: 1,
  });
  assert.equal(reason, null);
});

test("mock prose final answer before required observation → EXECUTION_FAILED: zero_progress", async () => {
  const c = contract();
  const port: WorkerPort = {
    async read() {
      return baselineObs();
    },
    async act() {
      throw new Error("tools must not be called in this test");
    },
  };
  const model: Model = {
    async getResponse() {
      return {
        usage: new Usage(),
        output: [message("I reviewed the messaging and it looks fine.")],
      };
    },
    async *getStreamedResponse() {
      throw new Error("unused");
    },
  };
  const telemetry = emptyWorkerTelemetry();
  await assert.rejects(
    () => runWorker(port, c, { model, telemetry }),
    /EXECUTION_FAILED: zero_progress/,
  );
  assert.equal(telemetry.toolCallCount, 0);
  assert.equal(telemetry.zeroProgressReason, "EXECUTION_FAILED: zero_progress");
  assert.equal(telemetry.finalOutputReceived, true);
});

test("valid tool progress (governed check → observation) is not zero-progress", async () => {
  const c = contract();
  let findings: WorkerObservation["recordedFindings"] = [];
  const port: WorkerPort = {
    async read() {
      return baselineObs({
        recordedFindings: findings,
        unmetCompletionRequirements:
          findings.length > 0
            ? ["Structured result missing a summary"]
            : baselineObs().unmetCompletionRequirements,
      });
    },
    async act(command: WorkerCommand) {
      if (command.type === "check_input_availability") {
        findings = [
          {
            id: "ev_na",
            sourceClass: "company_record",
            label: "input_check:evidence_sufficiency",
            origin: "application_observation",
            text: "availability: NOT_AVAILABLE. no governed feedback inventory",
          },
        ];
        return JSON.stringify({
          status: "NOT_AVAILABLE",
          observation: await port.read(),
        });
      }
      return "ok";
    },
  };

  let step = 0;
  const model: Model = {
    async getResponse() {
      step += 1;
      if (step === 1) {
        return {
          usage: new Usage(),
          output: [
            toolCall(
              "check_input_availability",
              { inputCheckId: "evidence_sufficiency" },
              "call-1",
            ),
          ],
        };
      }
      // After tool progress, emit text. toolUseBehavior keeps running until
      // unmet is empty / yield — but our zero-progress check must not fire.
      return {
        usage: new Usage(),
        output: [message("Observed NOT_AVAILABLE; stopping.")],
      };
    },
    async *getStreamedResponse() {
      throw new Error("unused");
    },
  };

  const telemetry = emptyWorkerTelemetry();
  // May throw Max turns if toolUseBehavior never finalizes — that is fine as
  // long as it is NOT zero_progress after a real observation.
  try {
    await runWorker(port, c, { model, telemetry, maxTurns: 3 });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    assert.doesNotMatch(message, /zero_progress/);
  }
  assert.ok(telemetry.toolCallCount >= 1);
  assert.ok(findings.length >= 1);
  assert.equal(findings[0]?.origin, "application_observation");
});

test("INPUT_BLOCKED yield path is not classified as zero-progress", async () => {
  const c = contract();
  let yieldReason: string | null = null;
  const findings: WorkerObservation["recordedFindings"] = [
    {
      id: "ev_na",
      sourceClass: "company_record",
      label: "input_check:evidence_sufficiency",
      origin: "application_observation",
      text: "availability: NOT_AVAILABLE",
    },
  ];
  const port: WorkerPort = {
    async read() {
      return baselineObs({
        recordedFindings: findings,
        yieldReason,
        unmetCompletionRequirements: ["company_record: found 0"],
      });
    },
    async act(command: WorkerCommand) {
      if (command.type === "request_resource") {
        yieldReason = "INPUT_BLOCKED";
        return JSON.stringify({ status: "INPUT_BLOCKED" });
      }
      return "ok";
    },
  };

  let step = 0;
  const model: Model = {
    async getResponse() {
      step += 1;
      if (step === 1) {
        return {
          usage: new Usage(),
          output: [
            toolCall(
              "request_resource",
              {
                resourceClass: "customer_feedback",
                purpose: "need feedback",
                reasonOwnedInsufficient: "none on hand",
                supportingEvidenceIds: ["ev_na"],
              },
              "call-1",
            ),
          ],
        };
      }
      return { usage: new Usage(), output: [message("yielded")] };
    },
    async *getStreamedResponse() {
      throw new Error("unused");
    },
  };

  const telemetry = emptyWorkerTelemetry();
  await runWorker(port, c, { model, telemetry, maxTurns: 4 });
  assert.equal(yieldReason, "INPUT_BLOCKED");
  assert.equal(telemetry.zeroProgressReason, null);
  assert.ok(telemetry.toolCallCount >= 1);
});

// ── Milestone 1 / F3: refused DELIVERED leaves the same run free to correct ─────
test("serial: refused DELIVERED does not end the run; control envelope carries unmet obligations and turn budget", async () => {
  const serialContract = contract();
  let submits = 0;
  const commands: string[] = [];
  const port: WorkerPort = {
    async read() {
      return baselineObs({
        unmetCompletionRequirements:
          submits < 2 ? ["company_artifact: no version change by this run"] : [],
      });
    },
    async act(command: WorkerCommand) {
      commands.push(command.type);
      if (command.type === "submit_result") {
        submits += 1;
        return submits === 1
          ? JSON.stringify({
              status: "refused",
              terminalAccepted: false,
              unmetObligations: ["company_artifact: no version change by this run"],
            })
          : JSON.stringify({ status: "accepted", terminalAccepted: true });
      }
      return JSON.stringify({ status: "accepted", result: "ok" });
    },
  };
  const deliver = {
    summary: "s",
    fit: "f",
    risks: [],
    unknowns: [],
    recommendedNextAction: "n",
    terminal: "DELIVERED",
  };
  const steps = [
    toolCall("submit_result", deliver, "c1"),
    toolCall("update_company_artifact", { content: "v2", changeNote: "n" }, "c2"),
    toolCall("submit_result", deliver, "c3"),
  ];
  let step = 0;
  const seenInputs: string[] = [];
  const model: Model = {
    async getResponse(request) {
      seenInputs.push(JSON.stringify(request.input));
      return { usage: new Usage(), output: [steps[step++]] };
    },
    async *getStreamedResponse() {
      throw new Error("unused");
    },
  };
  const telemetry = emptyWorkerTelemetry();
  await runWorker(port, serialContract, {
    model,
    telemetry,
    serialManagerProtocol: true,
  });
  assert.deepEqual(commands, ["submit_result", "update_company_artifact", "submit_result"]);
  assert.equal(telemetry.failedActions, 1, "refused DELIVERED counts as a typed failed action");
  assert.equal(telemetry.zeroProgressReason, null);
  // The model observes deterministic guidance, not prose to interpret.
  const afterRefusal = seenInputs[1];
  assert.match(afterRefusal, /turnsRemaining/);
  assert.match(afterRefusal, /company_artifact: no version change by this run/);
  assert.match(afterRefusal, /maxTurns/);
});
