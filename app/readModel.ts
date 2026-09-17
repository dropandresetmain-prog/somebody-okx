// Pure read-model selectors for the Objective Workspace.
//
// These map PERSISTED GENERIC state into display shapes the UI renders. There
// is NO scenario or provider branching here: the UI renders whatever needs,
// candidate assessments, purchases, artifact versions and waiting state the
// backend persisted. Provider/scenario names only ever arrive as DATA inside
// these records (offering names, artifact labels) and are rendered verbatim —
// the component logic never inspects them to decide what to show.
//
// Extracted as pure functions so they are testable without React and so the
// genericity guarantee (no `if launch` / `if Newsliquid`) is enforceable by a
// source audit.

import type { ResourceClass } from "../lib/workforce/types";
import type { ResourceNeed, ResourceNeedStatus } from "../lib/objective/resourceNeed";
import type { SourcingDecision } from "../lib/sourcing/types";
import type { CandidateAssessment, AssessmentVerdict } from "../lib/market/assessment";
import type { CompanyArtifact } from "../lib/objective/artifact";
import type { PaymentState } from "../lib/payment/types";

// ── Resource need display ────────────────────────────────────────────────────

export type NeedDisplayTone = "working" | "waiting" | "done" | "blocked";

export type ResourceNeedDisplay = {
  id: string;
  resourceClass: ResourceClass;
  purpose: string;
  status: ResourceNeedStatus;
  tone: NeedDisplayTone;
  statusLabel: string;
};

// Map a need status to a human label + tone. Pure switch on the generic status
// union — never on a provider or scenario string.
export function describeNeedStatus(status: ResourceNeedStatus): {
  label: string;
  tone: NeedDisplayTone;
} {
  switch (status) {
    case "proposed":
      return { label: "Proposed", tone: "working" };
    case "active":
      return { label: "Active", tone: "working" };
    case "sourcing":
      return { label: "Sourcing", tone: "working" };
    case "buy_pending":
      return { label: "Waiting for acquisition", tone: "waiting" };
    case "fulfilled":
      return { label: "Fulfilled", tone: "done" };
    case "rejected":
      return { label: "Resolved internally", tone: "blocked" };
  }
}

export function toResourceNeedDisplay(need: ResourceNeed): ResourceNeedDisplay {
  const { label, tone } = describeNeedStatus(need.status);
  return {
    id: need.id,
    resourceClass: need.resourceClass,
    purpose: need.purpose,
    status: need.status,
    tone,
    statusLabel: label,
  };
}

// ── Candidate assessment display (incl. the rejected offering) ───────────────

export type CandidateDisplay = {
  offeringId: string;
  offeringName: string;
  verdict: AssessmentVerdict;
  verdictLabel: string;
  reasonCode: CandidateAssessment["reasonCode"];
  rationale: string;
  selected: boolean;
  priceLabel: string | null;
};

export function describeVerdict(verdict: AssessmentVerdict): string {
  switch (verdict) {
    case "eligible_buy":
      return "Eligible to buy";
    case "reject_redundant":
      return "Rejected — redundant with owned resources";
    case "reject_incompatible":
      return "Rejected — does not supply the needed resource";
    case "reject_untrusted":
      return "Rejected — unverified service";
  }
}

// Compose assessment + offering metadata + the selected id into display rows.
// `selectedOfferingId` is data; the function does not branch on provider names.
export function toCandidateDisplays(input: {
  assessments: readonly CandidateAssessment[];
  offerings: readonly {
    offeringId: string;
    name: string;
    price: { amount: string; asset: string; unit: string } | null;
  }[];
  selectedOfferingId: string | null;
}): CandidateDisplay[] {
  const byId = new Map(input.offerings.map((o) => [o.offeringId, o]));
  return input.assessments.map((a) => {
    const offering = byId.get(a.offeringId);
    return {
      offeringId: a.offeringId,
      offeringName: offering?.name ?? a.offeringId,
      verdict: a.verdict,
      verdictLabel: describeVerdict(a.verdict),
      reasonCode: a.reasonCode,
      rationale: a.rationale,
      selected: a.offeringId === input.selectedOfferingId,
      priceLabel: offering?.price
        ? `${offering.price.amount} ${offering.price.asset}/${offering.price.unit}`
        : null,
    };
  });
}

// ── Purchase / payment state display (multiple purchases under one objective) ─

export type PurchaseDisplay = {
  id: string;
  offeringId: string;
  state: PaymentState;
  stateLabel: string;
  verified: boolean;
  // True when the purchase has reached the READY_TO_SIGN boundary and is
  // waiting for an explicit, founder-authorized signing step.
  awaitingSigning: boolean;
};

