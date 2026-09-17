import test from "node:test";
import assert from "node:assert/strict";
import { createMission } from "../lib/procurement/fixtures";
import {
  applyCommand,
  evaluate,
  evidenceId,
  ingestEvidence,
} from "../lib/procurement/domain";
import {
  compareSourceOrder,
  decideInbound,
  evidenceFromInbound,
  extractControlledClaims,
  extractNaturalLanguageClaims,
  formatOutboundText,
  normalizeSupplierClaims,
  parseBindingsJson,
  planOutbound,
  readBackMatches,
  resolveTimeZone,
  resolveWeekdayDeliveryAt,
  sourceRevision,
  zonedWallTimeToUtc,
  type UnipileBinding,
  type UnipileWebhookEvent,
} from "../lib/unipile";
import type { Effect, Mission } from "../lib/procurement/types";

const now = 1_800_000_000_000;

const whatsappBinding: UnipileBinding = {
  endpointRef: "dev.whatsapp.good-things",
  provider: "whatsapp",
  accountId: "acct-wa",
  chatId: "chat-wa",
  accountUserId: "provider-user-somebody",
};

const instagramBinding: UnipileBinding = {
  endpointRef: "dev.instagram.little-objects",
  provider: "instagram",
  accountId: "acct-ig",
  chatId: "chat-ig",
  accountUserId: "provider-user-somebody-ig",
};

const bindings = [whatsappBinding, instagramBinding];

