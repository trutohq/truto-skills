# Authoring an Integration

An **integration** is a versioned definition of how Truto talks to one third-party service: how a customer authenticates, which HTTP endpoints expose which resources, how pagination works, how inbound webhooks are verified and reshaped, and what runs after a successful connection. Truto ships ~200 integrations, but you can author your own — they live alongside the built-ins and become available through the same Link UI, unified API, proxy API, and sync-job pipeline.

This reference documents the full `integration.config` schema, the five supported credential formats, the recommended scaffold + validate + push workflow, and a worked end-to-end example. For per-environment HTTP-layer **overrides** of an existing integration (override the auth header for one environment, swap pagination, customize rate-limit detection), see [Customizing Integrations](./customizing-integrations.md) instead — that's the layer above this one.

> **Mental model.** An `integration` is the *definition*. An `environment-integration` is one environment's *install* of that definition (with optional overrides). An `integrated-account` is one customer's *connected instance* under that environment-integration. You author at the integration layer; the install + connection layers are managed via the dashboard or `truto environment-integrations` and Truto Link.

> **JSONata.** Several `integration.config` fields are JSONata expressions (auth header expressions, dynamic pagination, rate-limit detection, inbound webhook handling, error detection, custom action steps). For per-field scope variables and the function reference, see [truto-jsonata: Usage in Truto](../../truto-jsonata/references/usage-in-truto.md).

