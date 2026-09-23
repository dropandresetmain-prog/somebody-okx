/**
 * Focused M6.1 bridge tests:
 * A) live verified acquisition content writeback into acquisitionResults
 * B) BUY eligibility requires a currently configured execution path
 */
import test from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";

import { apply } from "../convex/m3Driver";
import { canonicalM3DriverFact, type M3DriverFact } from "../lib/management/m3DriverFacts";
import type { ExecutionIntent } from "../lib/management/types";
import type { ExternalAcquisitionResult } from "../lib/objective/types";
import {
  assertAttestedLiveAcquisitionContent,
  extractLiveAcquisitionContent,
} from "../lib/payment/liveAcquisitionContent";
import {
  buildM3ProtectedSuccess,
  M3_PRODUCT_PROVENANCE,
  M3_SUPPORTED_PURPOSE_KIND,
} from "../lib/payment/m3FounderNarrativeProduct";
import { sha256Hex } from "../lib/management/sha256";
import { groundRegistryOfferings } from "../lib/management/grounding";
import { evaluateOptionEligibility } from "../lib/sourcing/eligibility";
import { buildExternalOption, eligibilityInputFor, withEligibility, EMPTY_FACTS } from "../lib/management/options";
import { VERIFIED_SERVICE_REGISTRY } from "../lib/market/registryData";
import { SNAPSHOT_OFFERINGS } from "../lib/market/snapshotData";
import {
  hasConfiguredExternalExecutionPath,
  externalOfferingAcceptsPurpose,
} from "../lib/providers/executionCapability";
import { CANONICAL_SOCIAL_INTELLIGENCE_NEED } from "../lib/objective/seedData";

const key = "test-only-independent-m3-fact-attestation-key";
const token = "test-driver-bridge-token";
const at = 1961000000000;

function sign(fact: M3DriverFact): string {
  return createHmac("sha256", key).update(canonicalM3DriverFact(fact)).digest("hex");
}

type Handler = { _handler: (ctx: unknown, args: Record<string, unknown>) => Promise<unknown> };

function makeProtectedResult() {
  return buildM3ProtectedSuccess({
    purpose: CANONICAL_SOCIAL_INTELLIGENCE_NEED.purpose,
    purposeKind: M3_SUPPORTED_PURPOSE_KIND,
    requestId: "req_live_bridge",
    offeringId: "somebody_controlled_test:founder_narrative_pulse",
    observedAt: at,
  });
}

function writebackFixture() {
  let intent: ExecutionIntent = {
    intentId: "int_live",
    idempotencyKey: "idem_live",
    objectiveKey: "obj_live",
    requirementKey: "req_live",
    contractRevision: 1,
    decisionId: "dec_live",
    kind: "external_acquisition",
    strategy: "BUY",
    target: {
      offeringId: "somebody_controlled_test:founder_narrative_pulse",
      providerId: "somebody_controlled_test",
      serviceId: "founder_narrative_pulse",
      resourceClass: "proprietary_data",
      endpointRef: null,
    },
    terms: {
      priceUsd: 0.01,
      priceProvenance: "provider_quote",
      requiresApproval: false,
      approvalId: "approval_live",
    },
    state: "awaiting_m3",
    attempts: 0,
    lastEventId: null,
    resultEvidenceId: null,
    verificationEvidenceId: null,
    boundaryNote: "live bridge",
    createdAt: at,
    updatedAt: at,
    needDedupeKey: "need_live_dedupe",
    resourceNeedId: "need_live_id",
  };
  let acquisitions: ExternalAcquisitionResult[] = [];
  let objectiveUpdatedAt = at;
  const one = (value: unknown) => ({
    withIndex: () => ({
      unique: async () => value,
      order: () => ({ first: async () => value }),
      collect: async () => (value == null ? [] : [value]),
    }),
  });
  const ctx = {
    db: {
      query(table: string) {
        if (table === "executionIntents") return one({ _id: "intent-row", data: intent });
        if (table === "objectives")
          return one({
            _id: "objective-row",
            data: {
              key: "obj_live",
              acquisitionResults: acquisitions,
              updatedAt: objectiveUpdatedAt,
            },
          });
        if (table === "outcomeContracts") return one({ _id: "contract-row", revision: 1 });
        if (table === "requirements")
          return one({ _id: "requirement-row", data: { contractRevision: 1 } });
        if (table === "founderSpendGrants")
          return one({
            data: {
              approvalId: "approval_live",
              objectiveKey: "obj_live",
              limitUsd: 1,
              grantedAt: at,
              revokedAt: null,
              note: "test",
            },
          });
        if (table === "wakeEvents") return one(null);
        throw new Error(`unexpected table ${table}`);
      },
      async patch(_id: string, value: { data: ExecutionIntent | Record<string, unknown> }) {
        if ("state" in value.data && "intentId" in value.data) {
          intent = value.data as ExecutionIntent;
        } else {
          const record = value.data as {
            acquisitionResults?: ExternalAcquisitionResult[];
            updatedAt: number;
          };
          acquisitions = record.acquisitionResults ?? [];
          objectiveUpdatedAt = record.updatedAt;
        }
      },
      async insert() {
        return "wake-row";
      },
    },
    scheduler: { async runAfter() { return "scheduled"; } },
  };
  return {
    ctx,
    current: () => intent,
    acquisitions: () => acquisitions,
  };
}

