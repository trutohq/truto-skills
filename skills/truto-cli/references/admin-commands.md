# Admin Resource Commands

All admin commands follow the pattern `truto <resource> <operation> [args] [options]`. Most support the standard CRUD operations: `list`, `get`, `create`, `update`, `delete`.

## Shared CRUD Flags

These flags are available across all resource commands:

| Flag | Operation | Description |
|------|-----------|-------------|
| `--limit <n>` | `list` | Results per page (default: 25) |
| `--next-cursor <cursor>` | `list` | Paginate to next page |
| `--stdin` | `create` | Read body from stdin (JSON array or NDJSON) |
| `-b, --body <json>` | `create`, `update` | Inline JSON request body |
| `-i, --interactive` | `update` | Pre-fill fields from current record for interactive editing |
| `-f, --force` | `delete` | Skip confirmation prompt |

---

## Core Resources

### Integrations (`truto integrations`)

Integration definitions — third-party app connectors. **Full CRUD.**

```bash
truto integrations list
truto integrations list --name slack
truto integrations get <id>
truto integrations create -b '{"name":"slack","config":{"label":"Slack","auth_type":"oauth2"}}'
truto integrations update <id> -b '{"category":"crm","config":{...},"version":1}'
truto integrations delete <id>
```

**Filters:** `--name`

**Create fields:** `name` (required), `config` (JSON, required), `category`

**Update fields:** `category`, `config` (JSON), `version` (required — optimistic locking)

**Extra commands:**

```bash
# List available tools/methods for an integration
truto integrations tools <id>

# List unified APIs mapped to an integration
truto integrations unified-apis <id>

# Interactively scaffold a starter integration.config and create the integration
truto integrations init                               # full interactive flow
truto integrations init acme-crm \
  --label "Acme CRM" --category crm \
  --auth oauth2 --base-url https://api.acme.com/v1 \
  --resources contacts,deals --webhook              # non-interactive when all flags supplied
truto integrations init --print                       # write JSON to stdout, do not create
truto integrations init --out integration.json        # write JSON to a file, do not create

# Best-effort client-side validation of an integration config
truto integrations validate <id>                      # validate the stored config
truto integrations validate --file integration.json   # validate a local file
cat integration.json | truto integrations validate --stdin
```

`init` supports auth formats `api_key`, `oauth2`, `oauth2_client_credentials`, `basic`, `keka_oauth`, `oauth`. The scaffold seeds `credentials`, `authorization`, a starter `resources` block (CRUD method skeletons per resource you list), and an optional `webhook` block. `validate` checks for missing `label`, `credentials`, valid `authorization.format`, parseable resource methods, and a non-empty `webhook` block — server-side schema validation still happens at create/update time.

For the full `integration.config` schema, all five credential formats (`api_key`, `oauth2`, `oauth2_client_credentials`, `oauth`, `keka_oauth`), and an end-to-end Acme CRM worked example that uses `init → validate → create`, see the [Authoring Integrations](../../truto/references/authoring-integrations.md) reference in the `truto` skill.

### Integrated Accounts (`truto accounts`)

Live tenant connections to integrations. **Full CRUD.**

> The CLI command is `accounts`, not `integrated-accounts`. This is intentional for brevity.

```bash
truto accounts list
truto accounts list --tenant_id <tid>
truto accounts list --is_sandbox true
truto accounts get <id>
truto accounts create -b '{"environment_integration_id":"...","tenant_id":"...","context":{...},"authentication_method":"oauth2","region":"wnam"}'
truto accounts update <id> -b '{"status":"inactive"}'
truto accounts delete <id>
```

**Filters:** `--tenant_id`, `--is_sandbox`

**Create fields:** `environment_integration_id` (required), `tenant_id` (required), `context` (JSON, required), `authentication_method` (required — `oauth2`, `api_key`, `basic`, etc.), `region` (default: `wnam`)

**Update fields:** `tenant_id`, `status`, `context` (JSON), `authentication_method`

**Extra commands:**

```bash
# Refresh OAuth credentials
truto accounts refresh-credentials <id>

# List available tools/methods for an account (best discovery command for LLM agents)
truto accounts tools <id>
truto accounts tools <id> --methods list,get --tags contacts,deals
```

