# Vira Enterprise GenUI Trust Model

## Purpose

This document defines the current trust boundaries of the integrated Enterprise GenUI foundation. It describes canonical security invariants, not a claim that external production proof has completed; RC1 remains blocked on MASTER-25R exact-head evidence.

## Primary security objective

No model, agent, renderer, protocol adapter, customer payload, Experience artifact or provider integration may directly turn untrusted input into a protected enterprise side effect.

```text
UNTRUSTED / PARTIALLY TRUSTED
model · agent · user input · tool result · network payload · artifact
                         ↓
               validation / normalization
                         ↓
               canonical Vira contracts
                         ↓
             governance + Action Boundary
                         ↓
                trusted action adapter
                         ↓
                 enterprise backend
```

## Trust zones

### U0 — External input

LLM output, agent proposals, user input, tool results, customer API responses, imported documents, protocol payloads and externally supplied Pack/Registry inputs are untrusted.

Shape, prototype state, claimed version, identity, provider metadata or capability claims are never authority by themselves.

### U1 — Authored Experience content

An Experience is declarative application data, not executable privilege. A document cannot grant itself a component implementation, credential, host capability, action adapter, governance permission or backend authority.

### T1 — Canonical validated contracts

A successful parser/validator grants trust only for the semantics that owner validates.

Examples:

- parsed Studio document validity is not business-action authorization;
- valid Pack structure is not deployment/marketplace approval;
- Registry membership is not tenant authorization;
- structurally valid action input is not governance approval.

### T2 — Trusted host / brand integration

Installed integrations provide trusted component implementations and registered adapters. Trusted code still receives data; it does not gain permission to bypass canonical action/governance owners.

### T3 — Governance and protected execution

`governance`, `enterprise-governance` and `action-boundary` form the canonical protected-action path. Provider-neutral identity/governance/approval results are composed with Vira's structural, tenant/instance, revision/idempotency and trusted-adapter constraints.

This is the intended path for protected enterprise side effects.

## Fail-closed rules

Reject/deny rather than guess on at least:

- malformed or unknown canonical fields;
- unsupported/unknown version;
- unknown Pack/component/action/capability;
- ambiguous resolution;
- implicit-latest execution;
- mismatched instance/deployment identity;
- cross-tenant/project/environment access;
- stale revision for a protected mutation;
- missing/invalid required identity;
- governance/provider evaluation error;
- failed/expired approval or challenge;
- unsigned/unverified artifact where verification is required;
- malformed adapter result;
- provider failure on a mandatory security decision.

Unavailable security infrastructure does not mean allow.

## Identity and governance

A protected action decision can distinguish the relevant actor, agent/service, tenant/project/environment, Experience/Pack/publication/deployment, runtime instance, semantic action and bounded payload.

Identity providers assert identity; they do not choose protected business outcome alone.

External governance providers are adapters. Their native concepts are translated into provider-neutral Vira verdicts/obligations. A provider cannot override Vira structural invalidity, exact isolation, required artifact integrity or other non-overridable core safety.

## Approval / challenge

Approval is a governed state transition bound to the material action context, not a UI shortcut. If material values, target, identity, version, instance or relevant revision changes, previously issued evidence is not silently reused where policy requires a fresh decision.

Approval UX may be rendered as an Experience, but the UI itself does not execute the protected effect outside the boundary.

## Concurrency, retry and idempotency

Vira does not promise impossible universal exactly-once execution. The action contract provides explicit identity/idempotency/revision concepts so double-clicks, reconnects, agent retries and network retries do not blindly repeat a protected mutation.

A duplicate and a different stale operation are distinct failure classes.

## Artifact trust

Canonical Experience distribution is passive declarative content plus references to trusted installed implementations.

Forbidden as generic Experience privilege:

- arbitrary remote JavaScript/Swift/Kotlin;
- executable HTML or hidden script delivery;
- shell/native binaries;
- code fetched from untrusted Experience metadata.

Artifact integrity, deployment approval, Pack version and runtime instance identity remain separate concepts.

## Secret boundary

Raw secrets do not belong in Studio documents/publications, client Pack metadata, renderer state/props, client telemetry or model prompts used as execution transport.

Trusted server/control-plane adapters resolve server-side secret references at the latest safe point and expose only minimum non-secret data/capability to clients.

## AI boundary

AI is proposal authority, not publication/governance/execution authority.

AI may draft semantics, select approved catalogs, propose actions and explain failures. AI may not register executable components, invent unsupported capability, bypass validation/governance, expose secrets, publish to production or execute a protected effect merely because it generated the request.

## Renderer boundary

Renderers are trusted installed code; renderer input remains data.

Renderers must not:

- interpret raw model/tool payloads as authority;
- evaluate arbitrary executable Experience content;
- contain protected backend credentials;
- become an alternate global semantic-state authority;
- directly bypass governance/action execution.

## Telemetry and replay

Telemetry/replay are observation surfaces. They must not become authority, leak secrets by convenience, or re-execute historical side effects.

## Multi-tenant isolation

Tenant/project/environment identity is explicit at registry/deployment/action boundaries where relevant. Matching IDs across tenants do not grant cross-tenant validity.

## Security change rule

Any feature that needs to weaken these invariants must stop and revise the trust/architecture contract explicitly. Security exceptions are never introduced as hidden fallback behavior.
