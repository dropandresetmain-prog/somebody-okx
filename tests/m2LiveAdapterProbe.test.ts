// Milestone 2 / F10 — production-boundary probe of the LIVE adapter
// (`callStructuredLive` inside proposeInterpretation), driven against a local
// stub of an OpenAI-compatible endpoint. No network, no cost, no secrets: it proves
// the real adapter's transport behavior (schema sent, fences stripped, unparseable
// text ⇒ STRUCTURAL and repaired, 429/empty ⇒ PROVIDER failure, logical-call
// accounting vs SDK-internal retries). It is NOT the multi-model portability gate.
import test, { mock, after as afterAll } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import type { AddressInfo } from "node:net";
import { convexTest } from "convex-test";
import schema from "../convex/schema";
import { proposeInterpretation } from "../convex/objectiveRunner";
import type { ObjectiveRecord } from "../lib/objective/types";

const modules = {
  "../convex/schema.ts": () => import("../convex/schema"),
  "../convex/objectiveValidators.ts": () => import("../convex/objectiveValidators"),
  "../convex/managementValidators.ts": () => import("../convex/managementValidators"),
  "../convex/workforceGuards.ts": () => import("../convex/workforceGuards"),
  "../convex/objectives.ts": () => import("../convex/objectives"),
  "../convex/objectiveRunner.ts": () => import("../convex/objectiveRunner"),
  "../convex/internal/workforce.ts": () => import("../convex/internal/workforce"),
  "../convex/management.ts": () => import("../convex/management"),
  "../convex/m3Driver.ts": () => import("../convex/m3Driver"),
  "../convex/_generated/api.d.ts": () => import("../convex/_generated/api"),
  "../convex/_generated/server.d.ts": () => import("../convex/_generated/server"),
  "../convex/_generated/dataModel.d.ts": () => import("../convex/_generated/dataModel"),
};

type Handler = { _handler: (c: unknown, a: Record<string, unknown>) => Promise<unknown> };
const now = 1_982_000_000_000;
const REQUEST = "Improve our relaunch messaging using the launch context.";

const good = {
  contract: {
    intent: "relaunch",
    levels: [{ levelKey: "relaunch_ready", statement: "ready", label: "Ready" }],
    minimumCompletionBar: "relaunch_ready",
    ambiguities: [],
  },
  requirements: [
    {
      requirementKey: "req_01",
      priority: "required",
      title: "Relaunch",
      mustBeTrue: "A relaunch recommendation is saved",
      scope: "deliverable",
      dependsOnRequirementKeys: [],
      requiredResourceClasses: [],
      expectedOutput: null,
      requirementKind: "deliverable",
    },
  ],
};

type Reply = { status: number; content?: string | null; finish?: string };
let replies: Reply[] = [];
const hits: Array<{ body: any }> = [];
const server = http.createServer((req, res) => {
  let raw = "";
  req.on("data", (c) => (raw += c));
  req.on("end", () => {
    hits.push({ body: JSON.parse(raw || "{}") });
    const reply = replies.shift() ?? { status: 500 };
    if (reply.status !== 200) {
      res.writeHead(reply.status, { "content-type": "application/json" });
      res.end(JSON.stringify({ error: { message: "stub failure", type: "stub" } }));
      return;
    }
    res.writeHead(200, { "content-type": "application/json" });
    res.end(
      JSON.stringify({
        id: "chatcmpl-stub",
        object: "chat.completion",
        created: 1,
        model: "stub-resolved-model",
        choices: [
          {
            index: 0,
            finish_reason: reply.finish ?? "stop",
            message: { role: "assistant", content: reply.content ?? null },
          },
        ],
        usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
      }),
    );
  });
});
const ready = new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));

const savedEnv = { ...process.env };
afterAll(() => {
  server.close();
  process.env = savedEnv;
  mock.timers.reset();
});

