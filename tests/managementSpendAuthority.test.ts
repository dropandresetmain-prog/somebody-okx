// CP8 A4 — founder spend authority FAILS CLOSED.
//
// R3 proved the single most dangerous defect in M4: `spendAuthorityUsd === null`
// SKIPPED the amount check, so a monetary BUY/HYBRID reached `authorized` with
// no founder approval record, produced an intent with `requiresApproval: false`
// and `approvalId: null`, and was handoff-able. "The founder never said no" is
// not "the founder said yes to any amount".
//
// These are the three acceptance cases from the CP8 brief, run through the REAL
// decision seam (grounding → eligibility → recommendation → deterministic
// recheck), plus the intent-level consequences and the persisted-grant storage
// seam the production adapter reads. Nothing here re-implements a rule.
import test from "node:test";
import assert from "node:assert/strict";
import { convexTest } from "convex-test";
import schema from "../convex/schema";
import {
  activeSpendGrant,
  putSpendGrant,
  revokeSpendGrant,
} from "../convex/internal/workforce";
import { buildOutcomeContract } from "../lib/management/contract";
import { runManagerialDecisionPass } from "../lib/management/decision";
import type { DecisionPassInput, DecisionPassResult, RegistryOffering } from "../lib/management/decision";
import { CP2_DECISION_PASS_FIELDS } from "./helpers/cp2Requirement";
import type { EligibilityFacts } from "../lib/management/options";
import { factValue } from "../lib/management/options";
import {
  attemptHandoff,
  createIntentFromAuthorization,
  mockBuyerRailFixture,
} from "../lib/management/intents";
import { mayHandOffExternally } from "../lib/management/authorization";
import type {
  AuthorizationResult,
  EconomicFacts,
  GroundedOption,
  OutcomeContract,
  WorkerRecord,
} from "../lib/management/types";

const at = 1700000000000;

const modules = {
  "../convex/schema.ts": () => import("../convex/schema"),
  "../convex/objectiveValidators.ts": () => import("../convex/objectiveValidators"),
  "../convex/managementValidators.ts": () => import("../convex/managementValidators"),
  "../convex/workforceGuards.ts": () => import("../convex/workforceGuards"),
  "../convex/internal/workforce.ts": () => import("../convex/internal/workforce"),
  "../convex/_generated/api.d.ts": () => import("../convex/_generated/api"),
  "../convex/_generated/server.d.ts": () => import("../convex/_generated/server"),
};

// The shipped mutation/query bodies, driven directly: convex-test routes only
// generated api refs, which are stale in this checkout. This is the real
// handler code, never a copy of it.
const call = (fn: unknown, ctx: unknown, args: Record<string, unknown>) =>
  (fn as { _handler: (ctx: unknown, a: Record<string, unknown>) => Promise<unknown> })._handler(ctx, args);

const contractResult = buildOutcomeContract({
  objectiveKey: "obj_buy",
  contractId: "contract_buy",
  revision: 1,
  parsed: {
    intent: "obtain the external dataset the objective needs",
    levels: [{ levelKey: "data_in", order: 1, statement: "dataset is in", label: "In" }],
    minimumCompletionBar: "data_in",
    ambiguities: [],
  },
  requestId: "req_buy",
  founderResolvedQuestions: [],
  at,
});
assert.equal(contractResult.ok, true);
const contract: OutcomeContract = contractResult.ok
  ? contractResult.contract
  : (() => {
      throw new Error("contract fixture must build");
    })();

function worker(): WorkerRecord {
  return {
    workerKey: "worker_make",
    displayName: "Internal worker",
    capabilityKeys: ["public_information_research"],
    dynamicCapabilities: [],
    responsibility: "internal research",
    lifecycle: "available",
    reservedBy: null,
    verifiedAssignments: [],
    contextRefs: [],
    createdByObjective: null,
    createdAt: at - 1000,
    updatedAt: at - 1000,
  };
}