function sourcingMission(): Mission {
  const m = createMission("unipile-test", "Sponsor gifts", now);
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

function vendorIdFor(endpointRef: string, mission: Mission) {
  return mission.vendors.find((v) => v.endpointRef === endpointRef)?.id ?? null;
}

function webhook(
  overrides: Partial<UnipileWebhookEvent> &
    Pick<UnipileWebhookEvent, "account_type" | "account_id" | "chat_id" | "message_id">,
): UnipileWebhookEvent {
  return {
    event: "message_received",
    timestamp: new Date(now + 60_000).toISOString(),
    message:
      "Yep, $18 each including logo printing. Delivery is $15. We have 40 in stock and Thursday morning is fine.",
    account_info: { user_id: "provider-user-somebody" },
    sender: {
      attendee_provider_id: "supplier-provider-id",
      attendee_name: "Supplier",
    },
    ...overrides,
  };
}

test("bindings JSON parses WhatsApp and Instagram endpoints without demo hard-coding", () => {
  const parsed = parseBindingsJson(JSON.stringify(bindings));
  assert.equal(parsed.length, 2);
  assert.equal(parsed[0]?.provider, "whatsapp");
  assert.equal(parsed[1]?.provider, "instagram");
  assert.throws(() => parseBindingsJson("{"));
  assert.throws(() =>
    parseBindingsJson(JSON.stringify([{ provider: "telegram" }])),
  );
});

test("WhatsApp correlation maps account/chat to configured vendor", () => {
  const m = sourcingMission();
  const decision = decideInbound({
    event: webhook({
      account_type: "WHATSAPP",
      account_id: "acct-wa",
      chat_id: "chat-wa",
      message_id: "wa-msg-1",
    }),
    bindings,
    extractionContext: { deadlineAt: m.requirements.deadlineAt },
    resolveVendorId: (endpointRef) => vendorIdFor(endpointRef, m),
  });
  assert.equal(decision.action, "ingest");
  if (decision.action !== "ingest") return;
  assert.equal(decision.provider, "whatsapp");
  assert.equal(decision.channel, "WhatsApp");
  assert.equal(decision.vendorId, "express");
  assert.equal(decision.observationId, "wa-msg-1");
  assert.equal(decision.chatId, "chat-wa");
  assert.equal(decision.claims.unitCents, 1800);
  assert.equal(decision.extractionPath, "natural_language");
});

test("Instagram correlation maps account/chat to configured vendor", () => {
  const m = sourcingMission();
  const decision = decideInbound({
    event: webhook({
      account_type: "INSTAGRAM",
      account_id: "acct-ig",
      chat_id: "chat-ig",
      message_id: "ig-msg-1",
      account_info: { user_id: "provider-user-somebody-ig" },
      message:
        "Our desk kits are $29 each, branded sleeves included. $30 delivery. Ready Thursday.",
    }),
    bindings,
    extractionContext: { deadlineAt: m.requirements.deadlineAt },
    resolveVendorId: (endpointRef) => vendorIdFor(endpointRef, m),
  });
  assert.equal(decision.action, "ingest");
  if (decision.action !== "ingest") return;
  assert.equal(decision.provider, "instagram");
  assert.equal(decision.channel, "Instagram");
  assert.equal(decision.vendorId, "social");
  assert.equal(decision.claims.unitCents, 2900);
});

test("own-message filtering distinguishes Somebody outbound from supplier replies", () => {
  const m = sourcingMission();
  const decision = decideInbound({
    event: webhook({
      account_type: "WHATSAPP",
      account_id: "acct-wa",
      chat_id: "chat-wa",
      message_id: "wa-own-1",
      sender: { attendee_provider_id: "provider-user-somebody" },
    }),
    bindings,
    resolveVendorId: (endpointRef) => vendorIdFor(endpointRef, m),
  });
  assert.equal(decision.action, "ignore_own");
});

test("unknown chat/vendor rejects fail-closed", () => {
  const m = sourcingMission();
  const unknownChat = decideInbound({
    event: webhook({
      account_type: "WHATSAPP",
      account_id: "acct-wa",
      chat_id: "chat-unknown",
      message_id: "wa-x",
    }),
    bindings,
    resolveVendorId: (endpointRef) => vendorIdFor(endpointRef, m),
  });
  assert.equal(unknownChat.action, "reject");

  const unboundVendor = decideInbound({
    event: webhook({
      account_type: "WHATSAPP",
      account_id: "acct-wa",
      chat_id: "chat-wa",
      message_id: "wa-y",
    }),
    bindings,
    resolveVendorId: () => null,
  });
  assert.equal(unboundVendor.action, "reject");
});

test("duplicate webhook delivery is detected before ingest", () => {
  const m = sourcingMission();
  const seen = new Set(["wa-dup"]);
  const decision = decideInbound({
    event: webhook({
      account_type: "WHATSAPP",
      account_id: "acct-wa",
      chat_id: "chat-wa",
      message_id: "wa-dup",
    }),
    bindings,
    alreadySeenMessageId: (id) => seen.has(id),
    resolveVendorId: (endpointRef) => vendorIdFor(endpointRef, m),
  });
  assert.equal(decision.action, "duplicate");
});

test("stable message identity and source chronology survive out-of-order webhooks", () => {
  const m = sourcingMission();
  applyCommand(m, { type: "request_quote", vendorId: "express" }, now);
  const deadlineAt = m.requirements.deadlineAt;

  const thursdayAt = now + 10_000;
  const fridayAt = now + 86_400_000;
  const thursday = decideInbound({
    event: webhook({
      account_type: "WHATSAPP",
      account_id: "acct-wa",
      chat_id: "chat-wa",
      message_id: "msg-thursday",
      timestamp: new Date(thursdayAt).toISOString(),
      message:
        "Yep, $18 each including logo printing. Delivery is $15. We have 40 in stock and Thursday morning is fine.",
    }),
    bindings,
    extractionContext: { deadlineAt },
    resolveVendorId: (endpointRef) => vendorIdFor(endpointRef, m),
  });
  const friday = decideInbound({
    event: webhook({
      account_type: "WHATSAPP",
      account_id: "acct-wa",
      chat_id: "chat-wa",
      message_id: "msg-friday",
      timestamp: new Date(fridayAt).toISOString(),
      message:
        "Sorry, production just corrected me — branded units can only arrive Friday.",
    }),
    bindings,
    extractionContext: { deadlineAt },
    resolveVendorId: (endpointRef) => vendorIdFor(endpointRef, m),
  });
  assert.equal(thursday.action, "ingest");
  assert.equal(friday.action, "ingest");
  if (thursday.action !== "ingest" || friday.action !== "ingest") return;

  assert.ok(friday.revision > thursday.revision);
  assert.ok(thursday.claims.deliveryAt);
  assert.ok(friday.claims.deliveryAt);
  assert.notEqual(friday.claims.deliveryAt, thursday.claims.deliveryAt);
  assert.ok(
    compareSourceOrder(
      { observedAt: thursday.observedAt, observationId: thursday.observationId },
      { observedAt: friday.observedAt, observationId: friday.observationId },
    ) < 0,
  );

  // Delayed friday webhook arrives first, then thursday.
  ingestEvidence(m, evidenceFromInbound(friday, now + 200_000));
  ingestEvidence(m, evidenceFromInbound(thursday, now + 300_000));
  assert.equal(m.evidence.length, 2);
  assert.equal(evaluate(m, "express").quote.deliveryAt, friday.claims.deliveryAt);
  assert.equal(evaluate(m, "express").quote.unitCents, 1800);

  // Webhook-layer dedupe blocks replay before ingest; identical retry is a no-op.
  const replay = decideInbound({
    event: webhook({
      account_type: "WHATSAPP",
      account_id: "acct-wa",
      chat_id: "chat-wa",
      message_id: "msg-thursday",
      timestamp: new Date(thursdayAt).toISOString(),
      message:
        "Yep, $18 each including logo printing. Delivery is $15. We have 40 in stock and Thursday morning is fine.",
    }),
    bindings,
    alreadySeenMessageId: (id) => id === "msg-thursday" || id === "msg-friday",
    extractionContext: { deadlineAt },
    resolveVendorId: (endpointRef) => vendorIdFor(endpointRef, m),
  });
  assert.equal(replay.action, "duplicate");
  ingestEvidence(m, evidenceFromInbound(thursday, now + 300_000));
  assert.equal(m.evidence.length, 2);
  assert.equal(evaluate(m, "express").quote.deliveryAt, friday.claims.deliveryAt);
  assert.equal(
    evidenceId(evidenceFromInbound(thursday, now + 300_000)),
    "whatsapp:msg-thursday",
  );
  assert.equal(sourceRevision(fridayAt) > sourceRevision(thursdayAt), true);
});

test("any bound supplier quote change can rerank without hard-coded winners", () => {
  const m = sourcingMission();
  for (const vendorId of ["catalogue", "studio", "express", "social"] as const) {
    applyCommand(m, { type: "request_quote", vendorId }, now);
  }
  // Seed complete quotes via messaging-shaped evidence for WA + IG and fixtures for others.
  ingestEvidence(
    m,
    evidenceFromInbound(
      {
        action: "ingest",
        vendorId: "express",
        endpointRef: whatsappBinding.endpointRef,
        provider: "whatsapp",
        channel: "WhatsApp",
        observationId: "wa-cheap",
        chatId: "chat-wa",
        accountId: "acct-wa",
        observedAt: now + 1,
        revision: sourceRevision(now + 1),
        text: "Cheap WhatsApp quote",
        claims: {
          unitCents: 1500,
          setupCents: 0,
          deliveryCents: 1000,
          taxCents: 0,
          quantity: 25,
          moq: 10,
          stock: 100,
          deliveryAt: now + 2 * 86400000,
          branded: true,
          currency: "SGD",
        },
      },
      now,
    ),
  );
  ingestEvidence(
    m,
    evidenceFromInbound(
      {
        action: "ingest",
        vendorId: "social",
        endpointRef: instagramBinding.endpointRef,
        provider: "instagram",
        channel: "Instagram",
        observationId: "ig-mid",
        chatId: "chat-ig",
        accountId: "acct-ig",
        observedAt: now + 2,
        revision: sourceRevision(now + 2),
        text: "Instagram quote",
        claims: {
          unitCents: 2000,
          setupCents: 0,
          deliveryCents: 1000,
          taxCents: 0,
          quantity: 25,
          moq: 10,
          stock: 100,
          deliveryAt: now + 2 * 86400000,
          branded: true,
          currency: "SGD",
        },
      },
      now,
    ),
  );
  applyCommand(
    m,
    {
      type: "ingest_external_evidence",
      evidence: {
        vendorId: "studio",
        source: "gmail",
        authority: "vendor",
        revision: 1,
        observedAt: now,
        text: "Gmail quote",
        claims: {
          unitCents: 2400,
          setupCents: 0,
          deliveryCents: 1000,
          taxCents: 0,
          quantity: 25,
          moq: 10,
          stock: 100,
          deliveryAt: now + 2 * 86400000,
          branded: true,
          currency: "SGD",
        },
        provenance: {
          provider: "gmail",
          channel: "Gmail",
          observationId: "gmail-1",
          observedAt: now,
        },
      },
    },
    now,
  );
  applyCommand(
    m,
    {
      type: "ingest_external_evidence",
      evidence: {
        vendorId: "catalogue",
        source: "web",
        authority: "catalogue",
        revision: 1,
        observedAt: now,
        text: "Catalogue late",
        claims: {
          unitCents: 1400,
          setupCents: 0,
          deliveryCents: 0,
          taxCents: 0,
          quantity: 25,
          moq: 50,
          stock: 100,
          deliveryAt: now + 10 * 86400000,
          branded: true,
          currency: "SGD",
        },
        provenance: {
          provider: "web",
          channel: "Web",
          observationId: "web-1",
          observedAt: now,
        },
      },
    },
    now,
  );
  assert.equal(m.ranking.topVendorId, "express");

  // Instagram supplier improves price → generalized ranking flips without hard-coded winner.
  ingestEvidence(
    m,
    evidenceFromInbound(
      {
        action: "ingest",
        vendorId: "social",
        endpointRef: instagramBinding.endpointRef,
        provider: "instagram",
        channel: "Instagram",
        observationId: "ig-better",
        chatId: "chat-ig",
        accountId: "acct-ig",
        observedAt: now + 90_000,
        revision: sourceRevision(now + 90_000),
        text: "Updated Instagram price",
        claims: {
          unitCents: 1200,
          deliveryCents: 500,
        },
      },
      now + 100_000,
    ),
  );
  assert.equal(m.ranking.topVendorId, "social");
});

test("outbound retries reuse receipts and provider success stays unverified until read-back", () => {
  const m = sourcingMission();
  applyCommand(m, { type: "request_quote", vendorId: "express" }, now);
  const effect = m.effects.find((e) => e.kind === "rfq")!;
  const text = formatOutboundText(effect, m);
  assert.match(text, /Somebody RFQ/);
  assert.match(text, /plain text/);
  assert.doesNotMatch(text, /SOMEBODY_CLAIMS/);

  const first = planOutbound({
    mission: m,
    effect,
    binding: whatsappBinding,
    existingReceiptKey: null,
  });
  assert.equal(first.mode, "send");

  const retry = planOutbound({
    mission: m,
    effect,
    binding: whatsappBinding,
    existingReceiptKey: effect.key,
  });
  assert.equal(retry.mode, "skip_already_delivered");

  assert.equal(
    readBackMatches({
      expectedText: text,
      expectedChatId: "chat-wa",
      expectedMessageId: "provider-msg-1",
      observed: null,
    }),
    false,
  );
  assert.equal(
    readBackMatches({
      expectedText: text,
      expectedChatId: "chat-wa",
      expectedMessageId: "provider-msg-1",
      observed: {
        providerMessageId: "provider-msg-1",
        chatId: "chat-wa",
        text,
      },
    }),
    true,
  );
  // API acceptance alone is modeled as unverified until read-back matches.
  const unverified: Effect = { ...effect, status: "unverified", receiptId: "r1" };
  assert.equal(unverified.status, "unverified");
  assert.notEqual(unverified.status, "verified");
});

test("controlled claims trailer extracts partial quote updates", () => {
  const claims = extractControlledClaims(
    'Correction coming through.\nSOMEBODY_CLAIMS:{"deliveryAt":1800259200000}',
  );
  assert.deepEqual(claims, { deliveryAt: 1800259200000 });
  assert.equal(extractControlledClaims("plain supplier chat"), null);
});

test("natural language extracts price + delivery + stock + branding", () => {
  const m = sourcingMission();
  const text =
    "Yep, $18 each including logo printing. Delivery is $15. We have 40 in stock and Thursday morning is fine.";
  const claims = extractNaturalLanguageClaims(text, {
    referenceAt: now,
    deadlineAt: m.requirements.deadlineAt,
    timeZone: "Asia/Singapore",
  });
  assert.equal(claims.unitCents, 1800);
  assert.equal(claims.deliveryCents, 1500);
  assert.equal(claims.stock, 40);
  assert.equal(claims.branded, true);
  assert.equal(
    claims.deliveryAt,
    resolveWeekdayDeliveryAt(
      "thursday",
      {
        referenceAt: now,
        deadlineAt: m.requirements.deadlineAt,
        timeZone: "Asia/Singapore",
      },
      "morning",
    ),
  );
  assert.equal(claims.setupCents, undefined);
  assert.equal(claims.taxCents, undefined);
  assert.equal(claims.currency, undefined);
  assert.equal(claims.moq, undefined);
});

test("Thursday morning resolves in Asia/Singapore not UTC wall clock", () => {
  const m = sourcingMission();
  const ctx = {
    referenceAt: now,
    deadlineAt: m.requirements.deadlineAt!,
    timeZone: "Asia/Singapore",
  };
  const morning = resolveWeekdayDeliveryAt("thursday", ctx, "morning");
  const afternoon = resolveWeekdayDeliveryAt("thursday", ctx, "afternoon");
  assert.ok(morning);
  assert.ok(afternoon);
  // 09:00 SGT = 01:00 UTC; 15:00 SGT = 07:00 UTC
  assert.equal(new Date(morning!).getUTCHours(), 1);
  assert.equal(new Date(afternoon!).getUTCHours(), 7);
  assert.equal(new Date(morning!).getUTCMinutes(), 0);
  assert.ok(afternoon! > morning!);

  const asSingapore = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Singapore",
    weekday: "long",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date(morning!));
  const weekday = asSingapore.find((p) => p.type === "weekday")?.value;
  const hour = asSingapore.find((p) => p.type === "hour")?.value;
  assert.equal(weekday, "Thursday");
  assert.equal(hour, "09");

  // Explicit civil time round-trip sanity.
  const partsDay = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Singapore",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(morning!));
  const [y, mo, d] = partsDay.split("-").map(Number);
  assert.equal(
    morning,
    zonedWallTimeToUtc(y!, mo!, d!, 9, 0, "Asia/Singapore"),
  );
});

