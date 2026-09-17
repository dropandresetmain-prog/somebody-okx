# Somebody × OKX Dev Day 2026 — Master Plan

Status: **LOCKED — canonical demo approved 18 September 2026**  
Build period: **17–25 September 2026**  
Authoritative repo: `dropandresetmain-prog/somebody-okx`  
Hard feature freeze: **23 September 2026, 18:00 SGT**

## 1. Goal

Build the smallest reliable product that proves:

> **One person can operate with the functional reach of a much larger company because Somebody builds the internal capability it can, then buys the scarce external resources that capability cannot make.**

Canonical founder objective:

> **“Our launch isn’t working. Fix it and relaunch today.”**

The exact demo wording and bounded spend limit may be refined, but broad scenario ideation is closed unless a provider or technical blocker forces substitution.

## 2. Canonical operating model

The product is not an agent-shopping interface. The founder gives Somebody an objective, not an agent specification.

```text
Founder objective
    ↓
Determine capabilities + resource needs
    ↓
Check company-owned resources
    ↓
Do internal work where possible
    ↓
New resource need may emerge
    ↓
Discover relevant market offerings
    ↓
Assess candidates economically
    ↓
MAKE / BUY / BLOCKED
    ↓
Execute
    ↓
Repeat sourcing as needed
    ↓
Verify effects/results
    ↓
Founder outcome
```

MAKE when the required resources are already controlled by the company. Examples: generic model reasoning, public web, company records, authenticated company systems, ordinary compute and reusable internal tools.

BUY only when execution depends on an externally controlled scarce resource such as proprietary/licensed data, privileged access, distribution/execution infrastructure, independent attestation, physical capacity or specialist infrastructure.

Guiding principle:

> **Never buy generic cognition merely because somebody wrapped another LLM. Buy scarce capability.**

## 3. Canonical demo sequence

The final demo must prove one mission containing repeated resource-level sourcing decisions:

```text
MAKE
→ market discovery
→ reject unnecessary external cognition
→ BUY #1 external intelligence
→ MAKE reacts / owned state changes
→ BUY #2 external execution infrastructure
→ external action
→ verify
→ complete
```

Hackathon scope is explicitly:

- **1 meaningful MAKE path**;
- **maximum 2 real BUY transactions**;
- ideally two different resource types;
- **1 visible rejected external option** where useful;
- **1 final founder outcome**.

Do not add transactions for spectacle.

### MAKE — internal growth operator

Somebody creates or reuses a bounded internal growth/launch worker using company-controlled resources. The worker must perform real work, not merely produce a consulting report. At minimum it changes or creates a controlled launch artifact such as landing-page messaging or campaign copy.

### Rejected option — external generic growth work

A marketplace candidate whose service mostly reproduces internal reasoning/research/planning should be rejected with a clear reason. Current live illustrative candidate: **FlyBeacon**. The purpose is to prove Somebody has economic/resource judgment and is not an OKX shopping bot.

### BUY #1 — proprietary / privileged social intelligence

Primary candidate: **Newsliquid**.

Target resource class: external proprietary/privileged social intelligence unavailable from the company’s owned resources.

The purchased evidence must materially change the internal worker’s positioning, message, segment or launch artifact.

### BUY #2 — external execution infrastructure

Primary candidate: **xbird**.

Target resource class: external social execution infrastructure / privileged execution interface. The company still owns the underlying X account and intent; xbird supplies the paid automation interface. Treat this as an external execution resource, not as buying an X identity.

The final action should publish the revised launch message if provider/environment feasibility permits, then verify that the effect occurred.

## 4. Marketplace discovery

Marketplace discovery is part of the product flow, but a universal marketplace engine is out of scope.

Preferred order:

1. use a supported OKX/Onchain OS discovery/search primitive if one is officially available and appropriate;
2. otherwise use a small application-owned synchronized snapshot/catalog of the relevant current OKX.AI offerings behind a replaceable discovery interface;
3. never scrape undocumented/private APIs.

Provider invocation/payment remains real even if discovery uses the synchronized catalog fallback.

## 5. Current state

### M0 — Foundation / provenance — COMPLETE

Repo, provenance, workforce kernel, model-selection guidance and initial architecture established.

