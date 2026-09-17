# Somebody × OKX — Reuse Audit

Status: engineering source-of-truth for transfer planning
Date: 17 September 2026

This document ingests the useful findings from the pre-build Opus audit while removing demo-specific assumptions that were not accepted.

## Source baselines inspected

### Somebody
Repository: `dropandresetmain-prog/somebody-ai`
Reference main SHA: `709a169a1a4f71b8dc2d7427438ff514999fb07e`

Observed stack:

- Next.js 16 / React 19;
- Convex 1.45;
- `@openai/agents` 0.18;
- OpenRouter/OpenAI model path;
- Zod 4;
- TypeScript / `tsx --test`.

Pre-build audit evidence reported:

- `npm ci` succeeded;
- existing test suite reported 78/78 passing;
- root and Convex typechecks passed;
- all meaningful integration branches were already merged into main.

These checks were reported by the pre-build audit; they must be rerun after transfer before being claimed for `somebody-okx`.

### Army of Interns
Repository: `dropandresetmain-prog/army-of-interns`
Reference main SHA: `677166db591465fb6d201fb12db7cfe038557a92`

Observed stack:

- Next.js 16;
- Convex;
- `@openai/agents` through OpenRouter;
- additional Telegram/Twilio/demo-specific runtime machinery.

The audit found that the shipped capability-analysis path was substantially more deterministic/demo-specific than the project concept suggested: controlled capability keys and keyword/proposal validation rather than a mature general workforce planner.

## Somebody — transfer classification

### Reuse directly where practical

#### Project/runtime foundation

Transfer the working application baseline rather than recreating equivalent setup:

- package / TypeScript / Next.js / Convex configuration;
- shared application scaffolding;
- environment examples with secrets removed;
- existing test infrastructure;
- brand assets/components where still appropriate.

#### Reliability core

Source: `lib/reliability/core.ts`

Useful concepts/functions from the audit:

- controlled state transitions;
- effect authorization tied to persisted approval;
- receipt/read-back verification;
- completion only after required effects are verified.

This is directly aligned with OKX external-purchase safety.

#### Agent execution patterns

Source examples:

- `lib/agent/procurement.ts`;
- `convex/agent.ts`.

Reuse runner/provider setup, bounded tool execution, lease/error-handling patterns where they remain suitable.

Do not reuse procurement-specific instructions as generic workforce logic.

#### Idempotency / stable-effect patterns

Source: procurement domain/effect lifecycle.

Reuse the principle of stable logical effect identity so retries cannot silently duplicate external actions.

#### Realtime state / event patterns

Source examples:

- Convex mission view/events;
- existing mutation/query patterns.

Reuse patterns, not necessarily existing procurement table shapes.

#### UI primitives / visual language

Existing Mission Control includes reusable approval/status/evidence patterns.

Prefer extraction/copying of small useful components over expanding the already-large existing Mission Control file.

### Adapt, do not generalize blindly

#### Procurement aggregate

Current Somebody is strongly procurement-shaped: vendors, quotes, ranking, approvals, RFQs, purchase orders and related fields.

Do not turn this into a universal company-workflow engine as part of the transfer.

Where the OKX project needs mission/capability state, add the smallest sibling model after canonical demo requirements are known.

#### Effect lifecycle

The existing lifecycle is useful, but provider-specific OKX execution should not be forced into an adapter chain that was deliberately designed for the previous demo unless evidence shows that is the simplest safe seam.

### Leave untouched unless required

- Google/Unipile integrations;
- QuickBooks write path;
- previous procurement fixtures;
- previous vendor sourcing demo semantics;
- large UI sections unrelated to the new demo.

## Army of Interns — transfer classification

### Reuse concept/pattern

#### Controlled capability vocabulary

Source examples:

- `src/core/workforce/capabilityAnalysis.ts`;
- `src/core/workforce/capabilityCatalog.ts`.

Useful principle:

- model can propose capability/resource requirements;
- application accepts only controlled/known capability and resource identifiers.

For Somebody-OKX, simplify around what the canonical demo actually needs.

#### Deny-by-default tool envelope

Source: `src/core/workforce/permissionMapping.ts`.

Useful principle:

- internal worker receives only tools permitted for its assigned capability;
- MAKE workers must not gain external purchase authority by default.

#### Minimal worker specification

Army's full WorkerSpec is overbuilt for this hackathon.

Retain only practical fields such as:

- worker/capability identity;
- allowed tools;
- bounded task/instructions;
- execution/result status.

### Likely rewrite rather than port

The audit estimated that the useful workforce ideas amount to a small amount of simple logic. Rewriting them cleanly in Somebody-OKX may be cheaper than importing Army-specific dependencies.

Candidates to simplify/rewrite:

- capability validation;
- capability-to-tool permission mapping;
- minimal worker spec.

### Do not transfer by default

- Telegram;
- Twilio / WhatsApp integration;
- Army demo runtime/state machines;
- org-chart and avatar UI;
- personalities;
- ranks/promotions;
- contractor-quote demo structures;
- Army-specific people/messages/demo-state tables;
- broad worker matching/orchestration unless the final MAKE path actually needs reuse across multiple workers.

## Transfer strategy

The transfer should happen in two layers.

### Layer 1 — Somebody baseline

Bring the working Somebody application into `somebody-okx` as the engineering foundation, preserving provenance of the source SHA in documentation/commit messages.

After transfer, rerun only the baseline checks required to establish that the copy still works.

### Layer 2 — workforce primitives

After the Somebody baseline is healthy, bring in only the minimal workforce primitives needed for MAKE.

Do not transfer Army wholesale.

Focused acceptance for this layer should prove:

- controlled capability proposal is accepted/rejected deterministically;
- a bounded internal worker can be created for a capability;
- tool permissions are deny-by-default;
- internal worker cannot access BUY/payment authority unless explicitly designed later.

## Important unresolved source questions

Carry forward only if transfer inspection cannot answer them:

- whether the previous hardcoded Convex deployment should be reused or replaced;
- how broad the existing master write gate intentionally is;
- which prior model/settings were most reliable;
- whether any existing lease/effect lifecycle behavior conflicts with slow external providers.

These are implementation questions, not reasons to delay the baseline transfer.
