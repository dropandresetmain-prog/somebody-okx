# Somebody × OKX — Reuse Audit

Status: **engineering source-of-truth for source-project reuse**  
Date: **17 September 2026**

This document combines the pre-build Opus reuse audit with a direct follow-up read of the authoritative source repositories.

The rule is simple:

> **Source projects are parts bins and proven architectural references, not compatibility obligations. Reuse only what helps the current Somebody-OKX product.**

## 1. Source baselines inspected

### Somebody

Repository: `dropandresetmain-prog/somebody-ai`  
Reference SHA: `709a169a1a4f71b8dc2d7427438ff514999fb07e`

Observed stack:

- Next.js 16 / React 19;
- Convex 1.45;
- `@openai/agents` 0.18;
- OpenRouter/OpenAI provider path;
- Zod 4;
- TypeScript / `tsx --test`.

Baseline evidence transferred into this repo:

- inherited suite: 78/78 passing;
- root typecheck clean;
- Convex typecheck clean.

### Army of Interns

Repository: `dropandresetmain-prog/army-of-interns`  
Reference SHA: `677166db591465fb6d201fb12db7cfe038557a92`

Observed stack:

- Next.js 16;
- Convex;
- `@openai/agents` through OpenRouter;
- Telegram/Twilio/demo-specific runtime machinery.

The useful workforce ideas are small compared with the surrounding Army product/runtime and have already been rewritten into `lib/workforce/`.

## 2. Somebody — what the direct source review established

The earlier audit correctly identified reusable reliability pieces but understated how coherent the old architecture was.

Pre-OKX Somebody was not merely “procurement plus some utilities.” Procurement was the demonstrated role on top of a deliberately more generic worker/reliability architecture.

The old runtime shape was effectively:

```text
Procurement Agent
      |
      v
Procurement domain / policy
      |
      | contract(m)
      v
CoreWorkerContract
      |
      v
reliability + worker runtime
      |
      v
effect/provider adapters
      |
      v
external evidence + read-back
```

That distinction materially affects what Somebody-OKX should inherit.

## 3. Somebody — reuse directly where practical

### 3.1 Reliability core

Source: `lib/reliability/core.ts`

This file explicitly says:

> The core operates on authority, stable effects and evidence, without quote semantics.

It provides:

- `CoreWorkerContract`;
- controlled `transition()`;
- `authorizeEffect()` against persisted approval/authority;
- `verifyReceipt()` read-back matching;
- `assertComplete()` completion gating.

This is genuine generic architecture and has already been transferred byte-for-byte into `somebody-okx`.

**Decision:** keep as the starting reliability core. Adapt only where current product requirements prove it too narrow.

Important limitation discovered in direct review: current `assertComplete()` refuses completion when there are zero required verified effects. That made sense for the procurement demo, but evidence-only internal MAKE work may legitimately have no external state-changing effect.

Adapting this effect-centric completion model into the current `WorkContract` concept is **Rebuilt / Adapted during OKX**, not inherited capability.

### 3.2 Agent/Runner execution pattern

Sources:

- `lib/agent/procurement.ts`;
- `convex/agent.ts`.

Reusable patterns:

- `Agent` + `Runner` from `@openai/agents`;
- deliberate model/provider selection;
- live-model calls fail closed unless explicitly enabled/configured;
- bounded Zod tool schemas;
- serial tool execution where appropriate;
- tool-progress-based success rather than trusting a final model message;
- injectable model for focused tests;
- provider cleanup;
- tracing disabled so raw reasoning is not persisted;
- safe error categorization before persistence.

The especially useful seam is the bounded application port:

```ts
read(): Promise<State>
act(command): Promise<string>
```

The model receives tools that ask application code to act. It does not receive arbitrary database/provider authority.

**Decision:** inherit/adapt the runtime pattern. Do not reuse procurement prompt/instructions/tools as generic workforce logic.

### 3.3 Durable run, lease and fencing pattern

Source: `convex/missions.ts`.

Reusable patterns:

- persisted run identity/status/model/tool-call progress;
- run lease expiry;
- stale/replaced-run fencing;
- scheduled asynchronous execution;
- durable partial progress retained across provider failure;
- event history around worker activity.

These are useful for dynamically spawned internal workers.

**Decision:** adapt the pattern into the fresh current-project Objective/WorkItem runtime. Do not copy the procurement aggregate merely to get these behaviors.

