// V6 PRESENTATION — pure state → visual-treatment mapping. No business logic,
// no inference: every function here takes an already-projected product-contract
// value (ObjectiveProductStatus, SomebodyNowState, CheckpointState, …) and
// returns copy/tone/icon/pose choices only. Never reinterprets backend truth.
//
// Reuses the existing Tone/MascotPose vocabulary (app/somebody/presentation.ts,
// app/somebody/Mascot.tsx, app/somebody/Icon.tsx) as type-only imports so V6
// stays visually consistent with the rest of the brand without depending on
// the procurement-Mission domain those modules also serve.

import type { IconName } from "../somebody/Icon";
import type { MascotPose, Tone } from "../somebody/presentation";
import type {
  AcquisitionProductStatus,
  ActivityImportance,
  ActivityType,
  CheckpointState,
  CurrentWorkStatus,
  DeliverableStatus,
  InternState,
  ObjectiveLivenessPhase,
  ObjectiveProductStatus,
  ProductApproach,
  SomebodyNowState,
} from "./contracts";

export const OBJECTIVE_STATUS_LABEL: Record<ObjectiveProductStatus, string> = {
  starting: "Starting",
  working: "Working",
  waiting: "Waiting",
  needs_you: "Needs you",
  verifying: "Verifying",
  completed: "Done",
  blocked: "Blocked",
};

export function objectiveStatusTone(status: ObjectiveProductStatus): Tone {
  switch (status) {
    case "starting":
    case "working":
      return "somebody";
    case "waiting":
      return "waiting";
    case "needs_you":
      return "decision";
    case "verifying":
      return "changed";
    case "completed":
      return "verified";
    case "blocked":
      return "ineligible";
  }
}

export function somebodyNowPose(state: SomebodyNowState): MascotPose {
  switch (state) {
    case "interpreting":
      return "reading";
    case "working":
      return "typing";
    case "waiting":
      return "waiting";
    case "needs_you":
      return "presenting";
    case "verifying":
      return "verifying";
    case "completed":
      return "done";
    case "blocked":
      return "stopped";
  }
}

export function checkpointTone(state: CheckpointState): Tone {
  switch (state) {
    case "pending":
      return "neutral";
    case "active":
      return "somebody";
    case "complete":
      return "verified";
    case "blocked":
      return "ineligible";
  }
}

export const CHECKPOINT_LABEL: Record<CheckpointState, string> = {
  pending: "Pending",
  active: "In progress",
  complete: "Complete",
  blocked: "Blocked",
};

export const CURRENT_WORK_STATUS_LABEL: Record<CurrentWorkStatus, string> = {
  queued: "Queued",
  working: "Working",
  waiting: "Waiting",
  done: "Done",
  blocked: "Blocked",
};

export const APPROACH_LABEL: Record<ProductApproach, string> = {
  MAKE: "Make",
  BUY: "Buy",
  WAIT: "Wait",
  ASK: "Ask",
};

const INTERN_POSE: Record<InternState, { icon: IconName; label: string }> = {
  idle: { icon: "coffee", label: "Not yet assigned" },
  assigned: { icon: "clipboard", label: "Assigned" },
  working: { icon: "laptop", label: "Working" },
  waiting: { icon: "hourglass", label: "Needs input" },
  done: { icon: "check", label: "Done" },
};

export function internPresentation(state: InternState): { icon: IconName; label: string } {
  return INTERN_POSE[state];
}

export function somebodyByline(state: SomebodyNowState): string {
  switch (state) {
    case "interpreting":
      return "Somebody · latest update";
    case "working":
      return "Somebody · latest update";
    case "waiting":
      return "Somebody · waiting";
    case "needs_you":
      return "Somebody · waiting for you";
    case "verifying":
      return "Somebody · checking the outcome";
    case "completed":
      return "Somebody · objective verified";
    case "blocked":
      return "Somebody · stopped";
  }
}

// Short "working" copy shown next to the animated liveness indicator
// (ObjectiveHeader). Grounded in ObjectiveLivenessView.phase only — never a
// second, invented string per render. `idle` has no active-indicator copy
// since the indicator only renders while liveness.active is true.
export const LIVENESS_PHASE_LABEL: Record<ObjectiveLivenessPhase, string> = {
  interpreting: "Understanding your objective…",
  deciding: "Choosing the next move…",
  working: "Intern is working…",
  waiting_external: "Waiting on outside help…",
  verifying: "Verifying the result…",
  idle: "Somebody · working",
};

export function livenessPhaseLabel(phase: ObjectiveLivenessPhase): string {
  return LIVENESS_PHASE_LABEL[phase];
}

// Eyebrow over each Activity card: what KIND of moment this is, in founder
// language. The card title says what happened.
export function activityTypeLabel(type: ActivityType): string {
  switch (type) {
    case "objective_interpreted":
      return "Outcome";
    case "intern_assigned":
      return "Delegated";
    case "work_started":
      return "Started";
    case "work_resumed":
      return "Resumed";
    case "work_summary":
      return "Report";
    case "work_completed":
      return "Accepted";
    case "finding_added":
      return "Finding";
    case "evidence_gap_identified":
      return "Missing input";
    case "manager_decision":
      return "Decision";
    case "founder_action_required":
      return "Needs you";
    case "acquisition_started":
    case "acquisition_submitted":
    case "external_result_received":
    case "external_result_verified":
      return "Outside help";
    case "artifact_changed":
      return "Updated";
    case "verification_started":
    case "verification_completed":
      return "Verification";
    case "objective_completed":
      return "Done";
    case "objective_blocked":
      return "Stopped";
    case "integration_activity":
      return "Infrastructure";
  }
}

