// CHECKPOINT 2, item 3.B: Nex Run 1 evidence recorded repeated
// purpose_scope_class_mismatch refusals (purposeKind founder_messaging_qualitative
// proposed against privileged_access, then human_voice_contact) with no
// indication of which resource class(es) that purposeKind IS legal for, or
// which purposeKinds ARE authorized for the current Requirement. The worker
// had to keep guessing across the class/purpose space one refusal at a time.
//
// validateMissingInputProposal already computes the exact bounded answer
// (GOVERNED_PURPOSE_KINDS, externalResourceClassesForPurposeKind,
// ctx.authorizedPurposeKinds) — this only makes the refusal SAY it, mirroring
// the pattern checkInputAvailability already uses ("Accepted ids: ...").
// No validation is loosened: refusalCode and pass/fail behavior are unchanged.
import test from "node:test";
import assert from "node:assert/strict";
import { validateMissingInputProposal } from "../lib/objective/inputDiagnosis";
import type { ValidateMissingInputContext } from "../lib/objective/inputDiagnosis";
import {
  FOUNDER_MESSAGING_QUALITATIVE_PURPOSE_KIND,
  EXTERNAL_SOCIAL_INTELLIGENCE_PURPOSE_KIND,
} from "../lib/workforce/catalog";

const now = 1_985_000_000_000;

function baseContext(overrides: Partial<ValidateMissingInputContext> = {}): ValidateMissingInputContext {
  return {
    objectiveKey: "obj_purpose_refusal",
    requirementKey: "req_01",
    contractRevision: 1,
    runId: "run_1",
    workItemId: "wi_1",
    requiredResourceClasses: [],
    authorizedPurposeKinds: [FOUNDER_MESSAGING_QUALITATIVE_PURPOSE_KIND],
    mustBeTrue: "evidence-bounded launch-week plan",
    expectedOutput: null,
    sourceProofs: [{ sourceClass: "company_record", minDistinctSources: 1 }],
    requiredSourceClasses: ["company_record"],
    controlledResourceClasses: ["company_records", "company_tools", "public_web"],
    evidence: [],
    existingNeeds: [],
    at: now,
    needId: "need_1",
    ...overrides,
  };
}

test("purpose_scope_class_mismatch refusal names the legal resource class(es) for the proposed purposeKind", () => {
  const result = validateMissingInputProposal(
    {
      resourceClass: "privileged_access",
      purpose: "need access rights",
      reasonOwnedInsufficient: "we do not hold this access",
      supportingEvidenceIds: [],
      purposeKind: FOUNDER_MESSAGING_QUALITATIVE_PURPOSE_KIND,
    },
    baseContext(),
  );
  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.equal(result.refusalCode, "purpose_scope_class_mismatch");
  assert.match(result.detail, /Legal resource class\(es\) for founder_messaging_qualitative/);
  assert.match(result.detail, /proprietary_data/);
});

test("unknown_purpose_scope refusal names the full governed purposeKind vocabulary", () => {
  const result = validateMissingInputProposal(
    {
      resourceClass: "proprietary_data",
      purpose: "need external data",
      reasonOwnedInsufficient: "insufficient owned evidence",
      supportingEvidenceIds: [],
      purposeKind: "artifact:launch-week-plan",
    },
    baseContext(),
  );
  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.equal(result.refusalCode, "unknown_purpose_scope");
  assert.match(result.detail, /Governed kinds:/);
  assert.match(result.detail, new RegExp(FOUNDER_MESSAGING_QUALITATIVE_PURPOSE_KIND));
  assert.match(result.detail, new RegExp(EXTERNAL_SOCIAL_INTELLIGENCE_PURPOSE_KIND));
});

test("purpose_scope_not_authorized refusal names the kinds actually authorized for THIS Requirement (not the global vocabulary)", () => {
  const result = validateMissingInputProposal(
    {
      resourceClass: "proprietary_data",
      purpose: "need current social data",
      reasonOwnedInsufficient: "insufficient owned evidence",
      supportingEvidenceIds: [],
      purposeKind: EXTERNAL_SOCIAL_INTELLIGENCE_PURPOSE_KIND,
    },
    baseContext({ authorizedPurposeKinds: [FOUNDER_MESSAGING_QUALITATIVE_PURPOSE_KIND] }),
  );
  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.equal(result.refusalCode, "purpose_scope_not_authorized");
  const authorizedSuffix = result.detail.split("Kinds authorized for this Requirement:")[1] ?? "";
  assert.match(authorizedSuffix, new RegExp(FOUNDER_MESSAGING_QUALITATIVE_PURPOSE_KIND));
  assert.ok(
    !authorizedSuffix.includes(EXTERNAL_SOCIAL_INTELLIGENCE_PURPOSE_KIND),
    "the authorized-kinds list must not suggest the very kind that was just rejected",
  );
});

test("regression: refusalCode and pass/fail behavior are unchanged by the added guidance text", () => {
  // A genuinely valid, authorized proposal still succeeds exactly as before.
  const evidenceId = "ev_owned_1";
  const ok = validateMissingInputProposal(
    {
      resourceClass: "proprietary_data",
      purpose: "audience language for the relaunch",
      reasonOwnedInsufficient: "owned company records and public research do not describe audience voice",
      supportingEvidenceIds: [evidenceId],
      semanticAdequacyGap: true,
      purposeKind: FOUNDER_MESSAGING_QUALITATIVE_PURPOSE_KIND,
    },
    baseContext({
      evidence: [
        {
          id: evidenceId,
          runId: "run_1",
          origin: "application_observation",
          sourceClass: "company_record",
          label: "Launch context",
          text: "owned launch context without audience language",
          recordRef: "launch/context",
          sourceId: "record:launch/context",
          recordedBy: "app",
          observedAt: now,
        },
      ],
    }),
  );
  assert.equal(ok.ok, true, ok.ok ? "" : (ok as { detail: string }).detail);
});
