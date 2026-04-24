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

> **For LLM-driven workflows, always pass `-o json` or `-o ndjson`.** The default `-o table` silently truncates IDs, URLs, and JSON/HTML bodies to fit the terminal — you'll lose data without any indication.

### Pick the right format for the consumer


| Consumer pattern                                                                          | Use…                                         | Why                                                         |
| ----------------------------------------------------------------------------------------- | -------------------------------------------- | ----------------------------------------------------------- |
| Whole result fits in memory and stays as one document                                     | `-o json`                                    | Pretty-printed; one self-contained JSON value.              |
| Piping to `head`, `tail`, `less`, `grep`, `jq -c`, anything that may close the pipe early | `-o ndjson`                                  | One JSON object per line — safe to truncate at any newline. |
| Result might be larger than a screenful                                                   | Redirect to a file first                     | `truto … -o json > /tmp/out.json && jq … /tmp/out.json`     |
| Bulk export across many pages                                                             | `truto export … -o ndjson --out file.ndjson` | Streams page-by-page; auto-paginates.                       |


### The `-o json | head` trap (and how to avoid it)

`-o json` emits one big pretty-printed document. When the downstream consumer (`head`, `less`, `jq` after a pipe close) closes the pipe early, the CLI gets SIGPIPE mid-token and you see truncated output:

```bash
truto proxy tags -a <id> -o json | head -20 | jq '.'
# jq: parse error: Invalid numeric literal at line N column M
# jq: parse error: Unfinished JSON term at EOF at line N
```

The data was fine; the pipe truncated it. Two correct patterns:

```bash
# Streaming consumers — use ndjson
truto proxy tags -a <id> -o ndjson | head -20 | jq -c '{id, name}'

# Larger results — redirect first, then process
truto proxy conversation_messages -a <id> -m list \
  -q "conversation_id=cnv_xxx" -q "limit=100" -o json > /tmp/msgs.json
jq '.[] | {id, type}' /tmp/msgs.json | head -5

# Counting? Same trap. wc -l on pretty-printed json measures whitespace, not records.
truto proxy tags -a <id> -o ndjson | wc -l                                  # OK: counts records
truto proxy tags -a <id> -o json > /tmp/x.json && jq 'length' /tmp/x.json   # OK: counts records
truto proxy tags -a <id> -o json | wc -l                                    # WRONG: counts whitespace lines, often truncated
```

### Recipes

```bash
# Get IDs of all active integrations
truto integrations list -o json | jq '.[].id'

# Count records (ndjson — one object per line, safe to count)
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
5. **Resource ID on `unified` / `proxy` is positional, not a flag.** `-d` / `--id` do not exist. Correct: `truto proxy contacts crd_xxx -m get -a $ACCOUNT`. Wrong: `truto proxy contacts -m get -d crd_xxx -a $ACCOUNT` (returns `error: unknown option '-d'`). Same for unified.
6. **Default output format varies:**
  - Most commands: `table`
  - `export`: `json`
  - `get` subcommands: `json`
  - `custom`: `json`
7. `**-o table` silently truncates** IDs, URLs, and JSON/HTML bodies. Never script against it. LLM-driven workflows should always use `-o json` or `-o ndjson`.
8. `**-o json` + `head`/`less`/early-close consumers ⇒ truncated mid-token ⇒ `jq: parse error`.** Pipe to `-o ndjson` instead, or redirect `-o json` to a file before processing. See [Output Piping → The `-o json | head` trap](#the--o-json--head-trap-and-how-to-avoid-it) above.
9. **`truto accounts list` server-side filters** (CLI ≥ 0.17.0): `--tenant-id`, `--is-sandbox`, `--integration-name` (alias `--integration.name`), `--status`, `--features-super-query` (alias `--features.super_query`), `--created-at`, `--updated-at`. Reach for these before falling back to client-side `jq` shaping. **`--profile` does NOT scope by integration** — it only swaps the token + URL. On older CLI builds only `--tenant-id` / `--is-sandbox` are exposed. See [admin-commands.md → Integrated Accounts](admin-commands.md#integrated-accounts-truto-accounts).
10. **Unified `update` without an ID:** Sends PATCH to the collection endpoint. May or may not be supported depending on the integration.
11. **Proxy custom methods:** `-m custom-action` sends POST to `/proxy/<resource>/custom-action`. The method name becomes a path segment.
12. **JSON export of large datasets:** `json` and `yaml` formats buffer all records in memory. Use `ndjson` or `csv` for large exports — they stream page-by-page.
13. **Schema output is YAML:** `truto schema` returns YAML, not JSON. Use `--out` (not `-o`) to write to file.
14. **Optimistic locking:** `integrations update` and `unified-models update` require a `version` field. Fetch current version with `get` first.
15. `**environment_id` is implicit:** Your API token is scoped to a specific environment. All resources are automatically filtered.
16. `**docs list` requires a filter:** A bare `truto docs list` without `--integration_id` or similar will error.

