// Portability gate regression (luna-3): MAKE/HYBRID with no capability key is a structural
// problem (bounded repair with the legal keys), not a silent refusal that burns the ceiling.
import test from "node:test";
import assert from "node:assert/strict";
import { validateStrategyStructure } from "../lib/management/proposals";

const legal = { strategies: ["MAKE", "BUY", "HYBRID", "WAIT", "ASK_FOUNDER", "BLOCK"], capabilityCatalog: ["company_records_lookup", "document_drafting"] };

test("MAKE with an empty capability list is structural and names the legal keys", () => {
  const r = validateStrategyStructure({ strategy: "MAKE", desiredCapabilities: [], rationale: "x" }, legal);
  assert.equal(r.ok, false);
  if (!r.ok) {
    assert.equal(r.issues[0].field, "desiredCapabilities");
    assert.deepEqual(r.issues[0].legalValues, legal.capabilityCatalog);
  }
});
test("MAKE with capabilities omitted entirely is also structural", () => {
  assert.equal(validateStrategyStructure({ strategy: "MAKE" }, legal).ok, false);
});
test("BUY / WAIT with no capabilities stay valid", () => {
  assert.equal(validateStrategyStructure({ strategy: "BUY", desiredCapabilities: [] }, legal).ok, true);
  assert.equal(validateStrategyStructure({ strategy: "WAIT" }, legal).ok, true);
});
test("MAKE with a legal capability stays valid", () => {
  assert.equal(validateStrategyStructure({ strategy: "MAKE", desiredCapabilities: ["document_drafting"] }, legal).ok, true);
});
