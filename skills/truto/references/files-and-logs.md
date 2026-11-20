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
| `audit` | The team's audit log: who changed what through the dashboard or API, sign-ins and refused sign-ins, password resets, billing portal changes, Truto staff impersonation | `team_id` (required), `environment_id`, `audit_action`, `audit_action_kind`, `audit_actor_type`, `user_id`, `audit_target_type`, `audit_target_id`, `request_id`, `search` |

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

The team's audit log. Unlike the other log types it is scoped to a **team**, not an environment: send `log_type_filter[team_id]`, and the caller must be an admin of that team (or use an API token issued for it). For an admin it covers every environment of the team; an API token gets only its own environment's entries, so team-level entries (sign-ins, members, billing) are admin-only. Entries are metadata only (never request or response bodies) and are kept for 90 days. Dashboard: **Settings → Audit log** (admins only).

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
  "http_url": "https://api.truto.one/webhook/0b6c...",
  "http_status_code": 200,
  "http_request_id": "8d2f9b1c4e7a1234",
  "http_ip": "203.0.113.7",
  "http_useragent": "truto-cli/1.0.45",
  "http_country": "IN"
}
```

An entry has **only** these fields (an allowlist, the same in `GET /log`, the dashboard, its CSV and log forwarding): `timestamp`, `log_type`, `team_id`, `environment_id`, the `audit_*` fields, `user_id`, `api_token_id`, `http_method`, `http_url` (credentials such as an OAuth `code` replaced by `REDACTED`), `http_status_code`, `http_request_id`, `http_ip`, `http_useragent`, `http_country`. No response headers, handler log lines or `message`. Fields with no value are left out.

- `audit_action` is `<object>.<verb>`, e.g. `webhook.updated`, `integration.installed`, `integrated_account.connected`, `integrated_account.disconnected`, `integrated_account.post_install_failed`, `user.signed_in`, `user.sign_in_failed` (`audit_detail` = method: `password`, `mfa`, `mfa_backup_code`, `mfa_setup`, `passkey`, `magic_link`, `saml`, `oidc`, or the social provider), `user.password_reset_requested`, `user.password_reset`, `user.password_reset_failed`, `mfa.enabled`, `billing.details_updated`, `billing.payment_method_added`, `billing.payment_method_removed`, `billing.default_payment_method_changed`, `billing.tax_id_added|updated|removed` (`audit_detail` = the kind, e.g. `eu vat`, never the value), `impersonation.link_created` (staff created the link), `impersonation.started`, and `truto_staff.<object>.<verb>` for changes Truto staff make to the team from Truto's admin tools without impersonating (e.g. `truto_staff.integrated_account.refresh_credentials`). An `_failed` action is a failure even when `http_status_code` is a 302 (SSO answers with a redirect). Filter on it, not on the dashboard label, which can be reworded.
- `audit_actor_type`: `user`, `api_token`, `truto_staff`, `end_user`, `integrated_account`, `scim`, `system`. Any other value is a `400`. `audit_actor_name` names the actor; Truto staff are shown as `Truto staff`, a refused SAML/OIDC sign-in as `Unknown user` (target: the `sso_connection`), and a billing change made in Stripe (portal or Stripe dashboard) as `Stripe`. A member's own account events (sign-ins, resets, MFA, passkeys) are filed under every team they belong to; a Truto staff account's own sign-ins under none. A webhook target is named by its URL's host only.
- `audit_action_kind`: `created`, `updated`, `deleted`, `failed` or `other`, read from the end of `audit_action`. `failed` is any refused or failed attempt (`http_status_code` ≥ 400, or an action ending `_failed`); `created`/`updated`/`deleted` count only successes. Any other value is a `400`. `user_id` matches what Truto staff did while impersonating that member, never a staff member's own actions. Refused SAML/OIDC responses are capped at 10 rows per connection per 15 minutes, then one row saying the rest of the window isn't recorded. A sign-in, magic link or reset request refused because the organization enforces SSO is recorded for the account it names.
- `audit_target_type` accepts an array to match any of several (`log_type_filter[audit_target_type][]=webhook&log_type_filter[audit_target_type][]=datastore`).
- `search`: case-insensitive, every word (up to 5) must appear in the action, actor name, or target name or id.
- `environment_id` is absent on team-level events (sign-ins, member changes, SCIM).
- Optional fields: `audit_detail` (a short qualifier such as the sign-in method or the start of a post-install error), `audit_target_version`, `audit_via` (`assistant` or `platform_mcp`), `audit_staff_name`, `user_id` and `api_token_id` (both absent when Truto staff acted).
- Reads, Unified/Proxy/Custom API calls, per-account MCP calls and inbound integration webhooks are **not** in the audit log, nor is a sign-in attempt for an email with no account.
- To keep entries past 90 days, add `audit` to an observability destination's `config.log_types`. A destination with no `log_types` does not receive `audit`. Only a team admin with a dashboard session can create, edit or delete a destination that lists `audit` (`403` for members and API tokens). A destination taking `api` also gets audited requests from its environment, in the same allowlisted shape.

> Most fields on log entries are optional. Empty fields are stripped before storage, so any field documented above may be missing for a given entry.
