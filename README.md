# Truto Agent Skills

Official agent skills for [Truto](https://truto.one) — the unified API platform for integrating with third-party tools. Works with [Cursor](https://cursor.com), [Claude Code](https://docs.claude.com/en/docs/claude-code), and any other agent that supports the [Agent Skills](https://www.anthropic.com/news/skills) (`SKILL.md`) convention.

## Installation

### Claude Code

Add this repo as a plugin marketplace, then install the plugin:

```bash
/plugin marketplace add trutohq/truto-skills
/plugin install truto@truto-skills
```

Skills become namespaced as `truto:truto`, `truto:truto-cli`, `truto:truto-jsonata`, `truto:truto-link-sdk`, and `truto:truto-api-conventions`. To try it locally before installing, run `claude --plugin-dir /path/to/truto-skills`.

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

| Skill | Description |
|-------|-------------|
| [truto](./skills/truto/SKILL.md) | Build integrations with third-party tools using Truto's unified API platform |
| [truto-link-sdk](./skills/truto-link-sdk/SKILL.md) | Embed the Truto connection flow in your frontend using `@truto/truto-link-sdk` |
| [truto-cli](./skills/truto-cli/SKILL.md) | Install, authenticate, and use the Truto CLI for managing integrations and accessing data |
| [truto-jsonata](./skills/truto-jsonata/SKILL.md) | Write JSONata expressions for Truto config (mappings, sync jobs, workflows) using the custom `$functions` from `@truto/truto-jsonata` |
| [truto-api-conventions](./skills/truto-api-conventions/SKILL.md) | Truto API conventions — base URL, auth, URL patterns, pagination, idempotency, and skill routing |

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
