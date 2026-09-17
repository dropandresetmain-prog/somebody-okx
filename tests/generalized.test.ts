import test from "node:test";
import assert from "node:assert/strict";
import { createMission, fixtureEvidence } from "../lib/procurement/fixtures";
import {
  applyCommand,
  communicationState,
  effectForExecution,
  evaluate,
  evidenceId,
  ingestEvidence,
  rankSuppliers,
} from "../lib/procurement/domain";
import type {
  EvidenceInput,
  EvidenceProvider,
  Mission,
  Quote,
} from "../lib/procurement/types";

const now = 1800000000000;

function sourcing(budgetCents = 75000) {
  const m = createMission("gen", "Sponsor gifts for Thursday", now);
  applyCommand(
    m,
    {
      type: "answer_requirements",
      quantity: 25,
      budgetCents,
      deadlineAt: now + 3 * 86400000,
      branded: true,
    },
    now,
  );
  return m;
}

function completeClaims(m: Mission, overrides: Partial<Quote> = {}): Quote {
  return {
    unitCents: 2000,
    setupCents: 0,
    deliveryCents: 2000,
    taxCents: 0,
    quantity: m.requirements.quantity!,
    moq: 10,
    stock: 100,
    deliveryAt: m.requirements.deadlineAt! - 3600000,
    branded: true,
    currency: "SGD",
    ...overrides,
  };
}

function observation(
  m: Mission,
  vendorId: string,
  observationId: string,
  claims: Partial<Quote>,
  extras: Partial<EvidenceInput> = {},
): EvidenceInput {
  const configured = m.vendors.find((v) => v.id === vendorId)!;
  const provider: EvidenceProvider =
    configured.channel === "Web"
      ? "web"
      : configured.channel === "Gmail"
        ? "gmail"
        : configured.channel === "WhatsApp"
          ? "whatsapp"
          : "instagram";
  return {
    vendorId,
    source: `${provider} observation`,
    authority: configured.channel === "Web" ? "catalogue" : "vendor",
    revision: 1,
    observedAt: now,
    text: "Normalized supplier observation",
    claims,
    provenance: {
      provider,
      channel: configured.channel,
      observationId,
      parentId: `${provider}-thread-${vendorId}`,
      observedAt: now,
      retrievedAt: now,
      sourceLabel: `${configured.channel} observation`,
    },
    ...extras,
  };
}

function ingestAllComplete(
  m: Mission,
  prices: Record<string, Partial<Quote>>,
) {
  for (const vendor of m.vendors) {
    applyCommand(m, { type: "request_quote", vendorId: vendor.id }, now);
    applyCommand(
      m,
      {
        type: "ingest_external_evidence",
        evidence: observation(
          m,
          vendor.id,
          `${vendor.id}:complete`,
          completeClaims(m, prices[vendor.id] ?? {}),
        ),
      },
      now,
    );
  }
}

test("Gmail, WhatsApp, or Instagram can each win from evidence alone", () => {
  const winners: Record<string, string> = {
    studio: "Gmail",
    express: "WhatsApp",
    social: "Instagram",
  };
  for (const [winnerId, channel] of Object.entries(winners)) {
    const m = sourcing();
    ingestAllComplete(m, {
      catalogue: { unitCents: 1400, deliveryAt: m.requirements.deadlineAt! + 1 },
      studio: { unitCents: winnerId === "studio" ? 1600 : 2400 },
      express: { unitCents: winnerId === "express" ? 1600 : 2400 },
      social: { unitCents: winnerId === "social" ? 1600 : 2400 },
    });
    assert.equal(m.ranking.topVendorId, winnerId, `${channel} should win`);
    applyCommand(
      m,
      {
        type: "recommend",
        vendorId: winnerId,
        rationale: "Lowest eligible landed cost under current evidence",
      },
      now,
    );
    assert.equal(m.recommendation?.vendorId, winnerId);
  }
});

