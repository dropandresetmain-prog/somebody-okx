// One-line progress summary for a gate Objective: node scripts/gate/peek.mjs <objectiveKey>
import { readFileSync } from "fs";
import { ConvexHttpClient } from "convex/browser";
import { api } from "../../convex/_generated/api.js";
const env = readFileSync(".env.local", "utf8");
const q = (n) => env.match(new RegExp(`^\s*${n}\s*=\s*(.+)$`, "m"))[1].trim().replace(/^["']|["']$/g, "");
const c = new ConvexHttpClient(q("NEXT_PUBLIC_CONVEX_URL"));
const k = process.argv[2];
const raw = await c.query(api.objectives.getObjective, { objectiveKey: k });
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
