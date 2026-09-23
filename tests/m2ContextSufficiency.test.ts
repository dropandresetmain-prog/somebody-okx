// Milestone 2 / F9 — bounded investigation: is the context a later action needs
// actually present in the EXACT payloads the manager and worker receive?
//
// Case 1  two-requirement dependency: a satisfied prerequisite's accepted evidence
//         reaches the manager (readDecisionContext + strategy/recommendation
//         prompts) AND is exactly what the MAKE worker is linked to.
// Case 3  completed acquisition feeding a later MAKE: manager sees it; the worker
//         gets ONLY explicitly linked, dependency-scoped evidence.
// Case 2  (same class, different question) is covered by the already-accepted
//         m61Pass2Closure / m61InputDiagnosis / m61SerialManagerLoop tests and by
//         the twin below.
import test, { mock, after as afterAll } from "node:test";
import assert from "node:assert/strict";
import { convexTest } from "convex-test";
import schema from "../convex/schema";
import { proposeDecision } from "../convex/objectiveRunner";
import { resolveSerialMakeActionScope } from "../convex/management";
import {
  initBudget,
  putContract,
  putRequirement,
  readDecisionContext,
} from "../convex/internal/workforce";
import { buildOutcomeContract, buildRequirement } from "../lib/management/contract";
import { M61_SERIAL_V1 } from "../lib/management/executionProtocol";
import { installStructuredChatDouble } from "../lib/management/modelBoundary";
import { obligationAlreadyCovered } from "../lib/objective/inputDiagnosis";
import { createResourceNeed } from "../lib/objective/resourceNeed";
import type { Requirement } from "../lib/management/types";

const modules = {
  "../convex/schema.ts": () => import("../convex/schema"),
  "../convex/objectiveValidators.ts": () => import("../convex/objectiveValidators"),
  "../convex/managementValidators.ts": () => import("../convex/managementValidators"),
  "../convex/workforceGuards.ts": () => import("../convex/workforceGuards"),
  "../convex/objectives.ts": () => import("../convex/objectives"),
  "../convex/objectiveRunner.ts": () => import("../convex/objectiveRunner"),
  "../convex/internal/workforce.ts": () => import("../convex/internal/workforce"),
  "../convex/management.ts": () => import("../convex/management"),
  "../convex/m3Driver.ts": () => import("../convex/m3Driver"),
  "../convex/_generated/api.d.ts": () => import("../convex/_generated/api"),
  "../convex/_generated/server.d.ts": () => import("../convex/_generated/server"),
  "../convex/_generated/dataModel.d.ts": () => import("../convex/_generated/dataModel"),
};

mock.timers.enable({ apis: ["setTimeout"] });
afterAll(() => {
  mock.timers.reset();
  installStructuredChatDouble(null);
});

type Handler = { _handler: (c: unknown, a: Record<string, unknown>) => Promise<unknown> };
const now = 1_982_000_000_000;
const ARTIFACT = "launch/page-message";
const key = "obj_m2_f9";

function contract() {
  const built = buildOutcomeContract({
    objectiveKey: key,
    contractId: `c_${key}`,
    revision: 1,
    parsed: {
      intent: "relaunch messaging",
      levels: [{ levelKey: "relaunch", order: 1, statement: "saved relaunch recommendation exists", label: "Relaunch" }],
      minimumCompletionBar: "relaunch",
      ambiguities: [],
    },
    requestId: "r1",
    founderResolvedQuestions: [],
    at: now,
  });
  return (built as unknown as { contract: never }).contract;
}

function requirement(reqKey: string, kind: "deliverable" | "input", dependsOn: string[]): Requirement {
  const built = buildRequirement(
    {
      objectiveKey: key,
      contract: contract(),
      proposed: {
        requirementKey: reqKey,
        priority: "required",
        title: `Title ${reqKey}`,
        mustBeTrue: `truth of ${reqKey}`,
        scope: "s",
        dependsOnRequirementKeys: dependsOn,
        requiredResourceClasses: [],
        expectedOutput: kind === "deliverable" ? "artifact" : null,
        requirementKind: kind,
      },
      artifactKeyForInternalProof: kind === "deliverable" ? ARTIFACT : null,
      at: now,
    } as never,
    null,
  );
  return (built as { requirement: Requirement }).requirement;
}

function acquisition(id: string, reqKey: string, content: string, needKey: string) {
  return {
    intentId: `int_${id}`,
    requirementKey: reqKey,
    contractRevision: 1,
    resultEvidenceId: id,
    provenance: "simulation",
    providerId: "p",
    serviceId: "s",
    offeringId: "o",
    resourceClass: "proprietary_data",
    content,
    responseHash: `h_${id}`,
    recordedAt: now,
    verifiedAt: now,
    needDedupeKey: needKey,
  };
}

