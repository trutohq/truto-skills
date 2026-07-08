# Troubleshooting

Common issues, cost control knobs, and debugging tips for `truto integrations build`.

---

## Source-tier selection

The CLI auto-detects the best extraction tier from the source URL. You can override with `--source-tier <tier>`.

### Available tiers

| Tier | Input | Description |
|------|-------|-------------|
| `auto` | any URL | Auto-detect (default). Tries OpenAPI, Postman, GraphQL, then falls back to doc scraping. |
| `openapi-only` | OpenAPI spec URL | Parse the OpenAPI spec directly; no doc-site crawl |
| `openapi-viewer` | Swagger UI / Redoc URL | Extract the spec from an embedded viewer page |
| `postman` | Postman collection URL | Parse a Postman v2.1 collection |
| `llms-full` | any URL | Look for `llms-full.txt` at the doc-site root (an emerging convention for LLM-friendly docs) |
| `llms-index` | any URL | Look for `llms.txt` index file |
| `mdtrick` | any URL | Try the `.md` suffix trick (append `.md` to doc page URLs to get markdown) |
| `md-sibling` | any URL | Look for a sibling `.md` file next to each HTML page |
| `firecrawl` | any URL | Use Firecrawl to crawl and convert to markdown |
| `graphql-introspection` | GraphQL endpoint | Run an introspection query |
| `graphql-sdl` | SDL file URL | Parse a GraphQL SDL file |
| `graphql-doc` | GraphQL doc page | Extract schema from a GraphQL documentation page |

### When to override

