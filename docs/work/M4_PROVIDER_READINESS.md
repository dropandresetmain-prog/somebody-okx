# M4 Provider Readiness

Status: **BLOCKED — no canonical provider candidate is yet authoritative.**
Date: **17 September 2026**
Branch baseline: `eb4781019a4b975d7615656ce8e432f256342e79`

## Verdict

No provider is authoritatively selected for the canonical demo. The demo-selection gate is scheduled for **18 September 2026, 12:00 SGT**. M4 (target 20–21 Sep) cannot begin provider integration until the gate closes with an accepted selection.

This is the expected state per the repo's own plan. The gate exists precisely to make this decision explicit.

## Evidence table — every provider/lead named in the repo

| Name | Source file:line | Status | Notes |
|---|---|---|---|
| Dial | `docs/research/PREBUILD_RESEARCH_INGEST.md:91` | research lead | "outbound human phone interaction with a signed proof envelope; promising scarcity but low observed sales/reliability uncertainty" |
| OKLink / Onchain Data Explorer | `docs/research/PREBUILD_RESEARCH_INGEST.md:92` | research lead | "structured/proprietary onchain profiles/risk data; high reliability but more crypto-specific" |
| GroundTruth | `docs/research/PREBUILD_RESEARCH_INGEST.md:93` | research lead | "human physical/oracle work; very scarce but potentially too slow/unreliable for a live hackathon demo" |
| Acurast Confidential TEE | `docs/research/PREBUILD_RESEARCH_INGEST.md:94` | research lead | "attested compute; genuinely scarce infrastructure but no strong ordinary-SME demo was identified" |
| Candidate A scenario (supplier invoice / changed bank details) | `docs/research/PREBUILD_RESEARCH_INGEST.md:101–123` | candidate (scenario, not provider) | Uses Dial-class provider for BUY side; explicitly "candidate only" at line 69 |
| Candidate B scenario (payee/onchain risk screening) | `docs/research/PREBUILD_RESEARCH_INGEST.md:125–137` | candidate (scenario, not provider) | Uses OKLink-class provider for BUY side |
| Invoice/Dial demo (as canonical) | `DECISIONS_LOG.md:180` | downgraded | "researched candidate only" — explicit correction |
| Invoice/Dial demo (as canonical) | `DECISIONS_LOG.md:253` | rejected (superseded) | "Treating the Opus invoice/Dial demo as already canonical — corrected; candidate only" |
| Final business scenario | `README.md:219` | candidate only | "remains open until this gate" |
| Architecture hard-coding of invoice/Dial | `ARCHITECTURE.md:468–472` §18 | prohibited | "must not hard-code the current invoice/Dial research candidate" |
| Demo selection state | `docs/work/ACTIVE_TASK.md:189` | PARALLEL / OPEN | "canonical demo selection — PARALLEL / OPEN" |
| Provider selection state | `BUILD_DELTA.md:336` | not built | "OKX AI provider integration — Not built — Provider not yet selected" |
| External-provider adapter | `BUILD_DELTA.md:340` | not built | "Selected real external-provider adapter — Not built" |
| Candidate scenario in product spec | `PRODUCT_SPEC.md:224–226` | candidate only | "supplier invoice / changed payment-details verification using an external independent voice/attestation provider" — "This is a **candidate only**, not a product decision" |
| Research/due-diligence/SEO agents | `docs/research/PREBUILD_RESEARCH_INGEST.md:95` | rejected / downgraded | "public web + owned LLM/tooling could reproduce most of the value" |

No row in this table carries status `selected` or `accepted`.

## What M4 concretely needs from the demo gate

The demo gate (18 Sep 12:00 SGT) must produce:

1. **A named scarce resource class** — one of the externally-controlled classes from `lib/workforce/types.ts:3–14` `ResourceClass`:
   - `proprietary_data` — licensed/proprietary data the company cannot reproduce internally;
   - `privileged_access` — access controlled by a third party;
   - `attestation` — independent signed proof the company cannot self-issue;
   - `human_voice_contact` — real human phone interaction;
   - `physical_presence` — real-world physical action/inspection;
   - `specialist_compute` — externally controlled specialist infrastructure.

