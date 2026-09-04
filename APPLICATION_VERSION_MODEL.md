# Vira Application Version Model

## Purpose

This document freezes version/identity distinctions for the Application Network. The goal is to prevent `version`, `revision`, `digest`, `deployment`, `instance` and `latest` from becoming interchangeable concepts.

## Core rule

**Execution is bound to exact identities. `latest` is a discovery convenience only and is never an implicit protected-execution identity.**

## Version dimensions

| Dimension | Meaning |
|---|---|
| Application schema version | wire/schema contract version for a future Application package format |
| Application release version | immutable semantic release of one Application identity |
| Application artifact digest | integrity identity of the exact serialized/signed release artifact |
| Experience Pack release version | existing immutable Pack release identity |
| Studio publication version | current publication schema literal (`StudioPublication.version === "1"`), not a product release number |
| Deployment revision | operational revision of an environment deployment |
| Runtime state revision | monotonic execution/state revision of a mounted instance |
| Runtime instance id | identity of one execution instance, not a version |
| Host version | implementation/compatibility version of a host |
| Capability/provider version | exact semantic/provider binding version as defined by its canonical owner |
| Ledger sequence/revision | audit/execution ordering, not Application release version |

These dimensions must never be compared or substituted as though they were the same namespace.

## Application release identity

The future canonical Application release identity is conceptually:

```text
applicationId + applicationReleaseVersion + exact artifact integrity
```

MASTER-26 does not freeze a field-level wire schema, but it freezes these requirements:

- Application id is stable across releases of the same logical Application;
- release version is explicit and immutable once published;
- canonical artifact integrity is addressable/verifiable;
- execution evidence can name the exact release consumed;
- no published release is mutated in place.

## Dependency version binding

A published Application release must be able to resolve every execution-relevant dependency to an exact identity before execution.

A source authoring format may later support compatibility constraints for discovery/validation, but protected execution must record the exact resolved Experience Pack/Capability/etc. version actually used.

Forbidden:

```text
experience: latest
capability: whatever provider is newest
pack: current production one
```

without an explicit resolution step that produces and validates exact identities.

## Existing publication/Pack distinction

`StudioPublication.version === "1"` is a **schema contract version**. It is not an Experience release version and must not be surfaced as though it identifies a customer Application release.

Experience Pack `id + version` remains the existing release identity for Pack distribution. An Application release may reference exact Pack release identities; it does not rename or absorb them.

## Digest rule

A digest proves exact artifact bytes/canonical serialization according to the owning contract. It does not by itself express semantic compatibility, authorization, deployment state or human-readable release ordering.

Same release id/version with a different immutable canonical digest is a conflict unless the owning contract explicitly defines otherwise. Silent replacement is forbidden.

## Revision rule

Deployment revision and runtime state revision are mutable operational counters around immutable release artifacts. Incrementing a revision does not create a new Application release.

Likewise, creating a new Application release does not reset or redefine an existing runtime instance's revision semantics.

## Change → version rule

Once published, any change to canonical Application semantic content requires a new Application release identity/version and corresponding integrity evidence.

This includes changes to:

- ApplicationGraph membership/edges;
- exact Experience/Pack/Capability dependency identity;
- semantic Context relationships;
- Action relationships that can affect protected behavior;
- compatibility requirements that can change valid execution targets;
- canonical metadata included in the signed/versioned Application artifact.

Published releases are never edited in place.

## Platform rule

Web/iOS/Android do not get separate Application release versions for equivalent semantics.

```text
app@1.2.0-web
app@1.2.0-ios
app@1.2.0-android
```

is forbidden as a workaround for platform implementation differences. Host implementation versions/capabilities handle platform compatibility while the Application semantic release remains shared.

## Resolution evidence

A future Application execution/distribution proof must be able to report at least:

- exact Application release identity;
- exact integrity identity/digest where applicable;
- exact resolved dependency identities;
- relevant deployment identity/revision;
- runtime instance identity/revision separately;
- provider binding identity where a Capability is invoked.

This evidence must preserve the distinction between semantic release, operational deployment and ephemeral runtime state.