const internalFacts: EconomicFacts = {
  scope: null,
  expectedQuality: null,
  setupMinutes: null,
  queueMinutes: null,
  executionMinutes: factValue(30, "measured", "high", "obs_internal", at),
  verificationMinutes: null,
  internalCostUsd: factValue(0.4, "measured", "high", "obs_internal", at),
  externalPriceUsd: null,
  reliability: null,
  availability: factValue("free", "measured", "high", "obs_internal", at),
  reuseValue: null,
  externalAdvantage: null,
};

function offering(priceUsd: number | null): RegistryOffering {
  return {
    offeringId: "off_dataset",
    providerId: "prov_dataset",
    serviceId: "svc_dataset",
    resourceClass: "public_web",
    priceUsd,
    priceProvenance: "provider_quote",
    registryVerified: true,
    compatibleResourceClass: true,
    executionPathConfigured: true,
    purposeScopeCompatible: true,
  };
}

function offeringFacts(priceUsd: number | null): EconomicFacts {
  return {
    scope: null,
    expectedQuality: priceUsd !== null ? factValue("comparable", "provider_quote", "medium", "quote_1", at) : null,
    setupMinutes: factValue(0, "provider_quote", "medium", "quote_1", at),
    queueMinutes: factValue(10, "provider_quote", "medium", "quote_1", at),
    executionMinutes: factValue(90, "provider_quote", "medium", "quote_1", at),
    verificationMinutes: null,
    internalCostUsd: null,
    externalPriceUsd: priceUsd !== null ? factValue(priceUsd, "provider_quote", "high", "quote_1", at) : null,
    reliability: factValue("proven_once", "registry_data", "medium", "registry_1", at),
    availability: factValue("free", "provider_quote", "medium", "quote_1", at),
    reuseValue: null,
    externalAdvantage: factValue("cost", "provider_quote", "medium", "quote_1", at),
  };
}

function eligibilityFacts(overrides: Partial<EligibilityFacts> = {}): EligibilityFacts {
  return {
    requiredResourceClasses: ["public_web"],
    controlledResourceClasses: ["public_web", "llm_reasoning"],
    deadlineAt: null,
    now: at,
    estimatedMinutes: null,
    requiresMandatoryProof: false,
    proofAvailable: true,
    workerAvailable: null,
    // The engine-side remaining budget — deliberately generous here so the
    // ONLY financial gate under test is founder authority. Keeping these two
    // facts separate is the point: budget is self-limitation, authority is
    // permission the founder granted.
    spendAuthorityUsd: null,
    budgetRemainingUsd: 100,
    ...overrides,
  };
}

// The production decision seam, with a recommender that always picks the
// external option — the exact shape a real model recommendation takes.
function buyPass(overrides: Partial<DecisionPassInput> = {}): Promise<DecisionPassResult> {
  const input: DecisionPassInput = {
    objectiveKey: "obj_buy",
    contract,
    currentContractRevision: 1,
    requirementKey: "data_in",
    requirementTitle: "Dataset is acquired",
    mustBeTrue: "the dataset is present in company records",
    priority: "required",
    ...CP2_DECISION_PASS_FIELDS,
    artifactKeyForInternalProof: null,
    staffing: {
      objectiveKey: "obj_buy",
      requirementKey: "data_in",
      requiredCapabilityKeys: ["public_information_research"],
      requiredPermissions: ["read_company_records"],
      expectedHoldMs: 60_000,
      now: at,
      neededContextRefs: [],
      parallelismNeeded: 1,
      specializationNeeded: false,
      inventory: [worker()],
      creationAllowed: true,
    },
    grounding: {
      discovered: [offering(4)],
      internalFacts,
      factsForOffering: () => offeringFacts(4),
    },
    eligibilityFacts: eligibilityFacts(),
    recommend: async (eligible) => {
      const buy = eligible.find((o) => o.kind === "external");
      return {
        requirementKey: "data_in",
        contractRevision: 1,
        selectedOptionId: buy?.optionId ?? "opt_none",
        rationale: "external offering is the grounded path",
      };
    },
    at,
    decisionId: "dec_a4",
    spendAuthorityUsd: null,
    spendApprovalId: null,
    externalAuthority: "m3_available_bounded",
    waiverRequested: false,
    ...overrides,
  };
  return runManagerialDecisionPass(input);
}

