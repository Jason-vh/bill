# exe.dev deployment — ynab-mcp

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
  -> Caddy (host-matched via apps/mcp/deploy/caddy.snippet)
  -> 127.0.0.1:3008
  -> ynab-mcp container (Bun HTTP, Streamable MCP + OAuth)
  -> YNAB API (api.ynab.com) using the server's YNAB PAT
```

No database. OAuth client registrations persist to `data/oauth-state.json`
inside the `mcp-data` Docker volume, so they survive redeploys.

## Files in this directory

| File | Purpose |
|---|---|
| `caddy.snippet` | Routing for `ynab.mcp.vhtm.eu` → `127.0.0.1:3008`. Imported by `/etc/caddy/Caddyfile` via `apps/*/deploy/caddy.snippet`. |
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

1. Runs on the self-hosted runner labeled `mcp-prod`.
2. Writes `.env.production` from GitHub Actions secrets.
3. Copies the checkout into `/home/exedev/apps/mcp`.
4. `docker compose up -d --build` from that stable directory.
5. `caddy validate` + `systemctl reload caddy` so any change to
   `deploy/caddy.snippet` takes effect.

## Operations

```bash
ssh vhtm-eu.exe.xyz
cd /home/exedev/apps/mcp

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
curl -s https://ynab.mcp.vhtm.eu/health

# OAuth protected-resource metadata:
curl -s https://ynab.mcp.vhtm.eu/.well-known/oauth-protected-resource/mcp

# MCP endpoint should 401 without a token:
curl -s -o /dev/null -w '%{http_code}\n' -X POST https://ynab.mcp.vhtm.eu/mcp
```
