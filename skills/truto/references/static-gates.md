# Static Gates

Static gates are static-IP egress proxies. Pass a gate's id as `truto_static_gate_id` on a link token, and the connected account's OAuth and API calls leave Truto from that gate's fixed IP.

## Endpoints

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/static-gate` | List static gates |
| `GET` | `/static-gate/:id` | Get a static gate |
| `POST` | `/static-gate` | Create a static gate |
| `PATCH` | `/static-gate/:id` | Update a static gate |
| `DELETE` | `/static-gate/:id` | Delete a static gate |

## Create a Static Gate

```bash
curl -X POST https://api.truto.one/static-gate \
  -H "Authorization: Bearer $TRUTO_API_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Partner Portal",
    "domain": "partner.example.com",
    "environment_id": "<env_uuid>"
  }'
```

### Create Fields

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `name` | string | Yes | Gate name |
| `domain` | string | Yes | The gate's host name, with an optional port (`gate.example.com`, `gate.example.com:8443`). A scheme, a path, credentials or a private host is a `400`. |
| `api_token` | string | No | The gate's token; generated when left out |
| `environment_id` | uuid | Yes | Parent environment |

### Fields

| Field | Type | Description |
|-------|------|-------------|
| `id` | uuid | Gate identifier |
| `name` | string | Display name |
| `domain` | string | The gate's host name, with an optional port |
| `api_token` | string | Auto-generated token (shown on create only) |
| `environment_id` | uuid | Parent environment |
| `created_at` | datetime | Creation timestamp |
| `updated_at` | datetime | Last update timestamp |

## Response

`GET /static-gate/:id` returns the gate directly (without `api_token`):

```json
{
  "id": "sg01...",
  "name": "Partner Portal",
  "domain": "partner.example.com",
  "created_by": "21a8...",
  "environment_id": "9c2e...",
  "created_at": "2024-09-01 10:00:00",
  "updated_at": "2024-09-01 10:00:00"
}
```

`POST /static-gate` returns the same shape **plus** `api_token` — store it immediately, it is never returned again.

`GET /static-gate` uses the [standard list envelope](./unified-api.md#list-envelope).

## Gotchas

- The `api_token` is only included in the creation response. Subsequent reads strip it — store it immediately.
- PATCH updates `name` and `domain`, and replaces the token when the body sends a new `api_token` (it is not returned). A PATCH that changes `domain` must send `api_token` in the same request, and one that sends `api_token` must send `domain` too (the current one, to rotate the token in place); otherwise it gets a `400` and nothing is saved. `api_token` must be a non-empty string.
