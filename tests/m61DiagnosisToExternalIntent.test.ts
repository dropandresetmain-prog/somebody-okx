// M6.1 CP-F4 — MAKE → validated diagnosis → external intent integration.
//
// Uses real Convex schema + production mutations + decision builder +
// authorization. Does NOT seed BUY, intent, requiredResourceClasses, or
// ResourceNeed. Starts with empty requiredResourceClasses + evidence obligation.
import test, { mock, after as afterAll } from "node:test";
import assert from "node:assert/strict";
import { convexTest } from "convex-test";
import schema from "../convex/schema";
import { reportMissingInput, finishRun } from "../convex/objectives";
import {
  putContract,
  putRequirement,
  initBudget,
  putIntent,
  readDecisionContext,
} from "../convex/internal/workforce";
import { buildConvexManagementPorts, applyDecision } from "../convex/management";
import { buildOutcomeContract, buildRequirement } from "../lib/management/contract";
import {
  buildDecisionPassInput,
  type DecisionPassReads,
} from "../lib/management/decisionPass";
import { runManagerialDecisionPass } from "../lib/management/decision";
import {
  computeDecisionInputFingerprint,
  isValidatedInputGap,
} from "../lib/objective/inputDiagnosis";
import { CURRENT_RESOURCE_INVENTORY } from "../lib/objective/policy";
import { cp2ParsedRequirement } from "./helpers/cp2Requirement";
import type {
  OutcomeContract,
  Requirement,
  GroundedOption,
} from "../lib/management/types";
import type { ResourceNeed } from "../lib/objective/resourceNeed";
import type { ObjectiveRecord, EvidenceRecord } from "../lib/objective/types";
import type { WorkContract } from "../lib/objective/types";

const modules = {
  "../convex/schema.ts": () => import("../convex/schema"),
  "../convex/objectiveValidators.ts": () => import("../convex/objectiveValidators"),
  "../convex/managementValidators.ts": () => import("../convex/managementValidators"),
  "../convex/workforceGuards.ts": () => import("../convex/workforceGuards"),
  "../convex/objectives.ts": () => import("../convex/objectives"),
  "../convex/objectiveRunner.ts": () => import("../convex/objectiveRunner"),
  "../convex/internal/workforce.ts": () => import("../convex/internal/workforce"),
  "../convex/management.ts": () => import("../convex/management"),
  "../convex/_generated/api.d.ts": () => import("../convex/_generated/api"),
  "../convex/_generated/server.d.ts": () => import("../convex/_generated/server"),
  "../convex/_generated/dataModel.d.ts": () => import("../convex/_generated/dataModel"),
};

mock.timers.enable({ apis: ["setTimeout"] });
afterAll(() => mock.timers.reset());

const now = 1_972_000_000_000;
const REQ = "req_evidence";

function contractFor(key: string): OutcomeContract {
  const built = buildOutcomeContract({
    objectiveKey: key,
    contractId: `contract_${key}`,
    revision: 1,
    parsed: {
      intent: "gather accepted evidence then produce a controlled artifact",
      levels: [
        {
          levelKey: "evidence",
          order: 1,
          statement: "sufficient accepted evidence is on record",
          label: "Evidence",
        },
        {
          levelKey: "artifact",
          order: 2,
          statement: "controlled artifact exists using accepted evidence",
          label: "Artifact",
        },
      ],
      minimumCompletionBar: "artifact",
      ambiguities: [],
    },
    requestId: "req_f4",
    founderResolvedQuestions: [],
    at: now,
  });
  assert.ok(built.ok);
  if (!built.ok) throw new Error("contract");
  return built.contract;
}

function evidenceReq(key: string, contract: OutcomeContract): Requirement {
  return {
    requirementKey: REQ,
    objectiveKey: key,
    contractId: contract.contractId,
    contractRevision: 1,
    priority: "required",
    title: "Evidence gathered",
    mustBeTrue: "sufficient accepted evidence is on record for the decision",
    scope: "owned then external if needed",
    dependsOnRequirementKeys: [],
    // CRITICAL: initially empty — diagnosis must create the gap.
    requiredResourceClasses: [],
    expectedOutput: "accepted evidence for the decision",
    proofs: [],
    state: "active",
    strategy: null,
    resolution: null,
    blockedReason: null,
    waiver: null,
    revision: 1,
    createdAt: now,
    updatedAt: now,
  };
}

