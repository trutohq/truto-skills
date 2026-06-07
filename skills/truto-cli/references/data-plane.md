# Data-Plane Commands

These commands access third-party data through integrated accounts. All require `-a, --account <id>` (integrated account ID).

## Step 0: Discover capabilities first

**Before running any command on this page, run capabilities for the target account.** It tells you which resources and methods this integration actually exposes — every argument you'll pass below should be copied out of its response. Skipping this step is the #1 cause of `404` errors and hallucinated commands.

```bash
ACCOUNT=<integrated-account-uuid>

# What can THIS account do? (proxy + unified + auth + AI readiness in one call)
truto capabilities $ACCOUNT -o json

# Filter the surface to just what you need
truto capabilities $ACCOUNT --type unified -o json
truto capabilities $ACCOUNT --type proxy   --resource contacts -o json
```

The auto-detection rule: anything matching a v4 UUID is treated as an integrated account; anything else (e.g. `hubspot`, `salesforce`) is treated as an integration slug. Pass `--target integration` or `--target account` to force.

For the full capabilities reference, response shape, copyable templates per method, and failure modes (including the proxy 404 → "Did you mean…?" hint), see [references/querying-data.md](querying-data.md).

## Unified API (`truto unified`)

Access normalized resources across integrations using unified model schemas. Provides consistent field names regardless of which integration is connected (e.g., HubSpot, Salesforce, and Pipedrive all use the same `crm/contacts` schema).

```bash
truto unified <model> <resource> [id] -a <account-id> [options]
```

### Where do I get the arguments?

From `[truto capabilities <account-id> -o json](#step-0-discover-capabilities-first)`:


| CLI position  | Capabilities field                                                                                 |
| ------------- | -------------------------------------------------------------------------------------------------- |
| `<model>`     | `unified[].model` (e.g. `crm`, `ats`, `ecommerce`)                                                 |
| `<resource>`  | `unified[].resource` (e.g. `contacts`, `products`)                                                 |
| `-m <method>` | One of `unified[].methods[]` (typically `list`/`get`, sometimes `create`/`update`/`delete`/custom) |


If `unified[].env_overridden` is `true` for that resource, the environment has customized the mapping — behavior may differ from the base.

### Arguments


| Argument     | Required              | Description                                                                 |
| ------------ | --------------------- | --------------------------------------------------------------------------- |
| `<model>`    | Yes                   | Unified model name (e.g., `crm`, `ats`, `hris`)                             |
| `<resource>` | Yes                   | Resource name (e.g., `contacts`, `candidates`, `employees`)                 |
| `[id]`       | For get/update/delete | Resource ID — **positional**, not a flag. There is no `-d` / `--id` option. |


### Options


| Flag                    | Description                                                        | Default      |
| ----------------------- | ------------------------------------------------------------------ | ------------ |
| `-a, --account <id>`    | Integrated account ID                                              | **Required** |
| `-m, --method <method>` | `list`, `get`, `create`, `update`, `delete`, or custom method name | `list`       |
| `-b, --body <json>`     | Request body (JSON)                                                | —            |
| `--stdin`               | Read request body from stdin                                       | —            |
| `-q, --query <params>`  | Query params as `key=value,key2=value2`                            | —            |


### Examples

```bash
# List contacts from a CRM
truto unified crm contacts -a <account-id>

# Get a specific contact — ID is the third positional argument (after model + resource)
truto unified crm contacts <contact-id> -m get -a <account-id>

# Create a contact — no ID positional
truto unified crm contacts -m create -a <account-id> -b '{"first_name":"Jane","last_name":"Doe"}'

# Update a contact — ID positional, body required
truto unified crm contacts <id> -m update -a <account-id> -b '{"last_name":"Smith"}'

# Delete a contact — ID positional, no body
truto unified crm contacts <id> -m delete -a <account-id>

# Custom method (e.g., search) — no ID, method becomes a path segment
truto unified crm contacts -m search -a <account-id> -b '{"query":"Jane"}'

# With query parameters
truto unified crm contacts -a <account-id> -q "limit=10,status=active"

# Read body from stdin
echo '{"first_name":"Test"}' | truto unified crm contacts -m create -a <account-id> --stdin
```

