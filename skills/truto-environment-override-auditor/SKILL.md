---
name: truto-environment-override-auditor
description: Inspect, validate, and safely patch Truto environment integration overrides against catalog config. Use for environment-only bugs or override reviews involving auth, pagination, rate limits, webhooks, base URLs, enablement, or account-specific behavior.
---

# Truto Environment Override Auditor

Use this skill to decide whether an environment integration override is necessary, correct, stale, too broad, or causing an environment-specific bug.

Pair with the Truto CLI skill. Pair with truto-jsonata when reviewing override expressions.

## Inputs

Use profile plus any of:

- Environment integration ID
- Integration slug or ID
- Account ID
- Customer symptom
- Resource/method
- Override JSON

## Fetch

```bash
truto whoami -p "$PROFILE" -o json
truto environment-integrations get "$ENV_INTEGRATION_ID" -p "$PROFILE" -o json
truto environment-integrations show-override "$ENV_INTEGRATION_ID" -p "$PROFILE" -o json
truto integrations get "$INTEGRATION_ID" -p "$PROFILE" -o json
```

If resolving from an account:

```bash
truto accounts get "$ACCOUNT_ID" -p "$PROFILE" -o json
truto capabilities "$ACCOUNT_ID" --target account -p "$PROFILE" -o json
```

## Review

Check:

- Environment install is enabled and shown in catalog as expected.
- Override only changes the intended surface.
- Auth override matches credential names stored in account context.
- Pagination override matches real provider response examples.
- Rate-limit expressions use documented headers/status and return useful numbers.
- Webhook verification and payload transform match provider docs and sample payloads.
- Override does not accidentally hide sibling config.
- Account-level failure is actually environment-specific before changing environment-wide behavior.

## Safe Patch Pattern

Prefer helper commands over replacing the whole override object:

```bash
truto environment-integrations override-auth "$ENV_INTEGRATION_ID" --stdin -p "$PROFILE" -o json < auth-override.json
truto environment-integrations override-pagination "$ENV_INTEGRATION_ID" --stdin -p "$PROFILE" -o json < pagination-override.json
truto environment-integrations override-rate-limit "$ENV_INTEGRATION_ID" --stdin -p "$PROFILE" -o json < rate-limit-override.json
truto environment-integrations override-webhook "$ENV_INTEGRATION_ID" --stdin -p "$PROFILE" -o json < webhook-override.json
```

Clear only one override key when rolling back:

```bash
truto environment-integrations override-auth "$ENV_INTEGRATION_ID" --clear -p "$PROFILE" -o json
```

Do not mutate unless the user explicitly asks for a patch.

## Verify

```bash
truto environment-integrations show-override "$ENV_INTEGRATION_ID" -p "$PROFILE" -o json
truto capabilities "$ACCOUNT_ID" --target account -p "$PROFILE" -o json
truto proxy "$RESOURCE" -m list -a "$ACCOUNT_ID" -p "$PROFILE" -o json -v
```

## Output

Return:

- Verdict: needed, correct, stale, too broad, or harmful
- Fields reviewed
- Evidence from base config, override, capabilities, and logs
- Patch or rollback plan
- Verification command
- Residual risk
