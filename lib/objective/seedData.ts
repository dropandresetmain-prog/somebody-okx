// Canonical demo SEED DATA. Provider/scenario identities live here as DATA, never
// as logic in the generic runtime. This file is the only place (besides provider
// adapters, the verified service registry data and fixtures) where the launch
// scenario strings appear.
//
// The canonical objective asks for a better relaunch and permits bounded spend
// when justified. The company owns a launch artifact (page/message) that the
// internal growth worker actually mutates — MAKE is real owned-state change,
// not advice.

import type { ResourceClass } from "../workforce/types";
import type { AuthorizedPurposePolicy } from "../management/types";
import { M3_SUPPORTED_PURPOSE_KIND } from "../payment/m3FounderNarrativeProduct";

// The canonical failing-launch objective request. This is seed text, not logic.
// It asks for a better relaunch, permits bounded spend when justified, and
// deliberately leaves MAKE/BUY to Somebody.
export const CANONICAL_OBJECTIVE_REQUEST =
  "Our launch messaging isn’t working. Figure out what’s wrong and get a better relaunch ready. You can spend within the approved limit if it’s justified.";

// The controlled company artifact the growth worker reads and mutates. The
// launch page/message is DATA owned by the company; the worker changes it.
export const CANONICAL_LAUNCH_ARTIFACT = {
  key: "launch/page-message",
  label: "Launch page headline and message",
  initialContent: `Launch page — current message
Headline: "Somebody: an AI manager for your business."
Subhead: "Automate your workflows with AI."
Status: launch not converting; visitors leave without signing up.
Assumed audience: generic "businesses".
Assumed pain point: "too many tools".`,
} as const;

// The company record the growth worker reads for context (internal criteria).
export const CANONICAL_COMPANY_RECORD = {
  ref: "launch/context",
  label: "Launch context and goals",
  text: `Launch context (internal):
Goal: relaunch today with a message that converts one-person-company founders.
Current signal: low signup conversion; visitors do not recognise themselves.
Owned resources: model reasoning, public web research, company records, ordinary compute.
Constraint: no paid spend without an explicit application-approved provider path.`,
} as const;

// The factual inventory of resource classes the company controls for the
// canonical mission. Mirrors CURRENT_RESOURCE_INVENTORY but kept here as seed
// data so the demo scenario is explicit and separate from runtime policy.
export const CANONICAL_OWNED_RESOURCES: readonly ResourceClass[] = [
  "llm_reasoning",
  "public_web",
  "company_records",
  "company_tools",
  "ordinary_compute",
];

// The first bounded resource need the growth worker proposes after real MAKE
// work: it has rewritten the message from internal reasoning + public web, but
// recognises it lacks privileged social intelligence about how the target users
// actually describe the problem. This is a genuine missing resource, not
// generic cognition.
export const CANONICAL_SOCIAL_INTELLIGENCE_NEED = {
  resourceClass: "proprietary_data" as ResourceClass,
  purpose:
    "Obtain current privileged social intelligence about how target one-person-company founders describe their launch/workflow pain in their own words.",
  reasonOwnedInsufficient:
    "Owned resources cover generic reasoning and public web pages, but not the platform-derived private/privileged social dataset needed to ground the message in how the actual audience phrases the problem.",
} as const;


// M6.1-only external-boundary fixture. This is explicitly SIMULATED evidence,
// never represented as live NewsLiquid/X data. Its content is useful enough that
// a worker can materially improve the launch artifact with it, while real
// provider/payment uncertainty stays out of the first product E2E.
export const CANONICAL_SIMULATED_SOCIAL_RESULT = {
  resourceClass: "proprietary_data" as ResourceClass,
  label: "SIMULATED founder-language social intelligence",
  content: `SIMULATED proprietary social evidence — no live provider was called.
Observed audience-language patterns for one-person-company founders:
- They describe the pain as "I keep switching between selling, researching, following up, and actually doing the work."
- "AI manager" is often read as another dashboard or advisor unless the copy makes clear that work is actually carried through.
- The strongest desired outcome is one accountable system that can notice missing capability, get what it needs, do the work, and return with a finished result.
- Generic "automate your workflows" language feels broad and tool-like; concrete language about owning an outcome and finishing the job is easier to understand.
Recommended messaging implication: lead with the founder outcome and accountability, then explain the make-versus-buy capability underneath.`,
} as const;

// V7 review R4 final scope-origin correction — the canonical demo's
// APPLICATION-OWNED purpose-scope policy. This is the one Requirement kind
// (the founder-facing relaunch deliverable) the canonical demo deliberately
// authorizes to request founder_narrative_pulse's single supported purpose
// kind. Setup code (setupCanonicalDemoObjective) writes this onto the
// Objective BEFORE interpretation runs; interpretation/the model never sees
// or chooses it. General Objectives get no such policy and stay fail-closed.
export const CANONICAL_AUTHORIZED_PURPOSE_POLICY: AuthorizedPurposePolicy = {
  purposeKind: M3_SUPPORTED_PURPOSE_KIND,
  targetRequirementKind: "deliverable",
};

// A second, LATER need used only to prove the seam is repeatable: after the
// purchased intelligence changes the message, the worker needs an external
// social execution interface to publish. This is NOT fabricated as BUY #2 in
// M2 acceptance — it demonstrates repeated sourcing structurally.
export const CANONICAL_EXECUTION_NEED = {
  resourceClass: "privileged_access" as ResourceClass,
  purpose:
    "Publish the revised launch message to the company's own social channel through a maintained external execution interface.",
  reasonOwnedInsufficient:
    "The company owns the account and the intent but controls no maintained machine execution interface for the social platform.",
} as const;
