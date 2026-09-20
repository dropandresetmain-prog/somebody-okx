import { test } from "node:test";
import assert from "node:assert/strict";

import {
  computeNeedDedupeKey,
  createResourceNeed,
  dedupeResourceNeeds,
  transitionNeedStatus,
  buildDecisionRecord,
} from "../lib/objective/resourceNeed";
import type { ResourceNeed } from "../lib/objective/resourceNeed";
import type { SourcingAuthorizingResult } from "../lib/sourcing/types";

const AT = 1_700_000_000_000;

function makeNeed(overrides: Partial<ResourceNeed> = {}): ResourceNeed {
  const base = createResourceNeed({
    id: "n1",
    objectiveKey: "launch",
    resourceClass: "privileged_access",
    purpose: "current social intelligence about OKX",
    reasonOwnedInsufficient: "we do not control privileged X access",
    at: AT,
  });
  return { ...base, ...overrides };
}

// ─── dedupeKey stability & normalization ─────────────────────────────────────

test("dedupeKey is stable across case/whitespace normalization", () => {
  const a = computeNeedDedupeKey({
    objectiveKey: "  Launch  ",
    resourceClass: "privileged_access",
    purpose: "current   social  intelligence about OKX",
  });
  const b = computeNeedDedupeKey({
    objectiveKey: "launch",
    resourceClass: "PRIVILEGED_ACCESS",
    purpose: "Current social intelligence about okx",
  });
  assert.equal(a, b, "normalized inputs must produce identical dedupe keys");
  assert.match(a, /^[0-9a-f]{64}$/);
});

test("dedupeKey differs when purpose differs", () => {
  const a = computeNeedDedupeKey({
    objectiveKey: "launch",
    resourceClass: "privileged_access",
    purpose: "social intelligence",
  });
  const b = computeNeedDedupeKey({
    objectiveKey: "launch",
    resourceClass: "privileged_access",
    purpose: "market data",
  });
  assert.notEqual(a, b);
});

// ─── dedupeResourceNeeds ─────────────────────────────────────────────────────

test("duplicate dedupe returns existing need with created:false", () => {
  const existing = makeNeed({ id: "existing-1", status: "active" });
  const proposed = makeNeed({ id: "proposed-1" });
  const result = dedupeResourceNeeds([existing], proposed);
  assert.equal(result.created, false);
  assert.equal(result.need.id, "existing-1");
});

test("distinct purposes do NOT dedupe", () => {
  const existing = createResourceNeed({
    id: "e1",
    objectiveKey: "launch",
    resourceClass: "privileged_access",
    purpose: "social intelligence about OKX",
    reasonOwnedInsufficient: "we lack X access",
    at: AT,
  });
  const proposed = createResourceNeed({
    id: "p1",
    objectiveKey: "launch",
    resourceClass: "privileged_access",
    purpose: "market data about OKX",
    reasonOwnedInsufficient: "we lack X access",
    at: AT,
  });
  const result = dedupeResourceNeeds([existing], proposed);
  assert.equal(result.created, true);
  assert.equal(result.need.id, "p1");
});

test("fulfilled need does not allow a fresh duplicate of the same obligation", () => {
  const existing = makeNeed({ id: "done", status: "fulfilled" });
  const proposed = makeNeed({ id: "fresh" });
  const result = dedupeResourceNeeds([existing], proposed);
  assert.equal(result.created, false);
  assert.equal(result.need.id, "done");
  assert.equal(result.need.status, "fulfilled");
});

test("rejected need allows a fresh need (no dedupe)", () => {
  const existing = makeNeed({ id: "dead", status: "rejected" });
  const proposed = makeNeed({ id: "fresh2" });
  const result = dedupeResourceNeeds([existing], proposed);
  assert.equal(result.created, true);
  assert.equal(result.need.id, "fresh2");
});

// ─── buildDecisionRecord ─────────────────────────────────────────────────────

