/**
 * One bounded advance of the LOCAL testnet_demo M4×M3 driver for a single intent.
 * Used by the watcher and by `m4-m3-production-driver.ts advance`.
 */
import { assertCurrentFounderSpendAuthority, runM3ProductionDriver } from "../management/m3ProductionDriver";
import type { M3BuyerRailDeps } from "../management/m3BuyerRail";
import { readSomebodyExecutionMode } from "../execution/executionMode";
import { createLocalPreviewComposition, createLocalProductionComposition } from "./localProductionComposition";
import { prepareFounderVisiblePreview } from "./supervisedPreparation";
import { persistFounderConfirmation } from "./supervisedDriverAdapter";
import { FilePreviewLedger, resolvePreviewLedgerPath } from "./previewLedger";
import type { M3DriverBridge } from "./m3DriverConvexBridge";

/** Product Attention approval doubles as payment confirmation in local demo E2E. */
export const LOCAL_DEMO_FOUNDER_PAYMENT_CONFIRMATION_ID = "founder-product-attention-approve";

export function localDemoM3DriverEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return (
    readSomebodyExecutionMode(env) === "testnet_demo" &&
    env.M4_M3_EXECUTION_ENABLED === "true" &&
    Boolean(env.CONVEX_URL?.trim() && env.M4_M3_DRIVER_TOKEN?.trim())
  );
}

function unavailableRail(): M3BuyerRailDeps {
  const unavailable = async () => {
    throw new Error("supervised M3 adapter required for execute/observe");
  };
  return {
    mode: "m3_unavailable",
    railConfig: { allowedNetworks: [], maxSpend: "0" },
    executor: { kind: "official_onchainos", executeApprovedPayment: unavailable },
    fetchLiveChallenge: unavailable,
    settlementReader: { readSettlement: unavailable },
    paidRequestSender: { sendWithPayment: unavailable },
    buildApproval: () => null,
    verifyResult: () => ({ verified: false, verificationProof: "adapter unavailable" }),
  };
}

export type LocalDemoAdvanceResult = {
  intentId: string;
  changed: boolean;
  done: boolean;
  intentState: string | null;
  purchaseState: string | null;
  detail: string;
};

