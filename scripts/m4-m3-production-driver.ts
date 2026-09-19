/**
 * LOCAL Node entrypoint for exactly one persisted M4×M3 effect.
 *
 * Usage: npx tsx scripts/m4-m3-production-driver.ts <inspect|prepare|execute|observe|reconcile> --intent-id <intentId>
 *
 * `execute` is fail-closed unless a separately reviewed supervised adapter is
 * supplied. This fixer never enables it and never invokes a wallet/CLI pay.
 */
import path from "node:path";
import { fileURLToPath } from "node:url";
import { ConvexHttpClient } from "convex/browser";

import { runM3ProductionDriver, type DriverMode, type M3DriverStore, type M3ProductionDriverDeps } from "../lib/management/m3ProductionDriver";
import { FilePurchaseLedger, resolvePurchaseLedgerPath } from "../lib/payment/purchaseLedger";
import { createLocalProductionComposition } from "../lib/payment/localProductionComposition";
import type { M3BuyerRailDeps } from "../lib/management/m3BuyerRail";

type SupervisedAdapter = { build(): Promise<Pick<M3ProductionDriverDeps, "rail" | "executionAuthorized" | "supervisedSubmit">> };
const modes = new Set<DriverMode>(["inspect", "prepare", "execute", "observe", "reconcile"]);

function parse(): { mode: DriverMode; intentId: string; adapterModule: string | null } {
  const [mode, ...rest] = process.argv.slice(2);
  const intentIndex = rest.indexOf("--intent-id");
  const adapterIndex = rest.indexOf("--adapter-module");
  if (!modes.has(mode as DriverMode) || intentIndex < 0 || !rest[intentIndex + 1]) {
    throw new Error("usage: <inspect|prepare|execute|observe|reconcile> --intent-id <intentId> [--adapter-module <absolute-module-path>]");
  }
  return { mode: mode as DriverMode, intentId: rest[intentIndex + 1], adapterModule: adapterIndex >= 0 ? rest[adapterIndex + 1] ?? null : null };
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
  const { mode, intentId, adapterModule } = parse();
  const url = process.env.CONVEX_URL;
  const driverToken = process.env.M4_M3_DRIVER_TOKEN;
  if (!url || !driverToken) throw new Error("CONVEX_URL and M4_M3_DRIVER_TOKEN must be set; values are never printed");
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
      await bridge.mutation("m3Driver:apply", {
        intentId: next.intentId,
        expectedUpdatedAt: previous.updatedAt,
        eventKind,
        eventId: next.lastEventId ?? `m3_driver_${next.intentId}_${change.at}`,
        dedupeKey: event?.dedupeKey ?? `intent:${next.intentId}:submitted:${next.lastEventId ?? change.at}`,
        evidenceId: eventKind === "provider_result" ? next.resultEvidenceId ?? undefined : eventKind.startsWith("verification") ? next.verificationEvidenceId ?? undefined : undefined,
        note: next.boundaryNote,
        at: change.at,
        driverToken,
      });
    },
  };
  const applicationRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  // inspect/prepare/reconcile require no payment configuration. observe/execute
  // use the concrete production composition by default; an explicit adapter is
  // retained only for a separately reviewed deployment-specific override.
  let supplied: Pick<M3ProductionDriverDeps, "rail" | "railForPurchase" | "executionAuthorized" | "supervisedSubmit"> = { rail: unavailableRail(), executionAuthorized: false };
  if (mode === "observe" || mode === "execute") supplied = createLocalProductionComposition(applicationRoot);
  if (adapterModule) supplied = await (await import(adapterModule) as SupervisedAdapter).build();
  const result = await runM3ProductionDriver(mode, intentId, {
    store,
    purchases: new FilePurchaseLedger(resolvePurchaseLedgerPath(applicationRoot)),
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
