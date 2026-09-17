"use node";

import { v } from "convex/values";
import { internalAction } from "./_generated/server";
import { internal } from "./_generated/api";
import {
  correlateInbound,
  evidenceFromInbound,
  loadBindings,
  normalizeSupplierClaimsLive,
  resolveTimeZone,
  withExtractedClaims,
} from "../lib/unipile";
import type { UnipileWebhookEvent } from "../lib/unipile";

export const handleWebhook = internalAction({
  args: { raw: v.string(), retrievedAt: v.number() },
  returns: v.string(),
  handler: async (ctx, args): Promise<string> => {
    let event: UnipileWebhookEvent;
    try {
      event = JSON.parse(args.raw) as UnipileWebhookEvent;
    } catch {
      throw new Error("Invalid Unipile webhook JSON");
    }

    const bindings = loadBindings(process.env);
    const seen: boolean = event.message_id
      ? await ctx.runQuery(internal.unipileStore.seenInbound, {
          providerMessageId: event.message_id,
        })
      : false;

    const provider =
      event.account_type?.toUpperCase() === "WHATSAPP"
        ? ("whatsapp" as const)
        : event.account_type?.toUpperCase() === "INSTAGRAM"
          ? ("instagram" as const)
          : null;
    const binding =
      provider &&
      bindings.find(
        (b) =>
          b.accountId === event.account_id &&
          b.chatId === event.chat_id &&
          b.provider === provider,
      );

    let missionKey: string | undefined;
    let vendorId: string | null = null;
    let deadlineAt: number | null = null;
    if (binding) {
      const match: { key: string; vendorId: string } | null =
        await ctx.runQuery(internal.unipileStore.findVendorMission, {
          endpointRef: binding.endpointRef,
        });
      if (match) {
        missionKey = match.key;
        vendorId = match.vendorId;
        const mission = await ctx.runQuery(internal.missions.read, {
          key: match.key,
        });
        deadlineAt = mission.requirements.deadlineAt;
      }
    }

    const correlated = correlateInbound({
      event,
      bindings,
      alreadySeenMessageId: () => seen,
      resolveVendorId: (endpointRef) =>
        binding && binding.endpointRef === endpointRef ? vendorId : null,
    });

    if (correlated.action === "duplicate")
      return "Duplicate Unipile webhook ignored";

    if (correlated.action === "ignore_own") {
      await ctx.runMutation(internal.unipileStore.recordInbound, {
        providerMessageId: event.message_id,
        provider: binding!.provider,
        accountId: event.account_id,
        chatId: event.chat_id,
        observedAt: Date.parse(event.timestamp) || args.retrievedAt,
        status: "ignored_own",
        reason: correlated.reason,
        missionKey,
      });
      return correlated.reason;
    }

    if (correlated.action === "reject") {
      if (event.message_id && provider) {
        await ctx.runMutation(internal.unipileStore.recordInbound, {
          providerMessageId: event.message_id,
          provider,
          accountId: event.account_id || "unknown",
          chatId: event.chat_id || "unknown",
          observedAt: Date.parse(event.timestamp) || args.retrievedAt,
          status: "rejected",
          reason: correlated.reason,
          missionKey,
        });
      }
      throw new Error(correlated.reason);
    }

    if (!missionKey)
      throw new Error("No active mission for Unipile vendor binding");

    const extracted = await normalizeSupplierClaimsLive(event.message ?? "", {
      referenceAt: correlated.observedAt,
      deadlineAt,
      timeZone: resolveTimeZone(process.env.SOMEBODY_TIME_ZONE),
    });
    const decision = withExtractedClaims(
      { ...correlated, text: extracted.text },
      extracted.claims,
      extracted.path,
    );

    const evidence = evidenceFromInbound(decision, args.retrievedAt);
    const message: string = await ctx.runMutation(internal.missions.apply, {
      key: missionKey,
      command: JSON.stringify({
        type: "ingest_external_evidence",
        evidence,
      }),
    });

    const claimCount = Object.keys(decision.claims).length;
    await ctx.runMutation(internal.unipileStore.recordInbound, {
      providerMessageId: decision.observationId,
      provider: decision.provider,
      accountId: decision.accountId,
      chatId: decision.chatId,
      observedAt: decision.observedAt,
      status: "ingested",
      reason: claimCount
        ? `Normalized supplier claims via ${decision.extractionPath ?? "unknown"}`
        : "Supplier message recorded with no extractable quote claims",
      missionKey,
    });
    return message;
  },
});
