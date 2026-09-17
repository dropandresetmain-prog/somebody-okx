import assert from "node:assert/strict";
import test from "node:test";
import {
  createMission,
  fixtureEvidence,
} from "../lib/procurement/fixtures";
import { applyCommand, evaluate, ingestEvidence } from "../lib/procurement/domain";
import type { EvidenceInput, Quote } from "../lib/procurement/types";
import {
  defaultCatalogueSource,
  extractCatalogueFacts,
  htmlToExtractableText,
  materialFingerprint,
  resolveCatalogueSearch,
  searchCatalogueSources,
  sourceCatalogueEvidence,
  webObservationId,
  webParentId,
} from "../lib/web/sourceCatalogueEvidence";

const now = Date.UTC(2026, 8, 14, 4, 0, 0);

function missionReady() {
  const m = createMission("web-proof", "Sponsor gifts for Thursday", now);
  applyCommand(
    m,
    {
      type: "answer_requirements",
      quantity: 25,
      budgetCents: 50000,
      deadlineAt: now + 3 * 86400000,
      branded: true,
    },
    now,
  );
  return m;
}

test("narrow catalogue search resolves the configured Patma tumbler", () => {
  const hits = searchCatalogueSources(
    "branded insulated stainless steel tumbler 500ml Singapore",
  );
  assert.equal(hits.length, 1);
  assert.equal(hits[0]?.supplierName, "Patma");
  assert.ok(
    resolveCatalogueSearch("chibi tumbler corporate gift")?.productUrl.includes(
      "patma.com.sg",
    ),
  );
  assert.equal(searchCatalogueSources("unrelated avocado catering").length, 0);
});

test("extractor keeps price ranges and unset fields absent", () => {
  const source = defaultCatalogueSource();
  const sample = `
    Chibi Stainless Steel Vacuum Tumbler – 500ml
    Price range: $8.18 through $14.48
    Highlights: 1 Colour silkscreen x 1 position only
    Free Delivery in Singapore Only (One Location)
    Prices quoted are before GST
    Min 30 pcs – Max 1000 pcs
    In Stock
    Printing Option: Silk Screen / UV DTF / UV Sticker / Laser Engraving
  `;
  const extracted = extractCatalogueFacts(source, sample);
  assert.equal(extracted.claims.moq, 30);
  assert.equal(extracted.claims.branded, true);
  assert.equal(extracted.claims.deliveryCents, 0);
  assert.equal(extracted.claims.currency, "SGD");
  assert.equal(extracted.claims.unitCents, undefined);
  assert.equal(extracted.claims.setupCents, undefined);
  assert.equal(extracted.claims.taxCents, undefined);
  assert.equal(extracted.claims.stock, undefined);
  assert.equal(extracted.claims.quantity, undefined);
  assert.equal(extracted.claims.deliveryAt, undefined);
  assert.ok(extracted.absent.includes("unitCents"));
  assert.ok(extracted.text.includes("S$8.18"));
  assert.ok(extracted.text.includes("S$14.48"));
});

test("observation identity is stable for the same material source", () => {
  const url = defaultCatalogueSource().productUrl;
  const claims: Partial<Quote> = { moq: 30, branded: true, currency: "SGD" };
  const text = "same material";
  const a = materialFingerprint(url, claims, text);
  const b = materialFingerprint(url, claims, text);
  assert.equal(a, b);
  assert.equal(webObservationId(url, a), webObservationId(url, b));
  assert.equal(webParentId(url), webParentId(url));
  const changed = materialFingerprint(url, { ...claims, moq: 50 }, text);
  assert.notEqual(a, changed);
});

test("htmlToExtractableText drops scripts and keeps product markers", () => {
  const text = htmlToExtractableText(`
    <html><head><script>evil()</script><style>.x{}</style></head>
    <body><h1>Chibi Stainless Steel Vacuum Tumbler</h1><p>Min 30 pcs</p></body></html>
  `);
  assert.ok(text.includes("Chibi"));
  assert.ok(text.includes("Min 30 pcs"));
  assert.ok(!text.includes("evil"));
});

