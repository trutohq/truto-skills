# AI Functions

AI/ML helpers for Truto JSONata expressions. Useful inside sync job templates that build embeddings or chunked text for downstream vector stores (Qdrant, etc.).

---

## `$generateEmbeddingsCohere(body, api_key)`

Generates embeddings via [Cohere's `/embed` API](https://docs.cohere.com/reference/embed).

**Parameters:**

- `**body`** — An object matching what Cohere's `/embed` API expects (see linked docs).
- `**api_key**` — Your Cohere API key.

**Example:**

```
$generateEmbeddingsCohere({
  "model": "embed-multilingual-v3.0",
  "texts": ["hello", "goodbye"],
  "input_type": "classification",
  "embedding_types": ["float"]
}, "<COHERE_API_KEY>")
```

Returns the raw Cohere response (`{ id, embeddings, ... }`).

**Tip:** Inside a Truto sync job, pull the API key from the integrated account context — e.g. `context.cohere_api_key` — instead of hard-coding it.

---

## `$recursiveCharacterTextSplitter(text, options)`

Splits long text into overlapping chunks suitable for LLM/embedding pipelines.

**Parameters:**

- `**text`** — The input text to split.
- `**options**` — An object with:
  - `**chunkSize**` — Maximum chunk size (default `200`).
  - `**chunkOverlap**` — Overlap between chunks (default `60`).

**Example:**

```
$recursiveCharacterTextSplitter("Hello, World! This is a sample text.", {
  "chunkSize": 10,
  "chunkOverlap": 3
})
```

Result: `["Hello, Wo", "lo, World", "rld! This", "is a samp", "ample text", "text."]`

---

## Common patterns in Truto config

> These functions are most useful inside [Sync Job V4 transform expressions](./usage-in-truto.md#5-sync-job-v4-the-second-major-jsonata-surface) feeding a vector-store datastore. They can also be used inside unified API mapping overrides if you need to embed/chunk on the read path — see [Unified API Customization](../../truto/references/unified-api-customization.md) for the override workflow.

**Sync Job V4 — `transform.config.expression`** — chunk every page's body and embed each chunk so the downstream destination (e.g. a Qdrant or Pinecone datastore) gets one vector per chunk. The `cohere_api_key` here is a custom field stored in the integrated account context and exposed at the top of scope:

```
resources.`knowledge-base`.pages.(
  $chunks := $recursiveCharacterTextSplitter(body.content, {
    "chunkSize": 1000,
    "chunkOverlap": 100
  });
  $chunks.{
    "id": $uuid(),
    "page_id": %.id,
    "text": $,
    "vector": $generateEmbeddingsCohere({
      "model": "embed-english-v3.0",
      "texts": [$],
      "input_type": "search_document",
      "embedding_types": ["float"]
    }, cohere_api_key).embeddings.float[0]
  }
)
```

The `%` JSONata operator references the parent context (the page record) so each chunk record carries its source `page_id` forward.

**Sync Job V4 — `transform.config.expression`** — split records that exceed an embedding model's token budget without calling the embedding API:

```
resources.docs.articles.{ "id": id, "chunks": $recursiveCharacterTextSplitter(body, { "chunkSize": 2000, "chunkOverlap": 200 }) }
```

