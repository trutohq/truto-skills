# Where JSONata Is Used in Truto Config

The unique-to-Truto part. The upstream `truto-jsonata` README documents the *functions*; this file documents *where in your Truto config those functions get evaluated* and *what's in scope* when they do.

JSONata expressions appear in eight customer-facing surfaces, all editable via the public Truto API:

1. **Unified API mapping overrides** (the heaviest user) — change how an integration's data is shaped into a unified model in your environment
2. **Custom unified models** — define your own unified models and their per-integration mappings
3. **Per-integrated-account mapping overrides** — override mappings for a single connected account
4. **Environment integration overrides** — auth header expressions, dynamic pagination, rate-limit detection, webhook verification/transform
5. **Sync Job V4 templates** — `transform`, `add_context`, `update_state`, `run_if`, `args_validation`, dynamic `request.query` / `request.body`
6. **Workflows** — workflow-level `run_if`, step-level `run_if`, dynamic step `config`
7. **Daemon Jobs** — `args_validation`
8. **Integration Scheduled Actions** — `run_if`

Each surface gets a different evaluation context (i.e. which top-level variables your expression can reference). The contexts are documented inline per section below.

---

## Quick reference: which fields use JSONata

| Surface | Field | Scope (top-level bindings) |
|---|---|---|
| Unified mapping override | `config.response_mapping` (string) | `response`, `query`, `rawQuery`, `context`, `headers`, `body` |
| Unified mapping override | `config.query_mapping` (string) | `query`, `body`, `context`, `before`, `id` |
| Unified mapping override | `config.request_body_mapping` (string) | `body`, `context`, `query`, `rawQuery`, `before`, `id` |
| Unified mapping override | `config.request_header_mapping` (string) | `headers`, `body`, `query`, `rawQuery`, `context`, `requestBody` |
| Unified mapping override | `config.response_header_mapping` (string) | `headers`, `body`, `query`, `rawQuery`, `context`, `response` |
| Unified mapping override | `config.path_mapping` (string) | `headers`, `body`, `query`, `rawQuery`, `context`, `before`, `id` |
| Unified mapping override | `config.error_mapping` (string) | `headers`, `error`, `body`, `query`, `rawQuery`, `context`, `before`, `id` |
| Unified mapping override | `config.resource.expression` / `config.method.expression` | `query`, `rawQuery`, `body`, `context` |
| Unified mapping override | `config.is_partial_expression` | `data`, `query`, `rawQuery`, `before`, `id`, `requestBody`, `rawBody` |
| Unified mapping override | `config.before[].run_if` / `config.after[].run_if` (and `config` when string) | `id`, `query`, `body`, `context`, `data`, `step` |
| Unified mapping override | `config.side_load.*.response_mapping` | per-item: `response`, `query`, `rawQuery`, `body` |
| Per-account override | `unified_model_override.<model>.<resource>.<method>.<mapping>` | Same as the corresponding mapping field above |
| Env integration override | `override.error_expression` (and per-method `error_expression`) | `response`, `headers`, `status`, `data` |
| Env integration override | `override.authorization.config.expression` (when `format: 'header'`) | `url`, `requestOptions`, `context` |
| Env integration override | `override.pagination.config.*_expression` (when `format: 'dynamic'`) | `query`, `url`, `requestOptions` (+ `response`, `body`, `paginationValues` for cursor) |
| Env integration override | `override.rate_limit.is_rate_limited` / `retry_after_header_expression` / `rate_limit_header_expression` | `headers`, `status` |
| Env integration override | `override.webhook.handle_verification` / `payload_transform` | inbound webhook payload as root |
| Env unified model | `override.webhooks.<integration>` | inbound webhook payload as root |
| Sync Job V4 — `transform` node | `config.expression` | `args.*`, `sync_job_run`, `tenant_id`, integrated account context fields, `resources.*`, keys merged in by upstream `add_context` nodes |
| Sync Job V4 — `add_context` node | `config.expression` | Same as `transform` — returned object's keys become top-level downstream |
| Sync Job V4 — `update_state` node | `config.value_expression` | Same as `transform`. Returning `undefined` skips the write |
| Sync Job V4 — `request` node | `query` / `body` (when string) | Same as `transform` |
| Sync Job V4 — any node | `run_if` | Same as `transform` |
| Sync Job V4 — destination | `config.expression` | Same as `transform`, plus `payload.records` |
| Sync Job V4 — job-level | `args_validation` | `{ args }`. Return `null` to proceed; `{ "message": "..." }` to abort |
| Workflow — workflow-level | `run_if` | `event`, `environment_id`, `tenant_id` |
| Workflow — step-level | `run_if`, `config` (when string) | Same as workflow-level, plus output of prior steps |
| Daemon Job — job-level | `args_validation` | `{ args }`, same semantics as sync job `args_validation` |
| Scheduled Action | `run_if` | The integrated account's context object — context fields referenced bare (`plan_type`, not `context.plan_type`) |

