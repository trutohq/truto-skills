# Authentication

Truto supports four authentication types. Each serves a different purpose and has different access levels.

| Token Type | Purpose | Scope | Typical User |
|------------|---------|-------|--------------|
| **API Token** | Full platform access | One environment | Your backend server |
| **Link Token** | Launch the connection UI | One connection attempt | Your end-user (via frontend) |
| **Integrated Account Token** | Scoped data access | One integrated account | Your frontend or third-party clients |
| **MCP Token** | MCP protocol access | One integrated account + tool filters | AI agents and MCP clients |

---

## API Token Authentication

API tokens provide programmatic access to the Truto API. Each token is scoped to a single **environment**.

**API tokens must only be used on the backend.** Never expose them to browsers or client-side code.

### Usage

```typescript
const response = await fetch(
  "https://api.truto.one/unified/crm/contacts?integrated_account_id=<id>",
  {
    headers: {
      "Authorization": "Bearer <api_token>",
    },
  }
);
```

### Auto-Scoping

When using an API token, `environment_id` is automatically set to the token's environment on all create operations. You don't need to pass it explicitly — it's inferred from the token.

### Limitations

API tokens **cannot**:
- Create new API tokens (requires session authentication via the dashboard)
- Delete API tokens (requires session authentication via the dashboard)

### Endpoints

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api-token` | List API tokens in your environment |
| `GET` | `/api-token/:id` | Get a specific API token |

#### List Query Parameters

| Parameter | Type | Description |
|-----------|------|-------------|
| `name` | string | Filter by token name |
| `environment_id` | uuid | Filter by environment (must be in your token's scope) |
| `limit` | number | Results per page (default: 5000) |
| `next_cursor` | string | Pagination cursor |

#### API Token Fields

| Field | Type | Description |
|-------|------|-------------|
| `id` | uuid | Token identifier |
| `name` | string | Human-readable name |
| `environment_id` | uuid | Environment this token is scoped to |
| `created_by` | uuid | User who created the token |
| `expires_at` | datetime \| null | Optional expiration. If set, the token stops working after this time. |
| `created_at` | datetime | Creation timestamp |
| `updated_at` | datetime | Last update timestamp |

> The raw token secret is only returned once — when the token is first created in the dashboard. It cannot be retrieved later.

#### Response

`GET /api-token` uses the standard list envelope:

```json
{
  "result": [
    {
      "id": "5f9f7e25-...",
      "name": "Backend Server",
      "environment_id": "9c2e...",
      "created_by": "21a8...",
      "expires_at": null,
      "created_at": "2024-09-01 10:00:00",
      "updated_at": "2024-09-01 10:00:00"
    }
  ],
  "next_cursor": null,
  "limit": 5000
}
```

`GET /api-token/:id` returns the token object directly (without the wrapping envelope). The token's secret is **not** included in either response.

---

## Link Tokens

Link tokens are short-lived, single-use tokens that launch the Truto Link connection UI for your end-users. They expire after **7 days** if unused.

Link tokens are created on your backend and passed to the frontend to open the connection flow. They cannot be listed or retrieved after creation.

### Create a Link Token

```typescript
const response = await fetch("https://api.truto.one/link-token", {
  method: "POST",
  headers: {
    "Authorization": "Bearer <api_token>",
    "Content-Type": "application/json",
  },
  body: JSON.stringify({ tenant_id: "my-customer-123" }),
});

