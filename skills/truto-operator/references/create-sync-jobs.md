# P7 · Create / Generate a Sync Job

**Use this when** the user wants a *new* sync job built, or an existing one extended — "set up a nightly HubSpot → S3 sync", "generate a sync job for Salesforce contacts", "add a webhook destination to this job". This is the one operator playbook that **authors** rather than debugs; the write discipline of [P1](./safe-admin-changes.md) still applies to the final `POST` / `PATCH`.

> Judgment, not a script — apply [the adaptive contract](../SKILL.md#the-adaptive-contract). Build the *minimum* that satisfies the request, verify it with a test run, and stop.

## What you must establish before writing

1. **Runtime version.** New jobs are **V4** (`default_runtime_version: 4`) — the typed-DAG runtime. You must set this **explicitly**: `POST /sync-job` stamps a legacy default (currently `3`) when it's omitted, so a job created without it will *not* be V4. (Editing an *existing* job? `GET /sync-job/{id}` and match its version — see [P4 · step 1](./debug-sync-jobs.md#step-1--which-runtime-version); pre-V4 jobs use a flat request/transform list, not the V4 DAG, so compose in their shape.)
2. **Source + destination.** Which integration/account is the source, and where the data goes — a `webhook`, a `datastore` (S3 / GCS / Qdrant / Mongo), or SuperQuery. Confirm they already exist (`GET /integrated-account`, `GET /webhook` / `GET /datastore`): a sync job **references** an account/destination by id from `args`, it doesn't create them.
3. **What to pull.** Which resources/records, and whether it's a full or **incremental** (`state_key`) sync, one destination or fan-out.

## Build it

The full V4 config contract — the `resources` DAG, the node types (`request` / `spool` / `transform` / `add_context` / `get_state` / `update_state` / `delete_state` / `event` / `destination`), placeholders, `args_schema`, `run_if` / `depends_on`, incremental state, and the **Authoring Checklist** — lives in [Sync Jobs](../../truto/references/sync-jobs.md). Read it before composing and don't invent node shapes. As an operator you express the same thing through your meta-tools:

1. **Discover the source surface.** `get_capabilities` on the integration/account to see which unified/proxy resources you can pull, and `describe_api_operation` for `POST /sync-job` to get the exact body schema. Don't guess field names.
2. **Compose the config** per [Sync Jobs](../../truto/references/sync-jobs.md): `label`, `integration_name`, `args_schema` (every `args.*` placeholder used in `resources`), the `resources` DAG, `mutex_key` / `state_key` if scheduled/incremental, and `default_runtime_version: 4`. Run your draft against the [Authoring Checklist](../../truto/references/sync-jobs.md#authoring-checklist).
3. **Create** — `POST /sync-job` (an approval-gated write; per [P1](./safe-admin-changes.md), state the label, source, destination, and version in chat *before* you trigger it — the approval card shows only `POST /sync-job`).
4. **Test-run it** — `POST /sync-job-run` with a real `integrated_account_id` and `args` (also approval-gated). This is the real verification; **don't declare success off the create alone.**
5. **Verify the run** — hand off to [P4](./debug-sync-jobs.md): `GET /sync-job-run/{id}` for `status` / `resource_stats`, and `GET /log?log_type=rapid_bridge&sync_job_run_id=…` for the details. Fix and re-run until the destination actually receives data.

## Skip / Stop

- **Skip** capability discovery when the user already named exact resources and the account is known.
- **Stop** once a test run reaches `completed` **and** the destination received data. Don't add resources or destinations the user didn't ask for.

## Anti-patterns

- Omitting `default_runtime_version: 4` — the job silently lands on a legacy runtime.
- Declaring success on `POST /sync-job` without a test run — creation doesn't prove the DAG runs.
- Hard-coding datastore / webhook ids instead of templating them from `args`.
- Inventing node types, placeholders, or `args` formats — read [Sync Jobs](../../truto/references/sync-jobs.md) first; never guess a config key.
- Reusing `PATCH /sync-job-run` to "fix" a run — it isn't in your API catalog; re-run with `POST /sync-job-run` instead.

## Supersedes / Reuses

- **Reuses** [Sync Jobs](../../truto/references/sync-jobs.md) (the full V4 authoring contract + checklist), [Discovering Capabilities](../../truto/references/discovering-capabilities.md), and [P4 · Debug a sync job](./debug-sync-jobs.md) for verification. Hands the final write to [P1 · Make a safe admin change](./safe-admin-changes.md).