> Truto config also has `{{...}}` placeholder syntax in many sync-job and workflow fields. Placeholders are **not** JSONata — they're a separate templating language ([@truto/replace-placeholders](https://www.npmjs.com/package/@truto/replace-placeholders)) and the `$` functions in this skill don't apply there. See the [Sync Jobs reference](../../truto/references/sync-jobs.md#templating-placeholders-vs-jsonata) for the distinction.

---

## 1. Unified API mapping overrides — the main JSONata surface

When a unified API call is made for an integration, Truto looks up the `(integration_name, resource_name, method_name)` row in two tables and **deep-merges** them:

1. The base mapping in `unified_model_resource_method` (defined by Truto for built-in unified models, or by you for custom ones — see §2).
2. Your environment-specific override in `environment_unified_model_resource_method`.

The override layer is the customer-facing way to change how a specific resource/method behaves for one of your environments — without forking the unified model.

> **For the full lifecycle** — discovering existing mappings, finding `environment_unified_model_id`, the deep-merge semantics, testing changes, common gotchas, and end-to-end worked examples — see [Unified API Customization](../../truto/references/unified-api-customization.md) in the main `truto` skill. This section focuses on the JSONata-bearing fields and their evaluation contexts.

### Endpoints

```
POST   /environment-unified-model-resource-method
PATCH  /environment-unified-model-resource-method/:id
GET    /environment-unified-model-resource-method
GET    /environment-unified-model-resource-method/:id
DELETE /environment-unified-model-resource-method/:id
```

Auth: session cookie or `Authorization: Bearer <api_token>` (see [Authentication](../../truto/references/authentication.md)).

### Request shape

```json
{
  "environment_unified_model_id": "<env-unified-model-id>",
  "resource_name": "contacts",
  "integration_name": "salesforce",
  "method_name": "list",
  "config": {
    "response_mapping": "...",
    "query_mapping": "...",
    "request_body_mapping": "...",
    "path_mapping": "...",
    "error_mapping": "...",
    "request_header_mapping": "...",
    "response_header_mapping": "...",
    "resource": { "expression": "..." },
    "method": { "expression": "..." },
    "is_partial_expression": "...",
    "before": [ { "type": "request", "run_if": "...", "config": { /* ... */ } } ],
    "after":  [ { "type": "request", "run_if": "...", "config": { /* ... */ } } ],
    "side_load": { "owner": { "response_mapping": "..." } }
  }
}
```

You only set the fields you want to override — the rest are inherited from the base row at runtime.

### `response_mapping` — reshape an integration response into the unified shape

This is the workhorse of the unified API. The expression's job is to take the raw integration response and return the unified shape (a record or an array of records).

**Top-level scope:**

| Variable | What it is |
|---|---|
| `response` | The full HTTP response object: `{ statusCode, headers, body, ... }` |
| `body` | Shortcut for `response.body` (parsed) |
| `headers` | Shortcut for `response.headers` |
| `query` | The unified-API query (after Truto has parsed it) |
| `rawQuery` | The unified-API query as the caller sent it (no coercion) |
| `context` | The integrated account's context (credentials, instance config, custom keys) |

The expression also has access to `documentParserApiUrl` and `documentParserApiKey` injected automatically — no need to thread API keys through context for `$parseDocument`.

**Example — Salesforce contact list response:**

```json
{
  "config": {
    "response_mapping": "response.records.{ \"id\": Id, \"first_name\": FirstName, \"last_name\": LastName, \"email\": Email, \"phone\": Phone, \"created_at\": CreatedDate, \"updated_at\": LastModifiedDate, \"owner\": { \"id\": OwnerId } }"
  }
}
```

**Example — pulling values out of a paginated cursor response:**

```json
{
  "config": {
    "response_mapping": "{ \"result\": response.body.data.{ \"id\": id, \"name\": name }, \"next_cursor\": response.body.meta.next }"
  }
}
```

**Returning `null`** drops a record silently. Useful inside an array map for filtering:

```jsonata
response.body.items.(status = 'archived' ? null : { "id": id, "name": name })
```

### `query_mapping` — translate the unified-API query into the integration's query

The unified API has a standard query syntax (`limit`, `cursor`, `since`, filter operators like `gt`/`lt`/`in`). The integration almost certainly uses something different. `query_mapping` is where you do that translation.

**Top-level scope:** `query`, `body`, `context`, `before`, `id`. (`rawQuery` is **not** in scope here even though it is in `response_mapping`.)

**Example — Salesforce SOQL:**

```json
{
  "config": {
    "query_mapping": "{ \"q\": \"SELECT Id, FirstName, LastName, Email FROM Contact\" & ($exists(query.updated_at.gt) ? \" WHERE LastModifiedDate > \" & $dtFromIso(query.updated_at.gt).toISO() : \"\") & \" LIMIT \" & $string($firstNonEmpty(query.limit, 100))) }"
  }
}
```

**Example — HubSpot list contacts (cursor + limit):**

```json
{
  "config": {
    "query_mapping": "{ \"after\": query.cursor, \"limit\": $firstNonEmpty(query.limit, 100), \"properties\": $join($firstNonEmpty(query.fields, ['firstname','lastname','email']), ',') }"
  }
}
```

The result of the expression replaces the outbound query string verbatim.

### `request_body_mapping` — translate the unified-API body into the integration's body

For `create` / `update` / custom write methods. Works the same way as `query_mapping` but for the request body.

**Top-level scope:** `body` (the unified-API request body), `context`, `query`, `rawQuery`, `before`, `id`.

> First call gets the **default body** (whatever's already been computed) — its keys are accessible as root variables. Second call evaluates with the bindings table above. Most overrides use the second-call bindings.

**Example — create a Salesforce contact:**

```json
{
  "config": {
    "request_body_mapping": "{ \"FirstName\": body.first_name, \"LastName\": body.last_name, \"Email\": body.email, \"Phone\": body.phone, \"AccountId\": body.account.id }"
  }
}
```

**Example — wrap a field into the integration's strange envelope:**

```json
{
  "config": {
    "request_body_mapping": "{ \"data\": { \"type\": \"contact\", \"attributes\": $removeEmpty({ \"name\": body.name, \"email\": body.email, \"tags\": body.tags }) } }"
  }
}
```

Functions used: [`$removeEmpty`](./core-functions.md#removeemptyobject).

### `path_mapping` — compute the integration's URL path

Returns the path string. Most useful when the path varies by query/body content (e.g. tenant-scoped endpoints).

**Top-level scope:** `headers`, `body`, `query`, `rawQuery`, `context`, `before`, `id`.

**Example — tenant-scoped path:**

```json
{
  "config": {
    "path_mapping": "'/v1/orgs/' & context.org_id & '/contacts/' & id"
  }
}
```

### `request_header_mapping` — set / mutate outgoing request headers

Returns the headers object. The default `headers` value flows in as both root (`headers`) and as the JSONata input.

**Top-level scope:** `headers` (default headers), `body`, `query`, `rawQuery`, `context`, `requestBody`.

**Example — sign the request body and put the signature in a header:**

```json
{
  "config": {
    "request_header_mapping": "$merge([headers, { \"X-Signature\": $sign($string(requestBody), 'sha-256', context.signing_secret, 'hex') }])"
  }
}
```

Functions used: [`$sign`](./core-functions.md#signtext-algorithm--sha-256-secret-outputformat--hex), built-in `$merge`, `$string`.

### `response_header_mapping` — extract values from the response headers

Returns the headers object that downstream consumers see. Often used to surface a rate-limit header or an entity-tag.

**Top-level scope:** `headers`, `body`, `query`, `rawQuery`, `context`, `response` (full response object).

**Example — surface remaining-quota header:**

```json
{
  "config": {
    "response_header_mapping": "{ \"x-rate-limit-remaining\": headers.`x-ratelimit-remaining` }"
  }
}
```

### `error_mapping` — translate integration error responses to the unified error shape

When an integration call fails, Truto runs `error_mapping` to produce a unified error body that's surfaced to your code consistently across integrations.

**Top-level scope:** `headers`, `error` (the parsed error body), `body`, `query`, `rawQuery`, `context`, `before`, `id`.

**Example — Salesforce error array:**

```json
{
  "config": {
    "error_mapping": "{ \"message\": error[0].message, \"code\": error[0].errorCode, \"fields\": error[0].fields }"
  }
}
```

**Example — propagating a single message:**

```json
{
  "config": {
    "error_mapping": "{ \"message\": $firstNonEmpty(error.message, error.error.message, error.detail, 'Unknown error') }"
  }
}
```

Functions used: [`$firstNonEmpty`](./core-functions.md#firstnonemptyvalues).

### `resource.expression` / `method.expression` — dynamic resource/method picker

Sometimes which integration resource Truto should call depends on the request. The picker returns the integration resource (or method) name to dispatch to.

**Top-level scope:** `query`, `rawQuery`, `body`, `context`.

```json
{
  "config": {
    "resource": {
      "expression": "$exists(query.deal_id) ? 'opportunities' : 'leads'",
      "resources": ["opportunities", "leads"]
    }
  }
}
```

The `resources` array is a static allow-list — the expression must return one of them.

### `is_partial_expression` — tell Truto whether a response is paginated/partial

Returns truthy when the response is a partial page (so Truto continues paginating), falsy when it's the final/complete response.

**Top-level scope:** `data` (the response body), `query`, `rawQuery`, `before`, `id`, `requestBody`, `rawBody`.

```json
{
  "config": {
    "is_partial_expression": "$exists(data.next_cursor) and $count(data.items) >= $firstNonEmpty(query.limit, 100)"
  }
}
```

### `before` / `after` steps with `run_if`

`before` and `after` are arrays of pre-/post-request steps (most commonly additional HTTP requests). Each step can have a `run_if` JSONata predicate, and string `config` values are evaluated as JSONata.

**Top-level scope** (for `run_if` and string-form `config`): `id`, `query`, `body`, `context`, `data` (the response data — only meaningful in `after`), `step` (the previous step's output).

```json
{
  "config": {
    "before": [
      {
        "type": "request",
        "run_if": "$not($exists(context.cached_token))",
        "config": { "method": "POST", "path": "/auth/refresh" }
      }
    ]
  }
}
```

### `side_load.<key>.response_mapping`

Side loads run extra requests to enrich each record (e.g. fetch the owner of each contact). The side-load `response_mapping` runs **per item** with a narrower scope.

**Top-level scope (per item):** `response`, `query`, `rawQuery`, `body`. Note: `context` and `headers` are **not** in scope in the array-style side load helper.

```json
{
  "config": {
    "side_load": {
      "owner": {
        "response_mapping": "response.body.{ \"id\": id, \"name\": full_name, \"email\": email }"
      }
    }
  }
}
```

---

## 2. Creating your own unified models

You can define entirely new unified models — your own resources, schemas, and per-integration mappings.

> For the full workflow including schema design tips, the create → install → iterate lifecycle, and worked examples, see [Unified API Customization → Workflow 3](../../truto/references/unified-api-customization.md#workflow-3--create-your-own-unified-model). The summary below covers the JSONata-relevant pieces only.

### Define the model

```
POST /unified-model
```

```json
{
  "name": "marketing",
  "category": "marketing",
  "description": "Custom marketing automation unified model",
  "team_id": "<your-team-id>",
  "sharing": "deny",
  "resources": {
    "campaigns": {
      "schema": { /* JSON Schema for the unified `campaigns` resource */ },
      "description": "Marketing campaigns",
      "methods": ["list", "get", "create", "update", "delete"]
    }
  }
}
```

The `resources.<name>.schema` JSON Schema defines the unified shape that every integration mapping must produce.

### Define the per-integration base mappings

For each `(resource, integration, method)` triple you support, create a base mapping row:

```
POST /unified-model-resource-method
```

```json
{
  "unified_model_id": "<your-unified-model-id>",
  "resource_name": "campaigns",
  "integration_name": "mailchimp",
  "method_name": "list",
  "config": {
    "response_mapping": "response.campaigns.{ \"id\": id, \"name\": settings.title, \"status\": status, \"created_at\": create_time }",
    "query_mapping": "{ \"count\": $firstNonEmpty(query.limit, 50), \"offset\": $number(query.cursor) }"
  }
}
```

The shape of `config` is **identical** to the override shape in §1 — every JSONata field documented there is available here too.

### Override per environment

Once a base mapping exists (yours or one of Truto's), customers (or you for your own environment) can override it via §1. The `environment_unified_model_resource_method.config` is **deep-merged** on top of `unified_model_resource_method.config` at runtime, so overrides only need to specify the fields they want to change.

> The base mapping rows are required for the unified API to merge mappings at runtime. Defining a `unified-model` without corresponding `unified-model-resource-method` rows will not produce a working unified API for that integration.

---

## 3. Per-integrated-account mapping overrides

When you need a mapping change for a single connected account (not the whole environment), use the per-account override field on `integrated-account`. See [Unified API Customization → Workflow 2](../../truto/references/unified-api-customization.md#workflow-2--override-one-connected-account) for when to use this layer vs. environment-level overrides.

```
PATCH /integrated-account/:id
```

```json
{
  "unified_model_override": {
    "crm": {
      "contacts": {
        "list": {
          "response_mapping": "response.records.{ \"id\": Id, \"name\": $join([FirstName, LastName], ' '), \"email\": Email__c }"
        }
      }
    }
  }
}
```

The shape under `<model>.<resource>.<method>` is a partial of the same `config` schema from §1. The fields the schema explicitly lists for this override are: `resource`, `method`, `response_mapping`, `response_mapping_method`, `query`, `query_schema`, `query_mapping`, `request_body_mapping`, `request_body_schema`, `body`, `file_upload`, `after`, `before`, `side_load`.

> The runtime **also** picks up `path_mapping`, `error_mapping`, `request_header_mapping`, and `response_header_mapping` from this override if you set them, even though they aren't in the strictest schema list. If you need them, set them — they take effect.

Use this when one customer's instance of an integration behaves slightly differently from the rest (custom field name, extra envelope, etc.).

---

## 4. Environment integration overrides — auth, pagination, rate-limit, webhooks

The integration's HTTP-layer config is also customer-overridable per environment. This is where customers control how Truto authenticates, paginates, detects rate limits, and verifies/transforms inbound webhooks for an integration in their environment.

```
PATCH /environment-integration/:id
```

```json
{
  "override": {
    "error_expression": "...",
    "authorization": { "format": "header", "config": { "expression": "..." } },
    "pagination": { "format": "dynamic", "config": { /* dynamic pagination expressions */ } },
    "rate_limit": { /* ... */ },
    "webhook": { "handle_verification": "...", "payload_transform": "..." },
    "resources": { "<resource>": { "<method>": { "error_expression": "..." } } }
  }
}
```

### `error_expression` — detect HTTP errors

Returns truthy when the response should be treated as an error.

**Top-level scope:** `response`, `headers`, `status`, `data`.

```json
{
  "override": {
    "error_expression": "status >= 400 or $exists(data.error)"
  }
}
```

Per-resource-method `error_expression` (under `override.resources.<r>.<m>`) uses the same scope and overrides the integration-wide one for that specific method.

### `authorization.config.expression` — header-based auth

When `authorization.format` is `"header"`, the `config.expression` returns the headers object to attach (typically just an `Authorization` header).

**Top-level scope:** `url`, `requestOptions`, `context`.

```json
{
  "override": {
    "authorization": {
      "format": "header",
      "config": {
        "expression": "{ \"Authorization\": 'Bearer ' & context.access_token, \"X-Tenant\": context.tenant_id }"
      }
    }
  }
}
```

### `pagination` — dynamic pagination expressions

When `pagination.format` is `"dynamic"`, the `config` object holds the JSONata expressions Truto uses to drive the pagination loop.

**Common keys** (set the ones the integration needs):

- `get_initial_pagination_values_expression` — initial `paginationValues` object before any request
- `get_pagination_values_expression` — compute new `paginationValues` from the latest response
- `get_cursor_from_response_expression` — extract the cursor that gets surfaced to the unified-API caller

**Top-level scope:** `query`, `url`, `requestOptions`. The cursor / values expressions additionally see `response`, `body`, `paginationValues`.

```json
{
  "override": {
    "pagination": {
      "format": "dynamic",
      "config": {
        "get_initial_pagination_values_expression": "{ \"page\": 1 }",
        "get_pagination_values_expression": "$exists(body.next_page) ? { \"page\": paginationValues.page + 1 } : null",
        "get_cursor_from_response_expression": "body.next_page ? $string(body.next_page)"
      }
    }
  }
}
```

Returning `null` from `get_pagination_values_expression` ends the loop. Returning `undefined` from `get_cursor_from_response_expression` means "no cursor".

### `rate_limit` — detect throttling and back off

**Top-level scope (all three):** `headers`, `status`.

```json
{
  "override": {
    "rate_limit": {
      "is_rate_limited": "status = 429 or headers.`x-rate-limit-remaining` = '0'",
      "retry_after_header_expression": "$number(headers.`retry-after`)",
      "rate_limit_header_expression": "$number(headers.`x-rate-limit-reset`)"
    }
  }
}
```

- `is_rate_limited` returns truthy when the response should trigger a back-off.
- `retry_after_header_expression` returns the number of seconds to wait.
- `rate_limit_header_expression` returns the absolute reset epoch (seconds), used when a server tells you when the bucket refills rather than how long to wait.

### `webhook.handle_verification` and `webhook.payload_transform`

For inbound webhooks (third-party services posting to Truto's webhook URL for the integration).

- `handle_verification` — runs first; returns the verification response (e.g. echoing back a challenge for Slack/HubSpot URL verification).
- `payload_transform` — runs after verification; returns the normalized payload that becomes the `record:*` events emitted to your outbound webhooks.

**Top-level scope:** the inbound webhook payload as the JSONata input (root). Standard JSONata `$.headers`, `$.body`, `$.query` access patterns work.

```json
{
  "override": {
    "webhook": {
      "handle_verification": "$exists($.body.challenge) ? { \"statusCode\": 200, \"body\": $.body.challenge } : null",
      "payload_transform": "$.body.events.{ \"event_type\": type, \"resource_id\": object_id, \"raw\": $ }"
    }
  }
}
```

### Per-unified-model webhook payload transform

The unified model layer also has its own per-integration outbound webhook transform, set via:

```
PATCH /environment-unified-model/:id
```

```json
{
  "override": {
    "webhooks": {
      "salesforce": "$.body.records.{ \"event\": $.body.event_type, \"resource\": 'crm/contacts', \"id\": Id, \"snapshot\": { \"first_name\": FirstName, \"email\": Email } }"
    }
  }
}
```

This transform shapes the inbound integration webhook payload into the unified-event shape that downstream consumers expect.

---

## 5. Sync Job V4 — the second-largest JSONata surface

Sync Job V4 templates are JSON DAGs of nodes. Several node fields accept JSONata expressions, all sharing the same evaluation context (with a few additions per node type).

### What's in scope

| Key | What it is |
|---|---|
| `args.*` | The `args` object passed when creating the sync job run |
| `sync_job_run` | The current run row (`status`, `started_at`, `finished_at`, etc.) |
| `tenant_id` | The integrated account's `tenant_id` (when bound to one) |
| *integrated account context fields* | Anything in the integrated account's `context` (credentials, instance config, custom keys) — exposed at the top level (e.g. `instance_url`, `site_id`) |
| `resources.<unified-model>.<resource>.<field>` | Output of upstream `request` nodes, addressed by the unified-API resource path |
| `resources.<node-name>` | Output of `transform`, `spool`, `add_context`, and state nodes, addressed by node `name` |
| Anything from `add_context` | Each `add_context` node merges its output into the downstream context — those keys become **top-level** for nodes downstream of it |
| `payload.records` | Inside a `destination.config` expression — the records being written for that destination |
| `total_records_size` | Inside a `transform` — cumulative records seen so far for the active request |

> Resource paths containing `-` must be backtick-quoted in JSONata: `` resources.`knowledge-base`.`page-content` ``.

See the [full Sync Jobs reference](../../truto/references/sync-jobs.md#whats-in-scope) for more.

### `transform.config.expression` — reshape records

Replace the upstream batch with whatever the expression returns. Return `null` to drop the batch silently.

```json
{
  "type": "transform",
  "name": "remove-remote-data",
  "depends_on": "get-page-content",
  "config": {
    "expression": "resources.`knowledge-base`.`page-content`.$sift(function($v, $k) { $k != 'remote_data' })"
  }
}
```

**Convert to Parquet for an object-storage destination:**

```json
{
  "type": "transform",
  "name": "to-parquet",
  "depends_on": "list-pages",
  "config": {
    "expression": "$jsonToParquet(resources.`knowledge-base`.pages, { \"codec\": \"SNAPPY\" })"
  }
}
```

Functions used: [`$jsonToParquet`](./data-formats.md#jsontoparquetrows-options).

**Combine spooled records into one document, sorted by parent → child:**

```json
{
  "type": "transform",
  "name": "combine",
  "depends_on": "all-page-content",
  "config": {
    "expression": "$reduce($sortNodes(resources.`knowledge-base`.`page-content`, 'id', 'parent.id'), function($acc, $v) { $acc & $v.body.content }, '')"
  }
}
```

Functions used: [`$sortNodes`](./core-functions.md#sortnodesarray-idkey--id-parentidkey--parent_id-sequencekey--sequence), built-in `$reduce`.

### `add_context.config.expression` — expose values to downstream nodes

Whatever object the expression returns is **merged into the downstream context** with its keys at the top level.

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

Downstream nodes can now reference `{{page_id}}` and `{{page_title}}` in placeholder fields, or `page_id` / `page_title` in JSONata.

### `update_state.config.value_expression` — write to persistent state

Returning `undefined` skips the write — useful for "only update on success".

```json
{
  "type": "update_state",
  "name": "update-last-synced-at",
  "depends_on": "on-complete",
  "config": {
    "key": "last_synced_at",
    "value_expression": "sync_job_run.status = 'completed' ? $dtFromIso(sync_job_run.started_at.toISOString()).minus({ \"minutes\": 2 }).toUTC().toISO()"
  }
}
```

Functions used: [`$dtFromIso`](./datetime-functions.md#dtfromisodatetimestring).

### `request.query` and `request.body` as strings

Normally `request.query` is an object whose values are placeholders. If you give it a **string**, the runtime treats it as a JSONata expression that must return the query/body object.

```json
{
  "type": "request",
  "name": "list-events",
  "resource": "calendar/events",
  "method": "list",
  "integrated_account_id": "{{args.integrated_account_id}}",
  "query": "{ \"updated_at\": { \"gt\": last_synced_at }, \"page_id\": { \"in\": $distinct(resources.`knowledge-base`.pages.id) } }"
}
```

### `run_if` — skip a node

Available on any node, including destinations.

```json
{
  "name": "webhook",
  "type": "destination",
  "destination_type": "webhook",
  "config": { "id": "{{args.webhook_id}}" },
  "run_if": "$exists(args.webhook_id)",
  "resources_to_persist": ["list-pages"]
}
```

### `args_validation` — gate the whole run

Job-level. Evaluated against `{ args }` before any node executes. Return `null` to proceed; return `{ "message": "..." }` to abort.

```json
{
  "args_validation": "$firstNonEmpty(args.webhook_id, args.s3_datastore_id) ? null : { \"message\": \"Need one of webhook_id or s3_datastore_id\" }"
}
```

---

## 6. Workflows

Workflows trigger when a Truto event fires. The trigger event is the root of the evaluation context, plus environment metadata and (where applicable) the integrated account's context.

### Workflow-level `run_if`

```json
{
  "name": "Auto-sync new CRM accounts",
  "trigger_name": "integrated_account:active",
  "run_if": "event.payload.integration.category = 'crm' and event.payload.tenant_id != null",
  "steps": [ /* ... */ ]
}
```

### Step `run_if`

```json
{
  "type": "run",
  "action": "run_sync_job",
  "run_if": "event.payload.integration.id = 'salesforce'",
  "config": { "sync_job_id": "<sync-job-id>" }
}
```

### Step `config` as a JSONata string

When `config` is given as a **string** instead of an object, it's evaluated as JSONata and must return the action's config object.

```json
{
  "type": "run",
  "action": "run_sync_job",
  "config": "{ \"sync_job_id\": \"<sync-job-id>\", \"args\": { \"integrated_account_id\": event.payload.id, \"since\": $now(), \"started_by\": $firstNonEmpty(event.payload.created_by, 'workflow') } }"
}
```

---

## 7. Daemon Jobs — `args_validation`

Same shape and semantics as sync job `args_validation`:

```json
{
  "args_validation": "$exists(args.integrated_account_id) ? null : { \"message\": \"args.integrated_account_id is required\" }"
}
```

See the [Daemon Jobs reference](../../truto/references/daemon-jobs.md) for the rest of the daemon job schema.

---

## 8. Scheduled Actions — `run_if`

Some integrations expose recurring scheduled actions during post-install. Each action can include a `run_if` JSONata expression evaluated against the integrated account's context. If it returns falsy, that scheduled action is skipped for that account.

```json
{ "run_if": "plan_type = 'enterprise' and $exists(api_key)" }
```

The whole context object is the root, so context fields are referenced bare (`plan_type`, not `context.plan_type`).

See [Integrated Account Context — In Workflows / Scheduled Actions](../../truto/references/integrated-account-context.md#in-workflows) for more.

---

## Authoring tips

1. **Customer config goes through public APIs as JSON.** Inside the JSON, JSONata expression strings need their internal double quotes escaped (`"\"key\""`). For long expressions, write the JSONata first, then escape it.

2. **The unified mapping merge is shallow at the field level but deep across the `config` object.** Setting `config.response_mapping` in `environment_unified_model_resource_method.config` replaces the base `response_mapping` entirely — it doesn't merge inside the JSONata. Be careful when you only meant to "add a field" — you have to repeat the rest.

3. **Wrap multi-statement expressions in `( ... ; ... ; result )`.** JSONata uses `;` as a statement separator inside parentheses; the value of the parenthesized block is the *last* expression.

4. **Variable bindings:** `$name := value`. Function definitions: `function ($args) { body }`. You can assign a function and call it with `$name(args)`.

5. **Backtick-quote keys with hyphens or special characters:** `` headers.`x-rate-limit` ``, `` resources.`knowledge-base` `` (dot syntax with hyphens won't parse).

6. **Returning `undefined` to skip a write.** In `update_state.value_expression` (and dynamic pagination's `get_pagination_values_expression`), returning `undefined` tells the runtime not to update / continue.

7. **Returning `null` from a `transform` or unified `response_mapping` array map drops that record.** Useful for filtering inline.

8. **Test mapping changes against a real account before rolling them out.** The Truto CLI's data-plane commands (see the **Truto CLI** skill) let you fetch a sample response and iterate on the JSONata locally without re-deploying anything.
