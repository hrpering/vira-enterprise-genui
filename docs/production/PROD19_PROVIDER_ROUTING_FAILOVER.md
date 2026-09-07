# PROD-19C Provisional Provider Routing and Explicit Failover

**Status:** provisional repository contract. No live provider SLA, commercial, regional, or release-authority claim.

## Reverse-engineered owner decision

`capability-supply` already resolves an exact Capability release to canonical hosted provider/location bindings. `provider-trust` independently decides whether one exact provider connection is trusted for one enterprise scope and validity window. Routing therefore extends `capability-supply` while consuming only the fail-closed trust decision evidence produced by the provider-trust boundary.

The router does not create a second provider trust system, does not own credentials and does not invoke providers.

## Explicit route contract

A route policy pins:

- one exact Capability reference;
- an ordered list of exact binding references;
- allowed location ids;
- minimum availability basis points;
- maximum p95 latency;
- one currency and maximum unit cost in micros;
- an explicit bounded set of failover reasons.

Every declared route candidate must exist in the exact Capability supply lookup and must carry provider-trust, SLA and commercial evidence. Provider identity must match the exact supply binding, trust must still be valid, and all candidates must share the same enterprise scope.

A declared route that violates trust, scope, location, SLA or commercial constraints rejects the whole plan. It is never silently skipped in favor of a later provider.

## Failover semantics

Failover is a pure transition over the already validated ordered route. A provider failure can move only to the immediately next declared binding and only when its failure reason appears in `allowedFailoverReasons`. Unknown reasons, unknown current bindings and exhaustion fail closed.

Extra supply candidates discovered in the registry are not automatically inserted into the route. This prevents hidden provider substitution.

## Authority boundary

The route plan returns only exact binding/provider/location references, provider trust evidence ids/validity and SLA/commercial evidence. It returns no endpoint, token, secret, credential or execute authority. Actual provider invocation remains owned by the hosted Capability runtime, and protected Actions remain behind the Action Boundary.

Model, compute and node providers do not receive a parallel routing primitive: when represented as a Capability supply they use this same exact route contract.

## Deferred release evidence

Real provider SLO measurements, production regional placement, commercial metering reconciliation and live failover drills remain external release evidence. They do not block repository development and cannot be inferred from this provisional slice.
