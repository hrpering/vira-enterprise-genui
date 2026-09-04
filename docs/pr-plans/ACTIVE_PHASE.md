# Active Phase

**Phase:** MASTER-42 — Commercial Entitlement Contract  
**Status:** Q0–Q8 PASS / Q9 READY TO MERGE  
**Base SHA:** `a0da432e0220cb550b13f11f4a4a8001d445e212`  
**Frozen executable SHA:** `652793c2e57b62c11a28f6adf6b36e9356008560`  
**Previous:** MASTER-41 merged via PR #201  
**Branch:** `master/42-commercial-entitlements`  
**PR:** #202  
**Next after merge:** MASTER-43 usage / rating / metering from new authoritative `main`

MASTER-42 begins PROGRAM IV — Commercial Network + Capability Cloud by adding the provider-neutral commercial entitlement boundary for exact Application releases.

Canonical `ViraApplicationPackage.commercial` already contains exact reference-only `entitlementRefs[]` and `meteringRefs[]`; MASTER-42 consumes those references and does not move grants, billing state, policy decisions or usage counters into Application metadata.

Frozen commercial dimensions:

```text
who + what + exact version + where + plan + declarative limit + commercial access
```

The canonical package owner is `@vira-enterprise-genui/commercial-entitlement` with executable dependency boundary:

```text
commercial-entitlement → application-package, enterprise-context, protocol
```

Commercial entitlement is explicitly separate from authorization, governance and runtime permission. An `entitled` result never means `allow`, `approved`, `authorized` or executable. Independent governance/authorization/runtime/action gates remain mandatory downstream.

Evaluation is for one explicitly selected exact Application `entitlementRef` at a time, avoiding invented AND/OR semantics for the package's entitlement reference array. Exact Application release, optional exact Capability, canonical enterprise principal/scope, location, plan and declarative limits are matched deterministically. Duplicate exact selectors and overlapping matching grants fail closed rather than creating priority/override semantics.

MASTER-42 limits are exactly `{ meteringRef, quantity }`; meter unit/window semantics, mutable usage accounting, remaining quota and rating are reserved for MASTER-43.

Q5 security/fail-closed review PASS. Q6 architecture/ownership review PASS. Q7 exact frozen-head local gate is operator-reported PASS and recorded in `docs/evidence/MASTER-42/Q7_LOCAL.md`. Q8 independent PR reverse engineering PASS is recorded in `docs/evidence/MASTER-42/Q8_REVIEW.md`.

Hosted PR-head verify/iOS/Android jobs contain zero executable steps and no runner assignment; they remain infrastructure non-signal and do not substitute for Q7.

MASTER-42 is ready for final docs-only closure compare and exact-head squash merge.
