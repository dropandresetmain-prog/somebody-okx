# Development

## Requirements

- Node.js 22.6+
- npm
- Convex CLI access
- the environment variables listed in `.env.example`

## Install

```bash
npm install
```

## Convex

The project supports both a local Convex deployment and a cloud development deployment.

Local development uses `.env.local`.

Cloud development uses `.env.cloud.local`.

Create or select a local deployment:

```bash
npx convex deployment create local --select
npx convex dev --once
```

## Run the application

Terminal 1:

```bash
npm run convex:dev:local
```

Terminal 2:

```bash
npm run dev:local
```

The product UI is then available from the Next.js development server.

## Run the OKX Testnet flow

The complete founder flow uses four processes.

Terminal 1 — Convex:

```bash
npm run convex:dev:local
```

Terminal 2 — web app:

```bash
npm run dev:local
```

Terminal 3 — x402 merchant:

```bash
npm run okx:merchant
```

Terminal 4 — payment driver:

```bash
npm run okx:payment-driver
```

Prepare the runtime configuration with:

```bash
npm run okx:prepare:local
```

The default GPT-family model for the demo flow is `openai/gpt-6-luna`.

## What happens after founder approval

```text
Needs You approval
→ authorized purchase
→ x402 challenge
→ purchase preparation
→ signing and submission
→ X Layer settlement
→ provider result
→ result verification
→ Somebody resumes the objective
```

The recorded demo runs this payment flow on **OKX Testnet**.

## Useful commands

```bash
npm run typecheck:convex
npm test
npm run build
npm run gate:local -- <label> <count>
npm run gate:peek:local -- <objective-key>
```

Cloud development equivalents use the `:cloud` suffix where available.

## Environment files

- `.env.local` — local Convex and local development.
- `.env.cloud.local` — cloud development.
- `.env.example` — variable names and configuration template.

## Main components

- `app/` — product UI.
- `convex/` — durable backend state and orchestration actions.
- `lib/management/` — objective, requirement and strategy logic.
- `lib/worker/` — internal worker runtime.
- `lib/market/` — provider discovery and market data.
- `lib/payment/` — x402, transaction, settlement and verification flow.
- `lib/product/` — product projections and PDF generation.
- `tests/` — focused behavior and integration coverage.
