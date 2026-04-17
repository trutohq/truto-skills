# Core Functions

The largest set of helpers — encoding, hashing, currency, lodash-style array/object utilities, parsing, and miscellaneous tools. These are the functions you reach for most often inside Truto config.

- [Encoding & Cryptography](#encoding--cryptography)
- [Currency](#currency)
- [Object & Array (Lodash-style)](#object--array-lodash-style)
- [Empty / Null Handling](#empty--null-handling)
- [Parsing](#parsing)
- [Files & Blobs](#files--blobs)
- [SQL Helpers](#sql-helpers)
- [Identifiers](#identifiers)
- [Strings & Similarity](#strings--similarity)
- [Hierarchies](#hierarchies)
- [Misc](#misc)

---

## Encoding & Cryptography

### `$base64encode(input, urlSafe = false)`

Encode a string to Base64.

```
$base64encode('Hello, World!')
```

Result: `'SGVsbG8sIFdvcmxkIQ=='`

### `$base64decode(base64String, urlSafe = false)`

Decode a Base64 string.

```
$base64decode('SGVsbG8sIFdvcmxkIQ==')
```

Result: `'Hello, World!'`

### `$base64ToBlob(base64String, options?)`

Convert a Base64 string (optionally including a `data:` URI prefix) to a `Blob`.

**Options:**
- `mimeType` — default `'application/octet-stream'`
- `urlSafe` — default `false`

Features: handles `data:` URI format automatically, supports URL-safe Base64, automatic padding correction, errors on invalid input, MIME type auto-detected from data URI when present.

```
$base64ToBlob('SGVsbG8gd29ybGQ=', { "mimeType": "text/plain" })
```

Result: `Blob` of type `'text/plain'`, size 11.

```
$base64ToBlob('data:image/png;base64,iVBORw0KGgo...AAABJRU5ErkJggg==')
```

Result: `Blob` of type `'image/png'` (auto-detected from data URI prefix).

```
$base64ToBlob('aHR0cHM6Ly9leGFtcGxlLmNvbS8_cXVlcnk9YmFzZTY0', { "urlSafe": true })
```

Result: `Blob` containing the URL-safe-decoded data.

### `$digest(text, algorithm = 'SHA-256', stringType = 'hex')`

Cryptographic hash of `text`.

- **Algorithms:** `SHA-1`, `SHA-256`, `SHA-384`, `SHA-512` (Web Crypto API), `MD5` (via `md5.js`).
- **Output formats:** `'hex'`, `'base64'`, `'base64-urlSafe'`.

```
$digest('Hello, World!', 'SHA-256', 'hex')
```

Result: `'a591a6d40bf420404a011733cfb7b190d62c65bf0bcda32b53ee6b9c6fbc9c39'`

```
$digest('Data security is key', 'SHA-256', 'base64')
```

Result: `'Xh3mV+fAAG7ScGPjo4PElmR3obnFzGrxnbwGpEE4lI4='`

```
$digest('42', 'MD5', 'hex')
```

Result: `'a1d0c6e83f027327d8461063f4ac58a6'`

```
$digest('42', 'MD5', 'base64-urlSafe')
```

Result: `'odDG6D8CcyfYRgYj9KxYpg'`

### `$sign(text, algorithm = 'SHA-256', secret, outputFormat = 'hex')`

HMAC signature of `text` using `secret`.

```
$sign('Hello, World!', 'SHA-256', 'mySecretKey', 'hex')
```

Result: `'7a60d197fc6a4e91ab6f09f17d74e5a62d3a57ef6c4dc028ef2b8f38a328d2b9'`

```
$sign('The quick brown fox jumps over the lazy dog', 'SHA-512', 'anotherSecretKey', 'hex')
```

Result: `'b9b229b20c8c1088f0d89e2324a8c8cc8e5fd1ec80d1783b00320df3e7a9b660f2d86b2f06089ee1a6b5ef35ee0d4d38de836fe4b46e4f35c9eea66c92ab3c0f'`

---

## Currency

### `$convertCurrencyToSubunit(amount, currencyCode)`

Convert a main-unit amount (e.g. dollars) to its smallest subunit (e.g. cents). Knows the right number of decimals per ISO currency code.

```
$convertCurrencyToSubunit(5.50, 'USD')
```

Result: `550`

### `$convertCurrencyFromSubunit(amountInSubunit, currencyCode)`

Inverse — subunit back to main unit.

```
$convertCurrencyFromSubunit(550, 'USD')
```

Result: `5.50`

---

## Object & Array (Lodash-style)

These are inspired by [Lodash](https://lodash.com/) and adapted for use inside JSONata.

### `$groupBy(array, iteratee)`

Group elements of `array` by the value of `iteratee` (a key string).

Input:

```
data = [
  { type: 'fruit',     name: 'apple' },
  { type: 'vegetable', name: 'carrot' },
  { type: 'fruit',     name: 'banana' }
]
```

```
$groupBy(data, 'type')
```

Result:

```
{
  fruit:     [{ type: "fruit",     name: "apple" }, { type: "fruit", name: "banana" }],
  vegetable: [{ type: "vegetable", name: "carrot" }]
}
```

### `$keyBy(array, iteratee)`

Index elements of `array` by the value of `iteratee`.

Input: `data = [{ id: 'a', value: 1 }, { id: 'b', value: 2 }]`

```
$keyBy(data, 'id')
```

Result: `{ a: { id: 'a', value: 1 }, b: { id: 'b', value: 2 } }`

### `$pick(object, keys)`

Pick a subset of keys from `object`.

Input: `data = { name: 'Alice', age: 30, email: 'alice@example.com' }`

```
$pick(data, ['name', 'email'])
```

Result: `{ name: 'Alice', email: 'alice@example.com' }`

### `$omit(object, keys)`

Inverse of `$pick` — drop the listed keys.

```
$omit(data, ['age'])
```

Result: `{ name: 'Alice', email: 'alice@example.com' }`

### `$compact(array)`

Remove falsy values from `array`.

```
$compact([0, 1, false, 2, '', 3])
```

Result: `[1, 2, 3]`

### `$join(array, separator)`

Join elements of `array` with `separator`.

```
$join(['apple', 'banana', 'cherry'], '; ')
```

Result: `'apple; banana; cherry'`

### `$orderBy(collection, iteratees, orders)`

Sort `collection` by one or more keys, each ascending or descending.

Input: `data = [{ name: 'Alice', age: 30 }, { name: 'Bob', age: 25 }]`

```
$orderBy(data, ['age'], ['desc'])
```

Result: `[{ name: 'Alice', age: 30 }, { name: 'Bob', age: 25 }]`

### `$find(collection, attr)`

Return the first element of `collection` whose `attr` field is truthy.

Input:

```
data       = [{ active: false }, { active: '' }, { active: true }]
otherData  = [{ name: 'John' }]
```

```
$find(data, 'active')
```

Result: `{ active: true }`

```
$find(otherData, 'name')
```

Result: `{ name: 'John' }`

### `$lofilter(collection, predicate)`

Filter `collection` by truthiness of `predicate` (a key name). Named with the `lo`-prefix to avoid clashing with JSONata's built-in `$filter`.

Input: same `data` / `otherData` as above.

```
$lofilter(data, 'active')
```

Result: `[{ active: true }]`

```
$lofilter(otherData, 'name')
```

Result: `[{ name: 'John' }]`

### `$values(object)`

Return all enumerable property values of `object`.

```
$values({ "a": 1, "b": 2, "c": 3 })
```

Result: `[1, 2, 3]`

### `$chunk(arr, size)`

Split `arr` into sub-arrays of `size`.

```
$chunk([1, 2, 3, 4, 5], 2)
```

Result: `[[1, 2], [3, 4], [5]]`

### `$difference(array1, array2)`

Elements in `array1` not in `array2`.

```
$difference([1, 2, 3], [2, 3])
```

Result: `[1]`

### `$flatten(array)`

Flatten one level deep.

```
$flatten([1, [2, [3]]])
```

Result: `[1, 2, [3]]`

### `$flattenDeep(array)`

Flatten recursively.

```
$flattenDeep([1, [2, [3, [4, [5]]]]])
```

Result: `[1, 2, 3, 4, 5]`

### `$flattenDepth(array, depth)`

Flatten up to `depth` levels.

```
$flattenDepth([1, [2, [3, [4, [5]]]]], 2)
```

Result: `[1, 2, 3, [4, [5]]]`

---

## Empty / Null Handling

### `$removeEmpty(object)`

Removes properties whose values are empty (`null`, `undefined`, `''`, `[]`) from `object`. When the input is itself empty, returns `undefined`.

Input: `data = ['1', '2', '3', '']`, `blankData = []`

```
$removeEmpty(data)
```

Result: `['1', '2', '3', '']`

```
$removeEmpty(blankData)
```

Result: `undefined`

### `$removeEmptyItems(array)`

Filter out empty objects from `array`.

Input: `data = [{}, { a: 1 }, []]`

```
$removeEmptyItems(data)
```

Result: `[{ a: 1 }]`

### `$firstNonEmpty(...values)`

Return the first argument that is not `null` or `undefined`.

```
$firstNonEmpty(null, ['3'], undefined)
```

Result: `['3']`

---

## Parsing

### `$jsonParse(jsonString)`

Parse a JSON string into a value.

```
$jsonParse('{"name":"Alice"}')
```

Result: `{ name: 'Alice' }`

### `$parseUrl(urlString)`

Parse a URL into a [`URL` object](https://developer.mozilla.org/en-US/docs/Web/API/URL/URL).

```
$parseUrl('https://example.com/path?query=123#hash')
```

Result (excerpt):

```
URL {
  href:        "https://example.com/path?query=123#hash",
  origin:      "https://example.com",
  protocol:    "https:",
  host:        "example.com",
  hostname:    "example.com",
  port:        "",
  pathname:    "/path",
  hash:        "#hash",
  search:      "?query=123",
  searchParams: URLSearchParams { "query": "123" }
}
```

### `$parseQuery(queryString)`

Parse a query-string into an object. Inverse of `$stringifyQuery`.

### `$stringifyQuery(object)`

Stringify an object into a query string. Inverse of `$parseQuery`.

### `$parseDocument(file)`

Parses a document file (PDF, DOCX, etc.) and extracts its text content. Requires `documentParserApiUrl` / `documentParserApiKey` — Truto auto-injects these inside its expression contexts, so in Truto config you can just call `$parseDocument(file)` directly.

```
$parseDocument(buffer)
```

Result: text content of the document, e.g. `'Hello, World!'`.

---

## Files & Blobs

### `$blob(content, options)`

Create a `Blob` from `content` with the specified MIME type.

Input: `content = ['Hello, World!']`, `options = { type: 'text/plain' }`

```
$blob(content, options)
```

Result: `Blob { type: "text/plain;charset=utf-8" }` (13 bytes).

### `$getArrayBuffer(file)`

Convert a `Blob` to an `ArrayBuffer`. Returns `undefined` if no file is provided.

```
$getArrayBuffer(file)
```

Result: `ArrayBuffer(13) [72, 101, 108, 108, 111, 44, 32, 87, 111, 114, 108, 100, 33]` (for `'Hello, World!'`).

### `$getDataUri(file)`

Convert a `Blob`, `Buffer`, or `ReadableStream` to a `data:` URI string.

```
$getDataUri(file)
```

Result: `'data:text/plain;base64,SGVsbG8sIFdvcmxkIQ=='` (for a `text/plain` blob containing `'Hello, World!'`).

You can also pass an explicit MIME type as a second argument when the source doesn't carry one — handy with PDF generation:

```
$getDataUri($convertMdToPdf(markdown), 'application/pdf')
```

### `$getMimeType(fileName)`

Detect MIME type from a file extension or filename.

```
$getMimeType('html')
```

Result: `'text/html'`

### `$bufferToString(buffer)`

Convert a buffer to a string.

### `$teeStream(readable)`

Clone a `ReadableStream` so it can be consumed twice.

---

## SQL Helpers

### `$zipSqlResponse(columns, data, key)`

Zip a SQL-style response (column metadata + row arrays) into an array of objects keyed by column name.

Input:

```
columns = [{ name: 'id' }, { name: 'name' }, { name: 'age' }]
data    = [[1, 'Alice', 30], [2, 'Bob', 25], [3, 'Charlie', 35]]
key     = 'name'
```

```
$zipSqlResponse(columns, data, key)
```

Result:

```
[
  { id: 1, name: 'Alice',   age: 30 },
  { id: 2, name: 'Bob',     age: 25 },
  { id: 3, name: 'Charlie', age: 35 }
]
```

### `$mapValues(value, mapping, lowerCase = false, defaultValue = null)`

Transform a value (object, array, string, or number) by looking each entry up in `mapping`. Recursive — handles nested arrays and objects. Optional case-insensitivity and fallback default.

#### Examples

**Basic single value lookup:**

Input:

```
roleKey = "1"
roleMapping = { "1": "owner", "2": "admin", "3": "member", "4": "guest" }
```

```
$mapValues(roleKey, roleMapping)
```

Result: `"owner"`

**Default value when key missing:**

```
$mapValues(roleKey2, roleMapping, false, 'Unknown')
```

When `roleKey2 = null`, result: `"Unknown"`

**Case-insensitive lookup** (note: when `lowerCase = false`, keys in the mapping are still compared case-insensitively — both sides get lowercased before comparison):

Input:

```
caseInsensitiveKey = "admin"
caseInsensitiveMapping = { "OWNER": "Owner", "ADMIN": "Administrator", "GUEST": "Guest" }
```

```
$mapValues(caseInsensitiveKey, caseInsensitiveMapping, false)
```

Result: `"Administrator"`

**Array input** (mapped element-by-element; unmapped values pass through unchanged):

```
$mapValues(["1", "3", "5"], roleMapping)
```

Result: `["owner", "member", "5"]`

**Object input** (mapped value-by-value, keys unchanged):

```
$mapValues({ "user1": "1", "user2": "2", "user3": "5" }, roleMapping)
```

Result: `{ user1: "owner", user2: "admin", user3: "5" }`

**Mixed-type array:**

Input:

```
mixedArray = ["1", "Admin", 500, null, undefined]
mappingForMixedArray = { "1": "Owner", "Admin": "Administrator", "500": "Server Error" }
```

```
$mapValues(mixedArray, mappingForMixedArray)
```

Result: `["Owner", "Administrator", "Server Error", null, undefined]`

### `$toNumber(value)`

Coerce a value to a number.

---

## Identifiers

### `$uuid()`

Generate a v4 UUID.

```
$uuid()
```

Result: a UUID string, e.g. `'d9b2d63d-a233-4123-847e-9c5f2b8d6c4f'`.

---

## Strings & Similarity

### `$mostSimilar(value, possibleValues, threshold = 0.8)`

Find the most similar string from `possibleValues` to `value` using the Dice Coefficient. Returns the closest match if it scores ≥ `threshold`, otherwise `undefined`.

```
$mostSimilar('appl', ['apple', 'apricot', 'banana'], 0.8)
```

Result: `'apple'`

### `$diceCoefficient(value1, value2)`

Returns a similarity score between `0.0` (different) and `1.0` (identical) between two strings, based on bigram comparison. Both strings are lowercased and stripped of non-alphanumeric characters before comparison.

```
$diceCoefficient('hello', 'hello')          // 1.0
$diceCoefficient('apple', 'appl')           // ~0.8
$diceCoefficient('Hello', 'HELLO')          // 1.0  (case-insensitive)
$diceCoefficient('hello-world', 'hello world') // 1.0  (non-alphanumeric ignored)
$diceCoefficient('hello', 'xyz')            // 0.0
```

### `$wrap(value, wrapper, endWrapper?)`

Wrap `value` with `wrapper` and `endWrapper`. If `endWrapper` is omitted, `wrapper` is used on both sides.

```
$wrap('content', '<div>', '</div>')
```

Result: `'<div>content</div>'`

---

## Hierarchies

### `$sortNodes(array, idKey = 'id', parentIdKey = 'parent_id', sequenceKey = 'sequence')`

Topologically sort a flat list of nodes into a parent-child hierarchy by `parent_id`, sort siblings by `sequence`, then flatten back to a list. Useful for ordered nested resources like Notion blocks, comment threads, navigation menus, or org charts.

**Each node should look like:**

```
{
  id: string | number,
  parent_id?: string | number | null,
  sequence: number
}
```

**Example 1 — basic structure with default keys:**

Input:

```
nodes1 = [
  { id: 1, sequence: 1 },
  { id: 2, parent_id: 1, sequence: 2 },
  { id: 3, sequence: 3 },
  { id: 4, parent_id: 1, sequence: 1 }
]
```

```
$sortNodes(nodes)
```

Result:

```
[
  { id: 1, sequence: 1 },
  { id: 4, parent_id: 1, sequence: 1 },
  { id: 2, parent_id: 1, sequence: 2 },
  { id: 3, sequence: 3 }
]
```

**Example 2 — custom keys:**

Input:

```
nodes2 = [
  { uniqueId: 1,                       seqNumber: 2 },
  { uniqueId: 2, parentUniqueId: 1,    seqNumber: 1 },
  { uniqueId: 3,                       seqNumber: 1 },
  { uniqueId: 4, parentUniqueId: 3,    seqNumber: 2 },
  { uniqueId: 5, parentUniqueId: 3,    seqNumber: 1 }
]
```

```
$sortNodes(nodes, 'uniqueId', 'parentUniqueId', 'seqNumber')
```

Result:

```
[
  { uniqueId: 3,                    seqNumber: 1 },
  { uniqueId: 5, parentUniqueId: 3, seqNumber: 1 },
  { uniqueId: 4, parentUniqueId: 3, seqNumber: 2 },
  { uniqueId: 1,                    seqNumber: 2 },
  { uniqueId: 2, parentUniqueId: 1, seqNumber: 1 }
]
```

---

## Misc

The README also lists these without expanded examples — they do exactly what their names suggest:

- `$bufferToString(buffer)` — buffer → string
- `$parseQuery(queryString)` — query string → object
- `$stringifyQuery(object)` — object → query string
- `$teeStream(readable)` — clone a `ReadableStream`
- `$toNumber(value)` — value → number

---

## Where to use these in Truto config

Most of the helpers above show up inside unified API mapping fields (`response_mapping`, `query_mapping`, `request_body_mapping`, `error_mapping`, etc.) and sync job V4 expressions. For the per-field scope tables and where each surface lives, see [Usage in Truto](./usage-in-truto.md).

For the full HTTP API and lifecycle of writing those mapping overrides — discovering existing mappings, finding the right `environment_unified_model_id`, the deep-merge semantics, testing and rollback, and creating your own custom unified models — see [Unified API Customization](../../truto/references/unified-api-customization.md) in the `truto` skill.
