/**
 * Model Portability Gate — one counted canonical Objective, natural path.
 * Usage: node scripts/gate/run-objective.mjs <label> [maxMinutes=45]
 * Only the deployed AI_MODEL differs between runs. No forced BUY, no state repair.
 * If (and only if) the engine authorizes an external intent, the SAME transparent
 * simulation entry used by M6.1 Gate 1 (m3Driver.simulateVerifiedAcquisition) is invoked.
 * Writes docs/work/gate-evidence/run-<label>-<objectiveKey>.json (raw record + workspace view + timeline).
 */
import { readFileSync, writeFileSync, mkdirSync } from "fs";
import { ConvexHttpClient } from "convex/browser";
import { api } from "../../convex/_generated/api.js";

const env = readFileSync(".env.local", "utf8");
const req = (n) => {
  const m = env.match(new RegExp(`^\s*${n}\s*=\s*(.+)$`, "m"));
  if (!m) throw new Error(`${n} missing`);
  return m[1].trim().replace(/^["']|["']$/g, "");
};
const client = new ConvexHttpClient(req("NEXT_PUBLIC_CONVEX_URL"));
const operatorToken = req("SOMEBODY_DEMO_OPERATOR_TOKEN");
const label = process.argv[2] ?? "run";
const maxMs = Number(process.argv[3] ?? 45) * 60_000;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const t0 = Date.now();
const setup = await client.mutation(api.objectives.setupCanonicalDemoObjective, { operatorToken, spendLimitUsd: 2 });
const objectiveKey = typeof setup === "string" ? setup : (setup.objectiveKey ?? setup.key);
console.log(`[${label}] objectiveKey=${objectiveKey}`);

const timeline = [];
const simulated = new Set();
let last = null;
async function read() {
  const raw = await client.query(api.objectives.getObjective, { objectiveKey });
  const ws = await client.query(api.m5Workspace.getObjectiveWorkspaceV2, { objectiveKey });
  let cand = null;
  try { cand = await client.query(api.m3Driver.simulationCandidate, { operatorToken, objectiveKey }); } catch (e) { cand = { error: String(e?.message ?? e) }; }
  return { raw, ws, cand };
}
let final = null;
for (;;) {
  const s = await read();
  final = s;
  const view = s.ws?.view;
  const state = view?.objective?.state ?? s.raw?.record?.state;
  const reqs = (view?.requirements ?? []).map((r) => `${r.requirementKey}:${r.state}:${r.strategy}`).join(",");
  const line = { t: Math.round((Date.now() - t0) / 1000), state, reqs, cand: s.cand?.intentId ?? null };
  if (JSON.stringify(line) !== JSON.stringify(last)) { timeline.push(line); console.log(`[${label}]`, JSON.stringify(line)); last = line; }
  const intentId = s.cand?.intentId;
  if (intentId && !simulated.has(intentId)) {
    simulated.add(intentId);
    try {
      const sim = await client.mutation(api.m3Driver.simulateVerifiedAcquisition, { operatorToken, intentId });
      timeline.push({ t: Math.round((Date.now() - t0) / 1000), simulate: intentId, result: sim });
      console.log(`[${label}] simulated`, intentId);
    } catch (e) { timeline.push({ simulate: intentId, error: String(e?.message ?? e) }); }
  }
  if (["completed", "blocked", "escalated", "recovery_required", "failed", "cancelled"].includes(state)) {
    await sleep(15000); // settle: let trailing wakes/idempotent replays land
    const s2 = await read();
    const st2 = s2.ws?.view?.objective?.state ?? s2.raw?.record?.state;
    if (st2 === state) { final = s2; break; }
  }
  if (Date.now() - t0 > maxMs) { timeline.push({ timeout: true }); break; }
  await sleep(5000);
}
mkdirSync("docs/work/gate-evidence", { recursive: true });
const out = `docs/work/gate-evidence/run-${label}-${objectiveKey}.json`;
writeFileSync(out, JSON.stringify({ label, objectiveKey, startedAt: new Date(t0).toISOString(), elapsedS: Math.round((Date.now() - t0) / 1000), timeline, raw: final.raw, view: final.ws?.view, simulationCandidate: final.cand }, null, 1));
const st = final.ws?.view?.objective?.state ?? final.raw?.record?.state;
console.log(`[${label}] FINAL state=${st} elapsed=${Math.round((Date.now() - t0) / 1000)}s -> ${out}`);
