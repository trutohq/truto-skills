# Datetime Functions

Date and time parsing for Truto JSONata expressions, backed by [Luxon](https://moment.github.io/luxon/). Use these whenever you need to parse a date string from an integration's response (or your input) into a value you can format, compare, or convert back to ISO.

Both functions return a [Luxon `DateTime`](https://moment.github.io/luxon/api-docs/index.html#datetime) object. You can chain Luxon methods on the result inside a JSONata expression — e.g. `$dtFromIso(date).toISO()`, `$dtFromIso(date).toMillis()`, `$dtFromIso(date).plus({ days: 7 }).toISO()`.

---

## `$dtFromIso(datetimeString)`

Converts an ISO 8601 date-time string to a Luxon `DateTime` object.

**Example:**

```
$dtFromIso('2024-11-05T12:00:00Z')
```

Result: `DateTime { ts: 2024-11-05T12:00:00.000+00:00, zone: UTC, locale: en-US }`

---

## `$dtFromFormat(datetimeString, format)`

Parses a date-time string according to a Luxon format token string and returns a Luxon `DateTime` object. See [Luxon format tokens](https://moment.github.io/luxon/#/parsing?id=table-of-tokens) for the full list.

**Example:**

```
$dtFromFormat('01-11-2022 12:00', 'dd-MM-yyyy HH:mm')
```

Result: `DateTime { ts: 2022-11-01T12:00:00.000+00:00, zone: UTC, locale: en-US }`

---

## Common patterns in Truto config

> The unified-mapping examples below are written into `config.response_mapping` / `config.query_mapping` of an `environment-unified-model-resource-method` row (or a base `unified-model-resource-method` row for a custom model you own). For the full HTTP API and lifecycle, see [Unified API Customization](../../truto/references/unified-api-customization.md) in the `truto` skill.

**Unified mapping `response_mapping`** — convert an integration's mm/dd/yyyy date field to ISO before surfacing it on the unified shape:

```
response.records.{ "id": Id, "created_at": $dtFromFormat(CreatedDate, 'MM/dd/yyyy').toISO(), "updated_at": $dtFromFormat(LastModifiedDate, 'MM/dd/yyyy').toISO() }
```

**Unified mapping `query_mapping`** — convert an ISO datetime in the unified `query.updated_at.gt` to the integration's required Unix-seconds filter:

```
{ "modifiedSince": $floor($toMillis(query.updated_at.gt) / 1000) }
```

(`$toMillis` is built-in JSONata and accepts ISO strings directly, so `$dtFromIso` is only needed when you want Luxon-specific methods on the result.)

**Unified mapping `query_mapping`** — convert an ISO range filter to the integration's `from` / `to` mm/dd/yyyy strings:

```
{ "start_date_from": $dtFromIso(query.start_date.gte).toFormat('yyyy-MM-dd'), "start_date_to": $dtFromIso(query.start_date.lte).toFormat('yyyy-MM-dd') }
```

**Sync Job V4 — `update_state.value_expression`** — write a cursor with a 2-minute safety backoff so records updated mid-sync aren't missed on the next run:

```
sync_job_run.status = 'completed' ? $dtFromIso(sync_job_run.started_at.toISOString()).minus({ "minutes": 2 }).toUTC().toISO()
```

**Sync Job V4 — `add_context.config.expression`** — derive an end-of-day boundary from the run start time and expose it to downstream `request.query` placeholders:

```
{ "end_of_day": $dtFromIso(sync_job_run.started_at.toISOString()).endOf('day').toISO() }
```