function verifiedIntent(id: string, reqKey: string, needKey: string) {
  return {
    intentId: `int_${id}`,
    idempotencyKey: `idem_${id}`,
    objectiveKey: key,
    requirementKey: reqKey,
    contractRevision: 1,
    decisionId: `dec_${id}`,
    kind: "external_acquisition" as const,
    strategy: "BUY" as const,
    target: { offeringId: "o", providerId: "p", serviceId: "s", resourceClass: "proprietary_data", endpointRef: null },
    terms: { priceUsd: 1, priceProvenance: "registry_data" as const, requiresApproval: false, approvalId: null },
    state: "verified" as const,
    attempts: 1,
    lastEventId: null,
    resultEvidenceId: id,
    verificationEvidenceId: null,
    boundaryNote: "test",
    createdAt: now,
    updatedAt: now,
    needDedupeKey: needKey,
    purpose: "answer question",
  };
}

async function seed(t: ReturnType<typeof convexTest>) {
  await t.mutation(async (ctx) => {
    await ctx.db.insert("objectives", {
      key,
      data: {
        key,
        request: "relaunch",
        createdAt: now,
        updatedAt: now,
        state: "executing",
        activity: "deciding",
        plan: null,
        workItems: [],
        run: null,
        result: null,
        companyArtifacts: [{ key: ARTIFACT, version: 1, content: "seed", history: [] }],
        acquisitionResults: [
          acquisition("acq_prereq", "req_01", "PREREQ ANSWER: churn is driven by onboarding", "need_k1"),
          acquisition("acq_unrelated", "req_zz", "UNRELATED", "need_zz"),
        ],
        management: {
          contractId: `c_${key}`,
          currentContractRevision: 1,
          executionProtocol: M61_SERIAL_V1,
          controlNotes: [],
          decisionAttempts: { req_02: 1 },
          decisionRefusalAttempts: { req_02: 0 },
          decisionInputFingerprints: {},
          pendingDecision: { requestId: `decide_${key}_req_02_r1_a1`, requirementKey: "req_02", contractRevision: 1, attempts: 1 },
        },
      } as never,
    });
    await (initBudget as unknown as Handler)._handler(ctx, { objectiveKey: key, at: now });
    await (putContract as unknown as Handler)._handler(ctx, { objectiveKey: key, contractId: `c_${key}`, revision: 1, data: contract() });
    const prereq = requirement("req_01", "input", []);
    await (putRequirement as unknown as Handler)._handler(ctx, {
      objectiveKey: key,
      requirementKey: "req_01",
      data: {
        ...prereq,
        state: "satisfied",
        strategy: "BUY",
        resolution: { resolutionId: "res_1", acceptedDecisionId: null, acceptedAssignmentId: null, acceptedIntentId: "int_acq_prereq", proofRefs: ["proof_acq_prereq"], contractRevision: 1, acceptedAt: now },
      },
      currentContractRevision: 1,
    });
    await (putRequirement as unknown as Handler)._handler(ctx, {
      objectiveKey: key,
      requirementKey: "req_02",
      data: { ...requirement("req_02", "deliverable", ["req_01"]), state: "active", strategy: null },
      currentContractRevision: 1,
    });
    await ctx.db.insert("executionIntents", { intentId: "int_acq_prereq", objectiveKey: key, idempotencyKey: "idem_acq_prereq", data: verifiedIntent("acq_prereq", "req_01", "need_k1") });
    await ctx.db.insert("executionIntents", { intentId: "int_acq_unrelated", objectiveKey: key, idempotencyKey: "idem_acq_unrelated", data: verifiedIntent("acq_unrelated", "req_zz", "need_zz") });
  });
}

test("F9 case 1+3: manager context carries the prerequisite's accepted result AND its acquisition (own scope + dependencies only)", async () => {
  const t = convexTest(schema, modules);
  await seed(t);
  const reads = (await t.query(async (ctx) =>
    (readDecisionContext as unknown as Handler)._handler(ctx, { objectiveKey: key, requirementKey: "req_02" }),
  )) as {
    prerequisiteResults: Array<{ requirementKey: string; state: string; proofRefs: string[] }>;
    managerResultPackage: {
      scopedVerifiedAcquisitions: Array<{ resultEvidenceId: string; requirementKey: string; content: string }>;
      provenanceEvidenceIds: string[];
    };
  };
  assert.deepEqual(
    reads.prerequisiteResults.map((p) => [p.requirementKey, p.state, p.proofRefs]),
    [["req_01", "satisfied", ["proof_acq_prereq"]]],
  );
  const acqs = reads.managerResultPackage.scopedVerifiedAcquisitions;
  assert.deepEqual(acqs.map((a) => a.resultEvidenceId), ["acq_prereq"], "prerequisite acquisition visible; unrelated requirement's is not");
  assert.equal(acqs[0]!.requirementKey, "req_01", "origin requirement is explicit");
  assert.match(acqs[0]!.content, /churn is driven by onboarding/);
  assert.deepEqual(reads.managerResultPackage.provenanceEvidenceIds, ["acq_prereq"]);
});