const { link_token } = await response.json();
```

### Response

```json
{
  "link_token": "<token_string>"
}
```

### Create Fields — New Account

Use these fields when connecting a new account for a tenant.

| Field | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| `tenant_id` | string | Yes | — | Your identifier for the end-user. This links the integrated account to a customer in your system. |
| `scopes` | string[] | No | Integration default | OAuth scopes to request during the connection flow. Overrides the integration's default scopes when set. |
| `environment_unified_model_id` | string[] | No | — | Restrict the connection UI to integrations that support these unified models. Also narrows the OAuth scopes to only those required by the specified models. |
| `context` | object | No | — | Additional context to store on the integrated account after connection. This is merged into the account's `context` field, with link token values taking precedence on overlap. |
| `redirect_uri` | string | No | — | URL to redirect to after the connection flow completes. Mainly needed for desktop apps so they can reopen the app once the auth flow is complete. Also used with the Truto Link SDK's `sameWindow` mode. The URI is returned in the connection response so your app can navigate back. |
| `persist_previous_context` | boolean | No | `false` | Only meaningful on reconnect (see below). |
| `truto_static_gate_id` | uuid | No | — | Route the connection's OAuth/API calls through a static IP egress proxy. The gate must exist and be accessible in your environment. Once connected, the integrated account will also use this static gate for all subsequent unified, proxy, and custom API calls. |
| `region` | string | No | `wnam` | Data region for the new integrated account. Options: `wnam` (West North America), `enam` (East North America), `apac` (Asia Pacific), `eu` (Europe). |

### Create Fields — Reconnect (Existing Account)

Use these fields when reconnecting an existing account whose credentials have expired or been revoked. The account keeps its same `integrated_account_id`.

| Field | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| `integrated_account_id` | uuid | Yes | — | The existing account to reconnect. The user will re-authenticate and credentials will be updated in place. |
| `scopes` | string[] | No | Integration default | Updated OAuth scopes for the reconnection. |
| `environment_unified_model_id` | string[] | No | — | Same as new account — restricts integrations and narrows scopes. |
| `context` | object | No | — | Additional context to merge into the account after reconnection. |
| `redirect_uri` | string | No | — | Post-reconnection redirect URL. |
| `persist_previous_context` | boolean | No | `false` | If `true`, the account's existing `context` is preserved as a base, and the new context from the reconnection is merged on top. If `false`, the previous context is not carried over. |
| `truto_static_gate_id` | uuid | No | — | Route through a static IP egress proxy. Once connected, the integrated account will also use this static gate for all subsequent unified, proxy, and custom API calls. |

> **New account vs reconnect:** The API determines which flow to use based on the fields you provide. If you include `tenant_id` (and `environment_id`), it's a new connection. If you include `integrated_account_id`, it's a reconnect. You should only provide fields for one flow — if both are present, the API will silently match one path and ignore the other fields, which can lead to unexpected behavior.

### Link Token Lifecycle

1. Create a link token via `POST /link-token` on your backend
2. Pass it to the Truto Link SDK (`authenticate(linkToken)`) in your frontend
3. The user selects an integration and authenticates
4. On success, an integrated account is created (new) or updated (reconnect)
5. The link token is consumed and cannot be reused

---

## Integrated Account Tokens

Integrated account tokens provide scoped, short-lived access from the perspective of a specific connected account. Their primary use cases are **file pickers** and **RapidForm (on-demand post-connect forms)** in the Truto Link SDK, where the frontend needs temporary, scoped access to a single account. Outside of these two use cases, you should rarely need integrated account tokens — use API tokens on your backend instead.

**Expiration:** 15 minutes. These are intended for short-lived sessions, not long-term access.

### Usage

```typescript
const response = await fetch("https://api.truto.one/unified/crm/contacts", {
  headers: {
    "Authorization": "Bearer <integrated_account_token>",
  },
});
```

When using an integrated account token, the `integrated_account_id` query parameter is **not needed** — it's inferred from the token.

### Allowed Endpoints

Integrated account tokens can only access:

| Method | Path | Description |
|--------|------|-------------|
| Any | `/unified/*` | Unified API endpoints |
| Any | `/proxy/*` | Proxy API endpoints |
| Any | `/custom/*` | Custom API endpoints |
| GET | `/integrated-account/me` | Get own account info |
| PATCH | `/integrated-account/me` | Update own account context |

Any other endpoint returns **403**.

### Create an Integrated Account Token

This call requires your **API token** — you generate integrated account tokens on your backend and pass them to the client.

```typescript
const response = await fetch("https://api.truto.one/integrated-account/token", {
  method: "POST",
  headers: {
    "Authorization": "Bearer <api_token>",
    "Content-Type": "application/json",
  },
  body: JSON.stringify({
    integrated_account_id: "<account_uuid>",
  }),
});

const { integrated_account_token } = await response.json();
```

#### Request Fields

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `integrated_account_id` | uuid | Yes | The account to create a scoped token for. Must be in an environment accessible by your API token. |

#### Response

```json
{
  "integrated_account_token": "<token_string>"
}
```

---

## MCP Tokens

MCP tokens authenticate access to Truto's MCP server, scoped to a single integrated account with optional tool filters. See [MCP Tokens](./mcp-tokens.md) for endpoints, creation, configuration, and the comparison with API tokens.
