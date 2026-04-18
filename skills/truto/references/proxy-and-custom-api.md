# Proxy & Custom API

## Proxy API

The proxy API passes requests through to the native API of the underlying integrated tool. Use it when you need access to provider-specific features not covered by the unified API.

### Base Pattern

```
https://api.truto.one/proxy/{resource}?integrated_account_id={id}
```

### Endpoints

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/proxy/{resource}?integrated_account_id={id}` | List |
| `GET` | `/proxy/{resource}/{id}?integrated_account_id={id}` | Get |
| `POST` | `/proxy/{resource}?integrated_account_id={id}` | Create |
| `PATCH` | `/proxy/{resource}/{id}?integrated_account_id={id}` | Update |
| `DELETE` | `/proxy/{resource}/{id}?integrated_account_id={id}` | Delete |
| `POST` | `/proxy/{resource}/{method}?integrated_account_id={id}` | Custom method |

### Examples

```bash
# List using native resource name
curl "https://api.truto.one/proxy/Contact?integrated_account_id=$ACCOUNT_ID" \
  -H "Authorization: Bearer $TRUTO_API_TOKEN"

# Create using native API format
curl -X POST "https://api.truto.one/proxy/Contact?integrated_account_id=$ACCOUNT_ID" \
  -H "Authorization: Bearer $TRUTO_API_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"FirstName": "Jane", "LastName": "Doe"}'
```

```javascript
const response = await fetch(
  `https://api.truto.one/proxy/Contact?integrated_account_id=${accountId}`,
  { headers: { Authorization: `Bearer ${apiToken}` } }
);
const data = await response.json();
// data.result — array from the native API
// data.next_cursor — pagination cursor (pass-through from native API)
```

### Response Format

List responses use the [standard list envelope](./unified-api.md#list-envelope):

```json
{
  "result": [...],
  "next_cursor": "...",
  "prev_cursor": "...",
  "result_count": 50,
  "is_partial_response": false
}
```

`result` contains the array returned by the upstream provider, normalized into a JSON array. Cursor values are derived from the provider's own pagination tokens.

**Single-resource calls** (`GET /proxy/{resource}/{id}`) return the upstream provider's response body verbatim — same shape, same field names. There is no wrapping envelope.

**Errors** from the upstream provider are surfaced through Truto's standard [error envelope](./unified-api.md#error-envelope), with the upstream status code preserved in `statusCode` and the original error included in `details`.

### Binary Passthrough

For binary request bodies, use the `truto_body_passthrough` query parameter:

```bash
curl -X POST "https://api.truto.one/proxy/files?integrated_account_id=$ACCOUNT_ID&truto_body_passthrough=true" \
  -H "Authorization: Bearer $TRUTO_API_TOKEN" \
  -H "Content-Type: application/octet-stream" \
  --data-binary @file.pdf
```

### Gotchas

- Sandbox integrated accounts cannot make write operations (POST, PATCH, DELETE return `405`).
- Query parameters are forwarded to the native API, including `integrated_account_id` — the provider may ignore unknown params.
- The `resource` name must match the native API's resource naming (case-sensitive for some providers).
- No `/meta` endpoints for proxy API — refer to the provider's documentation.

---

## Custom API

Custom APIs let you define your own endpoints with custom routing logic. The path after `/custom/` is forwarded to the integration's custom handler.

### Base Pattern

```
https://api.truto.one/custom/{path}?integrated_account_id={id}
```

### Usage

```bash
# Any HTTP method, any path
curl "https://api.truto.one/custom/v1/reports/monthly?integrated_account_id=$ACCOUNT_ID" \
  -H "Authorization: Bearer $TRUTO_API_TOKEN"

curl -X POST "https://api.truto.one/custom/v1/sync?integrated_account_id=$ACCOUNT_ID" \
  -H "Authorization: Bearer $TRUTO_API_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"since": "2024-01-01"}'
