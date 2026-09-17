# Somebody × OKX

**Somebody is the AI manager for the One Person Company.**

The long-term vision is simple: one person should be able to operate with the functional reach of a much larger company. The user delegates an outcome to Somebody; Somebody determines what capabilities are required and assembles the resources needed to deliver it.

For OKX Dev Day 2026, the project focuses on one missing primitive:

> **Somebody decides what to MAKE internally and what to BUY externally, then completes the business objective using both.**

The locked execution plan is in **[`MASTER_PLAN.md`](MASTER_PLAN.md)**.

## Locked thesis

### Customer
One-person companies, founder-led businesses and lean SMEs where important work exceeds available specialist headcount.

### Problem
Small teams do not lack work. They lack ownership, capacity and access to some capabilities or resources.

### Product
Somebody owns the outcome. The user should not need to manually select agents, tools, freelancers or vendors.

### OKX project
The hackathon proves two paths:

- **MAKE** — dynamically create or reuse internal AI capacity using resources the company already controls.
- **BUY** — acquire a genuinely scarce external capability through OKX AI when the company does not possess the required underlying resource.

The Make-vs-Buy decision is the center of the project.

A missing worker is not a missing capability. If the company owns the required resources, Somebody should be able to create or reuse a bounded internal worker and execute the task.

## Product language

The demo surface may use two simple labels:

- **That Guy** — an internal worker created or reused by Somebody for a bounded task.
- **Somebody Else** — an external provider hired when the company lacks a genuinely scarce required resource.

Engineering terminology remains `InternalWorker` and `ExternalProvider`.

Possible product line:

> **Somebody builds what your company can do — and finds Somebody Else for what it can't.**

## Make vs Buy rule

**MAKE by default** when the work can be performed with company-owned resources such as generic model reasoning, public web information, company data, existing authenticated company tools or ordinary compute. The absence of a pre-existing agent is not a reason to buy; Somebody can create internal capacity.

**BUY** only when the capability depends on something controlled externally, such as proprietary/licensed data, privileged access, independently controlled real-world action, third-party attestation, specialist infrastructure, scarce compute or another resource that would be materially impractical to reproduce internally.

Guiding principle:

> **Do not buy generic cognition merely because somebody wrapped an LLM. Buy scarce capability.**

## Web3 boundary

Somebody is not a Web3 product. Internal state, orchestration and company tooling remain normal software.

OKX / X Layer are relevant at the cross-company machine-commerce boundary: invoking an external provider, understanding the price, authorizing spend, settling payment and retaining a verifiable receipt without establishing a traditional billing/API-key relationship with every provider.

## Hackathon shape

The canonical business scenario is **not yet selected**.

Whichever scenario is chosen must prove one coherent end-to-end flow:

1. Founder gives Somebody a business objective.
2. Somebody identifies required capabilities.
3. At least one capability follows a real **MAKE** path.
4. Somebody creates or reuses an internal worker and that worker actually executes.
5. At least one genuinely scarce capability follows a real **BUY** path through OKX AI.
6. Spend is bounded and explicitly authorized where required.
7. The external payment/result is verified rather than assumed successful.
8. Somebody combines internal and external work into one useful business outcome.

One workflow. One external provider on the critical path. One reliable demo.

## Product surface

The engine is core, but the demo surface is built alongside it rather than bolted on at the end.

The Company Mission surface should progressively show:

`objective → capabilities → MAKE/BUY reasons → internal worker(s) → external provider → approval/payment/verification → Somebody outcome`

The UI should make the management logic obvious without turning into a giant graph, permanent org chart, agent-chat viewer or wallet dashboard.

## Build provenance

This repository is the authoritative implementation and submission repository for OKX Dev Day.

Somebody × OKX builds on two projects created before OKX Dev Day:

- **Somebody** (`dropandresetmain-prog/somebody-ai` @ `709a169`) — the existing AI-manager product and reliability/runtime foundation.
- **Army of Interns** (`dropandresetmain-prog/army-of-interns` @ `677166d`) — separate workforce R&D that never shipped inside Somebody.

**The OKX Dev Day submission is judged on the new work built during 17–25 September 2026.**

The project uses four provenance categories:

- **Inherited** — working pre-OKX capability;
- **Pre-existing R&D** — prior concepts/prototypes outside Somebody;
- **Rebuilt / Adapted during OKX** — a prior idea reimplemented inside Somebody-OKX after discarding broken/demo-specific architecture;
- **New during OKX** — capability neither prior project had in working product form.

### Before OKX

