import {
  assertComplete,
  authorizeEffect,
  transition,
  type CoreWorkerContract,
} from "../reliability/core";
import type {
  AgentCommand,
  Approval,
  Channel,
  CommunicationState,
  Effect,
  Evaluation,
  Evidence,
  EvidenceInput,
  EvidenceProvider,
  EvidenceProvenance,
  Mission,
  Quote,
  QuoteField,
  SupplierRanking,
  UserCommand,
  Vendor,
  Workflow,
} from "./types";

const transitions: Record<Workflow, Workflow[]> = {
  clarifying: ["sourcing"],
  sourcing: ["awaiting_approval"],
  awaiting_approval: ["sourcing", "approved"],
  approved: ["verifying", "blocked"],
  verifying: ["complete", "blocked"],
  complete: ["blocked"],
  blocked: [],
};
const fields: QuoteField[] = [
  "unitCents",
  "setupCents",
  "deliveryCents",
  "taxCents",
  "quantity",
  "moq",
  "stock",
  "deliveryAt",
  "branded",
  "currency",
];
const providerChannels: Record<Exclude<EvidenceProvider, "fixture">, Channel> = {
  web: "Web",
  gmail: "Gmail",
  whatsapp: "WhatsApp",
  instagram: "Instagram",
};
function move(m: Mission, next: Workflow) {
  m.state = transition(m.state, next, transitions);
}
function bounded(text: string, name: string, max = 1500) {
  if (!text.trim() || text.length > max)
    throw new Error(`${name} must contain 1–${max} characters`);
}
function integer(
  value: number,
  name: string,
  minimum = 0,
  maximum = 100000000,
) {
  if (!Number.isSafeInteger(value) || value < minimum || value > maximum)
    throw new Error(`Invalid ${name}`);
}
function sameJson(a: unknown, b: unknown) {
  return JSON.stringify(a) === JSON.stringify(b);
}
export function evidenceId(input: EvidenceInput) {
  return `${input.provenance.provider}:${input.provenance.observationId}`;
}
export function vendor(m: Mission, id: string) {
  const found = m.vendors.find((v) => v.id === id);
  if (!found || !found.endpointRef.trim())
    throw new Error("Unknown vendor or unconfigured recipient endpoint");
  return found;
}
export function communicationState(
  m: Mission,
  vendorId: string,
): CommunicationState {
  const latest = [...m.effects]
    .reverse()
    .find(
      (e) =>
        e.targetId === vendorId &&
        (e.kind === "rfq" ||
          e.kind === "clarification" ||
          e.kind === "confirmation" ||
          e.kind === "rejection"),
    );
  return latest?.status ?? "none";
}
function assertProvenanceMatchesVendor(
  configured: Vendor,
  provenance: EvidenceProvenance,
) {
  if (provenance.channel !== configured.channel)
    throw new Error(
      "Evidence provenance channel does not match the configured vendor channel",
    );
  if (provenance.provider === "fixture") return;
  if (providerChannels[provenance.provider] !== configured.channel)
    throw new Error(
      "Evidence provider does not match the configured vendor channel",
    );
}
export function evaluate(m: Mission, vendorId: string): Evaluation {
  const evidence = m.evidence.filter((e) => e.vendorId === vendorId);
  const quote: Partial<Quote> = {};
  const current = new Set<string>();
  const superseded = new Map<string, string[]>();
  const conflicts: string[] = [];
  for (const field of fields) {
    const candidates = evidence
      .filter((e) => e.claims[field] !== undefined)
      .sort(
        (a, b) =>
          Number(b.authority === "vendor") - Number(a.authority === "vendor") ||
          b.revision - a.revision,
      );
    if (!candidates.length) continue;
    const top = candidates[0]!;
    const peers = candidates.filter(
      (e) => e.authority === top.authority && e.revision === top.revision,
    );
    candidates
      .filter((e) => !peers.includes(e))
      .forEach((e) =>
        superseded.set(e.id, [...(superseded.get(e.id) ?? []), field]),
      );
    peers.forEach((e) => current.add(e.id));
    if (peers.some((e) => e.claims[field] !== top.claims[field])) {
      conflicts.push(field);
      continue;
    }
    Object.assign(quote, { [field]: top.claims[field] });
  }
  const missing = fields.filter(
    (f) => quote[f] === undefined && !conflicts.includes(f),
  );
  const reasons: string[] = [];
  const r = m.requirements;
  const requiredQuantity = r.quantity;
  let totalCents: number | null = null;
  let orderQuantity: number | null = null;
  if (
    r.quantity === null ||
    r.budgetCents === null ||
    r.deadlineAt === null ||
    r.branded === null
  )
    reasons.push("Mission requirements need confirmation");
  if (missing.length === 0 && conflicts.length === 0) {
    const q = quote as Quote;
    if (requiredQuantity !== null)
      orderQuantity = Math.max(requiredQuantity, q.moq);
    if (orderQuantity !== null)
      totalCents =
        orderQuantity * q.unitCents +
        q.setupCents +
        q.deliveryCents +
        q.taxCents;
    if (q.currency !== "SGD")
      reasons.push("Currency must be SGD; conversion is not confirmed");
    if (requiredQuantity !== null && q.quantity < requiredQuantity)
      reasons.push("Quoted quantity does not cover the required quantity");
    if (orderQuantity !== null && q.stock < orderQuantity)
      reasons.push("Insufficient confirmed stock");
    if (q.deliveryAt > (r.deadlineAt ?? 0))
      reasons.push("Delivery misses the hard deadline");
    if (r.branded && !q.branded)
      reasons.push("Required branding is unavailable");
    if (totalCents !== null && totalCents > (r.budgetCents ?? 0))
      reasons.push("Landed cost exceeds the approved budget");
  }
  return {
    status: !evidence.length
      ? "waiting"
      : missing.length || conflicts.length
        ? "needs_clarification"
        : reasons.length
          ? "ineligible"
          : "eligible",
    missing,
    conflicts,
    reasons,
    requiredQuantity,
    orderQuantity,
    totalCents,
    quote,
    currentEvidenceIds: [...current],
    supersededEvidenceIds: evidence
      .filter((e) => !current.has(e.id))
      .map((e) => e.id),
    supersededClaims: [...superseded].map(([id, supersededFields]) => ({
      evidenceId: id,
      fields: supersededFields,
    })),
  };
}
export function rankSuppliers(m: Mission): SupplierRanking {
  const blockingIncomplete = m.vendors.filter((v) =>
    blocksRecommendation(m, v),
  );
  // Public web sources may remain needs_clarification after real evidence without
  // proving every supplier is ineligible — those must not flip no-viable-option.
  const unresolvedWebIncomplete = m.vendors.filter(
    (v) =>
      v.channel === "Web" &&
      v.evaluation.status === "needs_clarification" &&
      hasRealWebEvidence(m, v.id),
  );
  const eligible = m.vendors.filter(
    (v) => v.evaluation.status === "eligible" && v.evaluation.totalCents !== null,
  );
  const ranked = [...eligible].sort(
    (a, b) =>
      a.evaluation.totalCents! - b.evaluation.totalCents! ||
      a.id.localeCompare(b.id),
  );
  return {
    evidenceVersion: m.evidenceVersion,
    rankedVendorIds: ranked.map((v) => v.id),
    topVendorId: ranked[0]?.id ?? null,
    noViableOption:
      m.vendors.length > 0 &&
      blockingIncomplete.length === 0 &&
      unresolvedWebIncomplete.length === 0 &&
      ranked.length === 0,
    // Blocking incompletes only: Web with real but non-decision-ready evidence
    // stays visible via evaluation.status and does not appear here.
    incompleteVendorIds: blockingIncomplete.map((v) => v.id),
  };
}

