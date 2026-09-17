# Pre-build Research Ingest

Status: research evidence, **not** canonical product decisions
Date ingested: 17 September 2026

## Provenance

Source planning branch:

- repository: `dropandresetmain-prog/wip-personal`
- branch: `planning/somebody-okx`
- commit: `1ca59ce4aad64b04fc1ed8caadd2301eb33033ab`

Files ingested:

- `SCOPE.md`
- `DEMO_RESEARCH.md`
- `REUSE_AUDIT.md`
- `BUILD_PLAN.md`
- `OPEN_QUESTIONS.md`

These documents were produced during pre-build research. They contain useful evidence but also prematurely promoted one demo and some implementation choices. Canonical decisions now live in the root SSOT docs of this repository.

## What survived into canonical scope

From `SCOPE.md`:

- One Person Company vision;
- Somebody as the manager/outcome owner;
- Make-vs-Buy as the hackathon center;
- “missing agent != missing capability”;
- application-owned policy;
- one reliable end-to-end workflow;
- Web3 limited to the external machine-commerce boundary;
- broad autonomous-company features explicitly out of scope.

From `REUSE_AUDIT.md`:

- Somebody is the primary engineering foundation;
- reliability core / approval / effect / verification patterns are high-value reuse;
- existing procurement domain is too specific to be generalized blindly;
- Army contributes primarily controlled-capability validation and deny-by-default permissions;
- Army runtime/schema/UI should not be wholesale merged.

From `BUILD_PLAN.md`:

- prove hard external/payment assumptions before UI polish;
- use small milestones with explicit cut lines;
- preserve payment idempotency and ambiguous-state safety;
- record a working demo early once the final flow exists;
- keep total OKX work bounded because Northstar/Shipaton compete for time.

From `OPEN_QUESTIONS.md`:

Carry forward only implementation-relevant uncertainties that source inspection cannot resolve, especially:

- Convex deployment/write-gate assumptions from Somebody;
- previous model/runner settings;
- slow-provider interaction with leases/effects;
- exact OKX payment/CLI contract;
- provider network/sandbox support.

## What was downgraded / rejected

### Invoice / Dial demo

The planning docs called the supplier-invoice scenario canonical.

Correction: it is a **candidate only**.

The interesting hypothesis is that a third-party provider could supply independently controlled real-world contact plus signed/attested evidence that Somebody cannot generate internally. This remains worth evaluating, but provider reliability and true scarcity must be proven.

### Demo-specific architecture

The planning docs proposed specific tables, `lib/okx/*` files, a local CLI bridge and a `/check` page around the Dial scenario.

Correction: none of those paths are canonical until the demo/provider is accepted. Preserve the safety principles, not the premature file layout.

### Separate implementation-repo seeding strategy

The planning docs assumed an empty `somebody-okx` repo would be seeded from Somebody before the build period.

Correction: the final repository is now explicitly `somebody-okx`, and the build period is active. This repo begins with the canonical SSOT and will receive an explicit source transfer from the audited baselines.

## Marketplace evidence from pre-build scan

The pre-build marketplace scan classified services as generic cognition, reproducible APIs or genuinely scarce resources.

Notable research leads included:

- **Dial** — outbound human phone interaction with a signed proof envelope; promising scarcity but low observed sales/reliability uncertainty.
- **OKLink / Onchain Data Explorer** — structured/proprietary onchain profiles/risk data; high reliability but more crypto-specific.
- **GroundTruth** — human physical/oracle work; very scarce but potentially too slow/unreliable for a live hackathon demo.
- **Acurast Confidential TEE** — attested compute; genuinely scarce infrastructure but no strong ordinary-SME demo was identified.
- several research/due-diligence/SEO agents — rejected or downgraded because public web + owned LLM/tooling could reproduce most of the value.

Marketplace state is fast-changing. Revalidate any selected provider before implementation.

## Candidate demo evidence retained

### Candidate A — supplier invoice / changed bank details

Potential MAKE:

- extract invoice/payment fields;
- match company records/PO/vendor data;
- detect changed details;
- draft decision memo / communication.

Potential BUY:

- independent out-of-band human verification / attestation.

Strength:

- clear business stakes;
- clear internal-vs-external boundary if the provider is genuinely independent.

Risk:

- provider reliability;
- whether the provider is meaningfully more than telephony we could cheaply integrate ourselves;
- provider environment may be mainnet-only.

### Candidate B — payee/onchain risk screening

Potential BUY:

- proprietary address labels/risk intelligence from OKX ecosystem providers.

Strength:

- reliable sponsor-native provider/data;
- clear scarcity.

Risk:

- crypto-specific customer objective may narrow the broader Somebody story.

### Candidate C/D/E from pre-build work

SEO visibility, physical-oracle inspection and licensed financial-data paths were explored. None is accepted; each had either weak scarcity, reliability/timing problems or weak customer fit.

## Official sandbox / testnet findings added on 17 September

Official OKX documentation confirms:

- X Layer Testnet exists at chain ID `1952` / `eip155:1952`;
- faucet test OKB and test USD₮0 are available;
- Onchain OS buyer documentation runs the full buyer-payment flow against an official Mock Merchant on X Layer Testnet with no real funds;
- seller/payment SDK documentation supports switching x402 services from mainnet `eip155:196` to testnet `eip155:1952`.

Official references:

- https://web3.okx.com/onchainos/dev-docs/xlayer/developer/build-on-xlayer/network-information
- https://web3.okx.com/onchainos/dev-docs/payments/payment-use-buyer
- https://web3.okx.com/onchainos/dev-docs/payments/service-seller-sdk
- https://www.okx.com/en-us/learn/okx-dev-day-builder-kit

Important distinction:

> X Layer / payment rails have a testnet. Marketplace providers are independent services and may not expose a corresponding testnet endpoint.

Provider network support must therefore be validated per candidate.

## Research use going forward

Use this document as provenance/evidence only.

When evidence conflicts with current code, current official OKX docs or a later explicit decision, the newer authoritative source wins.
