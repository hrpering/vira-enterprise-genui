# MASTER-42 — Commercial Entitlement Contract

## Goal

Introduce the provider-neutral commercial entitlement boundary for exact Vira Application releases.

MASTER-42 owns only the commercial right dimensions:

```text
who + what + exact version + where + plan + quota/limit declaration + commercial access
```

It does **not** own authorization, governance, runtime permission, usage accounting, rating, invoicing, payment, subscription lifecycle, identity authentication, deployment or execution.

## Base

- authoritative `main`: `a0da432e0220cb550b13f11f4a4a8001d445e212`
- previous phase: MASTER-41 merged via PR #201
- branch: `master/42-commercial-entitlements`
- next phase: MASTER-43 usage / rating / metering

## Existing owners discovered in Q1

### Application Package

Canonical `ViraApplicationPackage.commercial` already owns reference-only metadata:

```text
entitlementRefs: [{ id, versionRef }]
meteringRefs: [{ id, versionRef }]
```

Application Package rejects floating commercial references and rejects authorization payloads inside `commercial` metadata. MASTER-42 must consume this boundary rather than extend Application metadata with grants, plans, usage or policy decisions.

### Enterprise Context

`enterprise-context` already owns canonical organization/project/environment scope and principal identity shape. MASTER-42 consumes those normalized semantics; it does not become an identity provider or authenticator.

### Enterprise Governance

`enterprise-governance` already owns deterministic policy `allow | deny` decisions. A commercial entitlement result must never be interpreted as or converted into a governance/authorization decision.

### Distribution / Federation

Application Distribution and Federation transport/discover canonical Application metadata and exact releases. They do not evaluate commercial entitlement. MASTER-42 does not add network transport, source trust or registry persistence to them.

## Frozen MASTER-42 contract

New package owner:

```text
@vira-enterprise-genui/commercial-entitlement
```

Executable dependency direction:

```text
commercial-entitlement
  → application-package
  → enterprise-context
  → protocol
```

No dependency on governance, enterprise-governance, runtime-core, deployment-plane, federation, registry, action-boundary or billing/provider code.

### Entitlement set

A bounded deterministic entitlement set contains commercial grant records. Each record contains:

- exact `entitlementRef` matching one Application `commercial.entitlementRefs` entry;
- subject organization plus optional exact enterprise principal selector;
- exact Application id + immutable release version;
- optional exact Capability ref for capability-scoped commercial rights;
- project/environment/location selectors for the commercial `where` dimension;
- opaque exact `planRef`;
- zero or more declarative commercial limits, each tied to an exact `meteringRef`;
- `commercialAccess: enabled | disabled`.

Limits are commercial declarations only. MASTER-42 does not count usage, calculate remaining quota, rate usage or enforce billing. MASTER-43 owns those semantics.

### Evaluation request

Evaluation consumes:

- a canonical Application Package;
- one exact entitlement ref explicitly selected from that Application's `commercial.entitlementRefs`;
- canonical enterprise principal + scope;
- optional exact Application Capability ref;
- optional location id.

The evaluator therefore does not invent AND/OR semantics for the Application's `entitlementRefs[]` array. It evaluates exactly one declared entitlement reference per request.

### Evaluation result

A successful parse/evaluation produces only a commercial result:

```text
entitled | not-entitled
```

with matched entitlement/plan/limit evidence where applicable.

It never produces:

```text
allow | deny
authorized
approved
runtime permission
execution permission
```

A downstream execution path must still pass its independent authorization, governance, runtime, deployment and action/capability gates.

## Matching / conflict semantics

- Application release matching is exact `applicationId + applicationVersion`; no latest/range/fallback.
- `entitlementRef`, `planRef`, Capability refs and metering refs use exact non-floating reference syntax.
- request entitlement ref must be declared by the canonical Application package;
- request Capability ref, when present, must be declared by that Application package;
- limit metering refs must be declared by that Application package;
- organization is always exact;
- an omitted principal selector means organization-wide commercial scope;
- omitted project/environment/location selectors are explicit broader commercial selectors;
- environment cannot be scoped without a project;
- overlapping matching records have no priority/specificity winner: evaluation fails closed as ambiguous;
- duplicate exact grant selectors fail closed;
- disabled commercial access returns `not-entitled`, not a governance deny.

## Security / non-authority rules

- shared safe JSON boundary before entitlement logic;
- exact object shapes; unknown fields fail closed;
- bounded grant and limit arrays;
- unsafe accessors/custom prototypes fail closed;
- no secrets, credentials, URLs, provider endpoints or network transport;
- no source authentication/trust claim;
- no policy/governance override;
- no Action or Capability execution;
- no usage mutation/counter state;
- no price/currency/rating/invoice/payment state;
- no implicit entitlement, latest release, plan fallback or grant priority.

## Planned focused verification

```bash
pnpm check:boundaries
pnpm typecheck
pnpm vitest run \
  tests/contract/commercial-entitlement.test.ts \
  tests/contract/commercial-entitlement-hardening.test.ts
```

## Q0–Q9

- Q0 PASS — fresh branch from exact authoritative main `a0da432e0220cb550b13f11f4a4a8001d445e212`.
- Q1 PASS — targeted reverse engineering of Application commercial refs, Enterprise Context, Enterprise Governance, Distribution/Federation and package boundaries.
- Q2 PASS — entitlement/non-authority contract frozen in this document.
- Q3 NEXT — implement `commercial-entitlement`.
- Q4 — focused contract/conflict/non-authority/hardening tests.
- Q5 — security/fail-closed review.
- Q6 — architecture/ownership review.
- Q7 — exact frozen-head local boundaries/typecheck/focused tests.
- Q8 — independent PR reverse engineering + executable-clean closure compare.
- Q9 — exact-head squash merge, verify new authoritative main, then start MASTER-43 fresh from it.
