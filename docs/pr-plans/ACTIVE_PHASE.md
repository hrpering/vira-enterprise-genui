# Active Phase

**Phase:** MASTER-37 — Application Distribution Contract  
**Status:** Q0–Q8 PASS / Q9 READY TO MERGE  
**Base SHA:** `2e1b509ca9d7c0c1c0179746bec95fa7f2bed016`  
**Frozen executable SHA:** `ad9745334e0cedfe2b7d28ee06435f498e62e7c4`  
**Previous:** MASTER-36 merged via PR #196  
**Branch:** `master/37-distribution-contract`  
**PR:** #197  
**Next after merge:** MASTER-38 distribution/protocol phase from new authoritative `main`

MASTER-37 establishes `@vira-enterprise-genui/application-distribution` as the first provider-neutral Vira Network artifact boundary.

The envelope embeds one canonical `ViraApplicationPackage` and binds it to an exact SHA-256 integrity identity. Application identity/version, discovery metadata, visibility, compatibility, protocol projection references and commercial references remain owned by `application-package`; MASTER-37 does not copy them into a second schema.

Integrity parsing validates only the declared identity shape. Actual integrity verification is explicit through an injected verifier over canonical `serializeViraApplicationPackage()` output and fails closed on false/throw/non-`true`.

Q5 security review PASS. Q6 architecture review PASS.

First exact-head local Q7 on `41fa04d7af4c5a68fa4eff1cb4a2403bff4dbaac` exposed one test-only TS7006 implicit-any callback parameter while package boundaries and 13/13 focused tests passed. Production implementation was unchanged. The test was corrected and frozen executable head became `ad9745334e0cedfe2b7d28ee06435f498e62e7c4`.

Corrected exact-head local Q7 is operator-reported PASS: package boundaries PASS, TypeScript PASS, focused Application Distribution contract suite PASS. Evidence is recorded in `docs/evidence/MASTER-37/VERIFICATION.md`.

Q8 PASS. Final compare from corrected frozen executable head `ad9745334e0cedfe2b7d28ee06435f498e62e7c4` to closure state contains only verification evidence and phase/status documentation; executable drift is zero.

Hosted verify/iOS/Android jobs remain zero-step / runner-id-0 infrastructure non-signal.

MASTER-37 is ready for exact-head squash merge. MASTER-38 must start only from the resulting new authoritative `main`.