- **`--source-tier openapi-only`** -- when you have a clean OpenAPI spec and don't want companion doc crawling (saves time + Firecrawl credits).
- **`--source-tier firecrawl`** -- when auto-detect chose a weaker tier (e.g. the site doesn't have an OpenAPI spec but Firecrawl can crawl it).
- **`--source-tier graphql-introspection`** -- when the endpoint supports introspection but auto-detect didn't recognize it as GraphQL.
- **`--source-tier llms-full`** -- when the doc site publishes `llms-full.txt` (Mintlify, Readme, and some custom sites do).

### Fidelity order

When `auto` is active, the CLI tries tiers in this order and uses the first that succeeds:

1. **OpenAPI** (highest fidelity -- structured endpoint definitions)
2. **Postman** (structured but less standardized)
3. **GraphQL** (introspection > SDL > doc page)
4. **Doc scraping** (llms-full > llms-index > mdtrick > md-sibling > firecrawl)

---

## Cache management

The CLI caches two categories of expensive operations:

### Firecrawl cache

- **Location:** `~/.truto/cache/firecrawl/<sha256>.json`
- **TTL:** 24 hours
- **What's cached:** The crawled + converted markdown for each source URL
- **Clear:** `--refresh-firecrawl-cache` forces a fresh crawl

### LLM response cache

- **Location:** `~/.truto/cache/anthropic/<sha256>.json`
- **TTL:** 7 days
- **What's cached:** LLM responses keyed by (provider + model + system prompt + messages hash). Despite the `anthropic/` directory name, the cache is shared by both providers — Fireworks calls go through the same Anthropic-compatible adapter, so the on-disk path is the same. Switching models or providers invalidates automatically.
- **Clear:** `--refresh-llm-cache` forces fresh responses (still writes new ones back)
- **Disable entirely:** `--no-llm-cache` (no reads, no writes; works for both Anthropic and Fireworks)

### When to clear caches

- **After the vendor updates their docs** -- the Firecrawl cache will serve stale markdown. Use `--refresh-firecrawl-cache`.
- **After updating the system prompt or agent tools** -- cached Anthropic responses were generated with the old prompt. Use `--refresh-llm-cache`.
- **For reproducibility testing** -- use `--no-llm-cache` to ensure every response is fresh.

---

## Firecrawl tiers and gotchas

### Enterprise-only features

`--firecrawl-ignore-robots-txt` passes `ignoreRobotsTxt: true` to Firecrawl. This requires an **enterprise-tier** Firecrawl plan. Non-enterprise plans will get HTTP 400. Verify the target site's terms of service permit crawling before using this flag.

### Auto-tier cascade

Firecrawl is the **last resort** (Tier 5) in the auto-detect cascade. Before reaching Firecrawl, the CLI tries:

1. `llms-full.txt` at the doc-site root (Tier 2)
2. `llms.txt` as a page index (Tier 3)
3. The `.md` suffix trick / Mintlify / Readme detection (Tier 4)

Only when all of those fail does it fall back to Firecrawl + Turndown (Tier 5). Within Tier 5, Firecrawl crawls the site and Turndown converts individual HTML pages that Firecrawl can't process.

You can skip Firecrawl entirely with `--no-firecrawl` -- the CLI will stop at Tier 4 and return whatever it found.

### Cost control

Firecrawl charges per page crawled. Use `--max-pages <n>` (default 200) to cap the number of pages walked. For large doc sites, consider:

```bash
# Cap at 50 pages for a quick initial build
truto integrations build https://docs.acme.com --max-pages 50 acme

# Use an OpenAPI spec instead of crawling docs
truto integrations build https://api.acme.com/openapi.json acme --source-tier openapi-only
```

---

## Companion docs

By default, when building from an OpenAPI spec or GraphQL schema, the CLI also crawls companion doc pages (human-readable documentation that supplements the spec). This adds context for description generation but costs extra Firecrawl credits and time.

```bash
# Skip companion docs (faster, cheaper)
truto integrations build https://api.acme.com/openapi.json acme --no-companion-docs

# Explicit companion doc root (when auto-detection picks the wrong site)
truto integrations build https://api.acme.com/openapi.json acme --companion-docs https://docs.acme.com
```

---

## Stuck or slow builds

### Phase A takes too many turns

The autonomous build has a turn budget. If the agent keeps iterating without reaching `build_complete`:

1. **Check the working file** -- it may be nearly complete but failing validation. Run `truto integrations lint <working-file>` to see what's blocking.
2. **Reduce scope** -- if the vendor has hundreds of endpoints, the agent may struggle. Use `--max-pages` to limit discovery scope.
3. **Provide instructions** -- use `--instructions "focus on contacts, deals, and activities only"` to guide the agent.

### Phase B refinement not working

If the agent doesn't respond well to refinement instructions:

1. **Use `:edit`** -- open the file directly and make the change by hand. The agent will pick up the new state on the next instruction.
2. **Be specific** -- instead of "fix the pagination", say "change pagination to use cursor-based with the `next_cursor` field from the response body".

### Docs phase is slow

The docs phase generates descriptions and schemas per-method, which can be slow for large integrations. The `--resource` flag with `--docs-only` lets you regenerate only specific resources:

```bash
truto integrations build https://api.acme.com/openapi.json --docs-only acme --resource contacts
```

---

## The legacy flow

`--legacy-flow` uses the older section-by-section orchestrator instead of the new agentic loop. It walks through all 13 sections interactively (basicDetails, baseUrl, headers, auth, authorization, ..., resources, docs-integration), presenting each for accept/skip/refine.

Use `--legacy-flow` as an escape hatch when:

- The agentic flow (Phase A) consistently fails for a specific source
- You want fine-grained per-section control (the legacy flow lets you skip individual sections)
- You're debugging the orchestrator itself

The legacy flow will be removed once the agentic flow is fully validated.

---

## Embedding errors

Hybrid source search defaults to a **local ONNX** model (`all-MiniLM-L6-v2`, ~35 MB, no API key). If you see `[embeddings]` errors under the default `--embedding-provider local`:

- The build falls back to BM25-only search automatically. Results are slightly less accurate but the build still works.
- `tokenizer load failed` or `ONNX session creation failed`: delete `~/.truto/models/` and `~/.truto/ort/` and re-run to trigger a fresh download.
- `Checksum mismatch`: a corrupted download. Delete the cache dirs above and retry.
- `embedding generation failed`: typically a transient WASM error. The build continues with BM25-only; retry for hybrid search.

To use **Fireworks-hosted embeddings** instead (requires `FIREWORKS_API_KEY`):

```bash
truto integrations build https://docs.example.com acme \
  --embedding-provider fireworks \
  --embedding-model qwen3-embedding-8b
```

`--embedding-provider fireworks` uses `accounts/fireworks/models/qwen3-embedding-8b` by default. If you see 401 / authentication errors, verify `FIREWORKS_API_KEY` is set (the same key powers `--llm-provider fireworks`). The CLI batches embedding calls adaptively; transient capacity errors on the AI Gateway are retried with backoff.

---

## Fireworks provider

### Authentication failures

`Fireworks AI authentication failed (401)` — the API key is missing or invalid. Fix with:

```bash
truto profiles set-key fireworks       # interactive, masked
# or
export FIREWORKS_API_KEY=...
```

Create a key at <https://app.fireworks.ai/settings/users/api-keys>.

### Missing web tools

If a Fireworks build skips `web_search` / `web_fetch` or the OpenAPI spec hunt, you're missing a Firecrawl key. Under `--llm-provider fireworks`, those tools run **client-side via Firecrawl** and require `FIRECRAWL_API_KEY` in addition to `FIREWORKS_API_KEY`. Without it, the build still runs but cannot hunt for specs online or fetch live doc pages. Pass `--no-firecrawl` to silence the warning when you intentionally accept a docs-only path.

### Capacity-exceeded errors

Fireworks (and the AI Gateway in front of it) can return capacity-exceeded errors under load. The CLI recognizes these and retries with adaptive backoff; in unattended / non-TTY runs it skips the interactive retry prompt and continues with whatever was already built. If you see persistent capacity errors, switch workhorse model (`--llm-model glm-5p2` or `--llm-model minimax-m3`) or fall back to `--llm-provider anthropic`.

### Mixing `--anthropic-model` with Fireworks

The CLI hard-errors if you pass `--anthropic-model` together with `--llm-provider fireworks` (or `--llm-model` together with `--llm-provider anthropic`). Use `--llm-model` (or `--llm-agent-model` / `--llm-extraction-model` / `--llm-classification-model`) for Fireworks, and `--anthropic-model` for Anthropic.
