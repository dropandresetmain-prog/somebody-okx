import test from "node:test";
import assert from "node:assert/strict";
import { Usage, type Model } from "@openai/agents";
import {
  createWorkContract,
  createWorkerSpec,
  evaluateCompletion,
  validatePlannerProposal,
  evaluateSourcing,
} from "../lib/workforce";
import { providerConfiguration, selectWorkerModel } from "../lib/worker/modelSelection";
import {
  runWorker,
  toolNamesForContract,
} from "../lib/worker/runtime";
import type { WorkerObservation, WorkerPort } from "../lib/worker/port";
import type {
  ActivityResult,
  EvidenceRecord,
  FindingInput,
  WorkContract,
} from "../lib/workforce";
import { COMPANY_RECORDS } from "../lib/objective/policy";

const fetchImpl: typeof fetch = (async (url: string | URL | Request) =>
  new Response(
    `Acme Corporation — small business services. Partner programme: https://acme.test/partners. Free tier for SMEs.`,
    { status: 200 },
  )) as unknown as typeof fetch;

const now = 1800000000000;

function contract(
  overrides: Partial<Parameters<typeof createWorkContract>[0]> = {},
): WorkContract {
  return createWorkContract({
    assignment: "Evaluate Acme as a partnership target.",
    idempotencyScope: "obj:wi-run",
    worker: createWorkerSpec([
      "company_records_lookup",
      "public_information_research",
    ]),
    requiredSourceClasses: ["company_record", "public_web"],
    minObservations: 3,
    ...overrides,
  });
}

// In-memory application state backing the port: the test twin of what Convex
// persists durably.
type TestState = {
  evidence: EvidenceRecord[];
  result: ActivityResult | null;
  completed: boolean;
  completionError: string | null;
};

