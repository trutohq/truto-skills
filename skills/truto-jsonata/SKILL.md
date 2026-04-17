---
name: truto-jsonata
description: Write JSONata expressions for Truto config — unified API mapping overrides, custom unified models, environment integration overrides (auth/pagination/rate-limit/webhooks), sync job templates, workflows, daemon jobs, and scheduled actions. Documents the custom $functions added by @truto/truto-jsonata on top of standard JSONata.
---

# truto-jsonata — Custom Functions for Truto JSONata Expressions

Use this skill whenever you (or an agent acting on a Truto customer's behalf) write JSONata inside Truto config. Everywhere JSONata appears in Truto config is editable via the public Truto HTTP API — there is no need to fork the platform. The customer-facing surfaces are:

- **Unified API mapping overrides** (the heaviest user) — `POST/PATCH /environment-unified-model-resource-method` `config.response_mapping`, `config.query_mapping`, `config.request_body_mapping`, `config.request_header_mapping`, `config.response_header_mapping`, `config.path_mapping`, `config.error_mapping`, `config.resource.expression` / `config.method.expression`, `config.is_partial_expression`, `config.before[].run_if` / `config.after[].run_if`, `config.side_load.*.response_mapping`
- **Custom unified models** — `POST /unified-model` + `POST /unified-model-resource-method` (same `config.*` JSONata fields as above, defining the *base* row that environment overrides merge on top of)
- **Per-integrated-account overrides** — `PATCH /integrated-account/:id` `unified_model_override.<model>.<resource>.<method>.<mapping_field>` (per-account variant of the unified mapping fields)
- **Environment integration overrides** — `PATCH /environment-integration/:id` `override.error_expression`, `override.authorization.config.expression`, `override.pagination.config.*_expression`, `override.rate_limit.is_rate_limited` / `.retry_after_header_expression` / `.rate_limit_header_expression`, `override.webhook.handle_verification` / `.payload_transform`
- **Sync Job V4 templates** — `transform.config.expression`, `add_context.config.expression`, `update_state.config.value_expression`, node-level `run_if`, job-level `args_validation`, and `request.query` / `request.body` when given as strings
- **Workflows** — workflow-level `run_if`, step-level `run_if`, and step `config` when given as a string
- **Daemon Jobs** — `args_validation`
- **Integration Scheduled Actions** — `run_if`

Truto evaluates these expressions with the [`@truto/truto-jsonata`](https://github.com/trutohq/truto-jsonata) runtime, which extends standard [JSONata](https://docs.jsonata.org/) with a curated set of custom `$` functions for data conversion, encoding, hashing, lodash-style array/object work, format conversions (Markdown ↔ HTML ↔ Notion ↔ Slack ↔ Google Docs ↔ ADF ↔ PDF), data formats (XML, CSV, Parquet, SQL), and AI helpers.

## When to Use

- Adding or modifying a unified API mapping for an integration in a customer's environment (the most common use)
- Defining a custom unified model with its own per-integration mappings
- Patching a single connected account's mapping behavior via `unified_model_override`
- Configuring an integration's authentication header, dynamic pagination, rate-limit detection, or inbound webhook verification/transform per environment
- Writing or editing the `expression`, `value_expression`, `run_if`, or `args_validation` field of a sync job template, workflow, daemon job, or scheduled action
- Reshaping records inside a sync job `transform` node (drop fields, build a Parquet blob, generate embeddings, re-key by something)
- Converting rich-text fields between Markdown, HTML, Notion blocks, Slack Block Kit, Google Docs requests, ADF, or PDF inside any of the above

## Hard Rules — Do Not Hallucinate Functions

These rules exist because the cost of a fabricated `$` function is a silent runtime failure in production config.

1. **Never invent a `$function`.** If a function is not in the cheatsheet below, it does not exist in `truto-jsonata`. Either:
   - use a standard JSONata built-in (see [JSONata function library](https://docs.jsonata.org/string-functions)), or
   - rewrite the expression without it.

2. **Always read the matching reference file before writing a non-trivial call.** Don't write `$convertQueryToSql(...)`, `$mapValues(...)`, `$sortNodes(...)`, `$digest(...)`, or `$sign(...)` from memory — open the reference and follow the documented signature exactly.

3. **The cheatsheet below is authoritative for *what exists*.** The reference files are authoritative for *how to call* what exists.

4. **Standard JSONata is in scope too.** Functions like `$exists`, `$merge`, `$each`, `$keys`, `$type`, `$string`, `$number`, `$count`, `$append`, `$distinct`, `$floor`, `$millis`, `$toMillis`, `$now`, `$lookup`, `$map`, `$filter`, `$reduce`, `$sift`, `$sort`, `$reverse`, `$substring`, `$contains`, `$match`, `$replace`, `$split`, `$lowercase`, `$uppercase`, `$trim`, `$pad`, `$length`, `$abs`, `$ceil`, `$round`, `$power`, `$sqrt`, `$random`, `$boolean`, `$not`, etc. are all available — these come from JSONata itself, not `truto-jsonata`.

5. **`$lofilter` (not `$filter`).** The lodash-style filter is named `$lofilter` to avoid shadowing JSONata's built-in `$filter`. Same for `$find` — it's a lodash-style helper that takes a key name, distinct from JSONata's predicate-based filtering.

## Where in Truto are JSONata expressions evaluated?

See [Usage in Truto](./references/usage-in-truto.md) for the complete map with examples and exact endpoint shapes. Quick summary, grouped by subsystem:

### Unified API mappings (the heaviest user)

`POST/PATCH /environment-unified-model-resource-method` writes to `config.*`. The *same* `config.*` shape applies when defining a custom unified model's base mapping via `POST /unified-model-resource-method`.

| Field | Scope (top-level bindings) |
|---|---|
| `config.response_mapping` (string) | `response`, `query`, `rawQuery`, `context`, `headers`, `body` |
| `config.query_mapping` (string) | `query`, `body`, `context`, `before`, `id` |
| `config.request_body_mapping` (string) | `body`, `context`, `query`, `rawQuery`, `before`, `id` |
| `config.request_header_mapping` (string) | `headers`, `body`, `query`, `rawQuery`, `context`, `requestBody` |
| `config.response_header_mapping` (string) | `headers`, `body`, `query`, `rawQuery`, `context`, `response` |
| `config.path_mapping` (string) | `headers`, `body`, `query`, `rawQuery`, `context`, `before`, `id` |
| `config.error_mapping` (string) | `headers`, `error`, `body`, `query`, `rawQuery`, `context`, `before`, `id` |
| `config.resource.expression` / `config.method.expression` | `query`, `rawQuery`, `body`, `context` |
| `config.is_partial_expression` | `data`, `query`, `rawQuery`, `before`, `id`, `requestBody`, `rawBody` |
| `config.before[].run_if` / `config.after[].run_if` (and `config` when string) | `id`, `query`, `body`, `context`, `data`, `step` |
| `config.side_load.*.response_mapping` | per-item: `response`, `query`, `rawQuery`, `body` |

### Per-integrated-account override

`PATCH /integrated-account/:id` `unified_model_override.<model>.<resource>.<method>.<mapping_field>` — same scope as the corresponding mapping field above, but takes precedence for that one connected account.

### Environment integration overrides (HTTP layer)

`PATCH /environment-integration/:id` `override.*`:

| Field | Scope (top-level bindings) |
|---|---|
| `override.error_expression` (and per-method `error_expression` under `override.resources.<r>.<m>`) | `response`, `headers`, `status`, `data` |
| `override.authorization.config.expression` (when `format: 'header'`) | `url`, `requestOptions`, `context` |
| `override.pagination.config.get_initial_pagination_values_expression` (when `format: 'dynamic'`) | `query`, `url`, `requestOptions` |
| `override.pagination.config.get_pagination_values_expression` / `get_cursor_from_response_expression` | `query`, `url`, `requestOptions`, `response`, `body`, `paginationValues` |
| `override.rate_limit.is_rate_limited` / `.retry_after_header_expression` / `.rate_limit_header_expression` | `headers`, `status` |
| `override.webhook.handle_verification` / `.payload_transform` | inbound webhook payload as the JSONata input (root) |

### Environment unified model — outbound webhook transform

`PATCH /environment-unified-model/:id` `override.webhooks.<integration>` — JSONata string per integration that shapes inbound integration webhooks into unified-event payloads. Inbound webhook payload as root.

### Sync Job V4

| Field | Scope (top-level bindings) |
|---|---|
| `transform.config.expression` | `args.*`, `sync_job_run`, `tenant_id`, integrated account context fields, `resources.*`, keys merged in by upstream `add_context` |
| `add_context.config.expression` | Same as `transform`. Returned object's keys become top-level downstream |
| `update_state.config.value_expression` | Same as `transform`. Returning `undefined` skips the write |
| `request.query` / `request.body` (when string) | Same as `transform`. Must return the query / body object |
| Any node `run_if` | Same as `transform`. Falsy value skips the node |
| Destination `config.expression` | Same as `transform`, plus `payload.records` |
| Job-level `args_validation` | `{ args }`. Return `null` to proceed; return `{ "message": "..." }` to abort |

### Workflows / Daemon Jobs / Scheduled Actions

| Surface | Field | Scope |
|---|---|---|
| Workflow — workflow-level | `run_if` | `event` (trigger event), `environment_id`, `tenant_id` |
| Workflow — step-level | `run_if`, `config` (when string) | Same as workflow-level, plus output of prior steps |
| Daemon Job — job-level | `args_validation` | `{ args }`, same semantics as sync job `args_validation` |
| Integration Scheduled Action | `run_if` | Integrated account context object — context fields referenced bare (`plan_type`, not `context.plan_type`) |

## Function Cheatsheet

Functions are grouped by preset. Each function points to its detailed reference. **This list is exhaustive — if a function isn't here, it does not exist in `truto-jsonata`.**

### Encoding & Cryptography → [core-functions.md](./references/core-functions.md)

| Function | Signature | One-liner |
|---|---|---|
| [`$base64encode`](./references/core-functions.md#base64encodeinput-urlsafe--false) | `(input, urlSafe?)` | Encode string to Base64 |
| [`$base64decode`](./references/core-functions.md#base64decodebase64string-urlsafe--false) | `(base64String, urlSafe?)` | Decode Base64 to string |
| [`$base64ToBlob`](./references/core-functions.md#base64toblobbase64string-options) | `(base64String, options?)` | Base64 (or `data:` URI) → `Blob` |
| [`$digest`](./references/core-functions.md#digesttext-algorithm--sha-256-stringtype--hex) | `(text, algorithm?, stringType?)` | Hash (SHA-1/256/384/512, MD5; hex/base64/base64-urlSafe) |
| [`$sign`](./references/core-functions.md#signtext-algorithm--sha-256-secret-outputformat--hex) | `(text, algorithm, secret, outputFormat?)` | HMAC signature |

### Currency → [core-functions.md](./references/core-functions.md#currency)

| Function | Signature | One-liner |
|---|---|---|
| [`$convertCurrencyToSubunit`](./references/core-functions.md#convertcurrencytosubunitamount-currencycode) | `(amount, currencyCode)` | Dollars → cents (per ISO currency) |
| [`$convertCurrencyFromSubunit`](./references/core-functions.md#convertcurrencyfromsubunitamountinsubunit-currencycode) | `(amountInSubunit, currencyCode)` | Cents → dollars |

### Object & Array (Lodash-style) → [core-functions.md](./references/core-functions.md#object--array-lodash-style)

| Function | Signature | One-liner |
|---|---|---|
| [`$groupBy`](./references/core-functions.md#groupbyarray-iteratee) | `(array, iteratee)` | Group array elements by key |
| [`$keyBy`](./references/core-functions.md#keybyarray-iteratee) | `(array, iteratee)` | Index array elements by key |
| [`$pick`](./references/core-functions.md#pickobject-keys) | `(object, keys)` | Pick subset of keys |
| [`$omit`](./references/core-functions.md#omitobject-keys) | `(object, keys)` | Drop listed keys |
| [`$compact`](./references/core-functions.md#compactarray) | `(array)` | Remove falsy values |
| [`$join`](./references/core-functions.md#joinarray-separator) | `(array, separator)` | Join with separator |
| [`$orderBy`](./references/core-functions.md#orderbycollection-iteratees-orders) | `(collection, iteratees, orders)` | Sort by keys + asc/desc |
| [`$find`](./references/core-functions.md#findcollection-attr) | `(collection, attr)` | First element where `attr` is truthy |
| [`$lofilter`](./references/core-functions.md#lofiltercollection-predicate) | `(collection, predicate)` | Lodash-style filter (not JSONata's `$filter`) |
| [`$values`](./references/core-functions.md#valuesobject) | `(object)` | Object values as array |
| [`$chunk`](./references/core-functions.md#chunkarr-size) | `(arr, size)` | Split array into sub-arrays |
| [`$difference`](./references/core-functions.md#differencearray1-array2) | `(array1, array2)` | Elements in `array1` not in `array2` |
| [`$flatten`](./references/core-functions.md#flattenarray) | `(array)` | Flatten one level |
| [`$flattenDeep`](./references/core-functions.md#flattendeeparray) | `(array)` | Flatten recursively |
| [`$flattenDepth`](./references/core-functions.md#flattendeptharray-depth) | `(array, depth)` | Flatten up to `depth` |

### Empty / Null Handling → [core-functions.md](./references/core-functions.md#empty--null-handling)

| Function | Signature | One-liner |
|---|---|---|
| [`$removeEmpty`](./references/core-functions.md#removeemptyobject) | `(object)` | Drop null/undefined/empty entries |
| [`$removeEmptyItems`](./references/core-functions.md#removeemptyitemsarray) | `(array)` | Drop empty objects from array |
| [`$firstNonEmpty`](./references/core-functions.md#firstnonemptyvalues) | `(...values)` | First non-null/undefined argument |

### Parsing → [core-functions.md](./references/core-functions.md#parsing)

| Function | Signature | One-liner |
|---|---|---|
| [`$jsonParse`](./references/core-functions.md#jsonparsejsonstring) | `(jsonString)` | JSON string → value |
| [`$parseUrl`](./references/core-functions.md#parseurlurlstring) | `(urlString)` | URL string → `URL` object |
| [`$parseQuery`](./references/core-functions.md#parsequeryquerystring) | `(queryString)` | Query string → object |
| [`$stringifyQuery`](./references/core-functions.md#stringifyqueryobject) | `(object)` | Object → query string |
| [`$parseDocument`](./references/core-functions.md#parsedocumentfile) | `(file)` | PDF/DOCX → text (Truto auto-injects API config) |

### Files & Blobs → [core-functions.md](./references/core-functions.md#files--blobs)

| Function | Signature | One-liner |
|---|---|---|
| [`$blob`](./references/core-functions.md#blobcontent-options) | `(content, options)` | Create `Blob` |
| [`$getArrayBuffer`](./references/core-functions.md#getarraybufferfile) | `(file)` | `Blob` → `ArrayBuffer` |
| [`$getDataUri`](./references/core-functions.md#getdataurifile) | `(file)` or `(file, mimeType)` | → `data:` URI string |
| [`$getMimeType`](./references/core-functions.md#getmimetypefilename) | `(fileName)` | Extension/filename → MIME |
| [`$bufferToString`](./references/core-functions.md#buffertostringbuffer) | `(buffer)` | Buffer → string |
| [`$teeStream`](./references/core-functions.md#teestreamreadable) | `(readable)` | Clone `ReadableStream` |

### SQL Helpers → [core-functions.md](./references/core-functions.md#sql-helpers)

| Function | Signature | One-liner |
|---|---|---|
| [`$zipSqlResponse`](./references/core-functions.md#zipsqlresponsecolumns-data-key) | `(columns, data, key)` | Zip column metadata + row arrays into objects |
| [`$mapValues`](./references/core-functions.md#mapvaluesvalue-mapping-lowercase--false-defaultvalue--null) | `(value, mapping, lowerCase?, defaultValue?)` | Recursively map value(s) through a lookup |
| [`$toNumber`](./references/core-functions.md#tonumbervalue) | `(value)` | Coerce to number |

### Identifiers → [core-functions.md](./references/core-functions.md#identifiers)

| Function | Signature | One-liner |
|---|---|---|
| [`$uuid`](./references/core-functions.md#uuid) | `()` | Generate v4 UUID |

### Strings & Similarity → [core-functions.md](./references/core-functions.md#strings--similarity)

| Function | Signature | One-liner |
|---|---|---|
| [`$mostSimilar`](./references/core-functions.md#mostsimilarvalue-possiblevalues-threshold--08) | `(value, possibleValues, threshold?)` | Closest match by Dice Coefficient |
| [`$diceCoefficient`](./references/core-functions.md#dicecoefficientvalue1-value2) | `(value1, value2)` | Bigram similarity score (0.0–1.0) |
| [`$wrap`](./references/core-functions.md#wrapvalue-wrapper-endwrapper) | `(value, wrapper, endWrapper?)` | Wrap value with delimiters |

### Hierarchies → [core-functions.md](./references/core-functions.md#hierarchies)

| Function | Signature | One-liner |
|---|---|---|
| [`$sortNodes`](./references/core-functions.md#sortnodesarray-idkey--id-parentidkey--parent_id-sequencekey--sequence) | `(array, idKey?, parentIdKey?, sequenceKey?)` | Topologically sort flat parent-child list, then flatten |

### Datetime → [datetime-functions.md](./references/datetime-functions.md)

| Function | Signature | One-liner |
|---|---|---|
| [`$dtFromIso`](./references/datetime-functions.md#dtfromisodatetimestring) | `(datetimeString)` | ISO string → Luxon `DateTime` |
| [`$dtFromFormat`](./references/datetime-functions.md#dtfromformatdatetimestring-format) | `(datetimeString, format)` | Format-string parse → Luxon `DateTime` |

### Markdown / HTML / Rich Text → [text-conversions.md](./references/text-conversions.md)

| Function | Signature | One-liner |
|---|---|---|
| [`$convertHtmlToMarkdown`](./references/text-conversions.md#converthtmltomarkdownhtmlstring) | `(htmlString)` | HTML → Markdown |
| [`$convertMarkdownToHtml`](./references/text-conversions.md#convertmarkdowntohtmlmarkdownstring) | `(markdownString)` | Markdown → HTML |
| [`$convertMarkdownToNotion`](./references/text-conversions.md#convertmarkdowntonotionmarkdown) | `(markdown)` | Markdown → Notion blocks |
| [`$convertNotionToMarkdown`](./references/text-conversions.md#convertnotiontomarkdownblocks) | `(blocks)` | Notion blocks → Markdown |
| `$convertNotionToMd` | `(block)` | Single Notion block → Markdown |
| [`$convertMarkdownToSlack`](./references/text-conversions.md#convertmarkdowntoslackmarkdown) | `(markdown)` | Markdown → Slack Block Kit |
| [`$convertMarkdownToGoogleDocs`](./references/text-conversions.md#convertmarkdowntogoogledocstext) | `(text)` | Markdown → Google Docs `requests` |
| [`$convertMarkdownToAdf`](./references/text-conversions.md#convertmarkdowntoadfmarkdown) | `(markdown)` | Markdown → Atlassian Document Format |
| [`$convertMdToPdf`](./references/text-conversions.md#convertmdtopdfmarkdown-options) | `(markdown, options?)` | Markdown → PDF `Blob` (jsPDF) |

### Data Formats → [data-formats.md](./references/data-formats.md)

| Function | Signature | One-liner |
|---|---|---|
| [`$xmlToJs`](./references/data-formats.md#xmltojsxml-options) | `(xml, options?)` | XML string → JS object (compact or element-tree) |
| [`$jsToXml`](./references/data-formats.md#jstoxmljson-options) | `(json, options?)` | JS object → XML string |
| [`$jsonToCsv`](./references/data-formats.md#jsontocsvjson-options) | `(json, options?)` | JSON array → CSV string |
| [`$jsonToParquet`](./references/data-formats.md#jsontoparquetrows-options) | `(rows, options?)` | JSON → Parquet `ArrayBuffer` |
| [`$convertQueryToSql`](./references/data-formats.md#convertquerytosqlquery-keystomap-mapping-datatypes-customoperatormapping-options) | `(query, keysToMap?, mapping?, dataTypes?, customOperatorMapping?, options?)` | Truto query object → SQL `WHERE` clause |

### AI → [ai-functions.md](./references/ai-functions.md)

| Function | Signature | One-liner |
|---|---|---|
| [`$generateEmbeddingsCohere`](./references/ai-functions.md#generateembeddingscoherebody-api_key) | `(body, api_key)` | Cohere `/embed` API call |
| [`$recursiveCharacterTextSplitter`](./references/ai-functions.md#recursivecharactertextsplittertext-options) | `(text, options)` | Chunk text for LLMs/embeddings |

## Authoring Tips

- Sync job and workflow configs are submitted as JSON via the Truto API, so JSONata expression strings need their internal double quotes escaped (`"\"key\""`). For long expressions, write the JSONata first, then escape it.
- Wrap multi-statement expressions in `( ... ; ... ; finalExpression )` — JSONata uses `;` as a statement separator inside parens; the last expression is the result.
- Variable bindings: `$name := value`. Function definitions: `function ($args) { body }`.
- Backtick-quote keys (and resource paths) that contain hyphens or other special characters: `` resources.`knowledge-base`.`page-content` ``.

## References

| Reference | Contents |
|---|---|
| [Usage in Truto](./references/usage-in-truto.md) | Every customer-facing field that accepts a JSONata expression — unified API mappings (the heaviest user), custom unified models, per-account overrides, environment integration overrides, sync jobs, workflows, daemon jobs, scheduled actions — with the exact API endpoint, scope variables, and worked examples for each |
| [Core Functions](./references/core-functions.md) | Encoding, hashing, currency, lodash-style, parsing, files, SQL helpers, hierarchies (the `presets/core` set) |
| [Datetime Functions](./references/datetime-functions.md) | `$dtFromIso`, `$dtFromFormat` (Luxon-backed) |
| [Text & Markup Conversions](./references/text-conversions.md) | Markdown ↔ HTML ↔ Notion ↔ Slack ↔ Google Docs ↔ ADF ↔ PDF |
| [Data Formats](./references/data-formats.md) | XML, CSV, Parquet, and the full `$convertQueryToSql` reference (25 examples, all options) |
| [AI Functions](./references/ai-functions.md) | Cohere embeddings, recursive character text splitter |

## Related Skills

- **Truto** — overall platform skill; covers unified API, sync jobs, webhooks, workflows where these expressions are used
- **Truto CLI** — for testing JSONata expressions against sample data from the terminal
