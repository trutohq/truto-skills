# MCP Tokens

MCP tokens authenticate access to Truto's [MCP (Model Context Protocol)](https://modelcontextprotocol.io/) server. Each token is scoped to a single integrated account and can be further restricted to specific tools using method and tag filters.

Unlike API tokens, MCP tokens are embedded in the URL path rather than sent as a header.

## Usage

The MCP server URL is returned when you create a token:

```
https://api.truto.one/mcp/<token>
```

Configure your MCP client (e.g., Cursor, Claude) to connect to this URL.

## Endpoints

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/integrated-account/:id/mcp` | List MCP tokens for an account |
| `GET` | `/integrated-account/:id/mcp/:tokenId` | Get a specific MCP token |
| `POST` | `/integrated-account/:id/mcp` | Create an MCP token |
| `PATCH` | `/integrated-account/:id/mcp/:tokenId` | Update an MCP token |
| `DELETE` | `/integrated-account/:id/mcp/:tokenId` | Delete an MCP token |

## Create an MCP Token

```typescript
const response = await fetch(
  "https://api.truto.one/integrated-account/<account_id>/mcp",
  {
    method: "POST",
    headers: {
      "Authorization": "Bearer <api_token>",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      name: "My MCP Server",
      config: {
        methods: ["read"],
        tags: ["contacts", "companies"],
      },
    }),
  }
);

const { url, token } = await response.json();
// url: "https://api.truto.one/mcp/<token>"
```

### Create Fields

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `name` | string | Yes | Human-readable name for the MCP server. |
| `config` | object | Yes | Tool access configuration (see below). |
| `expires_at` | datetime \| null | No | Optional expiration. Must be at least 60 seconds in the future. |

### Config Object

The `config` controls which tools (resources and methods) the MCP token can access.

| Field | Type | Description |
|-------|------|-------------|
| `methods` | string[] | Which methods the token can call. `"read"` allows `get` and `list`; `"write"` allows `create`, `update`, and `delete`; or use specific method names for exact matching. |
| `tags` | string[] | Restrict tools to those tagged with at least one of these tags (e.g., `"contacts"`, `"deals"`). |
| `require_api_token_auth` | boolean | If `true`, MCP clients must also provide a valid API token or session cookie in addition to the MCP URL token. Adds a second layer of authentication. |

At least one tool must match the combined method + tag filter, or creation fails with a **400** error ("AI-ready" check — the integration must expose tools matching your filter).

### MCP Token Fields

| Field | Type | Description |
|-------|------|-------------|
| `id` | uuid | Token identifier |
| `name` | string | Display name |
| `token` | string | The token string (only returned on create) |
| `url` | string | Full MCP server URL (only returned on create) |
| `config` | object | Tool access configuration |
| `integrated_account_id` | uuid | The account this token is scoped to |
| `created_by` | uuid | User who created the token |
| `expires_at` | datetime \| null | Expiration time |
| `created_at` | datetime | Creation timestamp |
| `updated_at` | datetime | Last update timestamp |

> The raw `token` and `url` are only returned on creation. Subsequent `GET` calls do not include them.

## MCP Token vs API Token

| | API Token | MCP Token |
|---|-----------|-----------|
| **Purpose** | Full platform API access | MCP protocol access for AI agents |
| **Scope** | One environment (all accounts) | One integrated account |
| **Transport** | `Authorization: Bearer` header | Token in URL path `/mcp/<token>` |
| **Tool filtering** | No — full access | Yes — by method and tag |
| **Expiration** | Optional | Optional (minimum 60 seconds) |

## Gotchas

- Expired tokens are automatically deleted.
- Setting `expires_at` to `null` on a PATCH clears the expiration (token lives indefinitely until manual delete).
- PATCH without `config` skips tool validation — only name/expiry updates are applied.
- MCP token count per integrated account is subject to plan limits.