test("later authoritative evidence changes the winner without erasing history", () => {
  const m = sourcing();
  ingestAllComplete(m, {
    catalogue: { unitCents: 1400, deliveryAt: m.requirements.deadlineAt! + 1 },
    studio: { unitCents: 2400 },
    express: { unitCents: 1800, deliveryCents: 1500 },
    social: { unitCents: 2900, deliveryCents: 3000 },
  });
  assert.equal(m.ranking.topVendorId, "express");
  applyCommand(
    m,
    {
      type: "recommend",
      vendorId: "express",
      rationale: "Lowest eligible landed cost",
    },
    now,
  );
  const previous = m.recommendation!;
  const history = m.evidence.length;
  applyCommand(
    m,
    {
      type: "ingest_external_evidence",
      evidence: observation(
        m,
        "express",
        "express:deadline-correction",
        { deliveryAt: m.requirements.deadlineAt! + 86400000 },
        { revision: 3, text: "Delivery now misses the deadline." },
      ),
    },
    now + 100,
  );
  assert.equal(m.state, "sourcing");
  assert.equal(m.recommendation, null);
  assert.equal(m.evidence.length, history + 1);
  assert.equal(evaluate(m, "express").status, "ineligible");
  assert.equal(evaluate(m, "express").quote.unitCents, 1800);
  assert.equal(m.ranking.topVendorId, "studio");
  assert.throws(() =>
    applyCommand(
      m,
      { type: "approve", recommendationVersion: previous.version },
      now,
    ),
  );
});

test("cheapest supplier missing delivery evidence cannot win", () => {
  const m = sourcing();
  applyCommand(m, { type: "request_quote", vendorId: "express" }, now);
  applyCommand(m, { type: "request_quote", vendorId: "studio" }, now);
  applyCommand(
    m,
    {
      type: "ingest_external_evidence",
      evidence: observation(m, "express", "express:cheap-incomplete", {
        unitCents: 1000,
        setupCents: 0,
        deliveryCents: 0,
        taxCents: 0,
        quantity: 25,
        moq: 10,
        stock: 100,
        branded: true,
        currency: "SGD",
      }),
    },
    now,
  );
  applyCommand(
    m,
    {
      type: "ingest_external_evidence",
      evidence: observation(
        m,
        "studio",
        "studio:complete",
        completeClaims(m, { unitCents: 2400 }),
      ),
    },
    now,
  );
  applyCommand(m, { type: "request_quote", vendorId: "social" }, now);
  applyCommand(m, { type: "request_quote", vendorId: "catalogue" }, now);
  applyCommand(
    m,
    {
      type: "ingest_external_evidence",
      evidence: observation(
        m,
        "social",
        "social:complete",
        completeClaims(m, { unitCents: 2900 }),
      ),
    },
    now,
  );
  applyCommand(
    m,
    {
      type: "ingest_external_evidence",
      evidence: observation(
        m,
        "catalogue",
        "catalogue:late",
        completeClaims(m, {
          unitCents: 1400,
          deliveryAt: m.requirements.deadlineAt! + 1,
        }),
      ),
    },
    now,
  );
  assert.equal(evaluate(m, "express").status, "needs_clarification");
  assert.ok(evaluate(m, "express").missing.includes("deliveryAt"));
  assert.notEqual(m.ranking.topVendorId, "express");
  assert.throws(() =>
    applyCommand(
      m,
      { type: "recommend", vendorId: "express", rationale: "Cheapest headline" },
      now,
    ),
  );
});

test("MOQ raises purchase quantity without changing the required quantity", () => {
  const m = sourcing(50000);
  applyCommand(m, { type: "request_quote", vendorId: "studio" }, now);
  applyCommand(
    m,
    {
      type: "ingest_external_evidence",
      evidence: observation(
        m,
        "studio",
        "studio:moq-ok",
        completeClaims(m, {
          unitCents: 1300,
          moq: 30,
          stock: 40,
          deliveryCents: 1000,
          setupCents: 0,
          taxCents: 0,
        }),
      ),
    },
    now,
  );
  const evaluation = evaluate(m, "studio");
  assert.equal(m.requirements.quantity, 25);
  assert.equal(evaluation.requiredQuantity, 25);
  assert.equal(evaluation.orderQuantity, 30);
  assert.equal(evaluation.totalCents, 30 * 1300 + 1000);
  assert.equal(evaluation.status, "eligible");
});

test("MOQ can make a supplier ineligible when the effective landed cost exceeds budget", () => {
  const m = sourcing(39999);
  applyCommand(
    m,
    {
      type: "ingest_external_evidence",
      evidence: observation(
        m,
        "studio",
        "studio:moq-over",
        completeClaims(m, {
          unitCents: 1300,
          moq: 30,
          stock: 40,
          deliveryCents: 1000,
        }),
      ),
    },
    now,
  );
  const evaluation = evaluate(m, "studio");
  assert.equal(evaluation.orderQuantity, 30);
  assert.equal(evaluation.totalCents, 30 * 1300 + 1000);
  assert.equal(evaluation.status, "ineligible");
  assert.ok(evaluation.reasons.some((reason) => reason.includes("budget")));
});

