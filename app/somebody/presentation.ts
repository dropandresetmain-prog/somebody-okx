// Presentation vocabulary for Somebody.
//
// Every function here maps *persisted* mission state to copy, tone and pose.
// Nothing here decides eligibility, ranking, approval or completion — those
// come from the backend (lib/procurement/domain.ts) and are only rendered.
// See DESIGN.md → "State language".

import type {
  Effect,
  Evidence,
  Mission,
  MissionEvent,
  Quote,
  Vendor,
} from "../../lib/procurement/types";

export type Tone =
  | "unknown"
  | "waiting"
  | "viable"
  | "ineligible"
  | "changed"
  | "decision"
  | "verified"
  | "somebody"
  | "neutral";

export type MascotPose =
  | "idle"
  | "reading"
  | "asking"
  | "typing"
  | "waiting"
  | "reviewing"
  | "presenting"
  | "following-up"
  | "verifying"
  | "done"
  | "stopped";

const money = new Intl.NumberFormat("en-SG", {
  style: "currency",
  currency: "SGD",
  maximumFractionDigits: 2,
});
export function formatMoney(cents: number | null | undefined) {
  return cents == null ? "—" : money.format(cents / 100);
}
export function formatDate(value: number | null | undefined) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("en-SG", {
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
  }).format(value);
}
export function formatClock(value: number | null | undefined) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("en-SG", {
    hour: "numeric",
    minute: "2-digit",
  }).format(value);
}

export const FIELD_LABELS: Record<keyof Quote, string> = {
  unitCents: "Unit price",
  setupCents: "Setup",
  deliveryCents: "Delivery fee",
  taxCents: "Tax",
  quantity: "Quantity",
  moq: "Minimum order",
  stock: "Stock",
  deliveryAt: "Arrives",
  branded: "Branding",
  currency: "Currency",
};
export function formatQuoteValue(field: keyof Quote, value: unknown): string {
  if (value == null) return "Unknown";
  if (field.endsWith("Cents")) return formatMoney(value as number);
  if (field === "deliveryAt") return formatDate(value as number);
  if (field === "branded") return value ? "Yes" : "No";
  return String(value);
}

// ── Job progress ────────────────────────────────────────────────────────────

export type StageState = "done" | "current" | "upcoming" | "stopped";
export type Stage = { id: string; label: string; state: StageState };

const STAGES = [
  { id: "brief", label: "Brief" },
  { id: "quotes", label: "Quotes" },
  { id: "decision", label: "Your decision" },
  { id: "follow", label: "Follow-through" },
  { id: "done", label: "Done & verified" },
] as const;

export function jobStages(m: Mission): Stage[] {
  const index = {
    clarifying: 0,
    sourcing: 1,
    awaiting_approval: 2,
    approved: 3,
    verifying: 3,
    blocked: 3,
    complete: 4,
  }[m.state];
  const stopped = m.state === "blocked" || m.noViableOption !== null;
  return STAGES.map((stage, i) => ({
    ...stage,
    state:
      i < index || m.state === "complete"
        ? "done"
        : i === index
          ? stopped
            ? "stopped"
            : "current"
          : "upcoming",
  }));
}

// ── Vendors ─────────────────────────────────────────────────────────────────

export function selectedVendorId(m: Mission): string | null {
  const rec = m.recommendation;
  if (!rec) return null;
  if (!["approved", "verifying", "complete", "blocked"].includes(m.state))
    return null;
  return m.approvals.some(
    (a) => a.decision === "approved" && a.recommendationVersion === rec.version,
  )
    ? rec.vendorId
    : null;
}

export type VendorStatus = { label: string; tone: Tone; note: string | null };

const REASON_COPY: Record<string, { text: string; field: keyof Quote | "total" }> = {
  "Delivery misses the hard deadline": {
    text: "Arrives after the deadline",
    field: "deliveryAt",
  },
  "Landed cost exceeds the approved budget": {
    text: "Over budget once fees are added",
    field: "total",
  },
  "Insufficient confirmed stock": { text: "Not enough stock", field: "stock" },
  "Quoted quantity does not cover the required quantity": {
    text: "Can't supply enough units",
    field: "quantity",
  },
  "Required branding is unavailable": {
    text: "Can't add your branding",
    field: "branded",
  },
  "Currency must be SGD; conversion is not confirmed": {
    text: "Not quoted in SGD",
    field: "currency",
  },
};
/** Human copy for a backend eligibility reason. Unknown reasons pass through. */
export function reasonCopy(reason: string) {
  return REASON_COPY[reason]?.text ?? reason;
}
/** The comparison column a backend reason points at (cosmetic highlight only). */
export function reasonFields(vendor: Vendor): Set<string> {
  return new Set(
    vendor.evaluation.reasons
      .map((reason) => REASON_COPY[reason]?.field)
      .filter((field): field is keyof Quote | "total" => Boolean(field)),
  );
}

