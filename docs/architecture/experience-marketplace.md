# Experience Marketplace

Experience Marketplace is the curated public-discovery layer over exact Experience Pack versions already known by Experience Registry.

Registry membership does **not** imply Marketplace visibility.

```text
canonical Registry snapshot
          +
bounded listing-ref JSON
          ↓
Marketplace catalog builder
          ↓
canonical immutable catalog identity
          +
bounded query JSON
          ↓
deterministic discovery results
```

## Ownership

- Experience Packs owns Pack identity, version, publisher, metadata, compatibility and distribution artifacts.
- Experience Registry owns the bounded canonical set of known Pack versions plus exact lookup.
- Marketplace owns only explicit listing eligibility and a narrow public discovery projection.

Marketplace never re-validates Pack identity/version grammar and never accepts arbitrary catalog entries as authoritative.

## Canonical catalog boundary

A catalog can be created only from:

1. a canonical Registry snapshot identity;
2. explicit exact `{ id, version }` refs supplied as bounded JSON text.

Each ref is resolved through Registry exact lookup. The resulting catalog is frozen and recorded in a module-private identity set. Query APIs accept only that exact canonical catalog object. A serialized clone or hand-authored catalog object is not a Marketplace authority and is rejected.

This prevents fake entries, duplicate/reordered caller catalogs and hidden visibility bypasses without copying Pack/Registry validation into Marketplace.

## Discovery projection

Marketplace entries expose only:

- Pack id/version;
- publisher id/display name;
- Pack display name/optional description/tags;
- Vira compatibility range.

Raw Pack manifests, artifact digests/sizes/media types, entrypoints, Studio publications and runtime/execution configuration are not exposed.

## Query boundary

Query input is bounded JSON text with optional `text`, `publisherId`, `tag` and `limit` fields. Unknown fields or invalid values fail closed.

Filters are deterministic AND filters. Text is a case-insensitive substring over public Pack id, Pack display name and publisher display name. Publisher and tag filters are exact. Catalog ordering is preserved and no score is produced.

There is no regex/selector/SQL/shell interpretation, relevance ranking, popularity, personalization, recommendation or paid placement in v1.

## Non-commerce boundary

MKT-001 does not implement installation/execution, payments, licensing, entitlements, ratings/reviews, moderation, publisher onboarding, remote services, databases or search engines. Those require separate owning contracts rather than being hidden inside discovery metadata.
