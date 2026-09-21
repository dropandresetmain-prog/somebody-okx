// M6.1 final blocker — validated missing-input path (CP-F1/F2/F3 unit seams).
import test from "node:test";
import assert from "node:assert/strict";
import {
  validateMissingInputProposal,
  computeDecisionInputFingerprint,
  classifyDeliveryFailure,
  listInputObligations,
  isValidatedInputGap,
} from "../lib/objective/inputDiagnosis";
import { createResourceNeed } from "../lib/objective/resourceNeed";
import type { EvidenceRecord } from "../lib/objective/types";
import { CURRENT_RESOURCE_INVENTORY } from "../lib/objective/policy";
import { evaluateOptionEligibility } from "../lib/sourcing/eligibility";
import {
  buildExternalOption,
  buildInternalOption,
  eligibilityInputFor,
  EMPTY_FACTS,
  withEligibility,
  type EligibilityFacts,
} from "../lib/management/options";

const at = 1_700_000_000_000;

function evidence(over: Partial<EvidenceRecord> & { id: string }): EvidenceRecord {
  return {
    sourceClass: "company_record",
    label: "input_check:NOT_AVAILABLE",
    text: "availability: NOT_AVAILABLE. not found — zero usable sources for required market fact",
    observedAt: at,
    origin: "application_observation",
    sourceId: `src_${over.id}`,
    recordedBy: "app",
    runId: "run_1",
    ...over,
  };
}

function baseCtx(over: Partial<Parameters<typeof validateMissingInputProposal>[1]> = {}) {
  return {
    objectiveKey: "obj_f1",
    requirementKey: "req_01",
    contractRevision: 1,
    runId: "run_1",
    workItemId: "wi_1",
    requiredResourceClasses: [] as string[],
    mustBeTrue: "credible licensed data is on record",
    expectedOutput: "accepted evidence for the decision",
    sourceProofs: [
      { sourceClass: "company_record" as const, minDistinctSources: 1 },
      { sourceClass: "public_web" as const, minDistinctSources: 1 },
    ],
    requiredSourceClasses: ["company_record", "public_web"],
    controlledResourceClasses: [...CURRENT_RESOURCE_INVENTORY],
    evidence: [
      // Inspected owned sources that are insufficient (not availability tokens).
      {
        id: "ev_inspected_rec",
        sourceClass: "company_record" as const,
        label: "company/profile",
        text: "no usable company metrics for licensed market data",
        origin: "application_observation" as const,
        sourceId: "record:company/profile",
        recordRef: "company/profile",
        observedAt: at,
        recordedBy: "app",
        runId: "run_1",
      },
      {
        id: "ev_inspected_web",
        sourceClass: "public_web" as const,
        label: "example page",
        text: "no usable public page content for licensed market data",
        origin: "application_observation" as const,
        sourceId: "url:https://example.com/x",
        url: "https://example.com/x",
        observedAt: at,
        recordedBy: "app",
        runId: "run_1",
      },
      evidence({ id: "ev_rec", sourceClass: "company_record", recordRef: "input_check/evidence_sufficiency/NOT_AVAILABLE" }),
      evidence({
        id: "ev_web",
        sourceClass: "public_web",
        url: "https://example.com/check",
        text: "availability: NOT_AVAILABLE. not found — zero usable sources for required market fact",
        recordRef: "input_check/evidence_sufficiency/NOT_AVAILABLE",
      }),
    ],
    existingNeeds: [],
    at,
    needId: "need_new",
    ...over,
  };
}

const validProposal = {
  inputCheckId: "evidence_sufficiency",
  resourceClass: "proprietary_data",
  purpose: "licensed market dataset for requirement evidence",
  reasonOwnedInsufficient: "owned company_record and public_web lookups returned no usable sources",
  supportingEvidenceIds: ["ev_rec", "ev_web"],
};

test("F1 positive: valid scoped input gap becomes one authoritative active ResourceNeed", () => {
  const result = validateMissingInputProposal(validProposal, baseCtx());
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.need.status, "active");
  assert.equal(result.need.validationAuthority, "application");
  assert.equal(result.need.resourceClass, "proprietary_data");
  assert.equal(result.need.requirementKey, "req_01");
  assert.equal(result.need.contractRevision, 1);
  assert.equal(result.need.inputCheckId, "evidence_sufficiency");
  assert.ok(isValidatedInputGap(result.need));
  assert.deepEqual(result.need.supportingEvidenceIds, ["ev_rec", "ev_web"]);
});