> **Common LLM mistake:** passing the resource ID as `-d <id>` because it feels like "the thing I'm getting." There is no `-d` flag. The ID is **always** positional: `truto unified crm contacts crd_xxx -m get -a $ACCOUNT`. Misusing `-d` returns `error: unknown option '-d'`.

### How Methods Map to HTTP


| Method                  | HTTP   | Path                                   |
| ----------------------- | ------ | -------------------------------------- |
| `list`                  | GET    | `/unified/<model>/<resource>`          |
| `get`                   | GET    | `/unified/<model>/<resource>/<id>`     |
| `create`                | POST   | `/unified/<model>/<resource>`          |
| `update`                | PATCH  | `/unified/<model>/<resource>/<id>`     |
| `delete`                | DELETE | `/unified/<model>/<resource>/<id>`     |
| Custom (e.g., `search`) | POST   | `/unified/<model>/<resource>/<method>` |


### Pagination

Next cursor is printed to stderr when more pages exist. Pass it via query params:

```bash
truto unified crm contacts -a <id> -q "next_cursor=abc123"
```

### Evaluate JSONata Locally (`truto jsonata eval`)

Evaluate **any** Truto JSONata expression against a JSON context you provide — no API token, no integrated account, no third-party HTTP call. Uses `@truto/truto-jsonata` (same runtime as production).

```bash
truto jsonata eval --expression <jsonata> [options]
truto jsonata eval --expression-file mapping.jsonata [options]
```

**Expression source (one required):**


| Flag                      | Description                                   |
| ------------------------- | --------------------------------------------- |
| `--expression <jsonata>`  | Inline JSONata expression                     |
| `--expression-file <file>` | Path to a file containing the JSONata expression |


**Context input (one required):**


| Flag               | Description                                                                 |
| ------------------ | --------------------------------------------------------------------------- |
| `--input <file>`   | JSON file — top-level keys become bindings (`response`, `error`, `query`, …) |
| `--context <file>` | Alias for `--input`                                                         |
| `--stdin`          | Pipe the context JSON on stdin                                              |


#### Examples

```bash
truto jsonata eval \
  --expression 'response.{"id": Id, "name": Name}' \
  --input ./context-with-response-key.json

truto jsonata eval \
  --expression '{ "status": 404, "message": error.message }' \
  --context ./error-context.json

cat context.json | truto jsonata eval --expression-file ./draft.jsonata --stdin
```

#### When to use vs. `unified test-mapping`

| Use `jsonata eval` | Use `unified test-mapping` |
| ------------------ | -------------------------- |
| `query_mapping`, `error_mapping`, sync `transform`, any custom context | `response_mapping` only |
| You build the full context JSON (all bindings) | `--input` is the raw upstream body (CLI sets `response:`) |
| Drafting before anything is on the platform | Fetch mapping from platform (`--model`, `--resource`, `--integration`) |

**Agents:** prefer `truto jsonata eval` over ad-hoc Node/`trutoJsonata` scripts.

---

### Iterate on a Mapping Locally (`truto unified test-mapping`)

Evaluate a JSONata `response_mapping` against a local sample raw response — no third-party HTTP call. Use this to iterate on a mapping before publishing it via `unified-model-mappings` / `env-unified-model-mappings`.

```bash
truto unified test-mapping --mapping <jsonata> [options]
truto unified test-mapping --mapping-file mapping.jsonata [options]
truto unified test-mapping --model <m> --resource <r> --integration <i> [options]
```

**Mapping source (one required):**


| Flag                                           | Description                                                  |
| ---------------------------------------------- | ------------------------------------------------------------ |
| `--mapping <jsonata>`                          | Inline JSONata expression                                    |
| `--mapping-file <file>`                        | Path to a file containing the JSONata mapping                |
| `--model <m> --resource <r> --integration <i>` | Fetch the base mapping from `unified-model-resource-method`  |
| `--method <m>`                                 | Method name when fetching from the platform (default `list`) |
| `--with-overrides <env-unified-model-id>`      | Also overlay environment-specific overrides on the base      |