function makePort(contract: WorkContract, state: TestState): WorkerPort & {
  state: TestState;
} {
  function observation(): WorkerObservation {
    const check = evaluateCompletion({
      contract,
      evidence: state.evidence,
      result: state.result,
    });
    return {
      assignment: contract.assignment,
      responsibility: "Research analyst responsibility.",
      requiredSourceClasses: [...contract.requiredSourceClasses],
      minObservations: contract.minObservations,
      recordedFindings: state.evidence.map((item) => ({
        id: item.id,
        sourceClass: item.sourceClass,
        label: item.label,
        ...(item.url ? { url: item.url } : {}),
        ...(item.recordRef ? { recordRef: item.recordRef } : {}),
      })),
      unmetCompletionRequirements: check.unmet,
    };
  }
  return {
    state,
    async read() {
      return observation();
    },
    async act(command) {
      if (command.type === "record_observation") {
        // Resolve the observation through the application adapter, exactly as
        // the Convex action would: read the record / fetch the page, store the
        // finding text as evidence.
        let text: string;
        let label = command.label;
        if (command.source === "company_record") {
          const record = COMPANY_RECORDS.find((r) => r.ref === command.recordRef);
          if (!record) throw new Error(`Unknown company record: ${command.recordRef}`);
          text = record.text;
          label = record.label;
        } else {
          const page = await fetchImpl(command.url!);
          if (!page.ok) throw new Error(`Fetch failed (${page.status})`);
          text = (await page.text()).slice(0, 4000);
        }
        state.evidence.push({
          sourceClass: command.source,
          label,
          text,
          ...(command.url ? { url: command.url } : {}),
          ...(command.recordRef ? { recordRef: command.recordRef } : {}),
          observedAt: now,
          id: `ev-${state.evidence.length + 1}`,
          recordedBy: contract.workerKey,
          runId: "run-test",
        });
        return `Observation recorded: ${label}`;
      }
      if (command.type === "record_finding") {
        const finding: FindingInput = command.finding;
        state.evidence.push({
          ...finding,
          id: `ev-${state.evidence.length + 1}`,
          recordedBy: contract.workerKey,
          runId: "run-test",
        });
        return `Finding recorded: ${finding.label}`;
      }
      if (command.type === "submit_result") {
        state.result = { ...command.result, completedAt: now };
        return "Structured result stored; completion still requires application proof";
      }
      const check = evaluateCompletion({
        contract,
        evidence: state.evidence,
        result: state.result,
      });
      if (!check.complete) {
        state.completionError = `Completion refused: ${check.unmet.join("; ")}`;
        throw new Error(state.completionError);
      }
      state.completed = true;
      return "Application accepted completion";
    },
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

// A scripted model that drives the whole evidence → result → completion flow
// through registered tools only.
function scriptedModel(script: Array<{ name: string; args: unknown }>): {
  model: Model;
  toolCalls: { name: string; args: unknown }[];
} {
  const calls: { name: string; args: unknown }[] = [];
  let step = 0;
  const model: Model = {
    async getResponse(request) {
      // The runtime must expose exactly the materialized tool surface.
      assert.ok(request.tools.length > 0, "no tools registered");
      if (step < script.length) {
        const next = script[step++];
        calls.push(next);
        return {
          usage: new Usage(),
          output: [toolCall(next.name, next.args, `call-${step}`)],
        };
      }
      return { usage: new Usage(), output: [message("Assignment complete.")] };
    },
    async *getStreamedResponse() {
      throw new Error("Not used by this test");
    },
  };
  return { model, toolCalls: calls };
}

const WIKI_URL = "https://en.wikipedia.org/wiki/Acme_Corporation";

function fullScript() {
  return [
    {
      name: "read_company_record",
      args: { recordRef: "partnerships/evaluation-criteria" },
    },
    { name: "read_public_web", args: { url: WIKI_URL, focus: "company overview" } },
    {
      name: "read_public_web",
      args: { url: "https://example.com/partners", focus: "partner programme" },
    },
    {
      name: "submit_result",
      args: {
        summary: "Conditional fit.",
        fit: "Matches internal criteria on reach and economics.",
        risks: ["Thin public financials"],
        unknowns: ["Actual SME reach"],
        recommendedNextAction: "Send partner-form enquiry.",
      },
    },
    { name: "request_completion", args: {} },
  ];
}

// ── Tool materialization ────────────────────────────────────────────────────

test("only envelope permissions materialize as tools, plus fixed workflow verbs", () => {
  const surface = toolNamesForContract(contract());
  assert.deepEqual(surface.materialized.sort(), [
    "read_company_record",
    "read_public_web",
    "record_finding",
  ]);
  assert.deepEqual(surface.workflow, ["submit_result", "request_completion"]);
  assert.deepEqual(surface.skipped, []);
});

test("the spend permission never materializes even if injected into a contract", () => {
  const poisoned = {
    ...contract(),
    allowedToolPermissions: [
      "read_public_web",
      "authorize_external_spend",
      "unknown_permission",
    ],
  } as WorkContract;
  const surface = toolNamesForContract(poisoned);
  assert.deepEqual(surface.materialized, ["read_public_web"]);
  assert.deepEqual(surface.skipped.sort(), [
    "authorize_external_spend",
    "unknown_permission",
  ]);
});

// ── Live provider gate ──────────────────────────────────────────────────────

test("model selection is deliberate and provider gate fails closed", () => {
  assert.throws(() => selectWorkerModel({ env: {}, requiresTools: true }), /AI_MODEL/);
  const selection = selectWorkerModel({
    env: { AI_MODEL: "openai/gpt-5.6-terra" },
    requiresTools: true,
  });
  assert.equal(selection.model, "openai/gpt-5.6-terra");
  assert.ok(selection.reason.length > 0);

  assert.throws(() =>
    providerConfiguration({ AI_MODEL: "x", LIVE_AI_ENABLED: "false" }),
  );
  assert.throws(() =>
    providerConfiguration({
      LIVE_AI_ENABLED: "true",
      AI_MODEL: "x",
      AI_PROVIDER: "openrouter",
    }),
  );
  const config = providerConfiguration({
    LIVE_AI_ENABLED: "true",
    AI_MODEL: "openai/gpt-5.6-terra",
    AI_PROVIDER: "openrouter",
    OPENROUTER_API_KEY: "test",
  });
  assert.equal(config.model, "openai/gpt-5.6-terra");
  assert.equal(config.baseURL, "https://openrouter.ai/api/v1");
  assert.ok(config.modelSelectionReason.length > 0);
});

// ── Real Runner execution with an injected model ────────────────────────────

test("the real Runner executes registered tools and completes on application proof", async () => {
  const c = contract();
  const port = makePort(c, {
    evidence: [],
    result: null,
    completed: false,
    completionError: null,
  });
  const { model, toolCalls } = scriptedModel(fullScript());
  await runWorker(port, c, { model });
  // Meaningful tool-mediated work actually happened through the SDK runner.
  // The application finalizes the run itself as soon as the proof is complete
  // (after submit_result), so the scripted request_completion turn is never
  // consumed: application-owned completion, not model-owned.
  assert.equal(toolCalls.length, 4);
  assert.ok(port.state.evidence.length >= 3);
  const classes = new Set(port.state.evidence.map((item) => item.sourceClass));
  assert.deepEqual([...classes].sort(), ["company_record", "public_web"]);
  assert.ok(port.state.result);
  // The application's finishRun twin: completion is decided by the
  // application's proof check after the run returns, not by a model command.
  port.state.completed = evaluateCompletion({
    contract: c,
    evidence: port.state.evidence,
    result: port.state.result,
  }).complete;
  assert.equal(port.state.completed, true);
});

test("a run without meaningful tool progress cannot fabricate completion", async () => {
  const c = contract();
  const port = makePort(c, {
    evidence: [],
    result: null,
    completed: false,
    completionError: null,
  });
  // The model just talks: no tool calls at all.
  const { model } = scriptedModel([]);
  await runWorker(port, c, { model });
  assert.equal(port.state.evidence.length, 0);
  assert.equal(port.state.completed, false);
});

test("completion is refused while required proof is missing", async () => {
  const c = contract();
  const port = makePort(c, {
    evidence: [],
    result: null,
    completed: false,
    completionError: null,
  });
  // Worker skips one public observation and jumps straight to completion.
  const { model, toolCalls } = scriptedModel([
    {
      name: "read_company_record",
      args: { recordRef: "company/profile" },
    },
    { name: "submit_result", args: {
      summary: "s",
      fit: "f",
      risks: ["r"],
      unknowns: ["u"],
      recommendedNextAction: "n",
    } },
    { name: "request_completion", args: {} },
  ]);
  await runWorker(port, c, { model });
  assert.equal(toolCalls.length, 3);
  assert.equal(port.state.completed, false);
  assert.match(port.state.completionError ?? "", /Completion refused/);
  assert.match(port.state.completionError ?? "", /public_web/);
});

test("unregistered tools are never offered to the model", async () => {
  const c = contract();
  const port = makePort(c, {
    evidence: [],
    result: null,
    completed: false,
    completionError: null,
  });
  const seen: string[] = [];
  const { model } = scriptedModel(fullScript());
  const wrapped: Model = {
    async getResponse(request) {
      seen.push(...request.tools.map((t) => t.name));
      return model.getResponse(request);
    },
    async *getStreamedResponse() {
      throw new Error("Not used by this test");
    },
  };
  await runWorker(port, c, { model: wrapped });
  assert.deepEqual(
    [...new Set(seen)].sort(),
    [
      "read_company_record",
      "read_public_web",
      "record_finding",
      "request_completion",
      "submit_result",
    ],
  );
});
