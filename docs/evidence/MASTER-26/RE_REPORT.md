# MASTER-26 Reverse-Engineering Report

## Baseline

Authoritative post-RC1 `main` entering the phase:

```text
e566ea2ee1d3794a3c23585323a48741de140eab
```

Phase branch:

```text
master/26-application-semantic-freeze
```

## Existing semantic direction

`docs/strategy/APPLICATION_NETWORK_THESIS.md` already defines five semantic families: Experience, Capability, Context, Action and Application. It defines Application as the higher-order package/graph that references the others without replacing them.

`PACKAGE_OWNERSHIP.md` already constrains future ownership:

- `ViraApplicationPackage` is a higher-order distribution unit;
- `ApplicationGraph` owns application-semantic nodes/edges, not Canvas projection state;
- Capability semantics are provider-neutral;
- WorkContext is bounded work state/provenance, not chat history/memory;
- Canvas is not runtime/publication/governance authority;
- Network is discovery/distribution, not execution authority;
- entitlement is distinct from security authorization/governance.

`PLATFORM_MODEL.md` freezes one platform-neutral semantic Experience and separately distinguishes Pack version, deployment revision, runtime state revision and host/platform concerns.

## Existing executable owners preserved

Current code already owns the lower-level semantics MASTER-26 must reference rather than duplicate:

- `StudioExperienceDocument` — `studio-schema`;
- `StudioPublication` — `studio-compiler` / `studio-publish`;
- Experience Pack — `experience-packs`;
- registry/resolution — `experience-registry`, `enterprise-registry`, `experience-resolver`;
- deployment/integrity — `deployment-plane`;
- runtime state/lifecycle — `runtime-core` and platform hosts;
- governance — `governance`, `enterprise-governance`;
- protected effects — `action-boundary`;
- enterprise scope — `enterprise-context`;
- action evidence — `action-ledger`.

`StudioPublication.version` is currently a schema literal (`"1"`), reinforcing the need to separate schema versions from future Application release versions.

## Gap

There is intentionally no executable canonical Application package/schema in the repository yet. Before implementation, the project needs a constitutional freeze for:

1. Application definition/model;
2. authority boundaries;
3. lifecycle distinctions;
4. version/revision/digest distinctions.

## Decision

MASTER-26 fills only that semantic gap. No package, runtime, SDK, executable schema, dependency or boundary graph change belongs in this phase.
