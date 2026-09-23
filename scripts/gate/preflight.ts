// EVIDENCE-ONLY model-portability preflight. Exercises the five REAL production
// model boundaries of the Somebody runtime against a REAL OpenRouter endpoint for
// one model slug, using the PRODUCTION adapters/schemas (convex-test + calling the
// internalAction `_handler`s directly; no structured/worker test doubles).
//
//   npx tsx scripts/gate/preflight.ts <openrouter-model-slug> [--boundaries=1,2,3,4,5] [--dry]
//
// --dry never touches the network: globalThis.fetch answers for openrouter.ai with
// a local synthetic OpenAI-compatible reply (schema-conformant), proving each
// boundary's model call is reached by the seeding.
//
// Never prints/stores secrets, prompts or Authorization headers. Model answers are
// stored only as <=200-char snippets. Aborts (exit 3) if cumulative reported cost
// exceeds US$0.15.
import fs from "node:fs";
import path from "node:path";
import { convexTest } from "convex-test";
import schema from "../../convex/schema";
import {
  applyDecision,
  applyInterpretation,
  beginFinalSemanticAssessment,
  beginInterpretation,
  runManagementPass,
} from "../../convex/management";
import {
  executeWorker,
  proposeDecision,
  proposeFinalSemanticAssessment,
  proposeInterpretation,
} from "../../convex/objectiveRunner";
import { initBudget } from "../../convex/internal/workforce";
import { setupCanonicalDemoObjective } from "../../convex/objectives";
import { optionIdFor } from "../../lib/management/options";
import {
  validateFinalAssessmentStructure,
  validateInterpretationStructure,
  validateRecommendationStructure,
  validateStrategyStructure,
} from "../../lib/management/proposals";
import { classifyProviderFailure } from "../../lib/management/modelBoundary";
import {
  CANONICAL_COMPANY_RECORD,
  CANONICAL_OBJECTIVE_REQUEST,
} from "../../lib/objective/seedData";

/* ───────────────────────────── args / env ───────────────────────────── */

const argv = process.argv.slice(2);
const slug = argv.find((a) => !a.startsWith("--"));
const DRY = argv.includes("--dry");
const VERBOSE = argv.includes("--verbose");
const bArg = argv.find((a) => a.startsWith("--boundaries="));
const wanted = new Set(
  (bArg ? bArg.slice("--boundaries=".length) : "1,2,3,4,5")
    .split(",")
    .map((s) => Number(s.trim()))
    .filter((n) => n >= 1 && n <= 5),
);
if (!slug) {
  console.error("usage: npx tsx scripts/gate/preflight.ts <openrouter-model-slug> [--boundaries=1,2,3,4,5] [--dry]");
  process.exit(2);
}
const MODEL_SLUG: string = slug;

const COST_CAP_USD = 0.15;
const repoRoot = path.resolve(path.dirname(process.argv[1] ?? "."), "..", "..");
const realSetTimeout = globalThis.setTimeout.bind(globalThis);
const realClearTimeout = globalThis.clearTimeout.bind(globalThis);

