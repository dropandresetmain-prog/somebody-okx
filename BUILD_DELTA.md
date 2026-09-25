# Build Delta — What Somebody × OKX Adds

## Why this document exists

Somebody × OKX did not start from an empty repository.

The starting Somebody project already proved several useful foundations: bounded agent execution, persistent operational state, evidence tracking, human approvals, external-action verification, provider integrations and the Somebody product identity.

The OKX build turned that foundation into a much broader product: a persistent AI manager that can interpret arbitrary founder objectives, assemble internal capability, compare MAKE and BUY options, use external markets, execute approved purchases on OKX Testnet, bring acquired capability back into the company and continue managing until a verified deliverable exists.

This document focuses on that delta.

## Starting point: the original Somebody foundation

Before the OKX build, Somebody already had:

- a working Next.js / React / Convex application;
- Somebody branding and product UI primitives;
- bounded agent execution through the OpenAI Agents SDK;
- durable run state and evidence history;
- human approval for consequential actions;
- idempotent external-effect handling and verification;
- integrations built for a procurement workflow, including Google Workspace, public web research, messaging and accounting;
- a strong architectural rule: models propose actions, application code owns authority and completion.

That foundation was useful, but it was still centered on a specific procurement job.

## What we built for Somebody × OKX

### 1. A generic Objective engine

The biggest change is that Somebody is no longer tied to a procurement workflow.

A founder gives Somebody an objective in ordinary language. Somebody turns it into:

- an **Outcome Contract** describing what success means;
- ordered outcome levels;
- a minimum completion bar;
- a dependency graph of requirements;
- a sequence of bounded actions that can be reconsidered as new evidence arrives.

This lets the same engine reason about research, planning, sourcing, execution and final deliverables without hardcoding a single workflow.

### 2. A real managerial loop

Somebody now runs as a persistent manager rather than a one-shot agent.

The loop is:

```text
observe
→ interpret
→ plan
→ choose the next action
→ execute
→ verify
→ update company state
→ reconsider
↺
```

A worker finishing a task does not automatically complete the objective. Somebody continues until the current success criteria are actually met.

### 3. Dynamic internal workforce

Somebody can create or reuse bounded internal workers based on the capability needed for the current requirement.

Workers have:

- a defined responsibility;
- a governed capability set;
- a bounded tool surface;
- assignment-specific context and authority;
- persisted results that can feed later requirements.

This turns the original single-role runtime into a reusable internal workforce managed by Somebody.

### 4. MAKE / BUY as a first-class economic decision

Somebody now decides whether a requirement should be:

- **MAKE** — handled with company-controlled capability;
- **BUY** — acquired from an external provider;
- **HYBRID** — combined internal and external work;
- **WAIT** — pause for a dependency;
- **ASK** — request founder input or authority;
- **BLOCK** — surface that the current requirement cannot proceed.

MAKE and BUY are not fixed at the objective level. Different requirements inside the same objective can take different paths.

The decision is grounded in current resources, capability, cost, provider fit, evidence, availability and authority.

### 5. Resource-gap detection

Somebody can distinguish between:

- information or capability the company already controls;
- information that can be obtained through ordinary public research;
- external resources that must be acquired.

When a required external resource is missing, that fact becomes part of the decision state and can open a BUY path.

This is why the engine can move from internal work to external acquisition without hardcoded choreography.

### 6. External market discovery and compatibility

We added a provider/resource market layer that represents external services as economic options.

Each offering carries facts such as:

- what resource class it provides;
- what purpose it supports;
- price;
- execution route;
- provider identity;
- compatibility with the current requirement.

Application logic filters the market before any model can select an option.

### 7. JEV integration for managerial option selection

JEV is integrated into the sourcing decision layer.

When multiple eligible options remain, Somebody can pass the grounded choice set to **JEV** for structured option composition/selection. JEV operates only after deterministic eligibility filtering and before deterministic authorization.

That means:

```text
all discovered options
→ eligibility filter
→ JEV selection when choice remains
→ authorization recheck
→ execution
```

If there is only one eligible option, the engine can select it directly without a redundant model call.

JEV is therefore part of the generic decision engine, not a hardcoded demo step.

### 8. Founder approval as economic authority

We added a product-level approval surface for spend.

When Somebody recommends a paid acquisition and no matching spend authority exists:

- the objective moves to **Needs You**;
- the founder sees the exact bounded amount;
- approval creates a durable spend grant tied to the current objective and decision;
- the same requirement is re-evaluated with that authority present.

