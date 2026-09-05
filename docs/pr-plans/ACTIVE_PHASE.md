# Active Phase

**Phase:** MASTER-48 — Independent External Publisher Proof  
**Status:** Q0–Q6 PASS / Q7 PENDING  
**Base SHA:** `6b79864e55209b52e5b984e671beaf69afdbfc84`  
**Frozen executable SHA:** `5f1c29773dd13d5328428e5933ec546259cb7b02`  
**Previous:** MASTER-47 merged via PR #208  
**Branch:** `master/48-external-publisher-proof`  
**PR:** #209 (draft)  
**Next:** MASTER-49 after MASTER-48 merge from new authoritative `main`

MASTER-48 proves that an independently named publisher consumer can compose Vira's public Publisher SDK and federation APIs without private source imports or hidden authority.

Canonical composition:

```text
@acme/vira-external-publisher-proof
        ↓
application-publisher-sdk
        ↓
application-distribution
        ↓
application-federation
        ↓
exact Application release discovery
```

Executable dependency adjustment:

```text
application-federation → application-distribution, application-package, protocol
```

Final invariants:

- `application-package` remains the sole canonical Application release id/version parser owner;
- federation delegates release query semantics to `parseViraApplicationReleaseReference()`;
- external proof imports only public Vira package roots;
- publisher assertion must exactly match canonical Application publisher;
- only public + discoverable releases may enter federation;
- lookup is exact id+release only, with no latest/default/fallback;
- divergent exact-release envelopes fail closed;
- federation source ids are provenance only, not trust/authentication/ranking;
- Distribution digest declaration is not integrity verification;
- proof grants no authorization, entitlement, deployment or execution authority.

Q5/Q6 static review PASS: `docs/evidence/MASTER-48/Q5_Q6_REVIEW.md`.

Q7 local execution remains pending on exact freeze `5f1c29773dd13d5328428e5933ec546259cb7b02`.
