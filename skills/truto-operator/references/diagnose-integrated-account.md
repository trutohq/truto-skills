# P6 · Diagnose a Broken / Unauthorized Integrated Account

**Use this when** you see 401/403, "needs reauth", a validation or post-install error, or "the connection stopped working." This is frequently the *real* root cause behind a P2/P3/P4 report — and it's the one place where the honest answer is usually "an admin write can't fix this; the end user has to reconnect."

> Judgment, not a script — apply [the adaptive contract](../SKILL.md#the-adaptive-contract). The goal is to name the status, the reason, and **who must act** — then route. The actor is almost never you.

## What you must establish

- the account's **status**;
- the **specific reason** — token expiry vs missing scope vs missing config vs post-install failure;
- therefore **who must act** — almost always the end user reconnecting, *not* an admin write.

## Evidence — what to read

1. **The account.** `call_platform_api { method: "GET", path: "/integrated-account/{id}", fields: ["last_error", "last_forbidden_error", "last_action_run_result"] }`. Read:
   - `status` — one of exactly five: `connecting`, `active`, `needs_reauth`, `validation_error`, `post_install_error`.
   - `last_error` — the human-readable failure string.
   - `last_forbidden_error` — `{ resource, method, missing_scopes[], occurred_at }` for the most recent 403.
   - `authentication_method`, `is_sandbox` — context for what a reconnect would involve.
2. **The block + capability echo.** `get_capabilities { target: accountId }` returns an `account` block with `status` and **`is_blocked`**. Note: **`is_blocked` is not a field on the account row** — it's computed from a blocklist and surfaced only here. A blocked account (also surfaced as a `503`) means contact support, not reconnect.

> `last_forbidden_error` isn't in the documented OpenAPI schema, and the catalog labels the post-install result `last_action_result` while the actual response returns `last_action_run_result`. Request them explicitly with `fields` and trust what the response returns — `describe_api_operation` is the tiebreaker on exact field names.

### The lifecycle fact that explains most of these

A **remote 401** (the provider rejecting the connection's credentials) flips the account to `needs_reauth`, sets `last_error`, and fires the `integrated_account:authentication_error` webhook. From then on the connection keeps returning 401 **until the end user reconnects** — nothing you `PATCH` changes that. ([Connection Flow](../../truto/references/connection-flow.md))

A **remote 403 behaves differently.** It records `last_forbidden_error` (`resource`, `method`, `missing_scopes`, `occurred_at`) but does **not** change `status` and fires no webhook — so a scope-gapped account frequently still reads `status: active`. Detect scope problems from `last_forbidden_error`, not from `status`. (On a later success `last_forbidden_error` clears; a `needs_reauth` → `active` recovery fires `integrated_account:reactivated`.)

## Branch on status → reason → actor

| `status` / signal | Reason | Who fixes it, how |
| --- | --- | --- |
| `needs_reauth` | Credentials expired/revoked | **End user reconnects** through the app (Truto Link). You can't do it for them — and you can't even mint the token: `/link-token` is a [forbidden surface](./safe-admin-changes.md#the-classification--what-needs-approval-whats-blocked). Surface a clear "reconnect" prompt. |
| `last_forbidden_error.missing_scopes` set (from a 403) — `status` may still be `active` | The connection lacks OAuth scopes for that resource/method | **End user reconnects with the added scopes** — same flow, broader consent |
| `validation_error` | A required `context` field is missing/invalid | Usually a reconnect — but a missing required `context` field is the **one** case that may warrant a narrow admin `PATCH /integrated-account/{id}` context update, evidence-led, via [P1](./safe-admin-changes.md) (context merges shallowly — pass the full nested value). **Never** patch credentials. |
| `post_install_error` | A post-install action failed | Inspect `last_action_run_result` for the failing step; fix the underlying cause (often config or a provider permission), then re-run/reconnect |
| `is_blocked: true` / `503` | The account is blocked | Contact `support@truto.one` — not a reconnect, not a write |
| `active` **and** no `last_forbidden_error` | The account is healthy | This isn't an account problem — return to the calling playbook |

## Skip / Stop

- **Skip** straight back to the calling playbook if `status` is already `active` and the failure is elsewhere — don't manufacture an account problem.
- **Stop** once you have status + reason + required actor. That's the whole job here: P6 diagnoses and routes; it rarely writes.

## Anti-patterns

- **Proposing to `PATCH` credentials/tokens.** It's destructive, often blocked-adjacent, and the *wrong* fix — the user must re-consent. The only sanctioned account write is a narrow `validation_error` context fix.
- Treating a `missing_scopes` 403 as a code or mapping bug — it's a consent gap, fixed by reconnecting with scopes.
- Assuming you can re-authenticate on the user's behalf. You can't generate a link token (`/link-token` is forbidden) and you can't complete OAuth for them — always hand reconnection to the end user.

## Supersedes / Reuses

- **New** — no prior guide covered account state; the other playbooks branch here for anything auth-shaped.
- **Reuses** [Connection Flow](../../truto/references/connection-flow.md) (lifecycle + reconnection), [Integrated Account Context](../../truto/references/integrated-account-context.md) (the `context`/credentials model and shallow-merge rule), the [Error & evidence model](./error-and-evidence-model.md), and the `truto-cli` account-status commands. The user-facing reauthorization docs are a deep link **for the user to act on**, not a doc for you to fetch.
