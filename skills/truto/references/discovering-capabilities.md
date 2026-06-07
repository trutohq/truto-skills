# Discovering Capabilities

Resource and method names in `/unified/...`, `/proxy/...`, and `/custom/...` calls are integration-specific. The capabilities endpoint tells you exactly which routes a connected account (or an integration definition) supports — call it before building any data-access path. This is the single most effective way to keep LLM-generated integration code from hallucinating endpoints.

## Two endpoints, same shape

```
GET https://api.truto.one/integration/{slug_or_id}/capabilities
GET https://api.truto.one/integrated-account/{integrated_account_id}/capabilities
```

| Endpoint | Use when |
|----------|----------|
| `/integration/{slug-or-id}/capabilities` | Catalog browsing — what does this integration support in general? Useful before any account is connected, or when building a "supported integrations" page. No `account` field in the response, no `env_overridden` flags. |
| `/integrated-account/{uuid}/capabilities` | The actionable one — what does THIS connected account expose, including environment-level overrides? Includes `account.{status, is_blocked, authentication_method}` so you can gate calls on account health. |

Both accept the same query-param filters and return the same response shape.

## Authentication

Standard server-side Bearer token:

```
Authorization: Bearer <TRUTO_API_TOKEN>
```

The token is environment-scoped, so `/integrated-account/{id}/capabilities` resolves the env-level overrides applicable to that environment automatically.

## Query parameters

| Param | Values | Effect |
|-------|--------|--------|
| `type` | `proxy` \| `unified` \| `all` | Restrict the response to one surface. Default: `all`. |
| `methods` | Comma list (e.g. `list,get`) | Only include methods matching one of these names. Applies to `proxy[].methods[].method`. |
| `resource` | Resource name (e.g. `contacts`) | Only include the matching resource (in both `proxy[]` and `unified[]`). |
| `has_description` | `true` \| `false` | Filter proxy methods by whether they have a description. Default `true` — pass `false` to widen. |

Examples:

```bash
GET /integrated-account/<id>/capabilities?type=unified
GET /integrated-account/<id>/capabilities?type=proxy&methods=list,get
GET /integrated-account/<id>/capabilities?resource=contacts
GET /integration/hubspot/capabilities?type=all
```

## Response shape

```typescript
type CapabilitiesResponse = {
  integration: {
    id: string;
    name: string;     // slug, e.g. "hubspot"
    label: string;    // human label, e.g. "HubSpot"
    category: string; // e.g. "crm"
  };
  environment_id?: string; // present on the account variant only

  proxy: Array<{
    resource: string; // e.g. "contacts"
    methods: Array<{
      method: "list" | "get" | "create" | "update" | "delete" | string; // built-in or custom
      name: string;          // human-friendly name e.g. "list_all_hubspot_contacts"
      description: string | null;
      has_description: boolean;
      has_query_schema: boolean; // if true, full JSON Schema for query params is available
      has_body_schema: boolean;  // if true, the method takes a request body
      has_response_schema: boolean; // if true, response field schema is available (documentation table)
      api_documentation_url: string | null;
    }>;
  }>;

  unified: Array<{
    model: string;        // e.g. "crm", "ats", "ecommerce"
    model_label: string;  // e.g. "Unified CRM API"
    resource: string;     // e.g. "contacts"
    description: string | null;
    docs_url: string | null;
    methods: string[];    // e.g. ["list","get","create","update","delete"]
    env_overridden: boolean; // true => this environment has customized the mapping
  }>;

  auth: {
    formats: string[]; // e.g. ["api_key"], ["oauth2"]
    fields: Array<{
      name: string;
      label: string;
      type: string;       // "text" | "password" | etc.
      required: boolean;
      format?: string | null;
      placeholder?: string;
    }>;
    documentation_link?: string;
  };

  ai_readiness: {
    proxy_methods: number;
    proxy_methods_with_descriptions: number;
    ai_ready_score: number; // 0..1
  };

  account?: { // only on the integrated-account endpoint
    id: string;
    status: string; // "active" | "blocked" | "paused" | "expired" | ...
    authentication_method: string;
    is_blocked: boolean;
  };
};
```

### Worked example (Bigcommerce account, `?resource=products`)

