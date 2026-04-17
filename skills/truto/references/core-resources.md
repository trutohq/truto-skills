# Core Resources

## Environments

An environment is an isolated workspace that scopes all resources — integrations, accounts, sync jobs, webhooks, etc. API tokens are tied to a single environment.

### Endpoints


| Method  | Path               | Description           |
| ------- | ------------------ | --------------------- |
| `GET`   | `/environment`     | List environments     |
| `GET`   | `/environment/:id` | Get an environment    |
| `PATCH` | `/environment/:id` | Update an environment |


> **Note:** Environments are created through the Truto Dashboard, not via API.

### Fields


| Field        | Type     | Description            |
| ------------ | -------- | ---------------------- |
| `id`         | uuid     | Environment identifier |
| `name`       | string   | Display name           |
| `team_id`    | uuid     | Parent team            |
| `created_at` | datetime | Creation timestamp     |
| `updated_at` | datetime | Last update timestamp  |


### Update an Environment

```bash
curl -X PATCH https://api.truto.one/environment/$ENV_ID \
  -H "Authorization: Bearer $TRUTO_API_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"name": "Production"}'
```

### Response

`GET /environment/:id` and `PATCH /environment/:id` return the environment directly:

```json
{
  "id": "9c2e...",
  "name": "Production",
  "team_id": "21a8...",
  "created_at": "2024-01-15 10:00:00",
  "updated_at": "2024-09-01 14:32:00"
}
```

`GET /environment` returns a paginated list:

```json
{
  "result": [ /* environments */ ],
  "next_cursor": null,
  "limit": 5000
}
```

