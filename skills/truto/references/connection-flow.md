# Connection Flow

This reference covers the end-to-end lifecycle of connecting an end-user's third-party account through Truto — what happens at each stage, which webhook events fire, and how to automate post-connection setup.

## Overview

The connection flow has four stages:

1. **Your backend** generates a link token via the Truto API
2. **Your frontend** uses the Truto Link SDK to open the connection UI
3. **Truto** runs post-install and validation steps on the new account
4. **Your backend** receives a webhook when the account is active and ready

For the frontend SDK reference (display modes, options, error handling, RapidForm, file pickers), see the **Truto Link SDK** skill.

## Connection Lifecycle

When a user connects an account through Truto Link, the following steps happen in order:

### 1. Account Created

The integrated account is created with the user's credentials. Truto sends an `integrated_account:created` webhook event.

### 2. Post-Install Steps Run

Truto runs integration-specific setup steps (API calls, transformations) needed to make unified and proxy APIs work. If any step fails, Truto sends an `integrated_account:post_install_error` event, the user is notified on the connection screen, and the Truto Link SDK throws an error. Not all integrations have post-install steps.

### 3. Connection Validation Runs

Truto runs validation requests to verify the connection has the necessary permissions. If validation fails, Truto sends an `integrated_account:validation_error` event. You can configure custom validation steps in the installed integration settings.

### 4. Account Activated

The account is now ready for API calls. Truto sends an `integrated_account:active` event. **This is the event you should listen for** to know when to start using the account.

### 5. RapidForm Submitted (Optional)

If a post-connect form is configured, Truto sends an `integrated_account:post_connect_form_submitted` event after the user submits it.

> If post-install or validation steps fail, the integrated account is **not automatically deleted**. You need to handle cleanup yourself if needed.

## Webhook Events Summary

| Event | When |
|-------|------|
| `integrated_account:created` | Account credentials saved |
| `integrated_account:post_install_error` | Post-install setup failed |
| `integrated_account:validation_error` | Connection validation failed |
| `integrated_account:active` | Account is ready for API calls |
| `integrated_account:post_connect_form_submitted` | User submitted the RapidForm |
| `integrated_account:updated` | Existing account updated (also fires on reconnect instead of `:created`) |
| `integrated_account:reactivated` | A previously failed account moved back to `active` |
| `integrated_account:authentication_error` | Credentials became invalid (expired/revoked) |
| `integrated_account:deleted` | Account was deleted |

## Webhook Payload Shape

All `integrated_account:*` events deliver a payload with this shape (credentials redacted, `integration` trimmed to identity fields):

```json
{
  "id": "evt_...",
  "event": "integrated_account:active",
  "environment_id": "9c2e...",
  "webhook_id": "ww01...",
  "created_at": "2024-09-10 12:00:00",
  "payload": {
    "id": "abcd...",
    "tenant_id": "my-customer-123",
    "environment_id": "9c2e...",
    "environment_integration_id": "ee11...",
    "status": "active",
    "is_sandbox": false,
    "authentication_method": "oauth2",
    "region": "wnam",
    "context": {
      "subdomain": "acme",
      "oauth": { "scope": ["read", "write"] }
    },
    "object_store_context_fields": [],
    "integration": {
      "id": "a1b2...",
      "name": "salesforce",
      "config": { "label": "Salesforce" }
    },
    "environment_integration": {
      "id": "ee11...",
      "is_active": true
    },
    "created_at": "2024-09-10 11:59:50",
    "updated_at": "2024-09-10 12:00:00"
  }
}
```

For `integrated_account:post_install_error`, `integrated_account:validation_error`, and `integrated_account:authentication_error`, the same payload is sent but `payload.status` reflects the failure state and `payload.last_error` contains the error message.

For `integrated_account:deleted`, `payload` contains only `{ "id": "<deleted_account_id>" }`.

