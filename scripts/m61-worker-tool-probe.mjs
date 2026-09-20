/**
 * M6.1 CP-W1 isolated provider/tool probe.
 * Same OpenAIProvider + Runner + OpenRouter stack as live runWorker.
 * Does NOT touch Objectives, payments, or business state.
 *
 * Probe A: forced trivial tool (ping)
 * Probe B: ordinary text completion
 */
import { readFileSync } from "node:fs";
import { Agent, Runner, OpenAIProvider, tool } from "@openai/agents";
import { z } from "zod";

function loadEnvLocal() {
  const env = {};
  const text = readFileSync(".env.local", "utf8");
  for (const line of text.split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
    if (!m) continue;
    let v = m[2].trim();
    if (
      (v.startsWith('"') && v.endsWith('"')) ||
      (v.startsWith("'") && v.endsWith("'"))
    )
      v = v.slice(1, -1);
    env[m[1]] = v;
  }
  return env;
}

const fileEnv = loadEnvLocal();
const apiKey = process.env.OPENROUTER_API_KEY || fileEnv.OPENROUTER_API_KEY;
const model =
  process.env.AI_MODEL ||
  fileEnv.AI_MODEL ||
  "nvidia/nemotron-3-ultra-550b-a55b:free";
const altModel = process.env.ALT_AI_MODEL || "openai/gpt-4o-mini";

if (!apiKey) {
  console.error("Missing OPENROUTER_API_KEY");
  process.exit(1);
}

const baseURL = "https://openrouter.ai/api/v1";

function makeProvider() {
  return new OpenAIProvider({
    apiKey,
    baseURL,
    useResponses: false, // OpenRouter path matches runWorker
  });
}

async function probeB_text(label, modelId) {
  console.log(`\n=== Probe B (${label}): ordinary text ===`);
  console.log(`model=${modelId}`);
  const provider = makeProvider();
  const agent = new Agent({
    name: "Text Probe",
    model: modelId,
    instructions: "Reply with exactly the word PONG and nothing else.",
    tools: [],
  });
  const runner = new Runner({ modelProvider: provider, tracingDisabled: true });
  const started = Date.now();
  try {
    const result = await runner.run(agent, "Say PONG.", { maxTurns: 2 });
    const final =
      typeof result.finalOutput === "string"
        ? result.finalOutput
        : JSON.stringify(result.finalOutput);
    console.log(
      JSON.stringify(
        {
          ok: true,
          ms: Date.now() - started,
          finalOutput: String(final).slice(0, 200),
        },
        null,
        2,
      ),
    );
    return { ok: true, final };
  } catch (error) {
    console.log(
      JSON.stringify(
        {
          ok: false,
          ms: Date.now() - started,
          error: error instanceof Error ? error.message : String(error),
        },
        null,
        2,
      ),
    );
    return { ok: false, error };
  } finally {
    await provider.close?.();
  }
}

async function probeA_tool(label, modelId) {
  console.log(`\n=== Probe A (${label}): forced trivial tool ===`);
  console.log(`model=${modelId}`);
  let pingCalls = 0;
  const ping = tool({
    name: "ping",
    description: "Call this exactly once. Returns pong.",
    parameters: z.object({}),
    execute: async () => {
      pingCalls += 1;
      return "pong";
    },
  });

  const provider = makeProvider();
  const agent = new Agent({
    name: "Tool Probe",
    model: modelId,
    instructions:
      "You MUST call the ping tool exactly once before answering. After the tool returns, reply with DONE.",
    modelSettings: { parallelToolCalls: false, toolChoice: "required" },
    tools: [ping],
  });
  const runner = new Runner({ modelProvider: provider, tracingDisabled: true });
  const started = Date.now();
  try {
    const result = await runner.run(agent, "Call ping now.", { maxTurns: 4 });
    const final =
      typeof result.finalOutput === "string"
        ? result.finalOutput
        : JSON.stringify(result.finalOutput);
    const summary = {
      ok: pingCalls >= 1,
      ms: Date.now() - started,
      pingCalls,
      finalOutput: String(final).slice(0, 200),
      verdict:
        pingCalls >= 1
          ? "PASS: tool called through OpenAIProvider+Runner+OpenRouter"
          : "FAIL: model returned without calling ping",
    };
    console.log(JSON.stringify(summary, null, 2));
    return summary;
  } catch (error) {
    const summary = {
      ok: false,
      ms: Date.now() - started,
      pingCalls,
      error: error instanceof Error ? error.message : String(error),
      verdict: "FAIL: runner threw",
    };
    console.log(JSON.stringify(summary, null, 2));
    return summary;
  } finally {
    await provider.close?.();
  }
}

const target = process.argv[2] || "primary";
if (target === "primary" || target === "both") {
  await probeB_text("primary", model);
  await probeA_tool("primary", model);
}
if (target === "alt" || target === "both") {
  await probeB_text("alt", altModel);
  await probeA_tool("alt", altModel);
}
