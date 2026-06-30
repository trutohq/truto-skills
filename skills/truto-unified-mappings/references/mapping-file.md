# MappingFile

The on-disk artifact `truto unified-mappings build` writes and `apply` consumes
(for example `acme.crm.mappings.json`). It is plain JSON — safe to read,
hand-edit, diff, and commit.

## File → database mapping

Each `cells[]` entry becomes **one row** in either table, depending on
`write_target`:

| `write_target` | Table | Row identity (unique index) |
|----------------|-------|------------------------------|
| `base` | `unified_model_resource_method` | (`unified_model_id`, `resource_name`, `integration_name`, `method_name`) |
| `env` | `environment_unified_model_resource_method` | (`environment_unified_model_id`, `resource_name`, `integration_name`, `method_name`) |

The row's `config` column stores `cell.config` verbatim.

## Top-level shape

```jsonc
{
  "schema_version": 1,
  "integration_name": "acme",
  "unified_model_name": "crm",
  "integration_id": "…",                 // resolved at build time
  "unified_model_id": "…",
  "environment_id": "…",                 // present for env builds
  "write_target": "base",                // "base" | "env"
  "built_at": "2026-06-30T…Z",
  "cells": [ /* MappingCell[] */ ],
  "build_summary": { /* informational */ },
  "refinements": [ /* accepted refinement instructions */ ]
}
```

`apply` reads **only** `cells`. `build_summary` and `refinements` are
informational — editing or deleting them is safe and never changes what gets
pushed.

## MappingCell

One per unified resource/method:

```jsonc
{
  "resource_name": "contacts",
  "method_name": "list",
  "config": { /* the mapping — see below */ },
  "apply_db_action": "create",           // "create" | "update" | "skip"
  "existing_row_id": "…",                // set when a row already exists (→ update)
  "existing_version": 3,
  "sample_provenance": "live",           // live | docs | source | spec | corpus | manual | none
  "proxy_match": { "confidence": "high", "routing_notes": "…", "conditional": null },
  "validation": { "compile_ok": true, "response_mapping_ok": true, "schema_ok": true },
  "sample": { /* raw API sample kept for review / re-validation */ }
}
```

| Field | Meaning |
|-------|---------|
| `resource_name` / `method_name` | The unified cell this row maps (for example `contacts` / `list`) |
| `config` | The mapping itself (the `IntegrationMappingMethod` JSON stored in the DB row) |
| `apply_db_action` | What `apply` does with this cell: `create` (insert), `update` (patch existing), `skip` (no-op) |
| `existing_row_id` / `existing_version` | Populated when the platform already has a row — drives `update` + optimistic locking |
| `sample_provenance` | Where the grounding sample came from (`live` proxy, `docs`, `source` URL, …) |
| `proxy_match` | Routing audit — `confidence` (`high`/`medium`/`low`), `routing_notes`, optional `conditional` guard |
| `validation` | Per-cell check results: `compile_ok`, `response_mapping_ok`, `schema_ok`, `unverified`, `error` |
| `sample` | The raw API sample, retained so `validate` can re-check without a live call |

### The `config` (mapping fields)

`config` is the JSON that lands in the DB row. The fields present depend on the
method:

| Field | Present for | Purpose |
|-------|-------------|---------|
| `resource` / `method` | all | The proxy resource + method this cell routes to |
| `response_mapping` | reads + writes | JSONata transforming the proxy response into the unified schema shape |
| `query_mapping` | `list` / `get` (and writes that take query) | Maps unified filter/pagination params onto proxy query params |
| `request_body_schema` | `create` / `update` | The unified input schema; **required fields are marked** |
| `request_body_mapping` | `create` / `update` | JSONata transforming the unified input into the proxy request body |
| `error_mapping` | when the proxy needs it | Normalizes provider error envelopes |

`response_mapping` (and the others) may be a JSONata string or an operator-style
object mapping. For the expression language and Truto's custom `$functions`, see
the [truto-jsonata](../../truto-jsonata/SKILL.md) skill.

