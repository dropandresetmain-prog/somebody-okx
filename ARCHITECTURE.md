# Somebody × OKX — Architecture

Status: **canonical architecture boundaries; implementation details may evolve**
Date: **17 September 2026**

## 1. Architectural goal

Build the smallest reliable system that proves:

> **Somebody can assemble internal capability when it should MAKE and acquire external capability when it should BUY.**

The architecture must support the thesis without forcing the project into a general company-OS rewrite.

The locked milestone sequence and release freeze live in `MASTER_PLAN.md`.

## 2. High-level flow

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
Required capabilities
      |
      v
Resource evaluation
   /             \
MAKE              BUY
 |                 |
internal            OKX AI / provider
workforce            |
 |                 approval
spawn/reuse           |
worker              x402 / X Layer
 |                   |
model selection    external provider
 |                   |
tool envelope        result
 |                   |
execution            verification
 |                   |
internal result -----+
        |
        v
     Somebody
        |
        v
 founder-facing outcome
```

Somebody remains accountable. Internal workers and external providers are execution resources, not separate product protagonists.

## 3. Source-project reuse strategy

Provenance for every inherited capability — and the split between inherited, pre-existing R&D, rebuilt/adapted and newly built work — is recorded in `BUILD_DELTA.md`, the canonical hackathon evidence ledger.

### Somebody (`dropandresetmain-prog/somebody-ai`)

Audited reference: `709a169a1a4f71b8dc2d7427438ff514999fb07e`.

Transfer status: complete and verified.

Treat Somebody as the mature execution/reliability source:

- Next.js / React / Convex stack and project configuration;
- OpenAI Agents runner/provider patterns;
- reliability core: transition control, authority/approval gating, receipt verification, completion only after required effects verify;
- stable effect/idempotency patterns;
- realtime Convex views and event-log patterns;
- local write gateway/access controls;
- approval and evidence-oriented UI patterns;
- existing brand / Somebody identity.

Do **not** treat the inherited procurement aggregate as a universal workflow engine. Prefer a sibling Company Mission path over invasive generalization.

### Army of Interns (`dropandresetmain-prog/army-of-interns`)

Audited reference: `677166db591465fb6d201fb12db7cfe038557a92`.

Treat Army as pre-existing R&D, not as a product to merge.

Useful ideas:

- controlled capability vocabulary/validation;
- model proposes, application validates;
- deny-by-default mapping from capability to allowed tools;
- minimal worker construction;
- worker reuse.

Rejected baggage:

- Army-specific schema/runtime glue;
- Telegram/Twilio integrations;
- demo state machines;
- org charts/avatar UI;
- worker personalities/ranks/promotions;
- scenario-specific keyword capability analysis;
- contractor/demo scenarios;
- generalized workforce orchestration not required by the canonical demo.

The useful workforce concepts have already been rewritten into `lib/workforce/`; that implementation is OKX-period work, not a wholesale code port.

## 4. Company Mission boundary

Create a new bounded Company Mission path beside the inherited procurement mission.

Do not refactor procurement into a universal engine merely for neatness.

The Company Mission aggregate only needs enough state to represent:

- objective;
- capability plan;
- resource requirements;
- worker resolution/execution;
- sourcing decisions;
- work results/evidence;
- external effects/payment state;
- verification;
- final outcome;
- event history.

Exact schema should stay minimal and evolve only when the canonical scenario creates a concrete need.

## 5. Objective / capability planner

Input: founder objective and available company context.

Model may propose:

- controlled capability key;
- bounded responsibility/task;
- required resource classes.

Application code validates:

- capability exists;
- resources are recognized;
- requested tool permissions stay inside the capability envelope;
- worker spec is valid.

Unknown capability/resource proposals fail closed.

The planner does not decide spend authority.

## 6. Company resource inventory

Represents what the company currently controls, for example:

- public web/search;
- generic model reasoning;
- company records;
- authenticated company tools;
- ordinary compute.

The inventory is the factual input to MAKE/BUY policy. Resource ownership must not be inferred solely from whether a worker already exists.

## 7. Make-vs-Buy policy

Pure application policy returning at minimum:

- `MAKE` — required resources are owned;
- `BUY` — a required resource is externally controlled and an approved provider path exists;
- `BLOCKED` — required resource is externally controlled and no approved acquisition path exists.

Models may propose needs; application code decides sourcing.

## 8. Internal workforce path

For MAKE:

1. validate capability requirements;
2. reuse a compatible internal worker where useful, otherwise construct a minimal worker spec;
3. select an execution model according to `docs/agents/AGENT_MODEL_SELECTION.md` / `MODEL_ARSENAL.md`;
4. instantiate a real bounded agent;
5. grant only the allowed tool envelope;
6. execute the task;
7. persist result/evidence;
8. expose failure rather than fabricating completion.

The canonical demo requires **active internal agent spawning**. A `WorkerSpec` object alone is not sufficient.

Architecture, security-sensitive work, wallet/signing/payment paths and final verification remain primary-model responsibilities regardless of worker routing guidance.

### Implemented kernel seam

`lib/workforce/` already provides:

- controlled capability definitions with resource requirements;
- fail-closed validation;
- deny-by-default tool permissions;
- minimal worker specs;
- reuse-or-create resolution.

It is pure, Convex-free and scenario-independent. Active execution, persistence and the planner above it are not yet built.

## 9. External procurement path

For BUY:

1. identify an approved provider path;
2. establish expected price/network/recipient/terms;
3. apply spend policy and human approval where required;
4. invoke provider through the relevant OKX AI / Onchain OS flow;
5. persist explicit payment/effect state;
6. receive external result;
7. verify settlement/result before marking complete.

Never treat payment initiation or HTTP success as equivalent to confirmed delivery.

Provider-specific behavior belongs behind the smallest practical adapter seam.

## 10. Payment-state safety

Preserve explicit states such as:

`prepared → awaiting_approval → approved → payment_attempted → submitted → settled → result_received → verified`

plus terminal/reconciliation-required failures.

Requirements:

- no silent mainnet payment;
- no duplicate payment on retry;
- no blind retry after ambiguous submission/payment state;
- reconcile before repaying;
- quote/payment terms checked against approved terms;
- wallet credentials/private keys never logged or persisted in application state;
- testnet and mainnet behavior visibly distinct.

## 11. OKX / X Layer test environment

**X Layer Testnet (`eip155:1952`) plus the official Mock Merchant is the preferred initial OKX payment development environment.**

Develop and exercise:

`request → 402 → inspect terms → authorize/sign → pay → retry → resource/receipt`

before any mainnet provider consideration.

The payment rails have a sandbox/testnet, but third-party OKX.AI providers are not automatically mirrored there. Provider environment/network support is provider-specific and must be verified before live use.

## 12. Product surface architecture

The engine is core, but the Company Mission surface is developed incrementally from M1.

The surface should expose only the information required to understand the management decision:

- founder objective;
- capabilities;
- MAKE/BUY reasons;
- internal worker creation/reuse/status/result;
- external provider, missing resource and price;
- spend approval/payment state;
- result verification;
- Somebody's unified final outcome.

Product labels may call an internal worker **That Guy** and an external provider **Somebody Else**. Engineering types remain neutral.

Avoid giant graphs, permanent org charts, raw agent-chat logs and Web3-first wallet UX.

## 13. Canonical-demo independence

The baseline architecture must not hard-code the current invoice/Dial research candidate.

Do not build a generic marketplace framework either. Support one canonical provider cleanly after the demo decision gate.

The canonical scenario should be locked by **18 September 2026, 12:00 SGT**, after which broad scenario ideation stops unless a material provider/technical failure forces a reopen.

## 14. Verification strategy

Verification is risk-based and follows the repo's test hierarchy.

Current satisfied gates:

1. inherited Somebody baseline: 78/78 tests, clean root + Convex typechecks;
2. workforce kernel: 11 focused tests, 89/89 cumulative tests, root typecheck clean.

Next gates:

3. M1 focused Company Mission/planner/worker-spawn tests before broader regression checks;
4. OKX buyer path proven against official Mock Merchant on testnet before real-provider spending;
5. selected provider passes one bounded technical validation before becoming critical path;
6. one full no-cut E2E works before stretch features;
7. promotion/release gate runs once on the exact release candidate before feature freeze/submission.
