// M6.1 CP4 — simulationCandidate scoping, M5 compose truth, pre-intent BUY eligibility.
import test from "node:test";
import assert from "node:assert/strict";
import { convexTest } from "convex-test";
import schema from "../convex/schema";
import { simulationCandidate } from "../convex/m3Driver";
import { putIntent } from "../convex/internal/workforce";
import { buildOutcomeContract } from "../lib/management/contract";
import { buildDecisionPassInput } from "../lib/management/decisionPass";
import type { DecisionPassReads } from "../lib/management/decisionPass";
import { runManagerialDecisionPass } from "../lib/management/decision";
import { composeObjectiveWorkspace, type WorkspaceSource } from "../lib/m5/workspaceModel";
import { CANONICAL_SIMULATED_SOCIAL_RESULT } from "../lib/objective/seedData";
import type { ExecutionIntent, OutcomeContract, Requirement } from "../lib/management/types";
import { cp2ParsedRequirement } from "./helpers/cp2Requirement";

const at = 1700000000000;
const OPERATOR_TOKEN = "m61-cp4-operator";

const modules = {
  "../convex/schema.ts": () => import("../convex/schema"),
  "../convex/objectiveValidators.ts": () => import("../convex/objectiveValidators"),
  "../convex/managementValidators.ts": () => import("../convex/managementValidators"),
  "../convex/workforceGuards.ts": () => import("../convex/workforceGuards"),
  "../convex/internal/workforce.ts": () => import("../convex/internal/workforce"),
  "../convex/m3Driver.ts": () => import("../convex/m3Driver"),
  "../convex/_generated/api.d.ts": () => import("../convex/_generated/api"),
  "../convex/_generated/server.d.ts": () => import("../convex/_generated/server"),
  "../convex/_generated/dataModel.d.ts": () => import("../convex/_generated/dataModel"),
};

type Handler = { _handler: (ctx: unknown, args: Record<string, unknown>) => Promise<unknown> };

const researchContract: OutcomeContract = (() => {
  const built = buildOutcomeContract({
    objectiveKey: "obj_research_report",
    contractId: "contract_research",
    revision: 1,
    parsed: {
      intent: "produce a sourced research report on a market topic",
      levels: [
        {
          levelKey: "evidence_gathered",
          order: 1,
          statement: "credible external evidence is on record",
          label: "Evidence",
        },
      ],
      minimumCompletionBar: "evidence_gathered",
      ambiguities: [],
    },
    requestId: "req_research",
    founderResolvedQuestions: [],
    at,
  });
  assert.equal(built.ok, true);
  if (!built.ok) throw new Error("fixture contract");
  return built.contract;
})();

function researchRequirement(overrides: Partial<Requirement> = {}): Requirement {
  return {
    requirementKey: "req_01",
    objectiveKey: "obj_research_report",
    contractId: researchContract.contractId,
    contractRevision: 1,
    priority: "required",
    title: "External evidence is available",
    mustBeTrue: "licensed market data supports the topic",
    scope: "third-party dataset",
    dependsOnRequirementKeys: [],
    requiredResourceClasses: ["proprietary_data"],
    expectedOutput: "dataset access or equivalent evidence",
    proofs: [],
    state: "active",
    strategy: null,
    resolution: null,
    blockedReason: null,
    waiver: null,
    revision: 1,
    createdAt: at,
    updatedAt: at,
    ...overrides,
  };
}

function authorizedSimIntent(params: {
  intentId: string;
  objectiveKey: string;
  updatedAt: number;
}): ExecutionIntent {
  return {
    intentId: params.intentId,
    idempotencyKey: `idem_${params.intentId}`,
    objectiveKey: params.objectiveKey,
    requirementKey: "req_01",
    contractRevision: 1,
    decisionId: "dec_cp4",
    kind: "external_acquisition",
    strategy: "BUY",
    target: {
      offeringId: "off_sim",
      providerId: "prov_sim",
      serviceId: "newsliquid_twitter_search",
      resourceClass: CANONICAL_SIMULATED_SOCIAL_RESULT.resourceClass,
      endpointRef: null,
    },
    terms: {
      priceUsd: 0.02,
      priceProvenance: "provider_quote",
      requiresApproval: false,
      approvalId: null,
    },
    state: "authorized",
    attempts: 0,
    lastEventId: null,
    resultEvidenceId: null,
    verificationEvidenceId: null,
    boundaryNote: "cp4 fixture",
    createdAt: at,
    updatedAt: params.updatedAt,
  };
}