2. **A named provider** — the specific external service that supplies that resource class.

3. **Acceptance criteria the provider must satisfy** (derived from `MASTER_PLAN.md:416–425` M4 validation list):
   - endpoint/tool is reachable and functional;
   - price is known and bounded;
   - network/environment is identified (testnet/sandbox/mainnet);
   - latency is compatible with a 2–4 minute demo;
   - rate limits are sufficient;
   - result contract (response schema) is documented;
   - proof/verification mechanism exists (Somebody can independently confirm the result);
   - failure modes are understood;
   - x402/payment compatibility or alternative payment path is identified;
   - the scarce-resource justification survives the Make-vs-Buy rule (`DECISIONS_LOG.md` 17 Sep "Make vs Buy rule"): the resource is genuinely externally controlled, not generic cognition wrapped by another agent.

## Open risks per research lead (from pre-build scan)

### Dial (outbound human phone interaction)

| Risk | Source |
|---|---|
| Provider reliability — "low observed sales/reliability uncertainty" | `PREBUILD_RESEARCH_INGEST.md:91` |
| Whether the value is "meaningfully more than telephony we could cheaply integrate ourselves" | `PREBUILD_RESEARCH_INGEST.md:122` |
| Provider environment may be mainnet-only — no testnet/sandbox confirmed | `PREBUILD_RESEARCH_INGEST.md:123` |

### OKLink / Onchain Data Explorer

| Risk | Source |
|---|---|
| "more crypto-specific" — may narrow the broader Somebody story | `PREBUILD_RESEARCH_INGEST.md:92`, `PREBUILD_RESEARCH_INGEST.md:137` |
| x402/payment compatibility unknown | not validated |

### GroundTruth (human physical/oracle work)

| Risk | Source |
|---|---|
| "potentially too slow/unreliable for a live hackathon demo" | `PREBUILD_RESEARCH_INGEST.md:93` |
| Latency incompatible with 2–4 minute demo window | inferred from above |

### Acurast Confidential TEE

| Risk | Source |
|---|---|
| "no strong ordinary-SME demo was identified" | `PREBUILD_RESEARCH_INGEST.md:94` |
| Customer-fit risk for One Person Company narrative | inferred from above |

### Cross-cutting

| Risk | Source |
|---|---|
| X Layer / payment rails have a testnet; marketplace providers are independent and may not | `PREBUILD_RESEARCH_INGEST.md:162–164` |
| "Marketplace state is fast-changing. Revalidate any selected provider before implementation." | `PREBUILD_RESEARCH_INGEST.md:97` |
| Demo gate is tomorrow — 18 Sep 12:00 SGT. After the gate, broad ideation stops. | `DECISIONS_LOG.md:178–182`, `README.md:219`, `ARCHITECTURE.md:474` |

## What this lane did NOT do

- Did not select or recommend a provider.
- Did not perform provider-specific external validation (no provider is authoritative yet).
- Did not write a provider adapter or touch runtime code.
- Did not trigger a purchase, paid call, or real-money transaction.
- Did not create accounts or API keys.
- Did not edit any file outside `docs/work/`.

## Authoritative sources the M4 lane should consult

1. `DECISIONS_LOG.md` — canonical decision record; the demo gate outcome will be recorded here.
2. `ARCHITECTURE.md` §18 (line 468) — canonical-demo independence constraint.
3. `MASTER_PLAN.md` M4 section (line 412) — provider validation checklist.
4. `lib/workforce/types.ts:3–14` — `ResourceClass` union defining the scarce resource categories.
5. `docs/research/PREBUILD_RESEARCH_INGEST.md` — pre-build marketplace scan with research leads and risk flags.
6. `PRODUCT_SPEC.md:224–226` — current candidate scenario statement.
