# Customizing the Unified API

The Truto unified API is configurable per-environment and per-account through a public HTTP API. You can:

- **Modify an existing unified API mapping** for one of your environments (e.g. surface a custom field, change a query translation, override an error shape) — the most common operation.
- **Override a single connected account's mapping** when one customer's instance behaves differently from the rest of the integration.
- **Create your own unified models** with their own resources, schemas, and per-integration mappings — for domains Truto doesn't ship with.

This reference walks through the full lifecycle: the mental model, the discovery endpoints to figure out what's already there, the write endpoints to make changes, worked examples, and how to test and roll back.

> The mapping fields themselves (`response_mapping`, `query_mapping`, etc.) are JSONata expressions. For the per-field scope, function reference, and authoring tips, see the **truto-jsonata** skill — specifically [Usage in Truto §1: Unified API mapping overrides](../../truto-jsonata/references/usage-in-truto.md#1-unified-api-mapping-overrides--the-main-jsonata-surface).

---

## The mental model — three layers

When the unified API receives a call, it composes the mapping from up to three layers, deep-merged in priority order (later wins):

```
unified_model_resource_method.config       (base — defined per-integration per-method)
  ↓ merged with
environment_unified_model_resource_method.config   (your environment's override)
  ↓ merged with
integrated_account.unified_model_override          (one connected account's override)
```

| Layer | Endpoint | Scope | When to use |
|---|---|---|---|
| **Base mapping** | `unified-model-resource-method` | Per-integration per-method, applies to everyone using this unified model | Defining mappings for a custom unified model you own |
| **Environment override** | `environment-unified-model-resource-method` | Per-environment, applies to every account in that environment | Tweaking how an integration's data is shaped for your environment |
| **Per-account override** | `integrated-account.unified_model_override` | One connected account | One specific customer's instance has a custom field name or extra envelope |

The merge is **deep across the `config` object but field-replacing within each mapping**: setting `config.response_mapping` in an override replaces the base `response_mapping` entirely. There's no JSONata-internal merge — you can't "add a field" to a base `response_mapping`; you have to write the full expression.

There's also a fourth surface used for visibility/schema, not runtime behavior:

| Layer | Endpoint | What it affects |
|---|---|---|
| **Environment unified model** | `environment-unified-model` (`override` field) | Schemas, descriptions, documentation, and the unified webhook payload transforms shown in `GET` responses for your environment. **Does not** drive HTTP runtime mappings — those come from `environment-unified-model-resource-method`. |

You'll create or update an `environment-unified-model` row when you want to install a unified model into your environment or override its schema/docs. You'll create or update `environment-unified-model-resource-method` rows when you want to change how data is actually shaped at runtime.

---

## Endpoints summary

All endpoints accept a session cookie or `Authorization: Bearer <api_token>` (see [Authentication](./authentication.md)).

### Discovery (read-only)

| Method | Path | Use |
|---|---|---|
| `GET` | `/unified-model` | List available unified models (Truto-shipped + your team's) |
| `GET` | `/unified-model/:id` | Read a unified model's full definition — resources, schemas, methods |
| `GET` | `/unified-model-resource-method` | List base mapping rows. Filter by `unified_model_id`, `resource_name`, `integration_name`, `method_name` |
| `GET` | `/unified-model-resource-method/:id` | Read one base mapping row's `config` |
| `GET` | `/environment-unified-model` | List unified models installed in your environments |
| `GET` | `/environment-unified-model/:id` | Read one environment unified model with its `override` |
| `GET` | `/environment-unified-model-resource-method` | List your environment's override rows. Same filter params as above |
| `GET` | `/environment-unified-model-resource-method/:id` | Read one environment override row |
| `GET` | `/unified/meta/{model}/{integration}` | Integration documentation for a unified model + integration combo |
| `GET` | `/unified/{model}/{resource}/meta/{method}` | Method metadata (merged) — `response_mapping`, `query_schema`, `default_query`, etc. |
| `GET` | `/unified/{model}/{resource}/{integration}/meta/{method}` | Integration-specific method metadata (extra `response_schema`, structured query/body schemas) |

The two `/meta/...` endpoints are documented in [Unified API → Meta Endpoints](./unified-api.md#meta-endpoints).

### Modifying mappings per environment

| Method | Path | Use |
|---|---|---|
| `POST` | `/environment-unified-model-resource-method` | Create a new mapping override row |
| `PATCH` | `/environment-unified-model-resource-method/:id` | Update an existing override |
| `DELETE` | `/environment-unified-model-resource-method/:id` | Remove an override (revert to base behavior) |

### Modifying mappings per account

| Method | Path | Use |
|---|---|---|
| `PATCH` | `/integrated-account/:id` | Set `unified_model_override` on one specific account |

### Creating / managing your own unified models

| Method | Path | Use |
|---|---|---|
| `POST` | `/unified-model` | Create a custom unified model |
| `PATCH` | `/unified-model/:id` | Update name, description, or resource definitions |
| `DELETE` | `/unified-model/:id` | Delete a custom unified model |
| `POST` | `/unified-model-resource-method` | Define the base mapping for one (resource, integration, method) tuple |
| `PATCH` | `/unified-model-resource-method/:id` | Update an existing base mapping |
| `DELETE` | `/unified-model-resource-method/:id` | Remove a base mapping |
| `POST` | `/environment-unified-model` | Install a unified model into one of your environments |
| `PATCH` | `/environment-unified-model/:id` | Update the environment install (e.g. schema/docs `override`) |
| `DELETE` | `/environment-unified-model/:id` | Uninstall the unified model from that environment |

---

## Workflow 1 — Modify an existing unified API mapping (per environment)

Use this when you want to change how an existing integration's data is mapped into a unified resource for everyone using a particular environment.

### Step 1 — Identify the integration, resource, method, and unified model

You'll need:

- `unified_model_name` — e.g. `crm`, `ticketing`, `hris`
- `resource_name` — e.g. `contacts`, `tickets`, `employees`
- `integration_name` — e.g. `salesforce`, `hubspot`, `jira`
- `method_name` — `list`, `get`, `create`, `update`, `delete`, or a custom method like `search`

If you're not sure of the exact resource or method names, list the base rows:

```bash
curl "https://api.truto.one/unified-model-resource-method?unified_model_name=crm&resource_name=contacts&integration_name=salesforce" \
  -H "Authorization: Bearer $TRUTO_API_TOKEN"
```

### Step 2 — Find your `environment_unified_model_id`

The override row is scoped to one environment-unified-model install. List the installs in your environment:

```bash
curl "https://api.truto.one/environment-unified-model?environment_id=$ENV_ID&unified_model_name=crm" \
  -H "Authorization: Bearer $TRUTO_API_TOKEN"
```

The response gives you the `id` of the `environment_unified_model` row for `crm` in `$ENV_ID`. Save that as `$ENV_UNIFIED_MODEL_ID`.

> If no `environment_unified_model` row exists for that model in your environment, create one first via `POST /environment-unified-model`. See Workflow 3, Step 3.

### Step 3 — Check whether an override row already exists

```bash
curl "https://api.truto.one/environment-unified-model-resource-method?environment_unified_model_id=$ENV_UNIFIED_MODEL_ID&resource_name=contacts&integration_name=salesforce&method_name=list" \
  -H "Authorization: Bearer $TRUTO_API_TOKEN"
```

If a row exists, you'll `PATCH` it. If not, you'll `POST` a new one.

### Step 4a — Create a new override

```bash
curl -X POST "https://api.truto.one/environment-unified-model-resource-method" \
  -H "Authorization: Bearer $TRUTO_API_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "environment_unified_model_id": "'$ENV_UNIFIED_MODEL_ID'",
    "resource_name": "contacts",
    "integration_name": "salesforce",
    "method_name": "list",
    "config": {
      "response_mapping": "response.records.{ \"id\": Id, \"first_name\": FirstName, \"last_name\": LastName, \"email\": Email, \"phone\": Phone, \"created_at\": CreatedDate, \"updated_at\": LastModifiedDate, \"loyalty_tier\": Loyalty_Tier__c }"
    }
  }'
```

Only include the fields under `config` that you actually want to override. The rest are inherited from the base row at runtime.

### Step 4b — Patch an existing override

```bash
curl -X PATCH "https://api.truto.one/environment-unified-model-resource-method/$OVERRIDE_ID" \
  -H "Authorization: Bearer $TRUTO_API_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "config": {
      "response_mapping": "response.records.{ \"id\": Id, \"first_name\": FirstName, \"last_name\": LastName, \"email\": Email, \"loyalty_tier\": Loyalty_Tier__c }"
    }
  }'
```

`PATCH` performs a deep merge of the body into the existing row. If you want to replace the entire `config`, omit fields you no longer want and explicitly set the ones you do.

### Step 5 — Test the change

Make a real unified API call against an account in that environment:

```bash
curl "https://api.truto.one/unified/crm/contacts?integrated_account_id=$ACCOUNT_ID" \
  -H "Authorization: Bearer $TRUTO_API_TOKEN"
```

The response should now include the new `loyalty_tier` field. You can also inspect the merged config via the meta endpoint:

```bash
curl "https://api.truto.one/unified/crm/contacts/salesforce/meta/list?integrated_account_id=$ACCOUNT_ID" \
  -H "Authorization: Bearer $TRUTO_API_TOKEN"
```

### Step 6 — Revert if needed

To roll back, either `PATCH` the override row back to its previous shape, or `DELETE` it entirely to fall back to the base mapping:

```bash
curl -X DELETE "https://api.truto.one/environment-unified-model-resource-method/$OVERRIDE_ID" \
  -H "Authorization: Bearer $TRUTO_API_TOKEN"
```

### Worked example — Add a custom Salesforce field to the unified contact

Suppose you want every Salesforce contact in your `production` environment to surface a `Loyalty_Tier__c` custom field as `loyalty_tier` on the unified shape. The base `response_mapping` already maps the standard fields; you need to extend it.

Because mapping fields are field-replacing (no JSONata-internal merge), you have to write the **complete** `response_mapping` you want — copy the base fields and add the new one:

```json
{
  "environment_unified_model_id": "<env-crm-id>",
  "resource_name": "contacts",
  "integration_name": "salesforce",
  "method_name": "list",
  "config": {
    "response_mapping": "response.records.{ \"id\": Id, \"first_name\": FirstName, \"last_name\": LastName, \"email\": Email, \"phone\": Phone, \"created_at\": CreatedDate, \"updated_at\": LastModifiedDate, \"loyalty_tier\": Loyalty_Tier__c }"
  }
}
```

You'd typically apply the same change to `get`, `create`, and `update` methods so the field round-trips. To make the field writable, also override `request_body_mapping` for `create` and `update`:

```json
{
  "method_name": "create",
  "config": {
    "request_body_mapping": "{ \"FirstName\": body.first_name, \"LastName\": body.last_name, \"Email\": body.email, \"Phone\": body.phone, \"Loyalty_Tier__c\": body.loyalty_tier }"
  }
}
```

---

## Workflow 2 — Override one connected account

Use this when one specific connected account behaves differently from the rest of the integration — e.g. one customer's Salesforce instance has a custom field name nobody else uses, or sends responses with an extra envelope.

```bash
curl -X PATCH "https://api.truto.one/integrated-account/$ACCOUNT_ID" \
  -H "Authorization: Bearer $TRUTO_API_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "unified_model_override": {
      "crm": {
        "contacts": {
          "list": {
            "response_mapping": "response.records.{ \"id\": Id, \"name\": $join([FirstName, LastName], \" \"), \"email\": Email__c }"
          }
        }
      }
    }
  }'
```

The shape under `<model>.<resource>.<method>` is a partial of the same `config` schema used by environment overrides — set only the fields you want to override.

> The schema explicitly lists `resource`, `method`, `response_mapping`, `response_mapping_method`, `query`, `query_schema`, `query_mapping`, `request_body_mapping`, `request_body_schema`, `body`, `file_upload`, `after`, `before`, `side_load`. The runtime **also** picks up `path_mapping`, `error_mapping`, `request_header_mapping`, and `response_header_mapping` if you set them — if you need them, set them and they take effect.

To remove an account-level override, `PATCH` `unified_model_override` back to the desired state (or set the relevant subtree to `null` / omit it).

### When to use this vs an environment override

| Situation | Use |
|---|---|
| Every account using this integration in this environment needs the change | Environment override |
| One specific account behaves differently from the rest | Per-account override |
| You're testing a mapping change before rolling it out broadly | Per-account override on a test account, then promote to environment override |

---

## Workflow 3 — Create your own unified model

Use this when:

- The domain you need isn't covered by Truto's pre-built unified models (CRM, ticketing, HRIS, etc.).
- You want a different shape from the pre-built model — for example, a `marketing` model with `campaigns`, `audiences`, `automations` resources designed for your product's needs.
- You need to support an integration Truto's pre-built models don't yet cover, and you want it under a unified API rather than calling the proxy.

The lifecycle has three stages: define the model, define the per-integration base mappings, and (optionally) install it into your environments.

### Step 1 — Design the resource schemas

Each resource needs a JSON Schema describing the unified shape. Keep it small and focused — it's easier to add fields later than to remove them.

A simple `campaigns` resource for a marketing model:

```json
{
  "type": "object",
  "properties": {
    "id":         { "type": "string" },
    "name":       { "type": "string" },
    "status":     { "type": "string", "enum": ["draft", "scheduled", "sending", "sent", "archived"] },
    "subject":    { "type": "string" },
    "from_name":  { "type": "string" },
    "from_email": { "type": "string", "format": "email" },
    "list_id":    { "type": "string" },
    "sent_at":    { "type": "string", "format": "date-time" },
    "created_at": { "type": "string", "format": "date-time" },
    "updated_at": { "type": "string", "format": "date-time" }
  },
  "required": ["id", "name", "status"]
}
```

Schema design tips:

- **Use ISO 8601 strings for dates** (`format: "date-time"`). Every integration has its own date format; standardizing on ISO at the unified layer means consumers don't have to care.
- **Keep IDs as strings.** Even when an integration uses numeric IDs, expose them as strings so JS / JSON consumers don't lose precision and the field type is consistent across integrations.
- **Use `enum` for fixed-value fields** like statuses, so consumers can rely on the values. Inside `response_mapping`, use [`$mapValues`](../../truto-jsonata/references/core-functions.md#mapvaluesvalue-mapping-lowercase--false-defaultvalue--null) to translate integration-specific values into your enum.
- **Nest related IDs.** When a resource references another, expose it as `{ "owner": { "id": "...", "name": "..." } }` rather than a flat `owner_id` — that's the convention Truto's pre-built models follow and it composes well with side-loads.
- **`required` should reflect what every integration can provide.** If `subject` isn't always present, don't mark it required.

### Step 2 — Create the unified model

```bash
curl -X POST "https://api.truto.one/unified-model" \
  -H "Authorization: Bearer $TRUTO_API_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "marketing",
    "category": "marketing",
    "description": "Marketing automation unified model",
    "team_id": "'$TEAM_ID'",
    "resources": {
      "campaigns": {
        "schema": { /* the JSON Schema from Step 1 */ },
        "description": "Email/SMS marketing campaigns",
        "methods": ["list", "get", "create", "update", "delete"]
      }
    }
  }'
```

The response includes the new `unified_model.id` — save it as `$UNIFIED_MODEL_ID`.

> Custom unified models you create are scoped to your team. Other teams using your environment can't see or use them; only your team can.

### Step 3 — Define base mappings per integration

For every `(resource, integration, method)` tuple your unified model supports, create a base mapping row. This is the row that the unified API merges from at runtime.

```bash
curl -X POST "https://api.truto.one/unified-model-resource-method" \
  -H "Authorization: Bearer $TRUTO_API_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "unified_model_id": "'$UNIFIED_MODEL_ID'",
    "resource_name": "campaigns",
    "integration_name": "mailchimp",
    "method_name": "list",
    "config": {
      "resource": "campaigns",
      "method": "list",
      "response_mapping": "response.campaigns.{ \"id\": id, \"name\": settings.title, \"status\": $mapValues(status, { \"save\": \"draft\", \"schedule\": \"scheduled\", \"sending\": \"sending\", \"sent\": \"sent\", \"paused\": \"draft\" }), \"subject\": settings.subject_line, \"from_name\": settings.from_name, \"from_email\": settings.reply_to, \"list_id\": recipients.list_id, \"sent_at\": send_time, \"created_at\": create_time, \"updated_at\": create_time }",
      "query_mapping": "{ \"count\": $firstNonEmpty(query.limit, 50), \"offset\": $number($firstNonEmpty(query.cursor, \"0\")) }"
    }
  }'
```

Repeat for `get`, `create`, `update`, `delete`, and any custom methods you support.

To support a second provider, add a base mapping with a different `integration_name`. The unified shape stays the same — only the JSONata changes to extract from the new provider's response. For example, the same `marketing.campaigns.list` for Klaviyo (whose API is JSON:API style with `data[].attributes.*`):

```bash
curl -X POST "https://api.truto.one/unified-model-resource-method" \
  -H "Authorization: Bearer $TRUTO_API_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "unified_model_id": "'$UNIFIED_MODEL_ID'",
    "resource_name": "campaigns",
    "integration_name": "klaviyo",
    "method_name": "list",
    "config": {
      "resource": "campaigns",
      "method": "list",
      "response_mapping": "response.data.{ \"id\": id, \"name\": attributes.name, \"status\": $mapValues($lowercase(attributes.status), { \"draft\": \"draft\", \"queued\": \"scheduled\", \"sending\": \"sending\", \"sent\": \"sent\", \"cancelled\": \"archived\", \"paused\": \"draft\" }), \"subject\": attributes.message.subject, \"from_name\": attributes.message.from_label, \"from_email\": attributes.message.from_email, \"list_id\": attributes.audiences.included[0], \"sent_at\": attributes.send_time, \"created_at\": attributes.created_at, \"updated_at\": attributes.updated_at }",
      "query_mapping": "{ \"page[size]\": $firstNonEmpty(query.limit, 50), \"page[cursor]\": query.cursor, \"filter\": $exists(query.status) ? \"equals(messages.channel,'email')\" : null }"
    }
  }'
```

Two things to notice:

1. **The unified shape is identical** — `id`, `name`, `status`, `subject`, etc. are the contract. Every consumer of `marketing.campaigns` gets the same fields regardless of which provider is connected.
2. **The provider-specific quirks are isolated to the JSONata** — Mailchimp's `status: "save"` and Klaviyo's `status: "Draft"` both become `"draft"` thanks to `$mapValues`; Mailchimp's `count`/`offset` pagination and Klaviyo's `page[size]`/`page[cursor]` are both fed from the same unified `query.limit` and `query.cursor`.

This is the payoff of building a custom unified model: your application code calls one endpoint and gets one shape, no matter which marketing tool the customer connected.

The shape of `config` is identical to the override shape used in Workflow 1 — every JSONata mapping field documented in the [truto-jsonata Usage in Truto reference](../../truto-jsonata/references/usage-in-truto.md#1-unified-api-mapping-overrides--the-main-jsonata-surface) is available here.

### Step 4 — Install into an environment

Before any account in your environment can use the new unified model, install it:

```bash
curl -X POST "https://api.truto.one/environment-unified-model" \
  -H "Authorization: Bearer $TRUTO_API_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "environment_id": "'$ENV_ID'",
    "unified_model_id": "'$UNIFIED_MODEL_ID'"
  }'
```

The response includes the `environment_unified_model.id` — save this if you ever want to add per-environment overrides via Workflow 1.

### Step 5 — Use it

The unified API is now available at:

```
https://api.truto.one/unified/marketing/campaigns?integrated_account_id=<account-id>
```

provided the connected account is for an integration you defined a base mapping for (e.g. Mailchimp).

### Step 6 — Iterate

Adding a new field, supporting a new method, or supporting a new integration is the same flow:

- New field → `PATCH /unified-model/:id` to update the resource schema, then `PATCH /unified-model-resource-method/:id` to update each method's `config`.
- New method → `PATCH /unified-model/:id` to add the method name to the resource's `methods` array, then `POST /unified-model-resource-method` for each integration.
- New integration → just `POST /unified-model-resource-method` rows for that integration's `(resource, method)` tuples — no change to the model itself.

---

## Modifying a custom unified model after creation

Update the model itself:

```bash
curl -X PATCH "https://api.truto.one/unified-model/$UNIFIED_MODEL_ID" \
  -H "Authorization: Bearer $TRUTO_API_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "description": "Updated description",
    "resources": {
      "campaigns": {
        "schema": { /* updated JSON Schema */ },
        "methods": ["list", "get", "create", "update", "delete", "send"]
      }
    }
  }'
```

Update a base mapping row:

```bash
curl -X PATCH "https://api.truto.one/unified-model-resource-method/$BASE_MAPPING_ID" \
  -H "Authorization: Bearer $TRUTO_API_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "config": {
      "response_mapping": "response.campaigns.{ \"id\": id, \"name\": settings.title, ... , \"new_field\": new_field }"
    }
  }'
```

Remove a base mapping (e.g. dropping support for an integration):

```bash
curl -X DELETE "https://api.truto.one/unified-model-resource-method/$BASE_MAPPING_ID" \
  -H "Authorization: Bearer $TRUTO_API_TOKEN"
```

Delete the whole unified model (last resort — this affects every environment that has it installed):

```bash
curl -X DELETE "https://api.truto.one/unified-model/$UNIFIED_MODEL_ID" \
  -H "Authorization: Bearer $TRUTO_API_TOKEN"
```

---

## Testing changes

Three useful patterns:

### 1. Inspect the merged metadata

After making a change, the meta endpoint shows the **fully merged** config that the unified API will use:

```bash
curl "https://api.truto.one/unified/marketing/campaigns/mailchimp/meta/list?integrated_account_id=$ACCOUNT_ID" \
  -H "Authorization: Bearer $TRUTO_API_TOKEN"
```

The `response_mapping`, `query_schema`, `default_query`, and `default_body` fields in the response reflect base + your environment override + any per-account override merged together. If a change you made isn't visible here, it isn't being applied.

### 2. Make a real call against a test account

```bash
curl "https://api.truto.one/unified/marketing/campaigns?integrated_account_id=$TEST_ACCOUNT_ID" \
  -H "Authorization: Bearer $TRUTO_API_TOKEN"
```

Use a sandbox or staging account first. If the response shape isn't what you expected, check:

1. The base + override merge via the meta endpoint (above) — is your `response_mapping` actually present?
2. The JSONata is referencing the right scope variables — see the [per-field scope tables](../../truto-jsonata/references/usage-in-truto.md#1-unified-api-mapping-overrides--the-main-jsonata-surface) in the truto-jsonata skill.
3. The expression compiles — JSONata syntax errors are surfaced as part of the unified API error response.

### 3. Iterate locally

The Truto CLI (see the **Truto CLI** companion skill) lets you fetch a sample raw integration response and pipe it through a JSONata expression locally. This is much faster than `PATCH` → make a unified API call → look at result, especially while you're iterating on a complex `response_mapping`.

---

## Appendix — Discovering integration, model, resource, and method names

Every endpoint in this reference takes some combination of `integration_name`, `unified_model_name`, `resource_name`, and `method_name` as identifiers. They all need to match exactly what Truto has registered. Here's how to find them.

### Finding the right `integration_name`

The dashboard's integrations catalog at [https://app.truto.one](https://app.truto.one) shows every integration's name; the API equivalent is:

```bash
# List every integration available to your team (built-ins + ones you've created)
curl "https://api.truto.one/integration?limit=200" \
  -H "Authorization: Bearer $TRUTO_API_TOKEN"
```

Each row's `name` field is what you pass as `integration_name` (e.g. `salesforce`, `hubspot`, `mailchimp`, `klaviyo`, `jira`, `slack`). Filter the list by category, search by display name, or paginate with `next_cursor` if the result set is large.

To see only the integrations that are **installed and enabled** in one of your environments:

```bash
curl "https://api.truto.one/environment-integration?environment_id=$ENV_ID&limit=200" \
  -H "Authorization: Bearer $TRUTO_API_TOKEN"
```

Each row references the underlying integration — use that to confirm the integration is active in the environment before writing overrides for it.

### Finding the right `unified_model_name`

```bash
# All unified models available to your team — Truto-shipped + your custom ones
curl "https://api.truto.one/unified-model?limit=100" \
  -H "Authorization: Bearer $TRUTO_API_TOKEN"
```

The `name` field is what you pass as `unified_model_name` (e.g. `crm`, `ticketing`, `hris`, `ats`, `accounting`, plus any custom ones your team owns).

### Finding the right `resource_name` and `method_name`

Read the unified model definition — it lists every resource and the methods each resource supports:

```bash
curl "https://api.truto.one/unified-model/$UNIFIED_MODEL_ID" \
  -H "Authorization: Bearer $TRUTO_API_TOKEN"
```

Look at `resources.<resource_name>.methods` — that's the array of method names valid for that resource. Standard methods are `list`, `get`, `create`, `update`, `delete`; custom methods (like `search`, `bulk_create`, `download`) appear here too.

To narrow down to what's actually mapped for a specific integration:

```bash
curl "https://api.truto.one/unified-model-resource-method?unified_model_name=crm&integration_name=salesforce&limit=100" \
  -H "Authorization: Bearer $TRUTO_API_TOKEN"
```

Each row gives you the exact `(unified_model_name, resource_name, integration_name, method_name)` tuple that's defined. If a row doesn't exist for a tuple you want, the unified API isn't configured for that combination yet — either the integration doesn't support that resource/method, or no base mapping has been written. For Truto-shipped models, the dashboard's integration documentation page shows the same matrix in a more readable form.

### Confirming the merged shape before making a unified API call

Once you know the combination is valid, the merged config (base + your environment override + per-account override) is exposed via the meta endpoint:

```bash
curl "https://api.truto.one/unified/{model}/{resource}/{integration}/meta/{method}?integrated_account_id=$ACCOUNT_ID" \
  -H "Authorization: Bearer $TRUTO_API_TOKEN"
```

This is the source of truth at runtime — if a field appears here, the unified API will use it; if it doesn't, your override isn't being applied.

---

## Common gotchas

- **Mapping fields are field-replacing.** `config.response_mapping` in your override completely replaces the base — there's no JSONata-internal merge. To "add a field" you have to repeat the rest of the mapping. (See the worked example in Workflow 1.)
- **Cascade your changes across methods.** If you add a custom field to the `list` `response_mapping`, you almost certainly want it on `get` too — and to make it writable you need it in `create` and `update`'s `request_body_mapping`. The unified API doesn't infer this for you.
- **Backtick-quote keys with hyphens or special characters in JSONata.** `` headers.`x-rate-limit` ``, `` response.`some-field` ``. JSONata's dot syntax doesn't accept hyphens.
- **JSONata strings inside JSON need their internal double quotes escaped.** `"\"key\""`. For long expressions, write the JSONata first, then escape it for the JSON body.
- **`PATCH` is a deep merge, not a replace.** Sending `{ "config": { "response_mapping": "..." } }` won't drop other fields under `config`. To remove a field from `config`, set it explicitly to `null`.
- **The base unified model is shared across teams.** If you're customizing a Truto-shipped unified model (e.g. `crm`), all of your changes go into the **environment** override or the per-account override — not into the base. Only your custom unified models can have their base mappings edited directly.
- **Custom unified models are team-private.** Only your team can see and use them; you can't share a custom unified model across teams.

---

## Related references

- **[Unified API](./unified-api.md)** — consuming the unified API: endpoint shapes, response envelopes, pagination, idempotency, meta endpoints
- **[Authentication](./authentication.md)** — API tokens and how to authenticate the calls in this reference
- **[Core Resources](./core-resources.md)** — environments, integrations, integrated accounts, teams (the IDs you'll need)
- **[Integrated Account Context](./integrated-account-context.md)** — the `context` binding available in mapping JSONata
- **[truto-jsonata: Usage in Truto §1](../../truto-jsonata/references/usage-in-truto.md#1-unified-api-mapping-overrides--the-main-jsonata-surface)** — per-mapping-field JSONata scope variables, function references, and authoring tips
- **[truto-jsonata SKILL](../../truto-jsonata/SKILL.md)** — full cheatsheet of custom `$` functions available in mapping expressions
