---
name: truto-integrations-build
description: >-
  Generate a new Truto integration definition end-to-end from API docs
  (OpenAPI, Postman, Mintlify, GraphQL, or generic doc site) using the agentic
  `truto integrations build` loop, then review, apply, and lint the result. Use
  when the user asks to build, scaffold, or author a new Truto integration,
  mentions `integrations build`, `integrations apply`, `integrations lint`, or
  wants to convert vendor API docs into a Truto IntegrationFile.
---

# Truto Integrations Build

Use this skill when the user wants to **create or refine a Truto integration definition** from vendor API documentation. The `build` command drives an LLM-powered loop that discovers endpoints, generates config, and produces a single JSON artifact (the **IntegrationFile**) that can be linted and applied to the Truto platform.

This skill covers the **build -> lint -> apply** workflow. It does NOT cover:

- The `integration.config` field-by-field schema reference -- see [authoring-integrations.md](../truto/references/authoring-integrations.md) in the `truto` skill.
- General CLI auth, profiles, data-plane commands -- see the [truto-cli](../truto-cli/SKILL.md) skill.
- Per-environment overrides -- see [customizing-integrations.md](../truto/references/customizing-integrations.md).
- JSONata in config expressions -- see the [truto-jsonata](../truto-jsonata/SKILL.md) skill.

Trigger phrases: "integrations build", "build an integration", "scaffold integration", "create integration from docs", "integrations apply", "integrations lint", "lint integration", "IntegrationFile", "convert API docs to Truto".

---

## One-time setup

### 1. Install and authenticate the CLI

**Linux / macOS:**

```bash
curl -fsSL https://cli.truto.one/install.sh | bash
truto login --token <your-api-token>
```

**Windows (PowerShell):**

```powershell
irm https://cli.truto.one/install.ps1 | iex
truto login --token $env:TRUTO_API_TOKEN
```

### 2. Store API keys and config directory in your profile

```bash
truto profiles set-key anthropic                # interactive, masked
truto profiles set-key firecrawl sk-...         # non-interactive
truto profiles set integrationConfigDir /path/to/truto/src/integration/integrationConfig
```

| Key | Purpose | Without it |
|-----|---------|------------|
| `anthropicApiKey` | Powers the agentic build loop (Claude) | Build cannot start |
| `firecrawlApiKey` | Crawls generic doc sites into clean markdown | Falls back to `llms-full.txt` / `.md` trick / Turndown (lower tiers) |
| `integrationConfigDir` | Directory of existing `<slug>.json` configs for pattern matching | `pattern_match` audit findings skip; other audit sources still run |

Each key's resolution order: `--flag` > environment variable (`$ANTHROPIC_API_KEY`, etc.) > active profile (`~/.truto/config.json`) > interactive prompt (Anthropic always; Firecrawl when crawling is needed).

> Hybrid search (BM25 + cosine) is powered by a local ONNX model (`all-MiniLM-L6-v2`) downloaded automatically on first use (~35 MB). No external API key is required.

---

## The workflow

Three commands, in order:

```bash
# 1. Build — generates <slug>.integration.json from API docs
truto integrations build https://api.acme.com/openapi.json acme

# 2. Lint — static audit, no LLM, no writes
truto integrations lint acme.integration.json

# 3. Apply — push config + doc rows to the Truto platform
truto integrations apply acme.integration.json
```

### Build

The `build` command accepts one or more source URLs (OpenAPI spec, Postman collection, Mintlify/Readme docs, GraphQL endpoint, or a generic doc page) and an optional integration slug. It auto-selects the highest-fidelity source (openapi > postman > graphql > docs).

```bash
# Multiple sources — the CLI picks the best one as primary
truto integrations build \
  https://docs.crisp.chat/guides/rest-api/ \
  https://docs.crisp.chat/static/data/collections/rest-api-v1.postman \
  crisp

# Local OpenAPI/Postman file as source
truto integrations build ./vendor-openapi.json acme

# Skip the interactive instructions prompt (useful for scripting)
truto integrations build https://api.acme.com/openapi.json --instructions "all endpoints follow /id patterns"

# Write to a specific output path
truto integrations build https://api.acme.com/openapi.json acme --out ./configs/acme.integration.json
```

#### Build phases

The build runs in three phases. See [references/orchestrator-phases.md](references/orchestrator-phases.md) for full details.

**Phase A -- autonomous build.** The agent reads the source index, inspects the pattern catalog, and builds the entire IntegrationFile autonomously. It emits cascade patches (multi-section updates) that are applied silently. Phase A ends when the agent signals `build_complete` or the turn budget is exhausted.

The agent has access to 15 tools (13 local + 2 server-side):

| Group | Tools |
|-------|-------|
| Corpus (read existing integrations) | `list_integrations`, `find_examples`, `read_integration_summary`, `read_integration_section`, `read_integration_resource`, `read_integration_method` |
| Source (query the discovered API docs) | `read_source_overview`, `read_source_method`, `search_source` |
| In-progress | `read_current` |
| Reference docs | `list_patterns`, `read_pattern` |
| Validation | `validate_integration` |
| Server (Anthropic) | `web_search`, `web_fetch` |

