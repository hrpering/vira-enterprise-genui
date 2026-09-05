# MASTER-49 — Q5/Q6 Security + Architecture Review

**Date:** 2026-09-05  
**Phase:** MASTER-49 — Independent External AI Host Proof  
**Reviewed executable/test freeze:** `5bb3497b736095509ba4b13d365d52ddee4b60bc`

## Result

**Q5 PASS / Q6 PASS (static).** Local execution remains Q7 and is not inferred here.

## Q5 — security / fail-closed review

- AI-host evaluation continues to consume canonical Distribution integrity verification through `verifyViraApplicationDistributionIntegrity()` rather than treating a declared digest as verified.
- An explicit external verifier is required; missing, throwing, malformed/truthy-only or rejecting verifier behavior remains fail-closed under existing Distribution/AI-host hardening.
- The independent `@acme/vira-external-ai-host-proof` computes SHA-256 outside Vira and verifies the canonical artifact supplied through the public Distribution verifier contract.
- Tampered digest evidence is rejected before a compatibility plan can succeed.
- Host descriptor parsing happens before verifier invocation, so malformed/floating projection references cannot trigger external verifier work.
- Host protocol projection references now delegate to canonical `parseViraApplicationExactReference()` semantics and retain AI-host-local `INVALID_HOST` path mapping.
- Exact-reference owner parity coverage includes floating aliases, wildcard/range-like references, unknown-field smuggling and malformed semantic ids.
- Host capabilities/projection collections remain bounded and duplicate-rejected by existing AI-host validation.
- Existing root/host unknown-field and unsafe accessor/custom-prototype hardening remains unchanged.
- No credential, transport, authorization, entitlement, deployment or execution fields are introduced by this phase.

## Q6 — architecture / ownership review

- `application-package` remains the sole owner of Application exact-reference syntax.
- `application-distribution` remains the owner of Distribution envelope parsing/serialization and integrity-verifier contract.
- `application-ai-host-sdk` remains only the AI-host compatibility composition surface; it does not become an integrity-verification provider, runtime executor, deployment plane or security authority.
- `host.viraVersion` remains AI-host compatibility input. It is not an Application release identity and is intentionally not delegated to the Application-release-reference parser.
- The external proof is independently named `@acme/vira-external-ai-host-proof` and imports Vira only through public package roots.
- The proof composes Publisher SDK → canonical Distribution → AI-host SDK with an external SHA-256 verifier; it creates no new semantic owner or wire format.
- Required host capabilities and Vira-version compatibility remain separate from protocol projection intersection.
- Protocol projection support is exact id + exact versionRef only; same-id different-version support does not become fallback compatibility.
- A successful compatibility plan is not authorization, entitlement, deployment, execution permission or host authentication.

## Freeze

Executable/package/test surface is frozen at:

`5bb3497b736095509ba4b13d365d52ddee4b60bc`

Any subsequent executable/package/test/boundary change invalidates this freeze and requires renewed static review plus a new Q7 run.