async function invoke(
  ctx: unknown,
  fact: M3DriverFact,
  extra: { acquisitionContent?: string } = {},
): Promise<unknown> {
  return (apply as unknown as Handler)._handler(ctx, {
    ...fact,
    evidenceId: fact.evidenceId ?? undefined,
    acquisitionContentHash: fact.acquisitionContentHash,
    acquisitionDeclaredResourceClass:
      fact.acquisitionDeclaredResourceClass ?? null,
    acquisitionContent: extra.acquisitionContent,
    attestation: sign(fact),
    driverToken: token,
  });
}

// ── A: live acquisition content writeback ────────────────────────────────────

test("A: extractLiveAcquisitionContent keeps synthetic_test_provider markers", () => {
  const raw = makeProtectedResult();
  const extracted = extractLiveAcquisitionContent(raw);
  assert.ok(extracted);
  assert.equal(extracted.providerId, "somebody_controlled_test");
  assert.equal(extracted.serviceId, "founder_narrative_pulse");
  assert.ok(extracted.content.includes("SYNTHETIC"));
  assert.ok(extracted.content.toLowerCase().includes("not live"));
  assert.equal(raw.provenance, M3_PRODUCT_PROVENANCE);
  assert.equal(extracted.contentHash, sha256Hex(extracted.content));
  assertAttestedLiveAcquisitionContent(extracted.content, extracted.contentHash);
});

test("A: submitted and provider_result do not write acquisitionResults", async () => {
  const previousToken = process.env.M4_M3_DRIVER_TOKEN;
  const previousKey = process.env.M4_M3_FACT_ATTESTATION_KEY;
  process.env.M4_M3_DRIVER_TOKEN = token;
  process.env.M4_M3_FACT_ATTESTATION_KEY = key;
  try {
    const bridge = writebackFixture();
    await invoke(bridge.ctx, {
      intentId: "int_live",
      expectedUpdatedAt: at,
      eventKind: "submitted",
      eventId: "ev_submit",
      dedupeKey: "intent:int_live:submitted:ev",
      evidenceId: null,
      note: "submitted",
      at,
      acquisitionContentHash: null,
    });
    assert.equal(bridge.acquisitions().length, 0);
    assert.equal(bridge.current().state, "handed_off");

    await invoke(bridge.ctx, {
      intentId: "int_live",
      expectedUpdatedAt: bridge.current().updatedAt,
      eventKind: "provider_result",
      eventId: "ev_result",
      dedupeKey: "intent:int_live:provider_result:ev",
      evidenceId: "ev_result_live",
      note: "provider result",
      at: at + 1,
      acquisitionContentHash: null,
    });
    assert.equal(bridge.acquisitions().length, 0);
    assert.equal(bridge.current().state, "result_recorded");
  } finally {
    if (previousToken === undefined) delete process.env.M4_M3_DRIVER_TOKEN;
    else process.env.M4_M3_DRIVER_TOKEN = previousToken;
    if (previousKey === undefined) delete process.env.M4_M3_FACT_ATTESTATION_KEY;
    else process.env.M4_M3_FACT_ATTESTATION_KEY = previousKey;
  }
});

