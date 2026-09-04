# Active Phase

**Phase:** MASTER-37 — Application Distribution Contract  
**Status:** Q0–Q4 IMPLEMENTED / Q5–Q6 REVIEW REQUIRED / LOCAL Q7 REQUIRED  
**Base SHA:** `2e1b509ca9d7c0c1c0179746bec95fa7f2bed016`  
**Previous:** MASTER-36 merged via PR #196  
**Branch:** `master/37-distribution-contract`  
**Next after merge:** next MASTER-38 distribution/protocol phase from new authoritative `main`

MASTER-37 establishes `@vira-enterprise-genui/application-distribution` as the first provider-neutral Vira Network artifact boundary.

The envelope embeds one canonical `ViraApplicationPackage` and binds it to an exact SHA-256 integrity identity. Application identity/version, discovery metadata, visibility, compatibility, protocol projection references and commercial references remain owned by `application-package`; MASTER-37 does not copy them into a second schema.

Integrity parsing validates only the declared identity shape. Actual integrity verification is explicit through an injected verifier over canonical `serializeViraApplicationPackage()` output and fails closed on false/throw.

The package has no URL/endpoint/transport/provider/credential, registry persistence, deployment/runtime, governance/authorization, entitlement or protected execution authority.

Exact package boundary: `application-distribution → application-package, protocol`.

Merge remains blocked until Q5 security review, Q6 architecture review, exact-head local Q7 and final actual-diff Q8.
