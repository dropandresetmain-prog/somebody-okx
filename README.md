# Somebody × OKX

**Somebody is the AI manager for the One Person Company.**

The long-term vision is simple: one person should be able to operate with the functional reach of a much larger company. The user delegates an outcome to Somebody; Somebody determines what capabilities are required and assembles the resources needed to deliver it.

For OKX Dev Day 2026, the project focuses on one missing primitive:

> **Somebody decides what to MAKE internally and what to BUY externally, then completes the business objective using both.**

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

## Make vs Buy rule

**MAKE by default** when the work can be performed with company-owned resources such as generic model reasoning, public web information, company data, existing authenticated company tools or ordinary compute. The absence of a pre-existing agent is not a reason to buy; Somebody can create internal capacity.

**BUY** only when the capability depends on something controlled externally, such as proprietary/licensed data, privileged access, independently controlled real-world action, third-party attestation, specialist infrastructure, scarce compute or another resource that would be materially impractical to reproduce internally.

Guiding principle:

> **Do not buy generic cognition merely because somebody wrapped an LLM. Buy scarce capability.**

## Web3 boundary

Somebody is not a Web3 product. Internal state, orchestration and company tooling remain normal software.

OKX / X Layer are relevant at the cross-company machine-commerce boundary: discovering or invoking an external provider, understanding the price, authorizing spend, settling payment and retaining a verifiable receipt without establishing a traditional billing/API-key relationship with every provider.

## Hackathon shape

The canonical demo is **not yet selected**.

Whichever demo is chosen must prove one coherent end-to-end flow:

1. Founder gives Somebody a business objective.
2. Somebody identifies required capabilities.
3. At least one capability follows a real **MAKE** path.
4. At least one genuinely scarce capability follows a real **BUY** path through OKX AI.
5. The external result/payment is verified rather than assumed successful.
6. Somebody combines internal and external work into one useful business outcome.

One workflow. One external provider on the critical path. One reliable demo.

## Build provenance

This repository is the authoritative implementation and submission repository for OKX Dev Day.

Somebody × OKX builds on two projects created before OKX Dev Day:

- **Somebody** (`dropandresetmain-prog/somebody-ai` @ `709a169`) — the existing AI-manager product and reliability/runtime foundation.
- **Army of Interns** (`dropandresetmain-prog/army-of-interns` @ `677166d`) — separate workforce R&D from which selected concepts may be adapted. It was never part of the Somebody product.

**The OKX Dev Day submission is judged on the new work built during 17–25 September 2026.**

### Before OKX

Inherited from Somebody: the Next.js/React/Convex product shell and Mission Control operator UI, a controlled mission lifecycle, the reliability core (state transitions, approval-gated effects, receipt read-back, completion only after required effects verify), a persisted effect lifecycle with stable effect identity so retries reconcile instead of duplicating, content-addressed evidence and provenance, an `@openai/agents` runtime with bounded tools over OpenRouter/OpenAI, and live integrations for Gmail, Sheets, Calendar, Drive, public-web sourcing, Unipile (WhatsApp/Instagram) and QuickBooks Online Sandbox — with 78 passing tests and clean typechecks.

Army of Interns separately contributed no product code, but holds prior R&D on controlled capability vocabulary and validation, worker creation and reuse, and deny-by-default permission envelopes.

### During OKX Dev Day

**Target scope:** Somebody decides what to **MAKE** internally using resources the company already controls and what to **BUY** externally through OKX AI when a capability depends on a genuinely scarce external resource, then completes one business objective using both — with bounded spend authorization, real payment settlement and verification of the external result.

**Completed so far:** the canonical SSOT documents, an audited byte-verified transfer of the inherited Somebody baseline, verification that the inherited baseline passes its own tests and typechecks inside this repository, imported model-selection guidance, and a documented sandbox-first payment development strategy.

**Not yet built:** the Make-vs-Buy policy, the dynamic workforce, OKX AI marketplace integration, Agentic Wallet, x402 payments, X Layer settlement, external-provider verification and the final canonical demo.

See **[`BUILD_DELTA.md`](BUILD_DELTA.md)** for the complete evidence record, including per-capability provenance, exact source SHAs and the explicit completed-vs-planned split.

Neither source project is sacred architecture. Reuse only what saves time and strengthens the canonical demo.

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

Every payment-path change should be exercised here before any mainnet consideration.

### Marketplace-provider caveat

**The payment rails have a testnet. The OKX AI marketplace does not have a mirrored sandbox.**

Individual marketplace providers may:

- support testnet;
- support mainnet only;
- expose free/unpaid test endpoints;
- have their own environment constraints.

The selected BUY provider must therefore be **individually verified** before live use. A provider that settles only on X Layer Mainnet requires a separate explicit live-integration decision.

**Mainnet expenditure must remain bounded and explicitly approved.** Never silently spend real funds, and keep testnet and mainnet behavior visibly distinct.

Official references:

- https://web3.okx.com/onchainos/dev-docs/xlayer/developer/build-on-xlayer/network-information
- https://web3.okx.com/onchainos/dev-docs/payments/payment-use-buyer
- https://web3.okx.com/onchainos/dev-docs/payments/service-seller-sdk

## Repository SSOT

Read these before implementation:

- `PRODUCT_SPEC.md` — locked product and hackathon scope.
- `ARCHITECTURE.md` — target boundaries and reuse strategy.
- `DECISIONS_LOG.md` — settled decisions and superseded ideas.
- `REUSE_AUDIT.md` — audited source-project reuse findings.
- `BUILD_DELTA.md` — canonical hackathon provenance/evidence ledger: inherited vs built during 17–25 September 2026.
- `docs/work/ACTIVE_TASK.md` — current checkpoint, next action and evidence state.
- `docs/agents/AGENT_MODEL_SELECTION.md` — default model/harness/subagent routing guidance.
- `docs/agents/MODEL_ARSENAL.md` — deeper model reference behind that routing.

## Current status

**17 September 2026:** canonical documentation pass complete. The inherited Somebody baseline has been transferred and verified in this repository (78/78 tests, clean root and Convex typechecks). No OKX-specific capability is implemented yet.

Next engineering checkpoint: adapt the verified baseline and import minimal workforce primitives. Canonical demo selection remains open and must not be silently hard-coded into baseline architecture.
