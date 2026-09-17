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

## Source projects

This repository is the authoritative implementation and submission repository for OKX Dev Day.

Existing work is reused from:

- `dropandresetmain-prog/somebody-ai` — mature mission/reliability patterns, agent runner, Convex realtime state, approval/effect/verification concepts and existing product UI.
- `dropandresetmain-prog/army-of-interns` — R&D source for lightweight dynamic workforce ideas, especially controlled capability validation and deny-by-default tool permissions.

Neither source project is sacred architecture. Reuse only what saves time and strengthens the canonical demo.

## Repository SSOT

Read these before implementation:

- `PRODUCT_SPEC.md` — locked product and hackathon scope.
- `ARCHITECTURE.md` — target boundaries and reuse strategy.
- `DECISIONS_LOG.md` — settled decisions and superseded ideas.
- `REUSE_AUDIT.md` — audited source-project reuse findings.
- `docs/work/ACTIVE_TASK.md` — current checkpoint, next action and evidence state.

## Current status

**17 September 2026:** first canonical documentation pass. Source-project transfer is the next engineering checkpoint. Canonical demo selection remains open and must not be silently hard-coded into baseline architecture.
