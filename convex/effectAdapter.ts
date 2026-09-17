import type { ActionCtx } from "./_generated/server";
import { internal } from "./_generated/api";
import { fixtureEvidence } from "../lib/procurement/fixtures";
import type { AgentCommand, Effect, Mission } from "../lib/procurement/types";
import {
  createOrReconcilePurchaseOrder,
  parsePurchaseOrderIntentPayload,
  readBackPurchaseOrder,
  readConfig,
} from "../lib/accounting/quickbooks";
import { sourceCatalogueEvidence } from "../lib/web/sourceCatalogueEvidence";
import {
  bindingForEndpoint,
  loadBindings,
  loadCredentials,
  messagingProviderForEffect,
  planOutbound,
  readBackMatches,
  readMessage,
  sendChatMessage,
  unipileConfigured,
} from "../lib/unipile";

function liveGoogle(): boolean {
  return process.env.GOOGLE_WORKSPACE_LIVE === "true";
}

function gmailVendor(mission: Mission, effect: Effect) {
  return mission.vendors.find(
    (vendor) => vendor.id === effect.targetId && vendor.channel === "Gmail",
  );
}

function threadFromMission(mission: Mission, vendorId: string): string | null {
  const prior = [...mission.evidence]
    .reverse()
    .find(
      (item) =>
        item.vendorId === vendorId &&
        item.provenance?.provider === "gmail" &&
        item.provenance.parentId,
    );
  return prior?.provenance?.parentId ?? null;
}

function purchaseOrderIntent(mission: Mission, effect: Effect) {
  const vendor = mission.vendors.find((entry) => entry.id === effect.targetId);
  if (!vendor) throw new Error("Unknown vendor for purchase order effect");
  const parsed = parsePurchaseOrderIntentPayload(effect.payload);
  return {
    ...parsed,
    effectKey: effect.key,
    missionKey: mission.key,
    vendorName: vendor.name,
    product: vendor.product,
  };
}

async function deliverUnipile(
  ctx: ActionCtx,
  key: string,
  effectKey: string,
  runId?: string,
): Promise<string> {
  const mission = await ctx.runQuery(internal.missions.read, { key });
  const effect = mission.effects.find((item) => item.key === effectKey);
  if (!effect) throw new Error("Unknown effect");
  const provider = messagingProviderForEffect(mission, effect);
  if (!provider) throw new Error("Effect is not a Unipile messaging effect");

  const credentials = loadCredentials(process.env);
  const bindings = loadBindings(process.env);
  if (!credentials)
    throw new Error(
      "Unipile credentials are not configured on this deployment",
    );

  const existing = await ctx.runQuery(internal.unipileStore.getReceipt, {
    effectKey,
  });
  const plan = planOutbound({
    mission,
    effect,
    binding: bindingForEndpoint(bindings, effect.endpointRef),
    existingReceiptKey: existing?.key ?? null,
  });

  if (plan.mode === "send") {
    const sent = await sendChatMessage({
      credentials,
      provider: plan.provider,
      accountId: plan.binding.accountId,
      chatId: plan.binding.chatId,
      text: plan.text,
    });
    const receiptId = await ctx.runMutation(internal.unipileStore.storeReceipt, {
      key: effect.key,
      endpointRef: effect.endpointRef,
      payload: effect.payload,
      provider: sent.provider,
      accountId: sent.accountId,
      chatId: sent.chatId,
      providerMessageId: sent.providerMessageId,
      text: sent.text,
    });
    await ctx.runMutation(internal.missions.acknowledge, {
      key,
      effectKey,
      receiptId,
      ...(runId ? { runId } : {}),
    });
    return `Unipile ${provider} API accepted the message; independent read-back is still required`;
  }

  if (!existing)
    throw new Error("Missing Unipile receipt for idempotent retry");
  await ctx.runMutation(internal.missions.acknowledge, {
    key,
    effectKey,
    receiptId: existing.id,
    ...(runId ? { runId } : {}),
  });
  return `Unipile ${provider} delivery reused prior receipt; duplicate send prevented`;
}