For details on which `context` fields are stripped before delivery, see [Integrated Account Context — Context in Webhook Payloads](./integrated-account-context.md#context-in-webhook-payloads).

## Handling Connection Events

Set up a webhook to listen for these events on your backend:

```typescript
app.post("/webhooks/truto", async (req, res) => {
  const event = req.body;

  switch (event.event_type) {
    case "integrated_account:active":
      // Account is ready — store the integrated_account_id,
      // start syncing data, enable features for this tenant
      await onAccountReady(event.payload);
      break;

    case "integrated_account:post_install_error":
    case "integrated_account:validation_error":
      // Connection failed — notify the user or retry
      await onAccountError(event.payload);
      break;
  }

  res.sendStatus(200);
});
```

## Reconnecting an Existing Account

When an account's credentials become invalid (expired OAuth token, rotated API key, revoked access), the account should be **reconnected** rather than replaced with a new one. Reconnecting preserves the same `integrated_account_id`, so all sync jobs, webhooks, workflows, and references in your application continue to work.

### Why Reconnect Instead of Creating a New Account

Creating a new account gives a new `integrated_account_id`. This means:

- All sync jobs tied to the old account stop working
- Webhook filters referencing the old account ID become stale
- Your application's stored references to the account ID break
- You end up with orphaned accounts cluttering the environment

Reconnecting avoids all of this by updating the credentials in place on the same account.

### When to Trigger a Reconnect

Detect failed accounts and prompt the user to reconnect. Common signals:

1. **API call failures** — Unified/proxy API calls return authentication errors (401/403). Your application should catch these and surface a "reconnect" action to the user.
2. **Account status change** — The integrated account's `status` field changes from `active` to an error state. You can check this via `GET /integrated-account/:id`.
3. **Sync job failures** — Sync job runs fail with credential errors. Listen for `sync_job_run:failed` webhook events.

### How to Reconnect

Create a link token with `integrated_account_id` instead of `tenant_id`:

```typescript
const response = await fetch("https://api.truto.one/link-token", {
  method: "POST",
  headers: {
    "Authorization": `Bearer ${process.env.TRUTO_API_TOKEN}`,
    "Content-Type": "application/json",
  },
  body: JSON.stringify({
    integrated_account_id: existingAccountId,
    persist_previous_context: true,
  }),
});

const { link_token: linkToken } = await response.json();
// Pass linkToken to authenticate() in the frontend — same as a new connection
```

**`persist_previous_context: true`** merges the existing account's context with any new context from the reconnection. Without this, the previous context is replaced.

### Reconnection Lifecycle

The lifecycle is the same as a new connection:

1. User re-authenticates through Truto Link (same `authenticate()` call in the frontend)
2. Credentials are updated on the existing integrated account
3. Post-install steps run (if defined)
4. Connection validation runs (if defined)
5. `integrated_account:active` event fires — the account is ready again

The key difference: no `integrated_account:created` event is sent on reconnect. Instead, Truto sends `integrated_account:updated` followed by `integrated_account:active`.

### Building Reconnect into Your Application

Always build both connect and reconnect flows from the start. Your backend link token route should accept an optional `integrated_account_id`:

```typescript
app.post("/api/truto/link-token", async (req, res) => {
  const { tenantId, integratedAccountId } = req.body;

  const body = integratedAccountId
    ? { integrated_account_id: integratedAccountId, persist_previous_context: true }
    : { tenant_id: tenantId };

  const response = await fetch("https://api.truto.one/link-token", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${process.env.TRUTO_API_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  const { link_token } = await response.json();
  res.json({ linkToken: link_token });
});
```

Your frontend should show a "Reconnect" button when an account is in a failed state, calling the same `authenticate()` flow with the existing account's ID passed to the backend. No `tenant_id` is needed for reconnection — the account already knows its tenant.

---

## Post-Connection Automation with Workflows

You can use Truto **Workflows** to automatically trigger actions when an account becomes active — for example, starting a sync job to pull data immediately after connection.

Workflows are event-driven automations configured in the Truto dashboard or API. They can listen for `integrated_account:active` and run a series of steps (create sync job runs, send notifications, etc.) without any code changes in your application.

See [Additional Resources](./additional-resources.md) for workflow API details, or use the Truto CLI to set up workflows: `truto workflows create`.
