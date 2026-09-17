# Somebody × OKX Dev Day 2026 — Master Plan

Status: **LOCKED**
Build period: **17–25 September 2026**
Authoritative repo: `dropandresetmain-prog/somebody-okx`
Locked on: **17 September 2026**

## 1. Goal

Build the smallest reliable product that proves:

> **Somebody dynamically expands what a company is capable of doing.**

The user gives Somebody a business objective. Somebody determines what capabilities are required. For each capability, it chooses:

- **MAKE** — assemble internal capacity from resources the company already controls;
- **BUY** — acquire an external capability when execution depends on a resource the company does not control.

Somebody verifies the work and owns the final outcome.

Canonical demo shape:

`objective → capabilities → MAKE + BUY → verified work → founder-facing outcome`

The specific business scenario remains open until the demo-selection gate is passed.

## 2. Product thesis

### Vision

> **One person should be able to operate with the functional reach of a much larger company.**

Somebody is the AI manager for that company. The user should not have to manually assemble agents, SaaS tools, freelancers, vendors or APIs.

### MAKE

MAKE when the required resources are already controlled by the company.

Examples:

- general LLM reasoning;
- public web/search;
- company records;
- authenticated company systems;
- ordinary compute;
- existing reusable tools.

A missing worker is **not** a missing capability. If the resources exist, Somebody should be able to create or reuse internal capacity.

### BUY

BUY when execution depends on an externally controlled scarce resource.

Examples:

- proprietary/licensed data;
- privileged access;
- independent attestation;
- physical presence;
- real-world action;
- specialist infrastructure or compute;
- external identity/reputation;
- resources materially impractical to reproduce internally.

Guiding principle:

> **Never buy generic cognition merely because somebody wrapped another LLM. Buy scarce capability.**

## 3. Product language

These are product/demo labels, not engineering type names.

- **Somebody** — the accountable AI manager.
- **That Guy** — an internal worker dynamically created or reused by Somebody for a bounded job.
- **Somebody Else** — an external provider used when the company lacks a required scarce capability.

Engineering names remain `InternalWorker` and `ExternalProvider`.

The product surface may use the playful labels where they improve comprehension, but architecture and persistence should use neutral engineering terminology.

## 4. Provenance and hackathon contribution

Use four categories when describing work:

### Inherited

Working capability that existed before 17 September 2026. Not hackathon work.

### Pre-existing R&D

Prior concepts/prototypes that existed elsewhere but were never part of Somebody. Not hackathon capability.

### Rebuilt / Adapted during OKX

A prior idea exists, but Somebody-OKX creates a new implementation that replaces broken, demo-specific or inappropriate code. This **is OKX-period engineering**.

### New during OKX

Capabilities neither prior project had in working product form.

The submission story is therefore not “we merged Somebody and Army.” It is:

> **We took an existing AI operator and earlier workforce R&D, rebuilt the useful parts, and during OKX Dev Day created the missing management and economic layer that turns them into an AI-native company.**

`BUILD_DELTA.md` remains the canonical evidence ledger and must use this vocabulary.

## 5. Source-project roles

### Somebody baseline

Source: `somebody-ai@709a169a1a4f71b8dc2d7427438ff514999fb07e`

Treat as the mature execution/reliability foundation:

- Next.js / React / Convex product shell;
- mission/event patterns;
- agent runner;
- approval and authority controls;
- effect lifecycle and idempotency;
- evidence/provenance;
- verification-before-completion;
- existing external integrations;
- operator UI patterns.

Do **not** generalize the inherited procurement aggregate into a universal workflow engine.

### Army of Interns R&D

Source: `army-of-interns@677166db591465fb6d201fb12db7cfe038557a92`

Treat as R&D inspiration only.

Useful ideas:

- controlled capabilities;
- fail-closed capability validation;
- deny-by-default tool permissions;
- worker construction;
- worker reuse.

Rejected baggage:

- scenario keyword analysis;
- duplicated permission sources;
- ranks/promotions;
- personalities;
- org hierarchy;
- Telegram/Twilio coupling;
- demo-specific runtime/state machines;
- wholesale Army schema/runtime.

The rewritten `lib/workforce/` kernel is already the first built OKX capability.

## 6. Target architecture

```text
Founder objective
      |
      v
   Somebody
      |
      v
Capability planner
      |
      v
Required capabilities
      |
      v
Resource evaluation
   /             \
MAKE              BUY
 |                 |
Internal           OKX AI / provider
workforce           |
 |                 approval
spawn/reuse          |
That Guy           x402 / X Layer
 |                  |
model selection   Somebody Else
 |                  |
tool envelope       result
 |                  |
execution           verification
 |                  |
internal result ----+
        |
        v
     Somebody
        |
        v
  final outcome
```

