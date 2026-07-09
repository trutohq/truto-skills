---
name: truto-integrations-build
description: >-
  Generate a new Truto integration definition end-to-end from API docs
  (OpenAPI, Postman, Mintlify, GraphQL, or generic doc site) using the agentic
  `truto integrations build` loop, then review, apply, and lint the result. Use
  when the user asks to build, scaffold, or author a new Truto integration,
  mentions `integrations build`, `integrations apply`, `integrations lint`, or
  wants to convert vendor API docs into a Truto IntegrationFile.
whenToUse: Building new integrations from vendor API docs via truto integrations build. Not for debugging live workspace issues.
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
truto profiles set-key anthropic                # interactive, masked (default LLM provider)
truto profiles set-key fireworks                # interactive, masked (optional LLM provider)
truto profiles set-key firecrawl sk-...         # non-interactive (web crawl + Fireworks web tools)
truto profiles set integrationConfigDir /path/to/truto/src/integration/integrationConfig
```

| Key | Purpose | Without it |
|-----|---------|------------|
| `anthropicApiKey` | Powers the agentic build loop when `--llm-provider anthropic` (the default) | Build cannot start under the Anthropic provider |
| `fireworksApiKey` | Powers the agentic build loop when `--llm-provider fireworks`; also used by `--embedding-provider fireworks` | Required only if you pick the Fireworks provider |
| `firecrawlApiKey` | Crawls generic doc sites into clean markdown; also backs `web_search` / `web_fetch` when running on Fireworks | Falls back to `llms-full.txt` / `.md` trick / Turndown (lower tiers); Fireworks builds lose `web_search` / `web_fetch` |
| `integrationConfigDir` | Directory of existing `<slug>.json` configs for pattern matching | `pattern_match` audit findings skip; other audit sources still run |

Each key's resolution order: `--flag` > environment variable (`$ANTHROPIC_API_KEY`, `$FIREWORKS_API_KEY`, `$FIRECRAWL_API_KEY`, etc.) > active profile (`~/.truto/config.json`) > interactive prompt (Anthropic and Fireworks always; Firecrawl when crawling is needed).

> Hybrid search (BM25 + cosine) is powered by a local ONNX model (`all-MiniLM-L6-v2`) downloaded automatically on first use (~35 MB). No external API key is required. To use Fireworks-hosted `qwen3-embedding-8b` embeddings instead, pass `--embedding-provider fireworks` (requires `FIREWORKS_API_KEY`).

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

By default the build runs on **Anthropic Claude** (tiered: Opus for the agent loop, Sonnet for extraction/docs, Haiku for classification). To run on **Fireworks AI** instead, pass `--llm-provider fireworks` and pick a workhorse model with `--llm-model` (see [LLM providers](#llm-providers) below).

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

The agent has access to 15 tools (13 local + 2 web):

| Group | Tools |
|-------|-------|
| Corpus (read existing integrations) | `list_integrations`, `find_examples`, `read_integration_summary`, `read_integration_section`, `read_integration_resource`, `read_integration_method` |
| Source (query the discovered API docs) | `read_source_overview`, `read_source_method`, `search_source` |
| In-progress | `read_current` |
| Reference docs | `list_patterns`, `read_pattern` |
| Validation | `validate_integration` |
| Web | `web_search`, `web_fetch` — Anthropic **server-side** under `--llm-provider anthropic` (default); **client-side via Firecrawl** under `--llm-provider fireworks` (requires `FIRECRAWL_API_KEY`) |

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

## LLM providers

The build loop supports two LLM providers, picked interactively when you omit `--llm-provider` on a TTY (defaults to `anthropic` in CI / non-TTY):

| Provider | Flag | Models | Web tools | Notes |
|----------|------|--------|-----------|-------|
| **Anthropic** (default) | `--llm-provider anthropic` | Tiered Claude (`claude-opus-4-6` agent, `claude-sonnet-4-6` extraction, `claude-haiku-4-5` classification) | Anthropic **server-side** `web_search` / `web_fetch` | Adaptive thinking, `cache_control` blocks, container metadata |
| **Fireworks AI** | `--llm-provider fireworks` | One shared **workhorse** model for agent + extraction, plus a separate cheap **classification** model | **Client-side** `web_search` / `web_fetch` via Firecrawl (requires `FIRECRAWL_API_KEY`) | No adaptive thinking, no Anthropic server tools, no `cache_control`; Fireworks prompt caching is automatic (CLI sends `x-session-affinity`) |

### Picking Fireworks

```bash
# Interactive — the CLI prompts for provider when --llm-provider is omitted on a TTY
truto integrations build https://docs.example.com acme

