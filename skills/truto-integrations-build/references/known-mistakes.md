# Known Mistakes

Patterns that have broken real integrations before. Check a new or edited integration against this list before you call it done -- some of these the CLI catches outright (a lint ERROR/WARN, or the build stopping to ask), some you still have to check by hand.

---

## ID placeholder used in a custom method

**Looks like:** a custom (non-CRUD) method's path, body, query string, or a header uses the generic `{{id}}` placeholder instead of naming what it actually is.

**CLI:** in the path, the build rewrites it silently to a named placeholder (e.g. `{{query.invoice_id}}`) the first time it creates the method. In the body, a query param, a header, or mid-segment, lint reports an ERROR.

**Fix:** name the placeholder after what it identifies (`{{query.invoice_id}}`, not `{{id}}`). Reserve `{{id}}` for the method's own record id, as the last path segment.

## Pagination keys the runtime never reads

**Looks like:** a leftover pagination key from a strategy you switched away from -- an old `size_key` surviving a move to cursor paging, for example.

**CLI:** a key the chosen strategy can't act on at all is an ERROR; a harmless leftover is a WARN.

**Fix:** delete keys the current strategy doesn't read, or fix the strategy to actually use them.

## File upload sent as JSON

**Looks like:** a method declares a file input (`format: binary`) but the request body is still built as JSON.

**CLI:** lint WARNs. A new build also stops the method and asks how the upload actually works (multipart, raw bytes, base64, …). If the method never declares a file in the first place, nothing catches this.

**Fix:** check the vendor docs for the real upload mechanism and set the body format / content type to match.

## The same verb and path under two resources

**Looks like:** two resources both define, say, `GET /invoices` -- usually from grouping the same endpoint under more than one name while exploring the docs.

**CLI:** ERROR. The build also drops the duplicate automatically when it writes the file.

**Fix:** keep the endpoint under the one resource it actually belongs to.

## Error or rate-limit expression that misbehaves

**Looks like:** `error_expression` (or a rate-limit expression) throws, returns a plain string instead of an object, or depends on reading the response body in a way the runtime can't guarantee.

**CLI:** ERROR.

**Fix:** an error expression must return `{status, message}` or `null`, cleanly, every time -- never throw, never return text.

## `body_format: json` overwrites a custom Content-Type

**Looks like:** a Content-Type header (in `config.headers`, or in a method's own `headers`) is silently overwritten by the method's `body_format: json` (or `form`/`xml`) when the request goes out.

**CLI:** ERROR when the method's own `headers` sets it; WARN when `config.headers` does (the whole-integration header).

**Fix:** use `body_format: raw` with `body_format_config.content_type` instead, whenever the content type isn't the plain default for that body format.

## List response with no `response_path`

**Looks like:** a list method's real rows sit inside a wrapper (`{ data: { rows: [...] } }`), but nothing says where -- the proxy returns the whole envelope as if it were one record. Seen on jrni, fulcrum, linnworks, onetrust and cloudbeds.

**CLI:** when a documented example shows the wrapper, lint WARNs and a new build asks, suggesting the rows key. When no example shows the shape at all, only the build's stop-and-ask catches it -- lint stays quiet.

**Fix:** set `response_path` to the key holding the array of rows.

## Zero MCP tools from missing descriptions

**Looks like:** not one method on the integration has a `description` doc row or an inline description, so the whole integration exposes no MCP tools -- it still works fine over the proxy/unified APIs, but an LLM agent can't discover it. Seen on timely, zohobooks, zscaler, confluenceonprem and linksquares.

**CLI:** WARN, deliberately, not an ERROR -- a missing tool doesn't break the integration itself, and this is true for brand-new and existing integrations alike. The build summary calls out the gap either way.

**Fix:** `truto integrations build <docs-url> --docs-only <slug>`, then `truto integrations apply <slug>.docs.integration.json --docs-only`.

## Shared OAuth app where each customer needs their own

**Looks like:** the integration ships one hardcoded OAuth client id/secret for every customer, but the vendor actually requires each customer to register and use their own app. Seen on acumatica, clover, simpplr and timely.

**CLI:** ERROR when the connect form collects the customer's own client id but the runtime still uses the literal hardcoded one, or when the token host is something the user types in by hand instead of coming from a credential field. Otherwise the CLI raises no stop for it; the build agent may ask (`oauth_app_ownership_unknown`) when the docs leave it open.

**Fix:** collect the customer's client id/secret (and token host, if it varies by customer) as credential fields, and use those fields at runtime -- never a literal value.

## Endpoints invented, not documented

**Looks like:** a path or verb in the config that doesn't actually appear anywhere in the source docs. Seen on mercury, moment, orderly and linksquares.

**CLI:** a grounding check drops operations it can't tie to real evidence, but it turns itself off when the overall evidence is thin, so it won't catch everything. The build also stops and asks when it finds no doc section at all for a method.

**Fix:** go back to the vendor docs for the real path and verb. If it's genuinely undocumented, that's a question, not a guess.

## A value nothing supplies

**Looks like:** a `{{value}}` in a path, a header, or an authorization rule -- including a single method's own auth override, not just the integration's global auth -- that no credential field, query param, or setup step actually fills in. Seen on zscaler, trustpilot, orderly and sailpointidentityiqscim (auth/header values), timely (a path value), and confluenceonprem (a per-method auth override the global check doesn't look at).

**CLI:** ERROR when a token is read from the wrong place; WARN for other unsupplied values. The build also stops and asks where the value comes from. When the check can't even run -- a setup step saves keys it has no way to read back -- it says so as an INFO instead of staying quiet.

**Fix:** say where the value actually comes from (a credential field, a post_install step, somewhere else) and wire it in. Never guess.

## Dropdown default that isn't one of its own options

**Looks like:** a dropdown's declared default doesn't match any of its own listed options -- a region default that isn't a real region, for example. Seen on helicone.

**CLI:** ERROR.

**Fix:** set the default to one of the dropdown's real options, or add the missing option.

---

## Check by hand

Nothing in the CLI catches these yet -- they stay here as "check by hand" rather than becoming a new rule unless they keep happening (see below). Look for the shape when you're building or reviewing something similar:

- A parameter the vendor makes you resupply on every single path instead of once up front (jrni: a shared `company_id` asked for again on 124 separate paths).
- A `DELETE` that actually needs a request body, not a query string (orderly).
- Behaviour that varies by region or data residency in a way the build didn't account for (fulcrum).
- A vendor warning that the vendor itself treats as a hard error, or a cursor value that needs decoding before it's usable (epic).
- A second host for part of the API, with its own headers (clover's "Pay Display" host).
- An endpoint that's in scope technically but shouldn't be exposed as a tool at all, e.g. anything PCI-scoped (cloudbeds).
- Naming (`bulk_*`, etc.) that implies batch semantics the vendor doesn't actually provide (oraclefusioncloudprocurement).
- Hosts besides the documented main API host that some methods actually need (onetrust).
- A second, separately-hosted API for part of the feature set (trustpilot's "Invitation API").
- No OAuth scopes configured at all, so there's never a refresh token to use (ninjaone).

## Adding to this list

When a method turns out wrong after it went live, fix the integration first -- this list is not where that happens. If the mistake is a new shape, not already covered above, add it here (in the same PR or a follow-up skills PR) with the vendor example that showed it. Keep the entry to the same three parts: what it looks like, how (or whether) the CLI flags it, and the fix.
