# MASTER-45 — Q8 Independent Review Attempt 1

**Date:** 2026-09-05  
**PR:** #206  
**Reviewed frozen executable SHA:** `5876a177a5c14dfa4ae90d1b1e2a618c01d30eb2`  
**Result:** FAIL — executable evidence-consistency gap found

## Finding

Independent PR reverse engineering found that the new canonical `parseViraCommercialUsageRating()` evidence parser validated:

- included record count bound;
- zero/nonzero record-count ↔ used-quantity consistency;
- status/remaining/excess consistency;
- canonical windows/time/refs;

but did not enforce a producer invariant already guaranteed by `commercial-metering`.

Canonical usage records require every `quantity` to be a **positive safe integer**. Therefore, for every rating produced by `rateViraCommercialUsage()`:

```text
usedQuantity >= includedRecordCount
```

The old parser could accept forged evidence such as `includedRecordCount: 3` with `usedQuantity: 2`, even though the canonical producer cannot generate it.

## Remediation

The canonical metering evidence owner was hardened to reject `usedQuantity < includedRecordCount`, and focused coverage now exercises that impossible evidence shape.

Executable remediation commits culminate in new executable head:

```text
0984b0145381f8344dc458cd28d3e1b26db79e78
```

The prior Q7 PASS on `5876a177...` is invalidated for final merge purposes because executable code/tests changed after that freeze.

## Other Q8 observations

The independent review otherwise confirmed:

- pricing consumes canonical metering rating parsing rather than copying rating semantics;
- exact plan/meter refs and no implicit latest/fallback;
- integer nanos only;
- multiplication overflow checked before multiplication;
- total overflow checked before addition;
- quote evidence independently revalidates line and total arithmetic;
- pricing quote is not entitlement, invoice/payment, subscription, settlement, authorization, governance or runtime authority;
- `commercial-pricing` executable dependencies remain only `application-package`, `commercial-metering`, `protocol`;
- PR has no submitted reviews or inline review threads at this review point;
- hosted `verify`, `ios-native`, `android-native` jobs remain infrastructure non-signal because the latest jobs expose no executed steps.

## Gate consequence

Q8 cannot PASS until the full Q7 local gate is rerun on the new exact frozen executable SHA and then Q8 is restarted against that freeze.
