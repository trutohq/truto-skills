---
name: truto-operator
description: Operate and debug a live Truto workspace from the in-dashboard Platform Assistant. Adaptive playbooks for triaging vague issues and debugging proxy, unified/mapping, sync-job, webhook, and integrated-account failures, creating and test-running sync jobs (any runtime version V1–V4), then making safe, approval-gated admin changes through the assistant's admin meta-tools. For application code see the `truto` skill; for the terminal see `truto-cli`.
whenToUse: Operating/debugging a live workspace — triage vague reports; debug proxy, unified/mapping, sync-job, webhook, and integrated-account failures; create/generate and test-run sync jobs (V1–V4); make safe, approval-gated admin changes. Default entry point for any production issue or proposed config write.
---

# Truto Operator — Debugging & Safe-Change Playbooks

Use this skill when you are the **Truto Platform Assistant** — the in-dashboard AI operator that inspects and changes a customer's live Truto workspace through the admin API. It is a set of **adaptive playbooks** for the work an operator actually does: take a vague report, scope it, find the root cause across the right surface (proxy, unified, sync, webhook, or account), and — only once the cause is reproduced — propose the narrowest safe change.

This skill is **not** about writing application code (that's the [`truto`](../truto/SKILL.md) skill) or running terminal commands (that's [`truto-cli`](../truto-cli/SKILL.md)). Everything here is expressed in your **admin meta-tools** — `call_platform_api`, `get_capabilities`, `describe_api_operation`, `read_platform_resource`, `list_api_operations`, `query_tool_result` — not `fetch()` and not `truto …` shell commands. The bundled [`truto`](../truto/SKILL.md) references describe the same systems in code/CLI terms; the playbooks here restate the *investigation* for your tools and add the judgment and branching a reference doc doesn't.

