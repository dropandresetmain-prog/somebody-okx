// V6 FOUNDER LANGUAGE — deterministic presentation of recorded Product
// Contract copy. Nothing here rewrites data: every function takes a value the
// projection already supplied and returns the words the founder reads. Raw
// values stay intact on the contract (and in data-* attributes / dev tooling).
//
// Rules:
// - Internal worker keys (worker_…) are never shown; the product word is "Intern".
// - Renderers do not prefix an actor onto a title that already names one.
// - Engine phrasing (eligibility, proof obligations, boundaries) is replaced by
//   the plain product meaning, via fixed string/shape matches only — no
//   inference, no summarisation, no invented rationale.

import type {
  AcquisitionView,
  ActivityActor,
  ActivityItem,
  InternView,
  ManagerDecisionPayload,
  ProductApproach,
  SomebodyNowView,
} from "./contracts";

export const INTERN_LABEL = "Intern";

/** Internal worker keys look like `worker_company_records_lookup-document_drafting-…`. */
const WORKER_KEY = /\bworker_[a-z0-9_\-]+/gi;

export function isInternalWorkerKey(label: string | undefined | null): boolean {
  if (!label) return false;
  return /^worker_[a-z0-9_\-]+$/i.test(label.trim());
}

/** A bare machine key: snake_case, optionally namespaced (`provider:offering`). No spaces. */
export function looksLikeMachineKey(label: string | undefined | null): boolean {
  if (!label) return false;
  const value = label.trim();
  return /^[a-z0-9]+(?:[_:\-][a-z0-9]+)+$/.test(value) && /[_:]/.test(value);
}