export async function advanceLocalDemoM3Intent(
  intentId: string,
  applicationRoot: string,
  bridge: M3DriverBridge,
): Promise<LocalDemoAdvanceResult> {
  if (!localDemoM3DriverEnabled()) {
    return {
      intentId,
      changed: false,
      done: false,
      intentState: null,
      purchaseState: null,
      detail: "local demo M3 driver disabled (need testnet_demo + M4_M3_EXECUTION_ENABLED + bridge env)",
    };
  }
  if (process.env.M4_M3_FACT_ATTESTATION_KEY === process.env.M4_M3_DRIVER_TOKEN) {
    throw new Error("M4_M3_FACT_ATTESTATION_KEY must be distinct from M4_M3_DRIVER_TOKEN");
  }

  const { store, purchases, recordWalletPreparing, onPurchaseSettled } = bridge;
  const snapshot = await store.read(intentId);
  if (!snapshot) {
    return {
      intentId,
      changed: false,
      done: false,
      intentState: null,
      purchaseState: null,
      detail: "execution intent not found",
    };
  }
  if (!snapshot.objectiveExists || !snapshot.contractCurrent || !snapshot.requirementCurrent) {
    return {
      intentId,
      changed: false,
      done: false,
      intentState: snapshot.intent.state,
      purchaseState: purchases.get(intentId)?.state ?? null,
      detail: "intent stale or objective context missing; refusing advance",
    };
  }

  const intent = snapshot.intent;
  const purchase = purchases.get(intent.intentId);

  if (intent.state === "verified") {
    return {
      intentId,
      changed: false,
      done: true,
      intentState: intent.state,
      purchaseState: purchase?.state ?? null,
      detail: "intent already verified",
    };
  }

  if (intent.state === "failed" || intent.state === "reconciliation_required") {
    return {
      intentId,
      changed: false,
      done: false,
      intentState: intent.state,
      purchaseState: purchase?.state ?? null,
      detail: `intent requires operator reconcile/recovery (${intent.state})`,
    };
  }

  const production = () => createLocalProductionComposition(applicationRoot);
  const withProduction = () => {
    const supplied = production();
    return {
      rail: supplied.rail,
      railForPurchase: supplied.railForPurchase,
      executionAuthorized: supplied.executionAuthorized === true,
      supervisedSubmit: supplied.supervisedSubmit,
      onPurchaseSettled,
    };
  };

  // Post-submit: observe only.
  if (
    intent.state === "handed_off" ||
    intent.state === "result_recorded" ||
    (purchase && ["submitted", "settled", "result_received", "payment_attempted"].includes(purchase.state))
  ) {
    const observed = await runM3ProductionDriver("observe", intentId, {
      store,
      purchases,
      ...withProduction(),
    });
    return {
      intentId,
      changed: observed.changed,
      done: observed.intent.state === "verified",
      intentState: observed.intent.state,
      purchaseState: observed.purchase?.state ?? null,
      detail: observed.detail,
    };
  }

  if (intent.state !== "authorized" && intent.state !== "awaiting_m3") {
    return {
      intentId,
      changed: false,
      done: false,
      intentState: intent.state,
      purchaseState: purchase?.state ?? null,
      detail: `no advance rule for intent state ${intent.state}`,
    };
  }

  assertCurrentFounderSpendAuthority(snapshot, "prepare");

  let workingPurchase = purchase;
  if (!workingPurchase) {
    const prepared = await runM3ProductionDriver("prepare", intentId, {
      store,
      purchases,
      rail: unavailableRail(),
    });
    workingPurchase = prepared.purchase ?? null;
    if (!workingPurchase) {
      return {
        intentId,
        changed: prepared.changed,
        done: false,
        intentState: prepared.intent.state,
        purchaseState: null,
        detail: "prepare returned no durable purchase",
      };
    }
  }

  const localPreview = createLocalPreviewComposition(applicationRoot);
  const previews = new FilePreviewLedger(resolvePreviewLedgerPath(applicationRoot));
  const confirmation = localPreview.confirmations.get(workingPurchase.id);

  if (!confirmation) {
    if (!previews.get(workingPurchase.id)) {
      const previewOutcome = prepareFounderVisiblePreview({
        intent: snapshot.intent,
        purchase: workingPurchase,
        challengeBody: await localPreview.fetchChallenge(),
        railConfig: localPreview.railConfig,
        previews,
        at: Date.now(),
      });
      purchases.put(previewOutcome.purchase);
      workingPurchase = previewOutcome.purchase;
      await recordWalletPreparing(snapshot.intent, workingPurchase, Date.now());
      return {
        intentId,
        changed: true,
        done: false,
        intentState: intent.state,
        purchaseState: workingPurchase.state,
        detail: "founder-visible preview bound; awaiting confirmation",
      };
    }
    persistFounderConfirmation({
      purchase: workingPurchase,
      preview: previews.get(workingPurchase.id)!,
      confirmationId: LOCAL_DEMO_FOUNDER_PAYMENT_CONFIRMATION_ID,
      merchantEndpoint: localPreview.merchantEndpoint,
      confirmedAt: Date.now(),
      confirmations: localPreview.confirmations,
    });
    return {
      intentId,
      changed: true,
      done: false,
      intentState: intent.state,
      purchaseState: workingPurchase.state,
      detail: "durable founder confirmation recorded (local demo)",
    };
  }

  if (["prepared", "awaiting_approval", "approved"].includes(workingPurchase.state)) {
    const executed = await runM3ProductionDriver("execute", intentId, {
      store,
      purchases,
      ...withProduction(),
    });
    return {
      intentId,
      changed: executed.changed,
      done: false,
      intentState: executed.intent.state,
      purchaseState: executed.purchase?.state ?? null,
      detail: executed.detail,
    };
  }

  const observed = await runM3ProductionDriver("observe", intentId, {
    store,
    purchases,
    ...withProduction(),
  });
  return {
    intentId,
    changed: observed.changed,
    done: observed.intent.state === "verified",
    intentState: observed.intent.state,
    purchaseState: observed.purchase?.state ?? null,
    detail: observed.detail,
  };
}
