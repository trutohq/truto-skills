# Unified API

The unified API provides standardized CRUD endpoints across integrations. Regardless of which third-party tool is connected, the request and response schemas are consistent.

## Base Pattern

```
https://api.truto.one/unified/{model_name}/{resource_name}
```

- `{model_name}` — The unified model (e.g., `crm`, `ticketing`, `hris`)
- `{resource_name}` — The resource within the model (e.g., `contacts`, `tickets`, `employees`)

## Required Parameter

Every unified API call requires `integrated_account_id` as a query parameter (unless using an integrated account token, where it's inferred):

```
?integrated_account_id=<uuid>
```

## Endpoints

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/unified/{model}/{resource}?integrated_account_id={id}` | List resources |
| `GET` | `/unified/{model}/{resource}/{id}?integrated_account_id={id}` | Get a resource by ID |
| `POST` | `/unified/{model}/{resource}?integrated_account_id={id}` | Create a resource |
| `PATCH` | `/unified/{model}/{resource}/{id}?integrated_account_id={id}` | Update a resource |
| `DELETE` | `/unified/{model}/{resource}/{id}?integrated_account_id={id}` | Delete a resource |
| `POST` | `/unified/{model}/{resource}/{method}?integrated_account_id={id}` | Custom method |

## Examples

### List Resources

```bash
curl "https://api.truto.one/unified/crm/contacts?integrated_account_id=$ACCOUNT_ID" \
  -H "Authorization: Bearer $TRUTO_API_TOKEN"
```

```javascript
const response = await fetch(
  `https://api.truto.one/unified/crm/contacts?integrated_account_id=${accountId}`,
  { headers: { Authorization: `Bearer ${apiToken}` } }
);
const data = await response.json();
// data.result — array of contacts
// data.next_cursor — pagination cursor (null if no more pages)
// data.prev_cursor, data.result_count, data.is_partial_response — see Standard Response Envelopes
```

### Get a Resource

```bash
curl "https://api.truto.one/unified/crm/contacts/$CONTACT_ID?integrated_account_id=$ACCOUNT_ID" \
  -H "Authorization: Bearer $TRUTO_API_TOKEN"
```

> **Note:** Get returns the resource object directly (not wrapped in `{ result }`).

### Create a Resource

```bash
curl -X POST "https://api.truto.one/unified/crm/contacts?integrated_account_id=$ACCOUNT_ID" \
  -H "Authorization: Bearer $TRUTO_API_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "first_name": "Jane",
    "last_name": "Doe",
    "email": "jane@example.com"
  }'
```

### Update a Resource

```bash
curl -X PATCH "https://api.truto.one/unified/crm/contacts/$CONTACT_ID?integrated_account_id=$ACCOUNT_ID" \
  -H "Authorization: Bearer $TRUTO_API_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"email": "jane.doe@example.com"}'
```

### Delete a Resource

```bash
curl -X DELETE "https://api.truto.one/unified/crm/contacts/$CONTACT_ID?integrated_account_id=$ACCOUNT_ID" \
  -H "Authorization: Bearer $TRUTO_API_TOKEN"
```

### Custom Method

```bash
curl -X POST "https://api.truto.one/unified/crm/contacts/search?integrated_account_id=$ACCOUNT_ID" \
  -H "Authorization: Bearer $TRUTO_API_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"query": "jane"}'
```

Custom method responses are wrapped in `{ result: ... }`.

## Standard Response Envelopes

These envelopes are used by the unified API and most other Truto endpoints. Where a different module diverges, that module's reference doc calls it out explicitly.

### List Envelope

List responses are wrapped in a paginated envelope:

```json
{
  "result": [ /* array of resources */ ],
  "next_cursor": "eyJpZCI6...",
  "prev_cursor": null,
  "result_count": 50,
  "is_partial_response": false
}
```

| Field | Type | Description |
|-------|------|-------------|
| `result` | array | Page of resources. |
| `next_cursor` | string \| null | Cursor for the next page. `null` when there are no more pages. |
| `prev_cursor` | string \| null | Cursor for the previous page (unified API and proxy API only). |
| `result_count` | number | Number of items in `result` (unified API and proxy API only). |
| `is_partial_response` | boolean | Optional. `true` if the upstream provider returned incomplete data. |

To fetch the next page, pass `next_cursor` as a query parameter:

```bash
curl "https://api.truto.one/unified/crm/contacts?integrated_account_id=$ACCOUNT_ID&next_cursor=eyJpZCI6..." \
  -H "Authorization: Bearer $TRUTO_API_TOKEN"
