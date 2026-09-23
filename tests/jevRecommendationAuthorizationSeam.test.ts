// J2 — authorization seam: eligible → Jev selection → bridge → parser → reauth.
//
// Uses test doubles only. Does not call live payment/provider execution.
// Proves the bridge feeds the EXISTING Reliability V7 authorization path
// without weakening eligibility, spend, proof, or purpose/scope checks.
import test from "node:test";
import assert from "node:assert/strict";
import { reauthorizeRecommendation } from "../lib/management/authorization";
import { buildJevManagerialRecommendation } from "../lib/management/jev/buildManagerialRecommendation";
import {
  EMPTY_FACTS,
  eligibilityInputFor,
  type EligibilityFacts,
} from "../lib/management/options";
import { parseManagerialRecommendation } from "../lib/management/proposals";
import type { GroundedOption, ManagerialRecommendation } from "../lib/management/types";

const REQ = "req_seam";
const REV = 1;
const at = 1_700_000_000_000;

function baseEligibility(overrides: Partial<EligibilityFacts> = {}): EligibilityFacts {
  return {
    requiredResourceClasses: ["public_web"],
    controlledResourceClasses: ["public_web", "llm_reasoning"],
    deadlineAt: null,
    now: at,
    estimatedMinutes: null,
    requiresMandatoryProof: false,
    proofAvailable: true,
    workerAvailable: true,
    spendAuthorityUsd: 50,
    budgetRemainingUsd: 100,
    ...overrides,
  };
}

function makeOption(id: string, overrides: Partial<GroundedOption> = {}): GroundedOption {
  return {
    optionId: id,
    requirementKey: REQ,
    contractRevision: REV,
    kind: "internal",
    strategy: "MAKE",
    internal: {
      capabilityKeys: ["public_information_research"],
      responsibility: "research",
      workerKey: "worker_1",
      staffingReason: "REUSE",
      primitives: ["read_public_web"],
    },
    external: null,
    facts: EMPTY_FACTS,
    eligibility: { eligible: true, checksPassed: ["primitives_governed"] },
    ...overrides,
  };
}

function buyOption(
  id: string,
  priceUsd: number,
  overrides: Partial<NonNullable<GroundedOption["external"]>> = {},
): GroundedOption {
  return makeOption(id, {
    kind: "external",
    strategy: "BUY",
    internal: null,
    external: {
      offeringId: `off_${id}`,
      providerId: `prov_${id}`,
      serviceId: `svc_${id}`,
      resourceClass: "public_web",
      priceUsd,
      priceSource: "provider_quote",
      registryVerified: true,
      compatibleResourceClass: true,
      executionPathConfigured: true,
      purposeScopeCompatible: true,
      ...overrides,
    },
  });
}

function bridgeThenParse(
  eligible: readonly GroundedOption[],
  selectedOptionId: string,
  probabilities: Record<string, number> = {},
):
  | { ok: true; recommendation: ManagerialRecommendation }
  | { ok: false; stage: "bridge" | "parser"; detail: string } {
  const bridged = buildJevManagerialRecommendation({
    requirementKey: REQ,
    contractRevision: REV,
    eligible,
    selection: {
      optionId: selectedOptionId,
      probabilities,
      confidence: probabilities[selectedOptionId] ?? null,
    },
  });
  if (!bridged.ok) return { ok: false, stage: "bridge", detail: bridged.detail };

  const parsed = parseManagerialRecommendation(bridged.recommendation, {
    requirementKey: REQ,
    contractRevision: REV,
    eligibleOptionIds: eligible.map((o) => o.optionId),
  });
  if (!parsed.ok) return { ok: false, stage: "parser", detail: parsed.errors.join("; ") };
  return { ok: true, recommendation: parsed.value };
}

function authCtx(
  options: readonly GroundedOption[],
  eligibilityFacts: EligibilityFacts,
  overrides: Partial<Parameters<typeof reauthorizeRecommendation>[1]> = {},
) {
  return {
    currentContractRevision: REV,
    optionsById: new Map(options.map((o) => [o.optionId, o])),
    eligibilityFor: (option: GroundedOption) => eligibilityInputFor(option, eligibilityFacts),
    at,
    decisionId: "dec_jev_seam",
    spendAuthorityUsd: eligibilityFacts.spendAuthorityUsd,
    spendApprovalId: "approval_seam_1",
    externalAuthority: "m3_available_bounded" as const,
    unresolvedMaterialAmbiguity: null,
    waiverRequested: false,
    ...overrides,
  };
}

test("seam: valid MAKE selection reaches existing authorization path → authorized", () => {
  const eligible = [makeOption("opt_make")];
  const prepared = bridgeThenParse(eligible, "opt_make", { opt_make: 1 });
  assert.equal(prepared.ok, true);
  if (!prepared.ok) return;

  const auth = reauthorizeRecommendation(
    prepared.recommendation,
    authCtx(eligible, baseEligibility()),
  );
  assert.equal(auth.kind, "authorized", JSON.stringify(auth));
  if (auth.kind === "authorized") {
    assert.equal(auth.optionId, "opt_make");
    assert.equal(auth.strategy, "MAKE");
  }
});