Somebody remains accountable. Workers and providers are resources used by Somebody, not separate product protagonists.

## 7. Core new/rebuilt capabilities targeted during OKX

By feature freeze, the intended OKX-period product delta is:

1. scenario-independent workforce kernel — **DONE**;
2. capability/resource model — **PARTIALLY DONE**;
3. dynamic internal agent spawning;
4. model routing for dynamic workers;
5. Company Mission runtime;
6. objective → capability planning;
7. explicit company resource inventory;
8. deterministic Make-vs-Buy policy;
9. unified internal/external work model;
10. OKX buyer lifecycle;
11. X Layer testnet payment integration;
12. spend authorization/reconciliation;
13. selected external-provider adapter;
14. external-result verification;
15. final mission synthesis;
16. Company Mission product surface;
17. MAKE/BUY UX and visual language;
18. one canonical end-to-end workflow.

Planned items stay planned in `BUILD_DELTA.md` until repo evidence proves them.

## 8. Product surface

The engine is core, but the product surface must make the thesis obvious.

Build the Company Mission surface incrementally from M1 rather than bolting UI on at the end.

The surface should show:

1. founder objective;
2. capability decomposition;
3. why each capability is MAKE or BUY;
4. internal worker creation/reuse and execution;
5. external provider, price and missing resource;
6. approval/payment state;
7. verification state;
8. Somebody's unified final outcome.

Avoid:

- giant dependency graphs;
- permanent org charts;
- agent-to-agent chat transcripts;
- raw wallet UI;
- token counters;
- Web3-jargon-first UX;
- exposing model internals unless deliberately placed in an advanced detail view.

The demo should feel like a company assembling around the work, not a multi-agent debugging dashboard.

## 9. Build milestones

### M0 — Foundation and provenance — COMPLETE

Completed:

- final repo established;
- inherited Somebody baseline transferred and verified;
- canonical SSOT created;
- `BUILD_DELTA.md` created;
- model arsenal/model-selection guidance imported;
- X Layer sandbox/test strategy documented;
- minimal workforce kernel built and tested.

Do not keep expanding generic foundations.

### M1 — Company Mission spine + active MAKE

Target: **17–18 Sep**

Objective: turn the workforce kernel into real executable internal capacity.

Build:

- bounded Company Mission path beside old procurement mission;
- objective → capability planner contract;
- explicit company resource inventory;
- planner proposal → application validation;
- reuse/create worker resolution;
- **active internal agent spawning**:
  `WorkerSpec → model selection → bounded agent instantiation → allowed tools → execution → result/evidence`;
- use `docs/agents/MODEL_ARSENAL.md` and `docs/agents/AGENT_MODEL_SELECTION.md` for worker model routing;
- first Company Mission product surface;
- resolve inherited Convex deployment/write-gate blockers only as required for the new persisted path.

Architecture/security/payment/final verification remain with the primary model regardless of model-routing guidance.

M1 acceptance:

`objective → validated capability plan → create/reuse internal worker → spawn bounded agent → execute → result → visible Company Mission state`

No BUY required yet.

### Canonical demo gate

Hard deadline: **18 Sep, 12:00 SGT**.

Broad scenario ideation stops after this gate. Only a material technical/provider failure may reopen the selection.

### M2 — Canonical MAKE path + Make-vs-Buy policy

Target: **18–19 Sep**

Requires accepted canonical scenario.

Build only the scenario-specific capabilities required by the demo.

Implement deterministic sourcing:

- all required resources owned → `MAKE`;
- external resource required + approved provider available → `BUY`;
- external resource required + no approved path → `BLOCKED`.

The model proposes resource needs; application code decides sourcing.

M2 acceptance:

`objective → capability plan → real MAKE execution → explicit BUY requirement with named missing resource`

### M3 — Generic OKX buyer rail + spend safety

Target: **19–20 Sep**

First prove the official safe development rail:

- X Layer Testnet;
- `eip155:1952`;
- faucet test OKB;
- test USD₮0;
- official Mock Merchant.

Prove:

`request → 402 → inspect terms → approval → sign/pay → retry → resource → receipt`

Maintain explicit lifecycle states such as:

`prepared → awaiting approval → approved → payment attempted → submitted → settled → result received → verified`

Never equate submission with confirmation. Never blindly repay after an ambiguous state; reconcile first.

Wallet credentials/private keys do not enter Convex or logs.

### M4 — Real BUY provider + full engine

Target: **20–21 Sep**