function hasRealWebEvidence(m: Mission, vendorId: string) {
  return m.evidence.some(
    (item) =>
      item.vendorId === vendorId && item.provenance.provider === "web",
  );
}

/** Vendors that must be resolved before recommend / no-viable-option. */
function blocksRecommendation(m: Mission, v: Vendor) {
  const status = v.evaluation.status;
  if (status !== "waiting" && status !== "needs_clarification") return false;
  if (v.channel === "Web") {
    // Sourced public catalogue that still lacks fields does not stall comparison.
    if (status === "needs_clarification" && hasRealWebEvidence(m, v.id))
      return false;
    return true;
  }
  return true;
}
export function refreshDerived(m: Mission) {
  m.vendors.forEach((v) => {
    v.evaluation = evaluate(m, v.id);
    v.communication = communicationState(m, v.id);
  });
  m.ranking = rankSuppliers(m);
}
export function ingestEvidence(m: Mission, input: EvidenceInput) {
  assertProvenanceMatchesVendor(vendor(m, input.vendorId), input.provenance);
  integer(input.revision, "source revision", 1);
  integer(input.observedAt, "observed at", 1, 9000000000000);
  integer(input.provenance.observedAt, "provenance observed at", 1, 9000000000000);
  if (input.provenance.retrievedAt !== undefined)
    integer(
      input.provenance.retrievedAt,
      "retrieved at",
      1,
      9000000000000,
    );
  bounded(input.provenance.observationId, "observation id", 200);
  if (input.provenance.parentId)
    bounded(input.provenance.parentId, "parent id", 200);
  if (input.provenance.sourceLabel)
    bounded(input.provenance.sourceLabel, "source label", 200);
  if (input.provenance.url) {
    bounded(input.provenance.url, "source url", 2000);
    if (!/^https?:\/\//i.test(input.provenance.url))
      throw new Error("Evidence URL must be an http(s) locator");
  }
  for (const [field, value] of Object.entries(input.claims)) {
    if (!fields.includes(field as QuoteField))
      throw new Error("Unknown quote field");
    if (field === "branded") {
      if (typeof value !== "boolean") throw new Error("Invalid branding claim");
    } else if (field === "currency") {
      if (typeof value !== "string" || !/^[A-Z]{3}$/.test(value))
        throw new Error("Invalid currency");
    } else
      integer(
        value as number,
        field,
        field === "quantity" || field === "deliveryAt" ? 1 : 0,
        field === "deliveryAt" ? 9000000000000 : 100000000,
      );
  }
  const record: Evidence = { ...input, id: evidenceId(input) };
  const existing = m.evidence.find((old) => old.id === record.id);
  if (existing) {
    if (
      !sameJson(existing.claims, record.claims) ||
      existing.revision !== record.revision ||
      existing.vendorId !== record.vendorId ||
      existing.authority !== record.authority ||
      existing.text !== record.text ||
      !sameJson(existing.provenance, record.provenance)
    )
      throw new Error("Evidence identity was reused with different content");
    return;
  }
  if (m.evidence.length >= 120)
    throw new Error(
      "Mission evidence limit reached; start a new Development mission",
    );
  m.evidence.push(record);
  m.evidenceVersion++;
  refreshDerived(m);
  if (
    m.noViableOption &&
    m.noViableOption.evidenceVersion !== m.evidenceVersion
  )
    m.noViableOption = null;
  // Even a still-viable winner needs a new decision against changed evidence.
  if (m.state === "awaiting_approval") {
    move(m, "sourcing");
    m.recommendation = null;
  }
  if (["approved", "verifying", "complete"].includes(m.state)) {
    move(m, "blocked");
    m.activity =
      "Evidence changed after approval. Commitment is frozen for human review.";
  }
}
function latestApproval(m: Mission): Approval | undefined {
  return [...m.approvals]
    .reverse()
    .find(
      (a) =>
        a.decision === "approved" &&
        a.recommendationVersion === m.recommendation?.version &&
        a.evidenceVersion === m.evidenceVersion,
    );
}
export function contract(m: Mission): CoreWorkerContract {
  const approval = latestApproval(m);
  return {
    objective: m.request,
    idempotencyScope: m.key,
    approvalVersion: approval?.version ?? null,
    authorizedEffectKeys:
      m.state === "blocked" ? [] : m.effects.map((e) => e.key),
    requiredVerifiedEffectKeys: m.effects.map((e) => e.key),
  };
}
function addEffect(
  m: Mission,
  kind: Effect["kind"],
  targetId: string,
  payload: string,
  suffix = "",
) {
  const key = `${kind}:${m.key}:${targetId}${suffix}`;
  if (m.effects.some((e) => e.key === key)) return;
  if (m.effects.length >= 80) throw new Error("Mission effect limit reached");
  const gated = ["confirmation", "rejection", "purchase_order"].includes(kind);
  m.effects.push({
    key,
    kind,
    targetId,
    endpointRef:
      kind === "purchase_order"
        ? m.accountingEndpointRef
        : vendor(m, targetId).endpointRef,
    payload,
    gated,
    approvalVersion: gated ? (latestApproval(m)?.version ?? null) : null,
    status: "pending",
    attempts: 0,
    receiptId: null,
    verifiedAt: null,
  });
}
export function effectForExecution(m: Mission, key: string): Effect {
  const e = m.effects.find((effect) => effect.key === key);
  if (!e) throw new Error("Unknown effect");
  if (e.kind !== "purchase_order") {
    if (vendor(m, e.targetId).endpointRef !== e.endpointRef)
      throw new Error("Recipient binding changed");
  } else if (!m.accountingEndpointRef.trim())
    throw new Error("Unknown accounting endpoint");
  else if (e.endpointRef !== m.accountingEndpointRef)
    throw new Error("Accounting endpoint binding changed");
  authorizeEffect(contract(m), e);
  if (e.gated && !["approved", "verifying", "complete"].includes(m.state))
    throw new Error("Commitment is not allowed in this workflow state");
  return e;
}
export function applyCommand(
  m: Mission,
  command: Exclude<
    AgentCommand | UserCommand,
    | { type: "create" }
    | { type: "run_agent" }
    | { type: "execute_effect" }
    | { type: "verify_effect" }
    | { type: "ingest_fixture_observation" }
  >,
  now: number,
): string {
  let message = "";
  switch (command.type) {
    case "ask_requirements":
      if (m.state !== "clarifying")
        throw new Error("Requirements already confirmed");
      bounded(command.question, "Question");
      m.question = command.question;
      message = command.question;
      break;
    case "answer_requirements":
      if (m.state !== "clarifying")
        throw new Error("Requirements are frozen for this mission");
      integer(command.quantity, "quantity", 1, 1000);
      integer(command.budgetCents, "budget", 1, 10000000);
      integer(command.deadlineAt, "deadline", now + 1, 9000000000000);
      m.requirements = {
        quantity: command.quantity,
        budgetCents: command.budgetCents,
        deadlineAt: command.deadlineAt,
        branded: command.branded,
      };
      m.question = null;
      move(m, "sourcing");
      refreshDerived(m);
      message = "Brief confirmed. Ready to source four vendor options.";
      break;
    case "request_quote": {
      if (m.state !== "sourcing")
        throw new Error("Sourcing requires confirmed requirements");
      const v = vendor(m, command.vendorId);
      if (v.channel !== "Web") {
        const existing = m.effects.find(
          (e) => e.kind === "rfq" && e.targetId === v.id,
        );
        if (existing) return "Quote already requested; duplicate prevented.";
        addEffect(m, "rfq", v.id, JSON.stringify(m.requirements));
      }
      refreshDerived(m);
      message = `${v.name}: sourcing request recorded. Waiting for external evidence.`;
      break;
    }
    case "clarify_quote": {
      if (m.state !== "sourcing")
        throw new Error("Clarification is only allowed while sourcing");
      bounded(command.question, "Question");
      const v = vendor(m, command.vendorId);
      if (v.channel === "Web")
        throw new Error("Catalogue vendor has no outreach channel");
      if (!m.effects.some((e) => e.kind === "rfq" && e.targetId === v.id))
        throw new Error("Request a quote first");
      addEffect(
        m,
        "clarification",
        v.id,
        command.question,
        `:${m.evidenceVersion}`,
      );
      refreshDerived(m);
      message = `${v.name}: clarification requested. Waiting for external evidence.`;
      break;
    }
    case "ingest_external_evidence":
      ingestEvidence(m, command.evidence);
      message = `${vendor(m, command.evidence.vendorId).name}: external evidence ingested.`;
      break;
    case "recommend": {
      if (m.state !== "sourcing")
        throw new Error("Recommendation requires sourcing state");
      bounded(command.rationale, "Recommendation rationale");
      refreshDerived(m);
      if (m.ranking.incompleteVendorIds.length)
        throw new Error(
          "Collect and clarify all shortlisted quotes before comparison",
        );
      if (m.ranking.noViableOption)
        throw new Error(
          "No current supplier satisfies the confirmed constraints",
        );
      const v = vendor(m, command.vendorId);
      if (
        v.evaluation.status !== "eligible" ||
        v.evaluation.totalCents === null ||
        v.evaluation.orderQuantity === null
      )
        throw new Error("Only a complete, eligible quote can be recommended");
      if (m.ranking.topVendorId !== v.id)
        throw new Error(
          "A higher-ranked eligible supplier exists under the active policy",
        );
      m.recommendationCounter++;
      m.recommendation = {
        vendorId: v.id,
        version: m.recommendationCounter,
        evidenceVersion: m.evidenceVersion,
        totalCents: v.evaluation.totalCents,
        orderQuantity: v.evaluation.orderQuantity,
        rationale: command.rationale,
      };
      m.noViableOption = null;
      move(m, "awaiting_approval");
      message = `${v.name} recommended. Human approval required before any commitment.`;
      break;
    }
    case "record_no_viable_option": {
      if (m.state !== "sourcing")
        throw new Error("No-viable-option can only be recorded while sourcing");
      bounded(command.reason, "Reason");
      refreshDerived(m);
      if (m.ranking.incompleteVendorIds.length)
        throw new Error(
          "Collect and clarify all shortlisted quotes before concluding there is no viable option",
        );
      if (!m.ranking.noViableOption)
        throw new Error("An eligible supplier still exists");
      m.recommendation = null;
      m.noViableOption = {
        evidenceVersion: m.evidenceVersion,
        reason: command.reason,
      };
      message =
        "No current supplier satisfies the confirmed constraints. No recommendation or commitment was created.";
      break;
    }
    case "approve":
    case "reject": {
      const decision = command.type === "approve" ? "approved" : "rejected";
      const previous = m.approvals.find(
        (a) => a.recommendationVersion === command.recommendationVersion,
      );
      if (previous) {
        if (previous.decision !== decision)
          throw new Error(
            "This recommendation already has a different decision",
          );
        return "Decision already recorded; duplicate prevented.";
      }
      const rec = m.recommendation;
      if (
        m.state !== "awaiting_approval" ||
        !rec ||
        rec.version !== command.recommendationVersion ||
        rec.evidenceVersion !== m.evidenceVersion
      )
        throw new Error(
          "Recommendation changed; review the current evidence before deciding",
        );
      if (evaluate(m, rec.vendorId).status !== "eligible")
        throw new Error("Recommended vendor is no longer eligible");
      if (m.approvals.length >= 20)
        throw new Error(
          "Decision limit reached; start a new Development mission",
        );
      m.approvals.push({
        version: m.approvals.length + 1,
        recommendationVersion: rec.version,
        evidenceVersion: m.evidenceVersion,
        vendorId: rec.vendorId,
        decision,
        at: now,
      });
      if (decision === "rejected") {
        move(m, "sourcing");
        m.recommendation = null;
        message =
          "Recommendation declined. Agent may investigate or propose another option.";
        break;
      }
      move(m, "approved");
      const payload = JSON.stringify({
        vendorId: rec.vendorId,
        requiredQuantity: m.requirements.quantity,
        orderQuantity: rec.orderQuantity,
        totalCents: rec.totalCents,
        currency: "SGD",
        evidenceVersion: rec.evidenceVersion,
      });
      addEffect(m, "confirmation", rec.vendorId, payload);
      m.vendors
        .filter((v) => v.id !== rec.vendorId && v.channel !== "Web")
        .forEach((v) =>
          addEffect(
            m,
            "rejection",
            v.id,
            "This procurement has been awarded to another supplier.",
          ),
        );
      addEffect(m, "purchase_order", rec.vendorId, payload);
      refreshDerived(m);
      message =
        "Human approval persisted. Development commitment effects are now permitted.";
      break;
    }
    case "complete_mission":
      if (m.state !== "verifying")
        throw new Error("Workflow must be verifying before completion");
      assertComplete(contract(m), m.effects);
      move(m, "complete");
      message =
        "Development workflow complete. All required fixture effects independently read back and verified.";
      break;
  }
  if (m.state !== "blocked") m.activity = message;
  m.updatedAt = now;
  return message;
}
export function beginVerification(m: Mission) {
  if (m.state === "approved") move(m, "verifying");
}
