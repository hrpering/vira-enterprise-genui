# MASTER-46 — Capability Supply Catalog + Exact Discovery

## Goal

Add the missing provider-neutral Capability supply/discovery layer for the Application Network without turning discovery into execution, provider trust, health/ranking, credentials, commercial entitlement or generic cloud compute.

## Base

- authoritative `main`: `88a05193c189ce02a214bf0acb74743144981cc5`
- previous phase: MASTER-45 merged via PR #206
- branch: `master/46-capability-supply`
- frozen executable SHA: `8a01eb001949327d1d34aaa780fd72f2687012ac`

## Q1 reverse engineering

### Capability semantics

`capability-contract` owns canonical `ViraCapabilityDefinition`: exact id/version, publisher, input/output contracts, Context requirements and `query | action` invocation meaning.

MASTER-46 consumes that definition and never defines provider-owned Capability meaning.

### Hosted binding/runtime

`hosted-capability-runtime` owns exact `ViraHostedCapabilityBinding` parsing and one-shot trusted-adapter execution for canonical query Capabilities. The binding already carries exact `bindingRef`, exact `capabilityRef`, `providerId` and optional `locationId`.

That runtime explicitly does not own provider catalog/discovery, ranking, failover, endpoints, credentials, health, attestation or generic cloud compute.

### Network gap

`application-federation` provides deterministic public Application release discovery/conflict semantics. There was no equivalent canonical supply snapshot for Capability execution providers even though the Application Network thesis requires the Network to distribute Applications and Capabilities.

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
- nullable `providerId` filter (`null` = any provider);
- nullable `locationId` filter (`null` = any location).

Lookup returns all matching canonical supplies sorted deterministically and aggregates source provenance for identical bindings. An exact miss succeeds with an empty supply list; it never falls back or substitutes another version/provider.

## Q3 implementation

PASS.

Added:

- `@vira-enterprise-genui/capability-supply` package;
- bounded supply snapshot parser;
- deterministic canonical snapshot serializer;
- exact Capability + hosted binding composition;
- exact cross-source Capability/binding conflict detection;
- deterministic exact lookup and provenance aggregation;
- executable package-boundary declaration.

The implementation never invokes a provider. It imports canonical Capability and hosted-binding parsers/serialization semantics rather than defining competing semantic owners.

## Q4 focused/hardening coverage

PASS by static coverage review; local execution remains Q7.

Focused suites:

```text
tests/contract/capability-supply.test.ts
tests/contract/capability-supply-hardening.test.ts
```

Coverage includes deterministic parsing/serialization, immutable outputs, identical-binding provenance aggregation, multi-binding no-ranking behavior, provider/location filters, exact miss/no fallback, action rejection, binding/Capability mismatch, Capability conflicts, binding conflicts, duplicate source/binding rejection, canonical parser delegation, authority/endpoint/credential/health/commercial smuggling rejection, source repetition as provenance only, accessor/custom-prototype safety, source/per-source/aggregate collection ceilings, and malformed/latest/fallback query rejection.

## Q5 security review

PASS. Evidence: `docs/evidence/MASTER-46/Q5_Q6_REVIEW.md`.

Key results:

- untrusted input enters through shared safe JSON parsing;
- exact shapes reject authority/provider-secret smuggling;
- action Capabilities cannot enter hosted supply;
- Capability/binding conflicts fail closed with no winner;
- source repetition remains provenance only;
- collection ceilings are bounded, including aggregate `2048` supply limit;
- no provider execution, endpoint, credential, health, ranking, commercial or cloud authority is introduced.

## Q6 architecture/ownership review

PASS. Evidence: `docs/evidence/MASTER-46/Q5_Q6_REVIEW.md`.

Executable dependency authority remains:

```text
capability-supply → capability-contract, hosted-capability-runtime, protocol
```

Canonical owner chain remains:

```text
capability-contract       → CapabilityDefinition meaning
hosted-capability-runtime → exact binding + query execution
capability-supply         → supply provenance + exact discovery/conflict semantics
```

Supply discovery does not inherit execution/security/commercial authority.

## Frozen executable

Final executable/test/boundary SHA for Q7:

```text
8a01eb001949327d1d34aaa780fd72f2687012ac
```

All changes after this SHA must be documentation/evidence only. Any executable/package/test/boundary change invalidates Q5/Q6 and requires a new freeze plus local Q7.

## Q7 local gate

```bash
pnpm check:boundaries
pnpm typecheck
pnpm vitest run \
  tests/contract/capability-supply.test.ts \
  tests/contract/capability-supply-hardening.test.ts
```

## Authority / non-goals

Supply discovery evidence is not provider authentication/attestation, provider availability/health/SLA, authorization/governance/runtime permission, commercial entitlement/pricing, endpoint/transport/credential state, deployment placement/cloud scheduling, failover/ranking/recommendation, execution success or proof that an implementation is side-effect-free.

`sourceId`, `providerId`, `bindingRef` and `locationId` remain provenance/routing identities only.

## Q0–Q9

- Q0 PASS — fresh branch from exact authoritative main `88a05193c189ce02a214bf0acb74743144981cc5`.
- Q1 PASS — Capability/hosted runtime/federation/marketplace owner reverse engineering.
- Q2 PASS — capability-supply owner and conflict/discovery contract frozen.
- Q3 PASS — package implementation.
- Q4 PASS — focused/hardening coverage added and statically reviewed.
- Q5 PASS — security/fail-closed review.
- Q6 PASS — architecture/ownership review.
- Q7 PENDING — exact frozen-head local gate.
- Q8 — independent PR reverse engineering + closure compare.
- Q9 — exact-head squash merge and verify new authoritative main.
