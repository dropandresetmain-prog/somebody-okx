/**
 * Focused proof for the public web catalogue seam.
 * Does not run the full Development mission smoke path.
 *
 * Convex: no deployment writes. Local retrieval + domain ingest only.
 */
import assert from "node:assert/strict";
import { createMission } from "../lib/procurement/fixtures";
import { applyCommand, evaluate, ingestEvidence } from "../lib/procurement/domain";
import {
  defaultCatalogueSource,
  sourceCatalogueEvidence,
} from "../lib/web/sourceCatalogueEvidence";

async function main() {
  const now = Date.now();
  const source = defaultCatalogueSource();
  const m = createMission(`web-prove-${now}`, "Sponsor gifts ~S$500 / 25 pax", now);
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

  const first = await sourceCatalogueEvidence(m, "catalogue");
  ingestEvidence(m, first);
  const second = await sourceCatalogueEvidence(m, "catalogue");
  assert.equal(second.provenance.observationId, first.provenance.observationId);
  assert.deepEqual(second, first);
  ingestEvidence(m, second);
  assert.equal(m.evidence.length, 1);

  const evaluation = evaluate(m, "catalogue");
  assert.equal(first.provenance.provider, "web");
  assert.equal(first.provenance.channel, "Web");
  assert.equal(first.provenance.url, source.productUrl);
  assert.ok(first.provenance.retrievedAt);
  assert.equal(evaluation.status, "needs_clarification");

  console.log(
    JSON.stringify(
      {
        result: "PASS",
        supplier: source.supplierName,
        product: source.productName,
        url: first.provenance.url,
        observationId: first.provenance.observationId,
        retrievedAt: first.provenance.retrievedAt,
        claims: first.claims,
        missing: evaluation.missing,
        evaluationStatus: evaluation.status,
        duplicatePolls: 2,
        evidenceCount: m.evidence.length,
      },
      null,
      2,
    ),
  );
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
