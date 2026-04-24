---

## name: Truto CLI
description: Admin and debugging tool for the Truto platform. Use to set up integrations, manage accounts, explore resources, export data, and debug API calls from the terminal. Does not generate application code.

# Truto CLI

Use this skill when running Truto commands in the terminal — setting up platform resources, exploring what an integration supports, debugging API calls, or doing one-time data exports. The CLI is an **admin and debugging tool**; nothing it does ends up in the user's codebase.

To write integration code that calls the Truto API from the user's application, use the **Truto** skill instead.

Trigger phrases: "truto cli", "truto command", "install truto", "truto login", "set up integration", "list accounts", "truto export", "debug truto".

## What is the Truto CLI?

The Truto CLI is a terminal tool for administering the [Truto](https://truto.one) unified API platform. It covers:

- **Setup and admin** — create and configure integrations, connect accounts, set up sync jobs, webhooks, and workflows
- **Exploration and debugging** — discover available resources, inspect data, test API calls with verbose output
- **One-time data tasks** — bulk export with auto-pagination, field-by-field diffing, log queries

## Installation

```bash
curl -fsSL https://cli.truto.one/install.sh | bash
```

This detects your OS/architecture, downloads the correct binary, and installs to `~/.truto/bin/truto`.

**Options:**

```bash
# Specific version
TRUTO_VERSION=0.1.0 curl -fsSL https://cli.truto.one/install.sh | bash

# Custom install directory
TRUTO_INSTALL_DIR=/usr/local/bin curl -fsSL https://cli.truto.one/install.sh | bash
```

**Upgrade:**

```bash
truto upgrade              # upgrade to latest
truto upgrade --check      # check without installing
truto upgrade --force      # re-download even if current
```

## Authentication

The CLI uses API tokens. Authenticate with:

```bash
# Interactive (prompts for profile name, API URL, token)
truto login

# Non-interactive (for scripting / LLM agents)
truto login --token <your-api-token>
truto login --token <token> --profile-name staging --api-url https://custom.truto.one
```

Verify credentials:

```bash
truto whoami
truto whoami -o json        # machine-readable
```

Credentials are stored in `~/.truto/config.json`. Manage multiple profiles:

```bash
truto profiles list
truto profiles use staging
```

**Token resolution:** `--token` flag > active profile's token > error.
**API URL resolution:** `--api-url` flag > active profile's URL > `https://api.truto.one`.

## Quick Reference


| Category                        | Commands                                                                                                                                                                                                                   | Description                                                                                          |
| ------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| **Auth**                        | `login`, `logout`, `whoami`, `profiles`                                                                                                                                                                                    | Authentication and profile management                                                                |
| **Discovery**                   | `capabilities`, `accounts tools`, `integrations tools`, `integrations unified-apis`                                                                                                                                        | Find which resources/methods an account or integration exposes — **start here before any data call** |
| **Core Resources**              | `integrations` (incl. `init`, `validate`), `accounts`, `environments`, `environment-integrations` (incl. `override-auth`, `override-pagination`, `override-rate-limit`, `override-webhook`, `show-override`), `api-tokens` | Platform entity management                                                                           |
| **Unified Model Customization** | `unified-models`, `unified-model-mappings`, `env-unified-models`, `env-unified-model-mappings`                                                                                                                             | Base + per-environment unified model definitions and field mappings                                  |
| **Automation**                  | `sync-jobs`, `sync-job-runs`, `sync-job-triggers`, `sync-job-templates`, `workflows`, `workflow-runs`                                                                                                                      | Data sync and workflow automation                                                                    |
| **Data Plane**                  | `unified` (incl. `test-mapping`), `proxy`, `custom`, `batch`                                                                                                                                                               | Access third-party data; iterate on JSONata mappings locally                                         |
| **Webhooks & Alerts**           | `webhooks`, `notification-destinations`                                                                                                                                                                                    | Event delivery and alerting                                                                          |
| **Platform**                    | `datastores`, `mcp-tokens`, `daemons`, `daemon-jobs`, `gates`, `docs`, `link-tokens`, `users`, `team`                                                                                                                      | Additional platform resources                                                                        |
| **Power Features**              | `export`, `diff`, `open`, `interactive`, `logs`, `schema`, `files`                                                                                                                                                         | Bulk data, comparison, and utilities                                                                 |
| **Meta**                        | `upgrade`, `context`                                                                                                                                                                                                       | CLI management and LLM agent reference                                                               |


## Querying Data from Connected Accounts (Discovery-First)

**Read this whenever the user asks you to fetch, list, create, update, delete, or otherwise query data from a connected account.** LLMs hallucinate `unified`/`proxy`/`custom` calls when they guess resource names and methods. Don't guess — discover.

### The rule

Never call `truto unified`, `truto proxy`, or `truto custom` blind. **Always run `truto capabilities <target>` first** to learn which resources and methods this account actually exposes. Capabilities is the source of truth — every argument you pass to a data-plane command should be copied out of its response.

### The 3-step loop

```bash
# 1. Find the integrated account ID
truto accounts list -o json

# 2. Discover what THIS account can do (proxy + unified + auth + AI readiness)
ACCOUNT=121aba7d-b4d4-4eb0-9654-2c784db5fc1f
truto capabilities $ACCOUNT -o json

# 3. Call with arguments copied from the capabilities response
truto unified ecommerce products -a $ACCOUNT -o json    # from capabilities.unified
truto proxy products -a $ACCOUNT -o json                 # from capabilities.proxy
```

### Capabilities response shape (real example, Bigcommerce account)

```json
{
  "integration": { "id": "...", "name": "bigcommerce", "label": "Bigcommerce", "category": "ecommerce" },
  "environment_id": "...",
  "proxy": [
    {
      "resource": "products",
      "methods": [
        { "method": "list",   "name": "list_all_bigcommerce_products",        "description": "...", "has_query_schema": true,  "has_body_schema": false },
        { "method": "get",    "name": "get_single_bigcommerce_product_by_id", "description": "...", "has_query_schema": true,  "has_body_schema": false },
        { "method": "create", "name": "create_a_bigcommerce_product",         "description": "...", "has_query_schema": false, "has_body_schema": true  },
        { "method": "update", "name": "update_a_bigcommerce_product_by_id",   "description": "...", "has_query_schema": false, "has_body_schema": true  },
        { "method": "delete", "name": "delete_a_bigcommerce_product_by_id",   "description": "...", "has_query_schema": false, "has_body_schema": false }
      ]
    },
    { "resource": "orders", "methods": [ ... ] }
  ],
  "unified": [
    {
      "model": "ecommerce",
      "model_label": "Unified E-Commerce API",
      "resource": "products",
      "description": "...",
      "docs_url": "https://truto.one/docs/api-reference/unified-e-commerce-api/products",
      "methods": ["get", "list"],
      "env_overridden": false
    }
  ],
  "auth": { "formats": ["api_key"], "fields": [ { "name": "store_hash", "required": true }, ... ] },
  "ai_readiness": { "proxy_methods": 10, "proxy_methods_with_descriptions": 5, "ai_ready_score": 0.5 },
  "account": { "id": "...", "status": "active", "authentication_method": "api_key", "is_blocked": false }
}
```

### How to read it


| Capabilities field                       | Maps to CLI args                                                                     |
| ---------------------------------------- | ------------------------------------------------------------------------------------ |
| `proxy[].resource`                       | `truto proxy <resource>`                                                             |
| `proxy[].methods[].method`               | `-m <method>` (`list` / `get` / `create` / `update` / `delete` / custom)             |
| `unified[].model` + `unified[].resource` | `truto unified <model> <resource>`                                                   |
| `unified[].methods[]`                    | `-m <method>` (typically `list`, `get`, sometimes `create`/`update`/`delete`/custom) |
| `auth.formats`, `auth.fields`            | What credentials the account already has — never invent these                        |


### `capabilities` vs `accounts tools`


| Use…                                | When you want…                                                                                                                                                                         |
| ----------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `truto capabilities <id> -o json`   | The clean menu of resources × methods. **Default discovery tool.** Use this 95% of the time.                                                                                           |
| `truto accounts tools <id> -o json` | The full JSON Schema (`query_schema` / `body_schema`) for one method. Reach for this only after capabilities tells you the method exists and you need to know which fields it accepts. |


`capabilities` also works on an integration **slug** (no account required) — useful before connecting:

```bash
truto capabilities hubspot -o json     # what does hubspot support in general?
truto capabilities $ACCOUNT -o json    # what does THIS connected account expose?
```

The CLI auto-detects: anything matching a UUID is treated as an account, everything else as an integration slug. Pass `--target integration` or `--target account` to force.

See [references/querying-data.md](references/querying-data.md) for the full reference, copyable templates per method, pagination, and failure modes.

## Global Options

Every command accepts these flags:


| Flag                    | Description                              | Default                                  |
| ----------------------- | ---------------------------------------- | ---------------------------------------- |
| `-p, --profile <name>`  | Use a specific profile                   | Active profile                           |
| `--api-url <url>`       | Override API URL                         | Profile's URL or `https://api.truto.one` |
| `--token <token>`       | Override API token                       | Profile's token                          |
| `-o, --output <format>` | `json`, `table`, `yaml`, `csv`, `ndjson` | `table`                                  |
| `-v, --verbose`         | Print request/response details to stderr | Off                                      |


## Output Formats


| Format   | Best for                                                | Notes                                                                                                                                                                |
| -------- | ------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `table`  | Interactive humans only                                 | Default. **Silently truncates** IDs, URLs, and JSON/HTML bodies. Never use for scripting or LLM workflows.                                                           |
| `json`   | One-shot to a file or in-memory `jq`                    | Pretty-printed, single document. **Truncates mid-token if the consumer (`head`/`less`) closes the pipe early** — redirect to a file before processing large results. |
| `ndjson` | Streaming, `head`/`tail`/`grep`/`jq -c`, log processing | One JSON object per line — safe to truncate at any newline. Ideal for `export` and any LLM-driven pipe.                                                              |
| `csv`    | Spreadsheets, data analysis                             | Auto-detects columns. Streams page-by-page for `export`.                                                                                                             |
| `yaml`   | Config files, human-readable                            | Uses yaml library. Buffered.                                                                                                                                         |


When `-o` is set to `json`, `yaml`, `csv`, or `ndjson`, decorative messages are suppressed — only structured data reaches stdout.

**LLM rule of thumb:** default to `-o ndjson` for anything you'll pipe; default to `-o json > /tmp/out.json` for anything you'll `jq` over more than once.

## LLM Agent Tips

1. **For any LLM-driven workflow, always pass `-o json` or `-o ndjson` — `table` is for humans only and silently truncates IDs, URLs, and JSON/HTML bodies.** Prefer `ndjson` when piping to `head`, `tail`, `less`, `grep`, `jq -c`, etc. — `json` is buffered and gets truncated mid-token by SIGPIPE, causing `jq: parse error`. For larger results, redirect to a file first: `truto … -o json > /tmp/out.json && jq … /tmp/out.json`. See the gotcha below.
2. **Always run `truto capabilities <account-id> -o json` before any data-plane call.** It tells you which `proxy` resources/methods and which `unified` model/resource/methods are available for that account. Never guess them. See [Querying Data from Connected Accounts](#querying-data-from-connected-accounts-discovery-first) above and [references/querying-data.md](references/querying-data.md). Reach for `truto accounts tools <id>` only when you need the full `query_schema`/`body_schema` for a specific method.
3. **Resource ID is positional, not a flag.** For `get`/`update`/`delete` on `truto unified` and `truto proxy`, the resource ID is the second positional argument — there is no `-d` / `--id` flag. Correct: `truto proxy contacts crd_xxx -a $ACCOUNT -m get`. Wrong: `truto proxy contacts -a $ACCOUNT -m get -d crd_xxx` (returns `error: unknown option '-d'`). Same convention for unified: `truto unified crm contacts crd_xxx -m get -a $ACCOUNT`.
4. **Use `-v` (verbose)** to debug failures — shows raw HTTP request/response on stderr.
5. **Non-interactive login:** `truto login --token <token>` skips all prompts.
6. **Use `truto context`** to get a full CLI reference as markdown, or `truto context --full` for the complete command tree with all flags.
7. **Pagination:** List commands return 25 results by default. Use `truto export` for exhaustive data.
8. **Resource path convention:** In `export`/`diff`, `crm/contacts` (with `/`) = unified API, `tickets` (no `/`) = proxy API.
9. **Read the proxy 404 hint.** When `truto proxy` returns 404, the CLI auto-runs capabilities and prints either `Did you mean: <near-matches>?` or `Run \`truto capabilities  --type proxy to list available resources.` — follow that hint instead of switching to a different approach.

## Key Gotchas

- **Resource ID is positional on `unified` / `proxy**` — for `-m get|update|delete`, the ID is the second positional argument, **not** a flag. There is no `-d` or `--id` flag.
  - Correct: `truto proxy conversations cnv_1mknzqn4 -a $ACCOUNT -m get`
  - Wrong: `truto proxy conversations -a $ACCOUNT -m get -d cnv_1mknzqn4` → `error: unknown option '-d'`
  - Same shape for unified: `truto unified crm contacts <id> -m get -a $ACCOUNT`. The full list-style CRUD is in [references/querying-data.md → Worked examples per method](references/querying-data.md#worked-examples-per-method).
- `**-o json` + `head`/`less`/early-close consumers ⇒ truncated JSON ⇒ `jq: parse error`.** When the consumer closes the pipe early, the CLI's pretty-printed JSON is cut mid-token. Two safe patterns:
  - Streaming consumers: use `-o ndjson` and pipe to `head`, `jq -c`, `grep`, etc. — one JSON object per line, safe to truncate.
  - Anything that might be larger than a screen: redirect to a file first, then process. `truto … -o json > /tmp/out.json && jq … /tmp/out.json`.
  - The default `-o table` also truncates values silently — never rely on it for IDs, URLs, or anything you'll feed back into another command.
- **`truto accounts list` server-side filters** (CLI ≥ 0.17.0) — `--tenant-id`, `--is-sandbox`, `--integration-name` (alias `--integration.name`), `--status` (`active` / `connecting` / `post_install_error` / `validation_error` / `needs_reauth`), `--features-super-query` (alias `--features.super_query`, values `apac` / `wnam`), `--created-at`, `--updated-at`. Setting `--profile` is **not** a substitute — it only swaps token + API URL; you still need the filter flag to scope by integration. Verify with `truto accounts list --help`. Examples:
  - `truto accounts list --integration-name hubspot --status active -o json`
  - `truto accounts list --integration-name front --created-at 2024-01-01T00:00:00Z -o json`
  - On older CLI versions, fall back to `truto accounts list -o json > /tmp/accs.json && jq '.[] | select(.integration.name=="front")' /tmp/accs.json`.
- `**accounts**` not `integrated-accounts` — CLI uses the short name for brevity.
- `**gates**` not `static-gates` — CLI is `gates`, API path is `static-gate`.
- **Optimistic locking** — `integrations update`, `unified-models update`, `unified-model-mappings update`, and `env-unified-model-mappings update` all require a `version` field. Fetch current version with `get` first.
- `**environment_id` is implicit** — your API token is scoped to one environment.
- **MCP tokens use positional args** — `mcp-tokens` takes account ID as first positional argument, not `--account`.
- `**-mappings` is the verb-friendly alias** — `truto unified-model-mappings` and `truto env-unified-model-mappings` map to the API resources `unified-model-resource-method` and `environment-unified-model-resource-method` respectively. Use the CLI names; the long forms only appear in raw HTTP debugging.
- `**override-*` helpers are deep patches** — `truto environment-integrations override-auth/override-pagination/override-rate-limit/override-webhook` patch the relevant key inside `override` and leave siblings alone. Use `show-override` to inspect the current state, and pass `--clear` to null out a single key.
- `**unified test-mapping` is offline** — it evaluates a JSONata `response_mapping` against a local sample (no third-party HTTP call), so you can iterate before publishing. It cannot evaluate operator-style (object) mappings yet.
- **Proxy 404s come with a "Did you mean…?" hint** — when `truto proxy` 404s, the CLI silently re-runs capabilities and either suggests near-matches (e.g. `Did you mean: contacts, companies?`) or points you at `truto capabilities <id> --type proxy`. The hint replaces guessing — read it instead of trying random resource names. Methods get the same treatment: `truto proxy contacts -m search` on an account that doesn't expose `search` yields `Method \`search is not implemented for contacts. Available: list, get, create, update, delete.`

## References


| Reference                                        | Content                                                                                                                                                                                                                                                      |
| ------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| [Querying Data](references/querying-data.md)     | **Discovery-first walkthrough** — capabilities reference, response decode guide, copyable command templates per method, when to escalate to `accounts tools` for schemas, pagination, failure modes (proxy 404 hint, empty filters), `jq` recipes            |
| [Admin Commands](references/admin-commands.md)   | Full CRUD details for every platform resource — including `integrations init/validate`, `environment-integrations override-`*, and the `unified-models` / `unified-model-mappings` / `env-unified-models` / `env-unified-model-mappings` customization group |
| [Data Plane](references/data-plane.md)           | Unified, proxy, custom, and batch API commands; `unified test-mapping` for local JSONata iteration                                                                                                                                                           |
| [Power Features](references/power-features.md)   | Export, diff, interactive mode, logs, schema, open                                                                                                                                                                                                           |
| [Common Patterns](references/common-patterns.md) | Pagination, filtering, piping, stdin, profiles, scripting                                                                                                                                                                                                    |


## Companion: Truto API

To write integration code that calls the Truto API from the user's application — `fetch()` calls, webhook handlers, connection flows — use the **Truto** skill. This CLI skill is for admin setup and debugging in the terminal; the Truto skill is for code that ships in the user's product.