# Somebody × OKX — Product Spec

Status: **canonical product scope**  
Date: **17 September 2026**

## 1. Vision

> **One person should be able to operate with the functional reach of a much larger company.**

Somebody is the AI manager for that company. The user manages one Somebody; Somebody manages the work underneath.

The practical wedge is one-person companies, founder-led businesses and lean SMEs where important cross-functional work repeatedly falls back onto the founder, GM or operations lead.

## 2. Customer problem

Small teams do not lack work. They lack:

- clear ownership for cross-functional jobs;
- spare execution capacity;
- specialist expertise or resources for occasional needs.

Somebody should increasingly move the user from:

> “I need to find the person/tool/vendor who can do this.”

To:

> “Somebody, get this outcome done.”

## 3. Product thesis

Somebody owns business objectives and assembles the capabilities needed to deliver them.

The customer-facing product should stay simple. Users should not need to understand worker contracts, model routing, marketplace mechanics or payment protocols.

The locked delivery plan is in `MASTER_PLAN.md`; the technical boundaries are in `ARCHITECTURE.md`.

## 4. OKX Dev Day thesis

The hackathon adds one organizational/economic primitive:

> **Somebody can determine whether required work should be MADE internally or BOUGHT externally, then assemble both into one completed outcome.**

This matters to a One Person Company because it cannot pre-hire, pre-subscribe to or pre-integrate every capability it may someday need.

### MAKE path

A capability is internal when Somebody can construct it from resources the company already controls.

Examples of owned resources:

- generic LLM reasoning;
- public web/search;
- company documents and databases;
- existing authenticated company systems;
- ordinary application compute;
- reusable company tools.

A missing pre-existing worker is **not** a capability gap. Somebody may create or reuse a bounded internal worker for the task.

MAKE is not satisfied by merely producing a worker specification. The product must be able to turn a validated worker into actual bounded execution:

`WorkerSpec → WorkContract → model selection → agent instantiation → allowed tools → execution → evidence/result`

The worker must do useful tool-mediated work. A single free-form model completion does not prove the MAKE architecture.

### BUY path

A capability is external when completing it depends on a resource controlled by another economic entity.

Strong BUY reasons include:

- proprietary or licensed data;
- privileged platform access;
- independent real-world action;
- external attestation or verification;
- specialist infrastructure;
- scarce or specialist compute;
- credentials, networks or authority unavailable internally;
- a capability materially uneconomic or impractical to reproduce.

### Default rule

> **Never buy generic cognition merely because another agent wrapped an LLM. Buy scarce capability.**

The application owns Make-vs-Buy policy. Models may propose capabilities and resource needs, but they may not grant spend authority or bypass sourcing policy.

## 5. Somebody architecture inherited from the earlier product

Somebody-OKX does not start from zero.

Pre-OKX Somebody already proved a useful worker architecture through procurement:

- role-specific policy on top;
- a generic `CoreWorkerContract` / reliability layer underneath;
- model proposes, application authorizes;
- durable bounded Agent/Runner execution;
- evidence/provenance;
- persisted approval for gated actions;
- stable/idempotent external effects;
- execution separated from verification;
- application-owned completion.

Procurement was the first demonstrated role, not the product category.

For OKX, we inherit that architecture and adapt it to dynamic workers. We do **not** preserve procurement-specific data, workflow nouns or the previous hackathon deployment as product requirements.

## 6. Current product language

Product/demo labels may use:

- **That Guy** — an internal worker dynamically created or reused by Somebody;
- **Somebody Else** — an external provider used when the company lacks a required scarce capability.

Engineering concepts use neutral terms such as:

- `Objective`;
- `CapabilityPlan`;
- `WorkItem`;
- `WorkerSpec`;
- `WorkContract`;
- `InternalWorker`;
- `ExternalProvider`;
- `Evidence`;
- `Effect`;
- `Outcome`.

Do not preserve `Mission` merely because the old procurement demo used it.

## 7. WorkerSpec and WorkContract

These solve different problems.

### WorkerSpec

Answers: **what can this worker do?**

It defines the worker's controlled capabilities, resource requirements, tool-permission envelope and bounded responsibility.

### WorkContract

Answers: **what is this worker authorized and required to do for this assignment?**

