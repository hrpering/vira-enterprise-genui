# Experience Registry

Experience Registry is a bounded immutable index over canonical Experience Pack manifests. It does not own Pack syntax, artifact storage, transport, marketplace ranking, or runtime execution.

```text
bounded Registry JSON text
      ↓
JSON.parse()
      ↓
existing Experience Pack parser
      ↓
canonical ExperiencePackManifest values
      ↓
identity-marked immutable Registry snapshot
      ↓
exact primitive id + version lookup
```

## Canonical ownership

`@vira-enterprise-genui/experience-packs` remains the only owner of Pack identifiers, versions, publisher data, metadata, compatibility, entrypoints, artifacts, media types, and Pack validation. Registry stores canonical manifests as-is and never recreates those field contracts.

## Snapshot semantics

REG-001 snapshots:

- use Registry schema version `1`;
- contain at most 256 canonical Pack manifests;
- reject duplicate `(id, version)` pairs;
- normalize entry order deterministically by exact `id`, then exact `version` string;
- are deeply immutable because Pack manifests are canonical frozen values and the Registry collection is frozen.

Lookup is exact only. A miss returns `null`; there is no mutable `latest` tag or semver range selection in v1.

## Untrusted-data boundary

Arbitrary in-process JavaScript objects cannot be safely inspected for Proxy traps in a provider-neutral way. REG-001 therefore accepts untrusted Registry snapshots only as bounded JSON text. The input length is capped before `JSON.parse()`, and the resulting ordinary data is then delegated to the canonical Pack parser.

This removes accessor, Proxy, symbol, sparse/custom-array, and unbounded pre-reflection concerns from the Registry ingress boundary without creating a second Pack validator.

Successfully parsed snapshots are recorded in a module-private identity set. Exact lookup accepts only one of those canonical snapshot objects, so an arbitrary object or Proxy is rejected before any of its properties are read.

Lookup id/version strings use one independent large safety bound rather than mirroring current Pack grammar lengths. Exact membership in the canonical snapshot determines whether a key exists.

## Transport boundary

JSON text here is only the safe in-process parse boundary; REG-001 does not define a network wire protocol. OCI Distribution defines network push/pull/content-discovery semantics for manifests and blobs. REG-001 intentionally stops before that transport layer: there is no network endpoint, filesystem, database, object store, blob upload, or remote fetch in the canonical Registry package.
