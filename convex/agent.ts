"use node";
import { v } from "convex/values";
import { internalAction } from "./_generated/server";
import { internal } from "./_generated/api";
import { assertDevelopment } from "./environment";
import { runProcurementAgent } from "../lib/agent/procurement";
import { dispatch } from "./effectAdapter";

export const runProcurement = internalAction({
  args: { key: v.string(), runId: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    assertDevelopment();
    try {
      await runProcurementAgent(
        {
          read: () => ctx.runQuery(internal.missions.read, { key: args.key }),
          act: (command) => dispatch(ctx, args.key, command, args.runId),
        },
        { signal: AbortSignal.timeout(240000) },
      );
      // UI activity comes from successful domain actions, not an unverified model completion claim.
      const m = await ctx.runQuery(internal.missions.read, { key: args.key });
      if (!m.run?.toolCalls)
        throw new Error("Agent produced no actionable tool progress");
      await ctx.runMutation(internal.missions.finishRun, {
        ...args,
        failed: false,
        summary: `Agent paused. ${m.activity}`,
      });
    } catch (error) {
      // Provider errors can include request bodies or account data. Persist only a safe category.
      const raw = error instanceof Error ? error.message : "";
      const kind = /429|rate.?limit/i.test(raw)
        ? "provider rate limit"
        : /401|403|API key/i.test(raw)
          ? "provider credentials or access"
          : /abort|timeout/i.test(raw)
            ? "provider timeout"
            : "provider or SDK error";
      await ctx.runMutation(internal.missions.finishRun, {
        ...args,
        failed: true,
        summary: `Agent run failed (${kind}). Durable progress is retained. Check provider configuration or retry.`,
      });
    }
    return null;
  },
});
