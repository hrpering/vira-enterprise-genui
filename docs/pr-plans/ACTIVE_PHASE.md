# Active Phase

**Phase:** MASTER-40 — Application AI-host SDK  
**Status:** Q0–Q6 PASS / LOCAL Q7 REQUIRED  
**Base SHA:** `86def2e33f3f845fff8e3fb234099e60ffbdaf20`  
**Frozen executable SHA:** `4b2350f9090d5b74e46f56a0478b12b25080ef3e`  
**Previous:** MASTER-39 merged via PR #199  
**Branch:** `master/40-application-ai-host-sdk`  
**PR:** #200  
**Next after merge:** MASTER-41 federated distribution phase from new authoritative `main`

MASTER-40 introduces `@vira-enterprise-genui/application-ai-host-sdk` as a thin host-side compatibility/integrity integration layer over existing canonical Application and Distribution owners.

The SDK consumes one Distribution source, one host descriptor (`viraVersion`, capability IDs, exact protocol projection refs), and one injected integrity verifier. It validates host input before verifier invocation, requires source integrity verification through `application-distribution`, enforces canonical Application host compatibility, and reports exact protocol projection intersection.

Q5 security/fail-closed review PASS. Q6 architecture/ownership review PASS. Caller-facing integrity failure paths are normalized to the AI-host SDK surface. Empty protocol intersection does not itself imply runtime incompatibility. Compatibility success is not authorization, entitlement, governance approval, deployment approval or runtime execution permission. No protocol adapter is invoked.

Exact executable dependency boundary: `application-ai-host-sdk → application-distribution, application-package, protocol`.

Hosted verify/iOS/Android jobs on the frozen head ended with `steps: null`, so they remain infrastructure non-signal.

Merge remains blocked until exact frozen-head local Q7 and final executable-clean actual-diff Q8.