**Sample input (one required):**


| Flag             | Description                              |
| ---------------- | ---------------------------------------- |
| `--input <file>` | JSON file with the raw upstream response |
| `--stdin`        | Pipe the raw response on stdin           |


**Other options:**


| Flag                   | Description                                                                                         |
| ---------------------- | --------------------------------------------------------------------------------------------------- |
| `-q, --query <params>` | Query params (`key=value,key2=value2`) — exposed in the mapping context as `$query` and `$rawQuery` |
| `--show-mapping`       | Print the resolved JSONata mapping to stderr before evaluating                                      |


#### Examples

```bash
truto unified test-mapping \
  --mapping '$.records ~> |$|{ "id": Id, "name": Name }|' \
  --input ./sample-salesforce-response.json

cat sample-hubspot-response.json | truto unified test-mapping \
  --mapping-file ./mapping.jsonata --stdin

truto unified test-mapping \
  --model crm --resource contacts --integration salesforce --method list \
  --input ./sample.json --show-mapping

truto unified test-mapping \
  --model crm --resource contacts --integration hubspot \
  --with-overrides <env-unified-model-id> \
  --input ./sample.json
```

#### Limitations

- Evaluates **JSONata-string** mappings only. Operator-style (object) mappings are printed for inspection but not executed locally; their merge semantics live on the platform.
- The mapping context is `{ response, query, rawQuery, context: {}, headers: {}, body: {} }`. To exercise mappings that read `$context` or `$headers`, run them on the platform.

---

## Proxy API (`truto proxy`)

Access raw integration resources without schema normalization. Returns the integration's native field names and data structures.

```bash
truto proxy <resource> [id] -a <account-id> [options]
```

Same flags as `unified` (`-m`, `-b`, `--stdin`, `-q`), but **no model argument** — proxy hits the integration's native resource names directly.

### Where do I get the arguments?

From `[truto capabilities <account-id> -o json](#step-0-discover-capabilities-first)`:


| CLI position            | Capabilities field                                                                                                                      |
| ----------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| `<resource>`            | `proxy[].resource` (e.g. `products`, `contacts`, `incidents`)                                                                           |
| `-m <method>`           | One of `proxy[].methods[].method` (`list` / `get` / `create` / `update` / `delete` / any custom name)                                   |
| Body required?          | `proxy[].methods[].has_body_schema` — if `true`, pass `-b` or `--stdin`                                                                 |
| Query schema available? | `proxy[].methods[].has_query_schema` — if `true`, drill into `truto accounts tools <id>` for the JSON Schema describing valid `-q` keys |
| Response schema available? | `proxy[].methods[].has_response_schema` — if `true`, `truto accounts tools <id>` includes `response_schema` for the method output shape |


### 404 → "Did you mean…?" auto-hint

When a proxy call returns 404, the CLI automatically re-runs capabilities for the account and appends a hint to the error before exiting. There are five outcomes — read the hint and act on it instead of guessing:


| Hint                                                                                                            | Meaning                                                                    |
| --------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| `Resource \`X is not exposed on this account. Did you mean: a, b, c?`                                           | Near-match resources found. Try the suggestion.                            |
| `Resource \`X is not exposed on this account. Run truto capabilities --type proxy to list available resources.` | No near-match. Pull the full proxy resource list.                          |
| `Method \`X is not implemented for . Did you mean: a, b?`                                                       | Resource exists, near-match methods found. Try the suggestion.             |
| `Method \`X is not implemented for . Available: list, get, create, update, delete.`                             | Resource exists, but the specific method does not. Pick from `Available:`. |
| `Run \`truto capabilities --type proxy to list available resources.`                                            | Capabilities call also failed (network/auth). Run it manually first.       |


