# Active Phase

**Phase:** MASTER-42 — Commercial Entitlement Contract  
**Status:** Q0–Q2 PASS / Q3 IMPLEMENTATION  
**Base SHA:** `a0da432e0220cb550b13f11f4a4a8001d445e212`  
**Previous:** MASTER-41 merged via PR #201  
**Branch:** `master/42-commercial-entitlements`  
**Next after merge:** MASTER-43 usage / rating / metering from new authoritative `main`

MASTER-42 begins PROGRAM IV — Commercial Network + Capability Cloud by adding the provider-neutral commercial entitlement boundary for exact Application releases.

Canonical `ViraApplicationPackage.commercial` already contains exact reference-only `entitlementRefs[]` and `meteringRefs[]`; MASTER-42 consumes those references and does not move grants, billing state, policy decisions or usage counters into Application metadata.

Frozen commercial dimensions:

```text
who + what + exact version + where + plan + quota/limit declaration + commercial access
```

The new package owner is `@vira-enterprise-genui/commercial-entitlement` with the intended executable dependency boundary:

```text
commercial-entitlement → application-package, enterprise-context, protocol
```

Commercial entitlement is explicitly separate from authorization, governance and runtime permission. An `entitled` result never means `allow`, `approved`, `authorized` or executable. Independent governance/authorization/runtime/action gates remain mandatory downstream.

Evaluation is for one explicitly selected exact Application `entitlementRef` at a time, avoiding invented AND/OR semantics for the package's entitlement reference array. Exact Application release, optional exact Capability, canonical enterprise principal/scope, location, plan and declarative limits are matched deterministically. Overlapping matching grants have no priority winner and fail closed as ambiguous.

Quota/limit declarations do not count usage or calculate remaining quota. Usage/rating/metering is reserved for MASTER-43.

Q0 fresh-base PASS. Q1 targeted owner reverse engineering PASS. Q2 contract freeze PASS in `docs/pr-plans/MASTER-42.md`. Q3 implementation is active.
