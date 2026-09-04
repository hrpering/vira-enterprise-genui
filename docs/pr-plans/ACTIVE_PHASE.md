# Active Phase

**Phase:** MASTER-38 — Application Protocol Projection Contract  
**Status:** Q0–Q4 IMPLEMENTED / Q5–Q6 REVIEW REQUIRED / LOCAL Q7 REQUIRED  
**Base SHA:** `e03118833731c8483d0c42f648fefe446f0a103a`  
**Previous:** MASTER-37 merged via PR #197  
**Branch:** `master/38-application-protocol-projection`  
**Next after merge:** MASTER-39 distribution/protocol phase from new authoritative `main`

MASTER-38 introduces `@vira-enterprise-genui/application-protocol-projection` as the Application-level protocol egress fidelity contract.

The artifact consumes one canonical `ViraApplicationDistributionEnvelope`, requires an exact `projectionRef` already declared by the source Application, and makes protocol fidelity explicit as `lossless`, `lossy`, or `unsupported`.

Lossy projection must enumerate bounded unique canonical `$.application` loss paths with reasons. Unsupported projection cannot carry payload. Lossless projection cannot hide loss metadata.

The source digest declaration is carried as distribution data but MASTER-38 does not claim source integrity verification. No URL/endpoint/transport/provider/credential, registry, deployment/runtime, governance/authorization/entitlement or protected execution authority exists in the package.

Exact executable dependency boundary: `application-protocol-projection → application-distribution, protocol`.

Merge remains blocked until Q5 security review, Q6 architecture review, exact-head local Q7 and final actual-diff Q8.
