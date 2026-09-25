# Somebody × OKX — Architecture

## Overview

Somebody is a persistent AI manager operating over durable company state.

It does not run a fixed workflow. Each objective is interpreted into success criteria and a dependency graph, then progressed through a repeating management loop.

```text
Founder objective
→ define outcome
→ identify requirements
→ inspect company resources
→ generate internal and external options
→ choose the next strategy
→ authorize
→ execute
→ verify
→ update company state
→ reconsider
↺
```

## System layers

### Product interface

Next.js and React provide the founder workspace:

- Objective navigation;
- Somebody status;
- Activity;
- Needs You approvals;
- Deliverables;
- Checkpoints;
- OKX transaction activity;
- final report and PDF export.

### Company state

Convex stores the authoritative operational record:

- objectives;
- outcome contracts;
- requirements;
- workers and assignments;
- decisions;
- founder approvals;
- execution intents;
- evidence;
- acquired results;
- artifacts;
- final assessments.

### Manager

LangGraph coordinates Somebody's management loop.

The graph keeps continuation state small. Business truth stays in Convex, so every consequential step can reload current state before acting.

### Internal workers

The OpenAI Agents SDK runs bounded internal workers.

Workers receive assignment-specific tools and context. They can research, inspect company records, write findings and update controlled artifacts within their assignment.

### Decision engine

The decision engine combines:

- current requirement;
- company-owned resources;
- worker capability and availability;
- open resource needs;
- verified prerequisite results;
- market offerings;
- economic facts;
- founder authority.

It produces eligible MAKE / BUY / HYBRID / WAIT / ASK / BLOCK options.

### JEV

When multiple eligible sourcing choices remain, JEV can perform structured option selection over the grounded choice set.

JEV does not decide eligibility or grant authority.

The sequence is:

```text
discover options
→ deterministic eligibility
→ JEV selection when needed
→ deterministic authorization
```

A sole eligible option can be selected directly.

### External market

External services are normalized into offerings with provider identity, service identity, resource class, supported purpose, price and execution route.

This keeps provider discovery separate from the business requirement that created demand.

### OKX payment execution

Approved acquisitions move into a dedicated payment-execution path.

The payment service:

- prepares the purchase;
- obtains the x402 challenge;
- binds the live terms to the founder-approved purchase;
- signs and submits the transaction;
- reads settlement from X Layer;
- retrieves the merchant result;
- verifies that the result matches the authorized request;
- writes the verified acquisition back into Convex.

The recorded demo runs this flow on **OKX Testnet**.

## Objective and requirement model

### Outcome Contract

The Outcome Contract describes:

- the founder's intended outcome;
- ordered outcome levels;
- the minimum completion bar.

### Requirements

Requirements describe what must become true.

They can represent:

- required evidence;
- internal work;
- an external resource;
- a final founder-facing output.

Dependencies establish causal order.

The final founder-facing requirement is resolved structurally as the terminal deliverable in the graph rather than by title keywords.

## MAKE and BUY

MAKE and BUY are requirement-level strategies.

MAKE is available when the company controls the resources and capabilities needed for the work.

BUY is available when an external offering can satisfy a real requirement and passes resource, purpose, provider, price and authority checks.

A single objective can alternate between MAKE and BUY as new facts arrive.

## Resource needs

Workers and interpretation can identify external resource requirements.

A resource need carries:

- resource class;
- purpose;
- requirement identity;
- evidence explaining why the company does not already have the needed input.

This need feeds market discovery and compatibility.

## Founder authority

Paid options require explicit founder approval when no matching spend authority exists.

The approval is persisted with the objective and decision identity. Once present, the same decision can be recomputed and authorized without inventing a new objective or bypassing the manager.

## Payment lifecycle

The economic lifecycle is explicit:

```text
authorized
→ prepared
→ submitted
→ settled
→ result received
→ verified
```

Durable purchase and execution identities let the system resume after restarts and reconcile ambiguous outcomes without creating a duplicate purchase.

## Acquired result → resumed work

Verified acquisitions become governed company inputs.

Downstream workers receive those results through the dependency graph, so external capability can materially change later internal work.

This is the core economic loop:

```text
MAKE
→ identify missing resource
→ BUY
→ verify
→ MAKE with the acquired result
```

## Final deliverable and completion

Somebody resolves the terminal founder-facing deliverable, then runs a final semantic assessment against:

- the minimum completion bar;
- the deliverable's requirement;
- satisfied prerequisite results;
- relevant verified evidence.

If the report needs revision, only the final deliverable is reopened. A corrective worker produces a newer artifact version and the assessment runs again.

Objective completion is accepted only for the current verified version.

## PDF export

The PDF renderer formats the verified artifact into a founder-ready document.

It does not create a second report. The verified artifact remains the source of truth.

## Reliability model

The runtime uses:

- stable objective, decision, assignment and purchase identities;
- idempotent writes;
- stale-action checks;
- bounded retries;
- no-progress detection;
- durable approvals;
- durable payment ledgers;
- settlement read-back;
- result verification;
- version-bound final assessment.

These mechanisms let long-running objectives continue across model calls, external services and process restarts without losing causal state.

## Demo architecture

The recorded scenario was configured to exercise both MAKE and BUY in a compact run.

The scenario uses a simulated cross-platform research benchmark. The management engine, strategy selection, approvals, payment lifecycle, downstream worker resumption, final assessment and PDF flow all use the same generic architecture described above.

Payments and settlement run on **OKX Testnet**.
