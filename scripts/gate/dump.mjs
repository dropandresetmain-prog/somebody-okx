// Snapshot an Objective's evidence without running it: node scripts/gate/dump.mjs <label> <objectiveKey> [note]
import { readFileSync, writeFileSync, mkdirSync } from "fs";
import { ConvexHttpClient } from "convex/browser";
import { api } from "../../convex/_generated/api.js";
const env = readFileSync(".env.local", "utf8");
const q = (n) => env.match(new RegExp(`^\s*${n}\s*=\s*(.+)$`, "m"))[1].trim().replace(/^["']|["']$/g, "");
const c = new ConvexHttpClient(q("NEXT_PUBLIC_CONVEX_URL"));
const [label, objectiveKey, note] = process.argv.slice(2);
const raw = await c.query(api.objectives.getObjective, { objectiveKey });
const ws = await c.query(api.m5Workspace.getObjectiveWorkspaceV2, { objectiveKey });
mkdirSync("docs/work/gate-evidence", { recursive: true });
const out = `docs/work/gate-evidence/run-${label}-${objectiveKey}.json`;
writeFileSync(out, JSON.stringify({ label, objectiveKey, snapshotAt: new Date().toISOString(), note: note ?? null, raw, view: ws.view }, null, 1));
console.log(out, ws.view?.objective?.state);
