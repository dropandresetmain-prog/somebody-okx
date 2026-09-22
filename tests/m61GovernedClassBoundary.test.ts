/**
 * Milestone 2 / G — governed ResourceClass vocabulary at the model boundary.
 *
 * Authority split (owner ruling): the serial tool schema accepts ONLY the
 * canonical governed enum derived from the workforce catalog (structural
 * rejection of anything else, counted as a refused action — never a telemetry
 * bypass), while fulfillment authority stays with the adapter/authorized
 * offering declarations downstream. A model naming a governed class never
 * gains fulfillment authority from it.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { Usage, type Model } from "@openai/agents";
import { emptyWorkerTelemetry, runWorker } from "../lib/worker/runtime";
import type {
  WorkerCommand,
  WorkerObservation,
  WorkerPort,
} from "../lib/worker/port";
import { createWorkContract, createWorkerSpec } from "../lib/workforce";
import {
  GOVERNED_RESOURCE_CLASSES,
  RESOURCE_CLASSES,
} from "../lib/workforce/catalog";
import { affirmativelyClaimsOutOfScopePhrase } from "../lib/payment/m3FounderNarrativeProduct";

function toolCall(name: string, args: unknown, callId: string) {
  return {
    type: "function_call" as const,
    callId,
    name,
    arguments: JSON.stringify(args),
    status: "completed" as const,
  };
}

function contract(): ReturnType<typeof createWorkContract> {
  return createWorkContract({
    assignment: "Assess relaunch evidence adequacy",
    idempotencyScope: "obj:governed-class-boundary",
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
}

function baselineObs(extra: Partial<WorkerObservation>): WorkerObservation {
  return {
    assignment: "a",
    responsibility: "a",
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
    ...extra,
  };
}

function onceThenStop(toolModel: Model, stopText: string): Model {
  let step = 0;
  return {
    async getResponse(request) {
      step += 1;
      if (step === 1) return toolModel.getResponse(request);
      return {
        usage: new Usage(),
        output: [
          {
            type: "message" as const,
            role: "assistant" as const,
            content: [{ type: "output_text" as const, text: stopText }],
            status: "completed" as const,
          },
        ],
      };
    },
    async *getStreamedResponse() {
      throw new Error("unused");
    },
  };
}

// ── Structural vocabulary ─────────────────────────────────────────────────────

test("G: the canonical enum is derived from the catalog — identical vocabulary, no second list", () => {
  assert.deepEqual(
    [...GOVERNED_RESOURCE_CLASSES].sort(),
    RESOURCE_CLASSES.map((resource) => resource.class).sort(),
  );
  // The worker tool boundary surfaces the same governed vocabulary.
  for (const value of ["proprietary_data", "company_records"] as const) {
    assert.ok(GOVERNED_RESOURCE_CLASSES.includes(value));
  }
});

test("G: serial request_resource with a non-governed class is refused AT THE SCHEMA BOUNDARY and counted", async () => {
  const commands: WorkerCommand[] = [];
  const port: WorkerPort = {
    async read() {
      return baselineObs({});
    },
    async act(command) {
      commands.push(command);
      return JSON.stringify({ status: "accepted", result: "ok" });
    },
  };
  const telemetry = emptyWorkerTelemetry();
  const model = onceThenStop({
    async getResponse() {
      return {
        usage: new Usage(),
        output: [
          toolCall(
            "request_resource",
            {
              resourceClass: "magic_crystal_data",
              unansweredQuestion: "who are the buyers?",
              observedEvidenceIds: ["ev_rec"],
              whyInsufficient: "owned inputs do not say",
            },
            "call-g-1",
          ),
        ],
      };
    },
    async *getStreamedResponse() {
      throw new Error("unused");
    },
  } as unknown as Model, "Stopping after the boundary refusal.");
  // The counted structural refusal surfaces to the model; a run whose ONLY
  // action was refused with no state change is (correctly) a zero-progress
  // stop AFTER the refusal was counted.
  await assert.rejects(
    runWorker(port, contract(), {
      model,
      telemetry,
      serialManagerProtocol: true,
      maxTurns: 4,
    }),
    /zero_progress/,
  );
  assert.equal(
    commands.length,
    0,
    "a schema-invalid class must never reach the application port",
  );
  assert.equal(telemetry.failedActions, 1, "the boundary refusal is counted");
  assert.equal(telemetry.successfulActions, 0);
});

test("G: terse valid governed request passes the schema boundary unchanged", async () => {
  const commands: WorkerCommand[] = [];
  const port: WorkerPort = {
    async read() {
      return baselineObs({ yieldReason: "INPUT_BLOCKED" });
    },
    async act(command) {
      commands.push(command);
      return JSON.stringify({ status: "accepted", result: "ok" });
    },
  };
  const model = onceThenStop({
    async getResponse() {
      return {
        usage: new Usage(),
        output: [
          toolCall(
            "request_resource",
            {
              resourceClass: "proprietary_data",
              unansweredQuestion: "What do founders say?",
              observedEvidenceIds: ["ev_rec"],
              whyInsufficient: "Owned records do not answer.",
            },
            "call-g-2",
          ),
        ],
      };
    },
    async *getStreamedResponse() {
      throw new Error("unused");
    },
  } as unknown as Model, "Stopping after the accepted gap request.");
  const telemetry = emptyWorkerTelemetry();
  await runWorker(port, contract(), {
    model,
    telemetry,
    serialManagerProtocol: true,
    maxTurns: 4,
  });
  assert.equal(commands.length, 1, "governed literal reaches the port");
  assert.equal(commands[0]!.type, "request_resource");
  assert.equal((commands[0] as { resourceClass?: string }).resourceClass, "proprietary_data");
  assert.equal(telemetry.successfulActions, 1);
  assert.equal(telemetry.failedActions, 0);
});

test("G: owned governed classes remain schema-valid but keep the application-level refusal", async () => {
  // The enum is the GOVERNED vocabulary, not the external subset: naming an
  // owned class must pass the schema and be refused by validateMissingInput-
  // Proposal (already_owned) — the preserved refusal semantics, not a silent
  // schema rejection.
  const commands: WorkerCommand[] = [];
  const port: WorkerPort = {
    async read() {
      return baselineObs({});
    },
    async act(command) {
      commands.push(command);
      return JSON.stringify({
        status: "refused",
        detail: "resource class company_records is already company-controlled",
      });
    },
  };
  const telemetry = emptyWorkerTelemetry();
  const model = onceThenStop({
    async getResponse() {
      return {
        usage: new Usage(),
        output: [
          toolCall(
            "request_resource",
            {
              resourceClass: "company_records",
              unansweredQuestion: "what did we record?",
              observedEvidenceIds: ["ev_rec"],
              whyInsufficient: "none",
            },
            "call-g-3",
          ),
        ],
      };
    },
    async *getStreamedResponse() {
      throw new Error("unused");
    },
  } as unknown as Model, "Stopping after the validator refusal.");
  // Application-level refusal (already_owned) is counted; no state change →
  // zero-progress stop, with the command having reached the port.
  await assert.rejects(
    runWorker(port, contract(), {
      model,
      telemetry,
      serialManagerProtocol: true,
      maxTurns: 4,
    }),
    /zero_progress/,
  );
  assert.equal(commands.length, 1, "owned class reaches the application validator");
  assert.equal((commands[0] as { resourceClass?: string }).resourceClass, "company_records");
});

// ── Descriptive prose is never acceptance authority; negations never reject ───

test("G: negation-aware scope detection separates disclaimers from claims", () => {
  // Disclaimers (negated within their own clause): never an out-of-scope claim.
  assert.equal(
    affirmativelyClaimsOutOfScopePhrase(
      "qualitative founder messaging research; do not infer causal uplift",
    ),
    null,
  );
  assert.equal(
    affirmativelyClaimsOutOfScopePhrase(
      "founder launch language study, without customer analytics",
    ),
    null,
  );
  assert.equal(
    affirmativelyClaimsOutOfScopePhrase("no live twitter data; founder perceptions only"),
    null,
  );
  // Affirmative claims still detect the forbidden scope.
  assert.equal(
    affirmativelyClaimsOutOfScopePhrase(
      "measure conversion uplift and causal attribution from a/b tests",
    ),
    "conversion uplift",
  );
  assert.equal(
    affirmativelyClaimsOutOfScopePhrase("provide newsliquid coverage for the launch"),
    "newsliquid",
  );
});