Validate the selected provider before integration:

- endpoint/tool;
- price;
- network/environment;
- latency;
- rate limits;
- result contract;
- proof/verification mechanism;
- failure modes.

Provider-specific behavior stays behind the smallest practical adapter seam.

Prove full backend flow:

`objective → MAKE → That Guy executes → BUY → Somebody Else executes → verify → Somebody synthesizes outcome`

### M5 — Product surface + story hardening

Target: **21–22 Sep**

This is refinement, not first UI implementation.

Optimize the Company Mission screen for a 2–4 minute demo:

- objective;
- capability plan;
- MAKE/BUY reasoning;
- internal worker status/result;
- external provider, cost, approval and execution;
- receipt/result verification;
- unified outcome.

Record the **first complete backup demo video immediately** when M5 works. Do not wait until submission day.

### M6 — Release candidate

Target: **23 Sep**

Required before freeze:

- canonical workflow complete;
- MAKE + BUY verified end-to-end;
- provider validated;
- reset/setup path reliable;
- README and `BUILD_DELTA.md` current;
- OKX integration/service URL identified;
- product/test link available where applicable;
- submission description drafted;
- first backup video recorded.

Run the canonical promotion/release gate once on the exact candidate SHA.

### HARD FEATURE FREEZE

**23 Sep, 18:00 SGT**

After this:

- no new capability;
- no second provider;
- no redesign;
- no new scenario;
- no stretch feature.

Only release-blocking fixes.

## 10. Sep 24 — debugging/hardening only

No planned feature development.

Attack realistic failures:

- malformed planner output;
- worker failure;
- invalid capability/resource proposal;
- stale state/refresh;
- provider timeout/rate limit;
- quote mismatch;
- insufficient balance;
- uncertain payment state;
- duplicate invocation;
- malformed external result;
- verification failure;
- demo reset failure.

Fix only material blockers. Rerun only invalidated evidence after each fix.

Finish with one exact-candidate end-to-end rehearsal and another backup recording.

## 11. Sep 25 — video + submission only

No planned product development.

Official submission deadline: **25 Sep 23:59 UTC / 26 Sep 07:59 SGT**.

Internal target: **25 Sep, 22:00 SGT**.

Submission package must include the required repo/README, working 2–4 minute demo video, project summary, product/test link where available, and OKX AI service/listing/integration URL. Existing-project provenance and commit evidence must remain explicit.

Suggested ~3-minute video structure:

- **0:00–0:20** — problem;
- **0:20–0:40** — founder objective;
- **0:40–1:20** — MAKE: Somebody creates/reuses That Guy and internal work executes;
- **1:20–2:15** — BUY: missing resource, Somebody Else, provider, price, approval, payment, external work;
- **2:15–2:40** — verification;
- **2:40–3:00** — Somebody's final outcome and thesis.

Possible closing line:

> **Somebody builds what your company can do — and finds Somebody Else for what it can't.**

## 12. Time budget before freeze

Approximate focused budget:

- M1 convergence + active MAKE: 4–5 h;
- M2 scenario MAKE + Make-vs-Buy: 3–4 h;
- M3 OKX test rail: 3–4 h;
- M4 provider + full backend E2E: 4–5 h;
- M5 surface/story hardening: 3–4 h;
- M6 release-candidate prep: 2–3 h.

Target total: roughly **20–25 focused build hours** before debugging/video days.

## 13. Cut order

If behind schedule, cut in this order:

1. marketplace discovery/ranking;
2. second provider;
3. cross-mission persistent worker reuse;
4. multiple simultaneous MAKE workers;
5. broad capability ontology;
6. fancy worker visualization;
7. UI animation;
8. flexible arbitrary decomposition.

Never cut:

- active MAKE execution;
- clear Make-vs-Buy decision;
- genuinely scarce BUY;
- actual OKX integration;
- spend/payment safety;
- external-result verification;
- final synthesis;
- understandable working demo.

## 14. Stretch

Only after M5 works and a complete backup video exists.

Potential stretch:

- publish Somebody as an OKX AI seller;
- provider discovery/ranking;
- second external capability;
- persistent company workforce;
- richer That Guy roster;
- multi-mission worker reuse.

Stretch never jeopardizes the Sep 23 feature freeze.

## 15. Definition of success

A judge should be able to watch once and explain the product back as:

> “I give Somebody a business objective. It figures out what skills are required. If my company already has the resources, it creates an internal AI worker to handle it. If not, it hires an external capability through OKX, pays for it, verifies the result, and gives me one finished outcome.”

If that is obvious in 2–4 minutes, the engine and product surface have done their jobs.