### Environments (`truto environments`)

Isolated scopes within a team. **List, get, update only** (create/delete requires dashboard).

```bash
truto environments list
truto environments get <id>
truto environments update <id> -b '{"name":"Production"}'
```

Your API token is scoped to one environment — you never need to pass `environment_id`.

### Environment Integrations (`truto environment-integrations`)

Install and configure integrations per environment. **Full CRUD plus `override-*` helpers.**

```bash
truto environment-integrations list --integration_id <id>
truto environment-integrations get <id>
truto environment-integrations create -b '{"integration_id":"...","override":{...}}'
truto environment-integrations update <id> -b '{"is_enabled":false,"show_in_catalog":true}'
truto environment-integrations delete <id>
```

**Filters:** `--integration_id`

**Update fields:** `is_enabled` (boolean), `show_in_catalog` (boolean), `override` (JSON)

**Override helpers** — all four `override-*` commands deep-patch a single key under `override`, leaving siblings alone. Each accepts `--body <json>` / `--stdin` for the full block, or convenience flags + `--config` for the common shape, plus `--clear` to null the key out.

```bash
truto environment-integrations show-override <id>     # inspect current override block

# Authorization override (bearer / header / basic)
truto environment-integrations override-auth <id> \
  --format header \
  --config '{"header_name":"X-Api-Key","header_value":"{{credentials.api_key}}"}'
truto environment-integrations override-auth <id> --format bearer
truto environment-integrations override-auth <id> --clear

# Pagination override (page / cursor / link_header / offset / range / dynamic)
truto environment-integrations override-pagination <id> \
  --format cursor \
  --config '{"cursor_path":"meta.next","limit_param":"page_size"}'
truto environment-integrations override-pagination <id> --clear

# Rate-limit override (each value is a JSONata expression evaluated against the response)
truto environment-integrations override-rate-limit <id> \
  --is-rate-limited '$response.status = 429' \
  --retry-after-header '$number($header."retry-after")' \
  --rate-limit-header '$number($header."x-rate-limit-remaining")'

# Webhook override (signature verification, accept gate, payload transform)
truto environment-integrations override-webhook <id> \
  --signature-verification '{"format":"hmac","config":{"algorithm":"sha256","parts":["$body"],"secret":"{{credentials.webhook_secret}}","compare_with":"$header.x-signature"}}' \
  --handle-verification '$event.event_type != "test"' \
  --payload-transform '{ "type": $event.event_type, "data": $event.data }'
```

For end-to-end workflows (when to override what, JSONata scope per surface, debugging tips), see the [Customizing Integrations](../../truto/references/customizing-integrations.md) reference in the `truto` skill.

### API Tokens (`truto api-tokens`)

Environment-scoped Bearer credentials. **List and get only** (create/delete via dashboard).

```bash
truto api-tokens list
truto api-tokens list --name ci-token
truto api-tokens get <id>
```

**Filters:** `--name`

---

## Automation

### Sync Jobs (`truto sync-jobs`)

Declarative data-sync pipeline definitions. **Full CRUD.**

```bash
truto sync-jobs list
truto sync-jobs list --integration_name hubspot
truto sync-jobs get <id>
truto sync-jobs create -b '{"label":"Sync Contacts","integration_name":"hubspot","resources":{...},"default_runtime_version":2}'
truto sync-jobs update <id> -b '{"label":"Updated Label"}'
truto sync-jobs delete <id>
```

**Filters:** `--integration_name`

**Create fields:** `label` (required), `integration_name` (required), `resources` (JSON), `default_runtime_version` (number, default: 2)

### Sync Job Runs (`truto sync-job-runs`)

Pipeline execution records. **List, get, create, delete** (no update).

```bash
truto sync-job-runs list --sync_job_id <id>
truto sync-job-runs list --integrated_account_id <id>
truto sync-job-runs get <id>
truto sync-job-runs create -b '{"sync_job_id":"...","integrated_account_id":"..."}'
truto sync-job-runs delete <id>
```

**Filters:** `--sync_job_id`, `--integrated_account_id`

Both `sync_job_id` and `integrated_account_id` are required when creating a run.

### Sync Job Triggers (`truto sync-job-triggers`)

