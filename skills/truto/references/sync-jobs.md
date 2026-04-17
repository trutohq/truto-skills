# Sync Jobs

Sync jobs define data synchronization tasks that pull data from integrated accounts and write to destinations (SuperQuery, datastores, webhooks).

## Sync Jobs

### Endpoints

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/sync-job` | List sync jobs |
| `GET` | `/sync-job/:id` | Get a sync job |
| `POST` | `/sync-job` | Create a sync job |
| `PATCH` | `/sync-job/:id` | Update a sync job |
| `DELETE` | `/sync-job/:id` | Delete a sync job |

### Create a Sync Job

```bash
curl -X POST https://api.truto.one/sync-job \
  -H "Authorization: Bearer $TRUTO_API_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "label": "Sync CRM Contacts",
    "integration_name": "salesforce",
    "resources": []
  }'
```

> With an API token, `environment_id` is auto-set from the token's environment.

#### Create Fields

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `label` | string | No | Human-readable label (default: `"Untitled"`) |
| `integration_name` | string | No | Target integration name |
| `resources` | array | No | Resource definition graph (request, transform, destination nodes) |
| `args_schema` | object | No | JSON schema for runtime arguments |
| `args_validation` | string | No | Validation expression for arguments |
| `mutex_key` | string \| null | No | Key for mutual exclusion across runs |
| `state_key` | string \| null | No | Key for persistent state across runs |
| `default_runtime_version` | number | No | Runtime version (default: 3) |

#### Query Parameters (List)

| Parameter | Type | Description |
|-----------|------|-------------|
| `integration_name` | string | Filter by integration name |
| `environment_id` | uuid | Filter by environment |

### Response

`GET /sync-job/:id` returns the sync job directly:

```json
{
  "id": "11aa...",
  "label": "Sync CRM Contacts",
  "integration_name": "salesforce",
  "environment_id": "9c2e...",
  "resources": [ /* DAG of nodes */ ],
  "args_schema": null,
  "args_validation": null,
  "mutex_key": null,
  "state_key": null,
  "default_runtime_version": 3,
  "created_at": "2024-09-01 10:00:00",
  "updated_at": "2024-09-01 10:00:00"
}
```

`GET /sync-job` uses the standard list envelope. `DELETE /sync-job/:id` returns `{ "id": "<sync_job_uuid>" }`.

### Sync Job Resource Graph

The `resources` field defines a directed acyclic graph of nodes:

- **`request`** — Fetch data from unified or proxy API
- **`transform`** — Transform data using JSONata expressions
- **`spool`** — Buffer data for batch processing
- **`add_context`** — Add context from integrated account
- **`destination`** — Write data to a destination:
  - `superquery` — Truto's SuperQuery data store
  - `datastore` — External datastore (MongoDB, GCS, S3, Qdrant)
  - `webhook` — Send to a webhook URL
- **`event`** — Emit events
- **`update_state`** / **`get_state`** / **`delete_state`** — Manage persistent run state

---

## Sync Job Runs

A sync job run is a single execution of a sync job for a specific integrated account.

### Endpoints

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/sync-job-run` | List runs |
| `GET` | `/sync-job-run/:id` | Get a run |
| `POST` | `/sync-job-run` | Trigger a run |
| `PATCH` | `/sync-job-run/:id` | Update a run |
| `DELETE` | `/sync-job-run/:id` | Delete a run |

### Trigger a Sync Job Run

```bash
curl -X POST https://api.truto.one/sync-job-run \
  -H "Authorization: Bearer $TRUTO_API_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "sync_job_id": "<sync_job_uuid>",
    "integrated_account_id": "<account_uuid>",
    "status": "created"
  }'
```

#### Create Fields

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `sync_job_id` | uuid | Yes | Sync job to run |
| `integrated_account_id` | uuid | Yes | Account to sync from |
| `status` | string | Yes | Initial status (typically `created`) |
| `args` | object | No | Runtime arguments |
| `resources` | array | No | Override resource definitions |
| `super_query` | string | No | SuperQuery region: `apac` or `wnam` |
| `error_handling` | string | No | `fail_fast`, `ignore`, or `batch` |
| `ignore_previous_run` | boolean | No | Skip incremental sync logic |
| `force` | boolean | No | Force execution even if mutex locked |
| `events_to_send` | array | No | Event types to emit |
| `datastore_id` | uuid | No | Override destination datastore |
| `mutex_key` | string | No | Override mutex key |
| `state_key` | string | No | Override state key |

#### Status Values

| Status | Description |
|--------|-------------|
| `created` | Run has been created, pending execution |
| `running` | Currently executing |
| `completed` | Finished successfully |
| `failed` | Failed with errors |
| `stopped` | Manually stopped |

#### Query Parameters (List)

| Parameter | Type | Description |
|-----------|------|-------------|
| `sync_job_id` | uuid | Filter by sync job |
| `integrated_account_id` | uuid | Filter by account |

### Response

`GET /sync-job-run/:id` returns the run directly:

```json
{
  "id": "22bb...",
  "sync_job_id": "11aa...",
  "integrated_account_id": "abcd...",
  "environment_id": "9c2e...",
  "status": "completed",
  "args": {},
  "super_query": null,
  "error_handling": "fail_fast",
  "created_at": "2024-09-10 12:00:00",
  "updated_at": "2024-09-10 12:05:30",
  "started_at": "2024-09-10 12:00:01",
  "finished_at": "2024-09-10 12:05:30",
  "result": { /* run summary */ }
}
```

`GET /sync-job-run` uses the standard list envelope.

### Webhook Events

Sync job runs emit webhook events:
- `sync_job_run:created` — When a run is created
- `sync_job_run:updated` — When a run status changes
- `sync_job_run:deleted` — When a run is deleted

---

## Sync Job Cron Triggers

Cron triggers schedule automatic execution of sync jobs on a recurring basis.

### Endpoints

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/sync-job-cron-trigger` | List triggers |
| `GET` | `/sync-job-cron-trigger/:id` | Get a trigger |
| `POST` | `/sync-job-cron-trigger` | Create a trigger |
| `PATCH` | `/sync-job-cron-trigger/:id` | Update a trigger |
| `DELETE` | `/sync-job-cron-trigger/:id` | Delete a trigger |
| `POST` | `/sync-job-cron-trigger/:id/schedule` | Activate/reschedule the trigger |

### Create a Cron Trigger

```bash
curl -X POST https://api.truto.one/sync-job-cron-trigger \
  -H "Authorization: Bearer $TRUTO_API_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "sync_job_id": "<sync_job_uuid>",
    "integrated_account_id": "<account_uuid>",
    "cron_expression": "0 */6 * * *"
  }'
```

#### Create Fields

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `sync_job_id` | uuid | Yes | Sync job to trigger |
| `integrated_account_id` | uuid | No | Account to sync (may be set by service layer) |
| `cron_expression` | string | Yes | Cron expression (e.g., `0 */6 * * *` for every 6 hours) |
| `args` | object | No | Runtime arguments |
| `super_query` | string | No | SuperQuery region |
| `error_handling` | string | No | Error handling strategy |
| `events_to_send` | array | No | Event types to emit |
| `meta` | object | No | Arbitrary metadata |

### Schedule a Trigger

After creating a trigger, activate it:

```bash
curl -X POST https://api.truto.one/sync-job-cron-trigger/$TRIGGER_ID/schedule \
  -H "Authorization: Bearer $TRUTO_API_TOKEN"
```

### Response

`GET /sync-job-cron-trigger/:id` returns the trigger directly:

```json
{
  "id": "33cc...",
  "sync_job_id": "11aa...",
  "integrated_account_id": "abcd...",
  "cron_expression": "0 */6 * * *",
  "args": {},
  "events_to_send": null,
  "error_handling": null,
  "super_query": null,
  "meta": {},
  "environment_id": "9c2e...",
  "created_at": "2024-09-01 10:00:00",
  "updated_at": "2024-09-01 10:00:00"
}
```

`GET /sync-job-cron-trigger` uses the standard list envelope. `POST /:id/schedule` returns `{ "success": true }`.

---

## Sync Job Templates

Templates are reusable sync job definitions that can be shared across teams.

### Endpoints

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/sync-job-template` | List templates |
| `GET` | `/sync-job-template/:id` | Get a template |
| `POST` | `/sync-job-template` | Create a template |
| `PATCH` | `/sync-job-template/:id` | Update a template |
| `DELETE` | `/sync-job-template/:id` | Delete a template |

#### Create Fields

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `label` | string | Yes | Template name |
| `default_runtime_version` | number | Yes | Runtime version |
| `resources` | array | No | Resource definition graph |
| `integration_name` | string \| null | No | Target integration |
| `description` | string | No | Template description |
| `sharing` | string | No | Sharing: `deny` (default), `ask`, or `allow` |
| `args_schema` | object | No | Arguments JSON schema |
| `args_validation` | string | No | Validation expression |

---

## Sync Job Run State

Persistent key-value state that persists across sync job runs, scoped by a namespace (`state_key`).

### Endpoints

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/sync-job-run-state?state_key={key}` | List state entries |
| `GET` | `/sync-job-run-state/:id?state_key={key}` | Get a state entry |
| `POST` | `/sync-job-run-state?state_key={key}` | Create/update a state entry |
| `PATCH` | `/sync-job-run-state/:id?state_key={key}` | Update a state entry |
| `DELETE` | `/sync-job-run-state/:id?state_key={key}` | Delete a state entry |

The `state_key` query parameter is **required** on all operations — it acts as the namespace.

### Create/Update State

```bash
curl -X POST "https://api.truto.one/sync-job-run-state?state_key=my-sync-state" \
  -H "Authorization: Bearer $TRUTO_API_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"key": "last_sync_cursor", "value": "2024-01-15T00:00:00Z"}'
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `key` | string | Yes | State entry key |
| `value` | any | Yes | State value (any JSON-serializable value) |