# Non-interactive — pin Fireworks and a workhorse model
export FIREWORKS_API_KEY=...
truto integrations build https://docs.example.com acme \
  --llm-provider fireworks \
  --llm-model kimi-k2p7
```

### Fireworks model presets

Fireworks uses a **shared workhorse model** for agent + extraction, plus a separate cheap **classification** model. Pin the workhorse with `--llm-model` (or the aliases `--llm-agent-model` / `--llm-extraction-model` — they set the same shared model). Override classification with `--llm-classification-model`.

| Tier | Claude default | Fireworks default | Used for |
|------|----------------|-------------------|----------|
| Agent + extraction | Opus + Sonnet | `kimi-k2p7` (one model for both) | Discovery agent, build loop, docs, schemas |
| Classification | `claude-haiku-4-5` | `deepseek-v4-flash` | Page classification, routing |

**Workhorse presets** (pick one for agent + extraction):

| Preset | Fireworks model | Notes |
|--------|-----------------|-------|
| `kimi-k2p7` | `accounts/fireworks/models/kimi-k2p7-code` | Coding specialist, MCP workflows (default) |
| `glm-5p2` | `accounts/fireworks/models/glm-5p2` | 1M context flagship agent |
| `minimax-m3` | `accounts/fireworks/models/minimax-m3` | K2.7-class agent, 512k context |
| `qwen3p7-plus` | `accounts/fireworks/models/qwen3p7-plus` | Strong structured JSON for docs/schemas |
| `deepseek-v4-pro` | `accounts/fireworks/models/deepseek-v4-pro` | 1M context reasoning |

**Classification presets:** `deepseek-v4-flash` (default) or `gpt-oss-20b`. Raw `accounts/.../models/...` IDs also work on any tier flag.

> **Don't mix `--anthropic-model` with `--llm-provider fireworks`** — the CLI hard-errors. With Fireworks, use `--llm-model` or the tier flags. With Anthropic, use `--anthropic-model`.

### Embedding provider

Hybrid source search (BM25 + cosine) defaults to a **local ONNX** model (`all-MiniLM-L6-v2`, ~35 MB, no API key). To use Fireworks-hosted embeddings instead:

```bash
truto integrations build https://docs.example.com acme \
  --embedding-provider fireworks \
  --embedding-model qwen3-embedding-8b