### 3.4 Model-proposes / application-authorizes boundary

Sources:

- `lib/procurement/commands.ts`;
- `lib/procurement/domain.ts`;
- `convex/gateway.ts`.

Pre-OKX Somebody explicitly separated:

```text
model proposes
→ application policy decides whether the action is legal
→ external evidence determines whether it worked
```

The agent could not grant itself approval, inject authoritative external evidence, invent recipient identity or override deterministic ranking.

**Decision:** inherit as a core design principle for planner output, worker tools, spend authority and completion.

### 3.5 Evidence/provenance pattern

Sources include:

- `lib/procurement/domain.ts`;
- `lib/web/observationIdentity.ts`;
- `lib/unipile/chronology.ts`;
- `lib/google/evidence.ts`.

Useful ideas:

- evidence identity separate from mutable summary state;
- source/provider/channel provenance;
- observed/retrieved chronology;
- duplicate observation idempotency;
- newer authoritative evidence can supersede older claims without deleting history;
- equal-authority conflicts remain unresolved rather than guessed through.

**Decision:** reuse the principles and small generic helpers where suitable. New evidence types should be current-role shaped rather than quote-shaped.

### 3.6 Effect lifecycle, idempotency and verification

Sources:

- `lib/reliability/core.ts`;
- `lib/procurement/domain.ts`;
- `convex/missions.ts`;
- `convex/effectAdapter.ts`;
- provider integrations.

Useful pattern:

```text
stable intent
→ authorize
→ attempt
→ provider success/receipt
→ unverified
→ independent read-back/reconciliation
→ verified
```

Retries reuse stable logical identities rather than intentionally creating a second business action.

This is highly relevant to later OKX payment/provider work.

**Decision:** inherit the lifecycle principles. Build the current provider/payment seam cleanly rather than forcing OKX through the old procurement adapter dispatcher.

### 3.7 Convex realtime/event patterns

Sources:

- `convex/missions.ts`;
- inherited query/mutation/scheduler patterns.

Useful ideas:

- operational state in Convex;
- realtime read model for UI;
- durable activity/event history;
- server-side scheduled worker execution.

**Decision:** reuse patterns on a fresh OKX Convex project/schema.

### 3.8 UI visual language and small primitives

Sources:

- `app/MissionControl.tsx`;
- `app/somebody/Mascot.tsx`;
- `app/somebody/Icon.tsx`;
- `app/somebody/OperatorDrawer.tsx`;
- `app/somebody/presentation.ts`;
- `app/globals.css`;
- brand assets.

Useful direction:

- Somebody identity/mascot;
- calm operator workspace;
- clear current-state treatment;
- working/waiting/approval/verified states;
- evidence/activity presentation;
- restrained operational UI.

`MissionControl.tsx` is large and procurement-shaped.

**Decision:** extract/copy small useful components and visual rules. Do not keep expanding the inherited Mission Control file into the current product architecture.

## 4. Somebody — role-specific implementation to treat as reference, not core

### Procurement aggregate

Sources:

- `lib/procurement/types.ts`;
- `lib/procurement/domain.ts`;
- `lib/procurement/commands.ts`;
- `lib/procurement/fixtures.ts`.

It owns real useful behavior — quote completeness, evidence supersession, ranking, approvals, RFQs, PO intent, etc. — but those are procurement semantics.

The key reusable architectural seam is `contract(m): CoreWorkerContract`, which translates role-specific state into the generic contract.

**Decision:** procurement is an inherited role implementation/reference. Do not generalize the aggregate and do not require it to remain operational during M1.

### Existing provider integrations

Pre-OKX integrations include:

- Google Calendar/Drive/Gmail/Sheets;
- public web sourcing;
- Unipile WhatsApp/Instagram;
- QuickBooks Online Sandbox.

These are proven assets, but their presence does not make them mandatory dependencies.

**Decision:** reuse an integration only when the selected current role/demo actually needs it. Prefer the smallest reusable client/helper over importing old procurement semantics with it.

## 5. Somebody — deliberately do not inherit

The following are old-environment details, not architectural value:

- `acrobatic-swan-765` deployment identity;
- old Convex rows/data;
- old procurement fixtures/demo state;
- `healthProbes` table;
- `HEALTH_PROBE_WRITES_ENABLED`;
- deployment-specific health UI/reporting;
- old write-gate behavior merely for continuity;
- old localhost-only write route merely because it existed;
- procurement table shape/state machine as the current product schema;
- old provider bindings/recipient data.

