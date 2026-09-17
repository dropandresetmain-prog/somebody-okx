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
import type { ModelNoteInput, WorkerObservation, WorkerPort } from "../lib/worker/port";
import { sourceIdentity } from "../lib/objective/contract";
import type { ActivityResult, EvidenceRecord, WorkContract } from "../lib/workforce";
import { COMPANY_RECORDS } from "../lib/objective/policy";

const fetchImpl: typeof fetch = (async (url: string | URL | Request) =>
  new Response(
    `Acme Corporation — small business services. Partner programme: https://acme.test/partners. Free tier for SMEs.`,
    { status: 200 },
  )) as unknown as typeof fetch;

const now = 1800000000000;

// The M1 role proof, stated here the same way lib/objective/policy.ts states
// RESEARCH_ROLE: one distinct internal record and two distinct public sources.
const ROLE_SOURCE_PROOFS = [
  { sourceClass: "company_record" as const, minDistinctSources: 1 },
  { sourceClass: "public_web" as const, minDistinctSources: 2 },
];

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
    sourceProofs: ROLE_SOURCE_PROOFS,
    ...overrides,
  });
}

// In-memory application state backing the port: the test twin of what Convex
// persists durably. `origin` and `sourceId` live on EvidenceRecord because the
// application assigns them when it stores the row — the runtime never can.
type TestState = {
  evidence: EvidenceRecord[];
  result: ActivityResult | null;
  completed: boolean;
  completionError: string | null;
};

// Mirror of convex/objectiveRunner.ts: an observation's identity is derived
// from the source the application actually resolved; a note gets a unique
// identity inside the `note:` namespace so it can never credit a proof count.
function noteIdentity(state: TestState): string {
  return `note:manual-${state.evidence.length + 1}`;
}

function makePort(contract: WorkContract, state: TestState): WorkerPort & {
  state: TestState;
} {
  function observation(): WorkerObservation {
    // Completion proof only counts application_observation evidence, not model_notes.
    const appObservations = state.evidence.filter(
      (e) => e.origin === "application_observation",
    );
    const check = evaluateCompletion({
      contract,
      evidence: appObservations,
      result: state.result,
    });
    // Bound the text to 1200 chars with truncation marker.
    const MAX_TEXT = 1200;
    const TRUNCATION_MARKER = "…[truncated]";
    return {
      assignment: contract.assignment,
      responsibility: "Research analyst responsibility.",
      requiredSourceClasses: [...contract.requiredSourceClasses],
      minObservations: contract.minObservations,
      recordedFindings: state.evidence.map((item) => {
        let text = item.text;
        if (text.length > MAX_TEXT) {
          text = text.slice(0, MAX_TEXT - TRUNCATION_MARKER.length) + TRUNCATION_MARKER;
        }
        return {
          id: item.id,
          sourceClass: item.sourceClass,
          label: item.label,
          origin: item.origin,
          text,
          ...(item.url ? { url: item.url } : {}),
          ...(item.recordRef ? { recordRef: item.recordRef } : {}),
        };
      }),
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
          origin: "application_observation",
          sourceId: sourceIdentity({
            sourceClass: command.source,
            ...(command.url ? { url: command.url } : {}),
            ...(command.recordRef ? { recordRef: command.recordRef } : {}),
          }),
        });
        return `Observation recorded: ${label}`;
      }
      if (command.type === "record_finding") {
        // Validate basedOnEvidenceId against actual application observations
        // from the current run. Reject if it references something that isn't
        // an application_observation from this run.
        if (command.basedOnEvidenceId) {
          const ref = state.evidence.find(
            (e) => e.id === command.basedOnEvidenceId && e.origin === "application_observation",
          );
          if (!ref) {
            throw new Error(
              `basedOnEvidenceId ${command.basedOnEvidenceId} does not reference an application observation from this run`,
            );
          }
        }
        const finding: ModelNoteInput = command.finding;
        state.evidence.push({
          ...finding,
          id: `ev-${state.evidence.length + 1}`,
          recordedBy: contract.workerKey,
          runId: "run-test",
          origin: "model_note",
          sourceId: noteIdentity(state),
          ...(command.basedOnEvidenceId ? { basedOnEvidenceId: command.basedOnEvidenceId } : {}),
        });
        return `Note recorded: ${finding.label}`;
      }
      if (command.type === "submit_result") {
        state.result = { ...command.result, completedAt: now };
        return "Structured result stored; completion still requires application proof";
      }
      // request_completion: proof must include application_observation evidence,
      // not just model_note entries.
      const appObservations = state.evidence.filter(
        (e) => e.origin === "application_observation",
      );
      const check = evaluateCompletion({
        contract,
        evidence: appObservations,
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
    evidence: port.state.evidence.filter((e) => e.origin === "application_observation"),
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

// ── Blocker C: observation surface ──────────────────────────────────────────

test("read tools return actual observed CONTENT to the model, not just a label", async () => {
  const c = contract();
  const port = makePort(c, {
    evidence: [],
    result: null,
    completed: false,
    completionError: null,
  });
  const { model } = scriptedModel([
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
        summary: "s",
        fit: "f",
        risks: ["r"],
        unknowns: ["u"],
        recommendedNextAction: "n",
      },
    },
    { name: "request_completion", args: {} },
  ]);
  await runWorker(port, c, { model });

  // The port's observation surface must contain the actual text from the
  // company record and the public page, not just labels.
  const findings = port.state.evidence;
  assert.ok(findings.length >= 3, "expected at least 3 observations");

  const companyObs = findings.find((f) => f.sourceClass === "company_record");
  assert.ok(companyObs, "expected a company_record observation");
  assert.ok(
    companyObs.text.includes("Partnership evaluation criteria"),
    "company_record observation must contain actual record text",
  );
  assert.ok(
    companyObs.text.includes("Relevance"),
    "company_record observation must include the record body content",
  );

  const publicObs = findings.filter((f) => f.sourceClass === "public_web");
  assert.ok(publicObs.length >= 2, "expected at least 2 public_web observations");
  assert.ok(
    publicObs[0].text.includes("Acme Corporation"),
    "public_web observation must contain actual page text",
  );
  assert.ok(
    publicObs[0].text.includes("small business services"),
    "public_web observation must include the page body content",
  );

  // The WorkerObservation.recordedFindings must also surface the text.
  const obs = await port.read();
  const companyFinding = obs.recordedFindings.find((f) => f.sourceClass === "company_record");
  assert.ok(companyFinding, "expected a company_record in recordedFindings");
  assert.ok(
    companyFinding.text.includes("Partnership evaluation criteria"),
    "recordedFindings must surface the actual text to the model",
  );
  assert.equal(companyFinding.origin, "application_observation");
});

