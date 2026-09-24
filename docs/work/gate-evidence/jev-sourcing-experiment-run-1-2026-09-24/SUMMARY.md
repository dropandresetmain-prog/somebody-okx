# Jev sourcing integration — Founder Live Run #1 (Luna)

Captured 2026-09-24 from local Convex (`http://127.0.0.1:3210`) via read-only queries.
No secrets, API keys, or wallet material are included in the JSON dumps.

## Identification

| Field | Value |
| --- | --- |
| **Branch** | `integration/jev-sourcing-experiment` @ `caa82c6` (requirements schema fix) |
| **Objective key** | `obj_1790243907700_spk25d` |
| **Workspace URL** | `http://127.0.0.1:3000/?objective=obj_1790243907700_spk25d` |
| **Model** | `openai/gpt-5.6-luna` (OpenRouter) |
| **Execution mode** | `testnet_demo`, `JEV_OPTION_SELECTION_ENABLED=true`, M4/M3 payment off |
| **Protocol** | `m61_serial_v1` |

**Founder request (launch-week social plan):** TikTok, Instagram, Facebook, and X — channel-specific
formats, posting priorities, messaging from audience behaviour / engagement trends; use company +
public research first; do not guess when evidence is unavailable.

**Do not retry:** `obj_1790242959908_58oszl` (interpretation HTTP 400 on requirements decomposition;
fixed by `caa82c6`).

## Interpretation

- Contract: `contract_interpret_obj_1790243907700_spk25d_a1`, revision 1
- Requirements: `req_evidence_scoped` → `req_channel_plan` → `req_launch_week_ready`
- `authorizedPurposePolicy` on objective: `external_social_intelligence` bound to **deliverable only**
  (`req_launch_week_ready` carries `authorizedPurposeKinds`)

Persisted `requiredResourceClasses` (internal classes from interpretation, not `proprietary_data`):

| Requirement | `requiredResourceClasses` |
| --- | --- |
| `req_evidence_scoped` | `company_records`, `public_web`, `llm_reasoning` |
| `req_channel_plan` | `llm_reasoning`, `ordinary_compute` |
| `req_launch_week_ready` | `llm_reasoning`, `company_records`, `public_web`, `ordinary_compute` |

## Sourcing / BUY UI (investigation)

Four managerial sourcing decisions; each surfaced three OKX marketplace candidates (Social Media Guru,
Token Market Intelligence, Wallet / Onchain Risk). **All BUY options ineligible** every time; **MAKE**
selected with `selectionSource: sole_eligible` — **Jev not invoked**.

Representative ineligibility detail (Social Media Guru):

```text
required proof method not currently available; offering somebody_testnet_social:social_media_guru does not supply the exact required resource class; offering somebody_testnet_social:social_media_guru product scope cannot fulfill the current purpose
```

**Root cause (code + data):**

1. `buildDecisionPassInput` sets market `externalClass` to the first `requirement.requiredResourceClasses`
   entry when no validated external gap exists (`missing.length === 0`). That is typically an **owned**
   class (e.g. `company_records`), not `proprietary_data`. Testnet offerings only supply
   `proprietary_data` → `compatibleResourceClass: false` on every BUY option.
2. Input requirements lack `authorizedPurposeKinds` → Social Media Guru purpose gate fails closed
   (`purposeKind` null).
3. On `req_launch_week_ready`, purpose kind is present but grounding still uses `company_records` as
   the need class → purpose/resource checks fail for Guru.
4. `proof_unavailable` follows from `proofIsAvailable()` when the external path is not fully viable.

This is **expected eligibility messaging**, not a payment or OKX API failure.

## Integration events

Four `okx_marketplace` / `market_search` facts (three candidate labels each). No acquisitions, no X Layer
submitted/settlement events.

## Execution outcome

- All three requirements: **satisfied**, strategy **MAKE**
- Final run: `run_db6daf61c87c9be8780411e0` (5 tool calls), worker DELIVERED at spine
- **Final semantic assessment:** `meetsMinimumBar: false` on `launch_week_ready` bar (plan detailed but
  not evidence-grounded per locked bar)
- Control: final-assessment recovery budget exhausted (2/2) → **blocked**, then **escalated**
  (`maxNoProgressCycles`)

## Artifacts in this directory

| File | Contents |
| --- | --- |
| `objective-full-record.json` | `objectives:getObjective` |
| `product-workspace-v1-projection.json` | `productWorkspace:getObjectiveWorkspaceV1` |
| `m5-workspace-v2-projection.json` | `m5Workspace:getObjectiveWorkspaceV2` (includes decision option reasons) |

## Explicit non-actions

- Run #2 (Nex) was **not** started.
- Objective state was **not** mutated for this capture.
