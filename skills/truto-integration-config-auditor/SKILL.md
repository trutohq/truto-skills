---
name: truto-integration-config-auditor
description: Audit Truto integration JSON or stored integration configs for syntax, schema validity, provider-doc alignment, auth, pagination, resource methods, docs-table behavior, capabilities, and repo conventions. Use when validating or reviewing an integration config.
---

# Truto Integration Config Auditor

Use this skill to prove whether an integration config is valid, documented, and aligned with provider behavior.

Pair with the Truto CLI skill. Pair with truto-jsonata when reviewing expressions.

## Inputs

Accept any of:

- Local config file
- Stored integration slug or ID
- Provider docs URL/path
- Profile
- Resource allow-list
- Suspected failing method
- Customer issue

## Validation Ladder

Local file:

```bash
jq . "$CONFIG_FILE" >/dev/null
truto integrations validate --file "$CONFIG_FILE" -p "$PROFILE" -o json
```

Stored integration:

```bash
truto integrations list --name "$INTEGRATION" -p "$PROFILE" -o json
truto integrations get "$INTEGRATION_ID" -p "$PROFILE" -o json
truto integrations validate "$INTEGRATION_ID" -p "$PROFILE" -o json
truto integrations tools "$INTEGRATION_ID" -p "$PROFILE" -o json
truto capabilities "$INTEGRATION" --target integration -p "$PROFILE" -o json
```

Provider-doc comparison:

```bash
truto integrations build "$DOC_SOURCE" "$INTEGRATION" --dry-run --strict --plan-out --report-out -p "$PROFILE"
```

Add `--resources "$RESOURCES"` for focused review.

## Audit Focus

Check:

- JSON parses before deeper review.
- CLI validation passes or gives clear schema paths.
- Auth type, auth placement, token refresh, base URL, and sandbox/prod host match provider docs.
- Resources and method names match provider concepts without accidental generic grouping.
- Paths, HTTP verbs, path params, query/body schemas, and required fields match docs.
- Pagination config matches provider examples and sample responses.
- Rate limits, retry behavior, webhooks, verification, and error envelopes match docs where available.
- Descriptions, query schemas, and body schemas are present in documentation rows when expected by capabilities/tools.
- Capabilities and tools expose what customers and AI surfaces need.
- No secrets or customer-specific credentials live in config JSON.

## Runtime Checks

For an account connected to this integration:

```bash
truto capabilities "$ACCOUNT_ID" --target account -p "$PROFILE" -o json
truto proxy "$RESOURCE" -m list -a "$ACCOUNT_ID" -p "$PROFILE" -o json -v
```

Use read-only calls unless the user explicitly asks to test a write method.

## Output

Lead with blockers. Then list:

- Provider-doc mismatches
- Runtime risks
- Docs/capability gaps
- Low-risk improvements
- Commands run
- Artifacts produced
- Safe apply or refresh plan