## `build_summary` (the review surface)

Informational, but the single best thing to read before `apply`:

```jsonc
{
  "status": "partial",                   // complete | partial | incomplete
  "status_reason": "2 routed cells had no verifiable sample",
  "outcome": "finalized",                // finalized | stalled_no_progress | budget_exceeded | gave_up | structured | resumed_no_op
  "generated_at": "2026-06-30T…Z",
  "counts": { "planned": 18, "built": 15, "routed_unbuilt": 2, "skipped": 1, "flagged": 3 },
  "built": { "contacts": ["list", "get", "create"], "accounts": ["list", "get"] },
  "unbuilt_routed": [
    { "cell": "deals.update", "proxy": "opportunities.update", "reason": "no verifiable sample", "resolve": "re-run with --account or --source-url" }
  ],
  "skipped": [
    { "cell": "notes.delete", "reason": "no proxy endpoint serves this method" }
  ],
  "warnings": [
    { "cell": "contacts.create", "warnings": [
      { "kind": "custom_fields", "message": "custom fields hardcoded instead of collected dynamically", "resolve": "…" }
    ] }
  ],
  "notes": ["generic /search endpoint fanned out to 3 resources without a discriminator"]
}
```

### `status` vs `outcome`

- **`status`** is the verdict: `complete` (every routed cell built), `partial`
  (finished, but some routed cells had no verifiable sample — recorded in
  `unbuilt_routed`; still a successful run), `incomplete` (cut short before every
  cell was attempted; re-running may build more).
- **`outcome`** is the diagnostic for *how the loop ended*: `finalized`,
  `stalled_no_progress`, `budget_exceeded`, `gave_up`, `structured`,
  `resumed_no_op`.

### `skipped` vs `unbuilt_routed`

- **`skipped`** — acceptable gaps: the router found **no** proxy endpoint serving
  that unified method. Nothing to fix.
- **`unbuilt_routed`** — a proxy endpoint *was* matched but the cell could not be
  built (usually no verifiable sample). Each carries a `reason` and often a
  `resolve` (for example "re-run with `--account`").

### `warnings` and warning kinds

Every per-cell review flag lives here (cells on disk carry none of their own),
grouped by cell. Each warning has a `kind` for triage, a human `message`,
optional `alternatives`, and an optional `resolve`:

| `kind` | Flags |
|--------|-------|
| `routing` | Unsure which proxy serves this unified resource/method |
| `discriminator` | A shared proxy endpoint fanned out without a `when` guard |
| `transport` | Proxy verb / `add_query_to_body` mismatch |
| `method` | Method-shape concern |
| `custom_fields` | Custom fields hardcoded instead of collected dynamically |
| `guard` | Multi-key output guarded by a single key's existence |
| `fallback` | Request/query mapping falls back to `undefined`, not the parent |
| `field_drop` | A field was dropped during schema repair |
| `consistency` | Cross-method drift (same field mapped differently) |
| `id_type` | id coerced to the wrong type (string vs uuid vs number) |
| `completeness` | Sample/route looked thin (empty body, undocumented endpoint) |
| `unverified` | Mapping could not be verified against a real sample |
| `general` | Uncategorized |

`counts.flagged` is the number of **built** cells carrying at least one warning —
they applied fine but deserve a look.

## `refinements`

Append-only history of the post-build refinement loop. Each entry records the
`ts`, the verbatim `instruction` you typed, the `cells_changed`
(`resource.method`), and a one-line `summary`. Informational; `apply` ignores it.

## How `apply` consumes the file

`truto unified-mappings apply <file>` reads `cells` only. For each cell it
performs `apply_db_action`:

- `create` → insert a new row,
- `update` → patch the existing row (`existing_row_id` + `existing_version`),
- `skip` → no-op.

`--target base` writes `unified_model_resource_method` rows; `--target env`
writes `environment_unified_model_resource_method` overrides. `--dry-run` prints
the payloads without writing. Because `build_summary` and `refinements` are
ignored, you can prune or hand-edit cells before applying without breaking
anything.