function eligibleBuy(options: readonly GroundedOption[]): GroundedOption {
  const buy = options.find((o) => o.kind === "external");
  assert.ok(buy, "the grounding stage must have produced the external option");
  if (!buy.eligibility.eligible) throw new Error(`option not eligible: ${buy.eligibility.detail}`);
  return buy;
}

// ── acceptance 1: no authority ⇒ approval_required, never authorized ─────────

test("A4: a monetary BUY with NO founder spend limit is approval_required, not authorized", async () => {
  const result = await buyPass();
  assert.equal(result.authorization.kind, "approval_required", JSON.stringify(result.authorization));
  if (result.authorization.kind !== "approval_required") return;
  assert.equal(result.authorization.reason, "spend_authority_required");
  // The pre-fix behaviour was an authorized result here; the question must name
  // the missing limit so the founder can set a bounded one.
  assert.match(result.authorization.question, /No founder spend limit is set/);
  assert.match(result.authorization.question, /\$4/);
  // Nothing downstream may be bound: no requirement revision, no effect.
  assert.equal(result.boundRequirement, null);
});

test("A4: a bound with no approval RECORD behind it is still not a payment approval", async () => {
  const result = await buyPass({
    spendAuthorityUsd: 10,
    spendApprovalId: null,
    eligibilityFacts: eligibilityFacts({ spendAuthorityUsd: 10 }),
  });
  assert.equal(result.authorization.kind, "approval_required", JSON.stringify(result.authorization));
  if (result.authorization.kind !== "approval_required") return;
  assert.equal(result.authorization.reason, "spend_authority_required");
  assert.match(result.authorization.question, /no founder authorization record is bound/);
});

test("A4: a bounded grant, price within it, produces an authorization that NAMES the approval", async () => {
  const result = await buyPass({
    spendAuthorityUsd: 10,
    spendApprovalId: "appr_grant_1",
    eligibilityFacts: eligibilityFacts({ spendAuthorityUsd: 10 }),
  });
  assert.equal(result.authorization.kind, "authorized", JSON.stringify(result.authorization));
  if (result.authorization.kind !== "authorized") return;
  assert.equal(result.authorization.strategy, "BUY");
  assert.equal(result.authorization.spendApprovalId, "appr_grant_1");
});

test("A4: a price beyond the granted bound stays approval_required under the existing rule", async () => {
  const result = await buyPass({
    spendAuthorityUsd: 2,
    spendApprovalId: "appr_grant_1",
    eligibilityFacts: eligibilityFacts({ spendAuthorityUsd: 2 }),
  });
  assert.equal(result.authorization.kind, "approval_required");
  if (result.authorization.kind !== "approval_required") return;
  assert.match(result.authorization.question, /above the granted bound of \$2/);
});

test("A4: an option above authority stays VISIBLE and recommendable — only authorization is withheld", async () => {
  // The economic comparison happens before approval; hiding the option would
  // change what the model may propose, which is not the founder's authority to
  // exercise indirectly.
  const result = await buyPass();
  const buy = eligibleBuy(result.options);
  assert.equal(buy.external?.priceUsd, 4);
});

test("A4: MAKE is unaffected by the money gate — it commits no external price", async () => {
  const result = await buyPass({
    recommend: async (eligible) => {
      const make = eligible.find((o) => o.kind === "internal");
      return {
        requirementKey: "data_in",
        contractRevision: 1,
        selectedOptionId: make?.optionId ?? "opt_none",
        rationale: "internal path",
      };
    },
  });
  assert.equal(result.authorization.kind, "authorized", JSON.stringify(result.authorization));
  if (result.authorization.kind !== "authorized") return;
  assert.equal(result.authorization.strategy, "MAKE");
  assert.equal(result.authorization.spendApprovalId, null, "a non-monetary strategy has no grant to name");
});