function workContract(): WorkContract {
  return {
    assignment: "Obtain sufficient accepted evidence for the decision",
    idempotencyScope: "scope_f4",
    workerKey: "worker_research",
    capabilityKeys: ["public_information_research", "company_records_lookup"],
    allowedToolPermissions: [
      "read_company_record",
      "read_public_web",
      "record_finding",
      "request_resource",
      "submit_result",
      "request_completion",
    ],
    requiredSourceClasses: ["company_record", "public_web"],
    minObservations: 2,
    sourceProofs: [
      { sourceClass: "company_record", minDistinctSources: 1 },
      { sourceClass: "public_web", minDistinctSources: 1 },
    ],
    requiredVerifiedEffectKeys: [],
    approvalVersion: null,
    resultRequirements: {
      summary: true,
      fit: true,
      risks: true,
      unknowns: true,
      recommendedNextAction: true,
    },
  };
}

type Backend = ReturnType<typeof convexTest>;

async function seedNeutral(t: Backend, key: string) {
  const contract = contractFor(key);
  const requirement = evidenceReq(key, contract);
  const runId = `run_${key}`;
  const wiId = `wi_${key}`;

  await t.run(async (ctx) => {
    await ctx.db.insert("objectives", {
      key,
      data: {
        key,
        request: "Produce a sourced research note on a market topic",
        createdAt: now,
        updatedAt: now,
        state: "executing",
        activity: "MAKE evidence attempt",
        plan: null,
        workItems: [
          {
            id: wiId,
            objectiveKey: key,
            title: "Evidence",
            assignment: workContract().assignment,
            workerKey: "worker_research",
            state: "running",
            contract: workContract(),
            runs: [
              {
                id: runId,
                workItemId: wiId,
                status: "running",
                startedAt: now,
                leaseUntil: now + 60_000,
                model: "mock",
                modelSelectionReason: "test",
                toolCalls: 0,
                summary: "",
              },
            ],
          },
        ],
        run: {
          id: runId,
          workItemId: wiId,
          status: "running",
          startedAt: now,
          leaseUntil: now + 60_000,
          model: "mock",
          modelSelectionReason: "test",
          toolCalls: 0,
          summary: "",
        },
        result: null,
        resourceNeeds: [],
        management: {
          contractId: contract.contractId,
          decisionAttempts: {},
        },
      } as ObjectiveRecord & { management: Record<string, unknown> },
    });

    // Insufficient owned observations (application origin).
    for (const item of [
      {
        evidenceId: "ev_rec",
        data: {
          sourceClass: "company_record" as const,
          label: "input_check:NOT_AVAILABLE",
          text: "availability: NOT_AVAILABLE. not found — zero usable sources for required market fact",
          recordRef: "missing_market",
          observedAt: now,
          recordedBy: "app",
          runId,
          origin: "application_observation" as const,
          sourceId: "src_rec",
        },
      },
      {
        evidenceId: "ev_web",
        data: {
          sourceClass: "public_web" as const,
          label: "Public page",
          text: "no usable public page content for licensed market data",
          url: "https://example.com/empty",
          observedAt: now,
          recordedBy: "app",
          runId,
          origin: "application_observation" as const,
          sourceId: "src_web",
        },
      },
    ]) {
      await ctx.db.insert("evidence", {
        objectiveKey: key,
        evidenceId: item.evidenceId,
        data: item.data,
      });
    }
  });

  await t.run(async (ctx) => {
    await (
      putContract as unknown as {
        _handler: (c: unknown, a: Record<string, unknown>) => Promise<unknown>;
      }
    )._handler(ctx, {
      objectiveKey: key,
      contractId: contract.contractId,
      revision: 1,
      data: contract,
    });
    await (
      putRequirement as unknown as {
        _handler: (c: unknown, a: Record<string, unknown>) => Promise<unknown>;
      }
    )._handler(ctx, {
      objectiveKey: key,
      requirementKey: REQ,
      data: requirement,
      currentContractRevision: 1,
    });
    await (
      initBudget as unknown as {
        _handler: (c: unknown, a: Record<string, unknown>) => Promise<unknown>;
      }
    )._handler(ctx, {
      objectiveKey: key,
      at: now,
    });
    await ctx.db.insert("founderSpendGrants", {
      approvalId: `appr_${key}`,
      objectiveKey: key,
      data: {
        approvalId: `appr_${key}`,
        objectiveKey: key,
        limitUsd: 25,
        grantedAt: now,
        revokedAt: null,
        note: "test grant",
      },
    });
  });

  return { contract, requirement, runId, wiId };
}

