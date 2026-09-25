/**
 * LOCAL Node entrypoint for exactly one persisted M4×M3 effect.
 *
 * Usage: npx tsx scripts/m4-m3-production-driver.ts <inspect|prepare|execute|observe|reconcile|advance> --intent-id <intentId>
 *
 * `execute` is fail-closed until the concrete local composition has current
 * M4 authority plus durable M3 approval and confirmation. This CLI never
 * exposes a runtime adapter override or invokes a wallet/CLI pay by itself.
 *
 * `advance` runs one bounded local-demo step (testnet_demo + M4_M3_EXECUTION_ENABLED).
 */
import path from "node:path";
import { fileURLToPath } from "node:url";

import { assertCurrentFounderSpendAuthority, runM3ProductionDriver, type DriverMode, type M3ProductionDriverDeps } from "../lib/management/m3ProductionDriver";
import { FilePreviewLedger, resolvePreviewLedgerPath } from "../lib/payment/previewLedger";
import { createLocalPreviewComposition, createLocalProductionComposition } from "../lib/payment/localProductionComposition";
import { prepareFounderVisiblePreview } from "../lib/payment/supervisedPreparation";
import { persistFounderConfirmation } from "../lib/payment/supervisedDriverAdapter";
import type { M3BuyerRailDeps } from "../lib/management/m3BuyerRail";
import { createM3DriverConvexBridge } from "../lib/payment/m3DriverConvexBridge";
import { advanceLocalDemoM3Intent } from "../lib/payment/localDemoM3DriverAdvance";

const modes = new Set<DriverMode>(["inspect", "prepare", "execute", "observe", "reconcile"]);
type CliMode = DriverMode | "preview" | "confirm" | "advance";

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
  if ((!modes.has(mode as DriverMode) && mode !== "preview" && mode !== "confirm" && mode !== "advance") || !intentId) {
    throw new Error("usage: <inspect|prepare|preview|confirm|execute|observe|reconcile|advance> --intent-id <intentId> [--confirmation-id <founder-confirmation-id>]");
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
  if (mode === "execute" || mode === "observe") {
    const factKey = process.env.M4_M3_FACT_ATTESTATION_KEY;
    const driverToken = process.env.M4_M3_DRIVER_TOKEN;
    if (!factKey || factKey === driverToken) {
      throw new Error("execute/observe require a distinct M4_M3_FACT_ATTESTATION_KEY before any M3 financial fact can be written back");
    }
  }
  const applicationRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  const { store, purchases, recordWalletPreparing, onPurchaseSettled } = createM3DriverConvexBridge(applicationRoot);

  if (mode === "advance") {
    const bridge = createM3DriverConvexBridge(applicationRoot);
    const result = await advanceLocalDemoM3Intent(intentId, applicationRoot, bridge);
    console.log(JSON.stringify({ mode, ...result }, null, 2));
    return;
  }

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
      const outcome = prepareFounderVisiblePreview({
        intent: snapshot.intent,
        purchase: prepared.purchase,
        challengeBody: await local.fetchChallenge(),
        railConfig: local.railConfig,
        previews: new FilePreviewLedger(resolvePreviewLedgerPath(applicationRoot)),
        at: Date.now(),
      });
      purchases.put(outcome.purchase);
      await recordWalletPreparing(snapshot.intent, outcome.purchase, Date.now());
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
  let supplied: Pick<M3ProductionDriverDeps, "rail" | "railForPurchase" | "executionAuthorized" | "supervisedSubmit"> = { rail: unavailableRail(), executionAuthorized: false };
  if (mode === "observe" || mode === "execute") {
    const local = createLocalProductionComposition(applicationRoot);
    supplied = {
      rail: local.rail,
      railForPurchase: local.railForPurchase,
      executionAuthorized: local.executionAuthorized === true,
      supervisedSubmit: local.supervisedSubmit,
    };
  }
  const result = await runM3ProductionDriver(mode, intentId, {
    store,
    purchases,
    rail: supplied.rail,
    railForPurchase: supplied.railForPurchase,
    executionAuthorized: supplied.executionAuthorized === true,
    supervisedSubmit: supplied.supervisedSubmit,
    onPurchaseSettled,
  });
  console.log(JSON.stringify({ mode: result.mode, intentId: result.intent.intentId, intentState: result.intent.state, purchaseState: result.purchase?.state ?? null, changed: result.changed, stale: result.stale, reconciliationRequired: result.reconciliationRequired, detail: result.detail }, null, 2));
}

void main().catch((error: Error) => { console.error(error.message); process.exitCode = 1; });
