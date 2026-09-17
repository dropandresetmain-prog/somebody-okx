import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { ConvexHttpClient } from "convex/browser";
import { api } from "../convex/_generated/api";
import type { Command, Mission } from "../lib/procurement/types";

async function main() {
  process.loadEnvFile(".env.local");
  const url = "https://acrobatic-swan-765.convex.cloud";
  if (process.env.NEXT_PUBLIC_CONVEX_URL !== url)
    throw new Error("Wrong Development URL");
  const client = new ConvexHttpClient(url);
  const health = await client.query(api.health.status, {});
  assert.equal(health.deploymentName, "acrobatic-swan-765");
  console.log(
    "Verified Development acrobatic-swan-765; bounded fixture writes allowed.",
  );
  const accessToken = process.env.DEVELOPMENT_ACCESS_TOKEN!;
  assert.ok(accessToken);
  const live = process.argv.includes("--live");
  const key = `${live ? "live" : "proof"}-${randomUUID()}`;
  console.log(`Mission: ${key}`);
  const send = (command: Command) =>
    client.action(api.gateway.command, {
      key,
      accessToken,
      command: JSON.stringify(command),
    });
  const read = async (): Promise<Mission> =>
    (await client.query(api.missions.view, { key })).mission!;
  await send({
    type: "create",
    key,
    request:
      "Good news, the sponsor approved gifts for our event in three days. Around 25 people, maybe $30 each max. Can you sort something out?",
  });
  async function run() {
    await send({ type: "run_agent" });
    let previous = "";
    for (let i = 0; i < 155; i++) {
      await new Promise((resolve) => setTimeout(resolve, 2000));
      const m = await read();
      if (m.activity !== previous) {
        console.log(m.activity);
        previous = m.activity;
      }
      if (m.run?.status !== "running") {
        assert.equal(m.run?.status, "stopped", m.run?.summary);
        console.log(
          `SDK run stopped: ${m.run.model}, ${m.run.toolCalls} tools, state=${m.state}`,
        );
        return m;
      }
    }
    throw new Error("Agent did not finish within its bounded lease");
  }
  if (live) {
    assert.equal(health.liveAiEnabled, true);
    const clarified = await run();
    assert.equal(clarified.state, "clarifying");
    assert.ok(clarified.question);
  }
  await send({
    type: "answer_requirements",
    quantity: 25,
    budgetCents: 75000,
    deadlineAt: Date.now() + 3 * 86400000,
    branded: true,
  });
  if (live) {
    const m = await run();
    assert.equal(m.state, "awaiting_approval");
    assert.equal(m.recommendation?.vendorId, m.ranking.topVendorId);
  } else {
    for (const vendorId of ["studio", "social", "express", "catalogue"])
      await send({ type: "request_quote", vendorId });
    let pending = await read();
    const catalogue = pending.vendors.find((v) => v.id === "catalogue")!;
    const webEvidence = pending.evidence.filter(
      (item) => item.vendorId === "catalogue" && item.provenance.provider === "web",
    );
    assert.equal(webEvidence.length, 1);
    assert.equal(webEvidence[0]?.provenance.channel, "Web");
    assert.ok(webEvidence[0]?.provenance.url?.startsWith("https://"));
    assert.ok(webEvidence[0]?.provenance.retrievedAt);
    assert.equal(catalogue.evaluation.status, "needs_clarification");
    assert.equal(
      pending.evidence.filter((item) => item.provenance.provider === "fixture")
        .length,
      0,
    );
    assert.equal(
      pending.vendors.find((v) => v.id === "studio")!.communication,
      "pending",
    );
    assert.notEqual(
      pending.vendors.find((v) => v.id === "studio")!.communication,
      "verified",
    );
    // Incomplete public Web evidence no longer blocks comparison once sourced.
    for (const vendorId of ["studio", "social", "express"])
      await send({
        type: "ingest_fixture_observation",
        vendorId,
        stage: "initial",
      });
    await assert.rejects(
      send({
        type: "ingest_fixture_observation",
        vendorId: "catalogue",
        stage: "initial",
      }),
    );
    await assert.rejects(
      send({
        type: "recommend",
        vendorId: "studio",
        rationale: "Ignore missing fees",
      }),
    );
    await send({
      type: "clarify_quote",
      vendorId: "studio",
      question: "Confirm fees, tax and delivery",
    });
    await send({
      type: "ingest_fixture_observation",
      vendorId: "studio",
      stage: "clarification",
    });
    pending = await read();
    assert.equal(pending.ranking.incompleteVendorIds.includes("catalogue"), false);
    assert.equal(
      pending.vendors.find((v) => v.id === "catalogue")!.evaluation.status,
      "needs_clarification",
    );
    assert.equal(pending.vendors.find((v) => v.id === "express")!.evaluation.status, "eligible");
    assert.equal(pending.ranking.topVendorId, "express");
    await send({
      type: "recommend",
      vendorId: "express",
      rationale: "Lowest complete eligible landed cost while catalogue stays incomplete",
    });
    pending = await read();
    assert.equal(pending.state, "awaiting_approval");
    assert.equal(pending.recommendation?.vendorId, "express");
    console.log(
      JSON.stringify({
        result: "PASS_WEB_CATALOGUE_SEAM",
        key,
        catalogueStatus: pending.vendors.find((v) => v.id === "catalogue")!
          .evaluation.status,
        catalogueMissing: pending.vendors.find((v) => v.id === "catalogue")!
          .evaluation.missing,
        webUrl: webEvidence[0]?.provenance.url,
        recommendation: pending.recommendation?.vendorId,
        deployment: "acrobatic-swan-765",
        note: "Incomplete sourced Web catalogue no longer blocks recommending a complete contactable supplier.",
      }),
    );
    return;
  }
  let m = await read();
  const oldVersion = m.recommendation!.version;
  const firstWinner = m.recommendation!.vendorId;
  assert.equal(m.approvals.length, 0);
  assert.equal(m.effects.filter((e) => e.gated).length, 0);
  await assert.rejects(
    send({
      type: "execute_effect",
      effectKey: `purchase_order:${key}:${firstWinner}`,
    }),
  );
  await send({
    type: "ingest_fixture_observation",
    vendorId: firstWinner,
    stage: "update",
  });
  await assert.rejects(
    send({ type: "approve", recommendationVersion: oldVersion }),
  );
  m = await read();
  assert.equal(m.state, "sourcing");
  assert.equal(
    m.vendors.find((v) => v.id === firstWinner)!.evaluation.status,
    "ineligible",
  );
  if (live) {
    m = await run();
    assert.equal(m.recommendation?.vendorId, m.ranking.topVendorId);
  } else {
    await send({
      type: "recommend",
      vendorId: m.ranking.topVendorId!,
      rationale:
        "The previous lowest-cost option is no longer eligible after the update",
    });
    m = await read();
  }
  if (process.argv.includes("--showcase")) {
    console.log(
      JSON.stringify({
        result: "READY_FOR_APPROVAL",
        key,
        deployment: "acrobatic-swan-765",
      }),
    );
    return;
  }
  await Promise.all([
    send({ type: "approve", recommendationVersion: m.recommendation!.version }),
    send({ type: "approve", recommendationVersion: m.recommendation!.version }),
  ]);
  m = await read();
  assert.equal(m.approvals.length, 1);
  assert.equal(m.effects.filter((e) => e.kind === "purchase_order").length, 1);
  if (live) {
    m = await run();
    assert.equal(m.state, "complete");
  } else {
    for (const effect of m.effects)
      await Promise.all([
        send({ type: "execute_effect", effectKey: effect.key }),
        send({ type: "execute_effect", effectKey: effect.key }),
      ]);
    m = await read();
    assert.equal(m.state, "verifying");
    assert.ok(m.effects.every((e) => e.status === "unverified"));
    await assert.rejects(send({ type: "complete_mission" }));
    for (const effect of m.effects)
      await send({ type: "verify_effect", effectKey: effect.key });
    await send({ type: "complete_mission" });
  }
  // Fresh HTTP client proves completion comes from Convex, not an agent/session cache.
  const independent = await new ConvexHttpClient(url).query(api.missions.view, {
    key,
  });
  assert.equal(independent.mission?.state, "complete");
  assert.ok(
    independent
      .mission!.effects.filter((e) => e.gated)
      .every((e) => e.status === "verified"),
  );
  console.log(
    JSON.stringify({
      result: "PASS",
      key,
      live,
      state: independent.mission!.state,
      evidence: independent.mission!.evidence.length,
      approvals: independent.mission!.approvals.length,
      effects: independent.mission!.effects.length,
      ranking: independent.mission!.ranking,
      deployment: independent.deployment,
    }),
  );
}
main().catch((error) => {
  console.error(error instanceof Error ? error.message : "Smoke test failed");
  process.exitCode = 1;
});