test("F1 negative: unknown resource class is refused (no authoritative need)", () => {
  const result = validateMissingInputProposal(
    { ...validProposal, resourceClass: "magic_crystal_data" },
    baseCtx(),
  );
  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.equal(result.refusalCode, "unknown_resource_class");
});

test("F1 negative: foreign evidence cannot create scarcity", () => {
  const result = validateMissingInputProposal(
    { ...validProposal, supportingEvidenceIds: ["ev_foreign"] },
    baseCtx(),
  );
  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.equal(result.refusalCode, "foreign_evidence");
});

test("F1 negative: model_note evidence cannot support a gap", () => {
  const result = validateMissingInputProposal(validProposal, {
    ...baseCtx(),
    evidence: [
      evidence({ id: "ev_rec", origin: "model_note" }),
      evidence({ id: "ev_web", sourceClass: "public_web", origin: "model_note" }),
    ],
  });
  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.equal(result.refusalCode, "foreign_evidence");
});

test("F1 negative: owned class proposal is not an acquisition gap", () => {
  const result = validateMissingInputProposal(
    { ...validProposal, resourceClass: "company_records" },
    baseCtx(),
  );
  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.equal(result.refusalCode, "already_owned");
});

test("F1 negative: sufficient owned evidence refuses gap", () => {
  const result = validateMissingInputProposal(
    { ...validProposal, supportingEvidenceIds: ["ev_rec", "ev_web", "ev_na"] },
    {
    ...baseCtx(),
    evidence: [
      evidence({
        id: "ev_rec",
        label: "Company CRM export",
        text: "Company CRM export listing 120 qualified leads with industry tags and ARR.",
        recordRef: "crm_leads_q1",
      }),
      evidence({
        id: "ev_web",
        label: "Public market report",
        sourceClass: "public_web",
        url: "https://example.com/market",
        text: "Public industry report summarizing TAM and competitor pricing bands.",
      }),
      // Stale NOT_AVAILABLE cannot invent a gap once live coverage is AVAILABLE.
      evidence({
        id: "ev_na",
        label: "input_check:NOT_AVAILABLE",
        text: "availability: NOT_AVAILABLE. stale check",
        recordRef: "input_check/evidence_sufficiency/NOT_AVAILABLE",
      }),
    ],
  },
  );
  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.equal(result.refusalCode, "owned_evidence_sufficient");
});

test("F1 negative: no input obligation refuses gap", () => {
  const result = validateMissingInputProposal(validProposal, {
    ...baseCtx(),
    sourceProofs: [],
    requiredSourceClasses: [],
    requiredResourceClasses: [],
  });
  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.equal(result.refusalCode, "no_input_obligation");
});

test("F1 negative: obligation mismatch when class not declared and check id wrong", () => {
  const result = validateMissingInputProposal(
    {
      ...validProposal,
      inputCheckId: "req_class:attestation",
      resourceClass: "attestation",
    },
    baseCtx({ requiredResourceClasses: [] }),
  );
  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.equal(result.refusalCode, "obligation_mismatch");
});

test("F1: declared required class obligation validates without evidence-sufficiency path", () => {
  const result = validateMissingInputProposal(
    {
      inputCheckId: "req_class:proprietary_data",
      resourceClass: "proprietary_data",
      purpose: "licensed dataset",
      reasonOwnedInsufficient: "not owned",
      supportingEvidenceIds: ["ev_rec"],
    },
    baseCtx({
      requiredResourceClasses: ["proprietary_data"],
      sourceProofs: [],
      requiredSourceClasses: [],
    }),
  );
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.obligation.kind, "required_resource_class");
});

test("F2: classifyDeliveryFailure distinguishes INPUT_BLOCKED vs EXECUTION_FAILED", () => {
  assert.equal(
    classifyDeliveryFailure({ hasValidatedInputGap: true }),
    "INPUT_BLOCKED",
  );
  assert.equal(
    classifyDeliveryFailure({ hasValidatedInputGap: false, failureReason: "timeout" }),
    "EXECUTION_FAILED",
  );
});

