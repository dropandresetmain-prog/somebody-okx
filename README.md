# Somebody × OKX

**Somebody is the AI manager for the One Person Company.**

> **Somebody builds the company it needs, then buys what that company cannot make.**

One person should be able to operate with the functional reach of a much larger company. The founder gives Somebody an outcome; Somebody determines the capabilities/resources required, assembles internal capacity, procures scarce external resources when necessary, verifies the work, and remains accountable for the result.

## Start here

Before implementation, read in this order:

1. [`MASTER_PLAN.md`](MASTER_PLAN.md) — current milestone sequence, review gates, canonical demo and release timeline.
2. [`ARCHITECTURE.md`](ARCHITECTURE.md) — current repeated-resource architecture and authority boundaries.
3. [`PRODUCT_SPEC.md`](PRODUCT_SPEC.md) — canonical product/demo scope.
4. [`DECISIONS_LOG.md`](DECISIONS_LOG.md) — settled/superseded decisions.
5. [`REUSE_AUDIT.md`](REUSE_AUDIT.md) — inherited/adapted/rejected source-project material.
6. [`BUILD_DELTA.md`](BUILD_DELTA.md) — hackathon provenance/evidence ledger.
7. [`docs/work/ACTIVE_TASK.md`](docs/work/ACTIVE_TASK.md) — current implementation checkpoint.

Treat current code/runtime/schema and newer accepted decisions as truth. Do not implement from stale chat plans.

## Canonical demo

Approved founder objective:

> **“Our launch isn’t working. Fix it and relaunch today.”**

The exact demo wording and a small believable spend limit may be refined, but broad scenario ideation is closed unless provider/technical feasibility forces a substitution.

Canonical demo shape:

```text
MAKE internal growth capability
→ controlled launch artifact changes
→ new external resource need
→ discover market candidates
→ reject redundant generic growth service
→ BUY #1 Newsliquid social intelligence
→ MAKE reacts to bought evidence
→ new execution resource need
→ BUY #2 xbird execution interface
→ publish relaunch
→ verify external effect
→ final founder outcome
```

Maximum two real provider purchases. Each BUY must be justified by a real resource gap.

## Product thesis

### MAKE

MAKE when required resources are already controlled by the company, including generic model reasoning, public web/search, company records, authenticated company systems, ordinary compute and reusable internal tools.

A missing worker is not a missing capability. Somebody creates/reuses bounded internal capacity.

MAKE means real execution:

`WorkerSpec → WorkContract → model selection → Agent/Runner → allowed tools → evidence/artifact/effect`

### BUY

BUY only when execution requires a genuinely externally controlled scarce resource such as proprietary data, privileged access, external execution/distribution infrastructure, independent authority/attestation, physical capacity or specialist infrastructure.

> **Do not buy generic cognition merely because somebody wrapped an LLM. Buy scarce capability.**

The model may propose resource needs. Application code owns factual inventory, provider approval, sourcing, spend authority and completion.

## Repeated resource sourcing

The objective itself is not globally labelled MAKE or BUY.

As work progresses, new bounded resource needs may emerge. Each need goes through:

```text
resource need
→ factual company inventory
→ market discovery
→ candidate assessment
→ canonical MAKE / BUY / BLOCKED policy
→ execution
→ verification
```

The existing pure `lib/sourcing/policy.ts` is the single deterministic sourcing authority and should be reused for each resource need.

## Marketplace discovery

Somebody is not an agent-shopping bot. The marketplace is treated as a **resource/capability market**.

For the hackathon, discovery stays deliberately narrow:

- use a supported official discovery/search primitive if available;
- otherwise use a small application-owned synchronized snapshot of the relevant current OKX.AI offerings behind a replaceable interface;
- do not scrape undocumented/private APIs.

Provider invocation/payment remains real.

Current canonical market set:

- **FlyBeacon** — illustrative generic growth option; reject/MAKE internally when it duplicates company-controlled cognition/research/planning;
- **Newsliquid** — primary BUY #1 candidate for proprietary/privileged X/social intelligence;
- **xbird** — primary BUY #2 candidate for external social execution infrastructure / privileged execution interface.

If a primary provider fails immediate feasibility/reliability validation, replace it with the nearest reliable provider of the same resource type without reopening broad scenario ideation.

