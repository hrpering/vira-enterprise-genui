# MASTER-09 — Governance / Policy v2

## Responsibility

Add provider-neutral governance, agent identity and approval SPIs above Vira Core Safety and before protected MASTER-08 execution.

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

AGT/ACS, OPA, Cedar, Entra/OIDC and custom systems are adapters/providers. None is a Vira core dependency and none owns Vira's canonical verdict model.

## SPIs

### GovernanceProvider

Consumes canonical governance context and returns a provider-neutral verdict:

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

Resolves one exact bounded `AgentPrincipal`. Identity is deliberately separate from governance/policy.

V1 includes an injected OIDC claims adapter. Microsoft Entra Agent ID can be integrated through that OIDC/workload-identity seam or a dedicated injected client without changing core contracts.

### ApprovalProvider

Consumes one exact governance challenge and returns approved/denied. Challenge identity binds provider + instance + action + type + expected revision + idempotency key.

A challenge may also be returned to an external approval experience. A later evaluation can supply exact pre-authorized approval decisions. Mismatched, stale, unused or replayed approvals fail closed.

## Canonical governance context

V1 includes only portable claims available before MASTER-12 org/environment work:

```text
instanceId
experienceId
experienceVersion
platform
userPrincipal?
agentPrincipal?
actionIntent
```

No credential or secret material enters governance context.

## Composition rules

1. Core Safety deny -> terminal deny; governance providers are not invoked.
2. Core Safety allow -> providers may only further restrict/challenge/transform.
3. Any provider deny -> terminal deny.
4. challenge -> exact ApprovalProvider decision or exact supplied prior approval required.
5. transform -> only canonical action payload may change; action id/type/source, instance, expected revision and idempotency identity remain immutable.
6. transformed payload is revalidated as a canonical RuntimeAction before the next provider.
7. provider failures, malformed verdicts, unknown obligations or malformed identities fail closed.
8. multiple transforms compose sequentially on payload only and each step is revalidated.
9. trusted obligation IDs are allowlisted by the Vira pipeline; providers cannot invent executable obligations.
10. provider/evidence identifiers are metadata references, never credentials.

## Injected adapters

V1 adapter constructors intentionally take injected clients and therefore add no vendor SDK dependency:

```text
createViraAgtGovernanceProvider
  allow      -> allow
  warn       -> allow + preserved reason
  deny       -> deny
  escalate   -> challenge
  transform  -> payload transform

createViraOpaGovernanceProvider
  boolean or bounded allow/deny/challenge object

createViraCedarGovernanceProvider
  Allow -> allow
  Deny  -> deny

createViraOidcAgentIdentityProvider
  bounded sub + URL-shaped issuer -> AgentPrincipal
```

Vendor response parsing is fail-closed and downstream canonical pipeline validation still applies.

## Out of scope

- implementing Rego/Cedar/ACS engines;
- storing or fetching credentials/secrets;
- network-specific Entra/OIDC/SPIFFE clients;
- policy simulation/change-impact console (MASTER-10);
- org/project/environment ownership (MASTER-12);
- durable evidence ledger (MASTER-17).

## Verification policy

Hosted CI is intentionally deferred. Final local/full CI after the complete stack must prove:

- Core Safety deny dominance;
- provider failure/malformed verdict fail-closed behavior;
- identity/provider separation;
- exact approval challenge + continuation + replay rejection;
- bounded payload-only transforms;
- obligation allowlist enforcement;
- AGT/ACS, OPA, Cedar and OIDC adapter normalization;
- public facade and package-boundary hygiene.
