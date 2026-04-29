---
name: truto-api-conventions
description: Truto API conventions — base URL (https://api.truto.one), Bearer auth, unified/proxy/custom URL patterns, cursor pagination, idempotency, admin filter syntax, and routing between core Truto skills and explicit operational workflow skills. Load whenever calling, configuring, or reasoning about any api.truto.one endpoint.
---

# Truto API Conventions

## Skill Routing

This plugin has core skills plus explicit operational workflow skills.

- **Truto** skill — Use when writing code in the user's project that calls `api.truto.one`. This produces application code: `fetch()` calls, webhook handlers, connection flows.
- **Truto CLI** skill — Use when running terminal commands to set up, explore, or debug. This runs `truto` CLI commands in the shell for admin tasks, one-time data access, and troubleshooting. Nothing the CLI does belongs in the user's codebase.
- **truto-jsonata** — Use when writing JSONata in mappings, integration overrides, sync jobs, workflows, daemon jobs, or scheduled actions.
- **truto-link-sdk** — Use when embedding Truto Link in a frontend.
- **Operational workflow skills** — Use when the user explicitly names a Truto workflow such as `truto-customer-issue-debugger`, `truto-sync-job-validator`, `truto-safe-admin-operator`, `truto-mapping-tester`, `truto-account-health-auditor`, or another `truto-*` workflow skill. These skills are thin runbooks that route the agent through a specific CLI/debugging process while relying on the core skills for command and API details.

## Base URL

```
https://api.truto.one
```

## Authentication

All API requests require a Bearer token in the `Authorization` header:

```
Authorization: Bearer <api_token>
```

API tokens are scoped to a single environment. When using an API token, operations that require an `environment_id` are automatically scoped to the token's environment.

## Content-Type

- JSON requests: `Content-Type: application/json`
- File uploads: `Content-Type: multipart/form-data`
- Workflows also accept `Content-Type: application/yaml`

## Unified API URL Pattern

```
https://api.truto.one/unified/{model_name}/{resource_name}
```

- **List**: `GET /unified/{model}/{resource}?integrated_account_id={id}`
- **Get**: `GET /unified/{model}/{resource}/{id}?integrated_account_id={id}`
- **Create**: `POST /unified/{model}/{resource}?integrated_account_id={id}`
- **Update**: `PATCH /unified/{model}/{resource}/{id}?integrated_account_id={id}`
- **Delete**: `DELETE /unified/{model}/{resource}/{id}?integrated_account_id={id}`
- **Custom method**: `POST /unified/{model}/{resource}/{method_name}?integrated_account_id={id}`

The `integrated_account_id` query parameter is **required** on all unified, proxy, and custom API calls.

## Proxy API URL Pattern

```
https://api.truto.one/proxy/{resource}?integrated_account_id={id}
```

Pass-through to the native API of the integrated tool. Same HTTP methods as unified.

## Custom API URL Pattern

```
https://api.truto.one/custom/{path}?integrated_account_id={id}
```

Any HTTP method; the path after `/custom/` is forwarded to the integration's custom handler.

## Capabilities Discovery

**Before constructing any `/unified/...`, `/proxy/...`, or `/custom/...` URL, hit the capabilities endpoint to confirm the route exists for the target.** Resource and method names are integration-specific (HubSpot has `contacts`, Salesforce has `Contact`, Bigcommerce has `products`) — capabilities is the source of truth, and skipping this step is the most common cause of LLM-generated 404s against Truto.

Two endpoints, same shape:

```
GET https://api.truto.one/integration/{slug_or_id}/capabilities
GET https://api.truto.one/integrated-account/{integrated_account_id}/capabilities
```

| Variant | When to call |
|---------|--------------|
| `/integration/{slug-or-id}/capabilities` | Catalog browsing — what does this integration support before any account is connected? |
| `/integrated-account/{uuid}/capabilities` | The actionable one — what does THIS connected account expose, including environment-level overrides? Includes account health (`status`, `is_blocked`). |

### Query parameters

| Param | Values | Effect |
|-------|--------|--------|
| `type` | `proxy` \| `unified` \| `all` | Restrict the response to one surface. Default `all`. |
| `methods` | Comma list, e.g. `list,get` | Only include methods matching one of these names. |
| `resource` | Resource name | Only include the matching resource (in both `proxy[]` and `unified[]`). |
| `has_description` | `true` \| `false` | Filter proxy methods by whether they have a description. Default `true`. |

### Response (abridged)

```json
{
  "integration": { "name": "<slug>", "label": "...", "category": "..." },
  "proxy":   [ { "resource": "...", "methods": [ { "method": "list|get|create|update|delete|<custom>", "name": "...", "description": "...", "has_query_schema": true, "has_body_schema": false } ] } ],
  "unified": [ { "model": "...", "resource": "...", "methods": ["..."], "env_overridden": false, "docs_url": "..." } ],
  "auth":    { "formats": ["..."], "fields": [ { "name": "...", "required": true } ] },
  "ai_readiness": { "proxy_methods": 10, "proxy_methods_with_descriptions": 5, "ai_ready_score": 0.5 },
  "account": { "id": "...", "status": "active", "is_blocked": false }
}
```

### URL construction cheat sheet

| Capabilities field | URL position |
|--------------------|--------------|
| `proxy[].resource` | `/proxy/{resource}` |
| `proxy[].methods[].method` (`list`/`get`/`create`/`update`/`delete`) | HTTP verb |
| `proxy[].methods[].method` (custom name) | `POST /proxy/{resource}/{method_name}` |
| `unified[].model` + `unified[].resource` | `/unified/{model}/{resource}` |
| `unified[].methods[]` (`list`/`get`/`create`/`update`/`delete`) | HTTP verb |
| `unified[].methods[]` (custom name) | `POST /unified/{model}/{resource}/{method_name}` |

The `truto` skill has the full TypeScript type, helper function, and caching pattern in [Discovering Capabilities](../truto/references/discovering-capabilities.md). The `truto-cli` skill exposes the same data via `truto capabilities <slug-or-uuid>` for one-line terminal discovery.

## Pagination

List endpoints return cursor-based pagination:

```json
{
  "result": [...],
  "next_cursor": "cursor_value_or_null",
  "prev_cursor": "cursor_value_or_null"
}
```

Pass `next_cursor` as a query parameter to fetch the next page. When `next_cursor` is `null`, there are no more pages.

## Idempotency

Mutating unified/proxy/custom API calls support idempotency via the `Idempotency-Key` header:

```
Idempotency-Key: <unique_key>
```

## Admin API Pagination

Admin endpoints (listing integrations, accounts, sync jobs, etc.) use the same cursor pattern. Filter parameters use structured query syntax: `field[operator]=value` (e.g., `id[in]=uuid1,uuid2`).
