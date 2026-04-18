# Customizing Integrations (HTTP-Layer Overrides)

Truto's pre-built integrations ship with sensible defaults for **auth headers**, **pagination**, **rate-limit detection**, and **inbound webhook handling**. When a particular customer's environment needs different behavior — a non-standard auth header, a custom pagination scheme, an unusual rate-limit response, or a webhook payload that needs reshaping — you override that behavior on a per-environment basis without forking the integration.

This is the HTTP-layer counterpart to [Unified API Customization](./unified-api-customization.md). Where unified customization changes how data is **mapped into your unified shape**, integration customization changes how Truto **talks to the third-party service** in the first place.

> **Mental model.** Each integration has a base config that ships with Truto. Each `environment-integration` row is the per-environment install of that integration; its `override` object deep-merges over the base config at runtime. You only set the keys you want to change.

> **JSONata.** Every override field that takes an expression uses JSONata. For the per-field scope variables and function reference, see [truto-jsonata: Usage in Truto §4 — Environment integration overrides](../../truto-jsonata/references/usage-in-truto.md#4-environment-integration-overrides--auth-pagination-rate-limit-webhooks).

---

## What you can override

| Surface | Override path | What it controls |
|---|---|---|
| **Authorization** | `override.authorization` | The header(s) attached to outbound requests (Bearer, custom header, Basic). |
| **Pagination** | `override.pagination` | How Truto walks paginated responses (page, cursor, link header, offset, range, dynamic). |
| **Rate limit** | `override.rate_limit` | How Truto detects throttling and chooses a back-off interval. |
| **Webhook (inbound)** | `override.webhook` | How Truto verifies, transforms, and acknowledges inbound webhooks for the integration. |
| **Error detection** | `override.error_expression` (and per-resource-method `error_expression`) | When a response should be treated as an error. (Documented in the [JSONata reference](../../truto-jsonata/references/usage-in-truto.md#error_expression--detect-http-errors).) |

The CLI exposes a dedicated helper for each of the first four. Each helper writes into the right slot under `environment-integration.override` so you don't have to hand-assemble the override JSON.

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
# Bearer token from the integrated account's context.access_token (the default for OAuth2 integrations)
truto environment-integrations override-auth "$ENV_INTEGRATION_ID" \
  --format bearer

# Single static header
truto environment-integrations override-auth "$ENV_INTEGRATION_ID" \
  --format header \
  --config '{"header_name":"X-Api-Key","header_value":"{{credentials.api_key}}"}'

# Basic auth (username + password from credentials)
truto environment-integrations override-auth "$ENV_INTEGRATION_ID" \
  --format basic \
  --config '{"username":"{{credentials.username}}","password":"{{credentials.password}}"}'

# Dynamic header value computed via JSONata (when "format": "header" + "expression")
truto environment-integrations override-auth "$ENV_INTEGRATION_ID" \
  -b '{
    "format": "header",
    "config": {
      "expression": "{ \"Authorization\": \"Bearer \" & context.access_token, \"X-Tenant\": context.tenant_id }"
    }
  }'

# Clear the override (revert to integration default)
truto environment-integrations override-auth "$ENV_INTEGRATION_ID" --clear
```

### Format options

| Format | When to use | `config` shape |
|---|---|---|
| `bearer` | The integration ships with `Authorization: Bearer <token>` — token comes from `context.access_token`. No config needed. | (none) |
| `header` | A single static header, optionally with `{{credentials.*}}` placeholder substitution. | `{ "header_name": "...", "header_value": "..." }` |
| `header` + `expression` | A dynamic header set built by a JSONata expression. The expression returns the headers object to attach. | `{ "expression": "<jsonata>" }` |
| `basic` | HTTP Basic Auth. | `{ "username": "...", "password": "..." }` |

The `expression` form is the most flexible — see the [JSONata scope](#jsonata-scope-for-authorizationconfigexpression) below.

### JSONata scope for `authorization.config.expression`

| Variable | What it is |
|---|---|
| `url` | The full outbound request URL string. |
| `requestOptions` | The request options Truto is about to send (`{ method, headers, body, ... }`). |
| `context` | The integrated account's `context` object — credentials, instance config, etc. |

Return value: an object whose keys are header names and whose values are header values (strings).

### Worked example — Multi-header auth derived from context

A customer needs every Salesforce request to include both a Bearer token and a custom `X-Org-Id` header derived from the account's instance config:

```bash
truto environment-integrations override-auth "$ENV_INTEGRATION_ID" \
  -b '{
    "format": "header",
    "config": {
      "expression": "{ \"Authorization\": \"Bearer \" & context.access_token, \"X-Org-Id\": context.org_id, \"X-Truto-Env\": \"prod\" }"
    }
  }'
```

After the override lands, every outbound request from that environment-integration will include all three headers.

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

When none of the canned formats fit, use `format: "dynamic"` and provide JSONata expressions. The most useful keys:

- `get_initial_pagination_values_expression` — initial `paginationValues` object before any request.
- `get_pagination_values_expression` — compute new `paginationValues` from the latest response. Return `null` to end the loop.
- `get_cursor_from_response_expression` — extract the cursor that gets surfaced to the unified-API caller as `next_cursor`. Return `undefined` for "no cursor".

**JSONata scope:**

| Variable | What it is |
|---|---|
| `query` | The unified-API caller's query (e.g. `query.cursor`, `query.limit`). |
| `url` | The current request URL string. |
| `requestOptions` | The current request's options (`{ method, headers, body, ... }`). |
| `response` | The latest HTTP response (cursor / values expressions only). |
| `body` | Shortcut for `response.body` (cursor / values expressions only). |
| `paginationValues` | The values returned by the previous iteration (cursor / values expressions only). |

### Worked example — Page-number pagination with a cap

Save this as `dynamic-pagination.json`:

```json
{
  "format": "dynamic",
  "config": {
    "get_initial_pagination_values_expression": "{ \"page\": 1 }",
    "get_pagination_values_expression": "$exists(body.next_page) and paginationValues.page < 50 ? { \"page\": paginationValues.page + 1 } : null",
    "get_cursor_from_response_expression": "body.next_page ? $string(body.next_page) : undefined"
  }
}
```

Apply it:

```bash
truto environment-integrations override-pagination "$ENV_INTEGRATION_ID" --stdin < dynamic-pagination.json
```

Truto will start at `page=1`, increment until `body.next_page` is missing **or** 50 pages are seen (whichever comes first), and surface the next-page number as the unified-API `next_cursor`.

---

## 3. Override rate-limit detection

Use this when the integration's default rate-limit detection misses a tenant-specific signal — for example, a customer is on a plan that returns `429` plus a custom `X-Plan-Quota-Reset` header instead of the standard `Retry-After`.

### CLI helper

```bash
# Per-flag — most readable for simple cases
truto environment-integrations override-rate-limit "$ENV_INTEGRATION_ID" \
  --is-rate-limited "status = 429 or headers.\`x-rate-limit-remaining\` = '0'" \
  --retry-after-header '$number(headers.`retry-after`)' \
  --rate-limit-header '$number(headers.`x-rate-limit-reset`)'

# Full block via -b for advanced overrides
truto environment-integrations override-rate-limit "$ENV_INTEGRATION_ID" \
  -b '{
    "is_rate_limited": "status = 429",
    "retry_after_header_expression": "$number(headers.`retry-after`)",
    "rate_limit_header_expression": "$number(headers.`x-plan-quota-reset`)"
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
| `rate_limit_header_expression` | **Absolute reset epoch** (seconds) — when the bucket refills. | number |

Truto picks the larger of `retry_after_header_expression` and the time until `rate_limit_header_expression`, so it's safe to provide both — the more conservative back-off wins.

**JSONata scope (all three):** `headers`, `status`.

### Worked example — Custom plan-quota header

A tenant is on a plan that returns `429` plus a custom `X-Plan-Quota-Reset: <epoch-seconds>` header rather than the standard `Retry-After`:

```bash
truto environment-integrations override-rate-limit "$ENV_INTEGRATION_ID" \
  --is-rate-limited 'status = 429' \
  --rate-limit-header '$number(headers.`x-plan-quota-reset`)'
```

Backtick-quote the header name in JSONata because it contains a hyphen.

---

## 4. Override inbound webhook handling

Use this for **inbound** webhooks — the third-party service posting to Truto's webhook URL. There are two pieces:

- **`handle_verification`** — runs first, before the payload is processed. Returns the verification response (e.g. echoing back a challenge for Slack/HubSpot URL verification). Return `null` to fall through to normal processing.
- **`payload_transform`** — runs after verification. Reshapes the raw body into the canonical event payload that Truto fan-outs to your subscribers (`record:*` events).

There's also a `signature_verification` block for HMAC/HMAC-SHA-style verification, configured declaratively (no JSONata).

> Outbound webhooks are configured separately via `truto webhooks` — see [Webhooks & Notifications](./webhooks-and-notifications.md).

### CLI helper

```bash
# Set handle_verification (e.g. to echo a Slack URL-verification challenge)
truto environment-integrations override-webhook "$ENV_INTEGRATION_ID" \
  --handle-verification \
  '$exists($.body.challenge) ? { "statusCode": 200, "body": $.body.challenge } : null'

# Set payload_transform (reshape the inbound body into Truto's canonical event shape)
truto environment-integrations override-webhook "$ENV_INTEGRATION_ID" \
  --payload-transform \
  '$.body.events.{ "event_type": type, "resource_id": object_id, "raw": $ }'

# Set signature_verification declaratively
truto environment-integrations override-webhook "$ENV_INTEGRATION_ID" \
  --signature-verification \
  '{"format":"hmac","config":{"algorithm":"sha256","parts":["$body"],"secret":"{{credentials.webhook_secret}}","compare_with":"$header.x-signature"}}'

# Set everything in one shot via the full block
truto environment-integrations override-webhook "$ENV_INTEGRATION_ID" \
  --stdin < webhook-override.json

# Clear
truto environment-integrations override-webhook "$ENV_INTEGRATION_ID" --clear
```

You can combine `--handle-verification`, `--payload-transform`, and `--signature-verification` in a single invocation — each maps to a separate key under `override.webhook` and they're sent together.

### `handle_verification`

**JSONata scope:** the inbound webhook payload as the JSONata input (root). Use `$.body`, `$.headers`, `$.query` to access parts of the request.

Return value:

- An object `{ "statusCode": 200, "body": "..." }` to send a verification response and stop processing.
- `null` to fall through to `payload_transform` and normal event processing.

### `payload_transform`

**JSONata scope:** same as above (inbound payload as root).

Return value: an array of normalized event objects. Truto fan-outs one outbound `record:*` event per element.

### Worked example — Slack URL verification + event reshape

Slack sends both a one-time URL-verification challenge and ongoing event callbacks to the same endpoint. Save this as `slack-webhook.json`:

```json
{
  "handle_verification": "$exists($.body.challenge) ? { \"statusCode\": 200, \"body\": $.body.challenge } : null",
  "payload_transform": "[{ \"event_type\": $.body.event.type, \"resource_id\": $.body.event.user, \"channel\": $.body.event.channel, \"team\": $.body.team_id, \"raw\": $.body }]",
  "signature_verification": {
    "format": "hmac",
    "config": {
      "algorithm": "sha256",
      "parts": ["v0:", "$header.x-slack-request-timestamp", ":", "$body"],
      "secret": "{{credentials.signing_secret}}",
      "compare_with": "v0=$header.x-slack-signature"
    }
  }
}
```

Apply it:

```bash
truto environment-integrations override-webhook "$ENV_INTEGRATION_ID" --stdin < slack-webhook.json
```

After that:

1. Slack's URL-verification POST gets the challenge echoed back.
2. Every subsequent event has its HMAC signature verified.
3. The verified event is reshaped into Truto's canonical shape and fan-outed to your subscribers.

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

Every CLI helper above is sugar over a single `PATCH /environment-integration/:id` call that deep-merges the relevant slot into `override`. If you can't run the CLI, send the equivalent body yourself:

```bash
curl -X PATCH "https://api.truto.one/environment-integration/$ENV_INTEGRATION_ID" \
  -H "Authorization: Bearer $TRUTO_API_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "override": {
      "authorization": {
        "format": "header",
        "config": {
          "expression": "{ \"Authorization\": \"Bearer \" & context.access_token, \"X-Org-Id\": context.org_id }"
        }
      },
      "rate_limit": {
        "is_rate_limited": "status = 429",
        "retry_after_header_expression": "$number(headers.`retry-after`)"
      }
    }
  }'
```

Slot semantics:

- The body is **deep-merged** into the existing `override`. Sending `{"override":{"authorization":{...}}}` won't drop `pagination` or `rate_limit` overrides.
- To clear a single slot, send it as `null`: `{"override":{"webhook":null}}`.
- To clear all slots at once, send `{"override":{}}`.

---

## Common gotchas

- **Backtick-quote keys with hyphens or special characters in JSONata.** `` headers.`x-rate-limit` ``, `` $.body.`event-type` ``. JSONata's dot syntax doesn't accept hyphens.
- **`{{credentials.*}}` is placeholder syntax, not JSONata.** Inside `header_name`/`header_value` and `signature_verification.config`, Truto resolves `{{credentials.api_key}}` style placeholders against the integrated account's credentials before sending. JSONata `$` functions don't run in those fields. See [Sync Jobs § Templating placeholders vs JSONata](./sync-jobs.md#templating-placeholders-vs-jsonata) for the distinction.
- **Override is per-environment-integration, not per-account.** All accounts in the environment share the override. To override behavior for a single connected account, use the per-account override on the unified-mapping side ([Unified API Customization Workflow 2](./unified-api-customization.md#workflow-2--override-one-connected-account)) — the HTTP layer does not have a per-account override slot.
- **Dynamic pagination and inbound webhooks are the heaviest JSONata users in the integration override surface.** Lean on `truto environment-integrations show-override <id>` after each patch to verify the override landed in the slot you expected before debugging the JSONata.
- **`PATCH` is a deep merge, not a replace.** The CLI helpers always patch the right slot — but if you're sending the JSON body yourself, remember that the existing `override` is preserved unless you explicitly `null` the keys you want to remove.
- **Sandbox accounts can read with overridden auth/pagination but cannot write.** The proxy and unified APIs return `405` for write operations against sandbox-flagged integrated accounts regardless of overrides.

---

## Related references

- **[Unified API Customization](./unified-api-customization.md)** — overriding the data-shape mapping between the integration and your unified model (the layer above this one).
- **[Webhooks & Notifications](./webhooks-and-notifications.md)** — outbound webhook subscriptions (your URL receives `record:*` events from Truto).
- **[Integrated Account Context](./integrated-account-context.md)** — what's in the `context` object that JSONata override expressions can read.
- **[truto-jsonata: Usage in Truto §4](../../truto-jsonata/references/usage-in-truto.md#4-environment-integration-overrides--auth-pagination-rate-limit-webhooks)** — full per-field JSONata scope tables for every override surface.
- **[Truto CLI: Admin Commands](../../truto-cli/references/admin-commands.md#environment-integrations-truto-environment-integrations)** — the complete `environment-integrations` command surface.