Cron-based triggers for sync jobs. **Full CRUD.** API path: `sync-job-cron-trigger`.

```bash
truto sync-job-triggers list --integrated_account_id <id>
truto sync-job-triggers get <id>
truto sync-job-triggers create -b '{"sync_job_id":"...","cron_expression":"0 */6 * * *"}'
truto sync-job-triggers update <id> -b '{"cron_expression":"0 0 * * *"}'
truto sync-job-triggers schedule <id>   # manually trigger
truto sync-job-triggers delete <id>
```

**Filters:** `--integrated_account_id`

**Create fields:** `sync_job_id` (required), `cron_expression` (required)

### Sync Job Templates (`truto sync-job-templates`)

Reusable pipeline blueprints. **Full CRUD.**

```bash
truto sync-job-templates list
truto sync-job-templates get <id>
truto sync-job-templates create -b '{"label":"CRM Sync","resources":{...},"default_runtime_version":2,"integration_name":"hubspot"}'
truto sync-job-templates update <id> -b '{"label":"Updated Template"}'
truto sync-job-templates delete <id>
```

**Create fields:** `label` (required), `resources` (JSON, required), `default_runtime_version` (required), `integration_name`, `description`

### Workflows (`truto workflows`)

Event-triggered automation with conditional steps. **Full CRUD.**

```bash
truto workflows list
truto workflows get <id>
truto workflows create -b '{"trigger_name":"on_new_contact","config":{...}}'
truto workflows update <id> -b '{"trigger_name":"on_update","config":{...}}'
truto workflows delete <id>
```

**Create fields:** `trigger_name` (required), `config` (JSON, required)

### Workflow Runs (`truto workflow-runs`)

Execution records for workflows. **List, get, delete only** (runs are triggered automatically).

```bash
truto workflow-runs list --workflow_id <id>
truto workflow-runs list --status completed
truto workflow-runs get <id>
truto workflow-runs delete <id>
```

**Filters:** `--workflow_id`, `--status`

---

## Webhooks & Alerts

### Webhooks (`truto webhooks`)

Outbound event delivery to your URLs. **Full CRUD.**

```bash
truto webhooks list
truto webhooks get <id>
truto webhooks create -b '{"target_url":"https://example.com/hook"}'
truto webhooks update <id> -b '{"target_url":"https://new-url.com/hook","is_active":false}'
truto webhooks test --id <id>
truto webhooks delete <id>
```

**Create fields:** `target_url` (required)

**Update fields:** `target_url`, `is_active` (boolean)

### Notification Destinations (`truto notification-destinations`)

Slack and email alert targets. **Full CRUD.**

```bash
truto notification-destinations list
truto notification-destinations get <id>
truto notification-destinations create -b '{"type":"slack","config":{...},"label":"Eng Alerts"}'
truto notification-destinations update <id> -b '{"label":"Renamed","is_active":false}'
truto notification-destinations test --id <id>
truto notification-destinations delete <id>
```

**Create fields:** `type` (required — `slack` or `email`), `config` (JSON, required), `label`

**Update fields:** `label`, `is_active` (boolean), `config` (JSON)

---

## Unified Model Customization

Four commands work together to customize unified APIs:

| Command | API resource | What it scopes |
|---|---|---|
| `truto unified-models` | `unified-model` | Base unified model definitions (resources, scopes, docs, webhooks). Team-private. |
| `truto unified-model-mappings` | `unified-model-resource-method` | Base per-(integration, resource, method) mapping rows (`response_mapping`, `query_mapping`, `request_body_mapping`, `error_mapping`, …). |
| `truto env-unified-models` | `environment-unified-model` | Per-environment install of a unified model + environment-scoped overrides on the model itself. |
| `truto env-unified-model-mappings` | `environment-unified-model-resource-method` | Per-environment overrides for individual mapping rows. The platform deep-merges these on top of the base mapping at request time. |

For workflows that string these together (when to override at base vs. environment vs. account scope, how to iterate locally with `unified test-mapping`), see the [Unified API Customization](../../truto/references/unified-api-customization.md) reference in the `truto` skill.

### Unified Models (`truto unified-models`)

Cross-integration resource schema definitions. **Full CRUD.**

