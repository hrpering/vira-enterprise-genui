# Active Phase

**Phase:** MASTER-37 — Application Distribution Contract  
**Status:** Q0–Q6 PASS / CORRECTED LOCAL Q7 REQUIRED  
**Base SHA:** `2e1b509ca9d7c0c1c0179746bec95fa7f2bed016`  
**Frozen executable SHA:** `ad9745334e0cedfe2b7d28ee06435f498e62e7c4`  
**Previous:** MASTER-36 merged via PR #196  
**Branch:** `master/37-distribution-contract`  
**PR:** #197  
**Next after merge:** next MASTER-38 distribution/protocol phase from new authoritative `main`

MASTER-37 establishes `@vira-enterprise-genui/application-distribution` as the first provider-neutral Vira Network artifact boundary.

The envelope embeds one canonical `ViraApplicationPackage` and binds it to an exact SHA-256 integrity identity. Application identity/version, discovery metadata, visibility, compatibility, protocol projection references and commercial references remain owned by `application-package`; MASTER-37 does not copy them into a second schema.

Integrity parsing validates only the declared identity shape. Actual integrity verification is explicit through an injected verifier over canonical `serializeViraApplicationPackage()` output and fails closed on false/throw/non-`true`.

Q5 security review PASS: safe JSON boundary, exact shapes, canonical Application delegation, strict SHA-256 identity, explicit verification, fail-closed verifier handling and prototype/accessor hardening.

Q6 architecture review PASS: dependencies are only `application-package` and `protocol`; no registry/gateway/deployment/runtime/governance/Action authority is imported or modified; canonical Application serialization is reused.

First exact-head local Q7 on `41fa04d7af4c5a68fa4eff1cb4a2403bff4dbaac` reported package boundaries PASS and focused tests 13/13 PASS, but TypeScript failed on one test-only `noImplicitAny` callback parameter. Production implementation was unchanged. The focused test now annotates the verifier callback with exported `ViraApplicationDistributionVerifierInput`; corrected frozen executable head is `ad9745334e0cedfe2b7d28ee06435f498e62e7c4`.

Hosted verify/iOS/Android jobs on the branch contained zero steps and runner id 0, so they remain infrastructure non-signal.

Merge remains blocked until exact corrected-head local Q7 and final post-Q7 executable-clean Q8.
