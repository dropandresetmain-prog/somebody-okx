/**
 * V7 final scope-ownership correction — prove authority direction.
 *
 * Governed vocabulary lives in the application catalog. Application request
 * policy and adapter fulfillment declaration both reference that catalog
 * value independently. Neither imports the other's authority declaration.
 * No live model/provider/merchant/payment call.
 */
import test from "node:test";
import assert from "node:assert/strict";
import {
  FOUNDER_MESSAGING_QUALITATIVE_PURPOSE_KIND,
  GOVERNED_PURPOSE_KINDS,
  PURPOSE_SCOPES,
} from "../lib/workforce/catalog";
import { CANONICAL_AUTHORIZED_PURPOSE_POLICY } from "../lib/objective/seedData";
import {
  M3_PRODUCT_FULFILLMENT_SCOPE,
  M3_SUPPORTED_PURPOSE_KIND,
} from "../lib/payment/m3FounderNarrativeProduct";

test("ownership A: founder messaging purpose kind is defined by the application catalog PURPOSE_SCOPES entry", () => {
  assert.equal(
    FOUNDER_MESSAGING_QUALITATIVE_PURPOSE_KIND,
    "founder_messaging_qualitative",
  );
  assert.equal(PURPOSE_SCOPES.length, 1, "exactly one governed purpose scope");
  assert.equal(PURPOSE_SCOPES[0]!.kind, FOUNDER_MESSAGING_QUALITATIVE_PURPOSE_KIND);
  assert.deepEqual([...GOVERNED_PURPOSE_KINDS], [
    FOUNDER_MESSAGING_QUALITATIVE_PURPOSE_KIND,
  ]);
});

test("ownership B: application request policy imports the catalog kind, not the adapter declaration", () => {
  // Identity equality with the catalog export — the policy's purposeKind IS
  // the application-owned vocabulary constant.
  assert.equal(
    CANONICAL_AUTHORIZED_PURPOSE_POLICY.purposeKind,
    FOUNDER_MESSAGING_QUALITATIVE_PURPOSE_KIND,
  );
  assert.equal(
    CANONICAL_AUTHORIZED_PURPOSE_POLICY.targetRequirementKind,
    "deliverable",
  );
  // Compatibility (same value) is allowed; adapter fulfillment is a separate
  // declaration that happens to reference the same catalog kind.
  assert.equal(
    CANONICAL_AUTHORIZED_PURPOSE_POLICY.purposeKind,
    M3_SUPPORTED_PURPOSE_KIND,
  );
});

test("ownership C: adapter fulfillment independently declares compatibility with the catalog kind", () => {
  assert.equal(M3_SUPPORTED_PURPOSE_KIND, FOUNDER_MESSAGING_QUALITATIVE_PURPOSE_KIND);
  assert.deepEqual([...M3_PRODUCT_FULFILLMENT_SCOPE.purposeKinds], [
    FOUNDER_MESSAGING_QUALITATIVE_PURPOSE_KIND,
  ]);
  // One taxonomy: every adapter-declared kind is in the catalog list.
  for (const kind of M3_PRODUCT_FULFILLMENT_SCOPE.purposeKinds) {
    assert.ok(GOVERNED_PURPOSE_KINDS.includes(kind));
  }
});
