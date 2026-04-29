---
name: truto-safe-admin-operator
description: Safely perform or prepare Truto CLI admin changes with preflight reads, local backups, schema validation, optimistic locking, minimal JSON bodies, scoped override helpers, verification, and rollback notes. Use before create, update, delete, override, refresh, schedule, test, build apply, or provider write commands.
---

# Truto Safe Admin Operator

Use this skill as the safety wrapper around any Truto CLI command that changes state or triggers side effects.

Pair with the Truto CLI skill. If another workflow skill recommends a mutation, apply this skill before running it.

## Mutating Surface

Treat these as mutating:

- `create`
- `update`
- `delete`
- `override-*`
- `refresh-credentials`
- `create-token`
- `link-tokens create`
- `sync-job-runs create`
- trigger `schedule`
- webhook or notification `test`
- `integrations build --yes`
- file uploads
- unified/proxy/custom create, update, delete, or provider write methods

## Approval Rule

If the user explicitly asked to make the change, proceed after preflight.

If the user asked to review, audit, plan, check, explain, or dry run, do not mutate. Provide the ready command and say what approval is needed.

## Preflight

Confirm scope:

```bash
truto whoami -p "$PROFILE" -o json
```

Fetch current state before changing an existing resource:

```bash
truto "$RESOURCE" get "$ID" -p "$PROFILE" -o json > /tmp/truto-before.json
```

For integrations:

```bash
truto integrations validate "$INTEGRATION_ID" -p "$PROFILE" -o json
```

For local config:

```bash
jq . "$CONFIG_FILE" >/dev/null
truto integrations validate --file "$CONFIG_FILE" -p "$PROFILE" -o json
```

## Change Design

- Patch the smallest field set.
- Include current `version` for resources that require optimistic locking.
- Use `--stdin` or `-b "$JSON"` instead of interactive prompts.
- Prefer override helper commands instead of replacing full override blobs.
- Save before/after JSON to `/tmp` for large or important changes.
- Never paste secrets into the final answer.

## Apply Templates

Update:

```bash
truto "$RESOURCE" update "$ID" -p "$PROFILE" -o json -b "$PATCH_JSON"
```

Create:

```bash
truto "$RESOURCE" create -p "$PROFILE" -o json -b "$BODY_JSON"
```

Environment override:

```bash
truto environment-integrations override-auth "$ENV_INTEGRATION_ID" --stdin -p "$PROFILE" -o json < auth-override.json
```

Delete only with exact target verification and explicit user intent:

```bash
truto "$RESOURCE" delete "$ID" -f -p "$PROFILE" -o json
```

## Verify

```bash
truto "$RESOURCE" get "$ID" -p "$PROFILE" -o json
truto capabilities "$ACCOUNT_OR_INTEGRATION" --target "$TARGET_KIND" -p "$PROFILE" -o json
truto logs --log-type unified_proxy_api --start "$START" --end "$END" -p "$PROFILE" -o json
```

Use resource-specific verification too: `show-override`, `accounts tools`, `integrations validate`, safe proxy/unified list, run status, or log status.

## Output

Report:

- Preflight evidence
- Exact change
- Command run or ready command
- Verification result
- Rollback note
- Residual risk

If no mutation happened, say that clearly.