test("web evidence passes provider/channel guard and duplicate ingest is idempotent", () => {
  const m = missionReady();
  const url = defaultCatalogueSource().productUrl;
  const claims: Partial<Quote> = {
    moq: 30,
    branded: true,
    deliveryCents: 0,
    currency: "SGD",
  };
  const text =
    "Patma: Chibi Stainless Steel Vacuum Tumbler – 500ml. Public MOQ: 30 pcs.";
  const fp = materialFingerprint(url, claims, text);
  const evidence: EvidenceInput = {
    vendorId: "catalogue",
    source: "Patma public catalogue",
    authority: "catalogue",
    revision: 1,
    observedAt: now,
    text,
    claims,
    provenance: {
      provider: "web",
      channel: "Web",
      observationId: webObservationId(url, fp),
      parentId: webParentId(url),
      url,
      observedAt: now,
      retrievedAt: now,
      sourceLabel: "Patma / Chibi Stainless Steel Vacuum Tumbler – 500ml",
    },
  };
  ingestEvidence(m, evidence);
  assert.equal(m.evidence.length, 1);
  assert.equal(m.evidence[0]?.provenance.provider, "web");
  assert.equal(m.evidence[0]?.provenance.channel, "Web");
  assert.equal(m.evidence[0]?.provenance.url, url);
  assert.equal(m.evidence[0]?.provenance.retrievedAt, now);
  assert.equal(evaluate(m, "catalogue").status, "needs_clarification");
  assert.ok(evaluate(m, "catalogue").missing.includes("unitCents"));
  assert.ok(evaluate(m, "catalogue").missing.includes("deliveryAt"));

  ingestEvidence(m, evidence);
  assert.equal(m.evidence.length, 1);

  const changedText = `${text} Updated public copy.`;
  const changedFp = materialFingerprint(url, claims, changedText);
  ingestEvidence(m, {
    ...evidence,
    revision: 2,
    text: changedText,
    provenance: {
      ...evidence.provenance,
      observationId: webObservationId(url, changedFp),
      observedAt: now + 1000,
      retrievedAt: now + 1000,
    },
  });
  assert.equal(m.evidence.length, 2);
  assert.equal(
    m.evidence.map((item) => item.id).length,
    new Set(m.evidence.map((item) => item.id)).size,
  );
});

test("fixtureEvidence refuses the Web catalogue vendor", () => {
  const m = missionReady();
  assert.throws(
    () => fixtureEvidence(m, "catalogue", "initial", now),
    /public web retrieval/,
  );
});

test("sourceCatalogueEvidence normalizes a live public page", async () => {
  const m = missionReady();
  const evidence = await sourceCatalogueEvidence(m, "catalogue");
  assert.equal(evidence.provenance.provider, "web");
  assert.equal(evidence.provenance.channel, "Web");
  assert.ok(evidence.provenance.url?.startsWith("https://patma.com.sg/"));
  assert.ok(evidence.provenance.retrievedAt);
  assert.ok(evidence.provenance.observationId.startsWith("web:"));
  assert.ok(evidence.text.includes("Patma"));
  assert.ok(evidence.text.includes("Chibi"));
  assert.equal(evidence.claims.moq, 30);
  assert.equal(evidence.claims.branded, true);
  assert.equal(evidence.claims.deliveryCents, 0);
  assert.equal(evidence.claims.currency, "SGD");
  assert.equal(evidence.claims.unitCents, undefined);
  assert.equal(evidence.claims.deliveryAt, undefined);
  assert.equal(evidence.claims.stock, undefined);
  assert.equal(evidence.claims.taxCents, undefined);
  assert.equal(evidence.claims.setupCents, undefined);
  assert.equal(evidence.claims.quantity, undefined);

  ingestEvidence(m, evidence);
  assert.equal(evaluate(m, "catalogue").status, "needs_clarification");

  const again = await sourceCatalogueEvidence(m, "catalogue");
  assert.equal(again.provenance.observationId, evidence.provenance.observationId);
  assert.deepEqual(again, evidence);
  ingestEvidence(m, again);
  assert.equal(m.evidence.length, 1);
});
