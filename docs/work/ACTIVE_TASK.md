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
- Model guidance source: `dropandresetmain-prog/resume-copilot@78d147716cf314b766aaed91d9fcde23959ea690`

## Canonical operating documents

- `BUILD_DELTA.md` — canonical hackathon provenance/evidence ledger. Inherited vs built 17–25 Sep 2026. Update at every milestone.
- `docs/agents/AGENT_MODEL_SELECTION.md` — default model/harness/effort and subagent routing.
- `docs/agents/MODEL_ARSENAL.md` — deeper model reference behind that routing.

Architecture, integration decisions, wallet/signing/payment work, security-sensitive code and final verification stay with the primary model. Bounded independent low-risk work may be delegated per the imported guidance.

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
- [x] Transfer working Somebody baseline into this repo — `a47cc93`; 113/115 shared files byte-identical to `somebody-ai@709a169`.
- [x] Verify transferred baseline with relevant existing checks — 17 Sep 2026 at `093d247`: `npm test` 78/78 pass, `npm run typecheck` clean, `npm run typecheck:convex` clean.
- [x] Build-provenance ledger created (`BUILD_DELTA.md`).
- [x] Model/subagent selection guidance imported into `docs/agents/`.
- [x] OKX sandbox/test strategy recorded in `README.md`.

### Not yet complete

- [ ] Transfer/rewrite minimal workforce primitives from Army.
- [ ] Choose canonical business objective/demo.
- [ ] Choose and validate canonical BUY provider.
- [ ] Prove OKX testnet buyer/payment path against official Mock Merchant.
- [ ] Implement demo-specific MAKE path.
- [ ] Implement demo-specific BUY path.
- [ ] Integrate, harden and record.

## Immediate next action

### Transfer Pass A — Somebody baseline — **COMPLETE**

Bring the working Somebody application from the exact audited source SHA into this repo, without redesign.

Acceptance evidence, all satisfied 17 September 2026:

1. transferred files match intended source provenance — 113/115 shared blobs byte-identical to `somebody-ai@709a169`; only `README.md`/`ARCHITECTURE.md` intentionally replaced by OKX SSOT, originals preserved under `docs/legacy/somebody-ai/`;
2. no secrets/local env files are transferred — only `.env.example` (variable names only) is tracked; all `.env*` gitignored;
3. install succeeds — `npm ci`, 140 packages;
4. existing relevant test suite passes — `npm test`, 78/78;
5. root + Convex typechecks pass — `npm run typecheck` and `npm run typecheck:convex`, both clean;
6. repo clearly distinguishes inherited baseline from OKX-specific work — `BUILD_DELTA.md`.

No redesign occurred during transfer.

### Transfer Pass B — minimal workforce primitives — **NEXT**

Pass A is healthy, so this is the current next action:

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
