# P8 · Debug an MCP Tool Call

**Use this when** an MCP tool exposed by a Truto MCP server errors, returns nothing, or returns unexpected output — whether the report comes from an MCP client (Claude, Cursor, an agent) or from the account's **MCP servers** tab. An MCP tool is a thin wrapper over a **proxy** or **unified** call, so most failures reduce to that underlying call plus a small set of MCP-only causes.

> Judgment, not a script — apply [the adaptive contract](../SKILL.md#the-adaptive-contract). Don't debug the MCP wrapper when the real fault is the underlying call: a 200 with wrong data is almost always the unified mapping ([P3](./debug-unified-api.md)), not MCP.

## What you must establish

- the **MCP server and integrated account** the tool belongs to — MCP servers are scoped to one integrated account, so the backing account's health decides every tool it exposes;
- whether the tool maps to a **proxy** (`/proxy/…`) or **unified** (`/unified/…`) call, and what that underlying call returned;
- whether the failure is **MCP-layer** (the tool isn't exposed, the MCP token is bad, or the arguments don't match the tool schema) **or the underlying call** (then it is [P2](./debug-proxy-api.md) / [P3](./debug-unified-api.md));
- the account's **auth state** — a dead account breaks every tool that sits on top of it.

## Evidence — what to read

1. **The MCP server config first.** GET the account's MCP server and confirm the tool is actually exposed — `config.methods` and `config.tags` decide which of the account's resources/methods become tools. A "tool not found" is far more often a **not-exposed** tool than a broken one; a stale client tool list is the next most common cause.
2. **The tool's underlying resource/method, via capabilities.** `get_capabilities { target: accountId, resource }` — MCP tool names derive from the account's proxy/unified surface, so confirm the resource/method exists and its casing before assuming the tool is at fault. ([Discovering Capabilities](../../truto/references/discovering-capabilities.md))
3. **The MCP call logs, for one failing call.** Read the tool-call history from `GET /log` — the **`mcp`** log type (see the [`/log` quick-map](./error-and-evidence-model.md#the-log-quick-map); `describe_api_operation` the `/log` endpoint to confirm the exact filter keys rather than guessing). MCP forwards the **same** error envelope as the underlying call — `http_status_code`, `truto_is_remote_error`, `raw_response` — so read the same fields you would for a proxy/unified error.
4. **The account auth state.** A `401` / `integrated_account_needs_reauth: true` on the backing account breaks every tool ([P6](./diagnose-integrated-account.md)).

## Branch on the cause

| Symptom | Likely cause | Where it goes |
| --- | --- | --- |
| Tool missing from the client's tool list | Not exposed by the MCP server (`config.methods`/`config.tags`), or the client's cached tool list is stale | Re-expose the method/tag; refresh the client's tool list |
| Tool call `401` / needs reauth | The backing account's credentials are dead | [P6](./diagnose-integrated-account.md) — end-user reconnect |
| Tool call `403` with `missing_scopes` | OAuth scope gap for that resource/method | [P6](./diagnose-integrated-account.md) — reconnect with the added scopes |
| Tool call `400` / `422` from the provider | Arguments don't match the tool/request schema (`raw_response` has the detail) | Fix the arguments; don't retry unchanged |
| Tool returns wrong or empty data (`200`) | The **underlying** unified mapping or proxy output — not MCP | [P3](./debug-unified-api.md) (unified) / [P2](./debug-proxy-api.md) (proxy) |
| The MCP request itself is rejected before any tool runs | The MCP server's own token is invalid/expired | Reissue the account's MCP token |

## Skip / Stop

- **Skip** the capabilities + log reads when you already know the tool is valid and the account is healthy and only one call failed — read that call's error envelope directly.
- **Stop** once you know MCP-layer vs underlying-call and the cause class. A not-exposed tool or a wrong-arguments `4xx` needs no log spelunking — the config or the response body already told you.

## Anti-patterns

- Debugging the MCP wrapper when a `200`-with-wrong-data is really a [P3](./debug-unified-api.md) mapping issue.
- Reading a provider `raw_response` as a Truto/MCP bug — `truto_is_remote_error: true` means the provider said no.
- Retrying a non-retryable `4xx` without changing the arguments.
- Inventing a tool name or argument key instead of reading the MCP server config + `get_capabilities`.

## Supersedes / Reuses

- **Reuses** the underlying-call playbooks [P2 · Debug a proxy API error](./debug-proxy-api.md) and [P3 · Debug a unified API / mapping issue](./debug-unified-api.md), [P6 · Diagnose an integrated account](./diagnose-integrated-account.md), and the [Error & evidence model](./error-and-evidence-model.md).
