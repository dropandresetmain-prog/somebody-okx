# Somebody × OKX

**Somebody is the AI manager for the One Person Company.**

One person should be able to operate with the functional reach of a much larger company. The founder gives Somebody an outcome; Somebody figures out what capabilities/resources are required, assembles the work, and remains accountable for the verified result.

For OKX Dev Day 2026, the project proves one new management/economic primitive:

> **Somebody decides what to MAKE internally and what to BUY externally, then completes the business objective using both.**

## Agent / contributor start here

Before implementation, read in this order:

1. **[`MASTER_PLAN.md`](MASTER_PLAN.md)** — locked milestone sequence, deadlines, cuts and acceptance shape.
2. **[`ARCHITECTURE.md`](ARCHITECTURE.md)** — current architecture, inherited Somebody runtime boundaries and fresh OKX data-plane decision.
3. **[`PRODUCT_SPEC.md`](PRODUCT_SPEC.md)** — product/hackathon scope.
4. **[`DECISIONS_LOG.md`](DECISIONS_LOG.md)** — settled and superseded decisions.
5. **[`REUSE_AUDIT.md`](REUSE_AUDIT.md)** — exactly what is inherited, adapted or rejected from Somebody/Army.
6. **[`BUILD_DELTA.md`](BUILD_DELTA.md)** — canonical hackathon provenance/evidence ledger.
7. **[`docs/work/ACTIVE_TASK.md`](docs/work/ACTIVE_TASK.md)** — current checkpoint and immediate next action.

For engineering work, also follow the repository/project coding instructions and the risk-based test hierarchy. Do not implement from stale chat plans when canonical docs or current code disagree.

## Locked thesis

### Customer

One-person companies, founder-led businesses and lean SMEs where important work exceeds available specialist headcount.

### Product

Somebody owns the outcome. The user should not need to manually select agents, tools, freelancers or vendors.

### MAKE

MAKE when the required resources are already controlled by the company, for example:

- generic model reasoning;
- public web/search;
- company records;
- authenticated company tools;
- ordinary compute;
- reusable internal tools.

A missing worker is **not** a missing capability. Somebody may create or reuse bounded internal capacity.

### BUY

BUY only when execution requires a genuinely externally controlled scarce resource, such as:

- proprietary/licensed data;
- privileged access;
- independent attestation;
- physical presence or real-world action;
- specialist infrastructure/compute;
- external identity/reputation/authority;
- something materially impractical to reproduce internally.

Guiding principle:

> **Do not buy generic cognition merely because somebody wrapped an LLM. Buy scarce capability.**

## Product language

The demo may call:

- **That Guy** — an internal worker Somebody creates or reuses;
- **Somebody Else** — an external provider Somebody uses when the company lacks a required scarce resource.

Engineering concepts use neutral names such as `Objective`, `WorkItem`, `WorkerSpec`, `WorkContract`, `InternalWorker`, `ExternalProvider`, `Evidence`, `Effect` and `Outcome`.

Do not preserve old internal nouns merely because they existed in the previous procurement demo.

## Architecture in one page

Somebody-OKX combines two legitimate sources of prior work at the correct boundary.

### Inherited from Somebody

Source: `dropandresetmain-prog/somebody-ai@709a169a1a4f71b8dc2d7427438ff514999fb07e`.

Pre-OKX Somebody already proved a worker/reliability architecture through procurement:

```text
role-specific policy
      |
      v
generic worker contract / reliability core
      |
      v
bounded Agent/Runner runtime
      |
      v
evidence + authorized effects
      |
      v
external read-back / verification
```

Important inherited patterns:

- `CoreWorkerContract` and controlled transitions;
- role-specific state compiling into a generic reliability contract;
- model proposes, application authorizes;
- bounded read/act tools;
- deliberate Agent/Runner model/provider configuration;
- durable runs, leases and stale-run fencing;
- evidence/provenance;
- stable effects and idempotent retries;
- persisted human authority for gated actions;
- execution is not verification;
- application proof decides completion;
- realtime state/event patterns;
- Somebody/Mission-Control visual language.

Procurement was the first demonstrated role, **not** the universal product model.

### Rebuilt from Army R&D

Source: `dropandresetmain-prog/army-of-interns@677166db591465fb6d201fb12db7cfe038557a92`.