This safety net is on by default. It runs against the same `/integrated-account/<id>/capabilities` endpoint, so it adds one HTTP round-trip per 404 — but it eliminates almost all blind retries.

### Examples

> The resource ID is the **second positional argument** (right after `<resource>`), not a flag. `-d` / `--id` do not exist. Trying `truto proxy contacts -a $ACCOUNT -m get -d crd_xxx` returns `error: unknown option '-d'`.

```bash
# List raw tickets — no ID
truto proxy tickets -a <account-id>

# Get a specific ticket — ID positional
truto proxy tickets T-42 -m get -a <account-id>

# Get with a non-UUID ID (works for any string ID, e.g. Front-style alt-refs):
truto proxy conversations 'alt:ref:imported@frontapp.com_t:50603' -a <account-id> -m get

# Create — no ID
truto proxy tickets -m create -a <account-id> -b '{"subject":"Bug report","priority":"high"}'

# Update — ID positional, body required
truto proxy tags tag_6bvf34 -a <account-id> -m update -b '{"name":"renamed"}'

# Delete — ID positional, no body
truto proxy conversations cnv_1mknzqn4 -a <account-id> -m delete

# Custom method (sends POST /proxy/tickets/custom-action) — no ID
truto proxy tickets -m custom-action -a <account-id> -b '{"key":"value"}'

# With query parameters
truto proxy tickets -a <account-id> -q "status=open,assignee=me"
```

### How Methods Map to HTTP

Same as unified, but paths are `/proxy/<resource>/...` instead of `/unified/<model>/<resource>/...`.

Custom method names become path segments: `-m custom-action` sends POST to `/proxy/<resource>/custom-action`.

---

## Custom API (`truto custom`)

Call user-defined custom API endpoints or arbitrary HTTP paths on the integration's API using the account's credentials.

```bash
truto custom <path> -a <account-id> [options]
```

### Options


| Flag                     | Description                               | Default      |
| ------------------------ | ----------------------------------------- | ------------ |
| `-a, --account <id>`     | Integrated account ID                     | **Required** |
| `-m, --method <method>`  | HTTP method                               | `GET`        |
| `-b, --body <json>`      | Request body (JSON)                       | —            |
| `--stdin`                | Read body from stdin                      | —            |
| `-q, --query <params>`   | Query params                              | —            |
| `-H, --header <headers>` | Custom headers as `key=value,key2=value2` | —            |


### Examples

```bash
truto custom /my-endpoint -a <account-id>
truto custom /my-endpoint -m POST -a <account-id> -b '{"key":"value"}'
truto custom /my-endpoint -a <account-id> -q "foo=bar"
truto custom /my-endpoint -a <account-id> -H "X-Custom-Header=value"
echo '{"data":true}' | truto custom /my-endpoint -m POST -a <account-id> --stdin
```

Default output format is `json` (not `table`).

---

## Batch (`truto batch`)

Execute multiple resource operations in a single request.

```bash
truto batch [file] [-b <json>] [--stdin]
```

### Examples

```bash
# From a file
truto batch requests.json

# Inline
truto batch -b '{"integrated_account_id":"<account-id>","resources":[{"resource":"contacts","method":"list"},{"resource":"companies","method":"list"}]}'

# From stdin
cat batch.json | truto batch --stdin
```

### Body Format

The batch body requires:

- `integrated_account_id` — the account to execute against
- `resources` — array of operations

Each resource entry:

```json
{
  "resource": "contacts",
  "method": "list",
  "query": {},
  "body": {},
  "id": "optional-resource-id",
  "persist": true
}
```

For proxy resources, set `persist: true` to include results in the response.

---

## When to Use Which


| Command   | Use when...                                                                                       |
| --------- | ------------------------------------------------------------------------------------------------- |
| `unified` | You want consistent field names across integrations (e.g., all CRMs use the same contacts schema) |
| `proxy`   | You need integration-specific fields not in the unified schema                                    |
| `custom`  | You need arbitrary API paths the integration exposes but aren't mapped as resources               |
| `batch`   | You need multiple operations in a single request                                                  |


