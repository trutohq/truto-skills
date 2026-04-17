# Power Features

## Export (`truto export`)

Bulk export resources with auto-pagination. Supports both unified and proxy APIs.

```bash
truto export <resource> [id] -a <account-id> [-o format] [--out file]
```

### Resource Path Convention

- `crm/contacts` (contains `/`) → **unified API**: `GET /unified/crm/contacts`
- `tickets` (no `/`) → **proxy API**: `GET /proxy/tickets`

### Examples

```bash
# Export all CRM contacts as NDJSON (unified API)
truto export crm/contacts -a <account-id> -o ndjson --out contacts.ndjson

# Export as CSV
truto export crm/contacts -a <account-id> -o csv --out contacts.csv

# Export as JSON
truto export crm/contacts -a <account-id> --out contacts.json

# Export a single record
truto export crm/contacts <contact-id> -a <account-id> --out contact.json

# Export proxy resources (no slash = proxy)
truto export tickets -a <account-id> -o csv --out tickets.csv

# Export to stdout and pipe to jq
truto export crm/contacts -a <account-id> -o ndjson | jq '.email'

# With query filters
truto export crm/contacts -a <account-id> -q "status=active" -o ndjson --out active.ndjson
```

### Format Behavior

| Format | Streaming? | Notes |
|--------|-----------|-------|
| `ndjson` | Yes | Writes each record as it arrives. Best for large datasets. |
| `csv` | Yes | Header on first page, rows appended per page. Columns locked from first record. |
| `json` | No | Buffers all records in memory. Careful with large datasets. |
| `yaml` | No | Buffers all records in memory. Careful with large datasets. |

Default format is `json` (not `table`).

Progress is printed to stderr: `Exported N records...` per page.

---

## Diff (`truto diff`)

Compare two records field-by-field.

```bash
truto diff <resource> <id1> [id2] -a <account-id> [--account2 <id>]
```

### Examples

```bash
# Compare two contacts in the same account
truto diff crm/contacts <id1> <id2> -a <account-id>

# Compare the same contact across two different accounts
truto diff crm/contacts <id> -a <account-1> --account2 <account-2>

# JSON output for programmatic use
truto diff crm/contacts <id1> <id2> -a <account-id> -o json
```

### Output

**Table mode:**

```
Diff: abc-123 vs def-456
┌─────────────┬───────────────┬───────────────┐
│ Field       │ abc-123       │ def-456       │
├─────────────┼───────────────┼───────────────┤
│ email       │ old@test.com  │ new@test.com  │
│ status      │ active        │ inactive      │
└─────────────┴───────────────┴───────────────┘
2 field(s) differ
```

**JSON mode (`-o json`):**

```json
{
  "email": { "left": "old@test.com", "right": "new@test.com" },
  "status": { "left": "active", "right": "inactive" }
}
```

When using `--account2`, `[id2]` is optional — it defaults to `id1` (compare same record across accounts). Without `--account2`, `id2` is required.

Uses the same resource path convention as `export`: slash = unified, no slash = proxy.

---

## Logs (`truto logs`)

Query API and automation logs.

```bash
truto logs --log-type <type> [options]
```

### Options

| Flag | Description |
|------|-------------|
| `--log-type <type>` | **Required.** Log type: `unified_proxy_api`, `rapid_bridge`, `webhook`, `sync_job_cron_trigger`, `mcp` |
| `--start <date>` | Start date (ISO 8601) |
| `--end <date>` | End date (ISO 8601) |
| `--integrated-account-id <id>` | Filter by integrated account |
| `--sync-job-run-id <id>` | Filter by sync job run (`rapid_bridge`) |
| `--sync-job-id <id>` | Filter by sync job (`rapid_bridge`) |
| `--webhook-id <id>` | Filter by webhook (`webhook`, `rapid_bridge`) |
| `--mcp-server-id <id>` | Filter by MCP server (`mcp`) |
| `--integration <name>` | Filter by integration name |
| `--event <event>` | Filter by event (`webhook`) |
| `--limit <n>` | Number of results (max 100, default 100) |

Not all filters apply to all log types — the parenthetical notes indicate which log types support each filter.

### Examples

```bash
truto logs --log-type unified_proxy_api
truto logs --log-type unified_proxy_api --integrated-account-id <id> --limit 50
truto logs --log-type unified_proxy_api --start 2024-01-01T00:00:00Z --end 2024-01-31T23:59:59Z
```

---

## Schema (`truto schema`)

Fetch the OpenAPI schema.

```bash
truto schema              # print to stdout
truto schema --out openapi.yml   # save to file
```

The schema returns **YAML**, not JSON. Use `--out` (not `-o`, which is the global output format flag) to write to a file. Convert to JSON if needed: `truto schema | yq -o json`.

---

## Open (`truto open`)

Open resources in the Truto dashboard in your browser.

```bash
truto open                          # dashboard home
truto open integrations             # integrations page
truto open accounts                 # integrated accounts page
truto open accounts <id>            # specific account
truto open sync-jobs                # sync jobs page
truto open workflows                # workflows page
truto open logs                     # logs page
```

**Supported resource names:** `integrations`, `accounts`, `integrated-accounts`, `environments`, `sync-jobs`, `workflows`, `webhooks`, `api-tokens`, `mcp-tokens`, `unified-models`, `datastores`, `logs`, `team`, `link-tokens`, `notifications`

Uses `open` on macOS and `xdg-open` on Linux.

---

## Interactive Mode (`truto interactive`)

A guided wizard for exploring the API without memorizing commands.

```bash
truto interactive
truto i              # alias
```

Walks you through:

1. Pick a resource type
2. Choose an operation (list, get, create, update, delete)
3. Enter required parameters
4. View results

**When to use:** Great for exploration, learning the API, or when you can't remember field names.

**When NOT to use:** Not suitable for scripting. Doesn't expose all filtering/query options. Use the direct subcommands instead.

---

## Files (`truto files`)

Upload files to Truto-hosted public URLs.

```bash
truto files upload /path/to/file.csv
```

Files can only be uploaded — not listed or downloaded via the CLI.

---

## Context (`truto context`)

Output a full CLI and platform reference as markdown. Designed for LLM agents.

```bash
truto context            # concise reference
truto context --full     # includes complete auto-generated command tree with all flags
```

This is the CLI's built-in self-documentation command. It outputs key concepts, entity hierarchy, authentication details, all commands with examples, and tips for LLM agents.