See [Standard Response Envelopes](./unified-api.md#standard-response-envelopes) for envelope details.

---

## Teams

A team is the top-level organizational unit. Each team has one or more environments and users. Teams are primarily managed through the Truto Dashboard or CLI.

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/team` | List teams |
| `GET` | `/team/:id` | Get a team |
| `PATCH` | `/team/:id` | Update a team |
| `POST` | `/team/:id/invite` | Invite a user (admin only) |

---

## Integrations

An integration represents a third-party tool (e.g., Salesforce, Jira, Slack). Integrations define the authentication method, API configuration, and available resources.

### Endpoints


| Method   | Path                            | Description             |
| -------- | ------------------------------- | ----------------------- |
| `GET`    | `/integration`                  | List integrations       |
| `GET`    | `/integration/:id`              | Get an integration      |
| `GET`    | `/integration/:id/tools`        | List available tools    |
| `GET`    | `/integration/:id/unified-apis` | List unified API models |
| `POST`   | `/integration`                  | Create an integration   |
| `PATCH`  | `/integration/:id`              | Update an integration   |
| `DELETE` | `/integration/:id`              | Delete an integration   |


### List Integrations

```bash
curl https://api.truto.one/integration \
  -H "Authorization: Bearer $TRUTO_API_TOKEN"
```

#### Query Parameters


| Parameter | Type   | Description                |
| --------- | ------ | -------------------------- |
| `name`    | string | Filter by integration name |
| `sharing` | string | Filter by sharing mode     |


### Integration Fields


| Field         | Type     | Description                                     |
| ------------- | -------- | ----------------------------------------------- |
| `id`          | uuid     | Integration identifier                          |
| `name`        | string   | Integration name (e.g., `salesforce`)           |
| `category`    | string   | Category (e.g., `crm`, `ticketing`)             |
| `is_beta`     | boolean  | Whether the integration is in beta              |
| `sharing`     | string   | Sharing mode: `deny`, `ask`, or `allow`         |
| `can_install` | boolean  | Whether it can be installed in your environment |
| `created_at`  | datetime | Creation timestamp                              |
| `updated_at`  | datetime | Last update timestamp                           |


> **Note:** Integration credentials and internal configuration are stripped from API responses.

### Response

`GET /integration/:id` returns:

```json
{
  "id": "a1b2...",
  "name": "salesforce",
  "category": "crm",
  "is_beta": false,
  "sharing": "allow",
  "can_install": true,
  "created_at": "2024-01-01 00:00:00",
  "updated_at": "2024-08-15 12:00:00"
}
```

`GET /integration` uses the standard list envelope (`{ result, next_cursor, limit }`).

`GET /integration/:id/tools` and `GET /integration/:id/unified-apis` return arrays describing the integration's exposed methods and unified models.

---

## Environment Integrations

An environment integration represents an integration installed into a specific environment, optionally with configuration overrides. Installation and configuration are typically done via the Truto Dashboard or CLI.

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/environment-integration` | List environment integrations |
| `GET` | `/environment-integration/:id` | Get an environment integration |
| `POST` | `/environment-integration` | Install an integration into an environment |
| `PATCH` | `/environment-integration/:id` | Update configuration |
| `DELETE` | `/environment-integration/:id` | Uninstall (revokes connected accounts) |

POST is idempotent — if the integration is already installed, the existing record is returned. Deleting an environment integration revokes all connected integrated accounts for that integration.

### Response

`GET /environment-integration/:id` returns:

```json
{
  "id": "ee11...",
  "integration_id": "a1b2...",
  "environment_id": "9c2e...",
  "override": { /* optional config overrides */ },
  "is_active": true,
  "created_at": "2024-02-01 09:00:00",
  "updated_at": "2024-02-01 09:00:00"
}
```

`GET /environment-integration` uses the standard list envelope. `DELETE` returns `{ "id": "<env_integration_uuid>" }`.

---

## Integrated Accounts

An integrated account is a connected instance of an integration for a specific tenant (your end-user). It holds credentials, configuration, and connection status.

### Endpoints


| Method   | Path                                      | Description                        |
| -------- | ----------------------------------------- | ---------------------------------- |
| `GET`    | `/integrated-account`                     | List integrated accounts           |
| `GET`    | `/integrated-account/:id`                 | Get an integrated account          |
| `POST`   | `/integrated-account`                     | Create an integrated account       |
| `PATCH`  | `/integrated-account/:id`                 | Update an integrated account       |
| `PATCH`  | `/integrated-account/:id/credentials`     | Update credentials only            |
| `DELETE` | `/integrated-account/:id`                 | Delete an integrated account       |
| `POST`   | `/integrated-account/token`               | Create an integrated account token |
| `POST`   | `/integrated-account/refresh-credentials` | Refresh OAuth credentials          |
| `POST`   | `/integrated-account/bulk-delete`         | Bulk delete accounts               |


### List Integrated Accounts

```bash
curl https://api.truto.one/integrated-account \
  -H "Authorization: Bearer $TRUTO_API_TOKEN"
```

#### Query Parameters


| Parameter        | Type    | Description             |
| ---------------- | ------- | ----------------------- |
| `tenant_id`      | string  | Filter by tenant        |
| `environment_id` | uuid    | Filter by environment   |
| `is_sandbox`     | boolean | Filter sandbox accounts |


### Create an Integrated Account

```bash
curl -X POST https://api.truto.one/integrated-account \
  -H "Authorization: Bearer $TRUTO_API_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "tenant_id": "my-customer-123",
    "environment_integration_id": "<env_integration_uuid>",
    "context": {},
    "authentication_method": "oauth2"
  }'
```

#### Create Fields


| Field                        | Type   | Required | Description                                      |
| ---------------------------- | ------ | -------- | ------------------------------------------------ |
| `tenant_id`                  | string | Yes      | Your identifier for the end-user                 |
| `environment_integration_id` | uuid   | Yes      | Environment integration to connect               |
| `context`                    | object | Yes      | Integration-specific configuration               |
| `authentication_method`      | string | Yes      | Auth method (e.g., `oauth2`, `api_key`, `basic`) |
| `region`                     | string | No       | Data region (`wnam` or `apac`, default `wnam`)   |


### Account Fields


| Field            | Type     | Description                       |
| ---------------- | -------- | --------------------------------- |
| `id`             | uuid     | Account identifier                |
| `tenant_id`      | string   | Your tenant identifier            |
| `environment_id` | uuid     | Parent environment                |
| `status`         | string   | Connection status                 |
| `is_sandbox`     | boolean  | Whether this is a sandbox account |
| `integration`    | object   | Associated integration details    |
| `context`        | object   | Account context (credentials redacted — see [Integrated Account Context](./integrated-account-context.md)) |
| `created_at`     | datetime | Creation timestamp                |
| `updated_at`     | datetime | Last update timestamp             |


### Response

`GET /integrated-account/:id` returns the account directly (with credentials stripped):

```json
{
  "id": "abcd...",
  "tenant_id": "my-customer-123",
  "environment_id": "9c2e...",
  "environment_integration_id": "ee11...",
  "status": "active",
  "is_sandbox": false,
  "authentication_method": "oauth2",
  "region": "wnam",
  "context": {
    "subdomain": "acme",
    "oauth": { "scope": ["read", "write"] }
  },
  "object_store_context_fields": [],
  "integration": {
    "id": "a1b2...",
    "name": "salesforce",
    "category": "crm"
  },
  "created_at": "2024-09-01 10:00:00",
  "updated_at": "2024-09-01 10:05:00"
}
```

`GET /integrated-account` uses the standard list envelope. `POST /integrated-account/bulk-delete` returns `{ "success": true }`. `POST /integrated-account/refresh-credentials` returns `{ "success": true }`.


### MCP Server Tokens

MCP tokens are scoped to a single integrated account and provide MCP protocol access for AI agents. See [MCP Tokens](./mcp-tokens.md) for full CRUD endpoints, configuration, and usage.

### Gotchas

- Credentials are stripped from list/get responses for security.
- The `region` field cannot be changed after creation.
- OAuth context fields are merged (not replaced) on PATCH.
- Sandbox accounts cannot make write operations via unified API.

---

## Environment Unified Models

Environment unified models control which unified API models (e.g., `crm`, `ticketing`, `hris`) are available in a specific environment. Installation and configuration are typically done via the Truto Dashboard or CLI.

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/environment-unified-model` | List |
| `GET` | `/environment-unified-model/:id` | Get |
| `POST` | `/environment-unified-model` | Install a unified model |
| `PATCH` | `/environment-unified-model/:id` | Update |
| `DELETE` | `/environment-unified-model/:id` | Remove |

POST is idempotent — if the model is already installed, the existing record is returned.

