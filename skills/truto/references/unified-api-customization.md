# Customizing the Unified API

The Truto unified API is configurable per-environment and per-account. You can:

- **Modify an existing unified API mapping** for one of your environments (e.g. surface a custom field, change a query translation, override an error shape) — the most common operation.
- **Override a single connected account's mapping** when one customer's instance behaves differently from the rest of the integration.
- **Create your own unified models** with their own resources, schemas, and per-integration mappings — for domains Truto doesn't ship with.

This reference walks through the full lifecycle: the mental model, the discovery commands to figure out what's already there, the write commands to make changes, worked examples, and how to test and roll back.

> **Tooling.** All workflows below use the **Truto CLI** as the primary path — every customization endpoint has a first-class command. The CLI is described in detail in the **Truto CLI** companion skill. If you'd rather call the HTTP API directly (CI scripts, non-Node environments, etc.), every command corresponds 1-to-1 with an HTTP endpoint — see the [Direct HTTP API reference](#appendix--direct-http-api) at the bottom.

> **JSONata.** The mapping fields themselves (`response_mapping`, `query_mapping`, etc.) are JSONata expressions. For the per-field scope, function reference, and authoring tips, see the **truto-jsonata** skill — specifically [Usage in Truto §1: Unified API mapping overrides](../../truto-jsonata/references/usage-in-truto.md#1-unified-api-mapping-overrides--the-main-jsonata-surface).

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

| Layer | CLI command | Scope | When to use |
|---|---|---|---|
| **Base mapping** | `truto unified-model-mappings` | Per-integration per-method, applies to everyone using this unified model | Defining mappings for a custom unified model you own |
| **Environment override** | `truto env-unified-model-mappings` | Per-environment, applies to every account in that environment | Tweaking how an integration's data is shaped for your environment |
| **Per-account override** | `truto accounts update <id>` (sets `unified_model_override`) | One connected account | One specific customer's instance has a custom field name or extra envelope |

The merge is **deep across the `config` object but field-replacing within each mapping**: setting `config.response_mapping` in an override replaces the base `response_mapping` entirely. There's no JSONata-internal merge — you can't "add a field" to a base `response_mapping`; you have to write the full expression.

There's also a fourth surface used for visibility/schema, not runtime behavior:

| Layer | CLI command | What it affects |
|---|---|---|
| **Environment unified model** | `truto env-unified-models` (`override` field) | Schemas, descriptions, documentation, and the unified webhook payload transforms shown in `GET` responses for your environment. **Does not** drive HTTP runtime mappings — those come from `truto env-unified-model-mappings`. |

You'll create or update an `env-unified-models` row when you want to install a unified model into your environment or override its schema/docs. You'll create or update `env-unified-model-mappings` rows when you want to change how data is actually shaped at runtime.

---

## CLI commands at a glance

All CLI commands accept the global flags from the Truto CLI skill — most importantly `-o json` for machine-readable output and `-v` for verbose request/response logging. `truto login` once and your environment-scoped API token is used automatically.

### Discovery (read-only)

| Command | Use |
|---|---|
| `truto unified-models list` | List available unified models (Truto-shipped + your team's) |
| `truto unified-models get <id>` | Read a unified model's full definition — resources, schemas, methods |
| `truto unified-model-mappings list` | List base mapping rows. Filter with `--unified_model_id`, `--resource_name`, `--integration_name`, `--method_name` |
| `truto unified-model-mappings get <id>` | Read one base mapping row's `config` |
| `truto env-unified-models list` | List unified models installed in your environments (filter with `--environment_id`, `--unified_model.name`) |
| `truto env-unified-models get <id>` | Read one environment unified model with its `override` |
| `truto env-unified-model-mappings list` | List your environment's override rows. Same filters as the base list, plus `--environment_unified_model_id` |
| `truto env-unified-model-mappings get <id>` | Read one environment override row |
| *Meta endpoints* | `GET /unified/meta/{model}/{integration}` and `GET /unified/{model}/{resource}/{integration}/meta/{method}` — no dedicated CLI command yet; use `truto custom` (see [Inspect the merged metadata](#1-inspect-the-merged-metadata) below) |

### Modifying mappings per environment

| Command | Use |
|---|---|
| `truto env-unified-model-mappings create -b '{...}'` | Create a new mapping override row |
| `truto env-unified-model-mappings update <id> -b '{...}'` | Update an existing override |
| `truto env-unified-model-mappings delete <id>` | Remove an override (revert to base behavior) |

### Modifying mappings per account

| Command | Use |
|---|---|
| `truto accounts update <id> -b '{"unified_model_override": {...}}'` | Set `unified_model_override` on one specific account |

### Creating / managing your own unified models

| Command | Use |
|---|---|
| `truto unified-models create -b '{...}'` | Create a custom unified model |
| `truto unified-models update <id> -b '{...}'` | Update name, description, or resource definitions (requires `version`) |
| `truto unified-models delete <id>` | Delete a custom unified model |
| `truto unified-model-mappings create -b '{...}'` | Define the base mapping for one (resource, integration, method) tuple |
| `truto unified-model-mappings update <id> -b '{...}'` | Update an existing base mapping |
| `truto unified-model-mappings delete <id>` | Remove a base mapping |
| `truto env-unified-models create -b '{...}'` | Install a unified model into one of your environments |
| `truto env-unified-models update <id> -b '{...}'` | Update the environment install (e.g. schema/docs `override`) |
| `truto env-unified-models delete <id>` | Uninstall the unified model from that environment |

### Local iteration

| Command | Use |
|---|---|
| `truto unified test-mapping --model crm --resource contacts --integration salesforce --input sample.json` | Fetch a base mapping and evaluate it against a sample raw response — no third-party call, no platform write. The fastest way to iterate on a `response_mapping`. |

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
truto unified-model-mappings list \
  --resource_name contacts \
  --integration_name salesforce \
  -o json
```

> Filter by `--unified_model_id` rather than name when you have it — the platform's filter is by ID. You can resolve the ID from the name with `truto unified-models list -o json | jq -r '.[] | select(.name=="crm") | .id'`.

### Step 2 — Find your `environment_unified_model_id`

The override row is scoped to one environment-unified-model install. List the installs in your environment:

```bash
truto env-unified-models list \
  --environment_id "$ENV_ID" \
  --unified_model.name crm \
  -o json
```

Save the `id` from the response as `$ENV_UNIFIED_MODEL_ID`.

> If no `env-unified-models` row exists for that model in your environment, create one first:
>
> ```bash
> truto env-unified-models create \
>   -b "{\"environment_id\":\"$ENV_ID\",\"unified_model_id\":\"$UNIFIED_MODEL_ID\"}"
> ```
>
> See Workflow 3, Step 4.

### Step 3 — Check whether an override row already exists

```bash
truto env-unified-model-mappings list \
  --environment_unified_model_id "$ENV_UNIFIED_MODEL_ID" \
  --resource_name contacts \
  --integration_name salesforce \
  --method_name list \
  -o json
```

If a row exists, you'll `update` it. If not, you'll `create` a new one.

### Step 4a — Create a new override

```bash
truto env-unified-model-mappings create -b "{
  \"environment_unified_model_id\": \"$ENV_UNIFIED_MODEL_ID\",
  \"resource_name\": \"contacts\",
  \"integration_name\": \"salesforce\",
  \"method_name\": \"list\",
  \"config\": {
    \"response_mapping\": \"response.records.{ \\\"id\\\": Id, \\\"first_name\\\": FirstName, \\\"last_name\\\": LastName, \\\"email\\\": Email, \\\"phone\\\": Phone, \\\"created_at\\\": CreatedDate, \\\"updated_at\\\": LastModifiedDate, \\\"loyalty_tier\\\": Loyalty_Tier__c }\"
  }
}"
```

Only include the fields under `config` that you actually want to override. The rest are inherited from the base row at runtime.

> **Tip.** Long JSON bodies are easier to author in a file and pipe in:
>
> ```bash
> truto env-unified-model-mappings create --stdin < contacts-list-override.json
> ```

### Step 4b — Update an existing override

```bash
truto env-unified-model-mappings update "$OVERRIDE_ID" -b '{
  "config": {
    "response_mapping": "response.records.{ \"id\": Id, \"first_name\": FirstName, \"last_name\": LastName, \"email\": Email, \"loyalty_tier\": Loyalty_Tier__c }"
  }
}'
```

`update` performs a deep merge of the body into the existing row. If you want to remove a field from `config`, set it explicitly to `null` in the body.

### Step 5 — Test the change

Make a real unified API call against an account in that environment:

```bash
truto unified crm contacts -a "$ACCOUNT_ID" -o json
```

The response should now include the new `loyalty_tier` field. You can also inspect the merged config via the meta endpoint (see [Inspect the merged metadata](#1-inspect-the-merged-metadata)).

For faster iteration without round-tripping to the third-party API, see [Iterate locally](#3-iterate-locally) below.

### Step 6 — Revert if needed

To roll back, either `update` the override row back to its previous shape, or delete it entirely to fall back to the base mapping:

```bash
truto env-unified-model-mappings delete "$OVERRIDE_ID"
```

### Worked example — Add a custom Salesforce field to the unified contact

Suppose you want every Salesforce contact in your `production` environment to surface a `Loyalty_Tier__c` custom field as `loyalty_tier` on the unified shape. The base `response_mapping` already maps the standard fields; you need to extend it.

Because mapping fields are field-replacing (no JSONata-internal merge), you have to write the **complete** `response_mapping` you want — copy the base fields and add the new one.

Save this as `loyalty-list.json`:

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

Then create the override:

```bash
truto env-unified-model-mappings create --stdin < loyalty-list.json
```

You'd typically apply the same change to `get`, `create`, and `update` methods so the field round-trips. To make the field writable, also override `request_body_mapping` for `create` and `update`:

```bash
truto env-unified-model-mappings create -b '{
  "environment_unified_model_id": "<env-crm-id>",
  "resource_name": "contacts",
  "integration_name": "salesforce",
  "method_name": "create",
  "config": {
    "request_body_mapping": "{ \"FirstName\": body.first_name, \"LastName\": body.last_name, \"Email\": body.email, \"Phone\": body.phone, \"Loyalty_Tier__c\": body.loyalty_tier }"
  }
}'
```

---

## Workflow 2 — Override one connected account

Use this when one specific connected account behaves differently from the rest of the integration — e.g. one customer's Salesforce instance has a custom field name nobody else uses, or sends responses with an extra envelope.

```bash
truto accounts update "$ACCOUNT_ID" -b '{
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

