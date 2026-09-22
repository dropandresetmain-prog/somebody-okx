# Task Ledger — E2E Reliability Corrections (Somebody × OKX)

Updated: 22 Sep 2026 (Singapore)

## Base / acceptance scope

- Authoritative investigated candidate: `integration/demo-replay-v6` @
  `d9ea006d24a77dc20aecb057786fbb26ad1aa62b`
  - parents: `b54a21210d5c1aba2cc57d1f7ba337f2215a8eb5` (chore/dev: local-Convex-first),
    `e170c916b1c6a6b2d9a155d48502ef81f07aca81` (test/frontend: V6 product read contract)
- Working branch (isolated worktree): `qoder/general-session-fyws0q` created from the base.
- Main checkout `origin/main` @ `2bc3e06` is a DIFFERENT line (M5 real-data); not our base.

### Newer-candidate determination

- `origin/build/demo-playback-console` @ `23a6a21` (22 Sep 19:06) is a **child** of the base
  adding a read-only V6 demo playback console. No acceptance/gate record names it as an
  accepted integration candidate; it is a parallel demo lane, not an approved base.
  → Decision: base remains `d9ea006`. Its `app/product/*` + `convex/productWorkspace.ts`
  V6 read surface IS in the base (via `e170c91`), so item J applies.

## Accepted scope of THIS task (bounded)

1. Complete, correctly scoped artifact context for writing workers (M1-A/B/C).
2. Explicit deduplicated continuation for reopened deliverables (M1-D).
3. Fingerprint identity + redecision correctness (M1-E).
4. Deterministic scenario harness over the 7 historical defect families (M1-F).
5. Truthful acquisition boundary: governed resource/purpose inputs (M2-G), financial/result
   truth (M2-H), opt-in verified record/replay (M2-I), V6 + bounded reads (M2-J).

## Explicitly OUT of scope

- No merge, deploy, or cloud Convex consumption. No payments, signing, or merchant calls.
- No model-name branching, no model-specific prompts, no forced BUY/provider,
  no proof relaxation, no expanded financial authority, no budget inflation,
  no canonical-demo choreography.
- No raising of stored artifact-size ceiling or MAX_TURNS.
- Not obtaining a live record (RECORD plumbing + tests only).

## Luna / Nex-mini parity rule

Same runtime + configuration except model identity. Any change that would behave
differently per model is out of scope by construction.
