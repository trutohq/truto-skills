# Changelog

All notable changes to the Truto Agent Skills are documented here.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html). Skills are content artifacts (not code), so versioning here tracks **observable changes to the guidance an agent receives** — added skills/references, restructured content, breaking removals, etc.

Dates are `YYYY-MM-DD`.

## [Unreleased]

### Added

- `skills/truto/references/getting-started.md` — Day-1 tutorial that strings the `truto` CLI together with the application code: install → `truto login` → connect a sandbox → write the link-token route → first unified API call → port the same call into your app. Includes Express, Next.js Route Handler, and Hono / Cloudflare Workers variants of the link-token route.
- `skills/truto/references/customizing-integrations.md` — Per-environment integration overrides for the HTTP layer: authorization, pagination, rate-limit detection, and inbound webhook handling. Documents the new `truto environment-integrations override-*` CLI helpers, the JSONata scope variables for each surface, inspect/remove/test workflows, and a direct-HTTP appendix.
- `skills/truto/references/proxy-and-custom-api.md` — New "Authoring Custom-API Handlers" section covering both extension patterns: registered custom methods on a proxy resource (`integration.config.resources.{resource}.{methodName}`) and ad-hoc `/custom/{path}` calls with optional `methodConfig` body overrides. Includes a field reference for `ResourceMethodSchema` and guidance on when to prefer each pattern.
- `skills/truto-link-sdk/SKILL.md` — "Framework Recipes" section with React (`useTrutoLink` hook), Vue 3 composable, and Svelte action wrappers around `@truto/truto-link-sdk`, plus a pointer to the backend link-token route variants in `getting-started.md`.

### Changed

- `skills/truto/references/unified-api-customization.md` — Rewritten so the `truto` CLI is the primary path for every workflow (listing mappings, scoping overrides, creating custom unified models, updating per-account overrides, iterating locally with `truto unified test-mapping`). All `curl` examples moved to a "Direct HTTP API" appendix that maps each CLI command to the underlying request. "Common gotchas" updated for optimistic locking on `unified-models update` (`version` field) and CLI-first workflows.
- `skills/truto/SKILL.md` — Added a top-level **"Install the Truto CLI (recommended)"** section right after "When to Use" so the CLI install is the first actionable step before writing any code, with cross-links to the Truto CLI skill and the Day-1 `getting-started.md` walkthrough. Reorganized the `## References` table into logical groupings (Start here / Customization / Core API surface / Automation & data movement / Operational), promoting `getting-started.md`, `unified-api-customization.md`, and `customizing-integrations.md` to the top. Added a "Day 0 — install the CLI first" preface above the Quick Start, an `integrated_account_id` development tip after Step 4, and a callout in Step 5 pointing to the Next.js / Hono variants of the link-token route in `getting-started.md`. Updated the Proxy & Custom API row to highlight the new authoring section.
- `skills/truto-cli/SKILL.md` — Quick Reference table updated with a new "Unified Model Customization" row (`unified-models`, `unified-model-mappings`, `env-unified-models`, `env-unified-model-mappings`) and inline call-outs for `integrations init/validate`, `environment-integrations override-*`/`show-override`, and `unified test-mapping`. New "Key Gotchas" entries cover the `-mappings` ↔ `-resource-method` aliasing, the deep-patch semantics of `override-*` helpers, and the offline scope of `unified test-mapping`. Reference table descriptions updated.
- `skills/truto-cli/references/admin-commands.md` — Added a top-level "Unified Model Customization" group documenting all four CRUD commands with filters, create/update fields, and links into the `truto` skill's customization reference. Added subcommand docs for `integrations init` (interactive scaffolding with auth-format-aware credential blocks) and `integrations validate` (best-effort client-side schema check). Added subcommand docs for `environment-integrations override-auth/override-pagination/override-rate-limit/override-webhook/show-override` (with `--clear` and `--config` examples). Reordered MCP Tokens into the Platform Resources block at the bottom.
- `skills/truto-cli/references/data-plane.md` — Added a "Iterate on a Mapping Locally" section under Unified API documenting `truto unified test-mapping`: mapping-source flags (`--mapping`, `--mapping-file`, `--model/--resource/--integration`, `--with-overrides`), sample-input flags (`--input`, `--stdin`), worked examples, and limitations (JSONata-string mappings only; `$context`/`$headers` not exposed locally).

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
