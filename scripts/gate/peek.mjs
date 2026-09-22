// One-line progress summary for a gate Objective:
// node scripts/gate/peek.mjs <objectiveKey> [--env-file=.env.cloud.local]
import { ConvexHttpClient } from "convex/browser";
import { api } from "../../convex/_generated/api.js";
import { loadGateEnv } from "./envFile.mjs";
const { args, get } = loadGateEnv(process.argv.slice(2));
const c = new ConvexHttpClient(get("NEXT_PUBLIC_CONVEX_URL"));
const k = args[0];
const raw = await c.query(api.objectives.getObjective, { objectiveKey: k });
if (!raw.record) {
  console.error(`objective ${k} not found on this target (wrong --env-file? currently local vs cloud is isolated by design)`);
  process.exit(1);
}
const ws = await c.query(api.m5Workspace.getObjectiveWorkspaceV2, { objectiveKey: k });
const v = ws.view, m = raw.record.management ?? {};
const story = v.missionStory ?? [];
const ageMin = story.length ? ((Date.now() - story.at(-1).at) / 60000).toFixed(1) : "?";
console.log(JSON.stringify({
  state: v.objective?.state, reqs: (v.requirements ?? []).map((r) => `${r.requirementKey}:${r.state}${r.strategy ? ":" + r.strategy : ""}`).join(" "),
  attempts: m.decisionAttempts, refusals: m.decisionRefusalAttempts,
  arts: (raw.record.companyArtifacts ?? []).map((a) => a.key.split("/").pop() + "@v" + a.version).join(","),
  ext: (v.external ?? []).length, last: story.at(-1)?.title, lastAgeMin: ageMin, now: v.somebodyNow?.detail?.slice(0, 90),
}));