> **Spec source of truth.** Every shape below is typed in [`openapi.yml`](https://github.com/trutohq/truto/blob/main/openapi.yml) (search for the `IntegrationConfig`, `IntegrationCredential`, `IntegrationResourceMethod`, `IntegrationPagination`, `IntegrationAuthorization`, `IntegrationWebhookConfig`, `IntegrationRateLimit`, and `IntegrationAction` components) and validated server-side against [`IntegrationConfigSchema`](https://github.com/trutohq/truto/blob/main/src/integration/integrationSchema.ts) on every `POST /integration` and `PATCH /integration/{id}`. The CLI's `truto integrations validate` consumes the same OpenAPI spec, so anything that passes locally will pass on create/update.

---

## When to author a new integration

Use this workflow when the integration you need **doesn't exist** in Truto's catalog. Two common cases:

1. **Customer-private integration** — an internal tool (your own product's API, a private partner API, an ERP that no one else needs) that should appear in your own Link UI alongside the built-ins.
2. **Pre-shipping a new public integration** — you want to ship support for a third-party service before Truto adds it to the catalog. You can author it now and Truto can later promote it to a built-in without breaking your config.

If the integration *exists* but you need to tweak its HTTP behavior (custom auth header, different pagination, different rate-limit signal, custom inbound webhook handling), don't fork it — use the per-environment override surface in [Customizing Integrations](./customizing-integrations.md). If the integration exists and you only need to surface extra fields or tweak the unified-API mapping, see [Unified API Customization](./unified-api-customization.md).

---

## Recommended workflow — `init`, `validate`, push

The CLI exposes the full author loop in three commands. Run them in order.

### 1. Scaffold a starter config

```bash
truto integrations init acme-crm
```

This drops you into an interactive prompt that collects the slug, label, category, base URL, auth format, resources, and an optional webhook block. The prompt is **schema-aware** — the auth-format picker is built from the `IntegrationCredential` `oneOf` discriminator in `openapi.yml`, so it always reflects what the platform accepts.

Skip the prompt with flags when you know what you want:

```bash
truto integrations init acme-crm \
  --label "Acme CRM" \
  --category crm \
  --auth api_key \
  --base-url https://api.acme.com/v1 \
  --resources contacts,deals \
  --webhook
```

To inspect the scaffold without creating the integration, pass `--print` (stdout) or `--out path` (file):

```bash
truto integrations init acme-crm \
  --auth api_key --base-url https://api.acme.com/v1 \
  --resources contacts,deals --webhook \
  --out acme-crm.json
```

The output is a valid `integration.config` blob you can hand-edit before pushing. The scaffold seeds `credentials`, `authorization`, a CRUD method skeleton per resource, and (optionally) a webhook receiver block — see [What `init` produces](#what-init-produces) below for the full shape.

### 2. Validate locally

Once you've edited the scaffold, lint it before sending it to the platform:

```bash
# Local file
truto integrations validate --file acme-crm.json

# Stdin
cat acme-crm.json | truto integrations validate --stdin

# Already-pushed integration (re-checks the stored config)
truto integrations validate <integration-id>
```

`validate` checks the config against the same `IntegrationConfig` component the backend validates against — it catches unknown enum values, missing required nested fields, type mismatches, and the recommended-but-technically-optional `label` and `credentials` keys. Errors are printed with a JSON path (e.g. `credentials.config.auth.tokenHost: Required string is missing`) so you can fix and re-run.

### 3. Push to the platform

If you scaffolded with neither `--print` nor `--out`, `init` already pushed the integration and printed its `id`. If you scaffolded to a file (`--out`) and edited it, push manually:

```bash
truto integrations create -b "$(cat acme-crm.json | jq -c '{name:"acme-crm", config:.}')"
```

…or update an existing integration in place (note the required `version` for optimistic locking):

```bash
CURRENT_VERSION=$(truto integrations get <id> -o json | jq -r .version)
truto integrations update <id> -b "$(jq -c \
  --argjson v "$CURRENT_VERSION" \
  '{config:., version:$v}' acme-crm.json)"
```

After this, install the integration into one of your environments and connect a test account — see [What's next after authoring](#whats-next-after-authoring) below.

---

## The `integration.config` schema

`integration.config` is a single JSON object stored on the `integration` row. The full typed shape is `IntegrationConfig` in [`openapi.yml`](https://github.com/trutohq/truto/blob/main/openapi.yml) and `IntegrationConfigSchema` in [`integrationSchema.ts:376–413`](https://github.com/trutohq/truto/blob/main/src/integration/integrationSchema.ts#L376). What follows is the field-by-field reference.

### Top-level fields

| Field | Type | Required | Purpose |
|---|---|---|---|
| `label` | string | Recommended | Human-readable name shown in the Truto Dashboard and Link UI. Without this, the integration appears under its slug. |
| `base_url` | string | Recommended | Default URL prepended to every resource method's `path`. Per-method `base_url` overrides this. |
| `logo` | string \| null | No | URL to a square (256×256 recommended) catalog logo. |
| `icon` | string \| null | No | URL to a smaller monochrome icon used in Link list views. |
| `headers` | `{ [key]: string \| null }` | No | Default headers merged into every outbound request. Values may use `{{credentials.*}}` placeholders. Setting a value to `null` removes the header even if a per-method config sets it. |
| `query` | `{ [key]: string }` \| null | No | Default query-string params merged into every outbound request. |
| `query_array_format` | `comma \| brackets \| indices \| repeat` \| null | No | How array query values are serialized (e.g. `?ids=1,2` vs `?ids[]=1&ids[]=2`). Per-method `query_array_format` overrides this. |
| `credentials` | `IntegrationCredential` \| `{ [format]: IntegrationCredential }` | Recommended | How customers authenticate. A single object when there's one supported format; a map keyed by format name when there are several. See [Credentials](#credentials). |
| `authorization` | `IntegrationAuthorization` | Recommended | How the credential is attached to outbound HTTP requests. See [Authorization](#authorization). |
| `pagination` | `IntegrationPagination` \| null | No | Default pagination strategy for every resource method. Per-method `pagination` overrides this. See [Pagination](#pagination). |
| `rate_limit` | `IntegrationRateLimit` \| null | No | How Truto detects and reacts to upstream rate-limiting. See [Rate limit](#rate-limit). |
| `resources` | `{ [resource]: { [method]: IntegrationResourceMethod } }` | Recommended | The HTTP endpoints. Outer key is the resource name (e.g. `contacts`), inner key is the method name (e.g. `list`, `get`, or a custom name like `merge`). See [Resources & methods](#resources--methods). |
| `webhook` | `IntegrationWebhookConfig` \| null | No | Inbound webhook receiver: signature verification, verification handshake, payload reshape. See [Webhooks (inbound)](#webhooks-inbound). |
| `actions` | `{ [action]: IntegrationAction }` | No | Lifecycle hooks (`post_install`, `validation`, `refresh_token`, `post_connect_user_form`) and arbitrary named actions. See [Actions (lifecycle hooks)](#actions-lifecycle-hooks). |
| `error_expression` | string \| null | No | Integration-wide JSONata expression that detects errors. Per-method `error_expression` overrides this. |
| `tool_tags` | `{ [resource]: string[] }` | No | Optional resource-tag arrays surfaced in the Truto MCP tool listings (`truto integrations tools <id>`). |

`label`, `credentials`, `authorization`, and `resources` are technically optional in the spec but the integration is unusable in the dashboard / Link UI without them, so `truto integrations validate` flags missing `label` and `credentials` as issues.

---

## Credentials

The `credentials` field describes what the customer enters or grants in the Link UI when connecting. Five credential formats are typed in `openapi.yml` as `IntegrationCredential`, discriminated by the `format` key:

| `format` | Component | What the customer sees | When to use |
|---|---|---|---|
| `api_key` | `IntegrationApiKeyCredential` | A form of one or more text/password fields. | Static API keys, personal access tokens, app secrets. Also the underlying shape for **HTTP Basic** (collect `username` + `password` as fields). |
| `oauth2` | `IntegrationOAuth2Credential` | An "Authorize with X" button that opens the vendor's OAuth 2.0 authorize page. | OAuth 2.0 authorization-code flow (most modern SaaS APIs). Optional PKCE, BYOA-ready. |
| `oauth2_client_credentials` | `IntegrationOAuth2ClientCredential` | Two fields (`client_id` + `client_secret`); Truto fetches a token via the client-credentials grant. | Service-to-service integrations with no end-user (data warehouses, internal APIs). |
| `oauth` | `IntegrationOAuthCredential` | A 3-legged OAuth 1.0a redirect flow. | Legacy APIs (older Twitter, Trello, some bookkeeping tools). Rare. |
| `keka_oauth` | `IntegrationKekaOAuthCredential` | A combined `client_id` + `client_secret` + `api_key` form. | Vendor-specific shape used by the Keka HRMS connector. |

> **Single vs. multi-format.** When an integration only supports one auth format, `credentials` is a single `IntegrationCredential` object. When it supports several (e.g. an integration that accepts either OAuth or a personal API key), `credentials` is a map keyed by format name: `{ "api_key": { ... }, "oauth2": { ... } }`. The customer picks one in the Link UI.

For the per-format `config` shape (which fields go where), see the typed components in `openapi.yml` and the source schemas in [`integrationSchema.ts:73–239`](https://github.com/trutohq/truto/blob/main/src/integration/integrationSchema.ts#L73).

### `api_key` (and `basic`)

```json
{
  "credentials": {
    "format": "api_key",
    "config": {
      "documentation_link": "https://docs.acme.com/api-keys",
      "permissions_text": "Needs read access to contacts and deals.",
      "fields": [
        {
          "name": "api_key",
          "label": "API Key",
          "type": "password",
          "required": true,
          "help_text": "Find this under Settings → Developer."
        }
      ]
    }
  }
}
```

The customer sees a Link form with one password field; the value lands in `context.api_key` on the integrated account, addressable as `{{credentials.api_key}}` from `authorization` and `headers` templates.

For **HTTP Basic Auth**, use `format: "api_key"` with two fields (`username` + `password`):

```json
{
  "credentials": {
    "format": "api_key",
    "config": {
      "fields": [
        { "name": "username", "label": "Username", "type": "text",     "required": true },
        { "name": "password", "label": "Password", "type": "password", "required": true }
      ]
    }
  }
}
```

…then set `authorization.format` to `basic` (see below). `truto integrations init --auth basic` produces this shape.

### `oauth2`

```json
{
  "credentials": {
    "format": "oauth2",
    "config": {
      "client": { "id": "<truto-managed-client-id>", "secret": "<truto-managed-secret>" },
      "auth": {
        "tokenHost":     "https://auth.acme.com",
        "tokenPath":     "/oauth/token",
        "authorizeHost": "https://auth.acme.com",
        "authorizePath": "/oauth/authorize",
        "refreshPath":   "/oauth/token"
      },
      "scope": ["read:contacts", "read:deals"],
      "documentation_link": "https://docs.acme.com/oauth"
    }
  }
}
```

Truto runs the authorization-code flow, exchanges the code for an access token, and stores it on the account's context. The token is automatically used by `authorization.format: "bearer"`. For PKCE, BYOA (Bring Your Own App), refresh-token semantics, and customer-collected pre-OAuth fields (e.g. a `subdomain`), see the full `IntegrationOAuth2Credential` component in `openapi.yml`.

> **BYOA — Bring Your Own App.** When a customer wants to use *their own* OAuth client (their app's branded consent screen, their app's rate-limit allowance) instead of Truto's, they install the integration with an `environment-integration.override.credentials` blob that supplies their `client.id` and `client.secret`. The base integration ships with a "dummy" or shared client; the env-integration override replaces it. See [Customizing Integrations § Override authorization](./customizing-integrations.md#1-override-authorization) and the `EnvironmentIntegrationCredentialOverride` component in `openapi.yml`.

### `oauth2_client_credentials`

```json
{
  "credentials": {
    "format": "oauth2_client_credentials",
    "config": {
      "auth": {
        "tokenHost": "https://auth.acme.com",
        "tokenPath": "/oauth/token"
      },
      "fields": [
        { "name": "client_id",     "label": "Client ID",     "type": "text",     "required": true },
        { "name": "client_secret", "label": "Client Secret", "type": "password", "required": true }
      ]
    }
  }
}
```

The customer enters their `client_id` + `client_secret` in Link; Truto exchanges them via the client-credentials grant and stores the token on the account.

### `oauth` (1.0a)

Three-legged OAuth 1.0a — `requestTokenUrl` → `authorizeUrl` → `tokenUrl`. See [`IntegrationOAuthCredential`](https://github.com/trutohq/truto/blob/main/openapi.yml) for the full shape. Rare.

### `keka_oauth`

Vendor-specific composite of an OAuth client + an API key. See [`IntegrationKekaOAuthCredential`](https://github.com/trutohq/truto/blob/main/openapi.yml). Used by the Keka integration; you'd only define one if you're authoring a Keka-shaped vendor connector.

### Field shape — `IntegrationField`

Every credential's `config.fields` array holds `IntegrationField` objects, also typed in `openapi.yml`:

| Field | Type | Purpose |
|---|---|---|
| `name` | string | Stable identifier referenced from JSONata placeholders (`{{credentials.<name>}}`). |
| `label` | string | Display label in the Link UI. |
| `type` | `text \| password \| single_select` | How the field is rendered. |
| `required` | boolean | Whether the user must supply a value. |
| `default` | string | Pre-filled value. |
| `format` | `email \| number \| uuid \| url` \| custom regex name | Optional client-side validation hint. |
| `transform` | `lowercase \| uppercase \| sha256` \| null | Server-side transform applied before storing. |
| `placeholder`, `help_text`, `pattern` | string | UI hints. |
| `options` | `[{ label, value }]` | Required when `type` is `single_select`. |

---

## Authorization

`authorization` describes how the credential is attached to outbound HTTP requests, after credentials are collected. Three formats, typed as `IntegrationAuthorization` in `openapi.yml`:

| `format` | What it does | Typical `config` |
|---|---|---|
| `bearer` | Adds `Authorization: Bearer <token>`. Token comes from `context.access_token` (set by the OAuth dance). | (usually none) |
| `header` | Sets one or more arbitrary headers, optionally with `{{credentials.*}}` placeholders or a JSONata expression. | `{ "header_name": "...", "header_value": "..." }` or `{ "expression": "<jsonata>" }` |
| `basic` | HTTP Basic with `username` + `password` (typically `{{credentials.username}}` / `{{credentials.password}}`). | `{ "username": "...", "password": "..." }` |

The default for OAuth-family credential formats (`oauth2`, `oauth2_client_credentials`, `oauth`) is `bearer`. The default for `api_key` is a `header` config with `Authorization: Bearer {{credentials.api_key}}` — change it if your vendor uses a different header (e.g. `X-Api-Key`).

Example — vendor that wants the API key in a custom header:

```json
{
  "authorization": {
    "format": "header",
    "config": {
      "header_name":  "X-Api-Key",
      "header_value": "{{credentials.api_key}}"
    }
  }
}
```

Example — JSONata expression that builds multiple headers from the account's context:

```json
{
  "authorization": {
    "format": "header",
    "config": {
      "expression": "{ 'Authorization': 'Bearer ' & context.access_token, 'X-Org-Id': context.org_id }"
    }
  }
}
```

For the JSONata scope (`url`, `requestOptions`, `context`), see [truto-jsonata: Usage in Truto §4 — Environment integration overrides](../../truto-jsonata/references/usage-in-truto.md#4-environment-integration-overrides--auth-pagination-rate-limit-webhooks) — the same scope applies whether the expression is on the base integration or on a per-environment override.

---

## Resources & methods

`resources` is a two-level map: outer key is the resource name (`contacts`, `deals`, `tickets`), inner key is the method name (`list`, `get`, `create`, `update`, `delete`, plus any custom method like `merge`, `archive`, `bulk_create`). Each leaf is an `IntegrationResourceMethod` — typed in `openapi.yml` and mirroring [`ResourceMethodSchema`](https://github.com/trutohq/truto/blob/main/src/integration/integrationSchema.ts#L296) (~30 fields).

The full per-method field set:

| Field | Type | Purpose |
|---|---|---|
| `path` | string (required) | URL path appended to `base_url`. Supports `{{placeholder}}` substitution from `id`, `body`, `query`, and `context`. |
| `method` | `get \| post \| put \| patch \| delete` (default `get`) | HTTP verb. |
| `base_url` | string | Override the integration's `base_url` for this single method. |
| `headers` | object | Static or templated request headers merged with integration-level `headers`. |
| `query` | object | Static or templated query-string params merged with caller-supplied `query`. |
| `query_array_format` | `comma \| brackets \| indices \| repeat` | How array values are serialized (overrides integration-level). |
| `body` | object | Static or templated request body for `post`/`put`/`patch` methods. |
| `body_format` | `json \| form \| multipart \| raw \| xml` | How the request body is serialized. Defaults to `json`. |
| `body_format_config` | object | Extra options for the chosen `body_format` (e.g. multipart boundary). |
| `query_schema` / `body_schema` / `response_schema` | JSON-schema-like declaration | Used by Truto's MCP/tooling to describe the surface. May be a JSONata string for dynamic schemas. |
| `response_path` | string | JSONata path into the response that contains the canonical resource. Defaults to root. |
| `pagination_path` | string | Optional alternate path for subsequent pagination pages (rare). |
| `pagination` | `IntegrationPagination` \| null | Override the integration-level pagination for this method. Set to `null` to disable on a method that would otherwise inherit. |
| `authorization` | `IntegrationAuthorization` | Override the integration-level authorization for this method. |
| `add_query_to_body` | boolean | For `post`/`put`/`patch`, copy caller's query params into the body. |
| `ignore_body_in_pagination` | boolean | Don't re-send the body when fetching subsequent pagination pages. |
| `ignore_body` / `set_body_to_null` | boolean | Drop the body entirely / send a literal JSON `null`. |
| `no_auth` | boolean | Skip applying the integration's authorization to this method (e.g. a public health check). |
| `ignore_credentials_on_redirect` | boolean | Strip `Authorization` when the upstream issues a cross-host redirect. |
| `api_response_format` | string | Override the response parser (e.g. `xml`, `text`). |
| `throw_error_on_parse_error` | boolean \| null | Fail loudly on unparseable responses vs. return a structured error. |
| `error_expression` | string \| null | JSONata expression that returns a truthy error message for non-error 2xx responses. |
| `description` | string | Human-readable description used in MCP tool listings. |
| `api_documentation_url` | string | URL to the upstream vendor's docs for this method. |
| `scopes` | string[] | OAuth scopes required to call this method. |
| `examples` | `{ response, query, body }` | Sample payloads stored as strings, used by docs and the MCP tool descriptions. |

### Standard methods — `list`, `get`, `create`, `update`, `delete`

The five canonical methods power Truto's [proxy API](./proxy-and-custom-api.md#proxy-api) and (when mapped) the [unified API](./unified-api.md). Use them when the upstream endpoint matches CRUD semantics. Example:

```json
{
  "resources": {
    "contacts": {
      "list":   { "method": "get",    "path": "/v1/contacts",        "response_path": "data" },
      "get":    { "method": "get",    "path": "/v1/contacts/{{id}}" },
      "create": { "method": "post",   "path": "/v1/contacts",        "body_format": "json" },
      "update": { "method": "patch",  "path": "/v1/contacts/{{id}}" },
      "delete": { "method": "delete", "path": "/v1/contacts/{{id}}" }
    }
  }
}
```

The `{{id}}` placeholder is filled from the path arg in `GET /proxy/contacts/{id}` calls; `{{body.<field>}}` and `{{query.<field>}}` are filled from the request payload.

### Custom methods

Any inner key that isn't one of the five canonical names is a **custom method** — an extra named endpoint on the resource, callable via `POST /proxy/{resource}/{methodName}`. Use this for vendor-specific actions (`contacts.merge`, `deals.bulk_update`, `files.download`). The shape is identical to standard methods.

```json
{
  "resources": {
    "contacts": {
      "merge": {
        "method": "post",
        "path":   "/v1/contacts/merge",
        "body":   { "primary_id": "{{body.primary_id}}", "duplicate_ids": "{{body.duplicate_ids}}" },
        "description": "Merge duplicate contacts into a single canonical record."
      }
    }
  }
}
```

For the full pattern (including the alternative `/custom/{path}` per-call shape), see [Proxy & Custom API → Authoring Custom-API Handlers](./proxy-and-custom-api.md#authoring-custom-api-handlers).

### Path placeholders vs. JSONata

Method `path`, `body`, `query`, and `headers` use the **`{{placeholder}}`** templating syntax (powered by [`@truto/replace-placeholders`](https://www.npmjs.com/package/@truto/replace-placeholders)). Available placeholder roots:

| Root | What it is |
|---|---|
| `{{id}}` | Path arg from `GET /proxy/{resource}/{id}` style routes. |
| `{{body.<field>}}` | Caller's request body. |
| `{{query.<field>}}` | Caller's query string. |
| `{{credentials.<field>}}` | Stored credentials (collected in the Link UI). |
| `{{context.<field>}}` | Anything else on the integrated account's `context` object. |

Placeholders are **not** JSONata — they're a separate templating language. Use `expression` blocks (in `authorization.config.expression`, dynamic pagination, rate-limit, webhook handling, action steps) when you need to compute a value via JSONata. See the [Sync Jobs reference §"Templating placeholders vs JSONata"](./sync-jobs.md#templating-placeholders-vs-jsonata) for the full distinction.

---

## Pagination

`pagination` is shared by every resource method unless a per-method `pagination` overrides it (or sets it to `null` to disable). Six strategies, typed as `IntegrationPagination` in `openapi.yml`:

| `format` | When to use | Typical `config` |
|---|---|---|
| `page` | Numbered pages: `?page=2&per_page=50`. | `{ "page_param": "page", "limit_param": "per_page" }` |
| `cursor` | Opaque cursor in the response body. | `{ "cursor_path": "next_cursor", "limit_param": "limit" }` |
| `link_header` | RFC 5988 `Link: <next-url>; rel="next"`. | (often none) |
| `offset` | Numeric offset and limit. | `{ "offset_param": "offset", "limit_param": "limit" }` |
| `range` | HTTP `Range` header. | `{ "range_unit": "items" }` (varies) |
| `dynamic` | Anything else. JSONata expressions drive the loop. | See below. |

Example — most APIs:

```json
{
  "pagination": {
    "format": "cursor",
    "config": { "cursor_path": "meta.next_cursor", "limit_param": "page_size" }
  }
}
```

For the **`dynamic`** strategy (full JSONata-driven loop with `get_initial_pagination_values_expression`, `get_pagination_values_expression`, `get_cursor_from_response_expression`), see [Customizing Integrations § Dynamic pagination](./customizing-integrations.md#dynamic-pagination) — the shape is identical whether you're authoring it on the base integration or overriding it per environment.

---

## Rate limit

`rate_limit` tells Truto how to detect upstream throttling and how long to back off. All three fields are JSONata expressions evaluated against the response (scope: `headers`, `status`):

```json
{
  "rate_limit": {
    "is_rate_limited":               "status = 429",
    "retry_after_header_expression": "$number(headers.`retry-after`)",
    "rate_limit_header_expression":  "$number(headers.`x-ratelimit-reset`)"
  }
}
```

| Field | Returns | Meaning |
|---|---|---|
| `is_rate_limited` | boolean | When truthy, Truto pauses the request and reschedules. |
| `retry_after_header_expression` | number | Seconds to wait before retrying. |
| `rate_limit_header_expression` | number | Absolute reset epoch (seconds) — when the bucket refills. |

Truto picks the larger of `retry_after` and the time until `rate_limit_header_expression`, so it's safe to provide both — the more conservative wait wins.

Backtick-quote header names with hyphens in JSONata: `` headers.`retry-after` ``.

---

## Webhooks (inbound)

`webhook` configures how Truto **receives** webhooks *from* the third-party service. (Truto's outbound webhooks *to your URL* are a separate resource — see [Webhooks & Notifications](./webhooks-and-notifications.md).) Three sub-fields, typed as `IntegrationWebhookConfig`:

| Field | Type | Purpose |
|---|---|---|
| `signature_verification` | `{ format, config }` | HMAC / JWT / basic-auth verification of the inbound request. Declarative, no JSONata. |
| `handle_verification` | string (JSONata) | Runs first. For vendors that send a one-time verification challenge (Slack `url_verification`, HubSpot URL-verify), echo it back. Return `null` to fall through to normal processing. |
| `payload_transform` | string (JSONata) | Runs after verification. Reshape the raw body into Truto's canonical event payload (an array of `{ event_type, resource_id, ... }` objects). |

### Signature verification

```json
{
  "webhook": {
    "signature_verification": {
      "format": "hmac",
      "config": {
        "algorithm":    "sha256",
        "parts":        ["$body"],
        "secret":       "{{credentials.webhook_secret}}",
        "compare_with": "$header.x-acme-signature"
      }
    }
  }
}
```

Common `format` values: `hmac`, `basic`, `jwt`, `clerk`, plus a handful of vendor-specific ones. The `config` shape is `IntegrationWebhookSignatureVerificationConfig` — the typed fields cover the union of every strategy:

| Field | Used by |
|---|---|
| `algorithm`, `secret`, `parts`, `compare_with`, `string_type` | HMAC-style strategies. |
| `username`, `password` | HTTP-basic verification. |
| `verification_content` | Multi-part signature strategies. |
| `context_lookup_field_name`, `context_lookup_field_value` | Routing the webhook to the correct integrated account when the webhook URL itself doesn't carry an account token. |

### `handle_verification` — handshake echo

Vendors like Slack send a one-time POST with a `challenge` string and expect the value echoed back. Use `handle_verification` to short-circuit the normal flow:

```json
{
  "webhook": {
    "handle_verification": "$exists($.body.challenge) ? { 'statusCode': 200, 'body': $.body.challenge } : null"
  }
}
```

Scope: the inbound request as the JSONata input root (`$.body`, `$.headers`, `$.query`). Return an object `{ statusCode, body }` to send a verification response and stop, or `null` to fall through.

### `payload_transform` — reshape into Truto events

After verification, Truto fan-outs one outbound event per element of the array your `payload_transform` returns:

```json
{
  "webhook": {
    "payload_transform": "$.body.events.{ 'event_type': $.type, 'resource_id': $.object_id, 'resource_type': $.object_type, 'raw': $ }"
  }
}
```

Each output object shows up to your subscribers as a `record:*` event.

For full per-field JSONata scope tables and worked examples (Slack URL-verify + event reshape, HubSpot signature verification, etc.), see [truto-jsonata: Usage in Truto §4](../../truto-jsonata/references/usage-in-truto.md#4-environment-integration-overrides--auth-pagination-rate-limit-webhooks). Authoring on the base integration uses the same shape that overrides use; the difference is just **where** it sits in the config tree.

---

## Actions (lifecycle hooks)

`actions` is a map of named hooks that run at specific points in the integrated-account lifecycle, plus arbitrary custom flows. Each value is an `IntegrationAction` with a `steps: IntegrationActionStep[]` array.

Reserved action names:

| Action | When it runs |
|---|---|
| `post_install` | After successful credential collection / OAuth dance, before the account becomes `active`. Typical use: fetch the user's company info, create a webhook subscription on the upstream, store derived context. |
| `validation` | Periodically (and on reconnect) to confirm the credential is still valid. Returns truthy on success. |
| `post_connect_user_form` | Renders an in-Link form after the OAuth dance to collect extra fields the customer needs to pick (e.g. "which workspace?"). Used with the [Truto Link RapidForm](../../truto-link-sdk/references/rapidform-and-file-pickers.md). |
| `refresh_token` | Custom token-refresh logic when the vendor's OAuth flow doesn't follow the standard refresh-token grant. |

Custom action names (anything else) are callable from the proxy/sync runtime as `POST /proxy/_/{action_name}`. Useful for one-shot vendor-specific operations (`run_sync`, `import_users`).

### Step types

Each step in `steps` is an `IntegrationActionStep` with a `type` and a `config`. Step types (typed as the enum in `IntegrationActionStep` in `openapi.yml`):

| `type` | What it does |
|---|---|
| `request` | Perform an HTTP call. `config` matches `IntegrationResourceMethod` (path, method, body, response_path, etc.). The response is exposed to subsequent steps. |
| `transform` | Apply a JSONata expression over the running step context. `config` is the expression string. |
| `update_context` / `set_context` | Write into the integrated account's `context` object. |
| `get_context` | Read from the running step context. |
| `form` | Pause and ask the connected user to fill a form (the `post_connect_user_form` hook). `config` is a fields array. |

Steps run sequentially with a shared context; a `transform` step's output becomes available to the next `request`'s body / query templating. The full per-type `config` union is in [`integrationSchema.ts:330–346`](https://github.com/trutohq/truto/blob/main/src/integration/integrationSchema.ts#L330).

### Example — `post_install` that fetches company info

```json
{
  "actions": {
    "post_install": {
      "steps": [
        {
          "type": "request",
          "config": {
            "method": "get",
            "path":   "/v1/account",
            "response_path": "data"
          }
        },
        {
          "type": "update_context",
          "config": {
            "expression": "{ 'org_id': $previous.id, 'plan': $previous.subscription.plan }"
          }
        }
      ]
    }
  }
}
```

After install, this calls `GET /v1/account`, takes `data` from the response, then writes `{ org_id, plan }` onto the account's context (where it's reachable as `{{context.org_id}}` from any subsequent request).

---

## Worked example — Acme CRM

Build an integration for a fictional **Acme CRM** with API-key auth, two resources (`contacts` CRUD + `deals` list/get), and an inbound webhook receiver. Acme's API:

- Base URL: `https://api.acme.com/v1`
- Auth: `Authorization: Bearer <api_key>` (the customer pastes a personal API key)
- Pagination: cursor-based, `next_cursor` in the response body
- Webhooks: HMAC-SHA256 signature in `X-Acme-Signature`, payload looks like `{ "events": [{ "type": "...", "object_id": "..." }] }`

### Step 1 — Scaffold

```bash
truto integrations init acme-crm \
  --label "Acme CRM" \
  --category crm \
  --auth api_key \
  --base-url https://api.acme.com/v1 \
  --resources contacts,deals \
  --webhook \
  --out acme-crm.json
```

`init` writes a starter config to `acme-crm.json` and exits without creating the integration (because `--out` was supplied). The starter looks like:

```json
{
  "base_url": "https://api.acme.com/v1",
  "label":    "Acme CRM",
  "credentials": {
    "format": "api_key",
    "config": {
      "documentation_link": "",
      "permissions_text":   "",
      "fields": [
        { "name": "api_key", "label": "API Key", "type": "password", "required": true,
          "help_text": "Find this in your account settings." }
      ]
    }
  },
  "authorization": {
    "format": "header",
    "config": {
      "header_name":  "Authorization",
      "header_value": "Bearer {{credentials.api_key}}"
    }
  },
  "resources": {
    "contacts": {
      "list":   { "method": "get",    "path": "/contacts",
                  "pagination": { "format": "cursor", "config": { "cursor_path": "next_cursor" } },
                  "response_path": "results" },
      "get":    { "method": "get",    "path": "/contacts/{{id}}" },
      "create": { "method": "post",   "path": "/contacts" },
      "update": { "method": "patch",  "path": "/contacts/{{id}}" },
      "delete": { "method": "delete", "path": "/contacts/{{id}}" }
    },
    "deals": {
      "list":   { "method": "get",    "path": "/deals",
                  "pagination": { "format": "cursor", "config": { "cursor_path": "next_cursor" } },
                  "response_path": "results" },
      "get":    { "method": "get",    "path": "/deals/{{id}}" },
      "create": { "method": "post",   "path": "/deals" },
      "update": { "method": "patch",  "path": "/deals/{{id}}" },
      "delete": { "method": "delete", "path": "/deals/{{id}}" }
    }
  },
  "webhook": {
    "signature_verification": {
      "format": "hmac",
      "config": {
        "algorithm":    "sha256",
        "parts":        ["$body"],
        "secret":       "{{credentials.webhook_secret}}",
        "compare_with": "$header.x-signature"
      }
    },
    "payload_transform": "{ \"event_type\": $event.type, \"data\": $event.data }"
  }
}
```

### Step 2 — Edit the scaffold to match Acme's actual shape

Three changes:

1. Acme's base path is `/v1` (already in `base_url`), but the resource paths shouldn't repeat `/v1`. Already correct.
2. `deals` is read-only (no create/update/delete). Drop those methods.
3. Acme's webhook signature is `X-Acme-Signature`, not `x-signature`. Acme also uses an `X-Acme-Webhook-Secret` field that the customer pastes in (separate from the API key) — add a second credential field for it. The payload is `{ "events": [...] }` not a single event, so reshape `payload_transform` accordingly.

The edited file:

```json
{
  "base_url": "https://api.acme.com/v1",
  "label":    "Acme CRM",
  "credentials": {
    "format": "api_key",
    "config": {
      "documentation_link": "https://docs.acme.com/api/api-keys",
      "permissions_text":   "Needs read access to contacts and deals, and a webhook signing secret if you plan to use webhooks.",
      "fields": [
        { "name": "api_key",        "label": "API Key",        "type": "password", "required": true,
          "help_text": "Settings → Developer → API Keys." },
        { "name": "webhook_secret", "label": "Webhook Secret", "type": "password", "required": false,
          "help_text": "Settings → Developer → Webhooks → Signing Secret. Optional unless you're using webhooks." }
      ]
    }
  },
  "authorization": {
    "format": "header",
    "config": {
      "header_name":  "Authorization",
      "header_value": "Bearer {{credentials.api_key}}"
    }
  },
  "pagination": {
    "format": "cursor",
    "config": { "cursor_path": "next_cursor", "limit_param": "limit" }
  },
  "rate_limit": {
    "is_rate_limited":               "status = 429",
    "retry_after_header_expression": "$number(headers.`retry-after`)"
  },
  "resources": {
    "contacts": {
      "list":   { "method": "get",    "path": "/contacts",        "response_path": "results",
                  "description": "List CRM contacts." },
      "get":    { "method": "get",    "path": "/contacts/{{id}}",
                  "description": "Get a single contact by ID." },
      "create": { "method": "post",   "path": "/contacts",
                  "description": "Create a new contact." },
      "update": { "method": "patch",  "path": "/contacts/{{id}}",
                  "description": "Update fields on an existing contact." },
      "delete": { "method": "delete", "path": "/contacts/{{id}}",
                  "description": "Delete a contact." }
    },
    "deals": {
      "list":   { "method": "get",    "path": "/deals",           "response_path": "results",
                  "description": "List deals (read-only)." },
      "get":    { "method": "get",    "path": "/deals/{{id}}",
                  "description": "Get a single deal by ID." }
    }
  },
  "webhook": {
    "signature_verification": {
      "format": "hmac",
      "config": {
        "algorithm":    "sha256",
        "parts":        ["$body"],
        "secret":       "{{credentials.webhook_secret}}",
        "compare_with": "$header.x-acme-signature"
      }
    },
    "payload_transform": "$.body.events.{ 'event_type': $.type, 'resource_id': $.object_id, 'resource_type': $.object_type, 'raw': $ }"
  }
}
```

Notable choices:

- **Promoted `pagination` to the integration level** — both resources use the same scheme, so set it once and drop the per-method `pagination` blocks the scaffold generated.
- **Added `rate_limit`** — Acme returns standard `Retry-After` on 429s. JSONata is required because `is_rate_limited` etc. are evaluated against the response.
- **Dropped `deals.create/update/delete`** — Acme exposes deals as read-only via the API.
- **Added `description` strings** — these surface in `truto integrations tools <id>` and the Truto MCP tool listings, which is what an LLM agent reads to decide which method to call.
- **`payload_transform` returns an array** — Acme batches multiple events per webhook delivery, so we map over `$.body.events` and emit one Truto event per element.

### Step 3 — Validate

```bash
truto integrations validate --file acme-crm.json
```

If the config is clean, you'll see:

```
✓ No issues found in file acme-crm.json (validated against IntegrationConfig in openapi.yml)
```

If not, fix the reported issues (each one carries a JSON path) and re-run.

### Step 4 — Push

```bash
truto integrations create -b "$(jq -c '{name:"acme-crm", category:"crm", config:.}' acme-crm.json)"
```

The response includes the integration's `id`. Save it as `$INTEGRATION_ID`.

### Step 5 — Install in your environment + connect a sandbox

```bash
truto environment-integrations create -b "{\"integration_id\":\"$INTEGRATION_ID\",\"is_enabled\":true,\"show_in_catalog\":true}"
```

The new integration now appears in your environment's Link UI. Generate a link token, open Link with `truto link-tokens create -b '{"tenant_id":"acme-test","is_sandbox":true}'`, paste your test API key, and the connection should land. Confirm with:

```bash
truto accounts list --is_sandbox true -o json | jq '.result[0].id'
truto proxy contacts -a "$ACCOUNT_ID" -v -o json
```

`-v` prints the outbound request and inbound response — verify the `Authorization` header is attached correctly and pagination walks. If something's off, iterate on the config and `truto integrations update <id>` (don't forget the `version` for optimistic locking).

### Step 6 — (Optional) Map to a unified model

If Acme's `contacts` should appear under `unified/crm/contacts`, write a unified-model mapping row — see [Unified API Customization](./unified-api-customization.md) for the workflow.

---

## What `init` produces

The scaffold generated by `truto integrations init` is **structurally valid** but intentionally minimal. It seeds:

- `label`, optionally `base_url`
- A `credentials` block matching the `--auth` choice (one of `api_key`, `oauth2`, `oauth2_client_credentials`, `basic`, `keka_oauth`, `oauth`), with placeholder OAuth endpoints (`https://example.com/...`) for OAuth flows that you must replace.
- An `authorization` block keyed off the auth choice (`bearer` for OAuth-family, `header` with `Bearer {{credentials.api_key}}` for `api_key`, `basic` with `{{credentials.username}}/{{credentials.password}}` for `basic`).
- A `resources` block with all five CRUD methods per resource you list under `--resources`, each with cursor pagination and a placeholder `response_path`.
- (Optional) A `webhook` block with HMAC signature verification and a stub `payload_transform`, when `--webhook` is set.

Things `init` does **not** seed — fill these in by hand when you need them:

- Per-method `description`, `query_schema`, `body_schema`, `response_schema`, `examples` (used by MCP tool listings).
- `rate_limit`.
- `actions.*` (post_install, validation, refresh_token, post_connect_user_form, custom flows).
- Pre-OAuth `fields` for OAuth flows that need a `subdomain` or similar.
- Custom (non-CRUD) resource methods.
- Vendor-specific OAuth `params`, `tokenParams`, `refreshParams`, PKCE, scope semantics.

Everything in the schema is editable post-init — the scaffold is a starting point.

---

## What's next after authoring

Once your integration is live in your environment, the related references cover the layers above and around it:

| You want to… | Reference |
|---|---|
| Connect a sandbox account end-to-end and make your first unified API call | [Getting Started](./getting-started.md) |
| Override the integration's HTTP behavior for one of your environments (different auth header, different pagination, etc.) | [Customizing Integrations](./customizing-integrations.md) |
| Map the integration into an existing or new unified API model | [Unified API Customization](./unified-api-customization.md) |
| Add custom (non-CRUD) methods callable through the proxy API, or use ad-hoc `/custom/{path}` calls | [Proxy & Custom API → Authoring Custom-API Handlers](./proxy-and-custom-api.md#authoring-custom-api-handlers) |
| Set up sync jobs to pull data from connected accounts on a schedule | [Sync Jobs](./sync-jobs.md) |
| Receive Truto's outbound webhook events to your URL when records change | [Webhooks & Notifications](./webhooks-and-notifications.md) |
| Understand the connection lifecycle and the events your app gets | [Connection Flow](./connection-flow.md) |
| Embed the Link UI for end users | [Truto Link SDK](../../truto-link-sdk/SKILL.md) |

---

## Common gotchas

- **`update` requires `version`.** The `integration` resource uses optimistic locking. Fetch the row with `truto integrations get <id> -o json | jq -r .version` and include the value in your update body. The CLI's `truto integrations update` enforces this.
- **`update` is a deep merge over `config`.** Sending `{ "config": { "label": "New" } }` won't drop `credentials` or `resources`. To remove a key from `config`, set it explicitly to `null`.
- **Validate locally before pushing.** `truto integrations validate --file acme.json` runs the same `IntegrationConfig` schema check the backend runs at create/update time. Cheaper than waiting for the round-trip and produces JSON-path errors that point to the broken field.
- **Sandbox accounts can read but cannot write.** Calls to `/proxy/{resource}` `POST/PATCH/DELETE` against a sandbox-flagged account return `405` regardless of the integration config. Test reads with sandbox accounts; test writes with non-sandbox.
- **Backtick-quote keys with hyphens or special characters in JSONata.** `` headers.`x-rate-limit` ``, `` $.body.`event-type` ``. JSONata's dot syntax doesn't accept hyphens.
- **`{{credentials.*}}` is placeholder syntax, not JSONata.** Inside `header_name`/`header_value`, `body`, `headers`, and webhook `signature_verification.config`, Truto resolves `{{credentials.api_key}}`-style placeholders against the integrated account's credentials before sending. JSONata `$` functions don't run in those fields. See [Sync Jobs § Templating placeholders vs JSONata](./sync-jobs.md#templating-placeholders-vs-jsonata) for the full distinction.
- **Multi-format credentials use a map, not an array.** When an integration supports both `api_key` and `oauth2`, write `credentials: { "api_key": { ... }, "oauth2": { ... } }`. The Link UI shows the customer a tab per format. Single-format integrations use the credential object directly.
- **OAuth `client.id`/`client.secret` are part of the *base* integration.** A "shared" or "dummy" client at the integration layer is fine for getting started; customers who want their own (BYOA) supply it via `environment-integration.override.credentials` — see [Customizing Integrations § Override authorization](./customizing-integrations.md#1-override-authorization).
- **Updating a live integration affects every connected account.** Adding a new optional resource is safe. Renaming a resource, removing a method, or changing the `format` of a credential will break existing connections. Roll forward by adding new methods/resources and deprecating old ones; only delete after every account has migrated.
- **Custom (non-CRUD) methods are reachable by both the proxy API and any unified mapping you write against them.** Pick consistent naming — Truto's MCP tool listings will surface the method name verbatim.
- **`error_expression` is integration-wide.** Per-method `error_expression` overrides the integration-wide one entirely (no merging). Same field-replacing semantics as the unified-API mapping override layer.
- **Set `tool_tags` if you care about MCP tool discoverability.** `tool_tags.<resource>: ["sales", "outbound"]` lets MCP clients filter tools by tag (`truto accounts tools <id> --tags sales`).

---

## Direct HTTP API

The CLI commands above all map 1:1 to a small handful of HTTP endpoints. Use these when you can't run the CLI (CI scripts, edge functions, non-Node environments). Auth: `Authorization: Bearer <api_token>` (see [Authentication](./authentication.md)).

| Method | Path | CLI equivalent |
|---|---|---|
| `POST` | `/integration` | `truto integrations create -b '{...}'` |
| `GET` | `/integration` | `truto integrations list` |
| `GET` | `/integration/{id}` | `truto integrations get <id>` |
| `PATCH` | `/integration/{id}` | `truto integrations update <id> -b '{..., "version": N}'` |
| `DELETE` | `/integration/{id}` | `truto integrations delete <id>` |
| `GET` | `/integration/{id}/tools` | `truto integrations tools <id>` |
| `GET` | `/integration/{id}/unified-apis` | `truto integrations unified-apis <id>` |

Example — create an integration via raw HTTP:

```bash
curl -X POST "https://api.truto.one/integration" \
  -H "Authorization: Bearer $TRUTO_API_TOKEN" \
  -H "Content-Type: application/json" \
  -d "$(jq -c '{name:"acme-crm", category:"crm", config:.}' acme-crm.json)"
```

The request body's `config` object must satisfy the `IntegrationConfig` component in [`openapi.yml`](https://github.com/trutohq/truto/blob/main/openapi.yml) — anything `truto integrations validate` accepts will round-trip cleanly.

---

## Related references

- **[Customizing Integrations](./customizing-integrations.md)** — per-environment HTTP-layer overrides on top of an integration definition (the layer above this one).
- **[Unified API Customization](./unified-api-customization.md)** — mapping integration responses into unified API shapes.
- **[Proxy & Custom API](./proxy-and-custom-api.md)** — calling integration resources through `/proxy/*` and `/custom/*`, plus the full Authoring Custom-API Handlers section.
- **[Connection Flow](./connection-flow.md)** — what happens between Link auth and `integrated_account:active`, including where `post_install` and `validation` actions run.
- **[Webhooks & Notifications](./webhooks-and-notifications.md)** — Truto's *outbound* webhooks (your URL receives `record:*` events). Distinct from the *inbound* webhook receiver authored above.
- **[Integrated Account Context](./integrated-account-context.md)** — what's in the `context` object that `{{context.*}}` and JSONata expressions can read.
- **[truto-jsonata: Usage in Truto](../../truto-jsonata/references/usage-in-truto.md)** — per-field JSONata scope tables for every field in this reference that takes a JSONata expression.
- **[Truto CLI: Admin Commands → Integrations](../../truto-cli/references/admin-commands.md#integrations-truto-integrations)** — the complete `truto integrations` command surface, including `init` / `validate` / `tools` / `unified-apis`.
- **OpenAPI components** in [`openapi.yml`](https://github.com/trutohq/truto/blob/main/openapi.yml): `IntegrationConfig`, `IntegrationCredential`, `IntegrationApiKeyCredential`, `IntegrationOAuth2Credential`, `IntegrationOAuth2ClientCredential`, `IntegrationKekaOAuthCredential`, `IntegrationOAuthCredential`, `IntegrationField`, `IntegrationAuthorization`, `IntegrationResourceMethod`, `IntegrationResourceMethodExample`, `IntegrationPagination`, `IntegrationRateLimit`, `IntegrationWebhookConfig`, `IntegrationWebhookSignatureVerificationConfig`, `IntegrationAction`, `IntegrationActionStep`.
- **Source schemas** in [`integrationSchema.ts`](https://github.com/trutohq/truto/blob/main/src/integration/integrationSchema.ts): `IntegrationConfigSchema` (line 376), per-credential schemas (lines 73–239), `ResourceMethodSchema` (296), `PaginationSchema` (241), `WebhookSchema` (253), `RateLimitSchema` (277), `AuthorizationSchema` (291), `IntegrationActionSchema` (342), `IntegrationActionStepSchema` (330).