```bash
truto unified-models list
truto unified-models get <id>
truto unified-models create -b '{"name":"crm","category":"crm","description":"CRM model","resources":{...}}'
truto unified-models update <id> -b '{"description":"Updated","version":1}'
truto unified-models delete <id>
```

**Create fields:** `name` (required), `category` (required), `description` (required), `resources` (JSON, required)

**Update requires:** `version` (optimistic locking — fetch current version with `get` first)

### Unified Model Mappings (`truto unified-model-mappings`)

Base mapping rows that translate between a unified resource/method and an integration's native API. **Full CRUD.** API path: `unified-model-resource-method`.

```bash
truto unified-model-mappings list --integration_name salesforce --resource_name contacts
truto unified-model-mappings list --unified_model_id <id> --method_name list
truto unified-model-mappings get <id>
truto unified-model-mappings create -b '{
  "unified_model_id":"...","integration_name":"salesforce",
  "resource_name":"contacts","method_name":"list",
  "config":{"response_mapping":"$.records ~> |$|{...}|", "...": "..."}
}'
truto unified-model-mappings update <id> -b '{"config":{...},"version":2}'
truto unified-model-mappings delete <id>
```

**Filters:** `--unified_model_id`, `--integration_name`, `--resource_name`, `--method_name`, `--version`

**Create fields:** `unified_model_id` (required), `integration_name` (required), `resource_name` (required), `method_name` (required), `config` (JSON — typically holds `response_mapping`, `query_mapping`, `request_body_mapping`, `error_mapping`)

**Update requires:** `version` (optimistic locking)

### Environment Unified Models (`truto env-unified-models`)

Install a unified model into an environment with optional model-level overrides (resources, scopes, webhooks, docs). **Full CRUD.** API path: `environment-unified-model`.

```bash
truto env-unified-models list --environment_id <id>
truto env-unified-models list --unified_model.name crm
truto env-unified-models get <id>
truto env-unified-models create -b '{"environment_id":"...","unified_model_id":"...","override":{"resources":{...}}}'
truto env-unified-models update <id> -b '{"override":{"scopes":{...}}}'
truto env-unified-models delete <id>
```

**Filters:** `--environment_id`, `--unified_model_id`, `--unified_model.name`

**Create fields:** `environment_id` (required), `unified_model_id` (required), `override` (JSON)

The ID returned by this command (the `environment_unified_model_id`) is what you reference when creating per-environment mapping overrides below.

### Environment Unified Model Mappings (`truto env-unified-model-mappings`)

Per-environment overrides for individual mapping rows. The platform deep-merges these on top of the corresponding base `unified-model-mappings` row at request time. **Full CRUD.** API path: `environment-unified-model-resource-method`.

```bash
truto env-unified-model-mappings list --environment_unified_model_id <id>
truto env-unified-model-mappings list --integration_name hubspot --resource_name contacts
truto env-unified-model-mappings get <id>
truto env-unified-model-mappings create -b '{
  "environment_unified_model_id":"...","integration_name":"hubspot",
  "resource_name":"contacts","method_name":"list",
  "config":{"response_mapping":"$.results ~> |$|{...}|"}
}'
truto env-unified-model-mappings update <id> -b '{"config":{...},"version":1}'
truto env-unified-model-mappings delete <id>
```

**Filters:** `--environment_unified_model_id`, `--integration_name`, `--resource_name`, `--method_name`, `--version`

**Create fields:** `environment_unified_model_id` (required), `integration_name` (required), `resource_name` (required), `method_name` (required), `config` (JSON)

**Update requires:** `version` (optimistic locking)

---

## Platform Resources

### MCP Tokens (`truto mcp-tokens`)

Scoped to an integrated account. Unlike other resources, the account ID is a **positional argument**.

```bash
truto mcp-tokens list <account-id>
truto mcp-tokens get <account-id> <token-id>
truto mcp-tokens create <account-id> --name "my-mcp-token"
truto mcp-tokens create <account-id> -b '{"name":"custom","scopes":[...]}'
truto mcp-tokens update <account-id> <token-id> -b '{"name":"renamed"}'
truto mcp-tokens delete <account-id> <token-id> [-f]
```

`--name` is always required when creating.

### Datastores (`truto datastores`)

