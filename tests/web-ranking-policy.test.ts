import test from "node:test";
import assert from "node:assert/strict";
import { createMission, fixtureEvidence } from "../lib/procurement/fixtures";
import {
  applyCommand,
  evaluate,
  ingestEvidence,
  rankSuppliers,
} from "../lib/procurement/domain";
import type { EvidenceInput, Mission, Quote } from "../lib/procurement/types";
import { defaultCatalogueSource } from "../lib/web/catalogueSource";

const now = 1800000000000;

function sourcing(budgetCents = 75000) {
  const m = createMission("web-policy", "Sponsor gifts for Thursday", now);
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

function incompleteWebEvidence(m: Mission, observationId: string): EvidenceInput {
  const source = defaultCatalogueSource();
  return {
    vendorId: "catalogue",
    source: `${source.supplierName} public catalogue`,
    authority: "catalogue",
    revision: 1,
    observedAt: now,
    text: `${source.productName}: public MOQ and branding only.`,
    claims: {
      moq: 30,
      branded: true,
      deliveryCents: 0,
      currency: "SGD",
    },
    provenance: {
      provider: "web",
      channel: "Web",
      observationId,
      parentId: `web:source:${source.productUrl}`,
      url: source.productUrl,
      observedAt: now,
      retrievedAt: now,
      sourceLabel: `${source.supplierName} / ${source.productName}`,
    },
  };
}

function completeWebEvidence(
  m: Mission,
  observationId: string,
  overrides: Partial<Quote> = {},
  revision = 1,
): EvidenceInput {
  const source = defaultCatalogueSource();
  return {
    vendorId: "catalogue",
    source: `${source.supplierName} public catalogue`,
    authority: "catalogue",
    revision,
    observedAt: now,
    text: `${source.productName}: complete catalogue quote.`,
    claims: completeClaims(m, { unitCents: 1400, moq: 30, ...overrides }),
    provenance: {
      provider: "web",
      channel: "Web",
      observationId,
      parentId: `web:source:${source.productUrl}`,
      url: source.productUrl,
      observedAt: now,
      retrievedAt: now,
      sourceLabel: `${source.supplierName} / ${source.productName}`,
    },
  };
}

function completeOutreach(m: Mission, vendorId: string, stage: "initial" | "clarification" = "initial") {
  applyCommand(m, { type: "request_quote", vendorId }, now);
  if (vendorId === "studio" && stage === "initial") {
    applyCommand(
      m,
      {
        type: "ingest_external_evidence",
        evidence: fixtureEvidence(m, vendorId, "initial", now),
      },
      now,
    );
    return;
  }
  applyCommand(
    m,
    {
      type: "ingest_external_evidence",
      evidence: fixtureEvidence(m, vendorId, stage, now),
    },
    now,
  );
}

function finishStudio(m: Mission) {
  completeOutreach(m, "studio", "initial");
  applyCommand(
    m,
    {
      type: "clarify_quote",
      vendorId: "studio",
      question: "Confirm fees and delivery",
    },
    now,
  );
  applyCommand(
    m,
    {
      type: "ingest_external_evidence",
      evidence: fixtureEvidence(m, "studio", "clarification", now),
    },
    now,
  );
}

test("Web vendor with zero evidence blocks recommendation", () => {
  const m = sourcing();
  finishStudio(m);
  completeOutreach(m, "express");
  completeOutreach(m, "social");
  applyCommand(m, { type: "request_quote", vendorId: "catalogue" }, now);
  assert.equal(evaluate(m, "catalogue").status, "waiting");
  assert.ok(m.ranking.incompleteVendorIds.includes("catalogue"));
  assert.equal(m.ranking.topVendorId, "express");
  assert.throws(
    () =>
      applyCommand(
        m,
        {
          type: "recommend",
          vendorId: "express",
          rationale: "Lowest landed cost among complete quotes",
        },
        now,
      ),
    /Collect and clarify/,
  );
});

test("incomplete Web with real evidence does not block once contactable quotes are complete", () => {
  const m = sourcing();
  finishStudio(m);
  completeOutreach(m, "express");
  completeOutreach(m, "social");
  applyCommand(m, { type: "request_quote", vendorId: "catalogue" }, now);
  ingestEvidence(m, incompleteWebEvidence(m, "catalogue:partial"));
  assert.equal(evaluate(m, "catalogue").status, "needs_clarification");
  assert.ok(!m.ranking.incompleteVendorIds.includes("catalogue"));
  assert.equal(m.ranking.topVendorId, "express");
  applyCommand(
    m,
    {
      type: "recommend",
      vendorId: "express",
      rationale: "Lowest complete eligible landed cost",
    },
    now,
  );
  assert.equal(m.state, "awaiting_approval");
  assert.equal(m.recommendation?.vendorId, "express");
});

test("incomplete Gmail still blocks recommendation", () => {
  const m = sourcing();
  applyCommand(m, { type: "request_quote", vendorId: "studio" }, now);
  applyCommand(
    m,
    {
      type: "ingest_external_evidence",
      evidence: fixtureEvidence(m, "studio", "initial", now),
    },
    now,
  );
  completeOutreach(m, "express");
  completeOutreach(m, "social");
  applyCommand(m, { type: "request_quote", vendorId: "catalogue" }, now);
  ingestEvidence(m, incompleteWebEvidence(m, "catalogue:partial-gmail-block"));
  assert.equal(evaluate(m, "studio").status, "needs_clarification");
  assert.ok(m.ranking.incompleteVendorIds.includes("studio"));
  assert.ok(!m.ranking.incompleteVendorIds.includes("catalogue"));
  assert.throws(
    () =>
      applyCommand(
        m,
        {
          type: "recommend",
          vendorId: "express",
          rationale: "Should wait for Gmail clarification",
        },
        now,
      ),
    /Collect and clarify/,
  );
});

test("complete eligible Web vendor can win ranking", () => {
  const m = sourcing();
  finishStudio(m);
  completeOutreach(m, "express");
  completeOutreach(m, "social");
  applyCommand(m, { type: "request_quote", vendorId: "catalogue" }, now);
  ingestEvidence(
    m,
    completeWebEvidence(m, "catalogue:complete-win", { unitCents: 1000 }),
  );
  assert.equal(evaluate(m, "catalogue").status, "eligible");
  assert.equal(rankSuppliers(m).topVendorId, "catalogue");
  applyCommand(
    m,
    {
      type: "recommend",
      vendorId: "catalogue",
      rationale: "Lowest complete eligible landed cost from the catalogue",
    },
    now,
  );
  assert.equal(m.recommendation?.vendorId, "catalogue");
});

test("new Web evidence after recommendation invalidates and reranks", () => {
  const m = sourcing();
  finishStudio(m);
  completeOutreach(m, "express");
  completeOutreach(m, "social");
  applyCommand(m, { type: "request_quote", vendorId: "catalogue" }, now);
  ingestEvidence(m, incompleteWebEvidence(m, "catalogue:partial-then-update"));
  applyCommand(
    m,
    {
      type: "recommend",
      vendorId: "express",
      rationale: "Best complete option while catalogue is incomplete",
    },
    now,
  );
  assert.equal(m.state, "awaiting_approval");
  ingestEvidence(
    m,
    completeWebEvidence(
      m,
      "catalogue:complete-after-rec",
      { unitCents: 900, moq: 30 },
      2,
    ),
  );
  assert.equal(m.state, "sourcing");
  assert.equal(m.recommendation, null);
  assert.equal(evaluate(m, "catalogue").status, "eligible");
  assert.equal(m.ranking.topVendorId, "catalogue");
});

test("no-viable-option is not concluded solely because unresolved Web evidence is incomplete", () => {
  const m = sourcing(10000);
  // Contactable vendors complete but over budget / late → ineligible.
  finishStudio(m);
  completeOutreach(m, "express");
  completeOutreach(m, "social");
  applyCommand(m, { type: "request_quote", vendorId: "catalogue" }, now);
  ingestEvidence(m, incompleteWebEvidence(m, "catalogue:partial-nvo"));
  assert.equal(evaluate(m, "catalogue").status, "needs_clarification");
  assert.equal(m.ranking.rankedVendorIds.length, 0);
  assert.equal(m.ranking.noViableOption, false);
  assert.throws(
    () =>
      applyCommand(
        m,
        {
          type: "record_no_viable_option",
          reason: "Must not claim exhaustion while Web is unresolved",
        },
        now,
      ),
    /eligible supplier still exists|Collect and clarify|no viable/i,
  );
});
