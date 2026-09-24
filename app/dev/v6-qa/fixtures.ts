// TEST/DEV ONLY — contract-shaped fixtures for visual QA. Never imported by
// production product surfaces.

import type {
  ActivityItem,
  AttentionState,
  IntegrationIdentity,
  ObjectiveListView,
  ObjectiveWorkspaceView,
  StartCapabilitiesView,
} from "../../product/contracts";
import { INTEGRATION_IDENTITIES } from "../../product/integrations";

const NOW = 1_820_000_000_000;

const intern = { id: "w1", label: "Rae", specialty: "Growth research", state: "working" as const };

function act(over: ActivityItem): ActivityItem {
  return over;
}

export const ALL_FALSE_START: StartCapabilitiesView = {
  canCreateObjective: false,
  supportsContextRefs: false,
  supportsAttachments: false,
  advanced: { spendLimit: false, deadline: false, externalEffectPolicy: false },
};

export const QA_LIST: ObjectiveListView = {
  inProgress: [
    {
      id: "obj_working",
      title: "Launch messaging relaunch",
      status: "working",
      updatedAt: NOW,
      hasAttention: false,
      statusLabel: "Somebody working",
    },
    {
      id: "obj_queued",
      title: "Partner brief",
      status: "starting",
      updatedAt: NOW - 50_000,
      hasAttention: false,
      statusLabel: "Queued",
    },
  ],
  needsYou: [
    {
      id: "obj_needs_you",
      title: "Approve audience data",
      status: "needs_you",
      updatedAt: NOW,
      hasAttention: true,
      statusLabel: "$18 decision",
    },
  ],
  done: [
    {
      id: "obj_done",
      title: "Vendor shortlist",
      status: "completed",
      updatedAt: NOW - 80_000,
      hasAttention: false,
      statusLabel: "Verified",
    },
  ],
};

const ATTENTION: AttentionState = {
  id: "att1",
  revision: "att1:1",
  type: "approval",
  title: "Approve $18 for audience data?",
  detail: "The preferred dataset is above the existing illustrative $10 authority. Work is preserved; no purchase has been submitted.",
  context: { reason: "Authority required", amount: { amount: "18", currency: "USD" } },
  actions: [
    { id: "a1", type: "approve", label: "Approve $18" },
    { id: "a2", type: "decline", label: "Keep within $10" },
  ],
};

const WORKING_ACTIVITY: ActivityItem[] = [
  act({
    id: "act_1",
    type: "objective_interpreted",
    occurredAt: NOW - 3_600_000,
    actor: { kind: "somebody", label: "Somebody" },
    title: "Understood the objective and set the completion bar",
    detail: "A better relaunch is not done when an Intern finishes a task.",
    importance: "major",
  }),
  act({
    id: "act_2",
    type: "intern_assigned",
    occurredAt: NOW - 3_500_000,
    actor: { kind: "somebody", label: "Somebody" },
    title: "Somebody assigned Rae",
    importance: "major",
    payload: {
      intern: { ...intern, state: "assigned" },
      assignmentTitle: "Diagnose the launch message",
      scope: "Inspect owned launch context, current copy and available public evidence. Return findings, not a completion claim.",
      authorityNote: "Bounded assignment · no spending authority",
    },
  }),
  act({
    id: "act_3",
    type: "finding_added",
    occurredAt: NOW - 3_200_000,
    actor: { kind: "intern", id: "w1", label: "Rae" },
    title: "Found a pricing gap",
    detail: "The message leads with software language instead of the founder’s problem.",
    importance: "major",
    payload: {
      finding: "The current copy describes the software, not the founder’s problem.",
      evidenceRefs: [
        { id: "ev1", label: "Launch page" },
        { id: "ev2", label: "Internal context" },
      ],
    },
  }),
  act({
    id: "act_4",
    type: "work_summary",
    occurredAt: NOW - 3_100_000,
    actor: { kind: "intern", id: "w1", label: "Rae" },
    title: "Intern worked for 8 minutes",
    importance: "minor",
    payload: { summary: "Reviewed launch context, compared language, persisted diagnosis.", actionCount: 12 },
  }),
  act({
    id: "act_5",
    type: "evidence_gap_identified",
    occurredAt: NOW - 3_000_000,
    actor: { kind: "somebody", label: "Somebody" },
    title: "Owned research is still weak on current audience language",
    detail: "Somebody has identified missing proof before the next revision.",
    importance: "standard",
  }),
  act({
    id: "act_6",
    type: "manager_decision",
    occurredAt: NOW - 2_900_000,
    actor: { kind: "somebody", label: "Somebody" },
    title: "MAKE was feasible. BUY was still better for the missing evidence.",
    importance: "major",
    payload: {
      selected: { approach: "BUY", label: "Acquire audience-language evidence" },
      alternative: { approach: "MAKE", label: "Continue with owned research" },
      reason: "The gap is access to current privileged audience language that could change the message.",
    },
  }),
  act({
    id: "act_7",
    type: "external_result_received",
    occurredAt: NOW - 2_700_000,
    actor: { kind: "external", label: "Somebody Else" },
    title: "Audience-language input arrived",
    detail: "Somebody Else returned founder-language evidence that can now feed the next internal revision.",
    importance: "major",
    related: { acquisitionId: "acq1" },
    causedByActivityId: "act_6",
    provenance: "simulation",
  }),
  act({
    id: "act_8",
    type: "artifact_changed",
    occurredAt: NOW - 2_500_000,
    actor: { kind: "intern", id: "w1", label: "Rae" },
    title: "New evidence materially changed the message",
    importance: "major",
    causedByActivityId: "act_7",
    payload: {
      deliverableId: "del_1",
      before: "Automate your workflows with AI.",
      after: "Give Somebody the outcome. Somebody gets it over the line.",
      changeSummary: "Changed because the audience evidence showed “AI manager” was reading like another dashboard.",
      evidenceRefs: [{ id: "ev3", label: "Audience language" }],
    },
  }),
  act({
    id: "act_9",
    type: "work_started",
    occurredAt: NOW - 60_000,
    actor: { kind: "intern", id: "w1", label: "Rae" },
    title: "Intern is revising the final recommendation",
    detail: "The acquired evidence is explicitly in scope. Somebody still owns the completion decision.",
    importance: "standard",
  }),
];