External storage connections: S3, GCS, MongoDB, Qdrant, PostgreSQL. **Full CRUD.**

```bash
truto datastores list
truto datastores get <id>
truto datastores create -b '{"label":"my-bucket","type":"s3","config":{...}}'
truto datastores update <id> -b '{"label":"Renamed Store","config":{...}}'
truto datastores test <id>    # test the connection
truto datastores delete <id>
```

**Create fields:** `label` (required), `type` (required), `config` (JSON, required)

### Daemons (`truto daemons`)

Long-running background worker identities. **Full CRUD.**

```bash
truto daemons list
truto daemons get <id>
truto daemons create -b '{"label":"My Daemon"}'
truto daemons update <id> -b '{"label":"Renamed","status":"active"}'
truto daemons delete <id>
```

### Daemon Jobs (`truto daemon-jobs`)

Job definitions for daemon workers. **Full CRUD.**

```bash
truto daemon-jobs list
truto daemon-jobs get <id>
truto daemon-jobs create -b '{"label":"Job 1"}'
truto daemon-jobs update <id> -b '{"label":"Updated Job"}'
truto daemon-jobs delete <id>
```

### Daemon Job Runs (`truto daemon-job-runs`)

Execution records for daemon jobs. **List, get, create, delete** (no update).

```bash
truto daemon-job-runs list --daemon_job_id <id>
truto daemon-job-runs list --status running
truto daemon-job-runs get <id>
truto daemon-job-runs create -b '{"daemon_job_id":"...","daemon_id":"..."}'
truto daemon-job-runs delete <id>
```

**Filters:** `--daemon_job_id`, `--status`

### Daemon Job Triggers (`truto daemon-job-triggers`)

Cron-based triggers for daemon jobs. **Full CRUD.** API path: `daemon-job-cron-trigger`.

```bash
truto daemon-job-triggers list --daemon_job_id <id>
truto daemon-job-triggers get <id>
truto daemon-job-triggers create -b '{"daemon_job_id":"...","daemon_id":"...","cron_expression":"*/5 * * * *"}'
truto daemon-job-triggers update <id> -b '{"cron_expression":"0 * * * *"}'
truto daemon-job-triggers schedule <id>   # manually trigger
truto daemon-job-triggers delete <id>
```

**Create fields:** `daemon_job_id` (required), `daemon_id` (required), `cron_expression` (required)

### Gates (`truto gates`)

Static IP egress proxies for API calls. **Full CRUD.**

> CLI command is `gates`, not `static-gates`. API path is `static-gate`.

```bash
truto gates list
truto gates get <id>
truto gates create -b '{"name":"us-west-proxy","domain":"api.example.com"}'
truto gates update <id> -b '{"name":"renamed","domain":"api2.example.com"}'
truto gates delete <id>
```

**Create fields:** `name` (required), `domain` (required)

### Documentation (`truto docs`)

User-authored guides attached to integrations and models. **Full CRUD.**

> `truto docs list` requires at least one filter — a bare list without any filter will error.

```bash
truto docs list --integration_id <id>
truto docs list --unified_model_id <id>
truto docs get <id>
truto docs create -b '{"content":"...","type":"readme","integration_id":"..."}'
truto docs update <id> -b '{"content":"Updated content."}'
truto docs delete <id>
```

**Filters:** `--integration_id`, `--environment_integration_id`, `--unified_model_id`, `--environment_unified_model_id`

**Create fields:** `content` (required), `type` (required), plus at least one of the filter ID fields

### Link Tokens (`truto link-tokens`)

Short-lived tokens for Truto Link connect flows. **Create only.**

```bash
truto link-tokens create -b '{"tenant_id":"..."}'
truto link-tokens create --tenant-id <tid>
truto link-tokens create --tenant-id <tid> --integrated-account-id <id>
```

### Users (`truto users`)

List and view team members. **List and get only.**

```bash
truto users list
truto users get <id>
```

### Team (`truto team`)

View and update team settings. **Get and update only.**

```bash
truto team get
truto team update <id> -b '{"name":"New Team Name"}'
```

### Files (`truto files`)

Upload files to Truto-hosted public URLs. **Upload only.**

```bash
truto files upload /path/to/file.csv
```
