// Replay-mode authority isolation. The public replay website must have no
// path to Convex, Product Commands, models, JEV, payment, merchant or wallet
// code — proven structurally (import graph) and behaviourally (routes).

import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { isValidElement } from "react";

const ROOT = join(__dirname, "..");

// Route modules import CSS for Next.js; make those imports inert under node:test.
// eslint-disable-next-line @typescript-eslint/no-require-imports
(require as unknown as { extensions: Record<string, (m: unknown) => void> }).extensions[".css"] = () => {};

const REPLAY_ENTRYPOINTS = [
  "app/replay/ReplayWorkspace.tsx",
  "app/replay/ReplayStartContainer.tsx",
];

// Any of these in the replay import graph would give the public site backend,
// model, market or payment reach.
const FORBIDDEN_SPECIFIERS = [
  /^convex(\/|$)/,
  /convex\/_generated/,
  /^@\/convex/,
  /(^|\/)convex\//,
  /^openai$/,
  /^@openai\//,
  /^ai$/,
  /^@langchain\//,
  /^@okxweb3\//,
  /^express$/,
  /^googleapis$/,
  /lib\/(payment|market|jev|workforce|management|model|integration\/okx)/,
];

// Network / write primitives that must not appear anywhere in replay code.
const FORBIDDEN_SOURCE = [
  /\buseMutation\b/,
  /\buseAction\b/,
  /\bfetch\s*\(/,
  /\bXMLHttpRequest\b/,
  /\bWebSocket\b/,
  /\bEventSource\b/,
  /\bsendBeacon\b/,
  /createObjectiveV1/,
  /submitAttentionActionV1/,
];

function resolveImport(fromFile: string, spec: string): string | null {
  let base: string;
  if (spec.startsWith("@/")) base = join(ROOT, spec.slice(2));
  else if (spec.startsWith(".")) base = resolve(dirname(fromFile), spec);
  else return null;
  for (const candidate of [base, `${base}.ts`, `${base}.tsx`, join(base, "index.ts"), join(base, "index.tsx")]) {
    if (existsSync(candidate) && !candidate.endsWith(".css") && /\.(ts|tsx)$/.test(candidate)) return candidate;
  }
  return null;
}

function importsOf(src: string): string[] {
  const specs: string[] = [];
  const re = /(?:import|export)\s+(?:type\s+)?(?:[^"';]*?\s+from\s+)?["']([^"']+)["']|import\(\s*["']([^"']+)["']\s*\)/g;
  for (const m of src.matchAll(re)) specs.push((m[1] ?? m[2])!);
  return specs;
}

function isTypeOnlyImport(src: string, spec: string): boolean {
  const escaped = spec.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`import\\s+type\\s+[^;]*?from\\s+["']${escaped}["']`).test(src);
}

function replayGraph(): Map<string, string> {
  const seen = new Map<string, string>();
  const queue = REPLAY_ENTRYPOINTS.map((p) => join(ROOT, p));
  while (queue.length) {
    const file = queue.pop()!;
    if (seen.has(file)) continue;
    const src = readFileSync(file, "utf8");
    seen.set(file, src);
    for (const spec of importsOf(src)) {
      if (isTypeOnlyImport(src, spec)) continue; // erased at compile time
      const next = resolveImport(file, spec);
      if (next) queue.push(next);
    }
  }
  return seen;
}

test("replay import graph never reaches Convex, models, market, payment or wallet code", () => {
  const graph = replayGraph();
  assert.ok(graph.size > 5, "graph walk should cover the replay UI");
  for (const [file, src] of graph) {
    for (const spec of importsOf(src)) {
      if (isTypeOnlyImport(src, spec)) continue;
      for (const forbidden of FORBIDDEN_SPECIFIERS) {
        assert.ok(!forbidden.test(spec), `${file} imports forbidden module "${spec}"`);
      }
    }
  }
});

test("replay code contains no mutation hooks, Product Commands or network primitives", () => {
  for (const [file, src] of replayGraph()) {
    const code = src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
    for (const forbidden of FORBIDDEN_SOURCE) {
      assert.ok(!forbidden.test(code), `${file} contains forbidden ${forbidden}`);
    }
  }
});

function withMode<T>(mode: string | undefined, fn: () => T): T {
  const prev = process.env.NEXT_PUBLIC_SOMEBODY_MODE;
  if (mode === undefined) delete process.env.NEXT_PUBLIC_SOMEBODY_MODE;
  else process.env.NEXT_PUBLIC_SOMEBODY_MODE = mode;
  try {
    return fn();
  } finally {
    if (prev === undefined) delete process.env.NEXT_PUBLIC_SOMEBODY_MODE;
    else process.env.NEXT_PUBLIC_SOMEBODY_MODE = prev;
  }
}

