import { test } from "node:test";
import assert from "node:assert";
import { resolveResultDisplay } from "../app/resultStatus";
import { describeSourcing } from "../app/ObjectiveWorkspace";
import type { SourcingReason } from "../lib/objective/types";

// ── Result display (existing) ───────────────────────────────────────────────

test("no result -> no_result", () => {
  const state = resolveResultDisplay({ accepted: true, unmet: [] }, false);
  assert.strictEqual(state.kind, "no_result");
});

test("result exists but completion absent -> not_accepted with default reason", () => {
  const state = resolveResultDisplay(undefined, true);
  assert.strictEqual(state.kind, "not_accepted");
  if (state.kind === "not_accepted") {
    assert.deepStrictEqual(state.unmet, ["Application has not accepted the proof"]);
  }
});

test("result exists but not accepted -> not_accepted with unmet reasons", () => {
  const state = resolveResultDisplay(
    { accepted: false, unmet: ["Missing company_record observation"] },
    true,
  );
  assert.strictEqual(state.kind, "not_accepted");
  if (state.kind === "not_accepted") {
    assert.deepStrictEqual(state.unmet, ["Missing company_record observation"]);
  }
});

test("result exists and accepted -> accepted", () => {
  const state = resolveResultDisplay({ accepted: true, unmet: [] }, true);
  assert.strictEqual(state.kind, "accepted");
});

test("null completion with result -> not_accepted", () => {
  const state = resolveResultDisplay(null, true);
  assert.strictEqual(state.kind, "not_accepted");
});

// ── Sourcing truth display (M2) ─────────────────────────────────────────────
// describeSourcing renders ONLY what is persisted in plan.sourcing. It never
// re-decides MAKE/BUY/BLOCKED and never invents a field.

function sourcingFixture(overrides: Partial<SourcingReason>): SourcingReason {
  return {
    decision: "MAKE",
    reasonCode: "all_resources_controlled",
    satisfied: [],
    missing: [],
    approvedProviderPaths: [],
    reason: "The company currently controls every required resource class",
    ...overrides,
  };
}

test("MAKE -> make title, viable pill, WHY MAKE?, no missing/approved lines", () => {
  const view = describeSourcing(
    sourcingFixture({
      decision: "MAKE",
      reasonCode: "all_resources_controlled",
      reason: "The company currently controls every required resource class",
    }),
  );
  assert.strictEqual(view.title, "Make it in-house");
  assert.strictEqual(view.tone, "viable");
  assert.strictEqual(view.whyLabel, "WHY MAKE?");
  assert.strictEqual(view.missingLine, null);
  assert.strictEqual(view.approvedLine, null);
  assert.strictEqual(view.noApprovedLine, null);
});

test("MAKE reason text passes through from the persisted shape", () => {
  const reason = "The company currently controls every required resource class";
  const view = describeSourcing(sourcingFixture({ reason }));
  assert.strictEqual(view.whyLabel, "WHY MAKE?");
  // The helper carries no reason copy of its own; PlanSection renders
  // plan.sourcing.reason verbatim under the WHY label.
  assert.ok(!("reason" in view));
});

test("BUY -> buy title, decision pill, WHY BUY?, persisted reason passthrough", () => {
  const reason =
    "Missing resources the company does not control: llm_reasoning. Every missing resource has an approved external provider path.";
  const view = describeSourcing(
    sourcingFixture({
      decision: "BUY",
      reasonCode: "missing_with_approved_path",
      missing: ["llm_reasoning"],
      approvedProviderPaths: [
        { forResourceClass: "llm_reasoning", pathId: "okx_testnet" },
      ],
      reason,
    }),
  );
  assert.strictEqual(view.title, "Buy");
  assert.strictEqual(view.tone, "decision");
  assert.strictEqual(view.whyLabel, "WHY BUY?");
  assert.strictEqual(view.missingLine, "Missing resources: llm_reasoning");
  assert.strictEqual(
    view.approvedLine,
    "Approved external path: okx_testnet (llm_reasoning)",
  );
  assert.strictEqual(view.noApprovedLine, null);
});