test("buildDecisionRecord copies kernel truth and sorts lists", () => {
  const need = makeNeed({ id: "need-1", objectiveKey: "launch" });
  const result: SourcingAuthorizingResult = {
    outcome: "authorizing",
    decision: "BUY",
    reasonCode: "missing_with_approved_path",
    satisfiedResourceClasses: ["llm_reasoning", "llm_reasoning", "public_web"],
    missingResourceClasses: ["privileged_access", "proprietary_data", "privileged_access"],
    approvedProviderPaths: [
      { forResourceClass: "privileged_access", pathId: "okx_testnet" },
      { forResourceClass: "proprietary_data", pathId: "newsliquid_path" },
    ],
  };
  const record = buildDecisionRecord({
    id: "rec-1",
    need,
    result,
    selectedOfferingId: "provider-x:social-intel",
    rejectedOfferingIds: ["z:svc", "a:svc", "z:svc"],
    decidedAt: AT,
  });
  assert.equal(record.decision, "BUY");
  assert.equal(record.reasonCode, "missing_with_approved_path");
  assert.deepEqual(record.satisfied, ["llm_reasoning", "public_web"]);
  assert.deepEqual(record.missing, ["privileged_access", "proprietary_data"]);
  assert.deepEqual(record.rejectedOfferingIds, ["a:svc", "z:svc"]);
  assert.equal(record.selectedOfferingId, "provider-x:social-intel");
  assert.equal(record.resourceNeedId, "need-1");
  assert.equal(record.objectiveKey, "launch");
});

test("buildDecisionRecord for MAKE has empty missing + null selectedOffering", () => {
  const need = makeNeed({ id: "need-make" });
  const result: SourcingAuthorizingResult = {
    outcome: "authorizing",
    decision: "MAKE",
    reasonCode: "all_resources_controlled",
    satisfiedResourceClasses: ["llm_reasoning", "public_web"],
    missingResourceClasses: [],
    approvedProviderPaths: [],
  };
  const record = buildDecisionRecord({
    id: "rec-make",
    need,
    result,
    selectedOfferingId: null,
    rejectedOfferingIds: [],
    decidedAt: AT,
  });
  assert.equal(record.decision, "MAKE");
  assert.deepEqual(record.missing, []);
  assert.equal(record.selectedOfferingId, null);
  assert.deepEqual(record.approvedProviderPaths, []);
});

// ─── status transitions ──────────────────────────────────────────────────────

test("legal forward transition succeeds and updates timestamp", () => {
  const need = makeNeed({ status: "proposed" });
  const next = transitionNeedStatus(need, "active", AT + 1000);
  assert.equal(next.status, "active");
  assert.equal(next.updatedAt, AT + 1000);
});

test("illegal transition proposed -> fulfilled throws", () => {
  const need = makeNeed({ status: "proposed" });
  assert.throws(() => transitionNeedStatus(need, "fulfilled", AT + 1));
});

test("illegal transition fulfilled -> proposed throws", () => {
  const need = makeNeed({ status: "fulfilled" });
  assert.throws(() => transitionNeedStatus(need, "proposed", AT + 1));
});

test("active/sourcing -> fulfilled is legal after verified acquisition", () => {
  const active = makeNeed({ status: "active" });
  const sourcing = makeNeed({ status: "sourcing" });
  assert.equal(transitionNeedStatus(active, "fulfilled", AT + 1).status, "fulfilled");
  assert.equal(transitionNeedStatus(sourcing, "fulfilled", AT + 1).status, "fulfilled");
});

test("active/sourcing -> rejected is legal", () => {
  const active = makeNeed({ status: "active" });
  const sourcing = makeNeed({ status: "sourcing" });
  assert.equal(transitionNeedStatus(active, "rejected", AT + 1).status, "rejected");
  assert.equal(transitionNeedStatus(sourcing, "rejected", AT + 1).status, "rejected");
});

test("proposed -> sourcing is illegal (must go through active)", () => {
  const need = makeNeed({ status: "proposed" });
  assert.throws(() => transitionNeedStatus(need, "sourcing", AT + 1));
});
