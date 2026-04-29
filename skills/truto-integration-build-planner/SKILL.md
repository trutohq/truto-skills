---
name: truto-integration-build-planner
description: Plan Truto integration creation or improvement from provider docs using `truto integrations build`. Use for AI-assisted integration build planning, dry runs, strict validation, source-tier control, resource filters, plan/report artifacts, description refresh, and review-before-apply workflows.
---

# Truto Integration Build Planner

Use this skill to run the CLI integration build pipeline as a proposal engine, not an autopilot.

Pair with the Truto CLI skill. Pair with truto-safe-admin-operator before applying any generated changes.

## Inputs

Collect:

- Profile
- Provider docs URL or source path
- Target integration slug
- Create vs improve intent
- Resource allow-list
- Source-tier hint, if auto discovery is wrong
- Companion docs for auth, errors, rate limits, webhooks, or lifecycle actions
- Label, category, or base URL overrides
- Goal: full build, descriptions-only, bad-description cleanup, docs resanitization, or audit

## Preflight

Confirm profile:

```bash
truto whoami -p "$PROFILE" -o json
```

For an existing slug:

```bash
truto integrations build "$DOC_SOURCE" "$SLUG" --lookup-only -p "$PROFILE" -o json
```

For a new slug, require explicit label, category, and base URL when known.

## Dry-Run Plans

Full review:

```bash
truto integrations build "$DOC_SOURCE" "$SLUG" --dry-run --strict --plan-out --report-out -p "$PROFILE"
```

Focused resource pass:

```bash
truto integrations build "$DOC_SOURCE" "$SLUG" --resources "$RESOURCES" --dry-run --strict --plan-out --report-out -p "$PROFILE"
```

Higher-quality method generation:

```bash
truto integrations build "$DOC_SOURCE" "$SLUG" --feedback-loop --max-iterations 3 --dry-run --strict --plan-out --report-out -p "$PROFILE"
```

Descriptions-only:

```bash
truto integrations build "$DOC_SOURCE" "$SLUG" --descriptions-only --dry-run --plan-out --report-out -p "$PROFILE"
```

Bad-description cleanup:

```bash
truto integrations build "$DOC_SOURCE" "$SLUG" --rewrite-bad-descriptions --dry-run --plan-out --report-out -p "$PROFILE"
```

Docs resanitization:

```bash
truto integrations build "$DOC_SOURCE" "$SLUG" --resanitise-existing-docs --dry-run --plan-out --report-out -p "$PROFILE"
```

## Source Control Choices

- Pin `--source-tier` only when evidence shows auto discovery chose the wrong source.
- Add `--companion-docs "$URL"` when the main spec lacks auth, errors, pagination, rate limits, webhooks, or lifecycle prose.
- Use `--no-firecrawl` when crawling is disallowed or a structured source is enough.
- Refresh cache only when source docs changed or cached output is suspect.
- Use `--resources` to reduce blast radius.

## Review Gate

Before recommending apply, verify:

- Strict validation has no blockers.
- Auth, base URL, category, and label are correct.
- Resource grouping and method names are sane.
- Pagination matches provider examples.
- Query/body schemas are useful but not bloated.
- Docs will land in documentation rows unless inline docs are intentionally required.
- Suppressed changes and report warnings are understood.

## Apply Policy

Never use `--yes` unless the user explicitly asks to apply.

To apply later, rerun the same command with `--yes` and without `--dry-run`, then verify with:

```bash
truto integrations validate "$INTEGRATION_ID" -p "$PROFILE" -o json
truto capabilities "$SLUG" --target integration -p "$PROFILE" -o json
```

## Output

Return:

- Build intent
- Exact dry-run command
- Plan/report artifact paths
- Blockers
- Review risks
- Apply recommendation
- Safe next command
