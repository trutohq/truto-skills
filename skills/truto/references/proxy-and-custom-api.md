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
