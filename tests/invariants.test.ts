import test from "node:test";
import assert from "node:assert/strict";
import { createMission, fixtureEvidence } from "../lib/procurement/fixtures";
import {
  applyCommand,
  communicationState,
  contract,
  effectForExecution,
  evaluate,
  ingestEvidence,
  refreshDerived,
} from "../lib/procurement/domain";
import {
  assertComplete,
  authorizeEffect,
  transition,
  verifyReceipt,
} from "../lib/reliability/core";
import { agentCommandSchema, commandSchema } from "../lib/procurement/commands";
import {
  providerConfiguration,
  runProcurementAgent,
} from "../lib/agent/procurement";
import { Usage, type Model } from "@openai/agents";
import type { EvidenceInput, Mission } from "../lib/procurement/types";
import { defaultCatalogueSource } from "../lib/web/catalogueSource";
const now = 1800000000000;
function sourcing() {
  const m = createMission(
    "test",
    "Please sort gifts for our sponsor event",
    now,
  );
  applyCommand(
    m,
    {
      type: "answer_requirements",
      quantity: 25,
      budgetCents: 75000,
      deadlineAt: now + 3 * 86400000,
      branded: true,
    },
    now,
  );
  return m;
}
/** Domain-test stand-in: complete web-shaped catalogue evidence (not live fetch). */
function catalogueDomainEvidence(m: Mission, stage: "initial"): EvidenceInput {
  const source = defaultCatalogueSource();
  const deadline = m.requirements.deadlineAt!;
  const quantity = m.requirements.quantity!;
  return {
    vendorId: "catalogue",
    source: `${source.supplierName} public catalogue`,
    authority: "catalogue",
    revision: 1,
    observedAt: now,
    text: `${source.productName}: domain-test complete quote stand-in for ranking invariants.`,
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
      observationId: `catalogue:${stage}`,
      parentId: `web:source:${source.productUrl}`,
      url: source.productUrl,
      observedAt: now,
      retrievedAt: now,
      sourceLabel: `${source.supplierName} / ${source.productName}`,
    },
  };
}
function collect(m: ReturnType<typeof sourcing>, vendorId: string) {
  applyCommand(m, { type: "request_quote", vendorId }, now);
  applyCommand(
    m,
    {
      type: "ingest_external_evidence",
      evidence:
        vendorId === "catalogue"
          ? catalogueDomainEvidence(m, "initial")
          : fixtureEvidence(m, vendorId, "initial", now),
    },
    now,
  );
}
function compared() {
  const m = sourcing();
  for (const v of m.vendors) collect(m, v.id);
  applyCommand(
    m,
    {
      type: "clarify_quote",
      vendorId: "studio",
      question: "Confirm total charges and delivery",
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
  return m;
}
function recommended() {
  const m = compared();
  applyCommand(
    m,
    {
      type: "recommend",
      vendorId: m.ranking.topVendorId!,
      rationale: "Lowest eligible landed cost",
    },
    now,
  );
  return m;
}
function ingestUpdate(m: ReturnType<typeof sourcing>, vendorId: string, at = now + 100) {
  applyCommand(
    m,
    {
      type: "ingest_external_evidence",
      evidence: fixtureEvidence(m, vendorId, "update", at),
    },
    at,
  );
}
test("incomplete quote cannot be compared, recommended, or normalized with invented zero fees", () => {
  const m = sourcing();
  applyCommand(m, { type: "request_quote", vendorId: "studio" }, now);
  assert.equal(m.evidence.length, 0);
  assert.equal(evaluate(m, "studio").status, "waiting");
  applyCommand(
    m,
    {
      type: "ingest_external_evidence",
      evidence: fixtureEvidence(m, "studio", "initial", now),
    },
    now,
  );
  const e = evaluate(m, "studio");
  assert.equal(e.status, "needs_clarification");
  assert.equal(e.totalCents, null);
  assert.ok(e.missing.includes("taxCents"));
  assert.ok(e.missing.includes("deliveryAt"));
  assert.throws(() =>
    applyCommand(
      m,
      { type: "recommend", vendorId: "studio", rationale: "Cheap" },
      now,
    ),
  );
});
test("landed cost includes all fees and hard constraints disqualify cheaper vendors", () => {
  const m = compared();
  assert.equal(evaluate(m, "studio").totalCents, 62500);
  assert.equal(evaluate(m, "catalogue").status, "ineligible");
  assert.ok(
    evaluate(m, "catalogue").reasons.some((r) => r.includes("deadline")),
  );
  assert.equal(evaluate(m, "social").status, "ineligible");
});
test("new authoritative evidence supersedes stale fields, keeps history and invalidates a recommendation", () => {
  const m = recommended();
  const oldVersion = m.recommendation!.version;
  const winnerId = m.recommendation!.vendorId;
  ingestUpdate(m, winnerId);
  assert.equal(m.state, "sourcing");
  assert.equal(m.recommendation, null);
  assert.equal(evaluate(m, winnerId).status, "ineligible");
  assert.equal(m.evidence.filter((e) => e.vendorId === winnerId).length, 2);
  assert.equal(evaluate(m, winnerId).quote.unitCents, 1800);
  assert.deepEqual(
    evaluate(m, winnerId).supersededClaims?.find(
      (e) => e.evidenceId === `fixture:${winnerId}:initial`,
    )?.fields,
    ["deliveryAt"],
  );
  assert.throws(() =>
    applyCommand(
      m,
      { type: "approve", recommendationVersion: oldVersion },
      now,
    ),
  );
  ingestEvidence(m, {
    ...fixtureEvidence(m, winnerId, "initial", now),
    provenance: {
      ...fixtureEvidence(m, winnerId, "initial", now).provenance,
      observationId: "late-arriving-old-evidence",
    },
    observedAt: now + 200,
  });
  assert.equal(evaluate(m, winnerId).status, "ineligible");
});
test("equally authoritative conflicting evidence stays unresolved until a higher revision", () => {
  const m = compared();
  ingestEvidence(m, {
    ...fixtureEvidence(m, "express", "initial", now),
    provenance: {
      ...fixtureEvidence(m, "express", "initial", now).provenance,
      observationId: "conflict",
    },
    claims: { unitCents: 1900 },
  });
  assert.deepEqual(evaluate(m, "express").conflicts, ["unitCents"]);
  assert.equal(evaluate(m, "express").totalCents, null);
  ingestEvidence(m, {
    ...fixtureEvidence(m, "express", "clarification", now),
    provenance: {
      ...fixtureEvidence(m, "express", "clarification", now).provenance,
      observationId: "resolution",
    },
    claims: { unitCents: 1900 },
  });
  assert.equal(evaluate(m, "express").status, "eligible");
});
test("invalid claims and invalid workflow transitions fail closed", () => {
  const m = sourcing();
  assert.throws(() =>
    ingestEvidence(m, {
      ...fixtureEvidence(m, "studio", "initial", now),
      claims: { unitCents: -1 },
    }),
  );
  assert.throws(() =>
    transition("first", "last", {
      first: ["middle"],
      middle: ["last"],
      last: [],
    }),
  );
  assert.throws(() => applyCommand(m, { type: "complete_mission" }, now));
  assert.equal(m.evidence.length, 0);
});
test("model tools cannot supply recipient identity, human approval or authoritative evidence", () => {
  assert.throws(() =>
    agentCommandSchema.parse({ type: "approve", recommendationVersion: 1 }),
  );
  assert.throws(() =>
    agentCommandSchema.parse({
      type: "request_quote",
      vendorId: "studio",
      email: "invented@example.invalid",
    }),
  );
  assert.throws(() =>
    agentCommandSchema.parse({
      type: "ingest_external_evidence",
      evidence: fixtureEvidence(sourcing(), "studio", "initial", now),
    }),
  );
  assert.throws(() => commandSchema.parse({ type: "inject_update" }));
  assert.throws(() =>
    applyCommand(
      sourcing(),
      { type: "request_quote", vendorId: "invented" },
      now,
    ),
  );
});
test("commitment needs persisted approval and approval/effect intent retries do not duplicate", () => {
  const m = recommended();
  assert.throws(() =>
    authorizeEffect(contract(m), {
      key: "invented",
      gated: true,
      approvalVersion: null,
    }),
  );
  assert.throws(() =>
    authorizeEffect(
      { ...contract(m), authorizedEffectKeys: ["gated"] },
      { key: "gated", gated: true, approvalVersion: null },
    ),
  );
  applyCommand(m, { type: "approve", recommendationVersion: 1 }, now);
  const count = m.effects.length;
  applyCommand(m, { type: "approve", recommendationVersion: 1 }, now);
  assert.equal(m.approvals.length, 1);
  assert.equal(m.effects.length, count);
  assert.equal(m.effects.filter((e) => e.kind === "purchase_order").length, 1);
  const po = m.effects.find((e) => e.kind === "purchase_order")!;
  assert.equal(effectForExecution(m, po.key).status, "pending");
  ingestUpdate(m, m.recommendation!.vendorId);
  assert.equal(m.state, "blocked");
  assert.throws(() => effectForExecution(m, po.key));
});
test("attempted and successful-but-unverified effects cannot complete the workflow", () => {
  const m = recommended();
  applyCommand(m, { type: "approve", recommendationVersion: 1 }, now);
  for (const status of ["pending", "attempted", "unverified"] as const) {
    m.effects.forEach((e) => {
      e.status = status;
    });
    assert.throws(() => assertComplete(contract(m), m.effects));
  }
  m.effects.forEach((e) => {
    e.status = "verified";
  });
  assert.doesNotThrow(() => assertComplete(contract(m), m.effects));
});
test("read-back validates stable identity, endpoint and payload; missing observations fail", () => {
  const expected = {
    key: "po:1",
    endpointRef: "qbo.sandbox",
    payload: "25 gifts:62500",
  };
  assert.throws(() => verifyReceipt(expected, null));
  assert.throws(() =>
    verifyReceipt(expected, { ...expected, payload: "25 gifts:1" }),
  );
  assert.throws(() =>
    verifyReceipt(expected, { ...expected, endpointRef: "invented" }),
  );
  assert.doesNotThrow(() => verifyReceipt(expected, expected));
});
test("an outstanding sourcing effect still blocks completion after commitment effects are verified", () => {
  const m = recommended();
  applyCommand(m, { type: "approve", recommendationVersion: 1 }, now);
  m.effects.forEach((e) => {
    e.status = e.gated ? "verified" : "unverified";
  });
  assert.throws(() => assertComplete(contract(m), m.effects));
});
test("initial requests and clarification retries preserve logical identity and evidence history", () => {
  const m = sourcing();
  for (const v of m.vendors) collect(m, v.id);
  applyCommand(
    m,
    {
      type: "clarify_quote",
      vendorId: "studio",
      question: "Confirm total charges and delivery",
    },
    now,
  );
  const count = m.effects.length;
  const evidenceCount = m.evidence.length;
  applyCommand(m, { type: "request_quote", vendorId: "studio" }, now);
  applyCommand(
    m,
    { type: "clarify_quote", vendorId: "studio", question: "Confirm again" },
    now,
  );
  assert.equal(m.effects.length, count);
  assert.equal(m.evidence.length, evidenceCount);
});
test("live provider gate is explicit and provider choice is replaceable", () => {
  assert.throws(() => providerConfiguration({ OPENROUTER_API_KEY: "test" }));
  assert.throws(() =>
    providerConfiguration({ LIVE_AI_ENABLED: "false", AI_MODEL: "test" }),
  );
  assert.equal(
    providerConfiguration({
      LIVE_AI_ENABLED: "true",
      AI_PROVIDER: "openai",
      OPENAI_API_KEY: "test",
      AI_MODEL: "test",
    }).provider,
    "openai",
  );
});
test("actual Agents SDK Runner invokes registered procurement tools (injected test model, no live call)", async () => {
  const m = createMission("sdk", "Please find gifts", now);
  let calls = 0;
  const model: Model = {
    async getResponse(request) {
      calls++;
      assert.ok(request.tools.some((t) => t.name === "ask_requirements"));
      return calls === 1
        ? {
            usage: new Usage(),
            output: [
              {
                type: "function_call",
                callId: "call-test",
                name: "ask_requirements",
                arguments: JSON.stringify({
                  question:
                    "How many gifts, total budget, deadline and branding?",
                }),
                status: "completed",
              },
            ],
          }
        : {
            usage: new Usage(),
            output: [
              {
                type: "message",
                role: "assistant",
                content: [
                  {
                    type: "output_text",
                    text: "Waiting for your requirements.",
                  },
                ],
                status: "completed",
              },
            ],
          };
    },
    async *getStreamedResponse() {
      throw new Error("Not used by this test");
    },
  };
  await runProcurementAgent(
    {
      read: async () => m,
      act: async (c) => {
        assert.equal(c.type, "ask_requirements");
        if (c.type !== "ask_requirements") throw new Error("Unexpected tool");
        return applyCommand(m, c, now);
      },
    },
    { model },
  );
  assert.equal(calls, 1);
  assert.match(m.question!, /budget/);
  assert.equal(m.state, "clarifying");
});
test("RFQ intent alone is not verified contact", () => {
  const m = sourcing();
  applyCommand(m, { type: "request_quote", vendorId: "studio" }, now);
  assert.equal(communicationState(m, "studio"), "pending");
  assert.notEqual(communicationState(m, "studio"), "verified");
  const rfq = m.effects.find((e) => e.kind === "rfq")!;
  rfq.status = "unverified";
  refreshDerived(m);
  assert.equal(communicationState(m, "studio"), "unverified");
  assert.notEqual(communicationState(m, "studio"), "verified");
});
