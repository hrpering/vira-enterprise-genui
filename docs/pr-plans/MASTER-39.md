# MASTER-39 — Application Publisher SDK

## Goal

Add a thin provider-neutral publisher-side SDK that prepares the already-canonical Application Distribution envelope from a canonical Application candidate and an injected SHA-256 digest provider, without acquiring registry, transport, identity, deployment or execution authority.

## Base

- authoritative `main`: `b8f009603407fea9a9115d735e9a144017fc654f`
- previous phase: MASTER-38 merged via PR #198
- branch: `master/39-application-publisher-sdk`

## Roadmap placement

Application Network thesis stage 3 is:

```text
protocol egress → publisher/AI-host SDKs → federated distribution
```

MASTER-38 completed protocol egress. MASTER-39 implements the publisher SDK slice only.

## Ownership

Existing owners remain canonical:

- `application-package` owns Application semantics and canonical serialization;
- `application-distribution` owns distribution envelope/integrity shape and canonical envelope serialization;
- `application-protocol-projection` owns projection fidelity artifacts;
- registries own persistence/discovery concerns;
- deployment/runtime/governance/Action owners retain their authority.

`application-publisher-sdk` owns only integration ergonomics:

- safe preparation input;
- host-asserted publisher-id parity with canonical Application publisher id;
- canonical Application serialization delegation;
- injected SHA-256 digest-provider invocation;
- strict digest result shape validation;
- canonical distribution-envelope construction/serialization delegation;
- frozen convenience output.

## Contract

```text
prepareViraApplicationDistribution(
  {
    publisherId,
    application
  },
  digestProvider
)
```

Digest provider receives frozen:

```text
{
  algorithm: "sha256",
  canonicalArtifact,
  applicationId,
  applicationVersion,
  publisherId
}
```

Output:

```text
{
  sdkVersion: "1",
  publisherId,
  envelope: ViraApplicationDistributionEnvelope,
  serializedEnvelope
}
```

The output is convenience data. `envelope` remains canonical distribution truth; `serializedEnvelope` is produced by the existing distribution serializer.

## Critical non-authorities

- `publisherId` is host-asserted identity, not authentication or proof of publisher ownership;
- digest-provider output is a declared integrity digest, not verification of trustworthy publication;
- no signing keys/certificates/credentials;
- no URL/endpoint/transport/upload/registry/federation;
- no implicit latest or fallback digest;
- no protocol adapter execution;
- no deployment/runtime/governance/authorization/entitlement;
- no Capability or protected Action execution.

## Failure semantics

- unsafe/non-JSON preparation input fails before SDK logic;
- unknown control/transport fields fail closed;
- canonical Application failures preserve owner failure context;
- publisher mismatch fails before digest-provider invocation;
- missing/non-function digest provider fails closed;
- digest provider throw/rejection fails closed;
- digest must be exactly lowercase 64-hex SHA-256;
- no fallback digest computation or replacement occurs;
- final envelope is reparsed/serialized through `application-distribution`.

## Package boundary

```text
application-publisher-sdk → application-package, application-distribution, protocol
```

## Focused verification

```bash
pnpm check:boundaries
pnpm typecheck
pnpm vitest run tests/contract/application-publisher-sdk.test.ts
```

## Q0–Q9

- Q0 PASS — fresh branch from exact authoritative `main`.
- Q1 PASS — roadmap + nearest-owner reverse engineering.
- Q2 PASS — SDK/non-authority contract frozen.
- Q3 PASS — implementation added.
- Q4 PASS — focused security/integrity/determinism coverage added.
- Q5 REQUIRED — final security/fail-closed review.
- Q6 REQUIRED — architecture/ownership review.
- Q7 REQUIRED — exact-head local boundaries/typecheck/focused tests.
- Q8 REQUIRED — actual PR diff + final post-Q7 executable-clean compare.
- Q9 BLOCKED until Q7/Q8; then exact-head squash merge and MASTER-40 starts from resulting new authoritative `main`.