// Payment states that mean "the rail is built and waiting for a human to
// authorize/sign" — surfaced distinctly so the UI never implies an automatic
// or completed payment.
export function isAwaitingSigning(state: PaymentState): boolean {
  return state === "prepared" || state === "awaiting_approval" || state === "approved";
}

export function describePaymentState(state: PaymentState): string {
  switch (state) {
    case "prepared":
      return "Prepared";
    case "awaiting_approval":
      return "Awaiting approval";
    case "approved":
      return "Approved — ready to sign";
    case "payment_attempted":
      return "Payment attempted";
    case "submitted":
      return "Submitted (not yet settled)";
    case "settled":
      return "Settled (result not yet verified)";
    case "result_received":
      return "Result received (not yet verified)";
    case "verified":
      return "Verified";
    case "failed":
      return "Failed";
    case "uncertain":
      return "Uncertain — needs reconciliation";
    case "reconciliation_required":
      return "Reconciliation required";
  }
}

export function toPurchaseDisplay(purchase: {
  id: string;
  offeringId: string;
  state: PaymentState;
  verified: boolean;
}): PurchaseDisplay {
  return {
    id: purchase.id,
    offeringId: purchase.offeringId,
    state: purchase.state,
    stateLabel: describePaymentState(purchase.state),
    verified: purchase.verified,
    awaitingSigning: isAwaitingSigning(purchase.state),
  };
}

// ── Artifact version history display ─────────────────────────────────────────

export type ArtifactVersionDisplay = {
  version: number;
  changeNote: string;
  changedAt: number;
  isCurrent: boolean;
};

export function toArtifactVersionDisplays(
  artifact: CompanyArtifact,
): ArtifactVersionDisplay[] {
  return artifact.history.map((h) => ({
    version: h.version,
    changeNote: h.changeNote,
    changedAt: h.changedAt,
    isCurrent: h.version === artifact.version,
  }));
}

// ── Composite mission read-model ─────────────────────────────────────────────

export type ObjectiveMissionView = {
  objectiveState: string;
  isWaitingForResource: boolean;
  needs: ResourceNeedDisplay[];
  // One assessment group per sourcing decision, so multiple needs/candidates
  // render as distinct steps rather than being collapsed.
  sourcingSteps: {
    decisionId: string;
    resourceNeedId: string;
    decision: SourcingDecision;
    candidates: CandidateDisplay[];
  }[];
  purchases: PurchaseDisplay[];
  artifacts: {
    key: string;
    label: string;
    currentVersion: number;
    versions: ArtifactVersionDisplay[];
  }[];
  // True when any required resource is unresolved (buy_pending) — the objective
  // cannot be presented as complete.
  hasUnresolvedRequiredResource: boolean;
};

export function buildObjectiveMissionView(input: {
  objectiveState: string;
  needs: readonly ResourceNeed[];
  decisions: readonly {
    id: string;
    resourceNeedId: string;
    decision: SourcingDecision;
    selectedOfferingId: string | null;
  }[];
  assessmentsByDecision: Record<string, readonly CandidateAssessment[]>;
  offerings: readonly {
    offeringId: string;
    name: string;
    price: { amount: string; asset: string; unit: string } | null;
  }[];
  purchases: readonly {
    id: string;
    offeringId: string;
    state: PaymentState;
    verified: boolean;
  }[];
  artifacts: readonly CompanyArtifact[];
}): ObjectiveMissionView {
  const needs = input.needs.map(toResourceNeedDisplay);
  const sourcingSteps = input.decisions.map((d) => ({
    decisionId: d.id,
    resourceNeedId: d.resourceNeedId,
    decision: d.decision,
    candidates: toCandidateDisplays({
      assessments: input.assessmentsByDecision[d.id] ?? [],
      offerings: input.offerings,
      selectedOfferingId: d.selectedOfferingId,
    }),
  }));
  const purchases = input.purchases.map(toPurchaseDisplay);
  const artifacts = input.artifacts.map((a) => ({
    key: a.key,
    label: a.label,
    currentVersion: a.version,
    versions: toArtifactVersionDisplays(a),
  }));
  const hasUnresolvedRequiredResource = input.needs.some(
    (n) => n.status === "buy_pending",
  );
  return {
    objectiveState: input.objectiveState,
    isWaitingForResource: input.objectiveState === "waiting_for_resource",
    needs,
    sourcingSteps,
    purchases,
    artifacts,
    hasUnresolvedRequiredResource,
  };
}