async function verifyUnipile(
  ctx: ActionCtx,
  key: string,
  effectKey: string,
  runId?: string,
): Promise<string> {
  const credentials = loadCredentials(process.env);
  if (!credentials)
    throw new Error(
      "Unipile credentials are not configured on this deployment",
    );
  const receipt = await ctx.runQuery(internal.unipileStore.getReceipt, {
    effectKey,
  });
  if (!receipt)
    throw new Error(
      "No Unipile receipt to verify; provider success is unverified",
    );

  const observed = await readMessage({
    credentials,
    providerMessageId: receipt.providerMessageId,
  });
  if (
    !readBackMatches({
      expectedText: receipt.text,
      expectedChatId: receipt.chatId,
      expectedMessageId: receipt.providerMessageId,
      observed,
    })
  )
    throw new Error("Unipile read-back does not match the intended effect");

  return await ctx.runMutation(internal.missions.verify, {
    key,
    effectKey,
    observed: {
      key: receipt.key,
      endpointRef: receipt.endpointRef,
      payload: receipt.payload,
      createdAt: receipt.createdAt,
    },
    ...(runId ? { runId } : {}),
  });
}

// Transport boundary (not a plugin registry). Dispatch order matters:
// 1) purchase_order → QuickBooks Sandbox create/reconcile + read-back
// 2) WhatsApp/Instagram → Unipile when credentials + bindings are configured
// 3) Gmail rfq/clarification → Google when GOOGLE_WORKSPACE_LIVE=true
// 4) Web request_quote → public catalogue retrieval (never fixture injection)
// 5) otherwise Development fixtures
export async function dispatch(
  ctx: ActionCtx,
  key: string,
  command: AgentCommand,
  runId?: string,
): Promise<string> {
  const args = {
    key,
    effectKey: "effectKey" in command ? command.effectKey : "",
    ...(runId ? { runId } : {}),
  };
  if (command.type === "execute_effect") {
    const effect = await ctx.runMutation(internal.missions.attempt, args);
    if (effect.status === "verified" || effect.status === "unverified")
      return `Effect already ${effect.status}; no duplicate delivery`;

    if (effect.kind === "purchase_order") {
      const mission = await ctx.runQuery(internal.missions.read, { key });
      const intent = purchaseOrderIntent(mission, effect);
      const result = await createOrReconcilePurchaseOrder(
        readConfig(process.env),
        intent,
        effect.receiptId,
      );
      await ctx.runMutation(internal.missions.acknowledge, {
        ...args,
        receiptId: result.providerId,
      });
      return result.created
        ? "QuickBooks Purchase Order create returned success; verification is still required"
        : "QuickBooks Purchase Order reconciled without duplicate create; verification is still required";
    }

    const mission = await ctx.runQuery(internal.missions.read, { key });
    const liveUnipile =
      unipileConfigured(process.env) &&
      messagingProviderForEffect(mission, effect) !== null;
    if (liveUnipile) return await deliverUnipile(ctx, key, effect.key, runId);

    const vendor = gmailVendor(mission, effect);
    if (
      liveGoogle() &&
      vendor &&
      (effect.kind === "rfq" || effect.kind === "clarification")
    ) {
      const delivered = await ctx.runAction(
        internal.googleWorkspace.deliverGmailEffect,
        {
          effectKey: effect.key,
          kind: effect.kind,
          endpointRef: effect.endpointRef,
          payload: effect.payload,
          threadId: threadFromMission(mission, vendor.id),
        },
      );
      // Payload identity stays in the transport ledger for exact match verification.
      // receiptId carries the durable Gmail message id used for external read-back.
      await ctx.runMutation(internal.missions.deliverFixture, args);
      await ctx.runMutation(internal.missions.acknowledge, {
        ...args,
        receiptId: delivered.messageId,
      });
      return `Gmail ${effect.kind} accepted by API (message ${delivered.messageId}, thread ${delivered.threadId}); verification still required`;
    }

    const receiptId = await ctx.runMutation(
      internal.missions.deliverFixture,
      args,
    );
    await ctx.runMutation(internal.missions.acknowledge, {
      ...args,
      receiptId,
    });
    return "Development fixture delivery succeeded; verification is still required";
  }
  if (command.type === "verify_effect") {
    const mission = await ctx.runQuery(internal.missions.read, { key });
    const effect = mission.effects.find(
      (entry) => entry.key === command.effectKey,
    );
    if (!effect) throw new Error("Unknown effect");

    if (effect.kind === "purchase_order") {
      if (!effect.receiptId)
        throw new Error("No QuickBooks provider identity to read back");
      const intent = purchaseOrderIntent(mission, effect);
      await readBackPurchaseOrder(
        readConfig(process.env),
        effect.receiptId,
        intent,
      );
      return await ctx.runMutation(internal.missions.verify, {
        ...args,
        observed: {
          key: effect.key,
          endpointRef: effect.endpointRef,
          payload: effect.payload,
          createdAt: Date.now(),
        },
      });
    }

    const liveUnipile =
      Boolean(loadCredentials(process.env)) &&
      Boolean(loadBindings(process.env).length) &&
      messagingProviderForEffect(mission, effect) !== null;
    if (liveUnipile) return await verifyUnipile(ctx, key, effect.key, runId);

    const vendor = gmailVendor(mission, effect);
    if (
      liveGoogle() &&
      vendor &&
      effect.receiptId &&
      (effect.kind === "rfq" || effect.kind === "clarification")
    ) {
      await ctx.runAction(internal.googleWorkspace.readBackGmailEffect, {
        effectKey: effect.key,
        endpointRef: effect.endpointRef,
        payload: effect.payload,
        messageId: effect.receiptId,
      });
      const observed = await ctx.runQuery(internal.missions.readReceipt, {
        effectKey: command.effectKey,
      });
      return await ctx.runMutation(internal.missions.verify, {
        ...args,
        observed,
      });
    }

    const observed = await ctx.runQuery(internal.missions.readReceipt, {
      effectKey: command.effectKey,
    });
    return await ctx.runMutation(internal.missions.verify, {
      ...args,
      observed,
    });
  }
  const result = await ctx.runMutation(internal.missions.apply, {
    key,
    command: JSON.stringify(command),
    ...(runId ? { runId } : {}),
  });
  if (command.type === "request_quote" || command.type === "clarify_quote") {
    await ingestInboundObservation(ctx, key, command);
  }
  return result;
}

