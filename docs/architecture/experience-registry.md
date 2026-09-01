# Experience Registry

Experience Registry is a bounded immutable index over canonical Experience Pack manifests. It does not own Pack syntax, artifact storage, transport, marketplace ranking, or runtime execution.

```text
unknown snapshot input
      ↓
bounded plain-data preflight
      ↓
existing Experience Pack parser
      ↓
canonical ExperiencePackManifest values
      ↓
immutable Registry snapshot
      ↓
exact id + version lookup
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

## Safety preflight

Registry performs a generic bounded plain-data inspection before passing nested values to the Pack parser. This exists only to ensure arbitrary accessors/symbol-backed/custom-array graphs cannot execute during delegation. It does not reproduce Pack semantic validation.

## Transport boundary

OCI Distribution defines network push/pull/content-discovery semantics for manifests and blobs. REG-001 intentionally stops before that transport layer: there is no network endpoint, filesystem, database, object store, blob upload, or remote fetch in the canonical Registry package.
