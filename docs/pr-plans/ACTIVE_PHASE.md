# Active Phase

**Phase:** MASTER-41 — Federated Distribution  
**Status:** Q0–Q4 IMPLEMENTED / Q5–Q6 REVIEW REQUIRED / LOCAL Q7 REQUIRED  
**Base SHA:** `b425e5e7104c1a6441671301a6ac262e4e15e1bb`  
**Previous:** MASTER-40 merged via PR #200  
**Branch:** `master/41-federated-distribution`  
**Next after merge:** MASTER-42 commercial network phase from new authoritative `main`

MASTER-41 introduces `@vira-enterprise-genui/application-federation` as a provider-neutral public federated discovery snapshot over canonical Application Distribution envelopes.

Public federation accepts only canonical Application releases with `visibility: "public"` and `discoverable: true`. `sourceId` is provenance data, not authentication. Distribution digests remain declarations; federation parsing does not claim integrity verification.

The same exact Application `id@version` may appear from multiple sources only when deterministic canonical Distribution serialization is identical. Divergent envelopes fail closed with `FEDERATION_CONFLICT`; there is no priority, majority vote, implicit latest or fallback.

Exact executable dependency boundary: `application-federation → application-distribution, protocol`.

Merge remains blocked until Q5 security review, Q6 architecture review, exact-head local Q7 and final executable-clean actual-diff Q8.
