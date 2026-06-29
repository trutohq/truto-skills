# P2 · Debug a Proxy API Error

**Use this when** a `GET`/`POST`/`PATCH`/`DELETE` `/proxy/{resource}` call returns an error (4xx/5xx) or unexpected provider output. Proxy is the rawest surface — a pass-through to the provider's native API with no unified schema in between — so most proxy failures are either the provider talking back or a wrong resource name.

> Judgment, not a script — apply [the adaptive contract](../SKILL.md#the-adaptive-contract). Many proxy errors are fully classified by the response body alone; don't reach for logs when the status code already tells you the answer.

## What you must establish

- the **HTTP status**;
- whether the failure is **Truto-side or provider-side** — read `truto_is_remote_error` ([why this is the key split](./error-and-evidence-model.md#the-one-split-that-matters-truto_is_remote_error));
- the **resource and method** actually called, at the provider's exact casing;
- the account's **auth state** (a surprising amount of "proxy is broken" is really a dead account).

## Evidence — what to read

1. **The error body first.** Proxy errors carry the three guaranteed fields plus, when it's the provider, `truto_is_remote_error: true` + `raw_response` + forwarded headers. On a 403 you also get `truto_error_insight.forbidden_error.value.missing_scopes`. **That's all proxy gets** — there's no unified schema, so the missing-parameter, rate-limit, and `remote_error` insights never appear here. Don't look for them.
2. **Capabilities, for existence and casing.** `get_capabilities { target: accountId, type: "proxy", resource }`. Proxy resource names are **provider-native and case-sensitive** — Salesforce exposes `Contact`/`Account`/`Opportunity`, ServiceNow `incident`/`change_request`. A 404 is very often a casing or name miss; capabilities is the source of truth. ([Discovering Capabilities](../../truto/references/discovering-capabilities.md), [Proxy & Custom API](../../truto/references/proxy-and-custom-api.md))
3. **A scoped log read, only if you need history.** `GET /log` with `log_type: "unified_proxy_api"`, filtered by `request_type: "proxy"` and `integrated_account_id` over the time window. Then read these fields off the entries: `http_status_code`, `resource`, `method`, `integrated_account_needs_reauth`, `logs[]`, `message`. Remember the filter/field distinction — you filter by account + request_type, then scan for the status ([`/log` quick-map](./error-and-evidence-model.md#the-log-quick-map)).

## Branch on the status

| Status | Likely cause | Where it goes |
| --- | --- | --- |
| `401` (with `truto_is_remote_error`) or any entry with `integrated_account_needs_reauth: true` | Provider rejected the connection's credentials | [P6](./diagnose-integrated-account.md) — end-user reconnect |
| `403` with `missing_scopes` | OAuth scope gap for that resource/method | [P6](./diagnose-integrated-account.md) — reconnect **with the added scopes** |
| `404` | Wrong resource name/casing, or the account/env isn't visible to your token | Re-check `get_capabilities`; fix the name; confirm the target |
| `405` | The account is a **sandbox** — sandboxes are read-only and reject `POST`/`PATCH`/`DELETE` | Use a non-sandbox account to write |
| `429` | Rate limit — Truto tiers (token 500/10s, account 50/10s) or a provider 429 with its own `Retry-After` | Back off per `Retry-After`; this self-resolves ([Rate limits](./error-and-evidence-model.md#rate-limits)) |
| `5xx` **without** `truto_is_remote_error` | Truto-side — Truto couldn't process/reach the provider | Retry with backoff |
| `5xx` **with** `truto_is_remote_error` | The provider is failing | Treat as a flaky upstream — backoff, capped; not a Truto bug |
| `400` / `409` / `422` | The provider rejected the request shape/values (`raw_response` has the detail) | Fix the request; don't retry unchanged |

If the cause is a config gap (the integration genuinely lacks the resource/method the user needs), that's an **authoring** change, not a debug fix — hand the *scoped* change to [P1](./safe-admin-changes.md); adding a new proxy resource is covered by the `truto://guide/adding-proxy-resources` stub and the [truto-integrations-build](../../truto-integrations-build/SKILL.md) skill.

**Custom API.** A `/custom/{path}` call runs through the same pipeline as proxy — same per-account rate limiter, same error envelope — and shows up in `unified_proxy_api` logs as `request_type: proxy`. Debug it exactly like a proxy error here; there is no separate custom log type.

## Skip / Stop

- **Skip** the capabilities + log reads when you already know the resource is valid and the account is healthy and only one call failed — go straight to that call's error body / log entry.
- **Stop** once you know status + Truto-vs-provider + cause class. Request-fixable errors (400/404/casing/405) need no log spelunking — the body already told you.

## Anti-patterns

- Retrying non-retryable codes (`400`/`401`/`403`/`404`/`409`/`422`) — they'll just fail again; fix the cause.
- Reading a provider `raw_response` as a Truto bug — `truto_is_remote_error: true` means the provider said no.
- Inventing or guessing a resource name instead of reading capabilities.
- Proposing a config `PATCH` for what is actually an auth problem — route it to [P6](./diagnose-integrated-account.md).

## Supersedes / Reuses

- **Supersedes** the thin `truto://guide/proxy-api` and `truto://guide/integration-troubleshooting` stubs with real failure-mode reasoning.
- **Reuses** [Proxy & Custom API](../../truto/references/proxy-and-custom-api.md), [Discovering Capabilities](../../truto/references/discovering-capabilities.md), [Files & Logs](../../truto/references/files-and-logs.md), and the [Error & evidence model](./error-and-evidence-model.md).