const BASE_WORKSPACE: ObjectiveWorkspaceView = {
  objective: {
    id: "obj_working",
    title: "Get a better relaunch ready",
    request: "Our launch messaging isn’t working. Figure out what’s wrong and get a better relaunch ready.",
    status: "working",
    createdAt: NOW - 10_000_000,
    updatedAt: NOW,
  },
  progress: {
    currentPhase: "Recommendation revision",
    checkpoints: [
      { id: "c1", label: "Diagnose what isn’t working", state: "complete", detail: "Diagnosis persisted with evidence references." },
      { id: "c2", label: "Ground the direction in evidence", state: "complete", detail: "Evidence acquired and incorporated" },
      { id: "c3", label: "Produce and verify the recommendation", state: "active", detail: "Recommendation revision / verification underway" },
    ],
  },
  somebodyNow: {
    state: "working",
    headline: "The evidence changed the relaunch direction.",
    detail: "The current launch copy reads like software. New audience-language evidence points to a more concrete promise.",
    updatedAt: NOW,
  },
  liveness: {
    active: true,
    phase: "working",
    lastProgressAt: NOW,
    detail: "Fixture: live work in progress.",
  },
  currentWork: {
    id: "cw1",
    title: "Relaunch recommendation v2",
    status: "working",
    approach: "MAKE",
    intern,
    updatedAt: NOW,
  },
  activity: WORKING_ACTIVITY,
  deliverables: [
    {
      id: "del_1",
      title: "Relaunch recommendation",
      type: "document",
      version: 2,
      status: "current",
      summary: "Saved draft with revised messaging, assumptions and the recommended next move.",
      recommendedNextMove: "Test original vs revised positioning with a small set of founders.",
      updatedAt: NOW,
    },
  ],
  acquisitions: [
    {
      id: "acq1",
      resourceLabel: "Founder-language social intelligence",
      providerLabel: "Somebody Else",
      amount: { amount: "6.80", currency: "USD" },
      status: "result_received",
      provenance: "simulation",
      resultSummary: "SIMULATED acquisition boundary · no live payment occurred.",
      updatedAt: NOW,
    },
  ],
  attention: null,
  availableActions: [],
};

export function workingWorkspace(): ObjectiveWorkspaceView {
  return BASE_WORKSPACE;
}

