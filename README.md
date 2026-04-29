# Truto Agent Skills

Official agent skills for [Truto](https://truto.one) — the unified API platform for integrating with third-party tools. Works with [Cursor](https://cursor.com), [Claude Code](https://docs.claude.com/en/docs/claude-code), and any other agent that supports the [Agent Skills](https://www.anthropic.com/news/skills) (`SKILL.md`) convention.

## Installation

### Claude Code

Add this repo as a plugin marketplace, then install the plugin:

```bash
/plugin marketplace add trutohq/truto-skills
/plugin install truto@truto-skills
```

Core skills become namespaced as `truto:truto`, `truto:truto-cli`, `truto:truto-jsonata`, `truto:truto-link-sdk`, and `truto:truto-api-conventions`. Operational workflow skills are also available with the same namespace, for example `truto:truto-customer-issue-debugger` and `truto:truto-sync-job-validator`. To try it locally before installing, run `claude --plugin-dir /path/to/truto-skills`.

### Cursor

Open **Cursor Settings → Rules**, click **Add Rule** under **Project Rules**, choose **Remote Rule (GitHub)**, and enter:

```
https://github.com/trutohq/truto-skills
```

This pulls in both the skills and the always-applied `truto-api` rule.

### Any agent (via `npx skills`)

Install into the current project (or globally with `-g`):

```bash
npx skills add trutohq/truto-skills
```

Works for Cursor, Claude Code, and any other agent supported by the [`skills`](https://www.npmjs.com/package/skills) CLI.

## Skills

### Core skills

| Skill | Description |
|-------|-------------|
| [truto](./skills/truto/SKILL.md) | Build integrations with third-party tools using Truto's unified API platform |
| [truto-link-sdk](./skills/truto-link-sdk/SKILL.md) | Embed the Truto connection flow in your frontend using `@truto/truto-link-sdk` |
| [truto-cli](./skills/truto-cli/SKILL.md) | Install, authenticate, and use the Truto CLI for managing integrations and accessing data |
| [truto-jsonata](./skills/truto-jsonata/SKILL.md) | Write JSONata expressions for Truto config (mappings, sync jobs, workflows) using the custom `$functions` from `@truto/truto-jsonata` |
| [truto-api-conventions](./skills/truto-api-conventions/SKILL.md) | Truto API conventions — base URL, auth, URL patterns, pagination, idempotency, and skill routing |

### Operational workflow skills

Use these when you want to explicitly tell an agent which Truto workflow to follow, especially from Cursor Mobile or short prompts.

| Skill | Use when |
|-------|----------|
| [truto-cli-toolbelt](./skills/truto-cli-toolbelt/SKILL.md) | You want the baseline Truto CLI operating checklist |
| [truto-cli-investigator](./skills/truto-cli-investigator/SKILL.md) | You have a vague Truto issue and need a general investigation flow |
| [truto-customer-issue-debugger](./skills/truto-customer-issue-debugger/SKILL.md) | You have a customer ticket, incident note, or support problem |
| [truto-account-health-auditor](./skills/truto-account-health-auditor/SKILL.md) | You need to check whether an integrated account is healthy |
| [truto-api-call-reproducer](./skills/truto-api-call-reproducer/SKILL.md) | You need the smallest CLI command that reproduces an API behavior |
| [truto-export-diff-analyst](./skills/truto-export-diff-analyst/SKILL.md) | You need to compare records, datasets, accounts, or raw-vs-unified output |
| [truto-docs-capabilities-auditor](./skills/truto-docs-capabilities-auditor/SKILL.md) | Tools, schemas, docs, MCP, AI exposure, or capabilities look missing/stale |
| [truto-environment-override-auditor](./skills/truto-environment-override-auditor/SKILL.md) | You need to inspect or safely patch environment integration overrides |
| [truto-integration-config-auditor](./skills/truto-integration-config-auditor/SKILL.md) | You need to validate integration JSON or stored integration config |
| [truto-integration-build-planner](./skills/truto-integration-build-planner/SKILL.md) | You want an AI-assisted integration build dry run from provider docs |
| [truto-mapping-tester](./skills/truto-mapping-tester/SKILL.md) | Unified output, JSONata mappings, or proxy-vs-unified behavior is wrong |
| [truto-safe-admin-operator](./skills/truto-safe-admin-operator/SKILL.md) | You are about to run any Truto command that changes state or has side effects |
| [truto-sync-job-validator](./skills/truto-sync-job-validator/SKILL.md) | You need to review, dry-run, or debug a sync job or sync job template |
| [truto-webhook-workflow-debugger](./skills/truto-webhook-workflow-debugger/SKILL.md) | Webhooks, workflow runs, notifications, or event delivery are failing |

Example prompts:

```text
Use truto-customer-issue-debugger for this customer ticket. Profile is staging, tenant_id is acme, integration is hubspot, error is 403 on contacts list.

Use truto-sync-job-validator. Check sync job sj_123 against account ia_456, dry-run only.

Use truto-safe-admin-operator before applying this environment integration override.
```

## Rules (Cursor only)

| Rule | Description |
|------|-------------|
| [truto-api](./rules/truto-api.mdc) | Always-apply rule with API conventions — base URL, auth header, URL patterns, pagination |

For Claude Code, the same content is delivered via the model-invoked `truto-api-conventions` skill above (Claude Code plugins do not have an "always-applied rule" primitive).

## What is Truto?

Truto is a unified API platform that lets you integrate with 200+ third-party tools (CRMs, ticketing systems, HRIS, ATS, and more) through a single API. Instead of building and maintaining individual integrations, you connect once to Truto and access all supported tools through a consistent interface.

**Key capabilities:**

- **Unified APIs** — Read and write data across integrations using a single schema
- **Proxy APIs** — Pass through requests directly to the underlying tool's native API
- **Sync Jobs** — Automatically sync data from integrated accounts on a schedule
- **Webhooks** — Receive real-time notifications when data changes
- **Custom APIs** — Define your own API endpoints with custom logic
- **MCP Server** — Use Truto as a Model Context Protocol server for AI agents

## Resources

- [Truto Documentation](https://truto.one/docs)
- [Truto Dashboard](https://app.truto.one)
- [API Reference](https://truto.one/docs/api-reference)
- [Truto Website](https://truto.one)

## Changelog

See [CHANGELOG.md](./CHANGELOG.md) for the full history of skill additions and changes.

## License

Apache-2.0 — see [LICENSE](./LICENSE) for details.