export function deliverableTone(status: DeliverableStatus): Tone {
  switch (status) {
    case "draft":
      return "unknown";
    case "current":
      return "somebody";
    case "verified":
      return "verified";
    case "superseded":
      return "neutral";
  }
}

export const DELIVERABLE_STATUS_LABEL: Record<DeliverableStatus, string> = {
  draft: "Draft",
  current: "Current",
  verified: "Verified",
  superseded: "Superseded",
};

export function acquisitionTone(status: AcquisitionProductStatus): Tone {
  switch (status) {
    case "proposed":
      return "unknown";
    case "needs_approval":
      return "decision";
    case "in_progress":
      return "waiting";
    case "result_received":
      return "changed";
    case "verified":
      return "verified";
    case "failed":
    case "reconciliation_required":
      return "ineligible";
  }
}

export const ACQUISITION_STATUS_LABEL: Record<AcquisitionProductStatus, string> = {
  proposed: "Proposed",
  needs_approval: "Needs approval",
  in_progress: "In progress",
  result_received: "Result received",
  verified: "Verified",
  failed: "Failed",
  reconciliation_required: "Reconciliation required",
};

const ACTIVITY_ICON: Record<ActivityType, IconName> = {
  objective_interpreted: "document",
  intern_assigned: "clipboard",
  work_started: "laptop",
  work_resumed: "laptop",
  work_summary: "chat",
  work_completed: "check",
  finding_added: "search",
  evidence_gap_identified: "alert",
  manager_decision: "sliders",
  founder_action_required: "hand",
  acquisition_started: "send",
  acquisition_submitted: "send",
  external_result_received: "mail",
  external_result_verified: "check",
  artifact_changed: "changed",
  verification_started: "hourglass",
  verification_completed: "stamp",
  objective_completed: "stamp",
  objective_blocked: "stop",
  integration_activity: "globe",
};

export function activityIcon(type: ActivityType): IconName {
  return ACTIVITY_ICON[type] ?? "clock";
}

export function activityWeightClass(importance: ActivityImportance): string {
  return `v6-activity-item--${importance}`;
}

export function activityEventClass(importance: ActivityImportance): string {
  if (importance === "major") return "v6-event--major";
  if (importance === "minor") return "v6-event--minor";
  return "";
}

// ── Checkpoint label humanizer ──────────────────────────────────────────────
//
// Requirement labels come from the engine as evidence-state nouns ("Company
// context available"). The checkpoint rail reads better as short action
// phrases ("Understand the company") — what the founder is waiting on, not
// what fact becomes true. Presentation-only: never rewrites backend truth,
// and the full original label always stays available (callers should keep it
// in a title/detail attribute).
//
// Labels observed from real runs need exact rewrites the generic rules can't
// safely produce (article insertion, dropped qualifiers, reordering), so
// those go in an exact-match table first. Anything else runs through a small
// "strip a trailing status qualifier, then map a trailing noun to a leading
// verb" pipeline, and falls back to the original label unchanged when no
// rule applies.
const CHECKPOINT_LABEL_OVERRIDES: Record<string, string> = {
  "Company context available": "Understand the company",
  "Public launch and platform research available": "Research the launch",
  "Comparative cross-platform benchmark evidence available": "Acquire audience benchmark",
  "Evidence-backed launch context": "Establish launch context",
  "Cross-platform channel recommendations": "Recommend channels",
  "Founder-ready launch-week social media plan": "Build the launch plan",
};

const CHECKPOINT_TRAILING_QUALIFIER = /\s+(?:available|completed|ready)\s*$/i;

const CHECKPOINT_NOUN_VERB_RULES: Array<{ pattern: RegExp; verb: string }> = [
  { pattern: /^(.*)\s+research$/i, verb: "Research" },
  { pattern: /^(.*)\s+recommendations?$/i, verb: "Recommend" },
  { pattern: /^(.*)\s+evidence$/i, verb: "Acquire" },
  { pattern: /^(.*)\s+context$/i, verb: "Establish" },
  { pattern: /^(.*)\s+plan$/i, verb: "Build" },
];

function lowerFirstWord(value: string): string {
  return value && /^[A-Z][a-z]/.test(value) ? value.charAt(0).toLowerCase() + value.slice(1) : value;
}

// A subject ending in a dangling conjunction/preposition ("Launch context
// and") means the trailing-noun rule sliced through a compound phrase it
// doesn't actually understand — safer to fall back than to emit that.
const CHECKPOINT_DANGLING_SUBJECT = /\b(?:and|or|of|to|with|for|the)$/i;

/** Shortens a verbose Requirement label to a short action phrase. Falls back to the original label when no rule applies. */
export function checkpointDisplayLabel(label: string): string {
  const trimmed = label.trim();
  const override = CHECKPOINT_LABEL_OVERRIDES[trimmed];
  if (override) return override;

  const stripped = trimmed.replace(CHECKPOINT_TRAILING_QUALIFIER, "").trim();
  for (const rule of CHECKPOINT_NOUN_VERB_RULES) {
    const match = stripped.match(rule.pattern);
    const subject = match?.[1]?.trim();
    if (subject && !CHECKPOINT_DANGLING_SUBJECT.test(subject)) {
      return `${rule.verb} ${lowerFirstWord(subject)}`;
    }
  }
  return label;
}