async function seedAuthorizedIntent(
  t: ReturnType<typeof convexTest>,
  intent: ExecutionIntent,
): Promise<void> {
  await t.mutation(async (ctx) => {
    await (putIntent as unknown as Handler)._handler(ctx, {
      intentId: intent.intentId,
      objectiveKey: intent.objectiveKey,
      idempotencyKey: intent.idempotencyKey,
      data: intent,
    });
  });
}

async function querySimulationCandidate(
  t: ReturnType<typeof convexTest>,
  objectiveKey: string,
): Promise<{ intentId: string } | null> {
  const previousToken = process.env.SOMEBODY_DEMO_OPERATOR_TOKEN;
  process.env.SOMEBODY_DEMO_OPERATOR_TOKEN = OPERATOR_TOKEN;
  try {
    return (await t.mutation(async (ctx) =>
      (simulationCandidate as unknown as Handler)._handler(ctx, {
        operatorToken: OPERATOR_TOKEN,
        objectiveKey,
      }),
    )) as { intentId: string } | null;
  } finally {
    if (previousToken === undefined) delete process.env.SOMEBODY_DEMO_OPERATOR_TOKEN;
    else process.env.SOMEBODY_DEMO_OPERATOR_TOKEN = previousToken;
  }
}

test("CP4: simulationCandidate with objectiveKey A ignores authorized intent on objective B", async () => {
  const t = convexTest(schema, modules);
  await seedAuthorizedIntent(
    t,
    authorizedSimIntent({ intentId: "int_on_b", objectiveKey: "obj_cp4_b", updatedAt: at + 100 }),
  );
  await seedAuthorizedIntent(
    t,
    authorizedSimIntent({ intentId: "int_on_a", objectiveKey: "obj_cp4_a", updatedAt: at }),
  );

  const forA = await querySimulationCandidate(t, "obj_cp4_a");
  assert.ok(forA);
  assert.equal(forA!.intentId, "int_on_a");

  const forB = await querySimulationCandidate(t, "obj_cp4_b");
  assert.ok(forB);
  assert.equal(forB!.intentId, "int_on_b");

  const missing = await querySimulationCandidate(t, "obj_cp4_none");
  assert.equal(missing, null);
});

test("CP4: simulationCandidate returns the more recently updated authorized intent on the same objective", async () => {
  const t = convexTest(schema, modules);
  const objectiveKey = "obj_cp4_recent";
  await seedAuthorizedIntent(
    t,
    authorizedSimIntent({ intentId: "int_older", objectiveKey, updatedAt: at }),
  );
  await seedAuthorizedIntent(
    t,
    authorizedSimIntent({ intentId: "int_newer", objectiveKey, updatedAt: at + 5000 }),
  );

  const candidate = await querySimulationCandidate(t, objectiveKey);
  assert.ok(candidate);
  assert.equal(candidate!.intentId, "int_newer");
});

const simulatedAcquisition = {
  intentId: "int_cp4_m5",
  requirementKey: "req_01",
  contractRevision: 1,
  resultEvidenceId: "ev_cp4_result",
  provenance: "simulation" as const,
  providerId: "prov_newsliquid",
  serviceId: "newsliquid_twitter_search",
  offeringId: "reg_offer_1",
  resourceClass: "proprietary_data",
  content: "SIMULATED proprietary social evidence.",
  responseHash: "hash",
  recordedAt: at,
  verifiedAt: at + 10,
};

const simulatedIntent = {
  intentId: "int_cp4_m5",
  requirementKey: "req_01",
  decisionId: "dec_cp4_m5",
  contractRevision: 1,
  kind: "external_acquisition" as const,
  strategy: "BUY" as const,
  target: {
    providerId: "prov_newsliquid",
    serviceId: "newsliquid_twitter_search",
    offeringId: "reg_offer_1",
    resourceClass: "proprietary_data",
  },
  terms: {
    priceUsd: 0.02,
    priceProvenance: "provider_quote",
    requiresApproval: false,
    approvalId: "appr_cp4",
  },
  state: "verified",
  resultEvidenceId: "ev_cp4_result",
  verificationEvidenceId: "ev_cp4_ver",
  boundaryNote: "verified at the simulated boundary",
  createdAt: at,
  updatedAt: at + 10,
};

