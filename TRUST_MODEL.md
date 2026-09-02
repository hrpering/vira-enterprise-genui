# Vira Enterprise GenUI Trust Model

## Purpose

This document defines what Vira may trust, what it must validate, and where security decisions must fail closed.

It is an architectural contract, not a claim that every target control is already implemented. Current guarantees and planned MASTER-phase guarantees are identified separately.

## Primary security objective

No model, agent, renderer, protocol adapter, customer payload, Experience artifact, or provider integration may directly turn untrusted input into an enterprise side effect.

```text
UNTRUSTED / PARTIALLY TRUSTED
model · agent · user input · tool result · network payload · artifact input
                         │
                         ▼
               validation / normalization
                         │
                         ▼
               canonical Vira contracts
                         │
                         ▼
                 governance boundary
                         │
                         ▼
                trusted action adapter
                         │
                         ▼
                 enterprise backend
```

## Trust zones

### Zone U0 — External untrusted input

Examples:

- LLM output;
- agent proposals;
- user-entered values;
- MCP/other tool results;
- customer API responses;
- Registry/Pack input received from outside the trusted process;
- imported authoring documents;
- protocol payloads.

Rule: external shape, object identity, prototype state, provider metadata, claimed version and claimed capability are not authority by themselves.

Current repository examples already follow this posture through canonical JSON parsing, unknown-field rejection, bounded inputs and hardened Pack/Registry parsing.

### Zone U1 — Authored Experience content

An authored Experience is declarative product data, not trusted executable code.

Allowed semantics are constrained by registered component, binding, interaction and action contracts. A document cannot grant itself a new component implementation, host capability, credential or backend permission.

### Zone T1 — Canonical validated contracts

Values returned by canonical Vira parsers/validators are trusted only for the semantics owned by that parser.

Examples:

- a parsed `StudioExperienceDocument` proves document validity, not authorization to execute a business action;
- a canonical Experience Pack proves manifest validity, not Marketplace visibility or deployment approval;
- Registry membership proves an exact Pack is known, not that it is safe for every tenant/host;
- a valid runtime action proves action shape, not policy approval.

Never promote validation in one layer into authority for another layer.

### Zone T2 — Trusted host / brand integration

Installed application integrations provide trusted implementations for registered semantic components, data adapters and action adapters.

A renderer implementation may display approved data and emit registered semantic interactions. It must not bypass the canonical runtime/action boundary to perform arbitrary protected side effects.

### Zone T3 — Governance and action execution

The target Vira Action Boundary combines validated intent with user/agent/Experience/deployment/instance/environment context before a trusted action adapter is invoked.

This zone is the only intended route for protected enterprise side effects once MASTER-08 is complete.

## Fail-closed rules

The following conditions deny/reject rather than silently guess:

- unknown Experience/document fields at canonical boundaries;
- invalid or unsupported versions;
- unknown Pack/version;
- unsupported host capability without an author-declared compatible fallback;
- unknown component/action/capability;
- ambiguous resolver match;
- unknown or mismatched `instanceId`;
- cross-tenant or cross-project access;
- stale state revision where a side effect depends on a newer state;
- invalid/missing identity required by policy;
- policy evaluation error;
- failed approval/challenge;
- unsigned/unverified artifact where verification is required;
- provider adapter failure on a mandatory security decision.

A security subsystem being unavailable does not mean allow.

## Current fail-closed foundations

The current codebase already establishes several useful controls:

- `runtime-core` permission evaluation defaults to deny when no rule matches;
- runtime actions are validated into canonical JSON data with a closed field set;
- Studio document validation rejects unknown/invalid structure;
- host snapshots are validated and accepted monotonically;
- duplicate Studio action forwarding is rejected per runtime session;
- Experience Registry exact lookup does not select a mutable `latest` version;
- generic security/policy wrappers do not execute protected actions themselves;
- package boundaries prohibit generic layers from importing arbitrary domain/framework owners.

These are foundations, not the complete MASTER-08/09 governance system.

## Identity model — target

A protected action decision must be able to distinguish at least:

```text
WHO        user
WHICH      agent / service
WHICH      Experience
WHICH      Pack / publication / deployment revision
WHICH      runtime instance
WHERE      platform / environment / tenant / project
WHAT       action
WITH       bounded validated data
```

