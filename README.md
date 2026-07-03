# ynab-mcp

Remote MCP server for YNAB, built with Bun + TypeScript.

## Required env

- `YNAB_ACCESS_TOKEN`
- `MCP_BEARER_TOKEN`
- `OAUTH_LOGIN_PASSWORD`

## Optional env

- `PUBLIC_BASE_URL` (default: `https://ynab.mcp.vhtm.eu`)
- `OAUTH_LOGIN_USERNAME` (default: `json`)
- `OAUTH_SESSION_SECRET`
- `OAUTH_STATE_FILE`
- `YNAB_DEFAULT_PLAN_ID`
- `PORT`

## Run

```bash
bun install
export YNAB_ACCESS_TOKEN=...
export MCP_BEARER_TOKEN=...
export OAUTH_LOGIN_PASSWORD=...
bun run src/index.ts
```

## Endpoints

- `GET /health`
- `POST /mcp`
- `GET /.well-known/oauth-authorization-server`
- `GET /.well-known/oauth-protected-resource/mcp`
- `POST /oauth/register`
- `GET|POST /oauth/authorize`
- `POST /oauth/token`

The server includes a `create_transaction` tool, but it is safe by default:

- it previews by default
- it only creates when `commit=true`
- it uses a deterministic `import_id` by default to reduce accidental duplicates
