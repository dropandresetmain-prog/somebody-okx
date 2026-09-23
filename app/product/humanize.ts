// Founder-facing display copy. Deterministic remapping only — never invents
// facts, never calls a model, never mutates Contract values.
//
// The Contract carries two kinds of text:
//   1. WORK content — the founder's request, findings, artifact Before/After,
//      deliverable content, external results. Rendered faithfully by components.
//   2. SYSTEM content — projection templates, engine rationale labels, worker
//      keys, provider/resource keys, status prose. Routed through this module so
//      the founder reads product language, not orchestration vocabulary.
// Anything this module does not recognise falls back to the supplied string.

import type {
  ActivityActor,
  ActivityItem,
  ArtifactChangedPayload,
  DeliverableView,
  InternView,
  ManagerDecisionPayload,
  ProductApproach,
  SomebodyNowView,
  VerificationPayload,
  WorkSummaryPayload,
} from "./contracts";

// ── Machine keys ─────────────────────────────────────────────────────────────

const MACHINE_KEY = /^[a-z][a-z0-9]*(?:[_:-][a-z0-9]+)*(?:[_:][a-z0-9]+)+$/;
const EMBEDDED_KEY = /\b[a-z][a-z0-9]*(?:_[a-z0-9]+)+\b/g;

/** True for snake_case / namespaced identifiers such as `proprietary_data`. */
export function isMachineKey(value: string): boolean {
  return MACHINE_KEY.test(value.trim());
}

function words(key: string): string {
  return key.replace(/[_:]+/g, " ").replace(/\s+/g, " ").trim();
}

// Lowercases a leading capital only when it starts an ordinary word ("Verified" → "verified", "OKX" untouched).
function lowerFirst(value: string): string {
  return /^[A-Z][a-z]/.test(value) ? value.charAt(0).toLowerCase() + value.slice(1) : value;
}

function sentenceCase(value: string): string {
  return value ? value.charAt(0).toUpperCase() + value.slice(1) : value;
}

/** `proprietary_data` → `Proprietary data`. Non-keys pass through unchanged. */
export function humanizeKey(value: string): string {
  return isMachineKey(value) ? sentenceCase(words(value)) : value;
}

/** Replaces snake_case keys embedded in a SYSTEM sentence with plain words. */
function humanizeSystemText(text: string): string {
  return text.replace(EMBEDDED_KEY, (key) => words(key));
}

// ── People ───────────────────────────────────────────────────────────────────

function isWorkerKey(label: string): boolean {
  return /^worker_/i.test(label.trim()) || isMachineKey(label);
}

/** Display name for an Intern. Worker keys are never shown to the founder. */
export function internName(label: string | undefined): string {
  if (!label || isWorkerKey(label)) return "Intern";
  return label;
}

/**
 * Short role line for an Intern. Specialty is shown only when it reads like a
 * role ("Growth research"); long capability descriptions are omitted.
 */
export function internRole(intern: Pick<InternView, "specialty"> | undefined): string | null {
  const specialty = intern?.specialty?.trim();
  if (!specialty || specialty.length > 40 || specialty.endsWith("…") || /[.;]/.test(specialty)) return null;
  return specialty;
}

export function actorName(actor: ActivityActor): string {
  switch (actor.kind) {
    case "intern":
      return internName(actor.label);
    case "external":
      return humanizeKey(actor.label);
    default:
      return actor.label;
  }
}

function possessive(name: string): string {
  return name === "Intern" ? "the Intern's" : `${name}'s`;
}

function subject(name: string): string {
  return name === "Intern" ? "The Intern" : name;
}

// ── Options (MAKE / BUY) ─────────────────────────────────────────────────────

export type OptionDisplay = { label: string; source: string | null };

/**
 * The projection labels a MAKE option with its eligibility verdict
 * ("eligible, available and capability-matched") and a BUY option with its
 * `provider:resource` key. Neither is founder language.
 */
export function presentOption(option: { approach: ProductApproach; label: string }): OptionDisplay {
  const label = option.label.trim();
  if (option.approach === "MAKE" && /\b(eligible|capability-matched)\b/i.test(label)) {
    return { label: "Use the Intern", source: null };
  }
  if (isMachineKey(label) && label.includes(":")) {
    const parts = label.split(":");
    const resource = parts.pop() ?? label;
    return { label: humanizeKey(resource), source: humanizeKey(parts.join("_")) };
  }
  return { label: humanizeKey(label), source: null };
}