test("no viable option is recorded without inventing a recommendation or commitment", () => {
  const m = sourcing();
  ingestAllComplete(m, {
    catalogue: { deliveryAt: m.requirements.deadlineAt! + 1 },
    studio: { deliveryAt: m.requirements.deadlineAt! + 1 },
    express: { deliveryAt: m.requirements.deadlineAt! + 1 },
    social: { deliveryAt: m.requirements.deadlineAt! + 1 },
  });
  assert.equal(m.ranking.noViableOption, true);
  assert.equal(m.ranking.topVendorId, null);
  assert.throws(() =>
    applyCommand(
      m,
      { type: "recommend", vendorId: "express", rationale: "Invent a winner" },
      now,
    ),
  );
  applyCommand(
    m,
    {
      type: "record_no_viable_option",
      reason: "Every complete supplier misses the receiving deadline.",
    },
    now,
  );
  assert.equal(m.recommendation, null);
  assert.equal(m.effects.filter((e) => e.gated).length, 0);
  assert.ok(m.noViableOption);
  assert.equal(m.state, "sourcing");
});

test("application rejects recommending a lower-ranked eligible supplier", () => {
  const m = sourcing();
  ingestAllComplete(m, {
    catalogue: { deliveryAt: m.requirements.deadlineAt! + 1 },
    studio: { unitCents: 2400 },
    express: { unitCents: 1800 },
    social: { unitCents: 2900, deliveryCents: 3000 },
  });
  assert.equal(m.ranking.topVendorId, "express");
  assert.ok(m.ranking.rankedVendorIds.includes("studio"));
  assert.throws(
    () =>
      applyCommand(
        m,
        {
          type: "recommend",
          vendorId: "studio",
          rationale: "Prefer a familiar supplier",
        },
        now,
      ),
    /higher-ranked/,
  );
});

test("duplicate external evidence identity is idempotent and content reuse fails closed", () => {
  const m = sourcing();
  const first = observation(
    m,
    "studio",
    "gmail-msg-1",
    completeClaims(m, { unitCents: 2400 }),
  );
  ingestEvidence(m, first);
  ingestEvidence(m, first);
  assert.equal(m.evidence.length, 1);
  assert.equal(m.evidence[0]?.id, evidenceId(first));
  assert.throws(() =>
    ingestEvidence(m, { ...first, claims: { ...first.claims, unitCents: 2500 } }),
  );
  assert.equal(m.evidence.length, 1);
});

test("higher-revision evidence supersedes only affected claims; equal revisions stay unresolved", () => {
  const m = sourcing();
  ingestEvidence(
    m,
    observation(m, "express", "wa-1", completeClaims(m, { unitCents: 1800 })),
  );
  ingestEvidence(
    m,
    observation(
      m,
      "express",
      "wa-2",
      { deliveryAt: m.requirements.deadlineAt! + 86400000 },
      { revision: 2, text: "Delivery slipped." },
    ),
  );
  assert.equal(evaluate(m, "express").quote.unitCents, 1800);
  assert.equal(evaluate(m, "express").status, "ineligible");
  ingestEvidence(
    m,
    observation(
      m,
      "express",
      "wa-3",
      { unitCents: 1800 },
      { revision: 2, text: "Price restated." },
    ),
  );
  ingestEvidence(
    m,
    observation(
      m,
      "express",
      "wa-4",
      { unitCents: 1900 },
      { revision: 2, text: "Conflicting price at the same revision." },
    ),
  );
  assert.deepEqual(evaluate(m, "express").conflicts, ["unitCents"]);
  assert.equal(evaluate(m, "express").totalCents, null);
});

test("unverified provider success is not verified external contact", () => {
  const m = sourcing();
  applyCommand(m, { type: "request_quote", vendorId: "social" }, now);
  assert.equal(communicationState(m, "social"), "pending");
  const rfq = m.effects.find((e) => e.targetId === "social" && e.kind === "rfq")!;
  rfq.status = "unverified";
  assert.equal(communicationState(m, "social"), "unverified");
  assert.notEqual(rfq.status, "verified");
});

test("configured opaque endpoints are used and unknown vendors fail closed", () => {
  const m = sourcing();
  const studio = m.vendors.find((v) => v.id === "studio")!;
  assert.notEqual(studio.endpointRef, `fixture:${studio.id}`);
  applyCommand(m, { type: "request_quote", vendorId: "studio" }, now);
  const rfq = m.effects.find((e) => e.kind === "rfq")!;
  assert.equal(rfq.endpointRef, studio.endpointRef);
  assert.equal(effectForExecution(m, rfq.key).endpointRef, studio.endpointRef);
  studio.endpointRef = "dev.gmail.rotated-binding";
  assert.throws(() => effectForExecution(m, rfq.key), /Recipient binding/);
  assert.throws(() =>
    applyCommand(m, { type: "request_quote", vendorId: "unknown" }, now),
  );
});

