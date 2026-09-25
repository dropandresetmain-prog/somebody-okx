// M6.1 fixer closure — focused defects 1/7/9 (+ need identity unit).
// Does NOT declare Gate 1 PASS.
import test from "node:test";
import assert from "node:assert/strict";
import { buildRequirement } from "../lib/management/contract";
import { buildDecisionPassInput } from "../lib/management/decisionPass";
import type { DecisionPassReads } from "../lib/management/decisionPass";
import { createSnapshotDiscovery } from "../lib/market/snapshotDiscovery";
import { verifiedAcquisitionCoversNeed } from "../lib/objective/inputDiagnosis";
import { createResourceNeed } from "../lib/objective/resourceNeed";
import { parseRequirementProposals } from "../lib/management/proposals";
import { buildOutcomeContract } from "../lib/management/contract";
import type { OutcomeContract, Requirement } from "../lib/management/types";

const now = 1_980_000_000_000;

function makeContract(): OutcomeContract {
  const built = buildOutcomeContract({
    objectiveKey: "obj_fix",
    contractId: "c_fix",
    revision: 1,
    parsed: {
      intent: "relaunch",
      levels: [{ levelKey: "done", order: 1, statement: "done", label: "Done" }],
      minimumCompletionBar: "done",
      ambiguities: [],
    },
    requestId: "r1",
    founderResolvedQuestions: [],
    at: now,
  });
  assert.equal(built.ok, true);
  return (built as { ok: true; contract: OutcomeContract }).contract;
}

test("A: read-only capability choice does not erase deliverable artifact proof", async () => {
  const contract = makeContract();
  const reqBuilt = buildRequirement(
    {
      objectiveKey: "obj_fix",
      contract,
      proposed: {
        requirementKey: "req_relaunch",
        priority: "required",
        title: "Relaunch recommendation",
        mustBeTrue: "saved relaunch recommendation exists",
        scope: "deliverable",
        dependsOnRequirementKeys: [],
        requiredResourceClasses: [],
        expectedOutput: "versioned launch/page-message artifact",
        requirementKind: "deliverable",
      },
      artifactKeyForInternalProof: "launch/page-message",
      at: now,
    },
    null,
  );
  assert.ok(!("errors" in reqBuilt));
  const requirement = (reqBuilt as { requirement: Requirement }).requirement;
  assert.equal(requirement.requirementKind, "deliverable");
  assert.ok(
    requirement.proofs.some((p) => p.proofKind === "company_artifact_version"),
    "deliverable must carry artifact proof before strategy",
  );

  const reads: DecisionPassReads = {
    contract,
    currentContractRevision: 1,
    requirement,
    inventory: [],
    creationAllowed: true,
    budget: null,
    grant: null,
    artifactKeyForInternalProof: "launch/page-message",
    openResourceNeeds: [],
    prerequisiteResults: [],
    scopedCoveredResourceClasses: [],
    at: now,
    decisionId: "dec_test",
    serialManagerProtocol: true,
  };

  // Read-only research capability — no update_company_artifact.
  const result = await buildDecisionPassInput(
    reads,
    {
      strategy: "MAKE",
      desiredCapabilities: ["public_information_research"],
      needsExternalResourceClass: null,
      notes: null,
    },
    async () => null,
  );
  assert.equal(result.ok, true);
  if (!result.ok) throw new Error("expected ok");
  assert.equal(
    result.input.artifactKeyForInternalProof,
    "launch/page-message",
    "read-only MAKE must not null the deliverable artifact target",
  );

  // Re-bind with MAKE + read-only caps still preserves deliverable proofs.
  const rebound = buildRequirement(
    {
      objectiveKey: "obj_fix",
      contract,
      proposed: {
        requirementKey: "req_relaunch",
        priority: "required",
        title: requirement.title,
        mustBeTrue: requirement.mustBeTrue,
        scope: requirement.scope,
        dependsOnRequirementKeys: [],
        requiredResourceClasses: [],
        expectedOutput: requirement.expectedOutput,
        requirementKind: "deliverable",
      },
      artifactKeyForInternalProof: result.input.artifactKeyForInternalProof,
      at: now,
    },
    "MAKE",
  );
  assert.ok(!("errors" in rebound));
  const proofs = (rebound as { requirement: Requirement }).requirement.proofs;
  assert.ok(
    proofs.some(
      (p) =>
        p.proofKind === "company_artifact_version" &&
        p.params?.artifactKey === "launch/page-message",
    ),
    "deliverable artifact proof must survive read-only capability choice",
  );
  assert.ok(
    !proofs.some((p) => p.proofKind === "verified_external_result"),
    "MAKE must not replace deliverable with BUY receipt proof",
  );
});

test("A: non-first controlled artifact remains the exact deliverable target", () => {
  const contract = makeContract();
  const built = buildRequirement(
    {
      objectiveKey: "obj_fix",
      contract,
      proposed: {
        requirementKey: "req_out",
        priority: "required",
        title: "Second artifact",
        mustBeTrue: "second artifact advanced",
        scope: "deliverable",
        dependsOnRequirementKeys: [],
        requiredResourceClasses: [],
        expectedOutput: "criteria_notes advanced",
        requirementKind: "deliverable",
      },
      artifactKeyForInternalProof: "criteria_notes",
      at: now,
    },
    "MAKE",
  );
  assert.ok(!("errors" in built));
  const proof = (built as { requirement: Requirement }).requirement.proofs.find(
    (p) => p.proofKind === "company_artifact_version",
  );
  assert.equal(proof?.params?.artifactKey, "criteria_notes");
});