It binds a worker to one bounded unit of work and carries the relevant objective, idempotency scope, authority, required outputs/evidence, allowed effects where applicable and completion requirements.

The inherited `CoreWorkerContract` is the starting architecture for this concept. It may be adapted during OKX so internal evidence-only work can complete without inventing a state-changing external effect.

## 8. Role of OKX AI / X Layer

Somebody is not a Web3-first product.

OKX AI provides external agent/service access. X Layer / Onchain OS provide machine-native payment infrastructure at the cross-company boundary.

The useful product effect is reduced commercial integration friction: Somebody can potentially acquire a capability from a provider it did not previously have a bilateral billing/API-key relationship with.

This does **not** remove authorization requirements for private user resources such as Gmail, accounting systems or messaging accounts.

## 9. Product surface

The product surface should make the management logic obvious without exposing implementation clutter.

Reuse the useful visual direction of old Mission Control — Somebody identity, calm state, activity/evidence/approval/verification patterns — but not its procurement-shaped information architecture.

The current surface should progressively show:

1. founder objective;
2. capabilities/resources Somebody identified;
3. WHY each work item is MAKE or BUY;
4. internal worker creation/reuse and current status;
5. evidence and meaningful work progress;
6. external provider, scarce missing resource and price;
7. spend approval/payment state;
8. result verification;
9. Somebody's unified final outcome.

Avoid giant graphs, permanent org charts, agent-chat transcripts, token counters and Web3-first wallet UX.

## 10. Fresh OKX operational environment

Somebody-OKX uses a fresh Convex project/deployment and fresh operational state.

There is no migration requirement from the previous `acrobatic-swan-765` deployment. Old health-probe state, old procurement rows and previous demo fixtures are not product dependencies.

Useful runtime patterns are inherited; stale data/deployment assumptions are not.

## 11. Hackathon acceptance shape

The final demo must show one coherent business objective with both paths:

1. natural-language founder objective;
2. required capability/resource identification;
3. at least one genuine MAKE decision;
4. real bounded internal worker execution;
5. meaningful persisted evidence/result from that work;
6. at least one genuine BUY decision based on a scarce external resource;
7. explicit spend/budget control;
8. real OKX AI / payment integration;
9. receipt/result persistence;
10. verification or explicit failure/reconciliation handling;
11. synthesis into a useful founder-facing business outcome.

The demo should be understandable in 2–4 minutes.

## 12. M1 product proof

M1 proves active MAKE before BUY is introduced.

It must show:

`objective → validated capability/resource plan → create/reuse worker → WorkContract → real bounded agent → tool-mediated work → persisted evidence/result → current product UI`

The M1 proof is intentionally scenario-independent from the final canonical demo, but it cannot be trivial. A task equivalent to “write this document from the prompt” is insufficient.

The selected M1 role should require multiple meaningful tool-mediated observations/actions, ideally across at least two distinct information sources or resource classes, so judges/engineers can see that Somebody assembled an operating capability rather than simply opened another chat completion.

## 13. Canonical demo status

**OPEN until the Master Plan demo gate: 18 September 2026, 12:00 SGT.**

No scenario is canonical until accepted by the user and technically validated.

Current researched lead from pre-build planning:

- supplier invoice / changed payment-details verification using an external independent voice/attestation provider.

This is a **candidate only**, not a product decision. Other candidates may replace it without changing the baseline architecture.

After the decision gate, broad scenario ideation stops unless a material technical/provider failure forces a reopen.

## 14. Hard non-goals

Do not scope the hackathon as a general autonomous-company platform.

Out of scope unless the canonical demo proves them essential:

- arbitrary organization hierarchies;
- worker personalities, ranks or promotions;
- worker-to-worker social chatter;
- generic workflow DSL;
- generic agent marketplace indexing;
- broad vendor auctions;
- multiple external vendors on the critical path;
- generic A2A negotiation infrastructure;
- universal payment abstraction across all providers;
- multiple polished demo workflows;
- token/trading gimmicks;
- replacing Convex/application state with blockchain;
- migrating old Somebody data merely for continuity;
- keeping old procurement/health/runtime paths operational merely for backwards compatibility;
- rewriting useful inherited runtime primitives for architectural neatness.

## 15. Build principle

> **One founder objective → dynamically assembled capability plan → MAKE + BUY → verified outcome.**

The smallest system that reliably proves that thesis wins.
