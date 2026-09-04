# Vira Application Lifecycle

## Purpose

This document freezes Application lifecycle semantics without adding a new runtime state machine. MASTER-26 defines lifecycle distinctions and legal transitions; executable persistence/transition APIs are deferred.

## Separate lifecycle domains

Vira has multiple lifecycle domains that must not be conflated:

```text
Application release lifecycle
Experience Pack / deployment lifecycle
Runtime instance lifecycle
Action / governance lifecycle
Canvas authoring lifecycle
Network distribution lifecycle
```

An Application status cannot overwrite or stand in for the state owned by another domain.

## Application release lifecycle

The semantic lifecycle of an Application release is:

```text
draft
  ↓
validated
  ↓
published (immutable release)
  ↓
[distributed / resolved / used]
  ↓
deprecated
```

`distributed`, `resolved` and `used` are observations/relationships around a published release, not permission to mutate that release.

### Draft

- mutable authoring state;
- may contain incomplete/unresolved proposals;
- not executable or distributable as a trusted release;
- Canvas/editor state may exist only here as projection metadata.

### Validated

- canonical semantic validation has succeeded for the candidate release;
- all required references are structurally valid and suitable for exact resolution;
- validation does not itself publish, deploy, authorize or execute anything.

A change after validation returns the candidate to draft/unvalidated semantics.

### Published

- immutable Application release identity exists;
- canonical semantic content for that release cannot be edited in place;
- future change requires a new release version/digest;
- publication does not imply every referenced dependency is currently deployed/available in every environment.

### Distributed / discoverable

- a published release may be made discoverable by Network/distribution;
- distribution does not create execution authority;
- removal from discovery does not rewrite historical release identity.

### Resolved / execution-ready

Execution readiness is **derived**, not owned by Application lifecycle alone. It requires successful exact resolution of referenced Experience/Pack/Capability identities plus applicable enterprise/deployment/governance/runtime checks.

A published Application may therefore be valid but not executable in a particular environment.

### Deprecated

- new discovery/use may be restricted according to policy;
- historical identity, receipts and provenance remain addressable;
- deprecation does not mutate a published release into another version;
- restoring availability must be explicit and must not silently redirect to a different release.

## Forbidden transitions

The following are forbidden by default:

```text
published → draft            ❌ mutate immutable release
published → edited-in-place  ❌ same identity, new semantics
missing dependency → fallback latest ❌ implicit substitution
network-discovered → executable      ❌ distribution ≠ authorization
entitled → authorized               ❌ commerce ≠ security
runtime active → published mutation ❌ runtime cannot rewrite release
```

## Relationship to Experience Pack/deployment lifecycle

Application publication does not replace Pack/deployment semantics.

A resolved Application may reference exact Experience Pack releases. Those artifacts remain governed by their existing manifest, registry, signing, promotion, rollback, cache verification and deployment revision owners.

Application lifecycle may observe those states but cannot synthesize a fake deployed/active state when the underlying authority says otherwise.

## Runtime instance lifecycle

Runtime instances are ephemeral executions of resolved semantics. Instance state/revision/lifecycle is owned by runtime/host authorities and is not part of the immutable Application release.

Multiple concurrent instances may execute the same Application release without creating new Application versions.

## Action/governance lifecycle

An Application may declare relationships that can lead to Actions, but each protected effect still follows canonical ActionIntent → governance → approval/challenge → Action Boundary → receipt/ledger semantics.

Application lifecycle never contains a shortcut such as `approved application = all actions approved`.

## Canvas lifecycle

Canvas draft/save/history/selection/autosave states are editor lifecycle only. Publishing must cross the canonical semantic validation/publication boundary; editor persistence cannot silently turn a draft into an Application release.

## Network lifecycle

Network indexing, ranking, discovery, mirroring, federation and unlisting are distribution lifecycle. They do not change canonical Application content or execution permission.

## Retry, reconnect and restore

Retry/reconnect/restore must bind to the same exact relevant Application/dependency identities unless an explicit new resolution is requested and revalidated.

No lifecycle path may replay a protected effect solely because UI/runtime connectivity was restored.
