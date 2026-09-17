import test from "node:test";
import assert from "node:assert/strict";
import {
  createArtifact,
  applyArtifactChange,
  hasArtifactChanged,
} from "../lib/objective/artifact";

const now = 1700000000000;

test("createArtifact yields version 1 with one history entry", () => {
  const artifact = createArtifact({
    key: "launch-page",
    objectiveKey: "obj-1",
    label: "Launch Page",
    content: "Initial content",
    runId: "run-1",
    at: now,
  });

  assert.equal(artifact.version, 1);
  assert.equal(artifact.history.length, 1);
  assert.equal(artifact.history[0].version, 1);
  assert.equal(artifact.history[0].content, "Initial content");
  assert.equal(artifact.history[0].changedByRunId, "run-1");
  assert.equal(artifact.history[0].changedAt, now);
  assert.equal(artifact.history[0].changeNote, "initial");
});

test("applyArtifactChange bumps version, appends history, updates provenance", () => {
  const v1 = createArtifact({
    key: "launch-page",
    objectiveKey: "obj-1",
    label: "Launch Page",
    content: "Version 1",
    runId: "run-1",
    at: now,
  });

  const v2 = applyArtifactChange(v1, {
    content: "Version 2",
    changeNote: "Updated content",
    runId: "run-2",
    at: now + 1000,
  });

  assert.equal(v2.version, 2);
  assert.equal(v2.content, "Version 2");
  assert.equal(v2.provenanceRunId, "run-2");
  assert.equal(v2.updatedAt, now + 1000);
  assert.equal(v2.history.length, 2);
  assert.equal(v2.history[0].version, 1);
  assert.equal(v2.history[0].content, "Version 1");
  assert.equal(v2.history[1].version, 2);
  assert.equal(v2.history[1].content, "Version 2");
  assert.equal(v2.history[1].changedByRunId, "run-2");
  assert.equal(v2.history[1].changedAt, now + 1000);
  assert.equal(v2.history[1].changeNote, "Updated content");
});

test("applyArtifactChange throws on unchanged content (no-op)", () => {
  const v1 = createArtifact({
    key: "launch-page",
    objectiveKey: "obj-1",
    label: "Launch Page",
    content: "Same content",
    runId: "run-1",
    at: now,
  });

  assert.throws(
    () =>
      applyArtifactChange(v1, {
        content: "Same content",
        changeNote: "No change",
        runId: "run-2",
        at: now + 1000,
      }),
    /content unchanged/
  );
});

test("applyArtifactChange throws on content > 8000 chars", () => {
  const v1 = createArtifact({
    key: "launch-page",
    objectiveKey: "obj-1",
    label: "Launch Page",
    content: "Initial",
    runId: "run-1",
    at: now,
  });

  const longContent = "x".repeat(8001);
  assert.throws(
    () =>
      applyArtifactChange(v1, {
        content: longContent,
        changeNote: "Too long",
        runId: "run-2",
        at: now + 1000,
      }),
    /content exceeds 8000/
  );
});

test("applyArtifactChange throws on changeNote > 500 chars", () => {
  const v1 = createArtifact({
    key: "launch-page",
    objectiveKey: "obj-1",
    label: "Launch Page",
    content: "Initial",
    runId: "run-1",
    at: now,
  });

  const longNote = "x".repeat(501);
  assert.throws(
    () =>
      applyArtifactChange(v1, {
        content: "New content",
        changeNote: longNote,
        runId: "run-2",
        at: now + 1000,
      }),
    /changeNote exceeds 500/
  );
});

test("hasArtifactChanged returns true after a version bump", () => {
  const v1 = createArtifact({
    key: "launch-page",
    objectiveKey: "obj-1",
    label: "Launch Page",
    content: "Version 1",
    runId: "run-1",
    at: now,
  });

  assert.equal(hasArtifactChanged(v1, 1), false);

  const v2 = applyArtifactChange(v1, {
    content: "Version 2",
    changeNote: "Updated",
    runId: "run-2",
    at: now + 1000,
  });

  assert.equal(hasArtifactChanged(v2, 1), true);
});

test("createArtifact rejects empty key", () => {
  assert.throws(
    () =>
      createArtifact({
        key: "",
        objectiveKey: "obj-1",
        label: "Launch Page",
        content: "Content",
        runId: "run-1",
        at: now,
      }),
    /createArtifact requires a non-empty key/
  );
});

test("createArtifact rejects empty content", () => {
  assert.throws(
    () =>
      createArtifact({
        key: "launch-page",
        objectiveKey: "obj-1",
        label: "Launch Page",
        content: "",
        runId: "run-1",
        at: now,
      }),
    /createArtifact requires non-empty content/
  );
});
