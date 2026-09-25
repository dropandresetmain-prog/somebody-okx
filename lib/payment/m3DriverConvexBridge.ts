/** Shared Convex bridge + durable ledgers for the LOCAL M4×M3 production driver. */
import path from "node:path";
import { createHmac } from "node:crypto";
import { ConvexHttpClient } from "convex/browser";

import type { M3DriverStore } from "../management/m3ProductionDriver";
import { canonicalM3DriverFact, type M3DriverFact } from "../management/m3DriverFacts";
import { FilePurchaseLedger, resolvePurchaseLedgerPath } from "./purchaseLedger";
import { founderMerchantLabelFromOfferingName } from "../integration/persistedEvents";
import { TESTNET_DEMO_OFFERINGS } from "../market/testnetDemoMarket";
import { XLAYER_TESTNET_NETWORK } from "./xlayerSettlement";
import type { ExecutionIntent } from "../management/types";
import type { PurchaseRecord } from "./types";

export type M3DriverBridge = {
  client: ConvexHttpClient;
  driverToken: string;
  store: M3DriverStore;
  purchases: FilePurchaseLedger;
  recordWalletPreparing(intent: ExecutionIntent, purchase: PurchaseRecord, at: number): Promise<void>;
  onPurchaseSettled(input: { intent: ExecutionIntent; purchase: PurchaseRecord; at: number }): Promise<void>;
};

export function createM3DriverConvexBridge(applicationRoot: string): M3DriverBridge {
  const url = process.env.CONVEX_URL;
  const driverToken = process.env.M4_M3_DRIVER_TOKEN;
  if (!url || !driverToken) {
    throw new Error("CONVEX_URL and M4_M3_DRIVER_TOKEN must be set; values are never printed");
  }
  const client = new ConvexHttpClient(url);
  const bridge = client as unknown as {
    query(name: "m3Driver:snapshot", args: { intentId: string; driverToken: string }): Promise<unknown>;
    mutation(name: string, args: Record<string, unknown>): Promise<unknown>;
  };
  const purchases = new FilePurchaseLedger(resolvePurchaseLedgerPath(applicationRoot));

  const recordWalletPreparing = async (intent: ExecutionIntent, purchase: PurchaseRecord, at: number) => {
    const offering = TESTNET_DEMO_OFFERINGS.find((row) => row.serviceId === intent.target.serviceId);
    const merchantLabel = offering
      ? founderMerchantLabelFromOfferingName(offering.name)
      : intent.target.serviceId ?? "External merchant";
    const amount = purchase.boundTerms?.maxAmountRequired ?? String(intent.terms.priceUsd ?? "");
    const asset = purchase.boundTerms?.asset ?? "USDT";
    await bridge.mutation("integrationEventsDriver:recordPaymentPreparingFromDriver", {
      driverToken,
      objectiveKey: intent.objectiveKey,
      intentId: intent.intentId,
      merchantLabel,
      amount: { amount, currency: asset === "USDT" ? "USD₮0" : asset },
      networkLabel: "X Layer Testnet",
      at,
    });
  };

  const onPurchaseSettled = async ({
    intent,
    purchase,
    at,
  }: {
    intent: ExecutionIntent;
    purchase: PurchaseRecord;
    at: number;
  }) => {
    const txHash = purchase.receipt?.transactionHash;
    if (!txHash || purchase.boundTerms?.network !== XLAYER_TESTNET_NETWORK) return;
    await bridge.mutation("integrationEventsDriver:recordSettlementFromDriver", {
      driverToken,
      objectiveKey: intent.objectiveKey,
      intentId: intent.intentId,
      txHash,
      amount: purchase.boundTerms
        ? {
            amount: purchase.boundTerms.maxAmountRequired,
            currency: purchase.boundTerms.asset === "USDT" ? "USD₮0" : purchase.boundTerms.asset,
          }
        : undefined,
      at,
    });
  };

  const store: M3DriverStore = {
    read: (id) => bridge.query("m3Driver:snapshot", { intentId: id, driverToken }) as never,
    async write(change) {
      const previous = change.expectedIntent;
      const next = change.nextIntent;
      if (previous.state === next.state && change.events.length === 0) return;
      const event = change.events[0];
      const eventKind =
        next.state === "handed_off"
          ? "submitted"
          : next.state === "result_recorded"
            ? "provider_result"
            : next.state === "verified"
              ? "verification_passed"
              : next.state === "reconciliation_required"
                ? "reconciliation_required"
                : previous.state === "result_recorded"
                  ? "verification_failed"
                  : "pre_submission_failed";
      const fact: M3DriverFact = {
        intentId: next.intentId,
        expectedUpdatedAt: previous.updatedAt,
        eventKind,
        eventId: next.lastEventId ?? `m3_driver_${next.intentId}_${change.at}`,
        dedupeKey: event?.dedupeKey ?? `intent:${next.intentId}:submitted:${next.lastEventId ?? change.at}`,
        evidenceId:
          eventKind === "provider_result"
            ? next.resultEvidenceId ?? null
            : eventKind.startsWith("verification")
              ? next.verificationEvidenceId ?? null
              : null,
        note: next.boundaryNote,
        at: change.at,
        acquisitionContentHash:
          eventKind === "verification_passed" ? change.acquisitionContentHash ?? null : null,
        acquisitionDeclaredResourceClass:
          eventKind === "verification_passed" ? change.acquisitionDeclaredResourceClass ?? null : null,
      };
      const attestationKey = process.env.M4_M3_FACT_ATTESTATION_KEY;
      if (!attestationKey) {
        throw new Error("M4_M3_FACT_ATTESTATION_KEY is required to attest a financial M3 fact for Convex writeback");
      }
      if (attestationKey === driverToken) {
        throw new Error("M4_M3_FACT_ATTESTATION_KEY must be distinct from M4_M3_DRIVER_TOKEN");
      }
      const attestation = createHmac("sha256", attestationKey).update(canonicalM3DriverFact(fact)).digest("hex");
      await bridge.mutation("m3Driver:apply", {
        ...fact,
        evidenceId: fact.evidenceId ?? undefined,
        acquisitionContentHash: fact.acquisitionContentHash,
        acquisitionContent:
          eventKind === "verification_passed" ? change.acquisitionContent ?? undefined : undefined,
        attestation,
        driverToken,
      });
    },
  };

  return { client, driverToken, store, purchases, recordWalletPreparing, onPurchaseSettled };
}
