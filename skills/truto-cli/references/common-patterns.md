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

Profiles are stored at `~/.truto/config.json` (chmod `0600`). The `profiles` and `profile` aliases are interchangeable on every subcommand.

```bash
# List all profiles
truto profiles list

# Show the active profile + authenticated user (alias for `truto whoami`)
truto profiles current

# Switch active profile
truto profiles use <profile-name>
truto use <profile-name>            # top-level shortcut for the same thing

# Set profile-specific values
truto profiles set api-url https://custom.truto.one
truto profiles set default-integrated-account <account-id>

# Read a profile value
truto profiles get api-url

# Save a BYOK key (Anthropic or Firecrawl) — used by `truto integrations build`.
# If <value> is omitted, prompts with input masked so the secret never lands in
# shell history or `ps` output. The file is re-chmodded to 0600 on every write.
truto profiles set-key anthropic <key>
truto profiles set-key firecrawl                  # interactive password prompt
```

`set` / `get` / `set-key` operate on the currently active profile. Switch profiles first if needed.

**Allowed profile keys** for `set <key> <value>` (all naming formats accepted — kebab-case, snake_case, and camelCase resolve to the same field):


| Key                        | Aliases                                                     | Purpose                                                                                         |
| -------------------------- | ----------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| `apiUrl`                   | `api_url` / `api-url`                                       | Override the Truto API base URL (e.g. for a custom region or self-hosted env)                   |
| `defaultIntegratedAccount` | `default_integrated_account` / `default-integrated-account` | Default account ID used when `-a` / `--account` is omitted on data-plane commands               |
| `anthropicApiKey`          | `anthropic_api_key` / `anthropic-api-key`                   | BYOK Anthropic key for `truto integrations build` (prefer `set-key anthropic` for masked input) |
| `firecrawlApiKey`          | `firecrawl_api_key` / `firecrawl-api-key`                   | BYOK Firecrawl key for `truto integrations build` (prefer `set-key firecrawl` for masked input) |


> The plain `set` command will accept the BYOK keys above too, but `set-key` is preferred for them because it (1) prompts with hidden input when `<value>` is omitted, and (2) validates the `<kind>` against the supported BYOK taxonomy before touching the file. BYOK resolution order at call time is: `--anthropic-api-key`/`--firecrawl-api-key` flag → `ANTHROPIC_API_KEY`/`FIRECRAWL_API_KEY` env → active profile field → interactive prompt (TTY only).

## Verbose Mode

Use `-v` to print request/response details to stderr for debugging:

```bash
truto integrations list -v
# stderr output:
# → GET https://api.truto.one/integration?limit=25
# ← 200 OK
```

## Discovery Workflow

Recommended first steps when exploring a new Truto setup or before calling any data-plane command:

```bash
# 1. Check your identity and team
truto whoami -o json

# 2. List connected accounts
truto accounts list -o json

# 3. Discover what resources/methods an account exposes (proxy + unified + auth + AI readiness)
truto capabilities <account-id> -o json

# 4. Call with arguments copied from the capabilities response
truto unified <model> <resource> -a <account-id> -o json   # routes from capabilities.unified
truto proxy   <resource>         -a <account-id> -o json   # routes from capabilities.proxy
```

`truto capabilities` is the **default discovery command** — a clean, paginated menu of resources × methods per surface (`--type proxy|unified|all`) with optional filters (`--methods <list>`, `--resource <name>`, `--no-has-description`). Pass an integrated-account UUID to learn what THAT account can do, or an integration slug to see what the integration supports in general.

When you need the full JSON Schema for a specific method's query params or request body — i.e. *after* capabilities tells you the method exists — drop down to `truto accounts tools <account-id> --methods list,get -o json`. It's verbose by design; don't lead with it.

For the full discovery-first walkthrough, copyable templates per method, the proxy 404 → "Did you mean…?" hint, and `jq` recipes against the capabilities payload, see [Querying Data](querying-data.md).

## Gotchas

1. `**accounts` vs `integrated-accounts`:** The CLI command is `accounts` for brevity. The API path is `integrated-account`.
2. `**gates` vs `static-gates`:** The CLI command is `gates`. The API path is `static-gate`.
3. `**export`/`diff` resource convention:** A slash in the resource name means unified API (`crm/contacts`), no slash means proxy (`tickets`). These commands do NOT work with admin resources.
4. `**--account` vs first argument:** Most data-plane commands use `-a, --account`. But `mcp-tokens` takes the account ID as its first positional argument.
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
11. `**environment_id` is implicit:** Your API token is scoped to a specific environment. All resources are automatically filtered.
12. `**docs list` requires a filter:** A bare `truto docs list` without `--integration_id` or similar will error.

