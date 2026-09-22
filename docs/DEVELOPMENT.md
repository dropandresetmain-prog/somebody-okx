# Local development

Somebody is **local-Convex-first**. Routine development, focused tests,
management-runtime debugging, model-portability development runs, and demo
iteration all run against a **local Convex deployment** by default, so they do
not consume metered cloud Convex Database I/O. Cloud Convex remains the
environment for selected integration checks, public/cloud-specific behavior,
and promotion/release gates.

```text
Somebody application
        │
        ├── routine development  ──▶  LOCAL CONVEX   (.env.local)
        │
        └── integration / release ──▶ CLOUD CONVEX   (.env.cloud.local)
```

No Docker, no self-hosted Convex backend, no second persistence
implementation. The local deployment uses Convex's own built-in local
deployment support (`npx convex deployment create local`) — the same schema,
functions, indexes, mutations, queries and scheduler as cloud, run locally by
the Convex CLI/backend binary.

## Environment separation (read this first)

Two gitignored env files, never confused for each other:

| File | Target | Used by |
| --- | --- | --- |
| `.env.local` | **LOCAL** Convex deployment (`http://127.0.0.1:3210`) | `npm run dev` / `dev:local`, `npm run convex:dev`, `npm run gate:local`, gate scripts with no `--env-file` flag |
| `.env.cloud.local` | **CLOUD** dev deployment (`clean-tapir-151.convex.cloud`) | `npm run dev:cloud`, `npm run convex:dev:cloud`, `npm run gate:cloud`, gate scripts with `--env-file=.env.cloud.local` |

`.env.local` is what Next.js auto-loads and what every `scripts/gate/*.mjs`
script reads by default — so the **default is always local**. Targeting cloud
requires an explicit flag or an explicit `npm run *:cloud` command. Both files
are gitignored (`.env.*` in `.gitignore`); only `.env.example` (variable
*names*, no values) is tracked.

Never rename `.env.cloud.local` to `.env.local` or copy cloud secrets into
`.env.local`. The local deployment's own env store (`npx convex env set …`,
scoped to the local deployment only) holds a **separate, local-only**
`SOMEBODY_DEMO_OPERATOR_TOKEN` — distinct from the cloud token in
`.env.cloud.local` — so a local script can never accidentally authorize
against cloud by reusing a cloud secret.

No model-provider or OKX/payment secrets are configured on the local
deployment by default (`npx convex deployment create local` does not copy
cloud env vars). `LIVE_AI_ENABLED` is unset locally, so the model boundary
**fails closed** — no accidental spend — until you deliberately configure it
(see "Local model-portability runs" below).

## Prerequisites

- Node.js ≥ 22.6 (`engines.node` in `package.json`; needed for `--env-file`
  support used by `scripts/dev-with-env.mjs`).
- `npx convex` already logged in to the `dropandreset-main` team (existing
  cloud dev deployment `clean-tapir-151` must already work) — local
  deployments are registered under the same Convex account/project.

## First-time local setup

Already done once for this repo; kept here for a fresh clone or a wiped local
deployment.

```bash
# 1. Preserve the existing cloud dev config before touching .env.local.
cp .env.local .env.cloud.local

# 2. Create and select a local deployment. This downloads the local backend
#    binary once and rewrites .env.local's CONVEX_DEPLOYMENT /
#    NEXT_PUBLIC_CONVEX_URL / NEXT_PUBLIC_CONVEX_SITE_URL to point locally.
npx convex deployment create local --select

# 3. Push schema/functions once.
npx convex dev --once

# 4. Give the local deployment its own demo-operator token (do NOT reuse the
#    cloud value from .env.cloud.local).
npx convex env set SOMEBODY_DEMO_OPERATOR_TOKEN "local-demo-op-<anything>"

# 5. Put that same value in .env.local's SOMEBODY_DEMO_OPERATOR_TOKEN= line
#    so the gate scripts (which read it from the env file) match what the
#    local deployment expects.
```

## Normal local startup

Two long-running processes, run separately (no combined orchestration — this
is deliberate; see MASTER_PLAN.md discussion of local dev complexity):

```bash
# Terminal 1 — local Convex backend + function watcher
npm run convex:dev:local

# Terminal 2 — Next.js frontend (reads .env.local automatically)
npm run dev:local
```

`npm run dev` and `npm run convex:dev` are unqualified aliases for the same
thing — both now resolve to LOCAL by construction (`convex:dev` passes
`--env-file .env.local` explicitly; `dev` relies on Next's `.env.local`
autoload). There is no ambiguous "whichever deployment happens to be
selected" state: the npm scripts hard-code the target file.

## Local reset

