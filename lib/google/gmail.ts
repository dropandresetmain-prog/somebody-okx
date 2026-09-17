import { createHash } from "node:crypto";
import type { GoogleWorkspaceConfig } from "./config";
import { resolveGmailRecipient } from "./config";
import { gmailClient } from "./client";

export type GmailOutboundReceipt = {
  effectKey: string;
  endpointRef: string;
  to: string;
  messageId: string;
  threadId: string;
  rfc822MessageId: string | null;
  payload: string;
  subject: string;
};

export type GmailMessageObservation = {
  messageId: string;
  threadId: string;
  from: string;
  to: string[];
  subject: string;
  snippet: string;
  bodyText: string;
  observedAt: number;
  retrievedAt: number;
  labelIds: string[];
  effectKey: string | null;
};

function encodeRawMessage(raw: string): string {
  return Buffer.from(raw)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function headerValue(
  headers: Array<{ name?: string | null; value?: string | null }> | undefined,
  name: string,
): string | null {
  const found = headers?.find(
    (h) => h.name?.toLowerCase() === name.toLowerCase(),
  );
  return found?.value?.trim() || null;
}

function decodeBodyData(data?: string | null): string {
  if (!data) return "";
  return Buffer.from(data.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString(
    "utf8",
  );
}

function collectTextParts(payload: {
  mimeType?: string | null;
  body?: { data?: string | null } | null;
  parts?: Array<{
    mimeType?: string | null;
    body?: { data?: string | null } | null;
    parts?: unknown[];
  }> | null;
}): string {
  if (!payload) return "";
  if (payload.mimeType === "text/plain" && payload.body?.data)
    return decodeBodyData(payload.body.data);
  const parts = payload.parts ?? [];
  const texts: string[] = [];
  for (const part of parts) {
    texts.push(collectTextParts(part as typeof payload));
  }
  if (texts.some(Boolean)) return texts.filter(Boolean).join("\n");
  if (payload.body?.data) return decodeBodyData(payload.body.data);
  return "";
}

function effectSubject(kind: "rfq" | "clarification", effectKey: string): string {
  const tag = kind === "rfq" ? "RFQ" : "Clarification";
  return `[Somebody ${tag} ${effectKey}] Corporate gift quote request`;
}

function formatRequirementsForEmail(payload: string): string[] {
  try {
    const parsed: unknown = JSON.parse(payload);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed))
      return [`Details: ${payload}`];
    const req = parsed as Record<string, unknown>;
    const lines = ["Request details:"];
    if (typeof req.quantity === "number")
      lines.push(`- Quantity: ${req.quantity}`);
    if (typeof req.budgetCents === "number")
      lines.push(`- Total budget: SGD ${(req.budgetCents / 100).toFixed(2)}`);
    if (typeof req.deadlineAt === "number")
      lines.push(
        `- Needed by: ${new Date(req.deadlineAt).toLocaleString("en-SG", {
          timeZone: "Asia/Singapore",
        })}`,
      );
    if (typeof req.branded === "boolean")
      lines.push(`- Branding required: ${req.branded ? "yes" : "no"}`);
    if (lines.length === 1) lines.push(`- ${payload}`);
    return lines;
  } catch {
    return [`Details: ${payload}`];
  }
}

function buildMime(args: {
  to: string;
  from?: string;
  subject: string;
  body: string;
  effectKey: string;
  threadId?: string;
  inReplyTo?: string;
}): string {
  const lines = [
    `To: ${args.to}`,
    ...(args.from ? [`From: ${args.from}`] : []),
    `Subject: ${args.subject}`,
    "MIME-Version: 1.0",
    "Content-Type: text/plain; charset=UTF-8",
    `X-Somebody-Effect-Key: ${args.effectKey}`,
    ...(args.inReplyTo ? [`In-Reply-To: ${args.inReplyTo}`, `References: ${args.inReplyTo}`] : []),
    "",
    args.body,
  ];
  return lines.join("\r\n");
}

export function bodyHash(payload: string): string {
  return createHash("sha256").update(payload).digest("hex");
}

async function findExistingOutbound(
  config: GoogleWorkspaceConfig,
  effectKey: string,
): Promise<GmailOutboundReceipt | null> {
  const gmail = gmailClient(config);
  // Gmail does not reliably index arbitrary custom headers for search.
  // Effect keys are embedded in the subject for deterministic idempotent lookup.
  const list = await gmail.users.messages.list({
    userId: "me",
    q: `in:sent subject:"${effectKey.replace(/"/g, "")}"`,
    maxResults: 5,
  });
  const candidate = list.data.messages?.[0];
  if (!candidate?.id) return null;
  const full = await gmail.users.messages.get({
    userId: "me",
    id: candidate.id,
    format: "full",
  });
  const headers = full.data.payload?.headers;
  const subject = headerValue(headers, "Subject") ?? "";
  const to = headerValue(headers, "To") ?? "";
  return {
    effectKey,
    endpointRef: "",
    to,
    messageId: full.data.id!,
    threadId: full.data.threadId!,
    rfc822MessageId: headerValue(headers, "Message-ID"),
    payload: "",
    subject,
  };
}

