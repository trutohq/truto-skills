---
name: truto-export-diff-analyst
description: Analyze Truto records and datasets with export and diff. Use when comparing data, records, accounts, raw-vs-unified output, missing records, pagination behavior, sampled fields, counts, or changed API output.
---

# Truto Export Diff Analyst

Use this skill to compare records or datasets without relying on truncated table output.

Pair with the Truto CLI skill. Prefer `-o ndjson` for large exports.

## Inputs

Use any of:

- Profile
- Account ID
- Second account ID
- Unified resource path like `crm/contacts`
- Proxy resource like `tickets`
- Record IDs
- Query params
- Expected count or sample fields
- Before/after files

## Resource Choice

Use slash paths for unified API:

```bash
truto export crm/contacts -a "$ACCOUNT_ID" -p "$PROFILE" -o ndjson --out /tmp/contacts.ndjson
```

Use single-segment paths for proxy API:

```bash
truto export tickets -a "$ACCOUNT_ID" -p "$PROFILE" -o ndjson --out /tmp/tickets.ndjson
```

Run capabilities first if the resource is not certain:

```bash
truto capabilities "$ACCOUNT_ID" --target account -p "$PROFILE" -o json
```

## Export

Use exact filters from the customer request:

```bash
truto export "$RESOURCE_PATH" \
  -a "$ACCOUNT_ID" \
  -q "$QUERY_PARAMS" \
  -p "$PROFILE" \
  -o ndjson \
  --out "$OUT_FILE"
```

For small one-off inspection:

```bash
truto export "$RESOURCE_PATH" "$ID" -a "$ACCOUNT_ID" -p "$PROFILE" -o json --out /tmp/record.json
```

## Diff

Same account:

```bash
truto diff "$RESOURCE_PATH" "$ID1" "$ID2" -a "$ACCOUNT_ID" -p "$PROFILE" -o json
```

Cross-account:

```bash
truto diff "$RESOURCE_PATH" "$ID" -a "$ACCOUNT_ID_1" --account2 "$ACCOUNT_ID_2" -p "$PROFILE" -o json
```

Raw-vs-unified:

```bash
truto export "$PROXY_RESOURCE" -a "$ACCOUNT_ID" -p "$PROFILE" -o ndjson --out /tmp/raw.ndjson
truto export "$UNIFIED_MODEL/$UNIFIED_RESOURCE" -a "$ACCOUNT_ID" -p "$PROFILE" -o ndjson --out /tmp/unified.ndjson
```

## Analysis

Check:

- Query filters match the customer request exactly.
- Export count matches direct list/get behavior.
- Direct get by ID before concluding pagination lost a record.
- First and last records for cursor/pagination issues.
- Proxy output versus unified output for mapping issues.
- Same record across accounts only after confirming both accounts use comparable provider data and config.

## Output

Return:

- Counts
- Files written
- Sample fields compared
- Field-level diffs
- Likely cause
- Exact rerun commands
- Whether the issue is pagination, mapping, provider data, query mismatch, or account difference
