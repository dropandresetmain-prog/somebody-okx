/** Node-only orchestration for one persisted M4 intent and its M3 purchase. */
import {
  handoffIntentToM3,
  observePurchase,
  purchaseRecordFromIntent,
  type HandoffEvent,
  type M3BuyerRailDeps,
  type SeamResult,
} from "./m3BuyerRail";
import type { ExecutionIntent } from "./types";
import type { PurchaseRecord } from "../payment/types";
import type { PurchaseLedger } from "../payment/purchaseLedger";

export type DriverMode = "inspect" | "prepare" | "execute" | "observe" | "reconcile";

export type DriverSnapshot = {
  intent: ExecutionIntent;
  requirementCurrent: boolean;
  contractCurrent: boolean;
  objectiveExists: boolean;
};

export type M3DriverWrite = {
  expectedIntent: ExecutionIntent;
  nextIntent: ExecutionIntent;
  events: HandoffEvent[];
  at: number;
};

export type M3DriverStore = {
  read(intentId: string): Promise<DriverSnapshot | null>;
  write(change: M3DriverWrite): Promise<void>;
};

export type M3ProductionDriverDeps = {
  store: M3DriverStore;
  purchases: PurchaseLedger;
  rail: M3BuyerRailDeps;
  /** Builds the real observation rail from the durable purchase, avoiding a
   * process-local payment handle after restart. */
  railForPurchase?: (purchase: PurchaseRecord) => M3BuyerRailDeps;
  now?: () => number;
  /** Explicit future supervised authority. Defaults false and is never inferred. */
  executionAuthorized?: boolean;
  /** Production-only path: consumes the durable approved purchase and records
   * payment_attempted before it may invoke an executor. */
  supervisedSubmit?: (input: {
    intent: ExecutionIntent;
    purchase: PurchaseRecord;
    persistPaymentAttempt: (purchase: PurchaseRecord) => Promise<void>;
  }) => Promise<SeamResult>;
};

export type M3ProductionDriverResult = {
  mode: DriverMode;
  intent: ExecutionIntent;
  purchase: PurchaseRecord | null;
  events: HandoffEvent[];
  detail: string;
  changed: boolean;
  stale: boolean;
  reconciliationRequired: boolean;
};

function assertTarget(snapshot: DriverSnapshot, mode: DriverMode): void {
  if (!snapshot.objectiveExists) throw new Error("refusing M3 driver: objective no longer exists");
  if (!snapshot.requirementCurrent || !snapshot.contractCurrent) {
    // Financial observation remains required after a revision, but no new
    // execution may be opened against stale business authority.
    if (mode === "execute" || mode === "prepare") throw new Error("refusing M3 driver: intent is stale against the current requirement/contract revision");
  }
}

async function persist(
  deps: M3ProductionDriverDeps,
  expectedIntent: ExecutionIntent,
  result: SeamResult,
  at: number,
): Promise<void> {
  if (result.purchase) deps.purchases.put(result.purchase);
  if (result.intent !== expectedIntent || result.events.length > 0) {
    await deps.store.write({ expectedIntent, nextIntent: result.intent, events: result.events, at });
  }
}

/**
 * Runs exactly one explicitly named driver mode. It never selects an arbitrary
 * pending row: callers must provide the stable `intentId` effect identity.
 */
export async function runM3ProductionDriver(
  mode: DriverMode,
  intentId: string,
  deps: M3ProductionDriverDeps,
): Promise<M3ProductionDriverResult> {
  if (!intentId) throw new Error("--intent-id is required");
  const snapshot = await deps.store.read(intentId);
  if (!snapshot) throw new Error(`execution intent not found: ${intentId}`);
  assertTarget(snapshot, mode);
  const stale = !snapshot.requirementCurrent || !snapshot.contractCurrent;
  const intent = snapshot.intent;
  const existing = deps.purchases.get(intent.intentId);
  const at = (deps.now ?? Date.now)();

  if (mode === "inspect" || mode === "reconcile") {
    return {
      mode, intent, purchase: existing, events: [], changed: false, stale,
      reconciliationRequired: existing?.state === "reconciliation_required" || existing?.state === "uncertain",
      detail: mode === "reconcile"
        ? "read-only reconciliation inspection; no retry or new authorization was attempted"
        : "read-only inspection",
    };
  }

  if (mode === "prepare") {
    const purchase = existing ?? purchaseRecordFromIntent(intent, at);
    deps.purchases.put(purchase);
    return {
      mode, intent, purchase, events: [], changed: !existing, stale, reconciliationRequired: false,
      detail: existing ? "existing durable M3 purchase retained; prepare did not sign or submit" : "durable M3 purchase identity prepared; no signing or submission occurred",
    };
  }

  if (mode === "execute") {
    if (!deps.executionAuthorized) throw new Error("execution mode is disabled: a separately authorized supervised pass is required");
    if (existing && !["prepared", "awaiting_approval", "approved"].includes(existing.state)) {
      throw new Error(`refusing execution: durable M3 purchase is already ${existing.state}; reconcile or observe, never repay`);
    }
    const result = await (deps.supervisedSubmit
      ? (() => {
          if (!existing) throw new Error("supervised execution requires a durable approved purchase");
          return deps.supervisedSubmit({
            intent,
            purchase: existing,
            persistPaymentAttempt: async (attempted) => { deps.purchases.put(attempted); },
          });
        })()
      : handoffIntentToM3(intent, deps.rail));
    await persist(deps, intent, result, at);
    return { mode, intent: result.intent, purchase: result.purchase, events: result.events, changed: true, stale, reconciliationRequired: result.reconciliationRequired, detail: result.detail };
  }

  if (!existing) throw new Error("refusing observation: no durable M3 purchase exists; use prepare or a separately authorized execute pass");
  const result = await observePurchase(intent, existing, deps.railForPurchase?.(existing) ?? deps.rail);
  await persist(deps, intent, result, at);
  return { mode, intent: result.intent, purchase: result.purchase, events: result.events, changed: result.purchase !== existing || result.intent !== intent || result.events.length > 0, stale, reconciliationRequired: result.reconciliationRequired, detail: result.detail };
}
