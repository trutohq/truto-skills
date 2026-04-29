---
name: truto-cli-investigator
description: General Truto CLI investigation workflow for platform issues across accounts, integrations, environment integrations, docs, capabilities, logs, and proxy/unified/custom API behavior. Use when the user asks to investigate a Truto issue and no narrower Truto workflow skill clearly owns it.
---

# Truto CLI Investigator

Use this skill when the problem is vague and you need to turn it into an evidence-backed diagnosis.

Pair with the Truto CLI skill. If the issue becomes clearly about account health, mappings, sync jobs, webhooks, docs/capabilities, or safe mutations, switch to the narrower workflow skill.

## Intake

Proceed with any useful target:

- Profile
- Account ID
- Tenant ID
- Integration slug
- Environment integration ID
- Unified model/resource
- Proxy resource/method
- Time window
- Error message
- Customer issue text

Ask one concise question only when no safe target can be resolved.

Convert relative times like "today" or "yesterday" into explicit ISO windows before querying logs.

## Workflow

Confirm scope:

```bash
truto whoami -p "$PROFILE" -o json
```

Resolve the account when possible:

```bash
truto accounts get "$ACCOUNT_ID" -p "$PROFILE" -o json
truto accounts list --tenant-id "$TENANT_ID" -p "$PROFILE" -o json
truto accounts list --integration-name "$INTEGRATION" -p "$PROFILE" -o json
```

Discover supported behavior:

```bash
truto capabilities "$ACCOUNT_ID" --target account -p "$PROFILE" -o json
truto accounts tools "$ACCOUNT_ID" -p "$PROFILE" -o json
```

Trace config lineage:

```bash
truto environment-integrations get "$ENV_INTEGRATION_ID" -p "$PROFILE" -o json
truto environment-integrations show-override "$ENV_INTEGRATION_ID" -p "$PROFILE" -o json
truto integrations get "$INTEGRATION_ID" -p "$PROFILE" -o json
```

Pull narrow logs:

```bash
truto logs --log-type unified_proxy_api \
  --integrated-account-id "$ACCOUNT_ID" \
  --start "$START" --end "$END" \
  --limit 100 \
  -p "$PROFILE" -o json
```

Reproduce the smallest read-safe call:

```bash
truto proxy "$RESOURCE" -m "$METHOD" -a "$ACCOUNT_ID" -p "$PROFILE" -o json
truto unified "$MODEL" "$RESOURCE" -m "$METHOD" -a "$ACCOUNT_ID" -p "$PROFILE" -o json
```

Use `-v` only after the non-verbose command confirms the issue or lacks enough detail.

## Layer Classifier

Choose one primary layer:

- Account/auth: wrong account, expired token, missing scope, provider permission, reconnect required.
- Environment override: environment-specific auth, pagination, rate-limit, webhook, or base URL behavior.
- Catalog config: base integration path, verb, auth placement, pagination, response path, or error handling.
- Unified mapping: proxy works but unified output, filter, body, or error behavior is wrong.
- Docs/capabilities: runtime method exists but tool exposure, schema, or descriptions are missing or stale.
- Customer request: invalid ID, filter, body, unsupported operation, or provider plan limitation.
- Provider upstream: provider rejects or fails a valid request.
- Truto runtime: Truto 5xx, queue, durable-object, logging, or platform behavior.

## Output

Return:

- Scope and profile used
- Target IDs
- Commands run
- Key evidence
- Primary layer and confidence
- Reproduction command
- Next action or the command that would close the evidence gap
