/**
 * OKX demo natural BUY path (fix/final-natural-buy-path).
 *
 * The submission policy only AUTHORIZES the external-social purpose; it does
 * not pre-declare the `proprietary_data` gap. BUY must emerge from a runtime,
 * application-validated ResourceNeed:
 *   no gap  -> MAKE eligible, no BUY eligible (no Objective-wide leak)
 *   gap     -> MAKE input_not_owned -> Social Media Guru sole eligible BUY
 *           -> founder approval required for the $0.01 spend, no effect before
 *   covered -> input_not_owned clears, MAKE can resume.
 * Nothing in code selects BUY or Social Media Guru directly.
 */
import test from "node:test";
import assert from "node:assert/strict";

import {
  buildDecisionPassInput,
  type DecisionPassReads,
  type OpenResourceNeedFact,
} from "../lib/management/decisionPass";
import { runManagerialDecisionPass } from "../lib/management/decision";
import { createBudget } from "../lib/management/budget";
import { interpretOutcomeContract, interpretRequirements } from "../lib/management/interpretation";
import {
  SUBMISSION_EXTERNAL_SOCIAL_PURPOSE_POLICY,
  CANONICAL_AUTHORIZED_PURPOSE_POLICY,
  CANONICAL_OWNED_RESOURCES,
} from "../lib/objective/seedData";
import { CURRENT_RESOURCE_INVENTORY } from "../lib/objective/policy";
import { evaluateOptionEligibility } from "../lib/sourcing/eligibility";
import { eligibleOptions } from "../lib/management/options";
import { reauthorizeRecommendation } from "../lib/management/authorization";
import { EMPTY_FACTS } from "../lib/management/options";
import { SOCIAL_MEDIA_GURU_SERVICE_ID } from "../lib/payment/socialMediaGuruProduct";
import {
  TESTNET_TOKEN_MARKET_SERVICE_ID,
  TESTNET_WALLET_RISK_SERVICE_ID,
} from "../lib/payment/testnetDemoProducts";
import type {
  EligibilityInput,
  GroundedOption,
  ManagerialRecommendation,
  OutcomeContract,
} from "../lib/management/types";

const AT = 1_990_000_000_000;
const OBJ = "obj_okx_required_buy_path";

function contract(): OutcomeContract {
  const built = interpretOutcomeContract({
    objectiveKey: OBJ,
    requestId: "req_okx_required_buy_path",
    rawContract: {
      intent: "Ship the OKX submission relaunch deliverable with credible audience evidence",
      levels: [
        { levelKey: "evidence_ready", statement: "scoped audience evidence exists", label: "Evidence" },
        { levelKey: "deliverable_ready", statement: "the founder-facing deliverable is saved", label: "Deliverable" },
      ],
      minimumCompletionBar: "deliverable_ready",
      ambiguities: [],
    },
    founderResolvedQuestions: [],
    at: AT,
  });
  if (!built.ok) throw new Error("contract build failed");
  return built.contract;
}

const deliverableProposal = (requirementKey: string) => ({
  requirementKey,
  priority: "required",
  title: "Submission relaunch deliverable",
  mustBeTrue: "the founder-facing relaunch deliverable reflects current cross-platform audience evidence",
  scope: "founder-facing deliverable",
  expectedOutput: "saved relaunch deliverable",
  requirementKind: "deliverable",
});

function interpret(policy: typeof SUBMISSION_EXTERNAL_SOCIAL_PURPOSE_POLICY | null) {
  const c = contract();
  const result = interpretRequirements({
    objectiveKey: OBJ,
    contract: c,
    rawRequirements: [deliverableProposal("req_okx_deliverable")],
    at: AT,
    authorizedPurposePolicy: policy,
  });
  if (!result.ok) throw new Error(`interpretation failed: ${result.errors.join("; ")}`);
  return result.requirements[0]!;
}

// ── 1/2/3: the additive resource-class need binds ONLY through the Testnet
// submission policy, never generically and never for the unrelated canonical
// demo policy (which authorizes a different purposeKind entirely). ──────────

test("A: Testnet submission policy authorizes the purpose but does NOT inject proprietary_data", () => {
  assert.equal(
    (SUBMISSION_EXTERNAL_SOCIAL_PURPOSE_POLICY as { requiredResourceClasses?: unknown }).requiredResourceClasses,
    undefined,
  );
  const req = interpret(SUBMISSION_EXTERNAL_SOCIAL_PURPOSE_POLICY);
  assert.equal(req.requiredResourceClasses.includes("proprietary_data"), false);
  assert.deepEqual(req.authorizedPurposeKinds, [SUBMISSION_EXTERNAL_SOCIAL_PURPOSE_POLICY.purposeKind]);
});

