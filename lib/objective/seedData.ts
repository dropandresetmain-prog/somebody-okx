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
  initialContent: `Current launch page

Headline: "Somebody: an AI manager for your business."
Subhead: "Automate your workflows with AI."

Audience: General small businesses.
Current result: Signups are weaker than expected, and visitors often leave without clearly understanding who Somebody is for or why it is different from other AI tools.
Status: The current message is live. Any replacement should remain a draft until it is reviewed.`,
} as const;

// Business context for the canonical demo. These records are written as normal
// company knowledge, not as instructions to the orchestration/runtime layers.
export const CANONICAL_COMPANY_PROFILE = {
  ref: "company/profile",
  label: "Company profile",
  text: `About Somebody

Somebody is an AI manager for founders running one-person companies and lean teams. It is designed to take responsibility for moving an objective forward: organising work inside the company, bringing in outside help when needed, and staying with the job until there is a usable result.

The product is for founders who personally carry several parts of the business and need important work to keep moving without adding another tool to manage.

Positioning should stay practical and outcome-focused. Do not imply that Somebody replaces the founder or guarantees a business result.`,
} as const;

export const CANONICAL_LAUNCH_BRIEF = {
  ref: "launch/context",
  label: "Launch brief",
  text: `Launch brief

Somebody has launched, but the page is not converting well.

What we know: signup conversion is weak, and many visitors do not immediately recognise that Somebody is built for founders running very small companies or understand how it differs from other AI tools.

The current page leans on broad "AI manager" and "automate your workflows" language. We suspect the positioning is too generic, but we do not yet have strong evidence for the words founders themselves use to describe the problem.

Prepare a stronger relaunch message for review today. Do not publish or send anything yet.`,
} as const;

// Backward-compatible alias retained for any code/tests that still import the
// older canonical-record name.
export const CANONICAL_COMPANY_RECORD = CANONICAL_LAUNCH_BRIEF;

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
  label: "SIMULATED founder-language research",
  content: `SIMULATED founder-language research — no live provider was called.

Three patterns repeat in the supplied sample:
- "I keep switching between selling, researching, following up, and actually doing the work."
- "AI manager" can sound like another dashboard or advisor unless it is clear that the system carries work through.
- "Automate your workflows" feels generic; concrete language about ownership, follow-through, and finished outcomes is easier to understand.

Messaging implication: lead with the founder's day-to-day operating load and the outcome Somebody takes responsibility for. Explain how the system gets the work done afterward.`,
} as const;

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
