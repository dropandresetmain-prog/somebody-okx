import { test } from "node:test";
import assert from "node:assert";
import { resolveResultDisplay } from "../app/resultStatus";

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
