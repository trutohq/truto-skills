# Error & Evidence Model

The shared facts the surface playbooks ([P2](./debug-proxy-api.md), [P3](./debug-unified-api.md), [P4](./debug-sync-jobs.md), [P6](./diagnose-integrated-account.md)) lean on: how to read a Truto error, what the status codes mean, the rate-limit and retry rules, and how to pull the right logs with your meta-tools. This is the canonical error contract ported so it's reachable at runtime — the rest of your bundled docs don't carry it.

You don't need a special tool for any of this. **The error body is just the body of the failing `call_platform_api` response** — read it directly. Logs come from `GET /log`. When a filter key or param shape is uncertain, `describe_api_operation` the endpoint rather than guessing.

---

## The error envelope

Every Truto error — Truto-side or provider-side — carries three guaranteed fields:

```json
{
  "statusCode": 400,
  "error": "Bad Request",
  "message": "name is required"
}
```

- `statusCode` — mirrors the HTTP status.
- `error` — the canonical status name (`Bad Request`, `Unauthorized`, `Not Found`, `Too Many Requests`, `Internal Server Error`, …).
- `message` — human-readable. For provider-originated errors it's extracted from the provider's body; it can be **empty**, in which case fall back to `raw_response` (below).

Truto's own validation / auth / routing errors stop here — three fields, nothing more.

## The one split that matters: `truto_is_remote_error`

This flag is the fastest way to assign blame, and most branches in the surface playbooks hinge on it.

