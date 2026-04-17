# Daemon Jobs

Daemon jobs are background processing tasks (similar to sync jobs but for general-purpose work).

## Endpoints

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/daemon-job` | List daemon jobs |
| `GET` | `/daemon-job/:id` | Get a daemon job |
| `POST` | `/daemon-job` | Create a daemon job |
| `PATCH` | `/daemon-job/:id` | Update a daemon job |
| `DELETE` | `/daemon-job/:id` | Delete a daemon job |

### Create Fields

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `label` | string | Yes | Display name |
| `args_schema` | object | No | Arguments JSON schema |
| `args_validation` | string | No | Validation expression (JSONata) |

## Daemon Job Runs

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/daemon-job-run` | List runs |
| `GET` | `/daemon-job-run/:id` | Get a run |
| `POST` | `/daemon-job-run` | Trigger a run |
| `PATCH` | `/daemon-job-run/:id` | Update a run |
| `DELETE` | `/daemon-job-run/:id` | Stop a run |

### Run Create Fields

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `daemon_job_id` | uuid | Yes | Daemon job to run |
| `daemon_id` | uuid | Yes | Daemon to run against |
| `args` | object | No | Runtime arguments (validated against the job's `args_schema`) |

### Run Status Values

| Status | Description |
|--------|-------------|
| `created` | Run created |
| `running` | Currently executing |
| `completed` | Finished successfully |
| `failed` | Failed with errors |
| `stopped` | Manually stopped |

## Response

`GET /daemon-job/:id` returns the daemon job directly:

```json
{
  "id": "dj01...",
  "label": "Refresh Cache",
  "args_schema": null,
  "args_validation": null,
  "environment_id": "9c2e...",
  "created_at": "2024-09-01 10:00:00",
  "updated_at": "2024-09-01 10:00:00"
}
```

`GET /daemon-job-run/:id` returns the run directly:

```json
{
  "id": "djr01...",
  "daemon_job_id": "dj01...",
  "daemon_id": "dm01...",
  "status": "completed",
  "args": {},
  "daemon_group_key": null,
  "started_at": "2024-09-10 12:00:00",
  "finished_at": "2024-09-10 12:00:30",
  "environment_id": "9c2e...",
  "created_at": "2024-09-10 12:00:00",
  "updated_at": "2024-09-10 12:00:30"
}
```

`GET /daemon-job` and `GET /daemon-job-run` use the [standard list envelope](./unified-api.md#list-envelope). `DELETE /daemon-job-run/:id` returns the run with `status: "stopped"` — it does not actually delete the record.

## Gotchas

- DELETE on a run does not delete the record — it sets the status to `stopped`.
- Run `status` is always forced to `created` on POST, regardless of what you pass in the body.
