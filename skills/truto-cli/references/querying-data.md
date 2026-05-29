# Querying Data from Connected Accounts

This is the discovery-first reference for fetching data from a Truto-connected account. Read this **before** writing any `truto unified`, `truto proxy`, or `truto custom` command. The single most common LLM failure mode against Truto is guessing resource and method names — every step below exists to make that impossible.

## The discovery-first contract

Every data-plane command (`unified`, `proxy`, `custom`, `export`, `diff`, `batch`) accepts arguments — model, resource, method — that are **specific to the integration the account is connected to**. HubSpot exposes `contacts`/`companies`/`deals`; Bigcommerce exposes `products`/`orders`/`customers`; ServiceNow exposes `incident`/`change_request`/`problem`. There is no universal list. The capabilities endpoint is the source of truth, and you must consult it before constructing the call.

```mermaid
flowchart TD
    Start[User asks: query data from a connected account] --> Whoami[truto whoami -o json<br/>confirm profile + team]
    Whoami --> Accounts[truto accounts list -o json<br/>find integrated_account_id]
    Accounts --> Cap["truto capabilities ACCOUNT_ID -o json<br/>--type all (default)"]
    Cap --> Decide{Need normalized<br/>fields across<br/>integrations?}
    Decide -- yes --> Unified["truto unified MODEL RESOURCE -a ID -m METHOD<br/>fields from capabilities.unified"]
    Decide -- no --> Proxy["truto proxy RESOURCE -a ID -m METHOD<br/>fields from capabilities.proxy"]
    Unified --> Schema{Need full<br/>query/body<br/>schema?}
    Proxy --> Schema
    Schema -- yes --> Tools[truto accounts tools ID -o json<br/>deep schema for one resource/method]
    Schema -- no --> Done[Done]
    Tools --> Done
```

## `truto capabilities <target>` reference

```bash
truto capabilities <target> [options]
```

### Arguments


| Argument   | Required | Description                                                                                                                                                                                      |
| ---------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `<target>` | Yes      | Integration **slug** (e.g. `hubspot`) **or** integrated-account **UUID**. Auto-detected: anything matching the v4 UUID pattern is treated as an account; everything else as an integration slug. |


### Options


| Flag                   | Description                                                                        | Default                |
| ---------------------- | ---------------------------------------------------------------------------------- | ---------------------- |
| `-t, --type <type>`    | Capability surface: `proxy`                                                        | `unified`              |
| `--has-description`    | Only return proxy methods that have a description                                  | `true` (on by default) |
| `--no-has-description` | Include proxy methods even if they have no description (widens the result set)     | —                      |
| `--methods <list>`     | Comma-separated method filter (`list,get,create,update,delete` or any custom name) | —                      |
| `--resource <name>`    | Filter to a single resource by name                                                | —                      |
| `--target <kind>`      | Force target kind when auto-detection is wrong: `integration`                      | `account`              |


