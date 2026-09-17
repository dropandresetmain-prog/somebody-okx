# ACTIVE TASK — Somebody × OKX Dev Day 2026

Status: ACTIVE
Updated: 17 September 2026

## Goal

Deliver one reliable 2–4 minute end-to-end demo proving:

`founder objective → capability plan → MAKE + BUY → verified result → useful business outcome`

## Authoritative repo

`dropandresetmain-prog/somebody-okx`

## Source baselines

- Somebody: `dropandresetmain-prog/somebody-ai@709a169a1a4f71b8dc2d7427438ff514999fb07e`
- Army of Interns: `dropandresetmain-prog/army-of-interns@677166db591465fb6d201fb12db7cfe038557a92`
- Pre-build planning evidence: `dropandresetmain-prog/wip-personal`, branch `planning/somebody-okx`, commit `1ca59ce4aad64b04fc1ed8caadd2301eb33033ab`

## Locked constraints

- Somebody remains the product/brand.
- One Person Company is the vision, not a separate product.
- MAKE and BUY must both be real in the final demo.
- Missing worker != missing capability.
- Do not buy generic cognition merely because another agent sells it.
- BUY must be justified by an externally controlled scarce resource or materially impractical internal reproduction.
- External payment/result must be verified; submission is not completion.
- Prefer testnet/sandbox for development when supported.
- Never silently spend real funds or expose wallet credentials/private keys.
- One external provider on the critical path.
- One canonical demo only.
- Do not generalize into an autonomous-company platform.

## Current checkpoint

### Completed

- [x] Product/customer thesis locked.
- [x] OKX project thesis locked.
- [x] Make-vs-Buy rule locked.
- [x] Web3/OKX role bounded to external machine commerce.
- [x] Pre-build Opus planning artifacts ingested.
- [x] Source-repo reuse audit distilled into SSOT.
- [x] X Layer / Onchain OS test environment verified from official docs.
- [x] First canonical documentation pass created in final repo.

### Not yet complete

- [ ] Transfer working Somebody baseline into this repo.
- [ ] Verify transferred baseline with relevant existing checks.
- [ ] Transfer/rewrite minimal workforce primitives from Army.
- [ ] Choose canonical business objective/demo.
- [ ] Choose and validate canonical BUY provider.
- [ ] Prove OKX testnet buyer/payment path against official Mock Merchant.
- [ ] Implement demo-specific MAKE path.
- [ ] Implement demo-specific BUY path.
- [ ] Integrate, harden and record.

## Immediate next action

### Transfer Pass A — Somebody baseline

Bring the working Somebody application from the exact audited source SHA into this repo.

Acceptance evidence:

1. transferred files match intended source provenance;
2. no secrets/local env files are transferred;
3. install succeeds;
4. existing relevant test suite passes;
5. root + Convex typechecks pass if those scripts remain applicable;
6. repo clearly distinguishes inherited baseline from OKX-specific work.

Do not redesign during transfer.

### Transfer Pass B — minimal workforce primitives

After Pass A is healthy:

- inspect the Army source files identified in `REUSE_AUDIT.md`;
- transfer or rewrite only controlled capability validation + deny-by-default tool permissions + minimal worker shape;
- add focused tests for those primitives;
- do not import Army runtime/schema/UI wholesale.

## Canonical demo gate

Demo decision remains OPEN.

Current research candidate: supplier invoice / changed payment details with an external independent voice/attestation provider.

Do not build scenario-specific UI/schema until this or another candidate is explicitly accepted.

A candidate must answer:

1. What founder objective matters?
2. What real capability follows MAKE?
3. What scarce resource forces BUY?
4. Why is internal LLM/web/tooling not a reasonable substitute?
5. Which currently available OKX AI provider supplies it?
6. Can it be demonstrated reliably within 2–4 minutes?
7. Can its payment/result path be developed safely, preferably on testnet or with a bounded explicit mainnet approval?

## Evidence discipline

- Check items only after evidence passes.
- Run focused checks after each transfer/change.
- Do not automatically run broad/full suites except baseline/promotion checkpoints where they answer a real uncertainty.
- Never claim a live OKX call, payment, confirmation, deployment or persistence without observing it.
- Keep mock/testnet/mainnet visibly distinguishable.

## Cut order if schedule slips

1. marketplace discovery/ranking;
2. multiple internal workers;
3. dynamic worker reuse;
4. visual polish/animation;
5. LLM flexibility in decomposition (controlled demo capabilities are acceptable).

Do NOT cut:

- real MAKE execution;
- justified BUY decision;
- actual OKX integration;
- spend/payment safety;
- external result verification;
- final synthesis into a founder-facing outcome.