export function vendorStatus(vendor: Vendor, m: Mission): VendorStatus {
  const evaluation = vendor.evaluation;
  const selected = selectedVendorId(m);
  if (selected) {
    return selected === vendor.id
      ? { label: "Selected", tone: "verified", note: "Approved by you" }
      : { label: "Not selected", tone: "neutral", note: null };
  }
  if (m.state === "awaiting_approval" && m.recommendation?.vendorId === vendor.id)
    return {
      label: "Recommended",
      tone: "decision",
      note: "Waiting for your approval",
    };
  switch (evaluation.status) {
    case "waiting":
      if (vendor.channel === "Web")
        return { label: "Not checked yet", tone: "unknown", note: null };
      return vendor.communication === "none"
        ? { label: "Not contacted yet", tone: "unknown", note: null }
        : { label: "Waiting for reply", tone: "waiting", note: null };
    case "needs_clarification":
      if (evaluation.conflicts.length)
        return {
          label: "Conflicting info",
          tone: "changed",
          note: `Doesn't add up: ${evaluation.conflicts.map(fieldLabel).join(", ")}`,
        };
      return hasFollowUp(vendor, m)
        ? {
            label: "Following up",
            tone: "waiting",
            note: `Asked about ${listFields(evaluation.missing)}`,
          }
        : {
            label: "Missing details",
            tone: "unknown",
            note: `No word yet on ${listFields(evaluation.missing)}`,
          };
    case "eligible":
      return { label: "Viable", tone: "viable", note: "Meets every requirement" };
    case "ineligible":
      return {
        label: "Ruled out",
        tone: "ineligible",
        note: evaluation.reasons[0] ? reasonCopy(evaluation.reasons[0]) : null,
      };
  }
}
function hasFollowUp(vendor: Vendor, m: Mission) {
  return m.effects.some(
    (e) => e.kind === "clarification" && e.targetId === vendor.id,
  );
}
function fieldLabel(field: string) {
  return (FIELD_LABELS[field as keyof Quote] ?? field).toLowerCase();
}
function listFields(fields: string[]) {
  const labels = fields.map(fieldLabel);
  if (labels.length <= 3) return labels.join(", ");
  return `${labels.slice(0, 3).join(", ")} +${labels.length - 3} more`;
}

export function contactCopy(vendor: Vendor): string {
  if (vendor.channel === "Web") return "Public catalogue · no outreach";
  return {
    none: "Not contacted",
    pending: `Message queued on ${vendor.channel}`,
    attempted: `Sending on ${vendor.channel}…`,
    unverified: `Sent on ${vendor.channel} · confirming`,
    verified: `Messaged on ${vendor.channel}`,
  }[vendor.communication];
}

export type ChangedFact = {
  field: keyof Quote;
  label: string;
  was: string;
  now: string;
  evidenceId: string;
};
/**
 * Facts whose value actually changed because newer evidence superseded older
 * evidence. Superseded claims that merely re-confirm the same value are left
 * to the evidence history.
 */
export function changedFacts(vendor: Vendor, evidence: Evidence[]): ChangedFact[] {
  const facts: ChangedFact[] = [];
  for (const claim of vendor.evaluation.supersededClaims ?? []) {
    const old = evidence.find((item) => item.id === claim.evidenceId);
    if (!old) continue;
    for (const raw of claim.fields) {
      const field = raw as keyof Quote;
      const before = old.claims[field];
      const after = vendor.evaluation.quote[field];
      if (before === undefined || before === after) continue;
      if (facts.some((fact) => fact.field === field)) continue;
      facts.push({
        field,
        label: FIELD_LABELS[field] ?? raw,
        was: formatQuoteValue(field, before),
        now: after === undefined ? "Unclear" : formatQuoteValue(field, after),
        evidenceId: old.id,
      });
    }
  }
  return facts;
}

export function vendorEvidence(vendor: Vendor, evidence: Evidence[]) {
  return evidence
    .filter((item) => item.vendorId === vendor.id)
    .sort((a, b) => b.observedAt - a.observedAt);
}

// ── Follow-through (effects) ────────────────────────────────────────────────