// ── Evidence / deliverables ──────────────────────────────────────────────────

/** Evidence chip label. Keeps the simulation marker; drops pipeline wording. */
export function presentEvidenceLabel(label: string): string {
  const acquired = label.match(/^(SIMULATION\s+—\s+)?acquired (?:external )?result \((.+)\)$/i);
  if (acquired) {
    const name = humanizeKey(acquired[2].trim());
    return acquired[1] ? `${name} · outside result · simulated` : `${name} · outside result`;
  }
  return humanizeSystemText(label);
}

/** Drops a leading "Version N:" — the version is already on the card. */
export function presentDeliverableSummary(summary: string): string {
  return sentenceCase(summary.replace(/^version\s+\d+\s*:\s*/i, "").trim());
}

export function deliverableKind(type: string): string {
  return sentenceCase(words(type));
}

// ── Somebody Now ─────────────────────────────────────────────────────────────

// Fixed projection templates (lib/product/frontendProjection.ts) → product copy.
const SOMEBODY_NOW_DETAIL: Record<string, string> = {
  "Somebody is turning your request into an outcome that can be proved.":
    "Turning your request into a clear outcome it can check.",
  "Somebody is deciding the next move from what is already established.":
    "Deciding the next move from what is already known.",
  "An intern is doing one bounded piece of work. Somebody holds the outcome.":
    "The Intern is on one focused task. Somebody owns the outcome.",
  "Somebody is acquiring an outside resource for the next step.": "Bringing in outside help for the next step.",
  "An authorized external action is waiting at the outside boundary. Nothing else runs until it resolves.":
    "Waiting for outside help to come back. Nothing else moves until it does.",
  "Somebody is waiting on a real external or timed condition. Nothing runs until it resolves.":
    "Waiting on an outside or timed condition. Nothing moves until it clears.",
  "Somebody is assessing the deliverable against the required outcome.":
    "Checking the deliverable against the outcome.",
  "Work has arrived. Somebody is checking it against the required outcome before accepting anything.":
    "New work is in. Somebody is checking it before accepting it.",
};

export type SomebodyNowDisplay = { headline: string; detail: string | null };

/**
 * Top-card copy. At completion the card stays calm: one sentence naming the
 * verified deliverable (only when its supplied status is `verified`); the full
 * summary lives on the Deliverables card.
 */
export function presentSomebodyNow(now: SomebodyNowView, deliverables: DeliverableView[] = []): SomebodyNowDisplay {
  // Requirement titles are outcome-phrased ("Messaging diagnosis completed"), so
  // "Working on <title>" reads as done; "Working toward" keeps the meaning.
  const headline = humanizeSystemText(now.headline).replace(/^Working on (?!your objective$)(.+)$/, "Working toward: $1");
  if (now.state === "completed") {
    const verified = deliverables.find((item) => item.status === "verified");
    if (verified) {
      return { headline, detail: `${verified.title} (version ${verified.version}) passed the final check.` };
    }
    return { headline, detail: now.detail || null };
  }
  const detail = SOMEBODY_NOW_DETAIL[now.detail] ?? now.detail;
  return { headline, detail: detail || null };
}

// ── Activity ─────────────────────────────────────────────────────────────────

export type ActivityDisplay = {
  title: string;
  /** Supporting line under the title. Null means omit the paragraph. */
  detail: string | null;
  /** Small labelled fact under the title (e.g. the assignment goal, version). */
  meta: string | null;
};

function isDecision(payload: ActivityItem["payload"]): payload is ManagerDecisionPayload {
  return Boolean(payload && "selected" in payload);
}

function isArtifact(payload: ActivityItem["payload"]): payload is ArtifactChangedPayload {
  return Boolean(payload && "changeSummary" in payload && "deliverableId" in payload);
}

function isVerification(payload: ActivityItem["payload"]): payload is VerificationPayload {
  return Boolean(payload && "checks" in payload);
}

function isWorkSummary(payload: ActivityItem["payload"]): payload is WorkSummaryPayload {
  return Boolean(payload && "summary" in payload && !("finding" in payload) && !("changeSummary" in payload));
}

function stripSomebodyPrefix(title: string): string {
  return sentenceCase(title.replace(/^Somebody\s+/i, "").trim()) || title;
}

