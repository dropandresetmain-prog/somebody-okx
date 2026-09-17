# Architecture

## Goal

Somebody is built to own one bounded operational job across real external systems without giving the model unchecked authority over business actions.

The hackathon implementation demonstrates that architecture through procurement.

## Runtime shape

```text
Local Somebody UI
    ↓
/api/mission (localhost-only write boundary)
    ↓
Convex Development
    ↓
Procurement Agent (OpenAI Agents SDK)
    ↓
Procurement policy + Reliability Core
    ↓
Effect / provider adapters
    ├─ Google Workspace
    ├─ Unipile → WhatsApp / Instagram
    ├─ Public Web
    └─ QuickBooks Online Sandbox
    ↓
External systems
    ↓
Read-back / verification
```

Convex is the operational source of truth for mission state, evidence, approvals, effects, and verification state.

Google Sheets is a human-readable projection, not the workflow database.

## Agent vs application policy

The model is allowed to decide how to progress the job within a bounded tool surface.

Application code owns the rules that must not depend on free-form model judgment.

### The agent owns

- deciding what information is still needed;
- choosing which bounded tool to use next;
- deciding which supplier needs clarification;
- deciding when enough evidence exists to propose a recommendation;
- explaining the current recommendation in concise language.

### Application policy owns

- valid workflow transitions;
- quote completeness;
- quantity / MOQ semantics;
- landed-cost calculation;
- hard budget, deadline, branding, stock, and currency constraints;
- deterministic ranking among eligible suppliers;
- approval requirements;
- recipient identity;
- effect idempotency;
- completion gates.

The model proposes actions. The application decides whether they are legal.

## Workflow state

The implemented mission states are:

```text
clarifying
→ sourcing
→ awaiting_approval
→ approved
→ verifying
→ complete
```

A mission can enter `blocked` when new evidence invalidates the authority under which follow-through was proceeding.

Important behavior:

- new evidence while awaiting approval invalidates the stale recommendation and returns the job to sourcing;
- new evidence after approval fails closed into `blocked` rather than allowing remaining commitments to continue on stale approval;
- `complete` is only reachable after required effects are verified.

## Evidence model

Supplier information is stored as evidence rather than being collapsed into one mutable quote object.

Each evidence item includes:

- vendor identity;
- authority (`catalogue` or `vendor`);
- source revision;
- observed time;
- raw text;
- normalized claims;
- provider/channel provenance;
- stable observation identity;
- optional source URL / message-parent identity.

The system derives the current quote from that evidence history.

### Supersession

For each quote field, newer authoritative evidence can supersede older evidence while the old observation remains stored.

This lets the UI show both:

- what the supplier said earlier;
- what is currently authoritative.

Equal-authority/equal-revision conflicts remain unresolved rather than being silently guessed through.

## Procurement evaluation

The demonstrated quote model includes:

- unit price;
- setup cost;
- delivery cost;
- tax;
- quoted quantity;
- MOQ;
- stock;
- delivery time;
- branding availability;
- currency.

The required quantity remains the user requirement. MOQ does not mutate it.

The effective order quantity is:

```text
max(required quantity, MOQ)
```

Landed cost is calculated from the effective order quantity plus setup, delivery, and tax.

A supplier is only eligible when the required evidence is complete and every hard constraint passes.

Eligible suppliers are ranked by total landed cost with a stable deterministic tie-breaker. The model may explain the result but cannot override a worse-ranked supplier into the winning position.

## Recipient identity

The model never invents an email address, WhatsApp target, Instagram target, or accounting entity.

It operates on stable vendor IDs. Application configuration resolves those IDs to bounded provider endpoints such as:

- Gmail recipient;
- Unipile account ID;
- Unipile chat ID;
- configured QuickBooks vendor/entity mapping.

This keeps external identity out of free-form model output.

## Effects and idempotency

External writes are represented as effects with stable logical identities.

Examples include:

```text
rfq:{requestId}:{vendorId}
clarification:{requestId}:{vendorId}:{version}
approval:{requestId}:{recommendationVersion}
award:{requestId}:{vendorId}
rejection:{requestId}:{vendorId}:{awardVersion}
quickbooks-po:{requestId}:{vendorId}
```

Retries reuse the same logical effect identity instead of intentionally creating a second business action.

Provider receipts are persisted so a retry can reconcile existing external state before deciding whether another provider call is necessary.

## Approval gate

Research, supplier outreach, and clarification are autonomous.

Winner confirmation, loser close-out, and Purchase Order creation are gated effects.

They are unauthorized until the user approves the current recommendation version against the current evidence version.

The agent cannot create its own approval.

## Verification

Execution and verification are separate steps.

A provider returning success moves an effect forward, but does not by itself prove that the desired external state exists.

Examples:

- Gmail / Unipile sends retain provider message IDs and can be read back;
- Google Sheets writes are followed by read-back of the projected state;
- QuickBooks Purchase Orders persist the provider entity ID and are independently fetched and checked.

The Reliability Core prevents mission completion while required effects remain pending, attempted, or unverified.

## Provider boundaries

### Google Workspace

- Calendar: bounded event read;
- Drive: bounded folder/file context read;
- Gmail: configured supplier messaging plus reply ingestion;
- Sheets: human-readable comparison projection plus read-back.

### Public Web

The web adapter retrieves a configured real catalogue source and preserves source provenance.

Public catalogue data is treated conservatively: fields absent from the source remain unknown. A web option with useful but incomplete evidence can remain visible without blocking fully evaluated contactable suppliers from being ranked.

### Unipile

WhatsApp and Instagram use app-owned account/chat bindings.

Outbound effects persist provider message identity. Inbound webhook events are correlated against configured bindings, deduplicated by provider message ID, normalized into evidence, and retain source chronology.

### QuickBooks Online Sandbox

Purchase Order creation happens only after approval.

The adapter uses stable logical identity to reconcile retries, persists the QuickBooks entity ID, and independently reads the PO back before verification.

## UI boundary

Mission Control reads persisted Convex state. It does not independently calculate eligibility, ranking, approvals, or workflow transitions.

The primary UI surfaces are:

- delegated request and confirmed constraints;
- current job state;
- supplier/channel cards;
- missing and changed evidence;
- normalized comparison;
- recommendation and approval controls;
- post-approval effect status;
- final verified completion state.

The frontend write route is intentionally localhost-only for this Development demo. Provider credentials remain server-side / Convex-side.

## Scope boundary

The architecture deliberately does not include:

- a general workflow DSL;
- dynamic multi-agent staffing;
- a role marketplace;
- a payment engine;
- a generic procurement marketplace;
- a CRM;
- unrestricted browser automation.

The goal is the smallest credible architecture that proves one autonomous worker can own a messy cross-app business job with durable evidence, bounded authority, retry safety, and verification.