async function withModeAsync<T>(mode: string | undefined, fn: () => Promise<T>): Promise<T> {
  const prev = process.env.NEXT_PUBLIC_SOMEBODY_MODE;
  if (mode === undefined) delete process.env.NEXT_PUBLIC_SOMEBODY_MODE;
  else process.env.NEXT_PUBLIC_SOMEBODY_MODE = mode;
  try {
    return await fn();
  } finally {
    if (prev === undefined) delete process.env.NEXT_PUBLIC_SOMEBODY_MODE;
    else process.env.NEXT_PUBLIC_SOMEBODY_MODE = prev;
  }
}

test("mode parsing defaults to live; only an explicit replay value enables replay", async () => {
  const { parseSomebodyMode } = await import("../lib/product/mode");
  assert.equal(parseSomebodyMode(undefined), "live");
  assert.equal(parseSomebodyMode(""), "live");
  assert.equal(parseSomebodyMode("live"), "live");
  assert.equal(parseSomebodyMode("something"), "live");
  assert.equal(parseSomebodyMode("replay"), "replay");
  assert.equal(parseSomebodyMode(" Replay "), "replay");
});

test("replay / renders the replay workspace (no Convex provider); live / renders the Convex product", async () => {
  const { default: Home } = await import("../app/page");
  const { ReplayWorkspace } = await import("../app/replay/ReplayWorkspace");
  const { ConvexClientProvider } = await import("../app/ConvexClientProvider");

  const replay = await withModeAsync("replay", () => Home({ searchParams: Promise.resolve({ replay: "run" }) }));
  assert.ok(isValidElement(replay));
  assert.equal(replay.type, ReplayWorkspace);

  const live = await withModeAsync(undefined, () => Home({ searchParams: Promise.resolve({}) }));
  assert.ok(isValidElement(live));
  assert.equal(live.type, ConvexClientProvider);
});

test("replay / without the replay flag redirects to /start", async () => {
  const { default: Home } = await import("../app/page");
  await assert.rejects(
    withModeAsync("replay", () => Home({ searchParams: Promise.resolve({}) })),
    (err: unknown) => String((err as { digest?: string }).digest ?? err).includes("NEXT_REDIRECT") && String((err as { digest?: string }).digest).includes("/start"),
  );
});

test("replay /start renders the replay container; live /start keeps the Create Objective container", async () => {
  const { default: StartPage } = await import("../app/start/page");
  const { ReplayStartContainer } = await import("../app/replay/ReplayStartContainer");
  const { ConvexClientProvider } = await import("../app/ConvexClientProvider");
  const replay = withMode("replay", () => StartPage());
  assert.equal(isValidElement(replay) && replay.type, ReplayStartContainer);
  const live = withMode("live", () => StartPage());
  assert.equal(isValidElement(live) && live.type, ConvexClientProvider);
  const liveSrc = readFileSync(join(ROOT, "app/start/StartContainer.tsx"), "utf8");
  assert.ok(liveSrc.includes("api.productCommands.createObjectiveV1"), "live create flow unchanged");
});

test("replay mode 404s the legacy /m5 surfaces", async () => {
  const { default: M5Layout } = await import("../app/m5/layout");
  assert.throws(
    () => withMode("replay", () => M5Layout({ children: null })),
    (err: unknown) => String((err as { digest?: string }).digest ?? err).includes("NEXT_HTTP_ERROR_FALLBACK;404"),
  );
  assert.doesNotThrow(() => withMode("live", () => M5Layout({ children: null })));
});

test("replay mode 404s the OKX discovery API before reading the request", async () => {
  const { POST } = await import("../app/api/okx/discover/route");
  let bodyRead = false;
  const req = {
    json: async () => {
      bodyRead = true;
      return {};
    },
  } as unknown as Request;
  const res = await withModeAsync("replay", () => POST(req));
  assert.equal(res.status, 404);
  assert.equal(bodyRead, false);
});

test("the replay workspace passes no attention handler, so spend approval is unreachable", () => {
  const src = readFileSync(join(ROOT, "app/replay/ReplayWorkspace.tsx"), "utf8");
  assert.ok(src.includes('mode="replay"'));
  assert.ok(!src.includes("onAttentionAction"), "replay must not wire an attention action handler");
});

test("public deployment needs no secret environment variables in replay code", () => {
  const secretNames = [
    "OPENROUTER_API_KEY",
    "OPENAI_API_KEY",
    "AI_GATEWAY_API_KEY",
    "OKX_API_KEY",
    "OKX_SECRET_KEY",
    "OKX_API_PASSPHRASE",
    "M4_M3_DRIVER_TOKEN",
    "M4_M3_FACT_ATTESTATION_KEY",
    "NEXT_PUBLIC_CONVEX_URL",
  ];
  for (const [file, src] of replayGraph()) {
    for (const name of secretNames) {
      assert.ok(!src.includes(name), `${file} references ${name}`);
    }
  }
});
