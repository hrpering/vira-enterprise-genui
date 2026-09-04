# MASTER-27 Reverse-Engineering Report

## Baseline

```text
main   1980368befeafa3c7b0de5c38bcfb2429ffb6f5e
branch master/27-application-package
```

## Nearest owners inspected

- MASTER-26 `APPLICATION_MODEL.md`, `APPLICATION_AUTHORITY.md`, `APPLICATION_VERSION_MODEL.md`;
- `PACKAGE_OWNERSHIP.md`;
- `PLATFORM_MODEL.md`;
- `experience-packs` parser/types/tests;
- `studio-brand` / `BrandProfile` types;
- `protocol` semantic identity and safe JSON parser;
- executable package boundary graph.

## Findings

1. Existing Experience Pack is an immutable Experience distribution artifact, not the higher-order Application owner.
2. `StudioPublication.version === "1"` and Brand profile/package versions are schema versions, so generic dependency references cannot incorrectly assume every owner uses release semver.
3. Application release itself should use semver, while generic references need an exact opaque `versionRef` that rejects floating aliases/ranges.
4. Experience references can bind concretely to existing Pack `id + version + entrypoint` without embedding publication/document payloads.
5. `protocol.parseJsonValue` already supplies the repository's safe own-data boundary for plain JSON, including rejection of accessors, custom prototypes, symbols, cycles, non-finite numbers and non-enumerable fields.
6. The new package needs only the `protocol` dependency for safe parsing and canonical semantic-id validation.
7. Capability, WorkContext and ApplicationGraph payloads do not exist yet by design; MASTER-27 must carry references only and leave their contracts to MASTER-28/29/30.

## Decision

Create one small package `@vira-enterprise-genui/application-package` owning only Application release/reference-graph semantics. Do not add it to runtime/genui aggregation yet and do not add registry/resolver/execution behavior in this phase.
