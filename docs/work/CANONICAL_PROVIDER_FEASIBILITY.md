# Canonical Provider Feasibility — Failing-Launch Demo

Status: **canonical provider direction locked; execution smoke still required where noted**  
Updated: **18 September 2026**

Canonical mission:

> “Our launch isn’t working. Fix it and relaunch today.”

This file records current-market/provider facts used for implementation. Provider metadata is time-sensitive and must be rechecked immediately before live integration.

## Discovery approach

Official OKX.AI documentation describes marketplace task matching, including direct assignment, automatic matching and public listing. During this pass no documented public programmatic API for searching arbitrary A2MCP service listings was found.

Hackathon decision:

- define a narrow replaceable market-discovery seam;
- use a small application-owned synchronized snapshot of only the relevant current offerings unless a supported discovery primitive is verified during implementation;
- do not scrape undocumented/private APIs;
- real invocation/payment remains through the provider's supported endpoint.

Relevant official docs:

- https://web3.okx.com/onchainos/dev-docs/okxai/user-introduction
- https://web3.okx.com/onchainos/dev-docs/okxai/asp-introduction
- https://web3.okx.com/onchainos/dev-docs/okxai/howtomcp

## Visible rejected offering — FlyBeacon Project Growth Analysis

OKX.AI listing:

- provider: FlyBeacon
- agent ID: `4442`
- listing: https://www.okx.ai/agents/4442
- service: `Project Growth Analysis`
- observed endpoint: `https://flybeacon-indol.vercel.app/api/tools/analyze-product`
- observed price: `1 USDT/use`

Why reject it in the canonical flow:

The generic project/growth analysis, positioning, competitor-tone and channel-planning work substantially overlaps resources Somebody already controls through its internal growth worker: model reasoning, public web, company context, ordinary compute and controlled tools.

Decision:

`REJECT / MAKE INTERNALLY`

This is a service-level judgment, not a blanket provider rejection.

## BUY #1 primary — Newsliquid

Target resource:

**proprietary / privileged external social intelligence**

OKX.AI listing:

- provider: Newsliquid
- agent ID: `2135`
- listing: https://www.okx.ai/agents/2135
- observed score: `5.0`
- observed total sold: `500+`
- observed reviews include successful x402 replay / on-chain completion reports.

Most relevant current service:

- service: `OpenNews Twitter Search`
- endpoint: `https://x402.6551.io/okx/twitter_search`
- observed price: `0.002 USDT/use`
- supports keyword/topic/user/engagement/date/language filters.

Other useful current services include user info, user tweets, follower events, deleted tweets and KOL follower analysis, also observed at `0.002 USDT/use`.

Why BUY:

The company can reason over public web content but does not control Newsliquid's underlying platform-derived social dataset/access. This is a real external information resource rather than generic cognition.

Required use in demo:

Paid result must be persisted with provider/provenance and must materially affect the internal growth worker's subsequent positioning/message/artifact.

### BUY #1 fallback

FlyBeacon has live-X-specific offerings such as:

- `X Narrative Pulse` — observed `0.5 USDT/use`;
- `X Presence Audit` — observed `2 USDT/use`.

These may serve as a same-resource fallback if Newsliquid is unavailable because the bought resource would be live external X evidence rather than FlyBeacon's generic growth reasoning.

Do not use the fallback unless needed; Newsliquid remains canonical primary.

## BUY #2 primary — xbird

Target resource:

**external social execution infrastructure / privileged execution interface**

OKX.AI listing:

- provider: xbird
- agent ID: `3460`
- listing: https://www.okx.ai/agents/3460
- description: Twitter/X automation API, 248 MCP tools, x402 on Base and X Layer;
- BYOA: user supplies/owns X `authToken` + `ct0` credentials;
- xbird does not resell official X API access.

Observed OKX.AI services include:

- `Twitter X API` — endpoint `https://xbirdapi.up.railway.app/api/authorize/post_read/1`, observed `0.0025 USDT/use`;
- read/bookmark/list/user/media service families at per-use prices from `0.001` upward.

xbird's own current documentation describes posting/reply actions at about `0.0075` per unit and supports USDT on X Layer as an opt-in payment route.

Why BUY:

The founder/company owns the X account and publication intent, but Somebody's current company resource inventory does not include a maintained machine execution interface for X. xbird supplies that bounded external execution infrastructure.

### Credential boundary

X session credentials are sensitive.

They must never be persisted in ordinary Convex state, events, evidence or logs.

Prefer a path where credentials stay local / in a secure environment boundary. xbird documents a local MCP mode where Twitter calls execute locally and the xbird server verifies x402 payment.

### Required pre-M4 feasibility smoke

Before locking the actual adapter:

- identify the exact write/post tool/endpoint used by the OKX/x402 path;
- prove account/session setup with non-production/demo credentials;
- prove the intended payment network/asset flow;
- publish one harmless test post;
- capture returned tweet/post identity;
- independently read it back;
- verify retry/idempotency behavior sufficiently to avoid duplicate publish;
- confirm session credentials do not reach Convex/logs.

### BUY #2 fallback

**Integration fallback:** xbird local MCP mode, preserving local X calls and x402 payment, if the remote REST/A2MCP write path is unreliable.

**Provider-level fallback:** not yet validated. No second equally suitable current OKX.AI publishing provider was verified in this pass. If xbird itself fails the feasibility gate, run a narrow same-resource search and substitute the nearest reliable social execution provider without reopening the canonical business scenario.

This is an `Investigate Now` item for M4 readiness, not an M2 blocker.

## Current lock

Canonical market set for M2 discovery snapshot:

- FlyBeacon `Project Growth Analysis` → visible `REJECT / MAKE`;
- Newsliquid `OpenNews Twitter Search` → BUY #1 primary;
- FlyBeacon live-X service → BUY #1 fallback metadata only;
- xbird → BUY #2 primary;
- xbird local MCP → BUY #2 integration fallback.

Do not add more providers unless a primary path fails feasibility.
