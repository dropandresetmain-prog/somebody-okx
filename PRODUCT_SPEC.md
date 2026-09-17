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

Somebody owns business outcomes and assembles the capabilities needed to deliver them.

The customer-facing product should stay simple. Users should not need to understand the internal workforce architecture, marketplace mechanics or payment protocol.

The locked delivery plan is in `MASTER_PLAN.md`.

## 4. OKX Dev Day thesis

The hackathon adds one organizational primitive:

> **Somebody can determine whether a required capability should be MADE internally or BOUGHT externally, then assemble both into one completed outcome.**

This matters to a One Person Company because it cannot pre-hire, pre-subscribe to or pre-integrate every capability it might someday need.

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

The MAKE path is not satisfied by merely producing a worker specification. For the canonical demo, Somebody must be able to turn a validated worker spec into an actual bounded executing agent:

`WorkerSpec → model selection → agent instantiation → allowed tools → execution → result/evidence`

Model routing should follow `docs/agents/AGENT_MODEL_SELECTION.md` and `docs/agents/MODEL_ARSENAL.md`, while architecture/security/payment/final verification remain with the primary model.

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

The application owns the Make-vs-Buy policy. Models may propose capabilities and resource needs, but they must not be allowed to decide spend authority or bypass sourcing policy.

## 5. Product language

The product/demo surface may use:

- **That Guy** — an internal worker dynamically created or reused by Somebody;
- **Somebody Else** — an external provider used when the company lacks a required scarce capability.

These are presentation labels only. Engineering terminology remains `InternalWorker` and `ExternalProvider`.

The purpose is to make the distinction instantly understandable without turning the product into an org-chart toy.

## 6. Role of OKX AI / X Layer

Somebody is not a Web3-first product.

OKX AI provides the external agent/service marketplace. X Layer / Onchain OS provide machine-native payment infrastructure at the cross-company boundary.

The useful product effect is reduced commercial integration friction: Somebody can potentially acquire a capability from a provider it did not previously have a bilateral billing/API-key relationship with.

This does **not** remove authorization requirements for private user resources such as Gmail, QuickBooks or WhatsApp.

## 7. Company Mission surface

The engine is core, but the demo surface is part of the product, not an afterthought.

The Company Mission surface should progressively show:

1. founder objective;
2. capabilities Somebody identified;
3. WHY each capability is MAKE or BUY;
4. internal worker creation/reuse and current status;
5. external provider, scarce missing resource and price;
6. spend approval/payment state;
7. result verification;
8. Somebody's unified final outcome.

Avoid giant graphs, permanent org charts, agent-chat transcripts, token counters and Web3-first wallet UX.

## 8. Hackathon acceptance shape

The final demo must show one coherent business objective with both paths:

1. natural-language founder objective;
2. required capability identification;
3. at least one genuine MAKE decision;
4. real bounded internal worker execution;
5. at least one genuine BUY decision based on a scarce external resource;
6. explicit spend/budget control;
7. real OKX AI / payment integration;
8. receipt/result persistence;
9. result verification or failure handling;
10. synthesis into a useful founder-facing business outcome.

The demo should be understandable in 2–4 minutes.

## 9. Canonical demo status

**OPEN until the Master Plan demo gate: 18 September 2026, 12:00 SGT.**

No scenario is canonical until accepted by the user and technically validated.

Current researched lead from the pre-build planning work:

- supplier invoice / changed payment-details verification using an external independent voice/attestation provider.

This is a **candidate only**, not a product decision. Other candidates may replace it without changing the baseline architecture.

After the decision gate, broad scenario ideation stops unless a material technical/provider failure forces a reopen.

## 10. Hard non-goals

Do not scope the hackathon as a general autonomous-company platform.

Out of scope unless a canonical demo proves them essential:

- arbitrary organization hierarchies;
- worker personalities, ranks or promotions;
- worker-to-worker social chatter;
- generic agent marketplace indexing;
- broad vendor auctions;
- multiple external vendors on the critical path;
- generic A2A negotiation infrastructure;
- universal payment abstraction across all providers;
- multiple polished demo workflows;
- token/trading gimmicks;
- replacing Convex/application state with blockchain;
- rewriting working Somebody systems for architectural neatness.

## 11. Build principle

> **One founder objective → one dynamically assembled capability plan → MAKE + BUY → verified outcome.**

The smallest system that reliably proves that thesis wins.