const EFFECT_TITLES: Record<Effect["kind"], string> = {
  rfq: "Quote request",
  clarification: "Follow-up question",
  confirmation: "Order confirmation",
  rejection: "Close-out note",
  purchase_order: "Purchase order",
};
export function effectCopy(effect: Effect, m: Mission) {
  const vendor = m.vendors.find((v) => v.id === effect.targetId);
  const status: { label: string; tone: Tone } = {
    pending: { label: "Queued", tone: "unknown" as Tone },
    attempted: { label: "Sending", tone: "waiting" as Tone },
    unverified: { label: "Sent · checking", tone: "waiting" as Tone },
    verified: { label: "Verified", tone: "verified" as Tone },
  }[effect.status];
  return {
    title: EFFECT_TITLES[effect.kind],
    target:
      effect.kind === "purchase_order"
        ? `Accounting · ${vendor?.name ?? effect.targetId}`
        : `${vendor?.name ?? effect.targetId} · ${vendor?.channel ?? "channel"}`,
    commitment: effect.gated,
    ...status,
  };
}

// ── Now / headline ──────────────────────────────────────────────────────────

export type Headline = {
  eyebrow: string;
  title: string;
  detail: string | null;
  tone: Tone;
  pose: MascotPose;
  live: boolean;
};

function sourcingCounts(m: Mission) {
  let replied = 0;
  let waiting = 0;
  let missing = 0;
  let notContacted = 0;
  for (const vendor of m.vendors) {
    const status = vendor.evaluation.status;
    if (status === "eligible" || status === "ineligible") replied++;
    else if (status === "needs_clarification") missing++;
    else if (vendor.channel !== "Web" && vendor.communication !== "none")
      waiting++;
    else notContacted++;
  }
  return { replied, waiting, missing, notContacted };
}
function plural(n: number, one: string, many = `${one}s`) {
  return `${n} ${n === 1 ? one : many}`;
}

/** The latest evidence, if it changed a fact we previously relied on. */
export function latestChange(m: Mission) {
  const latest = [...m.evidence].sort((a, b) => b.observedAt - a.observedAt)[0];
  if (!latest) return null;
  const vendor = m.vendors.find((v) => v.id === latest.vendorId);
  if (!vendor || !vendor.evaluation.currentEvidenceIds.includes(latest.id))
    return null;
  const facts = changedFacts(vendor, m.evidence);
  return facts.length ? { vendor, facts, evidence: latest } : null;
}

export function headline(m: Mission): Headline {
  const live = m.run?.status === "running";
  const vendorName = (id: string | undefined | null) =>
    m.vendors.find((v) => v.id === id)?.name ?? "the vendor";
  switch (m.state) {
    case "clarifying":
      return {
        eyebrow: live ? "Somebody is working" : "Somebody needs a couple of details",
        title:
          m.question ??
          (live
            ? "Reading the request and what's already known"
            : "Confirm the brief and Somebody will start sourcing"),
        detail: null,
        tone: m.question || !live ? "decision" : "somebody",
        pose: m.question ? "asking" : live ? "reading" : "asking",
        live,
      };
    case "sourcing": {
      if (m.noViableOption)
        return {
          eyebrow: "Somebody found something",
          title: "Nothing on the table fits the brief",
          detail: `${m.noViableOption.reason} Nothing was committed.`,
          tone: "ineligible",
          pose: "reviewing",
          live,
        };
      const change = latestChange(m);
      if (change)
        return {
          eyebrow: "Somebody found something",
          title: `${change.vendor.name} changed their quote`,
          detail: `${change.facts
            .map((fact) => `${fact.label}: ${fact.was} → ${fact.now}`)
            .join(" · ")}. Somebody is re-checking the options.`,
          tone: "changed",
          pose: "reviewing",
          live,
        };
      const counts = sourcingCounts(m);
      const parts = [
        counts.replied && `${plural(counts.replied, "quote")} in`,
        counts.missing && `${counts.missing} missing details`,
        counts.waiting && `${counts.waiting} waiting on a reply`,
        counts.notContacted && `${counts.notContacted} not contacted yet`,
      ].filter(Boolean);
      const complete = counts.missing + counts.waiting + counts.notContacted === 0;
      return {
        eyebrow: live ? "Somebody is working" : "Somebody is on it",
        title: complete
          ? "All quotes are in — comparing like for like"
          : `Getting quotes from ${plural(m.vendors.length, "vendor")}`,
        detail: parts.join(" · ") || null,
        tone: "somebody",
        pose: complete ? "reviewing" : counts.waiting ? "waiting" : "typing",
        live,
      };
    }
    case "awaiting_approval":
      return {
        eyebrow: "Needs your approval",
        title: `Somebody recommends ${vendorName(m.recommendation?.vendorId)}`,
        detail: null,
        tone: "decision",
        pose: "presenting",
        live: false,
      };
    case "approved":
    case "verifying": {
      const verified = m.effects.filter((e) => e.status === "verified").length;
      const commitments = m.effects.filter((e) => e.gated);
      const committed = commitments.filter((e) => e.status === "verified").length;
      return {
        eyebrow: live ? "Somebody is working" : "Somebody is finishing the job",
        title: `Confirming ${vendorName(m.recommendation?.vendorId)} and wrapping up`,
        detail: `${committed} of ${commitments.length} follow-through actions verified · ${verified} of ${m.effects.length} overall`,
        tone: "somebody",
        pose: committed > 0 ? "verifying" : "following-up",
        live,
      };
    }
    case "complete":
      return {
        eyebrow: "Done",
        title: "Done and verified.",
        detail: "Every action was read back and checked after it happened.",
        tone: "verified",
        pose: "done",
        live: false,
      };
    case "blocked":
      return {
        eyebrow: "Somebody stopped",
        title: "Something changed after you approved",
        detail:
          "New information arrived after your approval, so Somebody froze the remaining follow-through. Nothing else will be sent until a person reviews it.",
        tone: "ineligible",
        pose: "stopped",
        live: false,
      };
  }
}

