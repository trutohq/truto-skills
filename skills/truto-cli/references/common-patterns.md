# Common Patterns

## Pagination

List commands return 25 results by default. Use `--limit` and `--next-cursor` for manual pagination:

```bash
truto integrations list --limit 10
# Output shows: Next page: --next-cursor abc123...
truto integrations list --limit 10 --next-cursor abc123
```

For exhaustive pagination (all pages), use `export` instead:

```bash
truto export crm/contacts -a <id> -o ndjson --out all-contacts.ndjson
```

## Filtering

Resource list commands accept `--<field>` flags for filtering. Check each command's help for available filters:

```bash
truto integrations list --help
truto accounts list --tenant_id <tid>
truto sync-jobs list --integration_name hubspot
truto workflow-runs list --status completed
```

## Output Piping

When `-o` is set to `json`, `yaml`, `csv`, or `ndjson`, decorative status messages are suppressed — only structured data reaches stdout. Errors always go to stderr.

```bash
# Get IDs of all active integrations
truto integrations list -o json | jq '.[].id'

# Count records
truto export crm/contacts -a <id> -o ndjson | wc -l

# Feed into another command
truto export crm/contacts -a <id> -o ndjson | \
  jq -c '{email: .email}' | \
  truto proxy email-list -m create -a <other-id> --stdin
```

## Stdin Pipe Support

The `--stdin` flag is available on `create` (resource commands), `unified`, `proxy`, `custom`, and `batch`.

```bash
# Bulk create from NDJSON
cat contacts.ndjson | truto accounts create --stdin

# Bulk create from JSON array
echo '[{"name":"a"},{"name":"b"}]' | truto integrations create --stdin

# Pipe to unified API
echo '{"first_name":"Jane"}' | truto unified crm contacts -m create -a <id> --stdin

# Pipe to proxy API
cat payload.json | truto proxy tickets -m create -a <id> --stdin

# Pipe to custom API
curl -s https://api.example.com/data | truto custom /import -m POST -a <id> --stdin

# Pipe to batch
cat batch-requests.json | truto batch --stdin
```

### Format Detection (resource `create` only)

- Input starting with `[` → parsed as JSON array, each element created separately
- Otherwise → parsed as NDJSON (one JSON object per line)

### Important

- `--stdin` and `--body` are mutually exclusive.
- For `unified`, `proxy`, `custom`, and `batch`: `--body` takes precedence over `--stdin`. Stdin is parsed as a single JSON body (not NDJSON).
- For resource `create` commands: `--stdin` takes precedence over `--body`. Supports multi-record input (JSON array or NDJSON).

## Profiles

Profiles are stored at `~/.truto/config.json`.

```bash
# List all profiles
truto profiles list

# Switch active profile
truto profiles use <profile-name>

# Set profile-specific values
truto profiles set api-url https://custom.truto.one
truto profiles set default-integrated-account <account-id>

# Read a profile value
truto profiles get api-url
```

`set` and `get` operate on the currently active profile. Switch profiles first if needed.

**Allowed profile keys** (all naming formats accepted):

- `apiUrl` / `api_url` / `api-url`
- `defaultIntegratedAccount` / `default_integrated_account` / `default-integrated-account`

## Verbose Mode

Use `-v` to print request/response details to stderr for debugging:

```bash
truto integrations list -v
# stderr output:
# → GET https://api.truto.one/integration?limit=25
# ← 200 OK
```

## Discovery Workflow

Recommended first steps when exploring a new Truto setup:

```bash
# 1. Check your identity and team
truto whoami -o json

# 2. List connected accounts
truto accounts list -o json

# 3. Discover what resources an account supports
truto accounts tools <account-id> --methods list -o json

# 4. List data from a discovered resource
truto proxy <resource> -a <account-id> -o json
```

`truto accounts tools` is the best discovery command — it shows every resource and method available for an account. Use `--methods` and `--tags` to filter results.

## Gotchas

1. **`accounts` vs `integrated-accounts`:** The CLI command is `accounts` for brevity. The API path is `integrated-account`.
2. **`gates` vs `static-gates`:** The CLI command is `gates`. The API path is `static-gate`.
3. **`export`/`diff` resource convention:** A slash in the resource name means unified API (`crm/contacts`), no slash means proxy (`tickets`). These commands do NOT work with admin resources.
4. **`--account` vs first argument:** Most data-plane commands use `-a, --account`. But `mcp-tokens` takes the account ID as its first positional argument.
5. **Default output format varies:**
   - Most commands: `table`
   - `export`: `json`
   - `get` subcommands: `json`
   - `custom`: `json`
6. **Unified `update` without an ID:** Sends PATCH to the collection endpoint. May or may not be supported depending on the integration.
7. **Proxy custom methods:** `-m custom-action` sends POST to `/proxy/<resource>/custom-action`. The method name becomes a path segment.
8. **JSON export of large datasets:** `json` and `yaml` formats buffer all records in memory. Use `ndjson` or `csv` for large exports — they stream page-by-page.
9. **Schema output is YAML:** `truto schema` returns YAML, not JSON. Use `--out` (not `-o`) to write to file.
10. **Optimistic locking:** `integrations update` and `unified-models update` require a `version` field. Fetch current version with `get` first.
11. **`environment_id` is implicit:** Your API token is scoped to a specific environment. All resources are automatically filtered.
12. **`docs list` requires a filter:** A bare `truto docs list` without `--integration_id` or similar will error.