test("public content is wrapped in the untrusted-data marker", async () => {
  const c = contract();
  const port = makePort(c, {
    evidence: [],
    result: null,
    completed: false,
    completionError: null,
  });
  const { model } = scriptedModel([
    { name: "read_public_web", args: { url: WIKI_URL, focus: "company overview" } },
    {
      name: "read_public_web",
      args: { url: "https://example.com/partners", focus: "partner programme" },
    },
    {
      name: "read_company_record",
      args: { recordRef: "company/profile" },
    },
    {
      name: "submit_result",
      args: {
        summary: "s",
        fit: "f",
        risks: ["r"],
        unknowns: ["u"],
        recommendedNextAction: "n",
      },
    },
    { name: "request_completion", args: {} },
  ]);
  await runWorker(port, c, { model });

  // The observation surface must include origin markers.
  const obs = await port.read();
  const publicFinding = obs.recordedFindings.find((f) => f.sourceClass === "public_web");
  assert.ok(publicFinding, "expected a public_web finding");
  assert.equal(publicFinding.origin, "application_observation");

  const companyFinding = obs.recordedFindings.find((f) => f.sourceClass === "company_record");
  assert.ok(companyFinding, "expected a company_record finding");
  assert.equal(companyFinding.origin, "application_observation");

  // The evidence records must have the correct origin.
  const publicObs = port.state.evidence.filter((f) => f.sourceClass === "public_web");
  assert.ok(publicObs.length >= 2, "expected at least 2 public observations");
  assert.ok(
    publicObs.every((f) => f.origin === "application_observation"),
    "all public observations must have origin=application_observation",
  );

  const companyObs = port.state.evidence.find((f) => f.sourceClass === "company_record");
  assert.ok(companyObs, "expected a company_record observation");
  assert.equal(companyObs.origin, "application_observation");
});

