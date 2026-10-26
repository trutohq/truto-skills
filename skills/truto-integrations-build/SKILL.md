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

This skill covers **build -> optional edit -> apply -> eligible read verification**. Fresh checks and reports are automatic; lint/recheck are optional inspection tools. It does NOT cover:

- The `integration.config` field-by-field schema reference -- see [authoring-integrations.md](../truto/references/authoring-integrations.md) in the `truto` skill.
- General CLI auth, profiles, data-plane commands -- see the [truto-cli](../truto-cli/SKILL.md) skill.
- Per-environment overrides -- see [customizing-integrations.md](../truto/references/customizing-integrations.md).
- JSONata in config expressions -- see the [truto-jsonata](../truto-jsonata/SKILL.md) skill.

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

Build, optionally edit the artifact, then apply:

```bash
# 1. Build — generates <slug>.integration.json from API docs
truto integrations build https://api.acme.com/openapi.json acme

# Optionally edit acme.integration.json
# Apply freshly checks the projected config and doc rows
truto integrations apply acme.integration.json
```

This is the happy path. When the build stops on an open question instead, see [Questions, confidence and the agent loop](#questions-confidence-and-the-agent-loop) below.

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

The agent has access to 16 tools (14 local + 2 web):

| Group | Tools |
|-------|-------|
| Corpus (read existing integrations) | `list_integrations`, `find_examples`, `read_integration_summary`, `read_integration_section`, `read_integration_resource`, `read_integration_method` |
| Source (query the discovered API docs) | `read_source_overview`, `read_source_method`, `search_source` |
| In-progress | `read_current` |
| Reference docs | `list_patterns`, `read_pattern` |
| Validation | `validate_integration` |
| Stop and ask | `ask_question` — stops one or more methods (or shared config, named as `config.<key>`) on something only the docs or the user can settle, after searching once (one web search, up to two page fetches). See [Questions, confidence and the agent loop](#questions-confidence-and-the-agent-loop) below |
| Web | `web_search`, `web_fetch` — Anthropic **server-side** under `--llm-provider anthropic` (default); **client-side via Firecrawl** under `--llm-provider fireworks` (requires `FIRECRAWL_API_KEY`) |

**Phase B -- interactive refinement.** After Phase A, the CLI opens your editor on the working JSON and enters a refinement loop. You type a free-text instruction; the agent proposes patches; you accept, reject, or refine further. Press Enter with no input to finish.

Special commands during Phase B:

| Command | Effect |
|---------|--------|
| `:edit` | Opens the working file in your editor (`$VISUAL` / `$EDITOR` / `--editor` flag) for manual editing |
| *(empty input)* | Exits Phase B and proceeds to the docs phase |

After Phase B, the docs phase generates per-method descriptions and schemas. All finalization precedes checks of the exact saved candidate; a matching report and committed pair are automatic. Semantic corrections share a two-round allowance for the entire authorized run. Partial scope, blocked methods and unrun checks remain explicit.

### Questions, confidence and the agent loop

Every build ends with a short summary -- on stderr in a terminal, and ONCE as a single JSON document on stdout with `-o json` (nothing else prompts: no instructions prompt, no provider/key picker, no editor; Phase B runs only if you scripted it with `--refine` / `--refinements-file` / `--auto-accept-patches`). It names the status, counts, open questions, blocked and low-confidence methods, and the next command:

```json
{
  "status": "waiting",
  "exit": 3,
  "counts": { "methods": 42, "built": 39, "waiting": 2, "blocked": 1, "excluded": 0, "high": 30, "medium": 8, "low": 4 },
  "gaps": ["2 methods wait for an answer (1 open question)"],
  "questions": [{ "id": "q1", "text": "…", "suggestion": "…", "methods": ["invoices.get", "payments.list"] }],
  "blocked": [{ "method": "files.upload", "reason": "audit:file_input — …" }],
  "low_confidence": [{ "method": "invoices.get", "reasons": ["open question q1", "not tested live"] }],
  "out_path": "/abs/acme.integration.json",
  "report_path": "/abs/acme.integration.report.json",
  "next": "truto integrations build --continue acme.integration.json --answer q1=\"…\""
}
```

`status` is `complete`, `incomplete` (smaller gaps only, e.g. a missing doc row -- still exits 0), `waiting` (methods, or the shared config, wait on an answer), `blocked`, or `failed`. Exit codes (`--fail-on` picks what counts as failed; default `blocking`): **0** complete or incomplete with only smaller gaps, **3** finished but something still waits or is blocked, **1** failed. `--fail-on none` never exits 3 (still 1 on a thrown error or an unsaved report); `errors` / `incomplete` widen what counts as failed.

**The loop an agent runs:**

1. `truto integrations build <source> acme -o json`.
2. Read the JSON summary. `complete`/`incomplete` -> go straight to lint. Otherwise there are open `questions` and/or `blocked`/`low_confidence` methods to look at first.
3. Ask the human each open question in chat, in plain words, with its `suggestion`. **Never put a credential (a key, token, password) in an answer** -- it's refused outright, nothing runs, exit 3. Say where the value actually comes from (a credential field, a setup step) instead.
4. `truto integrations build --continue acme.integration.json --answer q1="…" --answer q2="…"` (repeatable; or `--answers <file>`, a JSON object or one `q1=…` per line, `-` for stdin). Only the methods still waiting on the answered questions are rebuilt, as a new run that spends no repair round; every other method stays byte-identical -- if the model touches one anyway, the CLI puts it back, and a method it adds is dropped. If the rebuild turns up a new gap, that's a new question; the one you just answered is never asked again.
5. `truto integrations lint acme.integration.json`.
6. `truto integrations apply acme.integration.json --prepare`. Show the human the plan.
7. On their approval only: `truto integrations apply acme.integration.json --plan acme.integration.json.plan.json --expect-digest <digest>`.

`--continue` takes only the file -- no source URL, slug, `--out`, `--docs-only`, `--only-missing`, `--refine`, `--instructions` or `--spec`. In a real terminal (no `-o json`), the build asks each open question itself at the end instead of exiting -- press Enter to skip one (it stays open). Answers are saved in the report with who gave them and when; a later build or `--continue` of the same file never asks an already-answered question again.

**Confidence** is information only -- it never blocks apply or publishing. Each method in the report (`acme.integration.report.json`, and `acme.integration.report.md` for people) carries a `confidence.level` (`high`/`medium`/`low`) and `confidence.reasons`. A method is `low` with no doc section, an ERROR or stop finding, a failed read test, or an open question. `high` needs its own doc section, a response example, clean lint (no warning either), a spec match or a passed read test, and at most one assumption. The model's own rating can move a method one step toward its own level, except that an ERROR, a stop finding, a failed read test or an open question keeps it `low` whatever the model thinks. Use the summary's `low_confidence` list to point the human's review at those methods and their `assumptions` first -- not as something that has to clear before moving on.

**Follow-ups.** Give `--instructions "<text>"` up front to skip the interactive instructions prompt. Afterwards, there's no feedback command -- either edit `acme.integration.json` by hand and run `truto integrations build --recheck acme.integration.json` (offline: no LLM, no discovery, just refreshed checks and report), or make the model change something with `truto integrations build <source> acme --refine "rename list_2 in contacts to get"` (repeatable; `--refinements-file <path>` for many at once, one per line; `--auto-accept-patches` to skip the accept/skip/chat prompt for a headless run).

Cross-check new or edited methods against [Known Mistakes](references/known-mistakes.md) -- especially anything the summary doesn't flag.

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

```bash
truto integrations apply acme.integration.json
truto integrations apply acme.integration.json --dry-run  # optional offline preview
truto integrations build --recheck acme.integration.json # optional report refresh
```

Apply rechecks edited artifacts, reconciles against committed/live state, preserves concurrent edits and observes every write. Eligible methods can land while skipped/held items remain pending. A method doc-input change can regenerate unedited documentation from its recorded source using configured model access; manual doc edits and rows whose generation fails are retained.

Use `--prepare [--plan-out <path>]` and then `--plan <path> --expect-digest <digest>` when an exact prepared candidate is useful. Resolve a reported clash with `--resolve '<item>=mine|theirs'`; use `--docs-only` for documentation, and deliberate removal flags only for the listed removals. Apply is non-interactive and needs no `--yes`.

Mark/select a test account with `truto profiles set test-account.<integration> <id>` or `--test-account <id>`. Only proven eligible reads run, with Truto-side token/reauth/webhook effects disclosed. Saved, applied, checked and tested remain distinct; missing evidence is not a pass. Exit codes: 0 complete, 2 partial, 3 blocked, 1 auth/unexpected error, 4 executed test failure on an otherwise complete run.

See [the shared artifact workflow](../truto-cli/references/integration-workflow.md) for exact plan, partial/recovery, secret prerequisites, two-round repair, verification and restore behavior.

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

The source URL is still required. Config is preserved exactly, and docs save separately as `<slug>.docs.integration.json` or `<input-stem>.docs.integration.json`; a failed method keeps its existing docs. Apply with `--docs-only`.

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

Fireworks uses a **shared workhorse model** for agent + extraction, plus a separate cheap **classification** model. Naming a workhorse — `--llm-model`, `--llm-agent-model` / `--llm-extraction-model` (the same shared model; not combined with `--llm-model`, and equal if both are given), or a pick at the interactive prompt — pins classification to it too. Override classification with `--llm-classification-model`. Without a model flag and without a TTY, the defaults below apply.

| Tier | Claude default | Fireworks default | Used for |
|------|----------------|-------------------|----------|
| Agent + extraction | Opus + Sonnet | `glm-5p2` (one model for both) | Discovery agent, build loop, docs, schemas |
| Classification | `claude-haiku-4-5` | `deepseek-v4p1-flash` | Page classification, routing |

**Workhorse presets** (pick one for agent + extraction):

| Preset | Fireworks model | Notes |
|--------|-----------------|-------|
| `kimi-k2p7` | `accounts/fireworks/models/kimi-k2p7-code` | Coding specialist, MCP workflows |
| `glm-5p2` | `accounts/fireworks/models/glm-5p2` | 1M context flagship agent (default) |
| `glm-5p3-flash` | `accounts/fireworks/models/glm-5p3-flash` | Smaller GLM model |
| `minimax-m3` | `accounts/fireworks/models/minimax-m3` | K2.7-class agent, 512k context |
| `qwen3p7-plus` | `accounts/fireworks/models/qwen3p7-plus` | Strong structured JSON for docs/schemas |
| `deepseek-v4-pro` | `accounts/fireworks/models/deepseek-v4-pro` | 1M context reasoning |

**Classification presets:** `deepseek-v4p1-flash` (default; `deepseek-v4-flash` is an alias) or `gpt-oss-20b`. Raw `accounts/.../models/...` IDs also work on any tier flag.

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
| `--llm-model <model>` | `glm-5p2` (Fireworks) | Pin one Fireworks model for agent, extraction and classification. Presets: `glm-5p2`, `glm-5p3-flash`, `kimi-k2p7`, `minimax-m3`, `qwen3p7-plus`, `deepseek-v4-pro`, or a raw `accounts/.../models/...` ID |
| `--llm-agent-model <model>` | same as `--llm-model` | Alternative to `--llm-model` (not combined with it); agent and extraction share one model |
| `--llm-extraction-model <model>` | same as `--llm-model` | Alternative to `--llm-model`; must equal `--llm-agent-model` if both are given |
| `--llm-classification-model <model>` | `deepseek-v4p1-flash` (Fireworks) | Fireworks classification-tier model. Presets: `deepseek-v4p1-flash`, `gpt-oss-20b` |
| `--embedding-provider <provider>` | `local` | `local` (MiniLM ONNX, no API key) or `fireworks` (Qwen3, requires `FIREWORKS_API_KEY`) |
| `--embedding-model <model>` | `local-minilm` (local), `qwen3-embedding-8b` (fireworks) | Embedding model preset |
| `--firecrawl-api-key <key>` | Profile / env / prompt | Firecrawl API key (web crawl + Fireworks web tools) |
| `--integration-config-dir <path>` | Profile / env / walk-up | Existing config corpus for pattern matching |
| `--out <file>` | `<slug>.integration.json` | Output file path |
| `--fail-on <level>` | `blocking` | What counts as a failed build (exit 1): `blocking` (new platform-schema error or a thrown error), `errors` (also any new final-audit ERROR), `incomplete` (also an incomplete verdict), `none` (exit 0 once the file is written, never 3) |
| `--recheck <file>` | -- | Offline: revalidate an edited file and refresh its report/`known_skips` without rebuilding (no LLM, no discovery). Exit 0 if clean, 3 if a method waits or is blocked (or the file holds a literal secret), 1 on error |
| `--continue <file>` | -- | Rebuild only the methods waiting on now-answered questions; every other method stays byte-identical. Takes `--answer`/`--answers` (in a terminal, with neither, it asks); takes no source or slug, and refuses flags that change what is built (`--out`, `--docs-only`, `--only-missing`, `--refine`, `--instructions`, `--spec`, …) |
| `--answer <id=text>` | -- | With `--continue`: one question's answer, e.g. `--answer q1="…"`. Repeatable |
| `--answers <file>` | -- | With `--continue`: answers from a file (`-` for stdin) -- a JSON object `{ "q1": "…" }` or one `q1=…` per line |
| `--instructions <text>` | Interactive prompt | Skip the instructions prompt |
| `--refine <text>` | Interactive prompt | Run one Phase B refinement turn non-interactively instead of prompting for it. Repeatable, in order |
| `--refinements-file <path>` | -- | Many `--refine` instructions, one per line (`#` comments and blank lines skipped); runs after any `--refine` flags |
| `--auto-accept-patches` | -- | Accept every Phase B patch without the accept/skip/chat prompt (headless runs) |
| `--editor <cmd>` | `$VISUAL` / `$EDITOR` / profile | Editor for `:edit` command |
| `--no-editor` | -- | Don't spawn an editor |
| `--source-tier <tier>` | `auto` | Pin extraction tier |
| `--legacy-discovery` | agentic (default) | Force legacy deterministic discovery instead of the agentic loop |
| `--allow-partial-coverage` | -- | Turn off agentic discovery's thin-coverage guards for a deliberate partial re-discovery. Without it an UPDATE finding under half the live resources stops, and a thin CREATE falls back to legacy discovery (recorded incomplete) |
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
| [Lint and Audit](references/lint-and-audit.md) | All audit sources (method_naming, pattern_match, presence_check, critic, description_quality, method_coverage, docs_completeness), severities, exit codes, structured output |
| [Known Mistakes](references/known-mistakes.md) | Patterns that have broken real integrations before: what each looks like, how the CLI flags it (or doesn't), and the fix |
| [Troubleshooting](references/troubleshooting.md) | Source-tier selection, cache invalidation, Firecrawl tiers, stuck builds, `--legacy-flow` |

## Related skills

- **[truto-cli](../truto-cli/SKILL.md)** -- general CLI admin, discovery, data-plane commands
- **[truto](../truto/SKILL.md)** -- application code integration; `authoring-integrations.md` has the full `integration.config` schema reference
- **[truto-jsonata](../truto-jsonata/SKILL.md)** -- JSONata expressions used in config fields (auth headers, pagination, rate-limit detection, webhook handling)
