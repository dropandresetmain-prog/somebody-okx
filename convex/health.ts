import { v } from "convex/values";
import { internalMutation, internalQuery, query } from "./_generated/server";

const APP = "trust-issues";

// Derived server-side from the built-in CONVEX_CLOUD_URL, so it reports the
// deployment the function is actually running on, not what a caller assumes.
function deploymentName(): string {
  const url = process.env.CONVEX_CLOUD_URL ?? "";
  try {
    return new URL(url).hostname.split(".")[0] || "unknown";
  } catch {
    return "unknown";
  }
}

// Probe writes are refused unless the deployment has opted in via
// HEALTH_PROBE_WRITES_ENABLED=true (set on Development only) AND the caller
// names the exact deployment it intends to write to.
function assertProbeWritesAllowed(expectedDeployment: string) {
  const actual = deploymentName();
  if (process.env.HEALTH_PROBE_WRITES_ENABLED !== "true") {
    throw new Error(`Health probe writes are disabled on deployment ${actual}.`);
  }
  if (expectedDeployment !== actual) {
    throw new Error(
      `Deployment mismatch: expected ${expectedDeployment}, running on ${actual}.`,
    );
  }
}

/** Public, read-only health surface. Safe on every environment. */
export const status = query({
  args: {},
  handler: async () => ({
    ok: true,
    app: APP,
    deploymentName: deploymentName(),
    liveAiEnabled: process.env.LIVE_AI_ENABLED === "true",
    probeWritesEnabled: process.env.HEALTH_PROBE_WRITES_ENABLED === "true",
    serverTime: Date.now(),
  }),
});

/** Development-only bounded write proof. Run via `npx convex run`. */
export const recordProbe = internalMutation({
  args: { expectedDeployment: v.string(), note: v.string() },
  handler: async (ctx, { expectedDeployment, note }) => {
    assertProbeWritesAllowed(expectedDeployment);
    const id = await ctx.db.insert("healthProbes", {
      deploymentName: deploymentName(),
      note: note.slice(0, 200),
      createdAt: Date.now(),
    });
    return { id, deploymentName: deploymentName() };
  },
});

/** Independent read-back of a probe row. */
export const getProbe = internalQuery({
  args: { id: v.id("healthProbes") },
  handler: async (ctx, { id }) => {
    const row = await ctx.db.get(id);
    return { runningOn: deploymentName(), row };
  },
});

/** Removes a probe row after verification so no test data is left behind. */
export const deleteProbe = internalMutation({
  args: { expectedDeployment: v.string(), id: v.id("healthProbes") },
  handler: async (ctx, { expectedDeployment, id }) => {
    assertProbeWritesAllowed(expectedDeployment);
    await ctx.db.delete(id);
    return { deleted: id, deploymentName: deploymentName() };
  },
});