Some files may remain temporarily in Git for provenance/reference, but they are not compatibility requirements.

## 6. Fresh OKX operational environment

**Decision:** create a fresh Convex project/deployment for Somebody-OKX.

There is no migration from `acrobatic-swan-765`.

The fresh schema should be current-project shaped around concepts such as:

- Objective;
- CapabilityPlan;
- WorkItem;
- worker/run state;
- WorkContract authority/completion requirements;
- Evidence;
- Effect/payment state where required;
- Outcome;
- ActivityEvent.

Reuse Convex implementation patterns, not stale data/schema by default.

## 7. Army of Interns — transfer classification

### Reuse concept/pattern

Useful ideas:

- controlled capability/resource vocabulary;
- model proposes, application validates;
- deny-by-default capability → tool permissions;
- minimal worker construction;
- compatible-worker reuse.

These have already been rewritten into the pure `lib/workforce/` kernel.

### Current OKX workforce kernel

Files:

- `lib/workforce/types.ts`;
- `lib/workforce/catalog.ts`;
- `lib/workforce/permissions.ts`;
- `lib/workforce/workers.ts`;
- `lib/workforce/index.ts`;
- `tests/workforce.test.ts`.

Provides:

- controlled scenario-independent capabilities;
- resource requirements;
- fail-closed validation;
- deny-by-default permissions;
- minimal `WorkerSpec`;
- reuse-or-create resolution;
- no spend authority in MAKE.

Classification: **Rebuilt / Adapted during OKX** from pre-existing Army R&D.

### Do not transfer Army baggage

- Telegram;
- Twilio / WhatsApp coupling;
- Army persistence/runtime state machines;
- org-chart/avatar UI;
- personalities;
- ranks/promotions;
- contractor-quote demo structures;
- people/messages/demo-state tables;
- scenario keyword capability analysis;
- broad worker matching/orchestration beyond current need.

## 8. Combined architecture — how the two source projects fit

The source projects are complementary when separated at the right boundary:

```text
                    SOMEBODY
                       |
                 Capability Plan
                       |
                Resource Decision
                       |
                     MAKE
                       |
                resolve/create
                       |
                  WorkerSpec
          [Army idea, OKX rebuild]
                       |
                       v
                 WorkContract
       [Somebody reliability evolution]
                       |
                       v
              Role/Capability Policy
                       |
                       v
              Generic Worker Runtime
            [Somebody inheritance]
                       |
          +------------+------------+
          |                         |
       Evidence                  Effects
          |                         |
          |                authorize → execute
          |                         |
          |                     read-back
          |                         |
          +------------+------------+
                       |
                       v
               proof of completion
```

This is **not** a merge of two old products.

It is:

- an inherited Somebody execution/reliability architecture;
- Army-derived workforce concepts rewritten during OKX;
- new OKX management/economic orchestration connecting them.

## 9. Reuse triage

### Act Now

- keep/reuse `lib/reliability/core.ts` as starting core;
- preserve model-proposes/application-authorizes boundary;
- reuse Agent/Runner read-act pattern;
- reuse run lease/fencing/event patterns in current runtime;
- reuse stable-effect/idempotency/verification principles;
- use fresh Convex project/data;
- build current Objective/WorkItem semantics rather than old Mission semantics;
- evolve completion contract for evidence-only MAKE work.

### Investigate Now

- which inherited provider/client helpers are useful for the selected M1 proof;
- which Mission Control primitives should be extracted/copied for the first current surface;
- deliberate runtime model-selection policy for spawned workers.

### Park for Later

- persistent cross-objective workforce;
- broader role library;
- old integrations not selected by the canonical demo;
- generalized provider discovery/ranking.

### Ignore / Accept Risk

- keeping unused old source files in the repository temporarily for provenance/reference, provided the current runtime/data plane does not depend on them;
- not maintaining old procurement demo compatibility during the hackathon build.

## 10. Verification implications

Inherited baseline evidence proves the old system worked before OKX and survived transfer. It does **not** mean the full 78-test inherited suite must remain the acceptance gate after the current data plane intentionally diverges.

For new work:

1. run focused changed-behavior tests first;
2. run directly affected runtime/persistence seams;
3. run risk-specific checks only when the change warrants them;
4. run broader promotion/release checks once on the exact release candidate.

Do not repair or preserve unrelated legacy behavior merely to keep historical tests green.
