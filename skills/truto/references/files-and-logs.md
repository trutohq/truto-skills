# Files & Logs

## Files

Upload files to Truto's public file storage.

### Endpoint

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/file` | Upload a file |

### Upload a File

```bash
curl -X POST https://api.truto.one/file \
  -H "Authorization: Bearer $TRUTO_API_TOKEN" \
  -F "file=@logo.png"
```

**Request:** `multipart/form-data` with a `file` field.

**Response:**
```json
{
  "url": "https://files-public.truto.one/<key>"
}
```

The file is stored at a stable public URL. There are no list, get, or delete endpoints — upload only.

---

## Logs

Query API and operation logs.

### Endpoint

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/log` | Query logs |

### Query Logs

```bash
curl "https://api.truto.one/log?log_type=unified_proxy_api&created_at[gt]=2024-01-01T00:00:00Z&created_at[lt]=2024-01-31T23:59:59Z&limit=50" \
  -H "Authorization: Bearer $TRUTO_API_TOKEN"
```

### Query Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `log_type` | string | Yes | Type of log to query (see below) |
| `created_at[gt]` | datetime | No | Start of time range |
| `created_at[lt]` | datetime | Conditional | Required if `gt` is set; max 1 month range |
| `limit` | number | No | Max results (default: 100, max: 100) |
| `next_cursor` | string | No | Pagination cursor |
| `log_type_filter` | object | No | Additional filters (e.g., `environment_id`, `integrated_account_id`) |

### Log Types

| `log_type` | What it queries | Common filters |
|------------|----------------|----------------|
| `unified_proxy_api` | Unified and proxy API request logs | `request_type`, `integrated_account_id`, `environment_id`, `integration` |
| `rapid_bridge` | Sync job run logs | `integrated_account_id`, `sync_job_run_id`, `sync_job_id`, `environment_id` |
| `webhook` | Webhook delivery logs | `environment_id`, `webhook_id`, `event` |
| `sync_job_cron_trigger` | Sync job cron trigger logs | `environment_id` |
| `mcp` | MCP server request logs | `integrated_account_id`, `mcp_server_id`, `tool_name`, `resource`, `method` |

### Response

`GET /log` returns a paginated envelope. The shape of each entry depends on the `log_type` queried:

```json
{
  "result": [ /* log entries — see per-type fields below */ ],
  "next_cursor": "<cursor>"
}
```

#### `unified_proxy_api` and `mcp` entries

API request logs include HTTP metadata and Truto request context:

```json
{
  "timestamp": "2024-09-10T12:00:00.000Z",
  "service": "truto-api",
  "environment_id": "9c2e...",
  "integrated_account_id": "abcd...",
  "tenant_id": "my-customer-123",
  "integration": "salesforce",
  "request_type": "unified",
  "resource": "crm/contacts",
  "method": "list",
  "http_method": "GET",
  "http_url": "https://api.truto.one/unified/crm/contacts",
  "http_status_code": 200,
  "http_status_category": "2xx",
  "duration": 412,
  "fetch_duration": 280,
  "result_count": 50,
  "logs": [ /* string log lines or serialized errors */ ],
  "message": "..."
}
```

`mcp` entries add `mcp_server_id`, `mcp_server_name`, `mcp_method`, `tool_name`, `client_name`, `client_version`.

#### `rapid_bridge` entries

Sync job run logs:

```json
{
  "timestamp": "2024-09-10T12:00:00.000Z",
  "service": "truto-api",
  "environment_id": "9c2e...",
  "integrated_account_id": "abcd...",
  "sync_job_id": "11aa...",
  "sync_job_run_id": "22bb...",
  "sync_job_request_type": "request",
  "resource": "contacts",
  "status": "completed",
  "num_records": 1234,
  "fetch_duration": 1820,
  "logs": []
}
```

#### `webhook` entries

Webhook delivery logs:

```json
{
  "timestamp": "2024-09-10T12:00:00.000Z",
  "service": "truto-api",
  "environment_id": "9c2e...",
  "queue": "webhooks",
  "event": "sync_job_run:completed",
  "webhook_id": "ww01...",
  "webhook_endpoint_status": 200,
  "id": "evt_..."
}
```

#### `sync_job_cron_trigger` entries

Cron trigger logs:

```json
{
  "timestamp": "2024-09-10T12:00:00.000Z",
  "service": "truto-api",
  "environment_id": "9c2e...",
  "alarm_type": "sync_job_cron_trigger",
  "entity_id": "33cc...",
  "duration": 120,
  "logs": []
}
```

> Most fields on log entries are optional. Empty fields are stripped before storage, so any field documented above may be missing for a given entry.
