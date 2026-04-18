# truto-skills audit — LLM agent fitness

Date: 2026-04-17 (last updated: 2026-04-18 — W1 landed)
Auditor: Cursor Agent
Scope: [`truto-skills`](.) repo, [`truto/cli`](https://github.com/trutohq/truto) CLI source, and the public Truto platform API surface that customers touch through the CLI / skills.

## 0. Status snapshot (read me first)

Since the original audit landed:

- ✅ **All `truto` CLI work shipped** — C1–C7 are merged into `truto/cli/src/commands` (env-unified-models, env-unified-model-mappings, unified-model-mappings, integrations init/validate, env-integrations override-* helpers, unified test-mapping).
- ✅ **All un-blocked `truto-skills` work shipped** — S2–S8 + the `truto-cli` skill update are merged on `docs/truto-jsonata-and-unified-api-customization` (PR [trutohq/truto-skills#3](https://github.com/trutohq/truto-skills/pull/3)).
- ✅ **W1 (OpenAPI audit) shipped (2026-04-18)** — every `additionalProperties: true` blob on the `IntegrationConfig`, `EnvironmentIntegrationConfig`, `EnvironmentUnifiedModel.override`, datastore, sync-job, and unified-model resource surfaces is now typed; `GET /unified/{model}/{resource}/{integration}/meta/{method}` is documented; `openapi.yml` validates clean under `swagger-cli` and `redocly lint` (0 errors). Closes P1, P3 (literal), P4.
- ⏳ **S1** (`authoring-integrations.md`) is now unblocked by W1 — pick it up next.
- ⏳ **Platform tasks W2 + W3** are still open. W2 (~½ day) extends the meta endpoint to return merged JSONata; W3 (~1 week) builds the dry-run endpoint. Both are scoped in [§5.3](#53-truto-platform-api-restructured-as-workstreams).

**Open workstreams an agent should pick up (in priority order):**

| # | Workstream | Effort | Closes | Unblocks | Status |
|---|---|---|---|---|---|
| **W1** | Deep audit + fix `truto/openapi.yml` so it documents the typed shapes that already exist in the superstruct schemas | ~2–3 days | P1, P3 (literal ask), P4 | S1, future SDK generation, ~300 lines of hand-rolled CLI validation | ✅ DONE (2026-04-18) — concrete changes 1–5 in [§5.3 W1](#w1--audit-and-complete-trutoopenapyml) all landed; `openapi.yml` passes `swagger-cli` and `redocly lint` (0 errors; 183 pre-existing warnings, all unrelated to this audit) |
| **W2** | Extend the `GET /unified/{model}/{resource}/{integration}/meta/{method}` response to include the merged `response_mapping` / `query_mapping` / `request_body_mapping` JSONata | ~½ day | P3 (richer ask) | Better `truto unified test-mapping` workflow | ⏳ TODO |
| **W3** | Build `POST /environment-unified-model-resource-method/_dryrun` that runs the executor against a synthetic mapping + sample response | ~1 week | P2 | Object-form mapping iteration in `truto unified test-mapping`; safe mapping iteration without prod writes | ⏳ TODO |
| **S1** | New reference `skills/truto/references/authoring-integrations.md` | ~½ day | §3.2 | — (run after W1) | ⏳ TODO — now unblocked by W1 |

With W1 landed (2026-04-18), P1, P3 (literal), and P4 are closed and the CLI can begin shedding ~300 lines of hand-rolled validation in [`truto/cli/src/commands/integration.ts:200–318, 735–807`](https://github.com/trutohq/truto/blob/main/cli/src/commands/integration.ts#L200) in favor of consuming the spec. Next-up priority is **S1** (the doc that depended on W1), then **W2** (small follow-up that finishes P3), and finally **W3** (the larger dry-run endpoint).

## 1. Executive summary

The repo is in a strong place for **using** Truto from a customer codebase, and good for **understanding** how to customize it — but it is **not yet wired for the "all admin work runs through the `truto` CLI" vision**. The single biggest gap is that the CLI does not expose the customization endpoints, so the references in this repo end up walking an LLM agent through `curl` commands for the exact workflows that should be CLI-driven. Closing the gap is mostly mechanical (add three resource commands to the CLI, then rewrite one reference to use them) and lands a coherent story.

> **Update (2026-04-18):** the CLI gap is closed (C1–C7), the documentation half (S2–S8) is merged, and **W1 (OpenAPI audit) has now landed** — closing P1, P3 (literal), and P4. Remaining work is S1 (now unblocked), W2 (extend meta endpoint), and W3 (dry-run endpoint). See [§0](#0-status-snapshot-read-me-first).

**Vision-alignment scorecard**

| Vision pillar | Grade | Why |
|---|---|---|
| 1. Easy to integrate Truto into a customer codebase | Strong | Quick Start in [`skills/truto/SKILL.md`](skills/truto/SKILL.md) covers the canonical happy path end-to-end (link token route, embed Link, listen for `integrated_account:active`, read/write unified API). The Link SDK skill is solid. |
| 2. Customer can extend the platform (add integrations, modify them, add unified APIs, customize defaults) | Partial | The mental models are excellent ([`unified-api-customization.md`](skills/truto/references/unified-api-customization.md), [`truto-jsonata` SKILL](skills/truto-jsonata/SKILL.md)). What's missing is a doc for *authoring* a brand-new integration definition, a doc for *modifying* an existing integration's HTTP behavior (auth, pagination, rate-limit, webhooks) at the workflow level, and any doc for authoring a custom-API handler. |
| 3. Admin / customization work happens through the Truto CLI | Gap | The CLI doesn't register `environment-unified-model`, `environment-unified-model-resource-method`, or `unified-model-resource-method` commands ([`cli/src/cli.ts:71-115`](https://github.com/trutohq/truto/blob/main/cli/src/cli.ts)) — those are exactly the customization surfaces. The repo's customization reference therefore drives the agent into `curl` (12 distinct `curl -X …` invocations in [`unified-api-customization.md`](skills/truto/references/unified-api-customization.md)), directly against the stated vision. |

## 2. Strengths to preserve

These are working — keep them and don't regress them.

1. **Skill routing is explicit.** [`skills/truto-api-conventions/SKILL.md`](skills/truto-api-conventions/SKILL.md) and the always-applied [`rules/truto-api.mdc`](rules/truto-api.mdc) both open with a "Skill Routing" block that tells the agent *when to use the `truto` skill vs. the `truto-cli` skill*. This is the cleanest pattern I've seen for splitting "code that ships" from "terminal admin." Keep it.
2. **Quick Start in [`skills/truto/SKILL.md`](skills/truto/SKILL.md)** (steps 1–7) is end-to-end: link token route, frontend embed, webhook listener, read via unified, write via unified, fall back to proxy. It's the closest thing to a "Day-1" doc and it works.
3. **Three-layer mental model in [`unified-api-customization.md`](skills/truto/references/unified-api-customization.md)** — base → environment override → per-account override, with a deep-merge note and an explicit "field-replacing within each mapping" caveat. The worked Salesforce + Klaviyo examples show *why* a custom unified model is worth building. This is the single best piece of conceptual writing in the repo.
4. **[`skills/truto-jsonata/SKILL.md`](skills/truto-jsonata/SKILL.md)** — the "Hard Rules — Do Not Hallucinate Functions" block, the function cheatsheet with one-liners, and the "Where in Truto" map of every JSONata-accepting field (with scope variables) are exactly what a coding agent needs. The skill's `description` frontmatter is detailed enough to actually trigger correctly.
5. **CLI skill structure** ([`skills/truto-cli/SKILL.md`](skills/truto-cli/SKILL.md)) — Quick Reference table, LLM Agent Tips, Key Gotchas. Specifically the tips "Always use `-o json`", "`truto accounts tools <id> -o json` for discovery", and "use `-v`" are the kind of thing agents reliably miss without prompting.

## 3. Critical gaps (blockers to the vision)

### 3.1 The CLI doesn't expose the customization endpoints (biggest blocker)

[`cli/src/cli.ts`](https://github.com/trutohq/truto/blob/main/cli/src/cli.ts) registers `unified-models` and `environment-integrations` (lines 75 and 102) but does **not** register any of:

- `environment-unified-model` — install / uninstall a unified model in an environment, override its schema/docs/webhook transforms.
- `environment-unified-model-resource-method` — *the* primary per-environment mapping override row (`response_mapping`, `query_mapping`, `request_body_mapping`, `error_mapping`, etc.).
- `unified-model-resource-method` — base mapping rows, required for adding a new integration to a custom unified model.

The downstream effect is in [`skills/truto/references/unified-api-customization.md`](skills/truto/references/unified-api-customization.md): every concrete customization workflow uses `curl` — 12 invocations across `POST` / `PATCH` / `DELETE` (lines 142, 161, 194, 234, 312, 339, 361, 392, 428, 445, 458, 465). When an LLM agent reads this reference, it follows the examples; the agent ends up writing `curl` commands instead of `truto` commands. That's a direct contradiction of pillar 3 of the vision.

There's also a self-confessing line: §"Iterate locally" of the same reference (line 499–501) says *"The Truto CLI…lets you fetch a sample raw integration response and pipe it through a JSONata expression locally"* — but **no such command exists** in the CLI today. So the doc both implies the capability and routes around it.

### 3.2 No "authoring an integration" reference

`truto integrations create` exists, but its only documentation of what to put in `config` is [`cli/src/commands/integration.ts`](https://github.com/trutohq/truto/blob/main/cli/src/commands/integration.ts) line 60: `description: 'Integration config (JSON, includes label, auth, etc.)'`. The CLI skill ([`skills/truto-cli/references/admin-commands.md`](skills/truto-cli/references/admin-commands.md)) repeats this with a one-line example.

There is no reference in the repo for:

- The `integration.config` schema as a whole (label, category, auth_type, credentials, resources, methods, webhooks, post_install, validation, BYOA toggles).
- Available auth formats (`api_key`, `oauth2`, `oauth2_client_credentials`, `basic`, `keka_oauth`, etc. — the Link SDK lists these but the integration side doesn't).
- How to declare proxy paths / native resources for a new integration.
- How to declare an integration's webhook receiver (`override.webhook.handle_verification` / `payload_transform` is documented in `truto-jsonata` but only as scope variables, not as a workflow).

An LLM agent asked "add a new integration for Acme CRM" today will either get stuck or hallucinate a config blob. This is the single most user-facing gap for pillar 2.

### 3.3 No "modify integration HTTP behavior" reference

`environment-integration.override.*` lets a customer override the integration's auth header, pagination, rate-limit detection, and inbound webhook verification/transform — per environment. This is exactly the "modify the integration to your needs" capability the user named.

Today this is documented only as scope variables inside [`skills/truto-jsonata/SKILL.md`](skills/truto-jsonata/SKILL.md) (the "Environment integration overrides (HTTP layer)" sub-section). There is:

- No top-level workflow page (e.g. `customizing-integrations.md`) that says "here's how to override the auth header" with end-to-end worked examples.
- No CLI sub-command equivalent (`truto environment-integrations update -b '{"override":{...}}'` works, but nothing like `truto env-integrations override-auth <id>`).

Result: the capability is technically reachable, but an agent has to assemble it from JSONata-skill scope tables + admin-command JSON examples + the field-replacing merge rule from `unified-api-customization.md`. That's a high skill barrier for a workflow that should be a one-page recipe.

### 3.4 Custom-API handler authoring is undocumented

[`skills/truto/references/proxy-and-custom-api.md`](skills/truto/references/proxy-and-custom-api.md) §"Custom API" (lines 88–117) covers *calling* `/custom/{path}` thoroughly, but it never documents how to *author* the integration-side route handler. The opening sentence — *"Custom APIs let you define your own endpoints with custom routing logic"* — implies the capability exists, then doesn't say how. For pillar 2 ("flexibility to extend the platform"), this matters: custom APIs are the escape hatch when neither unified nor proxy fits.

### 3.5 No Day-1 tutorial that ties the CLI to the code

The Quick Start in [`skills/truto/SKILL.md`](skills/truto/SKILL.md) opens at *"Create an API token in the [Truto Dashboard]"* (step 1, line 45) and never mentions the CLI in steps 1–7. The CLI skill mentions the application-code skill only as a "Companion" at the end. The two skills cross-reference each other but no single page says:

> Install the CLI → `truto login` → `truto accounts list` → connect a sandbox via `truto link-tokens create` → write your link-token route → make your first `truto unified crm contacts -a $ACCOUNT_ID` call → port the same call into your code.

That sequence is the Day-1 path, and it's the path that most directly delivers pillar 1.

### 3.6 Express-only examples

All TypeScript samples in [`skills/truto/SKILL.md`](skills/truto/SKILL.md) and [`skills/truto-link-sdk/SKILL.md`](skills/truto-link-sdk/SKILL.md) use Express (`app.post(...)`). Modern customers are equally likely to be on Next.js Route Handlers, Hono, Cloudflare Workers, or NestJS. The underlying `fetch` call is the same — the doc just needs to say so, with one or two alternative-framework variants. Minor severity, but it's a low-cost lift on pillar 1.

## 4. Skill-by-skill notes

### [`skills/truto/SKILL.md`](skills/truto/SKILL.md)
Strong Quick Start. Three concrete improvements:
- Add a "Day 0" preface that points at the CLI for setup before step 1 (closes §3.5).
- Surface "Customization" / "Authoring" prominently in the references table (line 226–245). Today both are buried in a 14-row table; an agent scanning for "how do I add a new integration" will not find it without context.
- Inside the Quick Start, after step 4, add a one-line "use `truto accounts list -o json` to grab the `integrated_account_id` while developing" hint.

### [`skills/truto-cli/SKILL.md`](skills/truto-cli/SKILL.md)
Strong. Two improvements:
- Once the customization commands ship (§5), add them to the Quick Reference table.
- Lift the 4-line discovery sequence from [`references/common-patterns.md`](skills/truto-cli/references/common-patterns.md) §"Discovery Workflow" into the SKILL.md itself — it's the most useful "what do I do first" snippet and currently lives one click away.

### [`skills/truto-jsonata/SKILL.md`](skills/truto-jsonata/SKILL.md)
Best-in-class. Two minor tweaks:
- Promote [`references/usage-in-truto.md`](skills/truto-jsonata/references/usage-in-truto.md) to the first row of the references table — it's the agent's usual entry point because it's the only file that maps surfaces to scope variables.
- Consider a "common recipes" appendix (status enum mapping with `$mapValues`, ISO date conversion with `$dtFromIso`, hyphen-keyed resource paths with backticks) to short-circuit the most repeated mistakes.

### [`skills/truto-link-sdk/SKILL.md`](skills/truto-link-sdk/SKILL.md)
Solid. One improvement: add a "Framework recipes" section with a React hook, a Vue composable, and a Svelte action — the SDK is plain ES module, so each is ~10 lines. Helps pillar 1.

### [`skills/truto-api-conventions/SKILL.md`](skills/truto-api-conventions/SKILL.md) + [`rules/truto-api.mdc`](rules/truto-api.mdc)
These are intentional duplicates (one for Cursor's always-apply primitive, one for Claude Code's model-invoked primitive). The README explains this clearly. Content is correct. No action needed unless one drifts from the other — consider a tiny lint check (or a generation script) to keep them byte-for-byte identical going forward.

### Repo-level
- [`README.md`](README.md) is good — installation paths for Cursor, Claude Code, and any agent (`npx skills`) are all there.
- Plugin manifests ([`.claude-plugin/plugin.json`](.claude-plugin/plugin.json), [`.cursor-plugin/plugin.json`](.cursor-plugin/plugin.json)) are minimal but correct.
- No `CHANGELOG.md` — once skills start churning, customers will want to know what changed.

## 5. Recommendations, split by repo

### 5.1 `truto-skills` (this repo)

| # | Action | Closes | Status |
|---|---|---|---|
| S1 | New reference `skills/truto/references/authoring-integrations.md` — full `integration.config` schema with one worked example (e.g. a fictional "Acme CRM" with API-key auth, two resources, one webhook receiver) | §3.2 | ⏳ TODO — best done after W1 lands |
| S2 | New reference `skills/truto/references/customizing-integrations.md` — `environment-integration.override.*` workflows with worked examples for each surface (auth header, pagination, rate-limit, inbound webhook verification/transform) | §3.3 | ✅ DONE (PR [#3](https://github.com/trutohq/truto-skills/pull/3)) |
| S3 | New reference `skills/truto/references/getting-started.md` — Day-1 tutorial that strings together CLI install → login → connect a sandbox → write the link-token route → first unified API call | §3.5 | ✅ DONE (PR [#3](https://github.com/trutohq/truto-skills/pull/3)) |
| S4 | Rewrite [`skills/truto/references/unified-api-customization.md`](skills/truto/references/unified-api-customization.md) to use `truto` CLI commands as the primary path, with `curl` as a fallback note. Replace the speculative §3 "Iterate locally" with the concrete `truto unified test-mapping` invocation (assuming C5 ships) | §3.1 | ✅ DONE (PR [#3](https://github.com/trutohq/truto-skills/pull/3)) |
| S5 | Add a §"Authoring custom-API handlers" to [`skills/truto/references/proxy-and-custom-api.md`](skills/truto/references/proxy-and-custom-api.md) | §3.4 | ✅ DONE (PR [#3](https://github.com/trutohq/truto-skills/pull/3)) |
| S6 | Add framework recipes (Next.js Route Handler, Hono, Cloudflare Workers `fetch` handler) inline in [`skills/truto/SKILL.md`](skills/truto/SKILL.md) Quick Start and the Link SDK skill | §3.6 | ✅ DONE (PR [#3](https://github.com/trutohq/truto-skills/pull/3)) |
| S7 | Re-order the references table in [`skills/truto/SKILL.md`](skills/truto/SKILL.md) so "Authoring" / "Customization" / "Getting Started" sit at the top, not buried mid-table | §4 | ✅ DONE (PR [#3](https://github.com/trutohq/truto-skills/pull/3)) |
| S8 | Add a `CHANGELOG.md` — start tracking from v0.1.0 | meta | ✅ DONE (PR [#3](https://github.com/trutohq/truto-skills/pull/3)) |

### 5.2 `truto` CLI (in [`/Users/roopi/work/truto/cli`](/Users/roopi/work/truto/cli))

| # | Action | Closes | Status |
|---|---|---|---|
| C1 | Add `truto env-unified-models` (CRUD on `environment-unified-model`) | §3.1 | ✅ DONE |
| C2 | Add `truto env-unified-model-mappings` (CRUD on `environment-unified-model-resource-method`) — name it for the verb, not the URL slug | §3.1 | ✅ DONE |
| C3 | Add `truto unified-model-mappings` (CRUD on `unified-model-resource-method`) | §3.1 | ✅ DONE |
| C4 | Add `truto integrations init <name>` — interactive scaffold producing a starter `integration.config` blob with auth-format picker, sample resources, and a placeholder webhook handler | §3.2 | ✅ DONE — but hand-rolls the schema; will benefit from W1 |
| C5 | Add `truto unified test-mapping <model>/<resource> --integration <name> --method <method> [--input file.json]` | §3.1, §3.4 | ✅ DONE — string mappings only; object/v2 mappings & `before`/`after` steps need W3 |
| C6 | Add helper sub-commands on `environment-integrations`: `override-auth`, `override-pagination`, `override-rate-limit`, `override-webhook` | §3.3 | ✅ DONE |
| C7 | Add `truto integrations validate <name>` | §3.2 | ✅ DONE — currently a partial client-side check; can become a thin spec-driven validator after W1 |

### 5.3 `truto` platform API — restructured as workstreams

Original P1–P4 are listed below for traceability, then collapsed into three concrete workstreams (W1–W3) you can hand to an agent.

#### Original P1–P4 mapping

| # | Action | Closes | Status | Workstream |
|---|---|---|---|---|
| P1 | Schema-introspection endpoint for `integration.config` (e.g. `GET /integration/_schema`) — returns the JSON Schema for every field. Lets the CLI scaffold (C4) and the docs (S1) stay in sync without manual duplication | §3.2 | ✅ DONE via W1 — `IntegrationConfig` is now fully typed in `openapi.yml` (auth formats, resources, methods, actions, webhooks, rate limits) and reachable from `IntegrationSchema.config`; CLI / SDK generators and `S1` can now consume the spec instead of hand-rolling | W1 (OpenAPI) |
| P2 | Dry-run validation endpoint for unified mapping changes — `POST /environment-unified-model-resource-method/_dryrun` accepting `{ config, sample_response }` and returning the JSONata-evaluated output (or compile error). Backs C5 | §3.1 | ⏳ TODO | W3 |
| P3 | Make sure the merged-config view at `GET /unified/{model}/{resource}/{integration}/meta/{method}` is callable without an `integrated_account_id` (or document the workaround) so customization iteration doesn't require a live connected account | §3.1 | 🟡 partially DONE — W1 documented the endpoint with typed parameters and response (`schema`, `documentation_link`, `response_schema`, `query_schema`, `request_body_schema`, `default_query`, `default_body`); the *extension* to also return merged JSONata is W2 | W1 (document) ✅ + W2 (extend response) ⏳ |
| P4 | Confirm that `environment-integration.override.webhook.*` is documented in the OpenAPI schema (today it's only described in `truto-jsonata`'s usage map). If not, add it. Backs S2 | §3.3 | ✅ DONE via W1 — `EnvironmentIntegrationConfig.webhook` is fully typed (`signature_verification`, `handle_verification`, `payload_transform`) via the shared `IntegrationWebhook` component and reachable from `EnvironmentIntegrationSchema.override` | W1 (OpenAPI) |

#### W1 — Audit and complete `truto/openapi.yml`

**Status (2026-04-18): ✅ DONE.** All five concrete changes below landed in `truto/openapi.yml`. `npx @apidevtools/swagger-cli validate openapi.yml` and `npx @redocly/cli@latest lint openapi.yml` both pass with 0 errors. The 183 remaining warnings are all pre-existing (missing `operationId`, missing 4xx responses, schema example formatting) and unrelated to this audit.

**Goal.** Replace every opaque `additionalProperties: true` blob in `openapi.yml` with a typed schema mirroring the corresponding `superstruct` schema. The backend already validates against these — `openapi.yml` is just out of date.

**Why.** Closes P1, the literal ask of P3, and P4. Side benefits:

- The CLI can drop ~300 lines of hand-rolled validation/scaffold logic in [`truto/cli/src/commands/integration.ts:200–318, 735–807`](https://github.com/trutohq/truto/blob/main/cli/src/commands/integration.ts#L200) and validate against the spec with `ajv`. Removes the "the platform does not yet expose a /integrations/validate endpoint" warning at line 712.
- Unblocks `S1` (`authoring-integrations.md`) — it can link to typed OpenAPI sections instead of duplicating the schema.
- Generated TypeScript SDKs and any third-party MCP/agent that reads OpenAPI immediately benefit.
- `EnvironmentUnifiedModel.override` ([`openapi.yml:5353–5357`](https://github.com/trutohq/truto/blob/main/openapi.yml#L5353)) has the same opacity; same fix applies.

**Files to read first.**

- [`truto/src/integration/integrationSchema.ts`](https://github.com/trutohq/truto/blob/main/src/integration/integrationSchema.ts) — source of truth for `IntegrationConfigSchema` (line 376–413), per-credential schemas (lines 73–239), `ResourceMethodSchema` (296–328), `PaginationSchema` (241–251), `WebhookSchema` (253–275), `RateLimitSchema` (277–281), `IntegrationActionSchema` / `IntegrationActionStepSchema` (330–346).
- [`truto/src/environment-integration/environmentIntegrationSchema.ts`](https://github.com/trutohq/truto/blob/main/src/environment-integration/environmentIntegrationSchema.ts) — source of truth for `EnvironmentIntegrationConfigSchema` (lines 90–128) and `EnvironmentIntegrationResourceMethodSchema` (44–76).
- [`truto/openapi.yml`](https://github.com/trutohq/truto/blob/main/openapi.yml) — current state, hand-maintained YAML.
- [`truto/scripts/generateOpenApiJson.js`](https://github.com/trutohq/truto/blob/main/scripts/generateOpenApiJson.js) — confirms YAML is hand-edited; only post-processing is YAML → JSON.

**Concrete changes.**

1. `IntegrationSchema.config` ([`openapi.yml:839–843`](https://github.com/trutohq/truto/blob/main/openapi.yml#L839)) — replace `type: object, additionalProperties: true, example: ...` with a typed schema: ✅ DONE
   - `oneOf` over the five credential formats (`api_key`, `oauth2`, `keka_oauth`, `oauth2_client_credentials`, `oauth`) — one entry per credential schema in `integrationSchema.ts:73–239`.
   - Typed `pagination.format` enum (`page | cursor | link_header | offset | range | dynamic`).
   - Typed `authorization.format` enum (`basic | bearer | header`).
   - Typed `resources.{name}.{method}` matching `ResourceMethodSchema` (~30 fields, including `method` enum, `body_format` enum, `query_array_format` enum).
   - Typed `actions.{name}` — `IntegrationActionSchema` with `IntegrationActionStepSchema.type` enum (`request | transform | update_context | get_context | set_context | form`).
   - Typed `webhook.signature_verification.{format, config}`, `webhook.handle_verification`, `webhook.payload_transform`.
   - Typed `rate_limit.{is_rate_limited, retry_after_header_expression, rate_limit_header_expression}`.
2. `EnvironmentIntegrationSchema.override` ([`openapi.yml:562–565`](https://github.com/trutohq/truto/blob/main/openapi.yml#L562)) — replace `additionalProperties: true` with a schema mirroring `EnvironmentIntegrationConfigSchema`. Most fields can `$ref` the same components used in (1). ✅ DONE
3. `EnvironmentUnifiedModel.override` body in `POST /environment-unified-model` ([`openapi.yml:5353–5357`](https://github.com/trutohq/truto/blob/main/openapi.yml#L5353)) — same treatment. ✅ DONE — additionally typed `EnvironmentUnifiedModelOverride`, `EnvironmentUnifiedModelResourceOverride`, `EnvironmentUnifiedModelResourceMethodOverride`, and the new `UnifiedModelResource` / `UnifiedModelResourceMethodResource` / `UnifiedModelMethod` / `UnifiedModelRelatedResources` / `UnifiedModelMethodFileUpload` / `UnifiedModelResourceDocs` / `JsonSchemaObject` / `JsonSchemaObjectProperties` components.
4. **Document `GET /unified/{model}/{resource}/{integration}/meta/{method}`** ([`unifiedApiRouter.ts:638`](https://github.com/trutohq/truto/blob/main/src/unified-api/unifiedApiRouter.ts#L638)). It exists, accepts no `integrated_account_id`, and is currently undocumented in OpenAPI. Add path + parameters + response schema (which today returns `schema`, `documentation_link`, `response_schema`, `query_schema`, `request_body_schema`, `default_query`, `default_body` — see `unifiedApiRouter.ts:662–687`). Note this is **separate from** W2 — W2 *extends* the response, this just documents what's already there. ✅ DONE
5. While in there, type the other lurking `additionalProperties: true` blobs: `Webhook.signature_verification.config`, `Pagination.config`, `IntegrationActionStep.config`, `EnvironmentIntegration.environment_variables`, plus `Datastore.config` (now a discriminated union of `mongo_data_api`, `google_cloud_storage`, `s3`, `qdrant`), `SyncJobRun.resource_stats`, `SyncJobTemplate.args_schema`, and the unified-model resource/method/docs/scopes/webhooks maps. ✅ DONE

**Definition of done.**

- ✅ `npx @apidevtools/swagger-cli validate openapi.yml` passes (also fixed a pre-existing `items: [ ... ]` array-typed schema in `/batch-request` that swagger-cli rejected).
- ✅ `node scripts/generateOpenApiJson.js` regenerates `openapi.json` (run via `npm run generate:openapi`).
- ✅ `npx @redocly/cli@latest lint openapi.yml` reports 0 errors (down from 29). The remaining 183 warnings are all pre-existing and unrelated (missing `operationId`, missing 4xx responses, schema example formatting on long-form examples).
- For at least one credential format, `oneOf` resolves correctly when validated with `ajv` against a real integration's `config` payload — verified manually against `IntegrationConfig` for `api_key` and `oauth2`. (Automated `ajv` smoke-test still pending; tracked as a CLI follow-up in §6.)
- The `EnvironmentIntegration.override` schema is valid against an existing `override` blob — verified by inspecting a sample env-integration override JSON.
- `truto integrations validate` against a known-bad config produces the same error class the backend would on `POST /integration` — pending the CLI swap-over to ajv (CLI follow-up in §6).

#### W2 — Extend the unified-api `meta` endpoint to return merged JSONata

**Goal.** Make [`GET /unified/{model}/{resource}/{integration}/meta/{method}`](https://github.com/trutohq/truto/blob/main/src/unified-api/unifiedApiRouter.ts#L638) return the merged `response_mapping`, `query_mapping`, `request_body_mapping`, `error_mapping`, `before`, `after` from `c.get('integrationMapping')`. The data is already in scope; the response just doesn't include it.

**Why.** Closes the richer half of P3. Once shipped, `truto unified test-mapping --model crm --resource contacts --integration salesforce --with-overrides <env-unified-model-id>` can fetch the *actually-merged* JSONata for inspection and local evaluation, instead of fetching base + overrides separately and re-implementing the merge client-side (which the CLI does today and gets wrong for object-form mappings).

**Files to read first.**

- [`truto/src/unified-api/unifiedApiRouter.ts:638–688`](https://github.com/trutohq/truto/blob/main/src/unified-api/unifiedApiRouter.ts#L638) — the endpoint and the response shape today.
- [`truto/src/unified-api/unifiedApiRouter.ts:597–636`](https://github.com/trutohq/truto/blob/main/src/unified-api/unifiedApiRouter.ts#L597) — the `:resourceName/meta/:method` variant that *does* return `response_mapping` (line 614). Mirror the shape but without the integrated-account dependency.
- [`truto/src/environment-unified-model-resource-method/environmentUnifiedModelResourceMethodService.ts:320`](https://github.com/trutohq/truto/blob/main/src/environment-unified-model-resource-method/environmentUnifiedModelResourceMethodService.ts#L320) — `getEnvironmentUnifiedIntegrationMapping` already does the merge.

**Concrete changes.**

1. In `unifiedApiRouter.ts:662–687`, also include:
   - `response_mapping: getResponseMapping(integrationMapping, method)`
   - `query_mapping: getQueryMapping(integrationMapping, method)` (or `getQuerySchema` for v2 mappings)
   - `request_body_mapping: get(integrationMapping, [method, 'request_body_mapping'])` (or `getBodySchema` for v2)
   - `error_mapping: get(integrationMapping, [method, 'error_mapping'])`
   - `before: getBeforeSteps(integrationMapping, method)`
   - `after: getAfterSteps(integrationMapping, method)`
   - `mapping_version: get(integrationMapping, [method, 'mapping_version'])`
2. Update OpenAPI (W1 already adds the path; extend the response schema there).
3. Update `truto/cli/src/commands/unified.ts` `test-mapping` so `--with-overrides` consumes the new fields directly instead of fetching base + override and re-merging.

**Definition of done.**

- A `curl` against `GET /unified/crm/contacts/salesforce/meta/list` returns the merged JSONata as a string field.
- `truto unified test-mapping --model crm --resource contacts --integration salesforce --method list --with-overrides <env-unified-model-id> --input sample.json` evaluates the *merged* mapping (verify by deliberately overriding a single field on a sandbox env-unified-model and confirming the merged output reflects it).
- Existing meta-endpoint tests still pass.

#### W3 — Build dry-run endpoint for unified mapping changes

**Goal.** New endpoint `POST /environment-unified-model-resource-method/_dryrun` that accepts `{ integration_name, environment_unified_model_id, resource_name, method_name, config, sample_response, query?, body?, headers? }` and returns either the post-mapping unified output or a structured JSONata error.

**Why.** Closes P2. The current `truto unified test-mapping` ([`truto/cli/src/commands/unified.ts:148–267`](https://github.com/trutohq/truto/blob/main/cli/src/commands/unified.ts#L148)) is deliberately limited (lines 223–225 explicitly bail on object-form mappings, lines 251–259 evaluate with a synthetic context that doesn't include `before`/`after` steps or proper env-override merge). The only way to validate a non-trivial mapping change today is to PATCH it and run a real unified API call against a live integrated account.

**Files to read first.**

- [`truto/src/unified-api/fetchUnifiedApi.ts`](https://github.com/trutohq/truto/blob/main/src/unified-api/fetchUnifiedApi.ts) — the executor. Factor out the part that takes `{ integrationMapping, response, query, body, before, schema, unifiedModel, unifiedResource, integrationName, method }` and runs the JSONata pipeline to produce the unified output. This part is independent of the live HTTP fetch.
- [`truto/src/unified-api/runSteps.ts`](https://github.com/trutohq/truto/blob/main/src/unified-api/runSteps.ts) — handles `before`/`after` steps; will need a "skip request steps" mode for dry-run.
- [`truto/src/environment-unified-model-resource-method/environmentUnifiedModelResourceMethodRouter.ts`](https://github.com/trutohq/truto/blob/main/src/environment-unified-model-resource-method/environmentUnifiedModelResourceMethodRouter.ts) — add the new POST route here.
- [`truto/src/environment-unified-model-resource-method/environmentUnifiedModelResourceMethodService.ts:320`](https://github.com/trutohq/truto/blob/main/src/environment-unified-model-resource-method/environmentUnifiedModelResourceMethodService.ts#L320) — reuse `getEnvironmentUnifiedIntegrationMapping` to apply env overrides on top of the supplied `config`.

**Concrete changes.**

1. New service method `dryRun({ integrationName, environmentUnifiedModelId, resourceName, methodName, config, sampleResponse, query, body, headers })`:
   - Fetch base + env overrides via `getEnvironmentUnifiedIntegrationMapping`.
   - Overlay the supplied `config` on top of the existing per-method override row (do NOT mutate the DB).
   - Call the factored-out executor with the merged mapping + sample response.
   - Catch JSONata compile and runtime errors and return them in a structured shape `{ phase: "compile" | "before" | "response_mapping" | "after", expression?, error_message }`.
2. New POST route in the router with the standard auth middleware (`useDisableUnifiedChanges`, `getUserFromSession`, `environment_unified_model.environment_id ∈ user.environment` check).
3. Update OpenAPI to document the new endpoint (depends on W1 establishing typed mapping schemas).
4. Update `truto/cli/src/commands/unified.ts` `test-mapping` to call this endpoint when the mapping is in object form, and fall back to the local JSONata evaluator only when the user passes `--offline`.

**Definition of done.**

- `POST /environment-unified-model-resource-method/_dryrun` with a valid `{ config, sample_response }` returns the unified output without writing anything to the DB.
- A bad JSONata expression in `config.response_mapping` returns a `{ phase: "response_mapping", expression: "...", error_message: "..." }` shape with HTTP 200 (the request succeeded; the *mapping* failed — the agent needs the diagnostic, not a 4xx).
- `truto unified test-mapping --model crm --resource contacts --integration salesforce --method list` with an object-form `request_body_mapping` no longer prints the "operator mappings cannot be evaluated locally" warning.
- Cross-environment isolation: caller can only dry-run against env-unified-models in their own environment.

## 6. Prioritized roadmap (updated)

Original waves 1–3 are complete. **W1 landed 2026-04-18.** What's left:

1. ✅ **W1** — OpenAPI audit + fix. **DONE.** Closed P1, P3 (literal), P4. Unblocks S1 and the CLI follow-ups below.
2. **S1** — `authoring-integrations.md`. ~½ day. **Now unblocked.** Should link the new typed OpenAPI components instead of duplicating the schema.
3. **W2** — Extend the unified-api meta endpoint. ~½ day. Closes P3 (richer ask). Small PR.
4. **W3** — Dry-run endpoint. ~1 week. Closes P2. Highest-value-but-largest-scope; can be sequenced last because it doesn't block anything.
5. **CLI follow-ups (now unlocked by W1)** — high-leverage cleanup:
   - Replace `validateIntegrationConfig` in [`truto/cli/src/commands/integration.ts:735–807`](https://github.com/trutohq/truto/blob/main/cli/src/commands/integration.ts#L735) with a thin `ajv` validator backed by the new `IntegrationConfig` component.
   - Replace `buildCredentialsBlock` / `buildAuthorizationBlock` in lines 200–351 with code that derives the per-format starter shape from the typed `IntegrationConfig.credentials` `oneOf` branches.
   - Remove the warning at line 712 ("the platform does not yet expose a /integrations/validate endpoint") — once the CLI consumes the spec, that statement is no longer true in the way it matters.

## 7. Out-of-scope notes

Things explicitly *not* flagged as gaps:

- **Cross-team unified-model sharing.** [`unified-api-customization.md`](skills/truto/references/unified-api-customization.md) "Custom unified models are team-private" is deliberate per platform design.
- **V1–V3 sync job runtimes.** [`skills/truto/references/sync-jobs.md`](skills/truto/references/sync-jobs.md) is V4-only by intent — older runtimes are deprecated, undocumented on purpose.
- **Authoring a Truto-shipped integration (not a customer-private one).** Out of scope for customer skills; that's an internal Truto workflow.
- **MCP server use case.** [`skills/truto/references/mcp-tokens.md`](skills/truto/references/mcp-tokens.md) covers customer-facing MCP token management; deeper "how to expose your customer's integrated tools to their AI agent via MCP" content could be added later but isn't a vision blocker today.

## 8. Final verdict

The repo's **content quality is high** — the mental models, the JSONata reference, the worked customization examples are all the kind of writing that makes an LLM agent succeed. The gap is **structural alignment with the CLI-first vision**: a small number of CLI commands need to exist before the existing docs can stop falling back to `curl`. Once C1–C3 + S4 land, pillar 3 flips from Gap to Strong with no other change to the repo. The remaining recommendations (authoring docs, scaffolds, Day-1 tutorial) move pillar 2 from Partial to Strong.

This is a high-leverage small surface area. Most of the work is incremental, the prioritization is clean, and there are no dead-ends.

> **Update (2026-04-18).** Pillar 3 has flipped to **Strong** — C1–C7 shipped and the CLI-driven customization story is internally consistent (S2, S4–S8 + the `truto-cli` skill update merged in PR [#3](https://github.com/trutohq/truto-skills/pull/3)). **W1 has now landed**, closing P1, P3 (literal), and P4 in one shot — `openapi.yml` is fully typed across `IntegrationConfig`, `EnvironmentIntegrationConfig`, `EnvironmentUnifiedModel.override`, the unified-model resource maps, and the datastore / sync-job / sync-job-template surfaces, and validates clean under both `swagger-cli` and `redocly lint` (0 errors). Pillar 2 is now **Mostly Strong** — `S1` is the last skill-side gap and is now unblocked. The remaining platform work is two scoped pieces:
>
> - **W2 (extend the meta endpoint)** — ~half-day code change; closes the iterate-on-mapping loop end-to-end.
> - **W3 (dry-run endpoint)** — only platform task that requires meaningful new code; needed for safe object-form mapping iteration.
>
> See [§0](#0-status-snapshot-read-me-first) for a one-page handoff and [§5.3](#53-truto-platform-api-restructured-as-workstreams) for the per-workstream breakdown.
