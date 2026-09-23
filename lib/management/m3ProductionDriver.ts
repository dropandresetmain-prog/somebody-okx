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
import { extractLiveAcquisitionContent } from "../payment/liveAcquisitionContent";

export type DriverMode = "inspect" | "prepare" | "execute" | "observe" | "reconcile";

export type DriverSnapshot = {
  intent: ExecutionIntent;
  requirementCurrent: boolean;
  contractCurrent: boolean;
  objectiveExists: boolean;
  /** Exact named M4 grant remains a current authority for this intent's price. */
  founderSpendApprovalCurrent: boolean;
};

export type M3DriverWrite = {
  expectedIntent: ExecutionIntent;
  nextIntent: ExecutionIntent;
  events: HandoffEvent[];
  at: number;
  /**
   * Normalized live acquisition content for verification_passed writeback.
   * Extracted from the merchant protected result via the registered adapter.
   */
  acquisitionContent?: string | null;
  acquisitionContentHash?: string | null;
  /**
   * Fulfillment authority: the resource class the ADAPTER declares it actually
   * fulfilled (from the protected result), bound into the attested fact and
   * verified against the intent's authorized target class by Convex writeback.
   */
  acquisitionDeclaredResourceClass?: string | null;
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

// The financial ledger is durable before M4 is written. If a process loses the
// Convex response after that write, this small outbox preserves the exact M4
// transition to retry on a later observation. It is deliberately stored with
// the purchase rather than inferred from a terminal state: inference could
// manufacture an evidence id or erase a stale-write conflict.
type PendingM4Sync = M3DriverWrite;
type DurablePurchase = PurchaseRecord & { pendingM4Sync?: PendingM4Sync };

function withoutPendingSync(purchase: DurablePurchase): PurchaseRecord {
  const { pendingM4Sync: _pending, ...clean } = purchase;
  return clean;
}

async function flushPendingM4Sync(
  deps: M3ProductionDriverDeps,
  snapshot: DriverSnapshot,
  purchase: DurablePurchase,
): Promise<{ intent: ExecutionIntent; purchase: PurchaseRecord; events: HandoffEvent[]; delivered: boolean } | null> {
  const pending = purchase.pendingM4Sync;
  if (!pending) return null;
  // The earlier write may have committed but the process died before clearing
  // this local outbox. Recognize that exact terminal intent without replaying
  // a non-idempotent write.
  if (snapshot.intent.updatedAt === pending.nextIntent.updatedAt && snapshot.intent.lastEventId === pending.nextIntent.lastEventId) {
    const clean = withoutPendingSync(purchase);
    deps.purchases.put(clean);
    return { intent: snapshot.intent, purchase: clean, events: pending.events, delivered: true };
  }
  if (snapshot.intent.updatedAt !== pending.expectedIntent.updatedAt || snapshot.intent.lastEventId !== pending.expectedIntent.lastEventId) {
    throw new Error("M3 financial fact has an unresolved M4 synchronization conflict; reconcile business state before any further driver action");
  }
  await deps.store.write(pending);
  const clean = withoutPendingSync(purchase);
  deps.purchases.put(clean);
  return { intent: pending.nextIntent, purchase: clean, events: pending.events, delivered: true };
}

function assertTarget(snapshot: DriverSnapshot, mode: DriverMode): void {
  if (!snapshot.objectiveExists) throw new Error("refusing M3 driver: objective no longer exists");
  if (!snapshot.requirementCurrent || !snapshot.contractCurrent) {
    // Financial observation remains required after a revision, but no new
    // execution may be opened against stale business authority.
    if (mode === "execute" || mode === "prepare") throw new Error("refusing M3 driver: intent is stale against the current requirement/contract revision");
  }
}

/**
 * New payment authority must be tied to the exact grant selected when the
 * intent was created. This boolean is computed by the governed M4 snapshot;
 * it is deliberately not inferred from another currently-active grant.
 *
 * Financial observation is excluded. Revocation after a possible submission
 * cannot erase the duty to discover and reconcile the financial truth.
 */
export function assertCurrentFounderSpendAuthority(
  snapshot: DriverSnapshot,
  operation: "prepare" | "preview" | "confirm" | "execute",
): void {
  if (!snapshot.founderSpendApprovalCurrent) {
    throw new Error(`refusing ${operation}: the exact founder spend grant named by this intent is missing, revoked, cross-objective, or insufficient`);
  }
}

async function persist(
  deps: M3ProductionDriverDeps,
  expectedIntent: ExecutionIntent,
  result: SeamResult,
): Promise<void> {
  const needsM4Write = result.intent !== expectedIntent || result.events.length > 0;
  // The M4 kernel, not the caller's pre-observation clock, owns the transition
  // timestamp. Reusing it makes a post-commit/lost-ack restart recognize the
  // exact write that Convex already accepted.
  const writeback =
    result.m3State === "verified" &&
    result.purchase?.verified === true &&
    result.intent.state === "verified"
      ? extractLiveAcquisitionContent(result.purchase.result, {
          offeringId: result.intent.target.offeringId,
          serviceId: result.intent.target.serviceId,
        })
      : null;
  const pending = needsM4Write
    ? {
        expectedIntent,
        nextIntent: result.intent,
        events: result.events,
        at: result.intent.updatedAt,
        acquisitionContent: writeback?.content ?? null,
        acquisitionContentHash: writeback?.contentHash ?? null,
        acquisitionDeclaredResourceClass: writeback?.resourceClass ?? null,
      }
    : null;
  if (result.purchase) {
    deps.purchases.put((pending ? { ...result.purchase, pendingM4Sync: pending } : result.purchase) as PurchaseRecord);
  }
  if (pending) {
    await deps.store.write(pending);
    // Clear the outbox only after Convex acknowledges the governed transition.
    // A crash before this clear is harmless: the restart recognizes the exact
    // already-written intent and clears it without generating a new fact.
    if (result.purchase) deps.purchases.put(withoutPendingSync({ ...result.purchase, pendingM4Sync: pending }));
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
  const existing = deps.purchases.get(intent.intentId) as DurablePurchase | null;
  const at = (deps.now ?? Date.now)();

  if (existing?.pendingM4Sync) {
    if (mode === "inspect" || mode === "reconcile") {
      return {
        mode, intent, purchase: existing, events: [], changed: false, stale,
        reconciliationRequired: existing.state === "reconciliation_required" || existing.state === "uncertain",
        detail: "durable M3 fact awaits governed M4 writeback; observe will replay the exact outbox and never execute again",
      };
    }
    if (mode !== "observe") throw new Error("M3 financial fact awaits governed M4 writeback; observe before any prepare or execute command");
    const flushed = await flushPendingM4Sync(deps, snapshot, existing);
    if (flushed) {
      return {
        mode, intent: flushed.intent, purchase: flushed.purchase, events: flushed.events,
        changed: flushed.delivered, stale, reconciliationRequired: false,
        detail: "durable M3 fact replayed through governed M4 writeback; no financial action occurred",
      };
    }
  }

  // A named durable purchase is not a general-purpose execution voucher. Only
  // the M4 state explicitly waiting for M3 may be prepared or sent to the
  // executor; post-submit, verified, failed and recovery states are read-only.
  if ((mode === "prepare" || mode === "execute") && intent.state !== "awaiting_m3") {
    throw new Error(`refusing ${mode}: M4 intent is ${intent.state}, not awaiting_m3`);
  }

  if (mode === "prepare" || mode === "execute") {
    assertCurrentFounderSpendAuthority(snapshot, mode);
  }

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
    await persist(deps, intent, result);
    return { mode, intent: result.intent, purchase: result.purchase, events: result.events, changed: true, stale, reconciliationRequired: result.reconciliationRequired, detail: result.detail };
  }

  if (!existing) throw new Error("refusing observation: no durable M3 purchase exists; use prepare or a separately authorized execute pass");
  const result = await observePurchase(intent, existing, deps.railForPurchase?.(existing) ?? deps.rail);
  await persist(deps, intent, result);
  return { mode, intent: result.intent, purchase: result.purchase, events: result.events, changed: result.purchase !== existing || result.intent !== intent || result.events.length > 0, stale, reconciliationRequired: result.reconciliationRequired, detail: result.detail };
}
