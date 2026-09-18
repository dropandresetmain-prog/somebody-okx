# M2 Discovery Findings

Status: **CORRECTED — official Onchain OS CLI discovery confirmed**  
Date: 2026-09-18  
Correction of: overnight Lane B finding that claimed no supported programmatic primitive  
CLI verified: **onchainos 4.6.1** (official release `okx/onchainos-skills` v4.6.1)

## Correction summary

The overnight report incorrectly concluded that no supported OKX discovery CLI exists.

The official current `okx/onchainos-skills` CLI **does** expose marketplace discovery:

| Command | Auth required (observed) | Need-driven without on-chain job? |
|---------|--------------------------|-----------------------------------|
| `onchainos agent service-match --keywords …` | **No** (works unauthenticated) | **Yes** — primary live path |
| `onchainos agent search --query "…"` | **Yes** (`onchainos wallet login`) | Yes — free-text agent search |
| `onchainos agent service-list --agent-id <id>` | **Yes** (login) | Per-agent service inspection |
| `onchainos agent asp-match --job-id <id>` | Likely yes | **No** — requires an existing task/job |

### Important discrepancy vs earlier skill wording

Some skill/docs text describes `asp-match --task-desc`. In **CLI v4.6.1** that flag does **not** exist:

```text
onchainos agent asp-match --task-desc "…"
→ error: unexpected argument '--task-desc'
Usage: onchainos agent asp-match [OPTIONS] --job-id <JOB_ID>
```

Task-description / capability matching **without** a job is supported by:

```bash
onchainos agent service-match --keywords <words…> --limit 5
```

and (when logged in):

```bash
onchainos agent search --query "<free text>"
```

## Installation (official only)

Windows (verified):

```powershell
# Official release binary (not a third-party npm package)
# https://github.com/okx/onchainos-skills/releases/tag/v4.6.1
# asset: onchainos-x86_64-pc-windows-msvc.exe → %USERPROFILE%\.local\bin\onchainos.exe
```

Do **not** install similarly named third-party npm packages (`okx-cli`, `desic-okx-agent`, etc.).

## Live probes (2026-09-18)

### CLI version

```text
onchainos 4.6.1
```

### service-match (no login) — SUCCESS

```bash
onchainos agent service-match --keywords "social" "intelligence" "twitter" "X" --limit 5
```

Returned real marketplace services (examples observed): XAgent Portfolio Health, Token Security Scan, X Layer Wallet Activity, XBubbleAI Health Check, etc. Fields include `aspAgentId`, `aspName`, `securityRate`, `feedbackRate`, `soldCount`, `serviceId`, `serviceName`, `serviceDescription`, `serviceType`, `feeAmount`, `feeToken` / `feeTokenSymbol`.

Newsliquid / FlyBeacon / xbird **did not** appear in these unauthenticated keyword matches. A targeted `service-match --keywords "OpenNews" "Newsliquid" "twitter" "search"` returned zero services.

### agent search — LOGIN REQUIRED

```bash
onchainos agent search --query "current X social intelligence search for customer language"
→ {"ok":false,"error":"session expired, please login again: onchainos wallet login"}
```

### service-list for snapshot agent ids — LOGIN REQUIRED

```bash
onchainos agent service-list --agent-id 2135
onchainos agent service-list --agent-id 4442
→ session expired / wallet login required
```

Founder action if deeper agent-scoped inspection is needed:

```bash
onchainos wallet login
```

(interactive; stop at that boundary — do not automate credentials).

## Implementation decision (corrected)

**Primary:** official live discovery via `MarketDiscovery` → `OkxDiscoveryAdapter` → `onchainos` CLI (prefer `service-match`; optionally `search` / `service-list` when authenticated).

**Fallback:** synchronized snapshot (`lib/market/snapshotDiscovery.ts`) **only** when live CLI/bridge fails or returns no registry-compatible offerings — with **explicit, persisted provenance** (`source.kind: "snapshot"` plus `raw.fallbackReason`). Never silent degrade.

**Runtime boundary:** do not assume Convex Node can shell out. Preferred demo path is a documented local/Next.js CLI bridge; Convex injects `MarketDiscovery` and records provenance. Discovery output remains **untrusted** until verified registry + candidate assessment.

## Trust boundary (unchanged)

```text
external discovery
→ untrusted MarketOffering
→ application verified service/resource mapping
→ generic CandidateAssessment
→ approved provider path
→ deterministic sourcing kernel
```

Discovery does not authorize spend. Provider identity does not imply resource compatibility. The model does not choose the final provider.
