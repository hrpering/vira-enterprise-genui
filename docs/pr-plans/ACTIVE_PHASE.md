# Active Phase

**Phase:** MASTER-39 — Application Publisher SDK  
**Status:** Q0–Q4 IMPLEMENTED / Q5–Q6 REVIEW REQUIRED / LOCAL Q7 REQUIRED  
**Base SHA:** `b8f009603407fea9a9115d735e9a144017fc654f`  
**Previous:** MASTER-38 merged via PR #198  
**Branch:** `master/39-application-publisher-sdk`  
**Next after merge:** MASTER-40 AI-host SDK phase from new authoritative `main`

MASTER-39 introduces `@vira-enterprise-genui/application-publisher-sdk` as a thin publisher-side integration layer over existing canonical Application and Distribution owners.

The SDK takes one host-asserted `publisherId`, one Application candidate and one injected SHA-256 digest provider. It delegates Application parsing/serialization to `application-package`, requires exact publisher-id parity, obtains a strict lowercase digest over canonical Application serialization, then delegates envelope parse/serialization to `application-distribution`.

`publisherId` is not authentication. Digest-provider output is a declared integrity identity, not a trust/verification claim. The SDK has no signing credential, URL/transport, registry upload, federation, deployment/runtime, governance/authorization/entitlement or Capability/Action execution authority.

Exact executable dependency boundary: `application-publisher-sdk → application-package, application-distribution, protocol`.

Merge remains blocked until Q5 security review, Q6 architecture review, exact-head local Q7 and final executable-clean actual-diff Q8.