// ── B/C/D/F through the real decision pass (interpreted Requirement + ──────
// controlled Testnet market + Objective policy on every pass). ──────────────

const previousMode = process.env.SOMEBODY_EXECUTION_MODE;
process.env.SOMEBODY_EXECUTION_MODE = "testnet_demo";
test.after(() => {
  if (previousMode === undefined) delete process.env.SOMEBODY_EXECUTION_MODE;
  else process.env.SOMEBODY_EXECUTION_MODE = previousMode;
});

const MAKE_PROPOSAL = {
  strategy: "MAKE",
  desiredCapabilities: ["public_information_research", "company_records_lookup"],
  needsExternalResourceClass: null,
};

const RUNTIME_GAP: OpenResourceNeedFact = {
  needId: "need_runtime_gap",
  resourceClass: "proprietary_data",
  purpose: "current cross-platform audience-behaviour evidence",
  reasonOwnedInsufficient: "company records and public pages carry no current audience-behaviour data",
  status: "active",
  validated: true,
  dedupeKey: null,
  requestedPurposeKind: null,
};

function passReads(over: Partial<DecisionPassReads> = {}): DecisionPassReads {
  return {
    contract: contract(),
    currentContractRevision: 1,
    requirement: interpret(SUBMISSION_EXTERNAL_SOCIAL_PURPOSE_POLICY),
    inventory: [],
    creationAllowed: true,
    budget: createBudget(OBJ, AT),
    grant: null, // no founder spend authority
    at: AT,
    decisionId: "dec_natural_buy",
    serialManagerProtocol: true,
    objectiveSourcingPolicy: SUBMISSION_EXTERNAL_SOCIAL_PURPOSE_POLICY,
    ...over,
  };
}

async function decide(over: Partial<DecisionPassReads> = {}) {
  let recommendCalls = 0;
  let seen: readonly GroundedOption[] = [];
  const built = await buildDecisionPassInput(passReads(over), MAKE_PROPOSAL, async (eligible) => {
    recommendCalls += 1;
    seen = eligible;
    // Deterministic double: echo the first eligible option. It never names a
    // strategy or merchant — whatever is eligible is what it sees.
    return eligible[0]
      ? {
          requirementKey: eligible[0].requirementKey,
          contractRevision: 1,
          selectedOptionId: eligible[0].optionId,
          rationale: "first eligible",
          materialAssumptions: [],
          changeMyMindEvidence: [],
        }
      : null;
  });
  assert.equal(built.ok, true);
  if (!built.ok) throw new Error("build");
  const result = await runManagerialDecisionPass(built.input);
  return { built: built.input, result, seen, recommendCalls };
}
const svc = (o: GroundedOption) => o.external?.serviceId ?? "MAKE";
const eligibleIds = (options: readonly GroundedOption[]) =>
  options.filter((o) => o.eligibility.eligible).map(svc);

test("B: early public_web Requirement — MAKE eligible; Guru not eligible merely because the Objective carries the social policy", async () => {
  const publicEvidence = {
    ...interpret(null),
    requirementKey: "req_public_evidence",
    requirementKind: "input" as const,
    requiredResourceClasses: ["public_web"],
  };
  const { result } = await decide({ requirement: publicEvidence });
  assert.deepEqual(eligibleIds(result.options), ["MAKE"]);
  const guru = result.options.find((o) => svc(o) === SOCIAL_MEDIA_GURU_SERVICE_ID);
  assert.equal(guru?.external?.purposeScopeCompatible ?? false, false);
  assert.equal(result.authorization.kind, "authorized");
  assert.equal(result.decision.strategy, "MAKE");
});

test("C: target deliverable BEFORE a validated gap — no forced proprietary_data, no forced sole BUY", async () => {
  const { built, result } = await decide();
  assert.equal(built.eligibilityFacts.requiredResourceClasses.includes("proprietary_data" as never), false);
  assert.deepEqual(eligibleIds(result.options), ["MAKE"]);
  assert.equal(result.decision.strategy, "MAKE");
});

