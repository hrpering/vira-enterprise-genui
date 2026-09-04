# Vira Enterprise GenUI Architecture

## Purpose

This document defines the **current canonical architecture** on the integrated Enterprise GenUI foundation. It is normative for ownership and trust boundaries; execution status lives in `MASTER_PLAN.md`.

MASTER-01..24 are implemented/in `main`. MASTER-25 implementation is integrated, but RC1 remains blocked on exact-head external proof and the Enterprise RC gate.

## Product boundary

Vira owns the governed transition from proposed application semantics to trusted rendering and protected enterprise action execution.

```text
AI / external system / human
          ↓
validated canonical semantics
          ↓
Experience / StudioPublication / Pack
          ↓
exact deployment + resolver
          ↓
Web / iOS / Android host
          ↓
ActionIntent
          ↓
Governance + Action Boundary
          ↓
trusted enterprise adapter
          ↓
ActionReceipt
```

Vira does not need to own the model, agent framework, customer backend, policy language or transport protocol.

## Current canonical owners

### Experience authoring and publication

- `studio-schema` owns `StudioExperienceDocument`.
- `studio-publish` plus the existing compiler/binding/design/flow gates own canonical publication preparation.
- Manual authoring and Studio authoring converge on the same document/publication semantics.
- Puck/editor implementations are authoring details, never semantic/runtime authority.

### Experience distribution and resolution

- `experience-packs` owns Experience Pack semantics.
- `experience-registry` owns exact Pack membership and exact `id + version` lookup.
- `experience-resolver` owns explicit resolution/compatibility behavior.
- `deployment-plane` owns deployment/publication selection concerns.
- `enterprise-registry` adds enterprise/private registry concerns without replacing Pack or Experience semantics.

No generic execution path may choose an implicit `latest`, globally active Experience, latest mounted instance or domain-specific fallback.

### Runtime and hosts

- `runtime-core` owns platform-neutral runtime state/actions/patches/lifecycle/permissions/errors.
- Existing Web hosts/renderers remain web implementations, not the semantic definition of an Experience.
- Native SDK implementations exist under `sdk/ios` and `sdk/android`; native conformance, simulator and emulator gates are release evidence, not alternate semantic owners.
- `cross-platform-conformance` and `native-ux-gate` provide shared conformance/UX verification surfaces.

Web, iOS and Android consume one platform-neutral semantic Experience. Platform APIs do not enter the canonical Experience schema or `runtime-core`.

### Action and governance

- `action-boundary` owns the canonical protected-action execution contract, including exported `ViraActionIntent`, execution permit, idempotency, confirmation/challenge and `ViraActionReceipt` concepts.
- `governance` owns provider-neutral identity/governance/approval composition and adapters for external providers; provider-specific decision models do not become Vira canonical semantics.
- `enterprise-governance` composes enterprise governance requirements around the canonical governance/action owners.
- `action-ledger` owns action receipt/ledger concerns.
- `enterprise-context` owns enterprise-scoped execution context.

A renderer, protocol adapter, agent or component implementation cannot invoke a protected enterprise effect around these owners.

### Protocol, observability and security

- `protocol-gateway` adapts supported protocols; it is not canonical application semantics.
- `security` owns existing security policy primitives/enforcement helpers.
- `policy-engine` and `policy-simulation` are provider-neutral policy decision/simulation surfaces, not a new policy language.
- `telemetry` and `experience-observability` observe execution; observation/replay is never execution authority.

### Package dependency authority

`tooling/package-boundaries.config.mjs` is the executable workspace dependency authority. `PACKAGE_OWNERSHIP.md` is descriptive and must follow that graph.

## Data invariant

External model/tool/customer payloads are untrusted until normalized and validated.

```text
external payload
    ↓
normalizer / adapter / parser
    ↓
canonical data
    ↓
Experience / binding / action contract
    ↓
trusted host or protected action path
```

Validation in one layer never grants authority owned by another layer.

## Artifact invariant

Experience artifacts are passive, bounded, validated data plus references to trusted installed implementations. Arbitrary remote JavaScript, Swift, Kotlin, HTML, shell/native binaries or hidden executable code are not a canonical Experience distribution mechanism.

Raw credentials/secrets do not belong in Studio documents, publications, Pack client metadata, renderer state/props or telemetry. Trusted server/control-plane adapters resolve secrets at the latest safe point.

## Brand boundary

Brand/customer definitions live behind approved brand catalogs and adapters. Generic Vira packages must not branch on customer/domain names. External brand proofs validate genericity; they do not justify customer-specific core code.

## Runtime/instance invariant

Experience Pack version, brand integration version, deployment revision and runtime instance identity are distinct. Exact instance identity is explicit in routing; no host may route through “last rendered”, “active tab”, “latest mounted” or domain singleton state.

## Application Network extension

MASTER-26+ extends this foundation into:

```text
Canvas → Runtime → Network
Build     Run       Distribute
```

Future Application/Capability/WorkContext/Graph semantics must reference existing Experience, Pack, Action Boundary, governance, deployment and registry authorities rather than duplicate them.

Canvas is authoring/proposal authority, not runtime authority. Network is discovery/distribution authority, not execution authority. Protocol/provider adapters are not canonical semantics.

## Architecture non-goals

Core Vira is not an arbitrary code host, generic agent framework, generic workflow engine, policy language, customer backend, database/message queue, generic cloud-compute platform, IDE/design-tool clone or protocol replacement.

## Change rule

If a proposed phase appears to require a second semantic owner, stop and reconcile ownership first. Extend/adapt the nearest canonical owner unless reverse engineering proves a new owner is necessary.