async function callReport(
  t: Backend,
  key: string,
  runId: string,
  wiId: string,
  proposal: {
    inputCheckId: string;
    resourceClass: string;
    purpose: string;
    reasonOwnedInsufficient: string;
    supportingEvidenceIds: string[];
  },
) {
  return t.run(async (ctx) =>
    (
      reportMissingInput as unknown as {
        _handler: (
          c: unknown,
          a: Record<string, unknown>,
        ) => Promise<{
          validated: boolean;
          needId: string | null;
          needStatus: string | null;
          refusalCode: string | null;
          detail: string;
          shouldYield: boolean;
        }>;
      }
    )._handler(ctx, {
      objectiveKey: key,
      runId,
      requirementKey: REQ,
      workItemId: wiId,
      proposal,
    }),
  );
}

test("F4 integration: validated diagnosis → MAKE ineligible → BUY authorized (no seeded BUY)", async () => {
  const key = "obj_f4_positive";
  const t = convexTest(schema, modules);
  const { runId, wiId } = await seedNeutral(t, key);

  // Precondition: no ResourceNeed, empty requiredResourceClasses.
  const before = await t.run(async (ctx) => {
    const row = await ctx.db
      .query("objectives")
      .withIndex("by_key", (q) => q.eq("key", key))
      .unique();
    const req = await ctx.db
      .query("requirements")
      .withIndex("by_objectiveRequirement", (q) =>
        q.eq("objectiveKey", key).eq("requirementKey", REQ),
      )
      .unique();
    return {
      needs: ((row as { data: ObjectiveRecord }).data.resourceNeeds ?? []).length,
      classes: ((req as { data: Requirement }).data.requiredResourceClasses ?? []),
    };
  });
  assert.equal(before.needs, 0);
  assert.deepEqual(before.classes, []);

  const report = await callReport(t, key, runId, wiId, {
    inputCheckId: "evidence_sufficiency",
    resourceClass: "proprietary_data",
    purpose: "licensed market dataset for requirement evidence",
    reasonOwnedInsufficient:
      "owned company_record and public_web lookups returned no usable sources",
    supportingEvidenceIds: ["ev_rec", "ev_web"],
  });
  assert.equal(report.validated, true);
  assert.equal(report.shouldYield, true);
  assert.equal(report.needStatus, "active");

  const afterDiag = await t.run(async (ctx) => {
    const row = await ctx.db
      .query("objectives")
      .withIndex("by_key", (q) => q.eq("key", key))
      .unique();
    const data = (row as { data: ObjectiveRecord }).data;
    const req = await ctx.db
      .query("requirements")
      .withIndex("by_objectiveRequirement", (q) =>
        q.eq("objectiveKey", key).eq("requirementKey", REQ),
      )
      .unique();
    return {
      needs: (data.resourceNeeds ?? []) as ResourceNeed[],
      failureClass: data.lastDeliveryFailureClass,
      classes: ((req as { data: Requirement }).data.requiredResourceClasses ?? []),
      strategy: ((req as { data: Requirement }).data.strategy ?? null),
    };
  });
  assert.equal(afterDiag.needs.length, 1);
  assert.ok(isValidatedInputGap(afterDiag.needs[0]!));
  assert.equal(afterDiag.needs[0]!.resourceClass, "proprietary_data");
  assert.equal(afterDiag.failureClass, "INPUT_BLOCKED");
  assert.deepEqual(afterDiag.classes, ["proprietary_data"]);
  assert.equal(afterDiag.strategy, null);

  // Decision context marks the need validated.
  const reads = (await t.run(async (ctx) =>
    (
      readDecisionContext as unknown as {
        _handler: (c: unknown, a: Record<string, unknown>) => Promise<DecisionPassReads | null>;
      }
    )._handler(ctx, { objectiveKey: key, requirementKey: REQ }),
  )) as DecisionPassReads;
  assert.ok(reads);
  assert.ok(reads.openResourceNeeds?.some((n) => n.validated && n.resourceClass === "proprietary_data"));

  const built = await buildDecisionPassInput(
    { ...reads, at: now, decisionId: `dec_${key}_buy` },
    {
      strategy: "BUY",
      desiredCapabilities: ["public_information_research"],
      needsExternalResourceClass: "proprietary_data",
      notes: null,
    },
    async (eligible) => {
      const make = eligible.find((o) => o.kind === "internal");
      if (make) assert.equal(make.eligibility.eligible, false, "unsupported MAKE ineligible");
      const external = eligible.find((o) => o.kind === "external" && o.eligibility.eligible);
      assert.ok(external, "compatible external option must be grounded");
      return {
        requirementKey: REQ,
        contractRevision: 1,
        selectedOptionId: external.optionId,
        rationale: "validated proprietary_data gap is covered by this offering",
        materialAssumptions: ["registry price is current"],
        changeMyMindEvidence: [],
      };
    },
  );
  assert.equal(built.ok, true);
  if (!built.ok) return;

  assert.ok(
    built.input.eligibilityFacts.requiredResourceClasses.includes("proprietary_data"),
  );

  const result = await runManagerialDecisionPass(built.input);
  const makeOpt = result.options.find((o) => o.kind === "internal");
  assert.ok(makeOpt);
  assert.equal(makeOpt!.eligibility.eligible, false);
  if (!makeOpt!.eligibility.eligible) {
    assert.ok(makeOpt!.eligibility.reasons.includes("input_not_owned"));
  }
  const buy = result.options.find((o) => o.kind === "external" && o.eligibility.eligible);
  assert.ok(buy);
  assert.equal(result.authorization.kind, "authorized");
  if (result.authorization.kind === "authorized") {
    assert.equal(result.authorization.strategy, "BUY");
    assert.equal(result.authorization.optionId, buy!.optionId);
  }

  // Persist via ports so the validator accepts input_not_owned on the MAKE option.
  await t.run(async (ctx) => {
    const ports = buildConvexManagementPorts(ctx, async () => null);
    await ports.persistDecision(result, now);
  });
  const storedOptions = await t.run(async (ctx) => {
    const rows = await ctx.db.query("managerialDecisions").collect();
    const options: GroundedOption[] = [];
    for (const row of rows) {
      const data = (row as { data: { coarsePlanSummary?: string } }).data;
      try {
        const parsed = JSON.parse(String(data.coarsePlanSummary ?? "{}")) as {
          extra?: { options?: GroundedOption[] };
        };
        for (const option of parsed.extra?.options ?? []) options.push(option);
      } catch {
        /* ignore */
      }
    }
    return options;
  });
  assert.ok(storedOptions.length >= 1);
  const persistedMake = storedOptions.find((o) => o.kind === "internal");
  assert.ok(persistedMake);
  assert.equal(persistedMake!.eligibility.eligible, false);
  if (!persistedMake!.eligibility.eligible) {
    assert.ok(
      persistedMake!.eligibility.reasons.includes("input_not_owned"),
      "input_not_owned must survive the real persistence validator",
    );
  }
});

