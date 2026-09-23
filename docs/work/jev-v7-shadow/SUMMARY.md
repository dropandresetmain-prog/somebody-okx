# Jev V7 shadow evaluation (J3)

Generated: 2026-09-23T10:12:40.036Z
Branch: `eval/jev-v7-shadow`
Starting SHA: `5ff9d2c5392a64cdbe60ebf8839ee2ab61b53891`

## Verdict

**MORE_EVIDENCE_REQUIRED**

Shadow eval incomplete or inconclusive; keep Jev gate OFF and expand REAL multi-option corpus.

## Corpus

- Total cases: 13
- REAL: 12 · REAL_DERIVED_VARIANT: 1
- ONE_CANDIDATE: 7
- MULTI_CANDIDATE_CLEAR: 2
- MULTI_CANDIDATE_AMBIGUOUS: 4

## Multi-candidate by reference kind

- HUMAN_REVIEW: 0/3 match labeled expectation; confidently wrong: 0
- DETERMINISTIC_DOMINANCE: 1/2 match labeled expectation; confidently wrong: 1
- AMBIGUOUS: 0/1 match labeled expectation; confidently wrong: 0

## Single-candidate control

- Valid Jev selection: 7/7
- Bridge OK: 7/7

## Latency / cost

- Median 556ms · p95 784ms · max 784ms
- Tokens (sum): in 19835 · out 1358 · total 21193
- marketCost (sum): 0

## Confidently wrong

- v7_cp2_two_external_providers_price_dominance: chose opt_3d1baaf29c53c6746c21f1df (top=0.9)

## Failure classification

- MODEL_LIMITATION: 1

## State-shaping findings

- Jev strongly favors internal MAKE when `internalCostUsd` is present even when two verified BUY offerings differ only by price (`v7_cp2_two_external_providers_price_dominance`, 90% on MAKE vs 8% on the cheaper BUY).
- Cost-dominance cases with MAKE vs expensive wrapper work (`v7_cp2_wrapper_inside_budget_make_wins`, 88% MAKE, matches incumbent).
- Tradeoff cases (MAKE vs BUY vs HYBRID) collapse to high-confidence MAKE without using HYBRID (`v7_cp2_make_vs_buy_both_eligible`, `v7_cp2_hybrid_eligible`).
- Convex-persisted boundaries in local dev are overwhelmingly single-candidate (6/6 extracted); multi-option production evidence remains thin in this environment.

## Jev / bridge / parser failures

- Gateway: 0 failures with `AI_GATEWAY_API_KEY` from main `.env.local`.
- Bridge: 13/13 successful selections bridged to `ManagerialRecommendation` shape.
- Parser: not exercised in this harness (authorization seam unchanged by design).

## Triage

| Item | Class | Why |
| --- | --- | --- |
| Thin REAL multi-option corpus (6 multi, only 2 with deterministic labels) | **Investigate Now** | Cannot gate J4 on managerial judgment without more grounded MAKE/BUY/A/B states from live objectives. |
| Price-dominance miss on two-BUY scenario | **Act Now** | State/question may need explicit “among verified BUY, prefer lower price when resource class matches” without weakening eligibility. |
| HYBRID never selected in multi-option tradeoffs | **Park for Later** | May be correct conservatism; needs human review labels before prompt changes. |
| Convex extract yields mostly ONE_CANDIDATE | **Park for Later** | Local dev objectives rarely surface multi-eligible rows; use replay exports when available. |
| Single-candidate 7/7 valid + bridge | **Ignore / Accept Risk** | Control group passes; does not prove judgment quality. |
| Latency median ~556ms | **Ignore / Accept Risk** | Within prior Jev spike range for optional Stage-3. |

## J4 routing recommendation

Keep `JEV_OPTION_SELECTION_ENABLED` **off** by default. If J4 experiments, use **fail-closed**: Jev lock among eligible IDs only; on `unavailable` / `invalid_response` / identity drift, fall back to incumbent `recommend(eligible)` — never silent unconstrained selection.
