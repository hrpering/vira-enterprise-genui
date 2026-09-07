# PROD-19D Provisional Network Protocol Conformance

**Status:** provisional repository contract. No live MCP, A2UI, AG-UI or customer SDK interoperability claim.

## Reverse-engineered owner decision

`protocol-gateway` already normalizes external protocol ingress and owns protocol semantic roles. `application-protocol-projection` separately proves that a concrete projection is declared by an Application and records lossless/lossy/unsupported projection fidelity.

The Network conformance layer therefore extends `protocol-gateway` with a protocol-family/operation policy. It does not duplicate Application projection validation and does not create an execution adapter.

## Supported Network families

The public Network family names map exactly to canonical gateway protocols:

- `mcp` -> `mcp`;
- `a2ui` -> `a2ui`;
- `ag-ui` -> `ag-ui`;
- `custom-sdk` -> `custom-json`.

Protocol-family mismatch fails closed. No family silently falls through to another projection.

Each family also has an explicit semantic operation set. MCP is tool/data/action-discovery oriented, A2UI is declarative-render oriented, AG-UI is state-event oriented, and custom SDK is the explicit custom compatibility surface.

## Action Boundary invariant

A protocol can request an Action but can never receive Action execution authority from this gateway. Every `action-request` conformance result is evidence-only and emits:

`actionAuthority = action-boundary-required`

The conformance result intentionally carries no payload, endpoint, token, credential, secret, approval, invocation or execute primitive. Even if incoming JSON contains fields named `execute` or `directExecution`, they remain untrusted protocol payload and cannot change the authority classification.

Actual protected Action validation/execution remains exclusively behind the existing Action Boundary.

## Application projection invariant

Every successful result emits `applicationProjectionRequired=true`. A host must still prove the corresponding exact Application projection using `application-protocol-projection`; gateway conformance does not invent or auto-declare an Application projection.

## Deferred release evidence

Live protocol counterpart tests, external SDK certification, interoperability matrices and production Action Boundary traffic traces remain external release evidence. They do not block repository development and cannot be inferred from this provisional contract.
