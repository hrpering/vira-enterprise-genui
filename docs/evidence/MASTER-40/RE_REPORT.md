# MASTER-40 Reverse Engineering Report

## Base

Authoritative `main` entering MASTER-40: `86def2e33f3f845fff8e3fb234099e60ffbdaf20`.

## Roadmap placement

The Application Network thesis orders this stage as:

```text
protocol egress → publisher/AI-host SDKs → federated distribution
```

MASTER-38 completed Application protocol egress. MASTER-39 completed the publisher-side preparation SDK. MASTER-40 is the host-side compatibility/integrity slice only; federation remains later.

## Existing owners inspected

- `application-package` owns canonical Application semantics, including `hostCompatibility` and exact `protocolProjections[]` declarations.
- `application-distribution` owns the exact source envelope and explicit integrity-verification gate.
- `application-protocol-projection` owns projection artifacts/fidelity, not host admission.
- runtime/deployment/governance/entitlement/Action owners retain execution and permission authority.

## Owner gap

There was no provider-neutral Application-level host SDK that could:

1. safely consume one Distribution envelope;
2. require explicit source integrity verification;
3. validate one host descriptor;
4. evaluate the Application's canonical Vira-version and required-host-capability constraints;
5. report exact protocol projection refs supported by both source and host;
6. do all of the above without executing, deploying, authorizing or projecting the Application.

Extending `application-distribution` would mix artifact integrity with host compatibility. Extending `application-protocol-projection` would mix projection fidelity with host admission. Existing Studio/runtime hosts own different execution/render concerns. A thin Application AI-host SDK is therefore the nearest non-competing owner.

## Frozen contract direction

Input:

```text
{
  source: ViraApplicationDistributionEnvelope,
  host: {
    viraVersion,
    capabilities[],
    protocolProjections[]
  }
}
+ injected integrity verifier
```

Success returns one frozen compatibility plan containing the verified canonical source, canonical host descriptor, and exact source/host protocol-projection intersection.

## Constitutional boundaries

- source integrity must verify before Application compatibility can succeed;
- host descriptor identity is not authentication and contains no host credential/endpoint;
- Application `hostCompatibility` remains canonical owner of min/max Vira version and required host capability declarations;
- empty protocol intersection is not automatically runtime incompatibility;
- protocol refs are exact and no implicit/latest negotiation occurs;
- SDK does not create a projection artifact or call a protocol adapter;
- SDK success is not authorization, entitlement, deployment approval, governance approval or runtime execution permission;
- malformed/untrusted input and verifier failures fail closed;
- no URL, transport, provider credential, registry/federation or protected Action authority is introduced.

## Dependency decision

Exact executable dependency boundary:

```text
application-ai-host-sdk → application-distribution, application-package, protocol
```