To remove an account-level override, `update` `unified_model_override` back to the desired state (or set the relevant subtree to `null` / omit it):

```bash
truto accounts update "$ACCOUNT_ID" -b '{
  "unified_model_override": {
    "crm": { "contacts": { "list": null } }
  }
}'
```

### When to use this vs an environment override

| Situation | Use |
|---|---|
| Every account using this integration in this environment needs the change | Environment override (`truto env-unified-model-mappings`) |
| One specific account behaves differently from the rest | Per-account override (`truto accounts update`) |
| You're testing a mapping change before rolling it out broadly | Per-account override on a test account, then promote to environment override |

---

## Workflow 3 — Create your own unified model

Use this when:

- The domain you need isn't covered by Truto's pre-built unified models (CRM, ticketing, HRIS, etc.).
- You want a different shape from the pre-built model — for example, a `marketing` model with `campaigns`, `audiences`, `automations` resources designed for your product's needs.
- You need to support an integration Truto's pre-built models don't yet cover, and you want it under a unified API rather than calling the proxy.

The lifecycle has four stages: design the model, create it, define per-integration base mappings, and install it into your environments.

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

Save your model definition as `marketing-model.json`:

```json
{
  "name": "marketing",
  "category": "marketing",
  "description": "Marketing automation unified model",
  "team_id": "<your-team-id>",
  "resources": {
    "campaigns": {
      "schema": { "...": "the JSON Schema from Step 1" },
      "description": "Email/SMS marketing campaigns",
      "methods": ["list", "get", "create", "update", "delete"]
    }
  }
}
```

