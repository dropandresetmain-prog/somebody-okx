# Jev sourcing experiment — Luna Run 1B + Nex Run 1 (combined report)

**Architecture candidate:** `integration/jev-sourcing-experiment` @ `043d24eb80ca060eee71b0835cb87159c534b7f9`  
**Config:** `testnet_demo`, `JEV_OPTION_SELECTION_ENABLED=true`, payment OFF (`M4_M3_EXECUTION_ENABLED=false`), worker max turns **16**, experiment cap **5 min** (objective budget).

**Invalid / excluded:** Run 1A `obj_1790243907700_spk25d` (pre–grounding-fix diagnostic only).

---

## Executive comparison

| | **Luna Run 1B** | **Nex Run 1** |
|--|-----------------|---------------|
| Objective | `obj_1790249916225_k55nas` | `obj_1790250330627_tl7ivz` |
| Model | `openai/gpt-5.6-luna` | `nex-agi/nex-n2.5-mini:free` |
| Wall time (create → capture) | ~5.7 min to blocked; later `escalated` | ~12.8 min; `recovery_required` |
| Final control state | `escalated` (after `blocked` on final assessment) | `recovery_required` / UI **Blocked** — decision refusal ceiling on `req_01` |
| Requirements satisfied | 3/3 (all **MAKE**) | 0/3 (all still **active**) |
| OKX `market_search` events | **4** (3 merchants each) | **6** (3 merchants each) |
| Intern / worker | Yes — multiple MAKE assignments; last run **7** tool calls, DELIVERED | Yes — one run **failed** (max **16** turns) |
| Needs You | **No** | **Yes** (founder spend approval for Guru BUY; not approved) |
| Payment | None | None |

---

## Shared sourcing architecture (post-fix)

Both runs show the **corrected** marketplace picture on early epochs:

| Option | Typical eligibility |
|--------|---------------------|
| **MAKE** | Eligible (until worker attempt ceiling / availability changes) |
| **Social Media Guru** | Eligible (`proprietary_data`, `external_social_intelligence` scope) |
| **Token Market Intelligence** | Ineligible — **Different purpose** (UI) / purpose + no execution path (persisted detail) |
| **Wallet / Onchain Risk** | Ineligible — same pattern |

**Three merchants discovered:** yes on every `market_search` integration card.

---

## Luna Run 1B — `obj_1790249916225_k55nas`

**URL:** http://127.0.0.1:3000/?objective=obj_1790249916225_k55nas  
**Evidence:** `docs/work/gate-evidence/jev-sourcing-experiment-run-1b-2026-09-24/`

### Outcome contract

Intent (abridged): evidence-bounded launch-week social plan for TikTok, Instagram, Facebook, and X from company materials + public research; no invented audience/engagement claims.

### Requirements (3)

1. **Evidence inventory** (`req_evidence_inventory`) — satisfied, **MAKE**
2. **Channel insights** (`req_channel_insights`) — satisfied, **MAKE**
3. **Execution-ready launch-week social media plan** (`req_launch_week_plan`) — satisfied, **MAKE**

### Sourcing epochs (4 decisions)

| # | Requirement | Selected | Eligible set (UI) | `selectionSource` |
|---|-------------|----------|-------------------|-------------------|
| 1 | `req_evidence_inventory` | MAKE | MAKE + Guru | `incumbent_fallback` |
| 2 | `req_channel_insights` | MAKE | MAKE + Guru | `incumbent_fallback` |
| 3 | `req_launch_week_plan` (a1) | MAKE | MAKE + Guru | `incumbent_fallback` |
| 4 | `req_launch_week_plan` (a2) | MAKE | MAKE + Guru | `incumbent_fallback` |

### Jev

| Question | Answer |
|----------|--------|
| Jev called successfully (`selectionSource: jev`)? | **No** |
| Jev call attempts (2-eligible epochs) | **4** epochs with MAKE + Guru eligible; compose path used **`incumbent_fallback`** (Jev **attempted**, pre-selection **technical_failure**, then **one** incumbent managerial recommendation per epoch) |
| Jev selected option | N/A (no successful Jev bridge) |
| Incumbent selected | **MAKE** all four times |

### Worker / intern

- Intern ran on MAKE path; final accepted run `run_a37ad3bfc45c327568a96ebc`, **7** tool calls, terminal **DELIVERED** (spine).
- **NEEDS_INPUT:** no validated `resourceNeeds` at stop.
- **Second epoch on same requirement:** yes — `req_launch_week_plan` **r1_a1** and **r1_a2** (re-decision after worker cycle).

