# Orchestrator Phases

The `truto integrations build` command runs in three sequential phases. This reference covers what each phase does, the agent's tools, and the patch format.

---

## Phase A -- autonomous build

The agent builds the IntegrationFile from scratch, working without per-turn user review. It reads the source index (the discovered API docs), inspects the pattern catalog (existing integration configs), and emits **cascade patches** -- multi-section updates applied silently.

The agent runs on **Anthropic Claude** by default (tiered: Opus for the agent loop, Sonnet for extraction/docs, Haiku for classification) or on **Fireworks AI** when `--llm-provider fireworks` is passed (one shared workhorse model for agent + extraction, plus a cheap classification model — see the parent skill's [LLM providers](../SKILL.md#llm-providers) section for presets). Anthropic-only features (adaptive thinking, Anthropic server tools, `cache_control` blocks, container metadata) are disabled automatically for Fireworks model IDs; Fireworks prompt caching is automatic and the CLI sends `x-session-affinity` to improve cache hit rates within a build session.

### How it works

1. The CLI assembles a system prompt with the integration slug, source overview, decision table (rules for auth, pagination, method naming, etc.), and the current state of the working file.
2. The agent iterates: call tools to read sources / inspect existing integrations -> emit a patch fence -> patches get applied -> repeat.
3. Phase A ends when:
   - The agent emits `{ "build_complete": true, "summary": "..." }` -- the happy path.
   - The turn budget is exhausted (the file has partial content; you refine in Phase B).
   - The user cancels.

### Agent tools

| Tool | Group | Description |
|------|-------|-------------|
| `list_integrations` | Corpus | List available integration slugs in the config corpus |
| `find_examples` | Corpus | Search for integrations matching a pattern (e.g. "oauth2 with PKCE") |
| `read_integration_summary` | Corpus | Top-level overview of an existing integration's config |
| `read_integration_section` | Corpus | Read a specific section (pagination, rate_limit, etc.) from an existing integration |
| `read_integration_resource` | Corpus | Read a full resource block (all methods) from an existing integration |
| `read_integration_method` | Corpus | Read a single method block from an existing integration |
| `read_source_overview` | Source | Overview of the discovered API (base URL, auth, resource list) |
| `read_source_method` | Source | Detailed info for one endpoint from the source docs |
| `search_source` | Source | Free-text search across all source pages via Orama (BM25 + optional cosine) |
| `read_current` | In-progress | Read the current state of the working IntegrationFile |
| `list_patterns` | Reference | List entries from the pattern catalog (SLUGS.md) |
| `read_pattern` | Reference | Read a specific pattern entry with exemplar JSON |
| `validate_integration` | Validation | Run the static auditor; returns findings with severities |
| `web_search` | Web | Search vendor docs for quirks (max 10 uses per build). Anthropic server tool under `--llm-provider anthropic`; **Firecrawl client-side** under `--llm-provider fireworks` (requires `FIRECRAWL_API_KEY`) |
| `web_fetch` | Web | Fetch URLs from build instructions (max 20 uses, 32K tokens/page). Same provider split as `web_search` |

### Patch format

Patches are emitted inside fenced code blocks tagged `integration-file-patch`:

````
```integration-file-patch
{ "section": "auth", "patch": { "config": { "credentials": { ... } } } }
```
````

**Cascade patches** update multiple sections in one turn:

````
```integration-file-patch
{ "patches": [
  { "section": "basicDetails", "patch": { "label": "Acme", "category": "crm", "sharing": "ask" } },
  { "section": "baseUrl",      "patch": { "config": { "base_url": "https://api.acme.com/v1" } } },
  { "section": "auth",         "patch": { "config": { "credentials": { ... } } } },
  { "section": "authorization", "patch": { "config": { "authorization": { ... } } } }
], "reason": "Initial foundation: identity + transport + auth." }
```
````

**Skip a section:**

````
```integration-file-patch
{ "section": "webhooks", "skip": true, "reason": "No inbound webhooks documented." }
```
````

**Signal completion:**

````
```integration-file-patch
{ "build_complete": true, "summary": "Built acme integration with 5 resources, OAuth2 auth, cursor pagination." }
```
````

Arrays in patches REPLACE (the runtime treats them as atomic). Omitted keys are left untouched.

### Build-complete requirements

The agent checks these before emitting `build_complete`:

- `name`, `label`, `category`, `sharing` are set.
- `config.base_url` is set; any `{{template}}` variables in it appear in `config.credentials.*.config.fields`.
- `config.credentials` has at least one credential format with at least one field.
- `config.authorization` is set and every `{{variable}}` it references appears in credentials fields.
- `config.headers` is set (at minimum: Accept + Content-Type; User-Agent is conventional).
- At least one resource with at least one method (including `path` and `method`).
- `validate_integration` returns 0 errors.
- All `source: "method_naming"` findings are resolved (numbered suffixes and non-canonical path templates).

---

## Phase B -- interactive refinement

After Phase A, the CLI opens your editor on the working JSON and enters a refinement loop.

### The loop

1. The CLI prompts: `Type an instruction to refine the integration, ":edit" to open the editor, or press Enter with no input to finish.`
2. You type a free-text instruction (e.g. "add rate limiting based on the Retry-After header", "rename list_2 in contacts to get").
3. The agent receives the instruction alongside the current file state, emits a cascade patch.
4. You see the proposed changes and accept or provide further feedback.
5. Repeat until you press Enter with no input.

### Special commands

| Command | Effect |
|---------|--------|
| `:edit` | Opens the working file in your editor for manual editing. The CLI snapshots the file before opening; after you close the editor, you can accept or discard changes. |
| *(empty input)* | Exits Phase B and proceeds to the docs phase. |

### Patch review

For each patch the agent proposes, you choose one of:

| Decision | Effect |
|----------|--------|
| **accept** | Apply the patch to the working file |
| **skip** | Don't apply; continue to the next patch in the cascade |
| **chat** | Type feedback; the agent re-runs with your feedback in context |
| **cancel** (Esc) | Abort the entire refinement turn |

### Learnings

After you **accept** a refinement, the CLI asks: *"Save this as a learning for future builds?"*. If you say yes, it prompts for a tag and rule, then saves to `~/.truto/build-learnings.jsonl`. Matched learnings are injected into Phase A's system prompt on future builds, so the agent avoids repeating the same mistakes.

### Tips

- Use `:edit` for structural changes that are easier to express by hand than by instruction (e.g. reordering fields, deleting a resource block).
- The agent sees the full working file on every turn, so you can make manual edits between instructions and the agent will pick them up.
- If Phase A hit the budget without completing, Phase B starts with partial content. Start with broad instructions ("finish the remaining resources") before fine-tuning.

---

## Docs phase

After Phase B, the build silently generates per-method documentation rows:

- **description** -- one-sentence summary per method
- **query_schema** -- YAML-encoded JSON Schema for query parameters
- **body_schema** -- YAML-encoded JSON Schema for request body
- **response_schema** -- YAML-encoded JSON Schema for the response shape (post `response_path` unwrap, per-record). Consumed by the SuperAI / MCP toolset.

Plus integration-wide documentation rows when applicable:

- **readme** -- integration overview markdown
- **oauth_documentation_link** -- URL to the vendor's OAuth docs
- **oauth_app_requires_verification** -- whether the OAuth app needs vendor verification
- **oauth_note** -- notes about OAuth setup

The docs phase uses the Orama source index to ground descriptions in the actual API documentation. It runs resource-by-resource and writes to a sidecar file alongside the working JSON for crash recovery.

### Docs-only mode

To regenerate only the documentation rows without re-running the full build:

```bash
truto integrations build https://api.acme.com/openapi.json --docs-only acme.integration.json
truto integrations build https://api.acme.com/openapi.json --docs-only acme --resource contacts,deals
```

---

## Section order

The agent works through sections in this exact order during Phase A. Each section maps to a key path in the IntegrationFile:

| Section ID | Config path | Purpose |
|------------|-------------|---------|
| `basicDetails` | `label`, `category`, `sharing` | Integration identity |
| `baseUrl` | `config.base_url` | API base URL (may include `{{template}}` variables) |
| `headers` | `config.headers`, `config.required_headers` | Default and user-supplied request headers |
| `auth` | `config.credentials` | Credential collection forms users fill in (api_key, oauth2, basic, etc.) |
| `authorization` | `config.authorization` | Runtime rule that turns credentials into request headers/query params |
| `globalQuery` | `config.query`, `config.query_array_format` | Default query params on every request |
| `pagination` | `config.pagination` | API-wide default pagination strategy |
| `rateLimit` | `config.rate_limit` | JSONata expressions for retry-after and rate-limit headers |
| `errorExpressions` | `config.error_expression` | JSONata expression for error detection |
| `webhooks` | `config.webhook` | Webhook registration and signature verification |
| `actions` | `config.actions` | Custom multi-step actions (token refresh, validation flows, post_install, etc.) |
| `resources` | `config.resources` | Resource definitions with per-method paths, HTTP methods, query/body schemas. May span multiple patches (`multiPatch: true`). |
| `docs-integration` | `documentation` | Integration-wide doc rows (readme, oauth_documentation_link, oauth_app_requires_verification, oauth_note) |
