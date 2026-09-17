# Somebody — Project Brief

**Somebody has to do it. Now Somebody can.**

## Product thesis

Small teams constantly generate operational work that nobody formally owns.

“Can somebody get quotes?”  
“Can somebody chase the supplier?”  
“Can somebody update the sheet?”  
“Can somebody place the order?”

The individual steps are rarely difficult. The hard part is owning the whole job across apps, people, missing information, changing answers, deadlines, approvals, and real-world side effects.

Somebody is an autonomous AI coworker for those bounded jobs.

You give Somebody the outcome. It gathers context, works across systems, contacts external people, follows up, reconciles changing evidence, asks for authority when required, executes the approved outcome, and verifies that the job actually got done.

## Why this is different from a normal assistant

Tool access alone is not enough for autonomous work.

A useful worker has to know:

- whether it has enough information to act;
- which facts are current;
- when evidence conflicts or changes;
- what it is authorized to do;
- when human approval is mandatory;
- whether an action has already been performed;
- whether an API response actually produced the intended external state;
- whether the overall job is genuinely complete.

Somebody therefore separates model reasoning from application-owned policy and external proof:

```text
Model proposes
→ application policy decides whether the action is legal
→ external evidence determines whether it worked
```

## Hackathon showcase

The demonstrated job is last-minute procurement for a small company event.

The user gives one vague request:

> “Sponsor finally approved $500 for gifts for Thursday. About 25 people. Can you sort out something useful and branded? Maybe tumblers?”

Somebody then owns the job across:

- Google Calendar for event context;
- Google Drive for event/sponsor/branding context;
- public web catalogue evidence;
- Gmail for supplier RFQs and replies;
- WhatsApp and Instagram through Unipile;
- Google Sheets for a human-readable comparison;
- QuickBooks Online Sandbox for the approved Purchase Order;
- Convex for durable mission, evidence, approval, and effect state.

## The decision problem

A supplier is not comparable simply because a price exists.

Somebody normalizes and evaluates fields such as:

- required quantity;
- effective order quantity and MOQ;
- unit price;
- setup/customization cost;
- delivery cost;
- tax;
- total landed cost;
- stock;
- branding availability;
- confirmed delivery timing;
- currency;
- source identity and chronology.

Missing information stays missing. It triggers a follow-up rather than a guess.

Hard constraints are deterministic. A cheaper supplier that misses the deadline does not win.

## Changing evidence

Supplier information can change after the first reply.

Somebody preserves the evidence history while allowing newer authoritative information to supersede stale claims. Vendor eligibility and ranking are recomputed from the current evidence rather than from the model’s earlier conclusion.

This is one of the central ideas of the project: autonomous work must reconcile reality continuously instead of treating the first answer as permanent truth.

## Human authority

Research, outreach, follow-up, normalization, and recommendation may happen autonomously.

Commitment does not.

Before approval:

- no final winner confirmation is authorized;
- no loser close-out is authorized as an award outcome;
- no QuickBooks Purchase Order is authorized.

Approval is persisted application state, not just a conversational sentence interpreted by the model.

If material evidence changes after approval, the workflow fails closed rather than silently continuing on stale authority.

## Verification

A successful provider response is not considered completion.

Important side effects move through an explicit lifecycle and require read-back or equivalent external proof before they are considered verified.

For example:

```text
create QuickBooks PO
→ persist provider identity
→ independently fetch the PO
→ compare expected state
→ mark verified
```

Stable effect identities make retries idempotent so a retry does not intentionally create duplicate RFQs, confirmations, rejection messages, or Purchase Orders.

## Runtime architecture

The hackathon implementation contains one Procurement Agent using the OpenAI Agents SDK.

The main layers are:

1. **Procurement Agent** — decides how to progress the bounded job.
2. **Procurement policy** — owns domain rules such as quote completeness, hard constraints, ranking, and when clarification is needed.
3. **Reliability core** — owns workflow state, evidence history, approval gates, effect identity, verification, and completion rules.
4. **Provider adapters** — connect bounded app-owned identities to Google Workspace, Unipile, public web sources, and QuickBooks.
5. **Convex** — persists the operational state so the job does not depend on in-memory conversation history.

For the detailed implementation boundaries, see [`ARCHITECTURE.md`](ARCHITECTURE.md).

## Scope

This is intentionally one strong vertical slice rather than a generic workflow platform.

The project does not attempt to be:

- a general procurement marketplace;
- a payment system;
- a CRM;
- a browser-automation platform;
- a dynamic multi-agent organization.

Procurement is the demonstrated job. The broader product thesis is that the same reliability pattern can support other bounded operational roles where a small team needs Somebody to own the work end to end.
