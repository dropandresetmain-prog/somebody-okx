/**
 * Focused QuickBooks Sandbox proof for purchase-order create, independent
 * read-back, and idempotent reconciliation. Does not touch Convex.
 *
 * Required env (from .env.local):
 *   QBO_CLIENT_ID, QBO_CLIENT_SECRET, QBO_REFRESH_TOKEN, QBO_REALM_ID
 */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import {
  createOrReconcilePurchaseOrder,
  docNumberForEffect,
  findPurchaseOrderByDocNumber,
  readBackPurchaseOrder,
  readConfig,
  type PurchaseOrderIntent,
} from "../lib/accounting/quickbooks";

async function main() {
  process.loadEnvFile(".env.local");
  const config = readConfig(process.env);
  assert.notEqual(process.env.QBO_ENVIRONMENT, "production");

  const missionKey = `qbo-proof-${randomUUID()}`;
  const effectKey = `purchase_order:${missionKey}:express`;
  const intent: PurchaseOrderIntent = {
    effectKey,
    missionKey,
    vendorId: "express",
    vendorName: "Good Things Studio",
    product: "Custom canvas tote",
    requiredQuantity: 25,
    orderQuantity: 30,
    totalCents: 55500,
    currency: "SGD",
    evidenceVersion: 1,
  };

  console.log(
    JSON.stringify({
      step: "create",
      effectKey,
      docNumber: docNumberForEffect(effectKey),
      realmId: config.realmId,
    }),
  );

  const created = await createOrReconcilePurchaseOrder(config, intent, null);
  assert.equal(created.created, true);
  assert.ok(created.providerId);

  const independent = await readBackPurchaseOrder(
    config,
    created.providerId,
    intent,
  );
  assert.equal(independent.providerId, created.providerId);
  assert.equal(independent.orderQuantity, 30);
  assert.equal(independent.totalCents, 55500);

  const reconciled = await createOrReconcilePurchaseOrder(
    config,
    intent,
    created.providerId,
  );
  assert.equal(reconciled.created, false);
  assert.equal(reconciled.providerId, created.providerId);

  const byDoc = await createOrReconcilePurchaseOrder(config, intent, null);
  assert.equal(byDoc.created, false);
  assert.equal(byDoc.providerId, created.providerId);

  const lookup = await findPurchaseOrderByDocNumber(
    config,
    docNumberForEffect(effectKey),
  );
  assert.ok(lookup);
  assert.equal(lookup!.Id, created.providerId);

  console.log(
    JSON.stringify({
      result: "QUICKBOOKS_PO_PROOF_PASS",
      providerId: created.providerId,
      docNumber: independent.docNumber,
      orderQuantity: independent.orderQuantity,
      totalCents: independent.totalCents,
      bookedCurrency: independent.currency || "company-home",
      intendedCurrencyInNote: "SGD",
      reconciledWithoutDuplicate: true,
    }),
  );
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
