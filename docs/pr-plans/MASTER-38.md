# MASTER-38 — Application Protocol Projection Contract

**Base:** `e03118833731c8483d0c42f648fefe446f0a103a`  
**Corrected frozen executable:** `73f99f85f9f0226591d6161825857b40541455b3`

MASTER-38 adds `@vira-enterprise-genui/application-protocol-projection`, binding an exact `ViraApplicationDistributionEnvelope` and exact source-declared `projectionRef` to an explicit `lossless | lossy | unsupported` interoperability result.

Core invariants:

- source delegates to `application-distribution`;
- projection refs must already be declared by the canonical source Application;
- lossy results require bounded unique strict canonical Application loss paths;
- lossless cannot hide losses;
- unsupported cannot carry payload;
- payload remains non-canonical protocol data;
- source digest declaration is not promoted into a verified trust claim;
- no transport/provider/credential/deploy/authorize/execute authority;
- executable dependency boundary is exactly `application-distribution + protocol`.

`fidelity` is an adapter report, not a generic mathematical proof of protocol equivalence.

Local verification history:

- initial head `0728072b19e4b73cb654bab1b724e2aefbbdb99b`: boundaries PASS, focused 16/16 PASS, TypeScript failed on two TS7053 object-index narrowing errors;
- semantic-neutral correction `73f99f85f9f0226591d6161825857b40541455b3`: explicit `JsonObject` binding in those two object branches only;
- corrected exact-head local Q7: operator-reported PASS for boundaries, TypeScript and both focused suites.

Verification evidence: `docs/evidence/MASTER-38/VERIFICATION.md`.

Final Q8 PASS: corrected frozen executable head → final closure contains only MASTER-38 docs/evidence; executable drift zero.

Q0–Q8 PASS. Q9 READY for exact-head squash merge. MASTER-39 starts only from resulting authoritative `main`.
