# Model portability cohort — 2026-09-23

- **Tested SHA:** `26685a2ccf9e9b6057d807a92e8e71dad20154b9` (`integration/okx-final-convergence`)
- **Convex:** local (`http://127.0.0.1:3210`)
- **JEV_OPTION_SELECTION_ENABLED:** false
- **Models:** `openai/gpt-5.6-luna`, `nvidia/nemotron-3-super-120b-a12b:free`, `nex-agi/nex-n2.5-mini:free`
- **Cohort:** 9/9 objectives, sequential, 15m cap each

## Run-level

| Model | Run | State | Time | BUY | Acquisition | Resume | Artifact | Primary issue |
| --- | --- | --- | ---: | --- | --- | --- | --- | --- |
| Luna | luna-1 | completed | 144 | no | no | no | 4 | — |
| Nemotron Super Free | nemotron-super-1 | recovery_required | 96 | no | no | no | 1 | Model semantic |
| Nex 2.5 Mini Free | nex-mini-1 | waiting | 904 | no | no | no | 3 | Provider / transport (gate timeout) |
| Luna | luna-2 | completed | 176 | no | no | no | 5 | — |
| Nemotron Super Free | nemotron-super-2 | received | 904 | no | no | no | 1 | Provider / transport (gate timeout) |
| Nex 2.5 Mini Free | nex-mini-2 | received | 904 | no | no | no | 1 | Provider / transport (gate timeout) |
| Luna | luna-3 | completed | 187 | no | no | no | 4 | — |
| Nemotron Super Free | nemotron-super-3 | received | 904 | no | no | no | 1 | Provider / transport (gate timeout) |
| Nex 2.5 Mini Free | nex-mini-3 | received | 904 | no | no | no | 1 | Provider / transport (gate timeout) |

## Per-model summary

| Model | Completed | Median | Provider failures | Structural failures | Semantic failures |
| --- | ---: | ---: | ---: | ---: | ---: |
| Luna | 3/3 | 176s | 0 | 0 | 0 |
| Nemotron Super Free | 0/3 | 904s | 2 | 0 | 1 |
| Nex 2.5 Mini Free | 0/3 | 904s | 3 | 0 | 0 |

## Objective IDs & evidence

- **luna-1** `obj_1790157937616_xgtaj4` → `docs/work/gate-evidence/run-luna-1-obj_1790157937616_xgtaj4.json`
- **nemotron-super-1** `obj_1790158107577_pjy2gq` → `docs/work/gate-evidence/run-nemotron-super-1-obj_1790158107577_pjy2gq.json`
- **nex-mini-1** `obj_1790158222171_okuuz9` → `docs/work/gate-evidence/run-nex-mini-1-obj_1790158222171_okuuz9.json`
- **luna-2** `obj_1790159214990_uzq2rq` → `docs/work/gate-evidence/run-luna-2-obj_1790159214990_uzq2rq.json`
- **nemotron-super-2** `obj_1790159406069_n6wpmh` → `docs/work/gate-evidence/run-nemotron-super-2-obj_1790159406069_n6wpmh.json`
- **nex-mini-2** `obj_1790160326370_xyw54k` → `docs/work/gate-evidence/run-nex-mini-2-obj_1790160326370_xyw54k.json`
- **luna-3** `obj_1790161249408_c3rzpk` → `docs/work/gate-evidence/run-luna-3-obj_1790161249408_c3rzpk.json`
- **nemotron-super-3** `obj_1790161453482_cs7qdj` → `docs/work/gate-evidence/run-nemotron-super-3-obj_1790161453482_cs7qdj.json`
- **nex-mini-3** `obj_1790162375324_rix8ig` → `docs/work/gate-evidence/run-nex-mini-3-obj_1790162375324_rix8ig.json`

## Patterns (observed)

- **Luna:** 3/3 reached full execution; 3/3 **completed** in ~2.5–3.1 min; MAKE-only paths; no BUY.
- **Nemotron Super Free:** 1/3 **recovery_required** quickly; 2/3 stuck in **received** until 15m cap (interpretation never advanced reqs).
- **Nex Mini Free:** 1/3 **waiting** at cap; 2/3 **received** at cap; long runs when partially progressing (nex-mini-1).

## Findings

- **Investigate Now:** Nemotron `:free` route — 2/3 runs never left `received` before gate timeout (provider/transport vs model).
- **Investigate Now:** Nex Mini — inconsistent interpretation latency (one run ~15m `waiting`, others cap in `received`).
- **Park for Later:** Gate treats `waiting`/`received` at 15m as valid terminal capture (not in poll break list but evidence written).
- **Ignore / Accept Risk:** Luna baseline strong on this canonical demo under identical rules.
