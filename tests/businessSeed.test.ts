import test from "node:test";
import assert from "node:assert/strict";
import { createArtifact } from "../lib/objective/artifact";
import {
  CANONICAL_COMPANY_PROFILE,
  CANONICAL_LAUNCH_ARTIFACT,
  CANONICAL_LAUNCH_BRIEF,
  CANONICAL_SIMULATED_SOCIAL_RESULT,
} from "../lib/objective/seedData";
import { companyRecord } from "../lib/objective/policy";

const ACQUIRED_FOUNDER_PHRASE =
  "I keep switching between selling, researching, following up, and actually doing the work.";

test("Business Seed V2 is the source for the canonical company records", () => {
  assert.deepEqual(companyRecord("company/profile"), CANONICAL_COMPANY_PROFILE);
  assert.deepEqual(companyRecord("launch/context"), CANONICAL_LAUNCH_BRIEF);
});

test("Business Seed V2 preserves the founder-language evidence gap", () => {
  const initialBusinessContext = [
    CANONICAL_COMPANY_PROFILE.text,
    CANONICAL_LAUNCH_BRIEF.text,
    CANONICAL_LAUNCH_ARTIFACT.initialContent,
  ].join("\n");

  assert.ok(
    !initialBusinessContext.includes(ACQUIRED_FOUNDER_PHRASE),
    "the exact externally acquired founder wording must not be seeded internally",
  );
  assert.match(
    CANONICAL_LAUNCH_BRIEF.text,
    /do not yet have strong evidence for the words founders themselves use/i,
  );
  assert.ok(
    CANONICAL_SIMULATED_SOCIAL_RESULT.content.includes(ACQUIRED_FOUNDER_PHRASE),
    "the simulated external result should fill the intentional founder-language gap",
  );
});

test("business records do not duplicate runtime authority or resource inventory prose", () => {
  const businessRecords = [
    CANONICAL_COMPANY_PROFILE.text,
    CANONICAL_LAUNCH_BRIEF.text,
  ].join("\n");

  for (const leak of [
    /Owned resources:/i,
    /model reasoning/i,
    /public web research/i,
    /ordinary compute/i,
    /application-approved provider path/i,
    /no paid spend/i,
  ]) {
    assert.ok(!leak.test(businessRecords), `business seed leaks runtime language: ${leak}`);
  }
});

test("canonical launch artifact still starts as seed-owned version 1", () => {
  const artifact = createArtifact({
    key: CANONICAL_LAUNCH_ARTIFACT.key,
    objectiveKey: "obj_business_seed_test",
    label: CANONICAL_LAUNCH_ARTIFACT.label,
    content: CANONICAL_LAUNCH_ARTIFACT.initialContent,
    runId: "seed",
    at: 1_800_000_000_000,
  });

  assert.equal(artifact.version, 1);
  assert.equal(artifact.provenanceRunId, "seed");
  assert.equal(artifact.history.length, 1);
  assert.equal(artifact.history[0]?.changedByRunId, "seed");
  assert.equal(artifact.history[0]?.content, CANONICAL_LAUNCH_ARTIFACT.initialContent);
});

test("simulated founder research remains explicit simulation data", () => {
  assert.equal(CANONICAL_SIMULATED_SOCIAL_RESULT.resourceClass, "proprietary_data");
  assert.match(CANONICAL_SIMULATED_SOCIAL_RESULT.label, /^SIMULATED /);
  assert.match(CANONICAL_SIMULATED_SOCIAL_RESULT.content, /no live provider was called/i);
  assert.match(CANONICAL_SIMULATED_SOCIAL_RESULT.content, /Three patterns repeat/i);
});
