---
name: truto-customer-issue-debugger
description: End-to-end customer or support issue debugging with Truto CLI across profile scope, account, environment override, catalog config, docs, capabilities, logs, and actual proxy/unified/custom API reproduction. Use when a customer ticket, incident note, or support problem is provided.
---

# Truto Customer Issue Debugger

Use this skill to convert a customer issue into a support-ready root cause and next action.

Optimize for fast triage from short mobile prompts. Stay read-only unless the user explicitly asks for a fix.

## Minimum Useful Input

Any two are enough to begin:

- Profile or environment
- Account ID
- Tenant ID
- Integration slug
- Failing endpoint/resource/method
- Record ID
- Request body or query
- Time window
- Error text
- Expected behavior

Ask for account ID only if the issue cannot be tied to an account by tenant, integration, or logs. Ask for profile only if active profile scope is unsafe.

## Evidence Runbook

Confirm scope:

```bash
truto whoami -p "$PROFILE" -o json
```

Inspect account and exposed methods:

```bash
truto accounts get "$ACCOUNT_ID" -p "$PROFILE" -o json
truto capabilities "$ACCOUNT_ID" --target account -p "$PROFILE" -o json
truto accounts tools "$ACCOUNT_ID" -p "$PROFILE" -o json
```

Trace config lineage:

```bash
truto environment-integrations get "$ENV_INTEGRATION_ID" -p "$PROFILE" -o json
truto environment-integrations show-override "$ENV_INTEGRATION_ID" -p "$PROFILE" -o json
truto integrations get "$INTEGRATION_ID" -p "$PROFILE" -o json
truto integrations tools "$INTEGRATION_ID" -p "$PROFILE" -o json
```

Check docs and tool exposure when the issue mentions missing tools, MCP, AI, schema, or stale docs:

```bash
truto docs list --integration_id "$INTEGRATION_ID" -p "$PROFILE" -o json
truto docs list --environment_integration_id "$ENV_INTEGRATION_ID" -p "$PROFILE" -o json
```

Pull logs:

```bash
truto logs --log-type unified_proxy_api \
  --integrated-account-id "$ACCOUNT_ID" \
  --start "$START" --end "$END" \
  --limit 100 \
  -p "$PROFILE" -o json
```

Reproduce only the matching surface:

```bash
truto proxy "$RESOURCE" -m "$METHOD" -a "$ACCOUNT_ID" -p "$PROFILE" -o json -v
truto unified "$MODEL" "$RESOURCE" -m "$METHOD" -a "$ACCOUNT_ID" -p "$PROFILE" -o json -v
truto custom "$PATH" -m "$HTTP_METHOD" -a "$ACCOUNT_ID" -p "$PROFILE" -o json -v
```

Use custom to prove provider behavior when proxy or catalog config is suspect.

## Internal Questions

Answer these before reporting:

- Does the account belong to the expected customer, integration, and environment?
- Does the method exist in account tools and capabilities?
- Did logs capture the same failure for the same account and time?
- Does proxy/raw behavior work while unified fails?
- Does the provider return the same error through custom or proxy?
- Are docs rows missing for a method expected to appear in AI/MCP/tool surfaces?
- Is the request invalid for provider docs, customer scopes, or provider plan?

## Output

Return:

- Customer-safe impact summary
- Failing operation
- Evidence
- Root-cause lane
- Owner of the fix
- Customer workaround, if any
- Exact next command or patch plan

Redact secrets and avoid dumping full provider payloads.
