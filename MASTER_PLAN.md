# Vira Enterprise GenUI — Authoritative Master Plan

## Product category

Vira is the governed execution layer between AI intent and an enterprise product side effect.

The target product contract is:

> Any agent can propose an experience. Vira makes it native, governed, executable and auditable across every product surface.

Vira is not primarily a UI-spec project, agent transport, policy language, or chat framework. Those systems may integrate with Vira. Vira owns the controlled boundary where an AI- or user-driven interaction becomes an application action.

```text
AI / AGENT
    ↓
Vira Experience
    ↓
USER INTERACTION
    ↓
Vira Action Boundary
    ↓
IDENTITY + POLICY + APPROVAL + CONCURRENCY
    ↓
TRUSTED ENTERPRISE ADAPTER
    ↓
SIDE EFFECT + RECEIPT
```

## Authority

This file defines the delivery order. It does not claim that future phases are already implemented.

Every phase starts from the latest authoritative `main`, begins with reverse engineering, has one architectural responsibility, and passes repository verification plus an independent RE/QC review before squash merge.

A later phase may reuse a prior experimental PR only through an explicit unique-delta audit. Stale branches are never merged merely because they contain useful code.

## Global invariants

All phases preserve these rules:

1. One canonical Experience semantic model.
2. No platform-specific Experience schema forks.
3. No remote executable code in Experience artifacts.
4. Exact version resolution; no implicit `latest` execution target.
5. Exact instance routing; no hidden active/global Experience target.
6. Tenant and policy boundaries fail closed.
7. Web, iOS and Android are first-class product surfaces.
8. Every enterprise side effect crosses the Vira Action Boundary.
9. AI may draft or propose but may not publish autonomously.
10. Raw secrets never enter Experience artifacts or client runtime state.
11. Provider integrations may extend capabilities but may not weaken Vira core safety.
12. Generic packages remain customer-, domain-, framework- and transport-neutral unless their explicit owner contract says otherwise.

## Delivery sequence

### MASTER-00 — Current-work reconciliation — COMPLETE

Reconcile the repository before new architecture work.

- freeze authoritative `main`;
- audit stale/open PRs as keep / rewrite / discard;
- close superseded branches without merging them;
- preserve reusable unique deltas for their correct future owner;
- confirm executable package ownership.

Gate: latest main, zero stale PRs merged, zero duplicate owners introduced, package ownership known.

### MASTER-01 — Product contract + architectural invariants — IN PROGRESS

Freeze the architecture, trust, platform, action and package-ownership contracts before implementation expands.

Deliverables: `MASTER_PLAN.md`, `ARCHITECTURE.md`, `TRUST_MODEL.md`, `PLATFORM_MODEL.md`, `ACTION_BOUNDARY.md`, `PACKAGE_OWNERSHIP.md`.

### MASTER-02 — Portable Experience Contract

Preserve `StudioExperienceDocument -> StudioPublication` as the canonical semantic path. Do not create a second Experience schema.

Generate interoperable artifacts from the canonical source of truth:

- normative JSON Schema;
- Swift models;
- Kotlin models;
- cross-language conformance fixtures.

Gate: one fixture parses and serializes with equivalent semantics in TypeScript, Swift and Kotlin.

### MASTER-03 — Brand Integration SDK

Create the customer/brand integration facade around existing canonical owners.

Target shape:

```text
defineViraBrand({
  identity,
  design,
  components,
  actions,
  dataSources,
  policies,
  experiences,
})
```

A semantic component identity maps to trusted web, iOS and Android implementations. Core Vira must not know Pegasus, airline, retail or another customer domain.

### MASTER-04 — Host Capability Manifest

Define a common capability contract reported by web, iOS and Android hosts.

Unsupported Experiences fail closed unless the author explicitly declared a compatible fallback. Agents may not invent fallback behavior.

### MASTER-05 — Generic Resolver + Instance Isolation

Clean-port the reusable domain-neutral delta previously explored in PR #152 onto the then-current main.

Target resolution:

```text
request
  ↓
exact deployment
  ↓
exact Pack
  ↓
exact publication
  ↓
capability match
  ↓
exact instanceId
  ↓
runtime
```

No `latest mounted`, `active target`, or domain switch is permitted.

### MASTER-06 — Platform-neutral Runtime Kernel

Preserve and harden `runtime-core` as the platform-neutral execution/state kernel.

Add common lifecycle semantics required by native hosts without introducing OS APIs into the kernel: foreground, background, resume, disconnect, reconnect, session restore and verified cached Experience behavior.

### MASTER-07A — Web Host

Move the existing React, Web Component and Chat-facing web surfaces onto the common Host Contract and capability model. This becomes the reference conformance host, not the definition of the whole platform.

### MASTER-07B — iOS Native SDK

Create a first-class Swift/SwiftUI host over the same semantic Experience and action contracts.

No JavaScript runtime and no WebView dependency for native Vira Experiences.

### MASTER-07C — Android Native SDK

Create a first-class Kotlin/Compose host over the same semantic Experience and action contracts.

No JavaScript runtime and no WebView dependency for native Vira Experiences.

### MASTER-08 — Vira Action Boundary — CORE MOAT

Create the one side-effect boundary used by UI actions and agent actions:

```text
ActionIntent
  ↓
validation
  ↓
identity
  ↓
policy
  ↓
approval / challenge
  ↓
expected revision + idempotency
  ↓
trusted action adapter
  ↓
ActionReceipt
```

