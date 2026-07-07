# P0 · Triage & Scope a Vague Issue

**Use this when** a report names a problem but not a place: "Salesforce isn't working", "my sync is broken", "data is missing", "the connection stopped." Your job here is **not** to fix anything — it's to convert vague language into a scoped investigation and route to the right surface playbook.

> Judgment, not a script — apply [the adaptive contract](../SKILL.md#the-adaptive-contract). The fastest correct triage is often two reads and a hand-off. If the user already named the surface, account, and error, **skip this entirely** and open the matching playbook.

## What you must establish

Three things, and then you stop:

1. **Surface** — which part of Truto is in play: proxy, unified, sync job, webhook, or account/auth.
2. **Scope** — `environment_id`, the integrated-account id (and/or integration slug + tenant), and a **time window** ("last night", "since we changed X").
3. **Symptom** — the concrete failure: exact error text / HTTP status, *or* "succeeds but the data is wrong/missing", *or* "scheduled data never arrived."

With those three known, route and hand off. Resist the pull to start fixing in P0.

## Evidence — gather the minimum

1. **Read `route_context` before asking anything.** It always gives you `environment_id` and the current page (`path`, `name`, `params`, `query`). If the user is on an account, integration, sync-job, or webhook page, the id you need is usually already in `params`/`query`. Asking for what's on screen is the most common triage anti-pattern.
2. **Confirm the target exists and is healthy** with one `get_capabilities { target }` — pass the integration slug/ID or the account UUID. The `account` block tells you `status` and `is_blocked` in a single read; the `proxy[]`/`unified[]` arrays confirm the integration is real and which surfaces it has. This alone often decides surface (a broken `account.status` → P6) and rules out "integration doesn't support that resource."
3. **Resolve an account from a customer name** when only a tenant is given: `call_platform_api { method: "GET", path: "/integrated-account", query: { environment_id, tenant_id } }`. Confirm the exact filter names with `describe_api_operation` first; project with `jsonata` to keep just `id`, `tenant_id`, `status`.
4. **One scoped `GET /log`** *only if* you have a time window and still don't know the surface — e.g. `log_type: "unified_proxy_api"` filtered by `integrated_account_id` to see whether calls are even arriving and what they return. Keep `limit` small. See the [`/log` quick-map](./error-and-evidence-model.md#the-log-quick-map).

Stop reading the moment surface + scope + symptom are settled. You are sampling to route, not building a full picture.

## Route on the symptom

| What the user describes | Surface | Go to |
| --- | --- | --- |
| A direct API call returned an error (they paste a status/body, or you reproduced one) | proxy or unified | [P2](./debug-proxy-api.md) if `/proxy/…`; [P3](./debug-unified-api.md) if `/unified/…` |
| "It succeeds but the data is wrong / a field is missing / values look off" | unified mapping | [P3](./debug-unified-api.md) |
| "Scheduled/bulk data didn't arrive", "the nightly sync is empty" | sync, then delivery | [P4](./debug-sync-jobs.md) first; if the run completed, [P5](./debug-webhook-delivery.md) |
| "Our endpoint stopped getting events / webhooks" | webhook delivery | [P5](./debug-webhook-delivery.md) |
| "Can't connect", "needs reauth", 401/403, "the connection stopped working" | account/auth | [P6](./diagnose-integrated-account.md) |
| An AI agent's MCP tool calls into Truto are failing | MCP (transport over proxy/unified) | Underlying error debugs as [P2](./debug-proxy-api.md)/[P3](./debug-unified-api.md); add `mcp` logs (`mcp_server_id`, `tool_name`). Background: `truto://skill/truto/references/mcp-tokens` |
| Surface still genuinely unclear after the reads above | — | Ask **one** targeted question (the specific error text, or which screen/action), not a checklist |

A `/custom/{path}` call behaves like proxy — same error envelope, same per-account rate limit — and logs as `request_type: proxy`, so debug it through [P2](./debug-proxy-api.md), not as its own surface.

Account problems hide behind everything: a "unified is broken" or "sync failed" report frequently bottoms out at a `needs_reauth` account. If `get_capabilities` already shows the account unhealthy, route to [P6](./diagnose-integrated-account.md) regardless of how the report was phrased.

## Skip / Stop

- **Skip P0** when the user already handed you surface + account + error — go straight to that playbook.
- **Stop P0** the instant you can name surface + scope + symptom. Hand off; do not begin remediation here. P0 never proposes a write.

## Anti-patterns

- Asking the user for `environment_id`, the account, or which page they're on when `route_context` already has it.
- Proposing a fix (or reaching for a `PATCH`) before the surface is even identified.
- Running every surface check "to be safe" — capabilities + one scoped log read is usually enough to route; breadth here is wasted motion.
- Over-collecting: pulling a month of logs to triage a "happened last night" report.
- Listing the global `/integration` catalog when you want what the customer has installed — use `GET /environment-integration` or `GET /integrated-account` instead.

## Reuses

- [get_capabilities](../../truto/references/discovering-capabilities.md) — the one-read health + surface check (`account.status`, `is_blocked`, `env_overridden`).
- [Files & Logs](../../truto/references/files-and-logs.md) and the [`/log` quick-map](./error-and-evidence-model.md#the-log-quick-map) — scoped log reads.
- [Error & evidence model](./error-and-evidence-model.md) — to classify a pasted error fast.
