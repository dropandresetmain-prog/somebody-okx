# Model Portability Gate (Milestone 3) — ledger

Branch `gate/model-portability-acceptance` from `a8090f8` (origin/build/model-portability-milestone-2 == a8090f8).
Runtime code (`convex/ lib/ app/ package*.json`) is byte-identical to `a8090f8`; the gate adds only `scripts/gate/*`, `docs/work/gate-evidence/*` and this ledger.
Note: `aa11031` is not an ancestor of `a8090f8`; it is included as cherry-pick `d757cf7` (M2 checkpoint A).

## Phase 1 — real-provider preflight (harness: `scripts/gate/preflight.ts`, production adapters + schemas, real OpenRouter)

Boundaries: 1 interpretation · 2 strategy · 3 recommendation · 4 worker tool call+result · 5 final assessment. No repair was needed by any model on any boundary.

| model | B1 | B2 | B3 | B4 | B5 | verdict |
|---|---|---|---|---|---|---|
| openai/gpt-5.6-luna (OpenAI) | ok 1.2k tok | ok | ok | ok (4 turns) | ok | QUALIFIED |
| nex-agi/nex-n2.5-mini:free (Nex AGI) | run1 timeout@180s, run2 timeout, **run3 ok 36s** | ok | ok | ok | ok | QUALIFIED (one full clean pass; interpretation route intermittently hangs → provider_failure) |
| z-ai/glm-5.3-flash (Z.ai; Together/CoreWeave/Parasail/Wafer) | run1 timeout@180s, **run2 ok 103s** | ok | ok | ok (8 turns) | ok | QUALIFIED (reasoning model, interpretation 60–124s vs 180s cap) |
| nex-agi/nex-n2.5-pro:free | timeout ×4 | ok | ok | ok | ok | provider_failure on B1 (replay of the identical request with mini succeeds in ~50s ⇒ route flakiness) — not used |
| nvidia/nemotron-3-super-120b-a12b:free | ok 46–53s once; then 503/empty | ok | ok/unreached | tool_not_called ×2 | empty responses | unstable route; worker did not call a tool → not used |
| qwen/qwen3.8-27b:free | 429 everywhere | | | | | provider_failure (rate limited) |

Diagnostics: replaying the exact production interpretation request to GLM-5.3-flash gave HTTP 200 in 61–124s (4–11k reasoning tokens), with or without response_format/strict/require_parameters ⇒ latency of reasoning models against the fixed 180s adapter timeout, not a schema defect. The timeout is NOT widened (decision: no budget widening).

Observations, NOT defects requiring Act Now (no counted result affected):
1. worker route sends no `provider.require_parameters` (structured route does).
2. worker turns not in the management `modelCalls` ledger — intended (decision recorded by user).
3. worker `turns` telemetry reads `?` from the Agents SDK result; worker turns derived from persisted tool events / OpenRouter usage instead.

## Cohort
A `openai/gpt-5.6-luna` · B `nex-agi/nex-n2.5-mini:free` · C `z-ai/glm-5.3-flash`

## Candidate history (each engine fix resets the counted totals to zero)

| candidate | change | why |
|---|---|---|
| `3ef599e` | none (harness/evidence only, runtime == `a8090f8`) | frozen after Phase-1 preflight |
| `410d247` | reducer: no decision work scheduled at the refusal ceiling → `recovery_required` | luna-1 wedged in `executing` forever (reducer said "decide", `beginDecision` declined) |
| `77e2b72` | worker tool contract: `update_company_artifact.content` REPLACES the artifact | 3/3 Luna runs blocked at final assessment: later requirement workers overwrote the earlier diagnosis |
| `c8f197e` | proof facts credit versions authored by a requirement's own runs (history), not only current provenance | luna-2: earlier requirement's `artifact_change` proof recomputed as v0 after a later requirement updated the shared artifact → `recovery_required` |
| `f7ead5e` | interpretation prompt: `expectedOutput` must name its business subject | luna-2/4: terse `expectedOutput` became the application-owned ResourceNeed purpose; the purpose-scoped controlled offering's keyword scope gate rejected it → BUY never eligible |
| next | strategy structure: MAKE/HYBRID with no capability key → bounded repair naming legal keys | luna-3: 3 strategy calls returned MAKE with an empty capability list, each burned a refusal (ceiling = 3) |

Every fix is generic, contract/interface-level, adds no model-specific logic and does not weaken an authority gate (spend authorization, ResourceNeed validation, verification, independent completion, purpose-scope gate unchanged).

## Counted runs — candidate `f7ead5e` (SUPERSEDED by the next candidate; kept as evidence)

Model `openai/gpt-5.6-luna`, canonical objective, simulated acquisition edge (`simulateVerifiedAcquisition`), one Objective in flight at a time.

| run | Objective | outcome | elapsed | acquisition | artifact | notes |
|---|---|---|---|---|---|---|
| luna-1 | obj_1790032703969_bk8nlz | completed | 103s | none (MAKE-only, legitimate) | v4 | no refusals |
| luna-2 | obj_1790032807032_l56gm9 | completed | 129s | BUY→verified→MAKE | v3 | acquisition→resume path exercised |
| luna-3 | obj_1790032936535_cclda2 | recovery_required | 390s | BUY late (req_03) | v6 | `engine_failure`: 3 empty-capability strategy refusals exhausted the ceiling |
| luna-4/5 | (in flight when this was written) | | | | | |

Evidence: `docs/work/gate-evidence/run-luna-*.json` (raw record + workspace view + timeline). Earlier voided/superseded runs (before each fix, contaminated by my own mid-run interruptions, or driver-killed while quiescent) are under `docs/work/gate-evidence/superseded/`.

## Observations (not fixed, recorded)

1. Worker reservation is a lease (`DISPATCH_HOLD_MS` = 60 min). A dispatch deferred with `worker_reserved` gets no wake when the holder releases; an Objective can idle for minutes (observed ~3–4 min after artifact advances; unbounded when the holder is another Objective). Gate runs must therefore be strictly sequential and never interrupted mid-run.
2. Interpretation `requirementKind: "deliverable"` may be applied to several requirements sharing one artifact; addressed only for proof recomputation (`c8f197e`).
3. Luna-1 (`410d247` era) final assessment critiqued "no test results establish improvement" for an unpublished relaunch draft — assessor strictness, semantic, not changed (final assessment must not be weakened).
