# Truto Agent Skills Plugin

Official [Cursor](https://cursor.com) plugin for [Truto](https://truto.one) — the unified API platform for integrating with third-party tools.

## Installation

### Via `npx skills` (Recommended)

Install the skills into your project (or globally with `-g`):

```bash
npx skills add trutohq/truto-skills
```

This works for Cursor and any other agent supported by the [`skills`](https://www.npmjs.com/package/skills) CLI.

### Manual (Cursor — GitHub Remote Rule)

1. Open **Cursor Settings > Rules**
2. In the **Project Rules** section, click **Add Rule**
3. Select **Remote Rule (GitHub)**
4. Enter the repository URL: `https://github.com/trutohq/truto-skills`

## Skills

| Skill | Description |
|-------|-------------|
| [truto](./skills/truto/SKILL.md) | Build integrations with third-party tools using Truto's unified API platform |
| [truto-link-sdk](./skills/truto-link-sdk/SKILL.md) | Embed the Truto connection flow in your frontend using @truto/truto-link-sdk |
| [truto-cli](./skills/truto-cli/SKILL.md) | Install, authenticate, and use the Truto CLI for managing integrations and accessing data |

## Rules

| Rule | Description |
|------|-------------|
| [truto-api](./rules/truto-api.mdc) | Always-apply rule with API conventions — base URL, auth header, URL patterns, pagination |

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

## License

Apache-2.0 — see [LICENSE](./LICENSE) for details.