### M1 — Objective spine + active MAKE — ACCEPTED

Accepted on `main@1e2c1a484713792cead51b85e1e1ae36d28b3e77`.

Proven live on fresh Convex:

- Objective/WorkItem state;
- server-side model-proposed / application-authorized planning;
- factual company resource inventory;
- `WorkerSpec → WorkContract`;
- bounded real Agent/Runner execution;
- evidence/provenance;
- lease/fencing;
- application-owned completion;
- Objective Workspace;
- live positive MAKE proof;
- deterministic negative proof.

Do not rebuild M1.

### M2 preparation already exists

Branch: `feat/m2-make-buy-policy`  
Observed checkpoint: `4a827e891af3dd7e61cf529482a7656ee23bcb34`

Already implemented:

- deterministic `MAKE / BUY / BLOCKED` sourcing kernel;
- factual inventory as sole ownership authority;
- provider paths bound to exact resource classes;
- model cannot choose sourcing or approve spend/provider authority;
- sourcing truth persisted/rendered;
- M1 row compatibility.

The pure sourcing kernel remains authoritative and should be reused **per bounded resource need**, not discarded.

## 6. Revised milestones

Reviews are risk-boundary gates, not per-milestone ceremony.

### M2 — Repeated resource sourcing + canonical mission spine

Target: **18–19 Sep**

Adapt the existing M2 implementation from one objective-level sourcing verdict to repeated resource-level sourcing decisions inside one mission.

Build:

- canonical failing-launch objective;
- bounded internal growth/launch capability;
- real MAKE work that changes a controlled launch artifact;
- a durable resource-need / sourcing-decision record that can occur multiple times in one objective;
- bounded marketplace discovery interface;
- synchronized current-market snapshot if no supported service-search primitive exists;
- candidate assessment with explicit `REJECT / MAKE`, `BUY` or `BLOCKED` reasoning;
- application-owned approved provider paths for Newsliquid and xbird only after feasibility confirmation;
- first canonical discovery proof showing a generic growth provider rejected and Newsliquid selected for a genuine scarce resource.

Preserve the existing `lib/sourcing` kernel as the single sourcing authority.

Do **not** pay providers in M2.

M2 acceptance:

```text
canonical objective
→ internal growth capability MAKE
→ controlled artifact changed
→ new scarce resource need recorded
→ market candidates discovered
→ generic growth option rejected
→ Newsliquid path selected as BUY
```

Focused tests only; no formal review after M2 unless foundational authority/runtime unexpectedly changes.

### M3 — Repeatable OKX buyer rail + spend safety

Target: **19–20 Sep**

Consume the prepared work on `prep/m3-okx-readiness`; do not restart payment research.

Build one reusable buyer rail that can safely perform **more than one purchase in the same mission**.

Prove first against the official safe rail:

- X Layer Testnet / `eip155:1952`;
- official Mock Merchant;
- dynamic challenge terms;
- explicit lifecycle;
- reconciliation before retry.

Required lifecycle:

`request → 402 → inspect live terms → approval → sign/pay → retry → resource → receipt → verify`

Never hardcode asset, amount, recipient or signing metadata from docs when the live challenge supplies them.

The payment lifecycle must distinguish at least:

`prepared → awaiting_approval → approved → payment_attempted → submitted → settled → result_received → verified`

with failure / reconciliation-required states where needed.

No silent mainnet spend. Wallet credentials/private keys do not enter ordinary Convex state or logs.

### R2 — Payment Safety Review — CODING AGENT

Run after the complete M3 buyer-rail candidate exists.

Review/probe:

- approval bypass;
- double-pay / retry hazards;
- ambiguous submission reconciliation;
- dynamic binding of network/asset/amount/recipient/signing terms;
- testnet/mainnet separation;
- secret handling;
- idempotency across two sequential purchases.

Fix only `Act Now` blockers, rerun only invalidated evidence.

### M4 — Two real BUY providers + complete mission engine

Target: **20–21 Sep**

Integrate the canonical providers behind the smallest practical adapter seams.

Primary BUY #1: **Newsliquid** — proprietary/privileged social intelligence.

