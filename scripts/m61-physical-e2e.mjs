/**
 * Fresh M6.1 physical E2E — stop-point gated. No proof repair / ceiling hacks.
 * Usage: node scripts/m61-physical-e2e.mjs
 */
import { readFileSync } from "fs";
import { ConvexHttpClient } from "convex/browser";
import { api } from "../convex/_generated/api.js";

const env = readFileSync(".env.local", "utf8");
function requireEnv(name) {
  const match = env.match(new RegExp(`^\\s*${name}\\s*=\\s*(.+)$`, "m"));
  if (!match) throw new Error(`${name} missing`);
  return match[1].trim().replace(/^["']|["']$/g, "");
}

const client = new ConvexHttpClient(requireEnv("NEXT_PUBLIC_CONVEX_URL"));
const operatorToken = requireEnv("SOMEBODY_DEMO_OPERATOR_TOKEN");

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function snap(objectiveKey) {
  const raw = await client.query(api.objectives.getObjective, { objectiveKey });
  const ws = await client.query(api.m5Workspace.getObjectiveWorkspaceV2, {
    objectiveKey,
  });
  let candidate = null;
  try {
    candidate = await client.query(api.m3Driver.simulationCandidate, {
      operatorToken,
      objectiveKey,
    });
  } catch (e) {
    candidate = { error: String(e?.message ?? e) };
  }
  const record = raw?.record ?? {};
  const mgmt = record.management ?? {};
  const arts = record.data?.companyArtifacts ?? record.companyArtifacts ?? [];
  const view = ws?.view;
  return {
    state: view?.objective?.state ?? record.state,
    decisionAttempts: mgmt.decisionAttempts ?? null,
    interpretationStatus: mgmt.interpretationStatus ?? null,
    interpretationDetail: mgmt.interpretationDetail ?? null,
    pendingDecision: mgmt.pendingDecision ?? null,
    requirements: (view?.requirements ?? []).map((r) => ({
      key: r.requirementKey,
      state: r.state,
      strategy: r.strategy,
      title: r.title,
      dependsOn: r.dependsOnRequirementKeys ?? null,
      requiredResourceClasses: r.requiredResourceClasses ?? null,
      proofs: (r.proofs ?? []).map((p) => p.proofKind),
    })),
    artifacts: arts.map((a) => ({
      key: a.key,
      version: a.version,
      evidence: a.usedAcquisitionEvidenceIds ?? a.history?.slice(-1)?.[0]?.usedAcquisitionEvidenceIds,
      note: a.history?.slice(-1)?.[0]?.changeNote ?? null,
    })),
    acquisitionResults: (record.acquisitionResults ?? record.data?.acquisitionResults ?? []).map(
      (a) => ({
        intentId: a.intentId,
        resultEvidenceId: a.resultEvidenceId,
        provenance: a.provenance,
      }),
    ),
    simulationCandidate: candidate,
    somebodyNow: view?.somebodyNow ?? null,
    paymentStages: (view?.externals ?? view?.external ?? [])
      ?.map?.((e) => e.payment?.history?.map((h) => h.state) ?? e.payment?.state)
      ?? null,
    storyLatest: (view?.missionStory ?? []).slice(-8).map((s) => s.title),
  };
}

console.log("=== SETUP fresh canonical demo objective ===");
const setup = await client.mutation(api.objectives.setupCanonicalDemoObjective, {
  operatorToken,
  spendLimitUsd: 2,
});
const key = setup.objectiveKey ?? setup.key ?? setup;
console.log("objectiveKey:", key);

let s = await snap(typeof key === "string" ? key : key.objectiveKey);
const objectiveKey = typeof key === "string" ? key : key.objectiveKey;

// Stop point A — wait for interpretation + at least one requirement
console.log("\n=== STOP A: wait for interpretation/diagnosis ===");
// Free models can take up to MODEL_HTTP_TIMEOUT_MS (180s) plus schedule lag.
for (let i = 0; i < 48; i++) {
  s = await snap(objectiveKey);
  if ((s.requirements?.length ?? 0) >= 1) break;
  console.log(
    `t=${i * 5}s state=${s.state} reqs=${s.requirements?.length ?? 0} interp=${s.interpretationStatus ?? "?"} detail=${String(s.interpretationDetail ?? "").slice(0, 120)}`,
  );
  if (s.interpretationStatus === "refused" && i >= 2) {
    console.error("STOP A FAIL: interpretation refused", s.interpretationDetail);
    process.exit(2);
  }
  await sleep(5000);
}
console.log(JSON.stringify({
  state: s.state,
  reqCount: s.requirements?.length,
  requirements: s.requirements,
  somebodyNow: s.somebodyNow,
}, null, 2));

const hasExternalInputHint = (s.requirements ?? []).some(
  (r) =>
    (r.requiredResourceClasses?.length ?? 0) > 0 ||
    /external|acquir|evidence|data|social|market/i.test(`${r.title} ${r.key}`),
);
if (!(s.requirements?.length >= 1)) {
  console.error("STOP A FAIL: no requirements after wait");
  process.exit(2);
}
console.log("STOP A:", hasExternalInputHint ? "PASS-ish (reqs present)" : "WARN (no clear external-input req yet)");

// Stop point B — wait for authorized BUY/HYBRID intent
console.log("\n=== STOP B: wait for authorized external intent ===");
let authorized = false;
for (let i = 0; i < 90; i++) {
  s = await snap(objectiveKey);
  const buyish = (s.requirements ?? []).filter((r) => r.strategy === "BUY" || r.strategy === "HYBRID");
  if (s.simulationCandidate?.intentId) {
    authorized = true;
    break;
  }
  if (i % 6 === 0) {
    console.log(
      `t=${i * 5}s state=${s.state} attempts=${JSON.stringify(s.decisionAttempts)} buyish=${buyish.map((r) => r.key + ":" + r.strategy).join(",") || "none"} candidate=${s.simulationCandidate?.intentId ?? "none"}`,
    );
  }
  // Early stop if escalated/recovery without intent
  if (["escalated", "recovery_required", "failed", "blocked"].includes(s.state) && !s.simulationCandidate?.intentId) {
    console.error("STOP B FAIL: parked without intent", s.state, s.somebodyNow);
    console.log(JSON.stringify(s, null, 2));
    process.exit(3);
  }
  await sleep(5000);
}

if (!authorized) {
  console.error("STOP B FAIL: no simulationCandidate after wait");
  console.log(JSON.stringify(s, null, 2));
  process.exit(3);
}
console.log("STOP B PASS: intent", s.simulationCandidate.intentId, "req", s.simulationCandidate.requirementKey);

// Stop point C — simulate
console.log("\n=== STOP C: simulateVerifiedAcquisition ===");
const sim = await client.mutation(api.m3Driver.simulateVerifiedAcquisition, {
  operatorToken,
  intentId: s.simulationCandidate.intentId,
});
console.log("sim:", sim);
await sleep(3000);
s = await snap(objectiveKey);
console.log(JSON.stringify({
  acquisitions: s.acquisitionResults,
  candidate: s.simulationCandidate,
  storyLatest: s.storyLatest,
}, null, 2));
if (!s.acquisitionResults?.some((a) => a.provenance === "simulation")) {
  console.error("STOP C FAIL: no simulation provenance acquisition");
  process.exit(4);
}
console.log("STOP C PASS");

// Stop point D — completion
console.log("\n=== STOP D: wait for completion + artifact v2 ===");
for (let i = 0; i < 90; i++) {
  s = await snap(objectiveKey);
  const artV2 = (s.artifacts ?? []).some((a) => a.version >= 2);
  if (s.state === "completed" && artV2) break;
  if (i % 6 === 0) {
    console.log(
      `t=${i * 5}s state=${s.state} arts=${JSON.stringify(s.artifacts)} attempts=${JSON.stringify(s.decisionAttempts)}`,
    );
  }
  if (["escalated", "recovery_required", "failed"].includes(s.state)) {
    console.error("STOP D FAIL: terminal without completion", s.state);
    console.log(JSON.stringify(s, null, 2));
    process.exit(5);
  }
  await sleep(5000);
}

s = await snap(objectiveKey);
console.log(JSON.stringify(s, null, 2));
const artV2 = (s.artifacts ?? []).some((a) => a.version >= 2);
const ok =
  s.state === "completed" &&
  artV2 &&
  s.acquisitionResults?.some((a) => a.provenance === "simulation");
console.log(ok ? "\n=== PHYSICAL E2E PASS ===" : "\n=== PHYSICAL E2E FAIL ===");
process.exit(ok ? 0 : 5);