> These are **playbooks, not scripts.** Each one defines the *minimum* a good investigation establishes and where to branch — not a checklist to run top to bottom. Read [The adaptive contract](#the-adaptive-contract) once; every playbook assumes it.

## When to Use

- A customer reports something vague — "Salesforce isn't working", "my sync is broken", "data is missing", "the connection stopped" — and you need to scope it before acting → [Triage & scope](./references/triage-and-scope.md).
- A specific surface is failing and you need root-cause reasoning: a `/proxy/…` error, a `/unified/…` error or wrong data, a failed/stuck sync job, undelivered webhooks, or a broken account.
- An investigation has concluded and a config/mapping/account change is needed — you need the write discipline and the real approval rules → [Make a safe admin change](./references/safe-admin-changes.md).
- The customer wants a **new sync job built**, or an existing one extended — "set up a nightly HubSpot → S3 sync", "generate a Salesforce contacts sync" → [Create / generate a sync job](./references/create-sync-jobs.md).
- You need the error model that isn't in your other docs — `truto_is_remote_error`, the `truto_error_insight` keys, status-code semantics, rate limits, retry rules, and the `/log` map → [Error & evidence model](./references/error-and-evidence-model.md).

**Not covered here** (route elsewhere): writing customer application code → [`truto`](../truto/SKILL.md); authoring a new integration from vendor docs → [`truto-integrations-build`](../truto-integrations-build/SKILL.md); embedding the connection UI → [`truto-link-sdk`](../truto-link-sdk/SKILL.md). The **workflow**, **daemon-job**, and **batch-job** surfaces aren't operator-debugged here unless triage explicitly leads to one — there's no v1 playbook for them yet. A `/custom/{path}` call is debugged as a proxy error ([P2](./references/debug-proxy-api.md)); MCP tool-call failures debug as the underlying proxy/unified error plus the `mcp` logs.

## Your meta-tools

Every step in every playbook is one of these calls. When you are unsure of a parameter, body shape, or filter key, **`describe_api_operation` the endpoint** rather than guessing — the live contract is the source of truth.

| Tool | Use it to | Key inputs |
| --- | --- | --- |
| `list_api_operations` | Discover what admin endpoints exist before calling | `tag?`, `search?`, `path_prefix?` |
| `describe_api_operation` | Get the exact params + request-body schema for one operation | `method`, `path` |
| `call_platform_api` | Run a platform API call **as the current user** (reads run immediately; writes/deletes need approval) | `method`, `path`, `query?`, `body?`, `fields?`, `jsonata?` |
| `query_tool_result` | Run JSONata over a **stored** large response | `handle_id`, `expression` |
| `get_capabilities` | List an integration's/account's proxy + unified surfaces and the account's health | `target` (slug/ID or account UUID), `type?` (`proxy`\|`unified`\|`all`), `resource?` |
| `read_platform_resource` | Read a bundled doc by URI (skills, guides, references) | `uri` |

Two `call_platform_api` options worth knowing: **`fields`** adds dot-path response fields beyond the assistant defaults (e.g. `fields: ["last_error", "last_forbidden_error"]` to surface why an account broke), and **`jsonata`** projects/filters the result inline (e.g. keep only failed runs) so you often don't need a second `query_tool_result` round-trip. A large response (roughly ≥16k characters) returns a **`handle_id`** instead of the full body — read into it with `query_tool_result` rather than re-fetching.

**Installed vs catalog, and environment scope.** For the integrations and connections the customer actually has, read `GET /environment-integration` or `GET /integrated-account` — **not** `GET /integration`, which is the giant global catalog and almost never what they mean. On GET list calls to environment-scoped collections (`/integrated-account`, `/environment-integration`, `/sync-job`, `/webhook`, `/datastore`, `/workflow`, …) the platform auto-injects `environment_id` from the page context; still pass it explicitly when you construct other calls, since detail and non-list calls aren't auto-scoped.

## The adaptive contract

Every playbook is guidance for judgment. Apply all five of these on every investigation:

1. **Adapt to context.** Skip steps already answered by the user's message, by earlier tool results, or by the bundled `route_context`. `route_context` always carries `environment_id` and the current page (`path`, `name`, `params`, `query`); when the user is on an account, integration, sync-job, or webhook page, the relevant id is usually already in `params` or `query`. Don't ask for, or re-fetch, what you already have.
2. **Branch on evidence.** The moment a read reveals the root cause, jump to the fix path — stop running later steps "for completeness."
3. **Stop when sufficient.** A playbook lists the *minimum* you must establish, not a quota of calls to make. When surface + scope + cause are known, stop investigating.
4. **Never write on momentum.** A playbook naming a `PATCH`/`POST`/`DELETE` is *not* permission to run it. Every write needs a reproduced root cause, explicit user intent, and the gated approval ([Make a safe admin change](./references/safe-admin-changes.md)). `DELETE`, bulk-delete, and credential writes are always approval-gated and are never treated as "already allowed."
5. **Explain deviations and cite your doc.** Say what you checked, what you skipped and why, and — per your system prompt — which doc or playbook you used. Read **before** proposing a change.

## Grounding — read before you guess

You do not hold complete Truto knowledge in context. **Never invent** field names, endpoints, JSONata functions, config keys, or procedural steps. When unsure, read first: pick a skill from `truto://skill/index`, then its references (`truto://skill/{id}/references/{slug}`); use `list_api_operations` / `describe_api_operation` for the exact admin contract; use `get_capabilities` and `GET` calls to inspect live integration/account state before any `PATCH`/`POST`. The playbooks here link the stable facts out to bundled references rather than restating them — follow those links instead of recalling from memory.

## Reads, writes, and the approval you can actually show

- **Reads run immediately, no approval:** `GET`/`HEAD`, and the operational posts `POST …/test`, `POST …/validate`, `POST …/refresh-credentials`. Investigate freely with these.
- **Writes and destructive ops need the user's approval:** any `POST`/`PUT`/`PATCH`, every `DELETE`, `POST …/bulk-delete`, `POST …/run-post-install-actions`, and anything that touches credentials.
- **Forbidden surfaces are blocked outright** — `/assistant`, `/auth`, `/link-token`, `/magic-link`. No approval can run them; route credential/auth fixes to the end user instead ([Diagnose an integrated account](./references/diagnose-integrated-account.md)).
- **Safe-writes can be *remembered* (auto-approved if you repeat the identical call); `DELETE` and `POST …/bulk-delete` never are** — they re-prompt every time. A remembered "yes" is never permission for a different, broader, or more dangerous call.
- **The approval card shows almost nothing.** The user sees a single `METHOD /path` line (UUIDs shortened) and a *Write* or *Destructive* badge — **no request body, no diff, no summary.** So the explanation is on you: before you trigger a write, state in chat exactly what will change (the resource, the fields, the before→after) and why. The full classifier and write discipline live in [Make a safe admin change](./references/safe-admin-changes.md).

## Pick a playbook

| The situation | Start at |
| --- | --- |
| Vague / unscoped report; surface, account, or error not yet named | [P0 · Triage & scope](./references/triage-and-scope.md) |
| Investigation concluded; a config/mapping/account change is needed | [P1 · Make a safe admin change](./references/safe-admin-changes.md) |
| A `/proxy/{resource}` call returns an error or unexpected output | [P2 · Debug a proxy API error](./references/debug-proxy-api.md) |
| A `/unified/{model}/{resource}` call errors, or returns wrong/missing data | [P3 · Debug a unified API / mapping issue](./references/debug-unified-api.md) |
| A sync job failed, stalled, rate-limited, or the destination got nothing | [P4 · Debug a sync job](./references/debug-sync-jobs.md) |
| The customer's endpoint isn't receiving webhook/event deliveries | [P5 · Debug webhook delivery](./references/debug-webhook-delivery.md) |
| 401/403, "needs reauth", validation/post-install error, "connection stopped" | [P6 · Diagnose an integrated account](./references/diagnose-integrated-account.md) |
| The customer wants a **new sync job built**, or an existing one extended | [P7 · Create / generate a sync job](./references/create-sync-jobs.md) |

P0 and P1 are the **spine**: P0 routes a vague report to the right surface playbook; every surface playbook hands a concluded fix to P1. The five surface playbooks branch into each other (a "unified is wrong" investigation often ends in P6 account reauth; a "sync produced nothing" often ends in P5 webhook delivery).

## References

### The investigation spine

| Document | What it covers |
| --- | --- |
| [P0 · Triage & scope](./references/triage-and-scope.md) | Turn a vague report into surface + scope + symptom, then route. The highest-leverage doc — read it first when nothing is named. |
| [P1 · Make a safe admin change](./references/safe-admin-changes.md) | The write path every other playbook hands off to: the verified read/safe-write/destructive/forbidden classifier, scope selection (base vs env vs account), minimal-diff discipline, and what the approval really shows. |

### Surface playbooks

| Document | What it covers |
| --- | --- |
| [P2 · Debug a proxy API error](./references/debug-proxy-api.md) | Provider-native pass-through failures: Truto-side vs provider-side, casing, scopes, status-code branches. |
| [P3 · Debug a unified API / mapping issue](./references/debug-unified-api.md) | Hard errors vs data-shape problems; the 3-layer mapping; which layer is responsible; the wholesale-replace gotcha. |
| [P4 · Debug a sync job](./references/debug-sync-jobs.md) | Run status + stop-point + cause class; rate-limit self-heal; the 5-minute stuck threshold; cron misses. |
| [P5 · Debug webhook delivery](./references/debug-webhook-delivery.md) | Exists/active/subscribed → attempted → accepted-by-endpoint; reading the customer endpoint's response. |
| [P6 · Diagnose an integrated account](./references/diagnose-integrated-account.md) | Account status + reason + who must act; why the fix is almost always an end-user reconnect, not an admin write. |

### Authoring

| Document | What it covers |
| --- | --- |
| [P7 · Create / generate a sync job](./references/create-sync-jobs.md) | Author a new (V4) sync job through the meta-tools: capabilities → compose the DAG → create → test-run → verify. The one authoring playbook; hands the final write to P1. |

### Shared model

| Document | What it covers |
| --- | --- |
| [Error & evidence model](./references/error-and-evidence-model.md) | The Truto error contract (`truto_is_remote_error`, `raw_response`, every `truto_error_insight` key), status-code semantics, rate-limit tiers, the retry/don't-retry rule, and the `/log` quick-map. Read alongside P2/P3/P4/P6. |

## Companion Skills

- **[truto](../truto/SKILL.md)** — the platform reference set these playbooks reuse for stable facts: [Discovering Capabilities](../truto/references/discovering-capabilities.md), [Files & Logs](../truto/references/files-and-logs.md), [Unified API Customization](../truto/references/unified-api-customization.md), [Sync Jobs](../truto/references/sync-jobs.md), [Webhooks & Notifications](../truto/references/webhooks-and-notifications.md), [Proxy & Custom API](../truto/references/proxy-and-custom-api.md), [Connection Flow](../truto/references/connection-flow.md), [Integrated Account Context](../truto/references/integrated-account-context.md). Read those for *how a thing works*; read the playbooks here for *how to debug it as an operator*.
- **[truto-jsonata](../truto-jsonata/SKILL.md)** — when a fix means writing a mapping expression (`response_mapping`, `query_mapping`, `error_mapping`, …), get the scope variables and custom `$` functions here before you write JSONata. Never invent a `$` function.
- **[truto-cli](../truto-cli/SKILL.md)** — the same investigations from a terminal. Useful background for how Truto engineers debug; your equivalent is the meta-tool, not the command.
- **[truto-api-conventions](../truto-api-conventions/SKILL.md)** — base URL, auth, URL patterns, cursor pagination, and the admin filter syntax (`field[gt]`, `log_type_filter[...]`) the playbooks rely on.
