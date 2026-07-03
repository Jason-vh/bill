# YNAB MCP server discovery

Date: 2026-04-25

## Goal

Expose YNAB through a remote MCP server hosted on `ynab.mcp.vhtm.eu` (currently routed to `lima-hotel.exe.xyz`).

## Current infra state

- Custom domain works: `ynab.mcp.vhtm.eu`
- exe.dev VM: `lima-hotel`
- HTTP proxy port: `8000`
- VM is public
- Python 3.12 and `uv` are installed on the VM
- `bun` is **not** currently installed on the VM
- Node is not installed by default

## Recommendation

Build this as a **Bun + TypeScript MCP** server and deploy it on the exe.dev VM.

Why:

- you want Bun, and your local projects already use Bun heavily
- the official MCP TypeScript SDK runs on **Node.js, Bun, and Deno**
- YNAB has an **official JavaScript SDK** (`ynab`)
- Bun is a good fit for a small HTTP MCP service with streamable HTTP

## YNAB API findings

### Auth

Best option for personal use: **Personal Access Token** from YNAB developer settings.

- Docs: `https://api.ynab.com/`
- Generate token from: `https://app.ynab.com/settings/developer`

For a personal MCP server, PAT is simpler than OAuth.

### Rate limits

YNAB rate limit appears to be **200 requests per hour per access token**.

Implication:

- avoid wasteful full-budget fetches on every tool call
- use targeted endpoints where possible
- consider caching `server_knowledge` for delta sync

### Data model notes

YNAB docs commonly say “budgets”, but the newer generated SDK / OpenAPI spec uses **plans**.

Useful endpoints from the current OpenAPI spec:

- `GET /plans`
- `GET /plans/{plan_id}`
- `GET /plans/{plan_id}/settings`
- `GET /plans/{plan_id}/accounts`
- `GET /plans/{plan_id}/categories`
- `GET /plans/{plan_id}/months`
- `GET /plans/{plan_id}/months/{month}`
- `GET /plans/{plan_id}/transactions`
- `POST /plans/{plan_id}/transactions`
- `PATCH /plans/{plan_id}/transactions`
- `GET /plans/{plan_id}/transactions/{transaction_id}`
- `PUT /plans/{plan_id}/transactions/{transaction_id}`
- `GET /plans/{plan_id}/scheduled_transactions`
- `GET /plans/{plan_id}/payees`

### Delta sync / caching hooks

The API supports:

- `last_knowledge_of_server`
- `server_knowledge`
- `since_date` on transaction listing

This is useful for reducing calls and avoiding rate-limit pressure.

### Money format

YNAB amounts are in **milliunits**.

Examples:

- `$10.00` => `10000`
- `-$5.50` => `-5500`

The MCP layer should accept friendly decimal inputs and convert them to milliunits.

### Transactions

Useful transaction fields for MCP tools:

- `account_id`
- `date`
- `amount`
- `payee_id` or `payee_name`
- `category_id`
- `memo`
- `cleared`
- `approved`
- `flag_color`
- `import_id`
- `subtransactions`

`import_id` can help dedupe imported transactions.

## MCP server architecture

## Transport

Use **Streamable HTTP**.

Serve:

- MCP endpoint: `/mcp`
- Health endpoint: `/health`

Base URL:

- `https://ynab.mcp.vhtm.eu/mcp`

## Auth for the MCP server

Because the VM is public, add server-level auth.

Recommended first version:

- static bearer token for MCP clients
- YNAB PAT stored separately in environment

Environment variables:

- `YNAB_ACCESS_TOKEN`
- `MCP_BEARER_TOKEN`
- `YNAB_DEFAULT_PLAN_ID` (optional)

Important separation:

- **MCP bearer token** authenticates callers to *our* server
- **YNAB access token** authenticates the server to YNAB

## Suggested tool set v1

Read-focused + safe write tools:

1. `list_budgets`
   - list available budgets/plans
   - allow choosing a default

2. `get_budget_summary`
   - high-level summary
   - ready-to-assign, overspent categories, key balances

3. `list_accounts`
   - accounts with balances

4. `list_categories`
   - grouped categories with budgeted/activity/balance

5. `list_transactions`
   - filters: date range, account, payee, category, approved, search text

6. `get_unapproved_transactions`
   - quick review flow

7. `create_transaction`
   - account/date/amount/payee/category/memo/approved
   - accept decimal amount, convert to milliunits

8. `approve_transaction`
   - toggle approval for a transaction

9. `update_transaction`
   - limited safe updates

10. `get_month`
   - month summary + major category breakdown

## Suggested tool set v2

- `create_transactions_bulk`
- `update_month_category`
- `list_scheduled_transactions`
- `get_payees`
- `search_payees`
- `search_categories`
- `search_accounts`
- `find_recent_transactions`
- `import_transaction` with deterministic `import_id`

## Guardrails

For money tools, add these safeguards:

- require explicit amount/account/date for writes
- validate friendly decimal amounts before conversion
- do not guess transfer accounts silently
- do not modify split transactions unless explicitly requested
- optionally add `dry_run` mode for write tools
- return both raw response and human-readable summary

## Implementation choice

### Best implementation path

Use:

- `bun`
- TypeScript
- official MCP TypeScript SDK (`@modelcontextprotocol/server`)
- optional HTTP wiring with Bun's native `Bun.serve()` or a tiny framework like Hono/Express if needed
- official `ynab` JavaScript SDK

Notes:

- the MCP TypeScript SDK explicitly supports **Bun**
- for production, use **Streamable HTTP** on `/mcp`
- for auth, enforce a static bearer token in the HTTP layer before passing requests to the MCP transport

## Proposed project layout

```text
ynab/
  package.json
  bun.lock
  tsconfig.json
  README.md
  src/
    index.ts
    config.ts
    auth.ts
    ynab.ts
    formatting.ts
    tools/
      budgets.ts
      accounts.ts
      categories.ts
      transactions.ts
      months.ts
```

## Deployment sketch

On the VM:

```bash
# install bun first
curl -fsSL https://bun.sh/install | bash
source ~/.bashrc

mkdir -p ~/apps/ynab-mcp
cd ~/apps/ynab-mcp
bun install
export YNAB_ACCESS_TOKEN=...
export MCP_BEARER_TOKEN=...
bun run src/index.ts
```

Then keep it running via `tmux` initially.

## Open questions before implementation

1. Do we want a **single-user** server only, or multi-user routing later?
2. Should writes be enabled in v1, or read-only first?
3. Do we want a default budget/plan fixed in env, or selectable at runtime?
4. Which client will connect first:
   - Claude Desktop / Claude Code
   - another MCP client
   - custom agent setup
5. Do we want extra auth beyond a static bearer token?

## Recommended next step

Implement a minimal v1:

- Bun + TypeScript HTTP MCP server on `/mcp`
- bearer token auth
- YNAB PAT via env
- tools:
  - `list_budgets`
  - `list_accounts`
  - `list_categories`
  - `list_transactions`
  - `create_transaction`
  - `get_unapproved_transactions`

That is enough to prove the whole flow end-to-end on `https://ynab.mcp.vhtm.eu/mcp`.

## Sources

- YNAB API docs: `https://api.ynab.com/`
- YNAB OpenAPI spec: `https://api.ynab.com/papi/open_api_spec.yaml`
- YNAB JavaScript SDK: `https://github.com/ynab/ynab-sdk-js`
- MCP TypeScript SDK: `https://github.com/modelcontextprotocol/typescript-sdk`
- MCP server guide: `https://github.com/modelcontextprotocol/typescript-sdk/blob/main/docs/server.md`