| | `truto_is_remote_error` absent | `truto_is_remote_error: true` |
| --- | --- | --- |
| **Origin** | Truto itself | The third-party provider |
| **Typical cause** | A 4xx for input you sent, or a 5xx meaning Truto couldn't reach the provider at all | The provider returned a non-2xx through `/unified/*` or `/proxy/*` |
| **Extra fields** | none | `raw_response` (the provider's body, JSON if parseable else raw text) + the provider's response headers forwarded back (rate-limit, `Retry-After`, …) |
| **What to do** | Fix the request, or retry on a Truto 5xx | Treat as a flaky/failing upstream — read `raw_response`; don't "fix" it as a Truto bug |

When `message` is empty on a remote error, read `raw_response` for the actual provider message.

## `truto_error_insight` (unified API)

Unified API errors add a `truto_error_insight` block. Each key is independent — you may see one, several, or none — and each carries `{ description, value }`. Use it to skip straight to the cause instead of spelunking logs.

| Key | `value` shape | Means | Branch |
| --- | --- | --- | --- |
| `missing_required_query_parameters` | array of param names | You omitted query params the unified model requires | Fix the **request**, not the mapping |
| `missing_required_body_fields` | array of field names | You omitted required body fields | Fix the request body |
| `conditionally_required_query_parameters` | object: param → its requirement rule | **Informational, not a violation.** Lists params that *carry* a conditional-requirement rule; Truto attaches it whenever such a rule exists — so it can ride along on unrelated errors (even a remote 401/403/429) | Read the rule; act only if your request actually breaks it |
| `conditionally_required_body_fields` | object: field → rule | Same — informational | Don't treat its presence as the cause |
| `rate_limit_error` | — | A 429 from the provider | See [Rate limits](#rate-limits); honor `Retry-After` |
| `forbidden_error` | `value.missing_scopes`: array of scopes | A 403 — the connection lacks these OAuth scopes for the resource/method | Re-consent with the added scopes → [P6](./diagnose-integrated-account.md) |
| `remote_error` | — (intentionally short) | Present whenever `truto_is_remote_error` is true | Read `raw_response` + `message` for the real content |

> **Only `missing_required_*` is violation-based** — it checks your actual request and means you genuinely omitted something. The `conditionally_required_*` keys are **schema-existence hints**: Truto adds them whenever the endpoint *has* a conditional rule, even on errors unrelated to it. Read them as "here's a rule that exists, check it," not "you broke this." `rate_limit_error` and `remote_error` carry only a `description`, no `value`.

**Proxy is different.** The proxy API has no unified schema to compare your request against, so proxy errors carry **only** `truto_is_remote_error`, `raw_response`, forwarded headers, and — on 403s — `truto_error_insight.forbidden_error`. The missing-parameter, conditional, `rate_limit_error`, and `remote_error` insights are **unified-only**. Don't go looking for them on a proxy failure.

## Status-code semantics

| Code | Meaning | Retryable? | Operator read |
| --- | --- | --- | --- |
| `400` | Truto rejected the request before it left the edge. On unified, missing-required-field errors land here too — check `truto_error_insight`. | No | Fix the request |
| `401` | **No `truto_is_remote_error`:** your token is missing/expired/wrong. **With `truto_is_remote_error: true`:** the provider rejected the connection's credentials — Truto flips the account to `needs_reauth`, sets `last_error`, fires `integrated_account:authentication_error`, and keeps returning 401 **until the end user reconnects**. | No | Remote 401 → [P6](./diagnose-integrated-account.md) |
| `403` | Authenticated but not allowed. Check `truto_error_insight.forbidden_error.value.missing_scopes` — if non-empty it's an OAuth scope gap a reconnect-with-scopes fixes. | No | Missing scopes → [P6](./diagnose-integrated-account.md) |
| `404` | The resource doesn't exist, **or** the account/environment isn't visible to your token. | No | Check casing / target / token scope |
| `405` | Method not allowed on that route. **Sandbox accounts return 405 on `POST`/`PATCH`/`DELETE` — they're read-only.** | No | Use a non-sandbox account to write |
| `409` | Provider rejected a create/update on a uniqueness constraint. Always `truto_is_remote_error: true`; check `raw_response` for the field. | No | Resolve the conflict in the request |
| `422` | Payload well-formed but the provider's own validation rejected it. | No | Fix per `raw_response` |
| `429` | Rate limited — see below. | **Yes**, after `Retry-After` | Back off |
| `500` | Truto failed to process the request. | **Yes**, backoff | If it persists, capture the response, escalate |
| `502` / `504` | Truto reached the provider but got no clean response. | **Yes** | Safe to retry |
| `503` | The integrated account has been **blocked**. | No | Contact `support@truto.one` |

A `5xx` **with** `truto_is_remote_error: true` is the provider failing, not Truto — treat it like any flaky upstream (exponential backoff, capped attempts).

## Rate limits

Both Truto tiers return `429` with `Retry-After: 10`.

| Scope | Limit | Keyed on |
| --- | --- | --- |
| Per API token | **500 requests / 10s** | The bearer token |
| Per integrated account | **50 requests / 10s** | The `integrated_account_id` query param (unified + proxy only) |

A provider-originated 429 instead carries `truto_is_remote_error: true` with the provider's own `Retry-After` in the forwarded headers (and, on unified routes, `truto_error_insight.rate_limit_error`). Honor whichever `Retry-After` is present.

## Retry rule

- **Retry:** `429` (after `Retry-After`), `502`, `504`, `503` only if you didn't trigger it via a blocked account, and any `5xx` that does **not** carry `truto_is_remote_error`.
- **Don't retry — fix first:** `400`, `401`, `403`, `404`, `409`, `422`. Retrying these just repeats the failure; fix the request, the token, or the connection.

---

## The `/log` quick-map

Truto's operational logs are read through one endpoint, `GET /log`, selected by `log_type`. Use it to confirm *what actually happened* over a time window — the failing call alone tells you about one request. For the full query mechanics, time-window params (`created_at[gt]`/`created_at[lt]`, max one-month range), `limit` (≤100), `next_cursor`, and the per-type entry shapes, read [Files & Logs](../../truto/references/files-and-logs.md); this map adds the operator-relevant detail.

### The five log types

| `log_type` | What it captures | Filter keys you can pass | Read these fields off the entries |
| --- | --- | --- | --- |
| `unified_proxy_api` | Unified + proxy API requests | `request_type` (`proxy`\|`unified`), `integrated_account_id`, `environment_id`, `integration` | `http_status_code`, `http_status_category`, `request_type`, `resource`, `method`, `integrated_account_needs_reauth`, `result_count`, `logs[]`, `message` |
| `rapid_bridge` | Sync job run logs | `sync_job_run_id`, `sync_job_id`, `sync_job_run_event`, `integrated_account_id`, `webhook_id`, `environment_id`, `integration` | `status`, `num_records`, `resource`, `retry_after`, `retry_count`, `webhook_status`, `webhook_successful`, `logs[]` |
| `webhook` | Outbound webhook delivery | `webhook_id`, `event`, `environment_id` | `event`, `webhook_id`, `webhook_endpoint_status`, `status`, `resource`, `method` |
| `sync_job_cron_trigger` | Sync cron fires | `environment_id` *(only)* | `alarm_type`, `entity_id`, `duration`, `integrated_account_id`, `integration`, `integrated_account_needs_reauth` |
| `mcp` | MCP server requests | `mcp_server_id`, `tool_name`, `mcp_method`, `resource`, `method`, `client_name`, `client_version`, `request_id` (→ `http_request_id`), `integrated_account_id`, `environment_id`, `integration` | `http_status_code`, `tool_name`, `mcp_method`, `resource`, `method`, `logs[]` |

**Filters vs fields — don't confuse them.** The middle column is the *only* set of keys each type accepts as filters (passed as `log_type_filter[key]=value`); everything else, including `http_status_code`, is a **field on the returned entry** that you read, not a filter you send. So to find a failed call you filter by `integrated_account_id` (+ `request_type`, + time window), then scan entries for the `http_status_code` you care about — you can't filter on the status directly. For `sync_job_cron_trigger`, `environment_id` is the only filter; `entity_id` (the sync-job id) is an entry field, so fetch the env's cron logs and match `entity_id` yourself. When in doubt about exact filter syntax, `describe_api_operation { method: "GET", path: "/log" }`.

### A workable evidence order

1. **Read the failing response first.** Status code + `truto_is_remote_error` + `truto_error_insight` usually classify the problem with zero log reads.
2. **Scope a `/log` read only if you still need history** — a time window, an `integrated_account_id`, the right `request_type`/`log_type`. Keep `limit` small; you're sampling, not exporting.
3. **Branch and stop.** Once status + Truto-vs-provider + cause class are known, you're done gathering — go to the matching surface playbook or hand a concluded fix to [P1](./safe-admin-changes.md).