test("seam: unknown/stale selection fails before authorization", () => {
  const eligible = [makeOption("opt_make")];
  const unknown = bridgeThenParse(eligible, "opt_hallucinated");
  assert.equal(unknown.ok, false);
  if (unknown.ok) return;
  assert.equal(unknown.stage, "bridge");

  // Stale revision on the option set fails at the bridge.
  const staleEligible = [makeOption("opt_make", { contractRevision: 2 })];
  const stale = bridgeThenParse(staleEligible, "opt_make");
  assert.equal(stale.ok, false);
  if (stale.ok) return;
  assert.equal(stale.stage, "bridge");
});

test("seam: selected BUY still requires V7 spend authority rules", () => {
  const eligible = [buyOption("opt_buy", 4), makeOption("opt_make")];
  const prepared = bridgeThenParse(eligible, "opt_buy", { opt_buy: 0.8, opt_make: 0.2 });
  assert.equal(prepared.ok, true);
  if (!prepared.ok) return;

  // No founder spend limit → approval_required (not authorized).
  const noAuthority = reauthorizeRecommendation(
    prepared.recommendation,
    authCtx(eligible, baseEligibility({ spendAuthorityUsd: null }), {
      spendAuthorityUsd: null,
      spendApprovalId: null,
    }),
  );
  assert.equal(noAuthority.kind, "approval_required");
  if (noAuthority.kind === "approval_required") {
    assert.equal(noAuthority.reason, "spend_authority_required");
  }

  // Bound + approval record → authorized.
  const withAuthority = reauthorizeRecommendation(
    prepared.recommendation,
    authCtx(eligible, baseEligibility({ spendAuthorityUsd: 10 }), {
      spendAuthorityUsd: 10,
      spendApprovalId: "approval_ok",
    }),
  );
  assert.equal(withAuthority.kind, "authorized", JSON.stringify(withAuthority));
});

test("seam: selected MAKE still receives executability/proof checks", () => {
  const eligible = [makeOption("opt_make")];
  const prepared = bridgeThenParse(eligible, "opt_make");
  assert.equal(prepared.ok, true);
  if (!prepared.ok) return;

  const auth = reauthorizeRecommendation(
    prepared.recommendation,
    authCtx(
      eligible,
      baseEligibility({
        requiresMandatoryProof: true,
        proofAvailable: false,
      }),
    ),
  );
  assert.equal(auth.kind, "refused");
  if (auth.kind === "refused") {
    assert.ok(auth.reasons.includes("proof_unavailable"));
  }
});

test("seam: purpose/scope restrictions remain application-owned", () => {
  const eligible = [
    buyOption("opt_buy", 3, { purposeScopeCompatible: false }),
    makeOption("opt_make"),
  ];
  const prepared = bridgeThenParse(eligible, "opt_buy", { opt_buy: 0.9, opt_make: 0.1 });
  assert.equal(prepared.ok, true);
  if (!prepared.ok) return;

  // Bridge can produce a recommendation, but authorization recheck refuses
  // when purpose scope is incompatible — Jev selection carries no authority.
  const auth = reauthorizeRecommendation(
    prepared.recommendation,
    authCtx(eligible, baseEligibility({ spendAuthorityUsd: 10 }), {
      spendAuthorityUsd: 10,
      spendApprovalId: "approval_ok",
    }),
  );
  assert.equal(auth.kind, "refused");
  if (auth.kind === "refused") {
    assert.ok(auth.reasons.includes("provider_incompatible"));
    assert.match(auth.detail, /product scope|purpose/i);
  }
});

test("seam: bridge data cannot override eligibility", () => {
  // Option marked ineligible in the fresh options map used at authorization.
  const eligibleAtSelection = [makeOption("opt_make"), buyOption("opt_buy", 2)];
  const prepared = bridgeThenParse(eligibleAtSelection, "opt_make");
  assert.equal(prepared.ok, true);
  if (!prepared.ok) return;

  const nowIneligible = makeOption("opt_make"); // same id, but eligibility recheck will fail
  const auth = reauthorizeRecommendation(
    prepared.recommendation,
    authCtx([nowIneligible], baseEligibility({ workerAvailable: false })),
  );
  assert.equal(auth.kind, "refused");
  if (auth.kind === "refused") {
    assert.ok(auth.reasons.includes("worker_unavailable"));
  }
});

test("seam: recommendation against wrong contract revision refused at authorization", () => {
  const eligible = [makeOption("opt_make")];
  const prepared = bridgeThenParse(eligible, "opt_make");
  assert.equal(prepared.ok, true);
  if (!prepared.ok) return;

  const auth = reauthorizeRecommendation(prepared.recommendation, {
    ...authCtx(eligible, baseEligibility()),
    currentContractRevision: 2,
  });
  assert.equal(auth.kind, "refused");
  if (auth.kind === "refused") {
    assert.match(auth.detail, /revision/);
  }
});