The local deployment's data is independent per deployment instance. To wipe
it and start clean, recreate the local deployment (this allocates a fresh
local backend/database; the old one's data is discarded):

```bash
# stop any running `npm run convex:dev:local` first
npx convex deployment create local --select
npx convex dev --once
npx convex env set SOMEBODY_DEMO_OPERATOR_TOKEN "local-demo-op-<anything>"
# update .env.local's SOMEBODY_DEMO_OPERATOR_TOKEN= to match
```

## Running a local gate smoke

The model-portability gate (`scripts/gate/run-objective.mjs`) targets
whatever `.env.local`/`.env.cloud.local` point at:

```bash
# LOCAL (default) — no cloud Database I/O consumed
npm run gate:local -- my-label 5

# read progress on an objective created locally
npm run gate:peek:local -- <objectiveKey>
```

This creates one canonical Objective via the real
`objectives.setupCanonicalDemoObjective` entrypoint (the same production
mutation cloud runs use — no second fake-seed path), drives it through
`getObjectiveStatus` polling, and writes evidence to
`docs/work/gate-evidence/`.

### Local model-portability runs

The gate is infrastructure-agnostic about the model boundary: it just drives
the real management engine and polls state. To exercise a **real** model
locally (optional — not needed to prove the local-dev wiring itself):

```bash
npx convex env set LIVE_AI_ENABLED true
npx convex env set AI_PROVIDER openrouter
npx convex env set AI_MODEL <openrouter-slug>
npx convex env set OPENROUTER_API_KEY <key>   # local deployment's own copy
```

Real model API calls made this way go to the real provider (genuine cost),
but all resulting database/runtime state stays local. Do not set these unless
you intend to spend on that call.

`scripts/gate/preflight.ts` is unaffected by any of this — it never talks to
a deployed Convex instance (local or cloud). It uses `convex-test`, an
in-process ephemeral backend, purely to exercise the five model boundaries
against a real OpenRouter endpoint.

## Intentionally targeting cloud

Use cloud only when the question actually requires cloud behavior: deployed
function behavior, environment/secrets wiring, public callback/webhook
reachability, cloud deployment/index behavior, selected integration checks,
or an exact-candidate release smoke.

```bash
npm run dev:cloud                       # frontend against cloud dev
npm run convex:dev:cloud                # push functions to cloud dev
npm run gate:cloud -- my-label 5        # gate objective on cloud (real Database I/O)
npm run gate:peek:cloud -- <objectiveKey>
```

Every one of these requires the explicit `:cloud` command or `--env-file=`
flag — there is no bare command that silently mutates cloud state.

## What remains cloud-only

- Anything requiring a public HTTP ingress (webhooks, callbacks) — local
  deployments have no public URL.
- The exact-candidate promotion/release gate (`G1`) and any demo-critical
  final E2E — these must run on the real cloud deployment that will actually
  ship.
- M3/OKX live payment flows stay TESTNET-only regardless of local vs cloud;
  local Convex does not change that boundary (`M4_M3_EXECUTION_ENABLED`
  governs it independently, see `.env.example`).

## Troubleshooting

- **`A local backend is still running on port 3210.`** — a previous
  `convex dev` process didn't shut down cleanly (this can happen if it was
  backgrounded with a raw shell `&`/`nohup` instead of a supervised process).
  On Windows: `Get-NetTCPConnection -LocalPort 3210 -State Listen | Select
  OwningProcess` then `Stop-Process -Id <pid> -Force`. On macOS/Linux:
  `lsof -i :3210` then `kill <pid>`.
- **An objective stays in `state: "received"` forever.** Expected when
  `LIVE_AI_ENABLED` is unset/false on the target deployment: the
  interpretation model call fails closed and the *outer* `state` field does
  not itself change (only `management.interpretationStatus` does — inspect it
  via `objectives.getObjective`, not `getObjectiveStatus`, to see
  `interpretationStatus: "refused"` and `controlNotes[].providerError`). This
  is not a local-only quirk; the same happens on cloud with the flag unset.
- **Gate script errors with `SOMEBODY_DEMO_OPERATOR_TOKEN missing in
  .env.local`.** The value in the env file must match what's set on that
  *target* deployment (`npx convex env get SOMEBODY_DEMO_OPERATOR_TOKEN
  --deployment local` or `--deployment dev`).
- **`peek`/`dump` on the wrong target returns "not found".** Local and cloud
  are intentionally isolated — an objective key created on one never resolves
  on the other. Check you passed the matching `--env-file=`.

## Known local-vs-cloud differences

- No public HTTP ingress locally (see "What remains cloud-only").
- The local backend must stay running (as the parent of `npx convex dev`) for
  scheduled functions and queries to work; cloud has no such requirement.
- Local deployments start with an empty env store — nothing is copied from
  cloud automatically. Any secret the runtime needs locally must be set
  explicitly with `npx convex env set … --deployment local` (or omitted, in
  which case dependent code paths fail closed).