export function needsYouWorkspace(): ObjectiveWorkspaceView {
  return {
    ...BASE_WORKSPACE,
    objective: { ...BASE_WORKSPACE.objective, id: "obj_needs_you", status: "needs_you" },
    liveness: {
      active: false,
      phase: "idle",
      lastProgressAt: NOW,
      detail: "Waiting on you.",
    },
    somebodyNow: {
      state: "needs_you",
      headline: "I need your say on one bounded decision.",
      detail: "The best available audience dataset exceeds the current illustrative limit. I’ve stopped before spending.",
      updatedAt: NOW,
    },
    currentWork: { ...BASE_WORKSPACE.currentWork!, status: "waiting", intern: { ...intern, state: "waiting" } },
    attention: ATTENTION,
    acquisitions: [],
    activity: [
      ...WORKING_ACTIVITY.slice(0, 6),
      act({
        id: "act_attn",
        type: "founder_action_required",
        occurredAt: NOW - 2_800_000,
        actor: { kind: "somebody", label: "Somebody" },
        title: "Approve $18 for audience data?",
        detail: "The preferred dataset is above the existing illustrative $10 authority.",
        importance: "major",
      }),
    ],
    progress: {
      currentPhase: "Waiting on founder authority",
      checkpoints: [
        { id: "c1", label: "Diagnose what isn’t working", state: "complete" },
        { id: "c2", label: "Ground the direction in evidence", state: "blocked", detail: "Waiting on founder authority" },
        { id: "c3", label: "Produce and verify the recommendation", state: "pending" },
      ],
    },
  };
}

// ── OKX / X Layer infrastructure story (dev-only visual QA, spec §19) ──────
// Founder-facing narrative: Somebody → OKX Marketplace → MAKE vs BUY / Jev →
// OKX Agentic Wallet / x402 → X Layer Testnet → merchant → Somebody resumes.
// Contract-shaped fixture only — never a real Objective/Luna/Nex run.

const OKX_MARKETPLACE: IntegrationIdentity = INTEGRATION_IDENTITIES.okx_marketplace;
const OKX_WALLET: IntegrationIdentity = INTEGRATION_IDENTITIES.okx_agentic_wallet;
const X_LAYER: IntegrationIdentity = INTEGRATION_IDENTITIES.x_layer_testnet;

const OKX_ACTIVITY: ActivityItem[] = [
  act({
    id: "okx_resumed",
    type: "work_resumed",
    occurredAt: NOW - 10_000,
    actor: { kind: "intern", id: "w1", label: "Rae" },
    title: "Rae resumed with the acquired result",
    importance: "standard",
  }),
  act({
    id: "okx_somebody_verified",
    type: "external_result_verified",
    occurredAt: NOW - 20_000,
    actor: { kind: "somebody", label: "Somebody" },
    title: "Verified the result for cross-platform social intelligence",
    detail: "The receipt is verified as the result of this acquisition.",
    importance: "major",
  }),
  act({
    id: "okx_merchant_result",
    type: "external_result_received",
    occurredAt: NOW - 30_000,
    actor: { kind: "external", id: "social_media_guru", label: "Social Media Guru" },
    title: "Received a result for cross-platform social intelligence",
    detail: "Received is not verified; verification is a separate step.",
    importance: "standard",
  }),
  act({
    id: "okx_xlayer_confirmed",
    type: "integration_activity",
    occurredAt: NOW - 40_000,
    actor: { kind: "external", id: "x_layer_testnet", label: "X Layer Testnet" },
    title: "Settlement confirmed",
    importance: "standard",
    payload: {
      integration: X_LAYER,
      action: "settlement_confirmed",
      headline: "Settlement confirmed",
      detail: "Payment settlement verified",
      amount: { amount: "0.01", currency: "USD₮0" },
      txHash: "0x72af1e9c8b4d3f0a5e6d7c8b9a0f1e2d3c4b5a6972af91e",
    },
  }),
  act({
    id: "okx_xlayer_submitted",
    type: "integration_activity",
    occurredAt: NOW - 50_000,
    actor: { kind: "external", id: "x_layer_testnet", label: "X Layer Testnet" },
    title: "Transaction submitted",
    importance: "standard",
    payload: {
      integration: X_LAYER,
      action: "transaction_submitted",
      headline: "Transaction submitted",
      merchantLabel: "Social Media Guru",
      amount: { amount: "0.01", currency: "USD₮0" },
      txHash: "0x72af1e9c8b4d3f0a5e6d7c8b9a0f1e2d3c4b5a6972af91e",
    },
  }),
  act({
    id: "okx_wallet_prep",
    type: "integration_activity",
    occurredAt: NOW - 60_000,
    actor: { kind: "external", id: "okx_agentic_wallet", label: "OKX Agentic Wallet" },
    title: "Preparing x402 payment",
    importance: "standard",
    payload: {
      integration: OKX_WALLET,
      action: "payment_preparing",
      headline: "Preparing x402 payment",
      merchantLabel: "Social Media Guru",
      amount: { amount: "0.01", currency: "USD₮0" },
      networkLabel: "X Layer Testnet",
    },
  }),
  act({
    id: "okx_needs_you",
    type: "founder_action_required",
    occurredAt: NOW - 75_000,
    actor: { kind: "somebody", label: "Somebody" },
    title: "Somebody needs your approval",
    detail: "A $0.01 purchase from Social Media Guru is waiting on your approval.",
    importance: "major",
  }),
  act({
    id: "okx_jev_decision",
    type: "manager_decision",
    occurredAt: NOW - 80_000,
    actor: { kind: "somebody", label: "Somebody" },
    title: "Somebody chose to buy: Social Media Guru",
    importance: "major",
    payload: {
      decisionType: "sourcing",
      selected: { optionId: "opt_buy", approach: "BUY", label: "Social Media Guru" },
      considered: [
        { optionId: "opt_make", approach: "MAKE", label: "Growth Intern", status: "ineligible", reason: "Not suitable for others" },
        { optionId: "opt_buy", approach: "BUY", label: "Social Media Guru", status: "eligible", amount: { amount: "0.01", currency: "USD₮0" } },
      ],
      selectionSource: "jev",
    },
  }),
  act({
    id: "okx_market_search",
    type: "integration_activity",
    occurredAt: NOW - 90_000,
    actor: { kind: "external", id: "okx_marketplace", label: "OKX Marketplace" },
    title: "Searched for external services",
    importance: "standard",
    payload: {
      integration: OKX_MARKETPLACE,
      action: "market_search",
      headline: "Searched for external services",
      resourceNeed: "Cross-platform social intelligence",
      candidateCount: 3,
      candidates: [
        { label: "Social Media Guru" },
        { label: "Token Market Intelligence" },
        { label: "Wallet / Onchain Risk Intelligence" },
      ],
    },
  }),
  act({
    id: "okx_outcome",
    type: "objective_interpreted",
    occurredAt: NOW - 100_000,
    actor: { kind: "somebody", label: "Somebody" },
    title: "Somebody defined the outcome",
    detail: "Get cross-platform social intelligence for the launch.",
    importance: "major",
  }),
];

