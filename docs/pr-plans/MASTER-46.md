# MASTER-46 — Capability Supply Catalog + Exact Discovery

## Goal

Add the missing provider-neutral Capability supply/discovery layer for the Application Network without turning discovery into execution, provider trust, health/ranking, credentials, commercial entitlement or generic cloud compute.

## Base

- authoritative `main`: `88a05193c189ce02a214bf0acb74743144981cc5`
- previous phase: MASTER-45 merged via PR #206
- branch: `master/46-capability-supply`
- draft PR: #207
- current frozen executable SHA: `b44f2363571f59369e450cf4571c27635709f2b9`
- invalidated previous freeze: `8a01eb001949327d1d34aaa780fd72f2687012ac`

## Canonical ownership

```text
capability-contract       → CapabilityDefinition meaning + canonical serialization
hosted-capability-runtime → hosted binding meaning/parse/serialize + query execution
capability-supply         → bounded source provenance + exact discovery/conflict semantics
```

Executable dependency boundary:

```text
capability-supply
  → capability-contract
  → hosted-capability-runtime
  → protocol
```

No executable dependency on Application federation/distribution, commercial packages, governance/runtime/Action owners, telemetry/action-ledger, deployment, Experience marketplace or provider/cloud/payment SDKs.

## Supply model

A supply snapshot contains bounded provenance sources. Each source contains bounded records composed only from canonical artifacts:

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

- same exact Capability `id@version` must canonical-serialize identically or fail `CAPABILITY_CONFLICT`;
- same exact `bindingRef` must canonical-serialize identically or fail `BINDING_CONFLICT`;
- identical supply repeated by multiple sources is allowed and retains source provenance only.

There is no source priority, majority vote, confidence, implicit latest, fallback or silent conflict winner.

## Lookup

Lookup is exact and deterministic:

- exact `capabilityId`;
- exact release `capabilityVersion`;
- nullable `providerId` filter (`null` = any provider);
- nullable `locationId` filter (`null` = any location).

Lookup returns all matching canonical supplies sorted deterministically and aggregates source provenance for identical bindings. A miss succeeds with an empty list. No fallback or substitution occurs.

## Authority / non-goals

Supply discovery evidence is not:

- provider authentication or attestation;
- provider availability/health/SLA;
- authorization/governance/runtime permission;
- commercial entitlement or pricing;
- endpoint/transport/credential/secret state;
- deployment placement or generic cloud scheduling;
- failover/ranking/recommendation;
- execution success;
- proof that a provider implementation is side-effect-free.

`sourceId`, `providerId`, `bindingRef` and `locationId` remain provenance/routing identities only.

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

## Q4 focused/hardening coverage

Focused suites:

```text
tests/contract/capability-supply.test.ts
tests/contract/capability-supply-hardening.test.ts
tests/contract/hosted-capability-binding-serialization.test.ts
```

Coverage includes deterministic parsing/serialization, immutable outputs, identical-binding provenance aggregation, multi-binding no-ranking behavior, provider/location filters, exact miss/no fallback, action rejection, binding/Capability mismatch, Capability conflicts, binding conflicts, duplicate source/binding rejection, canonical parser delegation, authority/endpoint/credential/health/commercial smuggling rejection, source repetition as provenance only, accessor/custom-prototype safety, source/per-source/aggregate collection ceilings, malformed/latest/fallback query rejection and canonical hosted-binding serialization roundtrip/fail-closed behavior.

## Q5/Q6

PASS on current frozen executable head `b44f2363571f59369e450cf4571c27635709f2b9` after Q8 remediation. Evidence: `docs/evidence/MASTER-46/Q5_Q6_REVIEW.md`.

## Q7 attempt 1

PASS on exact frozen executable SHA:

```text
8a01eb001949327d1d34aaa780fd72f2687012ac
```

The repository operator reran the full local boundaries/typecheck/focused-suite command set detached at that exact SHA and reported it green. Evidence: `docs/evidence/MASTER-46/Q7_LOCAL_PASS.md`.

That PASS is retained as historical evidence but is invalidated for final merge purposes because Q8 found an executable owner-drift issue and implementation/tests changed afterward.

## Q8 attempt 1

FAIL. Evidence: `docs/evidence/MASTER-46/Q8_ATTEMPT_1.md`.

Independent review found that capability-supply used the canonical Capability serializer but manually reconstructed Hosted binding JSON for conflict fingerprints and snapshot serialization. That duplicated wire semantics owned by `hosted-capability-runtime`.

Remediation:

```text
hosted-capability-runtime
  → serializeViraHostedCapabilityBinding

capability-supply
  → delegates binding conflict fingerprint + snapshot serialization to that API
```

The local binding serializer was removed. Focused serializer coverage was added. Dependency/authority boundaries did not expand.

## Current frozen executable

```text
b44f2363571f59369e450cf4571c27635709f2b9
```

Any changes after this SHA must be documentation/evidence only. Full local Q7 must be rerun detached at this exact SHA before Q8 restarts.

## Q7 rerun command

```bash
pnpm check:boundaries
pnpm typecheck
pnpm vitest run \
  tests/contract/hosted-capability-binding-serialization.test.ts \
  tests/contract/capability-supply.test.ts \
  tests/contract/capability-supply-hardening.test.ts
```

## Q0–Q9

- Q0 PASS — fresh branch from exact authoritative main `88a05193c189ce02a214bf0acb74743144981cc5`.
- Q1 PASS — Capability/hosted runtime/federation/marketplace owner reverse engineering.
- Q2 PASS — capability-supply owner and conflict/discovery contract frozen.
- Q3 PASS — package implementation.
- Q4 PASS — focused/hardening coverage.
- Q5 PASS — security/fail-closed review on current freeze.
- Q6 PASS — architecture/ownership review on current freeze.
- Q7 RERUN PENDING — exact new frozen-head local gate required after Q8 executable remediation.
- Q8 BLOCKED — restart only after new Q7 PASS.
- Q9 — exact-head squash merge and verify new authoritative main.