test("BUY with several missing resources lists each and its approved path", () => {
  const view = describeSourcing(
    sourcingFixture({
      decision: "BUY",
      reasonCode: "missing_with_approved_path",
      missing: ["llm_reasoning", "specialist_compute"],
      approvedProviderPaths: [
        { forResourceClass: "specialist_compute", pathId: "gpu_burst" },
        { forResourceClass: "llm_reasoning", pathId: "okx_testnet" },
      ],
      reason: "Every missing resource has an approved external provider path.",
    }),
  );
  assert.strictEqual(
    view.missingLine,
    "Missing resources: llm_reasoning, specialist_compute",
  );
  assert.strictEqual(
    view.approvedLine,
    "Approved external path: gpu_burst (specialist_compute), okx_testnet (llm_reasoning)",
  );
});

test("BUY with no persisted approved path renders no path line, never invents one", () => {
  const view = describeSourcing(
    sourcingFixture({
      decision: "BUY",
      reasonCode: "missing_with_approved_path",
      missing: ["llm_reasoning"],
      approvedProviderPaths: [],
      reason: "Every missing resource has an approved external provider path.",
    }),
  );
  assert.strictEqual(view.approvedLine, null);
});

test("BLOCKED -> blocked title, ineligible pill, WHY BLOCKED?, missing resources", () => {
  const reason =
    "Missing resources the company does not currently control: physical_presence";
  const view = describeSourcing(
    sourcingFixture({
      decision: "BLOCKED",
      reasonCode: "missing_without_approved_path",
      missing: ["physical_presence"],
      reason,
    }),
  );
  assert.strictEqual(view.title, "Blocked");
  assert.strictEqual(view.tone, "ineligible");
  assert.strictEqual(view.whyLabel, "WHY BLOCKED?");
  assert.strictEqual(view.missingLine, "Missing resources: physical_presence");
  assert.strictEqual(view.approvedLine, null);
  assert.strictEqual(
    view.noApprovedLine,
    "No approved external path is currently available.",
  );
});

test("BLOCKED never invents a provider path even if none is persisted", () => {
  const view = describeSourcing(
    sourcingFixture({
      decision: "BLOCKED",
      reasonCode: "missing_without_approved_path",
      missing: ["physical_presence"],
      approvedProviderPaths: [],
      reason: "Missing resources the company does not currently control.",
    }),
  );
  assert.strictEqual(view.approvedLine, null);
});

test("sourcing fields absent from persistence render as nothing", () => {
  const view = describeSourcing(
    sourcingFixture({ decision: "BLOCKED", missing: [], reason: "Missing." }),
  );
  assert.strictEqual(view.missingLine, null);
  assert.strictEqual(view.approvedLine, null);
});

// ── M1 backward compatibility ───────────────────────────────────────────────
// Objectives persisted during accepted M1 carry only decision/satisfied/
// missing/reason. M2's reasonCode and approvedProviderPaths arrived later, so
// an existing row must still render instead of throwing.

test("an M1-persisted sourcing row without the M2 fields still renders", () => {
  const legacy = {
    decision: "MAKE",
    satisfied: ["llm_reasoning", "public_web"],
    missing: [],
    reason: "The company currently controls every required resource class",
  } as unknown as SourcingReason;

  const view = describeSourcing(legacy);
  assert.strictEqual(view.title, "Make it in-house");
  assert.strictEqual(view.missingLine, null);
  assert.strictEqual(view.approvedLine, null);
});

test("a legacy BLOCKED row missing the provider-path array does not throw", () => {
  const legacy = {
    decision: "BLOCKED",
    satisfied: ["llm_reasoning"],
    missing: ["attestation"],
    reason: "Missing resources the company does not currently control: attestation",
  } as unknown as SourcingReason;

  const view = describeSourcing(legacy);
  assert.strictEqual(view.title, "Blocked");
  assert.strictEqual(view.missingLine, "Missing resources: attestation");
  assert.strictEqual(
    view.noApprovedLine,
    "No approved external path is currently available.",
  );
});
