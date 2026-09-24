import { writeFileSync, mkdirSync } from "fs";
import { ConvexHttpClient } from "convex/browser";
import { api } from "../../convex/_generated/api.js";
import { loadGateEnv } from "./envFile.mjs";

const key = process.argv[2];
const outDir = process.argv[3];
if (!key || !outDir) {
  console.error("usage: node scripts/gate/captureObjectiveEvidence.mjs <key> <outDir>");
  process.exit(1);
}

const { get } = loadGateEnv(["--env-file=.env.local"]);
const c = new ConvexHttpClient(get("NEXT_PUBLIC_CONVEX_URL"));

const obj = await c.query(api.objectives.getObjective, { objectiveKey: key });
const ws = await c.query(api.productWorkspace.getObjectiveWorkspaceV1, {
  objectiveKey: key,
});
const m5 = await c.query(api.m5Workspace.getObjectiveWorkspaceV2, {
  objectiveKey: key,
});

const createdAt = obj?.record?.createdAt ?? 0;
const managerActs = (ws?.view?.activity ?? []).filter(
  (a) => a.type === "manager_decision",
);

const report = {
  objectiveKey: key,
  url: `http://127.0.0.1:3000/?objective=${key}`,
  sha: "043d24eb80ca060eee71b0835cb87159c534b7f9",
  createdAt,
  elapsedMs: Date.now() - createdAt,
  model: obj?.record?.run?.model ?? null,
  state: obj?.record?.state,
  somebodyNow: ws?.view?.somebodyNow,
  attention: ws?.view?.attention,
  outcomeIntent: m5?.view?.outcome?.intent ?? null,
  requirements: (m5?.view?.requirements ?? []).map((r) => ({
    key: r.requirementKey,
    title: r.title,
    state: r.state,
    strategy: r.strategy,
  })),
  integrationEvents: obj?.record?.integrationEvents ?? [],
  decisions: m5?.view?.decisions ?? [],
  managerDecisionsActivity: managerActs.map((a) => ({
    id: a.id,
    at: a.occurredAt,
    payload: a.payload,
  })),
  runs: (obj?.record?.workItems ?? []).flatMap((wi) =>
    (wi.runs ?? []).map((r) => ({
      assignmentId: wi.assignmentId,
      requirementKey: wi.requirementKey,
      runId: r.id,
      model: r.model,
      status: r.status,
      toolCalls: r.toolCalls,
      summary: r.summary,
    })),
  ),
  run: obj?.record?.run,
  finalAssessment: obj?.record?.finalSemanticAssessment,
  acceptedTerminal: obj?.record?.acceptedTerminal,
  acquisitions: ws?.view?.acquisitions,
  availableActions: ws?.view?.availableActions,
  resourceNeeds: obj?.record?.resourceNeeds ?? [],
};

mkdirSync(outDir, { recursive: true });
writeFileSync(`${outDir}/run-report.json`, JSON.stringify(report, null, 2));
writeFileSync(`${outDir}/objective-full-record.json`, JSON.stringify(obj, null, 2));
writeFileSync(
  `${outDir}/product-workspace-v1-projection.json`,
  JSON.stringify(ws, null, 2),
);
console.log("captured", key, "->", outDir);
