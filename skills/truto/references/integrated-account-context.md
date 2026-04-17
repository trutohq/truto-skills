# Integrated Account Context

The `context` field on an integrated account is a free-form JSON object that holds everything Truto needs to make API calls on behalf of that connection — credentials, instance-specific configuration, and any custom data you or post-install steps provide.

Every unified API call, proxy API call, custom API call, sync job, and workflow has access to the integrated account's context. It is the primary mechanism for parameterizing how Truto talks to a specific connected instance of a third-party tool.

## What Context Contains

Context is an unstructured `Record<string, unknown>` — there is no fixed schema. Its contents depend on the integration and authentication method. Common categories:

### Credentials

These are written automatically during the connection flow:

| Key | When present | Example value |
|-----|-------------|---------------|
| `oauth.token.access_token` | OAuth2 connections | `"eyJhbGciOiJSUzI1NiIs..."` |
| `oauth.token.refresh_token` | OAuth2 with refresh | `"dGhpcyBpcyBhIHJlZnJlc2..."` |
| `oauth.scope` | OAuth2 connections | `["read", "write"]` |
| `api_key` | API key auth | `"sk-abc123..."` |
| `token` | Bearer token auth | `"pat_..."` |
| `password` | Basic auth | `"hunter2"` |

### Instance Configuration

These identify *which* instance of the third-party tool to connect to. They're typically provided by the end-user during the connection flow or set by post-install steps:

| Key | Purpose | Example |
|-----|---------|---------|
| `subdomain` | Tenant-specific base URL | `"acme"` for `acme.zendesk.com` |
| `org_id` | Organization identifier | `"org_12345"` |
| `company_id` | Company identifier in the tool | `"cmp_789"` |
| `account` | Account slug or identifier | `"my-account"` |
| `site_url` | Full URL for self-hosted instances | `"https://jira.acme.internal"` |

The specific keys depend on the integration. Integration configs reference these keys in URL templates, headers, and JSONata expressions.

### Custom Data

You can store arbitrary key-value pairs in context for use in mappings, sync jobs, or your own application logic. These are set via:

- The link token's `context` field during connection
- PATCH requests to the integrated account
- Post-install action steps
- RapidForm (post-connect form) submissions

## How Context Is Set

Context is built up from multiple sources during the connection lifecycle. Each stage can add or merge keys.

### 1. Link Token Context

When creating a link token, you can pass initial context values. These are merged into the account's context when the connection completes:

```typescript
const response = await fetch("https://api.truto.one/link-token", {
  method: "POST",
  headers: {
    "Authorization": `Bearer ${process.env.TRUTO_API_TOKEN}`,
    "Content-Type": "application/json",
  },
  body: JSON.stringify({
    tenant_id: "tenant-123",
    context: {
      subdomain: "acme",
      department: "engineering",
    },
  }),
});
```

Link token context takes precedence over values provided by the Truto Link UI. This is useful for pre-filling values you already know (like a subdomain) so the user doesn't have to enter them.

### 2. Connection Flow (Truto Link UI)

When the user fills in fields during the connection flow (API key, subdomain, etc.), those values are written to `context`. For OAuth connections, the OAuth token is automatically stored under `context.oauth.token`.

The merge order for a **new connection** is:

1. Values from the Truto Link UI (user input)
2. Link token `context` (overrides UI values on duplicate keys)

### 3. Post-Install Steps

After the connection is established, integration-specific post-install actions run. These actions can read and write context using two step types:

- **`update_context`** — merges the accumulated step result into context
- **`set_context`** — merges a fixed config object into context

Post-install steps typically fetch metadata from the connected tool (like an org ID or workspace list) and store it in context for later use in API calls.

### 4. RapidForm (Post-Connect Form)

If the integration has a `post_connect_user_form` action configured, the user sees a form after connecting. The form submission is merged into context:

```
context = { ...existingContext, ...formSubmission }
```

This fires an `integrated_account:post_connect_form_submitted` webhook event.

### 5. API Updates

You can update context at any time via the PATCH endpoint:

```bash
curl -X PATCH https://api.truto.one/integrated-account/$ACCOUNT_ID \
  -H "Authorization: Bearer $TRUTO_API_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "context": {
      "custom_field": "my-value",
      "subdomain": "new-subdomain"
    }
  }'
```