The founder approves the economic action; the payment system executes the already-authorized intent.

### 9. OKX x402 payment execution

We built an end-to-end payment path using OKX technology:

- x402 payment challenge;
- founder-approved purchase terms;
- signing and submission through the OKX payment stack;
- X Layer transaction execution;
- settlement observation;
- provider-result retrieval;
- independent result verification;
- durable state across retries and restarts.

The recorded demo runs this flow on **OKX Testnet**.

### 10. Payment lifecycle and reconciliation

Payment is modeled as a stateful process rather than a single API call.

The engine distinguishes:

```text
authorized
→ prepared
→ submitted
→ settled
→ result received
→ verified
```

That lets Somebody resume correctly after process restarts, distinguish submission from settlement, and reconcile ambiguous outcomes without duplicating the economic action.

### 11. External results become company inputs

A purchase is not the end of the objective.

Verified acquired information is written back into company state with provenance and then passed into downstream internal work.

This enables the important loop:

```text
MAKE
→ discover missing resource
→ BUY
→ verify acquisition
→ MAKE again using the acquired result
```

The final output can therefore change because of what Somebody acquired.

### 12. Final deliverable lifecycle

We added a governed final-output process:

- identify the terminal founder-facing deliverable in the requirement graph;
- assess it against the objective's minimum completion bar;
- reopen only that deliverable when revision is needed;
- run one bounded corrective editing pass;
- assess the new artifact version again;
- mark the objective complete only when the current version passes.

This keeps prerequisites and acquired evidence intact while allowing the final report itself to improve.

### 13. Founder-ready PDF export

The verified final artifact can be exported directly as a PDF.

The PDF layer is deterministic presentation of the accepted artifact: report hierarchy, headings, lists, page breaks and metadata are applied without creating a second competing source of truth.

### 14. A new founder-facing workspace

The product UI was rebuilt around an objective rather than an agent transcript.

The current surface shows:

- Objectives;
- what Somebody is doing now;
- Activity;
- Needs You approvals;
- Deliverables;
- Checkpoints;
- the OKX stack during economic execution;
- the final verified deliverable.

The goal is to show a company moving around an objective, not expose raw orchestration machinery.

### 15. Model portability and reliability

The engine was hardened across model families and structured-call boundaries.

Current GPT-family execution uses **GPT-6 Luna** through OpenRouter. The manager and worker boundaries include structured repair, bounded retries, no-progress detection, stale-action protection and persistent continuation state.

This work made the runtime less dependent on any single model's quirks.

## Before and after

| Capability | Original Somebody | Somebody × OKX |
| --- | --- | --- |
| Primary product model | Role-specific operational workflow | Generic objective manager |
| Success model | Role-specific completion | Outcome Contract + requirement graph |
| Internal workforce | Bounded agent runtime | Persistent reusable workers + assignment contracts |
| MAKE / BUY | Not a general product primitive | First-class per-requirement strategy |
| Resource gaps | Role-specific missing facts | Governed resource classes and needs |
| External market | Provider integrations | Discoverable economic option set |
| Option selection | Role logic / model choice | Eligibility → JEV/sole eligible → authorization |
| Founder authority | Existing approval patterns | Bounded economic approval in product UI |
| Payments | Not part of the original product core | x402 + OKX + X Layer Testnet |
| Economic state | External effects | Full purchase/settlement/result lifecycle |
| Purchased data reuse | Not a generic loop | Verified acquisition feeds downstream MAKE |
| Final output | Role-specific result | Terminal deliverable + semantic quality pass |
| Export | No general report export | Verified PDF |
| UI | Mission/workflow-oriented | Objective-centered company-in-motion workspace |

## Recorded demo

The recorded demo is based on a completed run configured to exercise both MAKE and BUY paths.

The scenario uses a simulated cross-platform research benchmark to make both paths visible in one compact objective. The underlying engine remains generic: it derives requirements, checks company resources, discovers market options, uses JEV when multiple eligible choices remain, asks for founder authority when required, executes the selected path and replans from verified results.

The payment and settlement sequence runs on **OKX Testnet**.

## The result

Somebody × OKX is not the original Somebody project with a payment button added.

The OKX build adds a full managerial and economic layer: objectives, requirements, dynamic workforce, resource economics, market discovery, JEV-assisted selection, approval, x402 execution, X Layer settlement, acquisition verification, downstream reuse, final semantic review and verified report export.

That is the core product built in this repository during the OKX project.