test("F9 case 1+3: the strategy AND recommendation prompts contain the prerequisite evidence", async () => {
  const t = convexTest(schema, modules);
  await seed(t);
  const prompts: Record<string, string> = {};
  installStructuredChatDouble((req) => {
    prompts[req.kind] = req.user;
    if (req.kind === "strategy") {
      return { strategy: "MAKE", desiredCapabilities: ["growth_launch_operations", "company_records_lookup", "public_information_research"], needsExternalResourceClass: null, notes: null };
    }
    const m = req.user.match(/LEGAL OPTION IDS[^:]*: (\[.*\])\n/);
    const ids = JSON.parse(m![1]!) as string[];
    return { selectedOptionId: ids[0], strongestAlternativeId: null, rationale: "use prerequisite evidence", materialAssumptions: [], changeMyMindEvidence: [] };
  });
  await t.action(async (ctx) =>
    (proposeDecision as unknown as Handler)._handler(ctx, {
      objectiveKey: key,
      requestId: `decide_${key}_req_02_r1_a1`,
      requirementKey: "req_02",
      contractRevision: 1,
    }),
  );
  installStructuredChatDouble(null);
  for (const kind of ["strategy", "recommendation"]) {
    assert.match(prompts[kind]!, /PREREQ ANSWER: churn is driven by onboarding/, `${kind} prompt carries prerequisite acquisition`);
    assert.doesNotMatch(prompts[kind]!, /UNRELATED/, `${kind} prompt excludes out-of-scope acquisitions`);
  }
  assert.match(prompts.recommendation!, /"prerequisiteResults":\[\{.*?"requirementKey":"req_01","state":"satisfied"/, "recommendation sees the satisfied prerequisite");
});

test("F9 case 3: the MAKE worker is linked to exactly the same dependency-scoped acquisition — never the unrelated one", async () => {
  const t = convexTest(schema, modules);
  await seed(t);
  const scope = await t.mutation(async (ctx) => {
    const objective = await ctx.db.query("objectives").withIndex("by_key", (q) => q.eq("key", key)).unique();
    const reqRows = await ctx.db.query("requirements").withIndex("by_objectiveKey", (q) => q.eq("objectiveKey", key)).collect();
    const req02 = reqRows.map((r) => (r as { data: Requirement }).data).find((r) => r.requirementKey === "req_02")!;
    return resolveSerialMakeActionScope(ctx, {
      objectiveKey: key,
      requirement: req02,
      objectiveData: (objective as { data: Record<string, unknown> }).data,
    });
  });
  assert.equal(scope.ok, true);
  if (scope.ok) {
    assert.deepEqual(scope.inputEvidenceIds, ["acq_prereq"]);
    assert.equal(scope.targetArtifactKey, ARTIFACT);
  }
});

test("F9 case 2: same resource class, different question → NOT suppressed; same question → covered", () => {
  const need = createResourceNeed({
    id: "need_a",
    objectiveKey: key,
    workItemId: "wi",
    requirementKey: "req_01",
    resourceClass: "proprietary_data",
    purpose: "Question A: why does onboarding churn",
    reasonOwnedInsufficient: "owned insufficient",
    proposedByRunId: "run",
    at: now,
    status: "fulfilled",
    contractRevision: 1,
    inputCheckId: "evidence_sufficiency",
    supportingEvidenceIds: [],
    validationAuthority: "application",
  });
  const base = {
    requirementKey: "req_01",
    contractRevision: 1,
    resourceClass: "proprietary_data",
    existingNeeds: [need],
    acquisitions: [{ requirementKey: "req_01", contractRevision: 1, resourceClass: "proprietary_data", verifiedAt: now }],
  };
  assert.equal(obligationAlreadyCovered({ ...base, purpose: "Question A: why does onboarding churn" }), true);
  assert.equal(obligationAlreadyCovered({ ...base, purpose: "Question B: which channel converts best" }), false);
});
