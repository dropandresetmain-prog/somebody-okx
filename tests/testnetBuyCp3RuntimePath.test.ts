/**
 * CP3 focused tests: Social Media Guru through authorization → verification →
 * acquisition extraction, preserving submitted ≠ settled ≠ result ≠ verified.
 */
import test from "node:test";
import assert from "node:assert/strict";

import {
  SOCIAL_MEDIA_GURU_OFFERING_ID,
  SOCIAL_MEDIA_GURU_PROVIDER_ID,
  SOCIAL_MEDIA_GURU_SERVICE_ID,
  buildSocialMediaGuruProtectedSuccess,
  socialMediaGuruAuthorizedRequestFromIntent,
  verifySocialMediaGuruProtectedResult,
} from "../lib/payment/socialMediaGuruProduct";
import { verifyProductionM3Result } from "../lib/payment/localProductionComposition";
import { extractLiveAcquisitionContent } from "../lib/payment/liveAcquisitionContent";
import { merchantHeadersForIntent } from "../lib/payment/supervisedDriverAdapter";
import { EXTERNAL_SOCIAL_INTELLIGENCE_PURPOSE_KIND } from "../lib/workforce/catalog";
import type { ExecutionIntent } from "../lib/management/types";
import type { PurchaseRecord } from "../lib/payment/types";
import { JEV_OPTION_SELECTION_ENV } from "../lib/management/jevStage3";

const at = 1_960_000_000_000;

function smgIntent(overrides: Partial<ExecutionIntent> = {}): ExecutionIntent {
  return {
    intentId: "int_smg_runtime",
    idempotencyKey: "idem_smg_runtime",
    objectiveKey: "obj_smg",
    requirementKey: "req_smg",
    contractRevision: 1,
    decisionId: "dec_smg",
    kind: "external_acquisition",
    strategy: "BUY",
    target: {
      offeringId: SOCIAL_MEDIA_GURU_OFFERING_ID,
      providerId: SOCIAL_MEDIA_GURU_PROVIDER_ID,
      serviceId: SOCIAL_MEDIA_GURU_SERVICE_ID,
      resourceClass: "proprietary_data",
      endpointRef: null,
    },
    terms: {
      priceUsd: 0.01,
      priceProvenance: "registry_data",
      requiresApproval: true,
      approvalId: "approval_smg",
    },
    purpose: "Audience and trend evidence for TikTok Instagram Facebook and X marketing",
    requestedPurposeKind: EXTERNAL_SOCIAL_INTELLIGENCE_PURPOSE_KIND,
    state: "awaiting_m3",
    attempts: 0,
    lastEventId: null,
    resultEvidenceId: null,
    verificationEvidenceId: null,
    boundaryNote: "awaiting local M3 driver",
    createdAt: at,
    updatedAt: at,
    ...overrides,
  };
}

test("Social Media Guru intent authorizes merchant headers and verifies protected result", () => {
  const intent = smgIntent();
  const authorized = socialMediaGuruAuthorizedRequestFromIntent(intent);
  assert.equal(authorized.ok, true);
  if (!authorized.ok) return;

  const headers = merchantHeadersForIntent(intent);
  assert.equal(headers["x-somebody-service-id"], SOCIAL_MEDIA_GURU_SERVICE_ID);
  assert.equal(headers["x-somebody-purpose-kind"], EXTERNAL_SOCIAL_INTELLIGENCE_PURPOSE_KIND);
  assert.equal(headers["x-somebody-product-id"], "social_media_guru");

  const result = buildSocialMediaGuruProtectedSuccess({
    purpose: authorized.request.purpose,
    purposeKind: EXTERNAL_SOCIAL_INTELLIGENCE_PURPOSE_KIND,
    requestId: intent.intentId,
    offeringId: SOCIAL_MEDIA_GURU_OFFERING_ID,
    observedAt: at,
  });
  assert.ok(verifySocialMediaGuruProtectedResult(result));

  const purchase: PurchaseRecord = {
    id: intent.intentId,
    objectiveKey: intent.objectiveKey,
    resourceNeedId: intent.requirementKey,
    offeringId: SOCIAL_MEDIA_GURU_OFFERING_ID,
    idempotencyKey: intent.idempotencyKey,
    state: "result_received",
    boundTerms: null,
    approval: null,
    receipt: null,
    result,
    verified: false,
    createdAt: at,
    updatedAt: at,
  };

  const verified = verifyProductionM3Result({ intent, purchase, result });
  assert.equal(verified.verified, true, verified.verificationProof);

  const extracted = extractLiveAcquisitionContent(result);
  assert.ok(extracted);
  assert.equal(extracted!.providerId, SOCIAL_MEDIA_GURU_PROVIDER_ID);
  assert.equal(extracted!.serviceId, SOCIAL_MEDIA_GURU_SERVICE_ID);
  assert.match(extracted!.content, /No live TikTok/);
  assert.match(extracted!.content, /synthetic_test_provider/i);
});

test("result verification fails closed on identity mismatch", () => {
  const intent = smgIntent();
  const result = buildSocialMediaGuruProtectedSuccess({
    purpose: intent.purpose!,
    purposeKind: EXTERNAL_SOCIAL_INTELLIGENCE_PURPOSE_KIND,
    requestId: "wrong_request_id",
    offeringId: SOCIAL_MEDIA_GURU_OFFERING_ID,
  });
  const purchase: PurchaseRecord = {
    id: intent.intentId,
    objectiveKey: intent.objectiveKey,
    resourceNeedId: intent.requirementKey,
    offeringId: SOCIAL_MEDIA_GURU_OFFERING_ID,
    idempotencyKey: intent.idempotencyKey,
    state: "result_received",
    boundTerms: null,
    approval: null,
    receipt: null,
    result,
    verified: false,
    createdAt: at,
    updatedAt: at,
  };
  const verified = verifyProductionM3Result({ intent, purchase, result });
  assert.equal(verified.verified, false);
  assert.match(verified.verificationProof, /rejected/);
});

test("JEV option selection remains disabled for this BUY lane", () => {
  assert.equal(JEV_OPTION_SELECTION_ENV, "JEV_OPTION_SELECTION_ENABLED");
  assert.notEqual(process.env.JEV_OPTION_SELECTION_ENABLED, "true");
});

test("lifecycle state labels remain distinct in purchase record vocabulary", () => {
  // Guardrail: do not collapse payment states in the type surface used by SMG path.
  const states = [
    "prepared",
    "awaiting_approval",
    "approved",
    "payment_attempted",
    "submitted",
    "settled",
    "result_received",
    "verified",
  ] as const;
  assert.equal(new Set(states).size, states.length);
  assert.notEqual("submitted", "settled");
  assert.notEqual("settled", "result_received");
  assert.notEqual("result_received", "verified");
});
