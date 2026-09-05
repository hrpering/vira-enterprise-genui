# Active Phase

**Phase:** MASTER-49 — Independent External AI Host Proof  
**Status:** Q0–Q6 PASS / Q7 PENDING  
**Base SHA:** `70dfa599b6b7e77bb5a70e53cee56dd22c0a0b05`  
**Frozen executable SHA:** `5bb3497b736095509ba4b13d365d52ddee4b60bc`  
**Previous:** MASTER-48 merged via PR #209  
**Branch:** `master/49-external-ai-host-proof`  
**PR:** #210 (draft)  
**Next:** MASTER-50 after MASTER-49 merge from new authoritative `main`

MASTER-49 proves that an independently named AI host can use only public Vira package roots, explicitly verify a canonical Distribution artifact and evaluate host compatibility without hidden Vira runtime/security authority.

Canonical proof composition:

```text
@acme/vira-external-ai-host-proof
        ↓
application-publisher-sdk
        ↓ canonical Distribution
external SHA-256 verifier
        ↓
application-ai-host-sdk
        ↓
Vira-version + required capabilities + exact protocol projection intersection
```

Final invariants:

- `application-package` remains the sole owner of exact Application reference syntax;
- AI-host protocol projection parsing delegates to `parseViraApplicationExactReference()`;
- external proof imports only public Vira package roots;
- Distribution digest declaration is insufficient without explicit verifier success;
- tampered digest fails closed;
- invalid host descriptors fail before verifier invocation;
- host `viraVersion` remains AI-host compatibility input, not Application release identity;
- required host capabilities fail closed when absent;
- protocol projection support is exact id + exact versionRef with no latest/fallback/substitution;
- compatibility success grants no authorization, entitlement, deployment, execution or host authentication authority.

Q5/Q6 static review PASS: `docs/evidence/MASTER-49/Q5_Q6_REVIEW.md`.

Q7 local execution remains pending on exact freeze `5bb3497b736095509ba4b13d365d52ddee4b60bc`.