// ── Activity log ────────────────────────────────────────────────────────────

const EFFECT_WORDS: Record<string, string> = {
  rfq: "Quote request",
  clarification: "Follow-up question",
  confirmation: "Order confirmation",
  rejection: "Close-out note",
  purchase_order: "Purchase order",
};
type Rewrite = [RegExp, string | ((match: RegExpMatchArray) => string)];
// Backend event/activity strings are written for engineers. These rewrites are
// wording only: meaning is preserved, the raw text stays available as a
// tooltip, and unknown strings pass through untouched.
// Park for later: move human copy into the backend messages themselves.
const REWRITES: Rewrite[] = [
  [/^Mission delegated\..*$/, "Job handed to Somebody."],
  [/^Procurement Agent started.*$/, "Somebody picked the job up."],
  [/^Procurement Agent is reviewing the mission$/, "Somebody is reviewing the job"],
  [/^(.+): external evidence ingested\.$/, (m) => `${m[1]} sent new information.`],
  [
    /^(.+): sourcing request recorded\. Waiting for external evidence\.$/,
    (m) => `${m[1]}: quote request queued. Waiting to hear back.`,
  ],
  [
    /^(.+): clarification requested\. Waiting for external evidence\.$/,
    (m) => `${m[1]}: follow-up question queued.`,
  ],
  [
    /^(.+) recommended\. Human approval required before any commitment\.$/,
    (m) => `Somebody recommends ${m[1]}. Waiting for your approval.`,
  ],
  [
    /^Human approval persisted\..*$/,
    "You approved. Somebody can now confirm the order and raise the PO.",
  ],
  [
    /^Recommendation declined\..*$/,
    "You declined. Somebody will look at the other options.",
  ],
  [
    /^(\w+): attempt recorded; not yet verified\.$/,
    (m) => `${EFFECT_WORDS[m[1]!] ?? m[1]}: sending, not verified yet.`,
  ],
  [
    /^(\w+): fixture adapter returned success\. Read-back still required\.$/,
    (m) => `${EFFECT_WORDS[m[1]!] ?? m[1]}: sent. Checking it actually landed.`,
  ],
  [
    /^(\w+): verified against independent .*read-back\.$/,
    (m) => `${EFFECT_WORDS[m[1]!] ?? m[1]}: verified by reading it back.`,
  ],
  [
    /^Development workflow complete\..*$/,
    "Done. Every action was read back and verified.",
  ],
  [
    /^Evidence changed after approval\. Commitment is frozen for human review\.$/,
    "Something changed after you approved, so Somebody froze the follow-through.",
  ],
  [
    /^Brief confirmed\. Ready to source four vendor options\.$/,
    "Brief confirmed. Somebody is sourcing from four vendors.",
  ],
];
/**
 * Convex errors arrive as "[Request ID: …] Server Error⏎Uncaught Error: <message>⏎ at …".
 * Show only the message; the full text is still in the server/browser console.
 */
export function cleanError(text: string): string {
  const match = text.match(/Uncaught Error:\s*(?:Uncaught Error:\s*)?([^\n]+)/);
  return (match?.[1] ?? text.split("\n")[0] ?? text).trim();
}
export function humanize(text: string): string {
  for (const [pattern, replacement] of REWRITES) {
    const match = text.match(pattern);
    if (match)
      return typeof replacement === "string" ? replacement : replacement(match);
  }
  return text;
}

export function eventCopy(kind: MissionEvent["kind"]): { label: string; tone: Tone } {
  return {
    agent: { label: "Somebody", tone: "somebody" as Tone },
    evidence: { label: "New info", tone: "waiting" as Tone },
    decision: { label: "Your decision", tone: "decision" as Tone },
    effect: { label: "Action", tone: "viable" as Tone },
    system: { label: "Update", tone: "neutral" as Tone },
  }[kind];
}
