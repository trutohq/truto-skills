---
name: truto-unified-mappings
description: >-
  Generate the JSONata mapping rows that connect one Truto integration's proxy
  API to a unified model (crm, ats, hris, …) using the agentic
  `truto unified-mappings build` loop, then validate and apply the result. Use
  when the user asks to build, generate, or author unified mappings; mentions
  `unified-mappings build`, `unified-mappings validate`, `unified-mappings
  apply`, a `.mappings.json` MappingFile, `response_mapping` /
  `request_body_mapping` for a unified model; or wants to map an integration's
  proxy responses into a unified API schema.
whenToUse: Generating unified API mapping rows (JSONata) for an integration via truto unified-mappings build — validate and apply mapping config.
---

# Truto Unified Mappings Build

Use this skill when the user wants to **author unified API mappings** for an
integration — the JSONata that transforms a proxy API's raw responses (and
request bodies) into a Truto **unified model** schema (`crm`, `ats`, `hris`,
`ecommerce`, …). The `build` command drives an LLM-powered loop that routes each
unified resource/method to a proxy endpoint, samples it, generates JSONata,
validates it, and produces a single JSON artifact (the **MappingFile**) that can
be validated and applied to the Truto platform.

This skill covers the **build -> validate -> apply** workflow for unified
mappings. It does NOT cover:

- Building the integration definition itself (proxy resources, auth, pagination) -- see the [truto-integrations-build](../truto-integrations-build/SKILL.md) skill. Build the integration first; it must have proxy resources before you can map them.
- The JSONata language and Truto's custom `$functions` -- see the [truto-jsonata](../truto-jsonata/SKILL.md) skill.
- Hand-editing per-environment unified mapping overrides via the admin CLI (`unified-model-mappings`, `env-unified-model-mappings`) -- see [customizing-integrations.md](../truto/references/customizing-integrations.md) and the [truto-cli](../truto-cli/SKILL.md) skill.
- General CLI auth, profiles, and data-plane commands -- see [truto-cli](../truto-cli/SKILL.md).

Trigger phrases: "unified-mappings build", "build unified mappings", "map this
integration to crm", "generate response_mapping", "MappingFile", "unified
mappings apply", "map proxy responses to the unified model".

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

### 2. Store the API key and corpus directories in your profile

```bash
truto profiles set-key anthropic                 # interactive, masked
truto profiles set-key firecrawl sk-...           # only if you crawl a --source-url docs site
truto profiles set unifiedMappingDir /path/to/truto/src/unified-model/mappings
truto profiles set integrationConfigDir /path/to/truto/src/integration/integrationConfig
```

