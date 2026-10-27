# Integration and mapping artifact workflow

Build, optionally edit the artifact, then apply. Reports and fresh checks are automatic; do not add a separate report approval step.

```bash
truto integrations build https://docs.example.com/openapi.json acme
truto integrations apply acme.integration.json
truto unified-mappings build acme crm --source-url https://docs.example.com/openapi.json
truto unified-mappings apply acme.crm.mappings.json --target base
```

Both builds save the exact checked candidate with a matching report and an authoritative `<artifact>.committed` pair. Edit only the artifact. Apply validates edited content against the projected live result before writing; a historical report never certifies later edits. A failure before an artifact exists has no invented output/report. Report commit failure preserves work and fails the run.

## Questions and confidence

Both builds now record a `confidence` (high/medium/low, information only -- it never blocks apply or publishing) and any open question, per method or cell, inside the matching report (also written as Markdown for people, e.g. `acme.integration.report.md`). A build that ends with something still waiting or blocked exits 3, not 0 (an integration build's `--fail-on none` is the one way to keep its own exit at 0 regardless). Answer with `build --continue <file> --answer id="…"` (repeatable) or `--answers <file>`; never the value itself for anything that looks like a credential -- it is refused outright. `--continue` rebuilds only what waited on the answered questions, spending no repair round, and refuses flags that change what is built (`--out`, `--docs-only`, `--only-missing`, `--resources`, …); a new gap the rebuild turns up waits on a new question, and the one just answered is never asked again. In a terminal, each build asks its own open questions itself before it finishes, instead of exiting with them unanswered (integration: at the very end, after refinement; mapping: before its refinement loop); Enter skips one and leaves it open.

## Optional inspection and prepared execution

```bash
truto integrations build --recheck acme.integration.json
truto unified-mappings build --recheck acme.crm.mappings.json
truto integrations apply acme.integration.json --dry-run
truto unified-mappings apply acme.crm.mappings.json --dry-run
truto integrations apply acme.integration.json --prepare
truto integrations apply acme.integration.json --plan acme.integration.json.plan.json --expect-digest <digest>
```

Recheck is offline and does not generate; it rewrites the file's `_build` marker when its known skips change. An explicit integration `--spec <url>` still fetches the spec. An integration UPDATE artifact with no `.committed` gets its report refreshed but is not committed; apply recovers its baseline with a live read. Dry run performs no Truto reads, locks, local writes, platform writes or account tests; merge/live checks remain unevaluated. It exits 0 unless input is unreadable (exit 1), except that an integration CREATE file (no `id`) with audit ERRORs or `--spec` violations exits 3 (next = `truto integrations lint <file>`) unless `--allow-audit-errors` / `--allow-spec-violations`; an UPDATE or `--docs-only` dry run only lists them (exit 0). Use `truto integrations lint <file>` as the offline gate: it exits 1 on any ERROR or WARN (`--ignore-warnings`: on ERRORs only), while apply blocks only on ERRORs. Prepare reads and reconciles, commits locally and writes a plan (`--plan-out <path>` overrides the default, but may not be the artifact or another CLI-owned file); it does not write Truto or test an account. `--plan` executes only that plan and stops on stale inputs. The plan stores a `--spec` URL without its query string, so repeat the same `--spec` with `--plan` when the URL needs it. Mapping `--plan` requires `--expect-digest`.

Prepared plans retain the test account selected by `--test-account` or the profile, or no account if none was selected. Later profile changes do not switch that choice; run `--prepare` again to change the account.

## Concurrent changes, partial work and recovery

Apply compares the artifact, its trustworthy committed baseline and live. Unrelated live changes are preserved and synced into the file. A reported clash is resolved explicitly with `--resolve '<item>=mine'` or `--resolve '<item>=theirs'`; mine still runs every check and applies only to the recorded live value. A different host/team/environment/integration or base/env target uses a separate working copy, preserving the original.

Eligible work can land while individual items are skipped, held, clashing, rejected or uncertain. A shared config/dependency issue can hold the config write; docs follow the method they describe. Mapping rows preserve authored fields and environment inheritance. Do not copy merged effective values into an authored override. All mapping-list pages must be read before assuming a row is absent. `db_info` is build context, not authority to overwrite live state.

Each write is reread. Lost responses and crashes retain enough state to reconcile a later run; never delete sidecars or add dummy edits to force retries. An editor save during the run is preserved. Integration method/doc removals need `--allow-method-removal` / `--prune-docs`; CREATE is private beta, and UPDATE never publishes or changes beta status. After a CREATE with `--slug-override`, apply writes the new `id` and the override as `name` into the artifact. A build whose output file is committed for another host/team/environment/integration stops with exit 1; pass another `--out`.

Apply exits 0 for complete/unchanged, 2 for landed writes with pending work, 3 for blocked/nothing-written with pending work, 1 for auth/unexpected failure and 4 for an otherwise complete run with an executed test failure. `-o json` emits one structured result. Dry run is a preview, not readiness proof.

## Documentation and repair

Changes to method verb/path, response path, body/body format, query/header placeholders, examples or pagination can refresh unedited docs during apply/prepare from recorded, grounded method regions and configured model access. Scopes/static headers make zero generation calls. Manual doc edits stay yours; missing sources/models and failures retain existing rows with a reason. Global auth/pagination changes run deterministic cleanup and stale labels without broad generation.

Build/apply repairs share at most two rounds within the authorized run. A round can cover many methods; first-pass batching, truncation handling and bounded transport retries are not separate rounds. Confirmed unchanged-source gaps suppress repeated generation until relevant source/config/gap/model inputs change. Timeouts, malformed output and bad model configuration remain retryable. Explicit docs-only build refreshes docs in a separate `<slug>.docs.integration.json`; config is preserved exactly. Built from a file, its baseline is that file's own `.committed`; without one, rows the file held exactly as live did use that value and others are unknown (a teammate's live doc edit then clashes instead of being overwritten). Apply it with `--docs-only`. An instruction typed in a mapping build's refinement loop does not spend a repair round.

