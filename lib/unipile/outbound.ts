import type { Effect, Mission } from "../procurement/types";
import type { UnipileBinding, UnipileProvider } from "./types";
import { channelProvider } from "./types";

export function messagingProviderForEffect(
  mission: Mission,
  effect: Effect,
): UnipileProvider | null {
  if (
    effect.kind !== "rfq" &&
    effect.kind !== "clarification" &&
    effect.kind !== "confirmation" &&
    effect.kind !== "rejection"
  )
    return null;
  const vendor = mission.vendors.find((v) => v.id === effect.targetId);
  if (!vendor) return null;
  if (vendor.channel !== "WhatsApp" && vendor.channel !== "Instagram")
    return null;
  return channelProvider[vendor.channel];
}

export function formatOutboundText(effect: Effect, mission: Mission): string {
  const vendor = mission.vendors.find((v) => v.id === effect.targetId);
  const product = vendor?.product ?? "requested items";
  switch (effect.kind) {
    case "rfq": {
      let requirements: {
        quantity: number | null;
        budgetCents: number | null;
        deadlineAt: number | null;
        branded: boolean | null;
      };
      try {
        requirements = JSON.parse(effect.payload) as typeof requirements;
      } catch {
        requirements = mission.requirements;
      }
      const deadline = requirements.deadlineAt
        ? new Date(requirements.deadlineAt).toISOString()
        : "the confirmed deadline";
      return [
        `Somebody RFQ (${effect.key})`,
        `We need ${requirements.quantity ?? "?"} × ${product}.`,
        `Budget ceiling: SGD ${((requirements.budgetCents ?? 0) / 100).toFixed(2)} total.`,
        `Hard delivery deadline: ${deadline}.`,
        `Branding required: ${requirements.branded ? "yes" : "no"}.`,
        "Please reply in plain text with unit price, setup, delivery, tax, MOQ, stock, delivery timing, branding, and currency.",
      ].join("\n");
    }
    case "clarification":
      return `Somebody clarification (${effect.key})\n${effect.payload}`;
    case "confirmation":
      return [
        `Somebody confirmation (${effect.key})`,
        "Your quote was approved. Please proceed with the order as quoted.",
        effect.payload,
      ].join("\n");
    case "rejection":
      return `Somebody close-out (${effect.key})\n${effect.payload}`;
    default:
      throw new Error("Effect is not a Unipile messaging effect");
  }
}

export type OutboundPlan =
  | { mode: "skip_already_delivered"; receiptKey: string }
  | {
      mode: "send";
      binding: UnipileBinding;
      text: string;
      effectKey: string;
      provider: UnipileProvider;
    };

/**
 * Retries must not intentionally send duplicate provider messages.
 * If a receipt already exists for the effect key, reuse it.
 */
export function planOutbound(args: {
  mission: Mission;
  effect: Effect;
  binding: UnipileBinding | undefined;
  existingReceiptKey: string | null;
}): OutboundPlan {
  const provider = messagingProviderForEffect(args.mission, args.effect);
  if (!provider) throw new Error("Effect is not routed to Unipile");
  if (args.existingReceiptKey)
    return { mode: "skip_already_delivered", receiptKey: args.existingReceiptKey };
  if (!args.binding)
    throw new Error("No Unipile binding for this vendor endpoint");
  if (args.binding.provider !== provider)
    throw new Error("Unipile binding provider does not match vendor channel");
  if (args.binding.endpointRef !== args.effect.endpointRef)
    throw new Error("Unipile binding endpoint does not match effect binding");
  return {
    mode: "send",
    binding: args.binding,
    text: formatOutboundText(args.effect, args.mission),
    effectKey: args.effect.key,
    provider,
  };
}

export function readBackMatches(args: {
  expectedText: string;
  expectedChatId: string;
  expectedMessageId: string;
  observed: {
    providerMessageId: string;
    chatId: string;
    text: string;
  } | null;
}): boolean {
  if (!args.observed) return false;
  return (
    args.observed.providerMessageId === args.expectedMessageId &&
    args.observed.chatId === args.expectedChatId &&
    args.observed.text.trim() === args.expectedText.trim()
  );
}