```json
{
  "integration": { "id": "...", "name": "bigcommerce", "label": "Bigcommerce", "category": "ecommerce" },
  "environment_id": "...",
  "proxy": [
    {
      "resource": "products",
      "methods": [
        { "method": "list",   "name": "list_all_bigcommerce_products",        "description": "...", "has_query_schema": true,  "has_body_schema": false, "has_response_schema": true  },
        { "method": "get",    "name": "get_single_bigcommerce_product_by_id", "description": "...", "has_query_schema": true,  "has_body_schema": false, "has_response_schema": true  },
        { "method": "create", "name": "create_a_bigcommerce_product",         "description": "...", "has_query_schema": false, "has_body_schema": true,  "has_response_schema": true  },
        { "method": "update", "name": "update_a_bigcommerce_product_by_id",   "description": "...", "has_query_schema": false, "has_body_schema": true,  "has_response_schema": true  },
        { "method": "delete", "name": "delete_a_bigcommerce_product_by_id",   "description": "...", "has_query_schema": false, "has_body_schema": false, "has_response_schema": false }
      ]
    }
  ],
  "unified": [
    {
      "model": "ecommerce",
      "model_label": "Unified E-Commerce API",
      "resource": "products",
      "description": "The product represent a product in E-Commerce.",
      "docs_url": "https://truto.one/docs/api-reference/unified-e-commerce-api/products",
      "methods": ["get", "list"],
      "env_overridden": false
    }
  ],
  "auth": { "formats": ["api_key"], "fields": [ /* ... */ ] },
  "ai_readiness": { "proxy_methods": 10, "proxy_methods_with_descriptions": 5, "ai_ready_score": 0.5 },
  "account": { "id": "...", "status": "active", "authentication_method": "api_key", "is_blocked": false }
}
```

## Field-to-URL mapping

This is the cheat sheet for taking a capabilities response and constructing a valid data-plane URL.

| Capabilities field | URL position |
|--------------------|--------------|
| `proxy[].resource` | `/proxy/{resource}` |
| `proxy[].methods[].method` (`list`/`get`/`create`/`update`/`delete`) | HTTP verb (`GET` / `GET` / `POST` / `PATCH` / `DELETE`) |
| `proxy[].methods[].method` (custom name) | `POST /proxy/{resource}/{method_name}` |
| `unified[].model` + `unified[].resource` | `/unified/{model}/{resource}` |
| `unified[].methods[]` (`list`/`get`/`create`/`update`/`delete`) | HTTP verb |
| `unified[].methods[]` (custom name) | `POST /unified/{model}/{resource}/{method_name}` |

`integrated_account_id` is always required on the data-plane URLs as a query parameter.

## Helper function

A drop-in helper most apps end up writing:

```typescript
type CapabilitiesResponse = /* ... see above ... */;

const TRUTO_BASE = "https://api.truto.one";

export async function getCapabilities(
  target: { kind: "account"; accountId: string } | { kind: "integration"; slugOrId: string },
  opts: { type?: "proxy" | "unified" | "all"; resource?: string; methods?: string[] } = {}
): Promise<CapabilitiesResponse> {
  const path =
    target.kind === "account"
      ? `/integrated-account/${encodeURIComponent(target.accountId)}/capabilities`
      : `/integration/${encodeURIComponent(target.slugOrId)}/capabilities`;
  const params = new URLSearchParams();
  if (opts.type && opts.type !== "all") params.set("type", opts.type);
  if (opts.resource) params.set("resource", opts.resource);
  if (opts.methods?.length) params.set("methods", opts.methods.join(","));
  const url = `${TRUTO_BASE}${path}${params.toString() ? `?${params}` : ""}`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${process.env.TRUTO_API_TOKEN}` },
  });
  if (!res.ok) {
    throw new Error(`Capabilities ${res.status}: ${await res.text()}`);
  }
  return res.json();
}
```

## Caching

Capabilities responses are cheap (a single request) but don't change often. Two stable cache scopes:

- **Per `integration_id`** — for the `/integration/{...}/capabilities` endpoint. Invalidate when the integration definition is updated (rare; admin operation). A 24-hour TTL is safe for most apps.
- **Per `(environment_id, integration_id)`** — for `/integrated-account/{...}/capabilities`, since the only per-environment variation is the `env_overridden` mappings. You don't need a per-account cache key — every account on the same env-integration sees the same `proxy[]`/`unified[]`/`auth` structure (the `account` block is the only per-account field, and you usually already have account state in your DB).
- **Don't cache `account.status` / `account.is_blocked`** — re-fetch the `account` block fresh, or pull it from `/integrated-account/{id}` directly.

A simple memoization pattern:

```typescript
const capsCache = new Map<string, { value: CapabilitiesResponse; expiresAt: number }>();
const CAPS_TTL_MS = 60 * 60 * 1000; // 1 hour

