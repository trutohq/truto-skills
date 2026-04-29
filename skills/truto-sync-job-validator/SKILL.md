---
name: truto-sync-job-validator
description: Validate, dry-run, and debug Truto sync jobs or sync job templates with CLI, including runtime v4 structure, args, account capability checks, request-node reproductions, optional run creation, and rapid_bridge log review. Use for sync job review, testing, or failures.
---

# Truto Sync Job Validator

Use this skill to review whether a sync job is structurally valid, runnable against a specific account, and likely to produce the expected destination output.

Keep dry runs read-only. Creating a sync-job run is mutating and requires explicit approval.

## Inputs

Use any of:

- Sync job ID
- Sync job template ID
- Local JSON file
- Profile
- Account ID
- Args JSON
- Webhook ID
- Datastore ID
- SuperQuery region
- Failing run ID
- Log window

## Fetch

```bash
truto whoami -p "$PROFILE" -o json
truto sync-jobs get "$SYNC_JOB_ID" -p "$PROFILE" -o json
truto sync-job-templates get "$TEMPLATE_ID" -p "$PROFILE" -o json
truto sync-job-runs get "$RUN_ID" -p "$PROFILE" -o json
truto accounts get "$ACCOUNT_ID" -p "$PROFILE" -o json
truto capabilities "$ACCOUNT_ID" --target account -p "$PROFILE" -o json
truto accounts tools "$ACCOUNT_ID" -p "$PROFILE" -o json
```

For local JSON:

```bash
jq . "$FILE" >/dev/null
```

## Structural Review

Check:

- `default_runtime_version` is `4` for new v4 jobs.
- Top-level label, resources, and intentional `integration_name` exist.
- `args_schema` contains runtime values used by placeholders.
- `args_validation` returns `null` on success or an object with a useful `message` on failure.
- Every node name is unique.
- Every `depends_on` targets an existing node.
- `request.resource` is an explicit unified path like `ticketing/tickets` unless proxy/native behavior is intentional.
- Request `query`, `body`, `id`, `loop_on`, `recurse`, and `run_if` paths refer to available args, resources, payload, or sync job run state.
- Incremental filters match the integration's unified query mapping.
- Destination `resources_to_persist` references valid node outputs.
- Optional destinations have `run_if` guards.
- `mutex_key` and `state_key` are stable per account/customer.

## Read-Only Dry Run

Reproduce each request node as a small data-plane read. Substitute args and loop values manually:

```bash
truto unified "$MODEL" "$RESOURCE" -m "$METHOD" -a "$ACCOUNT_ID" -q "$QUERY_PARAMS" -p "$PROFILE" -o json -v
truto proxy "$RESOURCE" -m "$METHOD" -a "$ACCOUNT_ID" -q "$QUERY_PARAMS" -p "$PROFILE" -o json -v
```

For transforms, capture a representative raw response and review JSONata with truto-jsonata. For datastore outputs, verify generated config unless the user authorizes an actual run.

## Actual Run

Only after explicit approval:

```bash
truto sync-job-runs create -p "$PROFILE" -o json -b "$RUN_BODY_JSON"
truto sync-job-runs get "$RUN_ID" -p "$PROFILE" -o json
truto logs --log-type rapid_bridge --sync-job-run-id "$RUN_ID" -p "$PROFILE" -o json
```

Poll sparingly until completed, failed, or stopped.

If run ID is unknown:

```bash
truto logs --log-type rapid_bridge --sync-job-id "$SYNC_JOB_ID" --integrated-account-id "$ACCOUNT_ID" -p "$PROFILE" -o json
```

## Output

Return:

- Verdict grouped as blockers, likely runtime failures, destination risks, and improvements
- Exact request-node reproductions
- Run/log evidence if executed
- Smallest safe fix