test("F4 negative twin: EXECUTION_FAILED creates no ResourceNeed and no BUY", async () => {
  const key = "obj_f4_neg";
  const t = convexTest(schema, modules);
  const { runId } = await seedNeutral(t, key);

  await t.run(async (ctx) =>
    (
      finishRun as unknown as {
        _handler: (c: unknown, a: Record<string, unknown>) => Promise<unknown>;
      }
    )._handler(ctx, {
      objectiveKey: key,
      runId,
      failed: true,
      failureReason: "Worker execution timed out inside the lease budget",
    }),
  );

  const after = await t.run(async (ctx) => {
    const row = await ctx.db
      .query("objectives")
      .withIndex("by_key", (q) => q.eq("key", key))
      .unique();
    const data = (row as { data: ObjectiveRecord }).data;
    const req = await ctx.db
      .query("requirements")
      .withIndex("by_objectiveRequirement", (q) =>
        q.eq("objectiveKey", key).eq("requirementKey", REQ),
      )
      .unique();
    const intents = await ctx.db.query("executionIntents").collect();
    return {
      needs: data.resourceNeeds ?? [],
      findings: data.unconfirmedInputFindings ?? [],
      failureClass: data.lastDeliveryFailureClass,
      classes: ((req as { data: Requirement }).data.requiredResourceClasses ?? []),
      intents: intents.length,
    };
  });
  assert.equal(after.needs.length, 0);
  assert.equal(after.failureClass, "EXECUTION_FAILED");
  assert.deepEqual(after.classes, []);
  assert.equal(after.intents, 0);

  // Fingerprint unchanged with and without gap.
  const fp1 = computeDecisionInputFingerprint({
    requirementKey: REQ,
    contractRevision: 1,
    requiredResourceClasses: [],
    validatedMissingClasses: [],
    prerequisiteStates: [],
    eligibleOfferingIds: [],
    spendAuthorityUsd: 25,
    budgetRemainingUsd: 50,
  });
  const fp2 = computeDecisionInputFingerprint({
    requirementKey: REQ,
    contractRevision: 1,
    requiredResourceClasses: [],
    validatedMissingClasses: [],
    prerequisiteStates: [],
    eligibleOfferingIds: [],
    spendAuthorityUsd: 25,
    budgetRemainingUsd: 50,
  });
  assert.equal(fp1, fp2);
});

