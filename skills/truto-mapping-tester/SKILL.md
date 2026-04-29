---
name: truto-mapping-tester
description: Test and debug Truto unified model mappings, JSONata response mappings, query/body/error mappings, environment overrides, and proxy-versus-unified mismatches with Truto CLI. Use for normalized data issues, mapping review, field mismatches, or mapping changes.
---

# Truto Mapping Tester

Use this skill to prove whether a unified API issue is caused by raw provider data, base mapping, environment override, query/body mapping, error mapping, or runtime behavior.

Pair with the Truto CLI skill and truto-jsonata.

## Inputs

Use any of:

- Profile
- Account ID
- Model/resource/method
- Integration name
- Environment unified model ID
- Raw sample file
- Query/body
- Mapping row ID
- Local mapping file
- Failing unified output

## Resolve Context

```bash
truto accounts get "$ACCOUNT_ID" -p "$PROFILE" -o json
truto capabilities "$ACCOUNT_ID" --target account --type unified -p "$PROFILE" -o json
truto unified-model-mappings list --integration_name "$INTEGRATION" --resource_name "$RESOURCE" --method_name "$METHOD" -p "$PROFILE" -o json
truto env-unified-models list --unified_model.name "$MODEL" -p "$PROFILE" -o json
truto env-unified-model-mappings list --environment_unified_model_id "$ENV_UNIFIED_MODEL_ID" --integration_name "$INTEGRATION" --resource_name "$RESOURCE" --method_name "$METHOD" -p "$PROFILE" -o json
```

If the environment unified model ID is unknown, infer it from `env-unified-models list` for the current profile environment.

## Build a Raw Sample

Capture provider-native data from proxy or custom:

```bash
truto proxy "$PROXY_RESOURCE" -m "$PROXY_METHOD" -a "$ACCOUNT_ID" -q "$QUERY_PARAMS" -p "$PROFILE" -o json > /tmp/truto-raw-sample.json
truto custom "$PATH" -m GET -a "$ACCOUNT_ID" -q "$QUERY_PARAMS" -p "$PROFILE" -o json > /tmp/truto-raw-sample.json
```

Use a small representative payload. Avoid large exports for mapping iteration.

## Offline Response Mapping

Local mapping:

```bash
truto unified test-mapping \
  --mapping-file "$MAPPING_FILE" \
  --input /tmp/truto-raw-sample.json \
  --show-mapping \
  -p "$PROFILE" \
  -o json
```

Platform base mapping:

```bash
truto unified test-mapping \
  --model "$MODEL" \
  --resource "$RESOURCE" \
  --integration "$INTEGRATION" \
  --method "$METHOD" \
  --input /tmp/truto-raw-sample.json \
  --show-mapping \
  -p "$PROFILE" \
  -o json
```

With environment overrides:

```bash
truto unified test-mapping \
  --model "$MODEL" \
  --resource "$RESOURCE" \
  --integration "$INTEGRATION" \
  --method "$METHOD" \
  --with-overrides "$ENV_UNIFIED_MODEL_ID" \
  --input /tmp/truto-raw-sample.json \
  --show-mapping \
  -p "$PROFILE" \
  -o json
```

## Runtime Compare

```bash
truto unified "$MODEL" "$RESOURCE" -m "$METHOD" -a "$ACCOUNT_ID" -q "$QUERY_PARAMS" -p "$PROFILE" -o json -v
```

If offline mapping succeeds but runtime fails, inspect query mapping, body mapping, error mapping, hooks, environment overrides, and logs.

## JSONata Checks

- Output matches the unified schema.
- Missing values are not mapped to `null` unless expected.
- Singleton-versus-array cases are normalized.
- Dates are ISO strings for date/date-time fields.
- `$query` and `$rawQuery` are used only when the mapping needs request context.
- `test-mapping` proves the response mapping expression, not the whole HTTP/runtime pipeline.

## Output

Return:

- Raw sample source
- Mapping rows tested
- Offline result
- Runtime comparison
- Failing fields
- Root cause
- Smallest mapping or query/body change to test next
