# Datastores

Datastores are external storage destinations for sync job output. Supported types: MongoDB Data API, Google Cloud Storage, Amazon S3, and Qdrant.

## Endpoints

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/datastore` | List datastores |
| `GET` | `/datastore/:id` | Get a datastore |
| `POST` | `/datastore` | Create a datastore |
| `PATCH` | `/datastore/:id` | Update a datastore |
| `DELETE` | `/datastore/:id` | Delete a datastore |
| `POST` | `/datastore/:id/test/:method` | Test a datastore operation |

## Create a Datastore

```bash
# MongoDB Data API datastore
curl -X POST https://api.truto.one/datastore \
  -H "Authorization: Bearer $TRUTO_API_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "type": "mongo_data_api",
    "label": "Production MongoDB",
    "config": {
      "data_source": "Cluster0",
      "database": "truto_sync",
      "api_url": "https://data.mongodb-api.com/app/...",
      "api_key": "..."
    }
  }'
```

### Create Fields

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `type` | string | Yes | `mongo_data_api`, `google_cloud_storage`, `s3`, or `qdrant` |
| `label` | string | Yes | Display name |
| `environment_id` | uuid | Auto | Auto-set from API token |
| `config` | object | Yes | Type-specific configuration |

### Config by Type

**MongoDB Data API:**

| Field | Type | Description |
|-------|------|-------------|
| `data_source` | string | MongoDB cluster data source name |
| `database` | string | Database name |
| `api_url` | string | Data API URL |
| `api_key` | string | API key |

**Google Cloud Storage:**

| Field | Type | Description |
|-------|------|-------------|
| `bucket` | string | GCS bucket name |
| `credentials` | object | Service account credentials |

**Amazon S3:**

| Field | Type | Description |
|-------|------|-------------|
| `access_key_id` | string | AWS access key |
| `secret_access_key` | string | AWS secret key |
| `region` | string | AWS region |
| `bucket` | string | S3 bucket name |
| `base_url` | string | Optional custom endpoint |

**Qdrant:**

| Field | Type | Description |
|-------|------|-------------|
| `base_url` | string | Qdrant server URL |
| `api_key` | string | API key |
| `port` | number | Port (default: 6333) |
| `collection` | string | Collection name |

## Response

`GET /datastore/:id` returns the datastore directly (with credentials stripped):

```json
{
  "id": "ds01...",
  "type": "mongo_data_api",
  "label": "Production MongoDB",
  "config": {
    "data_source": "Cluster0",
    "database": "truto_sync",
    "api_url": "https://data.mongodb-api.com/app/..."
  },
  "environment_id": "9c2e...",
  "created_at": "2024-09-01 10:00:00",
  "updated_at": "2024-09-01 10:00:00"
}
```

Note that `api_key`, `secret_access_key`, and similar credential fields are not present in `config` for `GET` responses — they are write-only.

`GET /datastore` uses the standard list envelope. `POST /datastore/:id/test/:method` returns `{ "success": true }` on success or an error envelope on failure.

## Gotchas

- Datastore credentials are stripped from GET responses.
- Test operations (`POST /:id/test/:method`) only work for `google_cloud_storage` and `s3` types. Mongo and Qdrant return `400`.
- PATCH merges the existing config with the new values (deep merge), then validates the merged result.