```

### Behavior

- **Any HTTP method** is accepted (GET, POST, PATCH, PUT, DELETE, etc.)
- The path `/custom/v1/reports/monthly` is forwarded as `/v1/reports/monthly` to the handler
- The `integrated_account_id` query parameter is **removed** before forwarding to the handler
- Response format follows the same `{ result, next_cursor, prev_cursor }` pattern when the result is JSON
- Errors use the [standard error envelope](./unified-api.md#error-envelope)

---

## Authoring Custom-API Handlers

There are two ways to extend an integration with non-CRUD endpoints. Pick whichever matches your use case.

| Pattern | Defined in | Called via | When to use |
|---|---|---|---|
| **Registered custom method on a proxy resource** | `integration.config.resources.{resource}.{methodName}` (a `ResourceMethodSchema`) | `POST /proxy/{resource}/{methodName}?integrated_account_id=…` | The endpoint is part of an existing resource family (e.g. `contacts.merge`, `deals.bulk_update`) and you want a stable, named, callable surface that's the same for every integrated account. |
| **Ad-hoc custom path** | Nothing — the integration's base URL + auth are reused | `ANY /custom/{path}?integrated_account_id=…` (optionally with `methodConfig` in the body) | The endpoint is one-off, experimental, or fully driven by the caller (e.g. hitting an arbitrary REST path the integration exposes, or running a JSONata-shaped request decided at call time). |

Both share the same plumbing: the integration's authorization (bearer/basic/header), `base_url`, integration-level `headers` and `query`, rate limiting, and credential refresh are all applied automatically. You're only describing the *call*, not the auth.

### Pattern 1 — Register a Custom Method on a Proxy Resource

Add a new key under the resource's method record. The key can be any string that's not one of `list`, `get`, `create`, `update`, `delete`. The value is the same `ResourceMethodSchema` used for standard CRUD methods.

Minimal example — a `merge` method on `contacts`:

```json
{
  "resources": {
    "contacts": {
      "list":   { "method": "get",  "path": "/v1/contacts", "...": "..." },
      "get":    { "method": "get",  "path": "/v1/contacts/{{id}}" },
      "merge":  {
        "method": "post",
        "path": "/v1/contacts/{{body.primary_id}}/merge",
        "body": {
          "merge_with_ids": "{{body.merge_with_ids}}"
        }
      }
    }
  }
}
```

Callable as:

```bash
curl -X POST "https://api.truto.one/proxy/contacts/merge?integrated_account_id=$ACCOUNT_ID" \
  -H "Authorization: Bearer $TRUTO_API_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"primary_id": "123", "merge_with_ids": ["456", "789"]}'
```

Useful `ResourceMethodSchema` fields when authoring custom methods (full set is in [`integrationSchema.ts`](https://github.com/trutohq/truto/blob/main/src/integration/integrationSchema.ts) → `ResourceMethodSchema`):

| Field | Purpose |
|---|---|
| `method` | HTTP verb — `get` \| `post` \| `put` \| `patch` \| `delete`. Defaults to `get`. |
| `path` | URL path appended to `base_url`. Supports `{{placeholder}}` substitution from `id`, `body`, `query`, and `context`. |
| `base_url` | Override the integration's base URL just for this method (rare — useful when one method lives on a different host). |
| `headers` / `query` | Extra request-scoped headers/query params. JSONata-aware; merged on top of integration-level config. |
| `body` | Static or templated request body shape. Use `{{body.field}}` to project from the caller's payload, or a JSONata expression for full transforms. |
| `body_format` | `json` (default), `form`, `multipart`, `raw`, or `xml`. |
| `query_array_format` | How array query params are serialized: `comma`, `brackets`, `indices`, `repeat`. |
| `pagination` | Per-method pagination strategy. Set to `null` to disable on this method even when the integration has a default. |
| `pagination_path` | Where to read pagination metadata from inside the response. |
| `response_path` | JSON path of the actual data inside the response (e.g. `data.results`). |
| `authorization` | Override the integration-level auth scheme just for this method (rare). |
| `error_expression` | JSONata expression for per-method error mapping; falls back to integration-level. |
| `api_documentation_url` | Link to the upstream provider's docs for this endpoint — surfaced in tooling. |
| `description` | One-liner; appears in MCP/discovery output. |
| `examples.body`, `examples.query`, `examples.response` | Strings used by the docs generator and MCP tool descriptions. |

Authoring tips:

- **Sandbox accounts can't call write methods.** Custom methods on proxy resources go through the same sandbox guard as `POST /proxy/...` — they return `405` for sandbox accounts.
- **Idempotency.** `POST /proxy/{resource}/{method}` honors the `Idempotency-Key` header (keyed by `integrated_account_id` + path + key), so you can safely retry mutating custom methods.
- **Use `tool_tags` to surface the method.** Adding the resource to `tool_tags` (e.g. `"contacts": ["write", "bulk"]`) lets MCP tooling filter on it.
- **Store nothing.** Like CRUD methods, custom methods are stateless — they're a description of *how to call* the upstream, nothing more.

### Pattern 2 — Ad-hoc `/custom/{path}` with `methodConfig`

The `/custom/{path}` route forwards `{path}` to the integration's base URL using its credentials, with no need to register anything in `integration.config.resources`. For one-off calls or when the path is decided at call time, this is the simplest option.

For more control, the **request body** can include a top-level `methodConfig` field shaped like a `ResourceMethodSchema`. When present, it is used as the resource-method config for that single call — so callers can override the verb, path, body shape, query params, headers, response path, error expression, etc., per request:

```bash
curl -X POST "https://api.truto.one/custom/v1/reports/run?integrated_account_id=$ACCOUNT_ID" \
  -H "Authorization: Bearer $TRUTO_API_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "report_id": "monthly_revenue",
    "since": "2026-01-01",
    "methodConfig": {
      "method": "post",
      "path": "/v1/reports/{{body.report_id}}/run",
      "body": { "from": "{{body.since}}", "to": "$now()" },
      "response_path": "data.report"
    }
  }'
