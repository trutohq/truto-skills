# Lint and Audit

`truto integrations lint` runs the static auditor over an IntegrationFile. No LLM, no writes, no cost. This reference covers every audit source, their finding types, and how to act on them.

---

## Audit sources

The auditor consolidates six independent signal sources. Each finding carries a `source` field so you can filter by category.

### `presence_check`

Section-level "is this block present?" checks against the extracted config.

- **Severity:** `warn` for missing auth (credentials + authorization both absent), `info` for missing pagination / rate_limit / error_expression
- **Example:** "no `config.credentials` or `config.authorization` block — the runtime cannot authenticate calls without one of these"
- **Action:** Add the missing section. The build agent handles this during Phase A; if you see these after a build, something went wrong.

### `critic_method_config`

Per-method semantic violations from heuristic checks (no LLM involved at audit time). Catches things the runtime would reject or that indicate a misconfiguration.

- **Severity:** `error` for known-broken configs, `warn` for likely issues
- **Example:** "method has `method: POST` but path contains `{{id}}` -- POST endpoints typically don't take an ID in the path."
- **Action:** Fix the method block. Usually a path or HTTP-method mismatch.

### `description_quality`

Per-method quality assessment of each `description` documentation row. Only fires when the IntegrationFile includes `documentation` rows (i.e. file mode, not slug mode which doesn't fetch docs).

- **Severity:** `info` or `warn`
- **Example:** "description is too short (< 10 chars)" or "description repeats the method name verbatim."
- **Action:** Rewrite the description to be more informative. The docs phase generates these; re-run `--docs-only` to regenerate.

### `method_coverage`

Set-diff of methods present in the live integration vs. the extracted file. Only fires when a live integration exists (UPDATE mode; skipped on CREATE).

- **Severity:** `warn` for methods the live integration has but the extracted file dropped (potential regression), `info` for methods the extracted file has but the live doesn't (additions).
- **Action:** For dropped methods -- verify the removal is intentional. For additions -- no action needed; they'll be created on apply.

### `pattern_match`

Catalog-driven loose shape comparison. Compares the extracted config's section-level shapes (pagination, rate_limit, headers, etc.) against documented common patterns from the pattern catalog (`SLUGS.md`).

- **Severity:** `info`
- **Example:** "pagination shape doesn't match any common_pattern in the catalog. Closest: cursor-based with `next_cursor` field."
- **Action:** Review whether the extracted shape is correct for this vendor's API. The finding is informational -- non-standard shapes aren't necessarily wrong.
- **When it skips:** When no `integrationConfigDir` is configured or no exemplars loaded. All other audit sources still run.

### `method_naming`

Naming convention checks for method names and path templates. These are the findings that **block `build_complete`** during the autonomous build phase.

Two categories of checks:

**Numbered suffix detection** -- flags methods like `list_2`, `update_3`, `create_2` that indicate the agent used a fallback name instead of the canonical Truto method name.

| Pattern | Likely fix |
|---------|-----------|
| `list_2` with GET ending in `{{id}}` or `{{...id}}` | Rename to `get` (single-record lookup, not a list) |
| `update_2` with PATCH alongside an existing `update` (PUT) | Rename to `partial_update` |
| `create_2` with POST and a `/search`-like path | Rename to `list` with `"method": "post"` and `"add_query_to_body": true` |
| Generic `<verb>_<n>` | Often indicates two endpoints on different paths were grouped under the same resource; consider splitting into separate resources or using a descriptive method name |

**Path template check (Issue 7)** -- flags item-level methods (`get`, `update`, `partial_update`, `delete`) whose last path segment is a non-canonical ID placeholder like `{{query.attachment_id}}` instead of `{{id}}`.

- **Severity:** `warn`
- **Example:** `method "get" has a non-canonical id placeholder as its last path segment ("{{query.attachment_id}}"). The last segment must be {{id}}.`
- **Action:** Rewrite the path to end in `{{id}}`. Parent/scoping parameters still use `{{query.<name>}}`, but the record's own identifier is always `{{id}}`.

---

## Severity levels

| Level | Meaning | Default exit behavior |
|-------|---------|----------------------|
| `error` | Known-broken; the runtime would reject this | Exit 1 (always) |
| `warn` | Likely issue; should be reviewed | Exit 1 (unless `--ignore-warnings`) |
| `info` | Informational; nothing is broken | Never blocks exit |

---

## Exit codes

| Code | Meaning |
|------|---------|
| 0 | No findings worse than the threshold (info-only, or all warnings ignored) |
| 1 | Blocking findings present |
| 2 | Input error (file unreadable, slug not found, parse failure, directory passed instead of file) |

### `--ignore-warnings`

Lowers the exit-1 bar to `error`-level only. Without this flag, any `warn`-level finding (including `method_naming`) returns exit 1.

### `--ignore-info`

Suppresses `info`-level findings from the human-readable table output. Machine-readable formats (`-o json`, `-o yaml`, `-o ndjson`, `-o csv`) always include every finding regardless of this flag.

---

## Structured output

```bash
# JSON -- full findings + summary envelope
truto integrations lint acme.integration.json -o json

# NDJSON -- same envelope as JSON, one line
truto integrations lint acme.integration.json -o ndjson

# YAML -- same envelope as JSON
truto integrations lint acme.integration.json -o yaml

# CSV -- flat rows with stable column order
truto integrations lint acme.integration.json -o csv
```

JSON/YAML output shape:

```json
{
  "source": "acme.integration.json",
  "mode": "file",
  "findings": [ ... ],
  "summary": {
    "total": 5,
    "error": 0,
    "warn": 3,
    "info": 2
  }
}
```

CSV column order: `severity`, `section`, `source`, `resource`, `method`, `message`.

---

## Input modes

### File mode

```bash
truto integrations lint ./acme.integration.json
```

Fully offline. Loads the file, parses via the IntegrationFile schema, runs all audit sources. If `--integration-config-dir` or the profile's `integrationConfigDir` points at a corpus, `pattern_match` fires; otherwise it silently skips.

### Slug mode

```bash
truto integrations lint acme
```

Fetches the live integration's `config` from the platform, wraps it in a synthetic IntegrationFile, and audits that. Documentation rows are NOT fetched -- `description_quality` produces no findings in slug mode. The headline value is the structural checks (`method_naming`, `presence_check`, `critic_method_config`).

The CLI distinguishes file vs. slug by checking whether the argument resolves to an existing file on disk (via `stat`). Directories are rejected with a clear error.

---

## Integration with the build loop

During Phase A, the agent calls `validate_integration` (which runs the same `auditIntegration` function) to check its work. The `BUILD_DONE_CHECKLIST` in the system prompt requires:

- `validate_integration` returns 0 errors.
- All `source: "method_naming"` findings are resolved.

This means `method_naming` warnings effectively block the autonomous build from completing. The agent must fix numbered suffixes and non-canonical path templates before it can signal `build_complete`.

---

## `--integration-config-dir`

Resolution order (same as `truto integrations build`):

1. `--integration-config-dir <path>` flag
2. `$TRUTO_INTEGRATION_CONFIG_DIR` environment variable
3. Active profile's `integrationConfigDir` (`~/.truto/config.json`)
4. `$TRUTO_REPO_PATH` environment variable (appends `src/integration/integrationConfig`)
5. Walk-up resolution (searches parent directories for a `src/integration/integrationConfig/` directory)
6. Bundled corpus subset (fallback)

When no exemplars resolve, `pattern_match` silently skips. Every other audit source still runs.
