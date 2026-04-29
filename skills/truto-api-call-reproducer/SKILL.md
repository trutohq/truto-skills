---
name: truto-api-call-reproducer
description: Reproduce and minimize Truto unified, proxy, custom, batch, export, or diff API behavior with exact CLI commands. Use when given an endpoint, resource, method, query, body, curl-like request, error, or expected-versus-actual API result.
---

# Truto API Call Reproducer

Use this skill to turn a failing or unclear API behavior into the smallest reliable Truto CLI command that proves it.

Pair with the Truto CLI skill. Prefer read-only `list` and `get` commands. Do not test writes unless the user explicitly asks.

## Inputs

Accept any of:

- Profile
- Account ID
- Unified model/resource
- Proxy resource
- Custom provider path
- Method
- Record ID
- Query params
- Body
- Expected output
- Actual error or log snippet

## Preflight

```bash
truto whoami -p "$PROFILE" -o json
truto accounts get "$ACCOUNT_ID" -p "$PROFILE" -o json
truto capabilities "$ACCOUNT_ID" --target account -p "$PROFILE" -o json
```

Copy resource names, methods, and model names from capabilities. Do not guess them.

Use `truto accounts tools "$ACCOUNT_ID" -o json` only when you need the full query/body schema for a specific method.

## Minimal Commands

Unified API:

```bash
truto unified "$MODEL" "$RESOURCE" -m "$METHOD" -a "$ACCOUNT_ID" -p "$PROFILE" -o json
truto unified "$MODEL" "$RESOURCE" "$ID" -m get -a "$ACCOUNT_ID" -p "$PROFILE" -o json
```

Proxy API:

```bash
truto proxy "$RESOURCE" -m "$METHOD" -a "$ACCOUNT_ID" -p "$PROFILE" -o json
truto proxy "$RESOURCE" "$ID" -m get -a "$ACCOUNT_ID" -p "$PROFILE" -o json
```

Custom API:

```bash
truto custom "$PATH" -m "$HTTP_METHOD" -a "$ACCOUNT_ID" -p "$PROFILE" -o json
```

Query params:

```bash
truto proxy "$RESOURCE" -m list -a "$ACCOUNT_ID" -q "limit=50,status=active" -p "$PROFILE" -o json
```

Body from stdin:

```bash
truto proxy "$RESOURCE" -m create -a "$ACCOUNT_ID" --stdin -p "$PROFILE" -o json < body.json
```

Export and diff:

```bash
truto export "$RESOURCE_PATH" -a "$ACCOUNT_ID" -p "$PROFILE" -o ndjson --out /tmp/truto-export.ndjson
truto diff "$RESOURCE_PATH" "$ID1" "$ID2" -a "$ACCOUNT_ID" -p "$PROFILE" -o json
```

## Debugging

Add `-v` only after the minimal command shape is correct:

```bash
truto proxy "$RESOURCE" -m "$METHOD" -a "$ACCOUNT_ID" -p "$PROFILE" -o json -v
```

Compare:

- CLI argument parsing
- Truto URL, method, query, and body
- Provider status and response
- Truto normalized error or output
- Logs for the same account and time window

Redact auth headers, cookies, tokens, API keys, OAuth secrets, and customer PII before reporting.

## Output

Return:

- Final minimal command
- Why it uses unified, proxy, custom, batch, export, or diff
- Observed result
- Whether behavior was reproduced
- The next deeper command if more evidence is needed