/** `founder_narrative_pulse` → `Founder narrative pulse`; `a_b:c_d` → `C d`. */
export function humanizeKey(key: string): string {
  const tail = key.includes(":") ? key.slice(key.lastIndexOf(":") + 1) : key;
  const words = tail.replace(/[_\-]+/g, " ").trim();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

// Known controlled/test providers get a product name rather than a key.
const PROVIDER_LABEL: Record<string, string> = {
  somebody_controlled_test: "Controlled test provider",
};

export function providerDisplayName(label: string | undefined | null): string | null {
  if (!label) return null;
  if (PROVIDER_LABEL[label]) return PROVIDER_LABEL[label]!;
  return looksLikeMachineKey(label) ? humanizeKey(label) : label;
}

export function resourceDisplayName(label: string): string {
  return looksLikeMachineKey(label) ? humanizeKey(label) : label;
}

export function internDisplayName(intern: Pick<InternView, "label"> | undefined | null): string {
  if (!intern || !intern.label || isInternalWorkerKey(intern.label)) return INTERN_LABEL;
  return intern.label;
}

/** Specialty is shown only for a genuinely human-labelled Intern, never raw capability prose. */
export function internDisplayRole(intern: Pick<InternView, "label" | "specialty"> | undefined | null): string | null {
  if (!intern || isInternalWorkerKey(intern.label)) return null;
  return intern.specialty ?? null;
}

export function actorDisplayName(actor: ActivityActor): string {
  switch (actor.kind) {
    case "somebody":
      return "Somebody";
    case "intern":
      return isInternalWorkerKey(actor.label) ? INTERN_LABEL : actor.label;
    case "external":
      return providerDisplayName(actor.label) ?? "Outside provider";
    case "founder":
      return actor.label;
  }
}

// Fixed engine sentences the projection emits, mapped to their product meaning.
const ENGINE_COPY: Record<string, string> = {
  "Received is not verified; verification is a separate step.": "Somebody checks it before relying on it.",
  "The receipt is verified as the result of this acquisition. That does not by itself satisfy a requirement.":
    "Confirmed it is the result that was requested. It still has to prove useful to the work.",
  "application-verified against the current revision's proof obligations": "Checked against what this step had to prove.",
  "An authorized external action is waiting at the outside boundary. Nothing else runs until it resolves.":
    "Outside help is working on it. Somebody picks the work back up when the result returns.",
};

/**
 * Plain-language pass over recorded prose (details, summaries, headlines).
 * Not applied to artifact content or finding quotes — those are the work itself.
 */
export function humanizeProse(text: string): string {
  const mapped = ENGINE_COPY[text.trim()];
  if (mapped) return mapped;
  return (
    text
      // Worker keys inside prose read as the Intern.
      .replace(WORKER_KEY, "the Intern")
      .replace(/\b(the|The) the Intern\b/g, "$1 Intern")
      // `provider:offering` keys → offering name.
      .replace(/\b[a-z0-9]+(?:_[a-z0-9]+)*:([a-z0-9]+(?:_[a-z0-9]+)*)\b/g, (_m, tail: string) => tail.replace(/_/g, " "))
      // Artifact paths such as `launch/page-message` → `launch page message`.
      .replace(/\b([a-z]+)\/([a-z]+(?:-[a-z]+)+)\b/g, (_m, a: string, b: string) => `${a} ${b.replace(/-/g, " ")}`)
      // snake_case words (no digits: ids with digits are left alone).
      .replace(/\b[a-z]+(?:_[a-z]+)+\b/g, (m) => m.replace(/_/g, " "))
  );
}

/** Deterministic clip at a word boundary. Never cuts inside a word. */
export function clipText(text: string, max: number): string {
  const value = text.trim();
  if (value.length <= max) return value;
  const slice = value.slice(0, max);
  const cut = slice.lastIndexOf(" ");
  const base = (cut > max * 0.6 ? slice.slice(0, cut) : slice).replace(/[\s,;:.\-–—…]+$/, "");
  return `${base}…`;
}

const DECISION_HEADLINE: Record<ProductApproach, string> = {
  MAKE: "Somebody decided to handle it internally",
  BUY: "Somebody decided to bring in outside help",
  WAIT: "Somebody decided to wait",
  ASK: "Somebody decided to ask you",
};

const DECISION_OPTION_FALLBACK: Record<ProductApproach, string> = {
  MAKE: "Use the Intern",
  BUY: "Get outside help",
  WAIT: "Wait",
  ASK: "Ask you",
};

// Eligibility/authorization vocabulary that is engine state, not an option name.
const ENGINE_OPTION_LABEL = /\b(eligible|capability-matched|available|authori[sz]ed|legal option)\b/i;

/** Founder-facing name for a decision option. Keeps human labels untouched. */
export function decisionOptionLabel(option: ManagerDecisionPayload["selected"]): string {
  const label = option.label?.trim();
  if (!label || ENGINE_OPTION_LABEL.test(label)) return DECISION_OPTION_FALLBACK[option.approach];
  if (looksLikeMachineKey(label)) return humanizeKey(label);
  return label;
}

/** A short, clipped excerpt of the persisted rationale. Never invented. */
export function decisionWhy(payload: ManagerDecisionPayload): string | null {
  if (!payload.reason) return null;
  return clipText(humanizeProse(payload.reason), 240);
}

function lowerFirst(text: string): string {
  return text.charAt(0).toLowerCase() + text.slice(1);
}

/**
 * The single founder-facing sentence for an event. The actor appears at most
 * once: if the recorded title already opens with the actor it is swapped for
 * the display name; a bare past-tense Somebody title gets "Somebody" once.
 */
export function activityHeadline(item: ActivityItem): string {
  const actor = actorDisplayName(item.actor);

  if (item.type === "manager_decision" && item.payload && "selected" in item.payload) {
    return DECISION_HEADLINE[item.payload.selected.approach];
  }
  if (item.type === "intern_assigned" && item.payload && "intern" in item.payload) {
    const name = internDisplayName(item.payload.intern);
    return name === INTERN_LABEL ? "Somebody assigned the Intern" : `Somebody assigned ${name}`;
  }
  if (item.type === "external_result_received") {
    return "Outside research returned";
  }

  let title = item.title.trim();
  const raw = item.actor.label;
  if (raw && title.startsWith(raw)) {
    title = `${actor}${title.slice(raw.length)}`;
  } else if (item.actor.kind === "somebody" && /^[A-Z][a-z]+ed\b/.test(title)) {
    title = `Somebody ${lowerFirst(title)}`;
  }
  // Any remaining actor prefix duplication (e.g. "Somebody Somebody …").
  title = title.replace(/^(\S+)\s+\1\b/, "$1");
  return humanizeProse(title).replace(/^the Intern\b/, INTERN_LABEL);
}

/** Supporting line under the headline, in product language. */
export function activityDetail(item: ActivityItem): string | null {
  if (!item.detail) return null;
  if (item.type === "work_started" || item.type === "work_resumed" || item.type === "work_completed") {
    return `Assignment: ${item.detail}`;
  }
  return humanizeProse(item.detail);
}

export function evidenceRefLabel(label: string): string {
  return humanizeProse(label);
}

/** Somebody card: one headline, one concise detail. */
export function somebodyNowCopy(now: SomebodyNowView): { headline: string; detail: string } {
  return {
    headline: humanizeProse(now.headline),
    detail: clipText(humanizeProse(now.detail), 200),
  };
}

export function acquisitionResourceLabel(acquisition: Pick<AcquisitionView, "resourceLabel">): string {
  return resourceDisplayName(acquisition.resourceLabel);
}
