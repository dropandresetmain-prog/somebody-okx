// Lane 5b: Activity compression, Attention replay treatment, OKX Stack stages.

import "./helpers/ignoreCss";
import test from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { ActivityItem, AttentionState, ObjectiveWorkspaceView } from "../app/product/contracts";
import { compressActivityItems } from "../app/product/activityCompress";
import { Attention } from "../app/product/components/Attention";
import { deriveOkxStackStages, OKXDemoStack } from "../app/product/components/OKXDemoStack";
import { attentionReasonLabel, formatMoney, humanizeKey } from "../app/product/humanize";
import { okxSubmissionRunScenario } from "../lib/demo/scenarios/okxSubmissionRun";

test("humanizeKey maps GPT-6 product vocabulary", () => {
  assert.equal(humanizeKey("proprietary_data"), "the audience benchmark");
  assert.equal(humanizeKey("social_media_guru"), "Social Media Guru");
  assert.equal(humanizeKey("somebody_testnet_social:social_media_guru"), "Social Media Guru");
  assert.equal(attentionReasonLabel("spend_authority_required"), "Waiting on a spend approval");
  assert.equal(formatMoney({ amount: "0.01", currency: "USD" }), "$0.01");
  assert.equal(formatMoney({ amount: "10000", currency: "0x9e29b3aada05bf2d2c827af80bd28d" }), null);
});

test("compressActivityItems drops mechanical noise without fabricating events", () => {
  const raw = okxSubmissionRunScenario.frames[okxSubmissionRunScenario.frames.length - 1]!.workspace.activity;
  const compressed = compressActivityItems(raw);
  assert.ok(compressed.length < raw.length, `expected compression (${compressed.length} < ${raw.length})`);
  assert.ok(compressed.length >= 12, `expected a readable narrative, got ${compressed.length}`);
  const ids = new Set(raw.map((item) => item.id));
  for (const item of compressed) {
    assert.ok(ids.has(item.id), "compression must only keep persisted events");
  }
  assert.equal(
    compressed.filter((item) => item.type === "integration_activity" && item.payload && "action" in item.payload && item.payload.action === "market_search").length,
    1,
  );
  assert.ok(!compressed.some((item) => /input_check:/i.test(item.title)));
});

test("replay Attention shows no approve button", () => {
  const attention: AttentionState = {
    id: "att1",
    revision: "att1:1",
    type: "approval",
    title: "Somebody needs your approval",
    detail: "Acquiring somebody_testnet_social:social_media_guru costs $0.01.",
    context: { reason: "spend_authority_required", amount: { amount: "0.01", currency: "USD" } },
    actions: [{ id: "a1", type: "approve", label: "Approve $0.01 limit", enabled: true }],
  };
  const html = renderToStaticMarkup(createElement(Attention, { attention, mode: "replay" }));
  assert.ok(!html.includes("Approve $0.01 limit"));
  assert.ok(!html.includes("<button"));
  assert.ok(html.includes("Social Media Guru") || html.includes("OKX Testnet Marketplace"));
  assert.ok(html.includes("Waiting on a spend approval"));
  assert.ok(html.includes("$0.01"));
  assert.ok(html.includes("completed run"));
});

test("OKX Stack final GPT-6 frame shows completed path without distractors", () => {
  const view = okxSubmissionRunScenario.frames[okxSubmissionRunScenario.frames.length - 1]!.workspace as ObjectiveWorkspaceView;
  const stages = deriveOkxStackStages(view);
  assert.deepEqual(
    stages.map((s) => [s.id, s.state, s.detail]),
    [
      ["marketplace", "complete", "Social Media Guru selected"],
      ["wallet", "complete", "Purchase authorized"],
      ["x402", "complete", "$0.01 paid"],
      ["xlayer", "complete", "Transaction confirmed"],
    ],
  );
  const html = renderToStaticMarkup(createElement(OKXDemoStack, { view, mode: "replay" }));
  assert.ok(!/distractor/i.test(html));
  assert.ok(!/TESTNET DEMO/i.test(html));
  assert.ok(!/Controlled Testnet catalog/i.test(html));
  assert.ok(html.includes("Social Media Guru selected"));
  assert.ok(html.includes("$0.01 paid"));
});

test("OKX Stack never claims selection or settlement earlier than recorded facts", () => {
  const frames = okxSubmissionRunScenario.frames;
  // Early MAKE frames: market_search may exist, but BUY is not selected yet.
  for (const index of [0, 3, 8, 10]) {
    const stages = deriveOkxStackStages(frames[index]!.workspace);
    const marketplace = stages.find((s) => s.id === "marketplace")!;
    assert.notEqual(marketplace.detail, "Social Media Guru selected", `frame ${index} must not claim selection yet`);
    assert.notEqual(marketplace.state, "complete", `frame ${index} marketplace must not be complete`);
    assert.equal(stages.find((s) => s.id === "xlayer")!.detail, "Waiting for confirmation");
  }
  // Needs-you approval frame: selection is allowed from attention, confirmation is not.
  const needsYou = deriveOkxStackStages(frames[11]!.workspace);
  assert.equal(needsYou.find((s) => s.id === "marketplace")!.detail, "Social Media Guru selected");
  assert.equal(needsYou.find((s) => s.id === "marketplace")!.state, "complete");
  assert.equal(needsYou.find((s) => s.id === "xlayer")!.state, "pending");

  // Transaction submitted but settlement not yet recorded.
  const submitted = deriveOkxStackStages(frames[17]!.workspace);
  assert.equal(submitted.find((s) => s.id === "x402")!.state, "complete");
  assert.equal(submitted.find((s) => s.id === "xlayer")!.detail, "Transaction submitted");
  assert.equal(submitted.find((s) => s.id === "xlayer")!.state, "active");

  // Settlement confirmed.
  const settled = deriveOkxStackStages(frames[18]!.workspace);
  assert.equal(settled.find((s) => s.id === "xlayer")!.detail, "Transaction confirmed");
  assert.equal(settled.find((s) => s.id === "xlayer")!.state, "complete");
});

test("compress keeps acquisition + payment spine from GPT-6 run", () => {
  const raw = okxSubmissionRunScenario.frames[okxSubmissionRunScenario.frames.length - 1]!.workspace.activity;
  const compressed = compressActivityItems(raw);
  const types = new Set(compressed.map((item: ActivityItem) => item.type));
  for (const required of [
    "objective_interpreted",
    "manager_decision",
    "acquisition_started",
    "external_result_received",
    "external_result_verified",
    "work_resumed",
    "verification_completed",
    "objective_completed",
  ]) {
    assert.ok(types.has(required as ActivityItem["type"]), `missing ${required}`);
  }
  assert.ok(compressed.some((item) => item.type === "integration_activity" && item.payload && "action" in item.payload && item.payload.action === "payment_preparing"));
  assert.ok(compressed.some((item) => item.type === "integration_activity" && item.payload && "action" in item.payload && item.payload.action === "transaction_submitted"));
});
