---
name: truto-account-health-auditor
description: Audit Truto integrated account health before data-plane calls. Use for account auth, connection state, missing scopes/tools, stale data, reauth, blocked accounts, or when an account-specific unified/proxy/custom call fails.
---

# Truto Account Health Auditor

Use this skill to decide whether an integrated account is healthy enough to call, and whether the fix belongs to the customer, the provider, an environment override, the catalog integration, or Truto runtime.

Pair this with the Truto CLI skill for command syntax. Stay read-only unless the user explicitly asks for a refresh, reconnect, token creation, or other mutation.

## Inputs

Start with any of:

- Profile or API token context
- Integrated account ID
- Tenant ID
- Integration slug
- Sandbox flag
- Failing resource/method
- Time window or error text

If the account ID is unknown, resolve it with the narrowest safe filter:

```bash
truto accounts list --tenant-id "$TENANT_ID" -p "$PROFILE" -o json
truto accounts list --integration-name "$INTEGRATION" -p "$PROFILE" -o json
```

## Read-Only Workflow

Confirm scope:

```bash
truto whoami -p "$PROFILE" -o json
```

Inspect the account and its exposed tool surface:

```bash
truto accounts get "$ACCOUNT_ID" -p "$PROFILE" -o json
truto capabilities "$ACCOUNT_ID" --target account -p "$PROFILE" -o json
truto accounts tools "$ACCOUNT_ID" -p "$PROFILE" -o json
```

Trace the account back to the environment install and catalog integration:

```bash
truto environment-integrations get "$ENV_INTEGRATION_ID" -p "$PROFILE" -o json
truto environment-integrations show-override "$ENV_INTEGRATION_ID" -p "$PROFILE" -o json
truto integrations get "$INTEGRATION_ID" -p "$PROFILE" -o json
```

Check recent API behavior:

```bash
truto logs --log-type unified_proxy_api \
  --integrated-account-id "$ACCOUNT_ID" \
  --start "$START" --end "$END" \
  --limit 100 \
  -p "$PROFILE" -o json
```

Probe only with a known safe list/get method copied from capabilities:

```bash
truto proxy "$RESOURCE" -m list -a "$ACCOUNT_ID" -p "$PROFILE" -o json -v
truto unified "$MODEL" "$RESOURCE" -m list -a "$ACCOUNT_ID" -p "$PROFILE" -o json -v
```

## Health Checks

Check these in order:

- Profile points to the expected team and environment.
- Account belongs to the expected tenant and integration.
- Account status is active and `is_blocked` is false.
- Auth method and stored context match the integration's credential format.
- Provider scopes or permissions match the failing operation.
- Environment override does not break auth, base URL, pagination, rate-limit, or webhook behavior.
- Capabilities and account tools expose the expected resource/method.
- Logs show whether the failure is provider 401/403/429/5xx, Truto 5xx, mapping/runtime, or bad customer input.

## Mutations

Only run these after explicit approval:

```bash
truto accounts refresh-credentials "$ACCOUNT_ID" -p "$PROFILE" -o json
truto accounts create-token "$ACCOUNT_ID" -p "$PROFILE" -o json
truto link-tokens create --tenant-id "$TENANT_ID" --integrated-account-id "$ACCOUNT_ID" -p "$PROFILE" -o json
```

Never print returned tokens or secrets. Say what was created and how it was used.

## Output

Return:

- Health verdict
- Profile/environment used
- Account and integration IDs
- Key evidence
- Primary owner: customer, provider, environment override, catalog config, mapping, or Truto runtime
- Whether reauth is required
- Next safe command or fix plan