| Key | Purpose | Without it |
|-----|---------|------------|
| `anthropicApiKey` | Powers the agentic build loop (Claude) | Build cannot start |
| `firecrawlApiKey` | Crawls a `--source-url` docs site into clean markdown | Source crawling falls back to cheaper extraction |
| `unifiedMappingDir` | Corpus of unified mapping exemplars (other integrations' `.mappings`/model files) | Falls back to a bundled subset; fewer exemplars to crib from |
| `integrationConfigDir` | Proxy-config corpus for exemplars | Fewer proxy exemplars |

Each key's resolution order: `--flag` > environment variable (`$ANTHROPIC_API_KEY`, `$TRUTO_UNIFIED_MAPPING_DIR`, …) > active profile (`~/.truto/config.json`) > interactive prompt (Anthropic always).

> **Note:** Hybrid search (BM25 + cosine) is powered by a local ONNX model (`all-MiniLM-L6-v2`, ~35 MB) downloaded automatically on first use. No external API key is required for embeddings.
>
> **LLM provider:** `truto unified-mappings build` currently runs on **Anthropic Claude** only (tiered: Opus for the agentic loop, Sonnet for the `--structured` pipeline). The `--llm-provider fireworks` flag from `truto integrations build` is not yet supported here — use `--anthropic-model` to override all tiers.

---

## The workflow

Three commands, in order:

```bash
# 1. Build — generates <integration>.<model>.mappings.json
#    At least one of --account or --source-url is required
truto unified-mappings build acme crm --account <integrated-account-id>

# 2. Validate — deterministic audit, no LLM, no writes
truto unified-mappings validate acme.crm.mappings.json

# 3. Apply — push mapping rows to the platform (base or env override)
truto unified-mappings apply acme.crm.mappings.json --target base
```

### Build

`build` takes an **integration slug** and a **unified model slug** (run `truto
unified-models list` to find models). For every unified resource + method that a
proxy endpoint can serve (`contacts.list`, `accounts.get`, `deals.create`, …) it
generates the mapping fields and writes them to the MappingFile.

```bash
# Live-grounded (recommended): sample the connected account's real responses
truto unified-mappings build acme crm --account $ACCOUNT

# Doc-grounded: no account, ground response shapes on an API docs URL
truto unified-mappings build acme crm --source-url https://docs.acme.com/openapi.json --yes

# Multiple sources: remote URL + local files + glob
truto unified-mappings build acme crm \
  --source-url https://docs.acme.com/api \
  --source-url ./specs/acme-openapi.json \
  --source-url './notes/*.md' --yes

# Scope to specific resources/methods
truto unified-mappings build acme crm --resources contacts,accounts --methods list,get
```

The default flow is **agentic**: Claude (Opus) orchestrates routing, sampling,
generation, validation, and commit through tools. Pass `--structured` for a
fixed per-cell pipeline — still LLM-generated (Sonnet), only the orchestration
is fixed, not the JSONata output. See
[references/agent-and-tools.md](references/agent-and-tools.md) for the loop, the
full tool list, and the sampling ladder.

**Live sampling is read-only.** `fetch_proxy_sample` only issues a `GET` for
`list`/`get`; it never runs create/update/delete against the connected account.
Write cells (`create`/`update`/`delete`) are built from the proxy's documented
request body, so they do not need a live response sample.

#### Refinement loop

In an interactive terminal the build ends in a **refinement loop**: type a
free-form instruction (for example `engagements.create: strip the trailing Z
from start times`) and the agent rebuilds the affected cell. Type `:show` to
print the full per-cell review in the terminal. Press Enter on an empty line to
finish. The loop is skipped with `--no-refine`, `--yes`, `--only-missing`, or
when output is piped.

### Validate

Audit a MappingFile -- deterministic, no LLM, no writes, no cost:

```bash
truto unified-mappings validate acme.crm.mappings.json
truto unified-mappings validate acme.crm.mappings.json -v   # list advisory warnings in full
```

Validation recompiles every cell's JSONata and re-checks it against the unified
JSON Schema. It exits non-zero on **errors**. Advisory **warnings** (the per-cell
review flags in `build_summary.warnings`) never fail validation — they are
summarized by default, listed in full with `-v`. Pass `--environment-id` to
resolve env schema overrides.

### Apply

Push the reviewed MappingFile to the platform:

```bash
# Preview payloads without writing
truto unified-mappings apply acme.crm.mappings.json --dry-run

# Apply to base rows, or to per-environment override rows
truto unified-mappings apply acme.crm.mappings.json --target base
truto unified-mappings apply acme.crm.mappings.json --target env
```

Apply upserts each cell as a `unified_model_resource_method` row (or an
`environment_unified_model_resource_method` override with `--target env`), using
the create/update/skip action recorded per cell in `db_info`.

| Flag | Effect |
|------|--------|
| `--target <base\|env>` | Write base rows or per-environment overrides |
| `--dry-run` | Validate the file and print payloads; no API calls |
| `--yes` | Skip confirmation prompts |

---

## Reading the output file

The produced `<integration>.<model>.mappings.json` is a **MappingFile**. See
[references/mapping-file.md](references/mapping-file.md) for the full shape; the
essentials:

| Field | Purpose |
|-------|---------|
| `integration_name` / `unified_model_name` | What this file maps, by slug |
| `write_target` | `base` (team-owned) or `env` (per-environment override) |
| `cells[]` | One entry per unified resource/method: a `config` (mapping fields) + `db_info` (apply action) |
| `build_summary` | `status`, `counts`, `built`, `skipped` (with reasons), `unbuilt_routed`, `warnings` |

The `build_summary` is built for human review. `skipped` lists **why** a cell
got no mapping (for example "no proxy endpoint serves this method"); `warnings`
flag cells worth a second look (hardcoded `custom_fields`, create/update
transform drift, single-key guards) grouped by cell and kind. Always skim it
before `apply`.

---

## Iterating on an existing file

If the final MappingFile at `--out` (default `<integration>.<model>.mappings.json`)
already exists, the build **resumes** from it — existing cells are kept and
failed/empty cells are retried. It also carries forward mappings already applied
on the platform (local cells win on conflict). The `.working.json` file is only
used for incremental writes during a run and is removed when the build finishes.
Pass `--fresh` to ignore existing seeds and start from scratch.

### Only missing cells (`--only-missing`)

Build only the cells absent from the existing file — existing cells and skipped
cells are untouched, failures are not retried:

```bash
truto unified-mappings build acme crm --only-missing
```

The refinement loop is skipped in this mode.

---

## Key flags reference

| Flag | Default | Description |
|------|---------|-------------|
| `-a, --account <id>` | -- | Integrated account ID for live (read-only) proxy samples |
| `--source-url <url\|path>` | -- | API docs URL or local file path (repeatable, comma-separated; merged into one source index). Supports glob patterns (e.g. `'./specs/*.json'`). At least one of `--account` or `--source-url` is required. |
| `--yes` | -- | Non-interactive: skip account/docs prompts. Requires `--account` and/or `--source-url`. |
| `--anthropic-api-key <key>` | env / profile / prompt | Override Anthropic API key |
| `--firecrawl-api-key <key>` | env / profile / prompt | Override Firecrawl API key |
| `--no-firecrawl` | -- | Skip Firecrawl; use cheaper extraction only for doc sites |
| `--resources <list>` | all planned | Comma-separated unified resources to build |
| `--methods <list>` | all | Comma-separated methods (`list,get,create,update,delete,…`) |
| `--structured` | agentic | Run a fixed per-cell pipeline instead of the agentic loop (still LLM-generated; only the orchestration is fixed) |
| `--no-web-search` | -- | Disable `web_search` / `web_fetch` tools and the source web-search rung |
| `--fresh` | -- | Ignore an existing working/final file and start from scratch |
| `--only-missing` | -- | Build only absent cells; don't retry failures or modify existing cells |
| `--no-refine` | -- | Skip the interactive post-build refinement loop |
| `--fail-fast` | skip + continue | Stop on the first cell error |
| `--environment-id <id>` | -- | Resolve schema overrides / target env override rows |
| `--target <base\|env>` | `base` | Write-target hint recorded for `apply` |
| `--out <file>` | `<integration>.<model>.mappings.json` | Output path |
| `--unified-mapping-dir <path>` | profile / env / bundled | Unified mapping exemplar corpus |
| `--integration-config-dir <path>` | profile / env | Proxy-config exemplar corpus |
| `--anthropic-model <model>` | Tiered (opus orchestration, sonnet generation) | Override all LLM tiers |
| `--debug-log <path>` / `--no-debug-log` | on, `~/.truto/logs/` | JSONL transcript of the build |
| `--agent` | -- | Deprecated no-op (agentic is the default) |

---

## References

| Reference | Content |
|-----------|---------|
| [Agent loop and tools](references/agent-and-tools.md) | The agentic loop vs `--structured` pipeline, the full tool list (routing, sampling, generation, validation, finalize), the live → DB → source sampling ladder, read-only sampling, web tools, and prompt caching |
| [MappingFile](references/mapping-file.md) | Output JSON shape, the per-cell `config` fields (`response_mapping`, `query_mapping`, `request_body_schema`/`request_body_mapping`, `error_mapping`), `db_info`, the `build_summary` (counts, skipped reasons, warning kinds), and how `apply` consumes it |

## Related skills

- **[truto-integrations-build](../truto-integrations-build/SKILL.md)** -- build the integration definition first (proxy resources, auth, pagination) before mapping it
- **[truto-jsonata](../truto-jsonata/SKILL.md)** -- the JSONata language + Truto's custom `$functions` used in every mapping field
- **[truto-cli](../truto-cli/SKILL.md)** -- general CLI admin, discovery (`capabilities`), data-plane commands, and `unified test-mapping` for iterating on a single `response_mapping` locally
- **[truto](../truto/SKILL.md)** -- application code; `customizing-integrations.md` covers per-environment unified mapping overrides