```

`--embedding-provider fireworks` requires `FIREWORKS_API_KEY`. Supported `--embedding-model` presets: `local-minilm`, `qwen3-embedding-8b` (and aliases `qwen3`, `best`). The default for `--embedding-provider fireworks` is `qwen3-embedding-8b`.

### Web tools and Firecrawl

`web_search` / `web_fetch` are always exposed to the agent, but the backend depends on the LLM provider:

| | Anthropic (default) | Fireworks |
|---|---------------------|-----------|
| `web_search` / `web_fetch` | Anthropic server tools | Firecrawl-backed **client-side** tools |
| Required keys | `ANTHROPIC_API_KEY` | `FIREWORKS_API_KEY` **and** `FIRECRAWL_API_KEY` |
| Per-run budgets (build / discovery) | 10 search / 20 fetch | 10 search / 20 fetch |
| OpenAPI spec hunt (`find_openapi_spec`) | 5 search / 5 fetch per invocation | 5 search / 5 fetch per invocation |

Without a Firecrawl key, **Fireworks builds still run** but cannot use `web_search` or `web_fetch`. Doc crawling via `map_doc_site` / `scrape_pages` also requires Firecrawl. Use `--no-firecrawl` only when you accept a docs-only path without live web tools.

### LLM response cache

The on-disk LLM cache (`~/.truto/cache/anthropic/<sha256>.json`, 7-day TTL) is keyed by model + system prompt + inputs and applies to **both** providers (Fireworks calls go through the same Anthropic-compatible adapter, so the cache path is shared despite the name). `--no-llm-cache` / `--refresh-llm-cache` work for both providers; switching models or providers invalidates automatically.

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
| `--no-firecrawl` | Skip Firecrawl entirely; use only higher-tier sources (`llms-full.txt`, `.md` trick, etc.). Also disables `web_search` / `web_fetch` under `--llm-provider fireworks` |
| `--no-embeddings` | Skip embedding the source index for this build (BM25-only search). Cached embeddings still survive for future runs |
| `--no-llm-cache` | Disable the on-disk LLM response cache (works for both Anthropic and Fireworks) |
| `--refresh-firecrawl-cache` | Force a fresh Firecrawl crawl (bypasses 24h TTL cache) |
| `--refresh-llm-cache` | Force fresh LLM responses (bypasses 7d TTL cache; still writes new responses back) |
| `--source-tier <tier>` | Pin the extraction tier instead of auto-detecting |
| `--max-pages <n>` | Cap doc pages walked (default 200) |
| `--legacy-flow` | Use the older section-by-section orchestrator (escape hatch) |
| `--embedding-provider <provider>` | `local` (default, MiniLM ONNX) or `fireworks` (Qwen3, requires `FIREWORKS_API_KEY`) |
| `--embedding-model <model>` | Embedding model preset (e.g. `local-minilm`, `qwen3-embedding-8b`) |

Cache locations: `~/.truto/cache/firecrawl/<sha256>.json` (24h TTL), `~/.truto/cache/anthropic/<sha256>.json` (7d TTL — shared by both LLM providers).

See [references/troubleshooting.md](references/troubleshooting.md) for source-tier selection, Firecrawl-tier gotchas, and debugging stuck builds.

---

## Key flags reference

| Flag | Default | Description |
|------|---------|-------------|
| `--llm-provider <provider>` | `anthropic` (CI / non-TTY) | `anthropic` (Claude) or `fireworks` (Fireworks AI). Prompts interactively when omitted on a TTY |
| `--anthropic-api-key <key>` | Profile / env / prompt | Anthropic API key (default provider) |
| `--anthropic-model <model>` | Tiered: `claude-opus-4-6` (agent), `claude-sonnet-4-6` (extraction), `claude-haiku-4-5` (classification) | Override Claude model for all tasks (Anthropic provider only) |
| `--fireworks-api-key <key>` | Profile / env / prompt | Fireworks API key (required for `--llm-provider fireworks`) |
| `--llm-model <model>` | `kimi-k2p7` (Fireworks) | Pin Fireworks agent + extraction to one model. Presets: `kimi-k2p7`, `glm-5p2`, `minimax-m3`, `qwen3p7-plus`, `deepseek-v4-pro`, or a raw `accounts/.../models/...` ID |
| `--llm-agent-model <model>` | same as `--llm-model` | Alias for `--llm-model` (agent and extraction share one model) |
| `--llm-extraction-model <model>` | same as `--llm-model` | Alias for `--llm-model` |
| `--llm-classification-model <model>` | `deepseek-v4-flash` (Fireworks) | Fireworks classification-tier model. Presets: `deepseek-v4-flash`, `gpt-oss-20b` |
| `--embedding-provider <provider>` | `local` | `local` (MiniLM ONNX, no API key) or `fireworks` (Qwen3, requires `FIREWORKS_API_KEY`) |
| `--embedding-model <model>` | `local-minilm` (local), `qwen3-embedding-8b` (fireworks) | Embedding model preset |
| `--firecrawl-api-key <key>` | Profile / env / prompt | Firecrawl API key (web crawl + Fireworks web tools) |
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
| `--no-firecrawl` | -- | Skip Firecrawl entirely; disables Fireworks `web_search` / `web_fetch` |
| `--no-embeddings` | -- | Skip embedding the source index (BM25-only search) |
| `--no-llm-cache` | -- | Disable the on-disk LLM response cache (both providers) |
| `--refresh-llm-cache` | -- | Bypass the LLM cache (still writes new responses back) |
| `--refresh-firecrawl-cache` | -- | Bypass the Firecrawl 24h cache |
| `--legacy-flow` | -- | Use the older section-by-section orchestrator (escape hatch) |

> **Don't propose deprecated flags.** `--resources`, `--dry-run`, `-y`/`--yes`, `--include-low-confidence`, `--plan-out`, `--report-out`, `-c`/`--category`, `-l`/`--label`, `--base-url`, `--no-bootstrap`, `--no-basic-details`, `--no-query-schema`, `--no-body-schema`, `--descriptions-only`, `--rewrite-bad-descriptions`, `--no-llm-canonicalize`, `--no-llm-regroup`, `--no-llm-split-buckets`, `--strict`, `--no-validate`, and `--keep-inline-docs` all hard-fail (exit `2`) before any LLM key resolution or crawling runs. Use the runtime error's suggested replacement.

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
