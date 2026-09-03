# MASTER-09 — Governance / Policy v2

## Responsibility

Add provider-neutral governance, agent identity and approval SPIs above Vira Core Safety and below protected Action Boundary execution.

```text
Vira Core Safety (L0)
        ↓
User + Agent Identity (L1)
        ↓
Authorization / Governance Providers (L2/L3)
        ↓
Human / step-up Approval (L4)
        ↓
Business preconditions (later integration)
        ↓
MASTER-08 Action Boundary
```

## Non-negotiable

**No external provider can override a Vira Core Safety deny.**

AGT/ACS, OPA, Cedar, Entra Agent ID, OIDC and custom systems are adapters/providers. None is a core dependency and none owns Vira's canonical verdict model.

## SPIs

### GovernanceProvider

Consumes a canonical governance context and returns a provider verdict.

Normalized provider verdict:

```text
effect = allow | deny | challenge | transform
reasonCode
obligations[]
evidenceRef?
provider
transformedPayload?   # transform only
```

Provider failure is fail-closed.

### AgentIdentityProvider

Resolves one exact bounded AgentPrincipal. Identity is separate from policy/governance.

Adapters can later include:

- Microsoft Entra Agent ID
- OIDC workload identity
- SPIFFE
- custom

### ApprovalProvider

Consumes an exact governance challenge and returns approved/denied. Approval identity is exact and cannot authorize another action/challenge.

## Canonical governance context

V1 includes only portable claims already available before MASTER-12 org/environment work:

```text
instanceId
experienceId
experienceVersion
platform
userPrincipal?
agentPrincipal?
actionIntent
```

No credentials or secrets enter governance context.

## Composition rules

1. Core Safety deny -> final deny; providers are not invoked to produce an override.
2. Core Safety allow -> providers may further restrict.
3. Any provider deny -> final deny.
4. challenge -> exact ApprovalProvider decision required.
5. transform -> only canonical action payload transformation is allowed in V1; action id/type/source, instance, revision and idempotency identity cannot change.
6. transformed payload is revalidated as canonical RuntimeAction before continuing.
7. provider failures, malformed verdicts, unknown obligations or invalid identity fail closed.
8. multiple provider transforms compose sequentially on payload only; each step is revalidated.
9. a later allow cannot erase an earlier challenge/deny.
10. provider/evidence identifiers are metadata references, never credentials.

## Out of scope

- implementing Rego/Cedar/ACS engines;
- network calls to Entra/OIDC/SPIFFE;
- policy authoring console (MASTER-10);
- org/project/environment identity (MASTER-12);
- ledger persistence (MASTER-17).

## Verification policy

Hosted CI is deferred. Final local/full CI after the complete stack must prove core-deny dominance, provider failure fail-closed, identity/provider separation, exact approval, bounded transforms, and public API/package-boundary hygiene.