test("ranking is deterministic for equal landed cost", () => {
  const m = sourcing();
  ingestAllComplete(m, {
    catalogue: { deliveryAt: m.requirements.deadlineAt! + 1 },
    studio: { unitCents: 2000, deliveryCents: 2000 },
    express: { unitCents: 2000, deliveryCents: 2000 },
    social: { unitCents: 2900 },
  });
  const ranking = rankSuppliers(m);
  assert.deepEqual(ranking.rankedVendorIds.slice(0, 2), ["express", "studio"]);
  assert.equal(ranking.topVendorId, "express");
});

test("fixture helpers may name scenarios but request_quote does not manufacture evidence", () => {
  const m = sourcing();
  applyCommand(m, { type: "request_quote", vendorId: "express" }, now);
  assert.equal(m.evidence.length, 0);
  assert.equal(evaluate(m, "express").status, "waiting");
  const named = fixtureEvidence(m, "express", "initial", now);
  applyCommand(
    m,
    { type: "ingest_external_evidence", evidence: named },
    now,
  );
  assert.equal(m.evidence[0]?.provenance.provider, "fixture");
  assert.equal(m.evidence[0]?.id, "fixture:express:initial");
});

test("vendor communication follows the latest outbound effect, not the highest historical status", () => {
  const m = sourcing();
  applyCommand(m, { type: "request_quote", vendorId: "studio" }, now);
  const rfq = m.effects.find((e) => e.kind === "rfq" && e.targetId === "studio")!;
  rfq.status = "verified";
  assert.equal(communicationState(m, "studio"), "verified");
  applyCommand(
    m,
    {
      type: "clarify_quote",
      vendorId: "studio",
      question: "Confirm delivery and fees",
    },
    now,
  );
  const clarification = m.effects.find(
    (e) => e.kind === "clarification" && e.targetId === "studio",
  )!;
  assert.equal(communicationState(m, "studio"), "pending");
  assert.equal(rfq.status, "verified");
  clarification.status = "attempted";
  assert.equal(communicationState(m, "studio"), "attempted");
  clarification.status = "unverified";
  assert.equal(communicationState(m, "studio"), "unverified");
  clarification.status = "verified";
  assert.equal(communicationState(m, "studio"), "verified");
  assert.equal(rfq.status, "verified");
});

test("evidence provenance must match the configured vendor channel", () => {
  const m = sourcing();
  const valid = [
    ["catalogue", "web", "Web"],
    ["studio", "gmail", "Gmail"],
    ["express", "whatsapp", "WhatsApp"],
    ["social", "instagram", "Instagram"],
  ] as const;
  for (const [vendorId, provider, channel] of valid) {
    ingestEvidence(
      m,
      observation(m, vendorId, `${provider}-ok`, { unitCents: 1800 }, {
        provenance: {
          provider,
          channel,
          observationId: `${provider}-ok`,
          observedAt: now,
        },
      }),
    );
  }
  assert.equal(m.evidence.length, 4);
  ingestEvidence(
    m,
    observation(m, "studio", "fixture-ok", { unitCents: 1800 }, {
      provenance: {
        provider: "fixture",
        channel: "Gmail",
        observationId: "fixture-ok",
        observedAt: now,
      },
    }),
  );
  assert.throws(
    () =>
      ingestEvidence(
        m,
        observation(m, "express", "gmail-on-whatsapp", { unitCents: 1800 }, {
          provenance: {
            provider: "gmail",
            channel: "Gmail",
            observationId: "gmail-on-whatsapp",
            observedAt: now,
          },
        }),
      ),
    /channel/,
  );
  assert.throws(
    () =>
      ingestEvidence(
        m,
        observation(m, "studio", "fixture-wrong-channel", { unitCents: 1800 }, {
          provenance: {
            provider: "fixture",
            channel: "WhatsApp",
            observationId: "fixture-wrong-channel",
            observedAt: now,
          },
        }),
      ),
    /channel/,
  );
  assert.throws(
    () =>
      ingestEvidence(
        m,
        observation(m, "studio", "provider-mismatch", { unitCents: 1800 }, {
          provenance: {
            provider: "whatsapp",
            channel: "Gmail",
            observationId: "provider-mismatch",
            observedAt: now,
          },
        }),
      ),
    /provider|channel/,
  );
  assert.equal(m.evidence.length, 5);
});