export function okxIntegrationWorkspace(): ObjectiveWorkspaceView {
  return {
    ...BASE_WORKSPACE,
    objective: {
      ...BASE_WORKSPACE.objective,
      id: "obj_okx",
      title: "Get cross-platform social intelligence",
      request: "Get cross-platform social intelligence for the launch.",
      status: "working",
    },
    somebodyNow: {
      state: "working",
      headline: "Working on cross-platform social intelligence",
      detail: "Somebody bought outside help through OKX Marketplace and is verifying what came back.",
      updatedAt: NOW,
    },
    currentWork: null,
    activity: OKX_ACTIVITY,
    acquisitions: [
      {
        id: "acq_okx",
        resourceLabel: "Cross-platform social intelligence",
        providerLabel: "Social Media Guru",
        amount: { amount: "0.01", currency: "USD₮0" },
        status: "verified",
        resultSummary: "Cross-platform social intelligence delivered and verified.",
        updatedAt: NOW - 20_000,
      },
    ],
    attention: null,
    progress: {
      currentPhase: "Verifying the acquired result",
      checkpoints: [
        { id: "c1", label: "Source cross-platform social intelligence", state: "complete" },
        { id: "c2", label: "Verify the acquired result", state: "active" },
      ],
    },
  };
}

export function completedWorkspace(): ObjectiveWorkspaceView {
  return {
    ...BASE_WORKSPACE,
    objective: { ...BASE_WORKSPACE.objective, id: "obj_done", title: "Launch messaging relaunch", status: "completed" },
    liveness: {
      active: false,
      phase: "idle",
      lastProgressAt: NOW,
      detail: "No active engine step.",
    },
    somebodyNow: {
      state: "completed",
      headline: "The required outcome is verified.",
      detail: "The final recommendation is saved with revised messaging, evidence references, assumptions and the recommended next move.",
      updatedAt: NOW,
    },
    currentWork: { ...BASE_WORKSPACE.currentWork!, status: "done", intern: { ...intern, state: "done" } },
    activity: [
      ...WORKING_ACTIVITY.slice(0, 8),
      act({
        id: "act_verify",
        type: "verification_completed",
        occurredAt: NOW - 30_000,
        actor: { kind: "somebody", label: "Somebody" },
        title: "The worker is done. The Objective is now verified.",
        detail: "Somebody checked the final artifact against the locked deliverable.",
        importance: "major",
        payload: {
          checks: [
            { label: "Diagnosis supported", status: "passed" },
            { label: "Revised message persisted", status: "passed" },
            { label: "Evidence linked", status: "passed" },
            { label: "Unknowns disclosed", status: "passed" },
          ],
        },
      }),
    ],
    deliverables: [{ ...BASE_WORKSPACE.deliverables[0], status: "verified" }],
    progress: {
      currentPhase: "Verified",
      checkpoints: BASE_WORKSPACE.progress.checkpoints.map((item) => ({ ...item, state: "complete" as const })),
    },
  };
}