```

Behavior to know:

- The `methodConfig` field is **stripped from the body** before the request is forwarded — it's metadata for Truto, never sent upstream.
- If `methodConfig` is omitted, the path is forwarded as-is and the body is sent as-is. This is the "raw passthrough" mode.
- `integrated_account_id` is removed from the query string before forwarding.
- The response is wrapped in `{ result, next_cursor, prev_cursor }` when JSON; binary responses pass through unchanged.

When to prefer Pattern 2 over Pattern 1:

- The endpoint is genuinely one-off — registering a method just for this call would be noise.
- The exact path or shape is computed at call time (e.g. by an LLM agent or by a workflow step) and you don't want to redeploy the integration spec for each variant.
- You're prototyping. Once the call stabilizes, promote it to Pattern 1 so the rest of the team gets a stable, named surface and MCP discoverability.

### Where Custom Methods Run

Custom methods (both patterns) execute through the same `fetchResourceForIntegratedAccount` pipeline as standard CRUD: integration-level `before` steps, `headers`/`query` merging, placeholder substitution, JSONata transforms, pagination, error mapping, and credential refresh all apply. There's no separate "custom handler" runtime — they're regular method configs invoked by a different route.

---

## Batch Requests

Batch requests execute multiple unified or proxy API calls in a single request, with support for dependency graphs between calls.

### Endpoint

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/batch-request` | Execute a batch of API calls |

> **Note:** Batch requests require a session or API token — integrated account tokens are not supported.

### Request Body

```json
{
  "integrated_account_id": "<uuid>",
  "resources": [
    {
      "resource": "crm/contacts",
      "method": "list",
      "query": {"limit": 10}
    },
    {
      "resource": "crm/companies",
      "method": "list",
      "depends_on": ["crm/contacts"]
    }
  ],
  "args": {}
}
```

#### Fields

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `integrated_account_id` | uuid | Yes | Account to execute against |
| `resources` | array | Yes | Array of resource requests (non-empty) |
| `args` | object | No | Additional context for the batch |

#### Resource Request Fields

| Field | Type | Description |
|-------|------|-------------|
| `resource` | string | Resource path — `model/resource` for unified, single segment for proxy |
| `method` | string | HTTP method or named method |
| `id` | string | Resource ID for get/update/delete |
| `query` | object | Query parameters |
| `body` | object | Request body |
| `depends_on` | string[] | Resources that must complete first |
| `loop_on` | string | Iterate over results from another resource |
| `persist` | boolean | Store results for dependent resources |
| `response_format` | string | How to format the response |

### Response Format

```json
{
  "result": {
    "crm/contacts": [...],
    "crm/companies": [...]
  },
  "errors": {
    "crm/contacts": [],
    "crm/companies": []
  }
}
```

Results are keyed by resource name. The batch engine automatically follows pagination (using `next_cursor`) for list operations.

### Examples

```bash
curl -X POST https://api.truto.one/batch-request \
  -H "Authorization: Bearer $TRUTO_API_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "integrated_account_id": "'$ACCOUNT_ID'",
    "resources": [
      {
        "resource": "crm/contacts",
        "method": "list",
        "query": {"limit": 100}
      }
    ]
  }'
```

### Idempotency

Batch requests support idempotency via the `Idempotency-Key` header, keyed by `integrated_account_id` + request path + key.
