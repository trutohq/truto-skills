# Schema conventions for unified mappings

What a `response_mapping` has to emit for the row to be *usable*, as distinct
from *syntactically valid*. `unified-mappings validate` checks the shape of the
MappingFile; none of the rules below are enforced anywhere, so a mapping can
apply cleanly and still be wrong in every way this page describes.

Derived by reading `crm`, `ats`, `hris` and `ticketing` against their live
mappings, and from an audit of the `aws` / `cloud-infrastructure` family (22 Sep
2026) where every one of these rules was broken at least once.

---

## 1. Emit the enum the model declares, not the provider's

The single most common defect, and the one with the widest blast radius.

A property with an `enum` list is a contract. Passing the provider's value
through — even when it means the same thing — makes the field unfilterable.

```jsonata
/* WRONG — AWS says ACTIVE, the model declares active */
"state": response.Status._text

/* RIGHT */
"state": $lowercase(response.Status._text)
```

Translate, do not pass through:

| provider | model |
|---|---|
| `"COMPLIANT"` | `"compliant"` |
| `"nat_gateway_outbound_only"` | `"nat_only"` |
| `"organizational_unit"` | `"organisational_unit"` |

Two traps worth naming:

- **British spelling.** Several models use `organisation`, `organisational_unit`.
  A mapping author writing American English produces a value that never matches.
- **Inventing a member.** If no declared value fits, the answer is to widen the
  model's enum in the same change — not to emit a new string and hope.

Before finishing a mapping, read the model's schema and diff every literal you
emit against the enum on that property. `unified test-mapping` will not catch
this; nothing will, until a customer filters on it.

## 2. A reference to another resource is an object, not an id

When a field points at an entity that exists **as another resource in the same
unified model family**, emit an object:

```jsonata
/* WRONG */
"encryption_key_id": response.KmsKeyId._text

/* RIGHT */
"encryption_key": { "id": response.KmsKeyId._text }
```

- Minimum payload is `{id}`. Add `name` when it costs nothing.
- Many-side references are arrays of the same object: `"replicas": [{id}, …]`.
- **The value must equal the target resource's own `id`**, or the reference
  cannot resolve. If `object_stores.id` is a bucket ARN, a reference to it
  carries the ARN — not the bucket name.
- On the schema side, annotate with `xTrutoReference { resource, attribute }`.
  `crm`, `hris` and `ticketing` all do; `ats` does not, so the object shape is
  the hard rule and the annotation is the maturity marker.

The provider almost always hands you a bare id. Wrapping it is the mapping's
job — `greenhouse/applications/list` turns the provider's `candidate_id` into
`"candidate": { "id": candidate_id }`.

**A bare `*_id` string is still right** when the value is a genuine external
identifier with no row to point at: a CVE id, a compliance control id, an
account outside the connected organisation, or a polymorphic ARN spanning types
that are not resources in this family. Ask "could a consumer follow this to
another row?" — if yes, it is an object.

## 3. `remote_data` is the platform's, not yours

There is no `*_raw` companion convention. Raw passthrough is `remote_data`,
injected by the platform. No reference model declares it in its schema, and a
mapping that hand-builds it is doing work that will be done again.

## 4. Naming and types

- Timestamps end `_at` **and** carry `"format": "date-time"` on the property.
  A `_time` suffix is a mistake; so is an `_at` field with no format.
- Emit ISO-8601. An epoch value in a `date-time` field is a silent type error —
  common with AWS `awsJson1_1` and anything else that wires timestamps as
  numbers. Use a helper (`$ts()` in the AWS mappings) rather than passing
  through.
- A `boolean` property needs a comparison, not the provider's string. AWS
  `YES | NO | PARTIAL` and `enable | disable` are the usual offenders:
  `response.fixAvailable = "YES"`, not `response.fixAvailable`.
- A `string` property needs a string. Emitting a parsed policy document where
  the model declares `string` fails downstream; emit the raw text or `$string()`.
- `is_` prefixes on booleans are **not** a house rule — `deleted`, `can_email`
  and `confidential` all ship without one. Follow the model you are mapping.
- Do not emit a field that duplicates `id` or `provider_id` under a per-resource
  alias (`grant_id`, `key_id`, `store_id`).

## 5. `id` must be unique across everything the connection can return

An `id` that repeats silently overwrites rows, which is the failure mode nobody
reports because the sync looks fine.

Check the dimensions the connection sweeps — most often **region**, and for
multi-account connectors the **account**. If the provider's identifier is a
constant or a label (`"default"`, `"EC2"`, a session name), it is not an id:

```jsonata
/* WRONG — same id in every region */
"id": $p & "|" & $ref

/* RIGHT */
"id": $p & "|" & $ref & "|" & rawQuery.region
```

Also check for two upstream objects that legitimately share a name — an inline
policy and an attached policy both called `ReadOnly` — and disambiguate with
something that differs.

## 6. XML resources: `._text` on every scalar

When the integration sets `api_response_format: application/xml`, parsed values
are objects and the scalar lives at `._text`. Reading the field directly yields
an object, which serialises into the row as `{"_text": "…"}`.

Two places this is easy to miss:

- **Inside `.(...)`**, the context is the iterated item, so `response.Foo`
  resolves against that item and returns nothing. Hoist what you need before the
  map:
  ```jsonata
  $dbid := response.DBClusterIdentifier._text;
  $append([], $logs._text).($dbid & "/" & $)
  ```
- **Scalar lists.** `$append([], x.member)` gives objects; you want
  `$append([], x.member._text)`.

XML also collapses a single-element list into one object rather than an array of
one. `$append([], …)` is the idiom that makes both shapes iterate.

## 7. Security-shaped booleans need the whole predicate

A field named `has_open_ingress_from_anywhere` or
`has_unconditional_wildcard_trust` is read as an assurance. A partial predicate
returns `false` for a genuinely open resource, which is worse than not having
the field.

- Cover IPv6 as well as IPv4 (`::/0`, not just `0.0.0.0/0`).
- Cover every shape the provider allows — an IAM trust policy accepts both
  `{"Principal": {"AWS": "*"}}` and `{"Principal": "*"}`.
- When extracting one keyed value out of a condition block, key on the name.
  Taking every value returns unrelated ones alongside it.

---

## Review checklist

Before `unified-mappings apply`:

- [ ] Every literal emitted into an `enum` property appears in that enum
- [ ] Every same-family reference is an object whose `id` matches the target's `id`
- [ ] No hand-built `remote_data`
- [ ] Every timestamp is `_at`, `date-time`, and ISO — not epoch
- [ ] Every `boolean` is a comparison; every `string` is a string
- [ ] `id` is unique across region, account, and same-named upstream objects
- [ ] On XML resources, every scalar reads `._text`, including inside `.(...)`
- [ ] Security booleans cover IPv6 and every principal shape
