/**
 * M6.1 CP-W4 physical A1 — one fresh WorkerRun, fail-fast.
 * PASS: validated gap / INPUT_BLOCKED, OR valid internal proof.
 * FAIL immediately: zero_progress / EXECUTION_FAILED / empty incomplete.
 * Optional STOP B only if A1 validates a gap (one redecision).
 */
import { readFileSync, writeFileSync } from "fs";
import { ConvexHttpClient } from "convex/browser";
import { anyApi } from "convex/server";

const env = readFileSync(".env.local", "utf8");
function requireEnv(name) {
  const match = env.match(new RegExp(`^\\s*${name}\\s*=\\s*(.+)$`, "m"));
  if (!match) throw new Error(`${name} missing`);
  return match[1].trim().replace(/^["']|["']$/g, "");
}

const client = new ConvexHttpClient(requireEnv("NEXT_PUBLIC_CONVEX_URL"));
const operatorToken = requireEnv("SOMEBODY_DEMO_OPERATOR_TOKEN");
const api = anyApi;
const allowStopB = process.argv.includes("--stop-b");

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function snap(objectiveKey) {
  const raw = await client.query(api.objectives.getObjective, { objectiveKey });
  const record = raw?.record ?? raw?.data ?? raw ?? {};
  const data = record.data ?? record;
  const mgmt = data.management ?? {};
  const needs = data.resourceNeeds ?? [];
  const validated = needs.filter(
    (n) =>
      n &&
      (n.status === "active" || n.status === "sourcing" || n.status === "buy_pending") &&
      (n.validationAuthority === "application" || n.validationAuthority == null),
  );
  const runs = data.workItems?.[0]?.runs ?? [];
  const latestRun = runs[runs.length - 1] ?? data.run ?? null;
  const evidence = (raw?.evidence ?? data.evidence ?? []).slice(-8);
  const events = (raw?.events ?? data.events ?? []).slice(-12).map((e) => ({
    type: e.type,
    at: e.at,
    message: String(e.message ?? e.text ?? "").slice(0, 220),
  }));
  let candidate = null;
  try {
    candidate = await client.query(api.m3Driver.simulationCandidate, {
      operatorToken,
      objectiveKey,
    });
  } catch (e) {
    candidate = { error: String(e?.message ?? e) };
  }
  const ws = await client.query(api.m5Workspace.getObjectiveWorkspaceV2, {
    objectiveKey,
  });
  const view = ws?.view;
  return {
    objectiveKey,
    state: data.state ?? view?.objective?.state,
    activity: data.activity,
    lastDeliveryFailureClass: data.lastDeliveryFailureClass ?? null,
    decisionAttempts: mgmt.decisionAttempts ?? null,
    pendingDecision: mgmt.pendingDecision ?? null,
    interpretationStatus: mgmt.interpretationStatus ?? null,
    resourceNeeds: needs.map((n) => ({
      id: n.id,
      class: n.resourceClass,
      status: n.status,
      authority: n.validationAuthority ?? null,
      req: n.requirementKey,
    })),
    validatedGaps: validated.map((n) => ({
      id: n.id,
      class: n.resourceClass,
      status: n.status,
      req: n.requirementKey,
      inputCheckId: n.inputCheckId ?? null,
    })),
    requirements: (view?.requirements ?? []).map((r) => ({
      key: r.requirementKey,
      state: r.state,
      strategy: r.strategy,
      title: r.title,
    })),
    run: latestRun
      ? {
          id: latestRun.id,
          status: latestRun.status,
          model: latestRun.model,
          toolCalls: latestRun.toolCalls,
          summary: String(latestRun.summary ?? "").slice(0, 300),
          startedAt: latestRun.startedAt,
        }
      : null,
    allRuns: runs.map((r) => ({
      id: r.id,
      status: r.status,
      toolCalls: r.toolCalls,
      summary: String(r.summary ?? "").slice(0, 120),
      model: r.model,
    })),
    evidenceCount: evidence.length,
    evidence: evidence.map((e) => ({
      id: e.id,
      origin: e.origin,
      sourceClass: e.sourceClass,
      label: e.label,
      text: String(e.text ?? "").slice(0, 120),
    })),
    events,
    simulationCandidate: candidate,
  };
}

function dump(label, s) {
  console.error(`\n=== ${label} ===`);
  console.log(JSON.stringify(s, null, 2));
  writeFileSync(
    "scripts/_tmp-m61-w4-a1-snap.json",
    JSON.stringify(s, null, 2),
    "utf8",
  );
}

console.log("=== CP-W4 SETUP fresh canonical demo objective ===");
const setup = await client.mutation(api.objectives.setupCanonicalDemoObjective, {
  operatorToken,
  spendLimitUsd: 2,
});
const objectiveKey = setup.objectiveKey ?? setup.key ?? setup;
console.log("objectiveKey:", objectiveKey);
console.log("AI_MODEL (local file):", requireEnv("AI_MODEL"));

console.log("\n=== STOP A: wait for contract + requirements ===");
let s = await snap(objectiveKey);
for (let i = 0; i < 48; i++) {
  s = await snap(objectiveKey);
  if ((s.requirements?.length ?? 0) >= 1 && s.interpretationStatus === "done")
    break;
  if (i % 2 === 0) {
    console.log(
      `t=${i * 5}s state=${s.state} reqs=${s.requirements?.length ?? 0} interp=${s.interpretationStatus}`,
    );
  }
  if (s.interpretationStatus === "refused" && i >= 2) {
    dump("STOP A FAIL", s);
    process.exit(2);
  }
  await sleep(5000);
}
if (!(s.requirements?.length >= 1)) {
  dump("STOP A FAIL", s);
  process.exit(2);
}
console.log("STOP A PASS");

console.log("\n=== STOP A1: wait for first MAKE worker terminal ===");
let sawRunning = false;
for (let i = 0; i < 72; i++) {
  s = await snap(objectiveKey);
  const run = s.run;
  if (run?.status === "running") sawRunning = true;

  const gap =
    (s.validatedGaps?.length ?? 0) >= 1 ||
    s.lastDeliveryFailureClass === "INPUT_BLOCKED";
  if (gap) {
    console.log("STOP A1 PASS — validated gap / INPUT_BLOCKED");
    dump("A1 PASS", s);
    break;
  }

  const failed =
    s.lastDeliveryFailureClass === "EXECUTION_FAILED" ||
    (run &&
      run.status === "failed" &&
      /zero_progress|EXECUTION_FAILED/i.test(String(run.summary ?? "")));
  if (failed) {
    dump("STOP A1 FAIL — EXECUTION_FAILED / zero_progress", s);
    process.exit(2);
  }

  // Empty incomplete: stopped with 0 tools and no evidence — fail fast once seen.
  if (
    run &&
    run.status === "stopped" &&
    (run.toolCalls ?? 0) === 0 &&
    (s.evidenceCount ?? 0) === 0 &&
    (s.validatedGaps?.length ?? 0) === 0 &&
    !/INPUT_BLOCKED/i.test(String(run.summary ?? ""))
  ) {
    dump("STOP A1 FAIL — empty incomplete (0 tools / 0 evidence)", s);
    process.exit(2);
  }

  // Valid internal proof path (rare for this demo): completed result with evidence.
  if (
    run &&
    run.status === "stopped" &&
    (s.evidenceCount ?? 0) > 0 &&
    /accepted completion|proof/i.test(String(run.summary ?? ""))
  ) {
    console.log("STOP A1 PASS — valid internal proof");
    dump("A1 PASS proof", s);
    break;
  }

  if (i % 3 === 0) {
    console.log(
      `t=${i * 5}s state=${s.state} failure=${s.lastDeliveryFailureClass} run=${run?.status ?? "none"} tools=${run?.toolCalls ?? "?"} evidence=${s.evidenceCount} activity=${String(s.activity ?? "").slice(0, 90)}`,
    );
  }
  await sleep(5000);
}

s = await snap(objectiveKey);
const a1Pass =
  (s.validatedGaps?.length ?? 0) >= 1 ||
  s.lastDeliveryFailureClass === "INPUT_BLOCKED" ||
  ((s.evidenceCount ?? 0) > 0 &&
    /accepted completion/i.test(String(s.run?.summary ?? "")));

if (!a1Pass) {
  dump("STOP A1 FAIL — timeout without gap/proof", s);
  process.exit(2);
}

if (!allowStopB) {
  console.log("\n=== CP-W4 A1 complete — STOP B not requested (pass --stop-b to continue) ===");
  process.exit(0);
}

if (!((s.validatedGaps?.length ?? 0) >= 1 || s.lastDeliveryFailureClass === "INPUT_BLOCKED")) {
  console.log("\n=== STOP B skipped — A1 passed without validated gap ===");
  process.exit(0);
}

console.log("\n=== STOP B: ONE M4 redecision — check BUY intent ===");
let bPass = false;
for (let i = 0; i < 36; i++) {
  s = await snap(objectiveKey);
  if (s.simulationCandidate?.intentId) {
    bPass = true;
    break;
  }
  const buyish = (s.requirements ?? []).filter(
    (r) => r.strategy === "BUY" || r.strategy === "HYBRID",
  );
  if (buyish.length > 0 && i >= 2) {
    // Strategy authorized; intent may still be forming.
    console.log("BUY/HYBRID strategy visible:", buyish.map((r) => `${r.key}:${r.strategy}`).join(","));
  }
  const attempts = Object.values(s.decisionAttempts ?? {});
  const maxAttempt = attempts.length ? Math.max(...attempts) : 0;
  if (maxAttempt >= 3 && !s.simulationCandidate?.intentId && i >= 6) {
    dump("STOP B FAIL — decision ceiling", s);
    process.exit(3);
  }
  if (i % 3 === 0) {
    console.log(
      `t=${i * 5}s candidate=${s.simulationCandidate?.intentId ?? "none"} attempts=${JSON.stringify(s.decisionAttempts)} strategies=${(s.requirements ?? []).map((r) => r.strategy).join(",")}`,
    );
  }
  await sleep(5000);
}
if (!bPass) {
  dump("STOP B FAIL", s);
  process.exit(3);
}
console.log("STOP B PASS:", s.simulationCandidate.intentId);
dump("STOP B PASS", s);
console.log("\n=== PHYSICAL A1+STOP B COMPLETE — do not start M6.2 ===");
process.exit(0);