Primary BUY #2: **xbird** — paid social execution infrastructure using founder-controlled X credentials/account access.

If a provider fails immediate feasibility/reliability gates, substitute the nearest reliable provider of the **same resource type** without reopening broad scenario ideation.

Prove the complete backend mission:

```text
MAKE growth operator
→ discovery / reject redundant growth provider
→ BUY Newsliquid
→ purchased evidence persisted + verified
→ MAKE resumes and changes launch artifact
→ new execution resource need
→ BUY xbird
→ publish
→ independent read-back / verification
→ founder outcome
```

Maximum two real purchases.

Prefer A2MCP/x402 style providers. Do not add A2A negotiation/escrow unless a provider forces it and no simpler reliable path exists.

### R3 — Economic Integration Review — CODING AGENT

Run after M4 and before UI/story polish.

Use targeted failure injection across the seams:

- discovery returns stale/missing candidate;
- MAKE → BUY handoff;
- BUY #1 payment succeeds but data retrieval fails;
- malformed/unverifiable external intelligence;
- MAKE reaction fails after paid data arrives;
- BUY #2 payment/action ambiguity;
- duplicate external publish;
- publish succeeds but verification fails;
- crash/retry between economic steps;
- final synthesis must not claim completion with unresolved proof.

### M5 — Product surface + story hardening

Target: **21–22 Sep**

Refine the existing Objective Workspace to make the repeated economic reasoning obvious in 2–4 minutes:

- founder objective;
- internal growth worker / changed owned artifact;
- resource needs as they emerge;
- marketplace candidate cards;
- rejected FlyBeacon-style option with MAKE rationale;
- Newsliquid BUY #1, cost/payment/result;
- MAKE reaction;
- xbird BUY #2, cost/action/verification;
- final verified outcome.

No giant graph, raw wallet UX, agent-chat transcript or universal marketplace UI.

Record the **first full backup demo video immediately** when this works.

No formal technical review after M5 unless polish changes backend/payment/security behavior.

### M6 — Release candidate

Target: **23 Sep**

Required:

- exact canonical workflow complete;
- reset/setup reliable;
- provider fallbacks documented;
- bounded spend policy;
- demo-critical E2E verified;
- final docs/evidence current;
- backup video exists.

### G1 — Release Promotion Gate — CODING AGENT

Run once on the exact release-candidate SHA before freeze.

This is the canonical promotion gate, not another architecture review. Run the final justified build/typecheck/test/E2E/reset/deployment checks once on the exact candidate.

## 7. Five-day implementation priorities

1. **18 Sep:** reconcile docs; adapt M2 to repeated resource-level sourcing; lock discovery snapshot and provider identities.
2. **19 Sep:** complete M2 canonical mission spine; integrate prepared payment lifecycle and buyer rail.
3. **20 Sep:** R2; integrate Newsliquid + xbird; complete backend mission.
4. **21 Sep:** R3; fix blockers; harden product surface.
5. **22 Sep:** complete M5 and record backup demo.
6. **23 Sep:** M6 + G1; feature freeze 18:00 SGT.
7. **24 Sep:** debugging/hardening only.
8. **25 Sep:** video/submission only; internal submission target 22:00 SGT.

## 8. Hard non-goals

Do not build:

- universal marketplace indexing;
- provider auctions;
- general reputation/ranking infrastructure;
- automated negotiation;
- general A2A escrow machinery;
- generalized build-vs-buy cost optimization;
- three or more providers;
- workflow DSL;
- permanent giant org chart;
- second polished scenario;
- arbitrary-prompt support;
- broad company-OS architecture.

## 9. Demo success criterion

A judge should understand:

> The founder did not hire a marketing team. Somebody created the capability internally, refused to pay for work it could already do, bought proprietary market evidence only when it needed it, used that evidence to continue working, bought external execution infrastructure only when the mission reached that boundary, verified the relaunch, and returned one finished outcome.

Core line:

> **Somebody builds the company it needs, then buys what that company cannot make.**

Shared OKX vision:

> **As OKX AI’s supply side expands, the number of resources a one-person company can procure at runtime expands with it. Somebody remains the manager; OKX AI becomes the economic/resource layer it can reach into.**
