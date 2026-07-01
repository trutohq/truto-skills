# Agent loop and tools

How `truto unified-mappings build` produces a MappingFile: the default agentic
loop, the `--structured` fallback pipeline, the tools the agent calls, the
sampling ladder, and cost/caching behavior.

## Two build modes

### Default: agentic loop

Claude (Opus tier) orchestrates the whole build through tools. A single
conversation drives:

1. **Plan** — read the integration config (`config.resources`), the unified
   model schema, existing mapping rows, and the corpus; enumerate the unified
   resource × method cells that a proxy endpoint can serve.
2. **Route** — for each cell, pick the proxy resource/method (including
   cross-name routes like unified `accounts` → proxy `companies`, multi-resource
   routes, and conditional/when-guarded routes) and record it.
3. **Sample** — fetch the richest available response shape (see the sampling
   ladder below).
4. **Generate** — produce the JSONata for each field, then validate it (compile
   + eval against the sample + JSON Schema check).
5. **Commit** the cell to the working file.
6. **Finalize** — call `finalize_mappings` to write the build summary and end.

If the agent produces zero cells, the build falls back to the structured
pipeline automatically.

### `--structured`: fixed per-cell pipeline

Skips the orchestration model and runs a fixed pipeline (Sonnet tier) for each
planned cell. The JSONata is still LLM-generated (steps 1 and 3 below); only the
control flow, sampling order, and the finalize/validate steps are deterministic:

1. `matchProxyToUnified` — proxy resource/method routing.
2. Sample — live proxy and/or docs; pick whichever has richer field coverage
   (an empty live list falls back to docs).
3. `generateMappingField` — `response_mapping`, plus `query_mapping`,
   `request_body_mapping`, and `error_mapping` when the proxy method needs them.
4. `finalizeMappingConfig` — deterministic fixes: `get`→`list` alias, proxy
   array paths, list wrapper/suffix handling.
5. `validateGeneratedMapping` — JSONata compile on every field; eval + schema
   check when a sample exists; cross-integration leak detection.

Use `--structured` for cheaper, more predictable runs, or to debug a single
cell. The agentic loop generally produces richer cross-resource routing.

## Agent tools

The agentic loop has these tools (local tools + 2 Anthropic server tools):

| Group | Tools |
|-------|-------|
| Corpus (read exemplars + schema) | `list_mapping_integrations`, `find_mapping_examples`, `read_mapping_cell`, `read_unified_resource_schema` |
| Proxy + routing | `list_proxy_resources`, `route_unified_resource`, `match_proxy_to_unified`, `read_proxy_method_config`, `record_proxy_match` |
| Sampling | `fetch_proxy_sample` (live, **read-only GET**), `read_doc_response_example`, `search_source_docs`, `scrape_doc_page` |
| Generation | `propose_mapping_field`, `build_mapping_cell` (full per-cell pipeline) |
| Validation | `eval_jsonata`, `validate_mapping_output`, `audit_unified_mappings` |
| Existing state | `read_existing_mapping_row` |
| Finish | `finalize_mappings` (writes the build summary and ends the loop) |
| Server (Anthropic) | `web_search`, `web_fetch` |

## Sampling ladder

Per cell, generation is grounded on the richest sample available, in order:

1. **Live proxy** (`fetch_proxy_sample`) — only when `--account` is set. Issues a
   single `GET` for `list` or `get`.
2. **DB documentation** examples (`read_doc_response_example`) — response
   examples stored on the platform's doc rows.
3. **Source index** (`search_source_docs`) — the `--source-url` you passed,
   extracted and indexed (OpenAPI, `llms-full.txt`, crawl). Hybrid BM25+cosine
   when an OpenAI key is set; BM25-only otherwise.
4. **Single-page scrape** (`scrape_doc_page`) — last resort, needs Firecrawl.

Write cells (`create`/`update`/`delete`) do not need a response sample — they are
built from the proxy method's documented request body and validated structurally.

### Read-only sampling (security)

Live sampling is strictly **read-only**. Both the `fetch_proxy_sample` tool and
the internal sampler only ever issue a `GET` for `list`/`get`; any other method
(create/update/delete or a custom write) is refused before a request is built.
The trusted `integrated_account_id` is always applied last, so a model-supplied
query cannot redirect a sample to a different connected account. This holds even
under prompt injection from fetched docs or search content.

## Web tools

By default the agent may call the Anthropic server tools `web_search` /
`web_fetch` to ground a low-confidence route or an undocumented field against the
provider's official docs. Usage is capped by `max_uses`. Pass `--no-web-search`
to disable both tools **and** the source-index web-search rung — no outbound web
calls beyond the proxy and Truto APIs. Use it for sensitive builds.

## Cost and caching

The agentic loop reuses a large, stable prefix (system prompt + tool definitions
+ the growing conversation), so the build uses Anthropic **prompt caching**:

- The system prompt and tool definitions are cached.
- The conversation prefix is cached with a rolling breakpoint, so each turn's
  prior history is re-read at ~10% cost instead of full price.

Per-turn token usage (including cache reads vs. cache creations) is recorded in
the JSONL debug log as `agent.usage` events — a healthy loop shows large
`cacheReadTokens` and small `cacheCreationTokens`. To reduce cost further: use
`--structured` (cheaper Sonnet pipeline), `--no-web-search`, or scope the build
with `--resources` / `--methods` / `--only-missing`.

## Debug log

A JSONL transcript is written to `~/.truto/logs/mapping-build-<integration>-<model>-<id>.jsonl`
by default (disable with `--no-debug-log`, relocate with `--debug-log <path>`).
It records routing decisions, samples, generated fields, validation results, and
the per-turn token usage — the first place to look when a cell is skipped or a
mapping looks wrong.
