# MASTER-38 — Application Protocol Projection Contract

## Goal

Add the first Application-level protocol egress contract so exact distributed Application semantics can be projected into external protocol payloads with explicit `lossless | lossy | unsupported` fidelity, without turning protocol adapters into canonical semantic, transport, runtime or governance owners.

## Base

- authoritative `main`: `e03118833731c8483d0c42f648fefe446f0a103a`
- previous phase: MASTER-37 merged via PR #197
- branch: `master/38-application-protocol-projection`
- corrected frozen executable head: `73f99f85f9f0226591d6161825857b40541455b3`

## Contract

`ViraApplicationProtocolProjectionArtifact` binds one canonical `ViraApplicationDistributionEnvelope` to one exact source-declared `projectionRef` and one explicit result:

- `lossless` with payload;
- `lossy` with payload + bounded unique canonical Application loss paths;
- `unsupported` with reason and no payload.

`fidelity` is an adapter report, not a generic proof of arbitrary protocol-specific semantic equivalence.

## Ownership

`application-protocol-projection` owns only Application-level projection artifact shape, source distribution delegation, exact declared projection membership, explicit fidelity result variants, semantic loss reporting, deterministic serialization and safe frozen protocol payload data.

It does not own protocol-specific adapters, transport/federation, provider credentials, source integrity verification, registry/discovery, deployment/runtime, governance/authorization/entitlement, Capability invocation or protected Action execution.

Executable dependency boundary:

```text
application-protocol-projection → application-distribution, protocol
```

## Q5/Q6

PASS. Safe JSON/exact shapes, undeclared projection rejection, strict fidelity variants, canonical path grammar, explicit loss bounds, deterministic payload serialization, prototype-safe handling and authority-smuggling rejection were reviewed. Architecture review confirms no registry/gateway/deployment/runtime/governance/Action authority is imported or modified.

## Q7 history

Initial executable head `0728072b19e4b73cb654bab1b724e2aefbbdb99b`:

- package boundaries PASS;
- 16/16 focused tests PASS;
- TypeScript FAIL with two TS7053 object-index narrowing errors.

Semantic-neutral correction `73f99f85f9f0226591d6161825857b40541455b3` adds explicit `JsonObject` binding in the two post-array object branches only.

Corrected exact-head local Q7 on `73f99f85f9f0226591d6161825857b40541455b3` is operator-reported PASS for package boundaries, TypeScript, and both focused projection suites. Evidence: `docs/evidence/MASTER-38/VERIFICATION.md`.

## Q8

PASS. Final compare from corrected frozen executable head to closure state contains documentation/evidence only; executable drift is zero.

## Q0–Q9

- Q0 PASS
- Q1 PASS
- Q2 PASS
- Q3 PASS
- Q4 PASS
- Q5 PASS
- Q6 PASS
- Q7 PASS
- Q8 PASS
- Q9 READY — exact-head squash merge, then MASTER-39 from resulting authoritative `main`

Hosted verify/iOS/Android zero-step jobs remain infrastructure non-signal.