test("A: verification_passed writes exactly one live acquisition with synthetic content", async () => {
  const previousToken = process.env.M4_M3_DRIVER_TOKEN;
  const previousKey = process.env.M4_M3_FACT_ATTESTATION_KEY;
  process.env.M4_M3_DRIVER_TOKEN = token;
  process.env.M4_M3_FACT_ATTESTATION_KEY = key;
  try {
    const bridge = writebackFixture();
    await invoke(bridge.ctx, {
      intentId: "int_live",
      expectedUpdatedAt: at,
      eventKind: "submitted",
      eventId: "ev_submit2",
      dedupeKey: "intent:int_live:submitted:ev2",
      evidenceId: null,
      note: "submitted",
      at,
      acquisitionContentHash: null,
    });
    await invoke(bridge.ctx, {
      intentId: "int_live",
      expectedUpdatedAt: bridge.current().updatedAt,
      eventKind: "provider_result",
      eventId: "ev_result2",
      dedupeKey: "intent:int_live:provider_result:ev2",
      evidenceId: "ev_result_live2",
      note: "provider result",
      at: at + 1,
      acquisitionContentHash: null,
    });
    const extracted = extractLiveAcquisitionContent(makeProtectedResult())!;
    const verifyFact: M3DriverFact = {
      intentId: "int_live",
      expectedUpdatedAt: bridge.current().updatedAt,
      eventKind: "verification_passed",
      eventId: "ev_verify2",
      dedupeKey: "intent:int_live:verification_result:ev2",
      evidenceId: "ev_verify_live2",
      note: "verified",
      at: at + 2,
      acquisitionContentHash: extracted.contentHash,
      // Adapter-declared fulfillment class, bound into the attestation.
      acquisitionDeclaredResourceClass: extracted.resourceClass,
    };
    await invoke(bridge.ctx, verifyFact, { acquisitionContent: extracted.content });
    assert.equal(bridge.current().state, "verified");
    assert.equal(bridge.acquisitions().length, 1);
    const row = bridge.acquisitions()[0]!;
    assert.equal(row.provenance, "live");
    assert.equal(
      row.resourceClass,
      "proprietary_data",
      "writeback stores the verified adapter-declared class, never an unknown fallback",
    );
    assert.ok(row.content.includes("SYNTHETIC"));
    assert.ok(row.content.toLowerCase().includes("synthetic"));
    assert.equal(row.responseHash, extracted.contentHash);
    assert.equal(row.intentId, "int_live");
    assert.equal(row.requirementKey, "req_live");
    assert.equal(row.contractRevision, 1);
    assert.equal(row.resultEvidenceId, "ev_result_live2");
    assert.equal(row.providerId, "somebody_controlled_test");
    assert.equal(row.serviceId, "founder_narrative_pulse");
    assert.equal(row.needDedupeKey, "need_live_dedupe");
    assert.equal(row.resourceNeedId, "need_live_id");

    // Idempotent replay of the same verification event is a no-op.
    const again = await invoke(bridge.ctx, verifyFact, {
      acquisitionContent: extracted.content,
    });
    assert.deepEqual(again, {
      changed: false,
      duplicate: true,
      state: "verified",
      stale: false,
    });
    assert.equal(bridge.acquisitions().length, 1);
  } finally {
    if (previousToken === undefined) delete process.env.M4_M3_DRIVER_TOKEN;
    else process.env.M4_M3_DRIVER_TOKEN = previousToken;
    if (previousKey === undefined) delete process.env.M4_M3_FACT_ATTESTATION_KEY;
    else process.env.M4_M3_FACT_ATTESTATION_KEY = previousKey;
  }
});

