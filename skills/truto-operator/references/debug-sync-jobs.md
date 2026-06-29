# P4 · Debug a Sync Job

**Use this when** a sync job run failed, is stuck, is rate-limited, or completed but the destination didn't receive data. V4 runs are Durable-Object / alarm-driven, with specific states and a stuck threshold — so "is it actually broken, or just working slowly / waiting?" is the question that saves you from a destructive over-correction.

> Judgment, not a script — apply [the adaptive contract](../SKILL.md#the-adaptive-contract). Some states (`rate_limited`, an in-progress run) self-heal and need **no action**. Confirm the state before touching anything; a reflexive restart is the classic mistake here.

## What you must establish

- the run's **status**;
- **where it stopped** — which resource, how far it got (`resource_stats`);
- the **root-cause class** — auth, mapping, rate-limit, upstream, or downstream **delivery** (an empty destination is often not a sync bug at all).

## Run states

A run is one of six states. Two of them (`running`, `rate_limited`) are *in progress* and generally resolve on their own.

| `status` | Meaning | Default action |
| --- | --- | --- |
| `created` | Queued, not started | Wait |
| `running` | Executing | Wait — only "stuck" if flat past the threshold (below) |
| `rate_limited` | Backing off a rate limit | **None — it auto-resumes.** Confirm `retry_after`, explain the self-heal |
| `completed` | Finished successfully | If the destination is empty, it's a **delivery** problem — [check the destination type](#when-completed-but-the-destination-is-empty) |
| `failed` | Errored out | Read the run error + `rapid_bridge` logs to classify |
| `stopped` | Manually stopped | Check who/why before re-running |

> Note: the [Sync Jobs](../../truto/references/sync-jobs.md) reference predates `rate_limited` in its run-state table — it's a real, current state and it means "waiting," not "broken."

## Evidence — what to read

1. **The run.** `GET /sync-job-run/{id}`, or discover the bad run with `GET /sync-job-run?sync_job_id=…&status=failed` (confirm exact filters with `describe_api_operation`; project with `jsonata`). Read: `status`, `resource_stats` (free-form per-resource progress — typically `fetched`/`persisted` counts per resource/method; this is your "where did it stop"), `error_handling` (`fail_fast` | `ignore` | `batch`), `ignore_previous_run`, `mutex_key`, `state_key`.
2. **The job shape**, if you need the resource DAG: `GET /sync-job/{id}` — the `resources[]` nodes and their dependencies.
3. **Run logs.** `GET /log` with `log_type: "rapid_bridge"`, filtered by `sync_job_run_id` (and `sync_job_run_event` to focus on a phase). Read: `status`, `num_records`, `resource`, `retry_after`, `retry_count`, `logs[]` ([`/log` quick-map](./error-and-evidence-model.md#the-log-quick-map)).
4. **Missed schedules.** If the run never even started, the cron may not have fired: `GET /log` with `log_type: "sync_job_cron_trigger"` — filterable by `environment_id` only, so fetch the env's cron fires and match `entity_id` (the sync-job id) on the entries yourself.

## Branch on status

| Finding | Cause class | Where it goes |
| --- | --- | --- |
| `failed` with `integrated_account_needs_reauth` in the logs | Auth | [P6](./diagnose-integrated-account.md) |
| `failed` with a mapping/transform error | Mapping | [P3](./debug-unified-api.md) |
| `failed` with an upstream `5xx` / provider error | Upstream | Retry policy per the [Error model](./error-and-evidence-model.md#retry-rule); treat as flaky provider |
| `rate_limited` | Rate limit | **No action** — confirm `retry_after`, explain it resumes itself |
| `running` and flat (`resource_stats` not advancing) **past 5 minutes** | Genuinely stuck | Surface it for escalation — see [Stuck runs](#stuck-runs-are-a-platform-concern) |
| `completed` but the destination got nothing | Delivery, not sync | [Which destination?](#when-completed-but-the-destination-is-empty) — webhook → P5; datastore/SuperQuery → datastore checks |
| Run never started; no `sync_job_cron_trigger` entry | Cron didn't fire | Inspect the cron trigger / schedule |

## When `completed` but the destination is empty

A sync run writes to one or more **destinations** — a `webhook`, a `datastore` (S3 / GCS / Qdrant / MongoDB), or `superquery`. A `completed` run with an empty destination is a *delivery* problem, not a fetch problem, and the destination type decides where you go:

- Read the run's `rapid_bridge` logs: `num_records` shows the fetch side produced rows, while **`webhook_successful`** and **`datastore_successful`** tell you whether each delivery leg actually succeeded.
- **Webhook** destination → [P5](./debug-webhook-delivery.md).
- **Datastore** destination (S3/GCS/Qdrant/Mongo) → inspect the datastore config and delivery — see [Datastores](../../truto/references/datastores.md). A leg with `datastore_successful: false`, or a `resources_to_persist` that didn't match any produced resource, lands nothing even though the run completed.
- **SuperQuery** destination → confirm the SuperQuery destination id and region on the run.

If `num_records > 0` but nothing arrived, the fault is the destination leg, not the sync — don't re-run the fetch.

## Stuck runs are a platform concern

The stuck threshold is **5 minutes** of no progress for an in-progress run (`STUCK_SYNC_JOB_RUN_MINUTES`). Below that, a slow run is just a slow run.

Recovering a genuinely-stuck run is a **platform/admin** matter, not an assistant action. A platform admin path (`/admin/sync-job/restart-stuck`) exists that clears stuck/zombie rows — it flips them to `failed` and restarts `created` ones, but it does **not** stop a live Durable Object — and it sits on the `/admin` surface, outside your meta-tools (it isn't in the API catalog you can call). So **surface the stuck run for escalation; don't reflexively restart**, and never reach for `ignore_previous_run` as a workaround (see anti-patterns).

## Skip / Stop

- **Skip discovery** when `route_context` or the user already pins the run id and status — go straight to the run + its logs.
- **Skip deep log reads** for a `rate_limited` run — confirm `retry_after` and explain the self-heal; there's nothing to fix.
- **Stop** once status + stop-point + cause class are known. If one resource clearly failed, don't enumerate every other resource for completeness.

## Anti-patterns

- Reflexively restarting, or setting `ignore_previous_run: true` — that **forces a full, expensive re-sync** by discarding the incremental cursor. Only do it with a clear reason and the user's approval ([P1](./safe-admin-changes.md)).
- "Fixing" a `rate_limited` run that will resume on its own.
- Calling an empty destination a sync failure before checking webhook delivery ([P5](./debug-webhook-delivery.md)).
- Proposing writes against a **running** job — let it finish or stop it first.

## Supersedes / Reuses

- **Supersedes** the four-bullet `truto://guide/sync-debugging` stub.
- **Reuses** [Sync Jobs](../../truto/references/sync-jobs.md), [Files & Logs](../../truto/references/files-and-logs.md), and the [Error & evidence model](./error-and-evidence-model.md). The backend `truto://reference/incremental-sync-job-v4-s3-parquet` covers the V4 runtime in depth.