```

> **Platform list endpoints** (e.g. `/integrated-account`, `/sync-job`, `/webhook`) use the same envelope but only include `result`, `next_cursor`, and `limit`. They omit `prev_cursor`, `result_count`, and `is_partial_response`.

### Single-Resource Envelope

`GET`, `POST`, and `PATCH` on a single resource return the resource object directly — they are **not** wrapped in `{ result }`.

```json
{
  "id": "5f9f7e25-...",
  "first_name": "Jane",
  /* ...other fields... */
}
```

The exception is unified custom methods (`POST /unified/{model}/{resource}/{method}`), which wrap the response in `{ "result": ... }`.

### Delete Envelope

`DELETE` responses contain only the deleted resource's identifier:

```json
{ "id": "5f9f7e25-..." }
```

### Error Envelope

All error responses share the same JSON shape:

```json
{
  "statusCode": 400,
  "error": "Bad Request",
  "message": "Validation failed",
  "details": { /* optional, validation errors or extra context */ }
}
```

| Field | Type | Description |
|-------|------|-------------|
| `statusCode` | number | HTTP status code (matches the response status). |
| `error` | string | Short error name (e.g. `"Bad Request"`, `"Not Found"`, `"Unauthorized"`). |
| `message` | string | Human-readable error message. |
| `details` | object | Optional. Extra context — for validation errors, this contains a `failures` array describing each invalid field. |

Stack traces are never returned in production. Common status codes:

| Status | Meaning |
|--------|---------|
| 400 | Bad request (validation failed, malformed body) |
| 401 | Missing or invalid authentication |
| 403 | Authenticated but not allowed (e.g. integrated-account token hitting a disallowed endpoint) |
| 404 | Resource not found |
| 405 | Method not allowed (e.g. write on a sandbox account) |
| 409 | Conflict (e.g. duplicate resource) |
| 429 | Rate limited |
| 500 | Internal server error |

## Meta Endpoints

Meta endpoints describe available methods, schemas, and documentation for a model/resource combination.

### Integration Documentation

```bash
# Get docs for all CRM resources on Salesforce
curl "https://api.truto.one/unified/meta/crm/salesforce" \
  -H "Authorization: Bearer $TRUTO_API_TOKEN"
```

Query parameters:
- `format` — Response format: `json` (default), `md`, `html`
- `environment_id` — Required if the API token doesn't have an environment

> **Note:** This endpoint does not accept integrated account tokens.

### Method Metadata

```bash
# Get metadata for the "list" method on CRM contacts
curl "https://api.truto.one/unified/crm/contacts/meta/list?integrated_account_id=$ACCOUNT_ID" \
  -H "Authorization: Bearer $TRUTO_API_TOKEN"
```

Returns:

| Field | Description |
|-------|-------------|
| `method` | Method name |
| `schema` | Response field schema |
| `documentation_link` | Link to provider docs |
| `response_mapping` | How fields are mapped |
| `query_schema` | Available query parameters |
| `request_body_schema` | Expected request body fields |
| `default_query` | Default query values |
| `default_body` | Default request body |

### Integration-Specific Method Metadata

```bash
# Get metadata for "list" on CRM contacts specifically for Salesforce
curl "https://api.truto.one/unified/crm/contacts/salesforce/meta/list" \
  -H "Authorization: Bearer $TRUTO_API_TOKEN"
```

Returns additional fields:
- `response_schema` — Field-level property definitions
- Structured `query_schema` and `request_body_schema`

## Special Query Parameters

| Parameter | Description |
|-----------|-------------|
| `truto_ignore_remote_data` | If `true`, strips `remote_data` from responses |
| `truto_exclude_fields` | Comma-separated fields to exclude from results |
| `truto_response_format` | Set to `normalized` for normalized response format |
| `truto_key_by` | Re-key array results by this field |
| `truto_body_passthrough` | Pass raw request body (e.g., for binary uploads) |
| `truto_super_query` | Set to `apac` or `wnam` to read from SuperQuery (synced data) instead of live API |

## SuperQuery

When `truto_super_query` is set, the list endpoint reads from Truto's synced data store instead of making a live API call. This is useful for:
- Faster reads on large datasets
- Querying data that was synced via sync jobs
- Reducing API calls to rate-limited providers

SuperQuery supports structured filtering with operators (`eq`, `in`, `gt`, `lt`, etc.), `sort_by`, `limit`, and `next_cursor`.

## Idempotency

Mutating operations (POST, PATCH) support idempotency via the `Idempotency-Key` header:

```bash
curl -X POST "https://api.truto.one/unified/crm/contacts?integrated_account_id=$ACCOUNT_ID" \
  -H "Authorization: Bearer $TRUTO_API_TOKEN" \
  -H "Content-Type: application/json" \
  -H "Idempotency-Key: unique-request-id-123" \
  -d '{"first_name": "Jane", "last_name": "Doe"}'
```

If the same `Idempotency-Key` is sent again, the cached response is returned without re-executing the operation.

## Gotchas

- Sandbox integrated accounts cannot make write operations (POST, PATCH, DELETE return `405 Method Not Allowed`).
- The `id` path parameter in update/delete is optional — some integrations pass the ID in the request body instead.
- Binary/blob responses (e.g., file downloads) are returned with the appropriate `Content-Type` header, not as JSON.
