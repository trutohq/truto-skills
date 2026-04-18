---
name: Truto CLI
description: Admin and debugging tool for the Truto platform. Use to set up integrations, manage accounts, explore resources, export data, and debug API calls from the terminal. Does not generate application code.
---

# Truto CLI

Use this skill when running Truto commands in the terminal — setting up platform resources, exploring what an integration supports, debugging API calls, or doing one-time data exports. The CLI is an **admin and debugging tool**; nothing it does ends up in the user's codebase.

To write integration code that calls the Truto API from the user's application, use the **Truto** skill instead.

Trigger phrases: "truto cli", "truto command", "install truto", "truto login", "set up integration", "list accounts", "truto export", "debug truto".

## What is the Truto CLI?

The Truto CLI is a terminal tool for administering the [Truto](https://truto.one) unified API platform. It covers:

- **Setup and admin** — create and configure integrations, connect accounts, set up sync jobs, webhooks, and workflows
- **Exploration and debugging** — discover available resources, inspect data, test API calls with verbose output
- **One-time data tasks** — bulk export with auto-pagination, field-by-field diffing, log queries

## Installation

```bash
curl -fsSL https://cli.truto.one/install.sh | bash
```

This detects your OS/architecture, downloads the correct binary, and installs to `~/.truto/bin/truto`.

**Options:**

```bash
# Specific version
TRUTO_VERSION=0.1.0 curl -fsSL https://cli.truto.one/install.sh | bash

# Custom install directory
TRUTO_INSTALL_DIR=/usr/local/bin curl -fsSL https://cli.truto.one/install.sh | bash
```

**Upgrade:**

```bash
truto upgrade              # upgrade to latest
truto upgrade --check      # check without installing
truto upgrade --force      # re-download even if current
```

## Authentication

The CLI uses API tokens. Authenticate with:

```bash
# Interactive (prompts for profile name, API URL, token)
truto login

# Non-interactive (for scripting / LLM agents)
truto login --token <your-api-token>
truto login --token <token> --profile-name staging --api-url https://custom.truto.one
```

Verify credentials:

```bash
truto whoami
truto whoami -o json        # machine-readable
```

Credentials are stored in `~/.truto/config.json`. Manage multiple profiles:

```bash
truto profiles list
truto profiles use staging
```

**Token resolution:** `--token` flag > active profile's token > error.
**API URL resolution:** `--api-url` flag > active profile's URL > `https://api.truto.one`.

## Quick Reference

| Category | Commands | Description |
|----------|----------|-------------|
| **Auth** | `login`, `logout`, `whoami`, `profiles` | Authentication and profile management |
| **Core Resources** | `integrations` (incl. `init`, `validate`), `accounts`, `environments`, `environment-integrations` (incl. `override-auth`, `override-pagination`, `override-rate-limit`, `override-webhook`, `show-override`), `api-tokens` | Platform entity management |
| **Unified Model Customization** | `unified-models`, `unified-model-mappings`, `env-unified-models`, `env-unified-model-mappings` | Base + per-environment unified model definitions and field mappings |
| **Automation** | `sync-jobs`, `sync-job-runs`, `sync-job-triggers`, `sync-job-templates`, `workflows`, `workflow-runs` | Data sync and workflow automation |
| **Data Plane** | `unified` (incl. `test-mapping`), `proxy`, `custom`, `batch` | Access third-party data; iterate on JSONata mappings locally |
| **Webhooks & Alerts** | `webhooks`, `notification-destinations` | Event delivery and alerting |
| **Platform** | `datastores`, `mcp-tokens`, `daemons`, `daemon-jobs`, `gates`, `docs`, `link-tokens`, `users`, `team` | Additional platform resources |
| **Power Features** | `export`, `diff`, `open`, `interactive`, `logs`, `schema`, `files` | Bulk data, comparison, and utilities |
| **Meta** | `upgrade`, `context` | CLI management and LLM agent reference |

## Global Options

Every command accepts these flags:

| Flag | Description | Default |
|------|-------------|---------|
| `-p, --profile <name>` | Use a specific profile | Active profile |
| `--api-url <url>` | Override API URL | Profile's URL or `https://api.truto.one` |
| `--token <token>` | Override API token | Profile's token |
| `-o, --output <format>` | `json`, `table`, `yaml`, `csv`, `ndjson` | `table` |
| `-v, --verbose` | Print request/response details to stderr | Off |

## Output Formats

| Format | Best for | Notes |
|--------|----------|-------|
| `table` | Interactive use | Default. Truncates long values. |
| `json` | Piping to `jq`, saving files | Pretty-printed. |
| `ndjson` | Streaming, log processing | One JSON object per line. Ideal for `export`. |
| `csv` | Spreadsheets, data analysis | Auto-detects columns. |
| `yaml` | Config files, human-readable | Uses yaml library. |

When `-o` is set to `json`, `yaml`, `csv`, or `ndjson`, decorative messages are suppressed — only structured data reaches stdout.

## LLM Agent Tips

1. **Always use `-o json` or `-o ndjson`** — the default `table` format truncates values.
2. **Start with `truto accounts tools <id> -o json`** to discover what resources an account supports.
3. **Use `-v` (verbose)** to debug failures — shows raw HTTP request/response on stderr.
4. **Non-interactive login:** `truto login --token <token>` skips all prompts.
5. **Use `truto context`** to get a full CLI reference as markdown, or `truto context --full` for the complete command tree with all flags.
6. **Pagination:** List commands return 25 results by default. Use `truto export` for exhaustive data.
7. **Resource path convention:** In `export`/`diff`, `crm/contacts` (with `/`) = unified API, `tickets` (no `/`) = proxy API.

## Key Gotchas

- **`accounts`** not `integrated-accounts` — CLI uses the short name for brevity.
- **`gates`** not `static-gates` — CLI is `gates`, API path is `static-gate`.
- **Optimistic locking** — `integrations update`, `unified-models update`, `unified-model-mappings update`, and `env-unified-model-mappings update` all require a `version` field. Fetch current version with `get` first.
- **`environment_id` is implicit** — your API token is scoped to one environment.
- **MCP tokens use positional args** — `mcp-tokens` takes account ID as first positional argument, not `--account`.
- **`-mappings` is the verb-friendly alias** — `truto unified-model-mappings` and `truto env-unified-model-mappings` map to the API resources `unified-model-resource-method` and `environment-unified-model-resource-method` respectively. Use the CLI names; the long forms only appear in raw HTTP debugging.
- **`override-*` helpers are deep patches** — `truto environment-integrations override-auth/override-pagination/override-rate-limit/override-webhook` patch the relevant key inside `override` and leave siblings alone. Use `show-override` to inspect the current state, and pass `--clear` to null out a single key.
- **`unified test-mapping` is offline** — it evaluates a JSONata `response_mapping` against a local sample (no third-party HTTP call), so you can iterate before publishing. It cannot evaluate operator-style (object) mappings yet.

## References

| Reference | Content |
|-----------|---------|
| [Admin Commands](references/admin-commands.md) | Full CRUD details for every platform resource — including `integrations init/validate`, `environment-integrations override-*`, and the `unified-models` / `unified-model-mappings` / `env-unified-models` / `env-unified-model-mappings` customization group |
| [Data Plane](references/data-plane.md) | Unified, proxy, custom, and batch API commands; `unified test-mapping` for local JSONata iteration |
| [Power Features](references/power-features.md) | Export, diff, interactive mode, logs, schema, open |
| [Common Patterns](references/common-patterns.md) | Pagination, filtering, piping, stdin, profiles, scripting |

## Companion: Truto API

To write integration code that calls the Truto API from the user's application — `fetch()` calls, webhook handlers, connection flows — use the **Truto** skill. This CLI skill is for admin setup and debugging in the terminal; the Truto skill is for code that ships in the user's product.
