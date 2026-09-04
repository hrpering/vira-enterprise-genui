# MASTER-46 — Capability Supply Catalog + Exact Discovery

## Goal

Add the missing provider-neutral Capability supply/discovery layer for the Application Network without turning discovery into execution, provider trust, health/ranking, credentials, commercial entitlement or generic cloud compute.

## Base

- authoritative `main`: `88a05193c189ce02a214bf0acb74743144981cc5`
- previous phase: MASTER-45 merged via PR #206
- branch: `master/46-capability-supply`

## Q1 reverse engineering

### Capability semantics

`capability-contract` owns canonical `ViraCapabilityDefinition`: exact id/version, publisher, input/output contracts, Context requirements and `query | action` invocation meaning.

MASTER-46 must consume that definition and never define provider-owned Capability meaning.

### Hosted binding/runtime

`hosted-capability-runtime` owns exact `ViraHostedCapabilityBinding` parsing and one-shot trusted-adapter execution for canonical query Capabilities. The binding already carries exact `bindingRef`, exact `capabilityRef`, `providerId` and optional `locationId`.

That runtime explicitly does not own provider catalog/discovery, ranking, failover, endpoints, credentials, health, attestation or generic cloud compute.

### Network gap

`application-federation` provides deterministic public Application release discovery/conflict semantics. There is no equivalent canonical supply snapshot for Capability execution providers even though the Application Network thesis requires the Network to distribute Applications and Capabilities.

Legacy `experience-marketplace` remains Experience catalog/search and is not the Capability supply owner.

## Q2 owner freeze

New canonical owner:

```text
@vira-enterprise-genui/capability-supply
```

Executable dependencies:

```text
capability-supply
  → capability-contract
  → hosted-capability-runtime
  → protocol
```

No executable dependency on Application federation/distribution, commercial entitlement/metering/pricing, governance/runtime/Action owners, telemetry, deployment, provider/cloud SDKs or Experience marketplace packages.

## Supply model

A supply snapshot contains bounded provenance sources. Each source contains bounded supply records:

```text
sourceId
  → canonical ViraCapabilityDefinition
  → canonical ViraHostedCapabilityBinding
```

Every binding `capabilityRef` must exactly equal the enclosed Capability definition `id@version`.

Only canonical `query` Capabilities may appear in hosted supply. `action` Capabilities fail closed with `ACTION_BOUNDARY_REQUIRED`; protected effects remain behind the Action Boundary.

## Conflict semantics

Within one source, the same exact `bindingRef` cannot appear twice.

Across sources:

- the same exact Capability `id@version` must canonical-serialize identically or fail `CAPABILITY_CONFLICT`;
- the same exact `bindingRef` must map to the same exact capability/provider/location binding or fail `BINDING_CONFLICT`;
- identical supply repeated by multiple sources is allowed and retains all source provenance.

There is no source priority, majority vote, implicit latest, fallback or silent conflict winner.

## Lookup

Lookup is exact and deterministic:

- exact `capabilityId`;
- exact release `capabilityVersion`;
- optional provider filter represented by nullable `providerId` (`null` = any provider);
- optional location filter represented by nullable `locationId` (`null` = any location).

Lookup returns all matching canonical supplies sorted deterministically and aggregates source provenance for identical bindings. No result is an error-free empty list; no fallback or substitution occurs.

## Authority / non-goals

Supply discovery evidence is not:

- provider authentication or attestation;
- provider availability/health/SLA;
- authorization/governance/runtime permission;
- commercial entitlement or pricing;
- endpoint/transport/credential/secret state;
- deployment placement or generic cloud scheduling;
- failover/ranking/recommendation;
- proof that a provider implementation is side-effect-free.

`sourceId`, `providerId`, `bindingRef` and `locationId` remain provenance/routing identities only.

## Planned verification

```bash
pnpm check:boundaries
pnpm typecheck
pnpm vitest run \
  tests/contract/capability-supply.test.ts \
  tests/contract/capability-supply-hardening.test.ts
```

## Q0–Q9

- Q0 PASS — fresh branch from exact authoritative main `88a05193c189ce02a214bf0acb74743144981cc5`.
- Q1 PASS — Capability/hosted runtime/federation/marketplace owner reverse engineering.
- Q2 PASS — capability-supply owner and conflict/discovery contract frozen.
- Q3 NEXT — package implementation.
- Q4 — focused/hardening coverage.
- Q5 — security/fail-closed review.
- Q6 — architecture/ownership review.
- Q7 — exact frozen-head local gate.
- Q8 — independent PR reverse engineering + closure compare.
- Q9 — exact-head squash merge and verify new authoritative main.
