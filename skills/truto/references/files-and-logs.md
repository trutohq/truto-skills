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
| `created_at[lt]` | datetime | Conditional | Required if `gt` is set; max 1 month range (90 days for `audit`) |
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
| `audit` | The team's audit log: who changed what through the dashboard or API, sign-ins, Truto staff impersonation | `team_id` (required), `environment_id`, `audit_action`, `audit_action_kind`, `audit_actor_type`, `user_id`, `audit_target_type`, `audit_target_id`, `request_id`, `search` |

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

#### `audit` entries

The team's audit log. Unlike the other log types it is scoped to a **team**, not an environment: send `log_type_filter[team_id]`, and the caller must be an admin of that team (or use an API token issued for it). It covers every environment of the team. Entries are metadata only (never request or response bodies) and are kept for 90 days. Dashboard: **Settings → Audit log** (admins only).

```bash
curl -G https://api.truto.one/log \
  -H "Authorization: Bearer $TRUTO_API_TOKEN" \
  --data-urlencode "log_type=audit" \
  --data-urlencode "log_type_filter[team_id]=<team_id>" \
  --data-urlencode "log_type_filter[audit_action_kind]=deleted" \
  --data-urlencode "created_at[gt]=2026-11-01T00:00:00Z" \
  --data-urlencode "created_at[lt]=2026-11-18T00:00:00Z"
```

```json
{
  "timestamp": "2026-11-17T09:41:07.220Z",
  "log_type": "audit",
  "team_id": "5b0f...",
  "environment_id": "ac15...",
  "audit_action": "webhook.deleted",
  "audit_actor_type": "api_token",
  "audit_actor_name": "Priya via API token \"Production CLI\"",
  "audit_target_type": "webhook",
  "audit_target_id": "0b6c...",
  "audit_target_name": "https://example.com/truto-events",
  "api_token_id": "7e1d...",
  "http_method": "DELETE",
  "http_url_details_path": "/webhook/0b6c...",
  "http_status_code": 200,
  "http_ip": "203.0.113.7",
  "http_request_id": "8d2f9b1c4e7a1234"
}
```

- `audit_action` is `<object>.<verb>`, e.g. `webhook.updated`, `integration.installed`, `integrated_account.connected`, `integrated_account.disconnected`, `integrated_account.post_install_failed`, `user.signed_in`, `impersonation.started`. Filter on it, not on the dashboard label, which can be reworded.
- `audit_actor_type`: `user`, `api_token`, `truto_staff`, `end_user`, `integrated_account`, `scim`, `system`. Any other value is a `400`. `audit_actor_name` names the actor; Truto staff are shown as `Truto staff`.
- `audit_action_kind`: `created`, `updated`, `deleted` or `other`, read from the end of `audit_action`. Any other value is a `400`.
- `audit_target_type` accepts an array to match any of several (`log_type_filter[audit_target_type][]=webhook&log_type_filter[audit_target_type][]=datastore`).
- `search`: case-insensitive, every word (up to 5) must appear in the action, actor name, or target name or id.
- `environment_id` is absent on team-level events (sign-ins, member changes, SCIM).
- Optional fields: `audit_detail` (a short qualifier such as the sign-in method or the start of a post-install error), `audit_target_version`, `audit_via` (`assistant` or `platform_mcp`), `audit_staff_name`, `user_id`, `impersonating_staff_user_id`.
- Reads, Unified/Proxy/Custom API calls, per-account MCP calls, inbound integration webhooks and failed sign-ins are **not** in the audit log.
- To keep entries past 90 days, add `audit` to an observability destination's `config.log_types`. A destination with no `log_types` does not receive `audit`.

> Most fields on log entries are optional. Empty fields are stripped before storage, so any field documented above may be missing for a given entry.
