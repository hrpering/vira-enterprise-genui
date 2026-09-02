# MASTER-01 — Product Contract + Architectural Invariants

## Status

Implementation branch: `master/01-architecture-trust-freeze`

Authoritative base: `4ea43844dcc5631f993e186cfe2dcb9a7e9d49dc` (`INT-001: merge Experience Platform v1`).

MASTER-00 reconciliation is complete: the stale #123–#133 and #150–#154 stacks are closed without merging, reusable deltas are mapped to later master phases, and no open pull request remains.

## Goal

Freeze the architectural language and trust boundaries that every later master phase must obey before new portable/native/runtime/governance contracts are introduced.

This is a documentation-only phase. It must not create a new runtime schema, policy engine, renderer, protocol, host implementation, or compatibility layer.

## Reverse-engineering baseline

The current repository already has several canonical owners that must be preserved:

- `studio-schema` owns `StudioExperienceDocument` and its parser.
- `studio-publish` owns the canonical publication gate.
- `studio-authoring` is a thin code-first facade over the existing schema/publication/portable-bundle owners.
- `runtime-core` owns deterministic runtime actions, permissions, lifecycle, patches and state.
- `studio-host` owns the current host bridge/snapshot contract.
- `studio-host-runtime` bridges canonical Studio runtime actions to the host and already enforces monotonic host revisions plus at-most-once forwarding per action id/session.
- `experience-packs` is a distribution envelope, not a second Experience schema.
- `experience-registry` owns bounded canonical Pack membership and exact lookup.
- `policy-engine` is currently a provider-neutral wrapper over security decisions, not a general policy language.
- `tooling/package-boundaries.config.mjs` is the executable package dependency allowlist.

Existing architecture docs already forbid raw LLM/tool payloads reaching renderers, customer endpoints inside runtimes, hidden global runtime state, silent security fallback and arbitrary HTML/JavaScript execution.

## Deliverables

Create the following root architecture contracts:

1. `MASTER_PLAN.md`
   - authoritative MASTER-00..25 delivery order;
   - per-phase purpose and gate;
   - reconciliation/salvage rules;
   - RC definition.

2. `ARCHITECTURE.md`
   - current canonical artifacts and owners;
   - target governed-experience architecture;
   - current-vs-target boundaries so planned contracts are not presented as implemented features;
   - domain/core separation.

3. `TRUST_MODEL.md`
   - trusted/untrusted inputs and zones;
   - fail-closed requirements;
   - identity, policy, approval, artifact integrity and secret boundaries;
   - provider adapters may extend but never weaken Vira core safety.

4. `PLATFORM_MODEL.md`
   - web, iOS and Android are first-class;
   - one semantic Experience, no platform schema forks;
   - native SwiftUI/Compose target with no WebView/remote JS dependency;
   - capability negotiation and lifecycle ownership.

5. `ACTION_BOUNDARY.md`
   - preserve current canonical runtime/host action semantics;
   - define the target `ActionIntent -> validation -> identity -> policy -> approval -> concurrency/idempotency -> trusted adapter -> ActionReceipt` boundary;
   - explicitly separate current guarantees from MASTER-08 work still to be implemented.

6. `PACKAGE_OWNERSHIP.md`
   - document current package owners without duplicating the executable dependency graph;
   - map planned owners to the master phase that may create them;
   - prohibit duplicate semantic owners and domain-specific behavior in generic packages.

## Non-negotiable invariants

Every later PR must preserve all of these unless a new authoritative master-plan revision explicitly replaces them:

- one canonical Experience semantic model;
- no platform-specific schema forks;
- no remote executable code in Experience artifacts;
- exact version resolution;
- exact instance routing;
- policy and tenant boundaries fail closed;
- web, iOS and Android are first-class product surfaces;
- every enterprise side effect crosses the Vira Action Boundary;
- AI may draft/propose but cannot publish by itself;
- raw secrets never enter Experience artifacts or client runtime state;
- provider integrations cannot bypass Vira core safety;
- generic packages contain no customer/domain switching;
- no hidden `latest`, `active`, or global mutable Experience target.

## Scope exclusions

MASTER-01 does not implement:

- JSON Schema/codegen;
- Brand SDK;
- Host Capability Manifest;
- Generic Resolver clean-port from #152;
- native iOS/Android SDKs;
- new action, identity, approval or governance runtime code;
- deployment/control plane;
- Studio product changes;
- protocol adapters;
- Pegasus extraction.

Those remain owned by their later master phases.

## Acceptance / RE gate

The phase passes only if:

1. the diff is documentation-only and limited to this plan plus the six root contract documents;
2. every statement about current behavior is traceable to current `main` code/docs;
3. planned behavior is clearly labeled as target/future rather than falsely documented as implemented;
4. the documents preserve existing canonical owner boundaries instead of inventing duplicate schemas or runtimes;
5. `tooling/package-boundaries.config.mjs` remains the executable dependency source of truth;
6. no Pegasus/Flight/Recipe/customer-specific architecture becomes a generic core contract;
7. repository verification passes for the exact PR head;
8. an independent post-implementation reverse-engineering/QC pass returns `PASS` before merge.

## Merge rule

Squash merge only after the exact PR head satisfies the acceptance gate. The resulting `main` SHA becomes the sole base for MASTER-02.