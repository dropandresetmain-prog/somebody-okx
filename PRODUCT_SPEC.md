# Somebody × OKX — Product Spec

Status: **canonical product scope — launch scenario approved**  
Date: **18 September 2026**

## 1. Vision

> **One person should be able to operate with the functional reach of a much larger company.**

Somebody is the AI manager for that company. The founder gives Somebody an outcome; Somebody figures out what capabilities/resources are needed, assembles internal capacity, buys scarce external resources when necessary, and remains accountable for the verified result.

Primary wedge: one-person companies, founder-led businesses and lean SMEs where important cross-functional work repeatedly falls back onto the founder/GM/operations lead.

## 2. Product thesis

The user should not have to manually choose agents, SaaS tools, vendors or APIs.

Somebody should increasingly move the user from:

> “I need to find the person/tool/vendor who can do this.”

To:

> “Somebody, get this outcome done.”

The hackathon proves the missing organizational/economic primitive:

> **Somebody builds the company it needs, then buys what that company cannot make.**

## 3. MAKE

MAKE when required resources are already controlled by the company.

Examples:

- generic model reasoning;
- public web/search;
- company documents/data;
- authenticated company systems;
- ordinary compute;
- reusable internal tools.

A missing pre-existing worker is not a capability gap. Somebody may create/reuse a bounded internal worker.

MAKE must be active execution, not a worker specification or one free-form completion:

`WorkerSpec → WorkContract → model selection → bounded Agent/Runner → allowed tools → execution → evidence/artifact/effect`

## 4. BUY

BUY when work depends on a genuinely externally controlled scarce resource.

Strong reasons include:

- proprietary/licensed data;
- privileged platform-derived information;
- external execution/distribution interfaces;
- independent attestation/authority;
- physical capacity/presence;
- specialist infrastructure/compute;
- resources materially impractical to reproduce within the bounded mission.

Default rule:

> **Never buy generic cognition merely because somebody wrapped another LLM. Buy scarce capability.**

The model may propose resource needs. Application code owns factual inventory, provider approval, sourcing, spend policy and completion.

## 5. Repeated resource sourcing

The objective itself is not globally MAKE or BUY.

One mission may contain repeated sourcing decisions as work progresses:

```text
MAKE
→ discover a new resource need
→ market discovery
→ MAKE / BUY / BLOCKED
→ execute
→ new need may emerge
→ repeat
→ verify
→ complete
```

For the hackathon, the canonical mission has one meaningful MAKE path and at most two justified real BUYs.

The existing deterministic `lib/sourcing` policy remains the application authority for each bounded resource need.

## 6. Canonical founder scenario

Approved founder objective:

> **“Our launch isn’t working. Fix it and relaunch today.”**

The exact wording and small believable spend limit may be refined for the demo.

This supersedes the earlier invoice/Dial, CertiK diligence and broader scenario candidates.

The demo should complete the operational relaunch itself. Do not promise downstream results such as “100 customers acquired” unless they actually occur.

## 7. Canonical mission

### Internal MAKE

Somebody creates/reuses a bounded growth/launch worker from company-controlled resources.

The worker must do real work on controlled company state. At minimum it should create/change a launch artifact such as landing-page headline/positioning/campaign copy.

### Marketplace discovery + rejected option

When a new external resource need emerges, Somebody checks the current market.

A generic growth/research/planning service should be visibly rejected when it substantially reproduces resources already controlled internally. **FlyBeacon** is the current illustrative live candidate.

The purpose is strategic: Somebody is not an OKX shopping bot. It exercises resource/economic judgment.

### BUY #1 — Newsliquid

Target resource: **proprietary/privileged external social intelligence**.

The company does not own the underlying platform-derived dataset/access. Purchased evidence must materially affect subsequent internal work: positioning, headline, message, target segment or equivalent launch artifact.

BUY #1 does not solve the founder objective by itself.

### MAKE reacts

The internal growth worker resumes with verified external evidence and changes the controlled launch artifact accordingly.

The demo should make this causal relationship visible:

`BUY evidence → MAKE reacts`

### BUY #2 — xbird

Target resource: **external social execution infrastructure / privileged execution interface**.