Existing runtime action IDs, host monotonic revision semantics and duplicate-forward protections are inputs to this phase; they are not a substitute for the completed boundary.

### MASTER-09 — Governance / Policy v2

Introduce provider-neutral governance interfaces such as `GovernanceProvider`, `AgentIdentityProvider` and `ApprovalProvider`.

Adapters may include OPA, Cedar, Microsoft Agent Governance Toolkit / ACS, Entra/OIDC and custom providers. Vira core safety remains non-overridable.

### MASTER-10 — Policy Simulation + Change Impact

Add draft validation and historical-fixture simulation so production policy changes show decision deltas before publish.

### MASTER-11 — Publication / Artifact / Deployment Plane

Own the deployment lifecycle:

```text
Publication
  ↓
Pack
  ↓
content-addressed verified artifact
  ↓
registry
  ↓
deployment
```

Support dev/staging/production promotion, rollback, deprecation and inspection. Mobile cache accepts only verified artifacts.

### MASTER-12 — Organization / Project / Environment / Secrets

Add the enterprise control-plane hierarchy and identity scopes.

Secrets are referenced by `SecretRef`; raw secret values do not enter Experience artifacts or client runtime state.

### MASTER-13 — Experience Studio Brand Console

Evolve Studio from a canvas-only product into a brand/project console covering design, components, data, actions, policies, Experiences, deployments and observability.

Canvas, code and AI remain authoring surfaces over the same canonical artifact.

### MASTER-14 — Multi-platform Studio Preview

Provide fast semantic preview and real native preview. iPhone/Android preview is not just a CSS viewport; real preview executes the published preview Pack in simulator/emulator hosts.

### MASTER-15 — AI Authoring v2

AI drafts against the approved brand catalog, platform capabilities, bindings, actions and policy metadata. Unsupported output fails validation. AI does not publish.

### MASTER-16 — Protocol Gateway v2

Integrate external protocols without creating a Vira protocol island.

Possible inbound interoperability includes A2UI, AG-UI, MCP/MCP Apps, Vira Native and custom JSON. Transport/state, UI declarations and tool/action discovery remain distinct concerns.

Sandboxed HTML compatibility must not be misrepresented as automatic native SwiftUI/Compose conversion.

### MASTER-17 — Observability + Replay + Action Ledger

Record the governed chain from shown Experience through user/agent action, policy/approval, backend execution and outcome.

Replay must not repeat side effects.

### MASTER-18 — Cross-platform Conformance Suite

Run one semantic fixture set across web, iOS and Android. Compare component semantics, state, bindings, navigation, policy calls, accessibility metadata, action payloads, revisions and outcomes—not screenshots alone.

### MASTER-19 — Accessibility + Localization + Native UX Gate

Enforce platform-appropriate accessibility and localization semantics: keyboard/ARIA/screen readers, VoiceOver/Dynamic Type/HIG behavior, TalkBack/font scaling/Compose semantics, RTL, locale, currency, date/time and number formats.

### MASTER-20 — External Brand SDK

Expose stable customer-facing web/iOS/Android/server entrypoints that hide planner, composer, runtime, registry and policy internals.

### MASTER-21 — Private Enterprise Registry

Provide an approved private catalog for Experiences, components, actions, policies, connectors, themes and Packs. Arbitrary HTML/JS or unknown native capabilities remain invalid.

### MASTER-22 — Experience Packs

Provide reusable domain flow compositions and optional policy templates. Packs are product/domain content, not core runtime logic.

### MASTER-23 — Pegasus Extraction

Move Pegasus/airline-specific implementation into an external brand proof repository. Vira core must not know Pegasus, Flight or Airline semantics.

The external proof must exercise web, iOS and Android through the same Pack, resolver and Action Boundary.

### MASTER-24 — Second-brand proof

Prove the architecture with a materially different synthetic domain, such as retail order/return/refund flows. The same canonical runtime and governance path must work without airline-specific branching.

### MASTER-25 — Enterprise RC gate

Release candidate status requires all major authoring, platform, governance, deployment, isolation and E2E gates to pass on exact release inputs.

At minimum:

- code, Studio and AI-draft authoring PASS;
- web, native iOS and native Android PASS;
- same Experience semantics across platforms PASS;
- same canonical ActionIntent semantics PASS;
- governance outcomes consistent PASS;
- user and agent identity PASS;
- allow/deny/challenge/transform/approval PASS;
- double click, duplicate retry and stale revision protections PASS;
- publish/promote/rollback PASS;
- verified offline cache and reconnect PASS;
- cross-tenant, cross-instance, wrong-version, unknown-component, unknown-action and unsigned-artifact negative cases DENY;
- external Pegasus proof PASS;
- second-brand proof PASS;
- local full CI, real browser E2E, iOS simulator E2E and Android emulator E2E PASS.

Only after that gate may the release be called **Vira Enterprise GenUI / Governed Experience Platform RC1**.

## Phase discipline

For every MASTER phase:

```text
latest authoritative main
        ↓
written PR plan
        ↓
reverse engineering
        ↓
ownership + invariant map
        ↓
minimal implementation
        ↓
focused verification
        ↓
independent RE / security / architecture QC
        ↓
repository verification
        ↓
diff hygiene
        ↓
squash merge
        ↓
new authoritative main
```

PR creation is not completion. A phase is complete only after its exact head passes its gate and the merged SHA is re-verified.