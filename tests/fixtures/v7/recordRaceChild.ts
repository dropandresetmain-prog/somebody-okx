// Child process for the V7 R1 concurrent-creation race test. Waits for a
// shared start instant, then attempts ONE record for a distinct (valid)
// decision identity of the same request. Prints a JSON outcome line.
// No network, wallet, merchant, provider or payment dependency.
import { recordVerifiedAcquisition } from "../../../lib/payment/acquisitionRecordReplay";
import { buildM3ProtectedSuccess } from "../../../lib/payment/m3FounderNarrativeProduct";
import type { ExecutionIntent } from "../../../lib/management/types";
import type { PurchaseRecord } from "../../../lib/payment/types";

const [, , dir, key, decisionId, startAtRaw] = process.argv;
const startAt = Number(startAtRaw);
const at = 2_000_000_000_000;

const intent: ExecutionIntent = {
  intentId: "int_race", idempotencyKey: "idem_race", objectiveKey: "obj_race",
  requirementKey: "req_race", contractRevision: 1, decisionId: decisionId!, kind: "external_acquisition",
  strategy: "BUY",
  target: { offeringId: "somebody_controlled_test:founder_narrative_pulse", providerId: "somebody_controlled_test", serviceId: "founder_narrative_pulse", resourceClass: "proprietary_data", endpointRef: null },
  terms: { priceUsd: 1, priceProvenance: "provider_quote", requiresApproval: true, approvalId: "ap_race" },
  state: "result_recorded", attempts: 1, lastEventId: null, resultEvidenceId: null, verificationEvidenceId: null,
  boundaryNote: "race", createdAt: at, updatedAt: at,
  purpose: "Qualitative founder messaging read.", requestedPurposeKind: "founder_messaging_qualitative",
};
const purchase: PurchaseRecord = {
  id: intent.intentId, objectiveKey: intent.objectiveKey, resourceNeedId: intent.requirementKey,
  offeringId: intent.target.offeringId!, idempotencyKey: intent.idempotencyKey,
  state: "result_received", boundTerms: null, approval: null, receipt: null, result: null, verified: false,
  createdAt: at, updatedAt: at,
};
const result = buildM3ProtectedSuccess({
  purpose: intent.purpose!, purposeKind: "founder_messaging_qualitative",
  requestId: intent.intentId, offeringId: intent.target.offeringId, observedAt: 1,
});

while (Date.now() < startAt) {
  // bounded spin to line up the racers (sub-second)
}
try {
  const record = recordVerifiedAcquisition({
    intent, purchase, result, recordedAt: at,
    env: { M3_VERIFIED_ACQUISITION_RECORD_DIR: dir, M3_VERIFIED_ACQUISITION_RECORD_KEY: key },
  });
  console.log(JSON.stringify({ ok: true, decisionId: record?.binding.intent.decisionId }));
} catch (error) {
  console.log(JSON.stringify({ ok: false, error: error instanceof Error ? error.message : String(error) }));
}