### Stop / quality gate

- **Final semantic assessment:** `meetsMinimumBar: false` (launch-week plan bar: dated schedule + source-linked public research).
- **Blocked:** serial final-assessment recovery exhausted (**2/2**).
- **Escalated:** `maxNoProgressCycles` (persisted after blocked).
- **Needs You:** no.
- **Payment:** none.

### UI notes

- BUY distractors show founder-friendly **“Different purpose”** for token/wallet.
- When two options eligible, activity can show an **alternative** BUY (Guru) alongside selected MAKE.

---

## Nex Run 1 — `obj_1790250330627_tl7ivz`

**URL:** http://127.0.0.1:3000/?objective=obj_1790250330627_tl7ivz  
**Evidence:** `docs/work/gate-evidence/jev-sourcing-experiment-run-nex-1-2026-09-24/`

### Outcome contract

Intent (abridged): same substance — evidence-bounded launch-week plan across four platforms.

### Requirements (3)

1. **Evidence boundary** (`req_01`) — **active**, no strategy (stuck)
2. **Audience findings** (`req_02`) — **active**
3. **Launch-week channel plan** (`req_03`) — **active**

### Sourcing on `req_01` (6 market searches / 6 decision rows)

**Phase A — two eligible (MAKE + Guru):** decisions **a1–a3** authorized **MAKE** via **`incumbent_fallback`** (same Jev technical-failure → incumbent pattern as Luna when both eligible).

**Phase B — MAKE hard-ineligible:** worker run `run_1e79070fceec56fb3025cd7a` **failed** (**16** tool calls, max turns). Later epochs show MAKE **ineligible** (`not_available` in UI) — worker attempt ceiling / availability policy.

**Phase C — sole eligible Guru:** decisions **a4–a6** → **`sole_eligible`** (Jev **not** called); authorization **`approval_required`** → strategy **WAIT** / UI **ASK** — founder spend limit not set for $0.01 Guru BUY.

| # | Phase | Selected (authorization) | `selectionSource` |
|---|-------|--------------------------|-------------------|
| a1–a3 | 2 eligible | MAKE (authorized) | `incumbent_fallback` |
| a4–a6 | Guru only | BUY → **WAIT** (approval required) | `sole_eligible` |

### Jev

| Question | Answer |
|----------|--------|
| Successful Jev selection | **No** |
| Jev attempts on 2-eligible epochs | **3** (with incumbent fallback) |
| Jev on sole-eligible Guru | **Not called** (by design) |

### Needs You / stop

- **Needs You:** yes — repeated **approval_required** for Social Media Guru; payment execution off; **no manual approval** (per experiment protocol).
- **Stop reason:** `decision refusal ceiling exhausted (3)` for `req_01` → **`recovery_required`** / blocked in UI.
- **NEEDS_INPUT:** no `resourceNeeds` rows; stall is **spend approval + decision ceiling**, not intern NEEDS_INPUT.
- **Second sourcing epoch:** yes — six decision passes on **`req_01` only** (never reached `req_02`/`req_03`).

### Payment

None. No acquisitions.

---

## Cross-run experiment conclusions

1. **Grounding fix validated:** both models see **MAKE + Social Media Guru eligible** and **purpose-rejected distractors** — unlike Run 1A.
2. **Jev success criterion not met:** no epoch with `selectionSource: jev`; repeated **`incumbent_fallback`** when two options eligible indicates **Jev compose technical_failure** (investigate gateway/model adapter separately from grounding).
3. **Luna** progressed through full MAKE pipeline but **failed independent launch-week evidence bar** (expected strict gate).
4. **Nex** demonstrated **MAKE-eligibility collapse after max-turn worker failure**, then **sole-eligible BUY** path to **Needs You** — useful evidence for policy/planning; not a payment E2E.

---

## Artifact index

| Path | Contents |
|------|----------|
| `jev-sourcing-experiment-run-1b-2026-09-24/` | Luna `run-report.json`, `objective-full-record.json`, `product-workspace-v1-projection.json` |
| `jev-sourcing-experiment-run-nex-1-2026-09-24/` | Nex same trio |
| This file | Combined human report |

Raw JSON is authoritative for timestamps, rationales, and full activity payloads.