export async function sendGmailEffect(args: {
  config: GoogleWorkspaceConfig;
  kind: "rfq" | "clarification";
  effectKey: string;
  endpointRef: string;
  payload: string;
  threadId?: string | null;
}): Promise<GmailOutboundReceipt> {
  const to = resolveGmailRecipient(args.config, args.endpointRef);
  const existing = await findExistingOutbound(args.config, args.effectKey);
  if (existing) {
    return {
      ...existing,
      endpointRef: args.endpointRef,
      payload: args.payload,
      to,
    };
  }

  const subject = effectSubject(args.kind, args.effectKey);
  const body =
    args.kind === "rfq"
      ? [
          "Hello,",
          "",
          "We need a quote for branded corporate gifts for an upcoming SME event.",
          "",
          ...formatRequirementsForEmail(args.payload),
          "",
          "Please reply with:",
          "- unit price (SGD)",
          "- setup / customization fee",
          "- delivery fee",
          "- tax / GST",
          "- MOQ and confirmed stock",
          "- branding method",
          "- confirmed delivery date/time",
          "",
          "Thanks,",
          "Somebody procurement worker",
          "",
          `(ref: ${args.effectKey})`,
        ].join("\n")
      : [
          "Hello,",
          "",
          "Following up on the previous quote thread.",
          "",
          args.payload.trim(),
          "",
          "Thanks,",
          "Somebody procurement worker",
          "",
          `(ref: ${args.effectKey})`,
        ].join("\n");

  const gmail = gmailClient(args.config);
  const raw = encodeRawMessage(
    buildMime({
      to,
      from: args.config.gmailFrom,
      subject,
      body,
      effectKey: args.effectKey,
      threadId: args.threadId ?? undefined,
    }),
  );
  const sent = await gmail.users.messages.send({
    userId: "me",
    requestBody: {
      raw,
      ...(args.threadId ? { threadId: args.threadId } : {}),
    },
  });
  if (!sent.data.id || !sent.data.threadId)
    throw new Error("Gmail send returned no message/thread id");

  // Immediate identity read-back; verification still requires independent get.
  const readBack = await gmail.users.messages.get({
    userId: "me",
    id: sent.data.id,
    format: "metadata",
    metadataHeaders: ["Subject", "To", "Message-ID", "X-Somebody-Effect-Key"],
  });
  if (readBack.data.id !== sent.data.id)
    throw new Error("Gmail send read-back id mismatch");

  return {
    effectKey: args.effectKey,
    endpointRef: args.endpointRef,
    to,
    messageId: sent.data.id,
    threadId: sent.data.threadId,
    rfc822MessageId: headerValue(readBack.data.payload?.headers, "Message-ID"),
    payload: args.payload,
    subject,
  };
}

export async function readGmailMessage(
  config: GoogleWorkspaceConfig,
  messageId: string,
): Promise<GmailMessageObservation> {
  const gmail = gmailClient(config);
  const retrievedAt = Date.now();
  const full = await gmail.users.messages.get({
    userId: "me",
    id: messageId,
    format: "full",
  });
  if (!full.data.id || !full.data.threadId)
    throw new Error("Gmail message read-back missing identifiers");
  const headers = full.data.payload?.headers;
  const internalDate = full.data.internalDate
    ? Number(full.data.internalDate)
    : retrievedAt;
  return {
    messageId: full.data.id,
    threadId: full.data.threadId,
    from: headerValue(headers, "From") ?? "",
    to: (headerValue(headers, "To") ?? "")
      .split(",")
      .map((part) => part.trim())
      .filter(Boolean),
    subject: headerValue(headers, "Subject") ?? "",
    snippet: full.data.snippet ?? "",
    bodyText: collectTextParts(full.data.payload ?? {}).trim() || full.data.snippet || "",
    observedAt: internalDate,
    retrievedAt,
    labelIds: full.data.labelIds ?? [],
    effectKey: headerValue(headers, "X-Somebody-Effect-Key"),
  };
}

export async function verifyGmailOutbound(args: {
  config: GoogleWorkspaceConfig;
  effectKey: string;
  endpointRef: string;
  payload: string;
  messageId: string;
}): Promise<GmailOutboundReceipt> {
  const observed = await readGmailMessage(args.config, args.messageId);
  const to = resolveGmailRecipient(args.config, args.endpointRef);
  const subjectOk = observed.subject.includes(args.effectKey);
  const headerOk = observed.effectKey === args.effectKey;
  // Sent items may not echo To the same way; presence + effect key is the identity.
  if (!subjectOk && !headerOk)
    throw new Error("Gmail read-back does not match the intended effect key");
  if (!observed.messageId)
    throw new Error("Gmail read-back missing message id");
  return {
    effectKey: args.effectKey,
    endpointRef: args.endpointRef,
    to,
    messageId: observed.messageId,
    threadId: observed.threadId,
    rfc822MessageId: null,
    payload: args.payload,
    subject: observed.subject,
  };
}

/**
 * Controlled inbound read: messages in threads that already carry our effect key,
 * excluding our own SENT-only noise when possible.
 */
export async function listGmailVendorReplies(args: {
  config: GoogleWorkspaceConfig;
  endpointRef: string;
  afterMs?: number;
}): Promise<GmailMessageObservation[]> {
  const to = resolveGmailRecipient(args.config, args.endpointRef);
  const gmail = gmailClient(args.config);
  const after = args.afterMs
    ? ` after:${Math.floor(args.afterMs / 1000)}`
    : "";
  // Controlled vendor replies may land in Spam on a fresh counterparty mailbox.
  // in:anywhere includes spam/trash; we still require from: the configured vendor.
  const list = await gmail.users.messages.list({
    userId: "me",
    q: `from:${to}${after} in:anywhere -in:draft`,
    maxResults: 20,
  });
  const observations: GmailMessageObservation[] = [];
  for (const item of list.data.messages ?? []) {
    if (!item.id) continue;
    const message = await readGmailMessage(args.config, item.id);
    const fromVendor = message.from.toLowerCase().includes(to);
    if (!fromVendor) continue;
    observations.push(message);
  }
  return observations.sort((a, b) => a.observedAt - b.observedAt);
}
