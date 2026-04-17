# Sync Jobs

A **sync job** is a declarative pipeline that pulls data from one or more integrated accounts and writes it to one or more destinations (webhook URLs, datastores like S3 / GCS / Qdrant / MongoDB, or SuperQuery tables). A sync job is defined once and executed many times — each execution is a **sync job run**.

> **This reference covers V4 (`default_runtime_version: 4`) only.** V4 is the current runtime and is what you should use for any new sync job. Older runtimes (V1–V3) have a different, weaker resource model and are not documented here.

---

## When to Use a Sync Job

| Use case | Use a sync job? | Notes |
|----------|-----------------|-------|
| One-off API call from your backend | No | Just call `/unified/...` or `/proxy/...` directly |
| Streaming many records to your webhook / warehouse on a schedule | **Yes** | Sync jobs handle pagination, retries, large payloads, and durable state |
| Incremental sync (only fetch what changed since last run) | **Yes** | Use `state_key` + `get_state` / `update_state` |
| Fetching a deeply nested resource (e.g. all messages in all channels) | **Yes** | Use `loop_on` + dependency edges |
| Fanning out the same data to multiple destinations (webhook + S3) | **Yes** | Multiple `destination` nodes with shared `resources_to_persist` |
| Heavy data transformation (parquet, embeddings, joins) | **Yes** | `transform` nodes run JSONata with rich helpers |

---

## Sync Jobs CRUD