export async function getAccountCapabilitiesCached(accountId: string, integrationId: string) {
  const key = `acct:${integrationId}`;
  const hit = capsCache.get(key);
  if (hit && hit.expiresAt > Date.now()) return hit.value;
  const fresh = await getCapabilities({ kind: "account", accountId });
  capsCache.set(key, { value: fresh, expiresAt: Date.now() + CAPS_TTL_MS });
  return fresh;
}
```

For multi-instance backends, lift this into Redis / Memcached / Cloudflare KV with the same key.

## Common patterns

### Route guard before any data call

```typescript
async function listContacts(accountId: string, integrationId: string) {
  const caps = await getAccountCapabilitiesCached(accountId, integrationId);
  const route = caps.unified.find(u => u.model === "crm" && u.resource === "contacts");
  if (!route || !route.methods.includes("list")) {
    throw new Error(`This account does not expose unified crm/contacts.list`);
  }
  const res = await fetch(
    `${TRUTO_BASE}/unified/crm/contacts?integrated_account_id=${accountId}`,
    { headers: { Authorization: `Bearer ${process.env.TRUTO_API_TOKEN}` } }
  );
  return res.json();
}
```

### Build a dynamic UI of available actions

```typescript
const caps = await getCapabilities({ kind: "account", accountId });
const actions = [
  ...caps.unified.flatMap(u => u.methods.map(m => ({ kind: "unified" as const, label: `${u.model_label}: ${u.resource} (${m})`, model: u.model, resource: u.resource, method: m }))),
  ...caps.proxy.flatMap(r => r.methods.map(m => ({ kind: "proxy" as const, label: `${r.resource}.${m.method} — ${m.description ?? "(no description)"}`, resource: r.resource, method: m.method }))),
];
```

### Pre-flight check on account health

```typescript
const caps = await getCapabilities({ kind: "account", accountId });
if (caps.account?.is_blocked) {
  // Force a reconnect via Truto Link before attempting any data call.
}
if (caps.account?.status !== "active") {
  // Try refresh-credentials or surface a "Reconnect" CTA to the end user.
}
```

### Discover before connecting

```typescript
// Pre-connection: tell the user what this integration will give them.
const caps = await getCapabilities({ kind: "integration", slugOrId: "hubspot" });
const supportedUnifiedModels = [...new Set(caps.unified.map(u => u.model))];
// → ["crm"]
```

## Failure modes

| Symptom | Likely cause | Fix |
|---------|--------------|-----|
| `404 Not Found` on the capabilities URL | Wrong target shape (e.g. account UUID passed as integration slug, or vice versa) | Check the path you constructed; the account variant takes a UUID, the integration variant takes a slug or integration UUID. |
| `proxy: []` despite the integration clearly supporting proxy | `?type=unified` filter passed (or omitted `?has_description=false` and no methods are documented) | Drop the `type` filter or pass `?has_description=false`. Re-check `ai_readiness.proxy_methods_with_descriptions`. |
| `unified: []` for a CRM integration | The integration doesn't have a unified mapping installed for this environment | Install or override via the dashboard, or via `truto env-unified-models install` in the CLI. |
| Data call still 404s after the route appears in capabilities | `env_overridden: true` and the override changes the URL/method shape | Inspect via `truto env-unified-model-mappings list` or the `env-unified-model-resource-method` admin endpoint. |
| `account.is_blocked: true` | Credentials revoked / account paused | Reconnect via Truto Link or call `POST /integrated-account/refresh-credentials`. |

## See also

- [Unified API](./unified-api.md) — how to construct unified URLs once you know the route exists
- [Proxy & Custom API](./proxy-and-custom-api.md) — proxy and custom URL construction + authoring custom-API handlers
- [Connection Flow](./connection-flow.md) — what `account.status` values mean and when to reconnect
- **Truto CLI** skill — same endpoints exposed as `truto capabilities <slug-or-uuid>` for one-line terminal discovery before porting into code
