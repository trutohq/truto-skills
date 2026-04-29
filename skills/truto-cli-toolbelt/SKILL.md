---
name: truto-cli-toolbelt
description: Shared Truto CLI operating playbook for profiles, command discovery, structured output, account data-plane calls, logs, safe writes, and common gotchas. Use whenever an agent will run Truto CLI commands or prepare another Truto debugging workflow.
---

# Truto CLI Toolbelt

Use this skill as the baseline operating checklist for Truto CLI work.

The CLI is an admin and debugging surface. It manages integrations, environment integrations, accounts, docs, sync jobs, workflows, webhooks, logs, unified/proxy/custom APIs, exports, diffs, and mappings. Nothing it does belongs in application code.

Pair this with the Truto CLI skill for complete command syntax.

## Fast Start

```bash
truto whoami -p "$PROFILE" -o json
truto context
```

If no profile is provided, try the active profile with `truto whoami -o json`. Ask for a profile or token only if the active profile is missing or unsafe to assume.

## Hard Rules

- Use `-o json` for structured admin calls.
- Use `-o ndjson` for streaming exports or anything piped to `head`, `tail`, `grep`, or `jq -c`.
- Do not rely on default table output for IDs, URLs, JSON, or HTML. It can truncate.
- Run `truto capabilities <account-or-integration> -o json` before any unified, proxy, custom, export, or diff call.
- Copy resource names, methods, and model names from capabilities.
- Use `-v` only to debug HTTP behavior.
- Redact bearer tokens, cookies, API keys, OAuth secrets, authorization headers, and customer PII.
- Start read-only. Treat create, update, delete, override helpers, refresh credentials, token creation, test delivery, schedules, sync-job-run creation, file upload, and provider write methods as mutating.

## Entity Ladder

For account-specific issues:

```bash
truto accounts get "$ACCOUNT_ID" -p "$PROFILE" -o json
truto capabilities "$ACCOUNT_ID" --target account -p "$PROFILE" -o json
truto accounts tools "$ACCOUNT_ID" -p "$PROFILE" -o json
truto environment-integrations get "$ENV_INTEGRATION_ID" -p "$PROFILE" -o json
truto environment-integrations show-override "$ENV_INTEGRATION_ID" -p "$PROFILE" -o json
truto integrations get "$INTEGRATION_ID" -p "$PROFILE" -o json
```

For integration-level questions:

```bash
truto integrations list --name "$INTEGRATION" -p "$PROFILE" -o json
truto capabilities "$INTEGRATION" --target integration -p "$PROFILE" -o json
truto integrations tools "$INTEGRATION_ID" -p "$PROFILE" -o json
```

## Data-Plane Choice

Use unified when the question is about normalized cross-integration behavior:

```bash
truto unified "$MODEL" "$RESOURCE" -m list -a "$ACCOUNT_ID" -p "$PROFILE" -o json
```

Use proxy when the question is about provider-native data or integration config:

```bash
truto proxy "$RESOURCE" -m list -a "$ACCOUNT_ID" -p "$PROFILE" -o json
```

Use custom when you need to prove provider behavior outside mapped resources:

```bash
truto custom "$PATH" -m GET -a "$ACCOUNT_ID" -p "$PROFILE" -o json
```

## Evidence Standard

Collect enough to identify the layer:

- CLI scope: profile, API URL, team, environment
- Target: account, environment integration, catalog integration, model/mapping/docs where relevant
- Capability: account tools and capabilities
- Logs: `unified_proxy_api`, `rapid_bridge`, `webhook`, `sync_job_cron_trigger`, or `mcp`
- Reproduction: smallest read-safe command, with verbose output only if needed

## Output

Return profile used, target IDs, commands run, key evidence, likely layer, confidence, and next safe action.
