# MASTER-02 — Portable Experience Contract

## Status

Implementation branch: `master/02-portable-experience-contract`

Authoritative base: `910c57984dc9e99c43d20f35e64ead0836f1a703` (`MASTER-01: freeze product architecture and trust model`).

MASTER-01 is merged and is the only valid base for this phase.

## Goal

Make the current canonical Studio Experience contract consumable and verifiable across TypeScript, Swift and Kotlin **without creating a second Experience schema or portable bundle format**.

The semantic source of truth remains:

```text
@vira-enterprise-genui/studio-schema
        ↓
StudioExperienceDocument
        ↓
parseStudioExperienceDocument(...)
```

The existing portable envelope remains owned by `studio-enterprise`:

```text
StudioPortableBundle {
  version,
  brandId,
  document: StudioExperienceDocument
}
```

MASTER-02 adds generated interoperability artifacts and conformance gates around those owners. It does not replace them.

## Reverse-engineering baseline

### Canonical Studio document

`packages/studio-schema/src/types.ts` currently owns:

- `STUDIO_DOCUMENT_VERSION = "1"`;
- resource limits for views/nodes/bindings/interactions/payload bindings/event length;
- `StudioBindingSource` / repeat / node / view / binding types;
- interaction outcomes/routes/payload bindings;
- `StudioExperienceDocument`;
- validation issue codes/results.

`studio-schema` depends only on `protocol`.

### Semantic constraints are richer than TypeScript shape

The canonical parser also enforces behavior that a plain interface-to-schema conversion cannot fully represent:

- exact/closed allowed fields;
- semantic namespace and segment syntax from `protocol`;
- scope and payload-key syntax;
- bounded JSON values;
- view/node/binding/interaction resource limits;
- duplicate view/node/order/binding/interaction rejection;
- parent existence and node-parent cycle rejection;
- binding target integrity;
- route target integrity;
- action payload binding uniqueness;
- cross-field graph validity.

Therefore generated JSON Schema is the normative **wire/structural contract**, while `parseStudioExperienceDocument(...)` remains the canonical semantic validator. Cross-language conformance fixtures must make the distinction explicit; generated native models may not pretend that structural decoding alone grants publication/runtime validity.

### Existing portable contract

`studio-enterprise` already owns portable bundle versioning/import/export and delegates document validation back to `parseStudioExperienceDocument(...)`. Unsupported versions fail rather than being guessed or silently migrated.

No `PortableBundleV2` is introduced in this phase.

### Current build/CI

The repository is Node/TypeScript-first. GitHub CI already runs on an Ubuntu hosted runner and executes full `pnpm verify:all`.

The hosted Ubuntu 24.04 image provides `swiftc` and `kotlinc`, allowing a self-contained native conformance harness without adding an external package manager, remote bootstrap script, or new runtime dependency.

## Ownership decision

Do **not** create a new workspace runtime package such as `portable-runtime`, `studio-schema-v2`, `native-schema`, or separate iOS/Android Experience schemas.

Generated artifacts live under a non-package interop tree:

```text
interop/studio-experience/v1/
├── schema/
├── swift/
├── kotlin/
└── fixtures/
```

Generation/check tooling lives under `tooling/` and reads the canonical TypeScript source. The committed output is reproducible build output, not a semantic owner.

## Deliverables

### 1. Deterministic code generator

Add a Node generator under `tooling/` that derives the portable v1 shape from the canonical TypeScript source using the TypeScript compiler API.

The generator must:

- parse the current `studio-schema` type declarations rather than maintaining a hand-written duplicate field list;
- resolve literal unions, interfaces, optional properties, readonly arrays and the `typeof STUDIO_DOCUMENT_VERSION` reference used by the current document model;
- derive canonical document/version/limit constants from source;
- reuse canonical `protocol` semantic identifier and JSON-value limits where represented in generated schema metadata;
- produce stable sorted/normalized output;
- fail loudly when it encounters an unsupported TypeScript construct instead of silently weakening the contract.

A `--check` mode must compare generated output against committed artifacts and fail on drift.

### 2. Normative JSON Schema

Generate:

```text
interop/studio-experience/v1/schema/studio-experience-document.schema.json
```

Requirements:

- JSON Schema Draft 2020-12;
- root `additionalProperties: false` and closed object definitions;
- exact document version;
- required/optional fields matching TypeScript types;
- literal unions represented as enums/consts;
- arrays and object structures bounded where canonical limits are expressible;
- semantic identifier/string constraints represented when they are directly owned by canonical constants/syntax;
- JSON value shape represented recursively with canonical expressible bounds;
- `$defs` reused rather than duplicating inline structures unnecessarily;
- schema metadata explicitly states that cross-field graph/uniqueness/publication validity remains enforced by the canonical semantic validator/conformance suite.

The generated schema must not add renderer, endpoint, script, iframe, secret, callback or arbitrary executable fields.

### 3. Generated Swift models