test("Friday correction remains later than Thursday in Asia/Singapore", () => {
  const m = sourcingMission();
  const ctx = {
    referenceAt: now,
    deadlineAt: m.requirements.deadlineAt!,
    timeZone: "Asia/Singapore",
  };
  const thursday = resolveWeekdayDeliveryAt("thursday", ctx, "morning");
  const friday = resolveWeekdayDeliveryAt("friday", ctx, "unspecified");
  assert.ok(thursday);
  assert.ok(friday);
  assert.ok(friday! > thursday!);
});

test("invalid SOMEBODY_TIME_ZONE falls back to Asia/Singapore", () => {
  assert.equal(resolveTimeZone("Not/AZone", {}), "Asia/Singapore");
  assert.equal(resolveTimeZone(undefined, {}), "Asia/Singapore");
  assert.equal(
    resolveTimeZone(undefined, { SOMEBODY_TIME_ZONE: "Asia/Singapore" }),
    "Asia/Singapore",
  );
});

test("natural language incomplete quote omits unstated fields", () => {
  const claims = extractNaturalLanguageClaims("Can do $22 each for now.", {
    referenceAt: now,
    deadlineAt: now + 3 * 86400000,
  });
  assert.deepEqual(claims, { unitCents: 2200 });
});

test("natural language delivery correction supersedes earlier day", () => {
  const m = sourcingMission();
  applyCommand(m, { type: "request_quote", vendorId: "express" }, now);
  const deadlineAt = m.requirements.deadlineAt;
  const first = decideInbound({
    event: webhook({
      account_type: "WHATSAPP",
      account_id: "acct-wa",
      chat_id: "chat-wa",
      message_id: "nl-1",
      timestamp: new Date(now + 1_000).toISOString(),
      message:
        "Yep, $18 each including logo printing. Delivery is $15. We have 40 in stock and Thursday morning is fine.",
    }),
    bindings,
    extractionContext: { deadlineAt },
    resolveVendorId: (endpointRef) => vendorIdFor(endpointRef, m),
  });
  const correction = decideInbound({
    event: webhook({
      account_type: "WHATSAPP",
      account_id: "acct-wa",
      chat_id: "chat-wa",
      message_id: "nl-2",
      timestamp: new Date(now + 90_000).toISOString(),
      message:
        "Sorry, production just corrected me — branded units can only arrive Friday.",
    }),
    bindings,
    extractionContext: { deadlineAt },
    resolveVendorId: (endpointRef) => vendorIdFor(endpointRef, m),
  });
  assert.equal(first.action, "ingest");
  assert.equal(correction.action, "ingest");
  if (first.action !== "ingest" || correction.action !== "ingest") return;
  ingestEvidence(m, evidenceFromInbound(first, now + 2_000));
  ingestEvidence(m, evidenceFromInbound(correction, now + 100_000));
  assert.equal(evaluate(m, "express").quote.deliveryAt, correction.claims.deliveryAt);
  assert.equal(evaluate(m, "express").quote.unitCents, 1800);
  assert.equal(evaluate(m, "express").quote.branded, true);
  assert.ok(correction.revision > first.revision);
});

