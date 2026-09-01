# Experience Registry

Experience Registry is a bounded immutable index over canonical Experience Pack manifests. It does not own Pack syntax, artifact storage, transport, marketplace ranking, or runtime execution.

```text
bounded Registry JSON text
      ↓
pre-parse structural budget
(containers + structural tokens)
      ↓
JSON.parse()
      ↓
iterative null-prototype detach
      ↓
existing Experience Pack parser
      ↓
canonical ExperiencePackManifest values
      ↓
identity-marked immutable Registry snapshot
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

## Untrusted-data boundary

Arbitrary in-process JavaScript objects cannot be safely inspected for Proxy traps in a provider-neutral way. REG-001 therefore accepts untrusted Registry snapshots only as bounded JSON text.

Before parsing, Registry enforces three independent ingress budgets:

- maximum serialized length: 16,000,000 characters;
- maximum structural containers (`{` and `[` outside JSON strings): 100,000;
- maximum structural tokens (`{`, `[`, `,`, `:` outside JSON strings): 500,000.

The structural scan is constant-memory and lexical only; it does not duplicate JSON syntax or Experience Pack semantics. Characters inside quoted JSON strings do not consume the structural budgets. The token budget prevents a single huge primitive array/object from bypassing the container budget, while the container budget prevents tiny nested-object amplification. `JSON.parse` is captured at module initialization so later ambient mutation of `JSON.parse` does not control Registry parsing.

After parsing, only the manifest graph is iteratively detached. Every ordinary JSON object is copied into a null-prototype object before Pack validation, and the detacher keeps a matching 100,000-container defense-in-depth budget. This prevents polluted `Object.prototype` properties/getters from satisfying or observing missing Pack fields. Arrays are rebuilt from own data slots. The detached graph is then delegated to the canonical Pack parser.

This removes accessor, Proxy, symbol, sparse/custom-array, inherited-object-state, pre-parse graph amplification, and unbounded pre-reflection concerns from the Registry ingress boundary without creating a second Pack validator.

Successfully parsed snapshots are recorded in a module-private identity set using captured intrinsics. Exact lookup accepts only one of those canonical snapshot objects, so an arbitrary object or Proxy is rejected before any of its properties are read.

Lookup id/version strings use one independent large safety bound rather than mirroring current Pack grammar lengths. Exact membership in the canonical snapshot determines whether a key exists.

## Transport boundary

JSON text here is only the safe in-process parse boundary; REG-001 does not define a network wire protocol. OCI Distribution defines network push/pull/content-discovery semantics for manifests and blobs. REG-001 intentionally stops before that transport layer: there is no network endpoint, filesystem, database, object store, blob upload, or remote fetch in the canonical Registry package.
