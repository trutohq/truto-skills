# Customizing Integrations (HTTP-Layer Overrides)

Truto's pre-built integrations ship with sensible defaults for **auth headers**, **pagination**, **rate-limit detection**, and **inbound webhook handling**. When a particular customer's environment needs different behavior — a non-standard auth header, a custom pagination scheme, an unusual rate-limit response, or a webhook payload that needs reshaping — you override that behavior on a per-environment basis without forking the integration.

This is the HTTP-layer counterpart to [Unified API Customization](./unified-api-customization.md). Where unified customization changes how data is **mapped into your unified shape**, integration customization changes how Truto **talks to the third-party service** in the first place.

> **Mental model.** Each integration has a base config that ships with Truto. Each `environment-integration` row is the per-environment install of that integration; its `override` object is applied over the base config at runtime. **`PATCH` / `update` replace the stored `override` column wholesale** — always send the complete override object (existing keys + your changes). The CLI `override-*` helpers (auth / pagination / rate_limit / webhook) fetch + shallow-merge one slot for you; for `resources`, you must assemble the full override yourself.

> **JSONata.** Every override field that takes an expression uses JSONata. For the per-field scope variables and function reference, see [truto-jsonata: Usage in Truto §4 — Environment integration overrides](../../truto-jsonata/references/usage-in-truto.md#4-environment-integration-overrides--auth-pagination-rate-limit-webhooks).

---

## What you can override

| Surface | Override path | What it controls |
|---|---|---|
| **Authorization** | `override.authorization` | The header(s) attached to outbound requests (Bearer, custom header, Basic). |
| **Pagination** | `override.pagination` | How Truto walks paginated responses (page, cursor, link header, offset, range, dynamic). |
| **Rate limit** | `override.rate_limit` | How Truto detects throttling and chooses a back-off interval. |
| **Webhook (inbound)** | `override.webhook` | How Truto verifies, transforms, and acknowledges inbound webhooks for the integration. |
| **Resources** | `override.resources` | Per-resource / per-method HTTP config (paths, schemas, custom methods). No `override-resources` helper — send the **complete** `override` object via `update` / HTTP. See [§5](#5-override-resources-full-override-required). |
| **Error detection** | `override.error_expression` (and per-resource-method `error_expression`) | When a response should be treated as an error. (Documented in the [JSONata reference](../../truto-jsonata/references/usage-in-truto.md#error_expression--detect-http-errors).) |

The CLI exposes a dedicated helper for each of the first four. Each helper fetches the current override, patches one slot, and sends the **full** override object back (because the API replaces `override` wholesale). For `resources`, there is no helper — you must send the complete override yourself (see below).

---

## Finding the `environment_integration_id`

Every override is scoped to a single `environment-integration` row — the per-environment install of the underlying integration. List the installs in your environment:

```bash
truto environment-integrations list -o json
```

Or filter to a specific integration by ID:

```bash
truto environment-integrations list --integration_id "$INTEGRATION_ID" -o json
```

Save the `id` of the row as `$ENV_INTEGRATION_ID`.

To inspect the current override on that row:

```bash
truto environment-integrations show-override "$ENV_INTEGRATION_ID" -o json
```

This prints just the `override` object — useful before you patch it, and after, to verify the change landed.

---

## 1. Override authorization

Use this when the integration's default auth header isn't right for one of your environments — for example, you need a custom header name, a derived token from `context`, or you want to swap Bearer for Basic.

### CLI helper

```bash
# Bearer token from the integrated account's context
truto environment-integrations override-auth "$ENV_INTEGRATION_ID" \
  --format bearer \
  --config '{"value":"{{oauth.token.access_token}}"}'

# Static header(s), with placeholders from context
truto environment-integrations override-auth "$ENV_INTEGRATION_ID" \
  --format header \
  --config '{"headers":{"X-Api-Key":"{{api_key}}"}}'

# Basic auth (username + password from context)
truto environment-integrations override-auth "$ENV_INTEGRATION_ID" \
  --format basic \
  --config '{"username":"{{username}}","password":"{{password}}"}'

# Dynamic headers computed via JSONata ("format": "header" + "expression")
truto environment-integrations override-auth "$ENV_INTEGRATION_ID" \
  -b '{
    "format": "header",
    "config": {
      "expression": "{ \"url\": url, \"requestOptions\": $merge([requestOptions, { \"headers\": $merge([requestOptions.headers, { \"Authorization\": \"Bearer \" & context.oauth.token.access_token, \"X-Tenant\": context.tenant_id }]) }]) }"
    }
  }'

# Clear the override (revert to integration default)
truto environment-integrations override-auth "$ENV_INTEGRATION_ID" --clear
```

### Format options

| Format | When to use | `config` shape |
|---|---|---|
| `bearer` | `Authorization: Bearer <token>`. `value` is a placeholder template resolved against `context`. Required. | `{ "value": "{{oauth.token.access_token}}" }` |
| `header` | One or more headers, each value a placeholder template resolved against `context`. | `{ "headers": { "X-Api-Key": "{{api_key}}" } }` |
| `header` + `expression` | Headers (or URL) built by a JSONata expression. | `{ "expression": "<jsonata>" }` |
| `basic` | HTTP Basic Auth. | `{ "username": "...", "password": "..." }` |

The `expression` form is the most flexible — see the [JSONata scope](#jsonata-scope-for-authorizationconfigexpression) below.

### JSONata scope for `authorization.config.expression`

| Variable | What it is |
|---|---|
| `url` | The full outbound request URL string. |
| `requestOptions` | The request options Truto is about to send (`{ method, headers, body, ... }`). |
| `context` | The integrated account's `context` object — credentials, instance config, etc. |

Return value: `{ "url": ..., "requestOptions": ... }` — the request to send. Both keys are required; merge your headers into `requestOptions.headers` as in the example above.

After the override lands, every outbound request from that environment-integration carries the new headers.

---

## 2. Override pagination

Use this when the integration's default pagination format doesn't match the third-party API in your customer's environment — for example, a tenant uses an old API version that paginates differently, or you want to switch from offset to cursor for performance.

### CLI helper

```bash
# Cursor-based, with a custom cursor path
truto environment-integrations override-pagination "$ENV_INTEGRATION_ID" \
  --format cursor \
  --config '{"cursor_path":"meta.next_token","limit_param":"page_size"}'

# Page-based
truto environment-integrations override-pagination "$ENV_INTEGRATION_ID" \
  --format page \
  --config '{"page_param":"page","limit_param":"per_page"}'

# Offset-based
truto environment-integrations override-pagination "$ENV_INTEGRATION_ID" \
  --format offset \
  --config '{"offset_param":"start","limit_param":"max"}'

# Link-header (RFC 5988)
truto environment-integrations override-pagination "$ENV_INTEGRATION_ID" \
  --format link_header

# Dynamic — JSONata-driven, full control of the loop
truto environment-integrations override-pagination "$ENV_INTEGRATION_ID" \
  --stdin < dynamic-pagination.json

# Clear the override
truto environment-integrations override-pagination "$ENV_INTEGRATION_ID" --clear
```

### Format options

| Format | Use when | `config` shape |
|---|---|---|
| `page` | Numbered pages: `?page=2&per_page=50`. | `{ "page_param": "page", "limit_param": "per_page" }` |
| `cursor` | Opaque cursor in response body. | `{ "cursor_path": "next_cursor", "limit_param": "limit" }` |
| `link_header` | RFC 5988 `Link: <next-url>; rel="next"`. | (usually none — Truto follows `rel="next"`) |
| `offset` | Numeric offset and limit. | `{ "offset_param": "offset", "limit_param": "limit" }` |
| `range` | HTTP Range header. | `{ "range_unit": "items" }` (varies) |
| `dynamic` | Anything else. JSONata expressions drive the loop. | See below. |

### Dynamic pagination

When none of the canned formats fit, use `format: "dynamic"` and provide JSONata expressions:

- `get_initial_pagination_values_expression` (optional) — runs before the first request. Scope: `query`, `url`, `requestOptions`.
- `get_pagination_values_expression` (required) — runs before each later request. Scope: `query` (with `query.next_cursor` already base64-decoded), `url`, `requestOptions`.
- `get_cursor_from_response_expression` (required) — runs after each response. Scope: `url`, `response`, `body`, `query`, `paginationValues`. Returns `{ "nextCursor": <string or null>, "prevCursor"?: ..., "isLooping"?: <boolean> }`; `nextCursor: null` ends the loop. Truto base64-encodes `nextCursor` and returns it to the caller as `next_cursor`.

The two pagination-values expressions return an object with any of `query`, `url`, `requestOptions`, `body`, `paginationValues`. `query` is merged into the outbound query string; `requestOptions` is deep-merged into the request.

### Worked example — Page-number pagination

Save this as `dynamic-pagination.json`:

```json
{
  "format": "dynamic",
  "config": {
    "get_initial_pagination_values_expression": "{ \"query\": { \"page\": \"1\" } }",
    "get_pagination_values_expression": "{ \"query\": { \"page\": query.next_cursor } }",
    "get_cursor_from_response_expression": "{ \"nextCursor\": body.next_page ? $string(body.next_page) : null }"
  }
}
```

Apply it:

```bash
truto environment-integrations override-pagination "$ENV_INTEGRATION_ID" --stdin < dynamic-pagination.json
```

Truto requests `page=1`, then follows `body.next_page` until the provider stops returning it.

---

## 3. Override rate-limit detection

Use this when the integration's default rate-limit detection misses a tenant-specific signal — for example, a customer is on a plan that returns `429` plus a custom header instead of the standard `Retry-After`.

### CLI helper

```bash
# Per-flag — most readable for simple cases
truto environment-integrations override-rate-limit "$ENV_INTEGRATION_ID" \
  --is-rate-limited "status = 429 or headers.\`x-rate-limit-remaining\` = '0'" \
  --retry-after-header '$number(headers.`retry-after`)'

# Full block via -b for advanced overrides
truto environment-integrations override-rate-limit "$ENV_INTEGRATION_ID" \
  -b '{
    "is_rate_limited": "status = 429",
    "retry_after_header_expression": "$number(headers.`x-plan-quota-reset-after`)",
    "rate_limit_header_expression": "{ \"limit\": headers.`x-ratelimit-limit`, \"remaining\": headers.`x-ratelimit-remaining`, \"reset\": headers.`x-ratelimit-reset` }"
  }'

# Clear
truto environment-integrations override-rate-limit "$ENV_INTEGRATION_ID" --clear
```

Each option corresponds to one key in `override.rate_limit`. You can supply any subset — only the keys you provide are sent.

### Fields

| Key | Meaning | Return type |
|---|---|---|
| `is_rate_limited` | Truthy when the response should trigger a back-off. | boolean (truthy/falsy) |
| `retry_after_header_expression` | Number of **seconds to wait** before retry. | number |
| `rate_limit_header_expression` | Rate-limit state to pass back to the caller. Truto emits the values as `ratelimit-limit`, `ratelimit-remaining`, and `ratelimit-reset` response headers. It does not change the back-off. | object `{ limit, remaining, reset }` |

**JSONata scope (all three):** `headers`, `status`.

Backtick-quote header names in JSONata when they contain a hyphen.

---

## 4. Override inbound webhook handling

Use this for **inbound** webhooks — the third-party service posting to Truto's webhook URL. Three keys under `override.webhook`, applied in this order:

1. **`payload_transform`** (JSONata) — reshapes the inbound request payload. Input and output have the same shape: `{ body, raw_body, headers, query_params, ... }`. A common form is `$merge([$, { ... }])`.
2. **`handle_verification`** (JSONata) — decides how to answer the request. Returns `{ "type": "verify" | "payload" | "meta", "verification_response": { "status_code": 200, "body": ..., "headers": {...} } }`. `type: "verify"` sends `verification_response` back (for example, a Slack or HubSpot URL-verification challenge) and stops; `type: "payload"` continues to signature verification and normal processing. Any other result — `null`, a boolean, or no `type` — skips signature verification but the request is still processed, so always return a `type`.
3. **`signature_verification`** (declarative, no JSONata) — HMAC / JWT / basic verification of the request.

> Outbound webhooks are configured separately via `truto webhooks` — see [Webhooks & Notifications](./webhooks-and-notifications.md).

### CLI helper

```bash
# Set handle_verification (echo a Slack URL-verification challenge)
truto environment-integrations override-webhook "$ENV_INTEGRATION_ID" \
  --handle-verification \
  '$exists(body.challenge) ? { "type": "verify", "verification_response": { "status_code": 200, "body": body.challenge } } : { "type": "payload" }'

# Set signature_verification declaratively
truto environment-integrations override-webhook "$ENV_INTEGRATION_ID" \
  --signature-verification \
  '{"format":"hmac","config":{"algorithm":"SHA-256","verification_content":["{{raw_body}}"],"secret":"{{context.webhook_secret}}","compare_with":"{{headers.x-signature}}","string_type":"hex"}}'

# Set everything in one shot via the full block
truto environment-integrations override-webhook "$ENV_INTEGRATION_ID" \
  --stdin < webhook-override.json

# Clear
truto environment-integrations override-webhook "$ENV_INTEGRATION_ID" --clear
```

You can combine `--handle-verification`, `--payload-transform`, and `--signature-verification` in a single invocation — each maps to a separate key under `override.webhook` and they're sent together.

### JSONata scope

`payload_transform` and `handle_verification` both take the inbound payload as the JSONata root: `body`, `raw_body`, `headers`, `query_params` (plus `context` and `environment_variables` where Truto has them). `handle_verification` sees the payload *after* `payload_transform`.

### `signature_verification`

`config` placeholders resolve against the inbound payload. For HMAC, `verification_content` is the list of strings joined to form the signed content (e.g. `["{{raw_body}}"]`); `secret` and `compare_with` are templated the same way. `string_type` (`hex` / `base64`) and `algorithm` select the digest encoding.

After the override lands, a URL-verification request gets its challenge echoed back, and every other request has its signature checked before Truto processes it.

---

## 5. Override resources (full override required)

Use `override.resources` when an environment needs extra proxy resources or method config on top of the integration's base `config.resources` — for example adding two new resources for a migration while keeping existing overrides for `pages`, `blocks`, `file_uploads`, and similar machinery.

### Contract: replace, not merge

Both the API (`PATCH /environment-integration/:id`) and CLI `update -b '{"override":...}'` **replace** the stored `override` column with whatever you send. They do not deep-merge.

Sending only `{"override":{"resources":{"new_a":{...}}}}` wipes every other override slot **and** every resource you omitted.

**Always send the complete `override` object** (existing keys + your changes). The `override-auth` / `override-pagination` / `override-rate-limit` / `override-webhook` helpers do that fetch+merge for their slots; there is no equivalent helper for `resources`.

### Safe workflow

```bash
# 1. Back up the current override
truto environment-integrations show-override "$ENV_INTEGRATION_ID" -o json \
  > /tmp/env-integration-override.backup.json

# 2. Merge locally — keep every existing key, add/change only what you need
jq '.resources = (.resources // {}) + {
  "new_resource_a": { "list": { "path": "/v1/a", "method": "get" } },
  "new_resource_b": { "list": { "path": "/v1/b", "method": "get" } }
}' /tmp/env-integration-override.backup.json \
  > /tmp/env-integration-override.merged.json

# 3. Send the FULL override object (not a resources-only delta)
truto environment-integrations update "$ENV_INTEGRATION_ID" \
  -b "$(jq '{override: .}' /tmp/env-integration-override.merged.json)"

# 4. Verify: normalized diff should be original + your additions
truto environment-integrations show-override "$ENV_INTEGRATION_ID" -o json \
  > /tmp/env-integration-override.after.json
diff <(jq -S . /tmp/env-integration-override.backup.json) \
     <(jq -S . /tmp/env-integration-override.after.json)
```

Same rule for raw HTTP: `PATCH` with `{ "override": <complete object> }`. If you already wiped the override with a partial body, restore from the backup and re-apply the full object.

---

## Inspecting the current override

```bash
truto environment-integrations show-override "$ENV_INTEGRATION_ID" -o json
```

Prints just the `override` object as it stands today. Empty `{}` means no overrides are set and the integration's defaults are in effect.

For the full row including merged-in metadata, use the standard `get`:

```bash
truto environment-integrations get "$ENV_INTEGRATION_ID" -o json
```

---

## Removing an override

Each helper supports `--clear`, which sets the corresponding override slot to `null`:

```bash
truto environment-integrations override-auth "$ENV_INTEGRATION_ID" --clear
truto environment-integrations override-pagination "$ENV_INTEGRATION_ID" --clear
truto environment-integrations override-rate-limit "$ENV_INTEGRATION_ID" --clear
truto environment-integrations override-webhook "$ENV_INTEGRATION_ID" --clear
```

Setting an override slot to `null` reverts that surface to the integration's base behavior. The other override slots are untouched.

To clear **all** overrides on a row at once:

```bash
truto environment-integrations update "$ENV_INTEGRATION_ID" -b '{"override":{}}'
```

---

## Testing changes

For most overrides, the fastest verification is an end-to-end call:

```bash
# Auth, pagination, rate-limit
truto unified <model> <resource> -a "$ACCOUNT_ID" -v -o json

# Or via proxy if your unified API isn't wired for the resource
truto proxy <resource> -a "$ACCOUNT_ID" -v -o json
```

`-v` prints the outbound request and inbound response to stderr — you can verify the new auth header is attached, that pagination is being walked correctly, and that rate-limit back-offs trigger when expected.

For inbound webhooks, the easiest check is to:

1. Trigger a real event in the third-party app.
2. Tail your outbound webhook subscriber logs for the resulting `record:*` event.
3. Confirm the `payload_transform` produced the shape you expected.

If the third-party app supports a "test event" or "send sample webhook" button (Slack, HubSpot, GitHub all do), use that — much faster than waiting for a real change.

---

## Direct HTTP API

`PATCH /environment-integration/:id` **replaces** the `override` column with the body you send — same as CLI `update`. The `override-*` helpers are the only path that fetch+merge for you (one slot at a time).

```bash
# Wrong — wipes every override key not listed
curl -X PATCH "https://api.truto.one/environment-integration/$ENV_INTEGRATION_ID" \
  -H "Authorization: Bearer $TRUTO_API_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"override":{"authorization":{"format":"bearer"}}}'

# Right — send the FULL override (existing slots + your change)
curl -X PATCH "https://api.truto.one/environment-integration/$ENV_INTEGRATION_ID" \
  -H "Authorization: Bearer $TRUTO_API_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "override": {
      "pagination": { "format": "cursor", "config": { "cursor_path": "meta.next" } },
      "authorization": {
        "format": "header",
        "config": {
          "expression": "{ \"Authorization\": \"Bearer \" & context.access_token, \"X-Org-Id\": context.org_id }"
        }
      },
      "resources": { "...": "include every existing resource override too" }
    }
  }'
```

Semantics:

- **Replace, not merge** on both API and CLI `update`.
- Prefer `override-*` helpers for auth / pagination / rate_limit / webhook.
- For `resources`, `show-override` → merge locally → send the complete override.
- To clear all slots: `{"override":{}}`.

---

## Common gotchas

- **`override` is a full replace.** A partial `update` / `PATCH` body wipes omitted slots and omitted `resources` keys (e.g. `pages` / `blocks` / `file_uploads`). Always send the complete override. See [§5](#5-override-resources-full-override-required).
- **Backtick-quote keys with hyphens or special characters in JSONata.** `` headers.`x-rate-limit` ``, `` $.body.`event-type` ``. JSONata's dot syntax doesn't accept hyphens.
- **`{{...}}` is placeholder syntax, not JSONata.** In `authorization.config` (`value`, `headers`, `username`, `password`), placeholders such as `{{api_key}}` or `{{oauth.token.access_token}}` resolve against the integrated account's `context`. In `signature_verification.config` they resolve against the inbound payload (`{{raw_body}}`, `{{headers.x-signature}}`, `{{context.webhook_secret}}`). JSONata `$` functions don't run in those fields. See [Sync Jobs § Templating placeholders vs JSONata](./sync-jobs.md#templating-placeholders-vs-jsonata) for the distinction.
- **Override is per-environment-integration, not per-account.** All accounts in the environment share the override. To change HTTP behavior for one connected account, set `integration_override` on that integrated account (`PATCH /integrated-account/:id`); it deep-merges into the integration config for that account only. For data-shape changes on one account, use `unified_model_override` ([Unified API Customization Workflow 2](./unified-api-customization.md#workflow-2--override-one-connected-account)).
- **Dynamic pagination and inbound webhooks are the heaviest JSONata users in the integration override surface.** Lean on `truto environment-integrations show-override <id>` after each patch to verify the override landed in the slot you expected before debugging the JSONata.
- **Only `override-*` helpers merge for you.** `override-auth` / `override-pagination` / `override-rate-limit` / `override-webhook` fetch + shallow-merge one slot, then PATCH the complete object. CLI `update` and raw HTTP do not — you supply the full override.
- **Sandbox accounts can read with overridden auth/pagination but cannot write.** The proxy and unified APIs return `405` for write operations against sandbox-flagged integrated accounts regardless of overrides.

---

## Related references

- **[Unified API Customization](./unified-api-customization.md)** — overriding the data-shape mapping between the integration and your unified model (the layer above this one).
- **[Webhooks & Notifications](./webhooks-and-notifications.md)** — outbound webhook subscriptions (your URL receives `record:*` events from Truto).
- **[Integrated Account Context](./integrated-account-context.md)** — what's in the `context` object that JSONata override expressions can read.
- **[truto-jsonata: Usage in Truto §4](../../truto-jsonata/references/usage-in-truto.md#4-environment-integration-overrides--auth-pagination-rate-limit-webhooks)** — full per-field JSONata scope tables for every override surface.
- **[Truto CLI: Admin Commands](../../truto-cli/references/admin-commands.md#environment-integrations-truto-environment-integrations)** — the complete `environment-integrations` command surface.