// ── acceptance 2: the intent consequences ────────────────────────────────────

function authorizedBuy(spendApprovalId: string | null, option: GroundedOption): AuthorizationResult {
  return {
    kind: "authorized",
    decisionId: "dec_a4",
    requirementKey: "data_in",
    contractRevision: 1,
    strategy: "BUY",
    optionId: option.optionId,
    authorizedAt: at,
    spendApprovalId,
  };
}

test("A4: an unapproved monetary intent is NOT handoff-able and says so truthfully", async () => {
  const pass = await buyPass({
    spendAuthorityUsd: 10,
    spendApprovalId: "appr_grant_1",
    eligibilityFacts: eligibilityFacts({ spendAuthorityUsd: 10 }),
  });
  const option = eligibleBuy(pass.options);
  const built = createIntentFromAuthorization({
    objectiveKey: "obj_buy",
    // A row that reached the intent seam WITHOUT its approval — the predicate
    // must still stop it (defence in depth, not trust in upstream state).
    authorization: authorizedBuy(null, option),
    option,
    at,
    mode: "m3_available_bounded",
  });
  assert.equal(built.ok, true);
  if (!built.ok) return;
  assert.equal(built.intent.terms.requiresApproval, true, "monetary + unapproved ⇒ flagged, never a silent false");
  assert.equal(built.intent.terms.approvalId, null);
  assert.equal(built.intent.state, "awaiting_m3");
  assert.match(built.intent.boundaryNote, /no founder approval record is bound/);

  const rail = mockBuyerRailFixture({ off_dataset: { railRef: "fix_1" } });
  let submitted = 0;
  const counting = {
    describe: rail.describe,
    async submitForPurchase(i: typeof built.intent) {
      submitted += 1;
      return rail.submitForPurchase(i);
    },
  };
  const handed = await attemptHandoff({ ...built.intent, state: "authorized" }, counting, "m3_available_bounded", at + 1);
  assert.equal(submitted, 0, "the rail was NOT contacted");
  assert.equal(handed.handedOff, false);
  assert.equal(handed.intent.state, "awaiting_m3");
});

test("A4: the same intent WITH its bound grant record is eligible for external handoff", async () => {
  const pass = await buyPass({
    spendAuthorityUsd: 10,
    spendApprovalId: "appr_grant_1",
    eligibilityFacts: eligibilityFacts({ spendAuthorityUsd: 10 }),
  });
  assert.equal(pass.authorization.kind, "authorized");
  if (pass.authorization.kind !== "authorized") return;
  const option = eligibleBuy(pass.options);
  const built = createIntentFromAuthorization({
    objectiveKey: "obj_buy",
    authorization: pass.authorization,
    option,
    at,
    mode: "m3_available_bounded",
  });
  assert.equal(built.ok, true);
  if (!built.ok) return;
  assert.equal(built.intent.terms.requiresApproval, false);
  assert.equal(built.intent.terms.approvalId, "appr_grant_1");
  assert.equal(built.intent.state, "authorized");
  assert.match(built.intent.boundaryNote, /founder approval appr_grant_1/);
  const rail = mockBuyerRailFixture({ off_dataset: { railRef: "fix_1" } });
  const handed = await attemptHandoff(built.intent, rail, "m3_available_bounded", at + 1);
  assert.equal(handed.handedOff, true, "a bounded, granted acquisition may hand off an INTENT — payment is M3's");
  assert.equal(handed.intent.state, "handed_off");
});

