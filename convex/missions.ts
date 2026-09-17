import { v } from "convex/values";
import {
  internalMutation,
  internalQuery,
  query,
  type MutationCtx,
  type QueryCtx,
} from "./_generated/server";
import { internal } from "./_generated/api";
import { mission, event, effect, receipt } from "./validators";
import { assertDevelopment, DEVELOPMENT } from "./environment";
import { commandSchema, agentCommandSchema } from "../lib/procurement/commands";
import {
  createMission,
  fixtureEvidence,
  hydrateMission,
} from "../lib/procurement/fixtures";
import {
  applyCommand,
  beginVerification,
  effectForExecution,
  refreshDerived,
} from "../lib/procurement/domain";
import { verifyReceipt } from "../lib/reliability/core";
import type { Command, Mission, MissionEvent } from "../lib/procurement/types";

const keyArgs = { key: v.string() };
async function row(ctx: Pick<QueryCtx, "db">, key: string) {
  const found = await ctx.db
    .query("missions")
    .withIndex("by_key", (q) => q.eq("key", key))
    .unique();
  if (!found) throw new Error("Mission not found");
  return found;
}
async function log(
  ctx: MutationCtx,
  key: string,
  text: string,
  kind: MissionEvent["kind"] = "system",
) {
  await ctx.db.insert("missionEvents", {
    missionKey: key,
    data: { at: Date.now(), kind, text },
  });
}
function fence(m: Mission, runId?: string) {
  if (
    runId &&
    (m.run?.id !== runId ||
      m.run.status !== "running" ||
      m.run.leaseUntil < Date.now())
  )
    throw new Error("Agent run lease expired or was replaced");
}
export const view = query({
  args: { key: v.optional(v.string()) },
  returns: v.object({
    mission: v.union(mission, v.null()),
    events: v.array(event),
    liveAiEnabled: v.boolean(),
    deployment: v.string(),
  }),
  handler: async (ctx, args) => {
    const found = args.key
      ? await ctx.db
          .query("missions")
          .withIndex("by_key", (q) => q.eq("key", args.key!))
          .unique()
      : await ctx.db.query("missions").order("desc").first();
    const events = found
      ? await ctx.db
          .query("missionEvents")
          .withIndex("by_missionKey", (q) => q.eq("missionKey", found.key))
          .order("desc")
          .take(80)
      : [];
    return {
      mission: found ? hydrateMission(found.data as Mission) : null,
      events: events.map((e) => e.data),
      liveAiEnabled: process.env.LIVE_AI_ENABLED === "true",
      deployment: new URL(process.env.CONVEX_CLOUD_URL!).hostname.split(".")[0],
    };
  },
});
export const read = internalQuery({
  args: keyArgs,
  returns: mission,
  handler: async (ctx, args) =>
    hydrateMission((await row(ctx, args.key)).data as Mission),
});
export const apply = internalMutation({
  args: { key: v.string(), command: v.string(), runId: v.optional(v.string()) },
  returns: v.string(),
  handler: async (ctx, args) => {
    assertDevelopment();
    const c = (args.runId ? agentCommandSchema : commandSchema).parse(
      JSON.parse(args.command),
    );
    if (c.type === "create") {
      if (args.key !== c.key) throw new Error("Mission key mismatch");
      const existing = await ctx.db
        .query("missions")
        .withIndex("by_key", (q) => q.eq("key", c.key))
        .unique();
      if (existing) {
        if (existing.data.request !== c.request)
          throw new Error("Mission key reused with a different request");
        return "Mission already exists";
      }
      await ctx.db.insert("missions", {
        key: c.key,
        data: createMission(c.key, c.request, Date.now()),
      });
      await log(
        ctx,
        c.key,
        "Mission delegated. Development fixtures are available.",
      );
      return "Mission created";
    }
    const found = await row(ctx, args.key);
    const m = hydrateMission(found.data as Mission);
    fence(m, args.runId);
    let command: Command = c;
    if (command.type === "ingest_fixture_observation") {
      command = {
        type: "ingest_external_evidence",
        evidence: fixtureEvidence(m, command.vendorId, command.stage, Date.now()),
      };
    }
    if (c.type === "run_agent") {
      if (process.env.LIVE_AI_ENABLED !== "true")
        throw new Error(
          "Live AI is disabled. Set LIVE_AI_ENABLED=true deliberately on Development.",
        );
      if (m.run?.status === "running" && m.run.leaseUntil > Date.now())
        return "Agent is already running";
      if (
        ["complete", "blocked", "awaiting_approval"].includes(m.state) ||
        m.noViableOption
      )
        throw new Error(
          "Agent is waiting for a human decision or this mission is finished",
        );
      const id = `${m.key}:${Date.now()}`;
      m.run = {
        id,
        status: "running",
        startedAt: Date.now(),
        leaseUntil: Date.now() + 300000,
        model: process.env.AI_MODEL ?? "unconfigured",
        toolCalls: 0,
        summary: "Reading persisted mission state",
      };
      m.activity = "Procurement Agent is reviewing the mission";
      await ctx.db.patch(found._id, { data: m });
      await log(
        ctx,
        args.key,
        "Procurement Agent started through the OpenAI Agents SDK.",
        "agent",
      );
      await ctx.scheduler.runAfter(0, internal.agent.runProcurement, {
        key: m.key,
        runId: id,
      });
      await ctx.scheduler.runAfter(300000, internal.missions.expireRun, {
        key: m.key,
        runId: id,
      });
      return "Agent started";
    }
    if (c.type === "execute_effect" || c.type === "verify_effect")
      throw new Error("Effect commands require the adapter boundary");
    const message = applyCommand(
      m,
      command as Parameters<typeof applyCommand>[1],
      Date.now(),
    );
    if (args.runId && m.run) m.run.toolCalls++;
    await ctx.db.patch(found._id, { data: m });
    await log(
      ctx,
      m.key,
      message,
      args.runId
        ? "agent"
        : command.type === "ingest_external_evidence"
          ? "evidence"
          : command.type === "approve" || command.type === "reject"
            ? "decision"
            : "system",
    );
    return message;
  },
});
export const finishRun = internalMutation({
  args: {
    key: v.string(),
    runId: v.string(),
    failed: v.boolean(),
    summary: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    assertDevelopment();
    const found = await row(ctx, args.key);
    const m = hydrateMission(found.data as Mission);
    if (m.run?.id !== args.runId || m.run.status !== "running") return null;
    m.run.status = args.failed ? "failed" : "stopped";
    m.run.summary = args.summary.slice(0, 500);
    m.run.leaseUntil = 0;
    await ctx.db.patch(found._id, { data: m });
    await log(ctx, m.key, m.run.summary, "agent");
    return null;
  },
});
export const expireRun = internalMutation({
  args: { key: v.string(), runId: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    assertDevelopment();
    const found = await row(ctx, args.key);
    const m = hydrateMission(found.data as Mission);
    if (
      m.run?.id !== args.runId ||
      m.run.status !== "running" ||
      m.run.leaseUntil > Date.now()
    )
      return null;
    m.run.status = "failed";
    m.run.summary =
      "Worker lease expired. Durable progress is retained; resume the agent to continue.";
    await ctx.db.patch(found._id, { data: m });
    await log(ctx, m.key, m.run.summary, "agent");
    return null;
  },
});
const effectArgs = {
  key: v.string(),
  effectKey: v.string(),
  runId: v.optional(v.string()),
};
export const attempt = internalMutation({
  args: effectArgs,
  returns: effect,
  handler: async (ctx, args) => {
    assertDevelopment();
    const found = await row(ctx, args.key);
    const m = hydrateMission(found.data as Mission);
    fence(m, args.runId);
    const e = effectForExecution(m, args.effectKey);
    if (e.status === "verified" || e.status === "unverified") return e;
    e.status = "attempted";
    e.attempts++;
    refreshDerived(m);
    beginVerification(m);
    m.updatedAt = Date.now();
    if (args.runId && m.run) m.run.toolCalls++;
    await ctx.db.patch(found._id, { data: m });
    await log(
      ctx,
      m.key,
      `${e.kind}: attempt recorded; not yet verified.`,
      "effect",
    );
    return e;
  },
});
export const deliverFixture = internalMutation({
  args: effectArgs,
  returns: v.string(),
  handler: async (ctx, args) => {
    assertDevelopment();
    const found = await row(ctx, args.key);
    const mission = hydrateMission(found.data as Mission);
    fence(mission, args.runId);
    const e = effectForExecution(mission, args.effectKey);
    if (e.status === "pending")
      throw new Error("Record the attempt before adapter execution");
    const previous = await ctx.db
      .query("fixtureReceipts")
      .withIndex("by_key", (q) => q.eq("key", e.key))
      .unique();
    if (previous) {
      verifyReceipt(e, previous);
      return previous._id;
    }
    return await ctx.db.insert("fixtureReceipts", {
      key: e.key,
      endpointRef: e.endpointRef,
      payload: e.payload,
      createdAt: Date.now(),
    });
  },
});
export const acknowledge = internalMutation({
  args: { ...effectArgs, receiptId: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    assertDevelopment();
    const found = await row(ctx, args.key);
    const m = hydrateMission(found.data as Mission);
    fence(m, args.runId);
    const e = effectForExecution(m, args.effectKey);
    if (e.status !== "verified") {
      e.status = "unverified";
      e.receiptId = args.receiptId;
    }
    refreshDerived(m);
    await ctx.db.patch(found._id, { data: m });
    await log(
      ctx,
      m.key,
      `${e.kind}: adapter returned success. Read-back still required.`,
      "effect",
    );
    return null;
  },
});
export const readReceipt = internalQuery({
  args: { effectKey: v.string() },
  returns: v.union(receipt, v.null()),
  handler: async (ctx, args) => {
    const r = await ctx.db
      .query("fixtureReceipts")
      .withIndex("by_key", (q) => q.eq("key", args.effectKey))
      .unique();
    return r
      ? {
          key: r.key,
          endpointRef: r.endpointRef,
          payload: r.payload,
          createdAt: r.createdAt,
        }
      : null;
  },
});
export const verify = internalMutation({
  args: { ...effectArgs, observed: v.union(receipt, v.null()) },
  returns: v.string(),
  handler: async (ctx, args) => {
    assertDevelopment();
    const found = await row(ctx, args.key);
    const m = hydrateMission(found.data as Mission);
    fence(m, args.runId);
    const e = effectForExecution(m, args.effectKey);
    if (e.status === "verified") return "Already verified";
    if (e.status !== "attempted" && e.status !== "unverified")
      throw new Error("No effect attempt to verify");
    verifyReceipt(e, args.observed);
    e.status = "verified";
    e.verifiedAt = Date.now();
    refreshDerived(m);
    beginVerification(m);
    m.updatedAt = Date.now();
    if (args.runId && m.run) m.run.toolCalls++;
    await ctx.db.patch(found._id, { data: m });
    const source =
      e.kind === "purchase_order"
        ? "independent QuickBooks read-back"
        : "independent Development fixture read-back";
    await log(ctx, m.key, `${e.kind}: verified against ${source}.`, "effect");
    return e.kind === "purchase_order"
      ? "Purchase order effect verified"
      : "Fixture effect verified";
  },
});
