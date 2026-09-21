/**
 * LOCAL Node entrypoint for exactly one persisted M4×M3 effect.
 *
 * Usage: npx tsx scripts/m4-m3-production-driver.ts <inspect|prepare|execute|observe|reconcile> --intent-id <intentId>
 *
 * `execute` is fail-closed until the concrete local composition has current
 * M4 authority plus durable M3 approval and confirmation. This CLI never
 * exposes a runtime adapter override or invokes a wallet/CLI pay by itself.
 */
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createHmac } from "node:crypto";
import { ConvexHttpClient } from "convex/browser";

import { assertCurrentFounderSpendAuthority, runM3ProductionDriver, type DriverMode, type M3DriverStore, type M3ProductionDriverDeps } from "../lib/management/m3ProductionDriver";
import { FilePurchaseLedger, resolvePurchaseLedgerPath } from "../lib/payment/purchaseLedger";
import { FilePreviewLedger, resolvePreviewLedgerPath } from "../lib/payment/previewLedger";
import { createLocalPreviewComposition, createLocalProductionComposition } from "../lib/payment/localProductionComposition";
import { prepareFounderVisiblePreview } from "../lib/payment/supervisedPreparation";
import { persistFounderConfirmation } from "../lib/payment/supervisedDriverAdapter";
import { canonicalM3DriverFact, type M3DriverFact } from "../lib/management/m3DriverFacts";
import type { M3BuyerRailDeps } from "../lib/management/m3BuyerRail";

const modes = new Set<DriverMode>(["inspect", "prepare", "execute", "observe", "reconcile"]);
type CliMode = DriverMode | "preview" | "confirm";

function parse(): { mode: CliMode; intentId: string; confirmationId: string | null } {
  const [mode, ...rest] = process.argv.slice(2);
  const values = new Map<string, string>();
  for (let index = 0; index < rest.length; index += 1) {
    const option = rest[index];
    if (option !== "--intent-id" && option !== "--confirmation-id") throw new Error(`unknown CLI option: ${option}`);
    const value = rest[index + 1];
    if (!value || value.startsWith("--")) throw new Error(`${option} requires a value`);
    if (values.has(option)) throw new Error(`duplicate CLI option: ${option}`);
    values.set(option, value);
    index += 1;
  }
  const intentId = values.get("--intent-id") ?? null;
  const confirmationId = values.get("--confirmation-id") ?? null;
  if ((!modes.has(mode as DriverMode) && mode !== "preview" && mode !== "confirm") || !intentId) {
    throw new Error("usage: <inspect|prepare|preview|confirm|execute|observe|reconcile> --intent-id <intentId> [--confirmation-id <founder-confirmation-id>]");
  }
  if (mode === "confirm" && !confirmationId) {
    throw new Error("confirm requires --confirmation-id <founder-confirmation-id> after the founder reviews the stored safe preview terms");
  }
  return {
    mode: mode as CliMode,
    intentId,
    confirmationId,
  };
}

function unavailableRail(): M3BuyerRailDeps {
  const unavailable = async () => { throw new Error("a reviewed supervised M3 adapter is required for execute/observe; inspect, prepare and reconcile remain safe without one"); };
  return {
    mode: "m3_unavailable", railConfig: { allowedNetworks: [], maxSpend: "0" }, executor: { kind: "official_onchainos", executeApprovedPayment: unavailable },
    fetchLiveChallenge: unavailable, settlementReader: { readSettlement: unavailable }, paidRequestSender: { sendWithPayment: unavailable },
    buildApproval: () => null, verifyResult: () => ({ verified: false, verificationProof: "adapter unavailable" }),
  };
}

