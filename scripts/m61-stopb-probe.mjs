/**
 * M6.1 physical STOP A / A1 / B / B1 probe.
 * Stops immediately on STOP B failure (no long retry burn).
 */
import { readFileSync } from "fs";
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

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function deepSnap(objectiveKey) {
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
    state: data.state ?? view?.objective?.state,
    activity: data.activity,
    lastDeliveryFailureClass: data.lastDeliveryFailureClass ?? null,
    unconfirmedInputFindings: (data.unconfirmedInputFindings ?? []).slice(-4),
    decisionAttempts: mgmt.decisionAttempts ?? null,
    decisionInputFingerprints: mgmt.decisionInputFingerprints ?? null,
    pendingDecision: mgmt.pendingDecision ?? null,
    interpretationStatus: mgmt.interpretationStatus ?? null,
    resourceNeeds: needs.map((n) => ({
      id: n.id,
      class: n.resourceClass,
      status: n.status,
      authority: n.validationAuthority ?? null,
      req: n.requirementKey,
      purpose: String(n.purpose ?? "").slice(0, 80),
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
      requiredResourceClasses: r.requiredResourceClasses ?? [],
      dependsOn: r.dependsOnRequirementKeys ?? [],
    })),
    simulationCandidate: candidate,
    somebodyNow: view?.somebodyNow ?? null,
  };
}

function dumpFail(label, s) {
  console.error(`\n=== ${label} FAIL DUMP ===`);
  console.log(JSON.stringify(s, null, 2));
}

console.log("=== SETUP fresh canonical demo objective ===");
const setup = await client.mutation(api.objectives.setupCanonicalDemoObjective, {
  operatorToken,
  spendLimitUsd: 2,
});
const objectiveKey = setup.objectiveKey ?? setup.key ?? setup;
console.log("objectiveKey:", objectiveKey);

console.log("\n=== STOP A: wait for contract + requirements + grant path ===");
let s = await deepSnap(objectiveKey);
for (let i = 0; i < 48; i++) {
  s = await deepSnap(objectiveKey);
  if ((s.requirements?.length ?? 0) >= 1) break;
  console.log(
    `t=${i * 5}s state=${s.state} reqs=${s.requirements?.length ?? 0} interp=${s.interpretationStatus}`,
  );
  if (s.interpretationStatus === "refused" && i >= 2) {
    dumpFail("STOP A", s);
    process.exit(2);
  }
  await sleep(5000);
}
if (!(s.requirements?.length >= 1)) {
  dumpFail("STOP A", s);
  process.exit(2);
}
console.log("STOP A PASS");
console.log(JSON.stringify({ requirements: s.requirements }, null, 2));

console.log("\n=== STOP A1: wait for validated input gap + worker yield ===");
let a1 = false;
for (let i = 0; i < 60; i++) {
  s = await deepSnap(objectiveKey);
  if ((s.validatedGaps?.length ?? 0) >= 1 || s.lastDeliveryFailureClass === "INPUT_BLOCKED") {
    a1 = true;
    break;
  }
  if (i % 3 === 0) {
    console.log(
      `t=${i * 5}s state=${s.state} failure=${s.lastDeliveryFailureClass} needs=${s.resourceNeeds.length} attempts=${JSON.stringify(s.decisionAttempts)} activity=${String(s.activity ?? "").slice(0, 100)}`,
    );
  }
  // Hard stop: EXECUTION_FAILED with no gap and attempts exhausted / park
  if (
    s.lastDeliveryFailureClass === "EXECUTION_FAILED" &&
    (s.validatedGaps?.length ?? 0) === 0 &&
    i >= 18
  ) {
    dumpFail("STOP A1 (execution failed, no validated gap)", s);
    process.exit(2);
  }
  await sleep(5000);
}
if (!a1) {
  dumpFail("STOP A1", s);
  process.exit(2);
}
console.log("STOP A1 PASS");
console.log(JSON.stringify({
  validatedGaps: s.validatedGaps,
  lastDeliveryFailureClass: s.lastDeliveryFailureClass,
  requirements: s.requirements,
}, null, 2));

console.log("\n=== STOP B: first post-diagnosis decision must authorize BUY/HYBRID ===");
let bPass = false;
for (let i = 0; i < 36; i++) {
  s = await deepSnap(objectiveKey);
  const buyish = (s.requirements ?? []).filter(
    (r) => r.strategy === "BUY" || r.strategy === "HYBRID",
  );
  if (s.simulationCandidate?.intentId && buyish.length > 0) {
    bPass = true;
    break;
  }
  if (s.simulationCandidate?.intentId) {
    bPass = true;
    break;
  }
  if (i % 3 === 0) {
    console.log(
      `t=${i * 5}s strategies=${buyish.map((r) => r.key + ":" + r.strategy).join(",") || "none"} candidate=${s.simulationCandidate?.intentId ?? "none"} attempts=${JSON.stringify(s.decisionAttempts)} fingerprints=${JSON.stringify(s.decisionInputFingerprints)}`,
    );
  }
  // Early stop: if attempts hit ceiling with no BUY and no candidate
  const attempts = Object.values(s.decisionAttempts ?? {});
  const maxAttempt = attempts.length ? Math.max(...attempts) : 0;
  if (maxAttempt >= 3 && !s.simulationCandidate?.intentId && i >= 6) {
    dumpFail("STOP B (decision ceiling, no intent)", s);
    process.exit(3);
  }
  await sleep(5000);
}
if (!bPass) {
  dumpFail("STOP B", s);
  process.exit(3);
}
console.log("STOP B PASS");
console.log(JSON.stringify({
  candidate: s.simulationCandidate,
  requirements: s.requirements,
  validatedGaps: s.validatedGaps,
  decisionAttempts: s.decisionAttempts,
}, null, 2));

console.log("\n=== STOP B1: simulationCandidate for this objective ===");
if (!s.simulationCandidate?.intentId) {
  dumpFail("STOP B1", s);
  process.exit(3);
}
console.log("STOP B1 PASS:", s.simulationCandidate.intentId);
console.log("\n=== PHYSICAL STOP B GATE COMPLETE — do not start M6.2 ===");
process.exit(0);