**Phase B -- interactive refinement.** After Phase A, the CLI opens your editor on the working JSON and enters a refinement loop. You type a free-text instruction; the agent proposes patches; you accept, reject, or refine further. Press Enter with no input to finish.

Special commands during Phase B:

| Command | Effect |
|---------|--------|
| `:edit` | Opens the working file in your editor (`$VISUAL` / `$EDITOR` / `--editor` flag) for manual editing |
| *(empty input)* | Exits Phase B and proceeds to the docs phase |

After Phase B, the build runs a **docs phase** that generates per-method documentation rows (descriptions, query schemas, body schemas, response schemas). These ride alongside the config in the output file.

### Lint

Run the static auditor over an IntegrationFile -- no LLM, no writes, no cost.

```bash
# Lint a local file
truto integrations lint acme.integration.json

# Lint a live integration by slug (fetches config from platform)
truto integrations lint acme

# Machine-readable output
truto integrations lint acme.integration.json -o json
truto integrations lint acme.integration.json -o csv
```

Exit codes:

| Code | Meaning |
|------|---------|
| 0 | No blocking findings |
| 1 | Blocking findings present (warn+ by default, error-only with `--ignore-warnings`) |
| 2 | Input error (file unreadable, slug not found, parse failure) |

Key flags:

| Flag | Effect |
|------|--------|
| `--ignore-warnings` | Only exit 1 on `error`-level findings; warnings become non-blocking |
| `--ignore-info` | Suppress `info`-level findings from human-readable output (machine formats always include them) |
| `--integration-config-dir <path>` | Point the `pattern_match` source at a config corpus |

See [references/lint-and-audit.md](references/lint-and-audit.md) for the full audit source breakdown.

### Apply

Push the IntegrationFile to the Truto platform -- config upsert + per-method documentation rows.

```bash
# Dry-run: parse + validate, print what would be applied
truto integrations apply acme.integration.json --dry-run

# Apply (non-interactive, fire-and-go)
truto integrations apply acme.integration.json
```

| Flag | Effect |
|------|--------|
| `--dry-run` | Validate the file and print a summary; no API calls |
| `--slug-override <slug>` | Override the file's `name` on CREATE only (ignored on UPDATE) |
| `--docs-only` | Push only per-method documentation rows (integration must already exist) |

Apply is non-interactive by design -- there is no `--yes` flag because there is no interactive prompt to skip. The operator already decided what to push during `build`. It exits 0 on success, 1 on any failure.

---

## Reading the output file

The produced `<slug>.integration.json` is an **IntegrationFile** with these top-level fields:

| Field | Type | Purpose |
|-------|------|---------|
| `name` | string | Integration slug (e.g. `"acme"`) |
| `id` | string? | Present on UPDATE mode; the platform's integration UUID |
| `label` | string? | Human-readable label (e.g. `"Acme CRM"`) |
| `category` | string? | Integration category (e.g. `"crm"`, `"ticketing"`) |
| `config` | object | The `integration.config` payload -- credentials, authorization, resources, pagination, rate limiting, webhooks, actions |
| `documentation` | array? | Per-method doc rows (description, query_schema, body_schema, response_schema) + integration-wide rows (readme, oauth_*) |
| `audit_notes` | array? | Audit findings carried alongside the config for reference |

See [references/integration-file.md](references/integration-file.md) for the full shape and tips on hand-editing.

---

## Iterating on an existing integration

Pass an existing slug as a positional argument; the build loop pulls the live config, audits it against the source, and offers refinement:

```bash
truto integrations build https://api.acme.com/openapi.json acme
```

When `acme` already exists on the platform, the build resumes from the existing config rather than starting from scratch. Phase A is skipped when resuming from a working file that already has 3+ sections with meaningful content — the CLI goes straight to Phase B for refinement.

### Only missing methods (`--only-missing`)

On an existing integration slug, add API methods that appear in the source but are not yet on the live integration — without changing existing methods, auth, or pagination:

```bash
truto integrations build https://api.acme.com/openapi.json acme --only-missing
```

Incompatible with `--legacy-flow` and `--docs-only`. Phase B refinement is skipped in this mode.

---

## Docs-only mode

Regenerate only per-method documentation rows (descriptions, schemas) without re-running the full build:

```bash
# From a local file
truto integrations build https://api.acme.com/openapi.json --docs-only acme.integration.json

# From a live integration slug
truto integrations build https://api.acme.com/openapi.json --docs-only acme

# Only regenerate specific resources
truto integrations build https://api.acme.com/openapi.json --docs-only acme --resource contacts,deals
```

The source URL is still required (the docs phase uses Orama source snippets to ground the descriptions).

---