async function main() {
  const { mode, intentId, confirmationId } = parse();
  const url = process.env.CONVEX_URL;
  const driverToken = process.env.M4_M3_DRIVER_TOKEN;
  if (!url || !driverToken) throw new Error("CONVEX_URL and M4_M3_DRIVER_TOKEN must be set; values are never printed");
  if (mode === "execute" || mode === "observe") {
    const factKey = process.env.M4_M3_FACT_ATTESTATION_KEY;
    if (!factKey || factKey === driverToken) {
      throw new Error("execute/observe require a distinct M4_M3_FACT_ATTESTATION_KEY before any M3 financial fact can be written back");
    }
  }
  const client = new ConvexHttpClient(url);
  // The generated API is refreshed by `convex codegen` on deployment. The CLI
  // intentionally uses named public refs so this Node-only file can compile
  // before that deploy-time generation step.
  const bridge = client as unknown as {
    query(name: "m3Driver:snapshot", args: { intentId: string; driverToken: string }): Promise<unknown>;
    mutation(name: "m3Driver:apply", args: Record<string, unknown>): Promise<unknown>;
  };
  const store: M3DriverStore = {
    read: (id) => bridge.query("m3Driver:snapshot", { intentId: id, driverToken }) as never,
    async write(change) {
      const previous = change.expectedIntent;
      const next = change.nextIntent;
      if (previous.state === next.state && change.events.length === 0) return;
      const event = change.events[0];
      const eventKind = next.state === "handed_off" ? "submitted"
        : next.state === "result_recorded" ? "provider_result"
        : next.state === "verified" ? "verification_passed"
        : next.state === "reconciliation_required" ? "reconciliation_required"
        : previous.state === "result_recorded" ? "verification_failed"
        : "pre_submission_failed";
      const fact: M3DriverFact = {
        intentId: next.intentId,
        expectedUpdatedAt: previous.updatedAt,
        eventKind,
        eventId: next.lastEventId ?? `m3_driver_${next.intentId}_${change.at}`,
        dedupeKey: event?.dedupeKey ?? `intent:${next.intentId}:submitted:${next.lastEventId ?? change.at}`,
        evidenceId: eventKind === "provider_result" ? next.resultEvidenceId ?? null : eventKind.startsWith("verification") ? next.verificationEvidenceId ?? null : null,
        note: next.boundaryNote,
        at: change.at,
        acquisitionContentHash:
          eventKind === "verification_passed"
            ? change.acquisitionContentHash ?? null
            : null,
      };
      const attestationKey = process.env.M4_M3_FACT_ATTESTATION_KEY;
      if (!attestationKey) throw new Error("M4_M3_FACT_ATTESTATION_KEY is required to attest a financial M3 fact for Convex writeback");
      if (attestationKey === driverToken) throw new Error("M4_M3_FACT_ATTESTATION_KEY must be distinct from M4_M3_DRIVER_TOKEN");
      const attestation = createHmac("sha256", attestationKey).update(canonicalM3DriverFact(fact)).digest("hex");
      await bridge.mutation("m3Driver:apply", {
        ...fact,
        evidenceId: fact.evidenceId ?? undefined,
        acquisitionContentHash: fact.acquisitionContentHash,
        acquisitionContent:
          eventKind === "verification_passed"
            ? change.acquisitionContent ?? undefined
            : undefined,
        attestation,
        driverToken,
      });
    },
  };
  const applicationRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  const purchases = new FilePurchaseLedger(resolvePurchaseLedgerPath(applicationRoot));
  if (mode === "preview" || mode === "confirm") {
    const snapshot = await store.read(intentId);
    if (!snapshot) throw new Error(`execution intent not found: ${intentId}`);
    if (!snapshot.objectiveExists || !snapshot.contractCurrent || !snapshot.requirementCurrent) {
      throw new Error("refusing preview/confirmation: intent is stale or its authoritative M4 context no longer exists");
    }
    assertCurrentFounderSpendAuthority(snapshot, mode);
    if (mode === "preview") {
      const prepared = await runM3ProductionDriver("prepare", intentId, { store, purchases, rail: unavailableRail() });
      if (!prepared.purchase) throw new Error("durable purchase preparation unexpectedly returned no purchase");
      const local = createLocalPreviewComposition(applicationRoot);
      if (local.confirmations.get(prepared.purchase.id)) {
        throw new Error("founder confirmation already exists for this purchase; do not replace its preview authority");
      }
      // This is a read-only 402 challenge fetch. It constructs no executor,
      // makes no payment request, and cannot sign or submit a transaction.
      const outcome = prepareFounderVisiblePreview({
        intent: snapshot.intent,
        purchase: prepared.purchase,
        challengeBody: await local.fetchChallenge(),
        railConfig: local.railConfig,
        previews: new FilePreviewLedger(resolvePreviewLedgerPath(applicationRoot)),
        at: Date.now(),
      });
      purchases.put(outcome.purchase);
      console.log(JSON.stringify({ mode, intentId, purchaseState: outcome.purchase.state, preview: outcome.preview, changed: true, detail: "safe founder-visible preview bound to one durable M3 purchase; no signing or submission occurred" }, null, 2));
      return;
    }
    const purchase = purchases.get(snapshot.intent.intentId);
    if (!purchase) throw new Error("confirm requires an existing durable M3 purchase; run prepare then preview first");
    const preview = new FilePreviewLedger(resolvePreviewLedgerPath(applicationRoot)).get(purchase.id);
    if (!preview) throw new Error("confirm requires a durable founder-visible preview for this exact purchase");
    const local = createLocalPreviewComposition(applicationRoot);
    const confirmation = persistFounderConfirmation({
      purchase,
      preview,
      confirmationId: confirmationId!,
      merchantEndpoint: local.merchantEndpoint,
      confirmedAt: Date.now(),
      confirmations: local.confirmations,
    });
    console.log(JSON.stringify({ mode, intentId, purchaseState: purchase.state, confirmation: { confirmationId: confirmation.confirmationId, purchaseId: confirmation.purchaseId, approvalId: confirmation.approvalId, confirmedTermsFingerprint: confirmation.confirmedTermsFingerprint, confirmedAt: confirmation.confirmedAt }, changed: true, detail: "durable founder confirmation recorded; it is not a signature or payment submission" }, null, 2));
    return;
  }
  // inspect/prepare/reconcile require no payment configuration. observe/execute
  // always use the concrete production composition; tests inject dependencies
  // at the library driver seam rather than changing this executable path.
  let supplied: Pick<M3ProductionDriverDeps, "rail" | "railForPurchase" | "executionAuthorized" | "supervisedSubmit"> = { rail: unavailableRail(), executionAuthorized: false };
  if (mode === "observe" || mode === "execute") supplied = createLocalProductionComposition(applicationRoot);
  const result = await runM3ProductionDriver(mode, intentId, {
    store,
    purchases,
    rail: supplied.rail,
    railForPurchase: supplied.railForPurchase,
    executionAuthorized: supplied.executionAuthorized === true,
    supervisedSubmit: supplied.supervisedSubmit,
  });
  // Deliberately safe summary: it contains no authorization, signature, token,
  // challenge body, raw provider result, or wallet material.
  console.log(JSON.stringify({ mode: result.mode, intentId: result.intent.intentId, intentState: result.intent.state, purchaseState: result.purchase?.state ?? null, changed: result.changed, stale: result.stale, reconciliationRequired: result.reconciliationRequired, detail: result.detail }, null, 2));
}

void main().catch((error: Error) => { console.error(error.message); process.exitCode = 1; });
