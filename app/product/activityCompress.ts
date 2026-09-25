// Presentation-only compression of Activity lists. Never invents events —
// only drops repetitive/mechanical items so the founder-facing feed reads as
// a narrative. Order and causality of kept items are preserved.

import type { ActivityItem, IntegrationActivityPayload, ManagerDecisionPayload } from "./contracts";

function isIntegration(payload: ActivityItem["payload"]): payload is IntegrationActivityPayload {
  return Boolean(payload && "integration" in payload && "action" in payload);
}

function isDecision(payload: ActivityItem["payload"]): payload is ManagerDecisionPayload {
  return Boolean(payload && "selected" in payload);
}

function isMechanicalFinding(item: ActivityItem): boolean {
  if (item.type !== "finding_added") return false;
  const finding = item.payload && "finding" in item.payload ? item.payload.finding.trim() : "";
  const title = item.title.trim();
  return /^input_check:/i.test(finding) || /^input_check:/i.test(title) || /^AVAILABLE$/i.test(finding);
}

function decisionKey(item: ActivityItem): string | null {
  if (item.type !== "manager_decision" || !isDecision(item.payload)) return null;
  const selected = item.payload.selected;
  return `${selected.approach}:${selected.label}:${/^Somebody needs approval/i.test(item.title) ? "approval" : "chosen"}`;
}

/**
 * Compresses an Activity list for display.
 *
 * Rules (deterministic, no fabrication):
 * - drop mechanical input_check findings;
 * - keep finding duplicates (Activity collapses them to a one-line note);
 * - keep at most one market_search that lists candidates (prefer latest before BUY);
 * - collapse consecutive identical MAKE decisions;
 * - keep a single intern_assigned per contiguous streak unless it precedes work_started/resumed.
 */
export function compressActivityItems(items: ActivityItem[]): ActivityItem[] {
  if (items.length === 0) return items;

  // Display order is newest-first. Work chronologically on a reversed copy,
  // then reverse back so callers keep the supplied display order.
  const chronological = [...items].reverse();
  const kept: ActivityItem[] = [];
  let lastDecisionKey: string | null = null;
  let pendingMarketSearch: ActivityItem | null = null;
  let keptMarketSearch = false;
  let lastWasInternAssigned = false;

  for (let i = 0; i < chronological.length; i++) {
    const item = chronological[i]!;
    const next = chronological[i + 1];

    if (isMechanicalFinding(item)) continue;

    if (item.type === "finding_added") {
      // Keep duplicates — Activity collapses them to a one-line note.
      kept.push(item);
      lastDecisionKey = null;
      lastWasInternAssigned = false;
      continue;
    }

    if (item.type === "integration_activity" && isIntegration(item.payload) && item.payload.action === "market_search") {
      // Hold the latest candidate-bearing search; flush it when a BUY decision
      // arrives (or at end). Earlier identical searches are dropped.
      if (item.payload.candidates && item.payload.candidates.length > 0) {
        pendingMarketSearch = item;
      } else if (!pendingMarketSearch && !keptMarketSearch) {
        pendingMarketSearch = item;
      }
      continue;
    }

    if (item.type === "manager_decision") {
      const key = decisionKey(item);
      const isBuy = isDecision(item.payload) && item.payload.selected.approach === "BUY";
      if (isBuy && pendingMarketSearch && !keptMarketSearch) {
        kept.push(pendingMarketSearch);
        keptMarketSearch = true;
        pendingMarketSearch = null;
      }
      if (key && key === lastDecisionKey && isDecision(item.payload) && item.payload.selected.approach === "MAKE") {
        continue;
      }
      kept.push(item);
      lastDecisionKey = key;
      lastWasInternAssigned = false;
      continue;
    }

    if (item.type === "intern_assigned") {
      const nextIsWork = next && (next.type === "work_started" || next.type === "work_resumed");
      if (lastWasInternAssigned && !nextIsWork) continue;
      kept.push(item);
      lastWasInternAssigned = true;
      lastDecisionKey = null;
      continue;
    }

    // Flush a held market search before non-BUY narrative continues past the
    // acquisition path (e.g. if BUY never fires, still show one search).
    if (
      pendingMarketSearch &&
      !keptMarketSearch &&
      (item.type === "acquisition_started" ||
        item.type === "external_result_received" ||
        item.type === "work_resumed" ||
        item.type === "objective_completed")
    ) {
      kept.push(pendingMarketSearch);
      keptMarketSearch = true;
      pendingMarketSearch = null;
    }

    kept.push(item);
    lastDecisionKey = null;
    lastWasInternAssigned = false;
  }

  if (pendingMarketSearch && !keptMarketSearch) {
    kept.push(pendingMarketSearch);
  }

  return kept.reverse();
}