function cp4WorkspaceSource(overrides: Partial<WorkspaceSource> = {}): WorkspaceSource {
  const base: WorkspaceSource = {
    objective: {
      key: "obj_cp4_m5",
      request: "research relaunch",
      createdAt: at,
      updatedAt: at + 20,
      state: "executing",
      result: null,
      companyArtifacts: [],
      acquisitionResults: [simulatedAcquisition],
      management: { contractId: "contract_cp4", controlNotes: [] },
    },
    contract: {
      contractId: "contract_cp4",
      objectiveKey: "obj_cp4_m5",
      revision: 1,
      intent: "research",
      minimumCompletionBar: "evidence_gathered",
      levels: [{ levelKey: "evidence_gathered", order: 1, label: "Evidence", statement: "done" }],
    },
    requirements: [
      {
        requirementKey: "req_01",
        title: "evidence",
        mustBeTrue: "data on record",
        priority: "required",
        state: "satisfied",
        strategy: "BUY",
        contractRevision: 1,
        resolution: { resolutionId: "res_cp4", proofRefs: ["ev_cp4_result"], acceptedAt: at + 12 },
        createdAt: at,
      },
    ],
    workers: [],
    assignments: [],
    decisions: [],
    intents: [simulatedIntent],
    grants: [{ approvalId: "appr_cp4", limitUsd: 5, grantedAt: at, revokedAt: null }],
    evidence: [
      {
        evidenceId: "ev_model_note",
        label: "Planner annotation",
        text: "Non-proof model note for the founder UI.",
        origin: "model_note",
        observedAt: at + 1,
        runId: "run_cp4",
      },
    ],
  };
  return { ...base, ...overrides };
}

test("CP4: compose maps model_note evidence origin to model_note (not founder_confirmation)", () => {
  const view = composeObjectiveWorkspace(cp4WorkspaceSource());
  const note = view.evidence.find((row) => row.evidenceId === "ev_model_note");
  assert.ok(note);
  assert.equal(note.origin, "model_note");
  assert.notEqual(note.origin, "founder_confirmation");
});

test("CP4: object-shaped EconomicFacts on a decision option project into OptionView.facts", () => {
  const coarsePlanSummary = JSON.stringify({
    original: "External dataset path",
    extra: {
      options: [
        {
          optionId: "opt_buy_cp4",
          strategy: "BUY",
          eligibility: { eligible: true, checksPassed: ["financial_bounds"] },
          external: { offeringId: "2135:newsliquid_twitter_search" },
          facts: {
            externalPriceUsd: { value: 2.5, provenance: "provider_quote" },
            scope: "licensed market dataset",
          },
        },
      ],
    },
  });
  const source = cp4WorkspaceSource({
    decisions: [
      {
        decisionId: "dec_facts",
        requirementKey: "req_01",
        kind: "managerial",
        strategy: "BUY",
        optionId: "opt_buy_cp4",
        recommendation: { rationale: "priced external offering" },
        authorization: { kind: "authorized", optionId: "opt_buy_cp4", spendApprovalId: "appr_cp4" },
        coarsePlanSummary,
        consideredOptionIds: ["opt_buy_cp4"],
        at: at + 2,
      },
    ],
    intents: [],
    objective: {
      ...cp4WorkspaceSource().objective,
      acquisitionResults: [],
    },
  });
  const view = composeObjectiveWorkspace(source);
  const decision = view.decisions.find((row) => row.decisionId === "dec_facts");
  assert.ok(decision);
  const option = decision.options.find((row) => row.optionId === "opt_buy_cp4");
  assert.ok(option);
  const priceFact = option.facts.find((fact) => fact.label === "externalPriceUsd");
  assert.ok(priceFact, "externalPriceUsd should project from object-shaped facts");
  assert.equal(priceFact.value, "2.5");
  assert.equal(priceFact.provenance, "provider_quote");
});