function loadOpenRouterKey(): string {
  if (DRY) return "dry-run-not-a-key";
  const file = path.join(repoRoot, ".env.local");
  const text = fs.readFileSync(file, "utf8");
  for (const line of text.split(/\r?\n/)) {
    const m = line.match(/^\s*(?:export\s+)?OPENROUTER_API_KEY\s*=\s*(.*)\s*$/);
    if (m) return m[1]!.replace(/^["']|["']$/g, "").trim();
  }
  throw new Error("OPENROUTER_API_KEY not found in .env.local");
}
process.env.LIVE_AI_ENABLED = "true";
process.env.AI_PROVIDER = "openrouter";
process.env.AI_MODEL = MODEL_SLUG;
process.env.OPENROUTER_API_KEY = loadOpenRouterKey();
process.env.SOMEBODY_DEMO_OPERATOR_TOKEN = "gate-preflight-local-token";

/* ───────────────────────────── instrumentation ───────────────────────────── */

type HttpRec = {
  seq: number;
  tag: string; // b1 | b23 | b4 | b5
  schemaName: string | null;
  hasResponseFormatJsonSchema: boolean;
  hasStrict: boolean | null;
  hasTools: boolean;
  hasToolChoice: boolean;
  toolChoice: unknown;
  requireParameters: boolean | null;
  requestModel: string | null;
  hasToolResultMessage: boolean;
  isRepairRequest: boolean;
  afterFailure: boolean;
  status: number; // 0 = transport error
  elapsedMs: number;
  resolvedModel: string | null;
  resolvedProvider: string | null;
  finishReason: string | null;
  promptTokens: number | null;
  completionTokens: number | null;
  costUsd: number | null;
  hasToolCalls: boolean;
  toolCallNames: string[];
  contentEmpty: boolean;
  jsonParses: boolean | null;
  appValid: boolean | null;
  appIssues: string[];
  errorSnippet: string | null;
  answerSnippet: string | null;
  transportError: string | null;
};

const httpRecords: HttpRec[] = [];
let currentTag = "setup";
let cumulativeCost = 0;
let costReportedAny = false;
const notes: string[] = [];
let finalizeAndExit: ((code: number, reason?: string) => never) | null = null;

const realFetch = globalThis.fetch.bind(globalThis);

function stripFences(raw: string): string {
  const t = raw.trim();
  const m = t.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  return m ? m[1]!.trim() : t;
}

function enumOf(schemaObj: any, pathKeys: string[]): string[] {
  let cur = schemaObj;
  for (const k of pathKeys) cur = cur?.[k];
  return Array.isArray(cur) ? cur.filter((x: unknown) => typeof x === "string") : [];
}

function appValidate(schemaName: string | null, parsed: unknown, schemaObj: any): { ok: boolean; issues: string[] } {
  try {
    if (schemaName === "objective_interpretation") {
      const c = (parsed ?? {}) as any;
      const r = validateInterpretationStructure({ contract: c.contract ?? null, requirements: c.requirements ?? null });
      return r.ok ? { ok: true, issues: [] } : { ok: false, issues: r.issues.map((i) => `${i.field}: ${i.reason}`.slice(0, 160)) };
    }
    if (schemaName === "strategy_proposal") {
      const strategies = enumOf(schemaObj, ["properties", "strategy", "enum"]);
      const catalog = enumOf(schemaObj, ["properties", "desiredCapabilities", "items", "enum"]);
      const r = validateStrategyStructure(parsed, { strategies, capabilityCatalog: catalog });
      return r.ok ? { ok: true, issues: [] } : { ok: false, issues: r.issues.map((i) => `${i.field}: ${i.reason}`.slice(0, 160)) };
    }
    if (schemaName === "managerial_recommendation") {
      const ids = enumOf(schemaObj, ["properties", "selectedOptionId", "enum"]);
      const r = validateRecommendationStructure(parsed, { eligibleOptionIds: ids });
      return r.ok ? { ok: true, issues: [] } : { ok: false, issues: r.issues.map((i) => `${i.field}: ${i.reason}`.slice(0, 160)) };
    }
    if (schemaName === "final_semantic_assessment") {
      const ids = enumOf(schemaObj, ["properties", "evidenceRefs", "items", "enum"]);
      const r = validateFinalAssessmentStructure(parsed, { evidenceIds: ids });
      return r.ok ? { ok: true, issues: [] } : { ok: false, issues: r.issues.map((i) => `${i.field}: ${i.reason}`.slice(0, 160)) };
    }
  } catch (error) {
    return { ok: false, issues: [`validator threw: ${error instanceof Error ? error.message : "?"}`.slice(0, 160)] };
  }
  return { ok: true, issues: [] };
}

function dryReply(body: any): any {
  const schemaName: string | undefined = body?.response_format?.json_schema?.name;
  const schemaObj = body?.response_format?.json_schema?.schema;
  const base = (message: any, finish: string) => ({
    id: "chatcmpl-dry",
    object: "chat.completion",
    created: 1,
    model: "dry/stub-model",
    provider: "DryStub",
    choices: [{ index: 0, finish_reason: finish, message }],
    usage: { prompt_tokens: 11, completion_tokens: 7, total_tokens: 18, cost: 0 },
  });
  if (Array.isArray(body?.tools) && body.tools.length) {
    const hasToolMsg = (body.messages ?? []).some((m: any) => m.role === "tool");
    if (!hasToolMsg) {
      return base(
        {
          role: "assistant",
          content: null,
          tool_calls: [
            { id: "call_dry_1", type: "function", function: { name: "read_company_record", arguments: JSON.stringify({ recordRef: "launch/context" }) } },
          ],
        },
        "tool_calls",
      );
    }
    return base({ role: "assistant", content: "Dry stub: done." }, "stop");
  }
  let content: unknown = "dry stub prose";
  if (schemaName === "objective_interpretation") {
    content = {
      contract: {
        intent: "Relaunch messaging that converts one-person-company founders",
        levels: [{ levelKey: "relaunch_ready", statement: "A saved relaunch recommendation exists", label: "Relaunch ready" }],
        minimumCompletionBar: "relaunch_ready",
        ambiguities: [],
      },
      requirements: [
        {
          requirementKey: "req_relaunch",
          priority: "required",
          title: "Relaunch recommendation delivered",
          mustBeTrue: "A versioned relaunch recommendation artifact is saved",
          scope: "deliverable",
          dependsOnRequirementKeys: [],
          requiredResourceClasses: [],
          expectedOutput: "saved relaunch recommendation",
          requirementKind: "deliverable",
        },
      ],
    };
  } else if (schemaName === "strategy_proposal") {
    const cat = enumOf(schemaObj, ["properties", "desiredCapabilities", "items", "enum"]);
    const pick = ["growth_launch_operations", "company_records_lookup"].filter((c) => cat.includes(c));
    content = { strategy: "MAKE", desiredCapabilities: pick, needsExternalResourceClass: null, notes: null };
  } else if (schemaName === "managerial_recommendation") {
    const ids = enumOf(schemaObj, ["properties", "selectedOptionId", "enum"]);
    content = {
      selectedOptionId: ids.find((i) => i.includes("internal")) ?? ids[0] ?? "none",
      strongestAlternativeId: null,
      rationale: "Dry stub rationale",
      materialAssumptions: [],
      changeMyMindEvidence: [],
    };
  } else if (schemaName === "final_semantic_assessment") {
    content = { meetsMinimumBar: true, rationale: "Dry stub", evidenceRefs: [], assumptionsUnknowns: [], recommendedNextAction: "none" };
  }
  return base({ role: "assistant", content: typeof content === "string" ? content : JSON.stringify(content) }, "stop");
}

function abortNow(reason: string): never {
  if (finalizeAndExit) return finalizeAndExit(3, reason);
  console.error(reason);
  process.exit(3);
}

globalThis.fetch = (async (input: any, init?: any) => {
  const url = typeof input === "string" ? input : input instanceof URL ? input.href : (input?.url ?? String(input));
  if (!/openrouter\.ai/i.test(url)) {
    if (DRY) return new Response("dry: network blocked", { status: 599 });
    return realFetch(input, init);
  }
  if (cumulativeCost > COST_CAP_USD) abortNow(`cost cap exceeded (${cumulativeCost.toFixed(4)} USD) before request`);
  let body: any = null;
  try {
    const raw = init?.body ?? (input instanceof Request ? await input.clone().text() : null);
    body = typeof raw === "string" ? JSON.parse(raw) : null;
  } catch {
    body = null;
  }
  const schemaObj = body?.response_format?.json_schema?.schema;
  if (process.env.GATE_DUMP_BODY && body && body.response_format && !(globalThis as any).__dumped) { (globalThis as any).__dumped = true; fs.writeFileSync(process.env.GATE_DUMP_BODY, JSON.stringify(body)); }
  const messages: any[] = Array.isArray(body?.messages) ? body.messages : [];
  const lastFailureForTag = [...httpRecords].reverse().find((r) => r.tag === currentTag);
  const rec: HttpRec = {
    seq: httpRecords.length + 1,
    tag: currentTag,
    schemaName: body?.response_format?.json_schema?.name ?? null,
    hasResponseFormatJsonSchema: body?.response_format?.type === "json_schema",
    hasStrict: body?.response_format?.json_schema?.strict ?? null,
    hasTools: Array.isArray(body?.tools) && body.tools.length > 0,
    hasToolChoice: body?.tool_choice !== undefined,
    toolChoice: typeof body?.tool_choice === "string" ? body.tool_choice : body?.tool_choice ? "object" : null,
    requireParameters: body?.provider?.require_parameters ?? null,
    requestModel: body?.model ?? null,
    hasToolResultMessage: messages.some((m) => m?.role === "tool"),
    isRepairRequest: messages.some((m) => m?.role === "user" && typeof m.content === "string" && m.content.includes("REPAIR REQUEST")),
    afterFailure: !!lastFailureForTag && lastFailureForTag.status !== 200,
    status: 0,
    elapsedMs: 0,
    resolvedModel: null,
    resolvedProvider: null,
    finishReason: null,
    promptTokens: null,
    completionTokens: null,
    costUsd: null,
    hasToolCalls: false,
    toolCallNames: [],
    contentEmpty: false,
    jsonParses: null,
    appValid: null,
    appIssues: [],
    errorSnippet: null,
    answerSnippet: null,
    transportError: null,
  };
  httpRecords.push(rec);
  const started = Date.now();
  let res: Response;
  try {
    res = DRY
      ? new Response(JSON.stringify(dryReply(body)), { status: 200, headers: { "content-type": "application/json" } })
      : await realFetch(input, init);
  } catch (error) {
    rec.elapsedMs = Date.now() - started;
    rec.transportError = `${error instanceof Error ? error.name : "Error"}: ${error instanceof Error ? error.message : ""}`.slice(0, 160);
    throw error;
  }
  rec.status = res.status;
  const ct = res.headers.get("content-type") ?? "";
  if (/event-stream/i.test(ct)) {
    rec.elapsedMs = Date.now() - started;
    return res;
  }
  let text = "";
  try {
    text = await res.clone().text();
  } catch {
    /* ignore */
  }
  rec.elapsedMs = Date.now() - started;
  let json: any = null;
  try {
    json = JSON.parse(text);
  } catch {
    /* not json */
  }
  if (res.status !== 200) {
    const msg = json?.error?.message ?? text;
    rec.errorSnippet = String(msg ?? "").replace(/\s+/g, " ").slice(0, 200);
    return res;
  }
  rec.resolvedModel = json?.model ?? null;
  rec.resolvedProvider = json?.provider ?? null;
  const choice = json?.choices?.[0];
  rec.finishReason = choice?.finish_reason ?? null;
  rec.promptTokens = json?.usage?.prompt_tokens ?? null;
  rec.completionTokens = json?.usage?.completion_tokens ?? null;
  const cost = json?.usage?.cost;
  if (typeof cost === "number") {
    rec.costUsd = cost;
    cumulativeCost += cost;
    costReportedAny = true;
  }
  const toolCalls = choice?.message?.tool_calls;
  if (Array.isArray(toolCalls) && toolCalls.length) {
    rec.hasToolCalls = true;
    rec.toolCallNames = toolCalls.map((c: any) => String(c?.function?.name ?? "?")).slice(0, 8);
  }
  const content = choice?.message?.content;
  rec.contentEmpty = !(typeof content === "string" && content.trim().length > 0);
  if (typeof content === "string" && content.length) rec.answerSnippet = content.replace(/\s+/g, " ").slice(0, 200);
  if (rec.hasResponseFormatJsonSchema && !rec.contentEmpty) {
    try {
      const parsed = JSON.parse(stripFences(String(content)));
      rec.jsonParses = true;
      const v = appValidate(rec.schemaName, parsed, schemaObj);
      rec.appValid = v.ok;
      rec.appIssues = v.issues.slice(0, 4);
    } catch {
      rec.jsonParses = false;
      rec.appValid = false;
    }
  } else if (rec.hasResponseFormatJsonSchema) {
    rec.jsonParses = false;
    rec.appValid = false;
  }
  if (cumulativeCost > COST_CAP_USD) abortNow(`cost cap exceeded (${cumulativeCost.toFixed(4)} USD)`);
  return res;
}) as typeof fetch;

// Neutralize convex-test's in-memory scheduler timers (scheduled follow-up
// actions such as the next proposeDecision/executeWorker must NOT fire on their
// own: every model call in this run is driven explicitly and attributed). Only
// timers created directly by convex-test are dropped; SDK timers pass through.
const scheduledSuppressed: Array<{ ms: number }> = [];
(globalThis as any).setTimeout = ((cb: any, ms?: number, ...rest: any[]) => {
  const stack = new Error().stack?.split("\n").slice(1, 5).join("\n") ?? "";
  if (/convex-test/.test(stack)) {
    scheduledSuppressed.push({ ms: ms ?? 0 });
    return realSetTimeout(() => {}, 0);
  }
  return realSetTimeout(cb, ms, ...rest);
}) as typeof setTimeout;

// Capture console noise; keep [model-call] safe metadata as evidence.
type ModelCallLog = { kind: string; repairAttempt: number; requestedModel: string; resolvedModel: string | null; finishReason: string | null; elapsedMs: number; tag: string };
const modelCallLogs: ModelCallLog[] = [];
const warnings: string[] = [];
for (const level of ["log", "info", "warn", "error", "debug"] as const) {
  const orig = console[level].bind(console);
  (console as any)[level] = (...args: any[]) => {
    if (args[0] === "[model-call]" && args[1] && typeof args[1] === "object") {
      const m = args[1];
      modelCallLogs.push({
        kind: String(m.kind),
        repairAttempt: Number(m.repairAttempt ?? 0),
        requestedModel: String(m.requestedModel),
        resolvedModel: m.resolvedModel ?? null,
        finishReason: m.finishReason ?? null,
        elapsedMs: Number(m.elapsedMs ?? 0),
        tag: currentTag,
      });
      return;
    }
    if (level === "warn" || level === "error") {
      if (warnings.length < 15) warnings.push(args.map((a) => (typeof a === "string" ? a : a instanceof Error ? a.message : JSON.stringify(a))).join(" ").slice(0, 200));
    }
    if (VERBOSE) orig(...args);
  };
}
const out = (s: string) => process.stdout.write(s + "\n");

/* ───────────────────────────── convex-test seeding ───────────────────────────── */

const modules = {
  "../convex/schema.ts": () => import("../../convex/schema"),
  "../convex/objectiveValidators.ts": () => import("../../convex/objectiveValidators"),
  "../convex/managementValidators.ts": () => import("../../convex/managementValidators"),
  "../convex/workforceGuards.ts": () => import("../../convex/workforceGuards"),
  "../convex/objectives.ts": () => import("../../convex/objectives"),
  "../convex/objectiveRunner.ts": () => import("../../convex/objectiveRunner"),
  "../convex/internal/workforce.ts": () => import("../../convex/internal/workforce"),
  "../convex/management.ts": () => import("../../convex/management"),
  "../convex/m3Driver.ts": () => import("../../convex/m3Driver"),
  "../convex/_generated/api.d.ts": () => import("../../convex/_generated/api"),
  "../convex/_generated/server.d.ts": () => import("../../convex/_generated/server"),
  "../convex/_generated/dataModel.d.ts": () => import("../../convex/_generated/dataModel"),
};
type Backend = ReturnType<typeof convexTest>;
type Handler = { _handler: (c: unknown, a: Record<string, unknown>) => Promise<any> };
const H = (x: unknown) => x as Handler;
const ARTIFACT = "launch/page-message";

async function readObj(t: Backend, key: string): Promise<any> {
  return t.query(async (ctx) => {
    const row = await ctx.db.query("objectives").withIndex("by_key", (q) => q.eq("key", key)).unique();
    return (row as any).data;
  });
}
async function readReqs(t: Backend, key: string): Promise<any[]> {
  return t.query(async (ctx) => {
    const rows = await ctx.db.query("requirements").withIndex("by_objectiveKey", (q) => q.eq("objectiveKey", key)).collect();
    return rows.map((r: any) => r.data);
  });
}
async function readAssignments(t: Backend, key: string): Promise<any[]> {
  return t.query(async (ctx) => {
    const rows = await ctx.db.query("assignments").withIndex("by_objective", (q) => q.eq("objectiveKey", key)).collect();
    return rows.map((r: any) => r.data);
  });
}
async function readEvents(t: Backend, key: string): Promise<Array<{ text: string; kind: string }>> {
  return t.query(async (ctx) => {
    const rows = await ctx.db.query("objectiveEvents").withIndex("by_objectiveKey" as never, (q: any) => q.eq("objectiveKey", key)).collect();
    return rows.map((r: any) => r.data);
  });
}
async function budgetCalls(t: Backend, key: string): Promise<number | null> {
  return t.query(async (ctx) => {
    const row = await ctx.db.query("objectiveBudgets").withIndex("by_objectiveKey", (q) => q.eq("objectiveKey", key)).unique();
    return (row as any)?.data?.used?.modelCalls ?? null;
  });
}
async function invokePass(t: Backend, key: string, reason: string) {
  return t.mutation(async (ctx) => H(runManagementPass)._handler(ctx, { objectiveKey: key, reason }));
}

/** Canonical founder objective via the production setup mutation (seed artifact + spend grant). */
async function newObjective(t: Backend): Promise<string> {
  const { key } = (await t.mutation(async (ctx) =>
    H(setupCanonicalDemoObjective)._handler(ctx, {
      operatorToken: process.env.SOMEBODY_DEMO_OPERATOR_TOKEN!,
      request: CANONICAL_OBJECTIVE_REQUEST,
      spendLimitUsd: 2,
    }),
  )) as { key: string };
  await t.mutation(async (ctx) => H(initBudget)._handler(ctx, { objectiveKey: key, at: Date.now() }));
  return key;
}

const REQ_KEY = "req_relaunch";
async function cannedInterpret(t: Backend, key: string): Promise<void> {
  const r = await t.mutation(async (ctx) =>
    H(applyInterpretation)._handler(ctx, {
      objectiveKey: key,
      requestId: `interpret_${key}_canned`,
      rawContract: {
        intent: "Deliver a relaunch message that converts one-person-company founders",
        levels: [{ levelKey: "relaunch", order: 1, statement: "a saved relaunch recommendation is on record", label: "Relaunch" }],
        minimumCompletionBar: "relaunch",
        ambiguities: [],
      },
      rawRequirements: [
        {
          requirementKey: REQ_KEY,
          priority: "required",
          title: "Relaunch recommendation delivered",
          mustBeTrue: "a versioned relaunch recommendation artifact is saved",
          scope: "founder-facing deliverable",
          expectedOutput: "saved relaunch recommendation",
          requirementKind: "deliverable",
        },
      ],
      founderResolvedQuestions: [],
      at: Date.now(),
    }),
  );
  if (!r.ok) throw new Error(`canned interpretation refused: ${(r.errors ?? []).join("; ")}`);
}

async function pendingDecision(t: Backend, key: string): Promise<{ requestId: string; requirementKey: string; contractRevision: number } | null> {
  const obj = await readObj(t, key);
  return obj?.management?.pendingDecision ?? null;
}

/** Canned (non-model) MAKE decision → production dispatch → assignment with a real runId. */
async function cannedMakeAssignment(t: Backend, key: string): Promise<{ runId: string } | null> {
  await invokePass(t, key, "objective_submitted");
  const pending = await pendingDecision(t, key);
  if (!pending) return null;
  const caps = ["growth_launch_operations", "company_records_lookup"];
  const optionId = optionIdFor({
    requirementKey: pending.requirementKey,
    contractRevision: pending.contractRevision,
    kind: "internal",
    target: `internal:${[...caps].sort().join("+")}:new`,
  });
  const applied = await t.mutation(async (ctx) =>
    H(applyDecision)._handler(ctx, {
      objectiveKey: key,
      requestId: pending.requestId,
      rawStrategyProposal: { strategy: "MAKE", desiredCapabilities: caps, needsExternalResourceClass: null, notes: null },
      rawRecommendation: {
        requirementKey: pending.requirementKey,
        contractRevision: pending.contractRevision,
        selectedOptionId: optionId,
        rationale: "seeded: first serial MAKE to inspect owned evidence",
        materialAssumptions: [],
        changeMyMindEvidence: [],
      },
      at: Date.now(),
    }),
  );
  if (!applied.ok || !applied.authorized) return null;
  return dispatchAndGetRun(t, key);
}

async function dispatchAndGetRun(t: Backend, key: string): Promise<{ runId: string } | null> {
  await invokePass(t, key, "decision_applied");
  const asg = await readAssignments(t, key);
  const withRun = asg.find((a) => a.runId && a.workContract);
  return withRun ? { runId: withRun.runId as string } : null;
}

const REALISTIC_DRAFT = `Launch page — proposed relaunch message (draft v2)
Headline: "You are the whole company. Somebody is the manager you never had time to hire."
Subhead: "Tell Somebody the outcome you need. It scopes the work, uses what you already have, buys what you don't, and only reports done when the evidence says so."
Audience: solo founders running a one-person company who lose evenings to coordination work.
Pain point: too much time spent managing tools and freelancers instead of shipping.
Proof point: every completed objective ships with an audit trail of what was decided, spent and verified.
CTA: "Hand Somebody your next objective."`;

/** Give the assessment a realistic governed artifact revision + owned observation. */
async function stageRealisticArtifactIfUntouched(t: Backend, key: string, runId: string | null): Promise<string> {
  const obj = await readObj(t, key);
  const art = (obj.companyArtifacts ?? []).find((a: any) => a.key === ARTIFACT);
  if (art && art.version >= 2) return "artifact produced by the real worker run";
  await t.mutation(async (ctx) => {
    const row = await ctx.db.query("objectives").withIndex("by_key", (q) => q.eq("key", key)).unique();
    const data = (row as any).data;
    await ctx.db.patch((row as any)._id, {
      data: {
        ...data,
        companyArtifacts: (data.companyArtifacts ?? []).map((a: any) =>
          a.key === ARTIFACT ? { ...a, version: 2, content: REALISTIC_DRAFT, history: [...(a.history ?? [])] } : a,
        ),
      },
    } as never);
    await ctx.db.insert("evidence", {
      objectiveKey: key,
      evidenceId: "ev_gate_owned_1",
      data: {
        sourceClass: "company_record",
        label: CANONICAL_COMPANY_RECORD.label,
        text: CANONICAL_COMPANY_RECORD.text,
        origin: "application_observation",
        sourceId: `record:${CANONICAL_COMPANY_RECORD.ref}`,
        recordRef: CANONICAL_COMPANY_RECORD.ref,
        observedAt: Date.now(),
        recordedBy: "gate_preflight_seed",
        runId: runId ?? "run_seed",
      },
    } as never);
  });
  return "artifact v2 seeded with a realistic relaunch draft (worker did not produce a revision)";
}

/* ───────────────────────────── boundary records ───────────────────────────── */

type Klass = "ok" | "unsupported_route" | "provider_failure" | "structural" | "tool_not_called" | "not_reached" | "skipped" | "seed_error";
type BoundaryRecord = {
  boundary: number;
  name: string;
  productionEntry: string;
  seeding: string;
  classification: Klass;
  classificationReason: string;
  schemaAccepted: boolean | null;
  parseSuccess: boolean | null;
  applicationValidation: boolean | null;
  repairInvoked: boolean | null;
  repairSucceeded: boolean | null;
  providerFailureClass: string | null;
  logicalCalls: number | null;
  httpCalls: number;
  workerToolCall?: boolean;
  workerToolResultConsumed?: boolean;
  requestModel: string | null;
  resolvedModel: string | null;
  resolvedProvider: string | null;
  finishReasons: string[];
  promptTokens: number;
  completionTokens: number;
  costUsd: number;
  elapsedMs: number;
  http: HttpRec[];
  outcome: Record<string, unknown>;
  notes: string[];
};

function baseRecord(boundary: number, name: string, entry: string): BoundaryRecord {
  return {
    boundary, name, productionEntry: entry, seeding: "", classification: "not_reached", classificationReason: "",
    schemaAccepted: null, parseSuccess: null, applicationValidation: null, repairInvoked: null, repairSucceeded: null,
    providerFailureClass: null, logicalCalls: null, httpCalls: 0, requestModel: null, resolvedModel: null, resolvedProvider: null,
    finishReasons: [], promptTokens: 0, completionTokens: 0, costUsd: 0, elapsedMs: 0, http: [], outcome: {}, notes: [],
  };
}

function fillFromHttp(rec: BoundaryRecord, recs: HttpRec[]) {
  rec.http = recs;
  rec.httpCalls = recs.length;
  const ok = recs.filter((r) => r.status === 200);
  rec.requestModel = recs[0]?.requestModel ?? null;
  rec.resolvedModel = ok.at(-1)?.resolvedModel ?? null;
  rec.resolvedProvider = ok.at(-1)?.resolvedProvider ?? null;
  rec.finishReasons = ok.map((r) => r.finishReason ?? "null");
  rec.promptTokens = recs.reduce((s, r) => s + (r.promptTokens ?? 0), 0);
  rec.completionTokens = recs.reduce((s, r) => s + (r.completionTokens ?? 0), 0);
  rec.costUsd = recs.reduce((s, r) => s + (r.costUsd ?? 0), 0);
  rec.elapsedMs = recs.reduce((s, r) => s + r.elapsedMs, 0);
  const anyOk = ok.length > 0;
  rec.schemaAccepted = recs.length === 0 ? null : recs.some((r) => r.status === 400 || r.status === 404 || r.status === 422) && !anyOk ? false : anyOk ? true : null;
  const structured = ok.filter((r) => r.hasResponseFormatJsonSchema);
  if (structured.length) {
    rec.parseSuccess = structured.at(-1)!.jsonParses;
    rec.applicationValidation = structured.at(-1)!.appValid;
  }
  rec.repairInvoked = recs.some((r) => r.isRepairRequest);
  if (rec.repairInvoked) rec.repairSucceeded = structured.at(-1)?.appValid === true && structured.at(-1)!.isRepairRequest;
}

function classifyFailure(recs: HttpRec[]): { klass: Klass; reason: string; providerClass: string | null } {
  const last = recs.at(-1);
  if (!last) return { klass: "not_reached", reason: "no HTTP call reached the provider", providerClass: null };
  const bad = [...recs].reverse().find((r) => r.status !== 200);
  if (last.status !== 200) {
    if (last.status === 400 || last.status === 404 || last.status === 405 || last.status === 422)
      return { klass: "unsupported_route", reason: `HTTP ${last.status}: ${last.errorSnippet ?? ""}`.slice(0, 220), providerClass: null };
    const pc = classifyProviderFailure({ status: last.status || undefined, message: `${last.transportError ?? last.errorSnippet ?? ""}` });
    return { klass: "provider_failure", reason: `HTTP ${last.status || "transport"}: ${last.transportError ?? last.errorSnippet ?? ""}`.slice(0, 220), providerClass: pc };
  }
  if (last.contentEmpty && !last.hasToolCalls)
    return { klass: "provider_failure", reason: `empty response (finish_reason=${last.finishReason})`, providerClass: "empty_response" };
  if (last.hasResponseFormatJsonSchema && last.appValid === false)
    return { klass: "structural", reason: last.jsonParses ? `answered but invalid: ${last.appIssues.join(" | ")}`.slice(0, 220) : "answered but not valid JSON", providerClass: null };
  void bad;
  return { klass: "provider_failure", reason: "unclassified failure with 200 responses", providerClass: null };
}

/* ───────────────────────────── main ───────────────────────────── */

const startedAt = new Date();
const records: BoundaryRecord[] = [];
const runNotes: string[] = [];

function evidencePath(): string {
  const safe = MODEL_SLUG.replace(/[\/:]/g, "_");
  const ts = startedAt.toISOString().replace(/[-:]/g, "").replace(/\.\d+Z$/, "Z");
  return path.join(repoRoot, "docs", "work", "gate-evidence", `preflight-${safe}-${ts}${DRY ? "-DRY" : ""}.json`);
}

function summarize(exitReason?: string) {
  const byClass: Record<string, number> = {};
  for (const r of records) byClass[r.classification] = (byClass[r.classification] ?? 0) + 1;
  const ran = records.filter((r) => r.classification !== "skipped");
  return {
    slug: MODEL_SLUG,
    dryRun: DRY,
    startedAtUtc: startedAt.toISOString(),
    finishedAtUtc: new Date().toISOString(),
    allBoundariesOk: ran.length > 0 && ran.every((r) => r.classification === "ok"),
    classificationCounts: byClass,
    totalHttpCalls: httpRecords.length,
    totalCostUsd: Number(cumulativeCost.toFixed(6)),
    costReportedByProvider: costReportedAny,
    costCapUsd: COST_CAP_USD,
    aborted: exitReason ?? null,
    suppressedConvexScheduledTimers: scheduledSuppressed.length,
  };
}

function writeEvidence(exitReason?: string): string {
  const file = evidencePath();
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const payload = { summary: summarize(exitReason), boundaries: records, runNotes, warnings, modelCallLogs };
  fs.writeFileSync(file, JSON.stringify(payload, null, 2));
  return file;
}

function printTable() {
  const rows = records.map((r) => {
    const h = r.http.filter((x) => x.status === 200).at(-1);
    return [
      String(r.boundary),
      r.name,
      r.classification,
      `${r.httpCalls}${r.http.some((x) => x.status !== 200) ? ` (${[...new Set(r.http.map((x) => x.status))].join("/")})` : ""}`,
      r.resolvedModel ?? "-",
      r.resolvedProvider ?? "-",
      r.finishReasons.at(-1) ?? "-",
      `${r.promptTokens}/${r.completionTokens}`,
      `$${r.costUsd.toFixed(4)}`,
      r.logicalCalls == null ? "-" : String(r.logicalCalls),
      r.repairInvoked == null ? "-" : r.repairInvoked ? (r.repairSucceeded ? "yes/ok" : "yes/fail") : "no",
      r.boundary === 4 ? (r.workerToolCall ? (r.workerToolResultConsumed ? "tool+consumed" : "tool") : "no tool") : `${h?.jsonParses === true ? "parse" : h ? "noparse" : "-"}/${h?.appValid === true ? "valid" : h ? "invalid" : "-"}`,
      `${(r.elapsedMs / 1000).toFixed(1)}s`,
    ];
  });
  const head = ["#", "boundary", "class", "http", "resolved model", "provider", "finish", "tok in/out", "cost", "logical", "repair", "parse/valid", "time"];
  const line = (cells: string[]) => `| ${cells.join(" | ")} |`;
  out(line(head));
  out(line(head.map(() => "---")));
  for (const r of rows) out(line(r));
  out("");
  for (const r of records) if (r.classification !== "ok" && r.classification !== "skipped") out(`- B${r.boundary} ${r.classification}: ${r.classificationReason}`);
}

finalizeAndExit = (code: number, reason?: string): never => {
  try {
    const file = writeEvidence(reason ?? "aborted");
    out(`ABORT: ${reason} — partial evidence: ${path.relative(repoRoot, file)}`);
  } catch {
    /* best effort */
  }
  process.exit(code);
};

async function withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<{ timedOut: boolean; value?: T; error?: unknown }> {
  let timer: any;
  const timeout = new Promise<{ timedOut: true }>((resolve) => {
    timer = realSetTimeout(() => resolve({ timedOut: true }), ms);
  });
  try {
    const r = await Promise.race([p.then((value) => ({ timedOut: false as const, value })), timeout]);
    return r as any;
  } catch (error) {
    return { timedOut: false, error };
  } finally {
    realClearTimeout(timer);
    void label;
  }
}

function slice(tag: string, from: number): HttpRec[] {
  return httpRecords.filter((r) => r.tag === tag && r.seq > from);
}

async function main() {
  const t = convexTest(schema, modules);
  const skipRec = (n: number, name: string, entry: string): BoundaryRecord => {
    const r = baseRecord(n, name, entry);
    r.classification = "skipped";
    r.classificationReason = "not selected via --boundaries";
    return r;
  };

  // Shared chain state.
  let key: string | null = null;
  let chainedReal = false; // interpretation produced by the real model
  let runId: string | null = null;
  let assignmentSource = "";

  /* ── Boundary 1: interpretation ── */
  const b1 = baseRecord(1, "interpretation structured output", "proposeInterpretation (convex/objectiveRunner.ts) via beginInterpretation");
  if (wanted.has(1)) {
    key = await newObjective(t);
    currentTag = "b1";
    const seq0 = httpRecords.length;
    const calls0 = (await budgetCalls(t, key)) ?? 0;
    const began = await t.mutation(async (ctx) => H(beginInterpretation)._handler(ctx, { objectiveKey: key, at: Date.now() }));
    b1.seeding = "production setupCanonicalDemoObjective (canonical founder request, seed artifact, spend grant) + beginInterpretation reservation";
    if (!began.proceed) {
      b1.classification = "seed_error";
      b1.classificationReason = `beginInterpretation refused: ${began.reason}`;
    } else {
      const res = await withTimeout(
        t.action(async (ctx) =>
          H(proposeInterpretation)._handler(ctx, {
            objectiveKey: key,
            requestId: began.requestId,
            request: began.request,
            founderResolvedQuestions: began.resolvedQuestions,
          }),
        ),
        200_000,
        "b1",
      );
      const recs = slice("b1", seq0);
      fillFromHttp(b1, recs);
      b1.logicalCalls = ((await budgetCalls(t, key)) ?? 0) - calls0;
      const obj = await readObj(t, key);
      const mgmt = obj?.management ?? {};
      b1.outcome = {
        actionResult: res.timedOut ? "TIMEOUT" : res.error ? `threw: ${String((res.error as Error).message).slice(0, 160)}` : { ok: res.value?.ok, detail: String(res.value?.detail ?? "").slice(0, 200) },
        interpretationStatus: mgmt.interpretationStatus ?? null,
        contractPersisted: typeof mgmt.contractId === "string" && !!mgmt.contractId,
        interpretationDetail: mgmt.interpretationDetail ? String(mgmt.interpretationDetail).slice(0, 200) : null,
      };
      if (res.timedOut) {
        b1.classification = "provider_failure";
        b1.classificationReason = "boundary timeout (200s)";
        b1.providerFailureClass = "timeout";
      } else if (!res.error && res.value?.ok === true && (b1.outcome as any).contractPersisted) {
        b1.classification = "ok";
        b1.classificationReason = "contract persisted from real model output";
        chainedReal = true;
        if (b1.repairInvoked) b1.repairSucceeded = true;
      } else {
        const f = classifyFailure(recs);
        b1.classification = f.klass;
        b1.classificationReason = f.reason;
        b1.providerFailureClass = f.providerClass;
        if (b1.repairInvoked) b1.repairSucceeded = false;
      }
      b1.notes.push(`repair re-asks visible in HTTP: ${recs.filter((r) => r.isRepairRequest).length}`);
    }
    records.push(b1);
  } else {
    records.push(skipRec(1, b1.name, b1.productionEntry));
  }

  /* ── Boundaries 2 + 3: strategy + recommendation (one proposeDecision) ── */
  const b2 = baseRecord(2, "managerial strategy structured output", "proposeDecision → proposeStrategyWithModel (kind=strategy)");
  const b3 = baseRecord(3, "managerial recommendation structured output", "proposeDecision → recommendWithModel (kind=recommendation)");
  const needDecision = wanted.has(2) || wanted.has(3) || wanted.has(4) || wanted.has(5);
  let decisionChainOk = false;
  if (needDecision) {
    const seedNotes: string[] = [];
    if (!key || !chainedReal) {
      if (!key || wanted.has(1)) {
        // interpretation failed (or not selected): fresh objective + canned interpretation
        key = await newObjective(t);
      }
      await cannedInterpret(t, key);
      seedNotes.push("interpretation seeded via canned applyInterpretation (production mutation) with a realistic founder objective");
      chainedReal = false;
    } else {
      seedNotes.push("interpretation chained from the REAL boundary-1 model output");
    }
    await invokePass(t, key, "objective_submitted");
    const pending = await pendingDecision(t, key);
    if (!pending) {
      const why = "runManagementPass did not reserve a pendingDecision";
      for (const [n, r] of [[2, b2], [3, b3]] as const) {
        if (wanted.has(n)) {
          r.classification = "seed_error";
          r.classificationReason = why;
          r.seeding = seedNotes.join("; ");
          records.push(r);
        } else records.push(skipRec(n, r.name, r.productionEntry));
      }
    } else if (wanted.has(2) || wanted.has(3)) {
      currentTag = "b23";
      const seq0 = httpRecords.length;
      const calls0 = (await budgetCalls(t, key)) ?? 0;
      const res = await withTimeout(
        t.action(async (ctx) =>
          H(proposeDecision)._handler(ctx, {
            objectiveKey: key,
            requestId: pending.requestId,
            requirementKey: pending.requirementKey,
            contractRevision: pending.contractRevision,
          }),
        ),
        400_000,
        "b23",
      );
      const all = slice("b23", seq0);
      const logical = ((await budgetCalls(t, key)) ?? 0) - calls0;
      const reqs = await readReqs(t, key);
      const req = reqs.find((r) => r.requirementKey === pending.requirementKey);
      const obj = await readObj(t, key);
      const actionResult = res.timedOut ? "TIMEOUT" : res.error ? `threw: ${String((res.error as Error).message).slice(0, 160)}` : { ok: res.value?.ok, detail: String(res.value?.detail ?? "").slice(0, 200) };
      const decisionOutcome = { actionResult, requirementStrategy: req?.strategy ?? null, requirementState: req?.state ?? null, pendingDecisionCleared: !obj?.management?.pendingDecision };
      const parts: Array<[number, BoundaryRecord, string]> = [
        [2, b2, "strategy_proposal"],
        [3, b3, "managerial_recommendation"],
      ];
      for (const [n, r, schemaName] of parts) {
        if (!wanted.has(n)) {
          records.push(skipRec(n, r.name, r.productionEntry));
          continue;
        }
        const recs = all.filter((x) => x.schemaName === schemaName);
        r.seeding = `${seedNotes.join("; ")}; production runManagementPass reserved pendingDecision`;
        fillFromHttp(r, recs);
        r.logicalCalls = logical; // action-level (strategy+recommendation share one action ledger)
        r.outcome = { ...decisionOutcome, modelCallLogsForKind: modelCallLogs.filter((m) => m.tag === "b23" && m.kind === (n === 2 ? "strategy" : "recommendation")).length, actionLogicalCallsSharedByB2B3: logical };
        const last = recs.at(-1);
        if (res.timedOut && !last) {
          r.classification = "provider_failure";
          r.classificationReason = "boundary timeout";
          r.providerFailureClass = "timeout";
        } else if (last && last.status === 200 && last.appValid === true) {
          r.classification = "ok";
          r.classificationReason = "answer parsed and passed production structural validation";
          if (r.repairInvoked) r.repairSucceeded = true;
        } else if (!last && n === 3 && b2.classification !== "ok") {
          r.classification = "not_reached";
          r.classificationReason = "strategy step did not succeed, recommendation never asked";
        } else if (!last && n === 3) {
          r.classification = "not_reached";
          r.classificationReason = `recommendation not asked (zero eligible options or decision short-circuited): ${JSON.stringify(actionResult).slice(0, 160)}`;
        } else {
          const f = classifyFailure(recs);
          r.classification = f.klass;
          r.classificationReason = f.reason;
          r.providerFailureClass = f.providerClass;
          if (r.repairInvoked) r.repairSucceeded = false;
        }
        records.push(r);
      }
      decisionChainOk = req?.strategy === "MAKE";
      if (decisionChainOk) {
        const asg = await dispatchAndGetRun(t, key);
        if (asg) {
          runId = asg.runId;
          assignmentSource = "assignment produced by the REAL model decision (proposeDecision → applyDecision MAKE → dispatch)";
        }
      }
    }
  }

  /* ── Boundary 4: worker actual tool call + tool result consumption ── */
  const b4 = baseRecord(4, "worker tool call + tool-result consumption", "executeWorker → runWorker (lib/worker/runtime.ts) with makeConvexPort");
  let workerKey = key;
  if (wanted.has(4) || wanted.has(5)) {
    if (!runId) {
      // Real decision did not yield a MAKE assignment: build one via canned decision on a fresh canned objective.
      workerKey = await newObjective(t);
      await cannedInterpret(t, workerKey);
      const asg = await cannedMakeAssignment(t, workerKey);
      if (asg) {
        runId = asg.runId;
        assignmentSource = "assignment seeded through production canned MAKE decision (real decision did not yield a MAKE assignment or was not run)";
      }
      key = workerKey;
    }
  }
  if (wanted.has(4)) {
    if (!runId || !workerKey) {
      b4.classification = "seed_error";
      b4.classificationReason = "could not obtain an active assignment/run to execute";
      records.push(b4);
    } else {
      currentTag = "b4";
      const seq0 = httpRecords.length;
      const res = await withTimeout(
        t.action(async (ctx) => H(executeWorker)._handler(ctx, { objectiveKey: workerKey, runId })),
        300_000,
        "b4",
      );
      const recs = slice("b4", seq0);
      fillFromHttp(b4, recs);
      b4.seeding = assignmentSource;
      const events = await readEvents(t, workerKey).catch(() => []);
      const telem = events.map((e) => e.text).filter((x) => /Worker telemetry:/.test(x)).at(-1) ?? null;
      const obj = await readObj(t, workerKey);
      b4.workerToolCall = recs.some((r) => r.hasToolCalls);
      b4.workerToolResultConsumed = recs.some((r) => r.hasToolResultMessage && r.status === 200);
      b4.logicalCalls = recs.filter((r) => r.status === 200).length; // worker HTTP turns; no management ledger for workers
      b4.outcome = {
        actionResult: res.timedOut ? "TIMEOUT" : res.error ? `threw: ${String((res.error as Error).message).slice(0, 160)}` : res.value,
        workerTelemetry: telem ? telem.slice(0, 300) : null,
        toolNamesRequested: [...new Set(recs.flatMap((r) => r.toolCallNames))],
        httpTurns: recs.length,
        runStatus: obj?.run?.status ?? obj?.workItems?.[0]?.runs?.[0]?.status ?? null,
        failureSummary: obj?.workItems?.[0]?.runs?.[0]?.status === "failed" ? String(obj?.workItems?.[0]?.runs?.[0]?.summary ?? "").slice(0, 200) : null,
        resultPersisted: obj?.result != null,
      };
      if (res.timedOut) {
        b4.classification = "provider_failure";
        b4.classificationReason = "boundary timeout (300s)";
        b4.providerFailureClass = "timeout";
      } else if (recs.length === 0) {
        b4.classification = "not_reached";
        b4.classificationReason = "worker made no HTTP call";
      } else if (recs.every((r) => r.status !== 200)) {
        const f = classifyFailure(recs);
        b4.classification = f.klass;
        b4.classificationReason = f.reason;
        b4.providerFailureClass = f.providerClass;
      } else if (!b4.workerToolCall) {
        b4.classification = "tool_not_called";
        b4.classificationReason = "provider answered 200 but no response carried tool_calls";
      } else if (!b4.workerToolResultConsumed) {
        b4.classification = "tool_not_called";
        b4.classificationReason = "tool call emitted but the loop never fed a tool result back for another model turn";
      } else {
        b4.classification = "ok";
        b4.classificationReason = `tool call(s) ${[...new Set(recs.flatMap((r) => r.toolCallNames))].join(",")} executed via governed port; tool result consumed in a subsequent model turn`;
        if (recs.some((r) => r.status !== 200)) b4.notes.push("some HTTP attempts failed (SDK retry) but the loop completed");
      }
      records.push(b4);
    }
  } else records.push(skipRec(4, b4.name, b4.productionEntry));

  /* ── Boundary 5: final semantic assessment ── */
  const b5 = baseRecord(5, "final semantic assessment structured output", "proposeFinalSemanticAssessment via beginFinalSemanticAssessment");
  if (wanted.has(5)) {
    if (!key) {
      b5.classification = "seed_error";
      b5.classificationReason = "no objective available";
      records.push(b5);
    } else {
      const artNote = await stageRealisticArtifactIfUntouched(t, key, runId);
      const began = await t.mutation(async (ctx) => H(beginFinalSemanticAssessment)._handler(ctx, { objectiveKey: key, at: Date.now() }));
      b5.seeding = `${assignmentSource || "objective chain"}; ${artNote}; production beginFinalSemanticAssessment reservation`;
      if (!began.proceed) {
        b5.classification = "seed_error";
        b5.classificationReason = `beginFinalSemanticAssessment refused: ${began.reason}`;
        records.push(b5);
      } else {
        currentTag = "b5";
        const seq0 = httpRecords.length;
        const calls0 = (await budgetCalls(t, key)) ?? 0;
        const revision = ((await readObj(t, key))?.management?.currentContractRevision as number | undefined) ?? 1;
        const res = await withTimeout(
          t.action(async (ctx) => H(proposeFinalSemanticAssessment)._handler(ctx, { objectiveKey: key, requestId: began.requestId, contractRevision: revision })),
          200_000,
          "b5",
        );
        const recs = slice("b5", seq0);
        fillFromHttp(b5, recs);
        b5.logicalCalls = ((await budgetCalls(t, key)) ?? 0) - calls0;
        const obj = await readObj(t, key);
        const m = obj?.management ?? {};
        const persisted = obj?.finalSemanticAssessment ?? null;
        const events = await readEvents(t, key).catch(() => []);
        b5.outcome = {
          actionResult: res.timedOut ? "TIMEOUT" : res.error ? `threw: ${String((res.error as Error).message).slice(0, 160)}` : "returned null",
          assessmentPersisted: persisted != null,
          meetsMinimumBar: persisted?.meetsMinimumBar ?? null,
          evidenceRefsCount: Array.isArray(persisted?.evidenceRefs) ? persisted.evidenceRefs.length : null,
          pendingFinalAssessmentCleared: !m.pendingFinalAssessment,
          providerFailures: m.finalAssessmentProviderFailures ?? 0,
          structuralFailures: m.finalAssessmentStructuralFailures ?? 0,
          lastFailureEvent: events.map((e) => e.text).filter((x) => /final assessment/i.test(x)).at(-1)?.slice(0, 200) ?? null,
        };
        if (res.timedOut) {
          b5.classification = "provider_failure";
          b5.classificationReason = "boundary timeout (200s)";
          b5.providerFailureClass = "timeout";
        } else if (persisted != null) {
          b5.classification = "ok";
          b5.classificationReason = "assessment parsed, validated and persisted by applyFinalSemanticAssessment";
          if (b5.repairInvoked) b5.repairSucceeded = true;
        } else {
          const f = classifyFailure(recs);
          b5.classification = f.klass;
          b5.classificationReason = f.reason;
          b5.providerFailureClass = f.providerClass;
          if (b5.repairInvoked) b5.repairSucceeded = false;
        }
        records.push(b5);
      }
    }
  } else records.push(skipRec(5, b5.name, b5.productionEntry));

  records.sort((a, b) => a.boundary - b.boundary);
  void decisionChainOk;
}

main()
  .then(() => {
    const file = writeEvidence();
    out(`\nmodel: ${MODEL_SLUG}${DRY ? "  (DRY RUN: synthetic local replies, no network)" : ""}`);
    printTable();
    out(`\ntotal reported cost: $${cumulativeCost.toFixed(4)} over ${httpRecords.length} HTTP call(s)${costReportedAny ? "" : " (provider reported no usage.cost)"}`);
    out(`evidence: ${path.relative(repoRoot, file)}`);
    process.exit(records.some((r) => r.classification !== "ok" && r.classification !== "skipped") ? 1 : 0);
  })
  .catch((error) => {
    runNotes.push(`fatal: ${error instanceof Error ? error.stack?.split("\n").slice(0, 6).join(" | ") : String(error)}`.slice(0, 600));
    const file = writeEvidence("fatal");
    out(`FATAL (${error instanceof Error ? error.message : error}); partial evidence: ${path.relative(repoRoot, file)}`);
    process.exit(4);
  });

void notes;