async function seedAndRun(label: string) {
  await ready;
  process.env.LIVE_AI_ENABLED = "true";
  process.env.AI_PROVIDER = "openai";
  process.env.OPENAI_API_KEY = "sk-stub-not-real";
  process.env.AI_MODEL = "stub-requested-model";
  process.env.OPENAI_BASE_URL = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  const t = convexTest(schema, modules);
  const key = `obj_probe_${label}`;
  await t.mutation(async (ctx) => {
    await ctx.db.insert("objectives", {
      key,
      data: {
        key,
        request: REQUEST,
        createdAt: now,
        updatedAt: now,
        state: "planning",
        activity: "interpreting",
        plan: null,
        workItems: [],
        run: null,
        result: null,
        companyArtifacts: [],
        management: { contractId: null, interpretationStatus: "pending", interpretationAttempts: 1 },
      } as never,
    });
  });
  const result = (await t.action(async (ctx) =>
    (proposeInterpretation as unknown as Handler)._handler(ctx, {
      objectiveKey: key,
      requestId: `interpret_${key}_a1`,
      request: REQUEST,
      founderResolvedQuestions: [],
    }),
  )) as { ok: boolean; detail: string };
  const obj = await t.query(async (ctx) => {
    const row = await ctx.db.query("objectives").withIndex("by_key", (q) => q.eq("key", key)).unique();
    return (row as { data: ObjectiveRecord & { management: Record<string, unknown> } }).data;
  });
  const budget = await t.query(async (ctx) => {
    const row = await ctx.db.query("objectiveBudgets").withIndex("by_objectiveKey", (q) => q.eq("objectiveKey", key)).unique();
    return (row as { data: { used: { modelCalls: number } } } | null)?.data ?? null;
  });
  return { result, obj, budget };
}

test("probe: strict schema sent w/o `order`; fenced JSON accepted; safe metadata; 1 logical call", async () => {
  mock.timers.reset();
  mock.timers.enable({ apis: ["setTimeout"] });
  hits.length = 0;
  replies = [{ status: 200, content: "```json\n" + JSON.stringify(good) + "\n```" }];
  const { result, obj, budget } = await seedAndRun("fenced");
  assert.equal(result.ok, true, result.detail);
  assert.equal(hits.length, 1);
  const body = hits[0]!.body;
  assert.equal(body.model, "stub-requested-model");
  assert.equal(body.response_format.json_schema.strict, true);
  const levelProps = body.response_format.json_schema.schema.properties.contract.properties.levels.items;
  assert.deepEqual(levelProps.required, ["levelKey", "statement", "label"], "level order is not model-authored");
  assert.equal(obj.management.interpretationStatus, "done");
  assert.equal(budget?.used.modelCalls, 1);
});

test("probe: prose (unparseable) answer is STRUCTURAL → exactly one repair re-ask carrying the error → accepted; 2 logical calls", async () => {
  mock.timers.reset();
  mock.timers.enable({ apis: ["setTimeout"] });
  hits.length = 0;
  replies = [
    { status: 200, content: "Sure! Here is the contract you asked for." },
    { status: 200, content: JSON.stringify(good) },
  ];
  const { result, budget } = await seedAndRun("prose");
  assert.equal(result.ok, true, result.detail);
  assert.equal(hits.length, 2);
  const repairUser = hits[1]!.body.messages.find((m: any) => m.role === "user").content as string;
  assert.match(repairUser, /REPAIR REQUEST/);
  assert.match(repairUser, /not valid JSON/);
  assert.match(repairUser, /Sure! Here is the contract/, "the model's own rejected answer is quoted back");
  assert.equal(budget?.used.modelCalls, 2);
});

test("probe: empty content is a PROVIDER failure — no repair re-ask, typed detail, 1 logical call", async () => {
  mock.timers.reset();
  mock.timers.enable({ apis: ["setTimeout"] });
  hits.length = 0;
  replies = [{ status: 200, content: null, finish: "length" }];
  const { result, obj, budget } = await seedAndRun("empty");
  assert.equal(result.ok, false);
  assert.equal(hits.length, 1, "no repair for a transport-level empty answer");
  assert.match(String(obj.management.interpretationDetail), /model unavailable \(empty_response\)/);
  assert.equal(budget?.used.modelCalls, 1);
});

test("probe: HTTP 429 is a PROVIDER failure; SDK-internal retry is telemetry, NOT a second logical call", async () => {
  mock.timers.reset(); // let the SDK's real backoff timer run
  hits.length = 0;
  replies = [{ status: 429 }, { status: 429 }];
  const { result, obj, budget } = await seedAndRun("ratelimit");
  assert.equal(result.ok, false);
  assert.equal(hits.length, 2, "SDK maxRetries=1 ⇒ two HTTP attempts for one logical call");
  assert.match(String(obj.management.interpretationDetail), /model unavailable \(rate_limit\)/);
  assert.equal(budget?.used.modelCalls, 1, "one logical application call, however many HTTP retries");
});