The company/founder retains control of the underlying X account and the intent to publish. xbird supplies the paid automation interface used for the bounded relaunch action.

The external publish should be real when feasibility/environment permit and must be verified by read-back/reconciliation.

## 8. Marketplace discovery

The marketplace is a capability/resource market, not merely an agent directory.

Marketplace discovery is part of the canonical flow, but a generalized marketplace platform is not hackathon scope.

Preferred implementation:

- use a supported official OKX discovery/search primitive if one exists and is suitable;
- otherwise use a small application-owned synchronized snapshot of the few relevant current OKX.AI listings behind a replaceable discovery interface;
- never scrape undocumented/private APIs.

Provider invocation/payment remains real regardless of discovery implementation.

## 9. Role of OKX AI / X Layer

Somebody is not Web3-first.

Somebody is the buyer-side executive/management layer. OKX AI is the emerging external machine-service/resource market. X Layer / Onchain OS provide machine-native payment infrastructure at the cross-company boundary.

As OKX AI's supply side expands, the number of resources a one-person company can procure at runtime expands without changing Somebody's core architecture.

This does not remove authorization requirements for private accounts/resources.

## 10. Product language

Product/demo labels may use:

- **That Guy** — bounded internal worker Somebody creates/reuses;
- **Somebody Else** — external provider supplying a genuinely missing resource.

Engineering terms remain neutral: `Objective`, `WorkItem`, `WorkerSpec`, `WorkContract`, `ResourceNeed`, `ExternalProvider`, `Evidence`, `Effect`, `Outcome`.

## 11. Product surface

The product surface should make the management/economic reasoning obvious without implementation clutter.

For the canonical demo it should progressively show:

1. founder objective;
2. internal growth capability/worker;
3. controlled launch artifact and changes;
4. resource need emerging;
5. current marketplace candidates;
6. why a redundant generic growth provider is rejected;
7. Newsliquid BUY #1, price/payment/result;
8. internal MAKE reaction to bought evidence;
9. xbird BUY #2, price/action/verification;
10. unified verified founder outcome.

Avoid giant graphs, permanent org charts, raw agent chat transcripts, token counters and Web3-first wallet UX.

## 12. Final hackathon acceptance shape

One coherent mission must demonstrate:

```text
founder objective
→ real MAKE worker
→ controlled artifact change
→ bounded market discovery
→ rejected unnecessary BUY
→ BUY #1 proprietary intelligence
→ verified evidence
→ MAKE reacts / artifact changes
→ BUY #2 execution infrastructure
→ real external action
→ verification
→ founder outcome
```

Maximum two real provider purchases.

Spend must be bounded. Payment/result state must distinguish submission from settlement/verification. Ambiguous states must reconcile before retry.

## 13. Current implementation state

M1 is accepted on `main@1e2c1a484713792cead51b85e1e1ae36d28b3e77` with live active MAKE, fresh Convex, application-owned completion and Objective Workspace.

Prepared M2 implementation exists on `feat/m2-make-buy-policy@4a827e891af3dd7e61cf529482a7656ee23bcb34` with one canonical deterministic sourcing authority, factual inventory and persisted MAKE/BUY/BLOCKED truth.

M2 must now adapt that verified policy from a single objective-level verdict to repeated resource-level decisions. Preserve the pure kernel; do not rewrite it wholesale.

Prepared M3 payment-readiness/lifecycle work exists on `prep/m3-okx-readiness`; consume it rather than restarting payment research.

## 14. Hard non-goals

Out of scope:

- universal marketplace indexing;
- broad vendor auctions/competition;
- generalized provider reputation/ranking;
- automated negotiation;
- generic A2A escrow unless strictly forced by a provider;
- generalized internal-vs-external cost optimization;
- three or more real providers;
- generic workflow DSL;
- arbitrary organization hierarchies/personality/ranks;
- worker social chatter;
- multiple polished demo workflows;
- broad autonomous company-OS architecture;
- blockchain as a replacement for ordinary application state.

## 15. Build principle

> **One founder objective → company assembles internally → scarce resource gaps emerge → Somebody buys only those gaps → internal work continues → external effect is verified → one finished outcome.**
