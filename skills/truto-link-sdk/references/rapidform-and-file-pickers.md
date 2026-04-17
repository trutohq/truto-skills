# RapidForm & File Pickers

## RapidForm (Post-Connect Form)

If an integration has a post-connect form configured (RapidForm), it appears automatically after connection. You can also open it separately using `rapidForm()` — for example, to let a user reconfigure their connection settings later.

```typescript
import { rapidForm } from "@truto/truto-link-sdk";

const result = await rapidForm(integratedAccountToken, {
  integration: "hubspot",
});
// result: { result: string; integration: string; integrated_account_id: string }
```

### rapidForm(integratedAccountToken, options?)

The first argument is an **integrated account token** (not a link token). Generate one from your backend:

```typescript
const response = await fetch("https://api.truto.one/integrated-account/token", {
  method: "POST",
  headers: {
    "Authorization": `Bearer ${process.env.TRUTO_API_TOKEN}`,
    "Content-Type": "application/json",
  },
  body: JSON.stringify({ integrated_account_id: accountId }),
});
const { token } = await response.json();
```

### Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `integration` | string | — | Integration name |
| `iframe` | boolean | `true` | Use iframe overlay vs popup |
| `sameWindow` | boolean | `false` | Full-page navigation (no Promise returned) |
| `additionalContext` | object | — | Extra context to store on the integrated account |
| `preventDeselect` | object | — | Fields that cannot be deselected: `{ fieldName: { message: "reason" } }` |
| `disabledFields` | object | — | Fields that are read-only: `{ fieldName: { message: "reason" } }` |
| `baseUrl` | string | `https://app.truto.one` | Override the Truto app URL |
| `width` | number | 700 | Popup width (only when `iframe: false`) |
| `height` | number | 800 | Popup height (only when `iframe: false`) |

**Returns:** `Promise<{ result: string; integration: string; integrated_account_id: string }>` — or `undefined` if `sameWindow` is true.

---

## File Pickers

The SDK includes native cloud file pickers for several integrations. These open the vendor's own file selection UI, then persist the user's selections to the integrated account's `context.drive_items` via the Truto API.

```typescript
import { showFilePicker } from "@truto/truto-link-sdk";

const files = await showFilePicker("googledrive", integratedAccountToken, {
  // Integration-specific picker config (see below)
});
```

### showFilePicker(integrationName, integratedAccountToken, config?)

**Returns:** `Promise` resolving to the array of picked items (possibly transformed by `trutoExpression`).

### Supported Integrations

| Integration Name | Picker Type | Notes |
|-----------------|-------------|-------|
| `sharepoint` | Microsoft File Picker v8 | Uses `context.rootSiteUrl` from the integrated account |
| `onedrive` | Microsoft File Picker v8 | Uses `context.rootUrl` and `context.accountType` |
| `googledrive` or `google` | Google Picker | Standard Google file picker |
| `box` | Box Content Picker | Loads Box Elements from CDN |
| `dropbox` or `dropboxpersonal` | Dropbox Chooser | **`appKey` is required** in config (throws if missing) |

### Cross-Cutting Config Options

These options work across all integrations:

| Option | Type | Description |
|--------|------|-------------|
| `trutoExpression` | string | JSONata expression applied to the array of picked items before storing |
| `truto_upsert_drive_items` | boolean | If `true`, merge with existing `drive_items` on the account (deduped by `id`). If `false`, replace. |

### Integration-Specific Config

Each integration accepts its vendor's native picker configuration, deep-merged with the SDK's defaults:

- **SharePoint / OneDrive:** Microsoft File Picker v8 JSON configuration
- **Google Drive:** Google Picker options (`appId`, `developerKey`, `views`, `enableFeature`, `disableFeature`, `title`, `locale`, `maxItems`, `origin`, `selectableMimeTypes`, `size`)
- **Box:** Box Content Picker options
- **Dropbox:** Dropbox Chooser options (`appKey` required)

### Error Handling

| Scenario | Behavior |
|----------|----------|
| User cancels file selection | Promise rejects with `Error: User cancelled file selection` |
| Dropbox missing `appKey` | Throws `Error: Dropbox app key is required` |
| Unknown integration name | Returns `undefined` (no error thrown) |
| API error saving selections | Promise rejects with the API error |

### How Selections Are Stored

Selected files are saved to `context.drive_items` on the integrated account via:

1. `GET /integrated-account/me` — fetch current context
2. `PATCH /integrated-account/me` — merge updated `drive_items` into context

When `truto_upsert_drive_items` is `true`, new selections are merged with existing ones, deduped by `id`. Otherwise, selections replace the existing `drive_items`.
