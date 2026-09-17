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

## 4. OKX Dev Day thesis

The hackathon adds one new organizational primitive:

> **Somebody can determine whether a required capability should be MADE internally or BOUGHT externally.**

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

A missing pre-existing worker is **not** a capability gap. Somebody may create a bounded internal worker for the task.

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

The application should own the Make-vs-Buy policy. Models may propose capabilities and resource needs, but they must not be allowed to spend merely because they decide outsourcing sounds useful.

## 5. Role of OKX AI / X Layer

Somebody is not a Web3-first product.

OKX AI provides the external agent/service marketplace. X Layer / Onchain OS provide machine-native identity/payment infrastructure at the cross-company boundary.

The useful product effect is reduced commercial integration friction: Somebody can potentially acquire a capability from a provider it did not previously have a bilateral billing/API-key relationship with.

This does **not** remove authorization requirements for private user resources such as Gmail, QuickBooks or WhatsApp.

## 6. Hackathon acceptance shape

The final demo must show one coherent business objective with both paths:

1. natural-language founder objective;
2. required capability identification;
3. at least one genuine MAKE decision;
4. bounded internal worker execution;
5. at least one genuine BUY decision based on a scarce external resource;
6. explicit spend/budget control;
7. real OKX AI / payment integration;
8. receipt/result persistence;
9. result verification or failure handling;
10. synthesis into a useful founder-facing business outcome.

The demo should be understandable in 2–4 minutes.

## 7. Canonical demo status

**OPEN.**

No scenario is canonical until accepted by the user and technically validated.

Current researched lead from the pre-build planning work:

- supplier invoice / changed payment-details verification using an external independent voice/attestation provider.

This is a **candidate only**, not a product decision. Its value depends on whether the provider truly supplies an external capability worth buying and whether the OKX payment/provider path is reliable enough for the demo.

Other candidates may replace it without changing the baseline architecture.

## 8. Hard non-goals

Do not scope the hackathon as a general autonomous-company platform.

Out of scope unless a canonical demo proves they are essential:

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

## 9. Build principle

> **One founder objective → one dynamically assembled capability plan → MAKE + BUY → verified outcome.**

The smallest system that reliably proves that thesis wins.