test("F2: decision fingerprint ignores wording and changes on validated gap", () => {
  const base = {
    requirementKey: "req_01",
    contractRevision: 1,
    requiredResourceClasses: [] as string[],
    validatedMissingClasses: [] as string[],
    prerequisiteStates: [] as string[],
    eligibleOfferingIds: [] as string[],
    spendAuthorityUsd: 10 as number | null,
    budgetRemainingUsd: 50 as number | null,
  };
  const a = computeDecisionInputFingerprint(base);
  const b = computeDecisionInputFingerprint(base);
  assert.equal(a, b);
  const c = computeDecisionInputFingerprint({
    ...base,
    validatedMissingClasses: ["proprietary_data"],
  });
  assert.notEqual(a, c);
});

test("F2: proposed need is not validated; active application need is", () => {
  const proposed = createResourceNeed({
    id: "n1",
    objectiveKey: "obj",
    requirementKey: "req_01",
    resourceClass: "proprietary_data",
    purpose: "x",
    reasonOwnedInsufficient: "y",
    at,
  });
  assert.equal(isValidatedInputGap(proposed), false);
  const active = {
    ...proposed,
    status: "active" as const,
    validationAuthority: "application" as const,
  };
  assert.equal(isValidatedInputGap(active), true);
});

test("F1: listInputObligations exposes evidence_sufficiency from source proofs", () => {
  const obligations = listInputObligations({
    requiredResourceClasses: [],
    sourceProofs: [{ sourceClass: "company_record", minDistinctSources: 1 }],
    mustBeTrue: "evidence on record",
    expectedOutput: null,
  });
  assert.ok(obligations.some((o) => o.kind === "evidence_sufficiency"));
});

const GROWTH_FIVE = [
  "llm_reasoning",
  "public_web",
  "ordinary_compute",
  "company_records",
  "company_tools",
] as const;

function baseEligibilityFacts(over: Partial<EligibilityFacts> = {}): EligibilityFacts {
  return {
    requiredResourceClasses: [...GROWTH_FIVE],
    controlledResourceClasses: [...GROWTH_FIVE],
    deadlineAt: null,
    now: at,
    estimatedMinutes: null,
    requiresMandatoryProof: false,
    proofAvailable: true,
    workerAvailable: true,
    spendAuthorityUsd: 50,
    budgetRemainingUsd: 100,
    ...over,
  };
}

test("F3: already-owned inputs keep MAKE eligible", () => {
  const built = buildInternalOption({
    requirementKey: "req_f3",
    contractRevision: 1,
    capabilityKeys: ["growth_launch_operations"],
    responsibility: "update launch artifact",
    workerKey: "worker_growth",
    staffingReason: "reuse",
    facts: EMPTY_FACTS,
  });
  assert.ok(built.option);
  const grounded = withEligibility([built.option], (o) =>
    eligibilityInputFor(o, baseEligibilityFacts()),
  )[0];
  assert.equal(grounded.eligibility.eligible, true);
});

test("F3: validated missing proprietary_data makes unsupported MAKE ineligible via input_not_owned", () => {
  const built = buildInternalOption({
    requirementKey: "req_f3",
    contractRevision: 1,
    capabilityKeys: ["growth_launch_operations"],
    responsibility: "research",
    workerKey: "worker_growth",
    staffingReason: "reuse",
    facts: EMPTY_FACTS,
  });
  assert.ok(built.option);
  const grounded = withEligibility([built.option], (o) =>
    eligibilityInputFor(
      o,
      baseEligibilityFacts({
        requiredResourceClasses: ["proprietary_data", ...GROWTH_FIVE],
        controlledResourceClasses: [...GROWTH_FIVE],
      }),
    ),
  )[0];
  assert.equal(grounded.eligibility.eligible, false);
  if (!grounded.eligibility.eligible) {
    assert.deepEqual(grounded.eligibility.reasons, ["input_not_owned"]);
  }
});

test("F3: compatible external offering covering validated gap is BUY-eligible", () => {
  const buy = buildExternalOption({
    requirementKey: "req_f3",
    contractRevision: 1,
    offeringId: "off_dataset",
    providerId: "prov_a",
    serviceId: "svc_dataset",
    resourceClass: "proprietary_data",
    priceUsd: 2,
    priceProvenance: "registry_data",
    registryVerified: true,
    compatibleResourceClass: true,
    facts: EMPTY_FACTS,
  });
  const result = evaluateOptionEligibility(
    eligibilityInputFor(
      buy,
      baseEligibilityFacts({
        requiredResourceClasses: ["proprietary_data"],
        controlledResourceClasses: [...GROWTH_FIVE],
      }),
    ),
  );
  assert.equal(result.eligible, true);
});

