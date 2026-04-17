# Webhooks & Notifications

## Webhooks

Webhooks deliver real-time HTTP callbacks when events occur in your Truto environment.

### Endpoints

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/webhook` | List webhooks |
| `GET` | `/webhook/:id` | Get a webhook |
| `POST` | `/webhook` | Create a webhook |
| `PATCH` | `/webhook/:id` | Update a webhook |
| `DELETE` | `/webhook/:id` | Delete a webhook |
| `POST` | `/webhook/test` | Send a test event |

### Create a Webhook

```bash
curl -X POST https://api.truto.one/webhook \
  -H "Authorization: Bearer $TRUTO_API_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "target_url": "https://example.com/webhooks/truto",
    "event_types": ["sync_job_run:completed", "sync_job_run:failed"]
  }'
```

> With an API token, `environment_id` is auto-set.

#### Create Fields

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `target_url` | string | Yes | URL to receive webhook events |
| `environment_id` | uuid | Auto | Auto-set from API token |
| `is_active` | boolean | No | Whether the webhook is active (default: `true`) |
| `event_types` | string[] | No | Filter to specific event types |

> A `secret` is auto-generated on creation for verifying webhook signatures. It is included in the creation response only.

#### Query Parameters (List)

| Parameter | Type | Description |
|-----------|------|-------------|
| `is_active` | boolean | Filter by active status |
| `environment_id` | uuid | Filter by environment |

### Webhook Fields

| Field | Type | Description |
|-------|------|-------------|
| `id` | uuid | Webhook identifier |
| `target_url` | string | Delivery URL |
| `is_active` | boolean | Whether active |
| `event_types` | string[] | Subscribed event types |
| `environment_id` | uuid | Parent environment |
| `secret` | string | Signing secret (only on create response) |
| `created_at` | datetime | Creation timestamp |
| `updated_at` | datetime | Last update timestamp |

### Test a Webhook

```bash
curl -X POST https://api.truto.one/webhook/test \
  -H "Authorization: Bearer $TRUTO_API_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"id": "<webhook_uuid>"}'
```

Sends a test event (`eventType: "test"`, payload: `{"foo": "bar"}`) and returns success or failure based on the target URL's response.

### Webhook API Response

`GET /webhook/:id` returns the webhook directly:

```json
{
  "id": "ww01...",
  "target_url": "https://example.com/webhooks/truto",
  "is_active": true,
  "event_types": ["sync_job_run:completed", "sync_job_run:failed"],
  "environment_id": "9c2e...",
  "created_at": "2024-09-01 10:00:00",
  "updated_at": "2024-09-01 10:00:00"
}
```

> The `secret` field is only included in the **create** response. List and get responses strip it.

`GET /webhook` uses the standard list envelope. `POST /webhook/test` returns `{ "success": true }` (or an error envelope if the target URL fails).

### Webhook Delivery Payload

When an event fires, Truto sends a `POST` to your `target_url` with this JSON body:

```json
{
  "id": "evt_...",
  "event": "integrated_account:active",
  "payload": { /* event-specific data, see Connection Flow */ },
  "environment_id": "9c2e...",
  "webhook_id": "ww01...",
  "created_at": "2024-09-10 12:00:00"
}
```

Each delivery includes these headers:

| Header | Value |
|--------|-------|
| `Content-Type` | `application/json` (or `multipart/form-data` for `formdata` deliveries) |
| `User-Agent` | `truto` |
| `X-Truto-Signature` | `format=sha256,v=<hex_hmac>` — HMAC-SHA256 of the body using the webhook's `secret` |

Verify deliveries by recomputing the HMAC over the raw request body with the stored `secret` and comparing to the value after `v=` in `X-Truto-Signature`.

### Event Types

Common webhook event types:

| Event | Description |
|-------|-------------|
| `sync_job_run:created` | Sync job run started |
| `sync_job_run:updated` | Sync job run status changed |
| `sync_job_run:completed` | Sync job run finished successfully |
| `sync_job_run:failed` | Sync job run failed |
| `sync_job_run:deleted` | Sync job run deleted |
| `integrated_account:created` | Account credentials saved (not yet ready for API calls) |
| `integrated_account:active` | Account is fully connected and ready for API calls |
| `integrated_account:post_install_error` | Post-install setup steps failed |
| `integrated_account:validation_error` | Connection validation failed |
| `integrated_account:post_connect_form_submitted` | User submitted the post-connect form (RapidForm) |
| `integrated_account:updated` | Account updated |
| `integrated_account:deleted` | Account deleted |
| `environment_integration:created` | Integration installed |
| `environment_integration:updated` | Integration config changed |
| `environment_integration:deleted` | Integration uninstalled |
| `api_token:created` | API token created |
| `api_token:deleted` | API token deleted |
| `record:*` | Data change events from inbound webhooks |
| `test` | Test event |

### Webhook Limits

The number of webhooks per environment may be subject to plan limits.

---

## Notification Destinations

Notification destinations deliver operational alerts (errors, status changes) to Slack or email.

### Endpoints

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/notification-destination` | List destinations |
| `GET` | `/notification-destination/:id` | Get a destination |
| `POST` | `/notification-destination` | Create a destination |
| `PATCH` | `/notification-destination/:id` | Update a destination |
| `DELETE` | `/notification-destination/:id` | Delete a destination |
| `POST` | `/notification-destination/test` | Send a test notification |