test("D: after an application-validated proprietary_data ResourceNeed — MAKE input_not_owned; eligible set is exactly [Guru]", async () => {
  const { built, result, seen } = await decide({ openResourceNeeds: [RUNTIME_GAP] });
  assert.ok(built.eligibilityFacts.requiredResourceClasses.includes("proprietary_data" as never));
  const make = result.options.find((o) => o.strategy === "MAKE")!;
  assert.equal(make.eligibility.eligible, false);
  if (!make.eligibility.eligible) assert.ok(make.eligibility.reasons.includes("input_not_owned"));
  for (const distractor of [TESTNET_TOKEN_MARKET_SERVICE_ID, TESTNET_WALLET_RISK_SERVICE_ID]) {
    const option = result.options.find((o) => svc(o) === distractor)!;
    assert.equal(option.external!.purposeScopeCompatible, false);
    assert.equal(option.eligibility.eligible, false);
  }
  assert.deepEqual(eligibleIds(result.options), [SOCIAL_MEDIA_GURU_SERVICE_ID]);
  assert.deepEqual(seen.map(svc), [SOCIAL_MEDIA_GURU_SERVICE_ID]);
  // E (kernel half): no grant → approval_required, never authorized.
  assert.equal(result.authorization.kind, "approval_required");
});

test("D': an UNVALIDATED (proposed) need does not exclude MAKE or make Guru eligible", async () => {
  const { result } = await decide({ openResourceNeeds: [{ ...RUNTIME_GAP, validated: false }] });
  assert.deepEqual(eligibleIds(result.options), ["MAKE"]);
});

test("F: after verified acquisition coverage of the need — input_not_owned clears and MAKE resumes", async () => {
  const { result } = await decide({
    openResourceNeeds: [RUNTIME_GAP],
    scopedCoveredResourceClasses: ["proprietary_data"],
  });
  const make = result.options.find((o) => o.strategy === "MAKE")!;
  assert.equal(make.eligibility.eligible, true, JSON.stringify(make.eligibility));
  assert.equal(
    result.options.some((o) => o.strategy === "BUY" && o.eligibility.eligible),
    false,
    "covered need is not re-sourced",
  );
  assert.equal(result.decision.strategy, "MAKE");
  assert.equal(result.authorization.kind, "authorized");
});

test("normal/general Objective (no policy) does not gain proprietary_data", () => {
  const req = interpret(null);
  assert.equal(req.requiredResourceClasses.includes("proprietary_data"), false);
  assert.equal(req.authorizedPurposeKinds ?? undefined, undefined);
});

test("the unrelated canonical founder-messaging demo policy does not carry or bind the submission's resource-class need", () => {
  assert.equal(
    (CANONICAL_AUTHORIZED_PURPOSE_POLICY as { requiredResourceClasses?: unknown }).requiredResourceClasses,
    undefined,
    "canonical demo policy is untouched by this change",
  );
  const req = interpret(CANONICAL_AUTHORIZED_PURPOSE_POLICY);
  assert.equal(req.requiredResourceClasses.includes("proprietary_data"), false);
  assert.deepEqual(req.authorizedPurposeKinds, [CANONICAL_AUTHORIZED_PURPOSE_POLICY.purposeKind]);
});

// mainnet_live/disabled never auto-attach SUBMISSION_EXTERNAL_SOCIAL_PURPOSE_POLICY
// at all (convex/productCommands.ts gates on SOMEBODY_EXECUTION_MODE === "testnet_demo"),
// so passing `null` (as above) is exactly what those modes produce; nothing
// downstream of `interpret(null)` ever sees the new field outside testnet_demo.

// ── 4/5/6/7: MAKE becomes input_not_owned; Guru is sole eligible BUY; ───────
// distractor merchants stay ineligible on purpose-scope, not on this change.

function makeEligibilityInput(controlledResourceClasses: readonly string[]): EligibilityInput {
  return {
    requirementKey: "req_okx_deliverable",
    contractRevision: 1,
    kind: "internal",
    requiredPrimitives: ["draft_document"],
    requiredResourceClasses: ["proprietary_data"],
    controlledResourceClasses,
    deadlineAt: null,
    now: AT,
    estimatedMinutes: null,
    requiresMandatoryProof: false,
    proofAvailable: false,
    external: null,
    workerAvailable: true,
    spendAuthorityUsd: null,
    budgetRemainingUsd: 5,
  };
}

test("MAKE is ineligible (input_not_owned) for the OKX submission deliverable: CURRENT_RESOURCE_INVENTORY deliberately excludes proprietary_data", () => {
  assert.equal(CURRENT_RESOURCE_INVENTORY.includes("proprietary_data" as never), false);
  const result = evaluateOptionEligibility(makeEligibilityInput(CANONICAL_OWNED_RESOURCES));
  assert.equal(result.eligible, false);
  if (result.eligible) throw new Error("unreachable");
  assert.ok(result.reasons.includes("input_not_owned"));
});