test("A: mismatched content hash fails closed", async () => {
  const previousToken = process.env.M4_M3_DRIVER_TOKEN;
  const previousKey = process.env.M4_M3_FACT_ATTESTATION_KEY;
  process.env.M4_M3_DRIVER_TOKEN = token;
  process.env.M4_M3_FACT_ATTESTATION_KEY = key;
  try {
    const bridge = writebackFixture();
    await invoke(bridge.ctx, {
      intentId: "int_live",
      expectedUpdatedAt: at,
      eventKind: "submitted",
      eventId: "ev_s3",
      dedupeKey: "intent:int_live:submitted:ev3",
      evidenceId: null,
      note: "s",
      at,
      acquisitionContentHash: null,
    });
    await invoke(bridge.ctx, {
      intentId: "int_live",
      expectedUpdatedAt: bridge.current().updatedAt,
      eventKind: "provider_result",
      eventId: "ev_r3",
      dedupeKey: "intent:int_live:provider_result:ev3",
      evidenceId: "ev_result_3",
      note: "r",
      at: at + 1,
      acquisitionContentHash: null,
    });
    const extracted = extractLiveAcquisitionContent(makeProtectedResult())!;
    await assert.rejects(
      () =>
        invoke(
          bridge.ctx,
          {
            intentId: "int_live",
            expectedUpdatedAt: bridge.current().updatedAt,
            eventKind: "verification_passed",
            eventId: "ev_v3",
            dedupeKey: "intent:int_live:verification_result:ev3",
            evidenceId: "ev_verify_3",
            note: "v",
            at: at + 2,
            acquisitionContentHash: extracted.contentHash,
            acquisitionDeclaredResourceClass: extracted.resourceClass,
          },
          { acquisitionContent: extracted.content + "\nTAMPERED" },
        ),
      /hash does not match/,
    );
    assert.equal(bridge.acquisitions().length, 0);
  } finally {
    if (previousToken === undefined) delete process.env.M4_M3_DRIVER_TOKEN;
    else process.env.M4_M3_DRIVER_TOKEN = previousToken;
    if (previousKey === undefined) delete process.env.M4_M3_FACT_ATTESTATION_KEY;
    else process.env.M4_M3_FACT_ATTESTATION_KEY = previousKey;
  }
});

test("A: writeback refuses a well-signed fact whose declared class mismatches the authorized offering", async () => {
  // Correctly signed by a key-holding driver, but the ADAPTER-DECLARED class in
  // the fact differs from the class the intent's authorized offering supplies:
  // naming a class (here, in the attested fact) never overrides the authorized
  // binding — the writeback fails closed.
  const previousToken = process.env.M4_M3_DRIVER_TOKEN;
  const previousKey = process.env.M4_M3_FACT_ATTESTATION_KEY;
  process.env.M4_M3_DRIVER_TOKEN = token;
  process.env.M4_M3_FACT_ATTESTATION_KEY = key;
  try {
    const bridge = writebackFixture();
    await invoke(bridge.ctx, {
      intentId: "int_live", expectedUpdatedAt: at, eventKind: "submitted",
      eventId: "ev_s4", dedupeKey: "intent:int_live:submitted:ev4",
      evidenceId: null, note: "s", at, acquisitionContentHash: null,
    });
    await invoke(bridge.ctx, {
      intentId: "int_live", expectedUpdatedAt: bridge.current().updatedAt,
      eventKind: "provider_result", eventId: "ev_r4",
      dedupeKey: "intent:int_live:provider_result:ev4",
      evidenceId: "ev_result_4", note: "r", at: at + 1, acquisitionContentHash: null,
    });
    const extracted = extractLiveAcquisitionContent(makeProtectedResult())!;
    await assert.rejects(
      () =>
        invoke(
          bridge.ctx,
          {
            intentId: "int_live", expectedUpdatedAt: bridge.current().updatedAt,
            eventKind: "verification_passed", eventId: "ev_v4",
            dedupeKey: "intent:int_live:verification_result:ev4",
            evidenceId: "ev_verify_4", note: "v", at: at + 2,
            acquisitionContentHash: extracted.contentHash,
            acquisitionDeclaredResourceClass: "privileged_access",
          },
          { acquisitionContent: extracted.content },
        ),
      /refusing mismatched acquisition writeback/,
    );
    assert.equal(bridge.acquisitions().length, 0);
  } finally {
    if (previousToken === undefined) delete process.env.M4_M3_DRIVER_TOKEN;
    else process.env.M4_M3_DRIVER_TOKEN = previousToken;
    if (previousKey === undefined) delete process.env.M4_M3_FACT_ATTESTATION_KEY;
    else process.env.M4_M3_FACT_ATTESTATION_KEY = previousKey;
  }
});