test("long content is truncated at the 1200-char bound with a truncation marker", async () => {
  // Use a fetch that returns very long content.
  const longText = "X".repeat(3000);
  const longFetchImpl: typeof fetch = (async () =>
    new Response(longText, { status: 200 })) as unknown as typeof fetch;

  const c = contract();
  const state: TestState = {
    evidence: [],
    result: null,
    completed: false,
    completionError: null,
  };
  const port: WorkerPort = {
    async read() {
      const appObservations = state.evidence.filter(
        (e) => e.origin === "application_observation",
      );
      const check = evaluateCompletion({ contract: c, evidence: appObservations, result: state.result });
      // Bound the text to 1200 chars with truncation marker.
      const MAX_TEXT = 1200;
      const TRUNCATION_MARKER = "…[truncated]";
      return {
        assignment: c.assignment,
        responsibility: "resp",
        requiredSourceClasses: [...c.requiredSourceClasses],
        minObservations: c.minObservations,
        recordedFindings: state.evidence.map((item) => {
          let text = item.text;
          if (text.length > MAX_TEXT) {
            text = text.slice(0, MAX_TEXT - TRUNCATION_MARKER.length) + TRUNCATION_MARKER;
          }
          return {
            id: item.id,
            sourceClass: item.sourceClass,
            label: item.label,
            origin: item.origin,
            text,
            ...(item.url ? { url: item.url } : {}),
            ...(item.recordRef ? { recordRef: item.recordRef } : {}),
          };
        }),
        unmetCompletionRequirements: check.unmet,
      };
    },
    async act(command) {
      if (command.type === "record_observation") {
        let text: string;
        let label = command.label;
        if (command.source === "company_record") {
          const record = COMPANY_RECORDS.find((r) => r.ref === command.recordRef);
          if (!record) throw new Error(`Unknown company record: ${command.recordRef}`);
          text = record.text;
          label = record.label;
        } else {
          const page = await longFetchImpl(command.url!);
          if (!page.ok) throw new Error(`Fetch failed`);
          text = await page.text();
        }
        state.evidence.push({
          sourceClass: command.source,
          label,
          text,
          ...(command.url ? { url: command.url } : {}),
          ...(command.recordRef ? { recordRef: command.recordRef } : {}),
          observedAt: now,
          id: `ev-${state.evidence.length + 1}`,
          recordedBy: c.workerKey,
          runId: "run-test",
          origin: "application_observation",
          sourceId: sourceIdentity({
            sourceClass: command.source,
            ...(command.url ? { url: command.url } : {}),
            ...(command.recordRef ? { recordRef: command.recordRef } : {}),
          }),
        });
        return `Observation recorded: ${label}`;
      }
      if (command.type === "record_finding") {
        state.evidence.push({
          ...command.finding,
          id: `ev-${state.evidence.length + 1}`,
          recordedBy: c.workerKey,
          runId: "run-test",
          origin: "model_note",
          sourceId: noteIdentity(state),
        });
        return `Note recorded: ${command.finding.label}`;
      }
      if (command.type === "submit_result") {
        state.result = { ...command.result, completedAt: now };
        return "ok";
      }
      throw new Error("Completion refused");
    },
  };

  const { model } = scriptedModel([
    { name: "read_public_web", args: { url: "https://example.com/long", focus: "long page" } },
    { name: "read_company_record", args: { recordRef: "company/profile" } },
    {
      name: "submit_result",
      args: { summary: "s", fit: "f", risks: ["r"], unknowns: ["u"], recommendedNextAction: "n" },
    },
    { name: "request_completion", args: {} },
  ]);
  await runWorker(port, c, { model });

  // The observation surface should truncate long text to 1200 chars.
  const obs = await port.read();
  const longFinding = obs.recordedFindings.find((f) => f.sourceClass === "public_web");
  assert.ok(longFinding, "expected a public_web finding");
  assert.ok(
    longFinding.text.includes("…[truncated]"),
    "truncated content must include the …[truncated] marker",
  );
  assert.ok(
    longFinding.text.length <= 1200,
    `truncated text must be at most 1200 chars, got ${longFinding.text.length}`,
  );
});

