# Getting Started with Truto (Day-1 Tutorial)

This is the fastest path from "I just heard of Truto" to "my application is making real unified-API calls against a real connected account." It strings together the **Truto CLI** for setup and exploration with the **Truto API** for the code that ships in your product.

You'll go from zero to a working integration in roughly 15 minutes.

## What you'll build

By the end of this tutorial you'll have:

1. The Truto CLI installed and authenticated.
2. A sandbox integrated account connected via `truto link-tokens` + the Truto Link SDK.
3. A backend route that mints link tokens for your end-users.
4. A backend webhook handler that knows when an account is ready.
5. A first unified-API call against the connected sandbox — the same call your app will make in production.

## Prerequisites

- A Truto team and an environment. Both are created via the [Truto Dashboard](https://app.truto.one) (the API doesn't create environments).
- An API token for that environment, also created via the dashboard. Store it as `TRUTO_API_TOKEN` in your shell.
- Node.js 18+ (for the link-token route examples) or any backend that can speak HTTP.

> Why the dashboard? Tokens, environments, and team membership are intentionally not API-creatable — they're the **bootstrap** that everything else hangs off. Once you have a token, the CLI and API can do everything else.

---

## Step 1 — Install and authenticate the CLI

```bash
curl -fsSL https://cli.truto.one/install.sh | bash
```

This drops the `truto` binary in `~/.truto/bin`. Add it to your `PATH` if your shell didn't pick it up.

Authenticate with the API token from the dashboard:

```bash
truto login --token "$TRUTO_API_TOKEN"
truto whoami -o json
```

`truto whoami` prints your team, environment, and token info. If you see your team name, you're in.

> **Tip.** Skip `truto login` entirely by setting `TRUTO_API_TOKEN` and passing `--token "$TRUTO_API_TOKEN"` on every command. Useful for CI; `login` is the easier path for local development.

---

## Step 2 — Discover what's available

Before you write any code, spend 60 seconds exploring what your environment already has.

```bash
truto environments list -o json
truto environment-integrations list -o json
truto integrations list -o json
```

The first command shows the environment your token belongs to. The second shows integrations already enabled in that environment (these are the ones your customers can connect via Truto Link). The third shows every integration the platform supports — the catalog you can install from.

If your environment doesn't have anything installed yet, the dashboard's "Integrations" page lets you install one in a click. Or, from the CLI:

```bash
truto environment-integrations create -b '{"integration_id":"<integration-id>"}'
```

Use `truto integrations list --name <name> -o json` to find the `integration_id` by slug (e.g. `hubspot`, `salesforce`).

---

## Step 3 — Connect your first sandbox account

For the rest of this tutorial we'll use a **sandbox** account — a connection Truto provisions against the integration's sandbox API rather than the live one. Sandboxes don't bill third-party API quota and can be revoked at any time.

The fastest way to get a sandbox is from the dashboard's "Accounts" page → "Connect Sandbox." You'll get an `integrated_account_id` back.

To grab it from the CLI:

```bash
truto accounts list --is_sandbox true -o json
```

Save the `id` field as `$ACCOUNT_ID`. We'll use it everywhere below.

> **Tip.** If you want every CLI command in this tutorial to use this account by default, set it as a profile-level default:
>
> ```bash
> truto profiles set default-integrated-account "$ACCOUNT_ID"
> ```

---

## Step 4 — Make your first unified-API call from the CLI

Before writing any application code, prove the data flow works end-to-end with the CLI:

```bash
truto unified crm contacts -a "$ACCOUNT_ID" -o json
```

You should see a paginated list of contacts in Truto's unified shape (`id`, `first_name`, `last_name`, `email`, etc.) — regardless of which CRM the sandbox is connected to. That's the point of the unified API: one shape across providers.

Other things to try:

```bash
# Get a single record by ID
truto unified crm contacts <contact-id> -m get -a "$ACCOUNT_ID" -o json

# Discover what resources/methods this account actually supports
truto accounts tools "$ACCOUNT_ID" -o json | jq '.[].name'

# Look at the raw provider response (no unification)
truto proxy contacts -a "$ACCOUNT_ID" -o json
```

`truto accounts tools` is the single most useful discovery command — it tells you exactly what the account can do, derived from the integration's mapping table. Use it whenever you're not sure whether a (resource, method) combination exists.

---

## Step 5 — Write the link-token route in your app

Now move from the terminal into your application code. Your backend needs **one** route that mints link tokens for your end-users — the Truto Link SDK in your frontend will call it before opening the connection UI.

The route handles **both** new connections (pass `tenant_id`) and reconnections (pass `integrated_account_id` instead). Wiring both from the start prevents users from creating duplicate accounts when an existing connection fails.

### Express

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

### Next.js Route Handler (App Router)

```typescript
export async function POST(req: Request) {
  const { tenantId, integratedAccountId } = await req.json();

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
  return Response.json({ linkToken: link_token });
}
```

### Hono / Cloudflare Workers

```typescript
app.post("/api/truto/link-token", async (c) => {
  const { tenantId, integratedAccountId } = await c.req.json();

  const body = integratedAccountId
    ? { integrated_account_id: integratedAccountId, persist_previous_context: true }
    : { tenant_id: tenantId };

  const response = await fetch("https://api.truto.one/link-token", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${c.env.TRUTO_API_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  const { link_token } = await response.json();
  return c.json({ linkToken: link_token });
});
```

The shape is the same in every framework — a server-side `fetch` to `POST /link-token` carrying the API token. Pick the variant that matches your stack.

> **`TRUTO_API_TOKEN` must stay on the server.** Never expose it to the browser, and never hardcode it in client bundles. The whole point of link tokens is that they're short-lived, single-use credentials safe for the frontend; the API token isn't.

You can verify the route works without a frontend by minting a token from the CLI:

```bash
truto link-tokens create --tenant-id "test-tenant-123"
```

The CLI command hits the same endpoint your backend calls.

---

## Step 6 — Embed Truto Link in your frontend

Install the SDK:

```bash
npm install @truto/truto-link-sdk
```

Then wire it up. The same `authenticate()` call works for both new connections and reconnections — the difference is in the link token your backend generates:

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

const linkToken = await getLinkToken({ tenantId: "tenant-123" });
await openTrutoLink(linkToken);
```

See the **Truto Link SDK** skill for popup mode, same-window redirects, RapidForm, file pickers, and full error handling.

---

## Step 7 — Listen for the account to become active

A new account isn't immediately usable — Truto runs post-install and validation steps first. Your backend should listen for the `integrated_account:active` webhook event and only enable features for that tenant once you receive it.

Set up an outbound webhook from the CLI:

```bash
truto webhooks create -b '{"target_url":"https://your-app.com/webhooks/truto"}'
```

(Or via the dashboard's Webhooks page.)

Then handle it in your app:

```typescript
app.post("/webhooks/truto", async (req, res) => {
  const event = req.body;

  switch (event.event_type) {
    case "integrated_account:active":
      await onAccountReady(event.payload);
      break;

    case "integrated_account:post_install_error":
    case "integrated_account:validation_error":
      await onAccountError(event.payload);
      break;
  }

  res.sendStatus(200);
});
```

See [Connection Flow](./connection-flow.md) for the full lifecycle and every event Truto emits.

---

## Step 8 — Make the same unified call from your app

Now port the CLI call from Step 4 into your application code. Same endpoint, same auth header, same response shape:

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

That's it — `result` is the array of unified contacts, `next_cursor` is the pagination cursor. Pass it back as `?next_cursor=...` to walk subsequent pages.

To write data back:

```typescript
await fetch(
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

---

## Where to go from here

You now have the loop closed end-to-end: **CLI for exploration, code for the live path, webhooks for state changes**. Common next steps:

| You want to… | Go to |
|---|---|
| Pick which API to use for a given use case (unified vs proxy vs custom) | [Unified API](./unified-api.md) and [Proxy & Custom API](./proxy-and-custom-api.md) |
| Customize how a unified field maps for one of your environments | [Unified API Customization](./unified-api-customization.md) |
| Override an integration's auth header, pagination, rate-limit, or webhook handling | [Customizing Integrations](./customizing-integrations.md) |
| Schedule a recurring data sync into your database / object store | [Sync Jobs](./sync-jobs.md) |
| React to third-party events with serverless automations | [Workflows](./workflows.md) |
| Reconnect an expired-token account without losing the `integrated_account_id` | [Connection Flow → Reconnecting Accounts](./connection-flow.md) |
| Expose your customer's connected tools to their AI agent via MCP | [MCP Tokens](./mcp-tokens.md) |

And for the CLI itself:

| You want to… | Go to |
|---|---|
| Reference every CLI command and its flags | [Truto CLI skill](../../truto-cli/SKILL.md) |
| Bulk-export a resource with auto-pagination | [Power Features → Export](../../truto-cli/references/power-features.md) |
| Pipe `truto` output into other tools | [Common Patterns → Output Piping](../../truto-cli/references/common-patterns.md#output-piping) |

---

## Troubleshooting

**`truto whoami` returns 401.** The token is wrong or expired — re-create it from the dashboard and `truto login --token <new>` again.

**Unified call returns 404 / `resource not found`.** The account's integration doesn't have a base mapping for `(model, resource, method)`. Run `truto accounts tools "$ACCOUNT_ID" -o json` to see what *is* mapped.

**Unified call returns data but missing fields.** The base mapping doesn't surface them. Either drop down to `truto proxy <resource>` for the raw provider shape, or add an [environment override](./unified-api-customization.md#workflow-1--modify-an-existing-unified-api-mapping-per-environment) that includes the field.

**Webhook handler isn't being called.** Verify the subscription with `truto webhooks list -o json` and trigger a test with `truto webhooks test --id <webhook-id>`. If your URL is local, expose it with [ngrok](https://ngrok.com) or similar.

**Sandbox writes return 405.** Sandboxes are read-only by design. Either connect a real account (carefully — it touches the live third-party API) or move write tests to the proxy with a stubbed provider.

For deeper debugging, every CLI command supports `-v` to print request/response details to stderr — `truto unified crm contacts -a "$ACCOUNT_ID" -v -o json` shows exactly what URL was called, what headers were attached, and what came back.
