# Somebody × OKX — Architecture

Status: **canonical architecture boundaries — revised for approved launch demo**  
Date: **18 September 2026**

## 1. Architectural goal

Build the smallest reliable system that proves:

> **Somebody can assemble internal capability from company-owned resources, discover external resources when gaps emerge, buy only what the company cannot make, resume work with the purchased result, and verify the final outcome.**

The architecture extends the strongest pre-OKX Somebody runtime patterns without turning the old procurement demo or the OKX marketplace into a universal workflow engine.

## 2. Inheritance from Somebody

Source: `dropandresetmain-prog/somebody-ai@709a169a1a4f71b8dc2d7427438ff514999fb07e`.

Preserve these architectural patterns:

- role/capability-specific policy above a generic reliability/runtime layer;
- model proposes, application authorizes;
- bounded Agent/Runner execution;
- `WorkerSpec` separate from assignment-specific `WorkContract`;
- durable runs, leases and stale-run fencing;
- evidence/provenance;
- stable effect identity and idempotency;
- explicit attempted/submitted/verified semantics;
- persisted approval for gated effects;
- reconciliation before retry after ambiguous state;
- application-owned completion.

Do not inherit the old procurement `Mission` aggregate, old deployment/data, health probes or provider-specific integrations merely for continuity.

## 3. Fresh OKX data plane

Somebody-OKX uses a fresh Convex project/deployment and fresh operational state.

The current accepted M1 runtime lives on the fresh project. Secrets remain outside Git and ordinary application state.

M1 rows are valid historical/current operational records. M2+ schema evolution must remain backward compatible with them; new repeated-sourcing fields must not make accepted M1 rows unreadable.

## 4. Canonical architecture

The old mental model of one objective-level split into MAKE or BUY is superseded.

The mission is an orchestration loop:

```text
Founder objective
      ↓
Somebody
      ↓
Capability / work planning
      ↓
Internal worker executes where possible
      ↓
New bounded resource need emerges
      ↓
Company resource inventory
      ↓
Market discovery
      ↓
Candidate assessment
      ↓
Canonical sourcing policy
   ┌───────┼────────┐
 MAKE     BUY     BLOCKED
   │       │          │
   │       ↓          └→ expose unresolved need
   │   spend/payment
   │       ↓
   │   provider result/effect
   │       ↓
   │   verification
   └───────┘
      ↓
Worker / Somebody resumes
      ↓
Another resource need may emerge
      ↓
repeat sourcing loop
      ↓
verified founder outcome
```

The existing pure `lib/sourcing/policy.ts` remains the single deterministic MAKE/BUY/BLOCKED authority. It is invoked per bounded resource requirement, not once as a permanent label on the entire objective.

## 5. Current domain language

Use neutral engineering concepts:

- **Objective** — founder outcome Somebody owns;
- **CapabilityPlan** — validated capability/resource plan;
- **WorkItem** — bounded unit of work;
- **WorkerSpec** — reusable internal worker capability/tool/resource envelope;
- **WorkContract** — assignment-specific authority and proof requirements;
- **ResourceNeed** — bounded resource requirement discovered during planning/execution;
- **SourcingDecisionRecord** — durable application-owned decision for one resource need;
- **MarketCandidate** — current external offering considered for a need;
- **ExternalProvider** — selected BUY-side provider;
- **Evidence** — observed fact/result with provenance;
- **Effect** — intended state-changing action with stable identity/lifecycle;
- **Outcome** — Somebody's verified founder-facing synthesis;
- **ActivityEvent** — durable operational history.

The names `ResourceNeed` and `SourcingDecisionRecord` describe architecture, not a mandate for large new tables. Use the smallest persisted shape that cleanly supports repeated decisions.

Product UI may use **That Guy** and **Somebody Else**.

## 6. WorkerSpec vs WorkContract

`WorkerSpec` answers: **what can this worker do?**

`WorkContract` answers: **what is this worker allowed and required to do for this assignment, and what proof counts as complete?**

