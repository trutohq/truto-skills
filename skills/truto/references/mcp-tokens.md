# MCP Tokens

MCP tokens authenticate access to Truto's [MCP (Model Context Protocol)](https://modelcontextprotocol.io/) server. Each token is scoped to a single integrated account and can be further restricted to specific tools using method and tag filters.

Unlike API tokens, MCP tokens are embedded in the URL path rather than sent as a header.

## Usage

The MCP server URL is returned when you create a token:

```
https://api.truto.one/mcp/<token>
```

Configure your MCP client (e.g., Cursor, Claude) to connect to this URL.

## Array request bodies

The MCP protocol requires every tool's `inputSchema` to have `type: "object"` ([SEP-2106](https://modelcontextprotocol.io/seps/2106-json-schema-2020-12)). Some integration methods document a **root-array** `body_schema` because the upstream API expects a bare JSON array (`[{...}]`).

Truto adapts automatically:

| Layer | Behavior |
|---|---|
| Documentation `body_schema` | Keep the vendor shape: `type: array` + `items: {...}` |
| MCP `tools/list` | Wrap under a property named `body` so `inputSchema` stays an object |
| MCP `tools/call` | Unwrap `arguments.body` and send the bare array to the proxy |

When an agent calls such a tool, pass:

```json
{
  "profile_id": "123",
  "body": [{ "title": "Note", "typeid": 1 }]
}
```

Do not send a top-level array as the tool arguments object — MCP clients will reject it. The property name `body` is a Truto convention, not part of the MCP spec.

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
        tool_exposure: "all", // or "discovery"
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

The `config` controls which tools (resources and methods) the MCP token can access, and how they are exposed to the client.

| Field | Type | Description |
|-------|------|-------------|
| `methods` | string[] | Which methods the token can call. `"read"` allows `get` and `list`; `"write"` allows `create`, `update`, and `delete`; or use specific method names for exact matching. |
| `tags` | string[] | Restrict tools to those whose **effective** tags intersect this list. Effective tags = resource-level ∪ method-level `config.tool_tags` (see [Tool tags](#tool-tags-resource--method)). |
| `tool_exposure` | `"all"` \| `"discovery"` | How tools are listed. Default `"all"` (full catalog schemas). `"discovery"` exposes only three meta-tools (see below). Patchable on existing tokens — PATCH shallow-merges top-level `config` keys so sending only `tool_exposure` preserves `methods` / `tags`. |
| `require_api_token_auth` | boolean | If `true`, MCP clients must also provide a valid API token or session cookie in addition to the MCP URL token. Adds a second layer of authentication. |

At least one tool must match the combined method + tag filter, or creation fails with a **400** error ("AI-ready" check — the integration must expose tools matching your filter). `tool_exposure` does not change that check — discovery mode still requires a non-empty underlying catalog.

### Progressive tool discovery (`tool_exposure: "discovery"`)

For large catalogs, shipping every tool schema in `tools/list` bloats LLM context. Set `config.tool_exposure: "discovery"` so `tools/list` returns only:

| Meta-tool | Purpose |
|---|---|
| `search_tools(query, limit?)` | Stateless lexical hybrid search over name, resource, method, tags, description, and argument names. Empty or zero-hit query returns tool names grouped by resource (browse fallback). |
| `get_tool_schema(tool_names[])` | Full input schemas for 1–5 named tools; typos get did-you-mean suggestions. |
| `call_tool(tool_name, arguments)` | Executes a discovered tool via the normal proxy path (sandbox guards and method/tag filters unchanged). |

`methods` / `tags` still scope the searchable catalog. Clients must not invent tool names — discover via `search_tools`, then `get_tool_schema`, then `call_tool`. Calling a real tool name directly with `tools/call` in discovery mode returns an error telling the client to use `search_tools`.

CLI:

```bash
truto mcp-tokens create <account-id> --name "discovery" --tool-exposure discovery
# or
truto mcp-tokens create <account-id> -n "discovery" \
  -b '{"name":"discovery","config":{"tool_exposure":"discovery"}}'
truto mcp-tokens update <account-id> <token-id> --tool-exposure all
```

### Tool tags (resource + method)

Integrations declare tags on `config.tool_tags`:

```json
{
  "contacts": ["crm", "sales"],
  "contacts.delete": ["destructive"]
}
```

| Key shape | Meaning |
|---|---|
| `"contacts"` | Resource-level — applies to every method on `contacts` |
| `"contacts.delete"` | Method-level — unioned onto that method only |

**Semantics: union, never override.** Effective tags for `(resource, method)` = resource-level ∪ method-level. So `contacts.delete` gets `["crm", "sales", "destructive"]`. An MCP token with `tags: ["destructive"]` can expose only that method — impossible with resource-only tags.

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
| **Tool listing** | N/A | `all` (default) or `discovery` meta-tools |
| **Expiration** | Optional | Optional (minimum 60 seconds) |

## Gotchas

- Expired tokens are automatically deleted.
- Setting `expires_at` to `null` on a PATCH clears the expiration (token lives indefinitely until manual delete).
- PATCH without `config` skips tool validation — only name/expiry updates are applied.
- Invalid `tool_exposure` values are rejected (`all` \| `discovery` only).
- MCP token count per integrated account is subject to plan limits.
- In discovery mode, `tools/list` schemas do not include the underlying catalog — use `search_tools` / `get_tool_schema`.