test("F3: same-class incompatible-scope offering is not eligible", () => {
  const buy = buildExternalOption({
    requirementKey: "req_f3",
    contractRevision: 1,
    offeringId: "off_wrong",
    providerId: "prov_a",
    serviceId: "svc_wrong",
    resourceClass: "proprietary_data",
    priceUsd: 2,
    priceProvenance: "registry_data",
    registryVerified: true,
    compatibleResourceClass: false,
    facts: EMPTY_FACTS,
  });
  const result = evaluateOptionEligibility(
    eligibilityInputFor(
      buy,
      baseEligibilityFacts({
        requiredResourceClasses: ["proprietary_data"],
        controlledResourceClasses: [],
      }),
    ),
  );
  assert.equal(result.eligible, false);
  if (!result.eligible) {
    assert.ok(result.reasons.includes("provider_incompatible"));
  }
});

test("F3: unknown required class fails closed (capability_not_governed)", () => {
  const built = buildInternalOption({
    requirementKey: "req_f3",
    contractRevision: 1,
    capabilityKeys: ["growth_launch_operations"],
    responsibility: "research",
    workerKey: "worker_growth",
    staffingReason: "reuse",
    facts: EMPTY_FACTS,
  });
  assert.ok(built.option);
  const grounded = withEligibility([built.option], (o) =>
    eligibilityInputFor(
      o,
      baseEligibilityFacts({
        requiredResourceClasses: ["not_a_real_class"],
        controlledResourceClasses: [...GROWTH_FIVE],
      }),
    ),
  )[0];
  assert.equal(grounded.eligibility.eligible, false);
  if (!grounded.eligibility.eligible) {
    assert.ok(grounded.eligibility.reasons.includes("capability_not_governed"));
  }
});

test("serial semantic adequacy gap does not require NOT_AVAILABLE token", () => {
  const result = validateMissingInputProposal(
    {
      inputCheckId: "evidence_sufficiency",
      resourceClass: "proprietary_data",
      purpose: "licensed audience language for relaunch wording",
      reasonOwnedInsufficient:
        "owned company_record and public_web were inspected but do not answer the audience-language question",
      supportingEvidenceIds: ["ev_inspected_rec", "ev_inspected_web"],
      semanticAdequacyGap: true,
    },
    baseCtx({
      requiredResourceClasses: ["proprietary_data"],
      evidence: [
        {
          id: "ev_inspected_rec",
          sourceClass: "company_record" as const,
          label: "company/profile",
          text: "owned launch context without audience language",
          origin: "application_observation" as const,
          sourceId: "record:company/profile",
          recordRef: "company/profile",
          observedAt: at,
          recordedBy: "app",
          runId: "run_1",
        },
        {
          id: "ev_inspected_web",
          sourceClass: "public_web" as const,
          label: "public page",
          text: "public page without proprietary audience language",
          origin: "application_observation" as const,
          sourceId: "url:https://example.com/x",
          url: "https://example.com/x",
          observedAt: at,
          recordedBy: "app",
          runId: "run_1",
        },
      ],
    }),
  );
  assert.equal(result.ok, true, result.ok ? "" : result.detail);
  if (!result.ok) return;
  assert.ok(isValidatedInputGap(result.need));
  assert.equal(result.need.resourceClass, "proprietary_data");
});

test("literal scarcity without NOT_AVAILABLE still refuses when not semantic gap", () => {
  const result = validateMissingInputProposal(
    {
      inputCheckId: "evidence_sufficiency",
      resourceClass: "proprietary_data",
      purpose: "licensed audience language",
      reasonOwnedInsufficient: "insufficient without availability token",
      supportingEvidenceIds: ["ev_inspected_rec", "ev_inspected_web"],
    },
    baseCtx({
      evidence: [
        {
          id: "ev_inspected_rec",
          sourceClass: "company_record" as const,
          label: "company/profile",
          text: "owned launch context",
          origin: "application_observation" as const,
          sourceId: "record:company/profile",
          recordRef: "company/profile",
          observedAt: at,
          recordedBy: "app",
          runId: "run_1",
        },
        {
          id: "ev_inspected_web",
          sourceClass: "public_web" as const,
          label: "public page",
          text: "public page",
          origin: "application_observation" as const,
          sourceId: "url:https://example.com/x",
          url: "https://example.com/x",
          observedAt: at,
          recordedBy: "app",
          runId: "run_1",
        },
      ],
    }),
  );
  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.equal(result.refusalCode, "missing_not_available_evidence");
});
