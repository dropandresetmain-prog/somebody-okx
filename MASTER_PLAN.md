# Somebody × OKX Dev Day 2026 — Master Plan

Status: **LOCKED**  
Build period: **17–25 September 2026**  
Authoritative repo: `dropandresetmain-prog/somebody-okx`  
Locked on: **17 September 2026**  
Architecture reconciled: **17 September 2026**

## 1. Goal

Build the smallest reliable product that proves:

> **Somebody dynamically expands what a company is capable of doing.**

The founder gives Somebody a business objective. Somebody determines what capabilities/resources are required and chooses:

- **MAKE** — assemble internal capacity from resources the company already controls;
- **BUY** — acquire an external capability when execution depends on a resource the company does not control.

Somebody remains accountable for the work and for the final verified outcome.

Canonical demo shape:

`objective → capabilities/resources → MAKE + BUY → verified work → founder-facing outcome`

The specific business scenario remains open until the demo-selection gate.

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

A missing worker is **not** a missing capability. If the resources exist, Somebody should create or reuse bounded internal capacity.

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

Product/demo labels:

- **Somebody** — accountable AI manager;
- **That Guy** — internal worker dynamically created or reused by Somebody for bounded work;
- **Somebody Else** — external provider used when the company lacks a required scarce capability.

Engineering names remain neutral: `InternalWorker`, `ExternalProvider`, `Objective`, `WorkItem`, `WorkerSpec`, `WorkContract`, `Evidence`, `Effect`, `Outcome`.

Do not carry old procurement nouns into the current architecture merely because they existed before.

## 4. Provenance and source-project roles

Use four provenance categories:

- **Inherited** — working capability that existed before 17 September 2026;
- **Pre-existing R&D** — prior concepts/prototypes outside Somebody;
- **Rebuilt / Adapted during OKX** — a prior idea or inherited primitive changed/reimplemented during OKX for the current product;
- **New during OKX** — capability neither prior project had in working product form.

`BUILD_DELTA.md` is the canonical evidence ledger.

### Somebody baseline

Source: `somebody-ai@709a169a1a4f71b8dc2d7427438ff514999fb07e`.

Treat Somebody as the mature worker-execution/reliability source.

Architectural inheritance includes:

- Next.js / React / Convex product foundation;
- `@openai/agents` Agent/Runner patterns;
- `CoreWorkerContract` and controlled transitions;
- role-specific policy compiling into a generic worker contract;
- model-proposes/application-authorizes boundary;
- bounded read/act agent ports;
- run leases/fencing and durable progress;
- evidence/provenance patterns;
- stable effect identity/idempotency;
- persisted approval/authority;
- execution separated from verification;
- verification-before-completion;
- realtime state/event patterns;
- useful Somebody/Mission-Control visual language.

Do **not** treat old procurement as the product architecture. Procurement is one inherited role-specific implementation on top of the generic reliability pattern.

Do **not** inherit deployment-specific state or machinery by default. `acrobatic-swan-765`, old Convex rows, health probes/write flags and old provider integrations are not current-project requirements.

### Army of Interns R&D

Source: `army-of-interns@677166db591465fb6d201fb12db7cfe038557a92`.

Treat Army as R&D inspiration only.

Useful ideas:

- controlled capabilities/resources;
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

The rewritten `lib/workforce/` kernel is already the first built OKX-period product capability.

## 5. Target architecture

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
validated capability/resource needs
      |
      v
Resource evaluation
   /             \
MAKE              BUY
 |                 |
resolve/create      approved provider path
InternalWorker      |
 |                  spend authority
WorkerSpec          |
 |                  x402 / X Layer
WorkContract        |
 |                  ExternalProvider
role/capability     |
policy              result/receipt
 |                  |
bounded worker      verification
runtime             |
 |                  |
evidence/effects ---+
        |
        v
     Somebody
        |
        v
 verified outcome