## Eligible account reads

```bash
truto profiles set test-account.acme <account-id>
truto integrations apply acme.integration.json --test-account <account-id>
truto unified-mappings apply acme.crm.mappings.json --test-account <account-id>
```

The invocation account overrides the profile mapping. Marked accounts apply only when the token comes from the profile: an explicit `-p` beats `TRUTO_API_TOKEN`/`TRUTO_API_URL`, and a missing `-p` profile is an error. A mapping build samples only `--account`, the marked test account or an account picked at the prompt, never the profile's `defaultIntegratedAccount`. Use only the user's authorized target/account. Marking or testing discloses that reads can refresh tokens, change Truto reauth/forbidden state, emit ordinary auth/forbidden webhooks and affect sync jobs. Probes stop after the first provider 401 or failed refresh for an account. Provider mutations are never verification probes.

Every mapping sample and bootstrap call uses the shared effective-request safety gate; a `list`/`get` name or HTTP GET alone does not prove safety. It considers overrides, dependencies and evaluated request behavior. Unsafe/unproven reads are skipped and documentation examples can support independent work.

After its own fresh write, apply waits about 7 minutes after the cache refresh before reading; a test that does not fit the remaining run time, or follows another writer's change in the last 30 minutes, stays pending. Mapping apply re-checks failures recorded by build/recheck, reports a check whose live sample is gone as not run, and lists a cell the build could not produce as pending with its build command. Successful reads show a bounded transient terminal sample with credential and cursor fields withheld. Keep saved, applied, locally checked and live-tested distinct. Missing accounts, samples/inputs, runtime compatibility or exhausted time can leave checks explicitly not run. Even when reads execute, cache refresh is asynchronous and does not prove the served version: `version_confirmed=false` remains honest. Local JSONata success is not worker parity: versions/engine selection are unchanged. Never copy newly fetched provider records, credentials, bodies, debug envelopes or cursor values into reports/plans/committed state or repair prompts.

## Explicit restore and investigation

```bash
truto integrations get <id> --at-version <previous-version> -o json
truto integrations get <id> -o json
truto integrations update <id> --lock-version <current-version> --body-file restore.json --replace-config
truto docs get <doc-id> -o json
truto docs update <doc-id> --body-file doc-restore.json
```

Inspect old and current values first. `restore.json` contains a complete update body such as `{ "config": ... }`; `doc-restore.json` contains `{ "content": ... }`. `--body-file -` reads stdin. `--replace-config` acknowledges deliberate removals; `--merge-config` is for an intentional partial update. Secret-preservation holds still apply. Literal credentials belong outside build artifacts; affected writes stay held until the backend preservation prerequisite is verified on that host. Do not automatically revert live data.

`truto logs --log-type unified_proxy_api --integrated-account-id <id> --all` follows bounded pages with a fixed end time. `--next-cursor <cursor>` resumes. API query failure is an error, not an empty success. Logs aid diagnosis but cannot prove which cached config version executed.