Identity providers assert identity; they do not choose the protected business outcome by themselves.

Unknown identity is not silently converted into an anonymous privileged principal.

## Provider-neutral governance — target

External providers such as OPA, Cedar, Microsoft governance/identity systems or custom engines may participate through adapters.

Provider output is mapped into a canonical Vira verdict. A target verdict model may include:

- allow;
- deny;
- challenge/approval;
- transform with explicit bounded obligations.

Provider-specific concepts do not leak through every runtime package.

### Non-overridable core safety

A provider cannot authorize behavior that Vira itself considers structurally invalid or forbidden.

Examples:

- a provider cannot allow an unknown action to execute;
- a provider cannot make an unsigned required artifact valid;
- a provider cannot bypass exact instance/tenant isolation;
- a provider cannot turn arbitrary remote code into a trusted component;
- a provider cannot grant AI autonomous publish permission where the core product rule forbids it.

## Approval / challenge — target

An approval requirement is a governed state transition, not a UI popup shortcut.

Approval evidence must bind to the action context being approved. A changed amount, target, version, instance or relevant state revision requires a new decision when the policy says those fields are material.

Approval presentation itself should be representable as a Vira Experience across supported platforms.

## Concurrency and idempotency — target

Distributed systems cannot promise magical exactly-once execution. Vira instead requires explicit duplicate/stale defenses around side effects.

Target action context includes concepts such as:

- `actionId`;
- `idempotencyKey`;
- `expectedStateRevision`;
- exact instance/deployment identity.

The trusted adapter/receipt model must make retries deterministic enough to prevent a double-click, mobile reconnect, agent retry or network retry from blindly repeating a protected mutation.

Existing Studio host-runtime at-most-once forwarding is preserved as a useful local guarantee but does not replace end-to-end backend idempotency.

## Artifact trust

### Passive artifact rule

Experience distribution contains declarative, bounded content and references to trusted installed implementations.

Forbidden as a general native/web Experience mechanism:

- arbitrary remote JavaScript;
- arbitrary remote Swift/Kotlin;
- arbitrary HTML/CSS with executable privilege;
- shell/native binaries;
- hidden code fetched from Experience metadata.

### Integrity

Later deployment phases will require digest/signature verification for production artifacts and verified mobile cache use.

Artifact identity, deployment approval and runtime instance identity are separate concepts.

## Secret trust boundary

Raw secrets do not belong in:

- `StudioExperienceDocument`;
- `StudioPublication`;
- Experience Pack metadata intended for clients;
- renderer props/state;
- client telemetry attributes;
- model prompts as an execution transport.

Trusted control-plane/server adapters resolve a `SecretRef` or equivalent server-side reference at the latest safe point.

A client receives only the minimum non-secret capability/data required to render and propose actions.

## AI trust boundary

AI is an untrusted proposer with useful capabilities, not the publication authority.

AI may:

- draft Experience changes;
- select from approved semantic catalogs;
- propose actions;
- explain policy/validation errors.

AI may not, merely because it generated the content:

- register new executable components;
- bypass schema/capability/policy validation;
- choose an implicit active instance;
- invent a platform fallback;
- expose a secret;
- publish directly to production;
- execute a protected side effect outside the Action Boundary.

## Renderer trust boundary

Renderers are trusted installed code, but renderer input is still data.

Rules:

- never interpret raw model/tool payloads directly;
- never evaluate arbitrary HTML/JS from Experience data;
- emit registered semantic interactions/actions only;
- do not contain customer backend credentials;
- do not become an alternate global state store;
- do not bypass policy/action execution because a button lives in trusted code.

## Telemetry and replay

Telemetry and future replay are observation surfaces, not authority surfaces.

Sensitive raw prompts, secrets or arbitrary customer content must not be captured merely for convenience.

Replay reconstructs the semantic decision/action chain but must not re-execute the original protected side effect.

## Multi-tenant isolation — target

Tenant/project/environment identity must be explicit at control-plane and action boundaries.

No exact identifier from one tenant becomes valid in another tenant merely because the Pack/version/component ID strings match.

Cross-tenant resolution or action execution fails closed.

## Security change rule

When a future feature needs to weaken one of these controls, the implementation PR must stop. The architecture/trust contract must be deliberately revised and reviewed first; security exceptions are not introduced as hidden fallback code.