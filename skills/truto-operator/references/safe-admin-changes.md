# P1 · Make a Safe Admin Change

**Use this when** an investigation has concluded that a config, mapping, or account change is needed — a `PATCH` to an integration or env mapping, a `POST` to create a webhook, an account `context` fix, and so on. Every other playbook hands its concluded fix here. This is where "the assistant improvised a write" does real damage, so the bar is deliberately high.

> Judgment, not a script — apply [the adaptive contract](../SKILL.md#the-adaptive-contract). A playbook naming a `PATCH`/`POST`/`DELETE` is **not** permission to run it. Writes happen only with a reproduced cause, explicit user intent, and the approval.

## What you must have before you propose a write

1. **A reproduced root cause** — a specific failing call and its error/log, not a hypothesis. If you can't point to the evidence, you're not ready to write.
2. **The current state, read first** — `GET` the exact resource you're about to change. You can't write a minimal diff against a state you haven't seen, and you need to know the endpoint's merge behavior (see [Know how your endpoint merges](#know-how-your-endpoint-merges)).
3. **The minimal diff** — the smallest change that fixes the reproduced cause. No "while we're here" edits.
4. **The narrowest correct scope** — see [Choose the scope](#choose-the-scope).
5. **A plain-language explanation** — because the approval card won't show your body (next section), the user only understands the change if you describe it.

## The approval the user actually sees

Reads run immediately. Writes and destructive ops pause for the user's approval — but **the approval card is minimal**: a single `METHOD /path` line (UUIDs shortened) plus a *Write* or *Destructive* badge. **No request body. No diff. No summary.** Whatever you don't say in chat, the user approves blind.

So, every time, **before** you trigger the write, state in your own words:

- the resource and scope you're changing (which account / environment / integration),
- the fields, with **before → after** values,
- why this fixes the reproduced cause,
- and the literal `METHOD /path` (and, for anything non-trivial, the body) so there are no surprises.

Then trigger the call and let the user approve.

## The classification — what needs approval, what's blocked

Truto classifies every call you make. You can't override this; know it so you set the right expectations.

| Class | What it covers | Behavior |
| --- | --- | --- |
| **Read** | `GET` / `HEAD`; and the operational posts `POST …/test`, `POST …/validate`, `POST …/refresh-credentials` | Runs immediately, no approval |
| **Safe-write** | Any other `POST` / `PUT` / `PATCH` | Requires approval |
| **Destructive** | Any `DELETE`; `POST …/bulk-delete`; `POST …/run-post-install-actions`; any path ending `/credentials` or containing `/credentials/` (**even a `GET`** — touching credentials is destructive regardless of method); any body containing `credentials`, `config.credentials`, or `override.secret_environment_variables` | Requires approval; **`DELETE` and `…/bulk-delete` are never remembered** — they re-prompt every single time |
| **Forbidden** | Anything under `/assistant`, `/auth`, `/link-token`, `/magic-link` | **Blocked outright** — no approval can run it |

Two consequences worth internalizing:

- **Credentials are destructive, and the wrong tool anyway.** A `…/credentials` write, or a body carrying `credentials` / `config.credentials` / `override.secret_environment_variables`, is destructive — but the real fix for broken auth is almost always the **end user reconnecting**, which you can't do for them. Route auth problems to [P6](./diagnose-integrated-account.md) instead of patching tokens.
- **A prior approval is never license for the next call.** Treat each destructive call as needing its own explicit approval; never let an earlier "yes" justify a `DELETE`, a bulk-delete, or a credential write.

## Choose the scope

Most fixes can be made at three different blast radii. **Prefer the narrowest scope that resolves the reproduced cause.**

| Scope | Where | Blast radius | Use when |
| --- | --- | --- | --- |
| **Single account** | `integrated_account.unified_model_override` / `integration_override` (PATCH `/integrated-account/{id}`) | One connected account | One customer's instance behaves differently; or you're validating a fix before rolling it wider |
| **Per environment** | `environment_unified_model_resource_method.config` (PATCH `/environment-unified-model-resource-method/{id}`) | Every account in that environment | The whole environment needs the mapping change |
| **Base integration** | `PATCH /integration/{id}` (`config.*`) | **Everyone** on that integration, across environments | Rarely correct for one customer's problem — highest blast radius; reach for it last |

Credentials/auth are not on this ladder — they don't get patched; they get reconnected ([P6](./diagnose-integrated-account.md)). For mapping-layer specifics (which layer wins, what each field does, the wholesale-replace gotcha) see [P3](./debug-unified-api.md) and [Unified API Customization](../../truto/references/unified-api-customization.md).

## Ground the body before you send it

Don't hand-shape a request body from memory. **`describe_api_operation { method, path }`** gives you the exact parameters and request-body schema; read the relevant skill reference for the field semantics:

- mapping bodies and any JSONata (`response_mapping`, `query_mapping`, `error_mapping`, …) → [truto-jsonata](../../truto-jsonata/SKILL.md) for the scope variables and custom `$` functions (never invent one), and [Unified API Customization](../../truto/references/unified-api-customization.md) for the body shape;
- account `context` → [Integrated Account Context](../../truto/references/integrated-account-context.md);
- webhooks → [Webhooks & Notifications](../../truto/references/webhooks-and-notifications.md);
- sync jobs → [Sync Jobs](../../truto/references/sync-jobs.md).

### Know how your endpoint merges

Read the current state and know the merge rule before you `PATCH`, or you'll silently drop fields:

- **Mapping overrides are field-replacing.** Setting `response_mapping` (a JSONata string) in an override **replaces the base wholesale** — you must restate the whole expression, not just the new field. (Objects deep-merge; arrays are replaced.) See [P3](./debug-unified-api.md#the-wholesale-replace-gotcha).
- **`environment-integration.override` is a full replace.** API `PATCH` and CLI `update` replace the stored `override` wholesale — omitted slots and resource keys disappear. Prefer `override-*` helpers for auth/pagination/rate_limit/webhook; for `resources`, `show-override` → merge locally → send the complete override. ([Customizing Integrations §5](../../truto/references/customizing-integrations.md#5-override-resources-full-override-required))
- **Account `context` merges shallowly.** Top-level keys merge, but a nested object/array you send **replaces** the stored one. Pass the complete nested value, not a partial. ([Integrated Account Context](../../truto/references/integrated-account-context.md))
- **Secrets are redacted on read.** Sensitive fields come back stripped (`x-assistant-deny-fields`). A read-modify-write that includes a redacted field will write the redaction back — exclude secrets from your body and never echo them into chat.

## Skip / Stop

- **Skip the write path entirely** when the fix is the end user re-consenting or reconnecting — there's no admin write to make ([P6](./diagnose-integrated-account.md)).
- **Stop once the approval is surfaced** with a clear, explained diff. Don't bundle unrelated changes into the same write; one fix, one approval.

## Anti-patterns

- Proposing a write without a reproduced root cause.
- Guessing a config key or body shape instead of `describe_api_operation` + reading the relevant skill.
- Editing the **base** integration/mapping when an **environment** or **account** override is the correct, narrower fix (or vice-versa).
- Patching credentials/tokens to "fix" auth — it's destructive, often blocked-adjacent, and the wrong fix; the user must reconnect.
- Echoing or writing back secret values; treating a remembered safe-write as standing permission for a destructive one.

## Reuses

- [Error & evidence model](./error-and-evidence-model.md) — to confirm the cause is reproduced before writing.
- [Unified API Customization](../../truto/references/unified-api-customization.md), [Integrated Account Context](../../truto/references/integrated-account-context.md), [Webhooks & Notifications](../../truto/references/webhooks-and-notifications.md), [Sync Jobs](../../truto/references/sync-jobs.md) — body shapes and merge semantics.
- [truto-jsonata](../../truto-jsonata/SKILL.md) — any JSONata in the body.