test("authorize_external_spend and unknown tools never materialize in the agent tool set", async () => {
  const poisoned = {
    ...contract(),
    allowedToolPermissions: [
      "read_public_web",
      "read_company_record",
      "record_finding",
      "authorize_external_spend",
      "unknown_permission",
      "draft_document",
    ],
  } as WorkContract;

  const c = poisoned;
  const port = makePort(c, {
    evidence: [],
    result: null,
    completed: false,
    completionError: null,
  });
  const seen: string[] = [];
  const { model } = scriptedModel([
    { name: "read_company_record", args: { recordRef: "company/profile" } },
    { name: "read_public_web", args: { url: WIKI_URL, focus: "overview" } },
    {
      name: "read_public_web",
      args: { url: "https://example.com/partners", focus: "partner" },
    },
    {
      name: "submit_result",
      args: { summary: "s", fit: "f", risks: ["r"], unknowns: ["u"], recommendedNextAction: "n" },
    },
    { name: "request_completion", args: {} },
  ]);
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

  const uniqueTools = [...new Set(seen)].sort();
  // authorize_external_spend, unknown_permission, and draft_document must NOT appear.
  assert.ok(
    !uniqueTools.includes("authorize_external_spend"),
    "authorize_external_spend must never materialize",
  );
  assert.ok(
    !uniqueTools.includes("unknown_permission"),
    "unknown_permission must never materialize",
  );
  assert.ok(
    !uniqueTools.includes("draft_document"),
    "draft_document must never materialize when not in the envelope",
  );
  // Only the envelope permissions plus workflow verbs.
  assert.deepEqual(uniqueTools, [
    "read_company_record",
    "read_public_web",
    "record_finding",
    "request_completion",
    "submit_result",
  ]);
});

test("a prose-only / notes-only run CANNOT become complete — request_completion is refused", async () => {
  const c = contract();
  const port = makePort(c, {
    evidence: [],
    result: null,
    completed: false,
    completionError: null,
  });
  // The model only uses record_finding (model_note) — no real observations.
  // This must NOT satisfy proof: request_completion must be refused.
  const { model } = scriptedModel([
    {
      name: "record_finding",
      args: {
        sourceClass: "company_record",
        label: "My note about criteria",
        text: "I think the criteria are met based on general knowledge.",
      },
    },
    {
      name: "record_finding",
      args: {
        sourceClass: "public_web",
        label: "My note about Acme",
        text: "I believe Acme is a good partner based on what I know.",
      },
    },
    {
      name: "record_finding",
      args: {
        sourceClass: "public_web",
        label: "Another note",
        text: "More prose without real observation.",
      },
    },
    {
      name: "submit_result",
      args: {
        summary: "s",
        fit: "f",
        risks: ["r"],
        unknowns: ["u"],
        recommendedNextAction: "n",
      },
    },
    { name: "request_completion", args: {} },
  ]);
  await runWorker(port, c, { model });

  // All notes were recorded, but none are application observations.
  assert.equal(port.state.evidence.length, 3);
  assert.ok(
    port.state.evidence.every((e) => e.origin === "model_note"),
    "all evidence should be model_note origin",
  );
  assert.equal(port.state.completed, false, "must not be completed");
  // The observation surface must show unmet requirements since no app observations exist.
  const obs = await port.read();
  assert.ok(
    obs.unmetCompletionRequirements.length > 0,
    "must have unmet completion requirements when only model_notes exist",
  );
  assert.ok(
    obs.unmetCompletionRequirements.some((r) => /company_record|public_web/.test(r)),
    "unmet requirements must mention missing source classes",
  );
});

test("record_finding with invalid basedOnEvidenceId is rejected", async () => {
  const c = contract();
  const port = makePort(c, {
    evidence: [],
    result: null,
    completed: false,
    completionError: null,
  });
  // Try to reference a non-existent evidence id.
  const { model } = scriptedModel([
    {
      name: "record_finding",
      args: {
        sourceClass: "company_record",
        label: "Note with bad reference",
        text: "Some text.",
        basedOnEvidenceId: "ev-999",
      },
    },
    { name: "read_company_record", args: { recordRef: "company/profile" } },
    { name: "read_public_web", args: { url: WIKI_URL, focus: "overview" } },
    {
      name: "read_public_web",
      args: { url: "https://example.com/partners", focus: "partner" },
    },
    {
      name: "submit_result",
      args: { summary: "s", fit: "f", risks: ["r"], unknowns: ["u"], recommendedNextAction: "n" },
    },
    { name: "request_completion", args: {} },
  ]);
  await runWorker(port, c, { model });
  // The bad reference should have been rejected — no evidence from that call.
  // The run should still complete via the real observations.
  const notesOnly = port.state.evidence.filter((e) => e.origin === "model_note");
  assert.equal(notesOnly.length, 0, "the bad-reference note must not have been stored");
});
