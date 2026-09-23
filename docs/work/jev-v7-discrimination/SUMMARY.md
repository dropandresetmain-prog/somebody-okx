# Jev V7 discrimination eval (J3.1)

Generated: 2026-09-23T10:37:26.027Z
HEAD: `6f04e94b5f4ba83f30aa08eb05dc9cc7dd5f0c9b` (from J3 `6f04e94`)

## Verdict

**READY_FOR_J4_DISABLED_INTEGRATION**

Clean derived dominance cases pass under both rubrics; proceed to J4 composition behind default-OFF gate only.

## Corpus

- Real multi-option (corrected labels): 5
- REAL_DERIVED_VARIANT discrimination: 9

## Clean dominance (derived variants only)

| Rubric | Match corrected expected |
|--------|-------------------------|
| baseline | 5/5 |
| neutral | 5/5 |

Confidently wrong (clean): baseline none; neutral none

## Ambiguous / null expected

| Rubric | cases |
|--------|-------|
| baseline | 7 |
| neutral | 7 |

## Label audit (`v7_cp2_two_external_providers_price_dominance`)

| | |
|---|---|
| J3 label | `DETERMINISTIC_DOMINANCE` → cheaper BUY `opt_b4d674…` |
| J3.1 corrected | `DETERMINISTIC_DOMINANCE` → internal MAKE `opt_3d1baaf…` (full-set Pareto on known cost/time) |
| J3 “confidently wrong” | **Retracted** — Jev choosing MAKE matched corrected dominance; prior label ignored eligible MAKE. |
| Data quality | BUY options carry `externalAdvantage=speed` while total known minutes (100) exceed MAKE (30); **no documented field precedence** in V7 code. |

## Original → corrected multi-option labels

| caseId | original | corrected |
|--------|----------|-----------|
| `v7_cp2_make_vs_buy_both_eligible` | HUMAN_REVIEW | HUMAN_REVIEW (Pareto: MAKE dominates on known facts; subjective factors preserved) |
| `v7_cp2_wrapper_inside_budget_make_wins` | DETERMINISTIC → MAKE | unchanged (confirmed) |
| `v7_cp2_hybrid_eligible` | HUMAN_REVIEW | HUMAN_REVIEW |
| `v7_cp2_two_external_providers_price_dominance` | DETERMINISTIC → BUY B | **DETERMINISTIC → MAKE** |
| `v7_cp2_make_vs_buy_speed_tradeoff` | HUMAN_REVIEW | HUMAN_REVIEW (Pareto front: MAKE + BUY) |
| `v7_derived_price_swap_two_external` | AMBIGUOUS | AMBIGUOUS (MAKE still dominates known facts) |

J3 `docs/work/jev-v7-shadow/cases.json` is **unchanged**; corrections live in `label-audit.json` and `corrected-real-cases.json`.

## Real multi-option A/B (corrected expected where applicable)

| case | baseline | neutral | corrected match |
|------|----------|---------|-----------------|
| `v7_cp2_two_external_providers_price_dominance` | MAKE | MAKE | yes (both rubrics) |
| `v7_cp2_wrapper_inside_budget_make_wins` | MAKE | MAKE | yes |
| Tradeoff / HUMAN_REVIEW reals | MAKE (high p) | MAKE (high p) | n/a |

## MAKE-bias conclusion

- On **isolated derived controls**, Jev picks MAKE when strictly superior and BUY when strictly inferior (**5/5** each rubric).
- On **real** multi-option sets, high-confidence MAKE often aligns with **known-fact Pareto dominance**, not unexplained bias.
- Residual concern: **question under-specification** + **fixture `externalAdvantage=speed` contradicting timing** (DATA_QUALITY), not a failure to discriminate when dimensions are clean.

## HYBRID

`disc_hybrid_present_observation`: baseline & neutral both select MAKE (~92% / 0% hybrid). **Park for Later** — no redesign to force HYBRID.

## Confidently wrong (clean dominance, post-correction)

**None** (baseline or neutral).

## Latency / tokens (28 gateway calls)

- Combined median ~598ms · total tokens ~63,834 · marketCost not reported by gateway

## Triage

| Finding | Class |
|---------|--------|
| J3 BUY-only dominance label on `two_external` | **Act Now** (fixed in audit artifact; was benchmark error) |
| `externalAdvantage` vs timing contradiction in CP2 fixtures | **Investigate Now** (grounding/data hygiene) |
| Real multi-option corpus still small | **Investigate Now** |
| HYBRID never selected | **Park for Later** |
| Neutral rubric ≈ baseline on this corpus | **Ignore / Accept Risk** (no new systematic bias introduced) |

## J4 recommendation

**READY_FOR_J4_DISABLED_INTEGRATION** — build J2-bridge composition behind existing **default-OFF** gate; do **not** enable Jev by default. Keep fail-closed fallback to incumbent recommend path. Continue growing REAL multi-option replay corpus in parallel.