test("A: production interpretation parser emits requirementKind", () => {
  const parsed = parseRequirementProposals([
    {
      requirementKey: "req_01",
      priority: "required",
      title: "Input gate",
      mustBeTrue: "audience language evidence is available",
      scope: "input",
      dependsOnRequirementKeys: [],
      requiredResourceClasses: ["proprietary_data"],
      expectedOutput: null,
      requirementKind: "input",
    },
    {
      requirementKey: "req_02",
      priority: "required",
      title: "Deliverable",
      mustBeTrue: "relaunch recommendation saved",
      scope: "output",
      dependsOnRequirementKeys: ["req_01"],
      requiredResourceClasses: [],
      expectedOutput: "saved recommendation",
      requirementKind: "deliverable",
    },
  ]);
  assert.equal(parsed.ok, true);
  if (!parsed.ok) throw new Error("parse failed");
  assert.equal(parsed.value[0]!.requirementKind, "input");
  assert.equal(parsed.value[1]!.requirementKind, "deliverable");
});

test("E: ordinary NOT_AVAILABLE prose is not typed mutation control (unit surface)", async () => {
  // Runtime refuses only on yieldReason. Source text containing the phrase must
  // not be the control signal — covered by absence of the regex gate.
  const runtimeSrc = await import("node:fs/promises").then((fs) =>
    fs.readFile(new URL("../lib/worker/runtime.ts", import.meta.url), "utf8"),
  );
  assert.equal(
    /availability:\\s\*NOT_AVAILABLE/i.test(runtimeSrc),
    false,
    "serial artifact mutation must not scan observation prose for NOT_AVAILABLE",
  );
  assert.match(
    runtimeSrc,
    /typed input gap|yieldReason/,
    "mutation control must reference typed yieldReason / gap state",
  );
});

test("F: snapshot discovery keeps class-compatible offering across purpose wording", async () => {
  const discovery = createSnapshotDiscovery();
  const phrases = [
    "Need social intelligence about weak launch messaging on X",
    "Audience language patterns from proprietary Twitter search data",
    "Current narrative pulse for relaunch diagnosis",
  ];
  for (const taskDescription of phrases) {
    const found = await discovery.discover({
      resourceClass: "proprietary_data",
      taskDescription,
      limit: 5,
    });
    assert.ok(
      found.length > 0,
      `expected class-compatible offerings for: ${taskDescription}`,
    );
    assert.ok(
      found.some((o) => o.offeringId.includes("newsliquid") || o.offeringId.includes("narrative") || o.offeringId.includes("xbird")),
      `expected known proprietary_data offering retained for: ${taskDescription}`,
    );
    for (const o of found) {
      assert.ok(
        o.compatibleResourceClasses.includes("proprietary_data"),
        `${o.offeringId} must be class-compatible`,
      );
    }
  }
});

test("B: same-class different-question remains distinct via needDedupeKey", () => {
  const needA = createResourceNeed({
    id: "need_a",
    objectiveKey: "obj",
    resourceClass: "proprietary_data",
    purpose: "What phrases does audience A use?",
    reasonOwnedInsufficient: "owned sources inadequate",
    proposedByRunId: "run1",
    requirementKey: "req_1",
    contractRevision: 1,
    at: now,
  });
  const needB = createResourceNeed({
    id: "need_b",
    objectiveKey: "obj",
    resourceClass: "proprietary_data",
    purpose: "What phrases does audience B use?",
    reasonOwnedInsufficient: "owned sources inadequate",
    proposedByRunId: "run1",
    requirementKey: "req_1",
    contractRevision: 1,
    at: now,
  });
  assert.notEqual(needA.dedupeKey, needB.dedupeKey);
  const acqA = {
    requirementKey: "req_1",
    contractRevision: 1,
    resourceClass: "proprietary_data",
    verifiedAt: now,
    needDedupeKey: needA.dedupeKey,
  };
  assert.equal(verifiedAcquisitionCoversNeed(needA, acqA), true);
  assert.equal(verifiedAcquisitionCoversNeed(needB, acqA), false);
});

test("H/I: correction accounting leaves room for assessment #2; reopen does not double-count", async () => {
  const src = await import("node:fs/promises").then((fs) =>
    fs.readFile(new URL("../convex/management.ts", import.meta.url), "utf8"),
  );
  // reopen must NOT increment finalAssessmentAttempts (that would consume the
  // second assessment before it runs).
  const reopenIdx = src.indexOf("async function reopenSerialDeliverableAfterNegativeAssessment");
  const beginIdx = src.indexOf("export const beginFinalSemanticAssessment");
  assert.ok(reopenIdx > 0 && beginIdx > reopenIdx);
  const reopenBody = src.slice(reopenIdx, beginIdx);
  assert.equal(
    /finalAssessmentAttempts:\s*attempts\s*\+\s*1/.test(reopenBody),
    false,
    "reopen must not increment finalAssessmentAttempts",
  );
  assert.match(
    reopenBody,
    /lastFinalAssessmentCritique/,
    "reopen must persist critique for manager context",
  );
  // Scoped correction clears only the rejected final deliverable's fingerprint
  // (via the shared correction plan). A blanket `{}` wipe would also erase
  // prerequisite decision identities and is no longer acceptable.
  assert.match(
    reopenBody,
    /decisionInputFingerprints:\s*plan\.decisionInputFingerprints/,
    "reopen must apply the scoped fingerprint plan, not wipe all decision identities",
  );
  assert.equal(
    /decisionInputFingerprints:\s*\{\}/.test(reopenBody),
    false,
    "reopen must not blanket-clear decisionInputFingerprints",
  );
  assert.match(src, /clearPendingFinalAssessment/, "provider failure cleanup export required");
});