test("A4: a zero-price external effect needs no financial approval, and that is stated explicitly", () => {
  assert.equal(
    mayHandOffExternally("BUY", "m3_available_bounded", { spendApprovalId: null, priceUsd: 0 }),
    true,
  );
  assert.equal(
    mayHandOffExternally("BUY", "m3_available_bounded", { spendApprovalId: null, priceUsd: 4 }),
    false,
  );
  assert.equal(
    mayHandOffExternally("HYBRID", "m3_available_bounded", { spendApprovalId: "  ", priceUsd: 4 }),
    false,
    "a blank approval id is not an approval",
  );
  assert.equal(
    mayHandOffExternally("MAKE", "m3_available_bounded", { spendApprovalId: "appr", priceUsd: null }),
    false,
    "MAKE never has an external effect to hand off",
  );
});

// ── the persisted authority the production adapter reads ─────────────────────

test("A4: absent grant ⇒ activeSpendGrant null, which the kernel reads as NO authority", async () => {
  const t = convexTest(schema, modules);
  const none = await t.query(async (ctx) => call(activeSpendGrant, ctx, { objectiveKey: "obj_none" }));
  assert.equal(none, null);
});

test("A4: a grant persists by id, is idempotent on replay, and revocation removes authority", async () => {
  const t = convexTest(schema, modules);
  const created = (await t.mutation(async (ctx) =>
    call(putSpendGrant, ctx, {
      approvalId: "appr_1",
      objectiveKey: "obj_grant",
      limitUsd: 12,
      at,
      note: "founder bounded 12 dollars",
    }),
  )) as { grantedAt: number; limitUsd: number; revokedAt: number | null };
  assert.equal(created.limitUsd, 12);
  assert.equal(created.grantedAt, at);

  // Replay keeps the original grant time AND the original bound — a
  // re-delivered grant is not new authority, and a replayed write must never
  // silently widen what the founder permitted.
  const replay = (await t.mutation(async (ctx) =>
    call(putSpendGrant, ctx, {
      approvalId: "appr_1",
      objectiveKey: "obj_grant",
      limitUsd: 99,
      at: at + 10_000,
      note: "replayed",
    }),
  )) as { grantedAt: number; limitUsd: number };
  assert.equal(replay.grantedAt, at);
  assert.equal(replay.limitUsd, 12, "an existing grant's bound is not widened by a replayed id");

  const live = (await t.query(async (ctx) => call(activeSpendGrant, ctx, { objectiveKey: "obj_grant" }))) as {
    approvalId: string;
    limitUsd: number;
  } | null;
  assert.equal(live?.approvalId, "appr_1");

  const revoked = (await t.mutation(async (ctx) =>
    call(revokeSpendGrant, ctx, { approvalId: "appr_1", at: at + 1 }),
  )) as { revokedAt: number | null };
  assert.equal(revoked.revokedAt, at + 1);
  const after = await t.query(async (ctx) => call(activeSpendGrant, ctx, { objectiveKey: "obj_grant" }));
  assert.equal(after, null, "a revoked grant authorizes nothing");
});

test("A4: a grant must bound a positive amount — zero is not 'free unlimited'", async () => {
  const t = convexTest(schema, modules);
  await assert.rejects(() =>
    t.mutation(async (ctx) =>
      call(putSpendGrant, ctx, { approvalId: "appr_zero", objectiveKey: "obj_zero", limitUsd: 0, at, note: "x" }),
    ),
  );
});

test("A4: with several live grants the largest bound wins deterministically, so the pass is order-independent", async () => {
  const t = convexTest(schema, modules);
  for (const [approvalId, limitUsd] of [
    ["appr_b", 5],
    ["appr_a", 5],
    ["appr_c", 20],
  ] as const) {
    await t.mutation(async (ctx) =>
      call(putSpendGrant, ctx, { approvalId, objectiveKey: "obj_multi", limitUsd, at, note: approvalId }),
    );
  }
  const live = (await t.query(async (ctx) => call(activeSpendGrant, ctx, { objectiveKey: "obj_multi" }))) as {
    approvalId: string;
    limitUsd: number;
  };
  assert.equal(live.limitUsd, 20);
  assert.equal(live.approvalId, "appr_c");
});
