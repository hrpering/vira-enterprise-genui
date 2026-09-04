# MASTER-42 — Commercial Entitlement Contract

## Goal

Introduce the provider-neutral commercial entitlement boundary for exact Vira Application releases.

MASTER-42 owns only the commercial right dimensions:

```text
who + what + exact version + where + plan + declarative limit + commercial access
```

It does **not** own authorization, governance, runtime permission, usage accounting, meter unit/window semantics, rating, invoicing, payment, subscription lifecycle, identity authentication, deployment or execution.

## Base

- authoritative `main`: `a0da432e0220cb550b13f11f4a4a8001d445e212`
- previous phase: MASTER-41 merged via PR #201
- branch: `master/42-commercial-entitlements`
- PR: #202
- frozen executable head: `652793c2e57b62c11a28f6adf6b36e9356008560`
- next phase: MASTER-43 usage / rating / metering

## Existing owners discovered in Q1

### Application Package

Canonical `ViraApplicationPackage.commercial` already owns reference-only metadata:

```text
entitlementRefs: [{ id, versionRef }]
meteringRefs: [{ id, versionRef }]
```

Application Package rejects floating commercial references and rejects authorization payloads inside `commercial` metadata. MASTER-42 consumes this boundary rather than extending Application metadata with grants, plans, usage or policy decisions.

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
- zero or more declarative commercial limits, each exactly `{ meteringRef, quantity }`;
- `commercialAccess: enabled | disabled`.

A MASTER-42 limit deliberately does **not** define a period/window/unit. The exact `meteringRef` identifies the downstream meter contract; MASTER-43 owns meter unit/window semantics, mutable usage accounting, remaining-quota computation and rating.

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

A downstream execution path must still pass its independent authorization, governance, runtime, deployment and Action/Capability gates.

## Matching / conflict semantics

- Application release matching is exact `applicationId + applicationVersion`; no latest/range/fallback.
- `entitlementRef`, `planRef`, Capability refs and metering refs use exact non-floating reference syntax.
- request entitlement ref must be declared by the canonical Application package;
- request Capability ref, when present, must be declared by that Application package;
- matched limit metering refs must be declared by that Application package;
- organization is always exact;
- a `null` principal selector means organization-wide commercial scope;
- `null` project/environment/location selectors are explicit broader commercial selectors;
- environment cannot be scoped without a project;
- overlapping matching records have no priority/specificity winner: evaluation fails closed as ambiguous;
- duplicate exact grant selectors fail closed rather than becoming order-dependent overrides;
- disabled commercial access returns `not-entitled`, not a governance deny.

## Security / non-authority rules

- shared safe JSON boundary before entitlement logic;
- exact object shapes; unknown fields fail closed;
- bounded grant and limit arrays;
- unsafe accessors/custom prototypes fail closed;
- exact non-floating commercial references;
- no secrets, credentials, URLs, provider endpoints or network transport;
- no source authentication/trust claim;
- no policy/governance override;
- no Action or Capability execution;
- no usage mutation/counter state;
- no meter period/window/unit definition;
- no price/currency/rating/invoice/payment state;
- no implicit entitlement, latest release, plan fallback or grant priority.

## Q5 security / fail-closed review

PASS. The final static review confirmed:

- all external entitlement/request input enters through shared safe JSON parsing;
- accessor/custom-prototype/non-JSON input fails before commercial matching;
- exact shapes reject authority/payment/usage-state smuggling fields;
- floating entitlement/plan/Capability/metering references fail closed;
- Application declaration checks prevent undeclared entitlement, Capability and matched metering references;
- duplicate selectors and overlapping matches do not create priority/override semantics;
- no period/window/rating/payment or authorization authority remains in the public contract.

## Q6 architecture / ownership review

PASS.

Executable dependency authority declares only:

```text
commercial-entitlement → application-package, enterprise-context, protocol
```

`application-package` remains owner of Application commercial reference metadata. `enterprise-context` remains owner of enterprise principal/scope semantics. `enterprise-governance` remains policy allow/deny authority. MASTER-43 remains the owner planned for usage/rating/metering semantics.

Repository authority docs were updated to register `commercial-entitlement` as the canonical commercial eligibility owner and to remove stale MASTER-41-active/future-commercial-owner wording.

Base-to-branch diff remains scoped to the new package, two focused contract suites, package-boundary declaration and MASTER-42/Application authority documentation.

## Q7 focused verification

Exact frozen-head local gate on `652793c2e57b62c11a28f6adf6b36e9356008560`:

```bash
pnpm check:boundaries
pnpm typecheck
pnpm vitest run \
  tests/contract/commercial-entitlement.test.ts \
  tests/contract/commercial-entitlement-hardening.test.ts
```

Operator-reported verdict: PASS. Full evidence: `docs/evidence/MASTER-42/Q7_LOCAL.md`.

## Q8 independent PR reverse engineering

PASS. Full review: `docs/evidence/MASTER-42/Q8_REVIEW.md`.

The independent PR review re-read the public types, parser/serializer/evaluator, primary + hardening tests, package dependency declaration, executable boundary graph and authority docs. It found no blocker, hidden security/execution authority, implicit latest/fallback, grant priority winner, usage/rating scope leak or competing Application schema.

The Q7 frozen executable SHA to reviewed PR-head compare contained documentation/evidence files only. Executable drift after Q7 is zero.

Current hosted PR-head `verify`, `android-native` and `ios-native` jobs report failure with zero executable steps and no assigned runner. They remain infrastructure non-signal and do not contradict local Q7.

## Q0–Q9

- Q0 PASS — fresh branch from exact authoritative main `a0da432e0220cb550b13f11f4a4a8001d445e212`.
- Q1 PASS — targeted reverse engineering of Application commercial refs, Enterprise Context, Enterprise Governance, Distribution/Federation and package boundaries.
- Q2 PASS — entitlement/non-authority contract frozen.
- Q3 PASS — `commercial-entitlement` parser/serializer/evaluator implemented.
- Q4 PASS — focused commercial matching/conflict/non-authority/hardening coverage added.
- Q5 PASS — security/fail-closed static review.
- Q6 PASS — architecture/ownership review + executable dependency boundary.
- Q7 PASS — exact frozen-head local boundaries/typecheck/two focused suites.
- Q8 PASS — independent PR reverse engineering + executable-clean Q7-to-review compare.
- Q9 READY — exact final PR-head squash merge, verify new authoritative main, then start MASTER-43 fresh from it.
