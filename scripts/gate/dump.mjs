// Snapshot an Objective's evidence without running it:
// node scripts/gate/dump.mjs <label> <objectiveKey> [note] [--env-file=.env.cloud.local]
import { writeFileSync, mkdirSync } from "fs";
import { ConvexHttpClient } from "convex/browser";
import { api } from "../../convex/_generated/api.js";
import { loadGateEnv } from "./envFile.mjs";
const { args, get } = loadGateEnv(process.argv.slice(2));
const c = new ConvexHttpClient(get("NEXT_PUBLIC_CONVEX_URL"));
const [label, objectiveKey, note] = args;
const raw = await c.query(api.objectives.getObjective, { objectiveKey });
const ws = await c.query(api.m5Workspace.getObjectiveWorkspaceV2, { objectiveKey });
mkdirSync("docs/work/gate-evidence", { recursive: true });
const out = `docs/work/gate-evidence/run-${label}-${objectiveKey}.json`;
writeFileSync(out, JSON.stringify({ label, objectiveKey, snapshotAt: new Date().toISOString(), note: note ?? null, raw, view: ws.view }, null, 1));
console.log(out, ws.view?.objective?.state);