test("A: verified live writeback without the adapter-declared class fails closed", async () => {
  const previousToken = process.env.M4_M3_DRIVER_TOKEN;
  const previousKey = process.env.M4_M3_FACT_ATTESTATION_KEY;
  process.env.M4_M3_DRIVER_TOKEN = token;
  process.env.M4_M3_FACT_ATTESTATION_KEY = key;
  try {
    const bridge = writebackFixture();
    await invoke(bridge.ctx, {
      intentId: "int_live", expectedUpdatedAt: at, eventKind: "submitted",
      eventId: "ev_s5", dedupeKey: "intent:int_live:submitted:ev5",
      evidenceId: null, note: "s", at, acquisitionContentHash: null,
    });
    await invoke(bridge.ctx, {
      intentId: "int_live", expectedUpdatedAt: bridge.current().updatedAt,
      eventKind: "provider_result", eventId: "ev_r5",
      dedupeKey: "intent:int_live:provider_result:ev5",
      evidenceId: "ev_result_5", note: "r", at: at + 1, acquisitionContentHash: null,
    });
    const extracted = extractLiveAcquisitionContent(makeProtectedResult())!;
    // Legacy-shaped fact: content hash present, declared class absent. Even a
    // correctly signed fact cannot write acquisition truth without it.
    await assert.rejects(
      () =>
        invoke(
          bridge.ctx,
          {
            intentId: "int_live", expectedUpdatedAt: bridge.current().updatedAt,
            eventKind: "verification_passed", eventId: "ev_v5",
            dedupeKey: "intent:int_live:verification_result:ev5",
            evidenceId: "ev_verify_5", note: "v", at: at + 2,
            acquisitionContentHash: extracted.contentHash,
          },
          { acquisitionContent: extracted.content },
        ),
      /requires the adapter-declared resource class/,
    );
    assert.equal(bridge.acquisitions().length, 0);
  } finally {
    if (previousToken === undefined) delete process.env.M4_M3_DRIVER_TOKEN;
    else process.env.M4_M3_DRIVER_TOKEN = previousToken;
    if (previousKey === undefined) delete process.env.M4_M3_FACT_ATTESTATION_KEY;
    else process.env.M4_M3_FACT_ATTESTATION_KEY = previousKey;
  }
});

// ── B: executable offering eligibility ───────────────────────────────────────

test("B: execution capability is independent of registry membership", () => {
  assert.equal(
    hasConfiguredExternalExecutionPath({
      providerId: "somebody_controlled_test",
      serviceId: "founder_narrative_pulse",
    }),
    true,
  );
  assert.equal(
    hasConfiguredExternalExecutionPath({
      providerId: "2135",
      serviceId: "newsliquid_twitter_search",
    }),
    false,
  );
  assert.equal(
    hasConfiguredExternalExecutionPath({
      providerId: "4442",
      serviceId: "flybeacon_x_narrative_pulse",
    }),
    false,
  );
});

