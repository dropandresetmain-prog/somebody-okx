# ACTIVE_TASK — OKX Final Release Candidate

## Goal

Converge accepted side-lanes into the latest product candidate, prove one real
current-path E2E Objective, prove truthful demo-playback fallback, run the
canonical promotion gate once on the exact frozen SHA, then freeze and push.
No feature work. Defects only if they block the canonical demo.

## Base / Branch

| Field | Value |
|---|---|
| Base SHA (verified) | `600b6fc664b974ca13a58125d3f8b008f639d6ee` |
| Base message | `test(product): verify founder spend approval seam` |
| Release branch | `release/okx-final-candidate` |
| Worktree | `C:\Dev\somebody-okx-okx-final-candidate` |
| Current HEAD | `9a91109` (pre-freeze; focused tests pending) |
| Merged main | NO |

## Integration checklist

1. [x] Create release branch/worktree from exact `600b6fc`
2. [x] Integrate I/O hardening `5f0fe43` → `118e7b7` (clean auto-merge objectives.ts)
3. [x] Local-Convex workflow `b54a212` → `323140b` (dev-only; included)
4. [x] Demo playback from `23a6a21` → `9a91109` (conflicts resolved)
5. [ ] Focused integration tests green
6. [ ] Commit remaining fixes if any; push; freeze candidate SHA
7. [ ] Real current-path E2E (product `/start`, not seeded)
8. [ ] Browser acceptance (V6 lifecycle screenshots)
9. [ ] Demo playback fallback acceptance
10. [ ] Promotion gate on exact frozen SHA
11. [ ] Final freeze: clean working tree, remote tip == candidate SHA

## Side-lanes

| Lane | SHA | Status |
|---|---|---|
| I/O hardening | `5f0fe43` → `118e7b7` | integrated; create path + bounds preserved |
| Local Convex workflow | `b54a212` → `323140b` | integrated (dev scripts/docs only) |
| Demo playback console | `23a6a21` → `9a91109` | integrated; ProductWorkspace keeps spend approval + DemoConsole |

## Conflict resolutions

- `ProductWorkspace.tsx`: useProductWorkspace + DemoConsole + live submitAttentionActionV1 (disabled during demo)
- `product-workspace.css`: keep V6 fidelity animations; add demo-console styles; keep 1000px breakpoint
- `v6ProductWorkspace.test.ts`: assert reads via seam; assert spend command still in container

## Current checkpoint

Side-lanes converged at `9a91109`. Next: focused integration tests.

## Next action

Run focused product/I/O/demo tests + `npm run typecheck:convex`.

## Critical constraints

- Do NOT work on `build/founder-spend-approval-v1` directly.
- Do NOT merge random historical branches.
- Do NOT add features / redesign / opportunistic refactors.
- Preserve: createObjectiveV1, submitAttentionActionV1, Product Reads only, V6 fidelity.
- Financial: no unauthorized mainnet; truthful provenance.
- After freeze: no source edits during gate unless blocker; then new SHA + full re-gate.
- Re-read this file before live E2E, final gate, and completion.

## Acceptance evidence checklist

- [ ] Objective created via V6 Product Command
- [ ] Intern work + finding/evidence
- [ ] MAKE/BUY + Needs You spend approval via UI
- [ ] FounderSpendGrant + approval_resolved wake
- [ ] External result with truthful provenance
- [ ] Artifact change + semantic assessment + completion
- [ ] Browser states A–F
- [ ] Demo playback load/advance/reset/restore live
- [ ] Promotion gate classified; exact SHA frozen + pushed