Army contributed pre-existing R&D ideas around controlled capabilities, deny-by-default tool envelopes, worker construction and worker reuse.

Those ideas were rewritten during OKX into the pure `lib/workforce/` kernel. Army schema/runtime, ranks, personalities, org hierarchy, Telegram/Twilio and demo state machines are not carried forward.

### Current OKX architecture

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
validated capabilities/resources
      |
      v
Resource evaluation
   /             \
MAKE              BUY
 |                 |
WorkerSpec          approved provider path
 |                  |
WorkContract        spend authority
 |                  |
bounded worker      x402 / X Layer
runtime             |
 |                  ExternalProvider
 |                  |
evidence -----------+ result/receipt
        |
        v
    verification
        |
        v
      Outcome
```

`WorkerSpec` answers **what can this worker do?**  
`WorkContract` answers **what is this worker authorized/required to do for this assignment, and what proof counts as complete?**

The inherited `CoreWorkerContract` is the starting point for `WorkContract`, but its current completion rule is effect-centric and may be adapted during OKX for evidence-only internal work.

## Fresh OKX data plane

**Somebody-OKX uses a fresh Convex project/deployment and fresh operational state.**

The old `acrobatic-swan-765` deployment belonged to the previous Somebody hackathon environment.

Do not migrate or preserve by default:

- old Convex rows;
- `healthProbes`;
- `HEALTH_PROBE_WRITES_ENABLED`;
- procurement fixtures/demo state;
- old deployment pins;
- old provider bindings.

Reuse useful runtime patterns, not stale deployment/data baggage.

Old procurement code may remain temporarily for provenance/reference, but **keeping the old procurement demo operational is not an M1 acceptance criterion**.

## M1 — current immediate milestone

**M1 is one milestone: Objective spine + active MAKE + first current-product surface.**

Target: 17–18 Sep.

M1 must prove:

`objective → validated capability/resource plan → create/reuse InternalWorker → WorkContract → bounded real agent → tool-mediated work → persisted evidence/result → application-owned completion → visible current-product state`

Requirements:

- fresh OKX Convex project/data plane;
- current `Objective` / `WorkItem` persistence/read model;
- factual company resource inventory;
- model proposes capability/resource needs; application validates;
- reuse/create worker through `lib/workforce/`;
- deliberate execution-model selection;
- only WorkerSpec/WorkContract-allowed tools are materialized;
- actual `@openai/agents` Agent/Runner execution;
- multiple meaningful tool-mediated observations/actions appropriate to the role, **enforced**: one distinct company record plus two distinct public web sources, counted as distinct application-observed source identities (R1 blocker B);
- persisted evidence/result/activity;
- real UI state from the new backend.

A one-shot “LLM writes a document” proof does **not** satisfy M1.

No BUY required yet.

## Canonical demo gate

**18 September 2026, 12:00 SGT.**

The final business scenario remains open until this gate. The researched supplier-invoice / changed-payment-details / independent-attestation flow is only a candidate until accepted and technically validated.

After the gate, broad scenario ideation stops unless a material provider/technical failure forces a reopen.

## Final hackathon acceptance shape

The canonical demo must show one coherent flow:

1. founder gives Somebody a business objective;
2. Somebody identifies required capabilities/resources;
3. at least one capability follows a real MAKE path;
4. Somebody creates/reuses an internal worker and it actually executes;
5. at least one genuinely scarce capability follows a real BUY path;
6. spend is bounded and explicitly authorized where required;
7. OKX/payment/provider execution is real for the selected environment;
8. ambiguous submission/payment state is reconciled rather than blindly retried;
9. external payment/result is verified rather than assumed successful;
10. Somebody synthesizes one useful founder-facing outcome.

One workflow. One external provider on the critical path. One reliable 2–4 minute demo.

## Web3 boundary

Somebody is not a Web3-first product. Internal state, orchestration and company tooling remain normal software.

OKX / X Layer are relevant at the cross-company machine-commerce boundary: invoking an external provider, understanding the price, authorizing spend, settling payment and retaining a verifiable receipt/result.

### Payment development rail

Current documented development target:

- X Layer Testnet;
- chain ID `1952` / `eip155:1952`;
- faucet test OKB for gas;
- test USD₮0;
- official x402 Mock Merchant.

Prove:

`request → 402 → inspect terms → authorize/sign → pay → retry → resource/receipt`

before considering mainnet provider execution.

Never silently spend real funds. Wallet credentials/private keys must not enter logs or ordinary application state.

Third-party OKX.AI provider environment/network support must be verified individually.

Official references:

- https://web3.okx.com/onchainos/dev-docs/xlayer/developer/build-on-xlayer/network-information
- https://web3.okx.com/onchainos/dev-docs/payments/payment-use-buyer
- https://web3.okx.com/onchainos/dev-docs/payments/service-seller-sdk

## Provenance

The OKX Dev Day build period is **17–25 September 2026**.

Use four categories:

- **Inherited** — working pre-OKX capability;
- **Pre-existing R&D** — prior concepts/prototypes outside Somebody;
- **Rebuilt / Adapted during OKX** — prior idea/inherited primitive changed or reimplemented during the build for the current product;
- **New during OKX** — capability neither prior project had in working product form.

Current verified state:

- inherited Somebody baseline transferred and verified: **78/78 inherited tests**, root + Convex typechecks clean at the baseline checkpoint;
- rebuilt workforce kernel: **11/11 focused tests**, **89/89 cumulative** at its checkpoint, root typecheck clean;
- active dynamic worker execution, fresh Objective runtime, Make-vs-Buy, OKX buyer rail and final E2E are **not yet built**.

See [`BUILD_DELTA.md`](BUILD_DELTA.md) for exact evidence and provenance.

## Timeline

- **M0:** foundation/provenance — complete.
- **M1 (17–18 Sep):** Objective spine + active MAKE + first current-product surface.
- **Demo gate (18 Sep, 12:00 SGT):** canonical scenario lock.
- **M2 (18–19 Sep):** canonical MAKE + deterministic Make-vs-Buy.
- **M3 (19–20 Sep):** safe OKX buyer rail on X Layer Testnet.
- **M4 (20–21 Sep):** selected real BUY provider + full backend E2E.
- **M5 (21–22 Sep):** surface/story hardening + first backup video.
- **M6 (23 Sep):** release candidate.
- **23 Sep, 18:00 SGT:** hard feature freeze.
- **24 Sep:** debugging/hardening only.
- **25 Sep:** video/submission only; internal target 22:00 SGT.

## Current status

**17 September 2026:** M0 is complete. Architecture/reuse docs have been reconciled against the actual pre-OKX Somebody runtime.

**M1 built on branch `qoder/general-session-ao10w4`:** fresh current-product data plane
(`convex/schema.ts`: `objectives`, `objectiveEvents`, `evidence` only), objective spine with
fail-closed planner validation and factual MAKE/BLOCKED sourcing
(`lib/objective/`), worker resolution + WorkContract over the inherited workforce kernel,
deliberate model selection + envelope-derived tools + real `@openai/agents` Runner execution
(`lib/worker/`), the Convex objective runtime with run leases/expiry fencing
(`convex/objectives.ts`), and the current product entry point — the Objective workspace
(`app/ObjectiveWorkspace.tsx`: YOU ASKED / SOMEBODY'S PLAN / WHY MAKE? / THAT GUY / EVIDENCE /
RESULT) reusing the Mission Control visual language. Legacy procurement/unipile/google/qbo
runtime modules were removed from the active surface (provenance retained in git history);
`.env.example` carries only current-product variables.

**R1 foundation review — blockers A–F closed on `fix/r1-m1-acceptance` (static evidence
only):** evidence origin is owned by the application, so a model-authored note can never
become proof; completion now requires *distinct* application-observed sources (one company
record plus two distinct public URLs); the worker sees the bounded content it actually read,
marked untrusted; planning happens server-side through one bounded model call that fails
closed when the approved capabilities cannot satisfy the role; run finalization is
lease-fenced and idempotent; and the UI renders "Accepted" only when the application
accepted. SHAs and honest limits: `BUILD_DELTA.md` §3.5.

Remaining M1 item, unchanged and now the only one: point the app at a **fresh** Convex
deployment and run the single bounded live smoke. `npx convex dev` needs deployment
authentication this build environment does not have (`No CONVEX_DEPLOYMENT set`, and
`api.convex.dev` is unreachable), so `convex/_generated/` is still a hand-maintained
stand-in awaiting real codegen. Exact founder action: `docs/work/ACTIVE_TASK.md`.
`acrobatic-swan-765` is not a substitute and must not be used.