async function ingestInboundObservation(
  ctx: ActionCtx,
  key: string,
  command:
    | { type: "request_quote"; vendorId: string }
    | { type: "clarify_quote"; vendorId: string; question: string },
): Promise<void> {
  const mission = (await ctx.runQuery(internal.missions.read, {
    key,
  })) as Mission;
  const configured = mission.vendors.find((v) => v.id === command.vendorId);
  if (!configured) return;

  // Real Web catalogue retrieval — never inject fixture evidence for Web.
  if (configured.channel === "Web") {
    if (command.type === "clarify_quote") return;
    const evidence = await sourceCatalogueEvidence(mission, command.vendorId);
    await ctx.runMutation(internal.missions.apply, {
      key,
      command: JSON.stringify({
        type: "ingest_external_evidence",
        evidence,
      }),
    });
    return;
  }

  // Live Unipile vendors wait for real inbound webhooks; do not inject fixtures.
  const liveUnipileVendor =
    unipileConfigured(process.env) &&
    (configured.channel === "WhatsApp" || configured.channel === "Instagram");
  if (liveUnipileVendor) return;

  // Live Gmail waits for real supplier replies via ingestGmailReplies.
  if (liveGoogle() && configured.channel === "Gmail") return;

  const stage =
    command.type === "clarify_quote" ? "clarification" : "initial";
  await ctx.runMutation(internal.missions.apply, {
    key,
    command: JSON.stringify({
      type: "ingest_external_evidence",
      evidence: fixtureEvidence(mission, command.vendorId, stage, Date.now()),
    }),
  });
}