PATCH returns the updated integrated account (same shape as `GET /integrated-account/:id`) with credential fields stripped:

```json
{
  "id": "abcd...",
  "tenant_id": "my-customer-123",
  "context": {
    "subdomain": "new-subdomain",
    "custom_field": "my-value",
    "oauth": { "scope": ["read", "write"] }
  },
  "object_store_context_fields": [],
  "status": "active",
  /* ...other account fields... */
}
```

> Protected paths (tokens, keys, passwords) are present in storage but stripped from API responses. The `object_store_context_fields` array lists any keys whose value was offloaded to object storage and rehydrated for this read.

**Context merges are shallow.** When you PATCH context, top-level keys are merged with the existing context, but nested objects and arrays are **replaced entirely**, not deep-merged. If a context key holds an object or array, you must pass the complete value — not just the fields you want to change.

For example, if the existing context is:

```json
{
  "subdomain": "acme",
  "settings": { "notify": true, "language": "en" }
}
```

And you PATCH with:

```json
{
  "context": {
    "settings": { "language": "fr" }
  }
}
```

The result is `{ "subdomain": "acme", "settings": { "language": "fr" } }` — the `notify` key inside `settings` is lost. To preserve it, pass the full object:

```json
{
  "context": {
    "settings": { "notify": true, "language": "fr" }
  }
}
```

The same applies to arrays — you must pass the entire array, not individual elements.

For credential-only updates, use the dedicated credentials endpoint:

```bash
curl -X PATCH https://api.truto.one/integrated-account/$ACCOUNT_ID/credentials \
  -H "Authorization: Bearer $TRUTO_API_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "context": {
      "api_key": "new-api-key"
    }
  }'
```

## Context and Reconnection

When reconnecting an existing account (e.g., after an OAuth token expires), context handling depends on the `persist_previous_context` flag on the link token:

### `persist_previous_context: true` (Recommended)

The existing context is used as the base layer, and new values from the reconnection flow are merged on top:

```
context = { ...existingContext, ...newConnectionValues, ...linkTokenContext }
```

This preserves custom data, post-install results, and configuration that was previously set. Only credential fields (tokens, keys) are updated.

### `persist_previous_context: false` (Default)

The previous context is discarded. Only values from the new connection flow and link token are used:

```
context = { ...newConnectionValues, ...linkTokenContext }
```

This can cause data loss if post-install steps had stored important values (like org IDs) in context. Always set `persist_previous_context: true` when reconnecting unless you have a specific reason not to.

```typescript
const response = await fetch("https://api.truto.one/link-token", {
  method: "POST",
  headers: {
    "Authorization": `Bearer ${process.env.TRUTO_API_TOKEN}`,
    "Content-Type": "application/json",
  },
  body: JSON.stringify({
    integrated_account_id: existingAccountId,
    persist_previous_context: true,
  }),
});
```

## How Context Is Used

### In URL Templates

Integration configs use placeholders that resolve against context values. For example, an integration with a tenant-specific subdomain might have:

```
base_url: "https://{{subdomain}}.example.com/api/v1"
```

When Truto makes an API call, it replaces `{{subdomain}}` with the value from `context.subdomain`.

### In JSONata Expressions

Unified API mappings, resource/method selectors, request body/query/header mappings, and response mappings all receive `context` as a top-level binding in JSONata expressions. You can reference any context key directly:

```jsonata
context.org_id
```

Or use it in conditional logic:

```jsonata
context.subdomain = "demo" ? "sandbox" : "production"
```

### In Headers and Authorization

Integration auth configurations use `replacePlaceholders` to inject context values into headers:

```json
{
  "headers": {
    "X-Api-Key": "{{api_key}}",
    "X-Org-Id": "{{org_id}}"
  }
}
```

Bearer token auth resolves `{{access_token}}` or similar from context.

### In Sync Jobs

Sync job V4 DAGs have access to integrated account context as the base context for all request nodes. Additionally, `add_context` nodes can evaluate JSONata expressions against the current context and extend it for downstream nodes:

```json
{
  "type": "add_context",
  "name": "add-last-synced-at",
  "depends_on": "get-last-synced-at",
  "config": {
    "expression": "{ 'last_synced_at': resources.`get-last-synced-at`.value }"
  }
}
```

Request nodes can use placeholder syntax in their `query` config:

```json
{
  "type": "request",
  "query": {
    "created_at_gt": "{{last_synced_at}}"
  }
}
```

### In Workflows

Workflow `run_if` conditions and step configs receive `context` (the integrated account's context) as a JSONata binding:

```jsonata
context.plan_type = "enterprise"
```

Step configs use either JSONata expressions or placeholder replacement with `context` available in both:

```json
{
  "type": "run",
  "action": "run_sync_job",
  "config": {
    "sync_job_id": "{{sync_job_id}}",
    "integrated_account_id": "{{integrated_account_id}}"
  }
}
```

### In Scheduled Actions

Integration scheduled actions (like recurring tasks set up during post-install) support a `run_if` JSONata expression that is evaluated against the integrated account's context. This lets you conditionally skip scheduled actions based on context values.

## Protected Context Fields

Certain context paths are treated as sensitive and receive special handling:

- **Never stripped on PATCH** — When you PATCH an integrated account's context, credential fields from the existing context are preserved even if the incoming payload doesn't include them. This prevents accidental credential loss.
- **Redacted in webhooks and API responses** — Webhook payloads and list endpoints strip these fields for security.

Protected paths include:

| Path | Type |
|------|------|
| `oauth.token.access_token` | OAuth2 access token |
| `oauth.token.refresh_token` | OAuth2 refresh token |
| `oauth.token.access_token_secret` | OAuth1 token secret |
| `api_key` | API key |
| `api_token` | API token |
| `token` | Generic token |
| `password` | Password |
| `secret` | Generic secret |
| `client_secret` | Client secret |
| `access_token` | Standalone access token |

When you PATCH context with a partial object, the merge behavior is:

```
patchedContext = { ...protectedFieldsFromExisting, ...yourPatchPayload }
```

OAuth context gets additional protection on the PATCH endpoint — if the existing account has `context.oauth`, the incoming `context.oauth` is merged with the stored value rather than replacing it.

## Environment Variables

The `context.environment_variables` key is a virtual field — it is **not stored** in the integrated account's context. Instead, it is injected at read time from the environment integration's `override.environment_variables` configuration.

This means:
- Writing to `context.environment_variables` has no effect (it is stripped on every write)
- Reading an integrated account includes `environment_variables` if the environment integration defines them
- Environment variables are shared across all integrated accounts for that environment integration

Use environment variables for values that should be consistent across all connections for an integration in a given environment (e.g., a webhook URL, a shared API endpoint).

## Object Store Context Fields

Large context values (large JSON blobs) are transparently offloaded to object storage. You read and write them normally — Truto handles the offload and rehydration.

To write a large value, mark it with the `truto_obj_store` shape:

```json
{
  "large_field": {
    "truto_obj_store": true,
    "data": { "...large payload..." }
  }
}
```

On write, `data` is offloaded and the context value is stored as `{ "truto_obj_store": true }`. On read, `data` is automatically fetched and hydrated back into the context object.

The `object_store_context_fields` array on the API response tells you which fields are stored this way.

## Context in Webhook Payloads

When integrated account events fire (`integrated_account:created`, `integrated_account:active`, `integrated_account:updated`, etc.), the webhook payload includes the account's context with credential fields redacted.

The following are always stripped from webhook payloads:
- All protected context fields (tokens, keys, passwords)
- `environment_variables`
- Secret columns (`context_secret`, `integration_override_secret`)

## Context vs Integration Override

Don't confuse `context` with `integration_override`:

| | `context` | `integration_override` |
|---|---|---|
| **Scope** | Per integrated account | Per integrated account |
| **Purpose** | Credentials + instance config | Override integration-level config |
| **Set by** | Connection flow, post-install, API | API or dashboard |
| **Used in** | URL templates, JSONata bindings, auth | Merged into `integration.config` |

`integration_override` lets you override the integration's configuration (like changing a base URL or adding custom headers) for a specific account. `context` is the account's own data — its credentials and instance-specific values.