function decisionHeadline(approach: ProductApproach, needsApproval: boolean): string {
  if (needsApproval) {
    return approach === "BUY" ? "Outside help needs your approval" : "This step needs your approval";
  }
  switch (approach) {
    case "MAKE":
      return "Keep this in-house";
    case "BUY":
      return "Bring in outside help";
    case "WAIT":
      return "Wait before moving";
    case "ASK":
      return "Ask before moving";
  }
}

// Projection work-summary templates that describe checking mechanics.
function presentWorkSummary(summary: string): string {
  if (/^application-verified against the current revision'?s proof obligations$/i.test(summary.trim())) {
    return "Somebody checked it against the brief.";
  }
  return summary;
}

function receiptTitle(item: ActivityItem): string {
  const title = stripSomebodyPrefix(item.title);
  const authorized = title.match(/^Authorized acquiring (.+)$/i);
  if (authorized) return `Authorized getting ${humanizeSystemText(authorized[1])}`;
  return humanizeSystemText(title);
}

/**
 * Display copy for an Activity item. Falls back to supplied fields whenever a
 * sharper mapping is not justified by type / payload / a known template.
 */
export function presentActivity(item: ActivityItem): ActivityDisplay {
  const actor = actorName(item.actor);
  switch (item.type) {
    case "objective_interpreted":
      return { title: item.title.replace(/\s*\(revision \d+\)$/i, ""), detail: item.detail ?? null, meta: null };

    case "manager_decision":
      if (isDecision(item.payload)) {
        return {
          title: decisionHeadline(item.payload.selected.approach, /^Somebody needs approval/i.test(item.title)),
          // Selected option + Why disclosure own the meaning.
          detail: null,
          meta: null,
        };
      }
      return { title: humanizeSystemText(item.title), detail: item.detail ?? null, meta: null };

    case "work_started":
      return { title: `${subject(actor)} started work`, detail: null, meta: item.detail ?? null };

    case "work_resumed":
      return {
        title: `${subject(actor)} picked the work back up with the outside result`,
        detail: null,
        meta: item.detail ?? null,
      };

    case "work_summary": {
      const summary = isWorkSummary(item.payload) ? item.payload.summary : item.detail;
      return { title: `${subject(actor)} reported back`, detail: summary ? presentWorkSummary(summary) : null, meta: null };
    }

    case "work_completed":
      return { title: `Somebody accepted ${possessive(actor)} work`, detail: item.detail ?? null, meta: null };

    case "evidence_gap_identified":
      // The missing thing is the message; "Missing input" is already the eyebrow.
      if (item.detail && /^identified missing input$/i.test(stripSomebodyPrefix(item.title))) {
        return { title: `Somebody still needs ${lowerFirst(item.detail)}`, detail: null, meta: null };
      }
      return { title: stripSomebodyPrefix(item.title), detail: item.detail ?? null, meta: null };

    case "acquisition_started":
    case "acquisition_submitted":
    case "external_result_received":
    case "external_result_verified":
      // Receipt grid carries resource / provider / status; the supplied detail
      // lines describe pipeline semantics, not the business event.
      return { title: receiptTitle(item), detail: null, meta: null };

    case "artifact_changed": {
      const payload = isArtifact(item.payload) ? item.payload : null;
      const hasDiff = Boolean(payload && (payload.before !== undefined || payload.after !== undefined));
      const raw = stripSomebodyPrefix(item.title);
      const versioned = raw.match(/^(.*?)\s+updated to version\s+(\d+)$/i);
      return {
        title: versioned?.[1] ? versioned[1].trim() : raw,
        // Before/After owns the change; skip redundant prose when a diff is present.
        detail: hasDiff ? null : payload?.changeSummary ?? item.detail ?? null,
        meta: versioned?.[2] ? `Now version ${versioned[2]}` : null,
      };
    }

    case "verification_completed": {
      const payload = isVerification(item.payload) ? item.payload : null;
      return {
        title: stripSomebodyPrefix(item.title),
        // Checks list owns the meaning when present.
        detail: payload && payload.checks.length > 0 ? null : item.detail ?? null,
        meta: null,
      };
    }

    case "objective_completed":
      return { title: item.title.trim() || "Objective complete", detail: "The final deliverable is ready to review.", meta: null };

    case "finding_added":
      return { title: humanizeSystemText(item.title), detail: item.detail ?? null, meta: null };

    default:
      return { title: humanizeSystemText(item.title), detail: item.detail ?? null, meta: null };
  }
}
