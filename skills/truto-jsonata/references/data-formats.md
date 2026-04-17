# Data Format Conversions

Convert between common data interchange formats. The XML and SQL helpers come up most often inside Truto config — XML for SOAP / legacy integrations, `$convertQueryToSql` for translating a [unified query object](../../truto/references/unified-api.md) into the native filter language of a SQL-style integration.

---

## `$xmlToJs(xml, options?)`

Converts an XML string into a JavaScript object using [`xml-js`](https://www.npmjs.com/package/xml-js).

**Default options:** `{ compact: true, spaces: 4 }`

**Compact format** (the default) — text content is exposed as `_text`:

Input:

```xml
<note>
  <to>User</to>
  <message>Hello, World!</message>
</note>
```

Expression: `$xmlToJs(response.body)`

Result:

```
{
  note: {
    to:      { _text: "User" },
    message: { _text: "Hello, World!" }
  }
}
```

**Non-compact format** — verbose, element-tree output. Useful when the XML has mixed content or repeated tags you need to preserve in order:

Input:

```xml
<library>
  <book>
    <title>1984</title>
    <author>George Orwell</author>
  </book>
  <book>
    <title>Brave New World</title>
    <author>Aldous Huxley</author>
  </book>
</library>
```

Expression: `$xmlToJs(response.body, { "compact": false })`

Result (excerpt):

```
{
  elements: [
    {
      type: "element", name: "library",
      elements: [
        { type: "element", name: "book", elements: [
            { type: "element", name: "title",  elements: [{ type: "text", text: "1984" }] },
            { type: "element", name: "author", elements: [{ type: "text", text: "George Orwell" }] }
        ]},
        { type: "element", name: "book", elements: [
            { type: "element", name: "title",  elements: [{ type: "text", text: "Brave New World" }] },
            { type: "element", name: "author", elements: [{ type: "text", text: "Aldous Huxley" }] }
        ]}
      ]
    }
  ]
}
```

---

## `$jsToXml(json, options?)`

Inverse of `$xmlToJs`. Converts a JavaScript object into an XML string. Same `{ compact, spaces }` options.

**Compact example:**

Input:

```
{
  note: {
    to:      { _text: "User" },
    message: { _text: "Hello, World!" }
  }
}
```

Expression: `$jsToXml(body)`

Result:

```xml
<note>
    <to>User</to>
    <message>Hello, World!</message>
</note>
```

**Non-compact format** uses the `{ type, name, elements }` element-tree structure (same shape `$xmlToJs` produces with `compact: false`).

---

## `$jsonToCsv(json, options?)`

Converts a JSON array (or single object) to a CSV string using [`@json2csv/plainjs`](https://juanjodiaz.github.io/json2csv/#/parsers/parser). `null` and `undefined` entries are filtered automatically.

**Common options** (anything supported by `@json2csv/plainjs` is passed through — see [its docs](https://juanjodiaz.github.io/json2csv/#/parsers/parser?id=parameters) for the full list):

- **`delimiter`** — Custom delimiter (default `,`).
- **`header`** — Include header row (default `true`).
- **`fields`** — Array of `{ label, value }` objects for custom column headers.

**Examples:**

Input data:

```
[
  { name: 'John', age: 30, city: 'New York' },
  { name: 'Jane', age: 25, city: 'Los Angeles' }
]
```

`$jsonToCsv(data, {})`:

```
"name","age","city"
"John",30,"New York"
"Jane",25,"Los Angeles"
```

`$jsonToCsv(data, { "delimiter": ";" })`:

```
"name";"age";"city"
"John";30;"New York"
"Jane";25;"Los Angeles"
```

`$jsonToCsv(data, { "fields": [{ "label": "Full Name", "value": "name" }, { "label": "Years", "value": "age" }] })`:

```
"Full Name","Years"
"John",30
"Jane",25
```

`$jsonToCsv(data, { "header": false })`:

```
"John",30,"New York"
"Jane",25,"Los Angeles"
```

An empty array returns `""`.

---

## `$jsonToParquet(rows, options?)`

Converts a single object or array of objects to **Apache Parquet** and returns an `ArrayBuffer`. Used by sync job V4 datastore destinations (S3, GCS, etc.) when `content` is configured for Parquet output. Built on [`hyparquet-writer`](https://www.npmjs.com/package/hyparquet-writer) so it works in Cloudflare Workers.

**Input:**

- **`rows`** — One record or array of records. `null` / `undefined` entries are removed; empty input yields an empty `ArrayBuffer`.
- **`options`** _(optional)_ — Only the keys below are passed through; everything else is ignored.

| Option | Type | Description |
|---|---|---|
| `codec` | `'SNAPPY'` \| `'GZIP'` \| `'ZSTD'` \| `'UNCOMPRESSED'` | Column compression. Defaults to the writer's default (typically `SNAPPY`). |
| `rowGroupSize` | `number` \| `number[]` | Rows per row group. Single number = fixed; array = tiered layout. |

Nested objects and arrays are stored with Parquet's **JSON** logical type (UTF-8 JSON text). Primitive columns are inferred where possible (`BOOLEAN`, `INT32`/`INT64`/`DOUBLE`, `STRING`, timestamps for `Date`).

**Example:**

```
$jsonToParquet([
  { "id": "1", "count": 42 },
  { "id": "2", "count":  7 }
], { "codec": "UNCOMPRESSED", "rowGroupSize": 1000 })
```

Returns an `ArrayBuffer`.

---

## `$convertQueryToSql(query, keysToMap?, mapping?, dataTypes?, customOperatorMapping?, options?)`

Translates a Truto-style query object (the same shape used in unified API `query` parameters) into a SQL `WHERE` fragment. This is the workhorse for any integration whose native filter language is SQL-like — Snowflake, BigQuery, Postgres, anything queried via JDBC/ODBC, or vendor query languages built on SQL syntax.

**Parameters (all but `query` are optional):**

- **`query`** — The query object to convert.
- **`keysToMap`** — List of keys to process. Defaults to all keys.
- **`mapping`** — Object renaming source keys → SQL keys (e.g. `{ firstName: 'first_name' }`).
- **`dataTypes`** — Object specifying the SQL data type per field. Supported types:
  - `string`
  - `double_quote_string`
  - `number`
  - `boolean`
  - `dotnetdate`
  - `date|<luxon-format>` — e.g. `date|yyyy-MM-dd`
- **`customOperatorMapping`** — Override how Truto operators map to SQL operators.
- **`options`** — Output behavior tweaks (see table below).

**Supported operators** (out of the box):

| Operator | SQL |
|---|---|
| `eq`  | `=` |
| `ne`  | `<>` |
| `gt`  | `>` |
| `gte` | `>=` |
| `lt`  | `<` |
| `lte` | `<=` |
| `in`  | `IN` |
| `nin` | `NOT IN` |
| `like` | `LIKE` |

**Options:**

| Option | Type | Default | Description |
|---|---|---|---|
| `useOrForIn` | bool | `false` | Use `OR` instead of `IN` for array comparisons. |
| `conjunction` | string | `'AND'` | Logical conjunction (`'AND'`, `'OR'`, or any custom token like `'NOR'`). |
| `useDoubleQuotes` | bool | `false` | Use double quotes for string values. |
| `noSpaceBetweenOperator` | bool | `false` | No space between operator and value. |
| `noQuotes` | bool | `false` | No quotes around string values. |
| `noQuotesForDate` | bool | `false` | No quotes around date values. |
| `groupComparisonInBrackets` | bool | `false` | Wrap the whole expression in parentheses. |
| `escapeSingleQuotes` | bool | `false` | Escape `'` inside string values as `''`. |

### Examples

The README has 25 numbered examples. Below they are all preserved, with the Node.js wrapper stripped — each block shows the input data, the JSONata expression, and the resulting SQL string.

#### 1. Basic usage

Input: `data1 = { name: { eq: 'John' }, age: { gte: '30' } }`

```
$convertQueryToSql(data)
```

Output: `name = 'John' AND age >= 30`

#### 2. `like` operator

Input: `data2 = { name: { like: 'John' } }`

```
$convertQueryToSql(data)
```

Output: `(name = 'John' OR name = 'Jane')`

#### 3. `lt` and `lte`

Input: `data3 = { price: { lt: 100 }, discount: { lte: 20 } }`

```
$convertQueryToSql(data)
```

Output: `price < 100 AND discount <= 20`

#### 4. `gt` and `gte`

Input: `data4 = { rating: { gt: 4 }, reviews: { gte: 100 } }`

```
$convertQueryToSql(data)
```

Output: `rating > 4 AND reviews >= 100`

#### 5. `ne` (not equal)

Input: `data5 = { status: { ne: 'inactive' } }`

```
$convertQueryToSql(data)
```

Output: `status <> inactive`

#### 6. `nin` (not in)

Input: `data6 = { category: { nin: ['Electronics', 'Furniture'] } }`

```
$convertQueryToSql(data)
```

Output: `category NOT IN ('Electronics','Furniture')`

#### 7. `in` plus `eq`

Input:

```
data = {
  title:  { in: ['Intro to Programming', 'Intro to JavaScript'] },
  author: { eq: 'Smith' }
}
```

```
$convertQueryToSql(data)
```

Output: `title IN ('Intro to Programming','Intro to JavaScript') AND author = 'Smith'`

#### 8. Custom operator mapping

Input:

```
data8 = { status: { ne: 'inactive' } }

customOperatorMapping = {
  eq:  '=',  ne:  '<>',  lt:  '<',   lte: '<=',
  gt:  '>',  gte: '>=',  in:  'IN',  nin: 'NOT IN',
  startswith: 'LIKE', endswith: 'LIKE', contains: 'LIKE'
}
```

```
$convertQueryToSql(data, [], {}, {}, customOperatorMapping)
```

Output: `status <> 'inactive'`

#### 9. Data types — `string`

Input:

```
data9 = { created_at: { eq: '2021-01-01' } }
dataTypes = { created_at: 'string' }
```

```
$convertQueryToSql(data, [], {}, {}, dataTypes)
```

Output: `created_at = '2021-01-01'`

#### 10. Mapping for keys

Input:

```
data10 = { firstName: { eq: 'John' }, lastName: { eq: 'Doe' } }
mapping = { firstName: 'first_name', lastName: 'last_name' }
```

```
$convertQueryToSql(data, [], mapping, {}, {}, {})
```

Output: `first_name = 'John' AND last_name = 'Doe'`

#### 11. `conjunction` and `groupComparisonInBrackets`

Input:

```
data11 = { name: { eq: 'Alice' }, city: { eq: 'Wonderland' } }
options = { conjunction: 'OR', groupComparisonInBrackets: true }
```

```
$convertQueryToSql(data, [], {}, {}, {}, options)
```

Output: `(name = 'Alice' OR city = 'Wonderland')`

#### 12. `useOrForIn`

Input:

```
data12 = { id: { in: [1, 2, 3] } }
options12 = { useOrForIn: true }
```

```
$convertQueryToSql(data, [], {}, {}, {}, options)
```

Output: `(id = 1 OR id = 2 OR id = 3)`

#### 13. `noQuotes` + `useDoubleQuotes`

Input:

```
data13 = { category: { eq: 'Books' } }
options13 = { noQuotes: true, useDoubleQuotes: true }
```

```
$convertQueryToSql(data, [], {}, {}, {}, options)
```

Output: `category = Books`

#### 14. `escapeSingleQuotes`

Input:

```
data14 = { name: { eq: "O'Reilly" } }
options14 = { escapeSingleQuotes: true }
```

```
$convertQueryToSql(data, [], {}, {}, {}, options)
```

Output: `name = 'O''Reilly'`

#### 15. `noSpaceBetweenOperator`

Input:

```
data15 = { price: { gt: '100' } }
options15 = { noSpaceBetweenOperator: true }
```

```
$convertQueryToSql(data, [], {}, {}, {}, options)
```

Output: `price>100`

#### 16. `groupComparisonInBrackets` with `AND`

Input:

```
data16 = { category: { eq: 'Books' }, availability: { eq: 'In Stock' } }
options16 = { groupComparisonInBrackets: true, conjunction: 'AND' }
```

```
$convertQueryToSql(data, [], {}, {}, {}, options)
```

Output: `(category = 'Books' AND availability = 'In Stock')`

#### 17. `noQuotesForDate` with date type

Input:

```
data17      = { created_at: { eq: '2021-12-31' } }
dataTypes17 = { created_at: 'date|yyyy-MM-dd' }
options17   = { noQuotesForDate: true }
```

```
$convertQueryToSql(data, [], {}, dataTypes, {}, options)
```

Output: `created_at = 2021-12-31`

#### 18. `useDoubleQuotes` + `groupComparisonInBrackets`

Input:

```
data18 = { product: { eq: 'Laptop' }, brand: { eq: 'Dell' } }
options18 = { useDoubleQuotes: true, groupComparisonInBrackets: true }
```

```
$convertQueryToSql(data, [], {}, {}, {}, options)
```

Output: `(product = "Laptop" AND brand = "Dell")`

#### 19. Custom conjunction (`'NOR'`)

Input:

```
data19 = { available: { eq: 'No' }, sold: { eq: 'Yes' } }
options19 = { conjunction: 'NOR' }
```

```
$convertQueryToSql(data, [], {}, {}, {}, options)
```

Output: `available = 'No' NOR sold = 'Yes'`

#### 20. `dotnetdate` data type

Input:

```
data20      = { modified_at: { eq: '2023-01-01T00:00:00Z' } }
dataTypes20 = { modified_at: 'dotnetdate' }
options20   = { groupComparisonInBrackets: true }
```

```
$convertQueryToSql(data, [], {}, dataTypes, {}, options)
```

Output: `(modified_at = DateTime(2023,01,01))`

#### 21. `noQuotes` for numeric comparison

Input:

```
data21 = { rating: { gt: '4.5' } }
options21 = { noQuotes: true }
```

```
$convertQueryToSql(data, [], {}, {}, {}, options)
```

Output: `rating > 4.5`

#### 22. `useOrForIn` + custom conjunction

Input:

```
data22 = { productId: { in: [101, 102, 103] } }
options22 = { useOrForIn: true, conjunction: 'OR' }
```

```
$convertQueryToSql(data, [], {}, {}, {}, options)
```

Output: `(productId = 101 OR productId = 102 OR productId = 103)`

#### 23. `escapeSingleQuotes` with internal apostrophe

Input:

```
data23 = { publisher: { eq: "McGraw-Hill's" } }
options23 = { escapeSingleQuotes: true }
```

```
$convertQueryToSql(data, [], {}, {}, {}, options)
```

Output: `publisher = 'McGraw-Hill\'s'`

#### 24. `noSpaceBetweenOperator` with `gt`

Input:

```
data24 = { inventory: { gt: '50' } }
options24 = { noSpaceBetweenOperator: true }
```

```
$convertQueryToSql(data, [], {}, {}, {}, options)
```

Output: `inventory>50`

#### 25. `noQuotesForDate` + `escapeSingleQuotes`

Input:

```
data25      = { releaseDate: { eq: '2023-03-15' }, author: { eq: "J.K. O'Rourke" } }
dataTypes25 = { releaseDate: 'date|yyyy-MM-dd' }
options25   = { noQuotesForDate: true, escapeSingleQuotes: true }
```

```
$convertQueryToSql(data, [], {}, dataTypes, {}, options)
```

Output: `releaseDate = 2023-03-15 AND author = 'J.K. O\'Rourke'`

---

## Common patterns in Truto config

> The unified-mapping examples below are written into `config.query_mapping` / `config.response_mapping` / `config.request_body_mapping` of an `environment-unified-model-resource-method` row (or a base `unified-model-resource-method` row for a custom model you own). For the full HTTP API and lifecycle, see [Unified API Customization](../../truto/references/unified-api-customization.md) in the `truto` skill.

**Unified mapping `query_mapping`** — translate the unified-API query object to a SQL `WHERE` clause for a SQL-style integration:

```
{ "q": "SELECT Id, FirstName, LastName, Email FROM Contact WHERE " & $convertQueryToSql(query, [], { "name": "full_name", "created_at": "createdDate" }, { "createdDate": "string" }, {}, { "groupComparisonInBrackets": true, "escapeSingleQuotes": true }) }
```

**Unified mapping `response_mapping`** — parse an XML SOAP response into JS so you can map fields out of it:

```
$xmlToJs(response.body).Envelope.Body.GetUserResponse.User.{ "id": _attributes.id, "name": Name._text, "email": Email._text }
```

**Unified mapping `request_body_mapping`** — build a SOAP envelope from a unified-API create payload:

```
$jsToXml({ "Envelope": { "_attributes": { "xmlns:soap": "http://schemas.xmlsoap.org/soap/envelope/" }, "Body": { "CreateUser": { "Name": body.name, "Email": body.email } } } })
```

**Sync Job V4 — `transform.config.expression`** — convert a batch of records to a Parquet `ArrayBuffer` so a downstream object-storage destination (S3, GCS, R2) writes one Parquet file per batch:

```
$jsonToParquet(resources.crm.contacts, { "codec": "SNAPPY" })
```

**Sync Job V4 — `transform.config.expression`** — convert a batch of records to CSV for an FTP / S3 / email destination:

```
$jsonToCsv(resources.crm.contacts, { "fields": ["id", "first_name", "last_name", "email"] })
```
