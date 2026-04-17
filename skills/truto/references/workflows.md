# Workflows

Workflows are event-driven automations triggered by Truto events (e.g., account connection). They run a sequence of steps in response to a trigger.

## Endpoints

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/workflow` | List workflows |
| `GET` | `/workflow/:id` | Get a workflow |
| `POST` | `/workflow` | Create a workflow |
| `PATCH` | `/workflow/:id` | Update a workflow |
| `DELETE` | `/workflow/:id` | Delete a workflow |

## Create a Workflow

Workflows accept both JSON and YAML request bodies:

```bash
curl -X POST https://api.truto.one/workflow \
  -H "Authorization: Bearer $TRUTO_API_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "trigger_name": "integrated_account:active",
    "config": {
      "steps": [
        {
          "type": "run",
          "action": "run_sync_job",
          "config": {
            "sync_job_id": "<sync_job_uuid>"
          }
        }
      ]
    }
  }'
```

### Create Fields

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `trigger_name` | string | Yes | Event that triggers the workflow. Must reference an existing trigger (e.g., `integrated_account:active`). |
| `environment_id` | uuid | Auto | Auto-set from API token |
| `config` | object | Yes | Workflow configuration with steps |

### Config Object

| Field | Type | Description |
|-------|------|-------------|
| `run_if` | string | Optional JSONata expression — workflow only runs if this evaluates to true |
| `steps` | array | Array of step objects (executed sequentially) |

### Step Object

| Field | Type | Description |
|-------|------|-------------|
| `type` | string | Must be `run` |
| `action` | string | Action to perform (e.g., `run_sync_job`) |
| `config` | object \| string | Action configuration. Can be a JSONata string that evaluates to an object. `run_sync_job` requires `sync_job_id`. |
| `run_if` | string | Optional JSONata expression — step is skipped if this evaluates to false |
| `cron_expression` | string | Optional — if set, creates a sync job cron trigger instead of an immediate run |

### Query Parameters (List)

| Parameter | Type | Description |
|-----------|------|-------------|
| `trigger_name` | string | Filter by trigger event |
| `environment_id` | uuid | Filter by environment |

### Response

`GET /workflow/:id` returns the workflow directly:

```json
{
  "id": "wf01...",
  "environment_id": "9c2e...",
  "trigger_name": "integrated_account:active",
  "config": {
    "steps": [
      {
        "type": "run",
        "action": "run_sync_job",
        "config": { "sync_job_id": "11aa..." }
      }
    ]
  },
  "created_at": "2024-09-01 10:00:00",
  "updated_at": "2024-09-01 10:00:00"
}
```

`GET /workflow` uses the standard list envelope.

## Workflow Runs

Track workflow execution history.

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/workflow-run` | List workflow runs |
| `GET` | `/workflow-run/:id` | Get a workflow run |
| `DELETE` | `/workflow-run/:id` | Delete a workflow run |

Workflow runs are created internally when a matching event fires — there is no `POST` endpoint.

### Run Status Values

| Status | Description |
|--------|-------------|
| `created` | Run initialized |
| `running` | Currently executing |
| `completed` | Finished successfully |
| `failed` | Failed with errors |

### Workflow Run Response

`GET /workflow-run/:id` returns:

```json
{
  "id": "wfr01...",
  "workflow_id": "wf01...",
  "status": "completed",
  "result": {
    "success": true,
    "steps": [
      {
        "type": "run",
        "action": "run_sync_job",
        "success": true,
        "result": { /* step output */ }
      }
    ]
  },
  "retry_attempt": 0,
  "started_at": "2024-09-10 12:00:00",
  "finished_at": "2024-09-10 12:00:05",
  "created_at": "2024-09-10 12:00:00",
  "updated_at": "2024-09-10 12:00:05"
}
```

Failed runs include `result.error` and per-step `error` strings. `GET /workflow-run` uses the standard list envelope.

## Gotchas

- `trigger_name` must exist in the `workflow_trigger` table before creating a workflow. If the trigger doesn't exist, you'll get a `NotFoundError`.
- Steps run sequentially, not in parallel.
- The only supported step `action` is `run_sync_job`. Unknown actions return `BadRequestError`.