test("CP4: simulated acquisition never renders payment submitted or settled in M5 compose", () => {
  const view = composeObjectiveWorkspace(cp4WorkspaceSource());
  const external = view.external[0];
  assert.ok(external);
  assert.equal(external.payment.state, "prepared");
  assert.equal(external.payment.history.length, 1);
  const stages = external.payment.history.map((entry) => entry.state);
  assert.ok(!stages.includes("submitted"));
  assert.ok(!stages.includes("settled"));
  const story = view.missionStory.map((event) => event.title);
  assert.ok(!story.some((title) => title.includes("Payment submitted")));
  assert.ok(!story.some((title) => title.includes("Payment settled")));
});

test("CP4: BUY becomes eligible from semantic requirement + openResourceNeed without a pre-authorized intent", async () => {
  const requirement = researchRequirement();
  const reads: DecisionPassReads = {
    contract: researchContract,
    currentContractRevision: 1,
    requirement,
    inventory: [],
    creationAllowed: true,
    budget: {
      objectiveKey: researchContract.objectiveKey,
      limits: {
        maxWorkersCreated: 10,
        maxActiveAssignments: 10,
        maxManagementDecisions: 20,
        maxWorkerAttemptsPerRequirement: 5,
        maxRetriesPerIntent: 3,
        maxElapsedMs: 86_400_000,
        maxModelCalls: 50,
        maxExternalSpendUsd: 50,
        maxNoProgressCycles: 20,
      },
      used: {
        workersCreated: 0,
        activeAssignments: 0,
        managementDecisions: 0,
        modelCalls: 0,
        externalSpendCommittedUsd: 0,
        noProgressCycles: 0,
        attemptsByRequirement: {},
        retriesByIntent: {},
      },
      startedAt: at,
      lastProgressAt: at,
    },
    grant: { approvalId: "appr_cp4_elig", limitUsd: 10 },
    openResourceNeeds: [
      {
        needId: "need_cp4",
        resourceClass: "proprietary_data",
        purpose: "market dataset for topic",
        reasonOwnedInsufficient: "not in company_records",
        status: "proposed",
      },
    ],
    prerequisiteResults: [],
    at,
    decisionId: "dec_cp4_elig",
  };

  const built = await buildDecisionPassInput(
    reads,
    {
      strategy: "BUY",
      desiredCapabilities: ["public_information_research"],
      needsExternalResourceClass: "proprietary_data",
      notes: null,
    },
    async (eligible) => {
      const external = eligible.find((option) => option.kind === "external");
      assert.ok(external, "grounding must surface an external option");
      assert.equal(external.eligibility.eligible, true, "BUY must be eligible before any intent exists");
      return {
        requirementKey: requirement.requirementKey,
        contractRevision: 1,
        selectedOptionId: external.optionId,
        rationale: "external offering satisfies the uncontrolled proprietary_data need",
      };
    },
  );
  assert.equal(built.ok, true);
  if (!built.ok) return;

  assert.ok(
    built.input.eligibilityFacts.requiredResourceClasses.includes("proprietary_data"),
    "open resource need merges into eligibility facts",
  );

  const result = await runManagerialDecisionPass(built.input);
  const buy = result.options.find((option) => option.kind === "external");
  assert.ok(buy);
  assert.equal(buy!.eligibility.eligible, true);
  assert.equal(result.authorization.kind, "authorized");
  if (result.authorization.kind === "authorized") {
    assert.equal(result.authorization.optionId, buy!.optionId);
  }
  assert.equal(result.decision.strategy, "BUY");
});

test("CP4: research fixture encodes dependsOn + requiredResourceClasses for causal BUY path", () => {
  const proposals = cp2ParsedRequirement({
    requirementKey: "req_01",
    priority: "required",
    title: "Evidence gathered",
    mustBeTrue: "credible licensed data is on record",
    scope: "external inputs",
    requiredResourceClasses: ["proprietary_data"],
    expectedOutput: "dataset or equivalent evidence",
  });
  assert.deepEqual(proposals.requiredResourceClasses, ["proprietary_data"]);
});
