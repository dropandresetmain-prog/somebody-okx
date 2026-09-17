# Somebody × OKX — Architecture

Status: **canonical architecture boundaries; implementation details may evolve**
Date: **17 September 2026**

## 1. Architectural goal

Build the smallest reliable system that proves:

> **Somebody can assemble internal capability when it should MAKE and acquire external capability when it should BUY.**

The architecture must support the thesis without forcing the project into a general company-OS rewrite.

## 2. High-level flow

```text
Founder objective
      |
      v
   Somebody
      |
      v
Capability requirements
      |
      +-------------------+
      |                   |
      v                   v
MAKE decision         BUY decision
      |                   |
create/reuse           external provider
bounded worker         via OKX AI
      |                   |
execute                authorize spend
      |                   |
internal result        payment/request
      |                   |
      |                external result
      |                   |
      +---------+---------+
                |
                v
             Verify
                |
                v
             Synthesize
                |
                v
        Founder-facing outcome
```

## 3. Source-project reuse strategy

### Somebody (`dropandresetmain-prog/somebody-ai`)

Pre-transfer audited reference: `709a169a1a4f71b8dc2d7427438ff514999fb07e`.

Treat Somebody as the mature execution/reliability source.

Strong reuse candidates:

- Next.js / React / Convex stack and project configuration;
- OpenAI Agents runner/provider patterns;
- reliability core concepts: transition control, authority/approval gating, receipt verification, completion only after required effects are verified;
- stable effect/idempotency patterns;
- realtime Convex views and event-log patterns;
- local write gateway / access controls;
- approval and evidence-oriented UI patterns;
- existing brand / Somebody identity where useful.

Do **not** assume the existing procurement aggregate is a universal workflow engine. Its quote/vendor/MOQ/purchase-order semantics are specific to the previous demo. Prefer sibling functionality over invasive generalization.

### Army of Interns (`dropandresetmain-prog/army-of-interns`)

Pre-transfer audited reference: `677166db591465fb6d201fb12db7cfe038557a92`.

Treat Army as an R&D source, not as a product to merge.

Useful ideas/patterns:

- controlled capability vocabulary / validation;
- model may propose capabilities but application validates them;
- deny-by-default mapping from capability to allowed tools;
- simple worker specification containing only the information required to execute a bounded task.

Likely not worth importing wholesale:

- Army-specific schema/runtime glue;
- Telegram/Twilio integrations;
- demo state machines;
- org charts and avatar UI;
- worker personalities/ranks/promotions;
- contractor quoting/demo scenarios;
- broad workforce orchestration not required by the canonical demo.

## 4. Target logical components

Names are descriptive, not mandatory file paths.

### Objective / capability planner

Input: founder objective and company context.

Output: bounded capability requirements and required resource types.

The model may propose. The application validates.

### Company resource inventory

Represents resources Somebody already controls, such as:

- public web/search;
- generic model reasoning;
- company records;
- authenticated company tools;
- normal compute.

This is the basis for MAKE decisions.

### Make-vs-Buy policy

Pure application policy returning at minimum:

- `MAKE` — required resources are owned;
- `BUY` — a required resource is externally controlled and an acceptable provider exists;
- `BLOCKED` — a required resource is missing and no approved acquisition path exists.

Models must not bypass this policy.

### Internal workforce path

For MAKE:

- find an existing suitable worker where useful, or create a bounded worker;
- grant only the tools required by the capability;
- execute the task;
- persist output/evidence;
- expose failure rather than fabricating completion.

Hackathon scope does not require a generalized organization engine.

### External procurement path

For BUY:

- identify/choose an allowed provider;
- establish expected price/network/recipient/terms;
- apply spend policy and human approval where required;
- invoke the provider using the relevant OKX AI / Onchain OS payment flow;
- persist transaction state and provider response;
- verify receipt/result before marking complete.

Never treat submission/payment initiation as equivalent to confirmed delivery.

## 5. Payment-state safety

Where external payment is involved, preserve explicit states such as:

`intent → authorized → attempted/prepared → submitted/paid → delivered → verified`

and terminal failure states.

Requirements:

- no silent mainnet payment;
- no duplicate payment on retry;
- no retry after an ambiguous submitted state without reconciliation;
- quote/payment terms checked against approved terms;
- wallet credentials/private keys never logged or persisted in application state;
- testnet and mainnet behavior visibly distinct.

## 6. OKX / X Layer test environments

Official OKX documentation provides a real X Layer testnet:

- X Layer Testnet chain ID: `1952` (`eip155:1952`);
- test OKB for gas;
- test USD₮0 stablecoin via faucet;
- official Mock Merchant for exercising the x402 buyer flow without real funds.

The Onchain OS buyer quickstart explicitly demonstrates the payment flow on X Layer Testnet before switching to mainnet.

Important limitation:

> **The payment rails have a sandbox/testnet, but third-party OKX.AI providers are not automatically mirrored into that sandbox.**

Each canonical BUY provider must be checked for its supported network/environment. A provider that only settles on X Layer Mainnet requires a separate explicit live-integration decision.

## 7. Canonical-demo independence

The baseline architecture must not hard-code the current invoice/Dial research candidate.

Provider-specific code should sit behind the smallest practical adapter/seam so that a failed provider validation does not force a workforce/policy rewrite.

Do not build a generic marketplace framework; support one canonical provider cleanly once selected.

## 8. Persistence boundary

Exact schema is deferred until after the source transfer and canonical demo decision.

Persistence must be able to represent:

- objective;
- capability requirements;
- resource needs;
- MAKE/BUY/BLOCKED decisions and reasons;
- internal worker assignment/result;
- spend authorization;
- external effect/payment state;
- external result and verification evidence;
- final synthesis / mission status.

Preserve the existing Somebody principle: model proposals are not authoritative persisted facts until application policy accepts them.

## 9. Verification strategy

Verification is risk-based.

Initial gates:

1. transferred Somebody baseline still passes its existing relevant tests/typechecks;
2. transferred workforce primitives have focused tests around capability validation/tool permissions;
3. OKX testnet payment path works against official Mock Merchant before provider-specific live spending;
4. canonical external provider passes one bounded end-to-end validation before UI polish;
5. one full no-cut demo flow works before stretch features.