## Catalog awareness and audit checks

The static auditor runs several checks that shape the build output:

1. **Pattern match** (catalog-driven) -- reads existing integration configs (via `--integration-config-dir` or profile) and the pattern catalog (`SLUGS.md`) to compare the extracted config's shapes against documented common patterns for pagination, rate limiting, headers, etc. Surfaces `info`-level findings when the shape diverges. The more configs the agent can see, the better the audit. Point `integrationConfigDir` at the full corpus for best results.
2. **Method naming** (standalone) -- detects numbered suffixes (`list_2`, `update_3`) that indicate the agent used a fallback name instead of the canonical Truto method name. Surfaces `warn`-level findings that block `build_complete`.
3. **Path template checks** (standalone, part of `method_naming`) -- flags item-level methods (`get`, `update`, `partial_update`, `delete`) whose last path segment is `{{query.*_id}}` instead of the canonical `{{id}}`.

---

## Troubleshooting and cost control

| Flag | Effect |
|------|--------|
| `--no-firecrawl` | Skip Firecrawl entirely; use only higher-tier sources (`llms-full.txt`, `.md` trick, etc.) |
| ~~`--no-embeddings`~~ | Removed in 0.29.0; embeddings are now local and automatic |
| `--no-llm-cache` | Disable the on-disk Anthropic response cache |
| `--refresh-firecrawl-cache` | Force a fresh Firecrawl crawl (bypasses 24h TTL cache) |
| `--refresh-llm-cache` | Force fresh Anthropic responses (bypasses 7d TTL cache) |
| `--source-tier <tier>` | Pin the extraction tier instead of auto-detecting |
| `--max-pages <n>` | Cap doc pages walked (default 200) |
| `--legacy-flow` | Use the older section-by-section orchestrator (escape hatch) |

Cache locations: `~/.truto/cache/firecrawl/<sha256>.json` (24h TTL), `~/.truto/cache/anthropic/<sha256>.json` (7d TTL).

See [references/troubleshooting.md](references/troubleshooting.md) for source-tier selection, Firecrawl-tier gotchas, and debugging stuck builds.

---

## Key flags reference

| Flag | Default | Description |
|------|---------|-------------|
| `--anthropic-api-key <key>` | Profile / env / prompt | Anthropic API key |
| `--anthropic-model <model>` | Tiered: opus (build), sonnet (extraction), haiku (classification) | Override model for all tasks |
| `--firecrawl-api-key <key>` | Profile / env / prompt | Firecrawl API key |
| ~~`--openai-api-key`~~ | Removed in 0.29.0 | Embeddings are now local (ONNX) |
| `--integration-config-dir <path>` | Profile / env / walk-up | Existing config corpus for pattern matching |
| `--out <file>` | `<slug>.integration.json` | Output file path |
| `--instructions <text>` | Interactive prompt | Skip the instructions prompt |
| `--editor <cmd>` | `$VISUAL` / `$EDITOR` / profile | Editor for `:edit` command |
| `--no-editor` | -- | Don't spawn an editor |
| `--source-tier <tier>` | `auto` | Pin extraction tier |
| `--legacy-discovery` | agentic (default) | Force legacy deterministic discovery instead of the agentic loop |
| `--no-spec-web-search` | -- | Skip web search when hunting for an OpenAPI spec URL |
| `--max-pages <n>` | 200 | Cap on doc pages |
| `--only-missing` | -- | UPDATE mode: add missing methods only; requires existing slug |
| `--companion-docs <url>` | -- | Explicit doc-site root to crawl alongside a spec (repeatable) |
| `--no-companion-docs` | -- | Don't crawl companion doc pages |
| `--docs-only <file-or-slug>` | -- | Skip build loop; regenerate only documentation rows |
| `--resource <names>` | all | Comma-separated resources for `--docs-only` mode |

---

## References

| Reference | Content |
|-----------|---------|
| [Orchestrator Phases](references/orchestrator-phases.md) | Phase A (autonomous build), Phase B (interactive refinement), docs phase, agent tools, patch format |
| [IntegrationFile](references/integration-file.md) | Output JSON shape, field-by-field breakdown, hand-editing tips, relationship to `apply` |
| [Lint and Audit](references/lint-and-audit.md) | All audit sources (method_naming, pattern_match, presence_check, critic, description_quality, method_coverage), severities, exit codes, structured output |
| [Troubleshooting](references/troubleshooting.md) | Source-tier selection, cache invalidation, Firecrawl tiers, stuck builds, `--legacy-flow` |

## Related skills

- **[truto-cli](../truto-cli/SKILL.md)** -- general CLI admin, discovery, data-plane commands
- **[truto](../truto/SKILL.md)** -- application code integration; `authoring-integrations.md` has the full `integration.config` schema reference
- **[truto-jsonata](../truto-jsonata/SKILL.md)** -- JSONata expressions used in config fields (auth headers, pagination, rate-limit detection, webhook handling)
