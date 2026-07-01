# P5 · Debug Webhook Delivery

**Use this when** a customer's endpoint isn't receiving sync records or account/event notifications. Note the difference from setup: this is about deliveries that should be happening and aren't. A "sync ran but our system got nothing" report almost always lands here, not in the sync job.

> Judgment, not a script — apply [the adaptive contract](../SKILL.md#the-adaptive-contract). The decisive question is *whose* fault: did Truto fail to deliver, or did the customer's endpoint reject what Truto sent? The `webhook_endpoint_status` field answers it directly — don't guess.

**Outbound vs inbound — make sure you're in the right playbook.** This is about Truto's **outbound** delivery *to* the customer's endpoint (`log_type: webhook`). If the problem is the opposite direction — a third-party provider isn't delivering events *into* Truto (an integrated-account or environment inbound webhook) — that's a different surface: see [Inbound Webhooks](../../truto/references/webhooks-and-notifications.md#inbound-webhooks) and the backend `truto://reference/third-party-webhooks`. A missing *inbound* event usually surfaces as `record:*` events never firing, not as a non-2xx `webhook_endpoint_status`.

## What you must establish

In order, because each gates the next:

1. Does the webhook **exist, is it active, and is it subscribed** to the right event?
2. Were **deliveries attempted** at all?
3. If attempted, did they **fail at the customer's endpoint**?

## Evidence — what to read

1. **The webhook config.** `GET /webhook?environment_id=…` to find it, then `GET /webhook/{id}`. Check `target_url`, `is_active`, and `event_types[]` — a webhook that isn't active, or isn't subscribed to the event in question, will never deliver. (The signing `secret` is only returned on create, never on read — its absence in a GET is normal, not the bug.)
2. **Delivery logs.** `GET /log` with `log_type: "webhook"`, filtered by `webhook_id` (and `event`). The key field is **`webhook_endpoint_status`** — the HTTP status the *customer's* endpoint returned to Truto's delivery attempt. Also read `event` and `status` ([`/log` quick-map](./error-and-evidence-model.md#the-log-quick-map)). One nuance: a **sync job's** webhook-destination leg is recorded on the *sync's* `rapid_bridge` logs as `webhook_successful`, not under this `webhook` log type — so for "the sync didn't deliver," start from [P4](./debug-sync-jobs.md#when-completed-but-the-destination-is-empty).
3. **A live test.** `call_platform_api { method: "POST", path: "/webhook/test", body: { id } }` sends a test event to the `target_url` and reports success/failure. It's an operational post — **classified read, no approval** — so use it freely to confirm whether the endpoint accepts a delivery right now.

## Branch on what you find

| Finding | Meaning | Where it goes |
| --- | --- | --- |
| **No webhook log entries at all** | Nothing was delivered. Either not subscribed to that event, `is_active: false`, or the upstream sync never produced records | Fix subscription/active state ([P1](./safe-admin-changes.md)); if records were expected, check the sync → [P4](./debug-sync-jobs.md) |
| Entries with `webhook_endpoint_status` 2xx | Truto delivered and the endpoint accepted — delivery is **not** the problem | Look upstream (was the data ever produced?) or at the customer's processing |
| Entries with non-2xx `webhook_endpoint_status` | The **customer's endpoint** rejected the delivery | Diagnose by code: `4xx` config/auth at their end, `5xx` their server is down, `413` payload too large, timeout |
| Customer reports signatures rejected | Their verification of `X-Truto-Signature` (HMAC-SHA256 of the body with the webhook `secret`) is failing | Secret/signature mismatch — confirm before touching the secret |
| Retries exhausted | The endpoint failed persistently | Their endpoint needs to come back / accept the payload |

When `webhook_endpoint_status` shows the customer's endpoint returned the error, the fix is on **their** side (or in `target_url`/subscription config) — not a Truto delivery bug.

## Skip / Stop

- **Skip** the config + log walk when the user has already confirmed events fire but their endpoint 500s — go straight to endpoint diagnosis and `POST /webhook/test`.
- **Stop** once you've established both: delivery-attempted vs not, and endpoint-accepts vs not. Those two bits fully locate the problem.

## Anti-patterns

- Regenerating the `secret` before you've confirmed an actual signature mismatch — you'll just break verification that was about to work and force the customer to re-store the new secret.
- Recreating the webhook blindly — a new webhook means a new id/secret and stale references, and it won't fix a customer-endpoint problem.
- Blaming Truto for non-delivery when `webhook_endpoint_status` shows the customer's endpoint rejected the payload.

## Supersedes / Reuses

- **Extends** the `truto://guide/webhook-setup` stub (which only covers *creating* and testing) with the *delivery-debugging* path.
- **Reuses** [Webhooks & Notifications](../../truto/references/webhooks-and-notifications.md), [Files & Logs](../../truto/references/files-and-logs.md), and the [Error & evidence model](./error-and-evidence-model.md). The backend `truto://reference/third-party-webhooks` covers inbound webhook receipt.
