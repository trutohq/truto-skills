# Text and Markup Conversions

Convert between Markdown, HTML, and the rich-text formats used by various integrations (Notion blocks, Slack mrkdwn / Block Kit, Google Docs requests, Atlassian Document Format, PDF).

These are heavily used in unified API mappings to normalize "rich text" fields (e.g. ticket descriptions, comments, document bodies) across integrations that each store rich text differently.

---

## `$convertHtmlToMarkdown(htmlString)`

Converts HTML content to Markdown.

**Example:**

Input HTML:

```html
<h1>Welcome to Markdown</h1>
<p>This is a <strong>bold</strong> statement.</p>
<ul>
  <li>Item 1</li>
  <li>Item 2</li>
</ul>
```

Expression: `$convertHtmlToMarkdown(response.body)`

Result:

```
Welcome to Markdown
===================

This is a **bold** statement.

*   Item 1
*   Item 2
```

---

## `$convertMarkdownToHtml(markdownString)`

Converts Markdown content to HTML.

**Example:**

Input Markdown:

```
# Welcome to Markdown
This is a **bold** statement.
- Item 1
- Item 2
```

Expression: `$convertMarkdownToHtml(response.body)`

Result:

```html
<h1>Welcome to Markdown</h1>
<p>This is a <strong>bold</strong> statement.</p>
<ul>
  <li>Item 1</li>
  <li>Item 2</li>
</ul>
```

---

## `$convertMarkdownToNotion(markdown)`

Converts Markdown text into a Notion blocks payload. Refer to the [Notion Blocks documentation](https://developers.notion.com/reference/block) for the output structure.

**Example:**

Input:

```
# Hello, Notion!
This is some **bold** text.
```

Expression: `$convertMarkdownToNotion(body.content)`

Result (shape):

```
{
  children: [
    { type: "paragraph",  paragraph:  {...} },
    { type: "heading_1",  heading_1:  {...} },
    { type: "paragraph",  paragraph:  {...} }
  ]
}
```

---

## `$convertNotionToMarkdown(blocks)`

Transforms a list of Notion blocks back into a Markdown string, preserving headings, lists, and nested children.

**Example:**

Input Notion blocks:

```
[
  { type: 'heading_1', text: { content: 'Introduction' } },
  { type: 'paragraph', text: { content: 'This is a paragraph.' } },
  {
    type: 'bulleted_list_item',
    text: { content: 'List item 1' },
    children: [
      { type: 'bulleted_list_item', text: { content: 'Nested item 1' } }
    ]
  },
  { type: 'bulleted_list_item', text: { content: 'List item 2' } }
]
```

Expression: `$convertNotionToMarkdown(response.results)`

Result:

```
# Introduction

This is a paragraph.

- List item 1
  - Nested item 1
- List item 2
```

A single-block convenience function `$convertNotionToMd(block)` exists for converting one Notion block at a time.

---

## `$convertMarkdownToSlack(markdown)`

Converts Markdown into Slack [Block Kit](https://api.slack.com/block-kit) blocks. Note that Slack uses `*single-asterisks*` for bold (not `**`) — the function emits the correct dialect.

**Example:**

Input:

```
# Hello, Slack!
This is a message with *italic* and **bold** text.
```

Expression: `$convertMarkdownToSlack(body.message)`

Result:

```
[
  { type: "section", text: { type: "mrkdwn",     text: "\n" } },
  { type: "header",  text: { type: "plain_text", text: "Hello, Slack!", emoji: true } },
  { type: "section", text: { type: "mrkdwn",     text: "This is a message with *italic* and *bold* text." } }
]
```

---

## `$convertMarkdownToGoogleDocs(text)`

Converts Markdown into a [Google Docs API](https://developers.google.com/docs/api/reference/rest/v1/documents/request) `requests` payload — an array of `insertText`, `updateParagraphStyle`, `updateTextStyle`, etc. operations that you can POST to `documents.batchUpdate`.

**Example:**

Input:

```
# Hello, World!
This is a *bold* statement.
```

Expression: `$convertMarkdownToGoogleDocs(body.content)`

Result (shape):

```
{
  requests: [
    { insertText: {...} },
    { insertText: {...} },
    ...
    { updateParagraphStyle: {...} },
    { updateTextStyle: {...} }
  ]
}
```

---

## `$convertMarkdownToAdf(markdown)`

Converts Markdown into [Atlassian Document Format](https://developer.atlassian.com/cloud/jira/platform/apis/document/structure/) — the JSON document structure used by Jira and Confluence Cloud for descriptions, comments, and page bodies.

---

## `$convertMdToPdf(markdown, options?)`

Converts Markdown to a PDF `Blob` using jsPDF.

**Default options:**

```
{
  title: '',
  pageSize: 'a4',
  embedImages: false,
  pageMargins: [40, 60, 40, 60],
  defaultStyle: { fontSize: 12, lineHeight: 1.4 }
}
```

**Option fields:**

- `**title`** — Optional document title.
- `**pageSize**` — jsPDF page size string (e.g. `'a4'`, `'LETTER'`).
- `**embedImages**` — Reserved for future use.
- `**pageMargins**` — `[left, top, right, bottom]` in points.
- `**defaultStyle**` — `{ fontSize: number, lineHeight: number }`.

**Example:**

```
$convertMdToPdf(body.content)
```

Returns a `Blob` of type `application/pdf`.

If your transport requires a JSON-serializable value, convert the PDF Blob to a data URI string and decode it later:

```
$getDataUri($convertMdToPdf(body.content), 'application/pdf')
```

The result starts with `data:application/pdf;base64,...`.

---

## Common patterns in Truto config

> The unified-mapping examples below are written into `config.response_mapping` / `config.request_body_mapping` of an `environment-unified-model-resource-method` row (or a base `unified-model-resource-method` row for a custom model you own). For the full HTTP API and lifecycle, see [Unified API Customization](../../truto/references/unified-api-customization.md) in the `truto` skill.

**Unified mapping `response_mapping`** — normalize an HTML ticket description into Markdown for the unified `description` field:

```
response.tickets.{ "id": id, "title": subject, "description": $convertHtmlToMarkdown(description_html), "status": status }
```

**Unified mapping `request_body_mapping`** — convert the unified Markdown `description` into Notion's block format on create:

```
{ "parent": { "database_id": context.database_id }, "properties": { "Name": { "title": [{ "text": { "content": body.title } }] } }, "children": $convertMarkdownToNotion(body.description).children }
```

**Unified mapping `response_mapping`** (Notion → Markdown) — convert a Notion page's blocks back to Markdown for the unified shape:

```
{ "id": response.id, "title": response.properties.Name.title[0].plain_text, "content": $convertNotionToMarkdown(response.children) }
```

**Sync Job V4 — `transform.config.expression`** — round-trip Notion blocks to Slack Block Kit so each page becomes a Slack-ready message in a downstream webhook destination:

```
resources.`knowledge-base`.pages.{ "id": id, "title": title, "slack_blocks": $convertMarkdownToSlack($convertNotionToMarkdown(body.blocks)) }
```

**Sync Job V4 destination `payload` build** — convert each record's body to a PDF blob attachment for an outbound webhook (inside a destination's `config.expression` where `payload.records` is in scope):

```
payload.records.{ "id": id, "title": title, "pdf": $convertMdToPdf(body.content, { "format": "a4" }) }
```