Do not widen a worker's reusable capability envelope through an assignment. Do not let model-proposed resource needs grant tools, spend or provider authority.

## 7. Role / capability policy

Each bounded role owns only the smallest domain policy needed to:

1. interpret work-specific state/evidence;
2. expose legal tools/actions;
3. compile the assignment into a `WorkContract`;
4. decide completion.

Do not build a workflow DSL.

The canonical demo adds a bounded growth/launch role. It should use owned company context, current launch messaging/landing-page state, public web, model reasoning, ordinary compute and controlled company tools to perform real internal work.

## 8. Planning and dynamic resource needs

Initial planning may identify known capability/resource requirements, but it is not required to predict every external resource before work starts.

During execution a bounded internal worker may propose that a new resource is needed. The application must validate:

- resource identity is controlled vocabulary;
- the request is relevant to the current bounded assignment;
- the worker/model is not granting itself sourcing or spend authority;
- duplicate/stale requests do not create duplicate economic work.

The model may say **what it needs**. Application code decides **whether the company owns it, whether a market path exists, whether BUY is allowed, and whether spend is authorized**.

## 9. Company resource inventory

The inventory is factual runtime truth: what the company actually controls now.

Catalog membership is identity vocabulary, not ownership evidence.

Examples of controlled resources may include:

- `llm_reasoning`;
- `public_web`;
- `company_records`;
- `company_tools`;
- `ordinary_compute`.

A missing worker is not a missing resource. If required resources are controlled, Somebody should MAKE the worker/capability internally.

## 10. Repeated sourcing policy

For each validated bounded resource need, call the canonical pure sourcing policy:

- `MAKE` — all required resources are factually controlled;
- `BUY` — at least one required resource is missing and every missing resource has an approved external provider path;
- `BLOCKED` — at least one required resource is missing and no approved path exists for one or more missing resources.

Provider approval is application-owned and resource-specific. A provider path approved for resource A cannot satisfy resource B.

`ApprovedProviderPath` means only that an approved acquisition route exists. It does not mean payment, invocation, settlement or verification occurred.

The objective itself remains active across these decisions; a BUY need must not automatically fail the whole objective.

## 11. Market discovery

Marketplace discovery is required for the canonical demo, but generalized marketplace infrastructure is not.

Define a narrow replaceable seam conceptually equivalent to:

```ts
interface MarketDiscovery {
  findCandidates(need: ResourceNeed): Promise<MarketCandidate[]>;
}
```

Implementation priority:

1. supported official OKX/Onchain OS discovery primitive if available;
2. otherwise a small application-owned synchronized snapshot of the relevant current OKX.AI offerings;
3. never undocumented/private API scraping.

The snapshot is discovery metadata only. Real provider invocation/payment must still use the provider's actual supported interface.

Candidate assessment is not a general ranking engine. It only needs enough deterministic/application-owned reasoning to distinguish:

- redundant external cognition that should be MADE internally;
- an offering that supplies the exact missing external resource;
- an offering that does not satisfy the need.

## 12. Canonical provider/resource mapping

### Rejected option — FlyBeacon or equivalent

Represents generic growth analysis/planning/content services that substantially reproduce internal reasoning/research/planning. The canonical decision should be `REJECT / MAKE internally` when the company already controls the underlying resources.

### BUY #1 — Newsliquid

Resource class: **proprietary/privileged social intelligence**, represented by existing external resource vocabulary such as `proprietary_data` where appropriate.

The result must be persisted as external evidence and materially affect subsequent internal work.

### BUY #2 — xbird

Resource class: **external social execution infrastructure / privileged execution interface**, represented by current external vocabulary such as `privileged_access` unless implementation evidence justifies a narrower new class.

The company/founder owns the X account and intent. xbird supplies the paid execution interface. Sensitive account/session credentials must never enter ordinary Convex state or logs.

Provider identities/endpoints/prices remain configuration/current-market facts, not hardcoded business logic.

## 13. Internal MAKE path

For MAKE:

1. validate capabilities/resources;
2. create/reuse a bounded internal worker;
3. bind a WorkContract;
4. deliberately select model/provider;
5. materialize only allowed tools;
6. execute with real Agent/Runner;
7. persist evidence/artifacts/effects;
8. evaluate completion using application/domain policy.

For the canonical launch demo, MAKE must change controlled launch state rather than merely returning advice. A minimal controlled launch artifact is sufficient; do not build a CMS.

BUY evidence must be able to flow back into the same mission so MAKE can revise the artifact.

## 14. BUY / payment path

For each BUY:

1. bind the selected provider path to the exact resource need;
2. request provider resource and receive live payment challenge/terms;
3. apply bounded spend/approval policy;
4. bind network, asset, amount, recipient and signing metadata from the actual challenge;
5. sign/pay through the intended OKX rail;
6. persist explicit payment state;
7. reconcile ambiguous submission before retry;
8. receive provider result/effect;
9. independently verify settlement and result/effect;
10. return verified evidence to the mission.

Preserve lifecycle distinctions such as:

`prepared → awaiting_approval → approved → payment_attempted → submitted → settled → result_received → verified`

plus failure/reconciliation-required states.

The same generic buyer rail should be safe to invoke twice within one mission without conflating the two purchases.

## 15. Effect verification

External API success is not mission completion.

For data purchases, verify that the paid result exists, has expected provider/provenance/shape and is bound to the intended resource need.

For external publishing, completion requires read-back/reconciliation proving the relaunch effect occurred. A provider saying “success” is insufficient if independent read-back is available.

Canonical effect lifecycle remains:

`intent → authorized → attempted/submitted → receipt → read-back/reconciliation → verified`

## 16. Canonical mission execution

Approved mission:

> **“Our launch isn’t working. Fix it and relaunch today.”**

Expected execution:

```text
MAKE internal growth operator
→ inspect company/launch state
→ change initial controlled launch artifact
→ identify need for privileged social intelligence
→ discover market candidates
→ reject redundant generic growth service
→ BUY Newsliquid
→ persist/verify external social evidence
→ MAKE resumes and revises positioning/artifact
→ identify need for external social execution interface
→ BUY xbird
→ publish relaunch
→ read back / verify external effect
→ final founder outcome
```

Maximum two real provider purchases.

## 17. Product surface architecture

The Objective Workspace should progressively expose:

- founder objective;
- internal worker and controlled artifact changes;
- resource needs as they emerge;
- market candidates;
- why a generic external option was rejected;
- BUY #1 provider/cost/payment/result;
- MAKE reaction to bought evidence;
- BUY #2 provider/cost/action/verification;
- final verified outcome.

Avoid giant graphs, permanent org charts, agent chat transcripts, raw wallet UI and universal marketplace surfaces.

## 18. Verification strategy

Use the repository test hierarchy.

For M2 adaptation, focus on:

- repeated resource-need persistence;
- same pure sourcing kernel reused per need;
- objective remains active across BUY decisions;
- no self-approval/provider/spend widening;
- market discovery snapshot/interface behavior;
- redundant provider rejection;
- real MAKE artifact mutation;
- backward compatibility with accepted M1 rows.

For M3/R2, focus on payment authority, duplicate prevention, ambiguous submission reconciliation and two sequential purchases.

For M4/R3, focus on cross-seam failures: payment succeeds/result fails, paid intelligence cannot be verified, MAKE fails after BUY #1, duplicate publish, publish verification failure and crash/retry between economic steps.

Run broad promotion checks once on the exact release candidate at G1.

## 19. Hard boundaries

Do not build:

- universal marketplace indexing;
- provider auctions/ranking/reputation platform;
- general A2A negotiation/escrow unless strictly forced by a provider;
- generalized cost optimizer;
- three or more providers;
- workflow DSL;
- arbitrary-prompt company OS;
- multiple polished scenarios.

The architecture should be only as general as necessary to prove the approved repeated-resource mission reliably.
