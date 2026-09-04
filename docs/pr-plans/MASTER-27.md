# MASTER-27 — Vira Application Package

## Goal

Implement the first executable `ViraApplicationPackage` contract from the MASTER-26 semantic freeze without duplicating Experience, Pack, Brand, Capability, Context, Action, governance or runtime owners.

## Base

- authoritative `main`: `1980368befeafa3c7b0de5c38bcfb2429ffb6f5e`
- previous phase: MASTER-26 merged via PR #186
- branch: `master/27-application-package`

## Ownership

`application-package` OWNS:

- stable Application identity;
- immutable Application release version;
- publisher identity;
- exact semantic dependency references;
- package-level host compatibility metadata;
- distribution metadata;
- commercial metadata references;
- deterministic canonical serialization of the package contract.

It DOES NOT OWN:

- `StudioExperienceDocument` or `StudioPublication`;
- Experience Pack manifest grammar/payloads;
- Brand profile/package contents;
- Capability definitions/providers;
- WorkContext contents;
- ApplicationGraph contents;
- Action Boundary execution semantics;
- governance/policy contents;
- provider credentials/transports;
- deployment state or runtime state;
- tenant installation or entitlement authorization.

## Contract

Canonical top-level fields:

```text
schemaVersion
identity
version
publisher
experiences[]
capabilities[]
contextTypes[]
actions[]
flows[]
brandRef
governanceRequirements[]
hostCompatibility
protocolProjections[]
distribution
commercial
```

`experiences[]` references exact existing Experience Pack releases using Pack id + release version + entrypoint. Future semantic families (`capabilities`, `contextTypes`, `flows`) are exact opaque references only until MASTER-28/29/30 define their canonical payload contracts.

## Invariants

- Application release version is release semver.
- Generic dependency `versionRef` values are exact; floating aliases/ranges are rejected.
- No implicit `latest`, `current`, `main`, wildcard or silent fallback.
- Unknown fields fail closed, including inline documents, credentials, policy payloads and authorization claims.
- Arrays are bounded and duplicate exact identities are rejected.
- An Application cannot be semantically empty.
- Commercial metadata contains references only; entitlement does not imply authorization.
- Result data is detached/deeply frozen.
- Serialization is deterministic for equivalent key ordering.
- Only dependency edge: `application-package → protocol`.

## Q0–Q9

- Q0: freeze exact base `1980368...`.
- Q1: reverse engineer MASTER-26 constitution, Experience Pack hardening, semantic-id and package boundaries.
- Q2: freeze ownership/invariants above.
- Q3: implement package parser/types/serializer + boundary edge.
- Q4: focused malformed/floating/duplicate/empty/prototype/accessor/determinism tests.
- Q5: security fail-closed review.
- Q6: architecture review for reference-only ownership.
- Q7: local `pnpm check:boundaries && pnpm typecheck && pnpm vitest run tests/contract/application-package.test.ts` plus repository verification as required.
- Q8: independently review actual PR diff.
- Q9: squash merge only after exact branch head passes Q7; then fetch new `main` and start MASTER-28.