Generate self-contained Swift models for the portable Studio Experience document under:

```text
interop/studio-experience/v1/swift/
```

Requirements:

- Foundation-only;
- `Codable`-compatible;
- exact field names and optionality;
- lossless recursive JSON values for `props` and literal payloads;
- deterministic encode/decode suitable for conformance tests;
- no UIKit/SwiftUI dependency in MASTER-02;
- no host/runtime/business action implementation.

### 4. Generated Kotlin models

Generate self-contained Kotlin/JVM models under:

```text
interop/studio-experience/v1/kotlin/
```

Requirements:

- no Android/Compose dependency in MASTER-02;
- no third-party runtime dependency;
- exact field names and optionality;
- lossless recursive JSON values;
- deterministic decode/encode support used by the conformance harness;
- no host/runtime/business action implementation.

### 5. Domain-neutral conformance fixtures

Add a synthetic fixture set under:

```text
interop/studio-experience/v1/fixtures/
```

At minimum:

- one valid multi-view document exercising nested nodes, parent/slot/order, state/domain/scope bindings, repeat source, routes and literal/action payload bindings;
- structural-invalid fixtures for unknown fields / bad version / wrong primitive shape;
- semantic-invalid fixtures for at least orphan parent, cycle, duplicate node order, duplicate binding target and dangling route;
- expected canonical issue code metadata for semantic-invalid fixtures.

Fixture namespaces must be synthetic and domain-neutral (for example `acme`/`demo`-style neutral semantics), not Pegasus/Flight/Recipe/customer logic.

### 6. TypeScript conformance test

Add a contract test that:

- validates every positive fixture with `parseStudioExperienceDocument(...)`;
- confirms JSON round-trip preserves canonical semantics;
- confirms every semantic-negative fixture is rejected with its expected current canonical issue code;
- confirms generated schema/model artifacts are deterministic and current;
- confirms generated artifacts contain no domain-specific or executable escape-hatch fields.

### 7. Swift conformance harness

Compile the generated Swift models with `swiftc`, decode the shared positive fixture, re-encode it, normalize JSON object ordering/representation, and prove semantic JSON equality with the input.

The harness must also prove strict version/structural decoding behavior expected by the generated model layer.

### 8. Kotlin conformance harness

Compile the generated Kotlin models/harness with `kotlinc`, decode the same shared positive fixture, re-encode it, and prove normalized semantic JSON equality.

The harness must be self-contained and may use JDK/Kotlin standard libraries only.

### 9. Repository/CI gate

Add repository scripts:

- generate portable interop artifacts;
- check generated artifact drift;
- run native Swift/Kotlin conformance.

The standard TypeScript `verify` path must include generated-drift/TypeScript contract checks.

GitHub CI must also run the native conformance command on a pinned compatible hosted Linux image so an uncompiled Swift/Kotlin artifact cannot merge.

Do not add package-manager bootstrap scripts or unpinned curl-to-shell dependencies merely to obtain compilers.

## Important semantic distinction

MASTER-02 creates a portable **representation and model conformance layer**.

It does not make JSON Schema or native `Codable`/data-class decoding the publication authority.

Canonical validity remains:

```text
wire/model structural validity
        +
canonical semantic validation
        +
later brand/capability/policy validation
```

Native host phases must preserve this semantic validation model rather than accepting any structurally decodable document.

## Scope exclusions

MASTER-02 does not implement:

- Brand Integration SDK (MASTER-03);
- Host Capability Manifest (MASTER-04);
- Resolver/instance isolation (MASTER-05);
- native iOS or Android host/runtime SDKs (MASTER-07B/C);
- Action Boundary (MASTER-08);
- deployment/signature/cache plane (MASTER-11);
- protocol adapters (MASTER-16);
- Pegasus extraction (MASTER-23).

No UIKit, SwiftUI, Android SDK, Compose, React, Web Component, customer-domain or backend code belongs in this PR.

## Acceptance / RE gate

MASTER-02 passes only if:

1. canonical `StudioExperienceDocument`/parser ownership remains in `studio-schema`;
2. existing portable bundle ownership/version remains in `studio-enterprise`;
3. no second hand-maintained Experience schema is introduced;
4. generated JSON Schema is deterministic and drift-checked;
5. Swift and Kotlin models are generated from the same canonical source metadata;
6. the same valid fixture parses/round-trips with semantic JSON equality in TypeScript, Swift and Kotlin;
7. semantic-negative fixtures remain rejected by the canonical TypeScript validator with exact expected issue codes;
8. native conformance code compiles in CI;
9. generated artifacts contain no executable/secret/backend escape hatch;
10. repository package boundaries remain unchanged unless an implementation need is proven (default expectation: no new workspace package);
11. full repository verification passes on the exact PR head;
12. independent post-implementation RE/QC returns `PASS` before squash merge.

## Merge rule

Squash merge only after the exact PR head satisfies the acceptance gate. The resulting `main` SHA becomes the sole base for MASTER-03.