### Create a Slack Destination

```bash
curl -X POST https://api.truto.one/notification-destination \
  -H "Authorization: Bearer $TRUTO_API_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "type": "slack",
    "label": "Engineering Alerts",
    "config": {
      "webhook_url": "https://hooks.slack.com/services/..."
    }
  }'
```

### Create an Email Destination

```bash
curl -X POST https://api.truto.one/notification-destination \
  -H "Authorization: Bearer $TRUTO_API_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "type": "email",
    "label": "Ops Team",
    "config": {
      "to": ["ops@example.com"],
      "cc": ["eng@example.com"],
      "subject_prefix": "[Truto Alert]"
    }
  }'
```

#### Create Fields

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `type` | string | Yes | `slack` or `email` |
| `label` | string | No | Display name |
| `environment_id` | uuid | Auto | Auto-set from API token |
| `is_active` | boolean | No | Whether active (default: `true`) |
| `event_types` | string[] | No | Filter to specific events |
| `config` | object | Yes | Type-specific configuration (see below) |

#### Slack Config

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `webhook_url` | string | Yes | Slack incoming webhook URL |
| `ignored_status_codes` | number[] | No | HTTP status codes to suppress |

#### Email Config

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `to` | string[] | Yes | Recipient email addresses |
| `cc` | string[] | No | CC recipients |
| `bcc` | string[] | No | BCC recipients |
| `subject_prefix` | string | No | Email subject prefix |

### Test a Notification Destination

```bash
curl -X POST https://api.truto.one/notification-destination/test \
  -H "Authorization: Bearer $TRUTO_API_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"id": "<destination_uuid>"}'
```

`POST /notification-destination/test` returns `{ "success": true }` on success.

### Response

`GET /notification-destination/:id` returns the destination directly:

```json
{
  "id": "nd01...",
  "type": "slack",
  "label": "Engineering Alerts",
  "is_active": true,
  "config": {
    "webhook_url": "https://hooks.slack.com/services/..."
  },
  "event_types": ["sync_job_run:failed"],
  "environment_id": "9c2e...",
  "created_at": "2024-09-01 10:00:00",
  "updated_at": "2024-09-01 10:00:00"
}
```

`GET /notification-destination` uses the standard list envelope. Sensitive `config` fields (e.g. webhook URLs) are returned but should be treated as secret.

---

## Inbound Webhooks

Truto can receive webhooks from integrated third-party tools and route them to your application.

### How It Works

1. Each integrated account has a unique inbound webhook URL:
   ```
   https://api.truto.one/integrated-account-webhook/{integrated_account_id}
   ```
2. Configure the third-party tool to send webhooks to this URL
3. Truto verifies the webhook signature (HMAC, JWT, Basic, or Bearer)
4. Truto transforms the payload and emits `record:*` events to your webhooks

### Environment-Level Inbound Webhooks

For webhooks that apply to all accounts of an integration:

```
https://api.truto.one/environment-integration-webhook/{environment_integration_id}
```

These are verified and routed similarly, but scoped to the environment integration rather than a specific account.

### Verification Methods

Inbound webhooks support multiple signature verification methods:
- **HMAC** — Hash-based message authentication
- **JWT** — JSON Web Token verification
- **Basic** — Basic authentication
- **Bearer** — Bearer token verification

The verification method is configured on the integration's webhook settings.