function externalEligibilityInput(input: {
  serviceId: string;
  offeringId: string;
  priceUsd: number;
  purposeScopeCompatible: boolean;
}): EligibilityInput {
  return {
    requirementKey: "req_okx_deliverable",
    contractRevision: 1,
    kind: "external",
    requiredPrimitives: [],
    requiredResourceClasses: ["proprietary_data"],
    controlledResourceClasses: CANONICAL_OWNED_RESOURCES,
    deadlineAt: null,
    now: AT,
    estimatedMinutes: null,
    requiresMandatoryProof: false,
    proofAvailable: false,
    external: {
      offeringId: input.offeringId,
      resourceClass: "proprietary_data",
      registryVerified: true,
      compatibleResourceClass: true,
      executionPathConfigured: true,
      purposeScopeCompatible: input.purposeScopeCompatible,
      priceUsd: input.priceUsd,
    },
    workerAvailable: null,
    spendAuthorityUsd: null,
    budgetRemainingUsd: 5,
  };
}

test("Social Media Guru is eligible at $0.01; distractor merchants (purpose-incompatible) stay ineligible", () => {
  const guru = evaluateOptionEligibility(
    externalEligibilityInput({
      serviceId: SOCIAL_MEDIA_GURU_SERVICE_ID,
      offeringId: "somebody_testnet_social:social_media_guru",
      priceUsd: 0.01,
      purposeScopeCompatible: true,
    }),
  );
  assert.equal(guru.eligible, true);

  const token = evaluateOptionEligibility(
    externalEligibilityInput({
      serviceId: TESTNET_TOKEN_MARKET_SERVICE_ID,
      offeringId: "somebody_testnet_markets:token_market_intelligence",
      priceUsd: 0.02,
      purposeScopeCompatible: false,
    }),
  );
  assert.equal(token.eligible, false);
  if (!token.eligible) assert.ok(token.reasons.includes("provider_incompatible"));

  const wallet = evaluateOptionEligibility(
    externalEligibilityInput({
      serviceId: TESTNET_WALLET_RISK_SERVICE_ID,
      offeringId: "somebody_testnet_markets:wallet_onchain_risk_intelligence",
      priceUsd: 0.015,
      purposeScopeCompatible: false,
    }),
  );
  assert.equal(wallet.eligible, false);
  if (!wallet.eligible) assert.ok(wallet.reasons.includes("provider_incompatible"));
});

function optionFrom(kind: "internal" | "external", eligibility: ReturnType<typeof evaluateOptionEligibility>, serviceId?: string): GroundedOption {
  return {
    optionId: `opt_${kind}_${serviceId ?? "make"}`,
    requirementKey: "req_okx_deliverable",
    contractRevision: 1,
    kind,
    strategy: kind === "internal" ? "MAKE" : "BUY",
    internal:
      kind === "internal"
        ? { capabilityKeys: ["company_records_lookup"], responsibility: "draft the deliverable", workerKey: null, staffingReason: null, primitives: ["draft_document"] }
        : null,
    external:
      kind === "external"
        ? {
            offeringId: `off_${serviceId}`,
            providerId: "somebody_testnet_social",
            serviceId: serviceId!,
            resourceClass: "proprietary_data",
            priceUsd: serviceId === SOCIAL_MEDIA_GURU_SERVICE_ID ? 0.01 : 0.02,
            priceSource: "provider_quote",
            registryVerified: true,
            compatibleResourceClass: true,
            executionPathConfigured: true,
            purposeScopeCompatible: serviceId === SOCIAL_MEDIA_GURU_SERVICE_ID,
          }
        : null,
    facts: EMPTY_FACTS,
    eligibility,
  };
}

test("eligible[] is exactly [Social Media Guru] for the OKX submission deliverable (sole_eligible, no Jev needed this epoch)", () => {
  const make = optionFrom(
    "internal",
    evaluateOptionEligibility(makeEligibilityInput(CANONICAL_OWNED_RESOURCES)),
  );
  const guru = optionFrom(
    "external",
    evaluateOptionEligibility(
      externalEligibilityInput({ serviceId: SOCIAL_MEDIA_GURU_SERVICE_ID, offeringId: "off_guru", priceUsd: 0.01, purposeScopeCompatible: true }),
    ),
    SOCIAL_MEDIA_GURU_SERVICE_ID,
  );
  const token = optionFrom(
    "external",
    evaluateOptionEligibility(
      externalEligibilityInput({ serviceId: TESTNET_TOKEN_MARKET_SERVICE_ID, offeringId: "off_token", priceUsd: 0.02, purposeScopeCompatible: false }),
    ),
    TESTNET_TOKEN_MARKET_SERVICE_ID,
  );
  const wallet = optionFrom(
    "external",
    evaluateOptionEligibility(
      externalEligibilityInput({ serviceId: TESTNET_WALLET_RISK_SERVICE_ID, offeringId: "off_wallet", priceUsd: 0.015, purposeScopeCompatible: false }),
    ),
    TESTNET_WALLET_RISK_SERVICE_ID,
  );

  const eligible = eligibleOptions([make, guru, token, wallet]);
  assert.equal(eligible.length, 1);
  assert.equal(eligible[0]!.external?.serviceId, SOCIAL_MEDIA_GURU_SERVICE_ID);
});

