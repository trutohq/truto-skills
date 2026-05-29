# Changelog

All notable changes to the Truto Agent Skills are documented here.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html). Skills are content artifacts (not code), so versioning here tracks **observable changes to the guidance an agent receives** — added skills/references, restructured content, breaking removals, etc.

Dates are `YYYY-MM-DD`.

## [Unreleased]

### Added

- `skills/truto-integrations-build/SKILL.md` — New skill for the LLM-first `truto integrations build` workflow. Covers the full build → lint → apply loop: one-time setup (profile keys, `integrationConfigDir`), source-tier selection (OpenAPI / Postman / Mintlify / GraphQL / generic docs), Phase A (autonomous agentic build with 15 tools), Phase B (interactive refinement with `:edit`), the docs phase, `truto integrations lint` (static auditor with exit-code contract), and `truto integrations apply` (non-interactive push with `--dry-run` support). Key flags reference, iterating on existing integrations, docs-only mode, catalog awareness, troubleshooting and cost control knobs.
- `skills/truto-integrations-build/references/orchestrator-phases.md` — Deep-dive into the three build phases: Phase A (autonomous build, agent tools, patch format, `build_complete` requirements), Phase B (interactive refinement loop, `:edit` command), and the docs phase (per-method description / query_schema / body_schema generation, integration-wide readme / oauth_* rows, docs-only mode). Includes the full section order table.
- `skills/truto-integrations-build/references/integration-file.md` — IntegrationFile JSON shape: top-level fields (`name`, `config`, `id`, `label`, `category`, `documentation`, `audit_notes`), documentation row types (per-method `description` / `query_schema` / `body_schema`, integration-wide `readme` / `oauth_*`), audit note shape, how `apply` uses the file (parse → split → upsert → diff docs → summary), and tips for hand-editing.
- `skills/truto-integrations-build/references/lint-and-audit.md` — All six audit sources (`presence_check`, `critic_method_config`, `description_quality`, `method_coverage`, `pattern_match`, `method_naming`) with severity levels, example findings, and recommended actions. Covers the `method_naming` blocker rule (numbered suffixes + Issue 7 path-template check), exit-code contract (0 / 1 / 2), `--ignore-warnings` / `--ignore-info` semantics, structured output formats (`json` / `yaml` / `ndjson` / `csv`), file vs. slug input modes, and the `--integration-config-dir` resolution chain.
- `skills/truto-integrations-build/references/troubleshooting.md` — Source-tier selection guide (12 tiers with fidelity order), cache management (`~/.truto/cache/firecrawl/` 24h TTL, `~/.truto/cache/anthropic/` 7d TTL, `--refresh-*-cache`, `--no-llm-cache`), Firecrawl-tier gotchas (enterprise-only `--firecrawl-ignore-robots-txt`, fallback chain), cost control (`--max-pages`, `--no-firecrawl`, `--no-embeddings`, `--no-companion-docs`), stuck/slow build remediation, `--legacy-flow` escape hatch, and embedding error handling.
- `skills/truto/references/authoring-integrations.md` — End-to-end reference for authoring a brand-new integration definition (the customer-side equivalent of what Truto does for built-ins). Covers the full `integration.config` schema documented through the W1-typed OpenAPI components (`IntegrationConfig`, `IntegrationCredential`, `IntegrationResourceMethod`, `IntegrationPagination`, `IntegrationRateLimit`, `IntegrationWebhookConfig`, `IntegrationAction`, etc.), the recommended `truto integrations init` → `validate` → `create` workflow, all five credential formats (`api_key`, `oauth2`, `oauth2_client_credentials`, `oauth`, `keka_oauth`) plus the `basic` shortcut and BYOA semantics, the three authorization formats, the full per-method `IntegrationResourceMethod` field reference (including custom non-CRUD methods), the six pagination strategies, the inbound webhook receiver (`signature_verification` / `handle_verification` / `payload_transform`), the four reserved lifecycle actions (`post_install`, `validation`, `refresh_token`, `post_connect_user_form`) with a worked `post_install` example, and an end-to-end **Acme CRM** worked example (API-key auth, two resources with one read-only, an HMAC-signed webhook receiver, custom rate-limit detection). Closes the §3.2 audit gap; links into the typed OpenAPI components instead of duplicating the schema.
- `skills/truto/references/getting-started.md` — Day-1 tutorial that strings the `truto` CLI together with the application code: install → `truto login` → connect a sandbox → write the link-token route → first unified API call → port the same call into your app. Includes Express, Next.js Route Handler, and Hono / Cloudflare Workers variants of the link-token route.
- `skills/truto/references/customizing-integrations.md` — Per-environment integration overrides for the HTTP layer: authorization, pagination, rate-limit detection, and inbound webhook handling. Documents the new `truto environment-integrations override-*` CLI helpers, the JSONata scope variables for each surface, inspect/remove/test workflows, and a direct-HTTP appendix.
- `skills/truto/references/proxy-and-custom-api.md` — New "Authoring Custom-API Handlers" section covering both extension patterns: registered custom methods on a proxy resource (`integration.config.resources.{resource}.{methodName}`) and ad-hoc `/custom/{path}` calls with optional `methodConfig` body overrides. Includes a field reference for `ResourceMethodSchema` and guidance on when to prefer each pattern.
- `skills/truto-link-sdk/SKILL.md` — "Framework Recipes" section with React (`useTrutoLink` hook), Vue 3 composable, and Svelte action wrappers around `@truto/truto-link-sdk`, plus a pointer to the backend link-token route variants in `getting-started.md`.

