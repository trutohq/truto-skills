---
name: truto-docs-capabilities-auditor
description: Audit Truto documentation rows and capabilities output for integrations, accounts, unified models, MCP, and AI tool readiness. Use when tools, methods, schemas, descriptions, docs, or capabilities are missing, stale, hidden, or inconsistent.
---

# Truto Docs Capabilities Auditor

Use this skill to explain why a method does or does not appear in capabilities, account tools, MCP, AI tools, or docs.

Pair with the Truto CLI skill. Treat docs rows and capabilities output as evidence, not guesses.

## Inputs

Use any of:

- Profile
- Integration slug or ID
- Environment integration ID
- Account ID
- Unified model ID
- Environment unified model ID
- Resource/method
- Missing tool name
- Expected docs page or schema

## Inspect

Capabilities:

```bash
truto capabilities "$INTEGRATION" --target integration -p "$PROFILE" -o json
truto capabilities "$ACCOUNT_ID" --target account -p "$PROFILE" -o json
truto capabilities "$ACCOUNT_ID" --target account --resource "$RESOURCE" --methods "$METHODS" -p "$PROFILE" -o json
```

Account tools:

```bash
truto accounts tools "$ACCOUNT_ID" -p "$PROFILE" -o json
```

Documentation rows require a filter:

```bash
truto docs list --integration_id "$INTEGRATION_ID" -p "$PROFILE" -o json
truto docs list --environment_integration_id "$ENV_INTEGRATION_ID" -p "$PROFILE" -o json
truto docs list --unified_model_id "$UNIFIED_MODEL_ID" -p "$PROFILE" -o json
truto docs list --environment_unified_model_id "$ENV_UNIFIED_MODEL_ID" -p "$PROFILE" -o json
```

If proxy methods disappear because descriptions are missing, retry capabilities with:

```bash
truto capabilities "$ACCOUNT_ID" --target account --no-has-description -p "$PROFILE" -o json
```

## Checks

- Resource/method exists in the integration config.
- Capabilities expose the method at integration level.
- Capabilities expose the method at account level.
- Account status or environment override explains any account-level difference.
- Description row exists for methods expected to be tool-exposed.
- Query schema exists when filters are meaningful.
- Body schema exists when create/update/custom body is meaningful.
- Environment-level docs intentionally override integration-level docs.
- Tool tags include expected resources where tool grouping matters.
- Inline method descriptions are not being mistaken for documentation rows.

## Refresh Planning

Use dry-run planning by default:

```bash
truto integrations build "$DOC_SOURCE" "$INTEGRATION" --descriptions-only --dry-run --plan-out --report-out -p "$PROFILE"
truto integrations build "$DOC_SOURCE" "$INTEGRATION" --rewrite-bad-descriptions --dry-run --plan-out --report-out -p "$PROFILE"
truto integrations build "$DOC_SOURCE" "$INTEGRATION" --resanitise-existing-docs --dry-run --plan-out --report-out -p "$PROFILE"
```

Use `--resources "$RESOURCES"` for a narrow refresh.

Do not apply generated docs changes unless the user explicitly approves.

## Output

Return:

- Missing or stale docs by resource/method
- Affected surfaces: capabilities, account tools, MCP, AI, public docs
- Exact evidence from capabilities/docs rows
- Whether this is missing config, missing docs, stale docs, or account/environment scoping
- Safest refresh or create-docs plan