## Architecture in one page

```text
Founder objective
      ↓
Somebody / capability planning
      ↓
Internal worker executes
      ↓
new ResourceNeed
      ↓
company inventory → market discovery → candidate assessment
      ↓
canonical sourcing policy
   MAKE / BUY / BLOCKED
      ↓
internal work OR payment/provider
      ↓
verified evidence/effect
      ↓
worker resumes; another need may emerge
      ↓
verified Outcome
```

`WorkerSpec` answers **what can this worker do?**  
`WorkContract` answers **what is this worker authorized/required to do for this assignment and what proof counts as complete?**

Product labels may use **That Guy** for internal workers and **Somebody Else** for external providers. Engineering concepts stay neutral.

## Current status

### M0 — complete

Foundation, provenance and rewritten workforce kernel established.

### M1 — ACCEPTED

Accepted on `main@1e2c1a484713792cead51b85e1e1ae36d28b3e77`.

Proven live on fresh Convex:

- Objective/WorkItem runtime;
- server-side model proposal + application authorization;
- factual inventory;
- dynamic internal worker creation;
- `WorkerSpec → WorkContract`;
- real bounded `@openai/agents` Runner execution;
- evidence/provenance;
- lease/fencing;
- application-owned completion;
- Objective Workspace;
- positive live MAKE proof;
- deterministic negative proof.

Do not rebuild M1.

### M2 — implemented generically; adaptation required

Current branch: `feat/m2-make-buy-policy`  
Observed SHA: `4a827e891af3dd7e61cf529482a7656ee23bcb34`

It already has the verified deterministic MAKE/BUY/BLOCKED kernel, factual inventory, provider-path authority boundary and persisted sourcing truth.

The approved scenario changes the integration shape: M2 must reuse that kernel for **repeated resource-level sourcing decisions** instead of treating one objective-level sourcing verdict as terminal.

### M3 preparation — ready to consume

`prep/m3-okx-readiness` contains payment-rail research and a pure payment lifecycle kernel. Do not restart payment research from zero.

## Payment boundary

The buyer rail must consume live challenge terms dynamically rather than hardcoding asset/amount/recipient/signing metadata from documentation.

Maintain explicit states such as:

`prepared → awaiting_approval → approved → payment_attempted → submitted → settled → result_received → verified`

Submission is not settlement; settlement is not result/effect verification. Ambiguous submission reconciles before retry.

Wallet credentials/private keys and sensitive X account/session credentials never enter ordinary Convex state or logs.

## Milestones

`M0 ✅ → M1 ✅ → R1 ✅ → M2 → M3 → R2 → M4 → R3 → M5 → M6 → G1`

- **M2 (18–19 Sep):** repeated resource sourcing + canonical growth MAKE + bounded market discovery + rejected generic provider + Newsliquid BUY decision.
- **M3 (19–20 Sep):** repeatable safe OKX buyer rail, capable of two sequential purchases; then R2 payment-safety review.
- **M4 (20–21 Sep):** Newsliquid BUY → MAKE reaction → xbird BUY/publish → verify → complete backend mission; then R3 integration review.
- **M5 (21–22 Sep):** demo surface/story hardening; immediately record first full backup demo.
- **M6 (23 Sep):** exact release candidate.
- **G1:** one promotion gate on exact RC before hard feature freeze at 18:00 SGT on 23 Sep.
- **24 Sep:** debugging/hardening only.
- **25 Sep:** video/submission only; internal submission target 22:00 SGT.

## Hard non-goals

Do not turn the remaining build into infrastructure work. Out of scope: universal marketplace indexing, provider auctions/reputation platform, generalized negotiation/A2A escrow, generic build-vs-buy optimizer, three or more providers, workflow DSL, giant org chart, arbitrary-prompt company OS or a second polished scenario.

## Provenance

Build period: **17–25 September 2026**.

Use four categories in `BUILD_DELTA.md`: **Inherited**, **Pre-existing R&D**, **Rebuilt / Adapted during OKX**, and **New during OKX**.

Pre-OKX Somebody contributes the worker/reliability architecture; Army of Interns contributes R&D inspiration for controlled capabilities/resources and worker construction/reuse. Current OKX implementation must be reported honestly against repository evidence.
