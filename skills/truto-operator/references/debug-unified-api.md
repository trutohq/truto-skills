# P3 · Debug a Unified API / Mapping Issue

**Use this when** a `/unified/{model}/{resource}` call errors, **or** succeeds but returns wrong, missing, or mis-typed data. Unified adds a 3-layer mapping system on top of the provider call, which creates a root-cause class proxy doesn't have: the provider answered fine but the **transform** is wrong. Your first fork is deciding which kind of problem you have.

> Judgment, not a script — apply [the adaptive contract](../SKILL.md#the-adaptive-contract). A hard error usually tells you the cause in one read; a data-shape problem takes a comparison. Don't inspect mappings for an error that's really a missing request param.

## The first fork: hard error vs data-shape

- **Hard error** (non-2xx) → read `truto_error_insight`; it usually names the cause. Often a *request* problem, not a mapping one.
- **Data-shape** (2xx but wrong/missing/mis-typed field) → a mapping-layer problem. Find the responsible layer and the specific field/expression.

## What you must establish

- whether this is a **hard error** or a **data-shape** problem;
- if error: **which `truto_error_insight`** applies;
- if data-shape: **which of the three layers** is responsible, and what the **merged mapping** currently is.

## Error path

Read `truto_error_insight` ([full key reference](./error-and-evidence-model.md#truto_error_insight-unified-api)). It's almost always self-diagnosing:

| Insight | Cause | Branch |
| --- | --- | --- |
| `missing_required_query_parameters` / `missing_required_body_fields` | You omitted a required param/field | Fix the **request** — no mapping change |
| `conditionally_required_query_parameters` / `conditionally_required_body_fields` | **Informational** — the endpoint *has* a conditional-requirement rule; this can appear even on errors unrelated to it | Read the rule and verify your request complies; don't assume it's the cause ([why](./error-and-evidence-model.md#truto_error_insight-unified-api)) |
| `forbidden_error` (`missing_scopes`) | OAuth scope gap | [P6](./diagnose-integrated-account.md) — reconnect with scopes |
| `rate_limit_error` | Provider 429 | Back off per `Retry-After` ([Rate limits](./error-and-evidence-model.md#rate-limits)) |
| `remote_error` (`truto_is_remote_error: true`) | The provider failed | Read `raw_response`; treat as upstream, not a mapping bug |

For history, `GET /log` with `log_type: "unified_proxy_api"`, `request_type: "unified"`, filtered by `integrated_account_id` ([`/log` quick-map](./error-and-evidence-model.md#the-log-quick-map)).

## Data-shape path

A 2xx with a field that's missing, wrong, or the wrong type is a mapping problem — **once you've ruled out the obvious**: the provider may simply not return that field. Confirm before blaming the mapping.

1. **Compare provider-raw vs unified-output.** If the field is absent from the provider's raw response, it's not a mapping bug — there's nothing to map. Pull the raw shape from the underlying proxy resource (`/proxy/…`) or the provider's own docs, and compare against the unified result.
2. **Inspect the merged mapping** via the meta endpoint — the runtime source of truth: `call_platform_api { method: "GET", path: "/unified/{model}/{resource}/{integration}/meta/{method}", query: { integrated_account_id } }`. It returns the fully **merged** `response_mapping`, `query_schema`, `default_query`, `default_body`. **If a field isn't in the merged `response_mapping`, the unified call can't return it.** ([Unified API Customization → Inspect the merged metadata](../../truto/references/unified-api-customization.md#testing-changes))
3. **Find the responsible layer.** `get_capabilities { target: accountId, type: "unified", resource }` — a unified entry's `env_overridden: true` flag tells you this environment has customized the mapping (look at the env layer first). Then read each layer that applies (below).

### The three layers

Mappings compose from up to three layers, deep-merged in priority (later wins):

| Layer | Stored in | Scope | Read it via |
| --- | --- | --- | --- |
| **Base** | `unified_model_resource_method.config` | Everyone on this integration/model | `GET /unified-model-resource-method` (filter by resource/integration/method) |
| **Environment** | `environment_unified_model_resource_method.config` | Every account in the environment | `GET /environment-unified-model-resource-method` |
| **Account** | `integrated_account.unified_model_override` | One connected account | `GET /integrated-account/{id}` (`fields: ["unified_model_override"]`) |

The mapping fields you'll inspect: `response_mapping`, `response_mapping_method` (`array` | `item`), `query_mapping`, `request_body_mapping`, `path_mapping`, `error_mapping`. Full semantics and scope variables live in [Unified API Customization](../../truto/references/unified-api-customization.md) and [truto-jsonata](../../truto-jsonata/SKILL.md).

> **Two account-level overrides, don't confuse them.** `unified_model_override` holds the mapping fields above — that's what P3 fixes. `integration_override` overrides the integration's **HTTP config** (base URL, headers, auth, resource/method definitions). If the unified output is wrong because the *underlying HTTP call* is wrong — not the transform — that's `integration_override` territory (closer to a proxy/config issue, [P2](./debug-proxy-api.md)), not a mapping fix.

## The wholesale-replace gotcha

The single most common mapping mistake. The layers deep-merge **objects**, but:

- **Arrays are replaced wholesale**, and
- **a `response_mapping` written as a JSONata string is overwritten wholesale** by any higher layer that sets it.

So an override that sets `response_mapping` does **not** "add a field" to the base expression — it **replaces the entire expression**. To add one field, you must restate the whole mapping (base fields + your new one). The same applies when you author the fix in [P1](./safe-admin-changes.md): read the merged mapping, copy it, add the field, write the complete expression. This is why a one-field override silently drops every other field — and why the meta endpoint (which shows the merged result) is your check.

## Branch to a fix

| Finding | Fix |
| --- | --- |
| Missing / conditionally-required param or field (`truto_error_insight`) | Fix the **request** — no write to any mapping |
| `forbidden_error` / `missing_scopes` | [P6](./diagnose-integrated-account.md) |
| Field present in provider-raw but absent/wrong in unified output | Mapping bug — locate the responsible layer, fix the **narrowest** one via [P1](./safe-admin-changes.md) |
| Query param ignored or mistranslated upstream | `query_mapping` on the responsible layer → [P1](./safe-admin-changes.md) |
| Field simply not returned by the provider | Not a mapping bug — there's nothing to map |

## Skip / Stop

- **Skip** mapping inspection entirely when a hard `truto_error_insight` already names a missing/conditional field — that's a request problem, fix it and move on.
- **Stop** once you've identified the responsible layer and the specific field/JSONata to change (and sanity-checked the expression conceptually). Hand the narrowest change to [P1](./safe-admin-changes.md); validate JSONata against [truto-jsonata](../../truto-jsonata/SKILL.md) before writing.

## Anti-patterns

- Editing the **base** mapping when an **environment** or **account** override is the correct, narrower layer (or the reverse).
- Writing JSONata without reading [truto-jsonata](../../truto-jsonata/SKILL.md) — never invent a `$` function or a scope variable.
- Assuming a missing field is a mapping bug when the provider never returned it.
- Treating `response_mapping` as if a partial override deep-merges into the base — it replaces it.

## Supersedes / Reuses

- **Supersedes** the `truto://guide/mapping-changes` stub and the mapping half of `truto://guide/sync-debugging`.
- **Reuses** [Unified API](../../truto/references/unified-api.md), [Unified API Customization](../../truto/references/unified-api-customization.md), the [truto-jsonata](../../truto-jsonata/SKILL.md) skill, and the [Error & evidence model](./error-and-evidence-model.md).