### Changed

- `skills/truto/SKILL.md` — Companion **truto-jsonata** bullet links to `truto jsonata eval` / [Iterate locally](skills/truto/references/unified-api-customization.md#3-iterate-locally).
- `skills/truto-jsonata/SKILL.md` — Authoring tip: use `truto jsonata eval`; related-skill links to Truto + Truto CLI data plane.
- `skills/truto-jsonata/references/usage-in-truto.md` — Tip #8: `truto jsonata eval` vs `unified test-mapping`; prefer CLI over ad-hoc Node in agents.
- `skills/truto-cli/references/querying-data.md` — Local iteration links to both `jsonata eval` and `test-mapping`.
- `skills/truto/references/unified-api-customization.md` — Rewritten so the `truto` CLI is the primary path for every workflow. §3 "Iterate locally" now documents `truto jsonata eval` (any expression + context) vs `unified test-mapping` (`response_mapping` only). All `curl` examples moved to a "Direct HTTP API" appendix. Gotchas updated for local eval limits and optimistic locking on `unified-models update`.
- `skills/truto/SKILL.md` — Added a top-level **"Install the Truto CLI (recommended)"** section right after "When to Use" so the CLI install is the first actionable step before writing any code, with cross-links to the Truto CLI skill and the Day-1 `getting-started.md` walkthrough. Reorganized the `## References` table into logical groupings (Start here / Customization / Core API surface / Automation & data movement / Operational), promoting `getting-started.md`, `authoring-integrations.md`, `customizing-integrations.md`, and `unified-api-customization.md` to the top. Added a "Day 0 — install the CLI first" preface above the Quick Start, an `integrated_account_id` development tip after Step 4, and a callout in Step 5 pointing to the Next.js / Hono variants of the link-token route in `getting-started.md`. Updated the Proxy & Custom API row to highlight the new authoring section.
- `skills/truto-cli/SKILL.md` — Quick Reference **Power Features** includes `jsonata eval`; gotchas for `jsonata eval` vs `unified test-mapping`. Unified Model Customization row, `override-*` helpers, and reference table updates (prior unreleased).
- `skills/truto-cli/references/admin-commands.md` — Added a top-level "Unified Model Customization" group documenting all four CRUD commands with filters, create/update fields, and links into the `truto` skill's customization reference. Added subcommand docs for `integrations init` (interactive scaffolding with auth-format-aware credential blocks) and `integrations validate` (best-effort client-side schema check), each with a pointer to the new `authoring-integrations.md` reference for the full `integration.config` schema. Added subcommand docs for `environment-integrations override-auth/override-pagination/override-rate-limit/override-webhook/show-override` (with `--clear` and `--config` examples). Reordered MCP Tokens into the Platform Resources block at the bottom.
- `skills/truto-cli/references/data-plane.md` — Added `truto jsonata eval` (generic local JSONata) and `truto unified test-mapping` (`response_mapping`) sections with flags, examples, and when to use each.

## [0.3.1] - 2026-04-17

### Changed

- `README.md` — Rewritten to cover multi-agent install paths: Claude Code (`/plugin marketplace add` + `/plugin install`), Cursor (Project Rules → Remote Rule), and any agent via `npx skills add`. Skills table reorganized.

## [0.3.0] - 2026-04-17

### Added

- Claude Code plugin support — `.claude-plugin/marketplace.json` and `.claude-plugin/plugin.json` so the repo can be added as a Claude Code plugin marketplace and installed as the `truto` plugin.
- `skills/truto-api-conventions/SKILL.md` — Skill that mirrors the always-applied `truto-api` cursor rule (base URL, auth, URL patterns, pagination, idempotency, skill routing) so Claude Code agents get the same conventions, since plugins do not have an "always-applied rule" primitive.

### Changed

- `skills/truto/SKILL.md` — Minor cross-reference update to point at the new `truto-api-conventions` skill.

## [0.2.0] - 2026-04-17

### Added

- `skills/truto-jsonata/SKILL.md` — New skill for writing JSONata expressions in Truto config (mappings, sync jobs, workflows) using the custom `$functions` from `@truto/truto-jsonata`.
- `skills/truto-jsonata/references/core-functions.md` — Reference for the core `$functions` exposed by `@truto/truto-jsonata`.
- `skills/truto-jsonata/references/ai-functions.md` — Reference for AI-related `$functions`.
- `skills/truto-jsonata/references/data-formats.md` — Reference for data-format conversion `$functions`.
- `skills/truto-jsonata/references/datetime-functions.md` — Reference for date/time `$functions`.
- `skills/truto-jsonata/references/text-conversions.md` — Reference for text-conversion `$functions`.
- `skills/truto-jsonata/references/usage-in-truto.md` — How JSONata is evaluated inside Truto: the scope variables available in each surface (resource methods, mappings, webhooks, sync jobs, actions), placeholder vs. JSONata syntax, and worked examples.
- `skills/truto/references/unified-api-customization.md` — First-cut reference for customizing unified API mappings (per-team and per-account overrides), with worked examples for response/request transformations.

### Changed

- `skills/truto/references/sync-jobs.md` — Significantly expanded with concrete examples, scope variables, and reorganized sections.
- `skills/truto/SKILL.md` — Updates to cross-reference the new `truto-jsonata` skill and `unified-api-customization.md` reference.
- `README.md` — Added the `truto-jsonata` skill to the skills table.

## [0.1.0] - 2026-04-17

Initial release.

### Added

- `skills/truto/SKILL.md` — Main Truto skill: connecting accounts, writing link-token routes, calling unified APIs, handling webhooks.
- `skills/truto/references/` — Eleven reference docs covering authentication, connection flow, core resources, daemon jobs, datastores, files & logs, integrated-account context, MCP tokens, proxy & custom API, static gates, sync jobs, unified API, webhooks & notifications, and workflows.
- `skills/truto-cli/SKILL.md` — Truto CLI skill: install, authenticate, manage integrations and accounts from the terminal.
- `skills/truto-cli/references/` — Four reference docs: `admin-commands.md`, `common-patterns.md`, `data-plane.md`, `power-features.md`.
- `skills/truto-link-sdk/SKILL.md` — Truto Link SDK skill: embed the connection flow in a frontend using `@truto/truto-link-sdk`.
- `skills/truto-link-sdk/references/rapidform-and-file-pickers.md` — Reference for post-connect forms and native cloud file pickers.
- `rules/truto-api.mdc` — Always-applied Cursor rule with API conventions (base URL, auth header, URL patterns, pagination).
- `.cursor-plugin/plugin.json` — Cursor plugin manifest.
- `LICENSE` — Apache-2.0.
- `README.md`, `assets/logo.png` — Project README and logo.

[Unreleased]: https://github.com/trutohq/truto-skills/compare/v0.3.1...HEAD
[0.3.1]: https://github.com/trutohq/truto-skills/compare/v0.3.0...v0.3.1
[0.3.0]: https://github.com/trutohq/truto-skills/compare/v0.2.0...v0.3.0
[0.2.0]: https://github.com/trutohq/truto-skills/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/trutohq/truto-skills/releases/tag/v0.1.0