All [global flags](../SKILL.md#global-options) (`-p`, `-o`, `-v`, `--api-url`, `--token`) apply.

### HTTP equivalents


| CLI target               | HTTP path                                     |
| ------------------------ | --------------------------------------------- |
| Integration slug or UUID | `GET /integration/<slug-or-id>/capabilities`  |
| Integrated-account UUID  | `GET /integrated-account/<uuid>/capabilities` |


Query params on the HTTP endpoint mirror the CLI flags (`type`, `has_description`, `methods`, `resource`).

### Account vs integration target

- **Account target** (`truto capabilities <uuid>`) — the most actionable: returns exactly what THIS connected account can do, factoring in environment-level overrides (`env_overridden: true` on a unified row means a per-environment customization is in effect).
- **Integration target** (`truto capabilities hubspot`) — useful before connecting an account or for catalog browsing. Returns what the integration definition supports in general; doesn't include `account` or `env_overridden`.

## Reading the capabilities response

Real captured response, trimmed for readability (Bigcommerce account, `--resource products` filter):

```json
{
  "integration": {
    "id": "cef71931-64b9-4968-8465-08e370d69d71",
    "name": "bigcommerce",
    "label": "Bigcommerce",
    "category": "ecommerce"
  },
  "environment_id": "9874661d-8702-4005-881a-14aed15c67b5",
  "proxy": [
    {
      "resource": "products",
      "methods": [
        {
          "method": "list",
          "name": "list_all_bigcommerce_products",
          "description": "Returns a list of Products. You can filter by their names, price, brands, etc.",
          "has_description": true,
          "has_query_schema": true,
          "has_body_schema": false,
          "api_documentation_url": null
        },
        {
          "method": "get",
          "name": "get_single_bigcommerce_product_by_id",
          "description": "Get a single product by its ID.",
          "has_description": true,
          "has_query_schema": true,
          "has_body_schema": false,
          "api_documentation_url": null
        },
        {
          "method": "create",
          "name": "create_a_bigcommerce_product",
          "description": "Creates a Product. Only one product can be created at a time...",
          "has_description": true,
          "has_query_schema": false,
          "has_body_schema": true,
          "api_documentation_url": null
        },
        {
          "method": "update",
          "name": "update_a_bigcommerce_product_by_id",
          "description": "Updates a single Product by its ID.",
          "has_description": true,
          "has_query_schema": false,
          "has_body_schema": true,
          "api_documentation_url": null
        },
        {
          "method": "delete",
          "name": "delete_a_bigcommerce_product_by_id",
          "description": "Delete a Product by its ID.",
          "has_description": true,
          "has_query_schema": false,
          "has_body_schema": false,
          "api_documentation_url": null
        }
      ]
    }
  ],
  "unified": [
    {
      "model": "ecommerce",
      "model_label": "Unified E-Commerce API",
      "resource": "products",
      "description": "The product represent a product in E-Commerce.",
      "docs_url": "https://truto.one/docs/api-reference/unified-e-commerce-api/products",
      "methods": ["get", "list"],
      "env_overridden": false
    }
  ],
  "auth": {
    "formats": ["api_key"],
    "fields": [
      { "name": "store_hash", "label": "Store Hash", "type": "text",     "required": true },
      { "name": "api_key",    "label": "API Key",    "type": "password", "required": true }
    ],
    "documentation_link": "https://wiki.truto.one/integration-guides/bigcommerce/#finding-your-store-hash-and-api-key"
  },
  "ai_readiness": {
    "proxy_methods": 10,
    "proxy_methods_with_descriptions": 5,
    "ai_ready_score": 0.5
  },
  "account": {
    "id": "121aba7d-b4d4-4eb0-9654-2c784db5fc1f",
    "status": "active",
    "authentication_method": "api_key",
    "is_blocked": false
  }
}
```

### Field-to-CLI mapping


| Capabilities field                       | Use it as…                                                                                                                                                 |
| ---------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `proxy[].resource`                       | The `<resource>` positional in `truto proxy <resource>`                                                                                                    |
| `proxy[].methods[].method`               | The `-m <method>` value for `truto proxy` (`list` / `get` / `create` / `update` / `delete` / any custom name)                                              |
| `proxy[].methods[].name`                 | A human label (e.g. `list_all_bigcommerce_products`) — informational only; you don't pass it to the CLI                                                    |
| `proxy[].methods[].description`          | What the method actually does — read this before deciding whether it fits the user's intent                                                                |
| `proxy[].methods[].has_query_schema`     | If `true`, `truto accounts tools <id>` returns a `query_schema` describing valid `-q` keys for this method                                                 |
| `proxy[].methods[].has_body_schema`      | If `true`, the method takes a request body (`-b`/`--stdin`) — required for `create`/`update`/most custom methods                                           |
| `unified[].model` + `unified[].resource` | The two positionals in `truto unified <model> <resource>`                                                                                                  |
| `unified[].methods[]`                    | The `-m <method>` value for `truto unified` (typically `list`/`get`, sometimes `create`/`update`/`delete`/custom)                                          |
| `unified[].docs_url`                     | Public docs page for the unified model resource — link to it when explaining results                                                                       |
| `unified[].env_overridden`               | `true` means this environment has customized the mapping (`env-unified-models` / `env-unified-model-mappings`) — behavior may differ from the base mapping |
| `auth.formats`, `auth.fields`            | Credential shape the account already uses — never invent these fields                                                                                      |
| `account.status`                         | Must be `active`. `blocked`/`paused`/`expired` will fail at call time — fix the account first                                                              |
| `account.is_blocked`                     | Hard stop — `truto accounts refresh-credentials <id>` or reconnect via Link before retrying                                                                |
| `ai_readiness.ai_ready_score`            | Fraction of proxy methods with descriptions. Low scores (e.g. `0.2`) mean LLM-driven calls will be guesswork — prefer the unified API for that integration |


## Copyable command templates

Substitute the `UPPERCASE_PLACEHOLDERS` with values pulled from the capabilities response.

> ### CRITICAL: The resource ID is positional — there is no `-d` / `--id` flag.
>
> For `-m get|update|delete`, the resource ID is the **second positional argument** (right after `<resource>` for proxy, after `<model> <resource>` for unified). Trying `-d <id>` will fail with `error: unknown option '-d'`. The list-style CRUD pattern is shown in [Worked examples per method](#worked-examples-per-method) below.
>
> ```bash
> # Correct
> truto proxy conversations cnv_1mknzqn4 -a $ACCOUNT -m get
> truto unified crm contacts crd_xxx     -a $ACCOUNT -m get
>
> # Wrong — no -d flag exists
> truto proxy conversations -a $ACCOUNT -m get -d cnv_1mknzqn4
> ```

### Unified API

```bash
ACCOUNT=<uuid>

truto unified MODEL RESOURCE                       -a $ACCOUNT -o json
truto unified MODEL RESOURCE                       -a $ACCOUNT -o json -q "limit=50"
truto unified MODEL RESOURCE                       -a $ACCOUNT -o json -q "next_cursor=CURSOR_FROM_STDERR"
truto unified MODEL RESOURCE RESOURCE_ID -m get    -a $ACCOUNT -o json   # ID is positional
truto unified MODEL RESOURCE             -m create -a $ACCOUNT -o json -b '{"FIELD":"VALUE"}'
truto unified MODEL RESOURCE RESOURCE_ID -m update -a $ACCOUNT -o json -b '{"FIELD":"NEW_VALUE"}'
truto unified MODEL RESOURCE RESOURCE_ID -m delete -a $ACCOUNT -o json
truto unified MODEL RESOURCE             -m CUSTOM_METHOD -a $ACCOUNT -o json -b '{"key":"value"}'

# Body from stdin (useful when the body is computed)
echo '{"FIELD":"VALUE"}' | truto unified MODEL RESOURCE -m create -a $ACCOUNT --stdin -o json
```

### Proxy API

```bash
ACCOUNT=<uuid>

truto proxy RESOURCE                       -a $ACCOUNT -o json
truto proxy RESOURCE                       -a $ACCOUNT -o json -q "limit=100,page=2"
truto proxy RESOURCE RESOURCE_ID -m get    -a $ACCOUNT -o json   # ID is positional
truto proxy RESOURCE             -m create -a $ACCOUNT -o json -b '{"FIELD":"VALUE"}'
truto proxy RESOURCE RESOURCE_ID -m update -a $ACCOUNT -o json -b '{"FIELD":"NEW_VALUE"}'
truto proxy RESOURCE RESOURCE_ID -m delete -a $ACCOUNT -o json
truto proxy RESOURCE             -m CUSTOM_METHOD -a $ACCOUNT -o json -b '{"key":"value"}'
```

A custom method name becomes a path segment: `-m search` → `POST /proxy/<resource>/search`.

### Worked examples per method

Concrete, copy-pasteable shapes — note how the resource ID slots in for `get`/`update`/`delete`, never as a `-d` flag.

```bash
ACCOUNT=121aba7d-b4d4-4eb0-9654-2c784db5fc1f

# proxy — list (no ID)
truto proxy contacts -a $ACCOUNT -m list -o json -q "limit=50"

# proxy — get one by ID (ID positional)
truto proxy contacts crd_b9k3qp -a $ACCOUNT -m get -o json

# proxy — get one with a non-UUID ID (Front-style alt-ref)
truto proxy conversations 'alt:ref:imported@frontapp.com_t:50603' -a $ACCOUNT -m get -o json

# proxy — create (no ID, body required)
truto proxy contacts -a $ACCOUNT -m create -b '{"name":"Jane Doe","email":"jane@example.com"}' -o json

# proxy — update (ID positional, body required)
truto proxy tags tag_6bvf34 -a $ACCOUNT -m update -b '{"name":"renamed"}' -o json

# proxy — delete (ID positional, no body)
truto proxy conversations cnv_1mknzqn4 -a $ACCOUNT -m delete -o json

# proxy — custom method (no ID; method becomes a path segment, body usually required)
truto proxy contacts -a $ACCOUNT -m search -b '{"query":"jane"}' -o json

# unified — list (no ID, no model prefix differs by integration)
truto unified crm contacts -a $ACCOUNT -m list -o json -q "limit=50"

# unified — get one by ID (ID is third positional, after model + resource)
truto unified crm contacts crd_b9k3qp -a $ACCOUNT -m get -o json

# unified — create
truto unified crm contacts -a $ACCOUNT -m create -b '{"first_name":"Jane","email":"jane@example.com"}' -o json

# unified — update (ID positional)
truto unified crm contacts crd_b9k3qp -a $ACCOUNT -m update -b '{"last_name":"Smith"}' -o json

# unified — delete (ID positional)
truto unified crm contacts crd_b9k3qp -a $ACCOUNT -m delete -o json
```

### Custom API

When the resource isn't in `capabilities.proxy[]` but the integration exposes a raw HTTP path (often documented under the integration's docs):

```bash
ACCOUNT=<uuid>

truto custom /API_PATH                             -a $ACCOUNT -o json
truto custom /API_PATH -m POST -b '{"key":"value"}' -a $ACCOUNT -o json
truto custom /API_PATH -H "X-Custom-Header=value"  -a $ACCOUNT -o json
```

### Bulk export (auto-paginates)

```bash
truto export RESOURCE        -a $ACCOUNT -o ndjson --out data.ndjson    # proxy (no slash)
truto export MODEL/RESOURCE  -a $ACCOUNT -o ndjson --out data.ndjson    # unified (with slash)
```

## Going deeper: when capabilities isn't enough

Capabilities tells you that a method exists. It does NOT tell you which `-q` query params or `-b` body fields the method accepts. When you need that:

```bash
# Schema dump for one resource (one row per method)
truto accounts tools $ACCOUNT --methods list,get -o json

# Filter by tags too (some integrations tag methods like 'refund')
truto accounts tools $ACCOUNT --methods list --tags contacts,deals -o json
```

The response includes `query_schema` and `body_schema` — both are JSON Schema. Use them to:

1. Validate `-q` keys before calling.
2. Construct `-b` JSON that matches the integration's expected shape.
3. Surface required vs optional fields back to the user.

`accounts tools` is verbose (full schemas inline). Don't use it as your primary discovery tool — use `capabilities` first, then drill into `accounts tools` only for the specific resource/method you intend to call.

## Pagination

List calls return up to ~25 records by default. The CLI prints the next cursor to **stderr**:

```
Next page: -q next_cursor=eyJpZCI6IjEwMSJ9
```

To paginate, copy the cursor and re-run with `-q`:

```bash
truto unified crm contacts -a $ACCOUNT -o json -q "next_cursor=eyJpZCI6IjEwMSJ9"
```

For full extraction across all pages, use `truto export` instead — it auto-paginates and supports streaming `ndjson` / `csv` writes.

## Output-streaming gotchas (LLM-critical)

Three patterns silently produce wrong results — read these before piping any data-plane command.

### 1. `-o json | head` (or `less`, `grep`, `jq` with early exit) ⇒ truncated JSON

`-o json` emits one big pretty-printed JSON document. When the consumer (`head`, `less`, `jq` after a pipe close) closes the pipe early, the CLI receives SIGPIPE mid-token and the output ends partway through a value. You'll see:

```
jq: parse error: Invalid numeric literal at line N column M
jq: parse error: Unfinished JSON term at EOF at line N
```

…and the underlying data was actually fine — your pipe truncated it.

**Fix — pick whichever applies:**

```bash
# (a) Streaming consumer? Use ndjson — one object per line, safe to truncate:
truto proxy conversations -a $ACCOUNT -o ndjson | head -5 | jq -c '{id, subject}'

# (b) Anything that might be larger than a screenful — redirect, then process:
truto proxy conversation_messages -a $ACCOUNT -m list \
  -q "conversation_id=cnv_xxx" -q "limit=100" -o json > /tmp/msgs.json
jq '.[] | {id, type}' /tmp/msgs.json | head -5
wc -l /tmp/msgs.json

# (c) Bulk export across pages — let the CLI stream and write the file for you:
truto export conversations -a $ACCOUNT -o ndjson --out conversations.ndjson
```

Default to **redirect-to-file or `-o ndjson`** for any data-plane command whose result might exceed a screen.

### 2. Default `-o table` silently truncates

`table` is for humans. It will quietly chop IDs, URLs, JSON/HTML bodies, and webhook payloads to fit the terminal width — without any indicator that the value continues. Never script against `table` output. For an LLM workflow, **always** pass `-o json` or `-o ndjson` (and apply the streaming fix above).

### 3. `wc -l` / `head -n` on un-redirected `-o json` is meaningless

Counting lines on a pretty-printed JSON document tells you about whitespace, not records. If you need a count, either:

```bash
truto proxy conversations -a $ACCOUNT -o ndjson | wc -l                   # one object per line
# or
truto proxy conversations -a $ACCOUNT -o json > /tmp/x.json && jq 'length' /tmp/x.json
```

## Failure modes and how to recover

### Proxy 404 → "Did you mean…?"

When `truto proxy` 404s, the CLI silently re-runs capabilities for the account and adds one of these hints to the error:

- **Resource near-match found:** `Resource \`contac is not exposed on this account. Did you mean: contacts, companies?`
- **Method near-match found:** `Method \`fetch is not implemented for contacts. Did you mean: get, list?`
- **Method exact-not-implemented:** `Method \`search is not implemented for contacts. Available: list, get, create, update, delete.`
- **Unknown resource, no near-match:** `Resource \`foo is not exposed on this account. Run truto capabilities  --type proxy to list available resources.`
- **Capabilities also failed (network/auth):** `Run \`truto capabilities  --type proxy to list available resources.`

Read the hint and act on it. Don't silently fall back to a different command.

### `--type unified` returns `"proxy": []`

Expected — the `--type` flag filters the response. To see proxy resources, drop the flag (`--type all` is the default) or pass `--type proxy`.

### `--methods list` returns `No results found.` in table mode

Two possible causes:

1. **Default `--has-description` filter excluded everything.** Re-run with `--no-has-description` to include proxy methods that lack documentation (the integration may not have descriptions yet — visible in `ai_readiness.proxy_methods_with_descriptions`).
2. **Table renderer mismatch.** Some CLI versions render zero rows for capabilities even when JSON has data. Always use `-o json` for capabilities; trust the JSON shape over the table.

### Unified call works but returns weird-shaped data

Check `unified[].env_overridden` for that resource. If `true`, this environment has a custom mapping that may differ from the base. Inspect it with:

```bash
truto env-unified-models list -o json
truto env-unified-model-mappings list --env_unified_model_id <id> -o json
```

To iterate on JSONata locally without making real API calls, use [`truto jsonata eval`](data-plane.md#evaluate-jsonata-locally-truto-jsonata-eval) for any expression + context, or [`truto unified test-mapping`](data-plane.md#iterate-on-a-mapping-locally-truto-unified-test-mapping) for `response_mapping` only.

### Account is blocked or expired

If `account.status` is anything other than `active`, or `account.is_blocked` is `true`:

```bash
truto accounts refresh-credentials $ACCOUNT
```

If that doesn't work, the user needs to reconnect through Truto Link.

## `jq` recipes against capabilities

```bash
ACCOUNT=<uuid>

# Just the proxy resource names
truto capabilities $ACCOUNT -o json | jq -r '.proxy[].resource'

# proxy resource → comma-separated list of methods
truto capabilities $ACCOUNT -o json | jq -r '.proxy[] | "\(.resource): \(.methods | map(.method) | join(","))"'

# Just the unified routes (model/resource pairs)
truto capabilities $ACCOUNT -o json | jq -r '.unified[] | "\(.model)/\(.resource)"'

# Only proxy methods that take a body (i.e. mutating)
truto capabilities $ACCOUNT -o json | jq -r '.proxy[] | .resource as $r | .methods[] | select(.has_body_schema) | "\($r) -m \(.method)"'

# Auth fields the account uses (label and required-ness)
truto capabilities $ACCOUNT -o json | jq -r '.auth.fields[] | "\(.name)\t\(.label)\trequired=\(.required)"'

# Quick AI-readiness sanity check
truto capabilities $ACCOUNT -o json | jq '.ai_readiness'
```

These are designed to be the first commands an LLM agent runs after `accounts list` — they collapse the full capabilities payload to just the strings you need to construct the next command.

## `jq` recipes for finding the right account

`truto accounts list` (CLI ≥ 0.17.0) supports server-side filtering on `--tenant-id`, `--is-sandbox`, `--integration-name` (alias `--integration.name`), `--status`, `--features-super-query` (alias `--features.super_query`), `--created-at`, and `--updated-at` — see [the API docs](https://truto.one/docs/api-reference/admin/integrated-accounts/list.md). **Always use these flags first**; only fall back to client-side `jq` filtering when you need shaping that the API can't express (group-by, fall-back labels, custom output columns), or when you're on an older CLI build that only exposes `--tenant-id` / `--is-sandbox`.

> **Heads up:** `--profile` does **not** scope the listing — it only swaps the API token + URL. To narrow by integration you must pass `--integration-name`.

**Server-side first (preferred):**

```bash
# All Front accounts (server filters; small payload)
truto accounts list --integration-name front -o json > /tmp/accs.json

# Only active accounts for a given integration
truto accounts list --integration-name hubspot --status active -o json > /tmp/accs.json

# Accounts that need re-auth across the env
truto accounts list --status needs_reauth -o json > /tmp/accs.json

# SuperQuery accounts in the wnam region, created after 2024-01-01
truto accounts list --features-super-query wnam --created-at 2024-01-01T00:00:00Z -o json > /tmp/accs.json
```

**Client-side `jq` shaping** (for output that the server filters can't return):

```bash
# Snapshot the env's accounts once
truto accounts list --limit 100 -o json > /tmp/accs.json

# Disambiguate when labels are blank — fall back to tenant_id, environment_integration_id, or context fields
jq '.[] | select(.integration.name=="front") | {id, tenant_id, env_int: .environment_integration_id, ctx_email: .context.email, created_at}' /tmp/accs.json

# Group by integration + count
jq -r 'group_by(.integration.name)[] | "\(.[0].integration.name)\t\(length)"' /tmp/accs.json

# Anything not active — useful health check across the whole env
jq '.[] | select(.status != "active") | {id, integration: .integration.name, status, last_error}' /tmp/accs.json
```

Manual pagination loop when the env has more than 100 accounts (after applying server filters). The CLI prints `Next page: --next-cursor <cursor>` to stderr after every list call:

```bash
> /tmp/accs.ndjson
CURSOR=""
while :; do
  if [ -z "$CURSOR" ]; then
    truto accounts list --integration-name hubspot --limit 100 -o json > /tmp/page.json 2>/tmp/page.err
  else
    truto accounts list --integration-name hubspot --limit 100 --next-cursor "$CURSOR" -o json > /tmp/page.json 2>/tmp/page.err
  fi
  jq -c '.[]' /tmp/page.json >> /tmp/accs.ndjson
  # Extract the cursor from the "Next page: --next-cursor <cursor>" line on stderr
  CURSOR=$(grep -oE -- '--next-cursor [^ ]+' /tmp/page.err | head -1 | awk '{print $2}')
  [ -z "$CURSOR" ] && break
done
jq -s '.' /tmp/accs.ndjson > /tmp/accs.json   # collapse back to a single JSON array if you want
```

## End-to-end worked examples

### Bigcommerce account — list products via unified API

```bash
ACCOUNT=121aba7d-b4d4-4eb0-9654-2c784db5fc1f

# Discover
truto capabilities $ACCOUNT -o json | jq '.unified[] | select(.resource == "products")'
# → { model: "ecommerce", resource: "products", methods: ["get","list"], ... }

# Call with arguments copied straight out
truto unified ecommerce products -a $ACCOUNT -o json
truto unified ecommerce products PRODUCT_ID -m get -a $ACCOUNT -o json
```

### HubSpot account — list contacts via proxy API

```bash
ACCOUNT=757a9621-9416-4537-92a0-5032db55dc27

# Discover proxy resources only
truto capabilities $ACCOUNT --type proxy -o json | jq -r '.proxy[].resource'
# contacts
# companies
# deals
# ...

# Call
truto proxy contacts -a $ACCOUNT -o json
truto proxy contacts CONTACT_ID -m get -a $ACCOUNT -o json
truto proxy contacts -m create -a $ACCOUNT -b '{"properties":{"firstname":"Jane","email":"jane@example.com"}}' -o json
```

### "What does this integration support before I connect anything?"

```bash
truto capabilities salesforce -o json | jq '{ unified: [.unified[].resource], proxy: [.proxy[].resource] }'
```