Then create it:

```bash
truto unified-models create --stdin < marketing-model.json -o json
```

The response includes the new `unified_model.id` — save it as `$UNIFIED_MODEL_ID`.

> Custom unified models you create are scoped to your team. Other teams using your environment can't see or use them; only your team can.

### Step 3 — Define base mappings per integration

For every `(resource, integration, method)` tuple your unified model supports, create a base mapping row. This is the row that the unified API merges from at runtime.

```bash
truto unified-model-mappings create -b "{
  \"unified_model_id\": \"$UNIFIED_MODEL_ID\",
  \"resource_name\": \"campaigns\",
  \"integration_name\": \"mailchimp\",
  \"method_name\": \"list\",
  \"config\": {
    \"resource\": \"campaigns\",
    \"method\": \"list\",
    \"response_mapping\": \"response.campaigns.{ \\\"id\\\": id, \\\"name\\\": settings.title, \\\"status\\\": \$mapValues(status, { \\\"save\\\": \\\"draft\\\", \\\"schedule\\\": \\\"scheduled\\\", \\\"sending\\\": \\\"sending\\\", \\\"sent\\\": \\\"sent\\\", \\\"paused\\\": \\\"draft\\\" }), \\\"subject\\\": settings.subject_line, \\\"from_name\\\": settings.from_name, \\\"from_email\\\": settings.reply_to, \\\"list_id\\\": recipients.list_id, \\\"sent_at\\\": send_time, \\\"created_at\\\": create_time, \\\"updated_at\\\": create_time }\",
    \"query_mapping\": \"{ \\\"count\\\": \$firstNonEmpty(query.limit, 50), \\\"offset\\\": \$number(\$firstNonEmpty(query.cursor, \\\"0\\\")) }\"
  }
}"
```

