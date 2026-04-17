---
name: truto
description: Write application code that integrates with third-party tools via the Truto unified API. Covers API calls, webhook handlers, connection flows, and data access patterns for use in the user's codebase.
---

# Truto — Unified API Platform

Use this skill when writing code in the user's application that calls the Truto API. This skill helps you build integration features — API calls, webhook handlers, connection UIs, and data-access layers — that run as part of the user's product.

This skill is about **code that lives in the user's codebase**. For admin setup, one-time debugging, and data exploration in the terminal, see the **Truto CLI** skill instead.

**Important:** The Truto API token (`TRUTO_API_TOKEN`) must only be used on the backend. Never expose it to the browser or include it in client-side code.

## When to Use

- Writing API calls to read or write data through Truto (unified, proxy, or custom APIs)
- Building a connection flow for end-users using Truto Link
- Adding webhook handlers to receive real-time events from Truto
- Implementing pagination, error handling, or retry logic for Truto API calls
- Choosing between unified, proxy, and custom APIs for a use case

## Core Concepts

| Concept | Description | Reference |
|---------|-------------|-----------|
| **Environment** | Isolated workspace scoping all resources. API tokens are tied to one environment. | [Core Resources](./references/core-resources.md) |
| **Integration** | A third-party tool definition (e.g., Salesforce, Jira, Slack). | [Core Resources](./references/core-resources.md) |
| **Environment Integration** | An integration installed into a specific environment with optional config overrides. | [Core Resources](./references/core-resources.md) |
| **Integrated Account** | A connected instance of an integration for a specific tenant (end-user). | [Core Resources](./references/core-resources.md) |
| **Tenant** | Your end-user or customer, identified by `tenant_id` on integrated accounts. | [Core Resources](./references/core-resources.md) |
| **Unified API** | Standardized CRUD endpoints across integrations using a common schema. | [Unified API](./references/unified-api.md) |
| **Proxy API** | Pass-through to the native API of the underlying tool. | [Proxy & Custom API](./references/proxy-and-custom-api.md) |
| **Custom API** | User-defined API endpoints with custom routing logic. | [Proxy & Custom API](./references/proxy-and-custom-api.md) |
| **Sync Job** | Scheduled or on-demand data synchronization from integrated accounts. | [Sync Jobs](./references/sync-jobs.md) |
| **Webhook** | HTTP callbacks for real-time event notifications. | [Webhooks & Notifications](./references/webhooks-and-notifications.md) |
| **Datastore** | External storage destinations (MongoDB, GCS, S3, Qdrant) for sync job output. | [Datastores](./references/datastores.md) |
| **Workflow** | Event-driven automation triggered by Truto events. | [Workflows](./references/workflows.md) |

## Getting Started

### 1. Get an API Token

