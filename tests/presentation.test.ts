import test from "node:test";
import assert from "node:assert/strict";
import { createMission, fixtureEvidence } from "../lib/procurement/fixtures";
import { applyCommand } from "../lib/procurement/domain";
import type { EvidenceInput, Mission } from "../lib/procurement/types";
import { defaultCatalogueSource } from "../lib/web/catalogueSource";
import {
  changedFacts,
  cleanError,
  headline,
  humanize,
  jobStages,
  latestChange,
  reasonCopy,
  selectedVendorId,
  vendorStatus,
} from "../app/somebody/presentation";

// The presentation layer only renders persisted domain state. These tests drive
// the real domain and check the words/tones Somebody shows for each moment.

const now = 1800000000000;
let clock = now;
const tick = () => (clock += 1000);

function sourcing(budgetCents = 75000) {
  clock = now;
  const m = createMission("ui", "Sponsor gifts for Thursday", now);
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
/** Web-shaped catalogue stand-in. Fixtures are refused for the Web vendor. */
function catalogueEvidence(m: Mission, observedAt: number): EvidenceInput {
  const source = defaultCatalogueSource();
  const deadline = m.requirements.deadlineAt!;
  const quantity = m.requirements.quantity!;
  return {
    vendorId: "catalogue",
    source: `${source.supplierName} public catalogue`,
    authority: "catalogue",
    revision: 1,
    observedAt,
    text: `${source.productName}: domain-test complete quote stand-in for presentation.`,
    claims: {
      unitCents: 1400,
      setupCents: 0,
      deliveryCents: 2500,
      taxCents: 0,
      quantity,
      moq: 50,
      stock: 100,
      deliveryAt: deadline + 86400000,
      branded: true,
      currency: "SGD",
    },
    provenance: {
      provider: "web",
      channel: "Web",
      observationId: `catalogue:${observedAt}`,
      parentId: `web:source:${source.productUrl}`,
      url: source.productUrl,
      observedAt,
      retrievedAt: observedAt,
      sourceLabel: `${source.supplierName} / ${source.productName}`,
    },
  };
}
function observe(m: Mission, vendorId: string, stage: "initial" | "clarification" | "update") {
  const vendor = m.vendors.find((item) => item.id === vendorId);
  applyCommand(
    m,
    {
      type: "ingest_external_evidence",
      evidence:
        vendor?.channel === "Web"
          ? catalogueEvidence(m, tick())
          : fixtureEvidence(m, vendorId, stage, tick()),
    },
    clock,
  );
}
function toRecommendation() {
  const m = sourcing();
  for (const v of m.vendors) applyCommand(m, { type: "request_quote", vendorId: v.id }, now);
  for (const v of m.vendors) observe(m, v.id, "initial");
  applyCommand(m, { type: "clarify_quote", vendorId: "studio", question: "Fees and delivery?" }, now);
  observe(m, "studio", "clarification");
  return m;
}

test("vendor states read as unknown, waiting, missing, viable and ruled out", () => {
  const m = sourcing();
  assert.equal(vendorStatus(m.vendors[1]!, m).label, "Not contacted yet");
  assert.equal(vendorStatus(m.vendors[0]!, m).label, "Not checked yet");
  applyCommand(m, { type: "request_quote", vendorId: "studio" }, now);
  const studio = m.vendors.find((v) => v.id === "studio")!;
  assert.deepEqual(
    [vendorStatus(studio, m).label, vendorStatus(studio, m).tone],
    ["Waiting for reply", "waiting"],
  );
  observe(m, "studio", "initial");
  assert.equal(vendorStatus(studio, m).label, "Missing details");
  applyCommand(m, { type: "clarify_quote", vendorId: "studio", question: "Fees?" }, now);
  assert.equal(vendorStatus(studio, m).label, "Following up");
  observe(m, "catalogue", "initial");
  const catalogue = m.vendors.find((v) => v.id === "catalogue")!;
  assert.equal(vendorStatus(catalogue, m).tone, "ineligible");
  assert.equal(vendorStatus(catalogue, m).note, "Arrives after the deadline");
});

test("a real correction surfaces as a changed fact; a re-confirmation does not", () => {
  const m = toRecommendation();
  const express = m.vendors.find((v) => v.id === "express")!;
  assert.equal(changedFacts(express, m.evidence).length, 0);
  observe(m, "express", "update");
  const facts = changedFacts(express, m.evidence);
  assert.deepEqual(
    facts.map((f) => f.field),
    ["deliveryAt"],
  );
  assert.equal(latestChange(m)?.vendor.id, "express");
  assert.equal(headline(m).tone, "changed");
  assert.equal(vendorStatus(express, m).label, "Ruled out");
});

test("recommendation, approval and completion map to decision, follow-through and done", () => {
  const m = toRecommendation();
  observe(m, "express", "update");
  applyCommand(
    m,
    { type: "recommend", vendorId: m.ranking.topVendorId!, rationale: "Arrives in time." },
    clock,
  );
  assert.equal(headline(m).eyebrow, "Needs your approval");
  assert.equal(
    jobStages(m).find((s) => s.state === "current")?.id,
    "decision",
  );
  const winner = m.vendors.find((v) => v.id === m.recommendation!.vendorId)!;
  assert.equal(vendorStatus(winner, m).tone, "decision");
  assert.equal(selectedVendorId(m), null, "nothing is selected before approval");

  applyCommand(m, { type: "approve", recommendationVersion: m.recommendation!.version }, clock);
  assert.equal(selectedVendorId(m), winner.id);
  assert.equal(vendorStatus(winner, m).label, "Selected");
  assert.equal(jobStages(m).find((s) => s.state === "current")?.id, "follow");

  m.state = "complete";
  assert.ok(jobStages(m).every((s) => s.state === "done"));
  assert.equal(headline(m).title, "Done and verified.");
});

test("no viable option is shown as stopped, never as a recommendation", () => {
  const m = sourcing(30000);
  for (const v of m.vendors) applyCommand(m, { type: "request_quote", vendorId: v.id }, now);
  for (const v of m.vendors) observe(m, v.id, "initial");
  applyCommand(m, { type: "clarify_quote", vendorId: "studio", question: "Fees?" }, now);
  observe(m, "studio", "clarification");
  applyCommand(m, { type: "record_no_viable_option", reason: "Every option fails." }, clock);
  assert.equal(headline(m).tone, "ineligible");
  assert.equal(jobStages(m)[1]!.state, "stopped");
  assert.ok(m.vendors.every((v) => vendorStatus(v, m).label !== "Recommended"));
});

test("copy helpers humanize known backend strings and pass unknown text through", () => {
  assert.equal(
    humanize("Paper & Pine: external evidence ingested."),
    "Paper & Pine sent new information.",
  );
  assert.equal(
    humanize("purchase_order: verified against independent Development fixture read-back."),
    "Purchase order: verified by reading it back.",
  );
  assert.equal(humanize("Something new from the backend"), "Something new from the backend");
  assert.equal(reasonCopy("A brand new reason"), "A brand new reason");
  assert.equal(
    cleanError(
      "[Request ID: abc] Server Error\nUncaught Error: Uncaught Error: Required effects still need independent verification\n    at assertComplete (../lib/reliability/core.ts:54:0)",
    ),
    "Required effects still need independent verification",
  );
  assert.equal(cleanError("Local Development access only"), "Local Development access only");
});