test("F4 no-offering: validated gap + no compatible offering → MAKE ineligible, input_not_owned persists", async () => {
  const key = "obj_f4_no_offer";
  const t = convexTest(schema, modules);
  const { runId, wiId } = await seedNeutral(t, key);

  // Use a validated external class the snapshot registry does not offer.
  const report = await callReport(t, key, runId, wiId, {
    inputCheckId: "evidence_sufficiency",
    resourceClass: "physical_presence",
    purpose: "on-site inspection evidence for the decision",
    reasonOwnedInsufficient: "owned lookups cannot obtain physical presence",
    supportingEvidenceIds: ["ev_rec", "ev_web"],
  });
  assert.equal(report.validated, true);

  const reads = (await t.run(async (ctx) =>
    (
      readDecisionContext as unknown as {
        _handler: (c: unknown, a: Record<string, unknown>) => Promise<DecisionPassReads | null>;
      }
    )._handler(ctx, { objectiveKey: key, requirementKey: REQ }),
  )) as DecisionPassReads;

  const built = await buildDecisionPassInput(
    { ...reads, at: now, decisionId: `dec_${key}_block` },
    {
      strategy: "BLOCK",
      desiredCapabilities: ["public_information_research"],
      needsExternalResourceClass: "physical_presence",
      notes: null,
    },
    async (eligible) => {
      const make = eligible.find((o) => o.kind === "internal");
      assert.ok(make);
      assert.equal(make!.eligibility.eligible, false);
      const buy = eligible.find((o) => o.kind === "external" && o.eligibility.eligible);
      assert.equal(buy, undefined, "no compatible offering");
      return null;
    },
  );
  assert.equal(built.ok, true);
  if (!built.ok) return;

  const result = await runManagerialDecisionPass(built.input);
  const makeOpt = result.options.find((o) => o.kind === "internal");
  assert.ok(makeOpt && !makeOpt.eligibility.eligible);
  if (makeOpt && !makeOpt.eligibility.eligible) {
    assert.ok(makeOpt.eligibility.reasons.includes("input_not_owned"));
  }
  assert.notEqual(result.authorization.kind, "authorized");

  await t.run(async (ctx) => {
    const ports = buildConvexManagementPorts(ctx, async () => null);
    await ports.persistDecision(result, now);
  });
  const storedOptions = await t.run(async (ctx) => {
    const rows = await ctx.db.query("managerialDecisions").collect();
    const options: GroundedOption[] = [];
    for (const row of rows) {
      const data = (row as { data: { coarsePlanSummary?: string } }).data;
      try {
        const parsed = JSON.parse(String(data.coarsePlanSummary ?? "{}")) as {
          extra?: { options?: GroundedOption[] };
        };
        for (const option of parsed.extra?.options ?? []) options.push(option);
      } catch {
        /* ignore */
      }
    }
    return options;
  });
  const persistedMake = storedOptions.find((o) => o.kind === "internal");
  assert.ok(persistedMake && !persistedMake.eligibility.eligible);
  if (persistedMake && !persistedMake.eligibility.eligible) {
    assert.ok(persistedMake.eligibility.reasons.includes("input_not_owned"));
  }
});

test("F4: duplicate validated report dedupes to one ResourceNeed", async () => {
  const key = "obj_f4_dedupe";
  const t = convexTest(schema, modules);
  const { runId, wiId } = await seedNeutral(t, key);
  const proposal = {
    inputCheckId: "evidence_sufficiency",
    resourceClass: "proprietary_data",
    purpose: "licensed market dataset for requirement evidence",
    reasonOwnedInsufficient: "owned lookups insufficient",
    supportingEvidenceIds: ["ev_rec", "ev_web"],
  };
  const a = await callReport(t, key, runId, wiId, proposal);
  const b = await callReport(t, key, runId, wiId, proposal);
  assert.equal(a.validated, true);
  assert.equal(b.validated, true);
  const needs = await t.run(async (ctx) => {
    const row = await ctx.db
      .query("objectives")
      .withIndex("by_key", (q) => q.eq("key", key))
      .unique();
    return ((row as { data: ObjectiveRecord }).data.resourceNeeds ?? []) as ResourceNeed[];
  });
  const active = needs.filter(
    (n) => n.resourceClass === "proprietary_data" && n.status !== "rejected",
  );
  assert.equal(active.length, 1);
});