### Endpoints

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/sync-job` | List sync jobs |
| `GET` | `/sync-job/:id` | Get a sync job |
| `POST` | `/sync-job` | Create a sync job |
| `PATCH` | `/sync-job/:id` | Update a sync job |
| `DELETE` | `/sync-job/:id` | Delete a sync job |

### Create a Sync Job

```bash
curl -X POST https://api.truto.one/sync-job \
  -H "Authorization: Bearer $TRUTO_API_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "label": "Sync GitHub Repos",
    "integration_name": "github",
    "default_runtime_version": 4,
    "args_schema": {
      "integrated_account_id": { "type": "string", "format": "integrated_account_id", "required": true },
      "webhook_id":            { "type": "string", "format": "webhook_id", "required": true }
    },
    "mutex_key": "{{args.integrated_account_id}}",
    "state_key": "{{args.integrated_account_id}}",
    "resources": [ /* DAG of nodes — see below */ ]
  }'
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `label` | string | No | Human-readable label (default: `"Untitled"`) |
| `integration_name` | string | No | Integration this sync job is associated with. Leave empty (`""`) for multi-integration jobs that take the integrated account from `args` |
| `default_runtime_version` | number | No | **Set to `4`.** Defaults to `2` for legacy reasons — always set explicitly |
| `args_schema` | object | No | JSON-Schema-like definition of `args` (see [Args Schema](#args-schema)) |
| `args_validation` | string | No | JSONata expression evaluated against `args` to gate the run (see [Args Validation](#args-validation)) |
| `mutex_key` | string \| null | No | Placeholder-templated key. Two runs with the same `mutex_key` cannot execute concurrently |
| `state_key` | string \| null | No | Placeholder-templated key. Namespaces the persistent state used by `get_state` / `update_state` / `delete_state` |
| `resources` | array | No | The pipeline DAG (see [Designing the Resource Graph](#designing-the-resource-graph)) |

> With an API token, `environment_id` is auto-set from the token's environment.

### Response shape

`GET /sync-job/:id` returns the row directly:

```json
{
  "id": "11aa...",
  "label": "Sync GitHub Repos",
  "integration_name": "github",
  "environment_id": "9c2e...",
  "default_runtime_version": 4,
  "args_schema": { /* ... */ },
  "args_validation": null,
  "mutex_key": "{{args.integrated_account_id}}",
  "state_key": "{{args.integrated_account_id}}",
  "resources": [ /* nodes */ ],
  "created_at": "2026-04-01 10:00:00",
  "updated_at": "2026-04-01 10:00:00"
}
```

`GET /sync-job` uses the standard list envelope. `DELETE /sync-job/:id` returns `{ "id": "<sync_job_uuid>" }`.

---

## Designing the Resource Graph

`resources` is an **array of named nodes** that together form a directed acyclic graph (DAG). Edges are declared on each node via `depends_on`. The runtime computes the dependency graph, picks an execution order, and streams data between nodes.

Every node has these common fields:

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `name` | string | **Yes** | Unique within the job. Used as the dependency target and to address the node's output in templates |
| `type` | enum | **Yes** | One of `request`, `transform`, `spool`, `add_context`, `destination`, `event`, `get_state`, `update_state`, `delete_state` |
| `depends_on` | string | No | Name of an upstream node. Omit to make this a root node |
| `run_if` | string (JSONata) | No | If present, the node only executes when the expression returns truthy |
| `debug` | boolean | No | When `true`, the runtime emits the JSONata input/output for `transform` and `add_context` nodes to logs. Use sparingly |

### Templating: placeholders vs JSONata

V4 has **two** ways to compute values, and they behave differently:

- **`{{...}}` placeholders** ([@truto/replace-placeholders](https://www.npmjs.com/package/@truto/replace-placeholders)) — used in node fields like `resource.id`, `query.*`, `body.*`, `integrated_account_id`, `config.id`, `config.config.*`. They support type casts (`{{x:int}}`, `{{x:bool}}`, `{{x:json}}`, `{{x:str}}`, `{{x:any}}`), fallbacks (`{{a|b}}`), defaults (`{{a?:default}}`), and ignoring missing values (`{{x:undefined}}`).
- **JSONata expressions** — used in `transform.config.expression`, `add_context.config.expression`, `update_state.config.value_expression`, `args_validation`, `run_if`, and any field documented as "JSONata". Supports the full [JSONata](https://jsonata.org) language plus Truto's [`@truto/truto-jsonata`](https://www.npmjs.com/package/@truto/truto-jsonata) extensions (`$sortNodes`, `$teeStream`, `$jsonToParquet`, `$parseDocument`, `$generateEmbeddings*`, `$recursiveCharacterTextSplitter`, `$dtFromIso`, `$firstNonEmpty`, etc.).

You can also pass a JSONata expression directly to `request.query` by giving it as a **string** (instead of an object). The string is evaluated with the full context.

### What's in scope

When the runtime evaluates a placeholder or expression for a node, the following keys are available:

| Key | Where it comes from | Example |
|-----|---------------------|---------|
| `args.*` | The `args` object passed when creating the sync job run | `{{args.integrated_account_id}}` |
| `sync_job_run` | The current run row (status, started_at, finished_at, etc.) | `sync_job_run.started_at.toISOString()` |
| `tenant_id` | The integrated account's `tenant_id` (when the node is bound to one) | `{{tenant_id}}` |
| `<context fields>` | Anything in the integrated account's `context` (credentials, instance config, custom keys) | `{{instance_url}}`, `{{site_id}}` |
| `resources.<unified-model>.<resource>.<field>` | The output of upstream `request` nodes, addressed by the unified-API resource path | `{{resources.knowledge-base.pages.id}}` |
| `resources.<node-name>` | The output of `transform`, `spool`, `add_context`, and state nodes, addressed by node `name` | `resources.\`get-last-synced-at\`.value` |
| Anything from `add_context` | Each `add_context` node merges its output into the downstream context, so its keys become top-level | `{{last_synced_at}}`, `{{file_name}}` |
| `payload.records` | Inside `destination.config` — the records being written for this destination | `{{payload.records.0.content}}` |
| `total_records_size` | The cumulative records seen so far for the active request | Used inside transforms |

> Resource paths that contain `-` must be quoted in JSONata with backticks (`` `knowledge-base` ``). In `{{...}}` placeholders, write the path with dots: `{{resources.knowledge-base.pages.id}}`.

### Node types

#### `request` — fetch from a unified, proxy, or custom resource

```json
{
  "type": "request",
  "name": "list-repos",
  "resource": "repos",
  "method": "list",
  "integrated_account_id": "{{args.integrated_account_id}}",
  "query": {
    "organization": "{{args.organization:str}}",
    "privacy":      "{{args.privacy:str}}"
  }
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `resource` | string | **Yes** | Either a single segment (proxy/custom path, e.g. `repos`) or `<unified_model>/<resource>` (e.g. `crm/contacts`, `knowledge-base/page-content`). The `<unified_model>/...` form goes through the Unified API; a single-segment path goes through proxy/custom |
| `method` | string | **Yes** | The unified-API method: typically `list`, `get`, `create`, `update`, `delete`, plus integration-specific ones (`download`, `upload`, etc.) |
| `integrated_account_id` | string | **Yes** | Usually `"{{args.integrated_account_id}}"` so the run picks the right tenant. Multi-account jobs use multiple `args.*_integrated_account_id` placeholders |
| `id` | string | No | For `get`/`update`/`delete` methods, the record id. Often templated from a parent loop: `"{{drive_items.id}}"` |
| `query` | object \| string | No | Query parameters passed to the API. Strings are evaluated as JSONata; objects have each value evaluated as a placeholder |
| `body` | object \| string | No | Request body for `create`/`update`. Same rules as `query` |
| `loop_on` | string | No | A path into the upstream context. The request is executed **once per element** in the resolved array (see [Looping](#pattern-loop-on-parent-records)) |
| `recurse` | object | No | Re-runs the request as long as `recurse.if` is truthy, merging `recurse.config` (typically `query` updates) into the next call. Used for hierarchical fetches (page tree, folder tree) |
| `delete_tracking` | `"hard"` \| `"soft"` | No | When syncing to SuperQuery or a datastore, mark records that disappeared from the source as deleted (`soft`) or remove them (`hard`). Only valid for unified-API resources |
| `delete_tracking_query` | object | No | Restricts which existing rows participate in delete tracking |

The runtime auto-paginates `list` requests via the unified API's cursor protocol, then streams batches of records into downstream nodes.

#### `transform` — reshape data with JSONata

```json
{
  "type": "transform",
  "name": "remove-remote-data",
  "depends_on": "get-page-content",
  "config": {
    "expression": "resources.`knowledge-base`.`page-content`.$sift(function($v, $k) {$k != 'remote_data'})"
  }
}
```

The expression's input is the full context for the upstream request (see [What's in scope](#whats-in-scope)). Output replaces the upstream batch as the input for downstream nodes — return `null` or an empty value to drop the batch silently.

Use `transform` when you need to **reshape** records before they hit a destination (e.g. drop fields, build a Parquet blob, generate embeddings, re-key by something). Use `add_context` instead when you only need to **expose** a derived value to downstream nodes without changing the records.

#### `add_context` — expose computed values to downstream nodes

```json
{
  "type": "add_context",
  "name": "add-page-name",
  "depends_on": "list-pages",
  "config": {
    "expression": "{ \"page_id\": resources.`knowledge-base`.pages.id, \"page_title\": resources.`knowledge-base`.pages.title }"
  }
}
```

The object returned by the JSONata expression is merged into the downstream context. The keys become **top-level**, so downstream nodes can reference `{{page_id}}` or `{{page_title}}` directly. Records are not modified.

`add_context` is the canonical way to "carry forward" parent data when you `loop_on` children. Without it, the inner request loses access to the parent.

#### `spool` — wait until all batches arrive

```json
{ "name": "all-page-content", "type": "spool", "depends_on": "remove-remote-data" }
```

A `spool` node has no config. It is a **barrier**: it accumulates every batch produced by the upstream node (across all pages, recursion, and loop iterations) and emits a single combined batch downstream. Use this when a downstream `transform` needs to see *all* records at once — for example, to concatenate a whole Notion page tree:

```json
{
  "name": "combine-page-content",
  "type": "transform",
  "depends_on": "all-page-content",
  "config": {
    "expression": "$reduce($sortNodes(resources.`knowledge-base`.`page-content`, 'id', 'parent.id'), function($acc, $v) { $acc & $v.body.content }, '')"
  }
}
```

> Spooling holds records in Durable Object storage. Don't spool millions of records — favor batch-by-batch streaming with `destination.loop_on` instead.

#### `get_state` / `update_state` / `delete_state` — persistent run state

State is namespaced by the sync job's `state_key`. Each `(state_key, key)` pair is one durable cell.

```json
[
  {
    "type": "get_state",
    "name": "get-last-synced-at",
    "config": { "key": "last_synced_at", "default": "{{args.start_date}}" }
  },
  {
    "type": "add_context",
    "name": "add-last-synced-at",
    "depends_on": "get-last-synced-at",
    "config": {
      "expression": "{ \"last_synced_at\": resources.`get-last-synced-at`.value }"
    }
  },
  {
    "type": "update_state",
    "name": "update-last-synced-at",
    "depends_on": "on-complete",
    "config": {
      "key": "last_synced_at",
      "value_expression": "sync_job_run.status = 'completed' ? sync_job_run.started_at.toISOString()"
    }
  }
]
```

| Field | Where | Description |
|-------|-------|-------------|
| `config.key` | all three | Name of the state cell |
| `config.default` | `get_state` | Placeholder-templated fallback returned when the cell is unset |
| `config.value` | `update_state` | Static placeholder-templated value to write |
| `config.value_expression` | `update_state` | JSONata expression — wins over `value`. Returning `undefined` skips the write (use this to only update on success) |

Read state is exposed at `resources.<get-state-node-name>.value` and is typically promoted to the top of context via an `add_context` node so downstream `request.query` placeholders can reference it.

State is also reachable directly via the [`/sync-job-run-state`](#sync-job-run-state) HTTP API.

#### `event` — emit lifecycle hooks

```json
{ "name": "on-complete", "type": "event", "config": { "name": "complete" } }
```

`config.name` is one of `start`, `complete`, `error`. The `event` node fires at that lifecycle point and is most often used as a `depends_on` target for `update_state` (so state only advances when the run actually completed).

#### `destination` — write data out

There are three destination types. All share these common fields:

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `destination_type` | `"webhook"` \| `"datastore"` \| `"superquery"` | **Yes** | |
| `config.id` | string | **Yes** | The destination resource id (webhook id, datastore id, or SuperQuery destination id). Almost always templated from `args` |
| `resources_to_persist` | string[] | **Yes** | Names of upstream nodes whose output should be sent here. Multiple destinations can subscribe to overlapping sets |
| `run_if` | string (JSONata) | No | Skip this destination if false (e.g. only POST to a webhook when one was configured) |
| `loop_on` | string | No (datastore-only) | Iterate over an array in the records to issue one datastore call per element (used for object-storage uploads) |

##### Webhook destination

```json
{
  "name": "webhook",
  "type": "destination",
  "destination_type": "webhook",
  "config": { "id": "{{args.webhook_id}}" },
  "run_if": "$exists(args.webhook_id)",
  "resources_to_persist": ["list-repos", "list-pull-requests"]
}
```

The webhook receives a payload of `{ resource, records, meta, retryAfter? }`. Records persisted from a `transform` node show up under `payload.records` in the webhook handler.

##### Datastore destination

```json
{
  "name": "s3-zendesk-users-parquet",
  "type": "destination",
  "destination_type": "datastore",
  "method": "uploadObject",
  "loop_on": "payload.records",
  "run_if": "$exists(payload.records) and $type(payload.records) = \"array\" and $count(payload.records) > 0",
  "config": {
    "id": "{{args.s3_datastore_id}}",
    "config": {
      "path": "company_id={{args.company_id}}/ingest_dt={{payload.records.ingest_dt}}/ingest_hr={{payload.records.ingest_hr}}",
      "file_name": "{{payload.records.file_name}}",
      "content":   "{{payload.records.parquet:any}}",
      "headers":   { "Content-Type": "application/vnd.apache.parquet" }
    }
  },
  "resources_to_persist": ["users-to-parquet"]
}
```

| Field | Description |
|-------|-------------|
| `method` | The datastore method to call. For S3/GCS: `uploadObject`. For Qdrant: `upsertPoints`. For MongoDB: `insertMany`, `update`, `deleteMany`. The exact set depends on the datastore type |
| `config.id` | Datastore id (created via `/datastore`) |
| `config.config` | Method-specific arguments. Each value is placeholder-templated against the destination context (`args`, `payload`, all `add_context` keys, the integrated-account context fields) |

##### SuperQuery destination

```json
{
  "name": "superquery",
  "type": "destination",
  "destination_type": "superquery",
  "config": { "id": "{{args.superquery_destination_id}}" },
  "resources_to_persist": ["list-repos"]
}
```

Records from each persisted unified-API resource are written to one SuperQuery table per resource, keyed by `truto_sync_job_id`, `truto_integrated_account_id`, `truto_sync_job_run_id`, and `truto_synced_at`. Pair with `delete_tracking` on the upstream `request` to keep the table aligned with the source.

---

## Args Schema

`args_schema` declares the runtime arguments the job accepts. It is a flat object whose keys are arg names. Each value supports:

| Field | Type | Description |
|-------|------|-------------|
| `type` | string | `"string"`, `"number"`, `"boolean"`, etc. |
| `format` | string | One of the special Truto formats below, or any JSON-Schema format name |
| `required` | boolean | Whether the run must supply the value |
| `description` | string | Free-text description shown in the dashboard |

**Truto-specific `format` values** — these tell the dashboard to render the right picker and help the platform validate the arg:

| `format` | Meaning |
|----------|---------|
| `integrated_account_id` | A connected account uuid (renders an account picker scoped to the integration) |
| `webhook_id` | A webhook uuid |
| `datastore_id` | A datastore uuid |
| `date` | An ISO date |
| `updated_at` | An ISO timestamp used as an incremental cursor |

Example:

```json
{
  "args_schema": {
    "integrated_account_id": { "type": "string", "format": "integrated_account_id", "required": true },
    "webhook_id":            { "type": "string", "format": "webhook_id" },
    "s3_datastore_id":       { "type": "string", "format": "datastore_id", "required": true },
    "start_date":            { "type": "string", "format": "date", "required": true },
    "company_id":            { "type": "string", "required": true }
  }
}
```

## Args Validation

`args_validation` is a JSONata expression evaluated against `{ args }` before the run starts. It must return either `null` (or any falsy value) to proceed, or `{ "message": "..." }` to abort the run with that error.

```json
{
  "args_validation": "$firstNonEmpty(args.webhook_id, args.s3_datastore_id) ? null : { \"message\": \"Need one of webhook_id or s3_datastore_id\" }"
}
```

Use this to enforce conditional requirements that `args_schema` can't express (e.g. "exactly one of A or B must be set").

---

## `mutex_key` and `state_key`

Both fields are placeholder-templated strings (typically `"{{args.integrated_account_id}}"`).

- **`mutex_key`** — Two runs of the same sync job that resolve to the same `mutex_key` cannot run concurrently. The second run will wait. Use this to prevent two cron-triggered runs for the same tenant from racing each other when one takes longer than the cron interval.
- **`state_key`** — Namespaces the durable state used by `get_state` / `update_state` / `delete_state`. Setting it per-account isolates incremental cursors per tenant, which is almost always what you want.

If you don't set `state_key` but use state nodes, all runs share the same namespace — usually a bug.

---

## Common Patterns

### Pattern: incremental sync with `state_key`

```jsonc
{
  "label": "Sync Google Calendar events for all users",
  "default_runtime_version": 4,
  "mutex_key": "{{args.integrated_account_id}}",
  "state_key": "{{args.integrated_account_id}}",
  "args_schema": {
    "start_date":            { "type": "string", "format": "date", "required": true },
    "integrated_account_id": { "type": "string", "format": "integrated_account_id", "required": true },
    "webhook_id":            { "type": "string", "format": "webhook_id" }
  },
  "resources": [
    { "type": "get_state",   "name": "get-last-synced-at",
      "config": { "key": "last_synced_at", "default": "{{args.start_date}}" } },

    { "type": "add_context", "name": "add-last-synced-at", "depends_on": "get-last-synced-at",
      "config": { "expression": "{ \"last_synced_at\": resources.`get-last-synced-at`.value }" } },

    { "type": "request", "name": "list-events", "depends_on": "get-last-synced-at",
      "resource": "calendar/events", "method": "list",
      "integrated_account_id": "{{args.integrated_account_id}}",
      "query": { "updated_at": { "gt": "{{last_synced_at}}" } } },

    { "name": "webhook", "type": "destination", "destination_type": "webhook",
      "config": { "id": "{{args.webhook_id}}" },
      "run_if": "$exists(args.webhook_id)",
      "resources_to_persist": ["list-events"] },

    { "name": "on-complete", "type": "event", "config": { "name": "complete" } },

    { "type": "update_state", "name": "update-last-synced-at", "depends_on": "on-complete",
      "config": {
        "key": "last_synced_at",
        "value_expression": "sync_job_run.status = 'completed' ? $dtFromIso(sync_job_run.started_at.toISOString()).minus({ \"minutes\": 2 }).toUTC().toISO()"
      } }
  ]
}
```

Key points:
- `get_state` is a **root node** (no `depends_on`) so the cursor is read before any request fires.
- The cursor is exposed to placeholders via `add_context`, then used in `query.updated_at.gt`.
- The `update_state` node depends on the `on-complete` event, so state only advances on a successful run.
- Subtracting a few minutes (`.minus({ "minutes": 2 })`) gives an overlap window to avoid missing records updated mid-run.

### Pattern: `loop_on` parent records

To fetch a child resource for every parent record:

```json
[
  { "type": "request", "name": "list-zendesk-tickets",
    "resource": "ticketing/tickets", "method": "list",
    "integrated_account_id": "{{args.integrated_account_id}}" },

  { "type": "request", "name": "list-zendesk-comments",
    "resource": "ticketing/comments", "method": "list",
    "depends_on": "list-zendesk-tickets",
    "loop_on": "resources.ticketing.tickets",
    "query": { "ticket": { "id": "{{resources.ticketing.tickets.id}}" } },
    "integrated_account_id": "{{args.integrated_account_id}}" }
]
```

- `loop_on` is a path into context that resolves to an array; the request fires **once per element**.
- Inside the loop, `resources.ticketing.tickets` resolves to the **current parent record** (not the array).
- To carry parent fields through to a downstream destination, add an `add_context` node between parent and child that exposes them as top-level keys.

### Pattern: hierarchical recursion with `recurse`

For tree-shaped resources (page hierarchies, folder trees), `recurse` repeats the request until the condition is false:

```json
{
  "type": "request",
  "name": "page-content",
  "resource": "knowledge-base/page-content",
  "method": "list",
  "query": { "page": { "id": "{{args.page_id}}" } },
  "recurse": {
    "if": "{{resources.knowledge-base.page-content.has_children:bool}}",
    "config": {
      "query": { "page_content_id": "{{resources.knowledge-base.page-content.id}}" }
    }
  },
  "integrated_account_id": "{{args.notion_integrated_account_id}}"
}
```

Each iteration runs once per record produced by the previous iteration that satisfies `recurse.if`. The merged `recurse.config` overrides the original `query` for the recursive call.

### Pattern: spool then aggregate

When a downstream transform needs the full set (not per-batch), use `spool` as a barrier:

```json
[
  { "type": "request", "name": "page-content", "...": "..." },
  { "type": "transform", "name": "strip-remote-data", "depends_on": "page-content",
    "config": { "expression": "resources.`knowledge-base`.`page-content`.$sift(function($v, $k) { $k != 'remote_data' })" } },
  { "type": "spool", "name": "all-page-content", "depends_on": "strip-remote-data" },
  { "type": "transform", "name": "combine", "depends_on": "all-page-content",
    "config": { "expression": "$reduce($sortNodes(resources.`knowledge-base`.`page-content`, 'id', 'parent.id'), function($acc, $v) { $acc & $v.body.content }, '')" } }
]
```

### Pattern: multi-destination fanout with conditional branches

A single `request` can feed multiple destinations, each gated by `run_if`:

```json
[
  { "type": "request", "name": "list-pages", "...": "..." },
  { "type": "transform", "name": "to-parquet", "depends_on": "list-pages",
    "config": { "expression": "$jsonToParquet(resources.`knowledge-base`.pages)" } },

  { "name": "webhook", "type": "destination", "destination_type": "webhook",
    "config": { "id": "{{args.webhook_id}}" },
    "run_if": "$exists(args.webhook_id)",
    "resources_to_persist": ["list-pages"] },

  { "name": "s3", "type": "destination", "destination_type": "datastore", "method": "uploadObject",
    "config": {
      "id": "{{args.s3_datastore_id}}",
      "config": { "path": "tenants/{{tenant_id}}/pages", "file_name": "pages.parquet",
                  "content": "{{payload.records.0:any}}",
                  "headers": { "Content-Type": "application/vnd.apache.parquet" } }
    },
    "run_if": "$exists(args.s3_datastore_id)",
    "resources_to_persist": ["to-parquet"] }
]
```

The dashboard or a wrapping cron trigger only supplies `args.webhook_id` for accounts that should webhook, and `args.s3_datastore_id` for those that should land in S3 — the same job definition serves both.

---

## Authoring Checklist

Before saving a sync job, verify:

- [ ] `default_runtime_version: 4` is set explicitly.
- [ ] `args_schema` lists every `args.*` placeholder used anywhere in `resources`.
- [ ] Every node `name` is unique. Dashes are fine; quote them with backticks in JSONata (`` `my-node` ``).
- [ ] Every `depends_on` references an existing `name`. The graph has no cycles.
- [ ] `request.integrated_account_id` is set on every `request` node (often `"{{args.integrated_account_id}}"`).
- [ ] If using state nodes, `state_key` is set (almost always `"{{args.integrated_account_id}}"`).
- [ ] If running on a cron, `mutex_key` is set so overlapping runs are serialized.
- [ ] Every destination's `config.id` is templated from `args` (do not hard-code datastore or webhook ids).
- [ ] Each destination has at least one entry in `resources_to_persist`.
- [ ] Optional inputs are gated with `run_if` and the `args_schema` marks them `required: false`.
- [ ] `update_state` nodes depend on an `on-complete` `event` node so cursors don't advance on failed runs.
- [ ] Avoid `spool` for unbounded data — prefer streaming via `loop_on` on the destination.

---

## Sync Job Runs

A sync job run is a single execution of a sync job for a specific integrated account.

### Endpoints

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/sync-job-run` | List runs |
| `GET` | `/sync-job-run/:id` | Get a run |
| `POST` | `/sync-job-run` | Trigger a run |
| `PATCH` | `/sync-job-run/:id` | Update a run (e.g. set status) |
| `DELETE` | `/sync-job-run/:id` | Delete a run |

### Trigger a Sync Job Run

```bash
curl -X POST https://api.truto.one/sync-job-run \
  -H "Authorization: Bearer $TRUTO_API_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "sync_job_id":           "<sync_job_uuid>",
    "integrated_account_id": "<account_uuid>",
    "status": "created",
    "args": {
      "integrated_account_id": "<account_uuid>",
      "webhook_id":            "<webhook_uuid>",
      "start_date":            "2026-01-01"
    }
  }'
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `sync_job_id` | uuid | Yes | Sync job to run |
| `integrated_account_id` | uuid | Yes | Account to sync from (also typically passed inside `args`) |
| `status` | string | Yes | Initial status (typically `"created"`) |
| `args` | object | No | Runtime arguments — must satisfy `args_schema` and `args_validation` |
| `resources` | array | No | Override the sync job's `resources` for this one run (rarely used) |
| `super_query` | `"apac"` \| `"wnam"` | No | SuperQuery region for `superquery` destinations |
| `error_handling` | string | No | `fail_fast` (default), `ignore`, or `batch` |
| `ignore_previous_run` | boolean | No | Skip incremental sync logic — equivalent to wiping `state_key` for this run |
| `force` | boolean | No | Bypass the mutex |
| `events_to_send` | string[] | No | Restrict which webhook events fire |
| `datastore_id` | uuid | No | Override a datastore destination |
| `mutex_key` / `state_key` | string | No | Override the sync-job-level keys |

### Status Values

| Status | Description |
|--------|-------------|
| `created` | Run has been created, pending execution |
| `running` | Currently executing |
| `completed` | Finished successfully |
| `failed` | Failed with errors |
| `stopped` | Manually stopped |

### Webhook Events

Sync job runs emit webhook events:
- `sync_job_run:created` — When a run is created
- `sync_job_run:updated` — When a run status changes
- `sync_job_run:deleted` — When a run is deleted

---

## Sync Job Cron Triggers

Cron triggers schedule automatic execution on a recurring basis. Always pair them with `mutex_key` on the sync job to prevent overlapping runs.

### Endpoints

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/sync-job-cron-trigger` | List triggers |
| `GET` | `/sync-job-cron-trigger/:id` | Get a trigger |
| `POST` | `/sync-job-cron-trigger` | Create a trigger |
| `PATCH` | `/sync-job-cron-trigger/:id` | Update a trigger |
| `DELETE` | `/sync-job-cron-trigger/:id` | Delete a trigger |
| `POST` | `/sync-job-cron-trigger/:id/schedule` | Activate / reschedule the trigger |

### Create and schedule

```bash
curl -X POST https://api.truto.one/sync-job-cron-trigger \
  -H "Authorization: Bearer $TRUTO_API_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "sync_job_id":           "<sync_job_uuid>",
    "integrated_account_id": "<account_uuid>",
    "cron_expression": "0 */6 * * *",
    "args": { "integrated_account_id": "<account_uuid>", "webhook_id": "<wh_uuid>" }
  }'

curl -X POST https://api.truto.one/sync-job-cron-trigger/$TRIGGER_ID/schedule \
  -H "Authorization: Bearer $TRUTO_API_TOKEN"
```

Triggers are inactive until `/schedule` is called. Updating `cron_expression` requires re-calling `/schedule`.

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `sync_job_id` | uuid | Yes | Sync job to trigger |
| `integrated_account_id` | uuid | No | Account to sync (often required by the job's `args`) |
| `cron_expression` | string | Yes | Standard 5-field cron expression |
| `args` | object | No | Default `args` for runs created by this trigger |
| `super_query`, `error_handling`, `events_to_send`, `meta` | various | No | Same semantics as on `/sync-job-run` |

---

## Sync Job Templates

Templates are reusable sync job blueprints — useful when the same DAG should be installable across many environments or shared with other Truto teams.

### Endpoints

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/sync-job-template` | List templates |
| `GET` | `/sync-job-template/:id` | Get a template |
| `POST` | `/sync-job-template` | Create a template |
| `PATCH` | `/sync-job-template/:id` | Update a template |
| `DELETE` | `/sync-job-template/:id` | Delete a template |

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `label` | string | Yes | Template name |
| `default_runtime_version` | number | Yes | Set to `4` |
| `resources` | array | No | The DAG (same shape as on a sync job) |
| `integration_name` | string \| null | No | Target integration. Leave empty for multi-integration templates |
| `description` | string | No | Template description |
| `sharing` | `"deny"` \| `"ask"` \| `"allow"` | No | Cross-team sharing policy. Defaults to `deny` |
| `args_schema` | object | No | Same shape as on a sync job |
| `args_validation` | string | No | Same shape as on a sync job |

The Truto CLI exposes templates via `truto sync-job-templates list/get/create/update/delete` — handy when scaffolding a new job from a known-good example.

---

## Sync Job Run State

Persistent key-value state used by `get_state` / `update_state` / `delete_state`, namespaced by the sync job's `state_key`. Also reachable directly via HTTP for one-off inspection or seeding.

### Endpoints

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/sync-job-run-state?state_key={key}` | List state entries |
| `GET` | `/sync-job-run-state/:id?state_key={key}` | Get a state entry |
| `POST` | `/sync-job-run-state?state_key={key}` | Create / update a state entry |
| `PATCH` | `/sync-job-run-state/:id?state_key={key}` | Update a state entry |
| `DELETE` | `/sync-job-run-state/:id?state_key={key}` | Delete a state entry |

The `state_key` query parameter is **required** on all operations — it acts as the namespace.

### Create / update state

```bash
curl -X POST "https://api.truto.one/sync-job-run-state?state_key=<integrated_account_id>" \
  -H "Authorization: Bearer $TRUTO_API_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{ "key": "last_synced_at", "value": "2026-01-15T00:00:00Z" }'
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `key` | string | Yes | State entry key — matches `config.key` in `get_state` / `update_state` nodes |
| `value` | any | Yes | State value (any JSON-serializable value) |

Common admin-time uses:
- Seeding a starting cursor before the first run.
- Forcing a full re-sync by `DELETE`-ing the cursor (or by passing `ignore_previous_run: true` on the run).
- Inspecting where a cron-driven incremental sync currently sits.