test("B: grounding marks only composed offerings as executionPathConfigured", () => {
  const { offerings } = groundRegistryOfferings({
    registry: VERIFIED_SERVICE_REGISTRY,
    discovered: SNAPSHOT_OFFERINGS.filter((o) =>
      ["proprietary_data"].includes("proprietary_data"),
    ),
    requiredResourceClass: "proprietary_data",
    at,
    purpose: CANONICAL_SOCIAL_INTELLIGENCE_NEED.purpose,
  });
  const proprietary = offerings.filter((o) => o.compatibleResourceClass);
  assert.ok(proprietary.length >= 2, "registry still surfaces multiple proprietary_data offerings");
  const executable = proprietary.filter((o) => o.executionPathConfigured);
  assert.equal(executable.length, 1);
  assert.equal(executable[0]!.serviceId, "founder_narrative_pulse");
  for (const offering of proprietary) {
    if (offering.serviceId !== "founder_narrative_pulse") {
      assert.equal(offering.executionPathConfigured, false);
    }
  }
});

test("B: NewsLiquid-style offering is not BUY-eligible without execution path", () => {
  const option = buildExternalOption({
    requirementKey: "req_b",
    contractRevision: 1,
    offeringId: "2135:newsliquid_twitter_search",
    providerId: "2135",
    serviceId: "newsliquid_twitter_search",
    resourceClass: "proprietary_data",
    priceUsd: 0.002,
    priceProvenance: "registry_data",
    registryVerified: true,
    compatibleResourceClass: true,
    executionPathConfigured: false,
    purposeScopeCompatible: true,
    facts: EMPTY_FACTS,
  });
  const [evaluated] = withEligibility([option], (o) =>
    eligibilityInputFor(o, {
      requiredResourceClasses: ["proprietary_data"],
      controlledResourceClasses: [],
      deadlineAt: null,
      now: at,
      estimatedMinutes: null,
      requiresMandatoryProof: false,
      proofAvailable: true,
      workerAvailable: null,
      spendAuthorityUsd: 1,
      budgetRemainingUsd: 1,
    }),
  );
  assert.equal(evaluated!.eligibility.eligible, false);
  if (!evaluated!.eligibility.eligible) {
    assert.ok(evaluated!.eligibility.reasons.includes("provider_incompatible"));
    assert.ok(
      evaluated!.eligibility.detail.includes("no configured execution path"),
    );
  }
});

test("B: controlled merchant is BUY-eligible when purpose scope matches", () => {
  // V7 review R4: compatibility comes from the validated requested scope ∩
  // the adapter declaration; the same prose without a validated kind is NOT
  // compatible (fail closed, no keyword luck).
  assert.equal(
    externalOfferingAcceptsPurpose({
      serviceId: "founder_narrative_pulse",
      purpose: CANONICAL_SOCIAL_INTELLIGENCE_NEED.purpose,
      purposeKind: M3_SUPPORTED_PURPOSE_KIND,
      resourceClass: "proprietary_data",
    }),
    true,
  );
  assert.equal(
    externalOfferingAcceptsPurpose({
      serviceId: "founder_narrative_pulse",
      purpose: CANONICAL_SOCIAL_INTELLIGENCE_NEED.purpose,
      resourceClass: "proprietary_data",
    }),
    false,
  );
  const option = buildExternalOption({
    requirementKey: "req_b",
    contractRevision: 1,
    offeringId: "somebody_controlled_test:founder_narrative_pulse",
    providerId: "somebody_controlled_test",
    serviceId: "founder_narrative_pulse",
    resourceClass: "proprietary_data",
    priceUsd: 0.01,
    priceProvenance: "registry_data",
    registryVerified: true,
    compatibleResourceClass: true,
    executionPathConfigured: true,
    purposeScopeCompatible: true,
    facts: EMPTY_FACTS,
  });
  const verdict = evaluateOptionEligibility(
    eligibilityInputFor(option, {
      requiredResourceClasses: ["proprietary_data"],
      controlledResourceClasses: [],
      deadlineAt: null,
      now: at,
      estimatedMinutes: null,
      requiresMandatoryProof: false,
      proofAvailable: true,
      workerAvailable: null,
      spendAuthorityUsd: 1,
      budgetRemainingUsd: 1,
    }),
  );
  assert.equal(verdict.eligible, true);
});

