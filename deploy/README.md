# exe.dev deployment — bill

Production is live at:

```text
https://ynab.mcp.vhtm.eu
```

Hosted on the shared `vhtm-eu` VM. The arch + conventions live in
<https://github.com/Jason-vh/vhtm.eu>. This file is just the per-app
runbook.

## Architecture

```text
client (MCP / Claude)
  -> https://ynab.mcp.vhtm.eu/mcp
  -> exe.dev edge (TLS termination)
  -> vhtm-eu VM :8080
  -> Caddy (host-matched via apps/bill/deploy/caddy.snippet)
  -> 127.0.0.1:3008
  -> bill's MCP container (Bun HTTP, Streamable MCP + OAuth)
  -> YNAB API (api.ynab.com) using the server's YNAB PAT
```

No database. OAuth client registrations persist to `data/oauth-state.json`
inside the `bill-data` Docker volume, so they survive redeploys.

## Files in this directory

| File | Purpose |
|---|---|
| `caddy.snippet` | Routing for `ynab.mcp.vhtm.eu` → `127.0.0.1:3008` **and** `bill.vhtm.eu` → `127.0.0.1:3009`. Imported by `/etc/caddy/Caddyfile` via `apps/*/deploy/caddy.snippet`. |
| `env.production.example` | Shape of `.env.production` (written by CI from secrets, not committed). |
| `README.md` | This file. |

## One-time exe.dev / DNS setup

```bash
# Register the hostname with the exe.dev edge:
ssh exe.dev domain add vhtm-eu ynab.mcp.vhtm.eu

# DNS at Porkbun:
#   ynab.mcp.vhtm.eu  CNAME  vhtm-eu.exe.xyz
```

## GitHub Actions secrets

| Secret | Source |
|---|---|
| `YNAB_ACCESS_TOKEN` | YNAB personal access token — <https://app.ynab.com/settings/developer>. Authenticates the server to YNAB. |
| `MCP_BEARER_TOKEN` | Static bearer token clients may present to this server. Random. |
| `OAUTH_LOGIN_PASSWORD` | Password for the OAuth login flow (username `json`). |
| `OAUTH_SESSION_SECRET` | Signing secret for issued OAuth sessions/tokens. Keep stable across deploys. |

## Deploy

Every push to `main`:

1. Runs on the self-hosted runner labeled `bill-prod`.
2. Writes `.env.production` from GitHub Actions secrets.
3. Copies the checkout into `/home/exedev/apps/bill`.
4. `docker compose up -d --build` from that stable directory.
5. `caddy validate` + `systemctl reload caddy` so any change to
   `deploy/caddy.snippet` takes effect.

## Operations

```bash
ssh vhtm-eu.exe.xyz
cd /home/exedev/apps/bill

# Container status:
docker compose --env-file .env.production ps

# App logs:
docker compose --env-file .env.production logs -f app

# Restart app:
docker compose --env-file .env.production restart app
```

## Public checks

```bash
# Health:
curl -s https://bill.vhtm.eu/health   # {"ok":true,"service":"bill"}
curl -s https://ynab.mcp.vhtm.eu/health

# OAuth protected-resource metadata:
curl -s https://ynab.mcp.vhtm.eu/.well-known/oauth-protected-resource/mcp

# MCP endpoint should 401 without a token:
curl -s -o /dev/null -w '%{http_code}\n' -X POST https://ynab.mcp.vhtm.eu/mcp
```

## Bill — bill.vhtm.eu (co-located second service)

Bill is a read-only, unauthenticated joint-budget status site that reuses this
repo's YNAB client. It runs as a **second Docker service** (`bill`) in the same
`docker-compose.yml`, on `127.0.0.1:3009`, deployed by the same push and the
same `bill-prod` runner. No database; it caches YNAB responses in memory (~5 min).

```text
client -> https://bill.vhtm.eu -> exe.dev edge -> vhtm-eu VM :8080
       -> Caddy (@bill in deploy/caddy.snippet) -> 127.0.0.1:3009
       -> bill container (Bun HTTP) -> YNAB API (same PAT as the MCP service)
```

Config (written to `.env.production` by the deploy workflow; the IDs are plan/
group/account identifiers, not secrets):

| Var | Value |
|---|---|
| `YNAB_ACCESS_TOKEN` | Shared with the MCP service (GitHub Actions secret). |
| `BILL_BUDGET_ID` | `budget!` plan. |
| `BILL_JOINT_GROUP_ID` | The `joint` category group. |
| `BILL_JOINT_ACCOUNT_ID` | The `Revolut Joint` account (transaction filter). |
| `BILL_APP_HOST_PORT` | `3009`. |

### One-time exe.dev / DNS setup for bill

```bash
# Register the hostname with the exe.dev edge:
ssh exe.dev domain add vhtm-eu bill.vhtm.eu

# DNS at Porkbun:
#   bill.vhtm.eu  CNAME  vhtm-eu.exe.xyz
```

Also add the inventory row to <https://github.com/Jason-vh/vhtm.eu> in
`apps/README.md`:

```text
| bill    | `bill.vhtm.eu`   | `3009`   | `github.com/Jason-vh/bill` | `gh-actions-runner-bill.service` |
```

### Bill operations

```bash
ssh vhtm-eu.exe.xyz
cd /home/exedev/apps/bill
docker compose --env-file .env.production logs -f bill
docker compose --env-file .env.production restart bill
```
