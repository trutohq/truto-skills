# Static Gates

Static gates provide embeddable connection entry points with their own API token for use in frontend applications.

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
| `domain` | string | Yes | Allowed domain |
| `environment_id` | uuid | Yes | Parent environment |

### Fields

| Field | Type | Description |
|-------|------|-------------|
| `id` | uuid | Gate identifier |
| `name` | string | Display name |
| `domain` | string | Allowed domain |
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
- PATCH only supports updating `name` and `domain`. Token rotation is not exposed via the API.
