# Somebody × OKX

**Somebody is the AI manager for the One Person Company.**

Give Somebody an objective. It turns that objective into a concrete outcome, works out what must be true, assembles the internal capability it needs, decides what should be made internally versus acquired externally, asks the founder when economic authority is required, and keeps managing until the final deliverable is verified.

## What the product does

```text
Founder objective
→ outcome and success criteria
→ requirements
→ internal work and market options
→ MAKE / BUY / WAIT / ASK
→ JEV-assisted option selection when multiple eligible choices remain
→ deterministic authorization
→ execution
→ verification
→ new evidence feeds back into the work
→ final deliverable
```

Somebody is not a marketplace wrapper or a fixed workflow. The engine is generic: strategy is recomputed from the current objective, available company resources, worker capability, eligible market options, economics, evidence and authority.

## Recorded demo

The recorded demo is based on a completed run configured to exercise both **MAKE** and **BUY** paths in one objective.

The scenario uses a simulated cross-platform research benchmark so the full managerial loop is visible and repeatable. The payment and settlement flow runs on **OKX Testnet**.

The demo shows Somebody:

- doing internal company and public-research work;
- recognizing that a required benchmark is not available internally;
- evaluating external options;
- requesting founder approval for a $0.01 acquisition;
- executing the approved purchase through x402 on X Layer;
- verifying the acquired result;
- resuming internal work with the new evidence;
- producing and verifying a founder-ready final report;
- exporting the verified report as PDF.

## Start here

- [BUILD_DELTA.md](BUILD_DELTA.md) — what existed before OKX and what was built for Somebody × OKX.
- [PRODUCT_SPEC.md](PRODUCT_SPEC.md) — product behavior and current tech stack.
- [ARCHITECTURE.md](ARCHITECTURE.md) — how the engine works end to end.
- [DECISIONS_LOG.md](DECISIONS_LOG.md) — current product and architecture decisions.
- [DESIGN.md](DESIGN.md) — current product experience and visual system.
- [docs/DEVELOPMENT.md](docs/DEVELOPMENT.md) — setup, commands and development workflow.
- [docs/DEMO.md](docs/DEMO.md) — the recorded demo flow.

## Core stack

Next.js + React, Convex, LangGraph, OpenAI Agents SDK, OpenRouter, GPT-6 Luna, JEV, Vercel AI Gateway, OKX x402, X Layer Testnet, Express, TypeScript, Zod and pdf-lib.

## Product principle

**The objective creates demand. Somebody assembles the company around it.**
