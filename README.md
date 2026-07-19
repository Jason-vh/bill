# bill

Remote MCP server for YNAB, built with Bun + TypeScript. This repo also hosts
**Bill** (`src/bill/`), a read-only joint-budget status site that reuses the
same YNAB client — see [Bill](#bill) below.

## Required env

- `YNAB_ACCESS_TOKEN`
- `MCP_BEARER_TOKEN`
- `OAUTH_LOGIN_PASSWORD`

## Optional env

- `PUBLIC_BASE_URL` (default: `https://bill.vhtm.eu`; the MCP server is served under `/mcp`)
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

## Bill

Bill is a read-only, unauthenticated web app showing the current-month status of
the shared `joint` category group, with per-category transactions from the
`Revolut Joint` account. It reuses this repo's YNAB client and runs as a second
service (`src/bill/index.ts`).

### Required env (in addition to `YNAB_ACCESS_TOKEN`)

- `BILL_BUDGET_ID` — the plan to read
- `BILL_JOINT_GROUP_ID` — the category group to display
- `BILL_JOINT_ACCOUNT_ID` — the account to filter transactions by

### Optional env

- `BILL_PORT` (default `3009`)
- `BILL_CACHE_TTL_SECONDS` (default `300`)

### Run

```bash
bun run bill        # or: bun run bill:dev
# http://localhost:3009
```

Deployment (co-located with the MCP service) is documented in
[`deploy/README.md`](deploy/README.md#bill--billvhtmeu-co-located-second-service).
