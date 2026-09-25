// Replay-fixture sanity: the generated GPT-6 submission-run scenario loads,
// is internally consistent, and never leaks the model/scenario it replaced.

import test from "node:test";
import assert from "node:assert/strict";
import { okxSubmissionRunScenario } from "../lib/demo/scenarios/okxSubmissionRun";

test("scenario loads and identifies the real objective", () => {
  assert.equal(okxSubmissionRunScenario.id, "okx-submission-run");
  assert.equal(okxSubmissionRunScenario.source.objectiveId, "obj_1790305036274_96t4b4");
  assert.equal(okxSubmissionRunScenario.frames[0]!.workspace.objective.id, "obj_1790305036274_96t4b4");
});

test("request text is the recorded GPT-6 request", () => {
  const request = okxSubmissionRunScenario.frames[0]!.workspace.objective.request;
  assert.ok(request.includes("We're launching our Somebody app next week."));
  assert.ok(request.includes("launch-week social media plan"));
  assert.ok(request.includes("TikTok, Instagram, Facebook and X"));
});

test("model metadata is openai/gpt-6-luna", () => {
  assert.equal(okxSubmissionRunScenario.source.model, "openai/gpt-6-luna");
});

test("demoSequenceDurationMs is within [100000, 120000]", () => {
  assert.ok(okxSubmissionRunScenario.demoSequenceDurationMs >= 100_000);
  assert.ok(okxSubmissionRunScenario.demoSequenceDurationMs <= 120_000);
});

test("final frame is completed with a verified deliverable", () => {
  const final = okxSubmissionRunScenario.frames[okxSubmissionRunScenario.frames.length - 1]!;
  assert.equal(final.workspace.objective.status, "completed");
  assert.ok(final.workspace.deliverables.some((d) => d.status === "verified"));
});

test("a Needs You frame with attention exists before any frame whose acquisition is verified", () => {
  const frames = okxSubmissionRunScenario.frames;
  const needsYouIdx = frames.findIndex(
    (f) => f.workspace.attention !== null && f.objectiveList.needsYou.some((row) => row.id === okxSubmissionRunScenario.source.objectiveId),
  );
  assert.notEqual(needsYouIdx, -1, "no Needs You + attention frame found");
  const verifiedAcquisitionIdx = frames.findIndex((f) => f.workspace.acquisitions.some((a) => a.status === "verified"));
  assert.notEqual(verifiedAcquisitionIdx, -1, "no verified acquisition frame found");
  assert.ok(needsYouIdx < verifiedAcquisitionIdx, "Needs You frame must precede the verified-acquisition frame");
});

test("list bucket moves inProgress -> needsYou -> done across frames", () => {
  const buckets = okxSubmissionRunScenario.frames.map((f) => {
    if (f.objectiveList.needsYou.length > 0) return "needsYou";
    if (f.objectiveList.done.length > 0) return "done";
    return "inProgress";
  });
  const firstNeedsYou = buckets.indexOf("needsYou");
  const firstDone = buckets.indexOf("done");
  assert.notEqual(firstNeedsYou, -1, "no needsYou frame found");
  assert.notEqual(firstDone, -1, "no done frame found");
  assert.ok(firstNeedsYou < firstDone, "needsYou must appear before done");
  assert.equal(buckets[0], "inProgress", "scenario must start inProgress");
  // Once done is reached it must stay done through the end (never regress).
  const doneFromOn = buckets.slice(firstDone);
  assert.ok(doneFromOn.every((b) => b === "done"), "list bucket regressed after reaching done");
});

test("demoSequence timestamps are strictly increasing and cover every frame", () => {
  const seq = okxSubmissionRunScenario.demoSequence;
  assert.equal(seq.length, okxSubmissionRunScenario.frames.length);
  for (let i = 1; i < seq.length; i++) {
    assert.ok(seq[i]!.atMs > seq[i - 1]!.atMs, `demoSequence not strictly increasing at index ${i}`);
  }
  assert.equal(seq[0]!.atMs, 0);
});

test("no frame text contains gpt-5.6 or Luna scenario leftovers", () => {
  const banned = [/gpt-5\.6/i, /luna-relaunch/i, /Luna — Relaunch Recovery/i];
  const haystacks: string[] = [
    JSON.stringify(okxSubmissionRunScenario.source),
    okxSubmissionRunScenario.label,
    okxSubmissionRunScenario.id,
    ...okxSubmissionRunScenario.frames.map((f) => JSON.stringify(f)),
  ];
  for (const text of haystacks) {
    for (const pattern of banned) {
      assert.ok(!pattern.test(text), `found banned pattern ${pattern} in scenario content`);
    }
  }
});