Inherited from Somebody: the Next.js/React/Convex product shell and Mission Control operator UI, a controlled procurement mission lifecycle, reliability primitives, persisted effects, idempotency, evidence/provenance, verification-before-completion, an `@openai/agents` runtime, and live integrations for Gmail, Sheets, Calendar, Drive, public-web sourcing, Unipile and QuickBooks Online Sandbox — with 78 passing tests and clean typechecks.

Army separately contained R&D around controlled capability vocabulary, capability validation, worker creation/reuse and deny-by-default permission envelopes.

### During OKX Dev Day

**Built so far:** the canonical SSOT and provenance docs, audited transfer/verification of the inherited Somebody baseline, imported model-selection guidance, sandbox-first payment strategy, and the first genuine OKX-period product capability: a rewritten scenario-independent workforce kernel in `lib/workforce/` with controlled capabilities, resource requirements, fail-closed validation, deny-by-default tool permissions, minimal worker specs and reuse-or-create resolution.

**Not yet built:** active internal agent spawning, Company Mission runtime, objective→capability planning, company resource inventory, deterministic Make-vs-Buy policy, OKX AI buyer integration, x402/X Layer payment lifecycle, real external-provider verification and the final canonical demo.

See **[`BUILD_DELTA.md`](BUILD_DELTA.md)** for the complete evidence record.

## Development and testing environment

Grounded in official OKX documentation. No payment code exists yet; this is the rail it will be developed against.

### X Layer Testnet

- chain ID: `1952`
- CAIP-2 / network form: `eip155:1952`
- faucet **test OKB** available for gas
- faucet **test USD₮0** available for payment testing

### Official x402 test flow

The official Onchain OS buyer documentation provides a **Mock Merchant on X Layer Testnet**, so the complete buyer lifecycle can be tested without real funds:

```text
request → 402 Payment Required → authorize/sign → pay → retry → receive resource/receipt
```

> **This is our default development rail for payment integration.**

### Marketplace-provider caveat

**The payment rails have a testnet. The OKX AI marketplace does not have a mirrored sandbox.**

Individual marketplace providers may support testnet, be mainnet-only, expose free/unpaid test endpoints, or have their own environment constraints. The selected BUY provider must therefore be individually verified before live use.

**Mainnet expenditure must remain bounded and explicitly approved.** Never silently spend real funds, and keep testnet and mainnet behavior visibly distinct.

Official references:

- https://web3.okx.com/onchainos/dev-docs/xlayer/developer/build-on-xlayer/network-information
- https://web3.okx.com/onchainos/dev-docs/payments/payment-use-buyer
- https://web3.okx.com/onchainos/dev-docs/payments/service-seller-sdk

## Timeline and freeze

- **M1 (17–18 Sep):** Company Mission spine + active MAKE + first product surface.
- **Demo gate (18 Sep, 12:00 SGT):** canonical scenario selection closes broad ideation.
- **M2 (18–19 Sep):** canonical MAKE path + Make-vs-Buy policy.
- **M3 (19–20 Sep):** safe generic OKX buyer rail on X Layer Testnet.
- **M4 (20–21 Sep):** real selected BUY provider + full backend E2E.
- **M5 (21–22 Sep):** product-surface/story hardening + first backup demo video.
- **M6 (23 Sep):** release candidate.
- **23 Sep, 18:00 SGT:** hard feature freeze.
- **24 Sep:** debugging/hardening only.
- **25 Sep:** video + submission only; internal target 22:00 SGT.

## Repository SSOT

Read these before implementation:

- `MASTER_PLAN.md` — locked build sequence, scope cuts, freeze and demo/product-surface strategy.
- `PRODUCT_SPEC.md` — locked product and hackathon scope.
- `ARCHITECTURE.md` — target boundaries and reuse strategy.
- `DECISIONS_LOG.md` — settled decisions and superseded ideas.
- `REUSE_AUDIT.md` — audited source-project reuse findings.
- `BUILD_DELTA.md` — canonical hackathon provenance/evidence ledger.
- `docs/work/ACTIVE_TASK.md` — current checkpoint, next action and evidence state.
- `docs/agents/AGENT_MODEL_SELECTION.md` — default model/harness/subagent routing guidance.
- `docs/agents/MODEL_ARSENAL.md` — deeper model reference behind that routing.

## Current status

**17 September 2026:** M0 is complete. The inherited Somebody baseline is verified in this repo, and the first rebuilt OKX-period workforce kernel is implemented and tested (11 focused workforce tests; 89/89 cumulative tests; root typecheck clean).

Next milestone: **M1 — Company Mission spine + active internal agent spawning + first product surface.** Canonical demo selection remains open until the 18 Sep decision gate.