For long mappings, keep them in a file:

```bash
truto unified-model-mappings create --stdin < mailchimp-campaigns-list.json
```

Repeat for `get`, `create`, `update`, `delete`, and any custom methods you support.

To support a second provider, add a base mapping with a different `integration_name`. The unified shape stays the same — only the JSONata changes to extract from the new provider's response. For example, the same `marketing.campaigns.list` for Klaviyo (whose API is JSON:API style with `data[].attributes.*`):

```json
{
  "unified_model_id": "<your-unified-model-id>",
  "resource_name": "campaigns",
  "integration_name": "klaviyo",
  "method_name": "list",
  "config": {
    "resource": "campaigns",
    "method": "list",
    "response_mapping": "response.data.{ \"id\": id, \"name\": attributes.name, \"status\": $mapValues($lowercase(attributes.status), { \"draft\": \"draft\", \"queued\": \"scheduled\", \"sending\": \"sending\", \"sent\": \"sent\", \"cancelled\": \"archived\", \"paused\": \"draft\" }), \"subject\": attributes.message.subject, \"from_name\": attributes.message.from_label, \"from_email\": attributes.message.from_email, \"list_id\": attributes.audiences.included[0], \"sent_at\": attributes.send_time, \"created_at\": attributes.created_at, \"updated_at\": attributes.updated_at }",
    "query_mapping": "{ \"page[size]\": $firstNonEmpty(query.limit, 50), \"page[cursor]\": query.cursor, \"filter\": $exists(query.status) ? \"equals(messages.channel,'email')\" : null }"
  }
}
```

```bash
truto unified-model-mappings create --stdin < klaviyo-campaigns-list.json
```

Two things to notice:

1. **The unified shape is identical** — `id`, `name`, `status`, `subject`, etc. are the contract. Every consumer of `marketing.campaigns` gets the same fields regardless of which provider is connected.
2. **The provider-specific quirks are isolated to the JSONata** — Mailchimp's `status: "save"` and Klaviyo's `status: "Draft"` both become `"draft"` thanks to `$mapValues`; Mailchimp's `count`/`offset` pagination and Klaviyo's `page[size]`/`page[cursor]` are both fed from the same unified `query.limit` and `query.cursor`.

This is the payoff of building a custom unified model: your application code calls one endpoint and gets one shape, no matter which marketing tool the customer connected.

The shape of `config` is identical to the override shape used in Workflow 1 — every JSONata mapping field documented in the [truto-jsonata Usage in Truto reference](../../truto-jsonata/references/usage-in-truto.md#1-unified-api-mapping-overrides--the-main-jsonata-surface) is available here.

### Step 4 — Install into an environment

Before any account in your environment can use the new unified model, install it:

```bash
truto env-unified-models create -b "{
  \"environment_id\": \"$ENV_ID\",
  \"unified_model_id\": \"$UNIFIED_MODEL_ID\"
}"
```

The response includes the `environment_unified_model.id` — save this if you ever want to add per-environment overrides via Workflow 1.

### Step 5 — Use it

The unified API is now available via the CLI:

```bash
truto unified marketing campaigns -a "$ACCOUNT_ID" -o json
```

…or via HTTP:

```
https://api.truto.one/unified/marketing/campaigns?integrated_account_id=<account-id>
```

provided the connected account is for an integration you defined a base mapping for (e.g. Mailchimp).

### Step 6 — Iterate

Adding a new field, supporting a new method, or supporting a new integration is the same flow:

- **New field** → `truto unified-models update <id>` to update the resource schema, then `truto unified-model-mappings update <id>` to update each method's `config`.
- **New method** → `truto unified-models update <id>` to add the method name to the resource's `methods` array, then `truto unified-model-mappings create` for each integration.
- **New integration** → just `truto unified-model-mappings create` rows for that integration's `(resource, method)` tuples — no change to the model itself.

---

## Modifying a custom unified model after creation

Update the model itself (note: `unified-models update` requires the current `version` — fetch it with `truto unified-models get <id>` first):

```bash
truto unified-models update "$UNIFIED_MODEL_ID" -b '{
  "version": 1,
  "description": "Updated description",
  "resources": {
    "campaigns": {
      "schema": { "...": "updated JSON Schema" },
      "methods": ["list", "get", "create", "update", "delete", "send"]
    }
  }
}'
```

Update a base mapping row:

```bash
truto unified-model-mappings update "$BASE_MAPPING_ID" -b '{
  "config": {
    "response_mapping": "response.campaigns.{ \"id\": id, \"name\": settings.title, \"new_field\": new_field }"
  }
}'
```

Remove a base mapping (e.g. dropping support for an integration):

```bash
truto unified-model-mappings delete "$BASE_MAPPING_ID"
```

Delete the whole unified model (last resort — this affects every environment that has it installed):

```bash
truto unified-models delete "$UNIFIED_MODEL_ID"
```

---

## Testing changes

Three useful patterns, in roughly increasing order of fidelity (and decreasing order of speed).

### 1. Inspect the merged metadata

After making a change, the meta endpoint shows the **fully merged** config that the unified API will use. The CLI doesn't have a dedicated meta command yet — use `truto custom` to call the meta endpoint directly:

```bash
truto custom \
  "/unified/marketing/campaigns/mailchimp/meta/list" \
  -a "$ACCOUNT_ID" \
  -o json
```

The `response_mapping`, `query_schema`, `default_query`, and `default_body` fields in the response reflect base + your environment override + any per-account override merged together. If a change you made isn't visible here, it isn't being applied.

### 2. Make a real call against a test account

```bash
truto unified marketing campaigns -a "$TEST_ACCOUNT_ID" -o json
```

Use a sandbox or staging account first. If the response shape isn't what you expected, check:

1. The base + override merge via the meta endpoint (above) — is your `response_mapping` actually present?
2. The JSONata is referencing the right scope variables — see the [per-field scope tables](../../truto-jsonata/references/usage-in-truto.md#1-unified-api-mapping-overrides--the-main-jsonata-surface) in the truto-jsonata skill.
3. The expression compiles — JSONata syntax errors are surfaced as part of the unified API error response (and printed by `-v`).

### 3. Iterate locally

While iterating on a complex `response_mapping`, the round trip "publish → make a unified API call → look at result" is slow. Use `truto unified test-mapping` to evaluate a JSONata response_mapping against a sample raw response on your machine — no third-party call, no platform write.

```bash
# Capture a raw response from the proxy API (the same payload the mapping will run against)
truto proxy campaigns -a "$ACCOUNT_ID" -o json > sample.json

# Evaluate the platform's current base mapping against it
truto unified test-mapping \
  --model marketing \
  --resource campaigns \
  --integration mailchimp \
  --method list \
  --input sample.json
```

Or evaluate an unsaved mapping you're drafting:

```bash
truto unified test-mapping \
  --mapping 'response.campaigns.{ "id": id, "name": settings.title, "new_field": new_field }' \
  --input sample.json
```

…or read the mapping from a file:

```bash
truto unified test-mapping \
  --mapping-file new-list.jsonata \
  --input sample.json
```

To preview what the platform will use after merging in your env-level override, pass `--with-overrides $ENV_UNIFIED_MODEL_ID` — it fetches the env-specific override and uses it instead of the base when present:

```bash
truto unified test-mapping \
  --model marketing \
  --resource campaigns \
  --integration mailchimp \
  --method list \
  --with-overrides "$ENV_UNIFIED_MODEL_ID" \
  --input sample.json
```

This shrinks the iteration loop from "edit → push → call → compare" to "edit → run". When the result looks right, publish via `truto env-unified-model-mappings create` (or `update`).

---

## Appendix — Discovering integration, model, resource, and method names

Every endpoint and command in this reference takes some combination of `integration_name`, `unified_model_name`, `resource_name`, and `method_name` as identifiers. They all need to match exactly what Truto has registered. Here's how to find them.

### Finding the right `integration_name`

The dashboard's integrations catalog at [https://app.truto.one](https://app.truto.one) shows every integration's name; the CLI equivalent is:

```bash
# List every integration available to your team (built-ins + ones you've created)
truto integrations list -o json
```

Each row's `name` field is what you pass as `integration_name` (e.g. `salesforce`, `hubspot`, `mailchimp`, `klaviyo`, `jira`, `slack`). Filter the list by name with `--name <name>`, or paginate with `--limit` / `--next-cursor` if the result set is large.

To see only the integrations that are **installed and enabled** in one of your environments:

```bash
truto environment-integrations list -o json
```

Each row references the underlying integration — use that to confirm the integration is active in the environment before writing overrides for it.

### Finding the right `unified_model_name`

```bash
# All unified models available to your team — Truto-shipped + your custom ones
truto unified-models list -o json
```

The `name` field is what you pass as `unified_model_name` (e.g. `crm`, `ticketing`, `hris`, `ats`, `accounting`, plus any custom ones your team owns).

### Finding the right `resource_name` and `method_name`

Read the unified model definition — it lists every resource and the methods each resource supports:

```bash
truto unified-models get "$UNIFIED_MODEL_ID" -o json
```

Look at `resources.<resource_name>.methods` — that's the array of method names valid for that resource. Standard methods are `list`, `get`, `create`, `update`, `delete`; custom methods (like `search`, `bulk_create`, `download`) appear here too.

To narrow down to what's actually mapped for a specific integration:

```bash
truto unified-model-mappings list \
  --integration_name salesforce \
  -o json
```

Each row gives you the exact `(unified_model_name, resource_name, integration_name, method_name)` tuple that's defined. If a row doesn't exist for a tuple you want, the unified API isn't configured for that combination yet — either the integration doesn't support that resource/method, or no base mapping has been written. For Truto-shipped models, the dashboard's integration documentation page shows the same matrix in a more readable form.

There's also a per-integration discovery shortcut:

```bash
truto integrations tools <integration-id-or-name> -o json
```

This lists every tool/method an integration exposes — the easiest way to see what you can map.

### Confirming the merged shape before making a unified API call

Once you know the combination is valid, the merged config (base + your environment override + per-account override) is exposed via the meta endpoint. Call it through `truto custom`:

```bash
truto custom \
  "/unified/{model}/{resource}/{integration}/meta/{method}" \
  -a "$ACCOUNT_ID" \
  -o json
```

This is the source of truth at runtime — if a field appears here, the unified API will use it; if it doesn't, your override isn't being applied.

---

## Common gotchas

- **Mapping fields are field-replacing.** `config.response_mapping` in your override completely replaces the base — there's no JSONata-internal merge. To "add a field" you have to repeat the rest of the mapping. (See the worked example in Workflow 1.)
- **Cascade your changes across methods.** If you add a custom field to the `list` `response_mapping`, you almost certainly want it on `get` too — and to make it writable you need it in `create` and `update`'s `request_body_mapping`. The unified API doesn't infer this for you.
- **Backtick-quote keys with hyphens or special characters in JSONata.** `` headers.`x-rate-limit` ``, `` response.`some-field` ``. JSONata's dot syntax doesn't accept hyphens.
- **JSONata strings inside JSON need their internal double quotes escaped.** `"\"key\""`. For long expressions, write the JSONata first, then escape it for the JSON body — or stash the body in a file and use `--stdin`.
- **`update` is a deep merge, not a replace.** Sending `-b '{ "config": { "response_mapping": "..." } }'` won't drop other fields under `config`. To remove a field from `config`, set it explicitly to `null`.
- **`unified-models update` requires `version`.** The platform uses optimistic locking on this resource. Fetch the current row with `truto unified-models get <id>` first and include its `version` in the body. (Mapping rows don't require this — only the model itself.)
- **The base unified model is shared across teams.** If you're customizing a Truto-shipped unified model (e.g. `crm`), all of your changes go into the **environment** override or the per-account override — not into the base. Only your custom unified models can have their base mappings edited directly.
- **Custom unified models are team-private.** Only your team can see and use them; you can't share a custom unified model across teams.
- **`test-mapping` evaluates JSONata, not the full pipeline.** The meta endpoint and the real unified call are still the source of truth for the merged config and `before` / `after` hooks. Use `test-mapping` for quick iteration on the JSONata expression itself.

---

## Appendix — Direct HTTP API

Every CLI command in this reference maps 1:1 to an HTTP endpoint. Use these when you can't run the CLI (CI, edge functions, non-Node environments). All endpoints accept a session cookie or `Authorization: Bearer <api_token>` (see [Authentication](./authentication.md)).

### Discovery (read-only)

| Method | Path | CLI equivalent |
|---|---|---|
| `GET` | `/unified-model` | `truto unified-models list` |
| `GET` | `/unified-model/:id` | `truto unified-models get <id>` |
| `GET` | `/unified-model-resource-method` | `truto unified-model-mappings list` |
| `GET` | `/unified-model-resource-method/:id` | `truto unified-model-mappings get <id>` |
| `GET` | `/environment-unified-model` | `truto env-unified-models list` |
| `GET` | `/environment-unified-model/:id` | `truto env-unified-models get <id>` |
| `GET` | `/environment-unified-model-resource-method` | `truto env-unified-model-mappings list` |
| `GET` | `/environment-unified-model-resource-method/:id` | `truto env-unified-model-mappings get <id>` |
| `GET` | `/unified/meta/{model}/{integration}` | (call via `truto custom` — see [Inspect the merged metadata](#1-inspect-the-merged-metadata)) |
| `GET` | `/unified/{model}/{resource}/meta/{method}` | (call via `truto custom`) |
| `GET` | `/unified/{model}/{resource}/{integration}/meta/{method}` | (call via `truto custom`) |

The two `/meta/...` endpoints are documented in [Unified API → Meta Endpoints](./unified-api.md#meta-endpoints).

### Modifying mappings per environment

| Method | Path | CLI equivalent |
|---|---|---|
| `POST` | `/environment-unified-model-resource-method` | `truto env-unified-model-mappings create -b '{...}'` |
| `PATCH` | `/environment-unified-model-resource-method/:id` | `truto env-unified-model-mappings update <id> -b '{...}'` |
| `DELETE` | `/environment-unified-model-resource-method/:id` | `truto env-unified-model-mappings delete <id>` |

### Modifying mappings per account

| Method | Path | CLI equivalent |
|---|---|---|
| `PATCH` | `/integrated-account/:id` | `truto accounts update <id> -b '{"unified_model_override": {...}}'` |

### Creating / managing your own unified models

| Method | Path | CLI equivalent |
|---|---|---|
| `POST` | `/unified-model` | `truto unified-models create -b '{...}'` |
| `PATCH` | `/unified-model/:id` | `truto unified-models update <id> -b '{...}'` |
| `DELETE` | `/unified-model/:id` | `truto unified-models delete <id>` |
| `POST` | `/unified-model-resource-method` | `truto unified-model-mappings create -b '{...}'` |
| `PATCH` | `/unified-model-resource-method/:id` | `truto unified-model-mappings update <id> -b '{...}'` |
| `DELETE` | `/unified-model-resource-method/:id` | `truto unified-model-mappings delete <id>` |
| `POST` | `/environment-unified-model` | `truto env-unified-models create -b '{...}'` |
| `PATCH` | `/environment-unified-model/:id` | `truto env-unified-models update <id> -b '{...}'` |
| `DELETE` | `/environment-unified-model/:id` | `truto env-unified-models delete <id>` |

A full curl example for one common path — creating an environment override — looks like:

```bash
curl -X POST "https://api.truto.one/environment-unified-model-resource-method" \
  -H "Authorization: Bearer $TRUTO_API_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "environment_unified_model_id": "<env-crm-id>",
    "resource_name": "contacts",
    "integration_name": "salesforce",
    "method_name": "list",
    "config": {
      "response_mapping": "response.records.{ \"id\": Id, \"first_name\": FirstName, \"last_name\": LastName, \"email\": Email, \"loyalty_tier\": Loyalty_Tier__c }"
    }
  }'
```

The same JSON body works whether you send it via `curl -d`, `truto env-unified-model-mappings create -b '...'`, or piped into `--stdin`.

---

## Related references

- **[Unified API](./unified-api.md)** — consuming the unified API: endpoint shapes, response envelopes, pagination, idempotency, meta endpoints
- **[Authentication](./authentication.md)** — API tokens and how to authenticate the calls in this reference
- **[Core Resources](./core-resources.md)** — environments, integrations, integrated accounts, teams (the IDs you'll need)
- **[Integrated Account Context](./integrated-account-context.md)** — the `context` binding available in mapping JSONata
- **[Customizing Integrations](./customizing-integrations.md)** — overriding an integration's HTTP-layer behavior (auth, pagination, rate-limit, inbound webhook verification/transform) per environment
- **[truto-jsonata: Usage in Truto §1](../../truto-jsonata/references/usage-in-truto.md#1-unified-api-mapping-overrides--the-main-jsonata-surface)** — per-mapping-field JSONata scope variables, function references, and authoring tips
- **[truto-jsonata SKILL](../../truto-jsonata/SKILL.md)** — full cheatsheet of custom `$` functions available in mapping expressions
- **[Truto CLI skill](../../truto-cli/SKILL.md)** — installation, authentication, and full command reference
