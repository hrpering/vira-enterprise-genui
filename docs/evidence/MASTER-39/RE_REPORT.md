# MASTER-39 Reverse-Engineering Report

## Base

Authoritative `main`: `b8f009603407fea9a9115d735e9a144017fc654f`

## Roadmap source

`docs/strategy/APPLICATION_NETWORK_THESIS.md` orders this program stage as:

```text
protocol egress → publisher/AI-host SDKs → federated distribution
```

MASTER-38 closed Application protocol egress, so MASTER-39 takes the publisher-side SDK slice. MASTER-40 remains the AI-host SDK candidate and MASTER-41 remains federation/discovery, subject to fresh reverse engineering from each new authoritative `main`.

## Existing owners inspected

- `application-package` owns canonical Application identity/version/publisher/distribution/protocol/commercial semantics and canonical serialization.
- `application-distribution` owns the exact distribution envelope, SHA-256 integrity declaration, deterministic envelope serialization and explicit integrity-verification gate.
- `application-protocol-projection` owns Application-level protocol projection fidelity artifacts.
- `protocol-gateway` owns existing tool/protocol invocation adaptation.
- existing registry/deployment/runtime/governance/Action owners retain their authorities.

## Gap

External publishers need a small provider-neutral SDK function that converts a canonical Application candidate into the already-owned distribution envelope without forcing each publisher integration to duplicate:

- canonical Application parsing/serialization;
- publisher-id parity checking;
- digest-provider invocation over exact canonical bytes/string;
- distribution-envelope construction and canonical serialization;
- fail-closed digest-provider handling.

This is integration ergonomics, not a new canonical artifact schema.

## Frozen direction

Add `@vira-enterprise-genui/application-publisher-sdk`.

Input:

```text
{
  publisherId,   // host-asserted identity; not authentication
  application
}
+ injected SHA-256 digest provider
```

Flow:

```text
safe input
  ↓
canonical Application parse
  ↓
exact publisherId parity
  ↓
canonical Application serialization
  ↓
injected digest provider
  ↓
strict lowercase SHA-256 digest
  ↓
canonical Application Distribution envelope parse + serialization
```

Output is SDK convenience data around the canonical `ViraApplicationDistributionEnvelope`; it is not a publication receipt, registry record, signature or verified-publisher assertion.

## Non-ownership

MASTER-39 does not own or implement:

- publisher authentication or identity proof;
- signing keys, certificates or credential storage;
- digest verification or a claim that the digest provider is trustworthy;
- registry upload, URL, transport, federation, search or ranking;
- protocol-specific projection adapter implementation;
- deployment/runtime state;
- governance/authorization/entitlement;
- Capability or protected Action execution.

## Package boundary

```text
application-publisher-sdk → application-package, application-distribution, protocol
```
