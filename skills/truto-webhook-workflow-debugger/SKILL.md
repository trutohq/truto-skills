---
name: truto-webhook-workflow-debugger
description: Debug Truto webhooks, webhook logs, workflows, workflow runs, notification destinations, sync-job webhook delivery, and event-triggered automation with CLI. Use for delivery failures, missing events, verification issues, workflow failures, or notification problems.
---

# Truto Webhook Workflow Debugger

Use this skill to build an event timeline from config, logs, and run records.

Identify whether the issue is a missing trigger, disabled config, payload/condition mismatch, delivery failure, provider/API failure, or runtime error.

## Inputs

Use any of:

- Profile
- Webhook ID
- Workflow ID
- Workflow run ID
- Notification destination ID
- Account ID
- Event name
- Target URL
- Sync job run ID
- Time window

## Webhooks

```bash
truto webhooks list -p "$PROFILE" -o json
truto webhooks get "$WEBHOOK_ID" -p "$PROFILE" -o json
truto logs --log-type webhook \
  --webhook-id "$WEBHOOK_ID" \
  --start "$START" --end "$END" \
  --limit 100 \
  -p "$PROFILE" -o json
```

For sync job delivery:

```bash
truto sync-job-runs get "$SYNC_JOB_RUN_ID" -p "$PROFILE" -o json
truto logs --log-type rapid_bridge \
  --webhook-id "$WEBHOOK_ID" \
  --start "$START" --end "$END" \
  --limit 100 \
  -p "$PROFILE" -o json
```

## Workflows

```bash
truto workflows list -p "$PROFILE" -o json
truto workflows get "$WORKFLOW_ID" -p "$PROFILE" -o json
truto workflow-runs list --workflow_id "$WORKFLOW_ID" --status "$STATUS" -p "$PROFILE" -o json
truto workflow-runs get "$WORKFLOW_RUN_ID" -p "$PROFILE" -o json
```

## Notifications

```bash
truto notification-destinations list -p "$PROFILE" -o json
truto notification-destinations get "$DESTINATION_ID" -p "$PROFILE" -o json
```

## Test Policy

These send external events. Run only after explicit approval:

```bash
truto webhooks test --id "$WEBHOOK_ID" -p "$PROFILE" -o json
truto notification-destinations test --id "$DESTINATION_ID" -p "$PROFILE" -o json
```

## Diagnosis

Check:

- Config is active.
- Target URL or destination is correct.
- Expected event name matches filters and conditions.
- Logs show whether an event was created, attempted, retried, delivered, or rejected.
- Delivery failure includes status code and response summary.
- Workflow run failed due to condition mismatch, step config, provider/API call, or runtime error.
- Sync job finished and produced destination payload before webhook delivery was expected.

## Output

Return:

- Event timeline
- Missing or failing stage
- Evidence
- Whether a safe test is allowed
- Next fix or next command
