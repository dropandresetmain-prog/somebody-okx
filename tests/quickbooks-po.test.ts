import assert from "node:assert/strict";
import test from "node:test";
import {
  assertPurchaseOrderMatchesIntent,
  bookingCurrencyForIntent,
  docNumberForEffect,
  parsePurchaseOrderIntentPayload,
  privateNoteForIntent,
  viewFromPurchaseOrder,
  type PurchaseOrderIntent,
  type QuickBooksPurchaseOrder,
} from "../lib/accounting/quickbooks";

const intent: PurchaseOrderIntent = {
  effectKey: "purchase_order:mission-1:express",
  missionKey: "mission-1",
  vendorId: "express",
  vendorName: "Good Things Studio",
  product: "Custom canvas tote",
  requiredQuantity: 25,
  orderQuantity: 30,
  totalCents: 55500,
  currency: "SGD",
  evidenceVersion: 4,
};

test("docNumberForEffect is stable, short, and collision-resistant enough for retries", () => {
  const first = docNumberForEffect(intent.effectKey);
  const second = docNumberForEffect(intent.effectKey);
  assert.equal(first, second);
  assert.ok(first.length <= 21);
  assert.notEqual(
    docNumberForEffect(intent.effectKey),
    docNumberForEffect("purchase_order:mission-2:express"),
  );
});

test("parsePurchaseOrderIntentPayload requires orderQuantity economics", () => {
  const parsed = parsePurchaseOrderIntentPayload(
    JSON.stringify({
      vendorId: "express",
      requiredQuantity: 25,
      orderQuantity: 30,
      totalCents: 55500,
      currency: "SGD",
      evidenceVersion: 4,
    }),
  );
  assert.equal(parsed.orderQuantity, 30);
  assert.equal(parsed.requiredQuantity, 25);
  assert.throws(() =>
    parsePurchaseOrderIntentPayload(JSON.stringify({ vendorId: "express" })),
  );
});

test("read-back matches vendor, orderQuantity, and total even when books are home-currency USD", () => {
  const po: QuickBooksPurchaseOrder = {
    Id: "147",
    DocNumber: docNumberForEffect(intent.effectKey),
    PrivateNote: privateNoteForIntent(intent),
    TotalAmt: 555,
    CurrencyRef: { value: "USD" },
    VendorRef: { value: "33", name: "Good Things Studio" },
    Line: [
      {
        Amount: 555,
        DetailType: "ItemBasedExpenseLineDetail",
        ItemBasedExpenseLineDetail: {
          Qty: 30,
          UnitPrice: 18.5,
        },
      },
    ],
  };
  const view = viewFromPurchaseOrder(po);
  assert.equal(view.orderQuantity, 30);
  assert.equal(view.totalCents, 55500);
  assert.doesNotThrow(() => assertPurchaseOrderMatchesIntent(po, intent));
  assert.equal(
    bookingCurrencyForIntent("SGD", {
      multiCurrencyEnabled: false,
      homeCurrency: "USD",
      supportedCurrencies: ["USD"],
    }),
    "USD",
  );
});

test("read-back fails when QuickBooks quantity is the required quantity instead of orderQuantity", () => {
  const po: QuickBooksPurchaseOrder = {
    Id: "148",
    DocNumber: docNumberForEffect(intent.effectKey),
    PrivateNote: privateNoteForIntent(intent),
    TotalAmt: 555,
    CurrencyRef: { value: "USD" },
    VendorRef: { value: "33", name: "Good Things Studio" },
    Line: [
      {
        Amount: 555,
        DetailType: "ItemBasedExpenseLineDetail",
        ItemBasedExpenseLineDetail: { Qty: 25, UnitPrice: 22.2 },
      },
    ],
  };
  assert.throws(
    () => assertPurchaseOrderMatchesIntent(po, intent),
    /orderQuantity/,
  );
});
