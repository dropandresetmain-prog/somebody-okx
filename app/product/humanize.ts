// V7 founder-facing display copy. Deterministic remapping only — never invents
// facts, never calls a model, never mutates Contract values. Activity items keep
// their supplied titles/details; these helpers choose what the UI shows by default.

import type {
  ActivityItem,
  ArtifactChangedPayload,
  ManagerDecisionPayload,
  ProductApproach,
  VerificationPayload,
} from "./contracts";

export type ActivityDisplay = {
  title: string;
  /** Supporting line under the title. Null means omit the detail paragraph. */
  detail: string | null;
  /** When true, the structured UI already carries the meaning — skip actor prefix. */
  showActor: boolean;
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

function stripSomebodyPrefix(title: string): string {
  return title.replace(/^Somebody\s+/i, "").trim() || title;
}

function stripAssignmentPrefix(title: string): string {
  return title.replace(/^Assignment:\s*/i, "").trim() || title;
}

function decisionHeadline(approach: ProductApproach): string | null {
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

function artifactHeadline(item: ActivityItem, payload: ArtifactChangedPayload | null): string {
  const raw = stripSomebodyPrefix(item.title);
  // Projection: "{label} updated to version {n}" → short product headline.
  const versioned = raw.match(/^(.*?)\s+updated to version\s+\d+$/i);
  if (versioned?.[1]) return `${versioned[1].trim()} updated`;
  return raw;
}

function workHeadline(item: ActivityItem): string {
  const raw = stripAssignmentPrefix(stripSomebodyPrefix(item.title));
  // "{Intern} started work" is noise when the Intern-working tag already says that.
  if (/^.+\s+started work$/i.test(raw)) {
    return item.detail?.trim() || "Work started";
  }
  if (/^.+\s+resumed with the acquired result$/i.test(raw)) {
    return "Intern is continuing with the acquired result";
  }
  return raw;
}

/**
 * Display title + detail for an Activity item. Falls back to supplied fields
 * whenever a sharper mapping is not justified by type / payload / approach.
 */
export function presentActivity(item: ActivityItem): ActivityDisplay {
  switch (item.type) {
    case "manager_decision": {
      if (isDecision(item.payload)) {
        const mapped = decisionHeadline(item.payload.selected.approach);
        return {
          title: mapped ?? stripSomebodyPrefix(item.title),
          // Selected option + Why disclosure own the meaning; skip duplicate detail.
          detail: null,
          showActor: false,
        };
      }
      return { title: item.title, detail: item.detail ?? null, showActor: true };
    }

    case "work_started":
    case "work_resumed": {
      const title = workHeadline(item);
      const detail = item.detail?.trim() && item.detail.trim() !== title ? item.detail : null;
      return { title, detail, showActor: false };
    }

    case "evidence_gap_identified":
      return {
        title: stripSomebodyPrefix(item.title),
        detail: item.detail ?? null,
        showActor: false,
      };

    case "acquisition_started":
    case "acquisition_submitted":
    case "external_result_received":
    case "external_result_verified":
      // Receipt grid / resource carry meaning; suppress generic lead paragraphs.
      return {
        title: stripSomebodyPrefix(item.title),
        detail: null,
        showActor: false,
      };

    case "artifact_changed": {
      const payload = isArtifact(item.payload) ? item.payload : null;
      const hasDiff = Boolean(payload && (payload.before !== undefined || payload.after !== undefined));
      return {
        title: artifactHeadline(item, payload),
        // Before/After owns the change; skip redundant prose when a diff is present.
        detail: hasDiff ? null : payload?.changeSummary ?? item.detail ?? null,
        showActor: false,
      };
    }

    case "verification_completed": {
      const payload = isVerification(item.payload) ? item.payload : null;
      return {
        title: stripSomebodyPrefix(item.title),
        // Checks list owns the meaning when present.
        detail: payload && payload.checks.length > 0 ? null : item.detail ?? null,
        showActor: false,
      };
    }

    case "objective_completed":
      return {
        title: item.title.trim() || "Objective complete",
        detail: "The required outcome is verified. Review the final deliverable and any remaining unknowns.",
        showActor: false,
      };

    case "objective_interpreted":
      return {
        title: item.title,
        detail: item.detail ?? null,
        showActor: false,
      };

    case "finding_added":
      return {
        title: stripSomebodyPrefix(item.title),
        detail: item.detail ?? null,
        showActor: true,
      };

    default:
      return {
        title: item.title,
        detail: item.detail ?? null,
        showActor: item.actor.kind !== "somebody",
      };
  }
}
