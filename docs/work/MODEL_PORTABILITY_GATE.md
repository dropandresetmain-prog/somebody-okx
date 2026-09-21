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