// ── 8/9: authorization routes the $0.01 BUY to founder approval; no payment ─
// occurs before that approval (this test never calls a payment executor at
// all — reauthorizeRecommendation is the only gate, and it is a pure function).

function guruOption(): GroundedOption {
  return optionFrom(
    "external",
    evaluateOptionEligibility(
      externalEligibilityInput({ serviceId: SOCIAL_MEDIA_GURU_SERVICE_ID, offeringId: "off_guru", priceUsd: 0.01, purposeScopeCompatible: true }),
    ),
    SOCIAL_MEDIA_GURU_SERVICE_ID,
  );
}

function recommendation(option: GroundedOption): ManagerialRecommendation {
  return {
    requirementKey: option.requirementKey,
    contractRevision: option.contractRevision,
    selectedOptionId: option.optionId,
    strongestAlternativeId: null,
    rationale: "sole eligible option for the genuinely-missing proprietary_data input",
    materialAssumptions: [],
    changeMyMindEvidence: [],
  };
}

test("$0.01 BUY of Social Media Guru requires founder approval when no spend authority is bound", () => {
  const option = guruOption();
  const result = reauthorizeRecommendation(recommendation(option), {
    currentContractRevision: 1,
    optionsById: new Map([[option.optionId, option]]),
    eligibilityFor: () =>
      externalEligibilityInput({ serviceId: SOCIAL_MEDIA_GURU_SERVICE_ID, offeringId: "off_guru", priceUsd: 0.01, purposeScopeCompatible: true }),
    at: AT,
    decisionId: "dec_okx",
    spendAuthorityUsd: null,
    spendApprovalId: null,
    externalAuthority: "m3_available_bounded",
    unresolvedMaterialAmbiguity: null,
    waiverRequested: false,
  });
  assert.equal(result.kind, "approval_required");
});

test("$0.01 BUY authorizes only once a founder spend bound AND an explicit approval record are both present; carries the approval id, never a payment call", () => {
  const option = guruOption();
  const eligibilityFor = () =>
    externalEligibilityInput({ serviceId: SOCIAL_MEDIA_GURU_SERVICE_ID, offeringId: "off_guru", priceUsd: 0.01, purposeScopeCompatible: true });

  const noApprovalYet = reauthorizeRecommendation(recommendation(option), {
    currentContractRevision: 1,
    optionsById: new Map([[option.optionId, option]]),
    eligibilityFor,
    at: AT,
    decisionId: "dec_okx",
    spendAuthorityUsd: 1,
    spendApprovalId: null,
    externalAuthority: "m3_available_bounded",
    unresolvedMaterialAmbiguity: null,
    waiverRequested: false,
  });
  assert.equal(noApprovalYet.kind, "approval_required", "a bound with no approval record is still not a payment approval");

  const authorized = reauthorizeRecommendation(recommendation(option), {
    currentContractRevision: 1,
    optionsById: new Map([[option.optionId, option]]),
    eligibilityFor,
    at: AT,
    decisionId: "dec_okx",
    spendAuthorityUsd: 1,
    spendApprovalId: "approval_founder_1",
    externalAuthority: "m3_available_bounded",
    unresolvedMaterialAmbiguity: null,
    waiverRequested: false,
  });
  assert.equal(authorized.kind, "authorized");
  if (authorized.kind === "authorized") {
    assert.equal(authorized.spendApprovalId, "approval_founder_1");
    assert.equal(authorized.strategy, "BUY");
  }
});

// ── 10: once the proprietary_data need is satisfied (verified Guru result),
// MAKE's own eligibility recovers — input_not_owned only blocked it while the
// input was genuinely missing, not permanently. ─────────────────────────────

test("MAKE resumes once proprietary_data is verified-acquired: input_not_owned clears when the class becomes controlled", () => {
  const stillMissing = evaluateOptionEligibility(makeEligibilityInput(CANONICAL_OWNED_RESOURCES));
  assert.equal(stillMissing.eligible, false);

  const afterAcquisition = evaluateOptionEligibility(
    makeEligibilityInput([...CANONICAL_OWNED_RESOURCES, "proprietary_data"]),
  );
  assert.equal(afterAcquisition.eligible, true);
});
