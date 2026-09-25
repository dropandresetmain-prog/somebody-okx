# Public replay deployment

The public website runs Somebody in **replay mode**: `/start` looks and behaves
like the real start experience, and submitting it plays a completed Somebody
run (MAKE + BUY, founder approval, OKX Agentic Wallet, x402, X Layer Testnet,
verified final plan) through the real product UI. The visitor's text is never
sent anywhere.

Replay mode mounts no Convex client and reaches no model, JEV, payment,
merchant or wallet code. `/m5` and `/api/okx/discover` return 404 in replay
mode. The live product is unchanged when the mode is not set.

## Environment

| Variable | Value | Required |
| --- | --- | --- |
| `NEXT_PUBLIC_SOMEBODY_MODE` | `replay` | yes |
| `NEXT_PUBLIC_FOUNDER_CONTACT_URL` | e.g. `mailto:…` or `https://…` — makes "Contact the founder" a link | optional |

Nothing else. Do **not** set `NEXT_PUBLIC_CONVEX_URL`, model keys
(`OPENROUTER_API_KEY`, `OPENAI_API_KEY`, `AI_GATEWAY_API_KEY`), OKX credentials
(`OKX_API_KEY`, `OKX_SECRET_KEY`, `OKX_API_PASSPHRASE`), driver/attestation
tokens (`M4_M3_DRIVER_TOKEN`, `M4_M3_FACT_ATTESTATION_KEY`) or any signing
material on the public project.

Verify locally with exactly that environment:

```bash
NEXT_PUBLIC_SOMEBODY_MODE=replay npm run build
```

## Vercel (CLI 59.x) — staged flow

Run from a clean checkout of the release commit (no `.env*` files present;
`.vercelignore` also excludes them).

```bash
vercel link
vercel env add NEXT_PUBLIC_SOMEBODY_MODE preview
vercel env add NEXT_PUBLIC_SOMEBODY_MODE production
vercel pull --yes --environment=preview
vercel build
vercel deploy --prebuilt
```

Review the preview URL (`/start` → submit → full replay → final plan). Then
stage production without moving the domain, review, and promote that exact
deployment:

```bash
vercel pull --yes --environment=production
vercel build --prod
vercel deploy --prebuilt --prod --skip-domain
vercel promote <staged-deployment-url>
```