Create an API token in the [Truto Dashboard](https://app.truto.one). API tokens can only be created through the dashboard — not via the API or CLI.

Store it as a server-side environment variable (`TRUTO_API_TOKEN`). This token must **only be used on the backend** — never send it to the browser.

### 2. Create a Backend Route for Link Tokens

Your backend needs an endpoint that generates link tokens for the Truto Link connection flow. This route should handle **both** new connections and reconnections from the start — this prevents users from creating duplicate accounts when an existing connection fails.

```typescript
app.post("/api/truto/link-token", async (req, res) => {
  const { tenantId, integratedAccountId } = req.body;

  // Reconnect an existing account, or create a new one
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

When reconnecting, pass `integrated_account_id` instead of `tenant_id`. This updates the existing account's credentials in place — the same `integrated_account_id` is preserved, so all sync jobs, webhooks, and references remain intact. Setting `persist_previous_context: true` keeps any custom context from the previous connection.

### 3. Embed Truto Link in Your Frontend

Install the [Truto Link SDK](https://www.npmjs.com/package/@truto/truto-link-sdk) to embed the connection flow in your UI:

```bash
npm install @truto/truto-link-sdk
```

Then use it in your frontend. The same `authenticate()` call works for both new connections and reconnections — the difference is in the link token your backend generates:

```typescript
import authenticate from "@truto/truto-link-sdk";

async function getLinkToken(body: Record<string, string>) {
  const res = await fetch("/api/truto/link-token", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const { linkToken } = await res.json();
  return linkToken;
}

async function openTrutoLink(linkToken: string) {
  try {
    const result = await authenticate(linkToken);
    console.log("Connected:", result.integrated_account_id);
    return result;
  } catch (err) {
    if (err === "closed") {
      console.log("User closed the connection dialog");
    } else {
      console.error("Connection failed:", err);
    }
    throw err;
  }
}

// New connection
const linkToken = await getLinkToken({ tenantId: "tenant-123" });
await openTrutoLink(linkToken);

// Reconnect an existing account (e.g., expired OAuth token)
const reconnectToken = await getLinkToken({ integratedAccountId: "existing-account-id" });
await openTrutoLink(reconnectToken);
```

See the **Truto Link SDK** skill for the full SDK reference, including popup mode, same-window redirects, RapidForm, file pickers, and error handling.

### 4. Listen for the Account to Become Active

After a user connects, the account goes through post-install and validation steps before it's ready. Set up a [webhook](./references/webhooks-and-notifications.md) to listen for the `integrated_account:active` event — this tells you the account is connected and ready for API calls. See [Connection Flow](./references/connection-flow.md) for the full lifecycle and all events.

```typescript
// Backend webhook handler
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

You can also use **Truto Workflows** to automatically trigger actions (like starting a sync job) when an account becomes active. See [Workflows](./references/workflows.md) for details.

### 5. Read Data via the Unified API

Once an account is active, fetch normalized data:

```typescript
const accountId = "<integrated_account_id>";

const response = await fetch(
  `https://api.truto.one/unified/crm/contacts?integrated_account_id=${accountId}`,
  {
    headers: {
      "Authorization": `Bearer ${process.env.TRUTO_API_TOKEN}`,
    },
  }
);

const { result, next_cursor } = await response.json();
```

### 6. Write Data

```typescript
const response = await fetch(
  `https://api.truto.one/unified/crm/contacts?integrated_account_id=${accountId}`,
  {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${process.env.TRUTO_API_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      first_name: "Jane",
      last_name: "Doe",
      email: "jane@example.com",
    }),
  }
);
```

### 7. Use the Proxy API for Native Access

When you need integration-specific fields not in the unified schema:

```typescript
const response = await fetch(
  `https://api.truto.one/proxy/contacts?integrated_account_id=${accountId}`,
  {
    headers: {
      "Authorization": `Bearer ${process.env.TRUTO_API_TOKEN}`,
    },
  }
);
```

## When to Use Unified vs Proxy vs Custom API

| Use Case | API | Why |
|----------|-----|-----|
| Standardized CRUD across integrations | **Unified** | Same request/response schema regardless of the underlying tool |
| Access native API features not in unified schema | **Proxy** | Full access to the tool's native endpoints |
| Custom business logic or transformations | **Custom** | Define your own endpoints with custom routing |
| Bulk data operations with dependencies | **Batch Request** | Execute multiple API calls with dependency graph in one request |

## Authentication

All API requests use Bearer token authentication. The API token must only be used server-side. See [Authentication](./references/authentication.md) for details on API tokens, link tokens, and integrated account tokens.

## References

| Document | Topics |
|----------|--------|
| [Authentication](./references/authentication.md) | API tokens, link tokens, integrated account tokens, auth patterns |
| [MCP Tokens](./references/mcp-tokens.md) | MCP protocol tokens for AI agents, tool filtering, expiration |
| [Connection Flow](./references/connection-flow.md) | Connection lifecycle, reconnecting accounts, webhook events, post-connection automation |
| [Core Resources](./references/core-resources.md) | Environments, integrations, integrated accounts, teams |
| [Integrated Account Context](./references/integrated-account-context.md) | Context field lifecycle, credentials, instance config, usage in APIs/sync/workflows |
| [Unified API](./references/unified-api.md) | Unified CRUD, meta endpoints, pagination, SuperQuery |
| [Proxy & Custom API](./references/proxy-and-custom-api.md) | Proxy pass-through, custom endpoints, batch requests |
| [Sync Jobs](./references/sync-jobs.md) | Sync jobs, runs, cron triggers, templates, run state |
| [Webhooks & Notifications](./references/webhooks-and-notifications.md) | Webhooks, notification destinations, inbound webhooks |
| [Datastores](./references/datastores.md) | External storage destinations (MongoDB, GCS, S3, Qdrant) for sync job output |
| [Workflows](./references/workflows.md) | Event-driven automations triggered by Truto events |
| [Files & Logs](./references/files-and-logs.md) | File uploads and API/operation log queries |
| [Static Gates](./references/static-gates.md) | Embeddable connection entry points |
| [Daemon Jobs](./references/daemon-jobs.md) | Background processing tasks and runs |

## Companion: Truto CLI

For setup tasks — creating integrations, connecting test accounts, exploring available resources, debugging API calls — use the **Truto CLI** skill. The CLI is an admin and debugging tool you run in the terminal; this skill is for the integration code that lives in your application.