test("B: controlled merchant with incompatible purpose is not fulfillable", () => {
  assert.equal(
    externalOfferingAcceptsPurpose({
      serviceId: "founder_narrative_pulse",
      purpose: "Measure conversion uplift and causal attribution from A/B tests",
    }),
    false,
  );
  const { offerings } = groundRegistryOfferings({
    registry: VERIFIED_SERVICE_REGISTRY,
    discovered: SNAPSHOT_OFFERINGS.filter(
      (o) => o.serviceId === "founder_narrative_pulse",
    ),
    requiredResourceClass: "proprietary_data",
    at,
    purpose: "Measure conversion uplift and causal attribution from A/B tests",
  });
  assert.equal(offerings[0]!.executionPathConfigured, true);
  assert.equal(offerings[0]!.purposeScopeCompatible, false);
});

test("B: negated out-of-scope wording does not false-reject a valid qualitative request", () => {
  // Keyword-luck must not punish disclaimers: "do not infer causal uplift" is
  // exactly what the product's own limitation says it does NOT do.
  assert.equal(
    externalOfferingAcceptsPurpose({
      serviceId: "founder_narrative_pulse",
      purpose:
        "Qualitative founder-messaging research for the relaunch; do not infer causal uplift or measured conversion",
      purposeKind: M3_SUPPORTED_PURPOSE_KIND,
      resourceClass: "proprietary_data",
    }),
    true,
  );
  const { offerings } = groundRegistryOfferings({
    registry: VERIFIED_SERVICE_REGISTRY,
    discovered: SNAPSHOT_OFFERINGS.filter(
      (o) => o.serviceId === "founder_narrative_pulse",
    ),
    requiredResourceClass: "proprietary_data",
    at,
    purpose:
      "Qualitative founder-messaging research for the relaunch; do not infer causal uplift or measured conversion",
    purposeKind: M3_SUPPORTED_PURPOSE_KIND,
  });
  assert.equal(offerings[0]!.purposeScopeCompatible, true);
});

test("B: structured purposeKind is the fulfillment authority — no prose scraping needed", () => {
  // Terse, domain-keyword-free request: accepted on the typed declaration.
  assert.equal(
    externalOfferingAcceptsPurpose({
      serviceId: "founder_narrative_pulse",
      purpose: "Deliver the recorded input for this authorized need.",
      purposeKind: M3_SUPPORTED_PURPOSE_KIND,
      resourceClass: "proprietary_data",
    }),
    true,
  );
  // A typed kind the product does not declare is refused even with benign prose.
  assert.equal(
    externalOfferingAcceptsPurpose({
      serviceId: "founder_narrative_pulse",
      purpose: "Deliver the recorded input for this authorized need.",
      purposeKind: "quantitative_conversion_measurement",
      resourceClass: "proprietary_data",
    }),
    false,
  );
  // A class the product does not sell is refused even with a matching kind.
  assert.equal(
    externalOfferingAcceptsPurpose({
      serviceId: "founder_narrative_pulse",
      purpose: "Deliver the recorded input for this authorized need.",
      purposeKind: M3_SUPPORTED_PURPOSE_KIND,
      resourceClass: "privileged_access",
    }),
    false,
  );
  // Structured acceptance still cannot launder an affirmative out-of-scope
  // claim: the product does not sell it, kind or no kind.
  assert.equal(
    externalOfferingAcceptsPurpose({
      serviceId: "founder_narrative_pulse",
      purpose: "Measure conversion uplift from A/B tests for the founder launch",
      purposeKind: M3_SUPPORTED_PURPOSE_KIND,
      resourceClass: "proprietary_data",
    }),
    false,
  );
});