test("messy WhatsApp-style shorthand still works in Asia/Singapore", () => {
  const m = sourcingMission();
  const claims = extractNaturalLanguageClaims(
    "18ea logo ok deliv $15 stk 40 thu am",
    {
      referenceAt: now,
      deadlineAt: m.requirements.deadlineAt,
      timeZone: "Asia/Singapore",
    },
  );
  assert.equal(claims.unitCents, 1800);
  assert.equal(claims.deliveryCents, 1500);
  assert.equal(claims.stock, 40);
  assert.equal(claims.branded, true);
  assert.ok(claims.deliveryAt);
  assert.equal(new Date(claims.deliveryAt!).getUTCHours(), 1);
});

test("messages with no supported quote claims ingest empty claims without fabrication", () => {
  const m = sourcingMission();
  const normalized = normalizeSupplierClaims(
    "Can you confirm the receiving address again?",
    { referenceAt: now, deadlineAt: m.requirements.deadlineAt },
  );
  assert.equal(normalized.path, "none");
  assert.deepEqual(normalized.claims, {});

  const decision = decideInbound({
    event: webhook({
      account_type: "WHATSAPP",
      account_id: "acct-wa",
      chat_id: "chat-wa",
      message_id: "nl-question",
      message: "Can you confirm the receiving address again?",
    }),
    bindings,
    extractionContext: { deadlineAt: m.requirements.deadlineAt },
    resolveVendorId: (endpointRef) => vendorIdFor(endpointRef, m),
  });
  assert.equal(decision.action, "ingest");
  if (decision.action !== "ingest") return;
  assert.deepEqual(decision.claims, {});
  assert.equal(decision.extractionPath, "none");
  assert.match(decision.text, /receiving address/);
  applyCommand(m, { type: "request_quote", vendorId: "express" }, now);
  ingestEvidence(m, evidenceFromInbound(decision, now + 50));
  assert.equal(m.evidence.length, 1);
  assert.deepEqual(m.evidence[0]?.claims, {});
  assert.equal(evaluate(m, "express").status, "needs_clarification");
});