```

Somebody remains accountable. Workers/providers are resources used by Somebody, not separate product protagonists.

## 6. Core OKX-period capabilities

By feature freeze, the intended OKX delta is:

1. scenario-independent workforce kernel — **DONE**;
2. capability/resource vocabulary — **PARTIALLY DONE**;
3. fresh OKX Convex data plane;
4. Objective/WorkItem operational spine;
5. objective → capability planning;
6. explicit company resource inventory;
7. `WorkerSpec → WorkContract` assignment boundary;
8. dynamic internal agent spawning;
9. deliberate model routing for dynamic workers;
10. current-role policy + evidence-based completion;
11. deterministic Make-vs-Buy policy;
12. unified internal/external work model;
13. OKX buyer lifecycle;
14. X Layer testnet payment integration;
15. spend authorization/reconciliation;
16. selected external-provider adapter;
17. external-result verification;
18. final objective synthesis;
19. current product surface / Objective Workspace;
20. MAKE/BUY UX and visual language;
21. one canonical end-to-end workflow.

Planned items stay planned in `BUILD_DELTA.md` until repo evidence proves them.

## 7. Product surface

Build the current-product surface incrementally from M1 rather than bolting UI on at the end.

Reuse the useful visual direction of inherited Mission Control — Somebody identity, calm operator state, activity/evidence/approval/verification patterns — but do not extend its procurement-shaped information architecture into a universal screen.

The surface should progressively show:

1. founder objective;
2. capability/resource decomposition;
3. why each capability is MAKE or BUY;
4. internal worker creation/reuse and execution;
5. evidence and meaningful activity;
6. external provider, price and missing resource;
7. approval/payment state;
8. verification state;
9. Somebody's unified final outcome.

Avoid giant dependency graphs, permanent org charts, agent-to-agent chat transcripts, raw wallet UI, token counters and Web3-first UX.

The demo should feel like **a company assembling around the work**, not a multi-agent debugging dashboard.

## 8. Build milestones

### M0 — Foundation and provenance — COMPLETE

Completed:

- final repo established;
- inherited Somebody baseline transferred and verified;
- canonical SSOT created;
- `BUILD_DELTA.md` created;
- model-selection guidance imported;
- X Layer sandbox/test strategy documented;
- minimal workforce kernel built and tested;
- inherited Somebody runtime architecture re-audited and reconciled into the current SSOT.

Do not keep expanding generic foundations.

### M1 — Objective spine + active MAKE

Target: **17–18 Sep**

Objective:

> Turn the inherited worker/reliability architecture plus the new workforce kernel into real dynamically assembled internal capacity on a fresh OKX data plane.

M1 is **one milestone**. The implementation may use internal checkpoints, but do not create M1.1/M1.2-style project milestones.

Build:

- fresh `somebody-okx` Convex project/deployment; no migration from `acrobatic-swan-765`;
- current-project Objective/WorkItem persistence and realtime read model;
- objective → capability planner contract;
- explicit factual company resource inventory;
- planner proposal → application validation;
- reuse/create worker resolution through `lib/workforce/`;
- assignment-specific `WorkContract` evolved from the inherited `CoreWorkerContract` pattern;
- role/capability-specific policy for the M1 internal proof;
- **active internal agent spawning**:
  `WorkerSpec → WorkContract → model selection → bounded Agent/Runner → allowed tools → execution → evidence/result`;
- durable worker-run status/activity using useful inherited lease/fencing/event patterns;
- first current-product Objective Workspace using useful Mission Control visual primitives/direction.

Do **not** make inherited procurement compatibility an M1 requirement.

Do **not** carry forward old health-probe/write-gate machinery merely to preserve the previous deployment.

M1 proof quality requirement:

- the worker must perform nontrivial tool-mediated work;
- a single free-form LLM response is insufficient;
- the proof should require multiple meaningful observations/actions appropriate to the role, ideally across at least two distinct information sources or resource classes;
- evidence/result must be persisted and visible;
- application/domain policy, not the model, decides whether the work is complete.

M1 acceptance:

`objective → validated capability/resource plan → create/reuse InternalWorker → WorkContract → bounded real agent → tool-mediated work → evidence/result → application-owned completion → visible Objective state`

No BUY required yet.

### Canonical demo gate

Hard deadline: **18 Sep, 12:00 SGT**.

Broad scenario ideation stops after this gate. Only a material technical/provider failure may reopen selection.

### M2 — Canonical MAKE path + Make-vs-Buy policy

Target: **18–19 Sep**

Requires accepted canonical scenario.

Build only the scenario-specific capabilities required by the demo.

Implement deterministic sourcing:

- all required resources actually owned → `MAKE`;
- external resource required + approved provider path available → `BUY`;
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

`prepared → awaiting_approval → approved → payment_attempted → submitted → settled → result_received → verified`

Never equate submission with confirmation. Never blindly repay after an ambiguous state; reconcile first.

Wallet credentials/private keys do not enter ordinary Convex state or logs.

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

Prove:

`objective → MAKE → That Guy executes → BUY → Somebody Else executes → verify → Somebody synthesizes outcome`

### M5 — Product surface + story hardening

Target: **21–22 Sep**

This is refinement, not first UI implementation.

Optimize the current product surface for a 2–4 minute demo:

- objective;
- capability plan;
- MAKE/BUY reasoning;
- internal worker status/result/evidence;
- external provider, cost, approval and execution;
- receipt/result verification;
- unified outcome.

Record the **first complete backup demo video immediately** when M5 works.

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

## 9. Sep 24 — debugging/hardening only

No planned feature development.

Attack realistic failures:

- malformed planner output;
- invalid capability/resource proposal;
- worker/tool failure;
- stale/replaced worker run;
- incomplete/conflicting evidence;
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

## 10. Sep 25 — video + submission only

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

## 11. Time budget before freeze

Approximate focused budget:

- M1 fresh spine + active MAKE: 4–5 h;
- M2 canonical MAKE + Make-vs-Buy: 3–4 h;
- M3 OKX test rail: 3–4 h;
- M4 provider + full backend E2E: 4–5 h;
- M5 surface/story hardening: 3–4 h;
- M6 release-candidate prep: 2–3 h.

Target total: roughly **20–25 focused build hours** before debugging/video days.

## 12. Cut order

If behind schedule, cut in this order:

1. marketplace discovery/ranking;
2. second provider;
3. cross-objective persistent worker reuse;
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

## 13. Stretch

Only after M5 works and a complete backup video exists.

Potential stretch:

- publish Somebody as an OKX AI seller;
- provider discovery/ranking;
- second external capability;
- persistent company workforce;
- richer That Guy roster;
- multi-objective worker reuse.

Stretch never jeopardizes the Sep 23 feature freeze.

## 14. Definition of success

A judge should be able to watch once and explain the product back as:

> “I give Somebody a business objective. It figures out what capabilities and resources are required. If my company already has the resources, it creates a bounded internal AI worker to handle it. If not, it acquires an external capability through OKX, pays for it safely, verifies the result, and gives me one finished outcome.”

If that is obvious in 2–4 minutes, the engine and product surface have done their jobs.
