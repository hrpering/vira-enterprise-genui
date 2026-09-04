# MASTER-39 — Application Publisher SDK

## Goal

Add a thin provider-neutral publisher-side SDK that prepares the already-canonical Application Distribution envelope from a canonical Application candidate and an injected SHA-256 digest provider, without acquiring registry, transport, identity, deployment or execution authority.

## Base

- authoritative `main`: `b8f009603407fea9a9115d735e9a144017fc654f`
- previous phase: MASTER-38 merged via PR #198
- branch: `master/39-application-publisher-sdk`
- frozen executable head: `4f7df4b1e314121a4d16cbf5502896810447e1bd`

## Roadmap placement

Application Network thesis stage 3 is:

```text
protocol egress → publisher/AI-host SDKs → federated distribution
```

MASTER-38 completed protocol egress. MASTER-39 implements the publisher SDK slice only.

## Ownership

`application-package` remains canonical Application owner. `application-distribution` remains distribution/integrity-envelope owner. `application-publisher-sdk` owns only publisher-side composition ergonomics.

Contract:

```text
prepareViraApplicationDistribution(
  { publisherId, application },
  digestProvider
)
```

Digest provider receives frozen canonical artifact identity data only:

```text
algorithm
canonicalArtifact
applicationId
applicationVersion
publisherId
```

Output is convenience data around canonical `ViraApplicationDistributionEnvelope` and its existing deterministic serializer.

## Critical non-authorities

- `publisherId` is host-asserted parity, not authentication or publisher proof;
- digest provider output is a declared integrity digest, not verification/trust;
- no signing keys/certificates/credentials;
- no URL/endpoint/transport/upload/registry/federation;
- no implicit latest or fallback digest;
- no protocol adapter execution;
- no deployment/runtime/governance/authorization/entitlement;
- no Capability or protected Action execution.

## Failure semantics

- unsafe/non-JSON input fails before SDK logic;
- unknown authority/transport fields fail closed;
- canonical Application failures preserve owner context;
- publisher mismatch and invalid Application both fail before digest-provider invocation;
- missing/non-function provider and thrown/rejected provider fail closed;
- digest must be exactly lowercase 64-hex SHA-256 string data;
- object-shaped provider trust claims are rejected;
- no fallback digest computation/replacement;
- final envelope parse/serialization delegates to `application-distribution`.

## Package boundary

```text
application-publisher-sdk → application-package, application-distribution, protocol
```

## Q5 security review

PASS. See `docs/evidence/MASTER-39/REVIEW.md`.

## Q6 architecture review

PASS. No registry, network transport, signing/credential, protocol adapter, deployment/runtime, governance/authorization/entitlement or protected execution dependency/API is introduced.

## Focused verification

```bash
pnpm check:boundaries
pnpm typecheck
pnpm vitest run \
  tests/contract/application-publisher-sdk.test.ts \
  tests/contract/application-publisher-sdk-hardening.test.ts
```

Exact frozen-head local gate was operator-reported PASS. Exact test counts were not supplied in the final green message and are not inferred. See `docs/evidence/MASTER-39/VERIFICATION.md`.

## Q0–Q9

- Q0 PASS — fresh branch from exact `b8f009603407fea9a9115d735e9a144017fc654f`.
- Q1 PASS — roadmap + nearest-owner reverse engineering.
- Q2 PASS — SDK/non-authority contract frozen.
- Q3 PASS — implementation added.
- Q4 PASS — focused security/integrity/determinism/hardening coverage added.
- Q5 PASS — final security/fail-closed review.
- Q6 PASS — architecture/ownership review.
- Q7 PASS — exact frozen-head local boundaries/typecheck/focused suites, operator reported.
- Q8 REQUIRED — final post-Q7 executable-clean compare.
- Q9 BLOCKED until final Q8; then exact-head squash merge and MASTER-40 starts from resulting new authoritative `main`.

Hosted verify/iOS/Android jobs on the frozen head ended with `steps: null` and remain infrastructure non-signal.
