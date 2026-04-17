# truto-skills audit — LLM agent fitness

Date: 2026-04-17
Auditor: Cursor Agent
Scope: [`truto-skills`](.) repo, [`truto/cli`](https://github.com/trutohq/truto) CLI source, and the public Truto platform API surface that customers touch through the CLI / skills.

## 1. Executive summary

The repo is in a strong place for **using** Truto from a customer codebase, and good for **understanding** how to customize it — but it is **not yet wired for the "all admin work runs through the `truto` CLI" vision**. The single biggest gap is that the CLI does not expose the customization endpoints, so the references in this repo end up walking an LLM agent through `curl` commands for the exact workflows that should be CLI-driven. Closing the gap is mostly mechanical (add three resource commands to the CLI, then rewrite one reference to use them) and lands a coherent story.

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

### `truto-skills` (this repo)

| # | Action | Closes |
|---|---|---|
| S1 | New reference `skills/truto/references/authoring-integrations.md` — full `integration.config` schema with one worked example (e.g. a fictional "Acme CRM" with API-key auth, two resources, one webhook receiver) | §3.2 |
| S2 | New reference `skills/truto/references/customizing-integrations.md` — `environment-integration.override.*` workflows with worked examples for each surface (auth header, pagination, rate-limit, inbound webhook verification/transform) | §3.3 |
| S3 | New reference `skills/truto/references/getting-started.md` — Day-1 tutorial that strings together CLI install → login → connect a sandbox → write the link-token route → first unified API call | §3.5 |
| S4 | Rewrite [`skills/truto/references/unified-api-customization.md`](skills/truto/references/unified-api-customization.md) to use `truto` CLI commands as the primary path, with `curl` as a fallback note. Replace the speculative §3 "Iterate locally" with the concrete `truto unified test-mapping` invocation (assuming C5 ships) | §3.1 |
| S5 | Add a §"Authoring custom-API handlers" to [`skills/truto/references/proxy-and-custom-api.md`](skills/truto/references/proxy-and-custom-api.md) | §3.4 |
| S6 | Add framework recipes (Next.js Route Handler, Hono, Cloudflare Workers `fetch` handler) inline in [`skills/truto/SKILL.md`](skills/truto/SKILL.md) Quick Start and the Link SDK skill | §3.6 |
| S7 | Re-order the references table in [`skills/truto/SKILL.md`](skills/truto/SKILL.md) so "Authoring" / "Customization" / "Getting Started" sit at the top, not buried mid-table | §4 |
| S8 | Add a `CHANGELOG.md` — start tracking from v0.1.0 | meta |

### `truto` CLI (in [`/Users/roopi/work/truto/cli`](/Users/roopi/work/truto/cli))

| # | Action | Closes |
|---|---|---|
| C1 | Add `truto env-unified-models` (CRUD on `environment-unified-model`) | §3.1 |
| C2 | Add `truto env-unified-model-mappings` (CRUD on `environment-unified-model-resource-method`) — name it for the verb, not the URL slug | §3.1 |
| C3 | Add `truto unified-model-mappings` (CRUD on `unified-model-resource-method`) | §3.1 |
| C4 | Add `truto integrations init <name>` — interactive scaffold producing a starter `integration.config` blob with auth-format picker, sample resources, and a placeholder webhook handler. Mirrors `wrangler init` / `gh repo create`. | §3.2 |
| C5 | Add `truto unified test-mapping <model>/<resource> --integration <name> --method <method> [--input file.json]` — fetches a sample raw response (or accepts one on stdin), runs the merged JSONata, prints the unified output. Closes the loop the doc already implies exists | §3.1, §3.4 |
| C6 | Add helper sub-commands on `environment-integrations`: `override-auth`, `override-pagination`, `override-rate-limit`, `override-webhook` — each takes a JSONata expression and writes it into the right `override.*` slot. Cuts out hand-assembling the override JSON | §3.3 |
| C7 | Add a sub-command on `integrations`: `truto integrations validate <name>` — runs the platform's integration-config validator (assuming P1 ships) and prints structured errors | §3.2 |

### `truto` platform API (in [`/Users/roopi/work/truto/src`](/Users/roopi/work/truto/src))

| # | Action | Closes |
|---|---|---|
| P1 | Schema-introspection endpoint for `integration.config` (e.g. `GET /integration/_schema`) — returns the JSON Schema for every field. Lets the CLI scaffold (C4) and the docs (S1) stay in sync without manual duplication | §3.2 |
| P2 | Dry-run validation endpoint for unified mapping changes — `POST /environment-unified-model-resource-method/_dryrun` accepting `{ config, sample_response }` and returning the JSONata-evaluated output (or compile error). Backs C5 | §3.1 |
| P3 | Make sure the merged-config view at `GET /unified/{model}/{resource}/{integration}/meta/{method}` is callable without an `integrated_account_id` (or document the workaround) so customization iteration doesn't require a live connected account | §3.1 |
| P4 | Confirm that `environment-integration.override.webhook.*` is documented in the OpenAPI schema (today it's only described in `truto-jsonata`'s usage map). If not, add it. Backs S2 | §3.3 |

## 6. Prioritized roadmap

Order chosen so each step unblocks the next.

1. **C1 + C2 + C3** — three CLI commands, ~1 day each, mostly mechanical (`createResourceCommand` pattern from [`cli/src/resource.ts`](https://github.com/trutohq/truto/blob/main/cli/src/resource.ts) already handles 90% of CRUD). Unblocks S4.
2. **S4** — rewrite [`unified-api-customization.md`](skills/truto/references/unified-api-customization.md). Now the customization story is internally consistent.
3. **S2 + S5** — two reference docs that close the §3.3 and §3.4 gaps using the platform endpoints that already exist (no new CLI required).
4. **C4 + C5 + C6 + P1 + P2** — scaffolding and dry-run helpers. These are the multipliers that turn "the platform supports it" into "the LLM agent can do it in one shot." Sequencing: P1 → C4, then P2 → C5 in parallel with C6.
5. **S1** — `authoring-integrations.md`. Best done after P1 / C4 land so the doc and the scaffold output agree.
6. **S3** — Day-1 tutorial. Best done last so the CLI commands it references actually exist.
7. **S6 + S7 + S8** — polish. Framework recipes, references-table reorder, changelog.

## 7. Out-of-scope notes

Things explicitly *not* flagged as gaps:

- **Cross-team unified-model sharing.** [`unified-api-customization.md`](skills/truto/references/unified-api-customization.md) "Custom unified models are team-private" is deliberate per platform design.
- **V1–V3 sync job runtimes.** [`skills/truto/references/sync-jobs.md`](skills/truto/references/sync-jobs.md) is V4-only by intent — older runtimes are deprecated, undocumented on purpose.
- **Authoring a Truto-shipped integration (not a customer-private one).** Out of scope for customer skills; that's an internal Truto workflow.
- **MCP server use case.** [`skills/truto/references/mcp-tokens.md`](skills/truto/references/mcp-tokens.md) covers customer-facing MCP token management; deeper "how to expose your customer's integrated tools to their AI agent via MCP" content could be added later but isn't a vision blocker today.

## 8. Final verdict

The repo's **content quality is high** — the mental models, the JSONata reference, the worked customization examples are all the kind of writing that makes an LLM agent succeed. The gap is **structural alignment with the CLI-first vision**: a small number of CLI commands need to exist before the existing docs can stop falling back to `curl`. Once C1–C3 + S4 land, pillar 3 flips from Gap to Strong with no other change to the repo. The remaining recommendations (authoring docs, scaffolds, Day-1 tutorial) move pillar 2 from Partial to Strong.

This is a high-leverage small surface area. Most of the work is incremental, the prioritization is clean, and there are no dead-ends.
